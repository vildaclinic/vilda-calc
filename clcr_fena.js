(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrFena = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const ENGINE_VERSION = 1;
  // Physical conversion retained from the existing production FE calculation.
  // It is independent of the optional, injected clinical display policy.
  const CONVERSION_CONSTANTS = Object.freeze({ creatinineUmolPerMgDl: "88.4", version: 1 });
  const ERRORS = Object.freeze({
    "different-specimens": "Użyj oznaczeń z tej samej próbki moczu i równocześnie pobranej próbki krwi. Wpisane wartości pozostają w formularzu.",
    "missing-concentration": "Wpisz sód i kreatyninę w moczu oraz w surowicy. Potrzebne są cztery stężenia.",
    "invalid-concentration": "Sód w moczu może wynosić zero. Sód w surowicy oraz obie wartości kreatyniny muszą być dodatnie i skończone.",
    "invalid-unit": "Wybierz jednostkę kreatyniny: mg/dL, µmol/L lub mmol/L. Sód w obu próbkach podaj w mmol/L.",
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
  function numberOf(value) {
    const n = Number(value.n), d = Number(value.d);
    if (Number.isFinite(n) && Number.isFinite(d)) return n / d;
    const ns = value.n.toString(), ds = value.d.toString();
    const nm = Number(ns.slice(0, 17)) / 10 ** (Math.min(ns.length, 17) - 1);
    const dm = Number(ds.slice(0, 17)) / 10 ** (Math.min(ds.length, 17) - 1);
    // A single scientific conversion avoids overflow/underflow in 10**exponent
    // before a mathematically finite (including subnormal) result is obtained.
    return Number(`${nm / dm}e${ns.length - ds.length}`);
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
  function inputData(input) {
    input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
      urineSodium: input.urineSodium ?? input.urineAnalyte ?? "",
      serumSodium: input.serumSodium ?? input.serumAnalyte ?? "",
      urineCreatinine: input.urineCreatinine ?? "", urineCreatinineUnit: input.urineCreatinineUnit ?? "",
      serumCreatinine: input.serumCreatinine ?? "", serumCreatinineUnit: input.serumCreatinineUnit ?? "",
      ageYears: typeof input.ageYears === "number" && Number.isFinite(input.ageYears) && input.ageYears >= 0 ? input.ageYears : null,
      sameUrineSpecimen: sampleState(input.sameUrineSpecimen), pairedSameTime: sampleState(input.pairedSameTime),
      diureticUse: fact(Object.hasOwn(input, "diureticUse") ? input.diureticUse : input.knownFacts?.diureticUse), knownCKD: fact(Object.hasOwn(input, "knownCKD") ? input.knownCKD : input.knownFacts?.knownCKD),
    };
  }
  function exactOf(value) {
    if (!value || typeof value.numerator !== "string" || typeof value.denominator !== "string" || !/^\d+$/.test(value.numerator) || !/^[1-9]\d*$/.test(value.denominator)) return null;
    if (value.numerator.length > 6000 || value.denominator.length > 6000) return null;
    return fraction(BigInt(value.numerator), BigInt(value.denominator));
  }
  function compactDecimal(value, digits) {
    const scientific = value < 0.0001 || value >= 1000000;
    const text = scientific ? value.toExponential(digits - 1) : value.toFixed(Math.max(0, digits - 1 - Math.floor(Math.log10(value))));
    const parts = text.split("e");
    const main = parts[0].includes(".") ? parts[0].replace(/0+$/, "").replace(/\.$/, "") : parts[0];
    return parts[1] ? `${main}e${Number(parts[1])}` : main;
  }
  function formattedValue(value, exactValue, thresholds = []) {
    if (!Number.isFinite(value) || value < 0) return { text: "", boundary: "" };
    if (value === 0) return { text: "0", boundary: "" };
    const exact = exactOf(exactValue);
    const checks = thresholds.map(item => parseValue(item)).filter(Boolean).map(item => item.exact);
    let text = "";
    for (let digits = 4; digits <= 17; digits += 1) {
      text = compactDecimal(value, digits);
      const rounded = decimalFraction(text);
      if (!exact || checks.every(threshold => compare(exact, threshold) === compare(rounded, threshold))) return { text: text.replace(".", ","), boundary: "" };
    }
    // Inputs may encode a difference smaller than Number's resolution. Preserve
    // the exact relation instead of displaying a value equal to the other band.
    const rounded = decimalFraction(text);
    const crossed = checks.find(threshold => compare(exact, threshold) !== compare(rounded, threshold));
    if (crossed) {
      const limit = numberOf(crossed), relation = compare(exact, crossed) < 0 ? "<" : ">";
      return { text: `${relation}${String(limit).replace(".", ",")}`, boundary: "Dokładna relacja do progu jest zachowana; pełny iloraz wyniku pozostaje w szczegółach zapisu." };
    }
    return { text: text.replace(".", ","), boundary: "" };
  }
  function formatValue(value, exactValue, thresholds) { return formattedValue(value, exactValue, thresholds).text; }
  function compute(input) {
    const data = inputData(input);
    const fail = code => freeze({ ok: false, valid: false, valuePct: null, rawValue: null, errorCode: code, error: ERRORS[code], input: data });
    if (data.sameUrineSpecimen === "different" || data.pairedSameTime === "different") return fail("different-specimens");
    const fields = [data.urineSodium, data.serumSodium, data.urineCreatinine, data.serumCreatinine];
    if (fields.some(absent)) return fail("missing-concentration");
    const values = fields.map(parseValue);
    if (values.some(value => !value) || values.slice(1).some(value => value.value <= 0)) return fail("invalid-concentration");
    const urineFactor = creatinineFactor(data.urineCreatinineUnit), serumFactor = creatinineFactor(data.serumCreatinineUnit);
    if (!urineFactor || !serumFactor || input?.urineSodiumUnit != null && !["mmol/l", "meq/l"].includes(unitKey(input.urineSodiumUnit)) || input?.serumSodiumUnit != null && !["mmol/l", "meq/l"].includes(unitKey(input.serumSodiumUnit))) return fail("invalid-unit");
    const [uNa, sNa, uCr, sCr] = values.map(value => value.exact);
    const exact = times(fraction(100n), over(times(uNa, times(sCr, serumFactor)), times(sNa, times(uCr, urineFactor))));
    const valuePct = numberOf(exact);
    if (!Number.isFinite(valuePct) || valuePct < 0 || exact.n > 0n && valuePct === 0) return fail("numeric-range");
    const exactValue = { numerator: String(exact.n), denominator: String(exact.d) };
    return freeze({ ok: true, valid: true, valuePct, rawValue: valuePct, unit: "%", exactValue, display: formattedValue(valuePct, exactValue), input: data, errorCode: "", error: "" });
  }
  function validPolicy(policy) {
    return policy?.quantity === "fractional-excretion-sodium" && policy.unit === "%" && typeof policy.id === "string" && Number.isInteger(policy.version) &&
      policy.referenceKind === "conditional-aki-helper" && Number.isFinite(policy.population?.minimumAgeYears) && policy.population.minimumAgeYears >= 0 &&
      parseValue(policy.thresholds?.low)?.value > 0 && parseValue(policy.thresholds?.high)?.value > parseValue(policy.thresholds?.low)?.value && policy.thresholds.lowInclusive === false && policy.thresholds.highInclusive === false &&
      Array.isArray(policy.sources) && policy.sources.length > 0 && policy.sources.every(source => typeof source.id === "string" && typeof source.label === "string" && typeof source.url === "string") &&
      policy.notes && ["low", "middle", "high", "child", "unknown", "diuretic", "ckd", "both", "referenceLabel", "educationalReferenceLabel"].every(key => typeof policy.notes[key] === "string");
  }
  function evaluate(input, policy) {
    const result = compute(input), data = result.input;
    const hasPolicy = validPolicy(policy);
    const knownFacts = { diureticUse: data.diureticUse, knownCKD: data.knownCKD };
    const adult = hasPolicy && data.ageYears !== null && data.ageYears >= policy.population.minimumAgeYears;
    const child = hasPolicy && data.ageYears !== null && data.ageYears < policy.population.minimumAgeYears;
    const confounded = knownFacts.diureticUse === true || knownFacts.knownCKD === true;
    const context = adult && confounded ? "confounders" : adult ? "adult" : child ? "child" : "unknown";
    const referenceAvailable = Boolean(result.ok && adult);
    const snapshot = {
      schema: "clcr-fena", version: 1, engineVersion: ENGINE_VERSION,
      valid: result.ok, rawValue: result.valuePct, unit: "%", exactValue: result.exactValue || null,
      input: copy(data), display: result.display || { text: "", boundary: "" },
      status: "unassessed", tone: "neutral", category: null, helperBand: null,
      context, label: "FENa", referenceAvailable, reference: null,
      errorCode: result.errorCode, error: result.error, interpretation: "",
      sample: { sameUrineSpecimen: data.sameUrineSpecimen, pairedSameTime: data.pairedSameTime }, knownFacts,
      policy: hasPolicy ? { id: policy.id, version: policy.version } : null,
      educationalThresholds: hasPolicy ? { low: Number(policy.thresholds.low), high: Number(policy.thresholds.high), lowInclusive: false, highInclusive: false } : null,
      population: hasPolicy ? copy(policy.population) : null,
      sources: hasPolicy ? copy(policy.sources) : [],
      conversion: copy(CONVERSION_CONSTANTS), restrictions: hasPolicy ? copy(policy.restrictions) : {},
      notes: hasPolicy ? copy(policy.notes) : {},
    };
    if (!result.ok) return freeze(snapshot);
    if (hasPolicy) {
      const exact = exactOf(result.exactValue), lower = parseValue(policy.thresholds.low).exact, upper = parseValue(policy.thresholds.high).exact;
      const band = compare(exact, lower) < 0 ? "low" : compare(exact, upper) > 0 ? "high" : "middle";
      snapshot.display = formattedValue(result.valuePct, result.exactValue, [policy.thresholds.low, policy.thresholds.high]);
      if (adult) {
        snapshot.helperBand = confounded ? null : band;
        snapshot.reference = { kind: policy.referenceKind, label: confounded ? policy.notes.educationalReferenceLabel : policy.notes.referenceLabel,
          text: `<${policy.thresholds.low}% / >${policy.thresholds.high}%`, low: Number(policy.thresholds.low), high: Number(policy.thresholds.high),
          lowInclusive: false, highInclusive: false, active: !confounded, sourceIds: policy.sources.slice(0, 2).map(source => source.id), population: copy(policy.population) };
      }
      snapshot.interpretation = adult && confounded ? policy.notes[knownFacts.diureticUse === true && knownFacts.knownCKD === true ? "both" : knownFacts.diureticUse === true ? "diuretic" : "ckd"] : adult ? policy.notes[band] : child ? policy.notes.child : policy.notes.unknown;
    } else snapshot.interpretation = "Nie dobrano polityki pomocniczej interpretacji. FENa wymaga oceny w kontekście klinicznym.";
    return freeze(snapshot);
  }
  function readInputFromDocument(documentRef) {
    const doc = documentRef || root?.document || null;
    const control = id => doc?.getElementById(id);
    const value = (id, fallback = "") => control(id) ? control(id).value : fallback;
    const yearsText = value("age"), monthsText = value("ageMonths");
    const years = Number(yearsText), months = absent(monthsText) ? 0 : Number(monthsText);
    // No age is required for the number. Completed years and optional months
    // suffice to choose the adult display policy; retained day-of-life is unused.
    const ageYears = !absent(yearsText) && Number.isInteger(years) && years >= 0 && years <= 120 && Number.isInteger(months) && months >= 0 && months <= 11 && years * 12 + months <= 1440 ? years + months / 12 : null;
    const answerValue = id => {
      const key = `ui_${id}_answer`;
      const answerControl = control(key);
      if (answerControl) return answerControl.value;
      // The simplified form does not mount routine tri-state questions. Their
      // restored explicit facts still live in the current session value vault.
      const vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault;
      return vault && Object.prototype.hasOwnProperty.call(vault, key) ? vault[key] : "";
    };
    const knownFact = id => {
      const answer = answerValue(id);
      if (answer === "yes") return true;
      if (answer === "no") return false;
      if (answer === "unknown") return null;
      return control(id)?.checked ? true : null;
    };
    const legacyPair = id => {
      const answer = answerValue(id);
      if (answer === "no") return "different";
      if (answer === "unknown") return "assumed";
      return answer === "yes" || control(id)?.checked ? "confirmed" : "assumed";
    };
    const sampleStatus = value("FENa_sample_status");
    let sameUrineSpecimen = legacyPair("spotSameSpecimen"), pairedSameTime = legacyPair("spotPairedChemistry");
    // A known contradictory legacy answer cannot be overwritten by a routine
    // default or stale hidden confirmation. UI correction updates the facts.
    if (sampleStatus === "different-urine") sameUrineSpecimen = "different";
    if (sampleStatus === "different-time") pairedSameTime = "different";
    if (sampleStatus === "confirmed") {
      if (sameUrineSpecimen !== "different") sameUrineSpecimen = "confirmed";
      if (pairedSameTime !== "different") pairedSameTime = "confirmed";
    }
    return {
      urineSodium: value("U_Na_spot"), serumSodium: value("S_Na_spot"),
      urineCreatinine: value("Ucr_spot"), urineCreatinineUnit: value("Ucr_spot_unit", "mg/dl"),
      serumCreatinine: value("Scr_spot"), serumCreatinineUnit: value("Scr_spot_unit", "mg/dl"),
      ageYears, sameUrineSpecimen, pairedSameTime,
      diureticUse: knownFact("spotDiureticUse"), knownCKD: knownFact("spotKnownCKD"),
    };
  }
  return Object.freeze({ ENGINE_VERSION, CONVERSION_CONSTANTS, compute, evaluate, formatValue, readInputFromDocument });
});
