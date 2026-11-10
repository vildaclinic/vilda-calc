/* Frozen dialysis-dose records. Reading never evaluates current clinical policies. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.ClcrKtvPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const NOTE_HEADER = "Adekwatność hemodializy — ocena w chwili zapisu (wersja 1):";
  const TREE_HEADER = "Utrwalone dane oceny dawki dializy:";
  const TREE_END = "Koniec utrwalonych danych dawki dializy.";
  const METRICS = Object.freeze({
    spktv: { id: "KTV_spktv", key: "spKtV", testKey: "spktv", unit: "—", label: "spKt/V (mocznik, pojedyncza pula)" },
    ektv: { id: "KTV_ektv", key: "eKtV", testKey: "ektv", unit: "—", label: "eKt/V (mocznik, równoważony)" },
    urr: { id: "KTV_urr", key: "urrPct", testKey: "urrwskaznikredukcjimocznika", unit: "%", label: "URR — wskaźnik redukcji mocznika" },
  });
  const FIELD_MAP = Object.freeze({ ktvVariant: "variant", UreaPre: "preUrea", UreaPost: "postUrea", ktvDurationMinutes: "durationMinutes", ktvUF: "netUfLiters", ktvW: "postWeightKg", ktvSessionsPerWeek: "sessionsPerWeek", ktvPidiDays: "pidiDays", ktvAccessType: "accessType", age: "ageYears", ageMonths: "ageMonths" });
  const FACT_FIELD_IDS = new Set(["ktvModality", "ktvUreaAnalyte", "ktvUreaUnit", "ktvPreAnalyte", "ktvPostAnalyte", "ktvPreUnit", "ktvPostUnit", "ktvSameSession", "ktvPreBeforeDialysis", "ktvPreNoDilution", "ktvPostMethod", "ktvKru", "ktvKruMeasuredAt", "ktvTreatmentsDelivered", "ui_ktvSameSession_answer", "ui_ktvPreBeforeDialysis_answer", "ui_ktvPreNoDilution_answer"]);
  const LABELS = Object.freeze({
    valueReady: "Dostępna liczba wyniku", age: "Wiek użyty do oceny", known: "Wiek znany", invalid: "Nieprawidłowy kontekst", years: "Wiek w latach", referenceReason: "Przyczyna braku celu", requiredFields: "Pola wymagane", missingIds: "Brakujące pola", invalidIds: "Nieprawidłowe pola", errorCode: "Kod błędu", error: "Opis błędu", ageKnown: "Znany wiek", sampling: "Założenie pobrania próbek", samplingConfirmed: "Protokół potwierdzony", sameAnalyteAndUnits: "Założenie zgodności oznaczeń i jednostek", renalContribution: "Doliczenie klirensu nerkowego", residualKidneyFunction: "Wiedza o czynności resztkowej", schedule: "Pochodzenie schematu dializ", ui_ktvSameSession_answer: "Odpowiedź o tej samej sesji", ui_ktvPreBeforeDialysis_answer: "Odpowiedź o pobraniu przed sesją", ui_ktvPreNoDilution_answer: "Odpowiedź o rozcieńczeniu", ktvPreAnalyte: "Znany analit przed dializą", ktvPostAnalyte: "Znany analit po dializie", ktvPreUnit: "Znana jednostka przed dializą", ktvPostUnit: "Znana jednostka po dializie",
    schema: "Schemat zapisu", version: "Wersja schematu", engineVersion: "Wersja obliczenia", valid: "Poprawne obliczenie", variant: "Wybrany wskaźnik", metric: "Wskaźnik dawki", parameterKey: "Seria badania", rawValue: "Wynik przed zaokrągleniem", value: "Wartość wyniku", unit: "Jednostka wyniku", values: "Obliczone wartości", ratio: "Iloraz po do przed", urrPct: "URR w procentach", gfac: "Współczynnik wytwarzania mocznika", logarithmArgument: "Argument logarytmu", spKtV: "spKt/V", eKtV: "eKt/V", exactValue: "Dokładny iloraz wyniku", numerator: "Licznik", denominator: "Mianownik",
    input: "Dane wejściowe", preUrea: "Stężenie przed dializą", postUrea: "Stężenie po dializie", durationMinutes: "Czas sesji w minutach", netUfLiters: "Ultrafiltracja netto w litrach", postWeightKg: "Masa po dializie w kilogramach", sessionsPerWeek: "Sesje w tygodniu", pidiDays: "Odstęp między początkami sesji w dniach", accessType: "Dostęp naczyniowy", ageYears: "Wiek w latach w dniu badania", ageMonths: "Dodatkowe miesiące wieku", evaluationDate: "Data ocenianej sesji", knownFacts: "Znane informacje", assumptions: "Założenia obliczenia", guard: "Kwalifikacja metody", restrictions: "Ograniczenia oceny", notes: "Uwagi do metody",
    display: "Prezentacja wyniku", text: "Tekst wyniku", boundary: "Dokładność przy granicy", status: "Ocena wyniku", statusText: "Opis oceny", tone: "Kolor oceny", outOfRange: "Wynik poniżej porównania", category: "Kategoria", interpretation: "Interpretacja", cautions: "Uwagi do interpretacji", referenceAvailable: "Dostępny cel", referenceActive: "Zastosowany cel", reference: "Cel dawki", references: "Punkty odniesienia", referenceText: "Tekst celu", referenceLabel: "Etykieta celu", referenceHint: "Znaczenie celu", policy: "Zasady oceny", profileId: "Profil oceny", profileVersion: "Wersja profilu", population: "Populacja",
    kind: "Rodzaj porównania", minimum: "Minimum", target: "Cel", lower: "Dolna granica porównania", upper: "Górna granica porównania", lowerInclusive: "Dolna granica włączona", upperInclusive: "Górna granica włączona", minimumText: "Tekst minimum", label: "Nazwa", sourceIds: "Identyfikatory źródeł", sourceLabel: "Opis źródła", sources: "Źródła medyczne", source: "Źródło", id: "Identyfikator", url: "Adres źródła", doi: "DOI", locator: "Miejsce w źródle", accessed: "Data odczytu źródła", method: "Metoda", eligible: "Możliwe porównanie", reasons: "Przyczyny ograniczenia", reason: "Przyczyna ograniczenia", errors: "Błędy danych", warnings: "Uwagi", code: "Kod", message: "Opis", ok: "Poprawność", modality: "Rodzaj dializy",
    ktvModality: "Znany rodzaj dializy", ktvUreaAnalyte: "Analit obu próbek", ktvUreaUnit: "Wspólna jednostka stężeń", ktvTreatmentsDelivered: "Fakt zrealizowania sesji", ktvSameSession: "Fakt tej samej sesji", ktvPreBeforeDialysis: "Fakt pobrania przed sesją", ktvPreNoDilution: "Fakt braku rozcieńczenia", ktvPostMethod: "Znana metoda pobrania po sesji", ktvKru: "Historyczny klirens resztkowy", ktvKruMeasuredAt: "Data historycznego klirensu resztkowego",
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
  const copy = value => JSON.parse(JSON.stringify(value));
  function metric(snapshot) { return METRICS[snapshot?.input?.variant]; }
  function displayText(snapshot) { return clean(snapshot?.display?.text); }
  function labDisplayText(snapshot) { return /^[<>≤≥]/.test(displayText(snapshot)) ? String(snapshot.rawValue).replace(".", ",") : displayText(snapshot); }
  function normText(snapshot) { return snapshot?.referenceActive === true ? clean(snapshot.referenceText || snapshot.reference?.text) : ""; }
  function assessment(snapshot) { return snapshot?.status === "within" ? "within" : ["below-minimum", "below-target"].includes(snapshot?.status) ? "below" : "unassessed"; }
  function tone(snapshot) { return snapshot?.tone === "normal" ? "success" : snapshot?.tone; }
  function safeTree(value, depth = 0) {
    if (depth > 12) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.length <= 10000;
    if (Array.isArray(value)) return value.length <= 300 && value.every(item => safeTree(item, depth + 1));
    return isObject(value) && Object.keys(value).length <= 150 && Object.entries(value).every(([key, item]) => !["__proto__", "constructor", "prototype"].includes(key) && !/[\r\n›]/.test(key) && safeTree(item, depth + 1));
  }
  function rational(value) {
    if (!["number", "string"].includes(typeof value)) return null;
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(value).trim().replace(",", "."));
    if (!m || !(m[2] || m[3])) return null;
    const exp = Number(m[4] || 0) - (m[3] || "").length;
    if (!Number.isInteger(exp) || Math.abs(exp) > 256) return null;
    const n = BigInt((m[2] || "0") + (m[3] || "")) * (m[1] === "-" ? -1n : 1n);
    return exp >= 0 ? { n: n * 10n ** BigInt(exp), d: 1n } : { n, d: 10n ** BigInt(-exp) };
  }
  function exactUrr(snapshot) {
    const e = snapshot.exactValue, pre = rational(snapshot.input.preUrea), post = rational(snapshot.input.postUrea);
    if (!isObject(e) || typeof e.numerator !== "string" || typeof e.denominator !== "string" || !/^-?\d{1,700}$/.test(e.numerator) || !/^\d{1,700}$/.test(e.denominator) || !pre || !post || pre.n <= 0n || post.n < 0n) return null;
    const n = BigInt(e.numerator), d = BigInt(e.denominator);
    if (d <= 0n || n * pre.n * post.d !== 100n * (pre.n * post.d - post.n * pre.d) * d || Number(n) / Number(d) !== snapshot.rawValue) return null;
    return { n, d };
  }
  function below(snapshot, threshold) {
    if (snapshot.input.variant !== "urr") return snapshot.rawValue < threshold;
    const exact = exactUrr(snapshot), ref = rational(threshold);
    return exact && ref ? exact.n * ref.d < ref.n * exact.d : null;
  }
  function frozenDisplay(snapshot) {
    const value = snapshot.rawValue, digits = snapshot.input.variant === "urr" ? 1 : 2;
    const rounded = Number(value.toFixed(digits));
    const boundaries = snapshot.referenceActive ? [snapshot.reference?.minimum, snapshot.reference?.target].filter(Number.isFinite) : [];
    const crossed = boundaries.find(endpoint => below(snapshot, endpoint) && rounded >= endpoint);
    if (crossed !== undefined) return { text: `<${crossed.toFixed(digits).replace(".", ",")}`, boundary: `<${String(crossed).replace(".", ",")}` };
    if (value !== 0 && (Math.abs(value) < 10 ** -digits || Math.abs(value) >= 1000000)) return { text: `≈${value.toPrecision(6).replace(".", ",")}`, boundary: "" };
    return { text: value.toFixed(digits).replace(".", ","), boundary: "" };
  }
  function validSnapshot(value) {
    if (!isObject(value) || !safeTree(value) || value.schema !== "clcr-ktv" || value.version !== 1 || value.valid !== true || !metric(value)) return false;
    const m = metric(value);
    if (value.variant !== value.input.variant || value.parameterKey !== m.id || value.category !== null || value.evaluationDate !== value.input.evaluationDate) return false;
    if (!isObject(value.age) || typeof value.age.known !== "boolean" || typeof value.age.invalid !== "boolean") return false;
    if (value.age.known) {
      const y = numeric(value.input.ageYears), m = value.input.ageMonths == null || String(value.input.ageMonths).trim() === "" ? 0 : numeric(value.input.ageMonths);
      const inferredInfantYear = (value.input.ageYears == null || String(value.input.ageYears).trim() === "") && m > 0 ? 0 : y;
      if (!Number.isFinite(inferredInfantYear) || inferredInfantYear < 0 || !Number.isInteger(m) || m < 0 || m >= 12 || value.age.invalid || value.age.years !== inferredInfantYear + m / 12) return false;
    } else if (value.age.years !== null || value.referenceActive) return false;
    if (value.unit !== (m.unit === "%" ? "%" : "") || !Number.isFinite(value.rawValue) || m.unit !== "%" && value.rawValue < 0 || value.value !== value.rawValue || !isObject(value.values) || value.values[m.key] !== value.rawValue) return false;
    if (m.unit === "%" && (value.rawValue > 100 || !exactUrr(value)) || !isObject(value.input.knownFacts)) return false;
    if (Object.entries(value.input.knownFacts).some(([id, item]) => !FACT_FIELD_IDS.has(id) || !(item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item) || typeof item === "string" && item.length <= 128))) return false;
    if (JSON.stringify(value.knownFacts) !== JSON.stringify(value.input.knownFacts)) return false;
    if (typeof value.display?.text !== "string" || !displayText(value) || typeof value.display.boundary !== "string" || typeof value.interpretation !== "string") return false;
    if (!Array.isArray(value.sources) || value.sources.some(s => !isObject(s) || ["id", "label", "url"].some(k => typeof s[k] !== "string"))) return false;
    if (value.policy !== null && (!isObject(value.policy) || typeof value.policy.id !== "string" || !Number.isInteger(value.policy.version) || value.policy.version < 1)) return false;
    if (!Array.isArray(value.references) || typeof value.referenceActive !== "boolean" || typeof value.referenceAvailable !== "boolean") return false;
    if (JSON.stringify(value.display) !== JSON.stringify(frozenDisplay(value))) return false;
    if (!value.referenceActive) return value.reference === null && value.references.length === 0 && value.status === "unassessed" && value.tone === "neutral" && value.outOfRange === null;
    const ref = value.reference;
    if (!value.policy || !value.referenceAvailable || !isObject(ref) || ref.kind !== "threshold" || ref.unit !== value.unit || !Number.isFinite(ref.minimum) || ref.minimum < 0 || ref.target !== null && (!Number.isFinite(ref.target) || ref.target < ref.minimum)) return false;
    if (ref.lower !== (ref.target ?? ref.minimum) || ref.lowerInclusive !== true || ref.upper !== null || !normText(value) || clean(ref.text) !== normText(value)) return false;
    if (value.references.length !== 1 || JSON.stringify(value.references[0]) !== JSON.stringify(ref) || !Array.isArray(ref.sourceIds) || !ref.sourceIds.length || ref.sourceIds.some(id => !value.sources.some(s => s.id === id))) return false;
    const pre = numeric(value.input.preUrea), post = numeric(value.input.postUrea);
    if (!(pre > post && post >= 0)) return false;
    const status = below(value, ref.minimum) ? "below-minimum" : ref.target !== null && below(value, ref.target) ? "below-target" : "within";
    return value.status === status && value.outOfRange === (status !== "within") && value.tone === ({ "below-minimum": "danger", "below-target": "warning", within: "normal" })[status];
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 100000) return null;
    try { const result = JSON.parse(encoded); return validSnapshot(result) ? result : null; } catch (_) { return null; }
  }
  function fromResult(result, datapoint = {}) {
    if (!validSnapshot(result)) return null;
    const m = metric(result);
    return Object.assign(datapoint, { id: m.id, sourceFormulaId: "KTV", testKey: "clcr:" + m.id, label: m.label, unit: m.unit, ktvSnapshot: copy(result), rawValue: result.rawValue, valueNum: result.rawValue, displayValue: displayText(result), comparator: "", norm: normText(result), outOfRange: result.outOfRange, assessment: assessment(result), tone: tone(result), category: null, referenceProfileId: result.reference?.profileId || result.policy?.id || null, referenceProfileVersion: result.policy?.version ?? null, interpretation: result.interpretation });
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "KTV") return datapoint;
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-ktv-snapshot"));
    if (!snapshot || datapoint.id !== metric(snapshot).id) {
      Object.assign(datapoint, { outOfRange: null, norm: "", category: null, assessment: "unassessed", tone: "neutral" });
      delete datapoint.ktvSnapshot;
      return datapoint;
    }
    return fromResult(snapshot, datapoint);
  }
  function matchesDatapoint(datapoint, snapshot) {
    if (!validSnapshot(snapshot)) return false;
    const m = metric(snapshot);
    return datapoint?.sourceFormulaId === "KTV" && datapoint.id === m.id && datapoint.label === m.label && datapoint.rawValue === snapshot.rawValue && datapoint.valueNum === snapshot.rawValue && datapoint.unit === m.unit && datapoint.displayValue === displayText(snapshot) && (datapoint.norm || "") === normText(snapshot) && datapoint.outOfRange === snapshot.outOfRange && datapoint.assessment === assessment(snapshot) && datapoint.tone === tone(snapshot) && datapoint.interpretation === snapshot.interpretation && datapoint.referenceProfileId === (snapshot.reference?.profileId || snapshot.policy?.id || null) && datapoint.referenceProfileVersion === (snapshot.policy?.version ?? null);
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.ktvSnapshot;
    if (!labResult || !matchesDatapoint(datapoint, snapshot)) return labResult;
    const m = metric(snapshot);
    Object.assign(labResult, { test: m.label, value: labDisplayText(snapshot), valueNum: snapshot.rawValue, unit: m.unit, testKey: m.testKey });
    if (normText(snapshot)) labResult.norm = normText(snapshot); else delete labResult.norm;
    return labResult;
  }
  function asLabResult(datapoint) { return applyLabResult(datapoint, {}); }
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
    const snapshot = datapoint?.ktvSnapshot;
    if (!matchesDatapoint(datapoint, snapshot)) return "";
    const m = metric(snapshot), norm = normText(snapshot);
    const rows = [NOTE_HEADER, `Wskaźnik: ${m.label}.`, `Wynik: ${displayText(snapshot)}${m.unit === "%" ? " %" : ""}.`, `Opis wyniku: ${clean(snapshot.interpretation)}`, norm ? `Cel użyty przy zapisie: ${norm}.` : "Nie zastosowano celu porównania.", TREE_HEADER];
    try { rows.push(...treeRows(snapshot)); } catch (_) { return ""; }
    rows.push(TREE_END);
    return rows.join("\n");
  }
  function hasSavedAssessment(note) { return typeof note?.body === "string" && note.body.includes("Adekwatność hemodializy — ocena w chwili zapisu"); }
  function savedAssessment(note) {
    if (!hasSavedAssessment(note) || !note.body.includes(NOTE_HEADER) || note.body.length > 150000) return null;
    const rows = note.body.slice(note.body.indexOf(NOTE_HEADER)).split("\n");
    const start = rows.indexOf(TREE_HEADER), end = rows.indexOf(TREE_END);
    if (start < 0 || end <= start) return null;
    const snapshot = readTree(rows.slice(start + 1, end));
    if (!validSnapshot(snapshot)) return null;
    const m = metric(snapshot), lab = note.labResult || {}, norm = normText(snapshot);
    if (lab.test !== m.label || lab.unit !== m.unit || lab.testKey !== m.testKey || lab.valueNum !== snapshot.rawValue || normalized(lab.value) !== normalized(labDisplayText(snapshot)) || clean(lab.norm || "") !== norm) return null;
    if (snapshot.input.evaluationDate && snapshot.input.evaluationDate !== String(note.clinicalDateISO || "").slice(0, 10)) return null;
    if (!rows.includes(`Wskaźnik: ${m.label}.`) || !rows.includes(`Wynik: ${displayText(snapshot)}${m.unit === "%" ? " %" : ""}.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`) || !rows.includes(norm ? `Cel użyty przy zapisie: ${norm}.` : "Nie zastosowano celu porównania.")) return null;
    return { ...snapshot, displayValue: displayText(snapshot), comparator: "", norm };
  }
  function legacyPoint(note) {
    const m = Object.values(METRICS).find(item => item.label === note?.labResult?.test), lab = note?.labResult;
    if (!m || lab.unit && lab.unit !== m.unit) return null;
    const parsed = numeric(lab.value), rawValue = typeof lab.valueNum === "number" && Number.isFinite(lab.valueNum) ? lab.valueNum : parsed;
    if (!Number.isFinite(rawValue) || m.unit !== "%" && rawValue < 0 || m.unit === "%" && rawValue > 100) return null;
    // An old literal comparison remains historical evidence. No new target,
    // age, residual clearance or clinical classification is inferred here.
    return { rawValue, valueNum: rawValue, displayValue: clean(lab.value) || String(rawValue).replace(".", ","), unit: m.unit, comparator: "", norm: hasSavedAssessment(note) ? "" : clean(lab.norm), outOfRange: !hasSavedAssessment(note) && typeof note.body === "string" && note.body.includes("wynik poza zakresem") ? true : null, assessment: "unassessed", tone: "neutral" };
  }
  function prepareValues(values = {}, context = {}, snapshot) {
    const result = {};
    if (validSnapshot(snapshot)) {
      for (const [id, key] of Object.entries(FIELD_MAP)) if (own(snapshot.input, key)) result[id] = copy(snapshot.input[key]);
      for (const [id, value] of Object.entries(snapshot.input.knownFacts)) if (!own(result, id) && (value === null || ["string", "number", "boolean"].includes(typeof value))) result[id] = value;
      if (Object.keys(snapshot.input.knownFacts).length) result.ktvKnownFacts = JSON.stringify(snapshot.input.knownFacts);
      return result;
    }
    for (const [id] of Object.entries(FIELD_MAP)) if (own(values, id)) result[id] = values[id];
    for (const [id, value] of Object.entries(values)) if ((FACT_FIELD_IDS.has(id) || id === "ktvKnownFacts") && !own(result, id) && (value === null || ["string", "number", "boolean"].includes(typeof value))) result[id] = value;
    const id = context.parameterKey || context.id;
    if (!result.ktvVariant) result.ktvVariant = Object.keys(METRICS).find(key => METRICS[key].id === id) || "spktv";
    if (!own(result, "age") && context.ageYears != null) { result.age = context.ageYears; result.ageMonths = 0; }
    return result;
  }
  function editableFields(values = {}) {
    const variant = values.ktvVariant || "spktv";
    const field = (id, label, required, options) => ({ id, label, required, type: options ? "select" : "text", unitFieldId: "", historicalContext: false, options: (options || []).map(([value, title]) => ({ value, label: title })) });
    const fields = [field("UreaPre", "Mocznik / BUN przed dializą", true), field("UreaPost", "Mocznik / BUN po dializie", true)];
    if (variant !== "urr") fields.push(field("ktvDurationMinutes", "Czas sesji (min)", true), field("ktvUF", "Ultrafiltracja netto (L)", true), field("ktvW", "Masa po dializie (kg)", true));
    else fields.push(field("ktvDurationMinutes", "Czas sesji (min), do porównania", false));
    fields.push(field("ktvSessionsPerWeek", "Liczba sesji w tygodniu", variant !== "urr", [["", "Nie podano"], ...[2, 3, 4, 5, 6, 7].map(n => [String(n), String(n)])]));
    if (variant !== "urr") fields.push(field("ktvPidiDays", "Odstęp od początku poprzedniej sesji (dni)", true, [["", "Wybierz"], ...[1, 2, 3, 4].map(n => [String(n), String(n)])]));
    if (variant === "ektv") fields.push(field("ktvAccessType", "Dostęp naczyniowy", true, [["unknown", "Nie podano"], ["avf", "Przetoka / proteza naczyniowa"], ["cvc", "Cewnik żylny"]]));
    return fields;
  }
  function captureFields(values) {
    const editable = editableFields(values), ids = new Set(editable.map(item => item.id));
    return [...editable, ...Object.keys(values || {}).filter(id => !ids.has(id)).map(id => ({ id, label: LABELS[FIELD_MAP[id]] || LABELS[id] || id, type: typeof values[id] === "boolean" ? "checkbox" : "text", required: false, unitFieldId: "", historicalContext: true, options: [] }))];
  }
  return Object.freeze({ NOTE_HEADER, METRICS, FIELD_MAP, readSnapshot, fromResult, datapoint: fromResult, augmentDatapoint, applyLabResult, asLabResult, matchesDatapoint, referenceNote, note: referenceNote, hasSavedAssessment, savedAssessment, readAssessment: savedAssessment, legacyPoint, displayText, normText, assessment, prepareValues, captureFields, editableFields });
});
