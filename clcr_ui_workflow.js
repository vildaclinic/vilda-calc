(function (global) {
  "use strict";

  const LEVEL_ORDER = Object.freeze({ basic: 0, advanced: 1, pro: 2 });
  const HISTORICAL_FORMULA_IDS = Object.freeze(["sch_var"]);

  const MODULES = Object.freeze([
    {
      id: "adult-egfr",
      path: "clinical",
      level: "basic",
      title: "eGFR u dorosłych",
      description: "Oszacowanie filtracji na podstawie kreatyniny.",
      keywords: "nerki filtracja dorosly dorosłych kreatynina ckd epi",
      formulaIds: ["egfr"],
    },
    {
      id: "child-egfr",
      path: "clinical",
      level: "basic",
      title: "eGFR u dziecka i młodej osoby",
      description: "Współczesny wzór kreatyninowy CKiD U25.",
      keywords: "dziecko dzieci pediatria mlodziez młodzież ckid u25 kreatynina",
      formulaIds: ["ckid_u25"],
    },
    {
      id: "cockcroft-gault",
      path: "clinical",
      level: "basic",
      title: "Cockcroft–Gault",
      description: "Nieindeksowany eCrCl z rzeczywistą masą ciała.",
      keywords: "dawkowanie lekow leków ecrcl klirens masa ciala",
      formulaIds: ["cg"],
    },
    {
      id: "cockcroft-indexed",
      path: "clinical",
      level: "basic",
      title: "Cockcroft–Gault 1,73 m²",
      description: "eCrCl przeliczony na standardową powierzchnię ciała.",
      keywords: "dawkowanie ecrcl klirens indeksowany powierzchnia ciala bsa",
      formulaIds: ["cg_norm"],
    },
    {
      id: "measured-clearance",
      path: "clinical",
      level: "advanced",
      title: "Zmierzony klirens kreatyniny",
      description: "Klirens ze zbiórki czasowej z pełnym protokołem jakości.",
      keywords: "zbiórka zbiorka czasowa dobowa dzm mocz klirens kreatyniny",
      formulaIds: ["cl24"],
    },
    {
      id: "pediatric-extended",
      path: "clinical",
      level: "advanced",
      title: "Dziecko i noworodek — wzory dodatkowe",
      description: "Bedside Schwartz 2009 oraz ścieżka noworodka donoszonego.",
      keywords: "dziecko dzieci noworodek neonatalny schwartz bedside pediatria",
      formulaIds: ["sch_idms", "neonatal_egfr"],
    },
    {
      id: "timed-urine-panel",
      path: "clinical",
      level: "advanced",
      title: "Dobowa i czasowa zbiórka moczu",
      description: "Wydalanie analitów oraz wskaźniki z DZM.",
      keywords:
        "dzm dobowa mocz sód sod potas wapń wapn magnez fosfor białko bialko kwas moczowy",
      formulaIds: [
        "UA_mgkg",
        "Ca_mgkg",
        "Mg_mgkg",
        "PO4_mgkg",
        "Prot_mgkg",
        "Na_mmol_d",
        "K_mmol_d",
        "KM_Cr",
        "Ca_Cr",
        "Mg_Ca",
        "PO4_Cr",
        "B_Cr",
        "K_frac",
      ],
    },
    {
      id: "serum-anion-gap",
      path: "clinical",
      level: "advanced",
      title: "Luka anionowa surowicy",
      description: "Obliczenie AG bez potasu.",
      keywords: "ags sód sod chlorki hco3 wodorowęglany kwasica surowica",
      formulaIds: ["AGs"],
    },
    {
      id: "adult-cystatin",
      path: "clinical",
      level: "pro",
      title: "eGFR kreatynina + cystatyna C",
      description: "Równanie CKD‑EPI dla dorosłych z dwoma markerami.",
      keywords: "dorosly dorosłych cystatyna c kreatynina ckd epi ifcc",
      formulaIds: ["egfr_cr_cys"],
    },
    {
      id: "child-cystatin",
      path: "clinical",
      level: "pro",
      title: "CKiD U25 z cystatyną C",
      description: "Wariant cystatynowy oraz połączony dla wieku 1–25 lat.",
      keywords: "dziecko dzieci mlodziez młodzież pediatria cystatyna ifcc ckid u25",
      formulaIds: ["ckid_u25_cys", "ckid_u25_cr_cys"],
    },
    {
      id: "stone-profile",
      path: "clinical",
      level: "pro",
      title: "Pełna ocena kamicy",
      description: "Szczawiany, cytryniany, Ca/Cit i pH dobowej zbiórki.",
      keywords: "kamica wapń wapn szczawiany oxalate cytryniany citrate mocz dzm",
      formulaIds: ["Ox_mgkg", "Cit_mgkg", "Ca_Cit", "pH24"],
    },
    {
      id: "dialysis-ktv",
      path: "clinical",
      level: "pro",
      title: "Adekwatność hemodializy KT/V",
      description: "spKt/Vurea, eKt/Vurea i URR dla ocenianej sesji IHD.",
      keywords: "kt v kt/v dializa hemodializa ihd urr mocznik adekwatność",
      formulaIds: ["KTV"],
    },
    {
      id: "spot-protein",
      path: "spot",
      level: "spot",
      title: "ACR i PCR",
      description: "Albumina lub białko w odniesieniu do kreatyniny tej samej próbki.",
      keywords: "acr pcr albumina białko bialko kreatynina próbka probka moczu",
      formulaIds: ["ACR", "PCR"],
    },
    {
      id: "spot-stone-ratios",
      path: "spot",
      level: "spot",
      title: "Ca/Ox/Cit do kreatyniny",
      description: "Wskaźniki punktowe pomocne w ocenie ryzyka kamicy.",
      keywords:
        "wapń wapn calcium szczawiany oxalate cytryniany citrate kamica kreatynina mocz",
      formulaIds: ["CaCr_spot", "OxCr_spot", "CitCr_spot"],
    },
    {
      id: "spot-fe-uag",
      path: "spot",
      level: "spot",
      title: "Frakcje wydalnicze i UAG",
      description: "FE Na/K/Cl/HCO₃ oraz luka anionowa moczu ze sparowanych próbek.",
      keywords:
        "fena fek fecl fehco3 uag sód sod potas chlorki wodorowęglany surowica mocz",
      formulaIds: [
        "FENa_spot",
        "FEK_spot",
        "FECl_spot",
        "FEHCO3_spot",
        "AGu_spot",
      ],
    },
    {
      id: "spot-tmp-gfr",
      path: "spot",
      level: "spot",
      title: "TmP/GFR i TRP",
      description: "Ocena transportu fosforanów ze sparowanych próbek.",
      keywords: "tmp gfr tmp/gfr trp fosfor fosforany druga poranna na czczo",
      formulaIds: ["TMP_GFR"],
    },
    {
      id: "spot-ph",
      path: "spot",
      level: "spot",
      title: "pH próbki moczu",
      description: "Surowy wynik pH z informacją o rodzaju próbki.",
      keywords: "ph kwasowość kwasowosc próbka probka moczu kamica",
      formulaIds: ["pH_spot"],
    },
  ]);

  const MODULE_BY_FORMULA = new Map();
  MODULES.forEach((module) => {
    module.formulaIds.forEach((formulaId) => MODULE_BY_FORMULA.set(formulaId, module));
  });

  // ————————————————————————————————————————————————————————————————
  // Faza 0 — słownik parametrów karty pacjenta (CLCR_PARAM_DICTIONARY).
  // Nazwy zatwierdzone (ZAŁOŻENIA §4). Zmiana wyłącznie prezentacji /
  // nazewnictwa serii — ZERO wpływu na liczenie (silnik i moduły
  // kliniczne pozostają zamrożone). Klucz serii = testKey `clcr:<id>`,
  // spójny z tagami silnika `data-clcr-formula`.
  //   ① Wyniki wieloczłonowe → osobne serie: białko DZM (Prot_mgkg) i
  //      KT/V (KTV) rozbite; `sourceFormulaId` wskazuje formułę-źródło.
  //   ② ACR/PCR → jednostka `mg/g`.
  //   ③ Etykiety opisowe; kryptyczne nazwy wzorów w podlinii `method`.
  // ————————————————————————————————————————————————————————————————
  const PARAM_GROUPS = Object.freeze([
    Object.freeze({ id: "egfr", title: "eGFR i klirensy kreatyniny" }),
    Object.freeze({ id: "dzm-excr", title: "Zbiórka dobowa — wydalania" }),
    Object.freeze({ id: "dzm-ratio", title: "Zbiórka dobowa — wskaźniki" }),
    Object.freeze({ id: "dzm-protein", title: "Zbiórka dobowa — białko" }),
    Object.freeze({ id: "spot-ratio", title: "Próbka punktowa — wskaźniki" }),
    Object.freeze({ id: "spot-fe", title: "Próbka punktowa — frakcje wydalnicze" }),
    Object.freeze({ id: "spot-other", title: "Próbka punktowa — pozostałe" }),
    Object.freeze({ id: "ph", title: "pH moczu" }),
    Object.freeze({ id: "ktv", title: "Dializa — adekwatność KT/V" }),
  ]);

  const PARAM_DICTIONARY_SOURCE = [
    // eGFR i klirensy kreatyniny (grupa egfr) — etykieta opisowa + metoda w podlinii (③)
    { id: "egfr", group: "egfr", label: "eGFR — dorośli (kreatynina)", method: "wzór CKD‑EPI 2021, bez współczynnika rasowego", unit: "mL/min/1,73 m²" },
    { id: "ckid_u25", group: "egfr", label: "eGFR — dzieci i młodzież 1–25 lat (kreatynina)", method: "wzór CKiD U25", unit: "mL/min/1,73 m²" },
    { id: "egfr_cr_cys", group: "egfr", label: "eGFR — dorośli (kreatynina + cystatyna C)", method: "wzór CKD‑EPI 2021", unit: "mL/min/1,73 m²" },
    { id: "ckid_u25_cys", group: "egfr", label: "eGFR — dzieci i młodzież 1–25 lat (cystatyna C)", method: "wzór CKiD U25", unit: "mL/min/1,73 m²" },
    { id: "ckid_u25_cr_cys", group: "egfr", label: "eGFR — dzieci i młodzież 1–25 lat (kreatynina + cystatyna C)", method: "wzór CKiD U25", unit: "mL/min/1,73 m²" },
    { id: "neonatal_egfr", group: "egfr", label: "eGFR — noworodek donoszony (kreatynina)", method: "wzór noworodkowy", unit: "mL/min/1,73 m²" },
    { id: "cg", group: "egfr", label: "Klirens kreatyniny — dorośli (ml/min)", method: "wzór Cockcrofta‑Gaulta, nieindeksowany", unit: "mL/min" },
    { id: "cg_norm", group: "egfr", label: "Klirens kreatyniny — dorośli (1,73 m²)", method: "wzór Cockcrofta‑Gaulta, przeliczony", unit: "mL/min/1,73 m²" },
    { id: "cl24", group: "egfr", label: "Klirens kreatyniny — zmierzony (DZM)", method: "z dobowej zbiórki moczu", unit: "mL/min" },
    { id: "sch_idms", group: "egfr", label: "eGFR — dzieci (kreatynina)", method: "przyłóżkowy wzór Schwartza, IDMS", unit: "mL/min/1,73 m²" },
    // Zbiórka dobowa — wydalania (grupa dzm-excr)
    { id: "Ca_mgkg", group: "dzm-excr", label: "Wydalanie wapnia (DZM)", unit: "mg/kg/24 h" },
    { id: "UA_mgkg", group: "dzm-excr", label: "Wydalanie kwasu moczowego (DZM)", unit: "mg/kg/24 h" },
    { id: "Mg_mgkg", group: "dzm-excr", label: "Wydalanie magnezu (DZM)", unit: "mg/kg/24 h" },
    { id: "PO4_mgkg", group: "dzm-excr", label: "Wydalanie fosforanów (Pi, DZM)", unit: "mg P/24 h" },
    { id: "Ox_mgkg", group: "dzm-excr", label: "Wydalanie szczawianów (DZM)", unit: "mg/kg/24 h" },
    { id: "Cit_mgkg", group: "dzm-excr", label: "Wydalanie cytrynianów (DZM)", unit: "mg/kg/24 h" },
    { id: "Na_mmol_d", group: "dzm-excr", label: "Wydalanie sodu (DZM)", unit: "mmol/24 h" },
    { id: "K_mmol_d", group: "dzm-excr", label: "Wydalanie potasu (DZM)", unit: "mmol/24 h" },
    // Zbiórka dobowa — wskaźniki (grupa dzm-ratio)
    { id: "Ca_Cr", group: "dzm-ratio", label: "Wapń/kreatynina (DZM)", unit: "mg/mg" },
    { id: "KM_Cr", group: "dzm-ratio", label: "Kwas moczowy/kreatynina (DZM)", unit: "mg/mg" },
    { id: "PO4_Cr", group: "dzm-ratio", label: "Fosforany/kreatynina (Pi, DZM)", unit: "mg/mg" },
    { id: "Mg_Ca", group: "dzm-ratio", label: "Magnez/wapń (DZM)", unit: "mg/mg" },
    { id: "Ca_Cit", group: "dzm-ratio", label: "Wapń/cytryniany (DZM)", unit: "mg/mg" },
    { id: "B_Cr", group: "dzm-ratio", label: "Białko/kreatynina (DZM)", unit: "mg/mg" },
    { id: "K_frac", group: "dzm-ratio", label: "Udział potasu — K/(K+Na)", unit: "%" },
    { id: "AGs", group: "dzm-ratio", label: "Luka anionowa surowicy (bez K)", unit: "mmol/L" },
    // Zbiórka dobowa — białko (serie rozdzielone ①; źródło: Prot_mgkg)
    { id: "Prot_mg24", group: "dzm-protein", label: "Białko w DZM [mg/24 h]", unit: "mg/24 h", sourceFormulaId: "Prot_mgkg" },
    { id: "Prot_g24", group: "dzm-protein", label: "Białko w DZM [g/24 h]", unit: "g/24 h", sourceFormulaId: "Prot_mgkg" },
    { id: "Prot_bsa", group: "dzm-protein", label: "Białko w DZM / BSA [mg/m²/24 h]", unit: "mg/m²/24 h", sourceFormulaId: "Prot_mgkg" },
    // Próbka punktowa — wskaźniki (grupa spot-ratio); ACR/PCR w mg/g (②)
    { id: "CaCr_spot", group: "spot-ratio", label: "Wapń/kreatynina (próbka punktowa)", unit: "mg/mg" },
    { id: "OxCr_spot", group: "spot-ratio", label: "Szczawiany/kreatynina (próbka punktowa)", unit: "mg/mg" },
    { id: "CitCr_spot", group: "spot-ratio", label: "Cytryniany/kreatynina (próbka punktowa)", unit: "mg/mg" },
    { id: "ACR", group: "spot-ratio", label: "Albumina/kreatynina — ACR", unit: "mg/g" },
    { id: "PCR", group: "spot-ratio", label: "Białko/kreatynina — PCR (próbka punktowa)", unit: "mg/g" },
    // Próbka punktowa — frakcje wydalnicze (grupa spot-fe)
    { id: "FENa_spot", group: "spot-fe", label: "Frakcja wydalania sodu (FENa)", unit: "%" },
    { id: "FEK_spot", group: "spot-fe", label: "Frakcja wydalania potasu (FEK)", unit: "%" },
    { id: "FECl_spot", group: "spot-fe", label: "Frakcja wydalania chlorków (FECl)", unit: "%" },
    { id: "FEHCO3_spot", group: "spot-fe", label: "Frakcja wydalania HCO₃ (FEHCO₃)", unit: "%" },
    // Próbka punktowa — pozostałe (grupa spot-other)
    { id: "AGu_spot", group: "spot-other", label: "Luka anionowa moczu (UAG)", unit: "mmol/L" },
    { id: "TMP_GFR", group: "spot-other", label: "TmP/GFR — próg reabsorpcji fosforanów", unit: "mmol/L" },
    // pH moczu (grupa ph)
    { id: "pH_spot", group: "ph", label: "pH moczu (próbka punktowa)", unit: "—" },
    { id: "pH24", group: "ph", label: "pH moczu (DZM)", unit: "—" },
    // Dializa — KT/V (serie rozdzielone ①; źródło: KTV)
    { id: "KTV_spktv", group: "ktv", label: "spKt/V (mocznik, pojedyncza pula)", unit: "—", sourceFormulaId: "KTV" },
    { id: "KTV_ektv", group: "ktv", label: "eKt/V (mocznik, równoważony)", unit: "—", sourceFormulaId: "KTV" },
    { id: "KTV_urr", group: "ktv", label: "URR — wskaźnik redukcji mocznika", unit: "%", sourceFormulaId: "KTV" },
  ];

  const PARAM_DICTIONARY = Object.freeze(
    PARAM_DICTIONARY_SOURCE.map((entry) =>
      Object.freeze({
        id: entry.id,
        testKey: "clcr:" + entry.id,
        group: entry.group,
        label: entry.label,
        method: entry.method || null,
        unit: entry.unit,
        sourceFormulaId: entry.sourceFormulaId || entry.id,
      }),
    ),
  );

  const PARAM_BY_KEY = new Map();
  const PARAM_BY_LABEL = new Map();
  PARAM_DICTIONARY.forEach((entry) => {
    PARAM_BY_KEY.set(entry.id, entry);
    PARAM_BY_KEY.set(entry.testKey, entry);
    PARAM_BY_LABEL.set(entry.label, entry);
  });

  // Odczyt serii z sejfu grupujemy po PELNEJ etykiecie labResult.test
  // (obejście §2 — magazyn gubi testKey). Mapowanie etykieta → wpis słownika
  // pozwala odzyskać grupę/jednostkę/formułę-źródło przy budowie historii.
  function getParamByLabel(label) {
    if (typeof label !== "string") return null;
    return PARAM_BY_LABEL.get(label.trim()) || null;
  }

  function normalizeTestKey(testKey) {
    const raw = String(testKey == null ? "" : testKey).trim();
    if (!raw) return "";
    return raw.startsWith("clcr:") ? raw.slice(5) : raw;
  }

  function getParam(testKey) {
    return PARAM_BY_KEY.get(normalizeTestKey(testKey)) || null;
  }

  function getParamGroups() {
    return PARAM_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      entries: PARAM_DICTIONARY.filter((entry) => entry.group === group.id),
    }));
  }

  const DZM_PROTOCOL_FIELDS = Object.freeze([
    "collectionStartAt",
    "collectionEndAt",
    "collectionStartVoidDiscarded",
    "collectionFinalVoidIncluded",
    "collectionNoMissedVoids",
    "collectionNoSpillage",
    "collectionNoExtraVoids",
    "collectionStorageFollowed",
  ]);

  const DZM_QUALITY_FIELDS = Object.freeze([
    "collectionStartVoidDiscarded",
    "collectionFinalVoidIncluded",
    "collectionNoMissedVoids",
    "collectionNoSpillage",
    "collectionNoExtraVoids",
    "collectionStorageFollowed",
  ]);

  const DZM_QUALITY_GROUP_FOCUS_ID = "clcrDzmQualityGroup";

  const SPOT_INTERFERENCE_FIELDS = Object.freeze([
    "spotMenstruation",
    "spotHematuria",
    "spotInfection",
    "spotExercise",
    "spotAcuteIllness",
  ]);

  const COLLAPSIBLE_CONTEXT_FIELDS = new Set([
    ...SPOT_INTERFERENCE_FIELDS,
    "spotDiureticUse",
    "spotKnownCKD",
    "spotAcuteIllness",
  ]);

  const KTV_CONTEXT_FIELDS = Object.freeze([
    "ktvAccessType",
    "ktvKru",
    "ktvKruMeasuredAt",
    "ktvTreatmentsDelivered",
  ]);

  const FORMULA_CONTEXT = Object.freeze({
    egfr: {
      interpretation: ["ScrAssay", "creatinineState"],
      optional: ["weight", "height", "suspectedAKI"],
    },
    ckid_u25: {
      interpretation: ["ageMonths", "ScrAssay", "creatinineState"],
      optional: ["weight", "suspectedAKI"],
    },
    egfr_cr_cys: {
      interpretation: [
        "CystatinCAssayMethod",
        "creatinineState",
      ],
      optional: ["weight", "height", "suspectedAKI"],
    },
    ckid_u25_cys: {
      interpretation: ["ageMonths", "CystatinCAssayMethod", "creatinineState"],
      optional: ["weight", "height", "suspectedAKI"],
    },
    ckid_u25_cr_cys: {
      interpretation: ["ageMonths", "CystatinCAssayMethod", "creatinineState"],
      optional: ["weight", "suspectedAKI"],
    },
    neonatal_egfr: {
      interpretation: ["creatinineState"],
      optional: ["suspectedAKI"],
    },
    cg: {
      interpretation: ["creatinineState"],
      optional: ["suspectedAKI"],
    },
    cg_norm: {
      interpretation: ["creatinineState"],
      optional: ["suspectedAKI"],
    },
    sch_idms: {
      interpretation: ["ageMonths", "ScrAssay", "creatinineState"],
      optional: ["weight", "suspectedAKI"],
    },
    cl24: {
      interpretation: ["creatinineState"],
      optional: ["suspectedAKI"],
    },
    ACR: {
      interpretation: ["spotSampleKind", "age", "ageMonths", "sex"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    PCR: {
      interpretation: ["spotSampleKind", "age", "ageMonths", "sex"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    CaCr_spot: {
      interpretation: ["spotSampleKind", "ageMonths", "sex"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    OxCr_spot: {
      interpretation: ["spotSampleKind"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    CitCr_spot: {
      interpretation: ["spotSampleKind", "ageMonths", "sex"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    FENa_spot: {
      interpretation: ["spotSampleKind"],
      optional: ["spotDiureticUse", "spotKnownCKD"],
    },
    FEK_spot: {
      interpretation: ["spotSampleKind"],
      optional: ["spotDiureticUse", "spotKnownCKD"],
    },
    FECl_spot: {
      interpretation: ["spotSampleKind"],
      optional: ["spotDiureticUse", "spotKnownCKD"],
    },
    FEHCO3_spot: {
      interpretation: ["spotSampleKind", "spotBicarbonateLoad"],
      optional: ["spotKnownCKD"],
    },
    AGu_spot: {
      interpretation: ["spotSampleKind", "spotNagmaContext"],
      optional: ["spotKnownCKD"],
    },
    TMP_GFR: {
      interpretation: ["ageMonths", "sex"],
      optional: [],
    },
    pH_spot: {
      interpretation: ["spotSampleKind"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    Ox_mgkg: {
      interpretation: [
        "ageMonths",
        "stoneMetabolicEvaluationContext",
        "stoneCollectionPlausibilityReviewed",
        "stoneTwoCollectionsConfirmed",
      ],
      optional: ["stoneThiolTherapy"],
    },
    Cit_mgkg: {
      interpretation: [
        "ageMonths",
        "sex",
        "stoneMetabolicEvaluationContext",
        "stoneCollectionPlausibilityReviewed",
        "stoneTwoCollectionsConfirmed",
      ],
      optional: [],
    },
    Ca_Cit: {
      interpretation: [],
      optional: [],
    },
    pH24: {
      interpretation: [
        "stoneMetabolicEvaluationContext",
        "stoneCollectionPlausibilityReviewed",
        "stoneTwoCollectionsConfirmed",
        "stonePhPersistent",
        "stoneUtiExcluded",
      ],
      optional: [
        "stoneKnownCystinuria",
        "stoneSpotFasting",
        "spotSampleKind",
        "U_pH",
        "spotInfection",
      ],
    },
    KTV: {
      interpretation: KTV_CONTEXT_FIELDS,
      optional: [],
    },
  });

  const SHARED_MODULE_FIELD_IDS = Object.freeze({
    "spot-protein": Object.freeze([
      "U_Alb",
      "U_Prot_spot",
      "Ucr_spot",
      "Ucr_spot_unit",
    ]),
  });

  const ACTIVE_CONFOUNDER_MESSAGES = Object.freeze({
    spotMenstruation:
      "Miesiączka może przejściowo zmieniać ACR, PCR i część wskaźników moczowych; wynik wymaga ostrożnej interpretacji.",
    spotHematuria:
      "Krwiomocz może wpływać na ACR, PCR i wskaźniki kamicowe; wynik wymaga ostrożnej interpretacji.",
    spotInfection:
      "Zakażenie układu moczowego może przejściowo zmieniać białkomocz, pH i część analitów moczowych.",
    spotExercise:
      "Intensywny wysiłek przed pobraniem może przejściowo zwiększyć albuminurię lub białkomocz.",
    spotAcuteIllness:
      "Gorączka lub ostra choroba mogą przejściowo zmieniać wydalanie analitów i ograniczać porównywalność wyniku.",
    spotDiureticUse:
      "Stosowanie diuretyku może istotnie zmieniać frakcje wydalnicze.",
    spotKnownCKD:
      "Rozpoznana przewlekła choroba nerek może ograniczać wartość diagnostyczną frakcji wydalniczych i UAG.",
  });

  const INTERPRETATION_NEGATIVE_MESSAGES = Object.freeze({
    spotBicarbonateLoad:
      "Nie potwierdzono udokumentowanego protokołu obciążenia wodorowęglanem; FEHCO₃ pozostaje bez pełnej interpretacji.",
    spotNagmaContext:
      "Nie potwierdzono właściwego kontekstu kwasicy metabolicznej z prawidłową luką anionową; UAG pozostaje bez pełnej interpretacji.",
    stoneMetabolicEvaluationContext:
      "Nie potwierdzono właściwego kontekstu pełnej oceny metabolicznej kamicy.",
    stoneCollectionPlausibilityReviewed:
      "Nie potwierdzono oceny wiarygodności zbiórki moczu; interpretacja profilu kamicowego jest ograniczona.",
    stoneTwoCollectionsConfirmed:
      "Nie potwierdzono dwóch wiarygodnych zbiórek; pełna interpretacja profilu kamicowego jest ograniczona.",
    stonePhPersistent:
      "Nie potwierdzono utrzymywania się nieprawidłowego pH w kolejnych pomiarach.",
    stoneUtiExcluded:
      "Nie potwierdzono wykluczenia zakażenia układu moczowego jako przyczyny nieprawidłowego pH.",
    ktvTreatmentsDelivered:
      "Surowy wynik spKt/V jest możliwy, ale interpretacja progowa wymaga potwierdzenia regularnej realizacji ocenianego schematu.",
  });

  const HELP_OVERRIDES = Object.freeze({
    age: "Podaj ukończone lata. U niemowlęcia i dziecka poniżej roku uzupełnij również pełne miesiące.",
    ageMonths: "Podaj pełne miesiące od ostatnich urodzin (0–11). Wartość 0 jest prawidłowa.",
    ageDays: "Podaj ukończone dni życia noworodka (0–28). Wartość 0 jest prawidłowa.",
    sex: "Wybór jest wymagany tylko przez wzory, które jawnie uwzględniają płeć biologiczną.",
    weight: "Podaj aktualną masę ciała w kilogramach. Nie zastępuj jej masą należną bez wskazania wzoru.",
    height: "Podaj aktualny wzrost w centymetrach; jest używany m.in. w BSA i wzorach pediatrycznych.",
    Scr: "Podaj kreatyninę w surowicy i wybierz jednostkę dokładnie zgodną z wynikiem laboratoryjnym.",
    ScrUnit: "Wybierz jednostkę kreatyniny w surowicy zgodną z dokumentem źródłowym.",
    ScrAssay: "Standaryzacja do IDMS wpływa na wiarygodność i dostępność współczesnych wzorów kreatyninowych.",
    creatinineState: "eGFR i eCrCl zakładają stabilne markery filtracji. Szybka zmiana ogranicza lub wyklucza interpretację.",
    suspectedAKI: "Zaznacz, jeżeli istnieje podejrzenie ostrego uszkodzenia nerek. Wtedy estymacje stanu stacjonarnego mogą być niewiarygodne.",
    CystatinC: "Podaj cystatynę C w mg/L z wyniku laboratoryjnego.",
    CystatinCStandardization: "Potwierdź identyfikowalność oznaczenia do ERM‑DA471/IFCC.",
    spotSampleKind: "Rodzaj i pora pobrania próbki mogą zmieniać możliwość pełnej interpretacji wyniku.",
    spotSameSpecimen: "Potwierdź, że analit i kreatynina pochodzą z dokładnie tej samej próbki moczu.",
    spotPairedChemistry: "Potwierdź równoczesne pobranie krwi oraz moczu i wspólne pochodzenie analitów moczowych.",
    tmpOvernightFasting: "TmP/GFR wymaga próbki po nocnym pozostawaniu na czczo.",
    tmpPairedSameTime: "Potwierdź równoczesne pobranie sparowanych próbek krwi i drugiego porannego moczu.",
    collectionStartAt: "Podaj rzeczywistą datę i godzinę rozpoczęcia zbiórki po odrzuceniu pierwszej mikcji.",
    collectionEndAt: "Podaj rzeczywistą datę i godzinę zakończenia zbiórki wraz z końcową mikcją.",
    collectionStartVoidDiscarded: "Początkową mikcję należy odrzucić i od tej chwili liczyć czas zbiórki.",
    collectionFinalVoidIncluded: "Końcowa mikcja o zadanej godzinie musi zostać dołączona do zbiórki.",
    collectionNoMissedVoids: "Potwierdź, że w okresie zbiórki nie pominięto żadnej mikcji.",
    collectionNoSpillage: "Potwierdź, że nie utracono części próbki przez rozlanie.",
    collectionNoExtraVoids: "Potwierdź, że do pojemnika nie dodano moczu spoza zadeklarowanego czasu.",
    collectionStorageFollowed: "Potwierdź przechowywanie zgodnie z instrukcją laboratorium.",
    serumSampleDuringCollection: "Próbka surowicy powinna zostać pobrana w okresie ocenianej zbiórki.",
    serumSampleAt: "Podaj rzeczywistą datę i godzinę pobrania próbki surowicy.",
    ktvSameSession: "Próbki przed i po dializie muszą pochodzić z tej samej ocenianej sesji.",
    ktvPreBeforeDialysis: "Próbkę przed dializą należy pobrać bezpośrednio przed rozpoczęciem sesji.",
    ktvPreNoDilution: "Potwierdź brak rozcieńczenia próbki solą, heparyną lub innym płynem.",
    ktvTreatmentsDelivered: "Potwierdź regularną realizację całego ocenianego schematu bez skracania zabiegów.",
    U_ACR: "Wartość ACR jest obliczana automatycznie i jest prezentowana wyłącznie w wynikach.",
    U_PCR: "Wartość PCR jest obliczana automatycznie i jest prezentowana wyłącznie w wynikach.",
    Ucr_spot: "Podaj stężenie kreatyniny z tej samej próbki moczu co oznaczany analit.",
    Ucr_spot_unit: "Wybierz jednostkę kreatyniny w próbce moczu dokładnie zgodną z wynikiem laboratorium.",
    spotMenstruation: "Miesiączka może przejściowo zwiększyć albuminę, białko lub krew w próbce i ograniczyć interpretację wskaźnika.",
    spotHematuria: "Krwiomocz może wpływać na ACR, PCR i wskaźniki kamicowe; wartość liczbowa wymaga wtedy ostrożnej interpretacji.",
    spotInfection: "Zakażenie układu moczowego może przejściowo zmienić białkomocz, pH i część analitów moczowych.",
    spotExercise: "Intensywny wysiłek przed pobraniem może przejściowo zwiększyć albuminurię lub białkomocz.",
    spotAcuteIllness: "Gorączka lub ostra choroba mogą przejściowo zmieniać wydalanie analitów i ograniczać porównywalność wyniku.",
    U_Na_spot: "Podaj stężenie sodu w próbce moczu używanej do obliczenia frakcji wydalniczej lub UAG.",
    S_Na_spot: "Podaj stężenie sodu z równocześnie pobranej próbki krwi.",
    U_K_spot: "Podaj stężenie potasu w tej samej próbce moczu co pozostałe anality punktowe.",
    S_K_spot: "Podaj stężenie potasu z równocześnie pobranej próbki krwi.",
    U_Cl_spot: "Podaj stężenie chlorków w tej samej próbce moczu co pozostałe anality punktowe.",
    S_Cl_spot: "Podaj stężenie chlorków z równocześnie pobranej próbki krwi.",
    U_HCO3_spot: "Podaj stężenie wodorowęglanów w próbce moczu zgodnej czasowo z próbką krwi.",
    S_HCO3_spot: "Podaj stężenie wodorowęglanów z równocześnie pobranej próbki krwi.",
    spotDiureticUse: "Diuretyk może istotnie zmienić frakcje wydalnicze; zaznacz użycie przed interpretacją FE.",
    spotKnownCKD: "Przewlekła choroba nerek może zmieniać wartość diagnostyczną frakcji wydalniczych i UAG.",
    spotBicarbonateLoad: "Interpretacja FEHCO₃ zależy od udokumentowanego protokołu obciążenia wodorowęglanem.",
    spotNagmaContext: "UAG interpretuje się pomocniczo w odpowiednim kontekście kwasicy metabolicznej z prawidłową luką anionową.",
    Ca_spot: "Podaj stężenie wapnia w tej samej próbce moczu co kreatynina.",
    Ca_spot_unit: "Wybierz jednostkę wapnia w próbce moczu zgodną z dokumentem laboratoryjnym.",
    U_PO4_spot: "Podaj stężenie fosforu nieorganicznego w drugim porannym moczu użytym do TmP/GFR.",
    U_PO4_spot_unit: "Wybierz jednostkę fosforu w próbce moczu zgodną z wynikiem laboratoryjnym.",
    S_PO4_spot: "Podaj stężenie fosforu nieorganicznego z równocześnie pobranej próbki krwi.",
    S_PO4_spot_unit: "Wybierz jednostkę fosforu w surowicy zgodną z wynikiem laboratoryjnym.",
    Scr_spot: "Podaj kreatyninę z próbki krwi pobranej równocześnie z moczem do TmP/GFR lub FE.",
    Scr_spot_unit: "Wybierz jednostkę kreatyniny w surowicy zgodną z wynikiem laboratoryjnym.",
  });

  const UNIT_PAIRS = Object.freeze({
    Scr: "ScrUnit",
    S_PO4: "S_PO4_unit",
    S_Ca: "S_Ca_unit",
    Ucr_spot: "Ucr_spot_unit",
    Ca_spot: "Ca_spot_unit",
    U_PO4_spot: "U_PO4_spot_unit",
    S_PO4_spot: "S_PO4_spot_unit",
    Scr_spot: "Scr_spot_unit",
  });

  const NON_NEGATIVE_REQUIRED_FIELDS = new Set([
    "age",
    "ageMonths",
    "ageDays",
    "ktvUF",
    "U_Alb",
    "U_Prot_spot",
    "U_Na_spot",
    "U_K_spot",
    "U_Cl_spot",
    "U_HCO3_spot",
  ]);

  const TIMED_VALUE_FORMULAS = new Set([
    "UA_mgkg",
    "Ca_mgkg",
    "Mg_mgkg",
    "PO4_mgkg",
    "Prot_mgkg",
    "Na_mmol_d",
    "K_mmol_d",
    "Ox_mgkg",
    "Cit_mgkg",
    "pH24",
  ]);

  const CREATININE_VALUE_FORMULAS = new Set([
    "egfr",
    "ckid_u25",
    "egfr_cr_cys",
    "ckid_u25_cys",
    "ckid_u25_cr_cys",
    "neonatal_egfr",
    "cg",
    "cg_norm",
    "cl24",
    "sch_idms",
    "TMP_GFR",
  ]);

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[łŁ]/g, "l")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function compactSearch(value) {
    return normalizeSearch(value).replace(/\s+/g, "");
  }

  function getModuleForFormula(formulaId) {
    return MODULE_BY_FORMULA.get(formulaId) || null;
  }

  function getSharedModuleFieldIds(formulaId) {
    const module = getModuleForFormula(formulaId);
    return module && SHARED_MODULE_FIELD_IDS[module.id]
      ? [...SHARED_MODULE_FIELD_IDS[module.id]]
      : [];
  }

  function interpretationControlState(control, answerValue) {
    if (!control) return { state: "missing" };
    if (String(control.type).toLowerCase() !== "checkbox") {
      return String(control.value == null ? "" : control.value).trim() === ""
        ? { state: "missing" }
        : { state: "ready" };
    }
    const answer =
      answerValue == null
        ? control.checked
          ? "yes"
          : ""
        : String(answerValue);
    if (answer === "yes") return { state: "ready" };
    if (answer === "no") return { state: "negative" };
    return { state: "missing" };
  }

  function activeConfounderLimitations(activeFieldIds, checkedFieldIds) {
    const active = new Set(activeFieldIds || []);
    const checked = new Set(checkedFieldIds || []);
    return Object.entries(ACTIVE_CONFOUNDER_MESSAGES)
      .filter(([fieldId]) => active.has(fieldId) && checked.has(fieldId))
      .map(([fieldId, message]) => ({ fieldId, message }));
  }

  function levelAllows(selectedLevel, moduleLevel) {
    if (selectedLevel === "spot" || moduleLevel === "spot") {
      return selectedLevel === "spot" && moduleLevel === "spot";
    }
    return (
      Object.prototype.hasOwnProperty.call(LEVEL_ORDER, selectedLevel) &&
      Object.prototype.hasOwnProperty.call(LEVEL_ORDER, moduleLevel) &&
      LEVEL_ORDER[moduleLevel] <= LEVEL_ORDER[selectedLevel]
    );
  }

  function getAvailableModules(selectedLevel) {
    return MODULES.filter((module) => levelAllows(selectedLevel, module.level));
  }

  function getFormulaAssignments(formulas) {
    const source = Array.isArray(formulas) ? formulas : [];
    return source.map((formula) => ({
      formulaId: formula.id,
      moduleId: getModuleForFormula(formula.id)?.id || null,
      historical: HISTORICAL_FORMULA_IDS.includes(formula.id),
    }));
  }

  function formulaSearch(query, formulas) {
    const normalized = normalizeSearch(query);
    if (!normalized) return [];
    const tokens = normalized.split(" ").filter((token) => token.length > 1);
    if (!tokens.length) return [];
    const compactQuery = compactSearch(normalized);
    const source = Array.isArray(formulas) ? formulas : [];
    return source
      .filter((formula) => !HISTORICAL_FORMULA_IDS.includes(formula.id))
      .map((formula) => {
        const module = getModuleForFormula(formula.id);
        if (!module) return null;
        const haystack = normalizeSearch(
          [
            formula.id,
            formula.label,
            formula.note,
            module.title,
            module.description,
            module.keywords,
          ].join(" "),
        );
        const compactHaystack = compactSearch(haystack);
        const separatedMatch = tokens.every((token) => haystack.includes(token));
        const compactMatch =
          compactQuery.length > 1 && compactHaystack.includes(compactQuery);
        if (!separatedMatch && !compactMatch) return null;
        const label = normalizeSearch(formula.label);
        const compactLabel = compactSearch(label);
        const score =
          (label.startsWith(normalized) ? 40 : 0) +
          (label.includes(normalized) ? 20 : 0) +
          (compactLabel.startsWith(compactQuery) ? 30 : 0) +
          (compactLabel.includes(compactQuery) ? 15 : 0) +
          tokens.reduce((total, token) => total + (label.includes(token) ? 3 : 1), 0);
        return { formula, module, score };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.formula.label.localeCompare(right.formula.label, "pl"));
  }

  function helpDetailsForField(fieldId, label, control) {
    if (HELP_OVERRIDES[fieldId]) {
      return { text: HELP_OVERRIDES[fieldId], source: "workflow" };
    }
    if (control && control.dataset && control.dataset.info) {
      return { text: control.dataset.info, source: "field" };
    }
    if (
      global.ClcrInfoTexts &&
      typeof global.ClcrInfoTexts === "object" &&
      global.ClcrInfoTexts[fieldId]
    ) {
      return { text: global.ClcrInfoTexts[fieldId], source: "clinical" };
    }
    const readable = String(label || fieldId || "to pole").replace(/:\s*$/, "");
    if (control && String(control.tagName).toLowerCase() === "select") {
      return {
        text: `Wybierz odpowiedź opisującą pole „${readable}”. W razie wątpliwości pozostaw je nieuzupełnione zamiast zgadywać.`,
        source: "generated",
      };
    }
    if (control && String(control.type).toLowerCase() === "checkbox") {
      return {
        text: `Zaznacz tylko wtedy, gdy warunek „${readable}” został świadomie potwierdzony.`,
        source: "generated",
      };
    }
    return {
      text: `Wprowadź wartość dla pola „${readable}” dokładnie zgodnie z wynikiem źródłowym i widoczną jednostką.`,
      source: "generated",
    };
  }

  function helpForField(fieldId, label, control) {
    return helpDetailsForField(fieldId, label, control).text;
  }

  const Model = Object.freeze({
    version: "1.1.0",
    MODULES,
    HISTORICAL_FORMULA_IDS,
    LEVEL_ORDER,
    FORMULA_CONTEXT,
    PARAM_DICTIONARY,
    PARAM_GROUPS,
    getParam,
    getParamByLabel,
    getParamGroups,
    DZM_QUALITY_FIELDS,
    HELP_OVERRIDES,
    SHARED_MODULE_FIELD_IDS,
    ACTIVE_CONFOUNDER_MESSAGES,
    normalizeSearch,
    compactSearch,
    formulaSearch,
    interpretationControlState,
    activeConfounderLimitations,
    getAvailableModules,
    getFormulaAssignments,
    getModuleForFormula,
    getSharedModuleFieldIds,
    levelAllows,
    helpForField,
  });

  global.ClcrUiModel = Model;

  const documentRef = global.document;
  if (!documentRef || typeof documentRef.addEventListener !== "function") return;

  const state = {
    level: "basic",
    activeFormulaId: "",
    activeFieldIds: new Set(),
    requiredFieldIds: new Set(),
    interpretationFieldIds: new Set(),
    optionalFieldIds: new Set(),
    fieldViews: new Map(),
    fieldPairs: [],
    legacyBroad: false,
    shell: null,
    moduleGrid: null,
    activePanel: null,
    readiness: null,
    moduleToggle: null,
    mobileModulesExpanded: false,
    dzmQualityGroup: null,
    dzmQualityBulkUpdate: false,
  };

  function formulaById(formulaId) {
    return (Array.isArray(global.FORMULAS) ? global.FORMULAS : []).find(
      (formula) => formula && formula.id === formulaId,
    ) || null;
  }

  function createElement(tagName, className, text) {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function fieldLabelText(label, control) {
    if (!label) return control.getAttribute("aria-label") || control.id;
    const clone = label.cloneNode(true);
    clone
      .querySelectorAll("input, select, textarea, button, .validation-message, .tooltip")
      .forEach((node) => node.remove());
    return clone.textContent
      .replace(/\s+/g, " ")
      .replace(/\s*:\s*$/, "")
      .trim() || control.id;
  }

  function closeAllHelp(exceptPanel) {
    state.fieldViews.forEach((view) => {
      if (!view.helpPanel || view.helpPanel === exceptPanel) return;
      view.helpPanel.hidden = true;
      view.infoButton.setAttribute("aria-expanded", "false");
    });
  }

  function decorateField(control) {
    if (!control || !control.id || state.fieldViews.has(control.id)) {
      return state.fieldViews.get(control && control.id);
    }
    let label = control.closest("label");
    if (!label) label = documentRef.querySelector(`label[for="${control.id}"]`);
    if (!label) {
      label = createElement("label");
      control.parentNode.insertBefore(label, control);
      label.appendChild(control);
    }
    const labelText = fieldLabelText(label, control);
    const validation =
      label.querySelector(".validation-message") ||
      control.parentNode.querySelector(".validation-message");
    const preservedControl = control;
    Array.from(label.childNodes).forEach((node) => {
      if (node !== preservedControl && node !== validation) node.remove();
    });

    label.classList.add("clcr-field");
    label.dataset.clcrFieldId = control.id;
    label.removeAttribute("style");

    const heading = createElement("span", "clcr-field__heading");
    const name = createElement("span", "clcr-field__name", labelText);
    name.id = `clcr-label-${control.id}`;
    const badge = createElement("span", "clcr-field__status", "Opcjonalne");
    const infoButton = createElement("button", "clcr-info-button", "i");
    infoButton.type = "button";
    infoButton.setAttribute("aria-label", `Informacja: ${labelText}`);
    infoButton.setAttribute("aria-expanded", "false");
    const helpDetails = helpDetailsForField(control.id, labelText, control);
    const helpPanel = createElement(
      "span",
      "clcr-field__help",
      helpDetails.text,
    );
    helpPanel.dataset.clcrHelpSource = helpDetails.source;
    helpPanel.id = `clcr-help-${control.id}`;
    helpPanel.hidden = true;
    infoButton.setAttribute("aria-controls", helpPanel.id);
    infoButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = helpPanel.hidden;
      closeAllHelp(willOpen ? helpPanel : null);
      helpPanel.hidden = !willOpen;
      infoButton.setAttribute("aria-expanded", String(willOpen));
    });
    heading.append(name, badge, infoButton);
    label.insertBefore(heading, preservedControl);
    label.appendChild(helpPanel);
    if (validation) {
      validation.classList.add("clcr-field__validation");
      label.appendChild(validation);
    }
    preservedControl.setAttribute("aria-labelledby", name.id);
    preservedControl.removeAttribute("required");

    const isCheckbox = String(preservedControl.type).toLowerCase() === "checkbox";
    if (isCheckbox) label.classList.add("clcr-field--choice");
    if (Object.prototype.hasOwnProperty.call(UNIT_PAIRS, control.id)) {
      label.classList.add("clcr-field--value");
      label.dataset.clcrUnitPair = UNIT_PAIRS[control.id];
    }
    if (Object.values(UNIT_PAIRS).includes(control.id)) {
      label.classList.add("clcr-field--unit");
    }

    const view = {
      control: preservedControl,
      wrapper: label,
      labelText,
      badge,
      infoButton,
      helpPanel,
      answerSelect: null,
      originalParent: label.parentNode,
    };
    state.fieldViews.set(control.id, view);
    return view;
  }

  function currentProtocolValueVault() {
    return (
      global.__vildaClcrVersionValueVault &&
      typeof global.__vildaClcrVersionValueVault === "object"
        ? global.__vildaClcrVersionValueVault
        : null
    );
  }

  function ensureProtocolAnswer(view) {
    if (!view) return null;
    const control = view.control;
    if (String(control.type).toLowerCase() !== "checkbox") return null;
    const vault = currentProtocolValueVault();
    if (view.answerSelect) {
      const answerId = view.answerSelect.id;
      if (
        vault &&
        Object.prototype.hasOwnProperty.call(vault, answerId) &&
        ["", "yes", "no", "unknown"].includes(vault[answerId])
      ) {
        view.answerSelect.value = vault[answerId];
      } else if (
        vault &&
        Object.prototype.hasOwnProperty.call(vault, control.id)
      ) {
        view.answerSelect.value = control.checked ? "yes" : "";
      }
      return view.answerSelect;
    }
    const answer = createElement("select", "clcr-protocol-answer");
    answer.id = `ui_${control.id}_answer`;
    answer.setAttribute("aria-label", `${view.labelText}: wybierz odpowiedź`);
    [
      ["", "— wybierz —"],
      ["yes", "Tak — potwierdzam"],
      ["no", "Nie"],
      ["unknown", "Nie wiem"],
    ].forEach(([value, text]) => {
      const option = createElement("option", "", text);
      option.value = value;
      answer.appendChild(option);
    });
    const restoredAnswer = vault && vault[answer.id];
    answer.value = ["", "yes", "no", "unknown"].includes(restoredAnswer)
      ? restoredAnswer
      : control.checked
        ? "yes"
        : "";
    control.classList.add("clcr-canonical-checkbox");
    control.setAttribute("aria-hidden", "true");
    control.tabIndex = -1;
    answer.addEventListener("change", () => {
      const shouldCheck = answer.value === "yes";
      if (control.checked !== shouldCheck) {
        control.checked = shouldCheck;
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const liveVault = currentProtocolValueVault();
      if (liveVault) {
        liveVault[answer.id] = answer.value;
        liveVault[control.id] = control.checked;
      }
      if (
        DZM_QUALITY_FIELDS.includes(control.id) &&
        !state.dzmQualityBulkUpdate
      ) {
        syncDzmQualityGroupState();
      }
      scheduleReadiness();
    });
    control.addEventListener("change", () => {
      if (control.checked) answer.value = "yes";
      else if (answer.value === "yes") answer.value = "";
      const liveVault = currentProtocolValueVault();
      if (liveVault) {
        liveVault[answer.id] = answer.value;
        liveVault[control.id] = control.checked;
      }
      if (
        DZM_QUALITY_FIELDS.includes(control.id) &&
        !state.dzmQualityBulkUpdate
      ) {
        syncDzmQualityGroupState();
      }
    });
    view.wrapper.insertBefore(answer, view.helpPanel);
    view.answerSelect = answer;
    return answer;
  }

  function dzmQualityAnswerSummary() {
    const answers = DZM_QUALITY_FIELDS.map((fieldId) => {
      const view = state.fieldViews.get(fieldId);
      const answer = view
        ? view.answerSelect || ensureProtocolAnswer(view)
        : null;
      return answer ? answer.value : "";
    });
    const yesCount = answers.filter((answer) => answer === "yes").length;
    const noCount = answers.filter((answer) => answer === "no").length;
    const unknownCount = answers.filter(
      (answer) => answer === "unknown",
    ).length;
    const missingCount =
      DZM_QUALITY_FIELDS.length - yesCount - noCount - unknownCount;
    return {
      answers,
      yesCount,
      noCount,
      unknownCount,
      missingCount,
      complete: yesCount === DZM_QUALITY_FIELDS.length,
    };
  }

  function ensureDzmQualityGroup() {
    if (state.dzmQualityGroup) return state.dzmQualityGroup;
    const firstView = state.fieldViews.get(DZM_QUALITY_FIELDS[0]);
    if (!firstView || !firstView.originalParent) return null;

    const group = createElement("section", "clcr-dzm-quality");
    group.id = DZM_QUALITY_GROUP_FOCUS_ID;
    group.setAttribute("role", "group");
    group.setAttribute(
      "aria-labelledby",
      `${DZM_QUALITY_GROUP_FOCUS_ID}Title`,
    );

    const header = createElement("div", "clcr-dzm-quality__header");
    const title = createElement(
      "h3",
      "clcr-dzm-quality__title",
      "Jakość zbiórki moczu",
    );
    title.id = `${DZM_QUALITY_GROUP_FOCUS_ID}Title`;
    const badge = createElement(
      "span",
      "clcr-field__status",
      "Wymagane potwierdzenie",
    );
    const stateText = createElement(
      "span",
      "clcr-dzm-quality__state",
      "0/6 potwierdzono",
    );
    stateText.setAttribute("aria-live", "polite");
    header.append(title, badge, stateText);

    const description = createElement(
      "p",
      "clcr-dzm-quality__description",
      "Potwierdź jednym kliknięciem, jeśli początek i koniec, kompletność porcji bez rozlania, czas zbiórki i przechowywanie były prawidłowe. Jeśli nie lub nie wiesz — otwórz szczegóły.",
    );
    description.id = `${DZM_QUALITY_GROUP_FOCUS_ID}Description`;
    stateText.id = `${DZM_QUALITY_GROUP_FOCUS_ID}State`;
    group.setAttribute(
      "aria-describedby",
      `${description.id} ${stateText.id}`,
    );

    const confirmAll = createElement(
      "button",
      "clcr-dzm-quality__confirm",
      "Tak — wszystkie warunki spełniono",
    );
    confirmAll.type = "button";
    confirmAll.setAttribute(
      "aria-describedby",
      `${description.id} ${stateText.id}`,
    );

    const details = createElement("details", "clcr-dzm-quality__details");
    details.setAttribute("aria-describedby", description.id);
    const summary = createElement(
      "summary",
      "clcr-dzm-quality__summary",
      "Sprawdź szczegóły / zgłoś problem",
    );
    const fields = createElement("div", "clcr-dzm-quality__fields");
    details.append(summary, fields);
    group.append(header, description, confirmAll, details);

    confirmAll.addEventListener("click", () => {
      const currentSummary = dzmQualityAnswerSummary();
      if (currentSummary.noCount || currentSummary.unknownCount) {
        details.open = true;
        const firstUnconfirmedId = DZM_QUALITY_FIELDS.find((fieldId) => {
          const view = state.fieldViews.get(fieldId);
          return (
            view &&
            view.answerSelect &&
            ["no", "unknown"].includes(view.answerSelect.value)
          );
        });
        if (firstUnconfirmedId) focusField(firstUnconfirmedId);
        return;
      }
      state.dzmQualityBulkUpdate = true;
      DZM_QUALITY_FIELDS.forEach((fieldId) => {
        const view = state.fieldViews.get(fieldId);
        const answer = view
          ? view.answerSelect || ensureProtocolAnswer(view)
          : null;
        if (!answer || answer.value === "yes") return;
        answer.value = "yes";
        answer.dispatchEvent(new Event("change", { bubbles: true }));
      });
      state.dzmQualityBulkUpdate = false;
      details.open = false;
      syncDzmQualityGroupState();
      scheduleReadiness();
    });

    firstView.originalParent.insertBefore(group, firstView.wrapper);
    state.dzmQualityGroup = {
      group,
      header,
      title,
      badge,
      stateText,
      description,
      confirmAll,
      details,
      fields,
    };
    return state.dzmQualityGroup;
  }

  function syncDzmQualityGroupState() {
    const qualityGroup = state.dzmQualityGroup;
    if (!qualityGroup || qualityGroup.group.hidden) return;
    const summary = dzmQualityAnswerSummary();
    qualityGroup.group.dataset.clcrQualityState = summary.complete
      ? "confirmed"
      : summary.noCount
        ? "failed"
        : summary.unknownCount
          ? "unknown"
          : "incomplete";

    if (summary.complete) {
      qualityGroup.stateText.textContent = "6/6 potwierdzono";
      qualityGroup.confirmAll.textContent =
        "Tak — wszystkie warunki spełniono";
    } else if (summary.noCount || summary.unknownCount) {
      const stateParts = [];
      if (summary.yesCount) stateParts.push(`${summary.yesCount} Tak`);
      if (summary.noCount) stateParts.push(`${summary.noCount} Nie`);
      if (summary.unknownCount) {
        stateParts.push(`${summary.unknownCount} Nie wiem`);
      }
      if (summary.missingCount) {
        stateParts.push(`${summary.missingCount} bez odpowiedzi`);
      }
      qualityGroup.stateText.textContent = stateParts.join(" · ");
      qualityGroup.confirmAll.textContent =
        "Przejdź do odpowiedzi wymagającej zmiany";
      qualityGroup.details.open = true;
    } else {
      qualityGroup.stateText.textContent = `${summary.yesCount}/6 potwierdzono`;
      qualityGroup.confirmAll.textContent =
        "Tak — wszystkie warunki spełniono";
    }
  }

  function restoreDzmQualityFields() {
    const qualityGroup = state.dzmQualityGroup;
    if (!qualityGroup) return;
    DZM_QUALITY_FIELDS.forEach((fieldId) => {
      const view = state.fieldViews.get(fieldId);
      if (!view || !view.originalParent) return;
      if (view.wrapper.parentNode === qualityGroup.fields) {
        view.originalParent.insertBefore(view.wrapper, qualityGroup.group);
      }
    });
    qualityGroup.group.hidden = true;
  }

  function syncDzmQualityGroup() {
    const activeQualityFields = DZM_QUALITY_FIELDS.filter((fieldId) =>
      state.activeFieldIds.has(fieldId),
    );
    if (!activeQualityFields.length) {
      if (state.dzmQualityGroup) state.dzmQualityGroup.group.hidden = true;
      return;
    }
    const qualityGroup = ensureDzmQualityGroup();
    if (!qualityGroup) return;
    const firstView = state.fieldViews.get(DZM_QUALITY_FIELDS[0]);
    if (
      firstView &&
      firstView.originalParent &&
      firstView.wrapper.parentNode === firstView.originalParent
    ) {
      firstView.originalParent.insertBefore(qualityGroup.group, firstView.wrapper);
    }
    DZM_QUALITY_FIELDS.forEach((fieldId) => {
      const view = state.fieldViews.get(fieldId);
      if (!view) return;
      qualityGroup.fields.appendChild(view.wrapper);
    });
    const required = activeQualityFields.some((fieldId) =>
      state.requiredFieldIds.has(fieldId),
    );
    qualityGroup.group.hidden = false;
    qualityGroup.group.dataset.clcrStatus = required
      ? "required"
      : "interpretation";
    qualityGroup.badge.className = `clcr-field__status clcr-field__status--${
      required ? "required" : "interpretation"
    }`;
    qualityGroup.badge.textContent = required
      ? "Wymagane potwierdzenie"
      : "Do pełnej interpretacji";
    syncDzmQualityGroupState();
  }

  function setFieldStatus(view, status) {
    if (!view) return;
    view.wrapper.dataset.clcrStatus = status;
    view.badge.className = `clcr-field__status clcr-field__status--${status}`;
    if (status === "required") {
      view.badge.textContent =
        String(view.control.type).toLowerCase() === "checkbox"
          ? "Wymagane potwierdzenie"
          : "* Wymagane";
      view.control.setAttribute("aria-required", "true");
      if (String(view.control.type).toLowerCase() === "checkbox") {
        const answer = ensureProtocolAnswer(view);
        if (answer) answer.setAttribute("aria-required", "true");
      }
    } else if (status === "interpretation") {
      view.badge.textContent = "Do pełnej interpretacji";
      view.control.removeAttribute("aria-required");
      if (String(view.control.type).toLowerCase() === "checkbox") {
        const answer = ensureProtocolAnswer(view);
        if (answer) answer.removeAttribute("aria-required");
      } else if (view.answerSelect) {
        view.answerSelect.removeAttribute("aria-required");
      }
    } else {
      view.badge.textContent = "Opcjonalne";
      view.control.removeAttribute("aria-required");
      if (view.answerSelect) view.answerSelect.removeAttribute("aria-required");
    }
  }

  function sectionHasVisibleFields(section) {
    return Boolean(
      section &&
      Array.from(section.querySelectorAll(".clcr-field")).some(
        (field) => !field.hidden,
      ),
    );
  }

  function syncFieldsetVisibility() {
    ["patientSet", "serumSet", "spotSet", "spotSetRight", "dzmSet", "ktvFields"].forEach(
      (id) => {
        const section = documentRef.getElementById(id);
        if (section) section.style.display = sectionHasVisibleFields(section) ? "" : "none";
      },
    );
    const patientCard = documentRef.querySelector(".patient-card");
    const patientSet = documentRef.getElementById("patientSet");
    if (patientCard) {
      patientCard.style.display = sectionHasVisibleFields(patientSet) ? "" : "none";
    }
    const paramRow = documentRef.querySelector("#clcrForm > .param-row");
    let visibleColumnCount = 0;
    if (paramRow) {
      Array.from(paramRow.children)
        .filter((child) => child.classList?.contains("param-col"))
        .forEach((column) => {
          const fieldsets = Array.from(column.children).filter(
            (child) => String(child.tagName).toLowerCase() === "fieldset",
          );
          const visible = fieldsets.some((fieldset) =>
            sectionHasVisibleFields(fieldset),
          );
          column.hidden = !visible;
          if (visible) visibleColumnCount += 1;
        });
      paramRow.dataset.clcrVisibleColumns = String(visibleColumnCount);
      paramRow.hidden = visibleColumnCount === 0;
      paramRow.style.display = visibleColumnCount ? "" : "none";
    }
    const ktvCard = documentRef.getElementById("ktvCard");
    if (ktvCard) {
      ktvCard.style.display =
        state.activeFormulaId === "KTV" || (state.legacyBroad && state.level === "pro")
          ? ""
          : "none";
    }
    const clearContainer = documentRef.getElementById("clearContainer");
    if (clearContainer) {
      clearContainer.style.display = state.activeFieldIds.size || state.legacyBroad ? "" : "none";
    }
  }

  function groupUnitPairs() {
    state.fieldPairs = [];
    Object.entries(UNIT_PAIRS).forEach(([valueId, unitId]) => {
      const valueView = state.fieldViews.get(valueId);
      const unitView = state.fieldViews.get(unitId);
      if (!valueView || !unitView) return;
      const parent = valueView.wrapper.parentNode;
      if (!parent || unitView.wrapper.parentNode !== parent) return;
      const pair = createElement("div", "clcr-field-pair");
      pair.dataset.clcrValueField = valueId;
      pair.dataset.clcrUnitField = unitId;
      parent.insertBefore(pair, valueView.wrapper);
      pair.append(valueView.wrapper, unitView.wrapper);
      state.fieldPairs.push(pair);
    });
  }

  function syncFieldPairs() {
    state.fieldPairs.forEach((pair) => {
      pair.hidden = !Array.from(pair.children).some(
        (field) => field.classList.contains("clcr-field") && !field.hidden,
      );
    });
  }

  function restoreCollapsibleContextFields() {
    state.fieldViews.forEach((view) => {
      if (!view.wrapper.closest(".clcr-context-details")) return;
      if (view.originalParent) view.originalParent.appendChild(view.wrapper);
    });
    documentRef.querySelectorAll(".clcr-context-details").forEach((details) => {
      details.hidden = true;
    });
  }

  function groupCollapsibleContextFields() {
    restoreCollapsibleContextFields();
    const groups = new Map();
    COLLAPSIBLE_CONTEXT_FIELDS.forEach((fieldId) => {
      if (!state.optionalFieldIds.has(fieldId)) return;
      const view = state.fieldViews.get(fieldId);
      if (!view || view.wrapper.hidden || !view.originalParent) return;
      const fieldset = view.originalParent.closest("fieldset");
      if (!fieldset) return;
      let group = groups.get(fieldset);
      if (!group) {
        let details = fieldset.querySelector(":scope > .clcr-context-details");
        if (!details) {
          details = createElement("details", "clcr-context-details");
          const summary = createElement(
            "summary",
            "clcr-context-details__summary",
            "Opcjonalny kontekst kliniczny",
          );
          const body = createElement("div", "clcr-context-details__body");
          details.append(summary, body);
          fieldset.appendChild(details);
        }
        details.hidden = false;
        group = {
          details,
          body: details.querySelector(".clcr-context-details__body"),
        };
        groups.set(fieldset, group);
      }
      group.body.appendChild(view.wrapper);
    });
  }

  function getContext(formulaId) {
    return FORMULA_CONTEXT[formulaId] || { interpretation: [], optional: [] };
  }

  function activeSetsForFormula(formula) {
    const required = new Set(formula && Array.isArray(formula.requires) ? formula.requires : []);
    const interpretation = new Set(getContext(formula.id).interpretation || []);
    const optional = new Set(getContext(formula.id).optional || []);
    optional.add("fullName");

    const module = getModuleForFormula(formula.id);
    getSharedModuleFieldIds(formula.id).forEach((fieldId) => {
      if (!required.has(fieldId) && !interpretation.has(fieldId)) {
        optional.add(fieldId);
      }
    });
    if (module && module.id === "timed-urine-panel") {
      DZM_PROTOCOL_FIELDS.forEach((id) => {
        if (!required.has(id)) interpretation.add(id);
      });
    }
    if (module && module.path === "spot") {
      if (!required.has("spotSampleKind")) interpretation.add("spotSampleKind");
    }
    if (formula.id === "KTV") {
      const ktvFields = documentRef.getElementById("ktvFields");
      if (ktvFields) {
        ktvFields.querySelectorAll("input[id], select[id]").forEach((control) => {
          if (control.id !== "ktvToggle" && !required.has(control.id)) {
            interpretation.add(control.id);
          }
        });
      }
    }
    Object.entries(UNIT_PAIRS).forEach(([valueId, unitId]) => {
      if (required.has(valueId)) required.add(unitId);
      if (interpretation.has(valueId)) interpretation.add(unitId);
    });
    const active = new Set([...required, ...interpretation, ...optional]);
    return { active, required, interpretation, optional };
  }

  function renderActiveFields() {
    documentRef.documentElement.classList.remove("clcr-legacy-broad");
    const formula = formulaById(state.activeFormulaId);
    state.activeFormulaId = formula ? formula.id : "";
    const activeModule = formula ? getModuleForFormula(formula.id) : null;
    if (activeModule) {
      documentRef.documentElement.dataset.clcrActiveModule = activeModule.id;
      documentRef.documentElement.classList.add("clcr-has-active-formula");
    } else {
      delete documentRef.documentElement.dataset.clcrActiveModule;
      documentRef.documentElement.classList.remove("clcr-has-active-formula");
    }
    if (state.moduleToggle) {
      state.moduleToggle.textContent = state.mobileModulesExpanded
        ? "Ukryj obliczenia"
        : "Zmień obliczenie";
    }
    const sets = formula
      ? activeSetsForFormula(formula)
      : { active: new Set(), required: new Set(), interpretation: new Set(), optional: new Set() };
    state.activeFieldIds = sets.active;
    state.requiredFieldIds = sets.required;
    state.interpretationFieldIds = sets.interpretation;
    state.optionalFieldIds = sets.optional;

    state.fieldViews.forEach((view, fieldId) => {
      const visible = sets.active.has(fieldId);
      view.wrapper.hidden = !visible;
      if (!visible) {
        view.control.removeAttribute("aria-required");
        view.wrapper.classList.remove("must-fill-group");
      } else if (sets.required.has(fieldId)) {
        setFieldStatus(view, "required");
      } else if (sets.interpretation.has(fieldId)) {
        setFieldStatus(view, "interpretation");
      } else {
        setFieldStatus(view, "optional");
      }
    });

    syncDzmQualityGroup();
    const accr = state.fieldViews.get("U_ACR");
    const pcr = state.fieldViews.get("U_PCR");
    if (accr) accr.wrapper.hidden = true;
    if (pcr) pcr.wrapper.hidden = true;
    groupCollapsibleContextFields();
    syncFieldPairs();

    const ktvToggle = documentRef.getElementById("ktvToggle");
    if (ktvToggle) {
      if (formula && formula.id === "KTV") {
        ktvToggle.checked = true;
        ktvToggle.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (!state.legacyBroad) {
        ktvToggle.checked = false;
      }
    }
    syncFieldsetVisibility();
    renderActiveHeading(formula);
    renderReadiness();
  }

  function broadFormulaIds(level) {
    return (Array.isArray(global.FORMULAS) ? global.FORMULAS : [])
      .filter((formula) => {
        if (HISTORICAL_FORMULA_IDS.includes(formula.id)) return false;
        return levelAllows(level, formula.version);
      })
      .map((formula) => formula.id);
  }

  function renderLegacyBroad(level) {
    broadFormulaIds(level);
    documentRef.documentElement.classList.add("clcr-legacy-broad");
    documentRef.documentElement.classList.remove("clcr-has-active-formula");
    delete documentRef.documentElement.dataset.clcrActiveModule;
    const active = new Set();
    state.fieldViews.forEach((_view, id) => active.add(id));
    state.activeFieldIds = active;
    state.requiredFieldIds = new Set();
    state.interpretationFieldIds = new Set();
    state.optionalFieldIds = new Set(active);
    state.fieldViews.forEach((view, fieldId) => {
      view.wrapper.hidden = !active.has(fieldId);
      setFieldStatus(view, "optional");
    });
    restoreDzmQualityFields();
    restoreCollapsibleContextFields();
    syncFieldPairs();
    syncFieldsetVisibility();
    renderActiveHeading(null, true);
    renderReadiness();
  }

  function requirementState(fieldId) {
    const view = state.fieldViews.get(fieldId);
    if (!view) return { missing: true, reason: "Pole nie jest dostępne w formularzu." };
    const control = view.control;
    if (view.answerSelect) {
      const answer = view.answerSelect.value;
      if (answer === "yes") return { missing: false };
      if (answer === "no") {
        return { missing: true, blocked: true, reason: "Warunek nie został spełniony." };
      }
      if (answer === "unknown") {
        return { missing: true, reason: "Warunek wymaga potwierdzenia." };
      }
      return { missing: true, reason: "Wybierz odpowiedź." };
    }
    if (String(control.type).toLowerCase() === "checkbox") {
      return control.checked
        ? { missing: false }
        : { missing: true, reason: "Wymagane jest potwierdzenie." };
    }
    const value = control.value == null ? "" : String(control.value).trim();
    if (value === "") return { missing: true, reason: "Uzupełnij pole." };
    if (String(control.type).toLowerCase() === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return {
          missing: true,
          blocked: true,
          reason: "Podaj prawidłową liczbę.",
        };
      }
      const validDomain = NON_NEGATIVE_REQUIRED_FIELDS.has(fieldId)
        ? numeric >= 0
        : numeric > 0;
      if (!validDomain) {
        return {
          missing: true,
          blocked: true,
          reason: NON_NEGATIVE_REQUIRED_FIELDS.has(fieldId)
            ? "Wartość nie może być ujemna."
            : "Wartość musi być większa od 0.",
        };
      }
    }
    return { missing: false };
  }

  function focusField(fieldId) {
    if (fieldId === DZM_QUALITY_GROUP_FOCUS_ID && state.dzmQualityGroup) {
      const { group, confirmAll, details } = state.dzmQualityGroup;
      const answerSummary = dzmQualityAnswerSummary();
      const firstProblemId =
        answerSummary.noCount || answerSummary.unknownCount
          ? DZM_QUALITY_FIELDS.find((qualityFieldId) => {
              const view = state.fieldViews.get(qualityFieldId);
              return (
                view &&
                view.answerSelect &&
                ["no", "unknown"].includes(view.answerSelect.value)
              );
            })
          : "";
      const problemView = firstProblemId
        ? state.fieldViews.get(firstProblemId)
        : null;
      const target = problemView?.answerSelect || confirmAll;
      if (problemView) details.open = true;
      try {
        group.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
      return;
    }
    const view = state.fieldViews.get(fieldId);
    if (!view) return;
    const target = view.answerSelect || view.control;
    const details = view.wrapper.closest("details");
    if (details) details.open = true;
    try {
      view.wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    } catch (_) {
      target.focus();
    }
  }

  function fieldValue(fieldId) {
    const control = documentRef.getElementById(fieldId);
    return control && control.value != null ? String(control.value).trim() : "";
  }

  function fieldNumber(fieldId) {
    const value = fieldValue(fieldId);
    if (value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function semanticBlock(code, message, fieldId, outcome) {
    return {
      ok: false,
      outcome: outcome || null,
      blockers: [
        {
          code: code || "FORMULA_NOT_READY",
          fieldId: fieldId || "",
          message:
            message ||
            "Podane dane nie spełniają warunków wybranego obliczenia.",
        },
      ],
      limitations: [],
    };
  }

  function engineFieldToControl(field) {
    const fields = {
      ageYears: "age",
      heightValue: "height",
      creatinineValue: "Scr",
      creatinineUnit: "ScrUnit",
      creatinineStandardization: "ScrAssay",
      cystatinCValue: "CystatinC",
      cystatinCStandardization: "CystatinCStandardization",
      "sampling.sameSession": "ktvSameSession",
      "sampling.preBeforeDialysis": "ktvPreBeforeDialysis",
      "sampling.preNoSalineHeparinDilution": "ktvPreNoDilution",
      "sampling.postMethod": "ktvPostMethod",
      sessionsPerWeek: "ktvSessionsPerWeek",
      pidiDays: "ktvPidiDays",
      durationMinutes: "ktvDurationMinutes",
      netUfLiters: "ktvUF",
      postWeightKg: "ktvW",
      ureaAnalyte: "ktvUreaAnalyte",
      ureaUnit: "ktvUreaUnit",
      preUrea: "UreaPre",
      postUrea: "UreaPost",
    };
    return fields[field] || "";
  }

  function currentClinicalContext() {
    const clinical = global.ClcrClinicalSafety;
    const age =
      clinical && typeof clinical.readAgeFromDocument === "function"
        ? clinical.readAgeFromDocument(documentRef)
        : null;
    const markerPolicy =
      clinical && typeof clinical.creatininePolicy === "function"
        ? clinical.creatininePolicy(
            fieldValue("creatinineState") || "unknown",
            Boolean(documentRef.getElementById("suspectedAKI")?.checked),
          )
        : {
            calculationAllowed: true,
            categoryAllowed: false,
            status: "unknown",
            message: "",
          };
    return {
      clinical,
      age,
      markerPolicy,
      population: {
        termStatus: fieldValue("neonatalTermStatus"),
        bodyWeightKg: fieldValue("weight"),
        scrAssay: fieldValue("ScrAssay"),
      },
    };
  }

  function currentExtendedEgfrInput(age) {
    return {
      ageYears: age && age.valid ? age.exactYears : null,
      sex: fieldValue("sex"),
      heightValue: fieldNumber("height"),
      heightUnit: "cm",
      creatinineValue: fieldNumber("Scr"),
      creatinineUnit:
        fieldValue("ScrUnit") === "umol" ? "umol/L" : "mg/dL",
      creatinineStandardization: [
        "enzymatic_idms",
        "jaffe_idms",
      ].includes(fieldValue("ScrAssay"))
        ? "IDMS"
        : "",
      cystatinCValue: fieldNumber("CystatinC"),
      cystatinCUnit: "mg/L",
      cystatinCStandardization: fieldValue("CystatinCStandardization"),
    };
  }

  function currentKtvInput(age) {
    const kruControl = documentRef.getElementById("ktvKru");
    const kruValue =
      kruControl && !kruControl.classList.contains("error")
        ? fieldNumber("ktvKru")
        : null;
    return {
      ageYears: age && age.valid ? age.years : null,
      ageMonths: age && age.valid ? age.months : null,
      modality: fieldValue("ktvModality"),
      sessionsPerWeek: fieldNumber("ktvSessionsPerWeek"),
      pidiDays: fieldValue("ktvPidiDays"),
      preUrea: fieldNumber("UreaPre"),
      postUrea: fieldNumber("UreaPost"),
      ureaAnalyte: fieldValue("ktvUreaAnalyte"),
      ureaUnit: fieldValue("ktvUreaUnit"),
      durationMinutes: fieldNumber("ktvDurationMinutes"),
      netUfLiters: fieldNumber("ktvUF"),
      postWeightKg: fieldNumber("ktvW"),
      accessType: fieldValue("ktvAccessType") || "unknown",
      kruValue,
      kruUnit: "mL/min/1.73m²",
      kruMeasuredAt: fieldValue("ktvKruMeasuredAt"),
      evaluationDate:
        global.ClcrDialysisSafety &&
        typeof global.ClcrDialysisSafety.localIsoDate === "function"
          ? global.ClcrDialysisSafety.localIsoDate(new Date())
          : null,
      treatmentsDeliveredReliably: Boolean(
        documentRef.getElementById("ktvTreatmentsDelivered")?.checked,
      ),
      sampling: {
        sameSession: Boolean(
          documentRef.getElementById("ktvSameSession")?.checked,
        ),
        preBeforeDialysis: Boolean(
          documentRef.getElementById("ktvPreBeforeDialysis")?.checked,
        ),
        preNoSalineHeparinDilution: Boolean(
          documentRef.getElementById("ktvPreNoDilution")?.checked,
        ),
        postMethod: fieldValue("ktvPostMethod"),
      },
    };
  }

  function evaluateFormulaOutcome(formula) {
    if (!formula) {
      return semanticBlock(
        "FORMULA_MISSING",
        "Wybierz obliczenie.",
        "",
      );
    }
    const { clinical, age, markerPolicy, population } =
      currentClinicalContext();
    if (
      clinical &&
      typeof clinical.formulaSafety === "function"
    ) {
      const safety = clinical.formulaSafety(
        formula.id,
        age,
        markerPolicy,
        population,
      );
      if (!safety.eligible) {
        return semanticBlock(
          "FORMULA_INELIGIBLE",
          safety.reason,
          safety.reason && /AKI|zmieniając/i.test(safety.reason)
            ? "creatinineState"
            : "age",
          safety,
        );
      }
    }
    if (
      typeof global.canComputeFormula === "function" &&
      !global.canComputeFormula(formula.id)
    ) {
      return semanticBlock(
        "FORMULA_DOMAIN_INVALID",
        "Co najmniej jedna wymagana wartość jest poza dziedziną wybranego wzoru. Sprawdź wskazane dane i jednostki.",
        "",
      );
    }

    let outcome = null;
    const extended = global.ClcrExtendedEgfr;
    if (
      ["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(
        formula.id,
      ) &&
      extended
    ) {
      const method = {
        egfr_cr_cys: "computeCkdEpi2021CrCys",
        ckid_u25_cys: "computeCkidU25Cys",
        ckid_u25_cr_cys: "computeCkidU25CrCys",
      }[formula.id];
      outcome =
        typeof extended[method] === "function"
          ? extended[method](currentExtendedEgfrInput(age))
          : null;
      if (!outcome || !outcome.ok) {
        return semanticBlock(
          outcome?.code || "EXTENDED_EGFR_INVALID",
          outcome?.error || "Nie można obliczyć wybranego eGFR.",
          engineFieldToControl(outcome?.field),
          outcome,
        );
      }
    } else if (
      formula.id === "TMP_GFR" &&
      clinical &&
      typeof clinical.computeTmpGfr === "function"
    ) {
      outcome = clinical.computeTmpGfr({
        ageYears: age && age.valid ? age.exactYears : null,
        sampleKind: fieldValue("spotSampleKind"),
        pairedSameTime: Boolean(
          documentRef.getElementById("tmpPairedSameTime")?.checked,
        ),
        overnightFasting: Boolean(
          documentRef.getElementById("tmpOvernightFasting")?.checked,
        ),
        serumPhosphate: fieldNumber("S_PO4_spot"),
        serumPhosphateUnit: fieldValue("S_PO4_spot_unit"),
        urinePhosphate: fieldNumber("U_PO4_spot"),
        urinePhosphateUnit: fieldValue("U_PO4_spot_unit"),
        serumCreatinine: fieldNumber("Scr_spot"),
        serumCreatinineUnit: fieldValue("Scr_spot_unit"),
        urineCreatinine: fieldNumber("Ucr_spot"),
        urineCreatinineUnit: fieldValue("Ucr_spot_unit"),
      });
      if (!outcome || !outcome.ok) {
        return semanticBlock(
          "TMP_GFR_INVALID",
          outcome?.error || "Nie można obliczyć TmP/GFR.",
          "spotSampleKind",
          outcome,
        );
      }
    } else if (
      formula.id === "KTV" &&
      global.ClcrDialysisSafety &&
      typeof global.ClcrDialysisSafety.computeDialysisAdequacy === "function"
    ) {
      outcome = global.ClcrDialysisSafety.computeDialysisAdequacy(
        currentKtvInput(age),
      );
      if (!outcome || !outcome.ok) {
        const error = outcome?.messages?.errors?.[0];
        return semanticBlock(
          error?.code || "KTV_INVALID",
          error?.message || "Nie można obliczyć spKt/Vurea.",
          engineFieldToControl(error?.field),
          outcome,
        );
      }
    } else if (
      formula.id === "cl24" &&
      clinical &&
      typeof clinical.computeTimedCreatinineClearance === "function"
    ) {
      const weight = fieldNumber("weight");
      const height = fieldNumber("height");
      let bsa = null;
      if (age && age.valid && age.exactYears < 18 && extended) {
        const bsaResult = extended.computeHaycockBsa({
          ageYears: age.exactYears,
          heightValue: height,
          heightUnit: "cm",
          weightValue: weight,
          weightUnit: "kg",
        });
        bsa = bsaResult && bsaResult.ok ? bsaResult.value : null;
      } else if (weight > 0 && height > 0) {
        bsa =
          0.007184 *
          Math.pow(weight, 0.425) *
          Math.pow(height, 0.725);
      }
      const scr = fieldNumber("Scr");
      outcome = clinical.computeTimedCreatinineClearance({
        urineCreatinineMgDl: fieldNumber("Ucr"),
        serumCreatinineMgDl:
          fieldValue("ScrUnit") === "umol" && scr !== null
            ? scr / 88.4
            : scr,
        volumeMl: fieldNumber("V24"),
        collectionStartAt: fieldValue("collectionStartAt"),
        collectionEndAt: fieldValue("collectionEndAt"),
        serumSampleAt: fieldValue("serumSampleAt"),
        bsaM2: bsa,
        weightKg: weight,
        protocol: {
          startVoidDiscarded: Boolean(
            documentRef.getElementById(
              "collectionStartVoidDiscarded",
            )?.checked,
          ),
          finalVoidIncluded: Boolean(
            documentRef.getElementById(
              "collectionFinalVoidIncluded",
            )?.checked,
          ),
          noMissedVoids: Boolean(
            documentRef.getElementById("collectionNoMissedVoids")?.checked,
          ),
          noSpillage: Boolean(
            documentRef.getElementById("collectionNoSpillage")?.checked,
          ),
          noExtraVoids: Boolean(
            documentRef.getElementById("collectionNoExtraVoids")?.checked,
          ),
          storageFollowed: Boolean(
            documentRef.getElementById("collectionStorageFollowed")?.checked,
          ),
          serumSampleDuringCollection: Boolean(
            documentRef.getElementById(
              "serumSampleDuringCollection",
            )?.checked,
          ),
        },
      });
      if (!outcome || !outcome.ok) {
        return semanticBlock(
          "TIMED_CLEARANCE_INVALID",
          outcome?.error || "Nie można obliczyć klirensu czasowego.",
          "collectionStartAt",
          outcome,
        );
      }
    } else if (TIMED_VALUE_FORMULAS.has(formula.id)) {
      const duration =
        typeof global.readClcrCollectionDurationMinutes === "function"
          ? global.readClcrCollectionDurationMinutes()
          : (() => {
              const start = Date.parse(fieldValue("collectionStartAt"));
              const end = Date.parse(fieldValue("collectionEndAt"));
              return Number.isFinite(start) &&
                Number.isFinite(end) &&
                end > start
                ? (end - start) / 60000
                : null;
            })();
      if (!(duration > 0)) {
        return semanticBlock(
          "COLLECTION_TIME_INVALID",
          "Koniec zbiórki musi przypadać po jej początku. Sprawdź obie daty i godziny.",
          "collectionEndAt",
        );
      }
      outcome = { ok: true, durationMinutes: duration };
    }

    const limitations = [];
    if (
      CREATININE_VALUE_FORMULAS.has(formula.id) &&
      markerPolicy &&
      markerPolicy.status === "unknown"
    ) {
      limitations.push(
        "Nie potwierdzono stabilności markerów filtracji; liczba może zostać pokazana bez pełnej kategorii klinicznej.",
      );
    }
    if (
      ["egfr", "ckid_u25", "sch_idms"].includes(formula.id) &&
      !["enzymatic_idms", "jaffe_idms"].includes(fieldValue("ScrAssay"))
    ) {
      limitations.push(
        "Nie potwierdzono standaryzacji kreatyniny do IDMS; wynik liczbowy pozostaje bez pełnej interpretacji.",
      );
    }
    if (
      ["ACR", "PCR"].includes(formula.id) &&
      fieldValue("spotSampleKind") &&
      fieldValue("spotSampleKind") !== "firstMorning"
    ) {
      limitations.push(
        "Wynik liczbowy jest możliwy, ale do pełnej interpretacji ACR/PCR preferowany jest pierwszy poranny mocz.",
      );
    }
    if (
      formula.id === "KTV" &&
      !documentRef.getElementById("ktvTreatmentsDelivered")?.checked
    ) {
      limitations.push(
        "Surowy wynik spKt/V jest możliwy, ale interpretacja progowa wymaga potwierdzenia regularnej realizacji ocenianego schematu.",
      );
    }
    return { ok: true, outcome, blockers: [], limitations };
  }

  function getFormulaReadiness(formulaId = state.activeFormulaId) {
    if (state.legacyBroad) {
      return {
        formulaId: formulaId || "",
        status: "unsupported",
        valueReady: true,
        missingFieldIds: [],
        blockers: [],
        interpretationReady: false,
        outcome: null,
      };
    }
    const formula = formulaById(formulaId);
    if (!formula || formula.id !== state.activeFormulaId) {
      return {
        formulaId: formulaId || "",
        status: "unsupported",
        valueReady: false,
        missingFieldIds: [],
        blockers: [],
        interpretationReady: false,
        outcome: null,
      };
    }
    const missing = [];
    let hasBlockedProtocol = false;
    state.requiredFieldIds.forEach((fieldId) => {
      const result = requirementState(fieldId);
      if (!result.missing) return;
      if (result.blocked) hasBlockedProtocol = true;
      const view = state.fieldViews.get(fieldId);
      missing.push({
        fieldId,
        label: view ? view.labelText : fieldId,
        reason: result.reason,
      });
    });
    const activeErrors = Array.from(state.requiredFieldIds).filter((fieldId) => {
      const control = documentRef.getElementById(fieldId);
      return control && control.classList.contains("error");
    });
    if (activeErrors.length) {
      return {
        formulaId: formula.id,
        status: "blocked",
        valueReady: false,
        missingFieldIds: missing.map((entry) => entry.fieldId),
        missing,
        activeErrors,
        hasBlockedProtocol,
        blockers: activeErrors.map((fieldId) => ({
          code: "FIELD_INVALID",
          fieldId,
          message: "Pole zawiera wartość poza dozwolonym zakresem.",
        })),
        interpretationReady: false,
        outcome: null,
      };
    }
    if (missing.length) {
      return {
        formulaId: formula.id,
        status: "missing",
        valueReady: false,
        missingFieldIds: missing.map((entry) => entry.fieldId),
        missing,
        activeErrors: [],
        hasBlockedProtocol,
        blockers: [],
        interpretationReady: false,
        outcome: null,
      };
    }
    const semantic = evaluateFormulaOutcome(formula);
    if (!semantic.ok) {
      return {
        formulaId: formula.id,
        status: "blocked",
        valueReady: false,
        missingFieldIds: [],
        missing: [],
        activeErrors: [],
        hasBlockedProtocol: true,
        blockers: semantic.blockers,
        interpretationReady: false,
        outcome: semantic.outcome,
      };
    }
    const interpretationStates = Array.from(state.interpretationFieldIds).map(
      (fieldId) => {
        const view = state.fieldViews.get(fieldId);
        return {
          fieldId,
          view,
          result: interpretationControlState(
            view && view.control,
            view && view.answerSelect ? view.answerSelect.value : null,
          ),
        };
      },
    );
    const interpretationMissing = interpretationStates
      .filter(({ result }) => result.state === "missing")
      .map(({ fieldId }) => fieldId);
    const interpretationNegative = interpretationStates
      .filter(({ result }) => result.state === "negative")
      .map(({ fieldId, view }) => ({
        fieldId,
        message:
          INTERPRETATION_NEGATIVE_MESSAGES[fieldId] ||
          `Warunek „${view ? view.labelText : fieldId}” nie został spełniony; wynik liczbowy pozostaje bez pełnej interpretacji.`,
      }));
    const interpretationErrors = Array.from(
      state.interpretationFieldIds,
    ).filter((fieldId) =>
      documentRef.getElementById(fieldId)?.classList.contains("error"),
    );
    const checkedOptionalFields = Array.from(state.optionalFieldIds).filter(
      (fieldId) => {
        const control = documentRef.getElementById(fieldId);
        return (
          control &&
          String(control.type).toLowerCase() === "checkbox" &&
          control.checked
        );
      },
    );
    const confounderLimitations = activeConfounderLimitations(
      state.optionalFieldIds,
      checkedOptionalFields,
    );
    const limitations = [
      ...semantic.limitations,
      ...interpretationNegative.map(({ message }) => message),
      ...confounderLimitations.map(({ message }) => message),
    ];
    if (interpretationErrors.length) {
      limitations.push(
        "Co najmniej jedno pole kontekstowe zawiera nieprawidłową wartość; nie blokuje to liczby, ale ogranicza interpretację.",
      );
    }
    const uniqueLimitations = [...new Set(limitations)];
    return {
      formulaId: formula.id,
      status: "ready",
      valueReady: true,
      missingFieldIds: [],
      missing: [],
      activeErrors: [],
      hasBlockedProtocol: false,
      blockers: [],
      interpretationReady:
        !interpretationMissing.length &&
        !interpretationErrors.length &&
        !uniqueLimitations.length,
      interpretationMissingFieldIds: interpretationMissing,
      interpretationNegativeFieldIds: interpretationNegative.map(
        ({ fieldId }) => fieldId,
      ),
      interpretationErrors,
      limitations: uniqueLimitations,
      outcome: semantic.outcome,
    };
  }

  function appendReadinessList(entries) {
    if (!entries.length) return;
    const list = createElement("ul", "clcr-missing-list");
    entries.forEach((entry) => {
      const item = createElement("li");
      const fieldId = entry.fieldId || "";
      const isDzmQualityGroup = fieldId === DZM_QUALITY_GROUP_FOCUS_ID;
      const view = fieldId && !isDzmQualityGroup
        ? state.fieldViews.get(fieldId)
        : null;
      const label = entry.label || (view ? view.labelText : fieldId);
      const text = entry.reason
        ? `${label} — ${entry.reason}`
        : entry.message || label;
      if (fieldId && (view || isDzmQualityGroup)) {
        const button = createElement("button", "clcr-missing-link", text);
        button.type = "button";
        button.addEventListener("click", () => focusField(fieldId));
        item.appendChild(button);
      } else {
        item.textContent = text;
      }
      list.appendChild(item);
    });
    state.readiness.appendChild(list);
  }

  function compactReadinessEntries(entries) {
    const source = Array.isArray(entries) ? entries : [];
    const qualityEntries = source.filter((entry) =>
      DZM_QUALITY_FIELDS.includes(entry.fieldId),
    );
    if (!qualityEntries.length) return source;
    const firstIndex = source.findIndex((entry) =>
      DZM_QUALITY_FIELDS.includes(entry.fieldId),
    );
    const answerSummary = dzmQualityAnswerSummary();
    const reason = answerSummary.noCount
      ? "co najmniej jeden warunek nie został spełniony."
      : answerSummary.unknownCount
        ? "kompletności zbiórki nie można potwierdzić."
        : "potwierdź wszystkie 6 warunków jednym kliknięciem albo uzupełnij szczegóły.";
    const compacted = source.filter(
      (entry) => !DZM_QUALITY_FIELDS.includes(entry.fieldId),
    );
    compacted.splice(Math.min(firstIndex, compacted.length), 0, {
      fieldId: DZM_QUALITY_GROUP_FOCUS_ID,
      label: "Jakość czasowej lub dobowej zbiórki moczu",
      reason,
    });
    return compacted;
  }

  function renderReadiness() {
    if (!state.readiness) return;
    state.readiness.replaceChildren();
    if (state.legacyBroad) {
      documentRef.documentElement.dataset.clcrReady = "true";
      state.readiness.className = "clcr-readiness clcr-readiness--neutral";
      state.readiness.append(
        createElement(
          "p",
          "",
          "Tryb zgodności testowej: wybierz konkretną formułę, aby zobaczyć listę wymaganych danych.",
        ),
      );
      return;
    }
    const formula = formulaById(state.activeFormulaId);
    if (!formula) {
      documentRef.documentElement.dataset.clcrReady = "false";
      state.readiness.className = "clcr-readiness clcr-readiness--neutral";
      state.readiness.append(
        createElement(
          "p",
          "",
          "Wybierz obliczenie z listy poniżej albo znajdź je w wyszukiwarce.",
        ),
      );
      return;
    }
    const readiness = getFormulaReadiness(formula.id);
    documentRef.documentElement.dataset.clcrReady = String(
      readiness.valueReady,
    );
    if (readiness.status === "missing") {
      state.readiness.className = `clcr-readiness ${
        readiness.hasBlockedProtocol
          ? "clcr-readiness--error"
          : "clcr-readiness--incomplete"
      }`;
      state.readiness.append(
        createElement(
          "strong",
          "",
          readiness.hasBlockedProtocol
            ? "Nie można obliczyć: warunek protokołu nie został spełniony."
            : `Do obliczenia „${formula.label}” brakuje:`,
        ),
      );
      appendReadinessList(compactReadinessEntries(readiness.missing));
      return;
    }
    if (readiness.status === "blocked") {
      state.readiness.className = "clcr-readiness clcr-readiness--error";
      state.readiness.append(
        createElement(
          "strong",
          "",
          "Nie można obliczyć dla podanych danych:",
        ),
      );
      appendReadinessList(readiness.blockers);
      return;
    }
    if (!readiness.interpretationReady) {
      state.readiness.className = "clcr-readiness clcr-readiness--warning";
      state.readiness.append(
        createElement(
          "p",
          "",
          "Dane wystarczają do wyniku liczbowego. Pełna interpretacja jest ograniczona.",
        ),
      );
      const warnings = readiness.limitations.map((message) => ({ message }));
      if (readiness.interpretationMissingFieldIds.length) {
        warnings.push({
          message: "Uzupełnij pola oznaczone „Do pełnej interpretacji”, jeżeli dane są dostępne.",
        });
      }
      appendReadinessList(warnings);
      return;
    }
    state.readiness.className = "clcr-readiness clcr-readiness--ready";
    state.readiness.append(
      createElement(
        "p",
        "",
        "Komplet danych do obliczenia i dostępnej pełnej interpretacji.",
      ),
    );
  }

  let readinessFrame = 0;
  function scheduleReadiness() {
    if (readinessFrame) global.cancelAnimationFrame(readinessFrame);
    readinessFrame = global.requestAnimationFrame(() => {
      readinessFrame = 0;
      renderReadiness();
    });
  }

  function renderActiveHeading(formula, legacy) {
    if (!state.activePanel) return;
    state.activePanel.replaceChildren();
    const eyebrow = createElement(
      "span",
      "clcr-active-panel__eyebrow",
      legacy ? "Tryb zgodności" : "Aktywne obliczenie",
    );
    const heading = createElement(
      "h2",
      "clcr-active-panel__title",
      formula ? formula.label : "Najpierw wybierz formułę",
    );
    state.activePanel.append(eyebrow, heading);
    if (formula && formula.note) {
      state.activePanel.append(
        createElement("p", "clcr-active-panel__note", formula.note),
      );
    }
  }

  function renderModules() {
    if (!state.moduleGrid) return;
    state.moduleGrid.replaceChildren();
    const available = getAvailableModules(state.level);
    const grouped = new Map();
    available.forEach((module) => {
      const group = module.level === "spot" ? "spot" : module.level;
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(module);
    });
    const groupNames = {
      basic: "Obliczenia podstawowe",
      advanced: "Obliczenia zaawansowane",
      pro: "Obliczenia profesjonalne",
      spot: "Obliczenia z próbki moczu",
    };
    ["basic", "advanced", "pro", "spot"].forEach((groupId) => {
      const modules = grouped.get(groupId);
      if (!modules || !modules.length) return;
      const section = createElement("section", "clcr-module-section");
      section.dataset.level = groupId;
      section.appendChild(createElement("h3", "clcr-module-section__title", groupNames[groupId]));
      const grid = createElement("div", "clcr-module-grid");
      modules.forEach((module) => {
        const card = createElement("article", "clcr-module-card");
        card.dataset.moduleId = module.id;
        if (module.formulaIds.includes(state.activeFormulaId)) {
          card.classList.add("is-active");
        }
        card.append(
          createElement("h4", "clcr-module-card__title", module.title),
          createElement("p", "clcr-module-card__description", module.description),
        );
        const variants = createElement("div", "clcr-module-card__variants");
        if (module.formulaIds.length === 1) {
          const formulaId = module.formulaIds[0];
          const button = createElement("button", "clcr-formula-choice", "Wybierz");
          button.type = "button";
          button.dataset.formulaId = formulaId;
          button.setAttribute(
            "aria-pressed",
            String(state.activeFormulaId === formulaId),
          );
          button.addEventListener("click", () => selectFormula(formulaId));
          variants.appendChild(button);
        } else {
          const select = createElement("select", "clcr-module-variant-select");
          select.setAttribute("aria-label", `Wariant: ${module.title}`);
          const placeholder = createElement(
            "option",
            "",
            `Wybierz wariant (${module.formulaIds.length})`,
          );
          placeholder.value = "";
          select.appendChild(placeholder);
          module.formulaIds.forEach((formulaId) => {
            const formula = formulaById(formulaId);
            if (!formula) return;
            const option = createElement("option", "", formula.label);
            option.value = formulaId;
            option.selected = state.activeFormulaId === formulaId;
            select.appendChild(option);
          });
          const openButton = createElement(
            "button",
            "clcr-formula-choice",
            "Otwórz obliczenie",
          );
          openButton.type = "button";
          openButton.disabled = !select.value;
          select.addEventListener("change", () => {
            openButton.disabled = !select.value;
          });
          openButton.addEventListener("click", () => {
            if (select.value) selectFormula(select.value);
          });
          variants.append(select, openButton);
        }
        card.appendChild(variants);
        grid.appendChild(card);
      });
      section.appendChild(grid);
      state.moduleGrid.appendChild(section);
    });
  }

  function setLevelSelection(level) {
    documentRef.querySelectorAll(".version-option[data-version]").forEach((option) => {
      const selected = option.dataset.version === level;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    global.currentVersion = level;
  }

  function chooseLevel(level) {
    if (!["basic", "advanced", "pro", "spot"].includes(level)) return false;
    state.legacyBroad = false;
    state.mobileModulesExpanded = true;
    documentRef.documentElement.classList.add("clcr-mobile-modules-expanded");
    documentRef.documentElement.classList.remove("clcr-legacy-broad");
    state.level = level;
    const module = getModuleForFormula(state.activeFormulaId);
    if (!module || !levelAllows(level, module.level)) {
      state.activeFormulaId = "";
      const picker = documentRef.getElementById("formulaPicker");
      if (picker) picker.value = "";
    }
    setLevelSelection(level);
    renderModules();
    renderActiveFields();
    return true;
  }

  function applyVersion(level) {
    if (!["basic", "advanced", "pro", "spot"].includes(level)) return false;
    state.level = level;
    const picker = documentRef.getElementById("formulaPicker");
    const selectedFormula = picker ? picker.value : "";
    state.legacyBroad =
      !selectedFormula && global.__CLCR_TEST_LEGACY_BROAD === true;
    state.activeFormulaId = selectedFormula;
    setLevelSelection(level);
    if (level !== "pro") {
      const ktvToggle = documentRef.getElementById("ktvToggle");
      if (ktvToggle && ktvToggle.checked) {
        ktvToggle.checked = false;
        ktvToggle.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    renderModules();
    if (state.legacyBroad) renderLegacyBroad(level);
    else renderActiveFields();
    return true;
  }

  function ensurePickerOption(formula) {
    const picker = documentRef.getElementById("formulaPicker");
    if (!picker || !formula) return;
    if (!Array.from(picker.options).some((option) => option.value === formula.id)) {
      const option = createElement("option", "", formula.label);
      option.value = formula.id;
      picker.appendChild(option);
    }
  }

  function selectFormula(formulaId) {
    const formula = formulaById(formulaId);
    const module = getModuleForFormula(formulaId);
    if (!formula || !module || HISTORICAL_FORMULA_IDS.includes(formulaId)) return false;
    state.legacyBroad = false;
    state.mobileModulesExpanded = false;
    documentRef.documentElement.classList.remove("clcr-mobile-modules-expanded");
    state.activeFormulaId = formulaId;
    state.level = module.path === "spot" ? "spot" : module.level;
    setLevelSelection(state.level);
    ensurePickerOption(formula);
    renderModules();
    renderActiveFields();
    const picker = documentRef.getElementById("formulaPicker");
    if (picker) picker.value = formulaId;
    if (typeof global.selectClcrFormula === "function") {
      global.selectClcrFormula(formulaId);
    } else if (picker) {
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    }
    global.setTimeout(() => {
      state.legacyBroad = false;
      state.activeFormulaId = formulaId;
      renderModules();
      renderActiveFields();
    }, 0);
    return true;
  }

  function renderSearchResults(query) {
    const live = documentRef.getElementById("formulaLive");
    if (!live) return;
    live.replaceChildren();
    const results = formulaSearch(query, global.FORMULAS);
    if (!String(query || "").trim()) {
      documentRef.documentElement.classList.remove("clcr-search-open");
      live.hidden = true;
      live.style.display = "none";
      return;
    }
    documentRef.documentElement.classList.add("clcr-search-open");
    live.hidden = false;
    live.style.display = "";
    live.setAttribute("role", "listbox");
    if (!results.length) {
      live.appendChild(
        createElement(
          "p",
          "clcr-search-empty",
          "Nie znaleziono formuły. Spróbuj nazwy, skrótu, analitu albo materiału.",
        ),
      );
      return;
    }
    results.slice(0, 12).forEach(({ formula, module }) => {
      const button = createElement("button", "clcr-search-result");
      button.type = "button";
      button.dataset.formulaId = formula.id;
      button.setAttribute("role", "option");
      const name = createElement("strong", "clcr-search-result__name", formula.label);
      const meta = createElement(
        "span",
        "clcr-search-result__meta",
        `${module.title} · ${
          module.path === "spot"
            ? "Próbka moczu"
            : module.level === "basic"
              ? "Podstawowy"
              : module.level === "advanced"
                ? "Zaawansowany"
                : "Profesjonalny"
        }`,
      );
      button.append(name, meta);
      button.addEventListener("click", () => {
        selectFormula(formula.id);
        const search = documentRef.getElementById("formulaSearch");
        if (search) search.value = formula.label;
        documentRef.documentElement.classList.remove("clcr-search-open");
        live.hidden = true;
        live.style.display = "none";
      });
      live.appendChild(button);
    });
  }

  function buildShell(form) {
    const container = form.parentNode;
    const shell = createElement("section", "clcr-workflow");
    shell.id = "clcrWorkflow";
    shell.setAttribute("aria-label", "Wybór obliczenia");
    shell.append(
      createElement("span", "clcr-workflow__eyebrow", "Kalkulator nerkowy"),
      createElement("h1", "clcr-workflow__title", "Co chcesz obliczyć?"),
      createElement(
        "p",
        "clcr-workflow__lead",
        "Znajdź formułę albo wybierz poziom. Formularz pokaże tylko dane potrzebne do bieżącego obliczenia.",
      ),
    );
    const searchBox = createElement("div", "clcr-search");
    const searchLabel = createElement(
      "label",
      "clcr-search__label",
      "Szukaj formuły do obliczenia",
    );
    const search = documentRef.getElementById("formulaSearch");
    const live = documentRef.getElementById("formulaLive");
    if (search) {
      search.type = "search";
      search.placeholder = "Np. ACR, Schwartz, wapń, KT/V…";
      search.setAttribute("autocomplete", "off");
      search.setAttribute("form", "none");
      search.removeAttribute("style");
      searchLabel.setAttribute("for", search.id);
      searchBox.append(searchLabel, search);
      search.addEventListener("input", () => renderSearchResults(search.value));
      search.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          search.value = "";
          renderSearchResults("");
        }
        if (event.key === "ArrowDown") {
          const first = live && live.querySelector(".clcr-search-result");
          if (first) {
            event.preventDefault();
            first.focus();
          }
        }
      });
    }
    if (live) {
      live.removeAttribute("style");
      live.hidden = true;
      searchBox.appendChild(live);
    }
    shell.appendChild(searchBox);

    const levelHeading = createElement(
      "h2",
      "clcr-workflow__section-title",
      "Wybierz poziom zaawansowania",
    );
    shell.appendChild(levelHeading);
    const versions = documentRef.getElementById("versionContainer");
    if (versions) {
      versions.querySelector(".center-text")?.remove();
      versions.setAttribute("role", "group");
      versions.setAttribute("aria-label", "Poziom zaawansowania kalkulatora");
      versions.querySelectorAll(".version-option[data-version]").forEach((option) => {
        option.setAttribute("role", "button");
        option.tabIndex = 0;
        option.setAttribute("aria-pressed", "false");
        const activate = () => chooseLevel(option.dataset.version);
        option.addEventListener("click", activate);
        option.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          }
        });
      });
      const spotOption = versions.querySelector(
        '.version-option[data-version="spot"]',
      );
      let spotPath = null;
      if (spotOption) {
        spotPath = createElement("div", "clcr-spot-path");
        spotPath.setAttribute("role", "group");
        spotPath.setAttribute("aria-label", "Osobna ścieżka próbki moczu");
        const spotHeading = createElement(
          "h2",
          "clcr-workflow__section-title clcr-workflow__section-title--spot",
          "Albo wybierz obliczenie z próbki moczu",
        );
        spotOption.classList.add("clcr-spot-path__option");
        spotPath.append(spotHeading, spotOption);
      }
      shell.appendChild(versions);
      if (spotPath) shell.appendChild(spotPath);
    }

    const moduleGrid = createElement("div", "clcr-modules");
    moduleGrid.id = "clcrModuleGrid";
    shell.appendChild(moduleGrid);
    state.moduleGrid = moduleGrid;
    const moduleToggle = createElement(
      "button",
      "clcr-mobile-module-toggle",
      "Zmień obliczenie",
    );
    moduleToggle.type = "button";
    moduleToggle.addEventListener("click", () => {
      state.mobileModulesExpanded = !state.mobileModulesExpanded;
      documentRef.documentElement.classList.toggle(
        "clcr-mobile-modules-expanded",
        state.mobileModulesExpanded,
      );
      moduleToggle.textContent = state.mobileModulesExpanded
        ? "Ukryj obliczenia"
        : "Zmień obliczenie";
    });
    shell.appendChild(moduleToggle);
    state.moduleToggle = moduleToggle;

    const utilities = createElement("div", "clcr-workflow__utilities");
    const samePatient = documentRef.getElementById("samePatientMode");
    if (samePatient && samePatient.closest("label")) {
      const sameLabel = samePatient.closest("label");
      sameLabel.removeAttribute("style");
      sameLabel.classList.add("clcr-same-patient");
      utilities.appendChild(sameLabel);
    }
    const legacy = documentRef.getElementById("legacyFormulaHistory");
    if (legacy) utilities.appendChild(legacy);
    form.insertBefore(utilities, form.firstChild);

    const picker = documentRef.getElementById("formulaPicker");
    if (picker) {
      picker.classList.add("clcr-canonical-picker");
      picker.tabIndex = -1;
      picker.setAttribute("aria-hidden", "true");
      shell.appendChild(picker);
    }
    const pickerWrap = documentRef.getElementById("formulaPickerWrap");
    if (pickerWrap) pickerWrap.style.display = "none";

    const note = documentRef.getElementById("formulaNote");
    if (note) {
      note.removeAttribute("style");
      note.classList.add("clcr-workflow__formula-note");
      shell.appendChild(note);
    }
    container.insertBefore(shell, form);
    state.shell = shell;

    const activePanel = createElement("section", "clcr-active-panel");
    activePanel.id = "clcrActivePanel";
    const readiness = createElement("div", "clcr-readiness");
    readiness.id = "clcrReadiness";
    readiness.setAttribute("aria-live", "polite");
    form.insertBefore(readiness, form.firstChild);
    form.insertBefore(activePanel, readiness);
    state.activePanel = activePanel;
    state.readiness = readiness;
  }

  function initFields(form) {
    form
      .querySelectorAll("input[id], select[id], textarea[id]")
      .forEach((control) => {
        if (
          [
            "formulaSearch",
            "formulaPicker",
            "samePatientMode",
            "U_ACR",
            "U_PCR",
          ].includes(control.id)
        ) {
          if (["U_ACR", "U_PCR"].includes(control.id)) {
            const view = decorateField(control);
            if (view) view.wrapper.hidden = true;
          }
          return;
        }
        decorateField(control);
      });
    state.fieldViews.forEach((view) => {
      view.wrapper.hidden = true;
    });
  }

  function syncFromPicker() {
    const picker = documentRef.getElementById("formulaPicker");
    const formula = picker ? formulaById(picker.value) : null;
    if (!formula) return;
    const module = getModuleForFormula(formula.id);
    if (!module) return;
    state.legacyBroad = false;
    state.activeFormulaId = formula.id;
    state.level = module.path === "spot" ? "spot" : module.level;
    setLevelSelection(state.level);
    renderModules();
    renderActiveFields();
  }

  function init() {
    const form = documentRef.getElementById("clcrForm");
    if (!form || documentRef.documentElement.dataset.clcrWorkflowUi !== "1") return;
    buildShell(form);
    initFields(form);
    groupUnitPairs();

    const picker = documentRef.getElementById("formulaPicker");
    if (picker) picker.addEventListener("change", () => global.setTimeout(syncFromPicker, 0));
    form.addEventListener("input", scheduleReadiness, true);
    form.addEventListener("change", scheduleReadiness, true);
    documentRef.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllHelp(null);
    });
    const clear = documentRef.getElementById("clearBtn");
    if (clear) {
      clear.addEventListener("click", () => {
        global.setTimeout(() => {
          state.activeFormulaId = "";
          state.legacyBroad = false;
          const search = documentRef.getElementById("formulaSearch");
          if (search) search.value = "";
          renderModules();
          renderActiveFields();
        }, 0);
      });
    }

    chooseLevel("basic");
    global.setTimeout(syncFromPicker, 50);
    global.setTimeout(syncFromPicker, 900);
    documentRef.documentElement.classList.add("clcr-workflow-ready");
  }

  const Workflow = {
    version: "1.1.0",
    model: Model,
    state,
    selectLevel: chooseLevel,
    selectFormula,
    search: (query) => formulaSearch(query, global.FORMULAS),
    refresh: syncFromPicker,
    getFormulaReadiness,
    hasBlockingValidationError() {
      return Array.from(state.requiredFieldIds).some((fieldId) => {
        const control = documentRef.getElementById(fieldId);
        return Boolean(control && control.classList.contains("error"));
      });
    },
  };

  global.ClcrUiWorkflow = Workflow;
  global.getClcrFormulaReadiness = getFormulaReadiness;
  global.applyVersion = applyVersion;
  global.setVersion = applyVersion;

  if (documentRef.readyState === "loading") {
    documentRef.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);

/* ————————————————————————————————————————————————————————————————
 * Faza 1 — ClcrVisitSave: zapis aktywnego wyniku klirensu do karty pacjenta.
 * Czyta datapointy z tagów silnika (data-clcr-series / data-clcr-value —
 * warstwa prezentacji, bez wpływu na liczenie), mapuje przez słownik
 * ClcrUiModel.PARAM_DICTIONARY i zapisuje przez VildaVault.savePatientNote
 * jako notatki kategorii „wynik-klirens" grupowane po wspólnej dacie wizyty.
 * Bramka: aktywne tylko przy odblokowanym sejfie + wczytanym pacjencie;
 * gość liczy bez zmian, zapis nieaktywny. Serie wieloczłonowe (białko DZM,
 * KT/V) to osobne tagi → osobne datapointy (decyzja ①).
 * ———————————————————————————————————————————————————————————————— */
(function (global) {
  "use strict";

  const doc = global.document;
  const CATEGORY = "wynik-klirens";
  const state = { patientId: null, patientName: "" };

  function vault() {
    return global.VildaVault && typeof global.VildaVault === "object"
      ? global.VildaVault
      : null;
  }

  function vaultUnlocked() {
    const v = vault();
    try {
      return !!(v && typeof v.isUnlocked === "function" && v.isUnlocked());
    } catch (e) {
      return false;
    }
  }

  function model() {
    return global.ClcrUiModel && typeof global.ClcrUiModel === "object"
      ? global.ClcrUiModel
      : null;
  }

  function resolveCurrentPatientId() {
    return typeof state.patientId === "string" && state.patientId
      ? state.patientId
      : null;
  }

  function isVisible(el) {
    if (!el) return false;
    if (typeof el.getClientRects === "function") {
      try {
        return el.getClientRects().length > 0;
      } catch (e) {
        /* fall through */
      }
    }
    let node = el;
    while (node) {
      if (node.hidden) return false;
      if (node.style && node.style.display === "none") return false;
      node = node.parentElement || null;
    }
    return true;
  }

  function toNumber(raw) {
    if (raw == null) return NaN;
    const s = String(raw).trim();
    if (s === "") return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  // Mapuje pojedynczy tag (id serii + surowa wartość) na datapoint wg słownika.
  function mapDatapoint(series, rawValue) {
    const m = model();
    if (!m || typeof m.getParam !== "function") return null;
    const entry = m.getParam(series);
    if (!entry) return null;
    const valueNum = toNumber(rawValue);
    if (!Number.isFinite(valueNum)) return null;
    return {
      id: entry.id,
      testKey: entry.testKey,
      label: entry.label,
      unit: entry.unit,
      group: entry.group,
      sourceFormulaId: entry.sourceFormulaId,
      valueNum: valueNum,
    };
  }

  // Zbiór formuł-źródeł do zapisu = formuły AKTYWNEGO MODUŁU (wybór lekarza).
  // Dzięki temu zapis obejmuje:
  //  • pojedynczą wybraną formułę (np. eGFR dorośli → tylko egfr),
  //  • cały panel wielo-formułowy (np. DZM → wszystkie analitów tego modułu),
  // a WYKLUCZA porównania z innych modułów, które silnik dokłada obok
  // (np. wybór CKiD U25 u 20-latka renderuje też egfr/cg — panel porównawczy).
  function moduleFormulaSet(formulaId) {
    if (typeof formulaId !== "string" || !formulaId) return null;
    const m = model();
    const mod =
      m && typeof m.getModuleForFormula === "function"
        ? m.getModuleForFormula(formulaId)
        : null;
    if (mod && Array.isArray(mod.formulaIds) && mod.formulaIds.length) {
      return new Set(mod.formulaIds);
    }
    return new Set([formulaId]);
  }

  function resolveTargetFormulaSet(options) {
    const opts = options || {};
    if (Array.isArray(opts.formulaIds)) return new Set(opts.formulaIds);
    if (typeof opts.formulaId === "string" && opts.formulaId) {
      return moduleFormulaSet(opts.formulaId);
    }
    const wf = global.ClcrUiWorkflow;
    const activeId =
      wf && wf.state && typeof wf.state.activeFormulaId === "string"
        ? wf.state.activeFormulaId
        : "";
    // Brak wybranej formuły (tryb broad/testowy) → brak filtra (zbierz wszystko).
    return activeId ? moduleFormulaSet(activeId) : null;
  }

  // Zbiera WIDOCZNE, otagowane wyniki (po jednym na serię), ograniczone do
  // formuł aktywnego modułu (chyba że nie wybrano formuły — wtedy wszystko).
  function collectActiveDatapoints(root, options) {
    const scope = root || doc;
    if (!scope || typeof scope.querySelectorAll !== "function") return [];
    const target = resolveTargetFormulaSet(options);
    const seen = new Set();
    const out = [];
    const nodes = scope.querySelectorAll("[data-clcr-series]");
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      if (!isVisible(el)) continue;
      const series = el.getAttribute("data-clcr-series");
      if (!series || seen.has(series)) continue;
      const dp = mapDatapoint(series, el.getAttribute("data-clcr-value"));
      if (!dp) continue;
      if (target && !target.has(dp.sourceFormulaId)) continue;
      seen.add(series);
      out.push(dp);
    }
    return out;
  }

  function formatValueString(n) {
    if (!Number.isFinite(n)) return "";
    if (Number.isInteger(n)) return String(n);
    return String(Number(n.toFixed(3)));
  }

  function pad2(v) {
    return String(v).padStart(2, "0");
  }

  function todayISO(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function normalizeDateISO(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return /^(\d{4})-(\d{1,2})-(\d{1,2})$/.test(trimmed) ? trimmed : null;
  }

  // Zapis: jedna notatka na datapoint, wspólna data = jedna wizyta.
  async function saveActiveResultToCard(opts) {
    const options = opts || {};
    const v = vault();
    if (!vaultUnlocked() || !v || typeof v.savePatientNote !== "function") {
      return { ok: false, reason: "locked", saved: 0, total: 0, errors: [] };
    }
    const patientId = options.patientId || resolveCurrentPatientId();
    if (!patientId) {
      return { ok: false, reason: "no-patient", saved: 0, total: 0, errors: [] };
    }
    const clinicalDateISO = normalizeDateISO(options.clinicalDateISO) || todayISO();
    const datapoints = Array.isArray(options.datapoints)
      ? options.datapoints
      : collectActiveDatapoints(options.root, options);
    if (!datapoints.length) {
      return { ok: false, reason: "no-data", saved: 0, total: 0, errors: [] };
    }
    let saved = 0;
    const errors = [];
    for (let i = 0; i < datapoints.length; i += 1) {
      const dp = datapoints[i];
      try {
        await v.savePatientNote({
          patientId: patientId,
          category: CATEGORY,
          clinicalDateISO: clinicalDateISO,
          title: dp.label,
          body: "Kalkulator klirensu · " + dp.testKey,
          labResult: {
            test: dp.label,
            value: formatValueString(dp.valueNum),
            valueNum: dp.valueNum,
            unit: dp.unit,
          },
        });
        saved += 1;
      } catch (e) {
        errors.push({
          testKey: dp.testKey,
          message: e && e.message ? e.message : String(e),
        });
      }
    }
    return {
      ok: errors.length === 0 && saved > 0,
      reason: errors.length ? "partial" : "ok",
      saved: saved,
      total: datapoints.length,
      errors: errors,
      clinicalDateISO: clinicalDateISO,
    };
  }

  function seriesWord(n) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs === 1) return "seria";
    if (last >= 2 && last <= 4 && (abs < 12 || abs > 14)) return "serie";
    return "serii";
  }

  // ————————————————————————— Faza 2: odczyt serii + trend —————————————————
  // Grupujemy datowane notatki wynik-klirens po PELNEJ etykiecie labResult.test
  // (obejście §2). NIE używamy wbudowanego listPatientLabSeries (jego slug Ur
  // bierze tekst przed „(" i skleja różne serie). Ograniczamy do parametrów
  // aktywnego modułu — tak jak zapis.
  function buildSeriesFromNotes(notes, options) {
    const list = Array.isArray(notes) ? notes : [];
    const target = resolveTargetFormulaSet(options);
    const m = model();
    const byLabel = new Map();
    for (let i = 0; i < list.length; i += 1) {
      const note = list[i];
      if (!note || note.category !== CATEGORY) continue;
      const lab = note.labResult;
      if (!lab || typeof lab.test !== "string" || !lab.test) continue;
      const valueNum =
        typeof lab.valueNum === "number" && isFinite(lab.valueNum)
          ? lab.valueNum
          : toNumber(lab.value);
      if (!Number.isFinite(valueNum)) continue;
      const label = lab.test;
      const entry =
        m && typeof m.getParamByLabel === "function"
          ? m.getParamByLabel(label)
          : null;
      const sourceFormulaId = entry ? entry.sourceFormulaId : null;
      if (target && (!sourceFormulaId || !target.has(sourceFormulaId))) continue;
      const dateISO =
        normalizeDateISO(note.clinicalDateISO) ||
        (typeof note.clinicalDateISO === "string"
          ? note.clinicalDateISO.slice(0, 10)
          : "");
      if (!byLabel.has(label)) {
        byLabel.set(label, {
          label: label,
          unit: (lab.unit || (entry ? entry.unit : "") || "").trim(),
          id: entry ? entry.id : null,
          group: entry ? entry.group : null,
          sourceFormulaId: sourceFormulaId,
          points: [],
        });
      }
      byLabel.get(label).points.push({
        dateISO: dateISO,
        valueNum: valueNum,
        noteId: note.id || null,
      });
    }
    const series = Array.from(byLabel.values());
    series.forEach((s) => {
      s.points.sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));
    });
    return series;
  }

  async function readActiveSeries(patientId, options) {
    const v = vault();
    const pid = patientId || resolveCurrentPatientId();
    if (
      !pid ||
      !vaultUnlocked() ||
      !v ||
      typeof v.listPatientNotesForPatient !== "function"
    ) {
      return [];
    }
    let notes;
    try {
      notes = await v.listPatientNotesForPatient(pid);
    } catch (e) {
      return [];
    }
    return buildSeriesFromNotes(notes, options);
  }

  // Trend KIERUNKOWY, neutralny: strzałka pokazuje kierunek, kolor NIE ocenia
  // „dobrze/źle" (dla eGFR wzrost korzystny, dla wydalania wapnia odwrotnie).
  function seriesTrend(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const latest = points[points.length - 1];
    const prev = points[points.length - 2];
    const delta = latest.valueNum - prev.valueNum;
    const eps = 1e-9;
    const direction = delta > eps ? "up" : delta < -eps ? "down" : "flat";
    return {
      direction: direction,
      prev: prev.valueNum,
      latest: latest.valueNum,
      delta: delta,
    };
  }

  const TREND_ARROW = { up: "↑", down: "↓", flat: "→" };

  function readPatientName() {
    if (!doc) return "";
    const el = doc.getElementById("patientName");
    return el && el.textContent ? el.textContent.trim() : "";
  }

  // ————————————————————————— UI (wstrzykiwane, nie w statycznym HTML) —————————
  let ui = null;
  let refreshQueued = false;

  function setStatus(message, kind) {
    if (!ui || !ui.status) return;
    ui.status.textContent = message || "";
    ui.status.className = "cvs-status" + (kind ? " cvs-" + kind : "");
  }

  function buildUI() {
    if (!doc || ui) return;
    const anchor =
      doc.getElementById("stoneCard") ||
      doc.getElementById("elecCard") ||
      doc.getElementById("results");
    if (!anchor || !anchor.parentNode) return;
    const card = doc.createElement("section");
    card.className = "card clcr-visit-save";
    card.id = "clcrVisitSaveCard";
    card.hidden = true;
    card.innerHTML =
      '<h2 class="text-center">Zapisz wynik do karty pacjenta</h2>' +
      '<div class="cvs-row">' +
      '<label class="cvs-date" for="clcrVisitDate">Data wizyty' +
      '<input type="date" id="clcrVisitDate" name="clcrVisitDate"></label>' +
      '<button type="button" id="clcrVisitSaveBtn" class="cvs-btn">Zapisz wynik do karty</button>' +
      "</div>" +
      '<p class="cvs-hint" id="clcrVisitHint"></p>' +
      '<p class="cvs-status" id="clcrVisitStatus" role="status" aria-live="polite"></p>';
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    ui = {
      card: card,
      date: card.querySelector("#clcrVisitDate"),
      btn: card.querySelector("#clcrVisitSaveBtn"),
      hint: card.querySelector("#clcrVisitHint"),
      status: card.querySelector("#clcrVisitStatus"),
    };
    if (ui.date) ui.date.value = todayISO();
    if (ui.btn) ui.btn.addEventListener("click", onSaveClick);
    refresh();
  }

  function refresh() {
    if (!ui) return;
    const datapoints = collectActiveDatapoints();
    if (!datapoints.length) {
      ui.card.hidden = true;
      return;
    }
    ui.card.hidden = false;
    const unlocked = vaultUnlocked();
    const patientId = resolveCurrentPatientId();
    const ready = unlocked && !!patientId;
    if (ui.btn) ui.btn.disabled = !ready;
    if (!ui.hint) return;
    if (!unlocked) {
      ui.hint.textContent =
        "Zaloguj się do sejfu, aby zapisać wynik do karty. Liczenie działa bez logowania.";
    } else if (!patientId) {
      ui.hint.textContent =
        "Wczytaj pacjenta, aby zapisać wynik do jego karty.";
    } else {
      const cnt = datapoints.length;
      const name = state.patientName || readPatientName();
      ui.hint.textContent =
        "Do zapisania: " +
        cnt +
        " " +
        seriesWord(cnt) +
        (name ? " · pacjent: " + name : "");
    }
  }

  function scheduleRefresh() {
    if (refreshQueued || !ui) return;
    refreshQueued = true;
    const run = function () {
      refreshQueued = false;
      refresh();
    };
    if (typeof global.requestAnimationFrame === "function") {
      global.requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  async function onSaveClick() {
    if (!ui || !ui.btn || ui.btn.disabled) return;
    ui.btn.disabled = true;
    setStatus("Zapisywanie…", "pending");
    let res;
    try {
      res = await saveActiveResultToCard({
        clinicalDateISO: ui.date ? ui.date.value : null,
      });
    } catch (e) {
      res = { ok: false, reason: "error", saved: 0, total: 0, errors: [e] };
    }
    if (res.ok) {
      setStatus(
        "✓ Zapisano do karty (" +
          res.saved +
          " " +
          seriesWord(res.saved) +
          ", " +
          res.clinicalDateISO +
          ").",
        "ok",
      );
    } else if (res.reason === "no-patient") {
      setStatus("Nie wczytano pacjenta — zapis niemożliwy.", "err");
    } else if (res.reason === "locked") {
      setStatus("Sejf zablokowany — zaloguj się, aby zapisać.", "err");
    } else if (res.reason === "no-data") {
      setStatus("Brak wyniku do zapisania.", "err");
    } else {
      setStatus(
        "Zapisano " +
          res.saved +
          "/" +
          res.total +
          "; niepowodzenia: " +
          res.errors.length +
          ".",
        "warn",
      );
    }
    refresh();
    scheduleHistoryRefresh();
  }

  // ————————————————————————— Faza 2: panel historii ———————————————————————
  let historyUi = null;
  let historyQueued = false;

  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch];
    });
  }

  function fmtNum(n) {
    return formatValueString(n);
  }

  function buildSparkline(points) {
    const w = 128;
    const h = 30;
    const pad = 4;
    const vals = points.map(function (p) {
      return p.valueNum;
    });
    const n = vals.length;
    if (!n) return "";
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = max - min || 1;
    const xAt = function (i) {
      return n === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1);
    };
    const yAt = function (v) {
      return h - pad - ((v - min) / span) * (h - 2 * pad);
    };
    if (n === 1) {
      return (
        '<svg class="cvs-spark" width="' +
        w +
        '" height="' +
        h +
        '" viewBox="0 0 ' +
        w +
        " " +
        h +
        '" aria-hidden="true"><circle cx="' +
        xAt(0).toFixed(1) +
        '" cy="' +
        yAt(vals[0]).toFixed(1) +
        '" r="2.6"/></svg>'
      );
    }
    const d = vals
      .map(function (v, i) {
        return (i ? "L" : "M") + xAt(i).toFixed(1) + " " + yAt(v).toFixed(1);
      })
      .join(" ");
    return (
      '<svg class="cvs-spark" width="' +
      w +
      '" height="' +
      h +
      '" viewBox="0 0 ' +
      w +
      " " +
      h +
      '" aria-hidden="true"><path d="' +
      d +
      '" fill="none" stroke-width="1.6"/><circle cx="' +
      xAt(n - 1).toFixed(1) +
      '" cy="' +
      yAt(vals[n - 1]).toFixed(1) +
      '" r="2.6"/></svg>'
    );
  }

  function renderHistory(series) {
    if (!historyUi) return;
    const withData = (series || []).filter(function (s) {
      return s.points && s.points.length;
    });
    if (!withData.length) {
      historyUi.card.hidden = true;
      historyUi.body.innerHTML = "";
      return;
    }
    historyUi.card.hidden = false;
    historyUi.body.innerHTML = withData
      .map(function (s) {
        const pts = s.points;
        const trend = seriesTrend(pts);
        const unit = s.unit ? " " + s.unit : "";
        const trendLine = trend
          ? '<span class="cvs-trend cvs-trend-' +
            trend.direction +
            '">' +
            TREND_ARROW[trend.direction] +
            " vs. poprzednio (" +
            escapeHtml(fmtNum(trend.prev)) +
            " → " +
            escapeHtml(fmtNum(trend.latest)) +
            escapeHtml(unit) +
            ")</span>"
          : '<span class="cvs-trend cvs-trend-flat">pojedynczy pomiar</span>';
        const dots = pts
          .map(function (p) {
            return (
              '<li><span class="cvs-date">' +
              escapeHtml(p.dateISO || "—") +
              '</span><span class="cvs-num">' +
              escapeHtml(fmtNum(p.valueNum)) +
              escapeHtml(unit) +
              "</span></li>"
            );
          })
          .join("");
        return (
          '<div class="cvs-hist-item"><div class="cvs-hist-head"><span class="cvs-hist-label">Historia — ' +
          escapeHtml(s.label) +
          "</span>" +
          buildSparkline(pts) +
          "</div>" +
          trendLine +
          '<ul class="cvs-hist-points">' +
          dots +
          "</ul></div>"
        );
      })
      .join("");
  }

  function buildHistoryUI() {
    if (!doc || historyUi) return;
    const anchor =
      doc.getElementById("clcrVisitSaveCard") ||
      doc.getElementById("stoneCard") ||
      doc.getElementById("results");
    if (!anchor || !anchor.parentNode) return;
    const card = doc.createElement("section");
    card.className = "card clcr-visit-history";
    card.id = "clcrHistoryCard";
    card.hidden = true;
    card.innerHTML =
      '<h2 class="text-center">Historia wyników</h2>' +
      '<div class="cvs-hist-body" id="clcrHistoryBody"></div>';
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    historyUi = { card: card, body: card.querySelector("#clcrHistoryBody") };
  }

  async function refreshActiveHistory() {
    if (!historyUi) return;
    if (!vaultUnlocked() || !resolveCurrentPatientId()) {
      historyUi.card.hidden = true;
      historyUi.body.innerHTML = "";
      return;
    }
    const series = await readActiveSeries();
    renderHistory(series);
  }

  function scheduleHistoryRefresh() {
    if (historyQueued || !historyUi) return;
    historyQueued = true;
    const run = function () {
      historyQueued = false;
      refreshActiveHistory();
    };
    if (typeof global.requestAnimationFrame === "function") {
      global.requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function observeResults() {
    if (!doc || typeof global.MutationObserver !== "function") return;
    const ids = [
      "results",
      "clcrInfo",
      "elecInfo",
      "stoneInfo",
      "ktvResult",
      "ektvResult",
      "urrResult",
    ];
    const obs = new global.MutationObserver(function () {
      scheduleRefresh();
      scheduleHistoryRefresh();
    });
    for (let i = 0; i < ids.length; i += 1) {
      const el = doc.getElementById(ids[i]);
      if (el) {
        obs.observe(el, { childList: true, subtree: true, attributes: true });
      }
    }
  }

  function onPatientLoaded(event) {
    const detail = event && event.detail ? event.detail : null;
    const id = detail && detail.patientId;
    if (typeof id === "string" && id) {
      state.patientId = id;
      state.patientName =
        (detail && typeof detail.patientName === "string"
          ? detail.patientName
          : "") || readPatientName();
    }
    refresh();
    scheduleHistoryRefresh();
  }

  function init() {
    buildUI();
    buildHistoryUI();
    observeResults();
    if (doc) {
      doc.addEventListener("vilda:patient-loaded", onPatientLoaded);
      if (global.addEventListener) {
        global.addEventListener("focus", scheduleRefresh);
      }
    }
  }

  const api = {
    vaultUnlocked: vaultUnlocked,
    resolveCurrentPatientId: resolveCurrentPatientId,
    collectActiveDatapoints: collectActiveDatapoints,
    mapDatapoint: mapDatapoint,
    saveActiveResultToCard: saveActiveResultToCard,
    buildSeriesFromNotes: buildSeriesFromNotes,
    readActiveSeries: readActiveSeries,
    seriesTrend: seriesTrend,
    refreshActiveHistory: refreshActiveHistory,
    formatValueString: formatValueString,
    todayISO: todayISO,
    normalizeDateISO: normalizeDateISO,
    seriesWord: seriesWord,
    // testowe / introspekcja
    _setPatientId: function (id) {
      state.patientId = typeof id === "string" && id ? id : null;
    },
    _refresh: refresh,
  };

  global.ClcrVisitSave = api;

  if (doc && typeof doc.addEventListener === "function") {
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
