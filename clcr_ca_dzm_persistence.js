/* Frozen calcium excretion measurement/reference records. Reading does not evaluate current policies. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrCaDzmPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const NOTE_HEADER = "Wydalanie wapnia — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr-ca-dzm";
  const LABEL = "Wydalanie wapnia (DZM)";
  const UNITS = new Set(["mg/kg/24 h", "mg/24 h"]);
  const TREE_HEADER = "Utrwalone dane oceny wydalania wapnia:";
  const TREE_END = "Koniec utrwalonych danych wydalania wapnia.";
  const LABELS = Object.freeze({
    schema: "Schemat oceny", version: "Wersja schematu", engineVersion: "Wersja obliczenia", valid: "Poprawny pomiar",
    rawValue: "Wynik przed zaokrągleniem", value: "Wartość", unit: "Jednostka wyniku", input: "Dane wejściowe", mode: "Sposób wprowadzania", concentration: "Stężenie wapnia", concentrationUnit: "Jednostka stężenia", volume: "Objętość zbiórki", volumeUnit: "Jednostka objętości", hours: "Czas zbiórki w godzinach", reportedValue: "Wynik z laboratorium", reportedUnit: "Jednostka wyniku z laboratorium", dailyMg: "Wydalanie dobowe w mg", perKg: "Wydalanie na kg masy ciała", weightKg: "Masa ciała w kg", ageYears: "Wiek w dniu badania", sex: "Płeć",
    clinicalContext: "Wybrany kontekst kliniczny", contextLabel: "Znaczenie wybranego kontekstu", perKgDisplay: "Pokazane wydalanie na kg",
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
  function normText(snapshot) { return snapshot?.referenceActive === true ? `${snapshot.reference?.kind === "criterion" ? "Kryterium PHPT: " : ""}${clean(snapshot.referenceText)} ${snapshot.unit}`.trim() : ""; }
  function assessment(snapshot) { return ({ low: "below", high: "above", boundary: "above", "criterion-met": "above", within: "within" })[snapshot?.status] || "unassessed"; }
  // The storage-format version owns this formatter. It uses only the exact
  // numbers and boundaries frozen in this record, so future engine/policy
  // updates cannot change how a historical result is validated.
  function fraction(text) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(text).replace(",", ".").replace(/−/g, "-"));
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    let n = BigInt((match[1] === "-" ? "-" : "") + ((match[2] || "0") + (match[3] || ""))), d = 1n;
    if (exponent >= 0) n *= 10n ** BigInt(exponent); else d = 10n ** BigInt(-exponent);
    return { n, d };
  }
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  function exact(value) {
    if (!isObject(value) || !/^\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "") || BigInt(value.denominator) <= 0n) return null;
    return { n: BigInt(value.numerator), d: BigInt(value.denominator) };
  }
  function represented(value) {
    if (value.n === 0n) return 0;
    const rounded = (n, d) => { const q = n / d, remainder = n % d; return q + (remainder * 2n > d || remainder * 2n === d && q % 2n === 1n ? 1n : 0n); };
    let exponent = value.n.toString(2).length - value.d.toString(2).length;
    if (exponent >= 0 ? value.n < value.d * 2n ** BigInt(exponent) : value.n * 2n ** BigInt(-exponent) < value.d) exponent -= 1;
    if (exponent > 1023) return Infinity;
    if (exponent < -1075) return 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? rounded(value.n * 2n ** BigInt(scale), value.d) : rounded(value.n, value.d * 2n ** BigInt(-scale));
    return Number(coefficient) * 2 ** -scale;
  }
  function frozenDisplay(snapshot) {
    const main = exact(snapshot.exactMain);
    if (!main || represented(main) !== snapshot.rawValue) return "";
    const bounds = [fraction("0"), ...[snapshot.reference?.exactLower, snapshot.reference?.exactUpper].map(exact).filter(Boolean)];
    const correct = text => { const shown = fraction(text); return shown && bounds.every(bound => compare(main, bound) === 0 || compare(shown, bound) === compare(main, bound)); };
    const value = snapshot.rawValue;
    const candidate = (value !== 0 && (Math.abs(value) < 1e-7 || Math.abs(value) >= 1e12) ? String(value) : value.toLocaleString("pl-PL", { useGrouping: false, maximumFractionDigits: 2 })).replace(".", ",");
    if (candidate.length <= 120 && correct(candidate)) return candidate;
    for (const places of [16, 24, 32, 48, 64, 96, 120]) {
      let remainder = main.n % main.d, digits = "";
      for (let i = 0; i < places && remainder; i += 1) { remainder *= 10n; digits += String(remainder / main.d); remainder %= main.d; }
      const text = (String(main.n / main.d) + (digits ? "," + digits.replace(/0+$/, "") : "")).replace(/,$/, "");
      if (text.length <= 120 && correct(text)) return text;
    }
    return "";
  }
  // This validates the frozen record, never the current clinical policy. A
  // later reference update must not reclassify an already saved measurement.
  function validSnapshot(value) {
    if (!isObject(value) || value.schema !== "clcr-ca-dzm" || value.version !== 1 || value.engineVersion !== 1 || value.valid !== true || !UNITS.has(value.unit)) return false;
    if (!Number.isFinite(value.rawValue) || value.rawValue < 0 || value.value !== value.rawValue) return false;
    if (!isObject(value.input) || !["concentration", "reported"].includes(value.input.mode) || !isObject(value.input.knownFacts) || !["general", "hypo", "phpt"].includes(value.input.clinicalContext)) return false;
    if (!isObject(value.display) || typeof value.display.text !== "string" || typeof value.display.boundary !== "string" || value.display.text !== frozenDisplay(value)) return false;
    if (!["dailyMg", "perKg"].every(key => value[key] === null || Number.isFinite(value[key]) && value[key] >= 0)) return false;
    if (value.unit === "mg/24 h" && value.dailyMg !== value.rawValue || value.unit === "mg/kg/24 h" && value.perKg !== value.rawValue) return false;
    if (typeof value.interpretation !== "string" || typeof value.statusText !== "string" || !Array.isArray(value.cautions) || value.cautions.some(text => typeof text !== "string")) return false;
    if (!Array.isArray(value.references) || !Array.isArray(value.sources) || value.sources.length > 20 || value.sources.some(source => !isObject(source) || ["id", "label", "url"].some(key => typeof source[key] !== "string"))) return false;
    for (const [key, exactKey] of [["dailyMg", "exactDailyMg"], ["perKg", "exactPerKg"]]) {
      if (value[key] === null ? value[exactKey] !== null : !exact(value[exactKey]) || represented(exact(value[exactKey])) !== value[key]) return false;
    }
    if (!["within", "high", "boundary", "zero", "unassessed", "criterion-met", "criterion-not-met"].includes(value.status) || !["normal", "warning", "neutral"].includes(value.tone) || ![true, false, null].includes(value.outOfRange)) return false;
    if (value.policy !== null && (!isObject(value.policy) || typeof value.policy.id !== "string" || !Number.isInteger(value.policy.version))) return false;
    if (value.referenceActive !== true) return value.referenceActive === false && ["zero", "unassessed"].includes(value.status) && (value.status !== "zero" || value.rawValue === 0) && value.tone === "neutral" && value.outOfRange === null;
    const ref = value.reference;
    if (!value.referenceAvailable || !isObject(ref) || !["upper", "interval", "criterion"].includes(ref.kind) || ref.unit !== value.unit || !Number.isFinite(ref.upper) || ref.upper <= 0 || typeof ref.upperInclusive !== "boolean") return false;
    if (ref.kind === "interval" && (!Number.isFinite(ref.lower) || ref.lower < 0 || ref.lower > ref.upper || typeof ref.lowerInclusive !== "boolean")) return false;
    if (!normText(value) || clean(ref.text) !== clean(value.referenceText) || value.references.length !== 1 || JSON.stringify(value.references[0]) !== JSON.stringify(ref)) return false;
    const main = exact(value.exactMain), upper = exact(ref.exactUpper), lower = ref.kind === "interval" ? exact(ref.exactLower) : null;
    if (!upper || represented(upper) !== ref.upper || ref.kind === "interval" && (!lower || represented(lower) !== ref.lower)) return false;
    const below = lower && (compare(main, lower) < 0 || compare(main, lower) === 0 && !ref.lowerInclusive);
    const above = compare(main, upper);
    const expected = ref.kind === "criterion" ? above > 0 ? "criterion-met" : "criterion-not-met" : below ? "low" : above > 0 ? "high" : above === 0 && !ref.upperInclusive ? "boundary" : "within";
    if (value.status !== expected) return false;
    if (value.status === "criterion-not-met") return value.tone === "neutral" && value.outOfRange === null;
    if (value.status === "criterion-met") return value.tone === "warning" && value.outOfRange === true;
    if (value.status === "within") return value.tone === "normal" && value.outOfRange === false;
    if (["low", "high", "boundary"].includes(value.status)) return value.tone === "warning" && value.outOfRange === true;
    return false;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 100000) return null;
    try { const value = JSON.parse(encoded); return validSnapshot(value) ? value : null; } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "Ca_mgkg") return datapoint;
    Object.assign(datapoint, { outOfRange: null, norm: "", assessment: "unassessed", tone: "neutral" });
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-ca-dzm-snapshot"));
    if (snapshot) Object.assign(datapoint, { caDzmSnapshot: snapshot, rawValue: snapshot.rawValue, valueNum: snapshot.rawValue, unit: snapshot.unit, displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: snapshot.outOfRange, assessment: assessment(snapshot), tone: snapshot.tone === "normal" ? "success" : snapshot.tone, interpretation: snapshot.interpretation });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.caDzmSnapshot;
    if (datapoint?.sourceFormulaId !== "Ca_mgkg" || !validSnapshot(snapshot) || !labResult) return labResult;
    Object.assign(labResult, { test: LABEL, value: displayText(snapshot), valueNum: snapshot.rawValue, unit: snapshot.unit, testKey: TEST_KEY });
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
    const snapshot = datapoint?.caDzmSnapshot;
    if (datapoint?.sourceFormulaId !== "Ca_mgkg" || !validSnapshot(snapshot)) return "";
    const range = normText(snapshot);
    const rows = [NOTE_HEADER, `Wynik wydalania wapnia: ${displayText(snapshot)}.`,
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
    if (lab.test !== LABEL || lab.unit !== snapshot.unit || lab.testKey !== TEST_KEY || normalized(lab.value) !== normalized(display) || lab.valueNum !== snapshot.rawValue || clean(lab.norm || "") !== norm) return null;
    if (!rows.includes(`Wynik wydalania wapnia: ${display}.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`)) return null;
    if (norm ? !rows.includes(`Norma użyta przy zapisie: ${norm}.`) : !rows.includes("Brak zapisanej normy.")) return null;
    return { ...snapshot, displayValue: display, comparator: "", norm, outOfRange: snapshot.outOfRange };
  }
  function legacyPoint(note) {
    const lab = note?.labResult;
    if (!lab || lab.unit && !UNITS.has(lab.unit)) return null;
    const parsed = numeric(lab.value);
    const rawValue = typeof lab.valueNum === "number" && Number.isFinite(lab.valueNum) ? lab.valueNum : parsed;
    if (!Number.isFinite(rawValue)) return null;
    return { rawValue, valueNum: rawValue, displayValue: parsed === rawValue ? clean(lab.value) : String(rawValue).replace(".", ","), comparator: "", unit: lab.unit || "mg/kg/24 h", outOfRange: null, norm: "", assessment: "unassessed", tone: "neutral" };
  }
  // Legacy captures stored wall-clock dates without an offset. They cannot
  // recover the elapsed duration after a device changes its time zone.
  function prepareValues(values = {}, context = {}, prior = null) {
    const result = { ...values };
    if (!own(result, "CA_inputMode")) {
      result.CA_inputMode = "concentration";
      result.CA_concentration = result.U_Ca ?? prior?.input?.concentration ?? "";
      result.CA_concentrationUnit = "mmol/L";
      result.CA_volume = result.V24 ?? prior?.input?.volume ?? "";
      result.CA_volumeUnit = "mL";
    }
    if (!own(result, "CA_collectionHours")) {
      const minuteCandidates = [context.durationMinutes, context.collectionMinutes, context.collection?.durationMinutes,
        context.inputs?.durationMinutes, context.referenceContext?.durationMinutes, context.recordedDurationMinutes, context.collectionAnalysis?.durationMinutes];
      const capturedMinutes = minuteCandidates.find(value => typeof value === "number" && Number.isFinite(value) && value > 0);
      const capturedHours = [context.collectionHours, context.durationHours].find(value => numeric(value) > 0);
      result.CA_collectionHours = prior?.input?.hours ?? capturedHours ?? (capturedMinutes ? String(capturedMinutes / 60) : "");
    }
    result.CA_clinicalMode ??= prior?.input?.clinicalContext ?? "general";
    result.CA_reportedValue ??= "";
    result.CA_reportedUnit ||= "mg/24h";
    result.weight ??= prior?.input?.weightKg ?? "";
    return result;
  }
  function editableFields(values) {
    const reported = values.CA_inputMode === "reported";
    const field = (id, label, required = false, unitFieldId = "", options = []) => ({ id, label, required, unitFieldId, historicalContext: false, type: options.length ? "select" : "number", options: options.map(value => ({ value, label: value })) });
    return [
      ...(reported ? [field("CA_reportedValue", "Wynik z laboratorium", true, "CA_reportedUnit"), field("CA_reportedUnit", "Jednostka wyniku", false, "", ["mg/24h", "mmol/24h", "mg/kg/24h"])] : [
        field("CA_concentration", "Wapń w moczu", true, "CA_concentrationUnit"), field("CA_concentrationUnit", "Jednostka stężenia", false, "", ["mmol/L", "mg/dL", "mg/L"]),
        field("CA_volume", "Objętość zbiórki", true, "CA_volumeUnit"), field("CA_volumeUnit", "Jednostka objętości", false, "", ["mL", "L"]),
        field("CA_collectionHours", "Czas zbiórki · godziny (wpisz, jeśli nie został zapisany)", true),
      ]),
      field("weight", "Masa ciała w dniu badania · kg"),
      { ...field("CA_clinicalMode", "Kontekst interpretacji", false, "", ["general", "hypo", "phpt"]), options: [{value:"general",label:"Ocena ogólna / kamica"},{value:"hypo",label:"Niedoczynność przytarczyc"},{value:"phpt",label:"Pierwotna nadczynność przytarczyc"}] },
    ];
  }
  function captureFields(values, previous = []) {
    return [...editableFields(values), ...previous.filter(field => ["age", "ageMonths", "ageDays", "sex"].includes(field.id)).map(field => ({ ...field, required: false, historicalContext: true }))];
  }
  return Object.freeze({ NOTE_HEADER, TEST_KEY, readSnapshot, displayText, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, legacyPoint, normText, prepareValues, editableFields, captureFields });
});
