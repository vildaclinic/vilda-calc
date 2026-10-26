(function (root, factory) {
  const api = factory();
  if (root) root.ClcrTmpGfrPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const NOTE_HEADER = "TmP/GFR — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr-tmp-gfr-mmol-l";
  const LABEL = "TmP/GFR — próg reabsorpcji fosforanów";
  const TREE_HEADER = "Utrwalone dane oceny TmP/GFR:";
  const TREE_END = "Koniec utrwalonych danych TmP/GFR.";
  const METHODS = ["Brodehl", "Walton–Bijvoet/Payne"];
  const STATUS = ["below", "within", "above", "unassessed"];
  const TONES = ["success", "warning", "neutral"];
  // Typed readable leaves preserve the original clinical assessment through
  // the existing vault sanitizer. Reading never evaluates current policies.
  const LABELS = Object.freeze({
    schema: "Schemat oceny", version: "Wersja schematu", engineVersion: "Wersja obliczenia", valid: "Poprawne obliczenie",
    rawValue: "Wynik przed zaokrągleniem", unit: "Jednostka wyniku", method: "Metoda obliczenia", branch: "Gałąź wzoru",
    trp: "Frakcja TRP", fePo4: "Frakcja wydalania fosforanów", input: "Dane wejściowe", ageYears: "Wiek w latach", sex: "Płeć",
    serumPhosphate: "Fosforany w surowicy", urinePhosphate: "Fosforany w moczu", serumCreatinine: "Kreatynina w surowicy", urineCreatinine: "Kreatynina w moczu",
    serumPhosphateUnit: "Jednostka fosforanów w surowicy", urinePhosphateUnit: "Jednostka fosforanów w moczu", serumCreatinineUnit: "Jednostka kreatyniny w surowicy", urineCreatinineUnit: "Jednostka kreatyniny w moczu",
    burosumab: "Monitorowanie burosumabu w XLH", daysSinceDose: "Dni od dawki do pobrania", clinicalDate: "Data pobrania",
    display: "Prezentacja wyniku", text: "Pokazany tekst", status: "Ocena porównania", statusText: "Opis oceny", tone: "Kolor oceny", outOfRange: "Poza zakresem",
    reference: "Zakres odniesienia", referenceAvailable: "Dostępne odniesienie", referenceActive: "Aktywne odniesienie", referenceText: "Tekst odniesienia", referenceLabel: "Etykieta odniesienia", lower: "Dolna granica", upper: "Górna granica", lowerInclusive: "Dolna granica włączona", upperInclusive: "Górna granica włączona",
    low: "Dolna granica pomocnicza", high: "Górna granica pomocnicza", sourceId: "Identyfikator źródła odniesienia", sourceIds: "Identyfikatory źródeł", sourceLabel: "Nazwa źródła odniesienia", ageLabel: "Przedział wieku", population: "Populacja odniesienia",
    value: "Wartość", trpResult: "Prezentacja TRP", valuePercent: "Wartość procentowa", interpretation: "Interpretacja wyniku", cautions: "Uwagi do oceny",
    treatment: "Komentarz monitorowania leczenia", enabled: "Monitorowanie aktywne", comparisonAllowed: "Porównanie dostępne", direction: "Kierunek zmiany", title: "Tytuł komentarza", message: "Treść komentarza", limitations: "Ograniczenia porównania", comparison: "Porównanie pomiarów",
    previous: "Poprzedni pomiar", previousValue: "Poprzednia wartość", currentValue: "Bieżąca wartość", previousDate: "Poprzednia data", delta: "Różnica", reason: "Przyczyna ograniczenia",
    sample: "Pochodzenie próbek", sameUrineSpecimen: "Ta sama próbka moczu", pairedSameTime: "Równoczesna próbka krwi", sampleEvidence: "Zapisane informacje o próbkach", evidence: "Pochodzenie informacji", knownFacts: "Znane informacje",
    knownCKD: "Przewlekła choroba nerek", knownAKI: "Podane AKI", rapidlyChangingCreatinine: "Szybko zmieniająca się kreatynina",
    sources: "Źródła medyczne", id: "Identyfikator", label: "Nazwa", url: "Adres źródła", doi: "DOI", locator: "Miejsce w źródle", policy: "Polityka interpretacji",
  });
  const REVERSE = Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [label, key]));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const clean = value => Array.from(String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[\u00a0\u202f]/g, " ")).filter(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127).join("").trim();
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  const finite = value => typeof value === "number" && Number.isFinite(value);
  function displayText(snapshot) { return clean(snapshot?.display?.text); }
  function normText(snapshot) {
    if (!snapshot?.reference || snapshot.status === "unassessed") return "";
    const value = clean(snapshot.referenceText || snapshot.reference.text);
    return value ? value.includes(snapshot.unit) ? value : `${value} ${snapshot.unit}` : "";
  }
  function safeTree(value, depth = 0) {
    if (depth > 12) return false;
    if (value === null || typeof value === "boolean" || typeof value === "string") return typeof value !== "string" || value.length <= 8000;
    if (typeof value === "number") return finite(value);
    if (Array.isArray(value)) return value.length <= 100 && value.every(item => safeTree(item, depth + 1));
    return isObject(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([key, item]) => !["__proto__", "prototype", "constructor"].includes(key) && safeTree(item, depth + 1));
  }
  function validSnapshot(value) {
    if (!isObject(value) || value.schema !== "clcr-tmp-gfr" || value.version !== 1 || value.valid !== true || value.unit !== "mmol/L" || !safeTree(value)) return false;
    if (!finite(value.rawValue) || value.rawValue < 0 || !METHODS.includes(value.method) || !STATUS.includes(value.status) || !TONES.includes(value.tone)) return false;
    if (!finite(value.trp) || value.trp < 0 || value.trp > 1 || !finite(value.fePo4) || value.fePo4 < 0 || value.fePo4 > 1) return false;
    if (Math.abs(value.trp + value.fePo4 - 1) > Number.EPSILON * 8) return false;
    if (value.status === "unassessed" ? value.outOfRange !== null : value.outOfRange !== (value.status !== "within")) return false;
    if (!isObject(value.input) || !isObject(value.display) || !displayText(value) || typeof value.interpretation !== "string" || !isObject(value.knownFacts)) return false;
    if (!finite(value.input.ageYears) || value.input.ageYears < 0 || value.input.ageYears > 120) return false;
    if (typeof value.input.burosumab !== "boolean" || value.input.daysSinceDose !== null && (!finite(value.input.daysSinceDose) || value.input.daysSinceDose < 0)) return false;
    if (!Array.isArray(value.cautions) || value.cautions.some(item => typeof item !== "string") || !Array.isArray(value.sources)) return false;
    if (!isObject(value.serumPhosphate) || !finite(value.serumPhosphate.value) || value.serumPhosphate.value <= 0 || !STATUS.includes(value.serumPhosphate.status)) return false;
    if (!isObject(value.treatment) || value.treatment.enabled !== value.input.burosumab || typeof value.treatment.comparisonAllowed !== "boolean") return false;
    if (value.reference !== null) {
      const ref = value.reference;
      if (!isObject(ref) || !finite(ref.lower) || !finite(ref.upper) || ref.lower > ref.upper || ref.unit !== value.unit || ref.method !== value.method) return false;
    }
    if (value.status !== "unassessed" && !value.reference) return false;
    if (value.policy !== null && (!isObject(value.policy) || typeof value.policy.id !== "string" || !Number.isInteger(value.policy.version))) return false;
    return true;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 100000) return null;
    try { const value = JSON.parse(encoded); return validSnapshot(value) ? value : null; } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "TMP_GFR") return datapoint;
    Object.assign(datapoint, { outOfRange: null, norm: "" });
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-tmp-gfr-snapshot"));
    if (snapshot) Object.assign(datapoint, { tmpGfrSnapshot: snapshot, valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, unit: snapshot.unit, displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: snapshot.outOfRange, assessment: snapshot.status, tone: snapshot.tone, interpretation: snapshot.interpretation, calculationMethod: snapshot.method });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.tmpGfrSnapshot;
    if (datapoint?.sourceFormulaId !== "TMP_GFR" || !validSnapshot(snapshot) || !labResult) return labResult;
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
  function referenceNote(datapoint) {
    const snapshot = datapoint?.tmpGfrSnapshot;
    if (datapoint?.sourceFormulaId !== "TMP_GFR" || !validSnapshot(snapshot)) return "";
    const range = normText(snapshot);
    const rows = [NOTE_HEADER, `Wynik TmP/GFR: ${displayText(snapshot)} ${snapshot.unit}.`,
      `Metoda obliczenia: ${snapshot.method}.`, `Opis wyniku: ${clean(snapshot.interpretation)}`,
      range ? `Norma użyta przy zapisie: ${range}.` : "Brak normy do aktywnego porównania.",
      ...(snapshot.cautions || []).map(text => `Uwaga do interpretacji: ${clean(text)}`), TREE_HEADER];
    try { rows.push(...treeRows(snapshot)); } catch (_) { return ""; }
    rows.push(TREE_END);
    return rows.join("\n");
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
    if (snapshot.input.clinicalDate && snapshot.input.clinicalDate !== note.clinicalDateISO) return null;
    const lab = note.labResult || {}, display = displayText(snapshot), norm = normText(snapshot);
    if (lab.test !== LABEL || lab.unit !== snapshot.unit || lab.testKey !== TEST_KEY || normalized(lab.value) !== normalized(display) || lab.valueNum !== snapshot.rawValue || clean(lab.norm || "") !== norm) return null;
    if (!rows.includes(`Wynik TmP/GFR: ${display} ${snapshot.unit}.`) || !rows.includes(`Metoda obliczenia: ${snapshot.method}.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`)) return null;
    if (norm ? !rows.includes(`Norma użyta przy zapisie: ${norm}.`) : !rows.includes("Brak normy do aktywnego porównania.")) return null;
    return { ...snapshot, displayValue: display, comparator: "", norm };
  }
  function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const instant = new Date(value + "T00:00:00Z");
    return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value ? value : null;
  }
  function savedMethod(note, snapshot = savedAssessment(note)) {
    // Unknown legacy methods remain a separate series. Never reconstruct a
    // method from today's age or infer it from the numerical result.
    return METHODS.includes(snapshot?.method) ? snapshot.method : "legacy-unknown";
  }
  function getPreviousComparison(notes, current, options = {}) {
    const patientId = options.patientId;
    const currentDate = date(options.clinicalDateISO || current?.input?.clinicalDate || current?.clinicalDate);
    if (!patientId) return { previous: null, reason: "no-patient" };
    if (!currentDate) return { previous: null, reason: "missing-date" };
    const candidates = [], seen = new Set();
    for (const note of Array.isArray(notes) ? notes : []) {
      if (!note || note.patientId !== patientId || note.category !== "wynik-klirens" || note.id === options.excludeId || seen.has(note.id)) continue;
      const lab = note.labResult || {};
      if (lab.test !== LABEL && !(lab.testKey === TEST_KEY && !lab.test)) continue;
      const clinicalDate = date(note.clinicalDateISO);
      if (!clinicalDate || clinicalDate >= currentDate) continue;
      if (note.id) seen.add(note.id);
      candidates.push({ note, clinicalDate });
    }
    candidates.sort((a, b) => b.clinicalDate.localeCompare(a.clinicalDate));
    if (!candidates.length) return { previous: null, reason: "no-earlier-result" };
    // The creation time is not the sampling time. Two same-day samples cannot
    // be ordered clinically unless their original sampling time was recorded.
    if (candidates.length > 1 && candidates[0].clinicalDate === candidates[1].clinicalDate) return { previous: null, reason: "ambiguous-date" };
    const latest = candidates[0], snapshot = savedAssessment(latest.note);
    if (!snapshot) return { previous: null, reason: "unknown-previous-context", noteId: latest.note.id || null, clinicalDateISO: latest.clinicalDate };
    return { previous: { ...snapshot, input: { ...snapshot.input, clinicalDate: latest.clinicalDate } }, reason: null, noteId: latest.note.id || null, clinicalDateISO: latest.clinicalDate };
  }
  return Object.freeze({ NOTE_HEADER, TEST_KEY, readSnapshot, displayText, normText, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, savedMethod, getPreviousComparison });
});
