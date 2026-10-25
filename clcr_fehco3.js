(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrFehco3 = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const ENGINE_VERSION = 1;
  // Physical conversion retained from the existing production FE calculation.
  // It is independent of the optional, injected clinical display policy.
  const CONVERSION_CONSTANTS = Object.freeze({ creatinineUmolPerMgDl: "88.4", version: 1 });
  const ERRORS = Object.freeze({
    "different-specimens": "Użyj oznaczeń z tej samej próbki moczu i równocześnie pobranej próbki krwi. Wpisane wartości pozostają w formularzu.",
    "missing-concentration": "Wpisz wodorowęglany i kreatyninę w moczu oraz we krwi. Potrzebne są cztery stężenia.",
    "invalid-concentration": "Stężenie wodorowęglanów w moczu może wynosić zero. Wodorowęglany we krwi oraz obie wartości kreatyniny muszą być dodatnie i skończone.",
    "invalid-unit": "Wybierz jednostkę kreatyniny: mg/dL, µmol/L lub mmol/L. Wodorowęglany w obu próbkach podaj w mmol/L.",
    "numeric-range": "Tego zestawu stężeń nie można przedstawić jako skończonego wyniku. Sprawdź wartości oraz jednostki.",
  });
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    return value;
  }
  function absent(value) { return value == null || typeof value === "string" && value.trim() === ""; }
  function fraction(n, d = 1n) {
    if (n === 0n) return { n: 0n, d: 1n };
    let a = n, b = d;
    while (b) { const rest = a % b; a = b; b = rest; }
    return { n: n / a, d: d / a };
  }
  function decimalFraction(text) {
    const match = String(text).match(/^\+?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!match || !(match[1] || match[2])) return null;
    const exponent = Number(match[3] || 0);
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000) return null;
    const n = BigInt((match[1] || "0") + (match[2] || ""));
    const scale = (match[2] || "").length - exponent;
    return scale >= 0 ? fraction(n, 10n ** BigInt(scale)) : fraction(n * 10n ** BigInt(-scale));
  }
  function times(a, b) { return fraction(a.n * b.n, a.d * b.d); }
  function over(a, b) { return b.n === 0n ? null : fraction(a.n * b.d, a.d * b.n); }
  function compare(a, b) { const diff = a.n * b.d - b.n * a.d; return diff < 0n ? -1 : diff > 0n ? 1 : 0; }
  function exponentOf(value) {
    let exponent = value.n.toString().length - value.d.toString().length;
    if (exponent >= 0 ? value.n < value.d * 10n ** BigInt(exponent) : value.n * 10n ** BigInt(-exponent) < value.d) exponent -= 1;
    return exponent;
  }
  function significantDecimal(value, digits) {
    if (value.n === 0n) return { digits: "0", exponent: 0 };
    let exponent = exponentOf(value);
    const scale = digits - 1 - exponent;
    const numerator = scale >= 0 ? value.n * 10n ** BigInt(scale) : value.n;
    const denominator = scale >= 0 ? value.d : value.d * 10n ** BigInt(-scale);
    let rounded = numerator / denominator;
    if (2n * (numerator % denominator) >= denominator) rounded += 1n;
    if (rounded >= 10n ** BigInt(digits)) { rounded /= 10n; exponent += 1; }
    return { digits: String(rounded).padStart(digits, "0"), exponent };
  }
  function scientificText(parts) {
    const rest = parts.digits.slice(1).replace(/0+$/, "");
    return `${parts.digits[0]}${rest ? "." + rest : ""}e${parts.exponent}`;
  }
  function numberOf(value) {
    if (value.n === 0n) return 0;
    // Convert the exact quotient once. Intermediate products and powers never
    // enter Number, so a finite result survives otherwise overflowing products.
    return Number(scientificText(significantDecimal(value, 25)));
  }
  function parseValue(input) {
    if (typeof input !== "string" && typeof input !== "number") return null;
    const text = String(input).trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
    if (text.length > 256 || text === "") return null;
    const exact = decimalFraction(text), value = Number(text);
    if (!exact || !Number.isFinite(value) || value < 0 || value === 0 && exact.n !== 0n) return null;
    return { value, text, exact };
  }
  function unitKey(unit) { return typeof unit === "string" ? unit.trim().replace(/[µμ]/g, "u").toLowerCase() : ""; }
  function creatinineFactor(unit) {
    switch (unitKey(unit)) {
      case "mg/dl": return fraction(1n);
      case "mg/l": return fraction(1n, 10n);
      case "umol":
      case "umol/l": return fraction(5n, 442n);
      case "mmol":
      case "mmol/l": return fraction(2500n, 221n);
      default: return null;
    }
  }
  function sampleState(value) {
    if (value === false || value === "no" || value === "different") return "different";
    if (value === true || value === "yes" || value === "confirmed") return "confirmed";
    return "assumed";
  }
  function fact(value) { return typeof value === "boolean" ? value : null; }
  // A direct numeric age is an explicitly supplied point. Document ages are
  // completed years/months, so their resolution is retained as an interval.
  function ageData(input) {
    const source = input.ageContext;
    const point = typeof input.ageYears === "number" && Number.isFinite(input.ageYears) && input.ageYears >= 0 && input.ageYears <= 120 ? input.ageYears : null;
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const ageContext = {};
      for (const key of ["valid", "years", "months", "daysOfLife", "totalMonths", "exactYears", "precision", "minimumMonths", "maximumMonths", "maximumExclusive", "rawYears", "rawMonths", "rawDays"]) {
        const value = source[key];
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) ageContext[key] = typeof value === "number" && !Number.isFinite(value) ? null : value;
      }
      if (source.valid !== true || !Number.isFinite(source.exactYears) || source.exactYears < 0 || source.exactYears > 120) return { ageYears: null, ageContext };
      const minimum = source.minimumMonths ?? source.exactYears * 12;
      const maximum = source.maximumMonths ?? minimum;
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum < minimum || maximum > 1452) return { ageYears: null, ageContext: { ...ageContext, valid: false } };
      return { ageYears: source.exactYears, ageContext: { ...ageContext, minimumMonths: minimum, maximumMonths: maximum, maximumExclusive: source.maximumExclusive === true } };
    }
    return { ageYears: point, ageContext: point === null ? null : { valid: true, exactYears: point, precision: "stated-point", minimumMonths: point * 12, maximumMonths: point * 12, maximumExclusive: false } };
  }
  function inputData(input) {
    input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const known = key => fact(Object.hasOwn(input, key) ? input[key] : input.knownFacts?.[key]);
    return {
      urineBicarbonate: input.urineBicarbonate ?? input.urineAnalyte ?? "",
      serumBicarbonate: input.serumBicarbonate ?? input.serumAnalyte ?? "",
      urineBicarbonateUnit: input.urineBicarbonateUnit ?? "mmol/L", serumBicarbonateUnit: input.serumBicarbonateUnit ?? "mmol/L",
      urineCreatinine: input.urineCreatinine ?? "", urineCreatinineUnit: input.urineCreatinineUnit ?? "",
      serumCreatinine: input.serumCreatinine ?? "", serumCreatinineUnit: input.serumCreatinineUnit ?? "",
      ...ageData(input),
      sameUrineSpecimen: sampleState(input.sameUrineSpecimen), pairedSameTime: sampleState(input.pairedSameTime),
      diureticUse: known("diureticUse"), knownCKD: known("knownCKD"), knownAKI: known("knownAKI"),
      rapidlyChangingCreatinine: known("rapidlyChangingCreatinine"), bicarbonateLoad: known("bicarbonateLoad"),
    };
  }
  function exactOf(value) {
    if (!value || typeof value.numerator !== "string" || typeof value.denominator !== "string" || !/^\d+$/.test(value.numerator) || !/^[1-9]\d*$/.test(value.denominator)) return null;
    if (value.numerator.length > 6000 || value.denominator.length > 6000) return null;
    return fraction(BigInt(value.numerator), BigInt(value.denominator));
  }
  function ordinaryText(parts) {
    const point = parts.exponent + 1;
    const text = point <= 0 ? "0." + "0".repeat(-point) + parts.digits
      : point >= parts.digits.length ? parts.digits + "0".repeat(point - parts.digits.length)
        : parts.digits.slice(0, point) + "." + parts.digits.slice(point);
    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  }
  function formattedValue(value, exactValue, presentationPoints = ["5", "15"]) {
    if (!Number.isFinite(value) || value < 0) return { text: "", boundary: "" };
    if (value === 0) return { text: "0", boundary: "" };
    const exact = exactOf(exactValue) || parseValue(value)?.exact;
    if (!exact || exact.n === 0n) return { text: "", boundary: "" };
    // These points protect fidelity of the written number only. Neither is a
    // healthy reference limit or an active classification threshold for spot FEHCO₃.
    const checks = Array.isArray(presentationPoints) ? presentationPoints.map(parseValue).filter(Boolean).map(item => item.exact) : [];
    let rounded, parts;
    for (let digits = 6; digits <= 8; digits += 1) {
      parts = significantDecimal(exact, digits);
      rounded = decimalFraction(scientificText(parts));
      if (checks.every(point => compare(exact, point) === compare(rounded, point))) break;
    }
    const crossed = checks.find(point => compare(exact, point) !== compare(rounded, point));
    if (crossed) return {
      text: `${compare(exact, crossed) < 0 ? "<" : ">"}${String(numberOf(crossed)).replace(".", ",")}`,
      boundary: "Znak zachowuje dokładną relację liczbową. Pełny iloraz pozostaje w szczegółach zapisu; nie jest to klasyfikacja FEHCO₃.",
    };
    const exponent = exponentOf(exact);
    return { text: (exponent < -4 || exponent >= 6 ? scientificText(parts) : ordinaryText(parts)).replace(".", ","), boundary: "" };
  }
  function formatValue(value, exactValue, presentationPoints) { return formattedValue(value, exactValue, presentationPoints).text; }
  function compute(input) {
    const data = inputData(input);
    const fail = code => freeze({ ok: false, valid: false, valuePct: null, rawValue: null, errorCode: code, error: ERRORS[code], input: data });
    if (data.sameUrineSpecimen === "different" || data.pairedSameTime === "different") return fail("different-specimens");
    const fields = [data.urineBicarbonate, data.serumBicarbonate, data.urineCreatinine, data.serumCreatinine];
    if (fields.some(absent)) return fail("missing-concentration");
    const values = fields.map(parseValue);
    if (values.some(value => !value) || values.slice(1).some(value => value.value <= 0)) return fail("invalid-concentration");
    const urineFactor = creatinineFactor(data.urineCreatinineUnit), serumFactor = creatinineFactor(data.serumCreatinineUnit);
    if (!urineFactor || !serumFactor || !["mmol/l", "meq/l"].includes(unitKey(data.urineBicarbonateUnit)) || !["mmol/l", "meq/l"].includes(unitKey(data.serumBicarbonateUnit))) return fail("invalid-unit");
    const [uHco3, sHco3, uCr, sCr] = values.map(value => value.exact);
    const exact = times(fraction(100n), over(times(uHco3, times(sCr, serumFactor)), times(sHco3, times(uCr, urineFactor))));
    const valuePct = numberOf(exact);
    if (!Number.isFinite(valuePct) || valuePct < 0 || exact.n > 0n && valuePct === 0) return fail("numeric-range");
    const exactValue = { numerator: String(exact.n), denominator: String(exact.d) };
    return freeze({ ok: true, valid: true, valuePct, rawValue: valuePct, unit: "%", exactValue, display: formattedValue(valuePct, exactValue), input: data, errorCode: "", error: "" });
  }
  function validPolicy(policy) {
    return policy?.quantity === "fractional-excretion-bicarbonate" && policy.unit === "%" && typeof policy.id === "string" && Number.isInteger(policy.version) &&
      policy.referenceKind === "no-verified-age-reference" && Array.isArray(policy.profiles) && policy.profiles.length === 0 &&
      policy.population && typeof policy.population.label === "string" && Array.isArray(policy.sources) && policy.sources.length > 0 &&
      policy.sources.every(source => source && ["id", "label", "url"].every(key => typeof source[key] === "string")) &&
      policy.diagnosticBands?.active === false && policy.diagnosticBands.referenceKind === "conditional-diagnostic-criteria" &&
      Array.isArray(policy.diagnosticBands.bands) && policy.diagnosticBands.bands.length > 0 &&
      policy.diagnosticBands.bands.every(band => band && typeof band.label === "string" && typeof band.text === "string") &&
      policy.notes && ["referenceLabel", "referenceText", "interpretation", "sample", "scope", "conversion", "diagnosis", "noPolicy"].every(key => typeof policy.notes[key] === "string");
  }
  function evaluate(input, policy) {
    const result = compute(input), data = result.input, hasPolicy = validPolicy(policy);
    const knownFacts = Object.fromEntries(["diureticUse", "knownCKD", "knownAKI", "rapidlyChangingCreatinine", "bicarbonateLoad"].map(key => [key, data[key]]));
    const labels = { diureticUse: "Znany diuretyk może wpływać na wynik.", knownCKD: "Znana PChN może wpływać na wynik.", knownAKI: "Podejrzenie AKI ogranicza interpretację wyniku.", rapidlyChangingCreatinine: "Szybko zmieniająca się kreatynina ogranicza interpretację wyniku.", bicarbonateLoad: "Znane podanie wodorowęglanu nie potwierdza osiągnięcia warunków protokołu testu." };
    const cautions = Object.entries(labels).filter(([key]) => knownFacts[key] === true).map(([, label]) => label);
    const snapshot = {
      schema: "clcr-fehco3", version: 1, engineVersion: ENGINE_VERSION, valid: result.ok, rawValue: result.valuePct, unit: "%", exactValue: result.exactValue || null,
      input: copy(data), display: result.display || { text: "", boundary: "" },
      status: "unassessed", statusText: "", tone: result.ok && cautions.length ? "warning" : "neutral", outOfRange: null, category: null,
      context: cautions.length ? "confounders" : "unassessed",
      referenceAvailable: false, referenceActive: false, reference: null, references: [], educationalReferences: [],
      referenceLabel: hasPolicy ? policy.notes.referenceLabel : "Norma dla wieku", referenceText: hasPolicy ? policy.notes.referenceText : "Brak normy do porównania", referenceHint: "",
      knownFacts, cautions, interpretation: result.ok ? hasPolicy ? policy.notes.interpretation : "Sam wynik nie potwierdza ani nie wyklucza proksymalnej kwasicy cewkowej. Interpretacja zależy od stężenia HCO₃⁻ we krwi i warunków badania." : "",
      sample: { sameUrineSpecimen: data.sameUrineSpecimen, pairedSameTime: data.pairedSameTime },
      protocol: { bicarbonateLoad: data.bicarbonateLoad, completion: "not-assessed", comparisonActive: false },
      policy: hasPolicy ? { id: policy.id, version: policy.version } : null,
      diagnosticBands: hasPolicy ? copy(policy.diagnosticBands || null) : null,
      population: hasPolicy ? copy(policy.population) : null, sources: hasPolicy ? copy(policy.sources) : [],
      conversion: copy(CONVERSION_CONSTANTS), restrictions: hasPolicy ? copy(policy.restrictions || {}) : {}, notes: hasPolicy ? copy(policy.notes) : {},
      errorCode: result.errorCode, error: result.error,
    };
    return freeze(snapshot);
  }
  function readInputFromDocument(documentRef) {
    const doc = documentRef || root?.document || null;
    const control = id => doc?.getElementById(id);
    const value = (id, fallback = "") => control(id) ? control(id).value : fallback;
    const clinical = doc?.defaultView?.ClcrClinicalSafety || root?.ClcrClinicalSafety;
    const rawYears = value("age"), rawMonths = value("ageMonths"), rawDays = value("ageDays");
    const parsedAge = clinical?.readAgeFromDocument?.(doc) || null;
    let ageContext = parsedAge ? copy(parsedAge) : { valid: false, exactYears: null };
    if (ageContext.valid) {
      const hasMonths = !absent(rawMonths), hasDays = !absent(rawDays) && ageContext.totalMonths === 0;
      const minimumMonths = hasDays ? ageContext.exactYears * 12 : ageContext.totalMonths;
      const maximumMonths = hasDays ? (Number(rawDays) + 1) * 12 / 365.2425 : hasMonths ? minimumMonths + 1 : minimumMonths + 12;
      ageContext = { ...ageContext, precision: hasDays ? "completed-days" : hasMonths ? "completed-months" : "completed-years", minimumMonths, maximumMonths, maximumExclusive: true };
    }
    ageContext = { ...ageContext, rawYears, rawMonths, rawDays };
    const vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault;
    const answerValue = id => {
      const key = `ui_${id}_answer`, answerControl = control(key);
      if (answerControl) return answerControl.value;
      return vault && Object.prototype.hasOwnProperty.call(vault, key) ? vault[key] : "";
    };
    const knownFact = id => {
      const answer = answerValue(id);
      if (answer === "yes") return true;
      if (answer === "no") return false;
      if (answer === "unknown") return null;
      const checkbox = control(id);
      return checkbox ? checkbox.checked ? true : null : vault?.[id] === true ? true : null;
    };
    const legacyPair = id => {
      const answer = answerValue(id);
      if (answer === "no") return "different";
      if (answer === "unknown") return "assumed";
      const checkbox = control(id);
      return answer === "yes" || (checkbox ? checkbox.checked : vault?.[id] === true) ? "confirmed" : "assumed";
    };
    const sampleStatus = value("FENa_sample_status", typeof vault?.FENa_sample_status === "string" ? vault.FENa_sample_status : "");
    let sameUrineSpecimen = legacyPair("spotSameSpecimen"), pairedSameTime = legacyPair("spotPairedChemistry");
    if (sampleStatus === "different-urine") sameUrineSpecimen = "different";
    if (sampleStatus === "different-time") pairedSameTime = "different";
    if (sampleStatus === "confirmed") {
      if (sameUrineSpecimen !== "different") sameUrineSpecimen = "confirmed";
      if (pairedSameTime !== "different") pairedSameTime = "confirmed";
    }
    const creatinineState = value("creatinineState", typeof vault?.creatinineState === "string" ? vault.creatinineState : "unknown");
    return {
      urineBicarbonate: value("U_HCO3_spot"), serumBicarbonate: value("S_HCO3_spot"),
      urineCreatinine: value("Ucr_spot"), urineCreatinineUnit: value("Ucr_spot_unit", "mg/dl"),
      serumCreatinine: value("Scr_spot"), serumCreatinineUnit: value("Scr_spot_unit", "mg/dl"),
      ageYears: ageContext.valid ? ageContext.exactYears : null, ageContext, sameUrineSpecimen, pairedSameTime,
      diureticUse: knownFact("spotDiureticUse"), knownCKD: knownFact("spotKnownCKD"), knownAKI: knownFact("suspectedAKI"),
      bicarbonateLoad: knownFact("spotBicarbonateLoad"),
      rapidlyChangingCreatinine: creatinineState === "rapidlyChanging" ? true : creatinineState === "stable" ? false : null,
    };
  }
  return Object.freeze({ ENGINE_VERSION, CONVERSION_CONSTANTS, compute, evaluate, formatValue, readInputFromDocument });
});
