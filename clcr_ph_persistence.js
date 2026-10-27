/* Frozen pH measurement/reference records. Reading does not evaluate current policies. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrPhPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const NOTE_HEADER = "pH moczu — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr-ph-spot";
  const LABEL = "pH moczu (próbka punktowa)";
  const STORAGE_UNIT = "—";
  const FACT_FIELDS = new Set(["spotSampleKind", "spotMenstruation", "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness", "ui_spotMenstruation_answer", "ui_spotHematuria_answer", "ui_spotInfection_answer", "ui_spotExercise_answer", "ui_spotAcuteIllness_answer", "age", "ageMonths", "ageDays"]);
  const TREE_HEADER = "Utrwalone dane oceny pH moczu:";
  const TREE_END = "Koniec utrwalonych danych pH moczu.";
  const LABELS = Object.freeze({
    schema: "Schemat oceny", version: "Wersja schematu", engineVersion: "Wersja obliczenia", valid: "Poprawny pomiar",
    rawValue: "Wynik przed zaokrągleniem", value: "Wartość", unit: "Jednostka wyniku", input: "Dane wejściowe", urinePh: "pH moczu", newbornContext: "Znany kontekst noworodkowy",
    knownFacts: "Znane informacje", menstruation: "Miesiączka", hematuria: "Krwiomocz", infection: "Zakażenie", exercise: "Wysiłek", acuteIllness: "Ostra choroba",
    display: "Prezentacja wyniku", text: "Pokazany tekst", boundary: "Opis dokładności", status: "Ocena porównania", statusText: "Opis oceny", tone: "Kolor oceny", outOfRange: "Poza zakresem", category: "Kategoria porównania",
    referenceAvailable: "Dostępny punkt odniesienia", referenceActive: "Aktywne porównanie", reference: "Punkt odniesienia", references: "Punkty odniesienia", referenceLabel: "Etykieta odniesienia", referenceText: "Tekst odniesienia", referenceHint: "Znaczenie odniesienia",
    kind: "Rodzaj odniesienia", lower: "Dolna granica", upper: "Górna granica", lowerInclusive: "Dolna granica włączona", upperInclusive: "Górna granica włączona", label: "Nazwa", sourceIds: "Identyfikatory źródeł", sourceLabel: "Nazwa źródła odniesienia", population: "Populacja odniesienia", cautions: "Uwagi do oceny", interpretation: "Interpretacja wyniku",
    sources: "Źródła medyczne", id: "Identyfikator", url: "Adres źródła", doi: "DOI", locator: "Miejsce w źródle", policy: "Polityka interpretacji", restrictions: "Ograniczenia interpretacji", notes: "Zasady zastosowania", educationalReferences: "Informacje w Szczegółach", errorCode: "Kod błędu", error: "Opis błędu",
  });
  const REVERSE = Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [label, key]));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const clean = value => Array.from(String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[\u00a0\u202f]/g, " ")).filter(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127).join("").trim();
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  function decimalIdentity(text) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    let digits = (match[2] + (match[3] || "")).replace(/^0+/, "");
    if (!digits) return "0";
    let exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    while (digits.endsWith("0")) { digits = digits.slice(0, -1); exponent += 1; }
    return (match[1] === "-" ? "-" : "") + digits + "e" + exponent;
  }
  function numeric(value) {
    if (!["number", "string"].includes(typeof value)) return NaN;
    const text = String(value).trim().replace(/,/g, "."), number = Number(text);
    if (!text || text.length > 2048 || !Number.isFinite(number) || decimalIdentity(text) !== decimalIdentity(String(number))) return NaN;
    return number;
  }
  function displayText(snapshot) { return clean(snapshot?.display?.text) || (Number.isFinite(snapshot?.rawValue) ? String(snapshot.rawValue).replace(".", ",") : ""); }
  function normText(snapshot) { return snapshot?.referenceActive === true ? clean(snapshot.referenceText) : ""; }
  function assessment(snapshot) { return ({ low: "below", high: "above", within: "within" })[snapshot?.status] || "unassessed"; }
  function validSnapshot(value) {
    if (!isObject(value) || value.schema !== "clcr-ph" || value.version !== 1 || value.valid !== true || value.unit !== "") return false;
    if (!Number.isFinite(value.rawValue) || value.rawValue < 0 || value.rawValue > 14 || value.value !== value.rawValue || value.category !== null) return false;
    if (!isObject(value.input) || numeric(value.input.urinePh) !== value.rawValue || ![true, false, null].includes(value.input.newbornContext)) return false;
    if (!isObject(value.input.knownFacts) || Object.entries(value.input.knownFacts).some(([key, item]) => !FACT_FIELDS.has(key) || !(item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item) || typeof item === "string" && item.length <= 128))) return false;
    if (JSON.stringify(value.knownFacts) !== JSON.stringify(value.input.knownFacts) || value.newbornContext !== value.input.newbornContext) return false;
    if (!isObject(value.display) || typeof value.display.text !== "string" || typeof value.display.boundary !== "string" || numeric(value.display.text) !== value.rawValue) return false;
    if (typeof value.interpretation !== "string" || typeof value.statusText !== "string" || !Array.isArray(value.cautions) || value.cautions.some(text => typeof text !== "string")) return false;
    if (!Array.isArray(value.references) || !Array.isArray(value.sources) || value.sources.length > 20 || value.sources.some(item => !isObject(item) || ["id", "label", "url"].some(key => typeof item[key] !== "string"))) return false;
    if (value.policy === null) return value.referenceAvailable === false && value.referenceActive === false && value.reference === null && value.references.length === 0 && value.status === "unassessed" && value.tone === "neutral" && value.outOfRange === null;
    if (!isObject(value.policy) || typeof value.policy.id !== "string" || !Number.isInteger(value.policy.version)) return false;
    const ref = value.reference;
    if (value.referenceAvailable !== true || value.referenceActive !== true || !isObject(ref) || ref.kind !== "interval" || ref.unit !== "" || !Number.isFinite(ref.lower) || !Number.isFinite(ref.upper) || ref.lower > ref.upper || typeof ref.lowerInclusive !== "boolean" || typeof ref.upperInclusive !== "boolean") return false;
    if (value.references.length !== 1 || JSON.stringify(value.references[0]) !== JSON.stringify(ref) || typeof value.referenceText !== "string" || !normText(value) || clean(ref.text) !== normText(value)) return false;
    const below = value.rawValue < ref.lower || value.rawValue === ref.lower && !ref.lowerInclusive;
    const above = value.rawValue > ref.upper || value.rawValue === ref.upper && !ref.upperInclusive;
    const status = below ? "low" : above ? "high" : "within";
    return value.status === status && value.outOfRange === (status !== "within") && value.tone === (status === "within" ? "normal" : "warning");
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 100000) return null;
    try { const value = JSON.parse(encoded); return validSnapshot(value) ? value : null; } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "pH_spot") return datapoint;
    Object.assign(datapoint, { outOfRange: null, norm: "", assessment: "unassessed", tone: "neutral" });
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-ph-snapshot"));
    if (snapshot) Object.assign(datapoint, { phSnapshot: snapshot, rawValue: snapshot.rawValue, valueNum: snapshot.rawValue, unit: STORAGE_UNIT, displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: snapshot.outOfRange, assessment: assessment(snapshot), tone: snapshot.tone === "normal" ? "success" : snapshot.tone, interpretation: snapshot.interpretation });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.phSnapshot;
    if (datapoint?.sourceFormulaId !== "pH_spot" || !validSnapshot(snapshot) || !labResult) return labResult;
    Object.assign(labResult, { test: LABEL, value: displayText(snapshot), valueNum: snapshot.rawValue, unit: STORAGE_UNIT, testKey: TEST_KEY });
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
    const snapshot = datapoint?.phSnapshot;
    if (datapoint?.sourceFormulaId !== "pH_spot" || !validSnapshot(snapshot)) return "";
    const range = normText(snapshot);
    const rows = [NOTE_HEADER, `Wynik pH moczu: ${displayText(snapshot)}.`,
      `Opis wyniku: ${clean(snapshot.interpretation)}`, range ? `Norma użyta przy zapisie: ${range}.` : "Brak zapisanej normy.",
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
    const lab = note.labResult || {}, display = displayText(snapshot), norm = normText(snapshot);
    if (lab.test !== LABEL || lab.unit !== STORAGE_UNIT || lab.testKey !== TEST_KEY || normalized(lab.value) !== normalized(display) || lab.valueNum !== snapshot.rawValue || clean(lab.norm || "") !== norm) return null;
    if (!rows.includes(`Wynik pH moczu: ${display}.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`)) return null;
    if (norm ? !rows.includes(`Norma użyta przy zapisie: ${norm}.`) : !rows.includes("Brak zapisanej normy.")) return null;
    return { ...snapshot, displayValue: display, comparator: "", norm, outOfRange: snapshot.outOfRange };
  }
  function legacyPoint(note) {
    const lab = note?.labResult;
    if (!lab || lab.unit && lab.unit !== STORAGE_UNIT) return null;
    const parsed = numeric(lab.value);
    const rawValue = typeof lab.valueNum === "number" && Number.isFinite(lab.valueNum) ? lab.valueNum : parsed;
    if (!Number.isFinite(rawValue)) return null;
    return { rawValue, valueNum: rawValue, displayValue: parsed === rawValue ? clean(lab.value) : String(rawValue).replace(".", ","), comparator: "", unit: STORAGE_UNIT, outOfRange: null, norm: "", assessment: "unassessed", tone: "neutral" };
  }
  return Object.freeze({ NOTE_HEADER, TEST_KEY, readSnapshot, displayText, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, legacyPoint, normText });
});
