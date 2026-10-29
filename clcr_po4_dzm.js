/* Phosphorus excretion: exact decimal arithmetic and source-injected references.
 * Conventional mass is elemental P, never the mass of the PO4 ion. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrPo4Dzm = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1, MOLAR_MASS = 30.9738;
  const FIELD_IDS = Object.freeze(["PO4_inputMode", "PO4_concentration", "PO4_concentrationUnit", "PO4_volume", "PO4_volumeUnit", "PO4_reportedValue", "PO4_reportedUnit", "PO4_collectionHours", "PO4_collectionSource", "PO4_outputUnit", "PO4_unitConversions"]);
  const COLLECTION_FIELDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const CONTEXT_FIELD_IDS = Object.freeze(["weight", "age", "ageMonths", "ageDays", "sex", ...COLLECTION_FIELDS, ...COLLECTION_FIELDS.map(id => "ui_" + id + "_answer"), "collectionStartAt", "collectionEndAt", "Cl24CollectionProblem"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const absent = value => value == null || typeof value === "string" && value.trim() === "";
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const copy = value => Array.isArray(value) ? value.map(copy) : object(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function primitive(value) { return value == null ? "" : typeof value === "string" ? value.length <= 512 ? value : "[invalid value]" : typeof value === "number" ? finite(value) ? value : String(value) : "[invalid value]"; }
  function gcd(a, b) { a = a < 0n ? -a : a; while (b) { const r = a % b; a = b; b = r; } return a || 1n; }
  function reduced(n, d) { const g = gcd(n, d); return { n: n / g, d: d / g }; }
  function fraction(text) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(text).replace(",", ".").replace(/−/g, "-"));
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 1024) return null;
    let n = BigInt((match[1] === "-" ? "-" : "") + ((match[2] || "0") + (match[3] || ""))), d = 1n;
    if (exponent >= 0) n *= 10n ** BigInt(exponent); else d = 10n ** BigInt(-exponent);
    return reduced(n, d);
  }
  const mul = (a, b) => reduced(a.n * b.n, a.d * b.d);
  const div = (a, b) => reduced(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const exact = a => a === null ? null : { numerator: String(a.n), denominator: String(a.d) };
  function fromExact(value) {
    if (!object(value) || !/^-?\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "") || BigInt(value.denominator) <= 0n) return null;
    return reduced(BigInt(value.numerator), BigInt(value.denominator));
  }
  function roundedQuotient(n, d) {
    const q = n / d, r = n % d;
    return q + (r * 2n > d || r * 2n === d && q % 2n === 1n ? 1n : 0n);
  }
  function numberOf(value) {
    if (value.n === 0n) return 0;
    const negative = value.n < 0n, n = negative ? -value.n : value.n, d = value.d;
    let exponent = n.toString(2).length - d.toString(2).length;
    if (exponent >= 0 ? n < d * 2n ** BigInt(exponent) : n * 2n ** BigInt(-exponent) < d) exponent -= 1;
    if (exponent > 1023) return negative ? -Infinity : Infinity;
    if (exponent < -1075) return negative ? -0 : 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? roundedQuotient(n * 2n ** BigInt(scale), d) : roundedQuotient(n, d * 2n ** BigInt(-scale));
    const result = Number(coefficient) * 2 ** -scale;
    return negative ? -result : result;
  }
  function parseValue(value) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(",", ".");
    if (!text || text.length > 512) return null;
    const rational = fraction(text), number = Number(text);
    if (!rational || !finite(number) || number === 0 && rational.n !== 0n) return null;
    const represented = fraction(String(number));
    return { value: Object.is(number, -0) ? 0 : number, text, exact: exact(rational), lossless: Boolean(represented && cmp(rational, represented) === 0) };
  }
  function decimal(value, places) {
    const negative = value.n < 0n, n = negative ? -value.n : value.n;
    let r = n % value.d, result = String(n / value.d), digits = "";
    for (let i = 0; i < places && r; i += 1) { r *= 10n; digits += String(r / value.d); r %= value.d; }
    if (digits) result += "." + digits.replace(/0+$/, "");
    return (negative ? "-" : "") + result.replace(/\.$/, "");
  }
  function short(value, digits = 12) {
    if (!finite(value)) return "";
    return (value !== 0 && (Math.abs(value) < 1e-7 || Math.abs(value) >= 1e12) ? String(value) : value.toLocaleString("pl-PL", { useGrouping: false, maximumFractionDigits: digits })).replace(".", ",");
  }
  function formatValue(value, exactValue, bounds = []) {
    if (!finite(value)) return "";
    const rational = fromExact(exactValue) || fraction(String(value));
    if (numberOf(rational) !== value) return "";
    const comparisons = [fraction("0"), ...bounds.map(item => fromExact(item)).filter(Boolean)];
    const correct = text => { const shown = fraction(text); return shown && comparisons.every(bound => { const side = cmp(rational, bound); return side === 0 || cmp(shown, bound) === side; }); };
    const candidate = short(value, 2);
    if (candidate.length <= 120 && correct(candidate)) return candidate;
    for (const places of [16, 24, 32, 48, 64, 96, 120]) { const text = decimal(rational, places).replace(".", ","); if (text.length <= 120 && correct(text)) return text; }
    return "";
  }
  function facts(input) {
    const result = {};
    for (const id of COLLECTION_FIELDS) {
      const answer = input["ui_" + id + "_answer"];
      if (answer === "yes" || answer === "no") { result[id] = answer === "yes"; result["ui_" + id + "_answer"] = answer; }
      else if (input[id] === true) result[id] = true;
    }
    if (input.Cl24CollectionProblem === true) result.Cl24CollectionProblem = true;
    for (const [key, value] of Object.entries(object(input.knownFacts) ? input.knownFacts : {})) {
      if (!CONTEXT_FIELD_IDS.includes(key)) continue;
      if (value == null || typeof value === "boolean" || finite(value) || typeof value === "string" && value.length <= 512) result[key] = value;
    }
    return result;
  }
  function unitFor(value, kind) {
    const text = String(value).replace(/\s/g, "").toLowerCase();
    if (kind === "concentration") return ({"mgp/dl":"mgP/dL", "mg/dl":"mgP/dL", "mgp/l":"mgP/L", "mg/l":"mgP/L", "mmol/l":"mmol/L"})[text] || value;
    return ({"mgp/24h":"mgP/24h", "mg/24h":"mgP/24h", "mmol/24h":"mmol/24h"})[text] || value;
  }
  const CONVERSION_KINDS = Object.freeze({
    concentration: { field: "concentration", unit: "concentrationUnit", factors: { "mgP/dL": "10", "mgP/L": "1", "mmol/L": String(MOLAR_MASS) } },
    volume: { field: "volume", unit: "volumeUnit", factors: { "mL": "0.001", "L": "1" } },
    reportedValue: { field: "reportedValue", unit: "reportedUnit", factors: { "mgP/24h": "1", "mmol/24h": String(MOLAR_MASS) } }
  });
  function convertUnitInput(value, from, to, kind) {
    const spec = CONVERSION_KINDS[kind], parsed = parseValue(value);
    const blank = { ok: false, text: "", value: null, unit: to, exactValue: null };
    if (!spec || !own(spec.factors, from) || !own(spec.factors, to) || !parsed?.lossless || parsed.value < 0 || kind === "volume" && parsed.value === 0) return freeze(blank);
    const quantity = div(mul(fromExact(parsed.exact), fraction(spec.factors[from])), fraction(spec.factors[to])), converted = numberOf(quantity);
    if (!finite(converted) || converted === 0 && quantity.n !== 0n) return freeze(blank);
    return freeze({ ok: true, text: String(converted).replace(".", ","), value: converted, unit: to, exactValue: exact(quantity) });
  }
  function validatedConversions(value, data) {
    let supplied = value;
    if (typeof supplied === "string") {
      if (!supplied.trim()) return {};
      if (supplied.length > 8192) return {};
      try { supplied = JSON.parse(supplied); } catch (_) { return {}; }
    }
    if (!safeData(supplied) || !object(supplied) || Object.keys(supplied).some(key => !own(CONVERSION_KINDS, key))) return {};
    const result = {};
    for (const [kind, entry] of Object.entries(supplied)) {
      const spec = CONVERSION_KINDS[kind];
      if (!object(entry) || Object.keys(entry).length !== 4 || !["originalValue", "originalUnit", "convertedValue", "convertedUnit"].every(key => own(entry, key))) continue;
      if (!["string", "number"].includes(typeof entry.originalValue) || !["string", "number"].includes(typeof entry.convertedValue) || !own(spec.factors, entry.originalUnit) || !own(spec.factors, entry.convertedUnit) || String(data[spec.field]) !== String(entry.convertedValue) || data[spec.unit] !== entry.convertedUnit) continue;
      const parsed = parseValue(entry.convertedValue), expected = convertUnitInput(entry.originalValue, entry.originalUnit, entry.convertedUnit, kind);
      if (!parsed?.lossless || !expected.ok || parsed.value !== expected.value) continue;
      result[kind] = { originalValue: primitive(entry.originalValue), originalUnit: entry.originalUnit, convertedValue: primitive(entry.convertedValue), convertedUnit: entry.convertedUnit };
    }
    return result;
  }
  function inputData(input) {
    const data = object(input) ? input : {}, durationNeedsConfirmation = data.durationNeedsConfirmation === true && absent(data.hours);
    const hours = absent(data.hours) && !durationNeedsConfirmation ? "24" : primitive(data.hours);
    const durationSource = durationNeedsConfirmation ? "historical-missing" : absent(data.hours) ? "assumed-24h" : data.durationSource === "captured" ? "captured" : data.durationSource === "assumed-24h" && parseValue(hours)?.value === 24 ? "assumed-24h" : "hours";
    const result = { mode: own(data, "mode") ? primitive(data.mode) : "concentration", concentration: primitive(data.concentration), concentrationUnit: unitFor(own(data, "concentrationUnit") ? primitive(data.concentrationUnit) : "mgP/dL", "concentration"), volume: primitive(data.volume), volumeUnit: own(data, "volumeUnit") ? primitive(data.volumeUnit) : "mL", reportedValue: primitive(data.reportedValue), reportedUnit: unitFor(own(data, "reportedUnit") ? primitive(data.reportedUnit) : "mgP/24h"), outputUnit: unitFor(own(data, "outputUnit") ? primitive(data.outputUnit) : "mgP/24h"), hours, durationSource, durationNeedsConfirmation, weightKg: primitive(data.weightKg), ageYears: absent(data.ageYears) ? null : primitive(data.ageYears), sex: typeof data.sex === "string" && ["M", "F"].includes(data.sex.toUpperCase()) ? data.sex.toUpperCase() : null, agePrecision: data.agePrecision === "completed-years" ? "completed-years" : "exact", knownFacts: facts(data) };
    result.unitConversions = validatedConversions(data.unitConversions, result);
    return result;
  }
  function ageFrom(values, context) {
    if (own(values, "age")) {
      if (absent(values.age)) return null;
      const years = parseValue(values.age), months = absent(values.ageMonths) ? { value: 0, lossless: true } : parseValue(values.ageMonths);
      if (!years?.lossless || !months?.lossless || years.value < 0 || months.value < 0 || months.value >= 12) return null;
      if (years.value === 0 && months.value === 0 && !absent(values.ageDays)) { const days = parseValue(values.ageDays); if (!days?.lossless || days.value < 0) return null; return days.value / 365.25; }
      return years.value + months.value / 12;
    }
    return context.ageYears ?? context.ageContext?.exactYears ?? null;
  }
  function inputFromValues(values, context) {
    const data = object(values) ? values : {}, supplied = object(context) ? context : {};
    const duration = [supplied.durationMinutes, supplied.collectionAnalysis?.durationMinutes].find(value => finite(value) && value > 0);
    const hours = own(data, "PO4_collectionHours") ? data.PO4_collectionHours : own(supplied, "collectionHours") ? supplied.collectionHours : duration ? duration / 60 : "24";
    const legacyDatesOnly = !own(data, "PO4_collectionHours") && !own(supplied, "collectionHours") && !duration && (!absent(data.collectionStartAt) || !absent(data.collectionEndAt));
    const knownFacts = { ...facts(supplied), ...facts(data) };
    for (const id of ["age", "ageMonths", "ageDays", "collectionStartAt", "collectionEndAt"]) if (own(data, id)) knownFacts[id] = primitive(data[id]);
    return inputData({ mode: own(data, "PO4_inputMode") ? data.PO4_inputMode : "concentration", concentration: own(data, "PO4_concentration") ? data.PO4_concentration : data.U_PO4 ?? "", concentrationUnit: own(data, "PO4_concentrationUnit") ? data.PO4_concentrationUnit : "mgP/dL", volume: own(data, "PO4_volume") ? data.PO4_volume : data.V24 ?? "", volumeUnit: own(data, "PO4_volumeUnit") ? data.PO4_volumeUnit : "mL", reportedValue: data.PO4_reportedValue ?? "", reportedUnit: own(data, "PO4_reportedUnit") ? data.PO4_reportedUnit : "mgP/24h", outputUnit: data.PO4_outputUnit ?? supplied.outputUnit ?? "mgP/24h", unitConversions: data.PO4_unitConversions ?? supplied.unitConversions ?? {}, hours: legacyDatesOnly ? "" : hours, durationSource: data.PO4_collectionSource ?? supplied.durationSource ?? (own(data, "PO4_collectionHours") && !absent(data.PO4_collectionHours) ? "hours" : duration || own(supplied, "collectionHours") ? "captured" : "assumed-24h"), durationNeedsConfirmation: data.PO4_durationNeedsConfirmation === true || data.PO4_durationNeedsConfirmation === "true" || data.PO4_collectionSource === "historical-missing" || supplied.durationNeedsConfirmation === true || legacyDatesOnly, weightKg: data.weight ?? supplied.weightKg ?? "", ageYears: ageFrom(data, supplied), agePrecision: own(data, "age") && Number.isInteger(parseValue(data.age)?.value) && absent(data.ageMonths) && absent(data.ageDays) ? "completed-years" : supplied.agePrecision, sex: own(data, "sex") ? data.sex : supplied.sex, knownFacts });
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document, vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {}, values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS, "PO4_durationNeedsConfirmation", "U_PO4", "V24"]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" || control.type === "radio" ? control.checked === true : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    return inputFromValues(values, context);
  }
  const INPUT_LABELS = Object.freeze({ concentration: "stężenie fosforu", volume: "objętość zbiórki", hours: "czas zbiórki", reportedValue: "gotowe wydalanie" });
  const INPUT_IDS = Object.freeze({ concentration: "PO4_concentration", volume: "PO4_volume", hours: "PO4_collectionHours", reportedValue: "PO4_reportedValue" });
  function compute(input) {
    const data = inputData(input), missingIds = [], invalidIds = [], problems = [], cautions = [];
    const fail = (code, message, blocked = false) => freeze({ ok: false, valid: false, rawValue: null, value: null, dailyMg: null, perKg: null, unit: "", display: { text: "", boundary: "" }, input: data, missingIds, invalidIds, cautions, errorCode: code, error: message, blocked });
    const contradictions = COLLECTION_FIELDS.filter(id => data.knownFacts[id] === false || data.knownFacts["ui_" + id + "_answer"] === "no");
    if (data.knownFacts.Cl24CollectionProblem === true) contradictions.push("Cl24CollectionProblem");
    if (contradictions.length) { invalidIds.push(...contradictions); return fail("collection-conflict", "Podano problem kompletności lub protokołu zbiórki. Nie można wiarygodnie obliczyć wydalania z tych danych.", true); }
    if (!["concentration", "reported"].includes(data.mode)) { invalidIds.push("PO4_inputMode"); return fail("invalid-mode", "Wybierz sposób podania wyniku."); }
    function parseField(key, positive) {
      if (absent(data[key])) { missingIds.push(INPUT_IDS[key]); problems.push({ code: "missing-" + key, message: "Uzupełnij pole: " + INPUT_LABELS[key] + ".", missing: true }); return null; }
      const parsed = parseValue(data[key]);
      if (!parsed || parsed.value < 0 || positive && parsed.value === 0) { invalidIds.push(INPUT_IDS[key]); problems.push({ code: "invalid-" + key, message: "Sprawdź pole: " + INPUT_LABELS[key] + (positive ? ". Wartość musi być większa od 0." : ". Wpisz nieujemną liczbę.") }); return null; }
      if (!parsed.lossless) { invalidIds.push(INPUT_IDS[key]); problems.push({ code: "numeric-precision", message: "Sprawdź dokładność wpisu. Tej wartości nie można zapisać bez zmiany jej cyfr." }); return null; }
      return fromExact(parsed.exact);
    }
    // Known duration remains relevant in both modes; a daily report is never rescaled.
    const hours = parseField("hours", true);
    const quantity = (key, fallback) => data.unitConversions[key] ? fromExact(parseValue(data.unitConversions[key].originalValue).exact) : fallback;
    const quantityUnit = (key, fallback) => data.unitConversions[key]?.originalUnit || fallback;
    let daily = null;
    if (data.mode === "concentration") {
      const concentration = parseField("concentration", false), volume = parseField("volume", true);
      const factors = { "mgP/dL": fraction("10"), "mgP/L": fraction("1"), "mmol/L": fraction(String(MOLAR_MASS)) };
      if (!own(factors, data.concentrationUnit)) { invalidIds.push("PO4_concentrationUnit"); problems.push({ code: "invalid-concentration-unit", message: "Wybierz obsługiwaną jednostkę stężenia." }); }
      if (!["mL", "L"].includes(data.volumeUnit)) { invalidIds.push("PO4_volumeUnit"); problems.push({ code: "invalid-volume-unit", message: "Wybierz objętość w mL lub L." }); }
      if (!problems.length) daily = div(mul(mul(mul(quantity("concentration", concentration), factors[quantityUnit("concentration", data.concentrationUnit)]), quantityUnit("volume", data.volumeUnit) === "L" ? quantity("volume", volume) : div(quantity("volume", volume), fraction("1000"))), fraction("24")), hours);
    } else {
      const reported = parseField("reportedValue", false);
      if (!["mgP/24h", "mmol/24h"].includes(data.reportedUnit)) { invalidIds.push("PO4_reportedUnit"); problems.push({ code: "invalid-reported-unit", message: "Wybierz gotowy wynik w mg P/24 h lub mmol/24 h." }); }
      if (!problems.length) daily = quantityUnit("reportedValue", data.reportedUnit) === "mmol/24h" ? mul(quantity("reportedValue", reported), fraction(String(MOLAR_MASS))) : quantity("reportedValue", reported);
    }
    if (!["mgP/24h", "mmol/24h"].includes(data.outputUnit)) { invalidIds.push("PO4_outputUnit"); problems.push({ code: "invalid-output-unit", message: "Wybierz obsługiwaną jednostkę wyniku." }); }
    if (problems.length) { const first = problems.find(problem => !problem.missing) || problems[0]; return fail(first.code, first.message); }
    const rawValue = numberOf(daily);
    if (!finite(rawValue) || rawValue === 0 && daily.n !== 0n) return fail("numeric-range", "Wynik jest poza zakresem obliczeń. Sprawdź wartości i jednostki.");
    let perKg = null;
    if (!absent(data.weightKg)) {
      const weight = parseValue(data.weightKg);
      if (weight?.lossless && weight.value > 0) {
        const quotient = div(daily, fromExact(weight.exact)), value = numberOf(quotient);
        if (finite(value) && !(value === 0 && quotient.n !== 0n)) perKg = quotient;
      }
      if (!perKg) cautions.push("Przeliczenie na kg jest niedostępne: sprawdź masę ciała i zakres liczb. Ilość dobowa pozostaje dostępna.");
    }
    const shown = formatValue(rawValue, exact(daily));
    if (!shown) return fail("numeric-precision", "Wyniku nie można pokazać z wymaganą dokładnością. Sprawdź liczbę cyfr wejścia.");
    return freeze({ ok: true, valid: true, rawValue, value: rawValue, dailyMg: rawValue, perKg: perKg ? numberOf(perKg) : null, unit: "mg P/24 h", exactMain: exact(daily), exactDailyMg: exact(daily), exactPerKg: exact(perKg), display: { text: shown, boundary: "" }, hours: numberOf(hours), input: data, missingIds, invalidIds, cautions, errorCode: "", error: "", blocked: false });
  }
  function safeData(value, seen = new Set(), depth = 0) {
    if (value === null || typeof value === "boolean" || finite(value) || typeof value === "string" && value.length <= 10000) return true;
    if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return false;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const valid = Object.values(descriptors).every(property => !property.get && !property.set && safeData(property.value, seen, depth + 1));
    seen.delete(value); return valid;
  }
  function validPolicy(policy) {
    if (!safeData(policy) || !object(policy) || policy.quantity !== "phosphorus-excretion" || !finite(policy.minimumAge) || policy.minimumAge < 0 || !finite(policy.sexRequiredAge) || policy.sexRequiredAge < policy.minimumAge || typeof policy.id !== "string" || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || !object(policy.population) || typeof policy.population.label !== "string" || !policy.population.label || !Array.isArray(policy.profiles) || !policy.profiles.length || !Array.isArray(policy.sources) || !policy.sources.length || !object(policy.notes)) return false;
    if (!policy.sources.every(source => object(source) && ["id", "label", "url"].every(key => typeof source[key] === "string" && source[key]))) return false;
    if (!["noPolicyTitle", "noPolicy", "noAge", "belowAge", "noSex", "noProfile", "non24Title", "non24", "reportedNon24", "zeroTitle", "zero"].every(key => typeof policy.notes[key] === "string" && policy.notes[key])) return false;
    const ids = new Set();
    return policy.profiles.every(p => {
      if (!object(p) || ids.has(p.id) || p.kind !== "interval" || ![null, "M", "F"].includes(p.sex) || !finite(p.ageLower) || p.ageLower < 0 || p.ageUpper !== null && (!finite(p.ageUpper) || p.ageUpper <= p.ageLower) || !["ageLowerInclusive", "ageUpperInclusive", "lowerInclusive", "upperInclusive"].every(key => typeof p[key] === "boolean") || p.unit !== "mg P/24 h" || !finite(p.lower) || p.lower < 0 || !finite(p.upper) || p.upper < p.lower || !["id", "label", "population", "text", "sourceId", "sourceLabel"].every(key => typeof p[key] === "string" && p[key]) || !policy.sources.some(source => source.id === p.sourceId) || !object(p.titles) || !object(p.copy) || !["low", "within", "high"].every(key => typeof p.titles[key] === "string" && typeof p.copy[key] === "string") || !["contextLabel", "method", "sample", "explanation"].every(key => typeof p[key] === "string")) return false;
      ids.add(p.id); return true;
    });
  }
  function profileFor(policy, age, precision, sex) {
    if (!age?.lossless || age.value < 0 || precision === "completed-years" && !Number.isInteger(age.value) || !Array.isArray(policy?.profiles)) return null;
    const a = fromExact(age.exact);
    const matches = policy.profiles.filter(p => {
      if (p.sex !== null && p.sex !== sex) return false;
      const lo = cmp(a, fraction(String(p.ageLower))), hi = p.ageUpper === null ? -1 : cmp(a, fraction(String(p.ageUpper)));
      if (!(lo > 0 || lo === 0 && p.ageLowerInclusive) || !(hi < 0 || hi === 0 && p.ageUpperInclusive)) return false;
      // A completed year means the interval [age, age+1), not an exact birthday.
      return precision !== "completed-years" || p.ageUpper === null || p.ageUpper >= age.value + 1;
    });
    return matches.length === 1 ? matches[0] : null;
  }
  function presentation(result, selectedUnit = result?.outputUnit || "mgP/24h") {
    const outputUnit = unitFor(selectedUnit), unitText = outputUnit === "mmol/24h" ? "mmol/24 h" : "mg P/24 h";
    const blank = { ok: false, outputUnit, valueText: "", referenceValue: "Brak normy do porównania", referenceText: "Brak normy do porównania", unitText, precision: 3, rawValue: null, lower: null, upper: null, exactValue: null, exactLower: null, exactUpper: null };
    if (!result?.valid || !["mgP/24h", "mmol/24h"].includes(outputUnit)) return freeze(blank);
    const main = fromExact(result.exactMain) || fraction(String(result.rawValue));
    if (!main || main.n < 0n) return freeze(blank);
    const convert = q => outputUnit === "mmol/24h" ? div(q, fraction(String(MOLAR_MASS))) : q;
    const qValue = convert(main), qLower = result.reference ? convert(fromExact(result.reference.exactLower) || fraction(String(result.reference.lower))) : null, qUpper = result.reference ? convert(fromExact(result.reference.exactUpper) || fraction(String(result.reference.upper))) : null;
    const values = [qValue, qLower, qUpper], numbers = values.map(q => q ? numberOf(q) : null);
    if (values.some((q, index) => q && (!finite(numbers[index]) || numbers[index] === 0 && q.n !== 0n))) return freeze({ ...blank, errorCode: "numeric-range" });
    function correct(texts) {
      const shown = texts.map(text => text === null ? null : fraction(text));
      if (!shown[0] || cmp(shown[0], fraction("0")) !== cmp(qValue, fraction("0"))) return false;
      return [1, 2].every(index => !values[index] || shown[index] && cmp(shown[0], shown[index]) === cmp(qValue, values[index]));
    }
    // All three values share precision, including converted molar boundaries.
    // Exact fallback handles arithmetic distinctions smaller than a Number ULP.
    for (let precision = 3; precision <= 120; precision += 1) {
      const texts = values.map((q, index) => q ? (precision <= 15 ? short(numbers[index], precision) : decimal(q, precision).replace(".", ",")) : null);
      if (texts.some(text => text !== null && text.length > 160) || !correct(texts)) continue;
      const referenceValue = qLower ? texts[1] + "–" + texts[2] : blank.referenceValue;
      return freeze({ ok: true, outputUnit, valueText: texts[0], referenceValue, referenceText: qLower ? referenceValue + " " + unitText : referenceValue, unitText, precision, rawValue: numbers[0], lower: numbers[1], upper: numbers[2], exactValue: exact(qValue), exactLower: exact(qLower), exactUpper: exact(qUpper) });
    }
    return freeze({ ...blank, errorCode: "numeric-precision" });
  }
  function evaluate(input, policy) {
    const hasPolicy = validPolicy(policy), result = compute(input), data = result.input;
    const notes = hasPolicy ? copy(policy.notes) : {}, age = parseValue(data.ageYears);
    const populationCategory = age?.lossless && age.value >= 0 ? age.value >= 18 ? "adult" : "child" : null;
    const profile = hasPolicy && result.valid && result.hours === 24 ? profileFor(policy, age, data.agePrecision, data.sex) : null;
    let status = "unassessed", tone = "neutral", outOfRange = null, reference = null;
    let interpretation = notes.noPolicy || "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.", statusText = notes.noPolicyTitle || "Wynik bez porównania z normą", contextLabel = "Dobowe wydalanie fosforu";
    if (profile) {
      const lower = fraction(String(profile.lower)), upper = fraction(String(profile.upper)), main = fromExact(result.exactMain), lo = cmp(main, lower), hi = cmp(main, upper);
      status = lo < 0 || lo === 0 && !profile.lowerInclusive ? "low" : hi > 0 || hi === 0 && !profile.upperInclusive ? "high" : "within";
      tone = status === "within" ? "normal" : "warning"; outOfRange = status !== "within";
      reference = { kind: "interval", profileId: profile.id, lower: profile.lower, upper: profile.upper, min: profile.lower, max: profile.upper, lowerInclusive: profile.lowerInclusive, upperInclusive: profile.upperInclusive, unit: "mg P/24 h", label: profile.label, text: profile.text, hint: profile.population, note: profile.population, sourceIds: profile.sourceIds || [profile.sourceId], sourceId: profile.sourceId, sourceLabel: profile.sourceLabel, method: profile.method, sample: profile.sample, sourceUnit: profile.unit, sourceText: profile.text, sourceLower: profile.lower, sourceUpper: profile.upper, exactLower: exact(lower), exactUpper: exact(upper), lowerText: short(profile.lower), upperText: short(profile.upper), ageLower: profile.ageLower, ageUpper: profile.ageUpper, ageLowerInclusive: profile.ageLowerInclusive, ageUpperInclusive: profile.ageUpperInclusive, sex: profile.sex, agePolicy: policy.agePolicy || "" };
      statusText = profile.titles[status] || statusText; interpretation = profile.copy[status] || interpretation; contextLabel = profile.contextLabel;
    }
    if (result.valid && result.hours !== 24) {
      statusText = notes.non24Title || "Oszacowanie na 24 godziny";
      interpretation = data.mode === "reported" ? notes.reportedNon24 : notes.non24;
      contextLabel = "Zbiórka z innym czasem";
    } else if (result.valid && (!age?.lossless || age.value < 0)) interpretation = notes.noAge || interpretation;
    else if (result.valid && !profile && hasPolicy) interpretation = age.value < policy.minimumAge ? notes.belowAge : age.value >= policy.sexRequiredAge && data.sex === null ? notes.noSex : notes.noProfile;
    if (result.valid && result.rawValue === 0) {
      status = "zero"; tone = "neutral"; outOfRange = null; reference = null;
      statusText = notes.zeroTitle || "Wynik 0 — sprawdź zapis laboratorium";
      interpretation = (result.hours !== 24 ? interpretation + " " : "") + (notes.zero || "Sprawdź, czy 0 oznacza wynik poniżej granicy oznaczalności. Zapis „<” nie jest dokładnym zerem.");
      contextLabel = "Ocena wyniku zerowego";
    }
    const model = { ...copy(result), schema: "clcr-po4-dzm", version: 1, engineVersion: ENGINE_VERSION, molarMass: MOLAR_MASS, chemicalBasis: "phosphorus-P", status, statusText: result.valid ? statusText : "", tone, outOfRange, category: null, interpretation: result.valid ? interpretation || "" : "", contextLabel, reference, references: reference ? [copy(reference)] : [], referenceAvailable: Boolean(reference), referenceActive: Boolean(reference), referenceLabel: reference?.label || "Norma dla wieku", referenceText: reference?.text || "Brak normy do porównania", referenceHint: reference?.sourceLabel || "", referenceRows: hasPolicy ? policy.profiles.map(p => ({ profileId: p.id, population: p.population, label: p.label, text: p.text, unit: p.unit, sourceId: p.sourceId, sourceLabel: p.sourceLabel, active: reference?.profileId === p.id })) : [], policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null, referencePolicy: hasPolicy ? copy(policy) : null, populationCategory, dailyDisplay: result.valid ? formatValue(result.dailyMg, result.exactDailyMg) : "", perKgDisplay: result.valid && result.perKg !== null ? formatValue(result.perKg, result.exactPerKg) : "", sources: hasPolicy ? copy(policy.sources) : [], educationalReferences: hasPolicy ? copy(policy.educationalReferences || []) : [], notes, outputUnit: data.outputUnit };
    model.notes.sourceSummary = reference ? reference.sourceLabel + " · pełna zbiórka 24 h" : "";
    model.notes.contextExplanation = profile?.explanation || interpretation || "";
    model.presentation = presentation(model, data.outputUnit);
    // The canonical value and chosen output must both remain visibly nonzero.
    if (model.valid && !model.presentation.ok) return freeze({ ...model, ok: false, valid: false, rawValue: null, value: null, dailyMg: null, perKg: null, display: { text: "", boundary: "" }, errorCode: model.presentation.errorCode || "numeric-precision", error: "Wyniku nie można pokazać w wybranej jednostce z wymaganą dokładnością.", status: "unassessed", statusText: "", tone: "neutral", outOfRange: null, reference: null, references: [], referenceAvailable: false, referenceActive: false });
    // Canonical display also shares precision with its canonical reference.
    if (model.valid) model.display = { text: presentation(model, "mgP/24h").valueText, boundary: "" };
    return freeze(model);
  }
  return Object.freeze({ ENGINE_VERSION, MOLAR_MASS, FIELD_IDS, CONTEXT_FIELD_IDS, COLLECTION_FIELDS, parseValue, formatValue, convertUnitInput, inputFromValues, readInputFromDocument, compute, evaluate, calculate: evaluate, presentation, validPolicy });
});
