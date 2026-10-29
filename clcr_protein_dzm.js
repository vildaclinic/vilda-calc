/* Total protein excretion: exact decimal arithmetic and source-injected references.
 * A new ready result is daily; legacy U_Prot remains a separate collection amount. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrProteinDzm = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1;
  const FIELD_IDS = Object.freeze(["Prot_inputMode", "Prot_concentration", "Prot_concentrationUnit", "Prot_volume", "Prot_volumeUnit", "Prot_reportedValue", "Prot_reportedUnit", "Prot_collectionHours", "Prot_collectionSource", "Prot_outputUnit", "Prot_unitConversions", "Prot_durationNeedsConfirmation"]);
  const COLLECTION_FIELDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const CONTEXT_FIELD_IDS = Object.freeze(["weight", "height", "age", "ageMonths", "ageDays", "sex", ...COLLECTION_FIELDS, ...COLLECTION_FIELDS.map(id => "ui_" + id + "_answer"), "collectionStartAt", "collectionEndAt", "Cl24CollectionProblem"]);
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
    if (kind === "concentration") return ({"mg/dl":"mg/dL", "mg/l":"mg/L", "g/l":"g/L"})[text] || value;
    return ({"mg/24h":"mg/24h", "g/24h":"g/24h"})[text] || value;
  }
  const CONVERSION_KINDS = Object.freeze({
    concentration: { field: "concentration", unit: "concentrationUnit", factors: { "mg/dL": "10", "mg/L": "1", "g/L": "1000" } },
    volume: { field: "volume", unit: "volumeUnit", factors: { "mL": "0.001", "L": "1" } },
    reportedValue: { field: "reportedValue", unit: "reportedUnit", factors: { "mg/24h": "1", "g/24h": "1000" } }
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
    const result = { mode: own(data, "mode") ? primitive(data.mode) : "concentration", concentration: primitive(data.concentration), concentrationUnit: unitFor(own(data, "concentrationUnit") ? primitive(data.concentrationUnit) : "mg/L", "concentration"), volume: primitive(data.volume), volumeUnit: own(data, "volumeUnit") ? primitive(data.volumeUnit) : "mL", reportedValue: primitive(data.reportedValue), reportedUnit: unitFor(own(data, "reportedUnit") ? primitive(data.reportedUnit) : "mg/24h"), outputUnit: unitFor(own(data, "outputUnit") ? primitive(data.outputUnit) : "mg/24h"), hours, durationSource, durationNeedsConfirmation, weightKg: primitive(data.weightKg), heightCm: primitive(data.heightCm), ageYears: absent(data.ageYears) ? null : primitive(data.ageYears), sex: typeof data.sex === "string" && ["M", "F"].includes(data.sex.toUpperCase()) ? data.sex.toUpperCase() : null, agePrecision: data.agePrecision === "completed-years" ? "completed-years" : "exact", knownFacts: facts(data) };
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
    const hours = own(data, "Prot_collectionHours") ? data.Prot_collectionHours : own(supplied, "collectionHours") ? supplied.collectionHours : duration ? duration / 60 : "24";
    const legacyDatesOnly = !own(data, "Prot_collectionHours") && !own(supplied, "collectionHours") && !duration && (!absent(data.collectionStartAt) || !absent(data.collectionEndAt));
    const knownFacts = { ...facts(supplied), ...facts(data) };
    for (const id of ["age", "ageMonths", "ageDays", "collectionStartAt", "collectionEndAt"]) if (own(data, id)) knownFacts[id] = primitive(data[id]);
    return inputData({ mode: own(data, "Prot_inputMode") ? data.Prot_inputMode : "concentration", concentration: data.Prot_concentration ?? "", concentrationUnit: own(data, "Prot_concentrationUnit") ? data.Prot_concentrationUnit : "mg/L", volume: data.Prot_volume ?? "", volumeUnit: own(data, "Prot_volumeUnit") ? data.Prot_volumeUnit : "mL", reportedValue: data.Prot_reportedValue ?? "", reportedUnit: own(data, "Prot_reportedUnit") ? data.Prot_reportedUnit : "mg/24h", outputUnit: data.Prot_outputUnit ?? supplied.outputUnit ?? "mg/24h", unitConversions: data.Prot_unitConversions ?? supplied.unitConversions ?? {}, hours: legacyDatesOnly ? "" : hours, durationSource: data.Prot_collectionSource ?? supplied.durationSource ?? (own(data, "Prot_collectionHours") && !absent(data.Prot_collectionHours) ? "hours" : duration || own(supplied, "collectionHours") ? "captured" : "assumed-24h"), durationNeedsConfirmation: data.Prot_durationNeedsConfirmation === true || data.Prot_durationNeedsConfirmation === "true" || data.Prot_collectionSource === "historical-missing" || supplied.durationNeedsConfirmation === true || legacyDatesOnly, weightKg: data.weight ?? supplied.weightKg ?? "", heightCm: data.height ?? supplied.heightCm ?? "", ageYears: ageFrom(data, supplied), agePrecision: own(data, "age") && Number.isInteger(parseValue(data.age)?.value) && absent(data.ageMonths) && absent(data.ageDays) ? "completed-years" : supplied.agePrecision, sex: own(data, "sex") ? data.sex : supplied.sex, knownFacts });
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document, vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {}, values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS, "Prot_durationNeedsConfirmation"]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" || control.type === "radio" ? control.checked === true : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    return inputFromValues(values, context);
  }
  const INPUT_LABELS = Object.freeze({ concentration: "stężenie białka", volume: "objętość zbiórki", hours: "czas zbiórki", reportedValue: "gotowe wydalanie" });
  const INPUT_IDS = Object.freeze({ concentration: "Prot_concentration", volume: "Prot_volume", hours: "Prot_collectionHours", reportedValue: "Prot_reportedValue" });
  function compute(input) {
    const data = inputData(input), missingIds = [], invalidIds = [], problems = [], cautions = [];
    const fail = (code, message, blocked = false) => freeze({ ok: false, valid: false, rawValue: null, value: null, dailyMg: null, indexed: null, unit: "", display: { text: "", boundary: "" }, input: data, missingIds, invalidIds, cautions, errorCode: code, error: message, blocked });
    const contradictions = COLLECTION_FIELDS.filter(id => data.knownFacts[id] === false || data.knownFacts["ui_" + id + "_answer"] === "no");
    if (data.knownFacts.Cl24CollectionProblem === true) contradictions.push("Cl24CollectionProblem");
    if (contradictions.length) { invalidIds.push(...contradictions); return fail("collection-conflict", "Podano problem kompletności lub protokołu zbiórki. Nie można wiarygodnie obliczyć wydalania z tych danych.", true); }
    if (!["concentration", "reported"].includes(data.mode)) { invalidIds.push("Prot_inputMode"); return fail("invalid-mode", "Wybierz sposób podania wyniku."); }
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
      const factors = { "mg/dL": fraction("10"), "mg/L": fraction("1"), "g/L": fraction("1000") };
      if (!own(factors, data.concentrationUnit)) { invalidIds.push("Prot_concentrationUnit"); problems.push({ code: "invalid-concentration-unit", message: "Wybierz obsługiwaną jednostkę stężenia." }); }
      if (!["mL", "L"].includes(data.volumeUnit)) { invalidIds.push("Prot_volumeUnit"); problems.push({ code: "invalid-volume-unit", message: "Wybierz objętość w mL lub L." }); }
      if (!problems.length) daily = div(mul(mul(mul(quantity("concentration", concentration), factors[quantityUnit("concentration", data.concentrationUnit)]), quantityUnit("volume", data.volumeUnit) === "L" ? quantity("volume", volume) : div(quantity("volume", volume), fraction("1000"))), fraction("24")), hours);
    } else {
      const reported = parseField("reportedValue", false);
      if (!["mg/24h", "g/24h"].includes(data.reportedUnit)) { invalidIds.push("Prot_reportedUnit"); problems.push({ code: "invalid-reported-unit", message: "Wybierz gotowy wynik w mg/24 h lub g/24 h." }); }
      if (!problems.length) daily = quantityUnit("reportedValue", data.reportedUnit) === "g/24h" ? mul(quantity("reportedValue", reported), fraction("1000")) : quantity("reportedValue", reported);
    }
    if (!["mg/24h", "g/24h"].includes(data.outputUnit)) { invalidIds.push("Prot_outputUnit"); problems.push({ code: "invalid-output-unit", message: "Wybierz obsługiwaną jednostkę wyniku." }); }
    if (problems.length) { const first = problems.find(problem => !problem.missing) || problems[0]; return fail(first.code, first.message); }
    const rawValue = numberOf(daily);
    if (!finite(rawValue) || rawValue === 0 && daily.n !== 0n) return fail("numeric-range", "Wynik jest poza zakresem obliczeń. Sprawdź wartości i jednostki.");
    const shown = formatValue(rawValue, exact(daily));
    if (!shown) return fail("numeric-precision", "Wyniku nie można pokazać z wymaganą dokładnością. Sprawdź liczbę cyfr wejścia.");
    return freeze({ ok: true, valid: true, rawValue, value: rawValue, dailyMg: rawValue, indexed: null, unit: "mg/24 h", exactMain: exact(daily), exactDailyMg: exact(daily), exactIndexed: null, display: { text: shown, boundary: "" }, hours: numberOf(hours), input: data, missingIds, invalidIds, cautions, errorCode: "", error: "", blocked: false });
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
    if (!safeData(policy) || !object(policy) || policy.quantity !== "total-protein-excretion" || !finite(policy.minimumAge) || policy.minimumAge < 0 || !finite(policy.adultAge) || policy.adultAge <= policy.minimumAge || typeof policy.id !== "string" || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || !object(policy.population) || typeof policy.population.label !== "string" || !policy.population.label || !Array.isArray(policy.profiles) || !policy.profiles.length || !Array.isArray(policy.sources) || !policy.sources.length || !object(policy.notes)) return false;
    if (!policy.sources.every(source => object(source) && ["id", "label", "url"].every(key => typeof source[key] === "string" && source[key]))) return false;
    if (!["noPolicyTitle", "noPolicy", "noAge", "belowAge", "noProfile", "noBsa", "non24Title", "non24", "reportedNon24", "zeroTitle", "zero"].every(key => typeof policy.notes[key] === "string" && policy.notes[key])) return false;
    const ids = new Set();
    return policy.profiles.every(profile => {
      if (!object(profile) || ids.has(profile.id) || !["upper-bsa-capped", "upper"].includes(profile.kind) || !finite(profile.ageLower) || profile.ageLower < 0 || profile.ageUpper !== null && (!finite(profile.ageUpper) || profile.ageUpper <= profile.ageLower) || !["ageLowerInclusive", "ageUpperInclusive", "upperInclusive"].every(key => typeof profile[key] === "boolean") || profile.upperInclusive !== false || profile.unit !== "mg/24 h" || !finite(profile.upper) || profile.upper <= 0 || !finite(profile.nephrotic) || profile.nephrotic <= profile.upper || !finite(profile.nephroticMinimumAge) || profile.nephroticMinimumAge < profile.ageLower || !["id", "label", "population", "text", "sourceId", "sourceLabel", "method", "sample", "explanation", "ruleId"].every(key => typeof profile[key] === "string" && profile[key]) || !policy.sources.some(source => source.id === profile.sourceId) || !Array.isArray(profile.sourceIds) || !profile.sourceIds.length || profile.sourceIds.some(id => !policy.sources.some(source => source.id === id)) || !object(profile.titles) || !object(profile.copy) || !["within", "high", "nephrotic"].every(key => typeof profile.titles[key] === "string" && typeof profile.copy[key] === "string")) return false;
      if (profile.kind === "upper-bsa-capped" && (!finite(profile.adultCap) || profile.adultCap <= 0 || profile.bsaMethod !== "Haycock")) return false;
      ids.add(profile.id); return true;
    });
  }
  function profileFor(policy, age, precision) {
    if (!age?.lossless || age.value < 0 || precision === "completed-years" && !Number.isInteger(age.value) || !Array.isArray(policy?.profiles)) return null;
    const value = fromExact(age.exact);
    const matches = policy.profiles.filter(profile => {
      const lo = cmp(value, fraction(String(profile.ageLower))), hi = profile.ageUpper === null ? -1 : cmp(value, fraction(String(profile.ageUpper)));
      if (!(lo > 0 || lo === 0 && profile.ageLowerInclusive) || !(hi < 0 || hi === 0 && profile.ageUpperInclusive)) return false;
      return precision !== "completed-years" || profile.ageUpper === null || profile.ageUpper >= age.value + 1;
    });
    return matches.length === 1 ? matches[0] : null;
  }
  function calculateBsa(input) {
    const age = parseValue(input.ageYears), weight = parseValue(input.weightKg), height = parseValue(input.heightCm);
    if (!age?.lossless || !weight?.lossless || !height?.lossless || weight.value <= 0 || height.value <= 0) return null;
    const result = root?.ClcrExtendedEgfr?.computeHaycockBsa?.({ ageYears: age.value, weightValue: weight.value, weightUnit: "kg", heightValue: height.value, heightUnit: "cm" });
    return result?.ok && finite(result.value) && result.value > 0 ? result.value : null;
  }
  function presentation(result, selectedUnit = result?.outputUnit || "mg/24h") {
    const outputUnit = unitFor(selectedUnit), unitText = outputUnit === "g/24h" ? "g/24 h" : "mg/24 h";
    const blank = { ok: false, outputUnit, valueText: "", referenceValue: "Brak normy do porównania", referenceText: "Brak normy do porównania", unitText, precision: 3, rawValue: null, lower: null, upper: null, nephrotic: null, exactValue: null, exactLower: null, exactUpper: null, exactNephrotic: null, nephroticValue: "", nephroticText: "" };
    if (!result?.valid || !["mg/24h", "g/24h"].includes(outputUnit)) return freeze(blank);
    const main = fromExact(result.exactMain) || fraction(String(result.rawValue));
    if (!main || main.n < 0n) return freeze(blank);
    const convert = quantity => outputUnit === "g/24h" ? div(quantity, fraction("1000")) : quantity;
    const upper = result.reference ? fromExact(result.reference.exactUpper) || fraction(String(result.reference.upper)) : null;
    const nephrotic = result.reference?.nephrotic != null ? fromExact(result.reference.exactNephrotic) || fraction(String(result.reference.nephrotic)) : null;
    const values = [main, upper, nephrotic].map(quantity => quantity ? convert(quantity) : null), numbers = values.map(quantity => quantity ? numberOf(quantity) : null);
    if (values.some((quantity, index) => quantity && (!finite(numbers[index]) || numbers[index] === 0 && quantity.n !== 0n))) return freeze({ ...blank, errorCode: "numeric-range" });
    function correct(texts) {
      const shown = texts.map(text => text === null ? null : fraction(text));
      return shown[0] && cmp(shown[0], fraction("0")) === cmp(values[0], fraction("0")) && [1, 2].every(index => !values[index] || shown[index] && cmp(shown[0], shown[index]) === cmp(values[0], values[index]));
    }
    const magnitude = Math.abs(numbers[0]);
    const firstPrecision = magnitude >= 1e-7 && magnitude < 1 ? Math.max(3, 2 - Math.floor(Math.log10(magnitude))) : 3;
    for (let precision = firstPrecision; precision <= 120; precision += 1) {
      const texts = values.map((quantity, index) => quantity ? (precision <= 15 ? short(numbers[index], precision) : decimal(quantity, precision).replace(".", ",")) : null);
      if (texts.some(text => text !== null && text.length > 160) || !correct(texts)) continue;
      const referenceValue = upper ? "<" + texts[1] : blank.referenceValue;
      return freeze({ ok: true, outputUnit, valueText: texts[0], referenceValue, referenceText: upper ? referenceValue + " " + unitText : referenceValue, unitText, precision, rawValue: numbers[0], lower: null, upper: numbers[1], nephrotic: numbers[2], exactValue: exact(values[0]), exactLower: null, exactUpper: exact(values[1]), exactNephrotic: exact(values[2]), nephroticValue: texts[2] || "", nephroticText: texts[2] ? "≥" + texts[2] + " " + unitText : "" });
    }
    return freeze({ ...blank, errorCode: "numeric-precision" });
  }
  function evaluate(input, policy) {
    const hasPolicy = validPolicy(policy), result = compute(input), data = result.input;
    const notes = hasPolicy ? copy(policy.notes) : {}, age = parseValue(data.ageYears);
    const profile = hasPolicy && result.valid && result.hours === 24 ? profileFor(policy, age, data.agePrecision) : null;
    const bsa = profile?.kind === "upper-bsa-capped" ? calculateBsa(data) : null;
    const populationCategory = age?.lossless && age.value >= 0 ? age.value >= (hasPolicy ? policy.adultAge : 18) ? "adult" : "child" : null;
    let status = "unassessed", tone = "neutral", outOfRange = null, reference = null;
    let interpretation = notes.noPolicy || "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.", statusText = notes.noPolicyTitle || "Wynik bez porównania z normą", contextLabel = "Dobowe wydalanie białka";
    if (profile && (profile.kind !== "upper-bsa-capped" || bsa !== null)) {
      const sourceUpper = fraction(String(profile.upper)), uncappedUpper = profile.kind === "upper-bsa-capped" ? mul(sourceUpper, fraction(String(bsa))) : sourceUpper;
      const cap = profile.kind === "upper-bsa-capped" ? fraction(String(profile.adultCap)) : null;
      const upper = cap && cmp(uncappedUpper, cap) >= 0 ? cap : uncappedUpper;
      const nephrotic = age.value >= profile.nephroticMinimumAge ? profile.kind === "upper-bsa-capped" ? mul(fraction(String(profile.nephrotic)), fraction(String(bsa))) : fraction(String(profile.nephrotic)) : null;
      const main = fromExact(result.exactMain);
      status = nephrotic && cmp(main, nephrotic) >= 0 ? "nephrotic" : cmp(main, upper) >= 0 ? "high" : "within";
      tone = status === "within" ? "normal" : status === "nephrotic" ? "danger" : "warning"; outOfRange = status !== "within";
      reference = { kind: "upper", profileId: profile.id, ruleId: profile.ruleId, lower: null, min: null, upper: numberOf(upper), max: numberOf(upper), lowerInclusive: false, upperInclusive: false, nephrotic: nephrotic ? numberOf(nephrotic) : null, nephroticInclusive: true, bsa, bsaM2: bsa, bsaMethod: bsa === null ? null : profile.bsaMethod, uncappedUpper: numberOf(uncappedUpper), adultCap: cap ? profile.adultCap : null, capped: Boolean(cap && cmp(uncappedUpper, cap) >= 0), unit: "mg/24 h", label: profile.label, text: "<" + short(numberOf(upper), 6), hint: profile.population, note: profile.population, sourceIds: profile.sourceIds || [profile.sourceId], sourceId: profile.sourceId, sourceLabel: profile.sourceLabel, method: profile.method, sample: profile.sample, explanation: profile.explanation, sourceUnit: profile.kind === "upper-bsa-capped" ? "mg/m²/24 h" : "mg/24 h", sourceText: profile.text, sourceLower: null, sourceUpper: profile.upper, exactLower: null, exactUpper: exact(upper), exactNephrotic: exact(nephrotic), upperText: short(numberOf(upper), 6), ageLower: profile.ageLower, ageUpper: profile.ageUpper, ageLowerInclusive: profile.ageLowerInclusive, ageUpperInclusive: profile.ageUpperInclusive, sex: null, agePolicy: policy.agePolicy || "" };
      statusText = profile.titles[status]; interpretation = profile.copy[status]; contextLabel = profile.contextLabel || "Dobowe wydalanie białka";
    }
    if (result.valid && result.hours !== 24) {
      statusText = data.mode === "reported" ? notes.reportedNon24Title || notes.non24Title : notes.non24Title;
      interpretation = data.mode === "reported" ? notes.reportedNon24 : notes.non24;
      contextLabel = "Zbiórka z innym czasem";
    } else if (result.valid && (!age?.lossless || age.value < 0)) interpretation = notes.noAge || interpretation;
    else if (result.valid && hasPolicy && !profile) interpretation = age.value < policy.minimumAge && data.agePrecision !== "completed-years" ? notes.belowAge : notes.noProfile;
    else if (result.valid && profile?.kind === "upper-bsa-capped" && bsa === null) interpretation = notes.noBsa;
    if (result.valid && result.rawValue === 0) {
      status = "zero"; tone = "neutral"; outOfRange = null; reference = null;
      statusText = notes.zeroTitle || "Wynik 0 — sprawdź zapis laboratorium";
      interpretation = (result.hours !== 24 ? interpretation + " " : "") + (notes.zero || "Sprawdź, czy 0 oznacza wynik poniżej granicy oznaczalności. Zapis „<” nie jest dokładnym zerem.");
      contextLabel = "Ocena wyniku zerowego";
    }
    let indexed = null;
    if (result.valid && bsa !== null) {
      const quantity = div(fromExact(result.exactMain), fraction(String(bsa)));
      if (finite(numberOf(quantity)) && !(numberOf(quantity) === 0 && quantity.n !== 0n)) indexed = quantity;
    }
    const model = { ...copy(result), schema: "clcr-protein-dzm", version: 1, engineVersion: ENGINE_VERSION, status, statusText: result.valid ? statusText : "", tone, outOfRange, category: null, interpretation: result.valid ? interpretation || "" : "", contextLabel, reference, references: reference ? [copy(reference)] : [], referenceAvailable: Boolean(reference), referenceActive: Boolean(reference), referenceLabel: "Norma dla pacjenta", referenceText: reference?.text || "Brak normy do porównania", referenceHint: reference?.sourceLabel || "", referenceRows: hasPolicy ? policy.profiles.map(item => ({ profileId: item.id, population: item.population, label: item.label, text: item.text, unit: item.unit, sourceId: item.sourceId, sourceLabel: item.sourceLabel, active: reference?.profileId === item.id })) : [], policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null, referencePolicy: hasPolicy ? copy(policy) : null, populationCategory, dailyDisplay: result.valid ? formatValue(result.dailyMg, result.exactDailyMg) : "", indexed: indexed ? numberOf(indexed) : null, exactIndexed: exact(indexed), indexedDisplay: indexed ? formatValue(numberOf(indexed), exact(indexed)) : "", bsaM2: bsa, bsaMethod: bsa === null ? null : profile.bsaMethod, sources: hasPolicy ? copy(policy.sources) : [], educationalReferences: hasPolicy ? copy(policy.educationalReferences || []) : [], notes, outputUnit: data.outputUnit };
    model.notes.sourceSummary = reference ? reference.sourceLabel + " · pełna zbiórka 24 h" : "";
    model.notes.contextExplanation = profile?.explanation || interpretation || "";
    model.notes.referenceCalculation = reference && bsa !== null ? "Powierzchnia ciała (" + reference.bsaMethod + "): " + short(bsa, 6) + " m². Przeliczenie: " + profile.upper + " × " + short(bsa, 6) + " ≈ " + short(reference.uncappedUpper, 6) + " mg/24 h. " + (reference.capped ? "Zastosowano limit dla dorosłych: " : "Przeliczono według powierzchni ciała; maksymalny limit: ") + profile.adultCap + " mg/24 h. Przyjęta granica dla pacjenta: <" + short(reference.upper, 6) + " mg/24 h. " + profile.explanation : "";
    model.presentation = presentation(model, data.outputUnit);
    if (model.valid && !model.presentation.ok) return freeze({ ...model, ok: false, valid: false, rawValue: null, value: null, dailyMg: null, indexed: null, display: { text: "", boundary: "" }, errorCode: model.presentation.errorCode || "numeric-precision", error: "Wyniku nie można pokazać w wybranej jednostce z wymaganą dokładnością. Wybierz inną jednostkę lub sprawdź zapis.", status: "unassessed", statusText: "", tone: "neutral", outOfRange: null, reference: null, references: [], referenceAvailable: false, referenceActive: false });
    if (model.valid) model.display = { text: presentation(model, "mg/24h").valueText, boundary: "" };
    return freeze(model);
  }
  return Object.freeze({ ENGINE_VERSION, FIELD_IDS, CONTEXT_FIELD_IDS, COLLECTION_FIELDS, parseValue, formatValue, convertUnitInput, inputFromValues, readInputFromDocument, compute, evaluate, calculate: evaluate, presentation, validPolicy });
});
