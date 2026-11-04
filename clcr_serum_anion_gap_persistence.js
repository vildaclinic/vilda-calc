/* Frozen serum AG records. Reading verifies recorded arithmetic and policy,
 * without consulting today's clinical engine, source profile or patient. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrSerumAnionGapPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const FORMULA = "AGs", LABEL = "Luka anionowa surowicy (bez K)";
  const FIELD_MAP = Object.freeze({ S_Na: "sodiumValue", S_Cl: "chlorideValue", S_HCO3: "bicarbonateValue", AGS_albuminEnabled: "albuminEnabled", S_Albumin: "albuminValue", S_Albumin_unit: "albuminUnit" });
  const DEFAULTS = Object.freeze({ S_Na: "", S_Cl: "", S_HCO3: "", AGS_albuminEnabled: false, S_Albumin: "", S_Albumin_unit: "g/L" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/−/g, "-").replace(/,/g, ".");
  function safe(value, depth = 0) {
    if (value === null || typeof value === "boolean" || typeof value === "string" && value.length <= 20000 || finite(value)) return true;
    if (depth > 18 || !value || typeof value !== "object") return false;
    return Object.entries(value).length <= 1000 && Object.entries(value).every(([key, item]) => !["__proto__", "prototype", "constructor"].includes(key) && safe(item, depth + 1));
  }
  function decimal(value) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(/−/g, "-").replace(",", ".");
    if (!text || text.length > 4096) return null;
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    return { c: BigInt((match[1] === "-" ? "-" : "") + (match[2] || "0") + (match[3] || "")), e: exponent };
  }
  function wire(value) {
    return object(value) && /^-?\d{1,4096}$/.test(value.coefficient || "") && Number.isInteger(value.exponent) && Math.abs(value.exponent) <= 4096 ? { c: BigInt(value.coefficient), e: value.exponent } : null;
  }
  function add(a, b) { const e = Math.min(a.e, b.e); return { c: a.c * 10n ** BigInt(a.e - e) + b.c * 10n ** BigInt(b.e - e), e }; }
  const negate = a => ({ c: -a.c, e: a.e });
  const multiply = (a, b) => ({ c: a.c * b.c, e: a.e + b.e });
  const equal = (a, b) => Boolean(a && b && add(a, negate(b)).c === 0n);
  const numberOf = a => a.c ? Number(a.c.toString() + "e" + a.e) : 0;
  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (object(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function validDisplay(display, exact) {
    if (!object(display) || display.unit !== "mmol/L" || typeof display.approximate !== "boolean") return false;
    const shown = decimal(display.value);
    if (!shown || !finite(numberOf(shown)) || shown.c && !numberOf(shown) || exact.c && !shown.c || !exact.c && normalized(display.value).startsWith("-")) return false;
    if (normalized(display.text) !== (display.approximate ? "≈" : "") + normalized(display.value)) return false;
    if (typeof display.fullValueText !== "string" || display.fullValueComplete !== true || !equal(decimal(display.fullValueText), exact)) return false;
    if (!display.approximate) return equal(shown, exact);
    if (equal(shown, exact)) return false;
    const difference = add(shown, negate(exact));
    return Math.abs(numberOf(difference)) <= Math.pow(10, shown.e) / 2;
  }
  function validFrozen(s) {
    if (!safe(s) || !object(s) || s.schema !== "clcr-serum-anion-gap" || s.version !== 1 || s.sourceFormula !== FORMULA || s.valid !== true || s.canSave !== true) return false;
    if (!finite(s.rawValue) || s.unit !== "mmol/L" || s.pointValue !== s.rawValue || s.canonicalNumber !== s.rawValue || s.value !== s.rawValue || s.category !== null) return false;
    const input = s.input, policy = s.policy, context = s.context;
    if (!object(input) || !object(policy) || !object(context) || policy.formulaId !== FORMULA || policy.quantity !== "serum-anion-gap" || policy.nativeUnit !== "mmol/L" || s.profileId !== policy.id || s.profileVersion !== policy.version) return false;
    const parsedAge = decimal(input.ageYears), age = parsedAge && parsedAge.c >= 0n && finite(numberOf(parsedAge)) ? parsedAge : null;
    if (context.ageYears !== (age ? numberOf(age) : null) || context.ageKnown !== Boolean(age)) return false;
    if (context.ageExactValue !== undefined && (age ? !equal(wire(context.ageExactValue), age) : context.ageExactValue !== null)) return false;
    const operands = [input.sodiumValue, input.chlorideValue, input.bicarbonateValue].map(decimal);
    if (operands.some(q => !q || q.c < 0n || !Number.isFinite(numberOf(q)) || q.c && !numberOf(q))) return false;
    const exact = wire(s.exactValue), expected = add(add(operands[0], negate(operands[1])), negate(operands[2]));
    if (!equal(exact, expected) || numberOf(exact) !== s.rawValue || exact.c && !s.rawValue || !equal(decimal(s.exactText), exact) || !validDisplay(s.display, exact)) return false;
    const r = policy.reference;
    if (!object(r) || !finite(r.minimum) || !finite(r.maximum) || r.minimum > r.maximum || !finite(r.minimumAgeYears) || r.minimumAgeYears < 0 || r.unit !== "mmol/L" || r.lowerInclusive !== true || r.upperInclusive !== true) return false;
    const available = Boolean(age && add(age, negate(decimal(r.minimumAgeYears))).c >= 0n);
    const status = !available ? "unassessed" : add(exact, negate(decimal(r.minimum))).c < 0n ? "low" : add(exact, negate(decimal(r.maximum))).c > 0n ? "high" : "normal";
    if (s.referenceAvailable !== available || s.status !== status || s.outOfRange !== (available ? status !== "normal" : null)) return false;
    if (s.tone !== ({ low: "warn", high: "warn", normal: "normal", unassessed: "neutral" })[status]) return false;
    if (available ? !object(s.reference) || s.reference.min !== r.minimum || s.reference.max !== r.maximum || s.reference.unit !== "mmol/L" || s.reference.lowerInclusive !== true || s.reference.upperInclusive !== true || s.reference.minimumAgeYears !== r.minimumAgeYears || stable(s.reference.source) !== stable(policy.source) : s.reference !== null) return false;
    if (!object(policy.source) || !/^https:\/\//.test(policy.source.url || "") || !Array.isArray(policy.sources) || stable(s.source) !== stable(policy.source) || stable(s.sources) !== stable(policy.sources) || stable(s.notes) !== stable(policy.notes)) return false;
    if (typeof input.albuminEnabled !== "boolean" || !["g/L", "g/dL"].includes(input.albuminUnit)) return false;
    const albuminBlank = input.albuminValue === null || input.albuminValue === undefined || String(input.albuminValue).trim() === "";
    let expectedInterpretation = available ? policy.notes?.[status] : age ? policy.notes?.underAge : policy.notes?.unknownAge;
    if (input.albuminEnabled && !albuminBlank) {
      const albumin = decimal(input.albuminValue), correction = s.correction;
      if (!albumin || albumin.c <= 0n || !finite(numberOf(albumin)) || !numberOf(albumin) || !object(correction) || correction.valid !== true) return false;
      const gl = multiply(albumin, decimal(input.albuminUnit === "g/dL" ? "10" : "1"));
      const target = decimal(policy.correction?.targetAlbuminGl), coefficient = decimal(policy.correction?.coefficientGl);
      if (!target || target.c <= 0n || !coefficient || coefficient.c <= 0n) return false;
      const delta = multiply(add(target, negate(gl)), coefficient), corrected = add(exact, delta);
      const source = policy.sources.find(item => item.id === policy.correction.sourceId);
      if (!equal(wire(correction.exactValue), corrected) || !equal(decimal(correction.albuminGl), gl) || !equal(decimal(correction.delta), delta) || correction.rawValue !== numberOf(corrected) || correction.value !== correction.rawValue || !finite(correction.rawValue) || corrected.c && !correction.rawValue || !validDisplay(correction.display, corrected) || correction.referenceAvailable !== false || stable(correction.source) !== stable(source) || correction.comment !== (available ? policy.notes.correction : policy.notes.correctionUnassessed)) return false;
      if (status === "normal" && add(gl, negate(target)).c < 0n) expectedInterpretation += " " + policy.notes.albuminLower;
    } else if (s.correction?.valid === true) return false;
    return typeof expectedInterpretation === "string" && s.interpretation === expectedInterpretation && s.message === expectedInterpretation;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 60000) return null;
    try { const value = JSON.parse(encoded); return validFrozen(value) ? value : null; } catch (_) { return null; }
  }
  const displayText = snapshot => String(snapshot?.display?.text ?? "").replace(/\./g, ",");
  const norm = snapshot => snapshot.referenceAvailable ? snapshot.reference.min + "–" + snapshot.reference.max + " mmol/L" : "";
  const tone = snapshot => ({ warn: "warning", normal: "success" })[snapshot.tone] || "neutral";
  const assessment = snapshot => ({ low: "below", high: "above", normal: "within" })[snapshot.status] || "unassessed";
  function properties(snapshot) {
    return { serumAnionGapSnapshot: snapshot, label: LABEL, group: "serum", valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, unit: "mmol/L", comparator: "", displayValue: displayText(snapshot), norm: norm(snapshot), outOfRange: snapshot.outOfRange, assessment: assessment(snapshot), category: null, tone: tone(snapshot), reference: snapshot.reference, referenceAvailable: snapshot.referenceAvailable, source: snapshot.source, interpretation: snapshot.interpretation, assumptions: snapshot.policy.notes?.sample || "", boundary: "", referenceProfileId: snapshot.profileId, referenceProfileVersion: snapshot.profileVersion };
  }
  function matchesDatapoint(dp, snapshot) {
    if (!dp || dp.sourceFormulaId !== FORMULA) return false;
    const expected = properties(snapshot);
    return Object.entries(expected).every(([key, value]) => key === "serumAnionGapSnapshot" || stable(dp[key]) === stable(value));
  }
  function augmentDatapoint(element, dp) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-serum-anion-gap-snapshot"));
    if (!snapshot || dp?.sourceFormulaId !== FORMULA) return false;
    Object.assign(dp, properties(snapshot)); return true;
  }
  function prepareValues(values, context = {}, snapshot) {
    const frozen = snapshot && readSnapshot(JSON.stringify(snapshot));
    return Object.fromEntries(Object.entries(FIELD_MAP).map(([id, key]) => [id, frozen ? frozen.input[key] ?? DEFAULTS[id] : own(values, id) ? values[id] : DEFAULTS[id]]));
  }
  function editableFields() {
    return [
      { id: "S_Na", label: "Sód w surowicy (mmol/L)", type: "text", required: true },
      { id: "S_Cl", label: "Chlorki w surowicy (mmol/L)", type: "text", required: true },
      { id: "S_HCO3", label: "Wodorowęglany w surowicy (mmol/L)", type: "text", required: true },
      { id: "AGS_albuminEnabled", label: "Uwzględnij albuminę (opcjonalnie)", type: "checkbox", required: false },
      { id: "S_Albumin", label: "Albumina w surowicy (opcjonalnie)", type: "text", required: false, unitFieldId: "S_Albumin_unit" },
      { id: "S_Albumin_unit", label: "Jednostka albuminy", type: "select", required: false, options: [{ value: "g/L", label: "g/L" }, { value: "g/dL", label: "g/dL" }] },
    ].map(field => ({ options: [], ...field }));
  }
  const captureFields = () => editableFields();
  function referenceNote(snapshot) {
    return [snapshot.interpretation, snapshot.referenceAvailable ? "Norma przy zapisie: " + norm(snapshot) + ". Przyjęty zakres; norma na wydruku może się różnić." : snapshot.statusText,
      snapshot.correction?.valid ? "Po uwzględnieniu albuminy: " + displayText(snapshot.correction) + " mmol/L. " + snapshot.correction.comment : "",
      snapshot.source?.label ? "Źródło zakresu: " + snapshot.source.label + "." : ""].filter(Boolean).join("\n");
  }
  return Object.freeze({ FORMULA, LABEL, FIELD_MAP, DEFAULTS, readSnapshot, validFrozen, augmentDatapoint, prepareValues, editableFields, captureFields, displayText, matchesDatapoint, normalized, referenceNote });
});
