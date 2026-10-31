// Shared saved-result contract. Extracted from clcr_ui_workflow.js at 6d73f6e.
// Reads the recorded visit only: no DOM, vault, current patient, clock or clinical engine.
(function (root, factory) {
  const api = factory(root || {});
  if (root) root.ClcrSavedResults = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (global) {
  "use strict";
  const CATEGORY = "wynik-klirens";
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
    // Białko DZM: jeden nowy pomiar; dawne przeliczenia zachowane jako serie historyczne.
    { id: "Prot_mg24", group: "dzm-protein", label: "Białko całkowite w DZM", unit: "mg/24 h", sourceFormulaId: "Prot_mgkg" },
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

  PARAM_BY_LABEL.set("Białko w DZM [mg/24 h]", PARAM_BY_KEY.get("Prot_mg24"));

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


  function model() { return { getParamByLabel }; }
  function resolveTargetFormulaSet(options) {
    const opts = options || {};
    if (opts.allParams) return null;
    if (Array.isArray(opts.formulaIds)) return new Set(opts.formulaIds);
    return typeof opts.formulaId === "string" && opts.formulaId ? new Set([opts.formulaId]) : null;
  }
  function formatValueString(n) {
    if (!Number.isFinite(n)) return "";
    return (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))).replace(".", ",");
  }
  function normalizeDateISO(value) {
    const parts = typeof value === "string" ? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim()) : null;
    if (!parts) return null;
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
    return `${parts[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const text = typeof value === "string" ? value.trim().replace(",", ".") : "";
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) ? Number(text) : NaN;
  }
  function legacyToNumber(raw) {
    if (raw == null) return NaN;
    const value = String(raw).trim();
    if (value === "") return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }
  function legacyNormalizeDateISO(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return /^(\d{4})-(\d{1,2})-(\d{1,2})$/.test(trimmed) ? trimmed : null;
  }
  function readAcrSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 40000) return null;
    try {
      const snapshot = JSON.parse(encoded);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
      if (snapshot.schema !== "clcr-acr" || snapshot.version !== 1) return null;
      if (!Number.isFinite(snapshot.rawValue) || snapshot.rawValue < 0) return null;
      if (!["mg/g", "mg/mmol"].includes(snapshot.unit)) return null;
      if (!["", "=", "<", ">", "≤", "≥"].includes(snapshot.comparator || "")) return null;
      if (!["within", "above", "unassessed"].includes(snapshot.status)) return null;
      return snapshot;
    } catch (_) { return null; }
  }

  function acrDisplayText(snapshot) {
    const value = snapshot?.display?.value;
    const numeric = value == null ? formatValueString(snapshot?.rawValue) : String(value);
    return ((snapshot?.comparator === "=" ? "" : snapshot?.comparator || "") + numeric).replace(".", ",");
  }

  const ACR_NOTE_HEADER = "ACR — ocena w chwili zapisu:";

  function acrReferenceNote(datapoint) {
    const snapshot = datapoint?.acrSnapshot;
    if (datapoint?.sourceFormulaId !== "ACR" || !snapshot) return "";
    const number = value => Number.isFinite(value) ? String(value).replace(".", ",") : "";
    const string = value => typeof value === "string" ? value.trim() : "";
    const comparator = snapshot.comparator === "=" ? "" : snapshot.comparator || "";
    const lines = [ACR_NOTE_HEADER,
      `Tryb: ${snapshot.mode === "direct" ? "wynik ACR z laboratorium" : "obliczono ze stężeń"}.`,
      `Wynik przed zaokrągleniem: ${comparator}${number(snapshot.rawValue)} ${snapshot.unit}.`,
      `Wynik pokazany: ${datapoint.displayValue || acrDisplayText(snapshot)} ${snapshot.unit}.`,
      `Ocena: ${{ within: "w zakresie", above: "powyżej normy", unassessed: "nie oceniono" }[snapshot.status] || "nie oceniono"}.`,
      `Kategoria: ${snapshot.category || "nie nadano"}${snapshot.categoryDescription ? ` — ${snapshot.categoryDescription}` : ""}.`,
    ];
    if (datapoint.norm) lines.push(`Norma pokazana przy wyniku: ${datapoint.norm}.`);
    if (string(snapshot.display?.boundary || snapshot.boundary)) lines.push(`Granica przed zaokrągleniem: ${snapshot.display?.boundary || snapshot.boundary}.`);
    if (string(snapshot.statusText)) lines.push(snapshot.statusText);
    if (string(snapshot.qualification?.note)) lines.push(snapshot.qualification.note);
    const age = snapshot.context?.ageYears;
    lines.push(Number.isFinite(age) ? `Wiek użyty przy ocenie: ${number(age)} lat.` : "Wiek użyty przy ocenie: nieznany.");
    const input = snapshot.input || {};
    if (snapshot.mode === "direct") {
      lines.push(`Wynik wpisany z laboratorium: ${String(input.reportedValue ?? "")} ${string(input.reportedUnit) || snapshot.unit}.`);
    } else {
      if (input.albuminValue != null) lines.push(`Albumina w moczu: ${String(input.albuminValue).replace(".", ",")} ${string(input.albuminUnit)}.`);
      if (input.creatinineValue != null) lines.push(`Kreatynina w moczu: ${String(input.creatinineValue).replace(".", ",")} ${string(input.creatinineUnit)}.`);
      lines.push(snapshot.context?.sameSpecimen === "confirmed"
        ? "Potwierdzono, że oznaczenia pochodzą z tej samej próbki moczu."
        : "Założono, że oznaczenia pochodzą z tej samej próbki moczu.");
    }
    const sample = { firstMorning: "pierwszy poranny mocz", secondMorning: "drugi poranny mocz", random: "próbka losowa", timed: "próbka ze zbiórki czasowej" }[snapshot.context?.sampleType];
    lines.push(`Rodzaj próbki: ${sample || "nie podano"}.`);
    const knownFactors = { menstruation: "miesiączka", hematuria: "krwiomocz", infection: "infekcja", exercise: "intensywny wysiłek", acuteIllness: "ostra choroba" };
    const factors = Array.isArray(snapshot.context?.confounders) ? snapshot.context.confounders : [];
    if (factors.length) lines.push(`Zgłoszone czynniki wpływające na ocenę: ${factors.map(key => knownFactors[key] || String(key)).join(", ")}.`);
    const source = snapshot.source || snapshot.reference?.source || {};
    if (string(source.label)) lines.push(`Źródło normy: ${source.label}${source.version ? `; ${source.version}` : ""}${source.accessedAt ? `; dostęp ${source.accessedAt}` : ""}.`);
    if (string(source.url)) lines.push(`Adres źródła: ${source.url}`);
    if (snapshot.profileId) lines.push(`Profil odniesienia: ${snapshot.profileId}; wersja ${snapshot.profileVersion ?? "niepodana"}.`);
    const population = typeof snapshot.population === "string" ? snapshot.population : snapshot.population?.label;
    if (string(population)) lines.push(`Populacja odniesienia: ${population}.`);
    lines.push("Pojedynczy wynik ACR nie ustala rozpoznania przewlekłej choroby nerek.");
    return lines.join("\n");
  }

  // Read only the original assessment from the saved, human-readable note.
  // Do not consult today's patient or reference data when building history.
  function savedAcrAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    const start = body.indexOf(ACR_NOTE_HEADER);
    if (start < 0 || body.length > 50000) return null;
    const text = body.slice(start);
    const raw = /^Wynik przed zaokrągleniem: ([<>≤≥]?)([\d.,eE+-]+) (mg\/g|mg\/mmol)\.$/m.exec(text);
    if (!raw) return null;
    const rawValue = Number(raw[2].replace(",", "."));
    if (!Number.isFinite(rawValue) || rawValue < 0) return null;
    const display = /^Wynik pokazany: (.+) (mg\/g|mg\/mmol)\.$/m.exec(text);
    const lab = note.labResult || {};
    const normalizeDisplay = value => String(value ?? "").replace(/\s+/g, "").replace(",", ".");
    // A clinician can edit the laboratory note later. Never let an unchanged
    // old snapshot replace that edited value or attach its original category.
    if (lab.unit && lab.unit !== raw[3]) return null;
    if (Number.isFinite(lab.valueNum) && lab.valueNum !== rawValue) return null;
    if (display && lab.value != null && normalizeDisplay(lab.value) !== normalizeDisplay(display[1])) return null;
    const category = /^Kategoria: (A[123])(?:\s|\.)/m.exec(text)?.[1] || null;
    const status = /^Ocena: (w zakresie|powyżej normy|nie oceniono)\.$/m.exec(text)?.[1];
    const age = /^Wiek użyty przy ocenie: ([\d.,]+) lat\.$/m.exec(text);
    const profile = /^Profil odniesienia: ([^;\n]+); wersja ([^\n]+)\.$/m.exec(text);
    return {
      rawValue, unit: raw[3], comparator: raw[1],
      displayValue: display ? display[1] : raw[1] + raw[2], category,
      status: status === "w zakresie" ? "within" : status === "powyżej normy" ? "above" : "unassessed",
      ageYears: age ? Number(age[1].replace(",", ".")) : null,
      profileId: profile?.[1] || null, profileVersion: profile?.[2] || null,
      contextNote: text,
    };
  }

  function readPcrSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 40000) return null;
    try {
      const snapshot = JSON.parse(encoded);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
      if (snapshot.schema !== "clcr-pcr" || snapshot.version !== 1) return null;
      if (!Number.isFinite(snapshot.rawValue) || snapshot.rawValue < 0) return null;
      if (!["mg/g", "mg/mmol", "mg/mg", "g/g"].includes(snapshot.unit)) return null;
      if (!["", "<", ">", "≤", "≥"].includes(snapshot.comparator || "")) return null;
      if (!["within", "above", "unassessed"].includes(snapshot.status)) return null;
      return snapshot;
    } catch (_) { return null; }
  }

  const PCR_NOTE_HEADER = "PCR — ocena w chwili zapisu:";
  const PCR_LEVEL_LABELS = { normal: "poniżej progu", raised: "podwyższony", marked: "znacznie podwyższony", nephrotic: "zakres nerczycowy" };
  const PCR_COMPARISON_LABELS = { below: "poniżej progu", above: "próg osiągnięty lub przekroczony", ambiguous: "przedział obejmuje różne poziomy" };

  function pcrReferenceNote(datapoint) {
    const snapshot = datapoint?.pcrSnapshot;
    if (datapoint?.sourceFormulaId !== "PCR" || !snapshot) return "";
    const number = value => Number.isFinite(value) ? String(value).replace(".", ",") : "";
    const string = value => typeof value === "string" ? value.trim() : "";
    const comparator = snapshot.comparator || "";
    const lines = [PCR_NOTE_HEADER,
      `Tryb: ${snapshot.mode === "direct" ? "wynik PCR z laboratorium" : "obliczono ze stężeń"}.`,
      `Wynik przed zaokrągleniem: ${comparator}${number(snapshot.rawValue)} ${snapshot.unit}.`,
      `Wynik pokazany: ${datapoint.displayValue || acrDisplayText(snapshot)} ${snapshot.unit}.`,
      `Ocena: ${{ within: "w zakresie", above: "powyżej normy", unassessed: "nie oceniono" }[snapshot.status] || "nie oceniono"}.`,
      `Poziom PCR: ${PCR_LEVEL_LABELS[snapshot.category] || "nie nadano"}.`,
      `Porównanie z progiem: ${PCR_COMPARISON_LABELS[snapshot.comparison] || "nie wykonano"}.`,
    ];
    if (datapoint.norm) lines.push(`Norma pokazana przy wyniku: ${datapoint.norm}.`);
    if (string(snapshot.display?.boundary || snapshot.boundary)) lines.push(`Granica przed zaokrągleniem: ${String(snapshot.display?.boundary || snapshot.boundary).replace(".", ",")}.`);
    if (snapshot.classificationUnit) lines.push(`Oś porównania: ${snapshot.classificationUnit}${Number.isFinite(snapshot.classificationValue) ? `; wartość ${number(snapshot.classificationValue)}` : ""}.`);
    if (Number.isFinite(snapshot.reference?.nephroticThreshold)) lines.push(`Próg zakresu nerczycowego dla użytej grupy wieku: ≥${number(snapshot.reference.nephroticThreshold)} ${snapshot.unit}.`);
    const band = snapshot.reference?.band;
    if (band) lines.push(`Grupa wieku źródła: od ${number(band.minimumAgeYearsInclusive)} lat${Number.isFinite(band.maximumAgeYearsExclusive) ? ` do poniżej ${number(band.maximumAgeYearsExclusive)} lat` : ""}${band.populationLabel ? `; ${band.populationLabel}` : ""}.`);
    if (string(band?.agePolicy)) lines.push(`Dobór przedziału wieku: ${band.agePolicy}`);
    if (string(snapshot.statusText)) lines.push(snapshot.statusText);
    if (string(snapshot.qualification?.note)) lines.push(snapshot.qualification.note);
    const age = snapshot.context?.ageYears;
    lines.push(Number.isFinite(age) ? `Wiek użyty przy ocenie: ${number(age)} lat.` : "Wiek użyty przy ocenie: nieznany.");
    const input = snapshot.input || {};
    if (snapshot.mode === "direct") {
      lines.push(`Wynik wpisany z laboratorium: ${String(input.reportedValue ?? "")} ${string(input.reportedUnit) || snapshot.unit}.`);
    } else {
      if (input.proteinValue != null) lines.push(`Białko całkowite w moczu: ${String(input.proteinValue).replace(".", ",")} ${string(input.proteinUnit)}.`);
      if (input.creatinineValue != null) lines.push(`Kreatynina w moczu: ${String(input.creatinineValue).replace(".", ",")} ${string(input.creatinineUnit)}.`);
      lines.push(snapshot.context?.sameSpecimen === "confirmed"
        ? "Potwierdzono, że oznaczenia pochodzą z tej samej próbki moczu."
        : "Założono, że oznaczenia pochodzą z tej samej próbki moczu.");
    }
    const sample = { firstMorning: "pierwszy poranny mocz", secondMorning: "drugi poranny mocz", random: "próbka losowa", timed: "próbka ze zbiórki czasowej" }[snapshot.context?.sampleType];
    lines.push(`Rodzaj próbki: ${sample || "nie podano"}.`);
    const knownFactors = { menstruation: "miesiączka", hematuria: "krwiomocz", infection: "infekcja", exercise: "intensywny wysiłek", acuteIllness: "ostra choroba" };
    const factors = Array.isArray(snapshot.context?.confounders) ? snapshot.context.confounders : [];
    if (factors.length) lines.push(`Zgłoszone czynniki wpływające na ocenę: ${factors.map(key => knownFactors[key] || String(key)).join(", ")}.`);
    const source = snapshot.source || snapshot.reference?.source || {};
    if (string(source.label)) lines.push(`Źródło normy: ${source.label}${source.version ? `; ${source.version}` : ""}${source.accessedAt ? `; dostęp ${source.accessedAt}` : ""}.`);
    if (string(source.url)) lines.push(`Adres źródła: ${source.url}`);
    if (string(source.section)) lines.push(`Miejsce w źródle: ${source.section}.`);
    const nephroticSource = snapshot.reference?.nephroticSource;
    if (nephroticSource?.label) lines.push(`Źródło progu nerczycowego: ${nephroticSource.label}${nephroticSource.version ? `; ${nephroticSource.version}` : ""}.`);
    if (nephroticSource?.url) lines.push(`Adres źródła progu nerczycowego: ${nephroticSource.url}`);
    if (snapshot.profileId) lines.push(`Profil odniesienia: ${snapshot.profileId}; wersja ${snapshot.profileVersion ?? "niepodana"}.`);
    const population = typeof snapshot.population === "string" ? snapshot.population : snapshot.population?.label;
    if (string(population)) lines.push(`Populacja odniesienia: ${population}.`);
    lines.push("Pojedynczy wynik PCR nie ustala rozpoznania przewlekłej choroby nerek ani zespołu nerczycowego.");
    return lines.join("\n");
  }

  function savedPcrAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    const start = body.indexOf(PCR_NOTE_HEADER);
    if (start < 0 || body.length > 50000) return null;
    const text = body.slice(start);
    const raw = /^Wynik przed zaokrągleniem: ([<>≤≥]?)([\d.,eE+-]+) (mg\/g|mg\/mmol|mg\/mg|g\/g)\.$/m.exec(text);
    if (!raw) return null;
    const rawValue = Number(raw[2].replace(",", "."));
    if (!Number.isFinite(rawValue) || rawValue < 0) return null;
    const display = /^Wynik pokazany: (.+) (mg\/g|mg\/mmol|mg\/mg|g\/g)\.$/m.exec(text);
    const lab = note.labResult || {};
    const normalizeDisplay = value => String(value ?? "").replace(/\s+/g, "").replace(",", ".");
    if (lab.unit && lab.unit !== raw[3]) return null;
    if (Number.isFinite(lab.valueNum) && lab.valueNum !== rawValue) return null;
    if (display && lab.value != null && normalizeDisplay(lab.value) !== normalizeDisplay(display[1])) return null;
    const level = /^Poziom PCR: ([^\n]+)\.$/m.exec(text)?.[1];
    const savedNorm = /^Norma pokazana przy wyniku: ([^\n]+)\.$/m.exec(text)?.[1] || "";
    if (normalizeDisplay(lab.norm) !== normalizeDisplay(savedNorm)) return null;
    const category = Object.keys(PCR_LEVEL_LABELS).find(key => PCR_LEVEL_LABELS[key] === level) || null;
    const comparisonLabel = /^Porównanie z progiem: ([^\n]+)\.$/m.exec(text)?.[1];
    const comparison = Object.keys(PCR_COMPARISON_LABELS).find(key => PCR_COMPARISON_LABELS[key] === comparisonLabel) || null;
    const status = /^Ocena: (w zakresie|powyżej normy|nie oceniono)\.$/m.exec(text)?.[1];
    const age = /^Wiek użyty przy ocenie: ([\d.,]+) lat\.$/m.exec(text);
    const profile = /^Profil odniesienia: ([^;\n]+); wersja ([^\n]+)\.$/m.exec(text);
    return {
      rawValue, unit: raw[3], comparator: raw[1], displayValue: display ? display[1] : raw[1] + raw[2],
      category, comparison, status: status === "w zakresie" ? "within" : status === "powyżej normy" ? "above" : "unassessed",
      ageYears: age ? Number(age[1].replace(",", ".")) : null,
      profileId: profile?.[1] || null, profileVersion: profile?.[2] || null, contextNote: text,
    };
  }

  function readCacrSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 40000) return null;
    try {
      const snapshot = JSON.parse(encoded);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
      if (snapshot.schema !== "clcr-cacr" || snapshot.version !== 1) return null;
      if (!Number.isFinite(snapshot.rawValue) || snapshot.rawValue < 0) return null;
      if (!["mg/mg", "mg/g", "g/g", "mol/mol", "mmol/mmol", "mmol/mol", "mg/mmol"].includes(snapshot.unit)) return null;
      if (!["", "<", ">", "≤", "≥"].includes(snapshot.comparator || "")) return null;
      if (!["below", "within", "above", "unassessed"].includes(snapshot.status)) return null;
      return snapshot;
    } catch (_) { return null; }
  }

  const CACR_NOTE_HEADER = "Ca/Cr — ocena w chwili zapisu:";
  const CACR_ASSESSMENT_LABELS = { below: "poniżej normy", within: "w zakresie", above: "powyżej normy", unassessed: "nie oceniono" };
  const CACR_COMPARISON_LABELS = { below: "poniżej zakresu", within: "w zakresie", above: "powyżej zakresu", ambiguous: "przedział obejmuje różne poziomy" };

  function cacrReferenceNote(datapoint) {
    const snapshot = datapoint?.cacrSnapshot;
    if (datapoint?.sourceFormulaId !== "CaCr_spot" || !snapshot) return "";
    const number = value => Number.isFinite(value) ? String(value).replace(".", ",") : "";
    const string = value => typeof value === "string" ? value.trim() : "";
    const lines = [CACR_NOTE_HEADER,
      `Tryb: ${snapshot.mode === "direct" ? "wynik Ca/Cr z laboratorium" : "obliczono ze stężeń"}.`,
      `Wynik przed zaokrągleniem: ${snapshot.comparator || ""}${number(snapshot.rawValue)} ${snapshot.unit}.`,
      `Wynik pokazany: ${datapoint.displayValue || acrDisplayText(snapshot)} ${snapshot.unit}.`,
      `Ocena: ${CACR_ASSESSMENT_LABELS[snapshot.status] || "nie oceniono"}.`,
      `Kategoria Ca/Cr: ${CACR_COMPARISON_LABELS[snapshot.category] || "nie nadano"}.`,
      `Porównanie z zakresem: ${CACR_COMPARISON_LABELS[snapshot.comparison] || "nie wykonano"}.`,
    ];
    if (datapoint.norm) lines.push(`Norma pokazana przy wyniku: ${datapoint.norm}.`);
    if (string(snapshot.display?.boundary || snapshot.boundary)) lines.push(`Granica przed zaokrągleniem: ${String(snapshot.display?.boundary || snapshot.boundary).replace(/\./g, ",")}.`);
    const reference = snapshot.reference;
    if (reference) {
      if (Number.isFinite(reference.nativeLow) && Number.isFinite(reference.nativeHigh)) lines.push(`Zakres źródłowy: ${number(reference.nativeLow)}–${number(reference.nativeHigh)} mg/mg; obie granice należą do normy.`);
      if (Number.isFinite(reference.lower) && Number.isFinite(reference.upper)) lines.push(`Zakres w jednostce wyniku przed zaokrągleniem: ${number(reference.lower)}–${number(reference.upper)} ${snapshot.unit}.`);
      const band = reference.band;
      if (string(band?.label || band?.sourceAge || band?.populationLabel)) lines.push(`Grupa wieku źródła: ${band.label || band.sourceAge || band.populationLabel}.`);
      if (string(band?.agePolicy)) lines.push(`Dobór przedziału wieku: ${band.agePolicy}`);
    }
    if (Number.isFinite(snapshot.classificationValue)) lines.push(`Oś porównania: mg/mg; wartość ${number(snapshot.classificationValue)}.`);
    if (string(snapshot.statusText)) lines.push(snapshot.statusText);
    if (string(snapshot.qualification?.note)) lines.push(snapshot.qualification.note);
    const age = snapshot.context?.ageYears;
    lines.push(Number.isFinite(age) ? `Wiek użyty przy ocenie: ${number(age)} lat.` : "Wiek użyty przy ocenie: nieznany.");
    const input = snapshot.input || {};
    if (snapshot.mode === "direct") {
      lines.push(`Wynik wpisany z laboratorium: ${String(input.reportedValue ?? "")} ${string(input.reportedUnit) || snapshot.unit}.`);
    } else {
      if (input.calciumValue != null) lines.push(`Wapń w moczu: ${String(input.calciumValue).replace(".", ",")} ${string(input.calciumUnit)}.`);
      if (input.creatinineValue != null) lines.push(`Kreatynina w moczu: ${String(input.creatinineValue).replace(".", ",")} ${string(input.creatinineUnit)}.`);
      lines.push(snapshot.context?.sameSpecimen === "confirmed"
        ? "Potwierdzono, że oznaczenia pochodzą z tej samej próbki moczu."
        : "Założono, że oznaczenia pochodzą z tej samej próbki moczu.");
    }
    const sample = { firstMorning: "pierwszy poranny mocz", secondMorning: "drugi poranny mocz", random: "próbka losowa", timed: "próbka ze zbiórki czasowej" }[snapshot.context?.sampleType];
    lines.push(`Rodzaj próbki: ${sample || "nie podano"}.`);
    const knownFactors = { menstruation: "miesiączka", hematuria: "krwiomocz", infection: "infekcja", exercise: "intensywny wysiłek", acuteIllness: "ostra choroba", diureticUse: "leczenie diuretykiem", knownCKD: "przewlekła choroba nerek", gadolinium: "kontrast gadolinowy", thiazide: "tiazyd", thiazides: "tiazydy" };
    const factors = Array.isArray(snapshot.context?.confounders) ? snapshot.context.confounders : [];
    if (factors.length) lines.push(`Zgłoszone czynniki: ${factors.map(key => knownFactors[key] || String(key)).join(", ")}.`);
    const facts = snapshot.context?.knownFacts;
    if (facts && typeof facts === "object" && !Array.isArray(facts)) {
      for (const [key, value] of Object.entries(facts)) {
        if (typeof value === "boolean") lines.push(`Podana informacja — ${knownFactors[key] || key}: ${value ? "tak" : "nie"}.`);
        else if (value === null) lines.push(`Podana informacja — ${knownFactors[key] || key}: nie wiadomo.`);
        else if (typeof value === "string" && value.trim()) lines.push(`Podana informacja — ${knownFactors[key] || key}: ${value.trim()}.`);
      }
    }
    if (Array.isArray(facts)) {
      const reported = facts.filter(value => typeof value === "string" && value.trim());
      if (reported.length) lines.push(`Dodatkowe podane informacje: ${reported.map(key => knownFactors[key] || key).join(", ")}.`);
    }
    const source = snapshot.source || reference?.source || {};
    if (string(source.label)) lines.push(`Źródło normy: ${source.label}${source.version ? `; ${source.version}` : ""}${source.accessedAt ? `; dostęp ${source.accessedAt}` : ""}.`);
    if (string(source.url)) lines.push(`Adres źródła: ${source.url}`);
    if (string(source.section)) lines.push(`Miejsce w źródle: ${source.section}.`);
    if (snapshot.profileId) lines.push(`Profil odniesienia: ${snapshot.profileId}; wersja ${snapshot.profileVersion ?? "niepodana"}.`);
    const population = typeof snapshot.population === "string" ? snapshot.population : snapshot.population?.label;
    if (string(population)) lines.push(`Populacja odniesienia: ${population}.`);
    if (string(snapshot.notes?.source)) lines.push(snapshot.notes.source);
    if (string(snapshot.notes?.agePolicy)) lines.push(snapshot.notes.agePolicy);
    if (source.methods) {
      const methods = [["calcium", "wapń"], ["creatinine", "kreatynina"], ["ratio", "Ca/Cr"]]
        .filter(([key]) => string(source.methods[key])).map(([key, label]) => `${label} — ${source.methods[key]}`);
      if (methods.length) lines.push(`Metody laboratorium źródłowego: ${methods.join("; ")}. Metody laboratorium pacjenta nie zostały potwierdzone.`);
    }
    lines.push("Pojedynczy wynik Ca/Cr nie ustala rozpoznania hiperkalciurii, kamicy ani niedoboru wapnia.");
    return lines.join("\n");
  }

  // Saved assessments belong to the original visit. No current age, engine or
  // profile is consulted here; an edit to any measured field invalidates it.
  function savedCacrAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    const start = body.indexOf(CACR_NOTE_HEADER);
    if (start < 0 || body.length > 50000) return null;
    const text = body.slice(start);
    const raw = /^Wynik przed zaokrągleniem: ([<>≤≥]?)([\d.,eE+-]+) (mg\/mg|mg\/g|g\/g|mol\/mol|mmol\/mmol|mmol\/mol|mg\/mmol)\.$/m.exec(text);
    if (!raw) return null;
    const rawValue = Number(raw[2].replace(",", "."));
    if (!Number.isFinite(rawValue) || rawValue < 0) return null;
    const display = /^Wynik pokazany: (.+) (mg\/mg|mg\/g|g\/g|mol\/mol|mmol\/mmol|mmol\/mol|mg\/mmol)\.$/m.exec(text);
    const lab = note.labResult || {};
    const normalizeDisplay = value => String(value ?? "").replace(/\s+/g, "").replace(",", ".");
    if (String(lab.unit ?? "") !== raw[3]) return null;
    if (Number.isFinite(lab.valueNum) && lab.valueNum !== rawValue) return null;
    if (!display || display[2] !== raw[3] || normalizeDisplay(lab.value) !== normalizeDisplay(display[1])) return null;
    const savedNorm = /^Norma pokazana przy wyniku: ([^\n]+)\.$/m.exec(text)?.[1] || "";
    if (normalizeDisplay(lab.norm) !== normalizeDisplay(savedNorm)) return null;
    const statusLabel = /^Ocena: ([^\n]+)\.$/m.exec(text)?.[1];
    const categoryLabel = /^Kategoria Ca\/Cr: ([^\n]+)\.$/m.exec(text)?.[1];
    const comparisonLabel = /^Porównanie z zakresem: ([^\n]+)\.$/m.exec(text)?.[1];
    const age = /^Wiek użyty przy ocenie: ([\d.,]+) lat\.$/m.exec(text);
    const profile = /^Profil odniesienia: ([^;\n]+); wersja ([^\n]+)\.$/m.exec(text);
    return {
      rawValue, unit: raw[3], comparator: raw[1], displayValue: display ? display[1] : raw[1] + raw[2],
      status: Object.keys(CACR_ASSESSMENT_LABELS).find(key => CACR_ASSESSMENT_LABELS[key] === statusLabel) || "unassessed",
      category: ["below", "within", "above"].find(key => CACR_COMPARISON_LABELS[key] === categoryLabel) || null,
      comparison: Object.keys(CACR_COMPARISON_LABELS).find(key => CACR_COMPARISON_LABELS[key] === comparisonLabel) || null,
      ageYears: age ? Number(age[1].replace(",", ".")) : null,
      profileId: profile?.[1] || null, profileVersion: profile?.[2] || null, contextNote: text,
    };
  }

  function measuredReferenceNote(datapoint) {
    const reference = datapoint?.measuredClearanceReference;
    if (datapoint?.sourceFormulaId !== "cl24" || !reference || typeof reference !== "object" || Array.isArray(reference)) return "";
    // Snapshot of the result the clinician saw. The vault's note schema keeps
    // body/norm, but deliberately rejects new arbitrary labResult properties.
    // Never recompute a historical norm from today's profile or patient data.
    const number = (value) => typeof value === "number" && Number.isFinite(value) ? String(value).replace(".", ",") : "";
    const string = (value) => typeof value === "string" ? value.trim() : "";
    const lines = ["Klirens kreatyniny — dane użyte w chwili zapisu:"];
    if (number(reference.value)) lines.push(`Wynik przed zaokrągleniem: ${number(reference.value)} ${string(reference.unit) || "mL/min"}.`);
    const assessment = { within: "w zakresie", below: "poniżej zakresu", above: "powyżej zakresu" }[reference.status];
    lines.push(assessment ? `Ocena względem wybranego zakresu: ${assessment}.` : "Nie dobrano zakresu referencyjnego do tego wyniku.");
    const source = reference.source || {};
    if (string(source.label)) lines.push(`Źródło normy: ${string(source.label)}${string(source.lastUpdated) ? `; aktualizacja ${source.lastUpdated}` : ""}${string(source.accessedAt) ? `; dostęp ${source.accessedAt}` : ""}.`);
    if (string(source.url)) lines.push(`Adres źródła: ${source.url}`);
    if (string(reference.profileId)) lines.push(`Profil: ${reference.profileId}${reference.profileVersion != null ? `; wersja ${reference.profileVersion}` : ""}.`);
    const population = typeof reference.population === "string" ? reference.population : reference.population?.label;
    if (string(population)) lines.push(`Populacja: ${population}.`);
    const band = reference.selectedBand;
    if (band && number(band.minimumAgeInclusive) && number(band.maximumAgeExclusive)) {
      lines.push(`Przedział wieku źródła: od ${number(band.minimumAgeInclusive)} do poniżej ${number(band.maximumAgeExclusive)} lat${band.sexRequired === false ? "; wspólny dla obu płci" : ""}.`);
    }
    const inputs = reference.inputs || {};
    const patient = [];
    if (number(reference.ageYears)) patient.push(`wiek ${number(reference.ageYears)} lat`);
    if (["M", "F"].includes(reference.sex)) patient.push(reference.sex === "M" ? "płeć męska" : "płeć żeńska");
    if (number(inputs.weightKg)) patient.push(`masa ${number(inputs.weightKg)} kg`);
    if (number(inputs.heightCm)) patient.push(`wzrost ${number(inputs.heightCm)} cm`);
    if (patient.length) lines.push(`Dane pacjenta: ${patient.join("; ")}.`);
    if (number(reference.bsa)) lines.push(`Powierzchnia ciała użyta do przeliczenia normy: ${number(reference.bsa)} m²${string(reference.bsaMethod) ? ` (${reference.bsaMethod})` : ""}.`);
    const indexed = reference.indexedRange;
    if (indexed && number(indexed.lower) && number(indexed.upper)) lines.push(`Zakres źródłowy: ${number(indexed.lower)}–${number(indexed.upper)} ${string(indexed.unit)}.`);
    const absolute = reference.absoluteRange;
    if (absolute && number(absolute.lower) && number(absolute.upper)) lines.push(`Zakres po przeliczeniu na jednostkę wyniku, przed zaokrągleniem granic: ${number(absolute.lower)}–${number(absolute.upper)} ${string(absolute.unit)}.`);
    if (datapoint.norm) lines.push(`Norma pokazana przy wyniku: ${datapoint.norm}.`);
    if (number(reference.durationHours)) lines.push(`Rzeczywisty czas zbiórki: ${number(reference.durationHours)} h${number(inputs.durationMinutes) ? ` (${number(inputs.durationMinutes)} min)` : ""}. ${reference.durationSource === "legacy-dates" ? "Czas odtworzono z zapisanych dat początku i końca zbiórki." : "Czas podano w godzinach."}`);
    const laboratory = [];
    if (number(inputs.serumCreatinineMgDl)) laboratory.push(`kreatynina w surowicy ${number(inputs.serumCreatinineMgDl)} mg/dL`);
    if (number(inputs.urineCreatinineMgDl)) laboratory.push(`kreatynina w moczu ${number(inputs.urineCreatinineMgDl)} mg/dL`);
    if (number(inputs.volumeMl)) laboratory.push(`objętość ${number(inputs.volumeMl)} mL`);
    if (laboratory.length) lines.push(`Dane badania użyte w obliczeniu: ${laboratory.join("; ")}.`);
    if (reference.protocolContext?.nominalHours) lines.push(`Zakres źródłowy dotyczy zbiórki trwającej ${number(reference.protocolContext.nominalHours)} h.`);
    if (string(reference.protocolNote)) lines.push(reference.protocolNote);
    if (reference.collectionAssumptions?.collectionCompleteness === "assumed") lines.push("Założono pełną, prawidłową zbiórkę moczu.");
    if (reference.collectionAssumptions?.serumSampling === "assumed-compatible") lines.push("Założono, że kreatynina w surowicy odpowiada okresowi zbiórki zgodnie z protokołem laboratorium.");
    if (reference.referencePreview === true) lines.push("Norma ma charakter orientacyjny; zakres własnego laboratorium ma pierwszeństwo.");
    for (const limitation of Array.isArray(reference.limitations) ? reference.limitations : []) {
      if (string(limitation)) lines.push(limitation);
    }
    return lines.join("\n");
  }

  // Deprecated compatibility for the existing ClcrVisitSave public API only.
  // ACR/PCR limits historically carry an endpoint in valueNum; comparator is
  // mandatory and forbids plotting it. Its old marker/norm fallback semantics
  // are retained only here. New UI MUST use projectPatientNotes, never this API.
  function legacySeriesFromNotes(notes, options) {
    const list = Array.isArray(notes) ? notes : [];
    const target = resolveTargetFormulaSet(options);
    const m = model();
    const byLabel = new Map();
    for (let i = 0; i < list.length; i += 1) {
      const note = list[i];
      if (!note || note.category !== CATEGORY) continue;
      const lab = note.labResult;
      if (!lab || typeof lab.test !== "string" || !lab.test) continue;
      const oxcrLabel = global.ClcrOxcrPersistence?.canonicalLabel(lab.test) || lab.test;
      const label = global.ClcrCitcrPersistence?.canonicalLabel(oxcrLabel) || oxcrLabel;
      const entry =
        m && typeof m.getParamByLabel === "function"
          ? m.getParamByLabel(label)
          : null;
      const sourceFormulaId = entry ? entry.sourceFormulaId : null;
      if (target && (!sourceFormulaId || !target.has(sourceFormulaId))) continue;
      const acr = sourceFormulaId === "ACR" ? savedAcrAssessment(note) : null;
      const pcr = sourceFormulaId === "PCR" ? savedPcrAssessment(note) : null;
      const cacr = sourceFormulaId === "CaCr_spot" ? savedCacrAssessment(note) : null;
      const oxcr = sourceFormulaId === "OxCr_spot" ? global.ClcrOxcrPersistence?.savedAssessment(note) : null;
      const legacyOxcr = sourceFormulaId === "OxCr_spot" && !oxcr ? global.ClcrOxcrPersistence?.legacyPoint(note) : null;
      const citcr = sourceFormulaId === "CitCr_spot" ? global.ClcrCitcrPersistence?.savedAssessment(note) : null;
      const legacyCitcr = sourceFormulaId === "CitCr_spot" && !citcr ? global.ClcrCitcrPersistence?.legacyPoint(note) : null;
      const fena = sourceFormulaId === "FENa_spot" ? global.ClcrFenaPersistence?.savedAssessment(note) : null;
      const legacyFena = sourceFormulaId === "FENa_spot" && !fena ? global.ClcrFenaPersistence?.legacyPoint(note) : null;
      const fek = sourceFormulaId === "FEK_spot" ? global.ClcrFekPersistence?.savedAssessment(note) : null;
      const legacyFek = sourceFormulaId === "FEK_spot" && !fek ? global.ClcrFekPersistence?.legacyPoint(note) : null;
      const tmpGfr = sourceFormulaId === "TMP_GFR" ? global.ClcrTmpGfrPersistence?.savedAssessment(note) : null;
      const ph = sourceFormulaId === "pH_spot" ? global.ClcrPhPersistence?.savedAssessment(note) : null;
      const legacyPh = sourceFormulaId === "pH_spot" && !ph ? global.ClcrPhPersistence?.legacyPoint(note) : null;
      const caDzm = sourceFormulaId === "Ca_mgkg" ? global.ClcrCaDzmPersistence?.savedAssessment(note) : null;
      const po4Dzm = sourceFormulaId === "PO4_mgkg" ? global.ClcrPo4DzmPersistence?.savedAssessment(note) : null;
      const legacyPo4Dzm = sourceFormulaId === "PO4_mgkg" && !po4Dzm ? global.ClcrPo4DzmPersistence?.legacyPoint(note) : null;
      const proteinDzm = sourceFormulaId === "Prot_mgkg" ? global.ClcrProteinDzmPersistence?.savedAssessment(note) : null;
      const legacyProteinDzm = sourceFormulaId === "Prot_mgkg" && !proteinDzm ? global.ClcrProteinDzmPersistence?.legacyPoint(note) : null;
      const sodiumDzm = sourceFormulaId === "Na_mmol_d" ? global.ClcrSodiumDzmPersistence?.savedAssessment(note) : null;
      const legacySodiumDzm = sourceFormulaId === "Na_mmol_d" && !sodiumDzm ? global.ClcrSodiumDzmPersistence?.legacyPoint(note) : null;
      const potassiumDzm = sourceFormulaId === "K_mmol_d" ? global.ClcrPotassiumDzmPersistence?.savedAssessment(note) : null;
      const legacyPotassiumDzm = sourceFormulaId === "K_mmol_d" && !potassiumDzm ? global.ClcrPotassiumDzmPersistence?.legacyPoint(note) : null;
      const mgDzm = sourceFormulaId === "Mg_mgkg" ? global.ClcrMgDzmPersistence?.savedAssessment(note) : null;
      const legacyCaDzm = sourceFormulaId === "Ca_mgkg" && !caDzm ? global.ClcrCaDzmPersistence?.legacyPoint(note) : null;
      const legacyMgDzm = sourceFormulaId === "Mg_mgkg" && !mgDzm ? global.ClcrMgDzmPersistence?.legacyPoint(note) : null;
      const ua = sourceFormulaId === "UA_mgkg" ? global.ClcrUaPersistence?.savedAssessment(note) : null;
      const legacyUa = sourceFormulaId === "UA_mgkg" && !ua ? global.ClcrUaPersistence?.legacyPoint(note) : null;
      const uag = sourceFormulaId === "AGu_spot" ? global.ClcrUagPersistence?.savedAssessment(note) : null;
      const legacyUag = sourceFormulaId === "AGu_spot" && !uag ? global.ClcrUagPersistence?.legacyPoint(note) : null;
      const fehco3 = sourceFormulaId === "FEHCO3_spot" ? global.ClcrFehco3Persistence?.savedAssessment(note) : null;
      const legacyFehco3 = sourceFormulaId === "FEHCO3_spot" && !fehco3 ? global.ClcrFehco3Persistence?.legacyPoint(note) : null;
      const fecl = sourceFormulaId === "FECl_spot" ? global.ClcrFeclPersistence?.savedAssessment(note) : null;
      const legacyFecl = sourceFormulaId === "FECl_spot" && !fecl ? global.ClcrFeclPersistence?.legacyPoint(note) : null;
      const ratio = acr || pcr || cacr || oxcr || citcr;
      // A later edit can invalidate the old assessment while leaving a valid
      // censored laboratory result. Keep that current text without restoring
      // the original norm/category or turning its endpoint into a point.
      const signedCacrText = sourceFormulaId === "CaCr_spot" && !cacr && typeof lab.value === "string" && lab.value.length <= 256
        ? /^\s*([<>≤≥])\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)\s*$/.exec(lab.value) : null;
      const signedCacrValue = signedCacrText ? Number(signedCacrText[2].replace(",", ".")) : NaN;
      const valueNum = potassiumDzm ? global.ClcrPotassiumDzmPersistence.valueNum(potassiumDzm) : legacyPotassiumDzm ? legacyPotassiumDzm.rawValue : sodiumDzm ? global.ClcrSodiumDzmPersistence.valueNum(sodiumDzm) : legacySodiumDzm ? legacySodiumDzm.rawValue : proteinDzm ? global.ClcrProteinDzmPersistence.valueNum(proteinDzm) : legacyProteinDzm ? legacyProteinDzm.rawValue : po4Dzm ? global.ClcrPo4DzmPersistence.valueNum(po4Dzm) : legacyPo4Dzm ? legacyPo4Dzm.rawValue : mgDzm ? mgDzm.rawValue : legacyMgDzm ? legacyMgDzm.rawValue : caDzm ? caDzm.rawValue : legacyCaDzm ? legacyCaDzm.rawValue : ua ? ua.rawValue : legacyUa ? legacyUa.rawValue : ph ? ph.rawValue : legacyPh ? legacyPh.rawValue : tmpGfr ? tmpGfr.rawValue : uag ? uag.rawValue : legacyUag ? legacyUag.rawValue : fehco3 ? fehco3.rawValue : legacyFehco3 ? legacyFehco3.rawValue : fecl ? fecl.rawValue : legacyFecl ? legacyFecl.rawValue : fek ? fek.rawValue : legacyFek ? legacyFek.rawValue : fena ? fena.rawValue : legacyFena ? legacyFena.rawValue : ratio ? ratio.rawValue : legacyCitcr ? legacyCitcr.rawValue : legacyOxcr ? legacyOxcr.rawValue :
        Number.isFinite(signedCacrValue) ? signedCacrValue : typeof lab.valueNum === "number" && isFinite(lab.valueNum)
          ? lab.valueNum
          : legacyToNumber(lab.value);
      if (!Number.isFinite(valueNum)) continue;
      const unit = (ratio?.unit || lab.unit || (entry ? entry.unit : "") || "").trim();
      // Native mg/g and mg/mmol thresholds are deliberately different axes.
      // Never draw a trend through values stored in different native units.
      const seriesKey = sourceFormulaId === "TMP_GFR" ? `${label}\n${unit}\n${global.ClcrTmpGfrPersistence?.savedMethod(note, tmpGfr) || "legacy-unknown"}` : sourceFormulaId === "CitCr_spot" ? global.ClcrCitcrPersistence?.seriesKey(label, unit, citcr, note) || `${label}\n${unit}\nlegacy-unknown` : sourceFormulaId === "OxCr_spot" ? global.ClcrOxcrPersistence?.seriesKey(label, unit, oxcr, note) || `${label}\n${unit}\nlegacy-unknown` : ["ACR", "PCR", "CaCr_spot", "UA_mgkg", "Ca_mgkg", "Mg_mgkg", "PO4_mgkg", "Prot_mgkg", "Na_mmol_d", "K_mmol_d"].includes(sourceFormulaId) ? `${label}\n${unit}` : label;
      const dateISO =
        legacyNormalizeDateISO(note.clinicalDateISO) ||
        (typeof note.clinicalDateISO === "string"
          ? note.clinicalDateISO.slice(0, 10)
          : "");
      if (!byLabel.has(seriesKey)) {
        byLabel.set(seriesKey, {
          label: label,
          displayLabel: sourceFormulaId === "CitCr_spot" ? global.ClcrCitcrPersistence?.displayLabel(label, unit, citcr?.basis ?? global.ClcrCitcrPersistence?.savedBasis(note, unit) ?? "unknown") || lab.test : sourceFormulaId === "OxCr_spot" ? global.ClcrOxcrPersistence?.displayLabel(label, unit, oxcr?.basis ?? global.ClcrOxcrPersistence?.savedBasis(note, unit) ?? "unknown") || lab.test : label,
          unit: unit,
          id: entry ? entry.id : null,
          group: entry ? entry.group : null,
          sourceFormulaId: sourceFormulaId,
          points: [],
        });
      }
      const staleAcrSnapshot = sourceFormulaId === "ACR" && !acr &&
        typeof note.body === "string" && note.body.includes(ACR_NOTE_HEADER);
      const stalePcrSnapshot = sourceFormulaId === "PCR" && !pcr &&
        typeof note.body === "string" && note.body.includes(PCR_NOTE_HEADER);
      const staleCacrSnapshot = sourceFormulaId === "CaCr_spot" && !cacr &&
        typeof note.body === "string" && note.body.includes(CACR_NOTE_HEADER);
      const staleOxcrSnapshot = sourceFormulaId === "OxCr_spot" && !oxcr && global.ClcrOxcrPersistence?.hasSavedAssessment(note);
      const staleCitcrSnapshot = sourceFormulaId === "CitCr_spot" && !citcr && global.ClcrCitcrPersistence?.hasSavedAssessment(note);
      // FENa helper thresholds never imply a normal/abnormal verdict. Legacy
      // notes remain historical numbers; no current patient facts are applied.
      const outOfRange = sourceFormulaId === "K_mmol_d" ? potassiumDzm?.outOfRange ?? null : sourceFormulaId === "Na_mmol_d" ? sodiumDzm?.outOfRange ?? null : sourceFormulaId === "Prot_mgkg" ? proteinDzm?.outOfRange ?? null : sourceFormulaId === "PO4_mgkg" ? po4Dzm?.outOfRange ?? null : sourceFormulaId === "Mg_mgkg" ? mgDzm?.outOfRange ?? null : sourceFormulaId === "Ca_mgkg" ? caDzm?.outOfRange ?? null : sourceFormulaId === "UA_mgkg" ? ua?.outOfRange ?? null : sourceFormulaId === "pH_spot" ? ph?.outOfRange ?? null : ["FECl_spot", "FEHCO3_spot", "AGu_spot"].includes(sourceFormulaId) ? null : sourceFormulaId === "FEK_spot" ? fek?.outOfRange ?? null : sourceFormulaId === "FENa_spot" ? null : ratio ? ratio.status === "unassessed" ? null : ["below", "above"].includes(ratio.status) : staleAcrSnapshot || stalePcrSnapshot || staleCacrSnapshot || staleOxcrSnapshot || staleCitcrSnapshot ? null : ["OxCr_spot", "CitCr_spot"].includes(sourceFormulaId) ? typeof note.body === "string" && note.body.includes("wynik poza zakresem") ? true : null :
        typeof note.body === "string" &&
        note.body.indexOf("poza zakresem") >= 0;
      const norm = typeof lab.norm === "string" ? lab.norm.trim() : "";
      const point = {
        dateISO: dateISO,
        valueNum: valueNum,
        outOfRange: outOfRange,
        norm: norm,
        noteId: note.id || null,
      };
      if (acr) Object.assign(point, {
        displayValue: acr.displayValue, comparator: acr.comparator,
        category: acr.category, assessment: acr.status, unit: acr.unit,
        acrAssessment: acr,
      });
      if (pcr) Object.assign(point, {
        displayValue: pcr.displayValue, comparator: pcr.comparator,
        category: pcr.category, assessment: pcr.status, comparison: pcr.comparison,
        unit: pcr.unit, pcrAssessment: pcr,
      });
      if (cacr) Object.assign(point, {
        valueNum: cacr.comparator ? null : cacr.rawValue,
        displayValue: cacr.displayValue, comparator: cacr.comparator,
        category: cacr.category, assessment: cacr.status, comparison: cacr.comparison,
        unit: cacr.unit, cacrAssessment: cacr,
      });
      if (!cacr && Number.isFinite(signedCacrValue)) Object.assign(point, {
        valueNum: null, comparator: signedCacrText[1], displayValue: lab.value.trim(), outOfRange: null,
      });
      if (oxcr) Object.assign(point, {
        valueNum: oxcr.comparator ? null : oxcr.rawValue,
        displayValue: oxcr.displayValue, comparator: oxcr.comparator,
        category: oxcr.category, assessment: oxcr.status, comparison: oxcr.comparison,
        unit: oxcr.unit, basis: oxcr.basis, originalUnit: oxcr.originalUnit, oxcrAssessment: oxcr,
      });
      if (legacyOxcr) Object.assign(point, legacyOxcr, { outOfRange });
      if (citcr) Object.assign(point, {
        valueNum: citcr.comparator ? null : citcr.rawValue,
        displayValue: citcr.displayValue, comparator: citcr.comparator,
        category: citcr.category, assessment: citcr.status, comparison: citcr.comparison,
        unit: citcr.unit, basis: citcr.basis, originalUnit: citcr.originalUnit, citcrAssessment: citcr,
      });
      if (legacyCitcr) Object.assign(point, legacyCitcr, { outOfRange });
      if (fena) Object.assign(point, {
        valueNum: fena.rawValue, displayValue: fena.displayValue, unit: fena.unit,
        assessment: "unassessed", category: null, outOfRange: null, norm: "",
        fenaAssessment: fena,
      });
      if (legacyFena) Object.assign(point, legacyFena, { outOfRange: null, norm: "" });
      if (fek) Object.assign(point, {
        valueNum: fek.comparator ? null : fek.rawValue, displayValue: fek.displayValue, unit: fek.unit,
        comparator: fek.comparator || "", assessment: fek.status, category: null, outOfRange: fek.outOfRange, norm: fek.norm,
        fekAssessment: fek,
      });
      if (legacyFek) Object.assign(point, legacyFek, { outOfRange: null, norm: "" });
      if (fecl) Object.assign(point, {
        valueNum: fecl.comparator ? null : fecl.rawValue, displayValue: fecl.displayValue, unit: fecl.unit,
        comparator: fecl.comparator || "", assessment: "unassessed", category: null, outOfRange: null, norm: "",
        feclAssessment: fecl,
      });
      if (legacyFecl) Object.assign(point, legacyFecl, { outOfRange: null, norm: "" });
      if (tmpGfr) Object.assign(point, {
        valueNum: tmpGfr.rawValue, displayValue: tmpGfr.displayValue, unit: tmpGfr.unit,
        comparator: "", assessment: tmpGfr.status, category: null, outOfRange: tmpGfr.outOfRange, norm: tmpGfr.norm,
        calculationMethod: tmpGfr.method, tmpGfrAssessment: tmpGfr,
      });
      if (sourceFormulaId === "TMP_GFR" && !tmpGfr) Object.assign(point, {
        assessment: "unassessed", outOfRange: null, norm: "", calculationMethod: "legacy-unknown",
      });
      if (ph) Object.assign(point, {
        valueNum: ph.rawValue, displayValue: ph.displayValue, unit: "—",
        comparator: "", assessment: ({ low: "below", high: "above" })[ph.status] || ph.status,
        category: null, outOfRange: ph.outOfRange, norm: ph.norm, phAssessment: ph,
      });
      if (legacyPh) Object.assign(point, legacyPh);
      if (po4Dzm) Object.assign(point, {
        valueNum: global.ClcrPo4DzmPersistence.valueNum(po4Dzm), displayValue: po4Dzm.displayValue, unit: global.ClcrPo4DzmPersistence.unitText(po4Dzm),
        comparator: "", assessment: global.ClcrPo4DzmPersistence.assessment(po4Dzm),
        category: null, outOfRange: po4Dzm.outOfRange, norm: po4Dzm.norm, po4DzmAssessment: po4Dzm,
      });
      if (legacyPo4Dzm) Object.assign(point, legacyPo4Dzm);
      if (sourceFormulaId === "PO4_mgkg" && !po4Dzm) Object.assign(point, { assessment: "unassessed", category: null, outOfRange: null, norm: "" });
      if (proteinDzm) Object.assign(point, {
        valueNum: global.ClcrProteinDzmPersistence.valueNum(proteinDzm), displayValue: proteinDzm.displayValue, unit: global.ClcrProteinDzmPersistence.unitText(proteinDzm),
        comparator: "", assessment: global.ClcrProteinDzmPersistence.assessment(proteinDzm),
        category: null, outOfRange: proteinDzm.outOfRange, norm: proteinDzm.norm, proteinDzmAssessment: proteinDzm,
      });
      if (legacyProteinDzm) Object.assign(point, legacyProteinDzm);
      if (sourceFormulaId === "Prot_mgkg" && !proteinDzm) Object.assign(point, { assessment: "unassessed", category: null, outOfRange: null, norm: "" });
      if (sodiumDzm) Object.assign(point, {
        valueNum: global.ClcrSodiumDzmPersistence.valueNum(sodiumDzm), displayValue: sodiumDzm.displayValue, unit: global.ClcrSodiumDzmPersistence.unitText(sodiumDzm),
        comparator: "", assessment: global.ClcrSodiumDzmPersistence.assessment(sodiumDzm),
        category: null, outOfRange: sodiumDzm.outOfRange, norm: sodiumDzm.norm, sodiumDzmAssessment: sodiumDzm,
      });
      if (legacySodiumDzm) Object.assign(point, legacySodiumDzm);
      if (sourceFormulaId === "Na_mmol_d" && !sodiumDzm) Object.assign(point, { assessment: "unassessed", category: null, outOfRange: null, norm: legacySodiumDzm?.norm || text(lab.norm) });
      if (potassiumDzm) Object.assign(point, {
        valueNum: global.ClcrPotassiumDzmPersistence.valueNum(potassiumDzm), displayValue: potassiumDzm.displayValue, unit: global.ClcrPotassiumDzmPersistence.unitText(potassiumDzm),
        comparator: "", assessment: global.ClcrPotassiumDzmPersistence.assessment(potassiumDzm),
        category: null, outOfRange: potassiumDzm.outOfRange, norm: potassiumDzm.norm, potassiumDzmAssessment: potassiumDzm,
      });
      if (legacyPotassiumDzm) Object.assign(point, legacyPotassiumDzm);
      if (sourceFormulaId === "K_mmol_d" && !potassiumDzm) Object.assign(point, { assessment: "unassessed", category: null, outOfRange: null, norm: legacyPotassiumDzm?.norm || text(lab.norm) });
      if (mgDzm) Object.assign(point, {
        valueNum: mgDzm.rawValue, displayValue: mgDzm.displayValue, unit: mgDzm.unit,
        comparator: "", assessment: global.ClcrMgDzmPersistence.assessment(mgDzm),
        category: null, outOfRange: mgDzm.outOfRange, norm: mgDzm.norm, mgDzmAssessment: mgDzm,
      });
      if (legacyMgDzm) Object.assign(point, legacyMgDzm);
      if (sourceFormulaId === "Mg_mgkg" && !mgDzm) Object.assign(point, { assessment: "unassessed", category: null, outOfRange: null, norm: "" });
      if (caDzm) Object.assign(point, {
        valueNum: caDzm.rawValue, displayValue: caDzm.displayValue, unit: caDzm.unit,
        comparator: "", assessment: ({ low: "below", high: "above", boundary: "above", "criterion-met": "above", "criterion-not-met": "unassessed" })[caDzm.status] || caDzm.status,
        category: null, outOfRange: caDzm.outOfRange, norm: caDzm.norm, caDzmAssessment: caDzm,
      });
      if (legacyCaDzm) Object.assign(point, legacyCaDzm);
      if (sourceFormulaId === "Ca_mgkg" && !caDzm) Object.assign(point, { assessment: "unassessed", category: null, outOfRange: null, norm: "" });
      if (ua) Object.assign(point, {
        valueNum: ua.rawValue, displayValue: ua.displayValue, unit: ua.unit,
        comparator: "", assessment: ({ low: "below", high: "above", boundary: "above" })[ua.status] || ua.status,
        category: null, outOfRange: ua.outOfRange, norm: ua.norm, uaAssessment: ua,
      });
      if (legacyUa) Object.assign(point, legacyUa);
      if (sourceFormulaId === "UA_mgkg" && !ua) Object.assign(point, { assessment: "unassessed", category: null, outOfRange: null, norm: "" });
      if (sourceFormulaId === "pH_spot" && !ph) Object.assign(point, { assessment: "unassessed", category: null, outOfRange: null, norm: "" });
      if (uag) Object.assign(point, {
        valueNum: uag.rawValue, displayValue: uag.displayValue, unit: uag.unit,
        comparator: "", assessment: "unassessed", category: null, outOfRange: null, norm: "",
        uagAssessment: uag,
      });
      if (legacyUag) Object.assign(point, legacyUag, { outOfRange: null, norm: "" });
      if (sourceFormulaId === "AGu_spot" && !uag) {
        point.assessment = "unassessed"; point.category = null; point.norm = "";
        if (!legacyUag) point.displayValue = String(valueNum).replace(".", ",");
      }
      if (fehco3) Object.assign(point, {
        valueNum: fehco3.comparator ? null : fehco3.rawValue, displayValue: fehco3.displayValue, unit: fehco3.unit,
        comparator: fehco3.comparator || "", assessment: "unassessed", category: null, outOfRange: null, norm: "",
        fehco3Assessment: fehco3,
      });
      if (legacyFehco3) Object.assign(point, legacyFehco3, { outOfRange: null, norm: "" });
      if (sourceFormulaId === "FEHCO3_spot" && !fehco3) {
        point.assessment = "unassessed"; point.category = null;
        if (!legacyFehco3) point.displayValue = String(valueNum).replace(".", ",");
      }
      if (sourceFormulaId === "FECl_spot" && !fecl) {
        point.norm = "";
        if (!legacyFecl) point.displayValue = String(valueNum).replace(".", ",");
      }
      if (sourceFormulaId === "FEK_spot" && !fek) {
        point.displayValue = String(lab.value || valueNum).trim();
        point.norm = "";
      }
      if (sourceFormulaId === "FENa_spot" && !fena) {
        point.displayValue = String(lab.value || valueNum).trim();
        point.norm = "";
      }
      byLabel.get(seriesKey).points.push(point);
    }
    const series = Array.from(byLabel.values());
    series.forEach((s) => {
      s.points.sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));
      if (["ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot", "AGu_spot", "pH_spot", "UA_mgkg", "Ca_mgkg", "Mg_mgkg", "PO4_mgkg", "Prot_mgkg", "Na_mmol_d", "K_mmol_d"].includes(s.sourceFormulaId)) {
        s.norm = s.points[s.points.length - 1]?.norm || "";
        return;
      }
      // Zakres serii = z najnowszego punktu, który go niesie.
      s.norm = "";
      for (let k = s.points.length - 1; k >= 0; k -= 1) {
        if (s.points[k].norm) {
          s.norm = s.points[k].norm;
          break;
        }
      }
    });
    return series;
  }


  function buildPatientNotePayload(dp, options) {
    const opts = options || {};
    if (!dp || !Number.isFinite(dp.valueNum)) throw new TypeError("Brak poprawnego wyniku obliczenia do zapisu.");
    if (typeof opts.patientId !== "string" || !opts.patientId) throw new TypeError("Brak pacjenta wyniku.");
    const clinicalDateISO = normalizeDateISO(opts.clinicalDateISO);
    if (!clinicalDateISO) throw new TypeError("Brak poprawnej daty badania.");
    if (dp.sourceFormulaId === "TMP_GFR" && dp.tmpGfrSnapshot?.input?.clinicalDate && dp.tmpGfrSnapshot.input.clinicalDate !== clinicalDateISO) {
      throw new Error("Data badania zmieniła się od obliczenia TmP/GFR. Przelicz wynik dla wybranej daty przed zapisem.");
    }
    const tmpGfrNote = dp.sourceFormulaId === "TMP_GFR" ? global.ClcrTmpGfrPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "TMP_GFR" && !tmpGfrNote) {
      throw new Error("Brak kompletnej oceny TmP/GFR do bezpiecznego zapisu. Odśwież kalkulator i oblicz wynik ponownie.");
    }
    const po4DzmNote = dp.sourceFormulaId === "PO4_mgkg" ? global.ClcrPo4DzmPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "PO4_mgkg" && (!po4DzmNote || dp.valueNum < 0 || dp.valueNum !== global.ClcrPo4DzmPersistence.valueNum(dp.po4DzmSnapshot) || dp.rawValue !== global.ClcrPo4DzmPersistence.valueNum(dp.po4DzmSnapshot) || dp.unit !== global.ClcrPo4DzmPersistence.unitText(dp.po4DzmSnapshot) || String(dp.displayValue) !== global.ClcrPo4DzmPersistence.displayText(dp.po4DzmSnapshot) || String(dp.norm || "") !== global.ClcrPo4DzmPersistence.normText(dp.po4DzmSnapshot) || dp.outOfRange !== dp.po4DzmSnapshot?.outOfRange)) {
      throw new Error("Brak kompletnej oceny wydalania fosforanów do bezpiecznego zapisu. Oblicz wynik ponownie.");
    }
    const proteinDzmNote = dp.sourceFormulaId === "Prot_mgkg" ? global.ClcrProteinDzmPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "Prot_mgkg" && dp.proteinDzmSnapshot && (!proteinDzmNote || dp.valueNum < 0 || dp.valueNum !== global.ClcrProteinDzmPersistence.valueNum(dp.proteinDzmSnapshot) || dp.rawValue !== global.ClcrProteinDzmPersistence.valueNum(dp.proteinDzmSnapshot) || dp.unit !== global.ClcrProteinDzmPersistence.unitText(dp.proteinDzmSnapshot) || String(dp.displayValue) !== global.ClcrProteinDzmPersistence.displayText(dp.proteinDzmSnapshot) || String(dp.norm || "") !== global.ClcrProteinDzmPersistence.normText(dp.proteinDzmSnapshot) || dp.outOfRange !== dp.proteinDzmSnapshot?.outOfRange)) {
      throw new Error("Brak kompletnej oceny wydalania białka do bezpiecznego zapisu. Oblicz wynik ponownie.");
    }
    const sodiumDzmNote = dp.sourceFormulaId === "Na_mmol_d" ? global.ClcrSodiumDzmPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "Na_mmol_d" && (!sodiumDzmNote || dp.valueNum < 0 || dp.valueNum !== global.ClcrSodiumDzmPersistence.valueNum(dp.sodiumDzmSnapshot) || dp.rawValue !== global.ClcrSodiumDzmPersistence.valueNum(dp.sodiumDzmSnapshot) || dp.unit !== global.ClcrSodiumDzmPersistence.unitText(dp.sodiumDzmSnapshot) || String(dp.displayValue) !== global.ClcrSodiumDzmPersistence.displayText(dp.sodiumDzmSnapshot) || String(dp.norm || "") !== global.ClcrSodiumDzmPersistence.normText(dp.sodiumDzmSnapshot) || dp.outOfRange !== dp.sodiumDzmSnapshot?.outOfRange || dp.assessment !== global.ClcrSodiumDzmPersistence.assessment(dp.sodiumDzmSnapshot) || dp.tone !== (dp.sodiumDzmSnapshot?.tone === "normal" ? "success" : dp.sodiumDzmSnapshot?.tone) || dp.interpretation !== dp.sodiumDzmSnapshot?.interpretation)) {
      throw new Error("Brak kompletnej oceny wydalania sodu do bezpiecznego zapisu. Oblicz wynik ponownie.");
    }
    const potassiumDzmNote = dp.sourceFormulaId === "K_mmol_d" ? global.ClcrPotassiumDzmPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "K_mmol_d" && (!potassiumDzmNote || dp.valueNum < 0 || dp.valueNum !== global.ClcrPotassiumDzmPersistence.valueNum(dp.potassiumDzmSnapshot) || dp.rawValue !== global.ClcrPotassiumDzmPersistence.valueNum(dp.potassiumDzmSnapshot) || dp.unit !== global.ClcrPotassiumDzmPersistence.unitText(dp.potassiumDzmSnapshot) || String(dp.displayValue) !== global.ClcrPotassiumDzmPersistence.displayText(dp.potassiumDzmSnapshot) || String(dp.norm || "") !== global.ClcrPotassiumDzmPersistence.normText(dp.potassiumDzmSnapshot) || dp.outOfRange !== dp.potassiumDzmSnapshot?.outOfRange || dp.assessment !== global.ClcrPotassiumDzmPersistence.assessment(dp.potassiumDzmSnapshot) || dp.tone !== (dp.potassiumDzmSnapshot?.tone === "normal" ? "success" : dp.potassiumDzmSnapshot?.tone) || dp.interpretation !== dp.potassiumDzmSnapshot?.interpretation || String(dp.boundary || "") !== global.ClcrPotassiumDzmPersistence.boundaryText(dp.potassiumDzmSnapshot))) {
      throw new Error("Brak kompletnej oceny wydalania potasu do bezpiecznego zapisu. Oblicz wynik ponownie.");
    }
    const mgDzmNote = dp.sourceFormulaId === "Mg_mgkg" ? global.ClcrMgDzmPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "Mg_mgkg" && (!mgDzmNote || dp.valueNum < 0 || dp.valueNum !== dp.mgDzmSnapshot?.rawValue || dp.rawValue !== dp.mgDzmSnapshot?.rawValue || dp.unit !== dp.mgDzmSnapshot?.unit || String(dp.displayValue) !== global.ClcrMgDzmPersistence.displayText(dp.mgDzmSnapshot) || String(dp.norm || "") !== global.ClcrMgDzmPersistence.normText(dp.mgDzmSnapshot) || dp.outOfRange !== dp.mgDzmSnapshot?.outOfRange)) {
      throw new Error("Brak kompletnej oceny wydalania magnezu do bezpiecznego zapisu. Oblicz wynik ponownie.");
    }
    const caDzmNote = dp.sourceFormulaId === "Ca_mgkg" ? global.ClcrCaDzmPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "Ca_mgkg" && (!caDzmNote || dp.valueNum < 0 || dp.valueNum !== dp.caDzmSnapshot?.rawValue || dp.rawValue !== dp.caDzmSnapshot?.rawValue || dp.unit !== dp.caDzmSnapshot?.unit || String(dp.displayValue) !== global.ClcrCaDzmPersistence.displayText(dp.caDzmSnapshot) || String(dp.norm || "") !== global.ClcrCaDzmPersistence.normText(dp.caDzmSnapshot) || dp.outOfRange !== dp.caDzmSnapshot?.outOfRange)) {
      throw new Error("Brak kompletnej oceny wydalania wapnia do bezpiecznego zapisu. Oblicz wynik ponownie.");
    }
    const uaNote = dp.sourceFormulaId === "UA_mgkg" ? global.ClcrUaPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "UA_mgkg" && (!uaNote || dp.valueNum < 0 || dp.valueNum !== dp.uaSnapshot?.rawValue || dp.rawValue !== dp.uaSnapshot?.rawValue || dp.unit !== dp.uaSnapshot?.unit || String(dp.displayValue) !== global.ClcrUaPersistence.displayText(dp.uaSnapshot) || String(dp.norm || "") !== global.ClcrUaPersistence.normText(dp.uaSnapshot) || dp.outOfRange !== dp.uaSnapshot?.outOfRange)) {
      throw new Error("Brak kompletnej oceny wydalania kwasu moczowego do bezpiecznego zapisu. Oblicz wynik ponownie.");
    }
    const phNote = dp.sourceFormulaId === "pH_spot" ? global.ClcrPhPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "pH_spot" && !phNote) {
      throw new Error("Brak kompletnej oceny pH do bezpiecznego zapisu. Odśwież kalkulator i sprawdź wynik ponownie.");
    }
    const uagNote = dp.sourceFormulaId === "AGu_spot" ? global.ClcrUagPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "AGu_spot" && !uagNote) {
      throw new Error("Brak kompletnej oceny UAG do bezpiecznego zapisu. Odśwież kalkulator i oblicz wynik ponownie.");
    }
    const fehco3Note = dp.sourceFormulaId === "FEHCO3_spot" ? global.ClcrFehco3Persistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "FEHCO3_spot" && !fehco3Note) {
      throw new Error("Brak kompletnej oceny FEHCO₃ do bezpiecznego zapisu. Odśwież kalkulator i oblicz wynik ponownie.");
    }
    const feclNote = dp.sourceFormulaId === "FECl_spot" ? global.ClcrFeclPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "FECl_spot" && !feclNote) {
      throw new Error("Brak kompletnej oceny FECl do bezpiecznego zapisu. Odśwież kalkulator i oblicz wynik ponownie.");
    }
    const fekNote = dp.sourceFormulaId === "FEK_spot" ? global.ClcrFekPersistence?.referenceNote(dp) : "";
    if (dp.sourceFormulaId === "FEK_spot" && !fekNote) {
      throw new Error("Brak kompletnej oceny FEK do bezpiecznego zapisu. Odśwież kalkulator i oblicz wynik ponownie.");
    }
    const labResult = {
      test: dp.label,
      value: dp.sourceFormulaId === "CaCr_spot" && dp.cacrSnapshot
        ? dp.displayValue || acrDisplayText(dp.cacrSnapshot) : dp.sourceFormulaId === "PCR" && dp.pcrSnapshot
          ? dp.displayValue || acrDisplayText(dp.pcrSnapshot) : dp.sourceFormulaId === "ACR" && dp.acrSnapshot
            ? dp.displayValue || acrDisplayText(dp.acrSnapshot) : formatValueString(dp.valueNum),
      valueNum: dp.valueNum,
      unit: dp.unit,
    };
    if (dp.sourceFormulaId === "OxCr_spot") global.ClcrOxcrPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "CitCr_spot") global.ClcrCitcrPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "FENa_spot") global.ClcrFenaPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "FEK_spot") global.ClcrFekPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "FECl_spot") global.ClcrFeclPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "FEHCO3_spot") global.ClcrFehco3Persistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "AGu_spot") global.ClcrUagPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "TMP_GFR") global.ClcrTmpGfrPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "pH_spot") global.ClcrPhPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "UA_mgkg") global.ClcrUaPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "Ca_mgkg") global.ClcrCaDzmPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "Mg_mgkg") global.ClcrMgDzmPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "PO4_mgkg") global.ClcrPo4DzmPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "Na_mmol_d") global.ClcrSodiumDzmPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "K_mmol_d") global.ClcrPotassiumDzmPersistence?.applyLabResult(dp, labResult);
    if (dp.sourceFormulaId === "Prot_mgkg" && dp.proteinDzmSnapshot) global.ClcrProteinDzmPersistence?.applyLabResult(dp, labResult);
    else if (dp.sourceFormulaId === "Prot_mgkg") labResult.value = String(dp.displayValue ?? dp.valueNum).replace(".", ",");
    // Generic vault charts consume valueNum as an exact measurement. A
    // detection limit stays textual there; the signed endpoint is retained
    // in the ACR snapshot note and understood by this history adapter.
    if (dp.sourceFormulaId === "ACR" && dp.acrSnapshot?.comparator) delete labResult.valueNum;
    if (dp.sourceFormulaId === "PCR" && dp.pcrSnapshot?.comparator) delete labResult.valueNum;
    if (dp.sourceFormulaId === "CaCr_spot" && dp.cacrSnapshot?.comparator) delete labResult.valueNum;
    // Zakres referencyjny (jeśli silnik go pokazał) — do kolumny „Zakres".
    if (dp.norm) labResult.norm = String(dp.norm).slice(0, 200);
    // Znacznik „poza zakresem" w treści (magazyn nie ma pola boolean) —
    // czytelny dla lekarza i parsowalny przez flowsheet (§2: testKey też tu).
    const body =
      "Kalkulator klirensu · " +
      dp.testKey +
      (dp.outOfRange ? " · wynik poza zakresem" : "") +
      (typeof dp.assumptions === "string" && dp.assumptions.trim() ? "\n\n" + dp.assumptions.trim() : "") +
      (dp.sourceFormulaId === "ACR" && dp.acrSnapshot ? "\n\n" + acrReferenceNote(dp) : "") +
      (dp.sourceFormulaId === "PCR" && dp.pcrSnapshot ? "\n\n" + pcrReferenceNote(dp) : "") +
      (dp.sourceFormulaId === "CaCr_spot" && dp.cacrSnapshot ? "\n\n" + cacrReferenceNote(dp) : "") +
      (dp.sourceFormulaId === "OxCr_spot" && dp.oxcrSnapshot ? "\n\n" + global.ClcrOxcrPersistence.referenceNote(dp) : "") +
      (dp.sourceFormulaId === "CitCr_spot" && dp.citcrSnapshot ? "\n\n" + global.ClcrCitcrPersistence.referenceNote(dp) : "") +
      (dp.sourceFormulaId === "FENa_spot" && dp.fenaSnapshot ? "\n\n" + global.ClcrFenaPersistence.referenceNote(dp) : "") +
      (fekNote ? "\n\n" + fekNote : "") +
      (feclNote ? "\n\n" + feclNote : "") +
      (fehco3Note ? "\n\n" + fehco3Note : "") +
      (uagNote ? "\n\n" + uagNote : "") +
      (tmpGfrNote ? "\n\n" + tmpGfrNote : "") +
      (phNote ? "\n\n" + phNote : "") +
      (uaNote ? "\n\n" + uaNote : "") +
      (caDzmNote ? "\n\n" + caDzmNote : "") +
      (po4DzmNote ? "\n\n" + po4DzmNote : "") +
      (proteinDzmNote ? "\n\n" + proteinDzmNote : "") +
      (sodiumDzmNote ? "\n\n" + sodiumDzmNote : "") +
      (potassiumDzmNote ? "\n\n" + potassiumDzmNote : "") +
      (mgDzmNote ? "\n\n" + mgDzmNote : "") +
      (dp.sourceFormulaId === "cl24" && dp.measuredClearanceReference ? "\n\n" + measuredReferenceNote(dp) : "") +
      (dp.sourceFormulaId === "cg_norm" && dp.agePolicy === "completed-years" && Number.isInteger(dp.ageUsedYears) && dp.ageUsedYears >= 18
        ? "\n\nWiek użyty we wzorze: " + dp.ageUsedYears + " ukończonych lat." : "");
    const comment = typeof opts.comment === "string" && opts.comment.trim() ? "\n\nKomentarz lekarza:\n" + opts.comment.trim() : "";
    return { patientId: opts.patientId, category: CATEGORY, clinicalDateISO, title: dp.label,
      body: body + comment, labResult };
  }

  const ASSESSMENT_FIELDS = Object.freeze([
    "acrAssessment", "pcrAssessment", "cacrAssessment", "oxcrAssessment", "citcrAssessment",
    "fenaAssessment", "fekAssessment", "feclAssessment", "fehco3Assessment", "uagAssessment", "tmpGfrAssessment", "phAssessment", "uaAssessment", "caDzmAssessment", "mgDzmAssessment", "po4DzmAssessment", "proteinDzmAssessment", "sodiumDzmAssessment", "potassiumDzmAssessment",
  ]);
  const HELPER_BY_FORMULA = Object.freeze({
    OxCr_spot: "ClcrOxcrPersistence", CitCr_spot: "ClcrCitcrPersistence",
    FENa_spot: "ClcrFenaPersistence", FEK_spot: "ClcrFekPersistence",
    FECl_spot: "ClcrFeclPersistence", FEHCO3_spot: "ClcrFehco3Persistence", AGu_spot: "ClcrUagPersistence", TMP_GFR: "ClcrTmpGfrPersistence", pH_spot: "ClcrPhPersistence", UA_mgkg: "ClcrUaPersistence", Ca_mgkg: "ClcrCaDzmPersistence", Mg_mgkg: "ClcrMgDzmPersistence", PO4_mgkg: "ClcrPo4DzmPersistence", Prot_mgkg: "ClcrProteinDzmPersistence", Na_mmol_d: "ClcrSodiumDzmPersistence", K_mmol_d: "ClcrPotassiumDzmPersistence",
  });
  const HEADER_BY_FORMULA = Object.freeze({ ACR: ACR_NOTE_HEADER, PCR: PCR_NOTE_HEADER, CaCr_spot: CACR_NOTE_HEADER });

  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function normalizedUnit(value) { return text(value).replace(/[μµ]/g, "µ").replace(/\s+/g, " "); }
  function normalizedText(value) { return String(value ?? "").replace(/\s+/g, "").replace(/,/g, "."); }

  // Parse the WHOLE measurement. A limit remains a limit, and arbitrary text
  // containing digits never becomes a point via parseFloat.
  function recordedMeasurement(lab) {
    const rawText = text(lab.value);
    const match = /^\s*([<>]=?|[≤≥])?\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)(.*)$/.exec(rawText);
    const suffix = match ? text(match[3]) : "";
    const suffixAccepted = !suffix || normalizedUnit(suffix) === normalizedUnit(lab.unit);
    const parsed = match && suffixAccepted ? Number(match[2].replace(",", ".")) : NaN;
    const comparator = match ? ({ "<=": "≤", ">=": "≥" })[match[1]] || match[1] || "" : "";
    const hasNumber = Number.isFinite(parsed);
    const rawValue = hasNumber && Number.isFinite(lab.valueNum) && !comparator ? lab.valueNum
      : hasNumber ? parsed : !rawText && Number.isFinite(lab.valueNum) ? lab.valueNum : null;
    return {
      rawText, rawValue, comparator: hasNumber ? comparator : "",
      kind: rawValue === null ? "text" : comparator ? "censored" : "exact",
      valueNum: rawValue === null || comparator ? null : rawValue,
      displayValue: rawText || (rawValue === null ? "—" : String(rawValue).replace(".", ",")),
    };
  }

  // A visual rendering of the recorded literal reference, never a reference
  // selected from today's age, profile or laboratory converter.
  function referenceBounds(norm, unit) {
    const value = text(norm).replace(/−/g, "-");
    const number = "([+-]?(?:\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:[eE][+-]?\\d+)?)";
    const threshold = new RegExp("^\\s*(<=|>=|[<>≤≥])\\s*" + number + "\\s*(.*?)\\s*$").exec(value);
    const range = threshold ? null : new RegExp("^\\s*" + number + "\\s*[-–—]\\s*" + number + "\\s*(.*?)\\s*$").exec(value);
    const compatible = suffix => !suffix || normalizedUnit(suffix) === normalizedUnit(unit);
    if (threshold && compatible(threshold[3])) {
      const endpoint = Number(threshold[2].replace(",", "."));
      if (!Number.isFinite(endpoint)) return null;
      const lower = [">", ">=", "≥"].includes(threshold[1]);
      const inclusive = ["<=", ">=", "≤", "≥"].includes(threshold[1]);
      return { low: lower ? endpoint : null, high: lower ? null : endpoint,
        lowInclusive: lower && inclusive, highInclusive: !lower && inclusive };
    }
    if (range && compatible(range[3])) {
      const low = Number(range[1].replace(",", ".")), high = Number(range[2].replace(",", "."));
      if (Number.isFinite(low) && Number.isFinite(high) && low <= high) {
        return { low, high, lowInclusive: true, highInclusive: true };
      }
    }
    return null;
  }

  function bodyMetadata(body) {
    const sourceLabel = /^Źródło normy: ([^\n]+)\.$/m.exec(body)?.[1];
    const url = /^Adres źródła: ([^\n]+)$/m.exec(body)?.[1];
    const section = /^Miejsce w źródle: ([^\n]+)\.$/m.exec(body)?.[1];
    const profile = /^Profil(?: odniesienia)?: ([^;\n]+)(?:; wersja ([^\n]+))?\.$/m.exec(body);
    const population = /^Populacja(?: odniesienia)?: ([^\n]+)\.$/m.exec(body)?.[1] || null;
    const age = /^Wiek użyty przy ocenie: ([\d.,]+) lat\.$/m.exec(body);
    return {
      source: sourceLabel || url || profile ? { label: sourceLabel || "", url: url || "", section: section || "",
        profileId: profile?.[1] || null, profileVersion: profile?.[2] || null } : null,
      population,
      context: age ? { ageYears: Number(age[1].replace(",", ".")) } : null,
    };
  }

  // The old measured-clearance body has a readable reference but no general
  // typed capture. Accept its assessment only when the unrounded measurement
  // still matches exactly; otherwise retain the ordinary legacy record.
  function savedMeasuredAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    const start = body.indexOf("Klirens kreatyniny — dane użyte w chwili zapisu:");
    if (start < 0 || body.length > 50000) return null;
    const content = body.slice(start), lab = object(note.labResult) || {};
    const raw = /^Wynik przed zaokrągleniem: ([\d.,eE+-]+) mL\/min\.$/m.exec(content);
    const value = raw ? toNumber(raw[1]) : NaN;
    const measurement = recordedMeasurement(lab);
    const norm = /^Norma pokazana przy wyniku: ([^\n]+)\.$/m.exec(content)?.[1] || "";
    if (!Number.isFinite(value) || measurement.comparator || measurement.rawValue !== value ||
      lab.unit !== "mL/min" || normalizedText(lab.norm) !== normalizedText(norm)) return null;
    const label = /^Ocena względem wybranego zakresu: (w zakresie|poniżej zakresu|powyżej zakresu)\.$/m.exec(content)?.[1];
    const status = ({ "w zakresie": "within", "poniżej zakresu": "below", "powyżej zakresu": "above" })[label];
    if (!status) return null;
    const metadata = bodyMetadata(content);
    const patient = /^Dane pacjenta: ([^\n]+)\.$/m.exec(content)?.[1] || "";
    const age = /(?:^|; )wiek ([\d.,]+) lat(?:;|$)/.exec(patient);
    const absolute = /^Zakres po przeliczeniu na jednostkę wyniku, przed zaokrągleniem granic: ([^\n]+)\.$/m.exec(content)?.[1];
    const duration = /^Rzeczywisty czas zbiórki: ([\d.,]+) h/m.exec(content);
    return { rawValue: value, unit: "mL/min", status, source: metadata.source,
      population: metadata.population, contextNote: content,
      context: { ageYears: age ? toNumber(age[1]) : null,
        sex: patient.includes("płeć żeńska") ? "F" : patient.includes("płeć męska") ? "M" : null,
        durationHours: duration ? toNumber(duration[1]) : null },
      reference: { bounds: absolute ? referenceBounds(absolute, "mL/min") : null },
    };
  }

  function noteEntry(note) {
    const lab = object(note.labResult) || {};
    const oxLabel = global.ClcrOxcrPersistence?.canonicalLabel(lab.test) || lab.test;
    const label = global.ClcrCitcrPersistence?.canonicalLabel(oxLabel) || oxLabel;
    // Exact known labels are the backward-compatible identity. A key may
    // recover an unlabelled note, but never overrides a conflicting label.
    const known = getParamByLabel(label) || (!text(label) ? getParam(lab.testKey) : null);
    if (known) return known;
    const capture = savedCalculation(note);
    return capture?.valid ? getParam(capture.parameterKey) : null;
  }

  function staleAssessment(note, formulaId, assessment) {
    if (assessment) return false;
    const header = HEADER_BY_FORMULA[formulaId];
    if (header && typeof note.body === "string" && note.body.includes(header)) return true;
    const helper = global[HELPER_BY_FORMULA[formulaId]];
    return !!(helper && typeof helper.hasSavedAssessment === "function" && helper.hasSavedAssessment(note));
  }

  function savedCalculation(note) {
    const helper = global.ClcrSavedCalculation;
    if (!helper || typeof helper.readSaved !== "function") return null;
    try { return helper.readSaved(note); } catch (_) { return null; }
  }

  function hasSavedCalculation(note) {
    const helper = global.ClcrSavedCalculation;
    try {
      if (helper && typeof helper.hasSaved === "function" && helper.hasSaved(note)) return true;
    } catch (_) { /* Unreadable capture cannot restore a previous assessment. */ }
    // Recognition only, not a competing envelope decoder. An unavailable or
    // future capture helper must fail closed while leaving the result visible.
    return typeof note.body === "string" && note.body.includes("[VILDA_CLCR_CALCULATION_");
  }

  function applySavedCalculation(point, capture, hasCapture) {
    point.savedCalculation = capture;
    if (!capture?.valid) {
      if (!hasCapture) return point;
      ASSESSMENT_FIELDS.forEach(field => { delete point[field]; });
      Object.assign(point, { status: capture?.invalidated ? "invalidated" : "unavailable", frozenAssessment: null, norm: "", source: null,
        context: null, assessment: "unassessed", category: null, outOfRange: null, tone: "neutral",
        interpretation: capture?.invalidated ? "Zapisana ocena wymaga ponownego obliczenia" : "Zapisana ocena niedostępna",
        reference: { text: "", bounds: null, kind: "none", source: null, population: null } });
      return point;
    }
    const comparator = text(capture.comparator);
    const valueNum = comparator ? null : Number.isFinite(capture.valueNum) ? capture.valueNum : null;
    const norm = text(capture.norm);
    const reference = object(capture.reference);
    const source = object(capture.source) || object(reference?.source);
    const assessment = ["within", "below", "above"].includes(capture.assessment) ? capture.assessment : "unassessed";
    Object.assign(point, {
      status: "recorded", frozenAssessment: object(capture.snapshot),
      rawValue: Number.isFinite(capture.rawValue) ? capture.rawValue : point.rawValue,
      valueNum, displayValue: text(capture.displayValue) || point.displayValue,
      comparator, kind: comparator ? "censored" : valueNum === null ? "text" : "exact",
      unit: text(capture.unit) || point.unit,
      basis: typeof capture.basis === "string" ? capture.basis : point.basis ?? null,
      norm, source, context: object(capture.context), inputs: object(capture.inputs),
      assessment, category: capture.category || null,
      outOfRange: typeof capture.outOfRange === "boolean" ? capture.outOfRange : assessment === "unassessed" ? null : assessment !== "within",
      tone: ["success", "warning", "danger", "neutral"].includes(capture.tone) ? capture.tone : "neutral",
      boundary: text(capture.boundary),
      interpretation: text(capture.interpretation) || text(capture.statusText) || ({
        within: "W zapisanym zakresie", below: "Poniżej zapisanego zakresu", above: "Powyżej zapisanego zakresu",
      })[assessment] || "Brak zapisanej oceny",
      reference: { text: norm, bounds: reference?.bounds || referenceBounds(norm, text(capture.unit) || point.unit),
        kind: reference?.kind || (norm ? "recorded-range" : "none"), source,
        population: reference?.population || null,
        profileId: reference?.profileId || null, profileVersion: reference?.profileVersion ?? null },
    });
    if (["AGu_spot", "TMP_GFR", "pH_spot", "UA_mgkg", "Ca_mgkg", "Mg_mgkg", "PO4_mgkg", "Prot_mgkg", "Na_mmol_d", "K_mmol_d"].includes(capture.formulaId)) Object.assign(point, {
      calculationMethod: capture.calculationMethod || point.calculationMethod,
      comment: text(capture.comment), knownFacts: object(capture.knownFacts),
      contextReferences: Array.isArray(capture.contextReferences) ? capture.contextReferences : [],
    });
    return point;
  }

  function enrichPoint(note, entry, legacy) {
    const lab = object(note.labResult) || {};
    const measured = recordedMeasurement(lab);
    const base = object(legacy) || {};
    let frozen = ASSESSMENT_FIELDS.map(field => object(base[field])).find(Boolean) ||
      (entry?.sourceFormulaId === "cl24" ? savedMeasuredAssessment(note) : null);
    if (entry?.sourceFormulaId === "ACR" && frozen) {
      const recordedNorm = /^Norma pokazana przy wyniku: ([^\n]+)\.$/m.exec(typeof note.body === "string" ? note.body : "")?.[1] || "";
      if (normalizedText(recordedNorm) !== normalizedText(lab.norm)) frozen = null;
    }
    const isStale = staleAssessment(note, entry?.sourceFormulaId, frozen);
    const metadata = bodyMetadata(typeof note.body === "string" ? note.body : "");
    const point = {
      ...base,
      id: note.id || null, noteId: note.id || null, patientId: note.patientId || null,
      baseRev: Number.isFinite(note.rev) ? note.rev : null, note,
      dateISO: normalizeDateISO(note.clinicalDateISO) || "", dateSource: normalizeDateISO(note.clinicalDateISO) ? "badanie" : "unknown",
      createdAtISO: text(note.createdAtISO) || null, updatedAtISO: text(note.updatedAtISO) || null,
      rawText: measured.rawText, rawValue: measured.rawValue,
      valueNum: measured.valueNum, kind: measured.kind,
      displayValue: measured.displayValue, comparator: measured.comparator,
      unit: text(lab.unit) || entry?.unit || "", originalUnit: text(lab.unit) || "",
      norm: isStale ? "" : text(lab.norm),
      assessment: "unassessed", category: null, outOfRange: null, tone: "neutral",
      status: isStale ? "invalidated" : "legacy", frozenAssessment: null,
      source: null, context: null, interpretation: isStale ? "Zapisana ocena wymaga ponownego obliczenia" : "Brak zapisanej oceny",
    };
    if (isStale) ASSESSMENT_FIELDS.forEach(field => { delete point[field]; });
    if (frozen && !isStale) {
      point.frozenAssessment = frozen;
      point.status = "recorded";
      point.rawValue = Number.isFinite(frozen.rawValue) ? frozen.rawValue : measured.rawValue;
      point.displayValue = text(base.displayValue) || measured.displayValue;
      point.comparator = base.comparator || frozen.comparator || "";
      point.valueNum = point.comparator ? null : Number.isFinite(base.valueNum) ? base.valueNum : measured.valueNum;
      point.kind = point.comparator ? "censored" : Number.isFinite(point.valueNum) ? "exact" : "text";
      point.unit = text(base.unit) || point.unit;
      point.originalUnit = frozen.originalUnit || point.originalUnit;
      point.basis = typeof base.basis === "string" ? base.basis : typeof frozen.basis === "string" ? frozen.basis : null;
      point.assessment = ["within", "below", "above"].includes(base.assessment) ? base.assessment
        : ["within", "below", "above"].includes(frozen.status) ? frozen.status : "unassessed";
      point.category = base.category || null;
      point.outOfRange = point.assessment === "unassessed" ? null : point.assessment !== "within";
      point.tone = ["success", "warning", "danger", "neutral"].includes(frozen.tone) ? frozen.tone
        : point.outOfRange === true ? "warning" : point.assessment === "within" ? "success" : "neutral";
      point.norm = text(base.norm);
      point.source = object(frozen.source) || object(frozen.reference?.source) || metadata.source;
      point.context = object(frozen.context) || (Number.isFinite(frozen.ageYears) ? { ageYears: frozen.ageYears } : metadata.context);
      point.interpretation = text(frozen.interpretation) || text(frozen.statusText) || ({
        within: "W zapisanym zakresie", below: "Poniżej zapisanego zakresu", above: "Powyżej zapisanego zakresu",
      })[point.assessment] || "Brak zapisanej oceny";
    } else if (!isStale && !["FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot", "AGu_spot", "pH_spot", "UA_mgkg", "Ca_mgkg", "Mg_mgkg", "PO4_mgkg", "Prot_mgkg", "Na_mmol_d", "K_mmol_d"].includes(entry?.sourceFormulaId)) {
      if (typeof note.body === "string" && note.body.includes("wynik poza zakresem")) {
        point.outOfRange = true; point.tone = "warning"; point.interpretation = "Poza zapisanym zakresem";
      }
    }
    if (!frozen && !isStale && text(base.displayValue)) {
      point.displayValue = text(base.displayValue);
      point.basis = typeof base.basis === "string" ? base.basis : null;
      point.originalUnit = base.originalUnit || point.originalUnit;
    }
    if (["FENa_spot", "FECl_spot", "FEHCO3_spot", "AGu_spot"].includes(entry?.sourceFormulaId)) {
      point.norm = ""; point.assessment = "unassessed"; point.category = null; point.outOfRange = null; point.tone = "neutral";
    }
    if (["AGu_spot", "TMP_GFR", "pH_spot", "UA_mgkg", "Ca_mgkg", "Mg_mgkg", "PO4_mgkg", "Prot_mgkg", "Na_mmol_d", "K_mmol_d"].includes(entry?.sourceFormulaId) && frozen && !isStale) Object.assign(point, {
      comment: (frozen.cautions || []).filter(item => typeof item === "string").join(" "),
      knownFacts: object(frozen.knownFacts) || object(frozen.input?.knownFacts), contextReferences: frozen.references || [],
    });
    if (["FEK_spot", "TMP_GFR", "pH_spot", "UA_mgkg", "Ca_mgkg", "Mg_mgkg", "PO4_mgkg", "Prot_mgkg", "Na_mmol_d", "K_mmol_d"].includes(entry?.sourceFormulaId) && !frozen) point.norm = "";
    if (entry?.sourceFormulaId === "TMP_GFR") {
      point.calculationMethod = !isStale && frozen?.method || "legacy-unknown";
      if (!frozen) Object.assign(point, { assessment: "unassessed", outOfRange: null, tone: "neutral" });
    }
    if (entry?.sourceFormulaId === "pH_spot" && frozen && !isStale) {
      const sources = (frozen.reference?.sourceIds || []).map(id => frozen.sources?.find(item => item.id === id)).filter(Boolean);
      point.source = sources.length === 1 ? sources[0] : sources.length ? { ids: sources.map(item => item.id), label: sources.map(item => item.label).join(" · "), sources } : null;
      point.context = { newbornContext: frozen.input?.newbornContext ?? null };
    }
    if (entry?.sourceFormulaId === "PO4_mgkg" && !frozen) Object.assign(point, { assessment: "unassessed", outOfRange: null, tone: "neutral", norm: "" });
    if (entry?.sourceFormulaId === "PO4_mgkg" && frozen && !isStale) {
      const sources = (frozen.reference?.sourceIds || []).map(id => frozen.sources?.find(item => item.id === id)).filter(Boolean);
      point.source = sources.length === 1 ? sources[0] : sources.length ? { ids: sources.map(item => item.id), label: sources.map(item => item.label).join(" · "), sources } : null;
      point.rawValue = global.ClcrPo4DzmPersistence.valueNum(frozen);
      point.basis = frozen.chemicalBasis;
      point.context = { ageYears: frozen.input?.ageYears ?? null, sex: frozen.input?.sex ?? null, weightKg: frozen.input?.weightKg ?? null, hours: frozen.input?.hours ?? null, chemicalBasis: frozen.chemicalBasis || "", durationSource: frozen.input?.durationSource || "" };
    }
    const po4DzmBounds = entry?.sourceFormulaId === "PO4_mgkg" && !isStale && frozen?.referenceActive === true && frozen.reference
      ? { low: Number.isFinite(frozen.presentation.lower) ? frozen.presentation.lower : null, high: Number.isFinite(frozen.presentation.upper) ? frozen.presentation.upper : null, lowInclusive: frozen.reference.lowerInclusive === true, highInclusive: frozen.reference.upperInclusive === true } : null;
    if (entry?.sourceFormulaId === "Prot_mgkg" && !frozen) Object.assign(point, { assessment: "unassessed", outOfRange: null, tone: "neutral", norm: "" });
    if (entry?.sourceFormulaId === "Prot_mgkg" && frozen && !isStale) {
      const sources = (frozen.reference?.sourceIds || []).map(id => frozen.sources?.find(item => item.id === id)).filter(Boolean);
      point.source = sources.length === 1 ? sources[0] : sources.length ? { ids: sources.map(item => item.id), label: sources.map(item => item.label).join(" · "), sources } : null;
      point.rawValue = global.ClcrProteinDzmPersistence.valueNum(frozen);
      point.context = { ageYears: frozen.input?.ageYears ?? null, sex: frozen.input?.sex ?? null, weightKg: frozen.input?.weightKg ?? null, hours: frozen.input?.hours ?? null, heightCm: frozen.input?.heightCm ?? null, bsaM2: frozen.bsaM2 ?? frozen.reference?.bsa ?? null, durationSource: frozen.input?.durationSource || "" };
    }
    const proteinDzmBounds = entry?.sourceFormulaId === "Prot_mgkg" && !isStale && frozen?.referenceActive === true && frozen.reference
      ? { low: Number.isFinite(frozen.presentation.lower) ? frozen.presentation.lower : null, high: Number.isFinite(frozen.presentation.upper) ? frozen.presentation.upper : null, lowInclusive: frozen.reference.lowerInclusive === true, highInclusive: frozen.reference.upperInclusive === true } : null;
    if (entry?.sourceFormulaId === "Na_mmol_d" && !frozen) Object.assign(point, { assessment: "unassessed", outOfRange: null, tone: "neutral", norm: isStale ? "" : text(lab.norm) });
    if (entry?.sourceFormulaId === "Na_mmol_d" && frozen && !isStale) {
      const sources = (frozen.reference?.sourceIds || []).map(id => frozen.sources?.find(item => item.id === id)).filter(Boolean);
      point.source = sources.length === 1 ? sources[0] : sources.length ? { ids: sources.map(item => item.id), label: sources.map(item => item.label).join(" · "), sources } : null;
      point.rawValue = global.ClcrSodiumDzmPersistence.valueNum(frozen);
      point.context = { ageYears: frozen.input?.ageYears ?? null, sex: frozen.input?.sex ?? null, hours: frozen.input?.hours ?? null, durationSource: frozen.input?.durationSource || "" };
    }
    const sodiumDzmBounds = entry?.sourceFormulaId === "Na_mmol_d" && !isStale && frozen?.referenceAvailable === true && frozen.reference
      ? { low: Number.isFinite(frozen.presentation.lower) ? frozen.presentation.lower : null, high: Number.isFinite(frozen.presentation.upper) ? frozen.presentation.upper : null, lowInclusive: frozen.reference.lowerInclusive === true, highInclusive: frozen.reference.upperInclusive === true } : null;
    if (entry?.sourceFormulaId === "K_mmol_d" && !frozen) Object.assign(point, { assessment: "unassessed", outOfRange: null, tone: "neutral", norm: isStale ? "" : text(lab.norm) });
    if (entry?.sourceFormulaId === "K_mmol_d" && frozen && !isStale) {
      const sources = (frozen.reference?.sourceIds || []).map(id => frozen.sources?.find(item => item.id === id)).filter(Boolean);
      point.source = sources.length === 1 ? sources[0] : sources.length ? { ids: sources.map(item => item.id), label: sources.map(item => item.label).join(" · "), sources } : null;
      point.rawValue = global.ClcrPotassiumDzmPersistence.valueNum(frozen);
      point.boundary = global.ClcrPotassiumDzmPersistence.boundaryText(frozen);
      point.context = { ageYears: frozen.input?.ageYears ?? null, sex: frozen.input?.sex ?? null, hours: frozen.input?.hours ?? null, durationSource: frozen.input?.durationSource || "" };
    }
    const potassiumDzmBounds = entry?.sourceFormulaId === "K_mmol_d" && !isStale && frozen?.referenceAvailable === true && frozen.reference
      ? { low: Number.isFinite(frozen.presentation.lower) ? frozen.presentation.lower : null, high: Number.isFinite(frozen.presentation.upper) ? frozen.presentation.upper : null, lowInclusive: frozen.reference.lowerInclusive === true, highInclusive: frozen.reference.upperInclusive === true } : null;
    if (entry?.sourceFormulaId === "Mg_mgkg" && !frozen) Object.assign(point, { assessment: "unassessed", outOfRange: null, tone: "neutral", norm: "" });
    if (entry?.sourceFormulaId === "Mg_mgkg" && frozen && !isStale) {
      const sources = (frozen.reference?.sourceIds || []).map(id => frozen.sources?.find(item => item.id === id)).filter(Boolean);
      point.source = sources.length === 1 ? sources[0] : sources.length ? { ids: sources.map(item => item.id), label: sources.map(item => item.label).join(" · "), sources } : null;
      point.context = { ageYears: frozen.input?.ageYears ?? null, sex: frozen.input?.sex ?? null, weightKg: frozen.input?.weightKg ?? null, hours: frozen.input?.hours ?? null, heightCm: frozen.input?.heightCm ?? null, bsaM2: frozen.bsaM2 ?? null, bsaMethod: frozen.bsaMethod || "", durationSource: frozen.input?.durationSource || "" };
    }
    const mgDzmBounds = entry?.sourceFormulaId === "Mg_mgkg" && !isStale && frozen?.referenceActive === true && frozen.reference
      ? { low: Number.isFinite(frozen.reference.lower) ? frozen.reference.lower : null, high: Number.isFinite(frozen.reference.upper) ? frozen.reference.upper : null, lowInclusive: frozen.reference.lowerInclusive === true, highInclusive: frozen.reference.upperInclusive === true } : null;
    if (entry?.sourceFormulaId === "Ca_mgkg" && !frozen) Object.assign(point, { assessment: "unassessed", outOfRange: null, tone: "neutral", norm: "" });
    if (entry?.sourceFormulaId === "Ca_mgkg" && frozen && !isStale) {
      const sources = (frozen.reference?.sourceIds || []).map(id => frozen.sources?.find(item => item.id === id)).filter(Boolean);
      point.source = sources.length === 1 ? sources[0] : sources.length ? { ids: sources.map(item => item.id), label: sources.map(item => item.label).join(" · "), sources } : null;
      point.context = { ageYears: frozen.input?.ageYears ?? null, sex: frozen.input?.sex ?? null, weightKg: frozen.input?.weightKg ?? null, hours: frozen.input?.hours ?? null, clinicalContext: frozen.input?.clinicalContext ?? "general" };
    }
    const caDzmBounds = entry?.sourceFormulaId === "Ca_mgkg" && !isStale && frozen?.referenceActive === true && frozen.reference
      ? { low: Number.isFinite(frozen.reference.lower) ? frozen.reference.lower : null, high: frozen.reference.upper, lowInclusive: frozen.reference.lowerInclusive === true, highInclusive: frozen.reference.upperInclusive === true } : null;
    if (entry?.sourceFormulaId === "UA_mgkg" && !frozen) Object.assign(point, { assessment: "unassessed", outOfRange: null, tone: "neutral", norm: "" });
    if (entry?.sourceFormulaId === "UA_mgkg" && frozen && !isStale) {
      const sources = (frozen.reference?.sourceIds || []).map(id => frozen.sources?.find(item => item.id === id)).filter(Boolean);
      point.source = sources.length === 1 ? sources[0] : sources.length ? { ids: sources.map(item => item.id), label: sources.map(item => item.label).join(" · "), sources } : null;
      point.context = { ageYears: frozen.input?.ageYears ?? null, sex: frozen.input?.sex ?? null, weightKg: frozen.input?.weightKg ?? null, hours: frozen.input?.hours ?? null };
    }
    const uaBounds = entry?.sourceFormulaId === "UA_mgkg" && !isStale && frozen?.referenceActive === true && frozen.reference
      ? { low: Number.isFinite(frozen.reference.lower) ? frozen.reference.lower : null, high: frozen.reference.upper, lowInclusive: frozen.reference.lowerInclusive === true, highInclusive: frozen.reference.upperInclusive === true } : null;
    const phBounds = entry?.sourceFormulaId === "pH_spot" && !isStale && frozen?.referenceActive === true && frozen.reference
      ? { low: frozen.reference.lower, high: frozen.reference.upper, lowInclusive: frozen.reference.lowerInclusive, highInclusive: frozen.reference.upperInclusive } : null;
    const bounds = potassiumDzmBounds || sodiumDzmBounds || proteinDzmBounds || po4DzmBounds || mgDzmBounds || caDzmBounds || uaBounds || phBounds || object(frozen?.reference?.bounds) || referenceBounds(point.norm, point.unit);
    point.source = point.source || (!isStale && frozen ? metadata.source : null);
    point.reference = { text: point.norm, bounds, kind: frozen?.reference?.kind === "criterion" && !isStale ? "recorded-criterion" : bounds ? bounds.low === null || bounds.high === null ? "recorded-threshold" : "recorded-range" : "none",
      source: point.source, population: isStale ? null : frozen?.population || metadata.population || null,
      profileId: isStale ? null : frozen?.profileId || frozen?.policy?.id || metadata.source?.profileId || null,
      profileVersion: isStale ? null : frozen?.profileVersion ?? frozen?.policy?.version ?? metadata.source?.profileVersion ?? null };
    // The capture owner validates a newer full record against this note. It
    // may enrich this projection, but reading it must never call recalculate.
    return applySavedCalculation(point, savedCalculation(note), hasSavedCalculation(note));
  }

  function buildSeriesFromNotes(notes, options) {
    const opts = options || {}, target = resolveTargetFormulaSet(opts);
    const accepted = [], seen = new Set();
    for (const note of Array.isArray(notes) ? notes : []) {
      if (!object(note) || note.category !== CATEGORY || !object(note.labResult)) continue;
      if (opts.patientId && note.patientId !== opts.patientId) continue;
      if (note.id && seen.has(note.id)) continue;
      const entry = noteEntry(note);
      if (target && (!entry || !target.has(entry.sourceFormulaId))) continue;
      if (note.id) seen.add(note.id);
      accepted.push(note);
    }
    const legacy = legacySeriesFromNotes(accepted, { allParams: true });
    const pointById = new Map();
    legacy.forEach(series => series.points.forEach(point => { if (point.noteId) pointById.set(point.noteId, { series, point }); }));
    const grouped = new Map();
    accepted.forEach(note => {
      const found = pointById.get(note.id), entry = noteEntry(note);
      const point = enrichPoint(note, entry, found?.point);
      const label = entry?.label || text(note.labResult.test) || text(note.title) || "Wynik Klirensu";
      const displayLabel = found?.series.displayLabel || label;
      const parameterKey = entry?.testKey || null;
      const identity = parameterKey || `unknown:${label}`;
      // Every native unit is its own axis. Chemical basis is retained even
      // for legacy unknown-basis records; no current conversion is attempted.
      const basis = typeof point.basis === "string" ? point.basis : (["OxCr_spot", "CitCr_spot"].includes(entry?.sourceFormulaId) ?
        global[HELPER_BY_FORMULA[entry.sourceFormulaId]]?.savedBasis?.(note, point.unit) ?? "unknown" : "");
      point.basis = basis;
      // Direct Brodehl and Walton–Bijvoet/Payne are different methods; their
      // transition must never appear as a biological rise in a single curve.
      const calculationMethod = entry?.sourceFormulaId === "TMP_GFR" ? point.calculationMethod || "legacy-unknown" : null;
      const key = JSON.stringify([identity, normalizedUnit(point.unit), basis, ...(calculationMethod ? [calculationMethod] : [])]);
      if (!grouped.has(key)) grouped.set(key, {
        key, seriesKey: key, label, displayLabel: calculationMethod ? `${label} · ${calculationMethod === "legacy-unknown" ? "metoda nieutrwalona" : calculationMethod}` : displayLabel, method: calculationMethod || entry?.method || null,
        unit: point.unit, basis: point.basis, id: entry?.id || null, parameterKey,
        group: entry?.group || null, sourceFormulaId: entry?.sourceFormulaId || null, points: [], norm: "",
      });
      grouped.get(key).points.push(point);
    });
    const series = Array.from(grouped.values());
    series.forEach(group => {
      group.points.sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));
      group.norm = group.points[group.points.length - 1]?.norm || "";
    });
    return series;
  }

  function projectPatientNotes(notes, options) {
    const series = buildSeriesFromNotes(notes, options);
    const measurements = series.flatMap(group => group.points.map(point => ({
      ...point, parameterKey: group.parameterKey, sourceFormulaId: group.sourceFormulaId,
      label: group.label, displayLabel: group.displayLabel, method: group.method,
      group: group.group, seriesKey: group.key,
    })));
    return { series, measurements, handledNoteIds: measurements.map(point => point.noteId).filter(Boolean) };
  }

  return Object.freeze({
    version: "1.0.0", CATEGORY, PARAM_DICTIONARY, PARAM_GROUPS,
    getParam, getParamByLabel, getParamGroups, normalizeTestKey, buildSeriesFromNotes, projectPatientNotes,
    buildLegacySeriesFromNotes: legacySeriesFromNotes,
    readAcrSnapshot, readPcrSnapshot, readCacrSnapshot, acrDisplayText,
    acrReferenceNote, pcrReferenceNote, cacrReferenceNote, measuredReferenceNote,
    savedAcrAssessment, savedPcrAssessment, savedCacrAssessment, savedMeasuredAssessment, referenceBounds, buildPatientNotePayload,
  });
});
