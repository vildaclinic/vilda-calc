/* KM/Cr: exact specimen-aware urine ratio, independent of the reference data.
 * Changing a selected input unit interprets the entered laboratory value;
 * this module does not rescale or mutate a form control. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrUrateCreatinine = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1, SCHEMA = "clcr-urate-creatinine", UNIT = "mmol/mmol";
  const MOLAR_MASSES = Object.freeze({ uricAcid: "168.11", creatinine: "113.12" });
  const DEFAULTS = Object.freeze({ URCR_inputMode: "concentration", URCR_uricAcid: "", URCR_uricAcidUnit: "mg/dL", URCR_creatinine: "", URCR_creatinineUnit: "mg/dL", URCR_reportedValue: "", URCR_reportedUnit: UNIT, URCR_specimen: "random", URCR_outputUnit: UNIT });
  const FIELD_IDS = Object.freeze(Object.keys(DEFAULTS));
  const CONTEXT_FIELD_IDS = Object.freeze(["age", "ageMonths", "ageDays", "URCR_sameUrineSample"]);
  const INPUT_UNITS = Object.freeze(["mg/dL", "mg/L", "mmol/L", "µmol/L"]);
  const REPORTED_UNITS = Object.freeze([UNIT, "mg/mg", "mg/g"]);
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
    const raw = primitive(value), normalized = String(raw).replace(/\s+/g, "").replace(/μ/g, "µ").toLowerCase();
    return ({ "mg/dl": "mg/dL", "mg/l": "mg/L", "mmol/l": "mmol/L", "µmol/l": "µmol/L", "mmol/mmol": UNIT, "mg/mg": "mg/mg", "mg/g": "mg/g" })[normalized] || raw;
  }
  function knownFacts(input) {
    const result = {};
    const supplied = object(input.knownFacts) ? input.knownFacts : {};
    for (const key of CONTEXT_FIELD_IDS) if (own(supplied, key)) result[key] = typeof supplied[key] === "boolean" ? supplied[key] : primitive(supplied[key]);
    if ([false, "false"].includes(input.sameUrineSample) || [false, "false"].includes(supplied.sameUrineSample) || [false, "false"].includes(supplied.URCR_sameUrineSample)) result.sameUrineSample = false;
    else if ([true, "true"].includes(input.sameUrineSample) || [true, "true"].includes(supplied.sameUrineSample)) result.sameUrineSample = true;
    return result;
  }
  function inputData(input) {
    const data = object(input) ? input : {}, facts = knownFacts(data);
    return {
      mode: own(data, "mode") ? primitive(data.mode) : "concentration",
      uricAcid: primitive(data.uricAcid), uricAcidUnit: normalizedUnit(own(data, "uricAcidUnit") ? data.uricAcidUnit : "mg/dL"),
      creatinine: primitive(data.creatinine), creatinineUnit: normalizedUnit(own(data, "creatinineUnit") ? data.creatinineUnit : "mg/dL"),
      reportedValue: primitive(data.reportedValue), reportedUnit: normalizedUnit(own(data, "reportedUnit") ? data.reportedUnit : UNIT),
      specimen: own(data, "specimen") ? primitive(data.specimen) : "random", outputUnit: normalizedUnit(own(data, "outputUnit") ? data.outputUnit : UNIT),
      ageYears: absent(data.ageYears) ? null : primitive(data.ageYears), agePrecision: data.agePrecision === "completed-years" ? "completed-years" : "exact",
      sameUrineSample: own(facts, "sameUrineSample") ? facts.sameUrineSample : null, knownFacts: facts
    };
  }
  function ageFrom(values, context) {
    if (own(values, "age")) {
      if (absent(values.age)) return null;
      const years = parseValue(values.age), months = absent(values.ageMonths) ? { value: 0, lossless: true } : parseValue(values.ageMonths);
      if (!years?.lossless || !months?.lossless || !Number.isInteger(years.value) || !Number.isInteger(months.value) || years.value < 0 || years.value > 120 || months.value < 0 || months.value > 11 || years.value * 12 + months.value > 1440) return null;
      if (years.value === 0 && months.value === 0 && !absent(values.ageDays)) {
        const days = parseValue(values.ageDays);
        return days?.lossless && Number.isInteger(days.value) && days.value >= 0 && days.value <= 28 ? days.value / 365.2425 : null;
      }
      return years.value + months.value / 12;
    }
    if (context.ageContext && context.ageContext.valid === false) return null;
    return context.ageYears ?? context.ageContext?.exactYears ?? values.ageYears ?? null;
  }
  function readReferenceContext(values, context) {
    const data = object(values) && safeData(values, false) ? values : {}, supplied = object(context) && safeData(context, false) ? context : {};
    const age = parseValue(ageFrom(data, supplied));
    return freeze({ ageYears: age?.representable && age.lossless && age.value >= 0 ? age.value : null, agePrecision: own(data, "age") && absent(data.ageMonths) && absent(data.ageDays) ? "completed-years" : supplied.agePrecision === "completed-years" ? "completed-years" : "exact" });
  }
  function inputFromValues(values, context) {
    if (!safeData(values, false) || context != null && !safeData(context, false)) return inputData({ mode: "invalid" });
    const data = object(values) ? values : {}, supplied = object(context) ? context : {}, referenceContext = readReferenceContext(data, supplied), facts = {};
    for (const key of CONTEXT_FIELD_IDS) if (own(data, key)) facts[key] = typeof data[key] === "boolean" ? data[key] : primitive(data[key]);
    const mismatch = [false, "false"].includes(data.URCR_sameUrineSample) || [false, "false"].includes(supplied.sameUrineSample) || [false, "false"].includes(supplied.knownFacts?.sameUrineSample);
    const matched = [true, "true"].includes(data.URCR_sameUrineSample) || [true, "true"].includes(supplied.sameUrineSample);
    if (mismatch || matched) facts.sameUrineSample = !mismatch;
    return inputData({
      mode: own(data, "URCR_inputMode") ? data.URCR_inputMode : DEFAULTS.URCR_inputMode,
      uricAcid: data.URCR_uricAcid ?? "", uricAcidUnit: own(data, "URCR_uricAcidUnit") ? data.URCR_uricAcidUnit : DEFAULTS.URCR_uricAcidUnit,
      creatinine: data.URCR_creatinine ?? "", creatinineUnit: own(data, "URCR_creatinineUnit") ? data.URCR_creatinineUnit : DEFAULTS.URCR_creatinineUnit,
      reportedValue: data.URCR_reportedValue ?? "", reportedUnit: own(data, "URCR_reportedUnit") ? data.URCR_reportedUnit : DEFAULTS.URCR_reportedUnit,
      specimen: own(data, "URCR_specimen") ? data.URCR_specimen : DEFAULTS.URCR_specimen,
      outputUnit: own(data, "URCR_outputUnit") ? data.URCR_outputUnit : DEFAULTS.URCR_outputUnit,
      ...referenceContext, sameUrineSample: mismatch ? false : matched ? true : null, knownFacts: facts
    });
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document, vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {}, values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" || control.type === "radio" ? control.checked === true : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    return inputFromValues(values, context);
  }
  function validPolicy(policy) {
    if (!safeData(policy) || !object(policy) || policy.quantity !== "urinary-urate-creatinine-ratio" || policy.specimen !== "random" || policy.unit !== UNIT || typeof policy.id !== "string" || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || !finite(policy.minimumAge) || policy.minimumAge < 0 || !object(policy.population) || typeof policy.population.label !== "string" || !policy.population.label || !Array.isArray(policy.sources) || !policy.sources.length || !Array.isArray(policy.profiles) || !policy.profiles.length || !object(policy.notes)) return false;
    if (!policy.sources.every(source => object(source) && ["id", "label", "url"].every(key => typeof source[key] === "string" && source[key]) && /^https?:\/\/[^\s<>"']+$/.test(source.url))) return false;
    if (!["noPolicyTitle", "noPolicy", "noAge", "noProfile", "timedTitle", "timed", "unknownSpecimen", "zeroTitle", "zero", "precision"].every(key => typeof policy.notes[key] === "string" && policy.notes[key])) return false;
    const ids = new Set();
    if (!policy.profiles.every(profile => {
      if (!object(profile) || ids.has(profile.id) || profile.kind !== "interval" || profile.specimen !== "random" || profile.unit !== UNIT || !finite(profile.ageLower) || profile.ageLower < 0 || profile.ageUpper !== null && (!finite(profile.ageUpper) || profile.ageUpper <= profile.ageLower) || !finite(profile.lower) || profile.lower < 0 || !finite(profile.upper) || profile.upper <= profile.lower || !["ageLowerInclusive", "ageUpperInclusive", "lowerInclusive", "upperInclusive"].every(key => typeof profile[key] === "boolean") || !["id", "label", "text", "sourceId", "sourceLabel", "sourceAgeLabel", "population", "sample", "method", "explanation"].every(key => typeof profile[key] === "string" && profile[key]) || !policy.sources.some(source => source.id === profile.sourceId) || !object(profile.titles) || !object(profile.copy) || !["low", "within", "high"].every(key => typeof profile.titles[key] === "string" && profile.titles[key] && typeof profile.copy[key] === "string" && profile.copy[key])) return false;
      if (profile.sourceIds && (!Array.isArray(profile.sourceIds) || !profile.sourceIds.length || profile.sourceIds.some(id => !policy.sources.some(source => source.id === id)))) return false;
      ids.add(profile.id); return true;
    })) return false;
    for (let i = 0; i < policy.profiles.length; i += 1) for (let j = i + 1; j < policy.profiles.length; j += 1) {
      const a = policy.profiles[i], b = policy.profiles[j], lower = Math.max(a.ageLower, b.ageLower), upper = Math.min(a.ageUpper ?? Infinity, b.ageUpper ?? Infinity);
      if (lower < upper || lower === upper && (a.ageLower === lower ? a.ageLowerInclusive : a.ageUpperInclusive) && (b.ageLower === lower ? b.ageLowerInclusive : b.ageUpperInclusive)) return false;
    }
    return true;
  }
  function molar(quantity, unit, mass) {
    if (unit === "mmol/L") return quantity;
    if (unit === "µmol/L") return divide(quantity, fraction("1000"));
    return divide(unit === "mg/dL" ? multiply(quantity, fraction("10")) : quantity, fraction(mass));
  }
  function numericResult(input) {
    const safe = input == null || safeData(input, false), data = inputData(safe ? input : {}), missingIds = [], invalidIds = [], problems = [];
    const requiredIds = data.mode === "reported" ? ["URCR_reportedValue"] : ["URCR_uricAcid", "URCR_creatinine"];
    const fail = (errorCode, error, blocked = false) => ({ ok: false, valid: false, rawValue: null, value: null, unit: UNIT, exactMain: null, input: data, requiredIds, missingIds, invalidIds, errorCode, error, blocked, cautions: [] });
    if (!safe) return fail("invalid-data", "Dane obliczenia mają nieprawidłowy format.");
    if (data.sameUrineSample === false) { invalidIds.push("URCR_sameUrineSample"); return fail("sample-conflict", "Stężenia pochodzą z różnych próbek moczu. Obliczenie i zapis wymagają zgodnej próbki.", true); }
    if (!["concentration", "reported"].includes(data.mode)) { invalidIds.push("URCR_inputMode"); return fail("invalid-mode", "Wybierz sposób podania wyniku."); }
    if (!["random", "timed", "unknown"].includes(data.specimen)) { invalidIds.push("URCR_specimen"); return fail("invalid-specimen", "Wybierz prawidłowy rodzaj próbki moczu."); }
    const ids = { uricAcid: "URCR_uricAcid", creatinine: "URCR_creatinine", reportedValue: "URCR_reportedValue" };
    const labels = { uricAcid: "kwas moczowy w moczu", creatinine: "kreatynina w moczu", reportedValue: "gotowy wynik KM/Cr" };
    function field(key, positive) {
      if (absent(data[key])) { missingIds.push(ids[key]); problems.push({ code: "missing-" + key, message: "Uzupełnij pole: " + labels[key] + ".", missing: true }); return null; }
      const parsed = parseValue(data[key]), quantity = parsed && fromExact(parsed.exact);
      if (!parsed?.representable || !quantity || quantity.n < 0n || positive && quantity.n === 0n) {
        invalidIds.push(ids[key]);
        const operator = /[<>≤≥]/.test(String(data[key]));
        problems.push({ code: "invalid-" + key, message: operator ? "Wynik z nierównością nie określa dokładnego stężenia. Nie wyliczamy z niego dokładnego KM/Cr." : "Sprawdź pole: " + labels[key] + (positive ? ". Wartość musi być skończona i większa od 0." : ". Wpisz nieujemną, skończoną liczbę.") });
        return null;
      }
      return quantity;
    }
    let quantity = null;
    if (data.mode === "concentration") {
      const uric = field("uricAcid", false), creatinine = field("creatinine", true);
      for (const key of ["uricAcid", "creatinine"]) if (!INPUT_UNITS.includes(data[key + "Unit"])) { invalidIds.push("URCR_" + key + "Unit"); problems.push({ code: "invalid-" + key + "-unit", message: "Wybierz prawidłową jednostkę stężenia: " + labels[key] + "." }); }
      if (!problems.length) quantity = divide(molar(uric, data.uricAcidUnit, MOLAR_MASSES.uricAcid), molar(creatinine, data.creatinineUnit, MOLAR_MASSES.creatinine));
    } else {
      const reported = field("reportedValue", false);
      if (!REPORTED_UNITS.includes(data.reportedUnit)) { invalidIds.push("URCR_reportedUnit"); problems.push({ code: "invalid-reported-unit", message: "Wybierz jednostkę gotowego wyniku KM/Cr." }); }
      if (!problems.length) {
        quantity = data.reportedUnit === "mg/g" ? divide(reported, fraction("1000")) : reported;
        if (data.reportedUnit !== UNIT) quantity = multiply(quantity, divide(fraction(MOLAR_MASSES.creatinine), fraction(MOLAR_MASSES.uricAcid)));
      }
    }
    if (data.outputUnit !== UNIT) { invalidIds.push("URCR_outputUnit"); problems.push({ code: "invalid-output-unit", message: "Wynik KM/Cr przedstawiamy w mmol/mmol." }); }
    if (problems.length) { const first = problems.find(problem => !problem.missing) || problems[0]; return fail(first.code, first.message); }
    const rawValue = numberOf(quantity);
    if (!finite(rawValue) || rawValue === 0 && quantity.n !== 0n) return fail("numeric-range", "Wynik wykracza poza bezpieczny zakres liczbowy. Sprawdź wartości i jednostki.");
    return { ok: true, valid: true, rawValue, value: rawValue, unit: UNIT, exactMain: exact(quantity), input: data, requiredIds, missingIds, invalidIds, errorCode: "", error: "", blocked: false, cautions: [] };
  }
  const localized = value => String(value).replace(".", ",");
  function selectedProfile(policy, age, precision) {
    if (!age?.lossless || age.value < 0 || precision === "completed-years" && !Number.isInteger(age.value)) return null;
    const value = fromExact(age.exact);
    const matches = policy.profiles.filter(profile => {
      const lower = compare(value, fraction(profile.ageLower)), upper = profile.ageUpper === null ? -1 : compare(value, fraction(profile.ageUpper));
      return (lower > 0 || lower === 0 && profile.ageLowerInclusive) && (upper < 0 || upper === 0 && profile.ageUpperInclusive) && (precision !== "completed-years" || profile.ageUpper === null || profile.ageUpper >= age.value + 1);
    });
    return matches.length === 1 ? matches[0] : null;
  }
  function presentation(model) {
    const shown = model.valid && compactQuantity(fromExact(model.exactMain)), reference = model.reference;
    const referenceValue = reference ? localized(reference.lower) + "–" + localized(reference.upper) : model.input.specimen === "timed" ? model.notes.timedTitle || "Brak normy DZM w aplikacji" : "Brak normy do porównania";
    return {
      ok: Boolean(shown), outputUnit: UNIT, valueText: shown?.text || "", unitText: UNIT, rawValue: shown?.value ?? null,
      referenceValue, referenceText: reference ? referenceValue + " " + UNIT : referenceValue,
      referenceLabel: reference ? "Norma dla wieku · " + reference.sourceLabel : "Norma dla wieku", referenceHint: reference?.sourceLabel || "",
      lower: reference?.lower ?? null, upper: reference?.upper ?? null, exactValue: model.exactMain, exactLower: reference?.exactLower ?? null, exactUpper: reference?.exactUpper ?? null,
      lowerInclusive: reference?.lowerInclusive ?? null, upperInclusive: reference?.upperInclusive ?? null,
      approximate: shown?.approximate || false, roundedDisplay: shown?.approximate || false, fullValueText: shown?.fullValueText || "", unroundedValueText: shown?.fullValueText || "", fullValueComplete: shown?.fullValueComplete ?? false,
      precision: 3, referenceApproximate: false, precisionNote: shown?.approximate ? model.notes.precision || "Znak ≈ oznacza skrócony zapis. Ocenę oparto na pełnej wartości." : "", statusText: model.statusText, interpretation: model.interpretation
    };
  }
  function compute(input, policy) {
    const result = numericResult(input), data = result.input, hasPolicy = validPolicy(policy), notes = hasPolicy ? copy(policy.notes) : {}, age = parseValue(data.ageYears);
    const eligible = hasPolicy ? selectedProfile(policy, age, data.agePrecision) : null, profile = result.valid && data.specimen === "random" ? eligible : null;
    let status = "unassessed", tone = "neutral", outOfRange = null, reference = null;
    let statusText = notes.noPolicyTitle || "Obliczony KM/Cr", interpretation = notes.noPolicy || "Nie dobrano właściwego zakresu laboratoryjnego. Wynik liczbowy pozostaje dostępny.";
    if (profile) {
      const lower = fraction(profile.lower), upper = fraction(profile.upper), amount = fromExact(result.exactMain), low = compare(amount, lower), high = compare(amount, upper);
      status = low < 0 || low === 0 && !profile.lowerInclusive ? "low" : high > 0 || high === 0 && !profile.upperInclusive ? "high" : "within";
      tone = status === "within" ? "normal" : "warning"; outOfRange = status !== "within";
      reference = {
        kind: "interval", profileId: profile.id, ruleId: policy.id + ":v" + policy.version, lower: profile.lower, upper: profile.upper, min: profile.lower, max: profile.upper,
        lowerInclusive: profile.lowerInclusive, upperInclusive: profile.upperInclusive, unit: UNIT, label: "Norma dla wieku", ageLabel: profile.label,
        text: localized(profile.lower) + "–" + localized(profile.upper), lowerText: localized(profile.lower), upperText: localized(profile.upper), exactLower: exact(lower), exactUpper: exact(upper),
        sourceId: profile.sourceId, sourceIds: profile.sourceIds || [profile.sourceId], sourceLabel: profile.sourceLabel, sourceAgeLabel: profile.sourceAgeLabel,
        population: profile.population, hint: profile.population, note: profile.population, method: profile.method, sample: profile.sample, specimen: profile.specimen, explanation: profile.explanation,
        sourceUnit: profile.unit, sourceText: profile.text, sourceLower: profile.lower, sourceUpper: profile.upper,
        ageLower: profile.ageLower, ageUpper: profile.ageUpper, ageLowerInclusive: profile.ageLowerInclusive, ageUpperInclusive: profile.ageUpperInclusive,
        agePolicy: policy.agePolicy || "", endpointPolicy: policy.endpointPolicy || ""
      };
      statusText = profile.titles[status]; interpretation = profile.copy[status];
    } else if (result.valid && data.specimen === "timed") interpretation = notes.timed || "Wynik ze zbiórki dobowej pozostaje bez automatycznej normy dla próbki jednorazowej.";
    else if (result.valid && data.specimen === "unknown") interpretation = notes.unknownSpecimen || "Rodzaj próbki nie jest ustalony. Wynik pozostaje bez automatycznej normy dla próbki jednorazowej.";
    else if (result.valid && (!age?.lossless || age.value < 0)) interpretation = notes.noAge || "Brak danych o wieku do dobrania normy. Wynik liczbowy pozostaje dostępny.";
    else if (result.valid && hasPolicy && !eligible) interpretation = notes.noProfile || interpretation;
    if (result.valid && fromExact(result.exactMain).n === 0n) {
      status = "zero"; tone = "neutral"; outOfRange = null;
      statusText = notes.zeroTitle || "Wartość zerowa — sprawdź raport";
      interpretation = notes.zero || "Sprawdź granicę oznaczalności laboratorium. Wynik „<…” nie oznacza dokładnego zera.";
    }
    const model = {
      ...result, schema: SCHEMA, version: 1, engineVersion: ENGINE_VERSION, outputUnit: UNIT, conversionPolicy: { id: "urate-creatinine-molar-masses", version: 1, ...MOLAR_MASSES },
      status, statusText: result.valid ? statusText : "", tone, assessment: ({ low: "below", high: "above", within: "within" })[status] || "unassessed", outOfRange, category: null,
      interpretation: result.valid ? interpretation : "", contextLabel: "Kwas moczowy/kreatynina — KM/Cr", reference, references: reference ? [copy(reference)] : [], referenceAvailable: Boolean(reference), referenceActive: Boolean(reference && status !== "zero"), referencePreview: Boolean(reference), biochemical: false, comparisonKind: "orientational",
      referenceLabel: "Norma dla wieku", referenceHint: reference?.sourceLabel || "", referenceText: reference?.text || "Brak normy do porównania", referenceRows: [], referenceTable: [],
      policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null, referencePolicy: hasPolicy ? copy(policy) : null,
      populationCategory: age?.lossless && age.value >= 0 ? age.value >= 18 ? "adult" : "child" : null, sources: hasPolicy ? copy(policy.sources) : [], educationalReferences: hasPolicy ? copy(policy.educationalReferences || []) : [], notes
    };
    model.presentation = presentation(model);
    model.display = { text: model.presentation.valueText, boundary: model.presentation.precisionNote };
    if (hasPolicy) model.referenceRows = policy.profiles.map(item => ({ profileId: item.id, label: item.label, text: localized(item.lower) + "–" + localized(item.upper), unit: UNIT, sourceId: item.sourceId, sourceLabel: item.sourceLabel, sourceAgeLabel: item.sourceAgeLabel, population: item.population, ageLower: item.ageLower, ageUpper: item.ageUpper, active: reference?.profileId === item.id }));
    model.referenceTable = copy(model.referenceRows);
    model.notes.sourceSummary = reference ? reference.sourceLabel + " · próbka jednorazowa" : "";
    model.notes.contextExplanation = profile?.explanation || model.interpretation;
    model.notes.fullValueText = model.presentation.fullValueText;
    model.notes.precisionNote = model.presentation.precisionNote;
    model.notes.formula = notes.formula || "KM/Cr = stężenie kwasu moczowego / stężenie kreatyniny po przeliczeniu obu stężeń na mmol/L.";
    model.notes.conversion = notes.conversion || "Masy molowe: kwas moczowy 168,11 g/mol; kreatynina 113,12 g/mol. mg/mg × 113,12/168,11 = mmol/mmol; mg/g dodatkowo dzielimy przez 1000.";
    model.notes.specimen = notes.specimen || "Norma kwalifikuje rodzaj próbki niezależnie od tego, że sam iloraz nie potrzebuje czasu ani objętości.";
    model.notes.limitations = notes.limitations || "Bez właściwego zakresu wynik pozostaje liczbowy, bez automatycznej oceny.";
    return freeze(model);
  }
  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (object(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function sanitizeSnapshot(snapshot) {
    if (!safeData(snapshot) || !object(snapshot) || snapshot.schema !== SCHEMA || snapshot.version !== 1 || snapshot.engineVersion !== ENGINE_VERSION || snapshot.valid !== true || snapshot.ok !== true || !object(snapshot.input) || !own(snapshot.input, "specimen")) return null;
    const expected = compute(snapshot.input, snapshot.referencePolicy);
    if (!expected.valid || !Object.keys(expected).every(key => own(snapshot, key) && stable(snapshot[key]) === stable(expected[key]))) return null;
    return expected;
  }
  return Object.freeze({ ENGINE_VERSION, SCHEMA, UNIT, MOLAR_MASSES, DEFAULTS, FIELD_IDS, CONTEXT_FIELD_IDS, INPUT_UNITS, REPORTED_UNITS, parseValue, formatValue, fullValueText, inputFromValues, readReferenceContext, readInputFromDocument, validPolicy, compute, evaluate: compute, calculate: compute, presentation, sanitizeSnapshot });
});
