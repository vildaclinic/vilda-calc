(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrUag = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1;
  const FIELD_IDS = Object.freeze(["U_Na_spot", "U_K_spot", "U_Cl_spot", "spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotPairedChemistry", "ui_spotPairedChemistry_answer", "FENa_sample_status", "spotKnownCKD", "ui_spotKnownCKD_answer", "suspectedAKI", "ui_suspectedAKI_answer", "creatinineState", "spotNagmaContext", "ui_spotNagmaContext_answer"]);
  const SAMPLE_FIELDS = FIELD_IDS.slice(3, 8);
  const ERRORS = Object.freeze({
    "different-specimens": "Użyj trzech oznaczeń z tej samej próbki moczu. Wpisane wartości pozostają w formularzu.",
    "missing-concentration": "Wpisz sód, potas i chlorki w moczu. Potrzebne są trzy stężenia.",
    "invalid-concentration": "Stężenia sodu, potasu i chlorków muszą być nieujemnymi, skończonymi liczbami. Zero jest dopuszczalne.",
    "numeric-range": "Tego zestawu stężeń nie można przedstawić jako skończonego wyniku z zachowaniem znaku. Sprawdź wpisane wartości.",
  });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const fact = value => typeof value === "boolean" ? value : null;
  const absent = value => value == null || typeof value === "string" && value.trim() === "";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function copy(value) { if (Array.isArray(value)) return value.map(copy); if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])); return value; }
  function fraction(n, d = 1n) {
    if (n === 0n) return { n: 0n, d: 1n };
    let a = n < 0n ? -n : n, b = d;
    while (b) { const rest = a % b; a = b; b = rest; }
    return { n: n / a, d: d / a };
  }
  function parseValue(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).trim().replace(",", ".");
    if (!text || text.length > 512) return null;
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0), number = Number(text);
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000 || !Number.isFinite(number) || number < 0) return null;
    let numerator = BigInt((match[2] || "0") + (match[3] || ""));
    if (match[1] === "-") numerator = -numerator;
    if (numerator < 0n || number === 0 && numerator !== 0n) return null;
    const scale = (match[3] || "").length - exponent;
    return { value: Object.is(number, -0) ? 0 : number, text, exact: scale >= 0 ? fraction(numerator, 10n ** BigInt(scale)) : fraction(numerator * 10n ** BigInt(-scale)) };
  }
  function exactOf(value) {
    if (!object(value) || typeof value.numerator !== "string" || typeof value.denominator !== "string" || value.numerator.length > 6000 || value.denominator.length > 6000 || !/^-?\d+$/.test(value.numerator) || !/^[1-9]\d*$/.test(value.denominator)) return null;
    return fraction(BigInt(value.numerator), BigInt(value.denominator));
  }
  function absolute(value) { return { n: value.n < 0n ? -value.n : value.n, d: value.d }; }
  function exponentOf(value) {
    let exponent = value.n.toString().length - value.d.toString().length;
    if (exponent >= 0 ? value.n < value.d * 10n ** BigInt(exponent) : value.n * 10n ** BigInt(-exponent) < value.d) exponent -= 1;
    return exponent;
  }
  function significant(value, digits) {
    let exponent = exponentOf(value);
    const scale = digits - 1 - exponent;
    const n = scale >= 0 ? value.n * 10n ** BigInt(scale) : value.n;
    const d = scale >= 0 ? value.d : value.d * 10n ** BigInt(-scale);
    let rounded = n / d;
    if (2n * (n % d) >= d) rounded += 1n;
    if (rounded >= 10n ** BigInt(digits)) { rounded /= 10n; exponent += 1; }
    return { digits: String(rounded).padStart(digits, "0"), exponent };
  }
  function scientific(parts) { const tail = parts.digits.slice(1).replace(/0+$/, ""); return `${parts.digits[0]}${tail ? "." + tail : ""}e${parts.exponent}`; }
  function numberOf(value) { return value.n === 0n ? 0 : Number((value.n < 0n ? "-" : "") + scientific(significant(absolute(value), 25))); }
  function ordinary(parts) {
    const point = parts.exponent + 1;
    const text = point <= 0 ? "0." + "0".repeat(-point) + parts.digits : point >= parts.digits.length ? parts.digits + "0".repeat(point - parts.digits.length) : parts.digits.slice(0, point) + "." + parts.digits.slice(point);
    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  }
  function formatValue(value, exactValue) {
    if (!Number.isFinite(value)) return "";
    if (value === 0) return "0";
    const exact = exactOf(exactValue) || (() => { const parsed = parseValue(Math.abs(value)); return parsed ? { n: value < 0 ? -parsed.exact.n : parsed.exact.n, d: parsed.exact.d } : null; })();
    if (!exact || exact.n === 0n || Math.sign(numberOf(exact)) !== Math.sign(value)) return "";
    const parts = significant(absolute(exact), 8);
    const text = parts.exponent < -4 || parts.exponent >= 8 ? scientific(parts) : ordinary(parts);
    return (exact.n < 0n ? "-" : "+") + text.replace(".", ",");
  }
  function safeEvidence(source) {
    const evidence = {};
    for (const id of SAMPLE_FIELDS) if (own(source, id)) {
      const value = source[id];
      if (value == null || typeof value === "boolean" || typeof value === "string" && value.length <= 128) evidence[id] = value ?? null;
    }
    return evidence;
  }
  function sampleFromEvidence(evidence) {
    const answer = evidence.ui_spotSameSpecimen_answer;
    if (answer === "no" || evidence.FENa_sample_status === "different-urine") return "different";
    // A retained explicit unknown cannot be promoted to confirmed by an older flag.
    if (answer === "unknown") return "assumed";
    const legacyPairedProof = evidence.spotPairedChemistry === true && !["no", "unknown"].includes(evidence.ui_spotPairedChemistry_answer);
    if (evidence.spotSameSpecimen === true || evidence.FENa_sample_status === "confirmed" || legacyPairedProof) return "confirmed";
    // An answer may be derived presentation. Preserve it, but do not manufacture
    // the absent checkbox or legacy proof from that presentation alone.
    return "assumed";
  }
  function sampleState(value) {
    if ([false, "no", "different", "different-urine"].includes(value)) return "different";
    if ([true, "yes", "confirmed"].includes(value)) return "confirmed";
    return "assumed";
  }
  function inputData(input) {
    const data = object(input) ? input : {};
    const evidence = safeEvidence(data.sampleEvidence || data.sample?.evidence || {});
    const inferred = sampleFromEvidence(evidence), stated = sampleState(data.sameUrineSpecimen);
    const known = key => fact(own(data, key) ? data[key] : data.knownFacts?.[key]);
    const measurement = (key, alias) => {
      const value = own(data, key) ? data[key] : own(data, alias) ? data[alias] : "";
      // Invalid input still produces a serializable, finite-depth error snapshot.
      // Preserve primitive entries; an object/BigInt is never a measurement.
      return value == null || ["string", "number", "boolean"].includes(typeof value) ? value ?? null : "[invalid measurement]";
    };
    return {
      urineSodium: measurement("urineSodium", "sodium"), urinePotassium: measurement("urinePotassium", "potassium"), urineChloride: measurement("urineChloride", "chloride"),
      sameUrineSpecimen: inferred === "different" || stated === "different" ? "different" : Object.keys(evidence).length ? inferred : stated,
      sampleEvidence: evidence, knownCKD: known("knownCKD"), knownAKI: known("knownAKI"), rapidlyChangingCreatinine: known("rapidlyChangingCreatinine"), nagmaContext: known("nagmaContext"),
    };
  }
  function inputFromValues(values) {
    const data = object(values) ? values : {};
    const value = id => own(data, id) ? data[id] : "";
    const known = id => {
      const answer = value(`ui_${id}_answer`);
      if (answer === "yes") return true;
      if (answer === "no") return false;
      if (answer === "unknown") return null;
      return value(id) === true ? true : null;
    };
    const evidence = safeEvidence(data), state = value("creatinineState");
    return {
      urineSodium: value("U_Na_spot"), urinePotassium: value("U_K_spot"), urineChloride: value("U_Cl_spot"),
      sameUrineSpecimen: sampleFromEvidence(evidence), sampleEvidence: evidence,
      knownCKD: known("spotKnownCKD"), knownAKI: known("suspectedAKI"), nagmaContext: known("spotNagmaContext"),
      rapidlyChangingCreatinine: state === "rapidlyChanging" ? true : state === "stable" ? false : null,
    };
  }
  function readInputFromDocument(documentRef) {
    const doc = documentRef || root?.document;
    const vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {};
    const values = {};
    for (const id of FIELD_IDS) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" || control.type === "radio" ? control.checked === true : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    return inputFromValues(values);
  }
  function compute(input) {
    const data = inputData(input);
    const fail = code => freeze({ ok: false, valid: false, rawValue: null, value: null, exactValue: null, sign: null, unit: "mmol/L", errorCode: code, error: ERRORS[code], input: data });
    if (data.sameUrineSpecimen === "different") return fail("different-specimens");
    const fields = [data.urineSodium, data.urinePotassium, data.urineChloride];
    if (fields.some(absent)) return fail("missing-concentration");
    const parsed = fields.map(parseValue);
    if (parsed.some(value => !value)) return fail("invalid-concentration");
    const [a, b, c] = parsed.map(value => value.exact);
    const exact = fraction(a.n * b.d * c.d + b.n * a.d * c.d - c.n * a.d * b.d, a.d * b.d * c.d);
    const rawValue = numberOf(exact);
    if (!Number.isFinite(rawValue) || exact.n !== 0n && rawValue === 0) return fail("numeric-range");
    const exactValue = { numerator: String(exact.n), denominator: String(exact.d) };
    return freeze({ ok: true, valid: true, rawValue, value: rawValue, exactValue, sign: exact.n < 0n ? "negative" : exact.n > 0n ? "positive" : "zero", unit: "mmol/L", display: { text: formatValue(rawValue, exactValue), boundary: "" }, input: data, errorCode: "", error: "" });
  }
  function validPolicy(policy) {
    return policy?.quantity === "urine-anion-gap" && policy.unit === "mmol/L" && policy.referenceKind === "sign-boundary" && policy.signBoundary?.kind === "sign-boundary" && policy.signBoundary.value === 0 && policy.signBoundary.unit === "mmol/L" && typeof policy.id === "string" && Number.isInteger(policy.version) && Array.isArray(policy.profiles) && policy.profiles.length === 0 &&
      policy.population && typeof policy.population.label === "string" && Array.isArray(policy.sources) && policy.sources.length > 0 && policy.sources.every(source => source && ["id", "label", "url"].every(key => typeof source[key] === "string")) &&
      policy.notes && ["referenceLabel", "referenceText", "referenceHint", "negativeTitle", "positiveTitle", "zeroTitle", "negativeInterpretation", "positiveInterpretation", "zeroInterpretation", "ckdInterpretation", "lowSodiumInterpretation", "acuteInterpretation", "lowSodiumWarning", "ckdWarning", "akiWarning", "changingWarning", "sample", "scope", "noPolicy"].every(key => typeof policy.notes[key] === "string") &&
      Number.isFinite(policy.lowSodiumCaution?.upper) && policy.lowSodiumCaution.upper >= 0 && policy.lowSodiumCaution.upperInclusive === false && policy.lowSodiumCaution.unit === "mmol/L" && policy.lowSodiumCaution.kind === "method-limitation";
  }
  function evaluate(input, policy) {
    const result = compute(input), data = result.input, hasPolicy = validPolicy(policy), notes = hasPolicy ? policy.notes : {};
    const sodium = parseValue(data.urineSodium);
    const threshold = hasPolicy ? parseValue(policy.lowSodiumCaution.upper) : null;
    const lowUrineSodium = sodium && threshold ? sodium.exact.n * threshold.exact.d < threshold.exact.n * sodium.exact.d : null;
    const knownFacts = { knownCKD: data.knownCKD, knownAKI: data.knownAKI, rapidlyChangingCreatinine: data.rapidlyChangingCreatinine, nagmaContext: data.nagmaContext, lowUrineSodium };
    const cautions = hasPolicy ? [data.knownCKD === true ? notes.ckdWarning : "", data.knownAKI === true ? notes.akiWarning : "", data.rapidlyChangingCreatinine === true ? notes.changingWarning : "", lowUrineSodium === true ? notes.lowSodiumWarning : ""].filter(Boolean) : [];
    const context = data.knownCKD === true ? "ckd" : lowUrineSodium === true ? "low-urine-sodium" : data.knownAKI === true || data.rapidlyChangingCreatinine === true ? "acute-kidney-context" : "conditional-nagma";
    const interpretation = !result.valid ? "" : !hasPolicy ? "Sam znak UAG nie ocenia prawidłowości wydalania amonu. Nie dobrano polityki opisu wyniku."
      : context === "ckd" ? notes.ckdInterpretation : context === "low-urine-sodium" ? notes.lowSodiumInterpretation : context === "acute-kidney-context" ? notes.acuteInterpretation : notes[`${result.sign}Interpretation`];
    const reference = hasPolicy ? { kind: policy.signBoundary.kind, value: policy.signBoundary.value, unit: policy.signBoundary.unit, label: notes.referenceLabel, text: notes.referenceText, sourceIds: [] } : null;
    return freeze({
      schema: "clcr-uag", version: 1, engineVersion: ENGINE_VERSION, valid: result.valid, rawValue: result.rawValue, unit: "mmol/L", exactValue: result.exactValue, sign: result.sign,
      input: copy(data), display: result.display || { text: "", boundary: "" }, status: "unassessed", statusText: result.valid ? hasPolicy ? notes[`${result.sign}Title`] : "Luka anionowa moczu" : "", tone: "neutral", outOfRange: null, category: null,
      context, knownFacts, cautions, interpretation, sample: { sameUrineSpecimen: data.sameUrineSpecimen, evidence: copy(data.sampleEvidence) },
      referenceAvailable: Boolean(reference), referenceActive: false, reference, references: reference ? [copy(reference)] : [],
      referenceLabel: hasPolicy ? notes.referenceLabel : "Punkt odniesienia", referenceText: hasPolicy ? notes.referenceText : "Brak profilu porównania", referenceHint: hasPolicy ? notes.referenceHint : "",
      policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null,
      sources: hasPolicy ? copy(policy.sources) : [], educationalReferences: hasPolicy ? copy(policy.educationalReferences || []) : [], restrictions: hasPolicy ? copy(policy.restrictions || {}) : {}, notes: hasPolicy ? copy(notes) : {},
      errorCode: result.errorCode, error: result.error,
    });
  }
  return Object.freeze({ ENGINE_VERSION, FIELD_IDS, ERRORS, compute, evaluate, formatValue, parseValue, inputFromValues, readInputFromDocument });
});
