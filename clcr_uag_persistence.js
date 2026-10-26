(function (root, factory) {
  const api = factory();
  if (root) root.ClcrUagPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const NOTE_HEADER = "UAG — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr-uag-mmol-l";
  const LABEL = "Luka anionowa moczu (UAG)";
  const TREE_HEADER = "Utrwalone dane oceny UAG:";
  const TREE_END = "Koniec utrwalonych danych UAG.";
  const STATUS = ["unassessed"];
  const TONES = ["neutral"];
  const SAMPLE = ["assumed", "confirmed", "different"];
  const FACTS = ["knownCKD", "knownAKI", "rapidlyChangingCreatinine", "nagmaContext", "lowUrineSodium"];
  // Readable, reversible labels keep the original assessment in the vault's
  // existing note body. History never calls today's engine or policy. Each
  // leaf carries its type so that a string input does not become a number or
  // an unknown fact a false answer. There is no opaque JSON assessment blob.
  const LABELS = Object.freeze({
    schema: "Schemat oceny", version: "Wersja schematu", engineVersion: "Wersja obliczenia", valid: "Poprawne obliczenie",
    rawValue: "Wynik przed zaokrągleniem", exactValue: "Dokładny wynik", numerator: "Licznik", denominator: "Mianownik", unit: "Jednostka wyniku",
    sign: "Znak wyniku", category: "Kategoria porównania", input: "Dane wejściowe", urineSodium: "Sód w moczu", urinePotassium: "Potas w moczu", urineChloride: "Chlorki w moczu",
    sample: "Pochodzenie próbki", sameUrineSpecimen: "Ta sama próbka moczu", sampleEvidence: "Zapisane informacje o próbce", evidence: "Pochodzenie informacji",
    knownFacts: "Znane informacje", knownCKD: "Przewlekła choroba nerek", knownAKI: "Podane AKI", rapidlyChangingCreatinine: "Szybko zmieniająca się kreatynina", nagmaContext: "Potwierdzona kwasica z prawidłową luką anionową krwi", lowUrineSodium: "Małe stężenie sodu w moczu",
    display: "Prezentacja wyniku", text: "Pokazany tekst", boundary: "Opis dokładności", status: "Ocena porównania", statusText: "Opis oceny", tone: "Kolor oceny", outOfRange: "Poza zakresem",
    referenceAvailable: "Dostępny punkt odniesienia", referenceActive: "Aktywne porównanie", reference: "Punkt odniesienia", references: "Punkty odniesienia", referenceLabel: "Etykieta odniesienia", referenceText: "Tekst odniesienia", referenceHint: "Znaczenie odniesienia",
    kind: "Rodzaj odniesienia", value: "Wartość odniesienia", label: "Nazwa", sourceIds: "Identyfikatory źródeł", population: "Populacja odniesienia", cautions: "Uwagi do oceny", interpretation: "Interpretacja wyniku",
    sources: "Źródła medyczne", id: "Identyfikator", url: "Adres źródła", doi: "DOI", locator: "Miejsce w źródle", policy: "Polityka interpretacji", restrictions: "Ograniczenia interpretacji", notes: "Zasady zastosowania", educationalReferences: "Informacje w Szczegółach",
    context: "Kontekst kliniczny", errorCode: "Kod błędu", error: "Opis błędu",
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
    if (!isObject(value) || value.schema !== "clcr-uag" || value.version !== 1 || value.valid !== true || value.unit !== "mmol/L") return false;
    if (!Number.isFinite(value.rawValue) || !STATUS.includes(value.status) || !TONES.includes(value.tone)) return false;
    if (value.outOfRange !== null || value.referenceActive !== false || value.category !== null || typeof value.interpretation !== "string") return false;
    const exact = value.exactValue;
    if (!isObject(exact) || typeof exact.numerator !== "string" || typeof exact.denominator !== "string" || !/^-?(?:0|[1-9][0-9]*)$/.test(exact.numerator) || !/^[1-9][0-9]*$/.test(exact.denominator) || exact.numerator.length > 6000 || exact.denominator.length > 6000) return false;
    const sign = exact.numerator === "0" ? "zero" : exact.numerator.startsWith("-") ? "negative" : "positive";
    if (exact.numerator === "-0" || value.sign !== sign || (value.rawValue === 0) !== (sign === "zero") || (value.rawValue < 0) !== (sign === "negative")) return false;
    if (!isObject(value.input) || !isObject(value.sample) || !isObject(value.knownFacts) || !isObject(value.display) || typeof value.display.text !== "string" || typeof value.display.boundary !== "string" || !displayText(value)) return false;
    // The displayed sign must agree with the saved exact quantity, even when
    // its magnitude is below the old one-decimal presentation precision.
    const displayed = Number(normalized(displayText(value)).replace(/−/g, "-"));
    if (!Number.isFinite(displayed) || (displayed === 0) !== (sign === "zero") || (displayed < 0) !== (sign === "negative")) return false;
    if (!Array.isArray(value.cautions) || value.cautions.some(text => typeof text !== "string")) return false;
    for (const key of ["urineSodium", "urinePotassium", "urineChloride"]) {
      const input = value.input[key], text = String(input).trim().replace(/,/g, ".");
      if (!["number", "string"].includes(typeof input) || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) < 0) return false;
    }
    if (!SAMPLE.includes(value.sample.sameUrineSpecimen) || value.sample.sameUrineSpecimen === "different" || value.input.sameUrineSpecimen !== value.sample.sameUrineSpecimen || !isObject(value.sample.evidence)) return false;
    for (const key of FACTS) if (value.knownFacts[key] !== null && typeof value.knownFacts[key] !== "boolean") return false;
    // Zero separates mathematical signs. It cannot become a healthy range,
    // an age norm, or an active category when reading a historical record.
    const reference = value.reference;
    if (!Array.isArray(value.references)) return false;
    if (value.policy === null) {
      if (value.referenceAvailable !== false || reference !== null || value.references.length) return false;
    } else {
      if (value.referenceAvailable !== true || !isObject(reference) || reference.kind !== "sign-boundary" || reference.value !== 0 || reference.unit !== "mmol/L" || value.references.length !== 1 || JSON.stringify(value.references[0]) !== JSON.stringify(reference)) return false;
      if ([reference, ...value.references].some(item => ["lower", "upper", "bounds", "normalUpperExclusive"].some(key => own(item, key)))) return false;
    }
    if (!Array.isArray(value.sources) || value.sources.length > 20 || value.sources.some(item => !isObject(item) || ["id", "label", "url"].some(key => typeof item[key] !== "string"))) return false;
    if (value.policy !== null && (!isObject(value.policy) || typeof value.policy.id !== "string" || !Number.isInteger(value.policy.version))) return false;
    return true;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 100000) return null;
    try { const value = JSON.parse(encoded); return validSnapshot(value) ? value : null; } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "AGu_spot") return datapoint;
    Object.assign(datapoint, { outOfRange: null, norm: "" });
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-uag-snapshot"));
    if (snapshot) Object.assign(datapoint, { uagSnapshot: snapshot, valueNum: snapshot.rawValue, unit: "mmol/L", displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: snapshot.outOfRange });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.uagSnapshot;
    if (datapoint?.sourceFormulaId !== "AGu_spot" || !validSnapshot(snapshot) || !labResult) return labResult;
    Object.assign(labResult, { test: LABEL, value: displayText(snapshot), valueNum: snapshot.rawValue, unit: "mmol/L", testKey: TEST_KEY });
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
    const snapshot = datapoint?.uagSnapshot;
    if (datapoint?.sourceFormulaId !== "AGu_spot" || !validSnapshot(snapshot)) return "";
    const range = normText(snapshot);
    const rows = [NOTE_HEADER, `Wynik UAG: ${displayText(snapshot)} mmol/L.`,
      `Opis wyniku: ${clean(snapshot.interpretation)}`, range ? `Norma użyta przy zapisie: ${range}.` : "0 mmol/L to granica znaku, nie norma.",
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
    if (lab.test !== LABEL || lab.unit !== "mmol/L" || lab.testKey !== TEST_KEY || normalized(lab.value) !== normalized(display) || clean(lab.norm || "") !== norm) return null;
    // The existing vault sanitizer omits negative valueNum. Its exact signed
    // value remains bound by the displayed text and this frozen typed record.
    if (signed ? own(lab, "valueNum") : own(lab, "valueNum") ? lab.valueNum !== snapshot.rawValue : snapshot.rawValue >= 0) return null;
    if (!rows.includes(`Wynik UAG: ${display} mmol/L.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`)) return null;
    if (norm ? !rows.includes(`Norma użyta przy zapisie: ${norm}.`) : !rows.includes("0 mmol/L to granica znaku, nie norma.")) return null;
    return { ...snapshot, displayValue: display, comparator: signed, norm, outOfRange: snapshot.outOfRange };
  }
  function legacyPoint(note) {
    const lab = note?.labResult;
    if (!lab || lab.unit && lab.unit !== "mmol/L") return null;
    const text = typeof lab.value === "string" ? lab.value.trim() : "";
    const canonical = text.replace(/−/g, "-");
    const match = /^([<>]=?|[≤≥])?\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/.exec(canonical);
    const signed = match?.[1] || "";
    const rawValue = !signed && typeof lab.valueNum === "number" && Number.isFinite(lab.valueNum) ? lab.valueNum : match ? Number(match[2].replace(",", ".")) : NaN;
    if (!Number.isFinite(rawValue)) return null;
    const shown = match ? Number(match[2].replace(",", ".")) : NaN;
    return { rawValue, valueNum: signed ? null : rawValue, displayValue: signed || match && !(shown === 0 && rawValue !== 0) ? text : String(rawValue).replace(".", ","), comparator: ({ "<=": "≤", ">=": "≥" })[signed] || signed, unit: "mmol/L", outOfRange: null, norm: "" };
  }
  return Object.freeze({ NOTE_HEADER, TEST_KEY, readSnapshot, displayText, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, legacyPoint, normText });
});
