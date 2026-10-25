(function (root, factory) {
  const api = factory();
  if (root) root.ClcrFehco3Persistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const NOTE_HEADER = "FEHCO₃ — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr-fehco3-percent";
  const LABEL = "Frakcja wydalania HCO₃ (FEHCO₃)";
  const TREE_HEADER = "Utrwalone dane oceny FEHCO₃:";
  const TREE_END = "Koniec utrwalonych danych FEHCO₃.";
  const STATUS = ["unassessed"];
  const TONES = ["warning", "neutral"];
  const SAMPLE = ["assumed", "confirmed", "different"];
  const FACTS = ["diureticUse", "knownCKD", "knownAKI", "rapidlyChangingCreatinine", "bicarbonateLoad"];
  // Readable, reversible labels keep the original assessment in the vault's
  // existing note body. History never calls today's engine or policy. Each
  // leaf carries its type so that a string input does not become a number or
  // an unknown fact a false answer. There is no opaque JSON assessment blob.
  const LABELS = Object.freeze({
    minimumMonths: "Najmniejszy możliwy wiek w miesiącach", maximumMonths: "Największy możliwy wiek w miesiącach", maximumExclusive: "Górna granica możliwego wieku wyłączona",
    rawYears: "Oryginalny zapis lat", rawMonths: "Oryginalny zapis miesięcy", rawDays: "Oryginalny zapis dni życia", category: "Kategoria porównania",
    inputHelp: "Pomoc przy wpisywaniu HCO₃", bloodReport: "Parametr z raportu krwi", urineReport: "Parametr z raportu moczu", loading: "Ograniczenie kontekstu obciążenia",
    educationalReferences: "Profile opisane w Szczegółach", referenceLabel: "Etykieta porównania", referenceText: "Tekst punktu odniesienia", referenceHint: "Zakres zastosowania porównania",
    evidence: "Zweryfikowana postać źródła",
    ageReferenceIntervalAvailable: "Dostępny przedział referencyjny wieku", diagnosesAKI: "Samodzielne rozpoznanie AKI", diagnosticCriterionIsReferenceInterval: "Kryterium diagnostyczne uznane za normę", descriptiveIQRIsReferenceInterval: "Opisowy IQR uznany za normę",
    scope: "Zakres źródeł kalkulatora", diagnosticContext: "Kontekst kryterium diagnostycznego", lowerValue: "Znaczenie małej wartości", higherValue: "Znaczenie większej wartości", confounders: "Czynniki ograniczające", diagnosis: "Ograniczenia rozpoznań", noPolicy: "Brak polityki opisu",

    universalNormalRangeAvailable: "Uniwersalna norma dostępna", excludesProximalRTA: "Samodzielne wykluczenie proksymalnej kwasicy cewkowej", diagnosesEtiology: "Samodzielne rozpoznanie przyczyny",
    supportsTreatmentDecisionAlone: "Samodzielna decyzja terapeutyczna", unknownFactsAreConfirmedAbsent: "Nieznany fakt uznany za nieobecny", assayStandardizationRequired: "Potwierdzenie standaryzacji wymagane",
    stableKidneyFunctionAssumed: "Stabilna czynność nerek założona", noAKIAssumed: "Brak AKI założony", sameUrineSpecimenRequired: "Wspólna próbka moczu wymagana", contemporaneousBloodRequired: "Równoczesna krew wymagana",
    group: "Grupa wieku", schema: "Schemat oceny", version: "Wersja schematu", engineVersion: "Wersja obliczenia", valid: "Poprawne obliczenie",
    rawValue: "Wynik przed zaokrągleniem", unit: "Jednostka wyniku", exactValue: "Dokładny iloraz", numerator: "Licznik", denominator: "Mianownik",
    input: "Dane wejściowe", urineBicarbonate: "Wodorowęglany w moczu", serumBicarbonate: "Wodorowęglany we krwi", urineBicarbonateUnit: "Jednostka wodorowęglanów w moczu", serumBicarbonateUnit: "Jednostka wodorowęglanów we krwi", urineCreatinine: "Kreatynina w moczu", serumCreatinine: "Kreatynina w surowicy",
    urineCreatinineUnit: "Jednostka kreatyniny w moczu", serumCreatinineUnit: "Jednostka kreatyniny w surowicy", ageYears: "Wiek w latach",
    ageContext: "Dokładność wieku", years: "Podane lata", months: "Podane miesiące", daysOfLife: "Dni życia", totalMonths: "Wiek w miesiącach", exactYears: "Wiek obliczony w latach",
    precision: "Rozdzielczość wieku", minMonths: "Dolna granica wieku w miesiącach", maxMonthsExclusive: "Wyłączona górna granica wieku w miesiącach",
    sameUrineSpecimen: "Ta sama próbka moczu", pairedSameTime: "Równoczesna próbka krwi", diureticUse: "Leczenie diuretykiem", knownCKD: "Przewlekła choroba nerek",
    knownAKI: "Podane AKI", rapidlyChangingCreatinine: "Szybko zmieniająca się kreatynina",
    bicarbonateLoad: "Podanie wodorowęglanu w teście", protocol: "Znany kontekst testu", completion: "Ocena ukończenia protokołu", comparisonActive: "Aktywna klasyfikacja testu",
    diagnosticBands: "Warunkowe progi testu", referenceKind: "Rodzaj profilu źródłowego", sourceId: "Identyfikator źródła progów", condition: "Warunki zastosowania progów", caution: "Ograniczenie stosowania progów", bands: "Pasma diagnostyczne", title: "Tytuł profilu",
    loadingPerformedAssumed: "Wykonanie obciążenia założone", loadingProtocolCompleteAssumed: "Ukończenie protokołu założone", serumReferenceIsFEReference: "Norma stężenia krwi uznana za normę FE", diagnosesProximalRTA: "Samodzielne rozpoznanie proksymalnej kwasicy cewkowej",
    display: "Prezentacja wyniku", text: "Pokazany tekst", boundary: "Opis dokładności granicznej", status: "Ocena porównania", statusText: "Opis oceny", tone: "Kolor oceny", outOfRange: "Poza zakresem",
    context: "Kontekst kliniczny", label: "Nazwa", referenceAvailable: "Dostępny punkt odniesienia", referenceActive: "Aktywne porównanie", reference: "Pierwszy punkt odniesienia", references: "Punkty odniesienia",
    id: "Identyfikator", kind: "Rodzaj odniesienia", lower: "Dolna granica", upper: "Górna granica", lowerInclusive: "Dolna granica włączona", upperInclusive: "Górna granica włączona", active: "Aktywny profil",
    population: "Populacja odniesienia", sourceIds: "Identyfikatory źródeł", ageLabel: "Przedział wieku", sample: "Pochodzenie próbek", knownFacts: "Znane informacje",
    cautions: "Uwagi do oceny", interpretation: "Interpretacja wyniku", sources: "Źródła medyczne", policy: "Polityka interpretacji", conversion: "Przeliczenie jednostek",
    creatinineUmolPerMgDl: "Mikromole kreatyniny na mg/dL", restrictions: "Ograniczenia interpretacji", notes: "Zasady zastosowania", errorCode: "Kod błędu", error: "Opis błędu",
    url: "Adres źródła", locator: "Miejsce w źródle", doi: "DOI", minimumAgeYears: "Minimalny wiek w latach", maximumAgeYears: "Maksymalny wiek w latach",
    minimumAgeMonths: "Minimalny wiek w miesiącach", maximumAgeMonths: "Maksymalny wiek w miesiącach", minimumAgeMonthsInclusive: "Minimalny wiek miesięczny włączony",
    maximumAgeMonthsInclusive: "Maksymalny wiek miesięczny włączony", lowerPercentile: "Dolny percentyl", upperPercentile: "Górny percentyl", source: "Pochodzenie wieku",
  });
  const REVERSE = Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [label, key]));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const clean = value => Array.from(String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[\u00a0\u202f]/g, " ")).filter(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127).join("").trim();
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  function displayText(snapshot) { return clean(snapshot?.display?.text) || (Number.isFinite(snapshot?.rawValue) ? String(snapshot.rawValue).replace(".", ",") : ""); }
  function comparator(snapshot) { return /^\s*([<>]=?|[≤≥])/.exec(displayText(snapshot))?.[1] || ""; }
  function normText() { return ""; }
  function validSnapshot(value) {
    if (!isObject(value) || value.schema !== "clcr-fehco3" || value.version !== 1 || value.valid !== true || value.unit !== "%") return false;
    if (!Number.isFinite(value.rawValue) || value.rawValue < 0 || !STATUS.includes(value.status) || !TONES.includes(value.tone)) return false;
    if (value.outOfRange !== null && typeof value.outOfRange !== "boolean") return false;
    if (typeof value.referenceActive !== "boolean" || typeof value.referenceAvailable !== "boolean" || typeof value.context !== "string" || typeof value.interpretation !== "string") return false;
    const exact = value.exactValue;
    if (!isObject(exact) || typeof exact.numerator !== "string" || typeof exact.denominator !== "string" || !/^[0-9]+$/.test(exact.numerator) || !/^[1-9][0-9]*$/.test(exact.denominator) || exact.numerator.length > 6000 || exact.denominator.length > 6000) return false;
    if ((value.rawValue === 0) !== /^0+$/.test(exact.numerator)) return false;
    if (!isObject(value.input) || !isObject(value.sample) || !isObject(value.knownFacts) || !isObject(value.display) || typeof value.display.text !== "string" || typeof value.display.boundary !== "string" || !displayText(value)) return false;
    if (!Array.isArray(value.cautions) || value.cautions.some(text => typeof text !== "string")) return false;
    for (const key of ["urineBicarbonate", "serumBicarbonate", "urineCreatinine", "serumCreatinine"]) {
      const input = value.input[key], text = String(input).trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
      if (!["string", "number"].includes(typeof input) || !text || text.length > 256 || !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return false;
      const number = Number(text);
      if (!Number.isFinite(number) || number < 0 || key !== "urineBicarbonate" && number === 0) return false;
    }
    for (const key of ["urineBicarbonateUnit", "serumBicarbonateUnit"]) if (typeof value.input[key] !== "string" || !["mmol/l", "meq/l"].includes(value.input[key].trim().toLowerCase())) return false;
    const units = ["mg/dl", "mg/l", "umol/l", "mmol/l", "umol", "mmol"];
    for (const key of ["urineCreatinineUnit", "serumCreatinineUnit"]) if (typeof value.input[key] !== "string" || !units.includes(value.input[key].trim().replace(/[µμ]/g, "u").toLowerCase())) return false;
    if (value.input.ageYears !== null && (!Number.isFinite(value.input.ageYears) || value.input.ageYears < 0)) return false;
    for (const key of ["sameUrineSpecimen", "pairedSameTime"]) if (!SAMPLE.includes(value.sample[key]) || value.sample[key] === "different") return false;
    for (const key of FACTS) if (value.knownFacts[key] !== null && typeof value.knownFacts[key] !== "boolean") return false;
    if (!isObject(value.protocol) || value.protocol.bicarbonateLoad !== value.knownFacts.bicarbonateLoad || value.protocol.completion !== "not-assessed" || value.protocol.comparisonActive !== false) return false;
    // No qualified spot-FEHCO₃ age interval is currently enabled. Frozen
    // assessments cannot acquire a fabricated norm, category or normal tone.
    if (value.referenceAvailable !== false || value.referenceActive !== false || value.reference !== null || !Array.isArray(value.references) || value.references.length !== 0 || value.outOfRange !== null) return false;
    if (!Array.isArray(value.sources) || value.sources.length > 20) return false;
    if (value.sources.some(item => !isObject(item) || ["id", "label", "url"].some(key => typeof item[key] !== "string"))) return false;
    if (value.policy !== null && (!isObject(value.policy) || typeof value.policy.id !== "string" || !Number.isInteger(value.policy.version))) return false;
    return true;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 100000) return null;
    try { const value = JSON.parse(encoded); return validSnapshot(value) ? value : null; } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "FEHCO3_spot") return datapoint;
    Object.assign(datapoint, { outOfRange: null, norm: "" });
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-fehco3-snapshot"));
    if (snapshot) Object.assign(datapoint, { fehco3Snapshot: snapshot, valueNum: snapshot.rawValue, unit: "%", displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: snapshot.outOfRange });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.fehco3Snapshot;
    if (datapoint?.sourceFormulaId !== "FEHCO3_spot" || !validSnapshot(snapshot) || !labResult) return labResult;
    Object.assign(labResult, { test: LABEL, value: displayText(snapshot), valueNum: snapshot.rawValue, unit: "%", testKey: TEST_KEY });
    if (comparator(snapshot)) delete labResult.valueNum;
    const norm = normText(snapshot);
    if (norm) labResult.norm = norm; else delete labResult.norm;
    return labResult;
  }
  function treeRows(value, path = [], rows = []) {
    if (path.length > 12 || rows.length > 2000) throw new Error("Assessment is too large");
    const label = path.map(part => typeof part === "number" ? `pozycja ${part + 1}` : LABELS[part] || part).join(" › ");
    if (Array.isArray(value) || isObject(value)) {
      if (path.length) rows.push(`${label} [${Array.isArray(value) ? "lista" : "dane"}]:`);
      Object.entries(value).forEach(([key, item]) => {
        if (["__proto__", "constructor", "prototype"].includes(key) || /[\r\n›]/.test(key)) throw new Error("Invalid assessment key");
        treeRows(item, [...path, Array.isArray(value) ? Number(key) : key], rows);
      });
    } else if (typeof value === "string") {
      // The vault normalizes a few Unicode spaces in note bodies. Escape only
      // those characters inside a leaf, retaining the original entered string
      // and source text after parsing, without an opaque assessment payload.
      const encoded = JSON.stringify(value).replace(/[\u00a0\u202f\u2000-\u200d\u205f\u2060\u3000\ufeff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
      rows.push(`${label} [tekst]: ${encoded}`);
    }
    else if (typeof value === "number" && Number.isFinite(value)) rows.push(`${label} [liczba]: ${String(value)}`);
    else if (typeof value === "boolean") rows.push(`${label} [odpowiedź]: ${value ? "tak" : "nie"}`);
    else if (value === null) rows.push(`${label} [brak]: nie podano`);
    else throw new Error("Unsupported assessment data");
    return rows;
  }
  function referenceNote(datapoint) {
    const snapshot = datapoint?.fehco3Snapshot;
    if (datapoint?.sourceFormulaId !== "FEHCO3_spot" || !validSnapshot(snapshot)) return "";
    const range = normText(snapshot);
    const rows = [NOTE_HEADER, `Wynik FEHCO₃: ${displayText(snapshot)} %.`,
      `Opis wyniku: ${clean(snapshot.interpretation)}`, range ? `Norma użyta przy zapisie: ${range}.` : "Nie nadano jednej normy do klasyfikacji wyniku.",
      ...(snapshot.cautions || []).map(text => `Uwaga do interpretacji: ${clean(text)}`), TREE_HEADER];
    try { rows.push(...treeRows(snapshot)); } catch (_) { return ""; }
    rows.push(TREE_END);
    return rows.join("\n");
  }
  function readTree(rows) {
    const result = {};
    if (rows.length > 2000) return null;
    for (const row of rows) {
      const match = /^(.*?) \[(dane|lista|tekst|liczba|odpowiedź|brak)\]:(?: (.*))?$/.exec(row);
      if (!match) return null;
      const path = match[1].split(" › ").map(part => /^pozycja [1-9][0-9]*$/.test(part) ? Number(part.slice(8)) - 1 : REVERSE[part] || part);
      if (!path.length || path.length > 12 || path.some(part => typeof part === "number" ? part < 0 || part > 2000 : !part || ["__proto__", "constructor", "prototype"].includes(part))) return null;
      let parent = result;
      for (const part of path.slice(0, -1)) { if (!own(parent, part) || (!isObject(parent[part]) && !Array.isArray(parent[part]))) return null; parent = parent[part]; }
      const key = path.at(-1), type = match[2], raw = match[3] || "";
      if (own(parent, key)) return null;
      let value;
      if (type === "dane") value = {};
      else if (type === "lista") value = [];
      else if (type === "brak") { if (raw !== "nie podano") return null; value = null; }
      else if (type === "odpowiedź") { if (!["tak", "nie"].includes(raw)) return null; value = raw === "tak"; }
      else if (type === "liczba") { value = Number(raw); if (!raw || !Number.isFinite(value)) return null; }
      else { try { value = JSON.parse(raw); } catch (_) { return null; } if (typeof value !== "string") return null; }
      parent[key] = value;
    }
    return result;
  }
  function hasSavedAssessment(note) { return typeof note?.body === "string" && note.body.includes(NOTE_HEADER); }
  function savedAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    if (body.length > 150000 || !hasSavedAssessment(note)) return null;
    const rows = body.slice(body.indexOf(NOTE_HEADER)).split("\n");
    const from = rows.indexOf(TREE_HEADER), to = rows.indexOf(TREE_END);
    if (from < 0 || to <= from) return null;
    const snapshot = readTree(rows.slice(from + 1, to));
    if (!validSnapshot(snapshot)) return null;
    const lab = note.labResult || {}, display = displayText(snapshot), signed = comparator(snapshot), norm = normText(snapshot);
    if (lab.test !== LABEL || lab.unit !== "%" || lab.testKey !== TEST_KEY || normalized(lab.value) !== normalized(display) || clean(lab.norm || "") !== norm) return null;
    if (signed ? own(lab, "valueNum") : lab.valueNum !== snapshot.rawValue) return null;
    if (!rows.includes(`Wynik FEHCO₃: ${display} %.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`)) return null;
    if (norm ? !rows.includes(`Norma użyta przy zapisie: ${norm}.`) : !rows.includes("Nie nadano jednej normy do klasyfikacji wyniku.")) return null;
    return { ...snapshot, displayValue: display, comparator: signed, norm, outOfRange: snapshot.outOfRange };
  }
  function legacyPoint(note) {
    const lab = note?.labResult;
    if (!lab || lab.unit && lab.unit !== "%") return null;
    const text = typeof lab.value === "string" ? lab.value.trim() : "";
    const signed = /^([<>]=?|[≤≥])\s*\+?((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/.exec(text);
    const match = /^\+?((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/.exec(text);
    const rawValue = signed ? Number(signed[2].replace(",", ".")) : typeof lab.valueNum === "number" && Number.isFinite(lab.valueNum) ? lab.valueNum : match ? Number(match[1].replace(",", ".")) : NaN;
    if (!Number.isFinite(rawValue) || rawValue < 0) return null;
    return { rawValue, valueNum: signed ? null : rawValue, displayValue: signed || match && !(Number(match[1].replace(",", ".")) === 0 && rawValue > 0) ? text : String(rawValue).replace(".", ","), comparator: signed ? ({ "<=": "≤", ">=": "≥" })[signed[1]] || signed[1] : "", unit: "%", outOfRange: null, norm: "" };
  }
  return Object.freeze({ NOTE_HEADER, TEST_KEY, readSnapshot, displayText, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, legacyPoint, normText });
});
