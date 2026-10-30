/* Sodium DZM: exact decimal quantities and explicitly injected references.
 * Presentation never determines clinical classification. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrSodiumDzm = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1;
  const SCHEMA = "clcr-sodium-dzm";
  const FIELD_IDS = Object.freeze(["Na_inputMode", "Na_concentration", "Na_volume", "Na_volumeUnit", "Na_reportedValue", "Na_reportedUnit", "Na_collectionHours", "Na_collectionSource", "Na_outputUnit", "Na_unitConversions", "Na_durationNeedsConfirmation"]);
  const COLLECTION_FIELDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const CONTEXT_FIELD_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", ...COLLECTION_FIELDS, ...COLLECTION_FIELDS.map(id => "ui_" + id + "_answer"), "collectionStartAt", "collectionEndAt", "Cl24CollectionProblem"]);
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
  // A decimal quantity may be smaller than a Number before multiplication.
  // Keep its fraction and reject non-representable quantities only at the
  // actual clock/result boundary, never by changing them into exact zero.
  function parseValue(value) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(",", ".").replace(/−/g, "-");
    if (!text || text.length > 512) return null;
    const rational = fraction(text);
    if (!rational) return null;
    const number = numberOf(rational), represented = finite(number) ? fraction(String(number)) : null;
    return { value: Object.is(number, -0) ? 0 : number, text, exact: exact(rational), lossless: Boolean(represented && cmp(rational, represented) === 0), representable: finite(number) && (number !== 0 || rational.n === 0n) };
  }
  function unitConstants() {
    const value = root?.ClcrSodiumDzmReferenceData?.UNIT_CONSTANTS;
    if (!object(value) || typeof value.id !== "string" || !Number.isInteger(value.version) || value.version < 1) return null;
    const sodium = fraction(value.sodiumMgPerMmol), salt = fraction(value.sodiumChlorideGPerMmol);
    return sodium?.n > 0n && salt?.n > 0n ? { sodium, salt, data: copy(value) } : null;
  }
  function decimalText(value, places = 80) {
    const negative = value.n < 0n, n = negative ? -value.n : value.n;
    let remainder = n % value.d, result = (negative ? "-" : "") + String(n / value.d), digits = "";
    for (let i = 0; i < places && remainder; i += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
    if (digits) result += "," + digits;
    return { text: result, complete: remainder === 0n };
  }
  function short(value, digits = 6) {
    if (!finite(value)) return "";
    return (value !== 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e10) ? String(value) : value.toLocaleString("pl-PL", { useGrouping: false, maximumFractionDigits: digits })).replace(".", ",");
  }
  function compactQuantity(quantity, precision = 6) {
    const value = numberOf(quantity);
    if (!finite(value) || value === 0 && quantity.n !== 0n) return null;
    let text = short(value, Math.max(precision, Math.min(15, Math.max(0, 3 - Math.floor(Math.log10(Math.abs(value) || 1))))));
    const displayed = fraction(text), full = decimalText(quantity, 1100);
    // The main card stays compact; the fraction and full expansion are retained
    // for Details/history. A literal rounded onto a bound is visibly approximate.
    const approximate = !displayed || cmp(displayed, quantity) !== 0;
    if (approximate && full.complete && full.text.length <= 9) text = full.text;
    let finalApproximate = !fraction(text) || cmp(fraction(text), quantity) !== 0;
    if (text.length > 9) {
      text = short(value, Math.max(4, Math.min(15, Math.max(0, 3 - Math.floor(Math.log10(Math.abs(value) || 1))))));
      if (text.length > 12) text = value.toExponential(5).replace(".", ",");
      finalApproximate = true;
    }
    return { text: (finalApproximate ? "≈" : "") + text, value, approximate: finalApproximate, fullText: full.text + (full.complete ? "" : "…"), fullValueComplete: full.complete };
  }
  function formatValue(value, exactValue) {
    if (!finite(value)) return "";
    const quantity = fromExact(exactValue) || fraction(String(value));
    if (!quantity || numberOf(quantity) !== value) return "";
    return compactQuantity(quantity)?.text || "";
  }
  function safeData(value, seen = new Set(), depth = 0) {
    if (value === null || typeof value === "boolean" || finite(value) || typeof value === "string" && value.length <= 12000) return true;
    if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return false;
    seen.add(value);
    const valid = Object.values(Object.getOwnPropertyDescriptors(value)).every(property => !property.get && !property.set && safeData(property.value, seen, depth + 1));
    seen.delete(value); return valid;
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
      if (CONTEXT_FIELD_IDS.includes(key) && (value == null || typeof value === "boolean" || finite(value) || typeof value === "string" && value.length <= 512)) result[key] = value;
    }
    return result;
  }
  function unitFor(value) {
    const normalized = String(value).replace(/\s/g, "").toLowerCase();
    return ({ "mmol/24h": "mmol/24h", "mgna/24h": "mgNa/24h", "gna/24h": "gNa/24h" })[normalized] || value;
  }
  const CONVERSION_KINDS = Object.freeze({ volume: { field: "volume", unit: "volumeUnit" }, reportedValue: { field: "reportedValue", unit: "reportedUnit" } });
  function canonical(quantity, unit, kind, constants) {
    if (kind === "volume") return unit === "mL" ? div(quantity, fraction("1000")) : unit === "L" ? quantity : null;
    if (unit === "mmol/24h") return quantity;
    if (!constants) return null;
    return unit === "mgNa/24h" ? div(quantity, constants.sodium) : unit === "gNa/24h" ? div(mul(quantity, fraction("1000")), constants.sodium) : null;
  }
  function fromCanonical(quantity, unit, kind, constants) {
    if (kind === "volume") return unit === "mL" ? mul(quantity, fraction("1000")) : unit === "L" ? quantity : null;
    if (unit === "mmol/24h") return quantity;
    if (!constants) return null;
    return unit === "mgNa/24h" ? mul(quantity, constants.sodium) : unit === "gNa/24h" ? div(mul(quantity, constants.sodium), fraction("1000")) : null;
  }
  function scientificInput(quantity) {
    if (quantity.n === 0n) return "0";
    const negative = quantity.n < 0n, n = negative ? -quantity.n : quantity.n;
    let exponent = n.toString().length - quantity.d.toString().length;
    const powerOfTen = power => power >= 0 ? reduced(10n ** BigInt(power), 1n) : reduced(1n, 10n ** BigInt(-power));
    if (cmp(reduced(n, quantity.d), powerOfTen(exponent)) < 0) exponent -= 1;
    const scaled = div(reduced(n, quantity.d), powerOfTen(exponent));
    return (negative ? "-" : "") + decimalText(scaled, 17).text + "e" + exponent;
  }
  function convertUnitInput(value, from, to, kind) {
    const blank = { ok: false, text: "", value: null, unit: to, exactValue: null }, spec = CONVERSION_KINDS[kind], parsed = parseValue(value);
    if (!spec || !parsed) return freeze(blank);
    const source = fromExact(parsed.exact);
    if (source.n < 0n || kind === "volume" && source.n === 0n) return freeze(blank);
    const constants = unitConstants(), base = canonical(source, from, kind, constants), converted = base && fromCanonical(base, to, kind, constants);
    if (!converted) return freeze(blank);
    const valueNumber = numberOf(converted), full = decimalText(converted, 1100);
    // A subnormal mass conversion can be below Number.MIN_VALUE. Preserve a
    // positive exponent text for the field and the original exact provenance.
    const text = full.complete && full.text.length <= 64 ? full.text : finite(valueNumber) && valueNumber !== 0 ? String(valueNumber).replace(".", ",") : scientificInput(converted);
    if (!parseValue(text) || source.n !== 0n && fromExact(parseValue(text).exact).n === 0n) return freeze(blank);
    return freeze({ ok: true, text, value: finite(valueNumber) && (valueNumber !== 0 || converted.n === 0n) ? valueNumber : null, unit: to, exactValue: exact(converted), exactCanonical: exact(base) });
  }
  function validatedConversions(value, data) {
    let supplied = value;
    if (typeof supplied === "string") {
      if (!supplied.trim() || supplied.length > 8192) return {};
      try { supplied = JSON.parse(supplied); } catch (_) { return {}; }
    }
    if (!safeData(supplied) || !object(supplied) || Object.keys(supplied).some(key => !own(CONVERSION_KINDS, key))) return {};
    const result = {};
    for (const [kind, entry] of Object.entries(supplied)) {
      const spec = CONVERSION_KINDS[kind];
      if (!object(entry) || Object.keys(entry).length !== 4 || !["originalValue", "originalUnit", "convertedValue", "convertedUnit"].every(key => own(entry, key)) || String(data[spec.field]) !== String(entry.convertedValue) || data[spec.unit] !== entry.convertedUnit) continue;
      const expected = convertUnitInput(entry.originalValue, entry.originalUnit, entry.convertedUnit, kind), shown = parseValue(entry.convertedValue), expectedShown = parseValue(expected.text);
      if (!expected.ok || !shown || !expectedShown || cmp(fromExact(shown.exact), fromExact(expectedShown.exact)) !== 0) continue;
      result[kind] = { originalValue: primitive(entry.originalValue), originalUnit: entry.originalUnit, convertedValue: primitive(entry.convertedValue), convertedUnit: entry.convertedUnit };
    }
    return result;
  }
  function inputData(input) {
    const data = object(input) ? input : {}, hours = primitive(data.hours), durationNeedsConfirmation = absent(hours);
    const durationSource = data.durationSource === "invalid" ? "invalid" : durationNeedsConfirmation ? "historical-missing" : ["captured", "legacy-dates"].includes(data.durationSource) ? data.durationSource : data.durationSource === "assumed-24h" && parseValue(hours)?.value === 24 ? "assumed-24h" : "hours";
    const result = { mode: own(data, "mode") ? primitive(data.mode) : "concentration", concentration: primitive(data.concentration), concentrationUnit: own(data, "concentrationUnit") ? primitive(data.concentrationUnit) : "mmol/L", volume: primitive(data.volume), volumeUnit: own(data, "volumeUnit") ? primitive(data.volumeUnit) : "mL", reportedValue: primitive(data.reportedValue), reportedUnit: unitFor(own(data, "reportedUnit") ? primitive(data.reportedUnit) : "mmol/24h"), outputUnit: unitFor(own(data, "outputUnit") ? primitive(data.outputUnit) : "mmol/24h"), hours, durationSource, durationNeedsConfirmation, ageYears: absent(data.ageYears) ? null : primitive(data.ageYears), sex: typeof data.sex === "string" && ["M", "F"].includes(data.sex.toUpperCase()) ? data.sex.toUpperCase() : null, agePrecision: data.agePrecision === "completed-years" ? "completed-years" : "exact", knownFacts: facts(data) };
    result.unitConversions = validatedConversions(data.unitConversions, result);
    return result;
  }
  function ageFrom(values, context) {
    if (own(values, "age")) {
      if (absent(values.age)) return null;
      const years = parseValue(values.age), months = absent(values.ageMonths) ? { value: 0, lossless: true } : parseValue(values.ageMonths);
      if (!years?.lossless || !months?.lossless || years.value < 0 || months.value < 0 || months.value >= 12) return null;
      if (years.value === 0 && months.value === 0 && !absent(values.ageDays)) { const days = parseValue(values.ageDays); return days?.lossless && days.value >= 0 ? days.value / 365.2425 : null; }
      return years.value + months.value / 12;
    }
    if (context.ageContext && context.ageContext.valid === false) return null;
    return context.ageYears ?? context.ageContext?.exactYears ?? null;
  }
  function inputFromValues(values, context) {
    const data = object(values) ? values : {}, supplied = object(context) ? context : {};
    const duration = [supplied.durationMinutes, supplied.collectionAnalysis?.durationMinutes].find(value => finite(value) && value > 0);
    const hours = own(data, "Na_collectionHours") ? data.Na_collectionHours : own(supplied, "collectionHours") ? supplied.collectionHours : duration ? duration / 60 : "";
    const knownFacts = { ...facts(supplied), ...facts(data) };
    for (const id of ["age", "ageMonths", "ageDays", "collectionStartAt", "collectionEndAt"]) if (own(data, id)) knownFacts[id] = primitive(data[id]);
    return inputData({ mode: own(data, "Na_inputMode") ? data.Na_inputMode : "concentration", concentration: data.Na_concentration ?? "", volume: data.Na_volume ?? "", volumeUnit: own(data, "Na_volumeUnit") ? data.Na_volumeUnit : "mL", reportedValue: data.Na_reportedValue ?? "", reportedUnit: own(data, "Na_reportedUnit") ? data.Na_reportedUnit : "mmol/24h", outputUnit: data.Na_outputUnit ?? supplied.outputUnit ?? "mmol/24h", unitConversions: data.Na_unitConversions ?? supplied.unitConversions ?? {}, hours, durationSource: data.Na_collectionSource ?? supplied.durationSource ?? (duration || own(supplied, "collectionHours") ? "captured" : "hours"), ageYears: ageFrom(data, supplied), agePrecision: own(data, "age") && Number.isInteger(parseValue(data.age)?.value) && absent(data.ageMonths) && absent(data.ageDays) ? "completed-years" : supplied.agePrecision, sex: own(data, "sex") ? data.sex : supplied.sex, knownFacts });
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document, vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {}, values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" || control.type === "radio" ? control.checked === true : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    // A blank, focused new-collection editor still means the shared 24 h
    // default. Qualify that meaning in this copy without changing the DOM,
    // the value vault, explicit input or a historical unknown duration.
    if (own(values, "Na_collectionHours") && absent(values.Na_collectionHours) && values.Na_collectionSource === "assumed-24h") {
      const durationApi = doc?.defaultView?.ClcrCollectionDuration || root?.ClcrCollectionDuration;
      const duration = durationApi?.readFromDocument?.(doc, { fieldId: "Na_collectionHours", sourceId: "Na_collectionSource" });
      if (duration?.valid && duration.assumed && duration.hours === 24) {
        values.Na_collectionHours = "24";
        values.Na_collectionSource = "assumed-24h";
      }
    }
    return inputFromValues(values, context);
  }
  const INPUT_LABELS = Object.freeze({ concentration: "stężenie sodu", volume: "objętość zbiórki", hours: "czas zbiórki", reportedValue: "gotowe wydalanie" });
  const INPUT_IDS = Object.freeze({ concentration: "Na_concentration", volume: "Na_volume", hours: "Na_collectionHours", reportedValue: "Na_reportedValue" });
  function compute(input) {
    const data = inputData(input), missingIds = [], invalidIds = [], problems = [], cautions = [], constants = unitConstants();
    const fail = (code, message, blocked = false) => freeze({ ok: false, valid: false, rawValue: null, value: null, dailyMmol: null, unit: "mmol/24 h", display: { text: "", boundary: "" }, input: data, missingIds, invalidIds, cautions, errorCode: code, error: message, blocked });
    const contradictions = COLLECTION_FIELDS.filter(id => data.knownFacts[id] === false || data.knownFacts["ui_" + id + "_answer"] === "no");
    if (data.knownFacts.Cl24CollectionProblem === true) contradictions.push("Cl24CollectionProblem");
    if (contradictions.length) { invalidIds.push(...contradictions); return fail("collection-conflict", "Zbiórka była niepełna lub błędna. Obliczenie i zapis wymagają wyjaśnienia.", true); }
    if (!["concentration", "reported"].includes(data.mode)) { invalidIds.push("Na_inputMode"); return fail("invalid-mode", "Wybierz sposób podania wyniku."); }
    if (data.durationSource === "invalid") { invalidIds.push("Na_collectionHours"); return fail("invalid-hours", "Podano nieprawidłowy czas zbiórki. Popraw czas lub wyjaśnij daty zbiórki."); }
    function parseField(key, positive) {
      if (absent(data[key])) { missingIds.push(INPUT_IDS[key]); problems.push({ code: "missing-" + key, message: key === "hours" ? "Czas zbiórki jest nieznany. Wpisz rzeczywisty czas lub świadomie potwierdź 24 godziny." : "Uzupełnij pole: " + INPUT_LABELS[key] + ".", missing: true }); return null; }
      const parsed = parseValue(data[key]), quantity = parsed && fromExact(parsed.exact);
      if (!quantity || quantity.n < 0n || positive && quantity.n === 0n || key === "hours" && !parsed.representable) { invalidIds.push(INPUT_IDS[key]); problems.push({ code: "invalid-" + key, message: "Sprawdź pole: " + INPUT_LABELS[key] + (positive ? ". Wartość musi być skończona i większa od 0." : ". Wpisz nieujemną liczbę.") }); return null; }
      return quantity;
    }
    // Explicit invalid clocks block BOTH modes. An already-daily result does
    // not need a missing historical clock for its number and is never rescaled.
    const hours = absent(data.hours) && data.mode === "reported" ? null : parseField("hours", true);
    const quantity = (key, fallback) => data.unitConversions[key] ? fromExact(parseValue(data.unitConversions[key].originalValue).exact) : fallback;
    const quantityUnit = (key, fallback) => data.unitConversions[key]?.originalUnit || fallback;
    let daily = null, volumeLitres = null;
    if (data.mode === "concentration") {
      const concentration = parseField("concentration", false), volume = parseField("volume", true);
      if (data.concentrationUnit !== "mmol/L") { invalidIds.push("Na_concentration"); problems.push({ code: "invalid-concentration-unit", message: "Stężenie sodu podaj w mmol/L." }); }
      if (!["mL", "L"].includes(data.volumeUnit)) { invalidIds.push("Na_volumeUnit"); problems.push({ code: "invalid-volume-unit", message: "Wybierz objętość w mL lub L." }); }
      if (!problems.length) { volumeLitres = canonical(quantity("volume", volume), quantityUnit("volume", data.volumeUnit), "volume", constants); daily = div(mul(mul(concentration, volumeLitres), fraction("24")), hours); }
    } else {
      const reported = parseField("reportedValue", false);
      if (!["mmol/24h", "mgNa/24h", "gNa/24h"].includes(data.reportedUnit)) { invalidIds.push("Na_reportedUnit"); problems.push({ code: "invalid-reported-unit", message: "Wybierz gotowy wynik w mmol, mg Na lub g Na na dobę." }); }
      if (!problems.length) daily = canonical(quantity("reportedValue", reported), quantityUnit("reportedValue", data.reportedUnit), "reportedValue", constants);
    }
    if (!["mmol/24h", "gNa/24h"].includes(data.outputUnit)) { invalidIds.push("Na_outputUnit"); problems.push({ code: "invalid-output-unit", message: "Wybierz obsługiwaną jednostkę wyniku." }); }
    if (problems.length) { const first = problems.find(problem => !problem.missing) || problems[0]; return fail(first.code, first.message); }
    if (!daily || !constants) return fail("unit-policy", "Brak danych przeliczenia jednostek. Odśwież aplikację.");
    const rawValue = numberOf(daily);
    if (!finite(rawValue) || rawValue === 0 && daily.n !== 0n) return fail("numeric-range", "Wynik jest poza zakresem reprezentacji liczbowej. Sprawdź wartości i jednostki.");
    return freeze({ ok: true, valid: true, rawValue, value: rawValue, dailyMmol: rawValue, unit: "mmol/24 h", exactMain: exact(daily), exactDailyMmol: exact(daily), display: { text: formatValue(rawValue, exact(daily)), boundary: "" }, hours: hours ? numberOf(hours) : null, exactHours: exact(hours), full24Hours: hours ? cmp(hours, fraction("24")) === 0 : false, exactVolumeLitres: exact(volumeLitres), input: data, missingIds, invalidIds, cautions, errorCode: "", error: "", blocked: false, unitPolicy: constants.data });
  }
  function validPolicy(policy) {
    if (!safeData(policy) || !object(policy) || policy.quantity !== "sodium-excretion" || typeof policy.id !== "string" || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || !finite(policy.minimumAge) || policy.minimumAge < 0 || !object(policy.population) || typeof policy.population.label !== "string" || !policy.population.label || !Array.isArray(policy.profiles) || !policy.profiles.length || !Array.isArray(policy.sources) || !policy.sources.length || !object(policy.notes)) return false;
    if (!policy.sources.every(source => object(source) && ["id", "label", "url"].every(key => typeof source[key] === "string" && source[key]))) return false;
    if (!["noPolicyTitle", "noPolicy", "noAge", "belowAge", "noSex", "noProfile", "non24Title", "non24", "reportedNon24Title", "reportedNon24", "reportedUnknown", "zeroTitle", "zero"].every(key => typeof policy.notes[key] === "string" && policy.notes[key])) return false;
    const ids = new Set();
    if (!policy.profiles.every(profile => {
      if (!object(profile) || ids.has(profile.id) || profile.kind !== "interval" || ![null, "M", "F"].includes(profile.sex) || !finite(profile.ageLower) || profile.ageLower < 0 || profile.ageUpper !== null && (!finite(profile.ageUpper) || profile.ageUpper <= profile.ageLower) || !["ageLowerInclusive", "ageUpperInclusive", "lowerInclusive", "upperInclusive"].every(key => typeof profile[key] === "boolean") || profile.unit !== "mmol/24 h" || !finite(profile.lower) || profile.lower < 0 || !finite(profile.upper) || profile.upper <= profile.lower || !["id", "label", "population", "text", "sourceId", "sourceLabel", "method", "sample", "explanation"].every(key => typeof profile[key] === "string" && profile[key]) || !policy.sources.some(source => source.id === profile.sourceId) || !object(profile.titles) || !object(profile.copy) || !["low", "within", "high"].every(key => typeof profile.titles[key] === "string" && typeof profile.copy[key] === "string")) return false;
      if (profile.sourceIds && (!Array.isArray(profile.sourceIds) || !profile.sourceIds.length || profile.sourceIds.some(id => !policy.sources.some(source => source.id === id)))) return false;
      ids.add(profile.id); return true;
    })) return false;
    // Ambiguous same-population rows fail closed rather than choosing whichever
    // happened to appear first in a supplied data file.
    for (let i = 0; i < policy.profiles.length; i += 1) for (let j = i + 1; j < policy.profiles.length; j += 1) {
      const a = policy.profiles[i], b = policy.profiles[j];
      if (a.sex !== null && b.sex !== null && a.sex !== b.sex) continue;
      const lo = Math.max(a.ageLower, b.ageLower), hi = Math.min(a.ageUpper ?? Infinity, b.ageUpper ?? Infinity);
      if (lo < hi || lo === hi && (a.ageLower === lo ? a.ageLowerInclusive : a.ageUpperInclusive) && (b.ageLower === lo ? b.ageLowerInclusive : b.ageUpperInclusive)) return false;
    }
    if (policy.referenceGroups && (!Array.isArray(policy.referenceGroups) || !policy.referenceGroups.every(group => object(group) && typeof group.id === "string" && typeof group.label === "string" && [group.maleProfile, group.femaleProfile].every(id => id === null || ids.has(id))))) return false;
    return true;
  }
  function ageProfiles(policy, age, precision) {
    if (!age?.lossless || age.value < 0 || precision === "completed-years" && !Number.isInteger(age.value)) return [];
    const value = fromExact(age.exact);
    return policy.profiles.filter(profile => {
      const lo = cmp(value, fraction(String(profile.ageLower))), hi = profile.ageUpper === null ? -1 : cmp(value, fraction(String(profile.ageUpper)));
      if (!(lo > 0 || lo === 0 && profile.ageLowerInclusive) || !(hi < 0 || hi === 0 && profile.ageUpperInclusive)) return false;
      return precision !== "completed-years" || profile.ageUpper === null || profile.ageUpper >= age.value + 1;
    });
  }
  function presentation(result, selectedUnit = result?.outputUnit || "mmol/24h") {
    const outputUnit = unitFor(selectedUnit), unitText = outputUnit === "gNa/24h" ? "g Na/24 h" : "mmol/24 h";
    const blank = { ok: false, outputUnit, valueText: "", referenceValue: "Brak normy do porównania", referenceText: "Brak normy do porównania", unitText, precision: 6, rawValue: null, lower: null, upper: null, exactValue: null, exactLower: null, exactUpper: null, approximate: false, roundedDisplay: false, fullValueText: "", unroundedValueText: "", precisionNote: "" };
    if (!result?.valid || !["mmol/24h", "gNa/24h"].includes(outputUnit)) return freeze(blank);
    const main = fromExact(result.exactMain), constants = unitConstants();
    if (!main || main.n < 0n || !constants) return freeze(blank);
    const selected = fromCanonical(main, outputUnit, "reportedValue", constants), shown = compactQuantity(selected);
    if (!shown) return freeze({ ...blank, errorCode: "numeric-range" });
    const lower = result.reference ? fromExact(result.reference.exactLower) : null, upper = result.reference ? fromExact(result.reference.exactUpper) : null;
    const convertedLower = lower && fromCanonical(lower, outputUnit, "reportedValue", constants), convertedUpper = upper && fromCanonical(upper, outputUnit, "reportedValue", constants);
    const lowerNumber = convertedLower ? numberOf(convertedLower) : null, upperNumber = convertedUpper ? numberOf(convertedUpper) : null;
    if ([lowerNumber, upperNumber].some(value => value !== null && !finite(value))) return freeze({ ...blank, errorCode: "numeric-range" });
    const rangeText = convertedLower ? (outputUnit === "gNa/24h" ? "≈" : "") + short(lowerNumber, 4) + "–" + short(upperNumber, 4) : blank.referenceValue;
    const precisionNote = shown.approximate ? result.notes?.precision || "Znak ≈ oznacza skrócony zapis. Ocenę oparto na pełnej wartości." : "";
    return freeze({ ok: true, outputUnit, valueText: shown.text, referenceValue: rangeText, referenceText: convertedLower ? rangeText + " " + unitText : rangeText, unitText, precision: 6, rawValue: shown.value, lower: lowerNumber, upper: upperNumber, exactValue: exact(selected), exactLower: exact(convertedLower), exactUpper: exact(convertedUpper), lowerInclusive: result.reference?.lowerInclusive ?? null, upperInclusive: result.reference?.upperInclusive ?? null, approximate: shown.approximate, roundedDisplay: shown.approximate, fullValueText: shown.fullText, unroundedValueText: shown.fullText, fullValueComplete: shown.fullValueComplete, referenceApproximate: Boolean(convertedLower && outputUnit === "gNa/24h"), precisionNote });
  }
  function evaluate(input, policy) {
    const hasPolicy = validPolicy(policy), result = compute(input), data = result.input, notes = hasPolicy ? copy(policy.notes) : {}, age = parseValue(data.ageYears);
    const ageMatches = hasPolicy ? ageProfiles(policy, age, data.agePrecision) : [], matches = ageMatches.filter(profile => profile.sex === null || profile.sex === data.sex);
    const eligible = matches.length === 1 ? matches[0] : null, profile = result.valid && result.full24Hours ? eligible : null;
    let status = "unassessed", tone = "neutral", outOfRange = null, reference = null;
    let interpretation = notes.noPolicy || "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.", statusText = notes.noPolicyTitle || "Wynik bez porównania z normą";
    if (profile) {
      const lower = fraction(String(profile.lower)), upper = fraction(String(profile.upper)), value = fromExact(result.exactMain);
      const low = cmp(value, lower), high = cmp(value, upper);
      status = low < 0 || low === 0 && !profile.lowerInclusive ? "low" : high > 0 || high === 0 && !profile.upperInclusive ? "high" : "within";
      tone = status === "within" ? "normal" : "warning"; outOfRange = status !== "within";
      reference = { kind: "interval", profileId: profile.id, ruleId: profile.ruleId || policy.id + ":v" + policy.version, lower: profile.lower, upper: profile.upper, min: profile.lower, max: profile.upper, lowerInclusive: profile.lowerInclusive, upperInclusive: profile.upperInclusive, unit: "mmol/24 h", label: profile.label, text: short(profile.lower) + "–" + short(profile.upper), hint: profile.population, note: profile.population, population: profile.population, sourceIds: profile.sourceIds || [profile.sourceId], sourceId: profile.sourceId, sourceLabel: profile.sourceLabel, method: profile.method, sample: profile.sample, explanation: profile.explanation, sourceUnit: profile.unit, sourceText: profile.text, sourceLower: profile.lower, sourceUpper: profile.upper, exactLower: exact(lower), exactUpper: exact(upper), lowerText: short(profile.lower), upperText: short(profile.upper), ageLower: profile.ageLower, ageUpper: profile.ageUpper, ageLowerInclusive: profile.ageLowerInclusive, ageUpperInclusive: profile.ageUpperInclusive, sex: profile.sex, agePolicy: policy.agePolicy || "" };
      statusText = profile.titles[status]; interpretation = profile.copy[status];
    }
    if (result.valid && !result.full24Hours) {
      statusText = data.mode === "reported" ? notes.reportedNon24Title || "Gotowy wynik dobowy" : notes.non24Title || "Oszacowanie na 24 h";
      interpretation = data.mode === "reported" ? result.hours === null ? notes.reportedUnknown : notes.reportedNon24 : notes.non24;
    } else if (result.valid && (!age?.lossless || age.value < 0)) interpretation = notes.noAge || interpretation;
    else if (result.valid && hasPolicy && !eligible) {
      if (age.value < policy.minimumAge) interpretation = notes.belowAge;
      else if (ageMatches.length && !data.sex) interpretation = notes.noSex;
      else interpretation = notes.noProfile;
      // The reason is source data, while applicability follows the same
      // source profiles; no replacement range is invented for a gap.
      if (!eligible && ageMatches.length === 1 && ageMatches[0].sex === "F") interpretation = !data.sex ? notes.noChildSex || notes.noSex : notes.noChildMale || notes.noProfile;
    }
    if (result.valid && fromExact(result.exactMain).n === 0n) {
      status = "zero"; tone = "neutral"; outOfRange = null;
      statusText = notes.zeroTitle || "Wynik 0 — sprawdź zapis laboratorium";
      interpretation = (!result.full24Hours && interpretation ? interpretation + " " : "") + (notes.zero || "Sprawdź granicę oznaczalności. Zapis „<” nie jest dokładnym zerem.");
    }
    const model = { ...copy(result), schema: SCHEMA, version: 1, engineVersion: ENGINE_VERSION, status, statusText: result.valid ? statusText : "", tone, outOfRange, category: null, interpretation: result.valid ? interpretation || "" : "", contextLabel: profile?.contextLabel || "Dobowe wydalanie sodu", reference, references: reference ? [copy(reference)] : [], referenceAvailable: Boolean(reference), referenceActive: Boolean(reference && status !== "zero"), referenceLabel: "Norma dla wieku", referenceText: reference?.text || "Brak normy do porównania", referenceHint: reference?.sourceLabel || "", referenceRows: [], referenceTable: [], policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null, referencePolicy: hasPolicy ? copy(policy) : null, populationCategory: age?.lossless && age.value >= 0 ? age.value >= 18 ? "adult" : "child" : null, dailyDisplay: result.valid ? formatValue(result.dailyMmol, result.exactDailyMmol) : "", sources: hasPolicy ? copy(policy.sources) : [], educationalReferences: hasPolicy ? copy(policy.educationalReferences || []) : [], notes, outputUnit: data.outputUnit };
    model.notes.sourceSummary = reference ? reference.sourceLabel + " · pełna zbiórka 24 h" : "";
    model.notes.contextExplanation = profile?.explanation || interpretation || "";
    model.presentation = presentation(model, data.outputUnit);
    const constants = unitConstants();
    const rangeText = item => {
      if (!item || !constants) return "Nie ustalono";
      const lower = fromCanonical(fraction(String(item.lower)), data.outputUnit, "reportedValue", constants), upper = fromCanonical(fraction(String(item.upper)), data.outputUnit, "reportedValue", constants);
      return lower && upper ? (data.outputUnit === "gNa/24h" ? "≈" : "") + short(numberOf(lower), 4) + "–" + short(numberOf(upper), 4) : "Nie ustalono";
    };
    if (hasPolicy) {
      model.referenceRows = policy.profiles.map(item => ({ profileId: item.id, population: item.population, label: item.label, text: rangeText(item), unit: model.presentation.unitText, sourceId: item.sourceId, sourceLabel: item.sourceLabel, ageLower: item.ageLower, ageUpper: item.ageUpper, sex: item.sex, active: reference?.profileId === item.id }));
      model.referenceTable = (policy.referenceGroups || []).map(group => ({ id: group.id, label: group.label, male: { text: rangeText(policy.profiles.find(item => item.id === group.maleProfile)), active: Boolean(reference && reference.profileId === group.maleProfile) }, female: { text: rangeText(policy.profiles.find(item => item.id === group.femaleProfile)), active: Boolean(reference && reference.profileId === group.femaleProfile) } }));
    }
    if (result.valid && constants) {
      const mass = fromCanonical(fromExact(result.exactMain), "gNa/24h", "reportedValue", constants), shownMass = compactQuantity(mass);
      model.massEquivalent = shownMass ? { rawValue: shownMass.value, exactValue: exact(mass), unit: "g Na/24 h", valueText: shownMass.text, text: shownMass.text + " g Na/24 h" } : null;
      model.notes.massEquivalentText = model.massEquivalent?.text || "";
      const salt = mul(fromExact(result.exactMain), constants.salt), shownSalt = compactQuantity(salt, 4);
      model.saltEquivalent = shownSalt ? { rawValue: shownSalt.value, exactValue: exact(salt), unit: "g NaCl/24 h", valueText: "≈" + shownSalt.text.replace(/^≈/, ""), text: "≈" + shownSalt.text.replace(/^≈/, "") + " g NaCl/24 h", explanation: notes.saltEquivalent || "Przybliżony odpowiednik chemiczny, a nie pomiar spożycia soli." } : null;
      model.notes.saltEquivalentText = model.saltEquivalent?.text || "";
    }
    model.notes.fullValueText = model.presentation.fullValueText;
    model.notes.precisionNote = model.presentation.precisionNote;
    if (model.valid && !model.presentation.ok) return freeze({ ...model, ok: false, valid: false, rawValue: null, value: null, dailyMmol: null, display: { text: "", boundary: "" }, errorCode: model.presentation.errorCode || "numeric-range", error: "Wyniku nie można przedstawić w wybranej jednostce. Sprawdź zapis lub wybierz inną jednostkę.", status: "unassessed", statusText: "", tone: "neutral", outOfRange: null, reference: null, references: [], referenceAvailable: false, referenceActive: false });
    return freeze(model);
  }
  return Object.freeze({ ENGINE_VERSION, SCHEMA, FIELD_IDS, CONTEXT_FIELD_IDS, COLLECTION_FIELDS, parseValue, formatValue, convertUnitInput, inputFromValues, readInputFromDocument, compute, evaluate, calculate: evaluate, presentation, validPolicy });
});
