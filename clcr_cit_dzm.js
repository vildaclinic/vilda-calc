/* Citrate DZM: exact decimal quantities, source-injected limits and exact BSA-squared comparisons.
 * Absolute daily amounts are deliberately distinct from historical Cit_mgkg records. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrCitDzm = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1, SCHEMA = "clcr-cit-dzm";
  const DEFAULTS = Object.freeze({ CITDZM_inputMode: "concentration", CITDZM_concentration: "", CITDZM_concentrationUnit: "mmol/L", CITDZM_volume: "", CITDZM_volumeUnit: "mL", CITDZM_collectionHours: "24", CITDZM_collectionSource: "assumed-24h", CITDZM_durationNeedsConfirmation: "false", CITDZM_reportedValue: "", CITDZM_reportedUnit: "mmol/24h", CITDZM_reportingEntity: "unknown", CITDZM_unitConversions: "" });
  const FIELD_IDS = Object.freeze(Object.keys(DEFAULTS));
  const COLLECTION_FIELDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const CONTEXT_FIELD_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", ...COLLECTION_FIELDS, ...COLLECTION_FIELDS.map(id => "ui_" + id + "_answer"), "Cl24CollectionProblem", "collectionStartAt", "collectionEndAt"]);
  const INPUT_UNITS = Object.freeze(["µmol/L", "mmol/L", "mg/L", "mg/dL"]), REPORTED_UNITS = Object.freeze(["mmol/24h", "mg/24h"]);
  const MOLAR_MASSES = Object.freeze({ citrate_ion: "189.099", citric_acid: "192.1235" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const copy = value => Array.isArray(value) ? value.map(copy) : object(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function safeData(value, finiteOnly = true, seen = new Set(), depth = 0) {
    if (value === null || value === undefined && !finiteOnly || typeof value === "boolean" || typeof value === "number" && (!finiteOnly || finite(value)) || typeof value === "string" && value.length <= 20000) return true;
    if (!value || typeof value !== "object" || depth > 14 || seen.has(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false;
    seen.add(value);
    const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
    const valid = entries.length <= 2000 && entries.every(([key, property]) => !["__proto__", "constructor", "prototype"].includes(key) && !property.get && !property.set && safeData(property.value, finiteOnly, seen, depth + 1));
    seen.delete(value); return valid;
  }
  const primitive = value => value == null ? "" : typeof value === "string" ? value.length <= 512 ? value : "[invalid value]" : typeof value === "number" ? finite(value) ? value : String(value) : "[invalid value]";
  function gcd(a, b) { a = a < 0n ? -a : a; while (b) { const remainder = a % b; a = b; b = remainder; } return a || 1n; }
  function reduced(n, d) { const divisor = gcd(n, d); return { n: n / divisor, d: d / divisor }; }
  function fraction(value) {
    const text = String(value).trim().replace(",", ".").replace(/−/g, "-");
    if (text.length > 4096) return null;
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    const digits = (match[2] || "0") + (match[3] || "");
    // Zero does not need an arbitrarily large power of ten.
    if (!/[1-9]/.test(digits)) return { n: 0n, d: 1n };
    const exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    let n = BigInt((match[1] === "-" ? "-" : "") + digits), d = 1n;
    if (exponent >= 0) n *= 10n ** BigInt(exponent); else d = 10n ** BigInt(-exponent);
    return reduced(n, d);
  }
  const multiply = (a, b) => reduced(a.n * b.n, a.d * b.d);
  const divide = (a, b) => reduced(a.n * b.d, a.d * b.n);
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const exact = value => value ? { numerator: String(value.n), denominator: String(value.d) } : null;
  function fromExact(value) {
    if (!object(value) || !/^-?\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "") || BigInt(value.denominator) <= 0n) return null;
    return reduced(BigInt(value.numerator), BigInt(value.denominator));
  }
  function roundedQuotient(n, d) { const quotient = n / d, remainder = n % d; return quotient + (remainder * 2n > d || remainder * 2n === d && quotient % 2n === 1n ? 1n : 0n); }
  function numberOf(value) {
    if (value.n === 0n) return 0;
    const negative = value.n < 0n, n = negative ? -value.n : value.n, d = value.d;
    let exponent = n.toString(2).length - d.toString(2).length;
    if (exponent >= 0 ? n < d * 2n ** BigInt(exponent) : n * 2n ** BigInt(-exponent) < d) exponent -= 1;
    if (exponent > 1023) return negative ? -Infinity : Infinity;
    if (exponent < -1075) return negative ? -0 : 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? roundedQuotient(n * 2n ** BigInt(scale), d) : roundedQuotient(n, d * 2n ** BigInt(-scale));
    const number = Number(coefficient) * 2 ** -scale;
    return negative ? -number : number;
  }
  function parseValue(value) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(",", ".").replace(/−/g, "-");
    if (!text || text.length > 512) return null;
    const quantity = fraction(text);
    if (!quantity) return null;
    const number = numberOf(quantity), represented = finite(number) ? fraction(String(number)) : null;
    return { text, value: Object.is(number, -0) ? 0 : number, exact: exact(quantity), representable: finite(number) && (number !== 0 || quantity.n === 0n), lossless: Boolean(represented && compare(quantity, represented) === 0) };
  }
  function decimalText(value, places = 1100) {
    const negative = value.n < 0n, n = negative ? -value.n : value.n;
    let remainder = n % value.d, text = (negative ? "-" : "") + String(n / value.d), digits = "";
    for (let i = 0; i < places && remainder; i += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
    if (digits) text += "," + digits;
    return { text, complete: remainder === 0n };
  }
  function compactQuantity(quantity) {
    const value = numberOf(quantity);
    if (!finite(value) || value === 0 && quantity.n !== 0n) return null;
    let text;
    if (value === 0) text = "0";
    else if (compare(quantity, fraction("0.001")) < 0 || compare(quantity, fraction("100000")) >= 0) {
      const power = exponent => exponent >= 0 ? reduced(10n ** BigInt(exponent), 1n) : reduced(1n, 10n ** BigInt(-exponent));
      let exponent = quantity.n.toString().length - quantity.d.toString().length;
      if (compare(quantity, power(exponent)) < 0) exponent -= 1;
      const scaled = divide(quantity, power(exponent));
      let coefficient = roundedQuotient(scaled.n * 1000n, scaled.d);
      if (coefficient >= 10000n) { coefficient /= 10n; exponent += 1; }
      const digits = String(coefficient).padStart(4, "0"), decimals = digits.slice(1).replace(/0+$/, "");
      text = digits[0] + (decimals ? "." + decimals : "") + "e" + (exponent >= 0 ? "+" : "") + exponent;
    } else {
      const coefficient = roundedQuotient(quantity.n * 1000n, quantity.d), whole = coefficient / 1000n, decimals = String(coefficient % 1000n).padStart(3, "0").replace(/0+$/, "");
      text = String(whole) + (decimals ? "." + decimals : "");
    }
    const shown = fraction(text), approximate = !shown || compare(shown, quantity) !== 0, full = decimalText(quantity);
    return { value, text: (approximate ? "≈" : "") + text.replace(".", ","), approximate, fullValueText: full.text + (full.complete ? "" : "…"), fullValueComplete: full.complete };
  }
  function formatValue(value, exactValue) {
    if (!finite(value)) return "";
    const quantity = fromExact(exactValue) || fraction(String(value));
    if (!quantity || quantity.n < 0n || numberOf(quantity) !== value) return "";
    return compactQuantity(quantity)?.text || "";
  }
  function fullValueText(value, exactValue) {
    const quantity = fromExact(exactValue) || finite(value) && fraction(String(value));
    if (!quantity || quantity.n < 0n || numberOf(quantity) !== value) return "";
    const full = decimalText(quantity);
    return full.complete ? full.text : String(quantity.n) + "/" + String(quantity.d);
  }
  function normalizedUnit(value) {
    const raw = primitive(value), key = String(raw).replace(/\s/g, "").replace(/μ/g, "µ").toLowerCase();
    return ({ "µmol/l": "µmol/L", "mmol/l": "mmol/L", "mg/l": "mg/L", "mg/dl": "mg/dL", "ml": "mL", "l": "L", "µmol/24h": "µmol/24h", "mmol/24h": "mmol/24h", "mg/24h": "mg/24h" })[key] || raw;
  }
  const massUnit = unit => String(unit).startsWith("mg/");
  const factorFor = unit => fraction(unit === "mg/dL" ? "10" : unit.startsWith("µmol/") || unit === "mL" ? "0.001" : "1");
  const CONVERSION_KINDS = Object.freeze({ concentration: { field: "concentration", unit: "concentrationUnit", units: INPUT_UNITS }, volume: { field: "volume", unit: "volumeUnit", units: ["mL", "L"] }, reportedValue: { field: "reportedValue", unit: "reportedUnit", units: REPORTED_UNITS } });
  function convertUnitInput(value, from, to, kind, reportingEntity = "unknown") {
    const spec = CONVERSION_KINDS[kind], parsed = parseValue(value);
    const blank = { ok: false, text: "", value: null, unit: to, exactValue: null, errorCode: "invalid-conversion" };
    if (!spec || !spec.units.includes(from) || !spec.units.includes(to) || !parsed?.representable || fromExact(parsed.exact).n < 0n || kind === "volume" && parsed.value === 0) return freeze(blank);
    let quantity = multiply(fromExact(parsed.exact), factorFor(from));
    if (kind !== "volume" && massUnit(from) !== massUnit(to)) {
      if (!own(MOLAR_MASSES, reportingEntity)) return freeze({ ...blank, errorCode: "unknown-reporting-entity" });
      const molarMass = fraction(MOLAR_MASSES[reportingEntity]);
      quantity = massUnit(from) ? divide(quantity, molarMass) : multiply(quantity, molarMass);
    }
    quantity = divide(quantity, factorFor(to));
    const number = numberOf(quantity);
    if (!finite(number) || number === 0 && quantity.n !== 0n) return freeze({ ...blank, errorCode: "numeric-range" });
    const text = String(number).replace(".", ",");
    return freeze({ ok: true, text, value: number, unit: to, exactValue: exact(quantity), reportingEntity, errorCode: "" });
  }
  function validatedConversions(value, data) {
    let supplied = value;
    if (typeof supplied === "string") {
      if (!supplied.trim() || supplied.length > 16384) return {};
      try { supplied = JSON.parse(supplied); } catch (_) { return {}; }
    }
    if (!safeData(supplied) || !object(supplied) || Object.keys(supplied).some(key => !own(CONVERSION_KINDS, key))) return {};
    const result = {};
    for (const [kind, entry] of Object.entries(supplied)) {
      const spec = CONVERSION_KINDS[kind];
      if (!object(entry) || !["originalValue", "originalUnit", "convertedValue", "convertedUnit"].every(key => own(entry, key)) || Object.keys(entry).some(key => !["originalValue", "originalUnit", "convertedValue", "convertedUnit", "reportingEntity"].includes(key))) continue;
      const entity = entry.reportingEntity ?? data.reportingEntity;
      if (kind !== "volume" && (massUnit(entry.originalUnit) || massUnit(entry.convertedUnit)) && entity !== data.reportingEntity) continue;
      if (String(data[spec.field]) !== String(entry.convertedValue) || data[spec.unit] !== entry.convertedUnit) continue;
      const expected = convertUnitInput(entry.originalValue, entry.originalUnit, entry.convertedUnit, kind, entity), parsed = parseValue(entry.convertedValue);
      if (!expected.ok || !parsed?.representable || parsed.value !== expected.value || String(entry.convertedValue).replace(",", ".") !== String(expected.text).replace(",", ".")) continue;
      result[kind] = { originalValue: primitive(entry.originalValue), originalUnit: entry.originalUnit, convertedValue: primitive(entry.convertedValue), convertedUnit: entry.convertedUnit, reportingEntity: entity };
    }
    return result;
  }
  function knownFacts(input, includeFalse = false) {
    const result = {}, supplied = object(input.knownFacts) ? input.knownFacts : {};
    for (const id of COLLECTION_FIELDS) {
      const answer = input["ui_" + id + "_answer"];
      if (answer === "yes" || answer === "no") { result[id] = answer === "yes"; result["ui_" + id + "_answer"] = answer; }
      else if (input[id] === true || includeFalse && input[id] === false) result[id] = input[id];
    }
    if (input.Cl24CollectionProblem === true || input.knownIncomplete === true) result.Cl24CollectionProblem = true;
    for (const [key, value] of Object.entries(supplied)) {
      if (![...CONTEXT_FIELD_IDS, "knownIncomplete", "egfr", "eGFR"].includes(key)) continue;
      if (typeof value === "boolean" || value === null || finite(value) || typeof value === "string" && value.length <= 512) result[key] = value;
    }
    return result;
  }
  function inputData(input) {
    const data = object(input) ? input : {}, historicalMissing = (data.durationNeedsConfirmation === true || data.durationSource === "historical-missing") && absent(data.hours);
    const hours = absent(data.hours) && !historicalMissing && data.durationSource !== "invalid" ? "24" : primitive(data.hours);
    const parsedHours = parseValue(hours), isFullDay = parsedHours?.representable && compare(fromExact(parsedHours.exact), fraction("24")) === 0;
    const result = {
      mode: own(data, "mode") ? primitive(data.mode) : "concentration",
      concentration: primitive(data.concentration), concentrationUnit: normalizedUnit(own(data, "concentrationUnit") ? data.concentrationUnit : "mmol/L"),
      volume: primitive(data.volume), volumeUnit: normalizedUnit(own(data, "volumeUnit") ? data.volumeUnit : "mL"),
      reportedValue: primitive(data.reportedValue), reportedUnit: normalizedUnit(own(data, "reportedUnit") ? data.reportedUnit : "mmol/24h"),
      hours, durationSource: data.durationSource === "invalid" ? "invalid" : historicalMissing ? "historical-missing" : absent(data.hours) ? "assumed-24h" : ["captured", "assumed-24h"].includes(data.durationSource) && (data.durationSource !== "assumed-24h" || isFullDay) ? data.durationSource : "hours",
      durationNeedsConfirmation: historicalMissing, reportingEntity: own(data, "reportingEntity") ? primitive(data.reportingEntity) : "unknown",
      weightKg: primitive(data.weightKg), heightCm: primitive(data.heightCm), ageYears: absent(data.ageYears) ? null : primitive(data.ageYears),
      agePrecision: data.agePrecision === "completed-years" ? "completed-years" : "exact", sex: typeof data.sex === "string" && ["M", "F"].includes(data.sex.trim().toUpperCase()) ? data.sex.trim().toUpperCase() : null, knownFacts: knownFacts(data, true)
    };
    result.outputUnit = massUnit(result.mode === "reported" ? result.reportedUnit : result.concentrationUnit) ? "mg/24h" : "mmol/24h";
    result.unitConversions = validatedConversions(data.unitConversions, result);
    return result;
  }
  function ageFrom(values, context) {
    if (own(values, "age")) {
      if (absent(values.age)) return null;
      if (root?.ClcrClinicalSafety?.parseAge) {
        const older = parseValue(values.age)?.value > 0 || parseValue(values.ageMonths)?.value > 0;
        const age = root.ClcrClinicalSafety.parseAge(values.age, values.ageMonths, older ? null : values.ageDays);
        return age.valid ? age.exactYears : null;
      }
      const years = parseValue(values.age), months = absent(values.ageMonths) ? parseValue("0") : parseValue(values.ageMonths);
      if (!years?.representable || !months?.representable || years.value < 0 || months.value < 0 || months.value >= 12) return null;
      if (years.value === 0 && months.value === 0 && !absent(values.ageDays)) {
        const days = parseValue(values.ageDays); return days?.representable && days.value >= 0 ? days.value / 365.25 : null;
      }
      return years.value + months.value / 12;
    }
    return context.ageContext?.exactYears ?? context.ageYears ?? null;
  }
  function inputFromValues(values, context) {
    const data = object(values) ? values : {}, supplied = object(context) ? context : {};
    const duration = [supplied.durationMinutes, supplied.collectionAnalysis?.durationMinutes].find(value => finite(value) && value > 0);
    const hours = own(data, "CITDZM_collectionHours") ? data.CITDZM_collectionHours : own(supplied, "collectionHours") ? supplied.collectionHours : duration ? duration / 60 : "24";
    const datesOnly = !own(data, "CITDZM_collectionHours") && !own(supplied, "collectionHours") && !duration && (!absent(data.collectionStartAt) || !absent(data.collectionEndAt));
    const facts = { ...knownFacts(supplied, true), ...knownFacts(data) };
    for (const id of ["age", "ageMonths", "ageDays", "collectionStartAt", "collectionEndAt"]) if (own(data, id)) facts[id] = primitive(data[id]);
    return inputData({ mode: data.CITDZM_inputMode ?? "concentration", concentration: data.CITDZM_concentration, concentrationUnit: data.CITDZM_concentrationUnit ?? "mmol/L", volume: data.CITDZM_volume, volumeUnit: data.CITDZM_volumeUnit ?? "mL", reportedValue: data.CITDZM_reportedValue, reportedUnit: data.CITDZM_reportedUnit ?? "mmol/24h", reportingEntity: data.CITDZM_reportingEntity ?? "unknown", unitConversions: data.CITDZM_unitConversions ?? supplied.unitConversions,
      hours: datesOnly ? "" : hours, durationSource: data.CITDZM_collectionSource ?? supplied.durationSource ?? (own(data, "CITDZM_collectionHours") && !absent(data.CITDZM_collectionHours) ? "hours" : duration || own(supplied, "collectionHours") ? "captured" : "assumed-24h"), durationNeedsConfirmation: data.CITDZM_durationNeedsConfirmation === true || data.CITDZM_durationNeedsConfirmation === "true" || data.CITDZM_collectionSource === "historical-missing" || supplied.durationNeedsConfirmation === true || datesOnly,
      weightKg: data.weight ?? supplied.weightKg, heightCm: data.height ?? supplied.heightCm, ageYears: ageFrom(data, supplied), agePrecision: own(data, "age") && Number.isInteger(parseValue(data.age)?.value) && absent(data.ageMonths) && absent(data.ageDays) ? "completed-years" : supplied.agePrecision ?? supplied.ageContext?.precision,
      sex: own(data, "sex") ? data.sex : supplied.sex, knownFacts: facts });
  }
  function captureFields(source) {
    const data = {}, doc = source?.getElementById ? source : !source ? root?.document : null;
    const vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS]) {
      const control = doc?.getElementById(id);
      if (control) data[id] = ["checkbox", "radio"].includes(control.type) ? control.checked === true : primitive(control.value);
      else if (doc && own(vault, id)) data[id] = typeof vault[id] === "boolean" ? vault[id] : primitive(vault[id]);
      else if (!doc && object(source) && own(source, id)) data[id] = typeof source[id] === "boolean" ? source[id] : primitive(source[id]);
    }
    return data;
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document;
    return inputFromValues(captureFields(doc), context ?? root?.ClcrCitDzmSession?.readContext?.(doc));
  }
  function normalizeInput(input, context) { return !safeData(input, false) ? inputData({ mode: "invalid-input" }) : object(input) && FIELD_IDS.some(id => own(input, id)) ? inputFromValues(input, context) : inputData(input); }
  const INPUT_IDS = Object.freeze({ concentration: "CITDZM_concentration", volume: "CITDZM_volume", hours: "CITDZM_collectionHours", reportedValue: "CITDZM_reportedValue" });
  const LABELS = Object.freeze({ concentration: "stężenie cytrynianów", volume: "objętość zbiórki", hours: "czas zbiórki", reportedValue: "gotowe wydalanie" });
  function compute(input) {
    const data = normalizeInput(input), reported = data.mode === "reported", missingIds = [], invalidIds = [], cautions = [];
    const unit = data.outputUnit.replace("24h", "24 h");
    const fail = (errorCode, error) => freeze({ ok: false, valid: false, rawValue: null, value: null, unit, outputUnit: data.outputUnit, exactMain: null, dailyMg: null, dailyMmol: null, exactDailyMg: null, exactDailyMmol: null, hours: null, input: data, missingIds, invalidIds, cautions, display: { text: "", boundary: "" }, errorCode, error, blocked: false });
    if (!["concentration", "reported"].includes(data.mode)) return fail("invalid-mode", "Wybierz sposób wprowadzenia wyniku.");
    if (!["unknown", "citrate_ion", "citric_acid"].includes(data.reportingEntity)) return fail("invalid-reporting-entity", "Wybierz postać masową z listy.");
    const activeUnit = reported ? data.reportedUnit : data.concentrationUnit;
    if (!(reported ? REPORTED_UNITS : INPUT_UNITS).includes(activeUnit)) return fail(reported ? "invalid-reported-unit" : "invalid-concentration-unit", "Wybierz jednostkę wyniku z listy.");
    if (!reported && !["mL", "L"].includes(data.volumeUnit)) return fail("invalid-volume-unit", "Wybierz jednostkę objętości z listy.");
    if (!reported && data.durationSource === "invalid") { invalidIds.push(INPUT_IDS.hours); return fail("invalid-hours", "Czas zbiórki ma nieprawidłowe dane źródłowe. Podaj rzeczywisty czas zbiórki."); }
    const parsed = {}, required = reported ? ["reportedValue"] : ["concentration", "volume", "hours"];
    for (const field of required) {
      if (absent(data[field])) { missingIds.push(INPUT_IDS[field]); continue; }
      const value = parseValue(data[field]);
      if (!value?.representable || fromExact(value.exact).n < 0n || ["volume", "hours"].includes(field) && value.value === 0) { invalidIds.push(INPUT_IDS[field]); continue; }
      parsed[field] = value;
    }
    if (invalidIds.length) return fail("invalid-" + Object.keys(INPUT_IDS).find(key => INPUT_IDS[key] === invalidIds[0]), "Sprawdź " + invalidIds.map(id => LABELS[Object.keys(INPUT_IDS).find(key => INPUT_IDS[key] === id)]).join(" i ") + ". Wartość nie może być ujemna; objętość i czas muszą być większe od zera.");
    if (missingIds.length) return fail("missing-" + Object.keys(INPUT_IDS).find(key => INPUT_IDS[key] === missingIds[0]), "Uzupełnij " + missingIds.map(id => LABELS[Object.keys(INPUT_IDS).find(key => INPUT_IDS[key] === id)]).join(" i ") + ".");
    function quantity(field) {
      const entry = data.unitConversions[field];
      if (!entry) return fromExact(parsed[field].exact);
      return fromExact(convertUnitInput(entry.originalValue, entry.originalUnit, entry.convertedUnit, field, entry.reportingEntity).exactValue);
    }
    if (data.knownFacts.Cl24CollectionProblem === true || data.knownFacts.knownIncomplete === true || COLLECTION_FIELDS.some(id => data.knownFacts[id] === false || data.knownFacts["ui_" + id + "_answer"] === "no")) return freeze({ ...fail("incomplete-collection", "Zbiórka jest niepełna. Z tych danych nie można wyznaczyć wiarygodnego wydalania dobowego."), blocked: true });
    let daily = multiply(quantity(reported ? "reportedValue" : "concentration"), factorFor(activeUnit));
    const reportedHours = reported ? parseValue(data.hours) : null;
    const hours = reported ? reportedHours?.representable && fromExact(reportedHours.exact).n > 0n && data.durationSource !== "invalid" ? fromExact(reportedHours.exact) : null : fromExact(parsed.hours.exact);
    if (!reported) daily = divide(multiply(multiply(daily, multiply(quantity("volume"), factorFor(data.volumeUnit))), fraction("24")), hours);
    const value = numberOf(daily);
    if (!finite(value) || value === 0 && daily.n !== 0n) return fail("numeric-range", "Wynik jest poza zakresem liczb możliwych do zapisania. Sprawdź wartość i jednostkę.");
    const mass = own(MOLAR_MASSES, data.reportingEntity) ? fraction(MOLAR_MASSES[data.reportingEntity]) : null;
    const molar = massUnit(activeUnit) ? mass ? divide(daily, mass) : null : daily;
    const massQuantity = massUnit(activeUnit) ? daily : mass ? multiply(daily, mass) : null;
    const availableNumber = quantity => quantity && finite(numberOf(quantity)) && (numberOf(quantity) !== 0 || quantity.n === 0n) ? numberOf(quantity) : null;
    const shown = formatValue(value, exact(daily));
    return freeze({ ok: true, valid: true, rawValue: value, value, unit, outputUnit: data.outputUnit, exactMain: exact(daily), dailyMg: availableNumber(massQuantity), dailyMmol: availableNumber(molar), exactDailyMg: exact(massQuantity), exactDailyMmol: exact(molar), hours: hours ? numberOf(hours) : null, exactHours: exact(hours), input: data, missingIds, invalidIds, cautions, display: { text: shown, boundary: "" }, errorCode: "", error: "", blocked: false, reportingBasis: massUnit(activeUnit) ? data.reportingEntity === "citrate_ion" ? "citrate-ion" : data.reportingEntity === "citric_acid" ? "citric-acid" : "unknown" : "citrate-amount" });
  }
  function readiness(input) {
    const result = compute(input), data = result.input, userRequiredIds = data.mode === "reported" ? [INPUT_IDS.reportedValue] : [INPUT_IDS.concentration, INPUT_IDS.volume], requiredIds = data.mode === "reported" ? userRequiredIds.slice() : [...userRequiredIds, INPUT_IDS.hours];
    const filled = userRequiredIds.filter(id => !result.missingIds.includes(id) && !result.invalidIds.includes(id)).length;
    return freeze({ ready: result.valid, requiredIds, userRequiredIds, missingIds: result.missingIds, invalidIds: result.invalidIds, filled, total: userRequiredIds.length, filledCount: filled, requiredCount: userRequiredIds.length, reasonCode: result.errorCode, error: result.error });
  }
  function integerSqrt(value) {
    if (value < 2n) return value;
    let x = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
    for (;;) { const next = (x + value / x) / 2n; if (next >= x) return x; x = next; }
  }
  const square = value => multiply(value, value);
  function powerTen(exponent) { return exponent >= 0 ? reduced(10n ** BigInt(exponent), 1n) : reduced(1n, 10n ** BigInt(-exponent)); }
  function rootNumber(value) {
    if (value.n === 0n) return 0;
    const exponent = Math.floor((value.n.toString().length - value.d.toString().length) / 2), scale = powerTen(exponent);
    return Math.sqrt(numberOf(divide(value, square(scale)))) * numberOf(scale);
  }
  function rationalRoot(value) {
    const n = integerSqrt(value.n), d = integerSqrt(value.d);
    return n * n === value.n && d * d === value.d ? reduced(n, d) : null;
  }
  function decimalExponent(value, isRoot = false) {
    if (value.n === 0n) return 0;
    let exponent = Math.floor((value.n.toString().length - value.d.toString().length) / (isRoot ? 2 : 1));
    const threshold = exponent => isRoot ? square(powerTen(exponent)) : powerTen(exponent);
    while (compare(value, threshold(exponent)) < 0) exponent -= 1;
    while (compare(value, threshold(exponent + 1)) >= 0) exponent += 1;
    return exponent;
  }
  function significantText(value, digits, isRoot = false) {
    if (value.n === 0n) return "0";
    let exponent = decimalExponent(value, isRoot), places = digits - 1 - exponent;
    const scale = powerTen(places), scaled = multiply(value, isRoot ? square(scale) : scale);
    let coefficient;
    if (isRoot) {
      const lower = integerSqrt(scaled.n / scaled.d), midpoint = (2n * lower + 1n) ** 2n * scaled.d, actual = 4n * scaled.n;
      coefficient = lower + (actual > midpoint || actual === midpoint && lower % 2n === 1n ? 1n : 0n);
    } else coefficient = roundedQuotient(scaled.n, scaled.d);
    if (coefficient.toString().length > digits) { coefficient /= 10n; exponent += 1; places -= 1; }
    const raw = String(coefficient);
    if (exponent < -6 || exponent >= 10) {
      const decimals = raw.slice(1).replace(/0+$/, "");
      return raw[0] + (decimals ? "," + decimals : "") + "e" + (exponent >= 0 ? "+" : "") + exponent;
    }
    if (places <= 0) return raw + "0".repeat(-places);
    const padded = raw.padStart(places + 1, "0"), decimals = padded.slice(-places).replace(/0+$/, "");
    return padded.slice(0, -places) + (decimals ? "," + decimals : "");
  }
  function boundSide(quantity, bound) {
    const direct = fromExact(bound.exactValue), squared = fromExact(bound.exactSquared);
    return direct ? compare(quantity, direct) : squared ? compare(square(quantity), squared) : null;
  }
  function presentation(result) {
    const blank = { ok: false, outputUnit: result?.outputUnit || "mmol/24h", unitText: result?.unit || "mmol/24 h", valueText: "", referenceValue: "Brak normy do porównania", referenceText: "Brak normy do porównania", rawValue: null, lower: null, upper: null, exactLower: null, exactUpper: null, exactLowerSquared: null };
    if (!result?.valid) return freeze(blank);
    const main = fromExact(result.exactMain), bounds = Array.isArray(result.displayBounds) ? result.displayBounds : [];
    if (!main || main.n < 0n || numberOf(main) !== result.rawValue) return freeze(blank);
    for (let digits = 4; digits <= 120; digits += 1) {
      const valueText = significantText(main, digits), shownMain = fraction(valueText);
      const texts = bounds.map(bound => { const exactValue = fromExact(bound.exactValue), exactSquared = fromExact(bound.exactSquared); return exactValue ? significantText(exactValue, digits) : exactSquared ? significantText(exactSquared, digits, true) : ""; });
      if (!shownMain || compare(shownMain, fraction("0")) !== compare(main, fraction("0")) || texts.some(text => !text || text.length > 160) || valueText.length > 160 || bounds.some((bound, i) => compare(shownMain, fraction(texts[i])) !== boundSide(main, bound))) continue;
      const lowerIndex = bounds.findIndex(bound => bound.kind === "lower"), lowerText = lowerIndex >= 0 ? texts[lowerIndex] : "", referenceValue = lowerText ? result.reference.operator + lowerText : blank.referenceValue;
      return freeze({ ...blank, ok: true, valueText, referenceValue, referenceText: lowerText ? referenceValue + " " + result.unit : referenceValue, rawValue: result.rawValue, lower: result.reference?.lower ?? null, exactValue: result.exactMain, exactLower: result.reference?.exactLower ?? null, exactLowerSquared: result.reference?.exactLowerSquared ?? null, precision: digits, valueApproximate: compare(main, shownMain) !== 0, lowerValueText: lowerText, displayBounds: bounds.map((bound, index) => ({ ...copy(bound), text: texts[index] })) });
    }
    return freeze({ ...blank, errorCode: "numeric-precision" });
  }
  function validPolicy(policy) {
    if (!safeData(policy) || !object(policy) || policy.schema !== "clcr-cit-dzm-reference-policy" || typeof policy.id !== "string" || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || !Array.isArray(policy.sources) || !policy.sources.length || !object(policy.notes) || !object(policy.population) || policy.adultLowerInclusive !== true || policy.pediatricLowerInclusive !== false || policy.bsaMethod !== "Mosteller") return false;
    if (!object(policy.masses) || Object.keys(MOLAR_MASSES).some(key => policy.masses[key] !== MOLAR_MASSES[key]) || ![policy.bodySurfaceIndex, policy.adultAgeYears, policy.pediatricMinAgeYears].every(value => finite(value) && value > 0)) return false;
    if (!Number.isInteger(policy.adultAgeYears) || policy.pediatricMinAgeYears >= policy.adultAgeYears || !object(policy.adultLowerMmolPerDay) || !object(policy.pediatricLowerIndexedMmolPerDay)) return false;
    if ([policy.adultLowerMmolPerDay, policy.pediatricLowerIndexedMmolPerDay].some(map => Object.keys(map).length !== 2 || ["M", "F"].some(sex => !finite(map[sex]) || map[sex] <= 0))) return false;
    const requiredNotes = ["assumption", "noPolicy", "noAge", "noSex", "noBsa", "infant", "unknownEntity", "non24", "reportedNon24", "reportedUnknownDuration", "incomplete", "within", "boundary", "low", "clinicalDetails", "collectionDetails", "zeroDetails"];
    if (requiredNotes.some(key => typeof policy.notes[key] !== "string" || !policy.notes[key]) || new Set(policy.sources.map(source => source.id)).size !== policy.sources.length) return false;
    return policy.sources.every(source => object(source) && typeof source.id === "string" && source.id && typeof source.label === "string" && source.label && typeof source.url === "string" && /^https?:\/\//i.test(source.url) && (!source.supplementUrl || /^https?:\/\//i.test(source.supplementUrl))) && policy.sources.some(source => source.id === policy.sourceId);
  }
  function evaluate(input, policy) {
    const result = compute(input), data = result.input, hasPolicy = validPolicy(policy), notes = hasPolicy ? copy(policy.notes) : {};
    const model = { ...copy(result), schema: SCHEMA, version: 1, engineVersion: ENGINE_VERSION, formulaId: "Cit_mgkg", outputKey: "Cit_total24", status: "unassessed", statusText: result.valid ? "Dobowe wydalanie cytrynianów" : "", tone: "neutral", outOfRange: null, category: null, interpretation: notes.noPolicy || "Wynik pozostaje bez automatycznego porównania z normą.", reference: null, references: [], referenceAvailable: false, referenceActive: false, referenceLabel: "Norma dla pacjenta", referenceText: "Brak normy do porównania", referenceHint: "", referenceRows: [], contextLabel: "Dobowe wydalanie cytrynianów", policy: hasPolicy ? { id: policy.id, version: policy.version } : null, referencePolicy: hasPolicy ? copy(policy) : null, sources: hasPolicy ? copy(policy.sources) : [], population: hasPolicy ? copy(policy.population) : null, populationCategory: "unknown", bsaM2: null, bsaMethod: null, exactBsaSquared: null, indexedMmol: null, indexed: null, exactIndexedMmol: null, exactIndexed: null, indexedDisplay: "", displayBounds: [], notes, details: [], referenceReason: "" };
    if (!result.valid) { model.interpretation = ""; model.presentation = presentation(model); return freeze(model); }
    const main = fromExact(result.exactMain), molar = fromExact(result.exactDailyMmol), age = parseValue(data.ageYears), weight = parseValue(data.weightKg), height = parseValue(data.heightCm);
    const validAge = age?.representable && fromExact(age.exact).n >= 0n && (data.agePrecision !== "completed-years" || fromExact(age.exact).d === 1n);
    const pediatric = hasPolicy && validAge && compare(fromExact(age.exact), fraction(String(policy.adultAgeYears))) < 0;
    const infant = hasPolicy && validAge && compare(fromExact(age.exact), fraction(String(policy.pediatricMinAgeYears))) < 0;
    let bsaSquared = null;
    if (hasPolicy && weight?.representable && height?.representable && fromExact(weight.exact).n > 0n && fromExact(height.exact).n > 0n) {
      const squared = divide(multiply(fromExact(weight.exact), fromExact(height.exact)), fraction("3600")), bsa = rootNumber(squared);
      if (finite(bsa) && bsa > 0) { bsaSquared = squared; model.bsaM2 = bsa; model.bsaMethod = "Mosteller"; model.exactBsaSquared = exact(squared); }
    }
    if (hasPolicy && molar && bsaSquared) {
      const indexedSquared = divide(multiply(square(molar), square(fraction(String(policy.bodySurfaceIndex)))), bsaSquared), indexedExact = rationalRoot(indexedSquared), indexed = rootNumber(indexedSquared);
      if (finite(indexed) && (indexed !== 0 || molar.n === 0n)) { model.indexedMmol = indexed; model.indexed = indexed; model.exactIndexedMmol = exact(indexedExact); model.exactIndexed = exact(indexedExact); model.exactIndexedSquared = exact(indexedSquared); model.indexedDisplay = significantText(indexedSquared, 5, true); }
    }
    const fullDay = result.exactHours && compare(fromExact(result.exactHours), fraction("24")) === 0;
    let unavailable = !hasPolicy ? notes.noPolicy || model.interpretation : !fullDay ? data.mode === "reported" ? result.exactHours ? notes.reportedNon24 : notes.reportedUnknownDuration : notes.non24 : !molar ? notes.unknownEntity : !validAge ? notes.noAge : infant ? notes.infant : !["M", "F"].includes(data.sex) ? notes.noSex : pediatric && !bsaSquared ? notes.noBsa : "";
    if (!fullDay) model.statusText = data.mode === "reported" ? "Wynik dobowy — ocena ograniczona" : "Przeliczenie na 24 godziny";
    if (hasPolicy && validAge) model.populationCategory = infant ? "infant" : pediatric ? "pediatric" : "adult";
    if (!unavailable) {
      const sourceLower = (pediatric ? policy.pediatricLowerIndexedMmolPerDay : policy.adultLowerMmolPerDay)[data.sex];
      const index = fraction(String(policy.bodySurfaceIndex)), mass = massUnit(data.outputUnit) ? fraction(MOLAR_MASSES[data.reportingEntity]) : fraction("1"), base = multiply(fraction(String(sourceLower)), mass);
      const squared = pediatric ? divide(multiply(square(base), bsaSquared), square(index)) : square(base), exactValue = pediatric ? rationalRoot(squared) : base;
      const lowerBound = { kind: "lower", exactValue: exact(exactValue), exactSquared: exact(squared), value: exactValue ? numberOf(exactValue) : rootNumber(squared), sourceId: policy.sourceId };
      if (!finite(lowerBound.value) || lowerBound.value <= 0) unavailable = notes.noBsa || "Normy nie można przeliczyć dla podanych danych.";
      else {
        const source = policy.sources.find(item => item.id === policy.sourceId), comparison = boundSide(main, lowerBound), lowerInclusive = pediatric ? policy.pediatricLowerInclusive : policy.adultLowerInclusive, operator = lowerInclusive ? "≥" : ">";
        model.reference = { kind: "lower", profileId: policy.id + (pediatric ? "-pediatric-" : "-adult-") + data.sex, ruleId: pediatric ? "bsa-mosteller-uncapped" : "adult-absolute", label: "Norma dla pacjenta", lower: lowerBound.value, min: lowerBound.value, upper: null, max: null, lowerInclusive, upperInclusive: false, operator, unit: result.unit, exactLower: lowerBound.exactValue, exactLowerSquared: lowerBound.exactSquared, exactUpper: null, bsa: pediatric ? model.bsaM2 : null, bsaM2: pediatric ? model.bsaM2 : null, exactBsaSquared: pediatric ? model.exactBsaSquared : null, bsaMethod: pediatric ? "Mosteller" : null, adultCap: null, capped: false, sourceLower, sourceUpper: null, sourceUnit: pediatric ? "mmol/1,73 m²/24 h" : "mmol/24 h", sourceText: operator + String(sourceLower).replace(".", ","), sourceId: policy.sourceId, sourceIds: [policy.sourceId], sourceLabel: source.label, sourceUrl: source.url, sample: source.sample, method: source.method, population: source.population, explanation: pediatric ? "Norma przeliczona dla powierzchni ciała." : "Dorośli.", ageLower: pediatric ? policy.pediatricMinAgeYears : policy.adultAgeYears, ageUpper: pediatric ? policy.adultAgeYears : null, ageLowerInclusive: true, ageUpperInclusive: false, agePolicy: pediatric ? policy.pediatricAgeNote : policy.adultAgeNote, sex: data.sex };
        model.referenceAvailable = true; model.referenceActive = true; model.referenceHint = source.label;
        model.displayBounds = [lowerBound];
        const boundary = comparison === 0 && !lowerInclusive, low = comparison < 0;
        model.status = boundary ? "boundary" : low ? "low" : "within";
        model.statusText = boundary ? "Na dolnej granicy" : low ? "Obniżone wydalanie cytrynianów" : "Wydalanie nieobniżone";
        model.tone = boundary || low ? "warning" : "normal"; model.outOfRange = boundary || low;
        model.interpretation = boundary ? notes.boundary : low ? notes.low : notes.within;
        model.details.push(pediatric ? "Norma źródłowa: " + operator + String(sourceLower).replace(".", ",") + " mmol/1,73 m²/24 h. BSA (Mosteller): " + significantText(bsaSquared, 6, true) + " m². Dolna granica dobowa = " + String(sourceLower).replace(".", ",") + " × BSA / " + String(policy.bodySurfaceIndex).replace(".", ",") + "." : "Norma źródłowa: " + operator + String(sourceLower).replace(".", ",") + " mmol/24 h.");
      }
    }
    if (unavailable) { model.interpretation = unavailable; model.referenceReason = unavailable; }
    if (hasPolicy) {
      model.details.push(notes.clinicalDetails, notes.collectionDetails);
      if (notes.alternativeSource) model.details.push(notes.alternativeSource);
      if (infant) model.details.push(policy.pediatricAgeNote);
      if (main.n === 0n) {
        model.status = "zero"; model.statusText = "Wynik równy zero"; model.tone = "neutral"; model.outOfRange = null; model.referenceActive = false;
        model.interpretation = notes.zeroDetails; model.details.push(notes.zeroDetails);
        if (unavailable) model.cautions.push(unavailable);
      }
      if (massUnit(data.outputUnit) && own(MOLAR_MASSES, data.reportingEntity)) model.details.push("Przeliczenie masy: " + (data.reportingEntity === "citrate_ion" ? "jon cytrynianowy" : "kwas cytrynowy bezwodny") + ", " + MOLAR_MASSES[data.reportingEntity].replace(".", ",") + " mg/mmol.");
    }
    model.presentation = presentation(model);
    if (!model.presentation.ok) return freeze({ ...model, ok: false, valid: false, rawValue: null, value: null, exactMain: null, display: { text: "", boundary: "" }, reference: null, references: [], referenceAvailable: false, referenceActive: false, status: "unassessed", statusText: "", tone: "neutral", outOfRange: null, errorCode: model.presentation.errorCode || "numeric-precision", error: "Wyniku nie można pokazać z dokładnością zachowującą właściwe porównanie z normą. Sprawdź zapis danych." });
    model.display = { text: model.presentation.valueText, boundary: model.status === "boundary" ? "lower" : "" };
    model.dailyDisplay = model.display.text;
    if (model.reference) { model.reference.text = model.presentation.referenceValue; model.reference.lowerText = model.presentation.lowerValueText; model.referenceText = model.presentation.referenceText; model.references = [copy(model.reference)]; }
    model.notes.sourceSummary = model.reference ? model.reference.sourceLabel + " · pełna zbiórka 24 h" : "";
    model.notes.contextExplanation = model.reference?.explanation || model.referenceReason;
    model.notes.referenceCalculation = model.details[0] || "";
    return freeze(model);
  }
  return Object.freeze({ ENGINE_VERSION, SCHEMA, DEFAULTS, FIELD_IDS, CONTEXT_FIELD_IDS, COLLECTION_FIELDS, INPUT_UNITS, REPORTED_UNITS, MOLAR_MASSES, parseValue, formatValue, fullValueText, normalizeInput, inputFromValues, readInputFromDocument, captureFields, convertUnitInput, compute, readiness, getReadiness: readiness, evaluate, calculate: evaluate, presentation, validPolicy });
});
