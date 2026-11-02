/* Frozen Ca/Cr version-2 records. Reading validates captured arithmetic and
 * reference endpoints only; no current clinical engine or source table is read. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrCacrDzmPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const FORMULA = "Ca_Cr", LABEL = "Wapń/kreatynina (DZM)";
  const UNIT_OPTIONS = Object.freeze(["mg/mg", "mg/g", "mmol/mmol", "mg/mmol", "mmol/mol"]);
  const INPUT_UNITS = Object.freeze(["mg/dL", "mg/L", "mmol/L", "µmol/L"]);
  const FIELD_MAP = Object.freeze({ CACR_DZM_inputMode: "mode", CACR_DZM_calcium: "calciumValue", CACR_DZM_calciumUnit: "calciumUnit", CACR_DZM_creatinine: "creatinineValue", CACR_DZM_creatinineUnit: "creatinineUnit", CACR_DZM_reportedValue: "reportedValue", CACR_DZM_reportedUnit: "reportedUnit" });
  const CONTEXT_MAP = Object.freeze({ CACR_DZM_sameSpecimen: "sameSpecimen", CACR_DZM_collectionProblem: "collectionProblem", CACR_DZM_collectionHours: "collectionHours", CACR_DZM_durationKnown: "durationKnown", CACR_DZM_currentPreterm: "currentPreterm" });
  const DEFAULTS = Object.freeze({ CACR_DZM_inputMode: "concentration", CACR_DZM_calcium: "", CACR_DZM_calciumUnit: "mmol/L", CACR_DZM_creatinine: "", CACR_DZM_creatinineUnit: "mg/dL", CACR_DZM_reportedValue: "", CACR_DZM_reportedUnit: "mg/mg", CACR_DZM_sameSpecimen: "assumed" });
  // Identity bindings of the two approved wire-v2 producers, not a live
  // reference registry or another copy of their medical ranges. Unknown,
  // explicitly injected profiles are not silently assigned either identity.
  const KNOWN_PRODUCERS = Object.freeze([
    Object.freeze({ formula: "Ca_Cr", profile: "ARUP_CACR_DZM_2026_11", source: "ARUP_0020472" }),
    Object.freeze({ formula: "CaCr_spot", profile: "MAYO_CACR3_RANDOM_2026_10", source: "MAYO_CACR3" }),
  ]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  const canonicalUnit = value => ({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" })[value] || value;
  const hasContextField = (context, key) => key === "currentPreterm" ? own(context?.population, key) : key === "sameSpecimen" ? own(context, "concentrationSameSpecimen") || own(context, key) : own(context, key);
  const contextValue = (context, key) => key === "currentPreterm" ? context?.population?.currentPreterm : key === "sameSpecimen" ? context?.concentrationSameSpecimen ?? (context?.sameSpecimen === "not-applicable" ? "assumed" : context?.sameSpecimen) : context?.[key];
  const inputValue = (snapshot, key) => key === "mode" ? snapshot?.mode : snapshot?.input?.[key];
  function safe(value, depth = 0) {
    if (value === null || typeof value === "boolean" || typeof value === "string" && value.length <= 20000 || finite(value)) return true;
    if (depth > 18 || !value || typeof value !== "object") return false;
    const entries = Object.entries(value);
    return entries.length <= 1000 && entries.every(([key, item]) => !["__proto__", "prototype", "constructor"].includes(key) && safe(item, depth + 1));
  }
  function reduced(n, d = 1n) {
    if (d <= 0n || n < 0n) return null;
    let a = n, b = d;
    while (b) { const remainder = a % b; a = b; b = remainder; }
    const divisor = a || 1n;
    return { n: n / divisor, d: d / divisor };
  }
  function fraction(value, maximumLength = 512) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(",", ".");
    if (text.length > maximumLength) return null;
    const match = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[1] || match[2])) return null;
    const n = BigInt((match[1] || "0") + (match[2] || ""));
    if (!n) return reduced(0n);
    const scale = (match[2] || "").length - Number(match[3] || 0);
    if (!Number.isInteger(scale) || Math.abs(scale) > 4096) return null;
    return scale >= 0 ? reduced(n, 10n ** BigInt(scale)) : reduced(n * 10n ** BigInt(-scale));
  }
  function wire(value) {
    if (!object(value) || !/^\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "")) return null;
    return reduced(BigInt(value.numerator), BigInt(value.denominator));
  }
  const multiply = (a, b) => reduced(a.n * b.n, a.d * b.d);
  const divide = (a, b) => b.n ? reduced(a.n * b.d, a.d * b.n) : null;
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const equal = (a, b) => Boolean(a && b && compare(a, b) === 0);
  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (object(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function validShown(text, quantity, approximate) {
    if (typeof text !== "string" || typeof approximate !== "boolean") return false;
    const shown = fraction(text);
    if (!shown || quantity.n && shown.n === 0n) return false;
    const same = equal(shown, quantity);
    if (!approximate) return same;
    if (same) return false;
    const match = /^(\d*)(?:[.,](\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match) return false;
    const exponent = Number(match[3] || 0) - (match[2] || "").length;
    const quantum = fraction("1e" + exponent);
    if (!quantum) return false;
    const difference = reduced(shown.n * quantity.d > quantity.n * shown.d ? shown.n * quantity.d - quantity.n * shown.d : quantity.n * shown.d - shown.n * quantity.d, shown.d * quantity.d);
    return compare(difference, divide(quantum, fraction("2"))) <= 0;
  }
  function validFullText(display, quantity) {
    if (typeof display.fullValueText !== "string" || typeof display.fullValueComplete !== "boolean") return false;
    const full = fraction(display.fullValueText, 4096);
    if (!full) return false;
    if (display.fullValueComplete) return equal(full, quantity);
    const match = /^\d+\.(\d+)$/.exec(display.fullValueText);
    if (!match || compare(full, quantity) >= 0) return false;
    const gap = reduced(quantity.n * full.d - full.n * quantity.d, quantity.d * full.d);
    return compare(gap, fraction("1e-" + match[1].length)) < 0;
  }
  function roundedQuotient(n, d) { const quotient = n / d, remainder = n % d; return quotient + (remainder * 2n > d || remainder * 2n === d && quotient % 2n === 1n ? 1n : 0n); }
  function numberOf(value) {
    if (!value.n) return 0;
    const n = value.n, d = value.d;
    let exponent = n.toString(2).length - d.toString(2).length;
    if (exponent >= 0 ? n < d * 2n ** BigInt(exponent) : n * 2n ** BigInt(-exponent) < d) exponent -= 1;
    if (exponent > 1023) return Infinity;
    if (exponent < -1075) return 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? roundedQuotient(n * 2n ** BigInt(scale), d) : roundedQuotient(n, d * 2n ** BigInt(-scale));
    return Number(coefficient) * 2 ** -scale;
  }
  function factor(unit, constants) {
    const ca = fraction(constants.calciumMgPerMmol), cr = fraction(constants.creatinineMgPerMmol);
    if (["mg/mg", "g/g"].includes(unit)) return fraction("1");
    if (unit === "mg/g") return fraction("0.001");
    if (["mol/mol", "mmol/mmol"].includes(unit)) return divide(ca, cr);
    if (unit === "mmol/mol") return multiply(divide(ca, cr), fraction("0.001"));
    if (unit === "mg/mmol") return divide(fraction("1"), cr);
    return null;
  }
  function concentration(unit, mass) {
    if (["mg/dL", "mg/dl"].includes(unit)) return fraction("10");
    if (unit === "mg/L") return fraction("1");
    if (unit === "mmol/L") return fraction(mass);
    if (["µmol/L", "μmol/L", "umol/L", "umol"].includes(unit)) return multiply(fraction(mass), fraction("0.001"));
    return null;
  }
  function classification(mass, comparator, lower, upper) {
    const low = compare(mass, lower), high = compare(mass, upper);
    if (!comparator) return low < 0 ? "below" : high > 0 ? "above" : "within";
    if (comparator === "<") return low <= 0 ? "below" : lower.n === 0n && high <= 0 ? "within" : null;
    if (comparator === "≤") return low < 0 ? "below" : lower.n === 0n && high <= 0 ? "within" : null;
    if (comparator === ">") return high >= 0 ? "above" : null;
    return high > 0 ? "above" : null;
  }
  function validFrozen(snapshot) {
    if (!safe(snapshot) || !object(snapshot) || snapshot.schema !== "clcr-cacr" || snapshot.version !== 2 || snapshot.valid !== true || ![FORMULA, "CaCr_spot"].includes(snapshot.sourceFormula)) return false;
    if (!finite(snapshot.rawValue) || snapshot.rawValue < 0 || !finite(snapshot.classificationValue) || snapshot.classificationValue < 0 || !["below", "within", "above", "unassessed"].includes(snapshot.status) || !["", "<", "≤", ">", "≥"].includes(snapshot.comparator) || snapshot.exact !== (snapshot.comparator === "")) return false;
    const constants = snapshot.conversionConstants;
    if (!object(constants) || constants.calciumMgPerMmol !== "40.078" || constants.creatinineMgPerMmol !== "113.12") return false;
    const main = wire(snapshot.exactValue), mass = wire(snapshot.exactMass), unit = factor(snapshot.unit, constants);
    if (!main || !mass || !unit || !equal(multiply(main, unit), mass) || numberOf(main) !== snapshot.rawValue || numberOf(mass) !== snapshot.classificationValue || main.n && (!snapshot.rawValue || !snapshot.classificationValue)) return false;
    const input = snapshot.input, context = snapshot.context;
    if (!object(input) || !object(context) || snapshot.sourceFormula === FORMULA && context.sampleType !== "timed" || snapshot.sourceFormula === "CaCr_spot" && context.sampleType === "timed" && snapshot.referenceAvailable) return false;
    for (const producer of KNOWN_PRODUCERS) {
      if ((snapshot.profileId === producer.profile || snapshot.source?.id === producer.source) && (snapshot.sourceFormula !== producer.formula || snapshot.profileId !== producer.profile || snapshot.source?.id !== producer.source)) return false;
    }
    if (snapshot.mode === "direct") {
      if (String(input.reportedValue ?? "").trim().length > 256) return false;
      const match = /^([<>]=?|[≤≥])?\s*(.+)$/.exec(String(input.reportedValue ?? "").trim());
      const comparator = match && ({ "<=": "≤", ">=": "≥" })[match[1]] || match?.[1] || "";
      if (!match || comparator !== snapshot.comparator || canonicalUnit(input.reportedUnit) !== snapshot.unit || !equal(fraction(match[2]), main)) return false;
    } else if (snapshot.mode === "concentration") {
      if ([input.calciumValue, input.creatinineValue].some(value => String(value ?? "").trim().length > 256)) return false;
      const calcium = fraction(input.calciumValue), creatinine = fraction(input.creatinineValue);
      const caScale = concentration(input.calciumUnit, constants.calciumMgPerMmol), crScale = concentration(input.creatinineUnit, constants.creatinineMgPerMmol);
      if (!calcium || !creatinine?.n || !caScale || !crScale || context.sameSpecimen === "different" || snapshot.comparator || snapshot.unit !== "mg/mg" || !equal(divide(multiply(calcium, caScale), multiply(creatinine, crScale)), main)) return false;
      const caNumber = numberOf(calcium), crNumber = numberOf(creatinine);
      if (!finite(caNumber) || calcium.n && caNumber === 0 || !finite(crNumber) || crNumber <= 0) return false;
    } else return false;
    if (!object(snapshot.display) || typeof snapshot.display.value !== "string" || typeof snapshot.display.text !== "string" || snapshot.display.unit !== snapshot.unit || !snapshot.display.text || typeof snapshot.referenceAvailable !== "boolean") return false;
    if (!validShown(snapshot.display.value, main, snapshot.display.approximate) || snapshot.display.text !== snapshot.comparator + (snapshot.display.approximate ? "≈" : "") + snapshot.display.value || snapshot.display.comparator !== snapshot.comparator || snapshot.display.rounded !== snapshot.display.approximate || !validFullText(snapshot.display, main)) return false;
    if (!snapshot.referenceAvailable) return snapshot.reference === null && snapshot.status === "unassessed" && snapshot.category === null && snapshot.tone === "neutral";
    if (context.population?.currentPreterm === true || snapshot.sourceFormula === FORMULA && context.collectionProblem === true) return false;
    const reference = snapshot.reference, lower = fraction(reference?.nativeLow), upper = fraction(reference?.nativeHigh);
    const exactLower = wire(reference?.exactLower), exactUpper = wire(reference?.exactUpper);
    if (!object(reference) || !lower || !upper || compare(lower, upper) >= 0 || !exactLower || !exactUpper || !equal(divide(lower, unit), exactLower) || !equal(divide(upper, unit), exactUpper) || reference.lower !== numberOf(exactLower) || reference.upper !== numberOf(exactUpper) || reference.unit !== snapshot.unit || reference.lowerInclusive !== true || reference.upperInclusive !== true || !object(reference.band)) return false;
    if (snapshot.profileId !== reference.profileId || snapshot.profileVersion !== reference.profileVersion || stable(snapshot.source) !== stable(reference.source)) return false;
    if (!object(reference.display) || reference.display.unit !== snapshot.unit || reference.range !== reference.display.range || reference.limit !== reference.range || reference.range !== reference.display.lower + "–" + reference.display.upper) return false;
    for (const [key, exact] of [["lower", exactLower], ["upper", exactUpper]]) {
      const text = reference.display[key], approximate = typeof text === "string" && text.startsWith("≈");
      if (!validShown(approximate ? text.slice(1) : text, exact, approximate)) return false;
    }
    const age = wire(context.ageExact) || fraction(context.ageYearsRaw ?? context.ageYears), band = reference.band;
    const minimumMonths = fraction(band.minimumAgeMonthsInclusive), maximumMonths = band.maximumAgeMonths === null ? null : fraction(band.maximumAgeMonths);
    if (!age || !minimumMonths || band.maximumAgeMonths !== null && !maximumMonths || numberOf(age) !== context.ageYears || compare(age, divide(minimumMonths, fraction("12"))) < 0) return false;
    if (context.agePrecision === "completed-years") {
      const interval = context.ageInterval;
      if (!object(interval) || !Number.isInteger(interval.minimumAgeYearsInclusive) || interval.minimumAgeYearsInclusive !== context.ageYears || interval.maximumAgeYearsExclusive !== interval.minimumAgeYearsInclusive + 1 || context.ageExact !== null) return false;
      if (maximumMonths && compare(fraction(interval.maximumAgeYearsExclusive), divide(maximumMonths, fraction("12"))) > 0) return false;
    } else if (own(context, "ageInterval")) return false;
    if (maximumMonths) {
      const above = compare(age, divide(maximumMonths, fraction("12")));
      if (above > 0 || above === 0 && !band.maximumAgeInclusive) return false;
    }
    if (band.lower !== reference.nativeLow || band.upper !== reference.nativeHigh || band.bySex && (!band.sharedSexRange && !["M", "F"].includes(context.sex) || ["M", "F"].includes(context.sex) && (band.bySex[context.sex]?.lower !== reference.nativeLow || band.bySex[context.sex]?.upper !== reference.nativeHigh))) return false;
    const expected = mass.n === 0n ? null : classification(mass, snapshot.comparator, lower, upper);
    if (snapshot.category !== expected || snapshot.status !== (expected || "unassessed")) return false;
    return snapshot.tone === (expected === "within" ? "success" : expected ? "warning" : "neutral");
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 60000) return null;
    try { const value = JSON.parse(encoded); return validFrozen(value) ? value : null; } catch (_) { return null; }
  }
  function displayText(snapshot) { return String(snapshot?.display?.text ?? "").replace(/\./g, ","); }
  function normText(snapshot) { return snapshot?.referenceAvailable && snapshot.reference ? `${snapshot.reference.range || snapshot.reference.limit || ""} ${snapshot.unit}`.trim() : ""; }
  function outOfRange(snapshot) { return snapshot?.status === "unassessed" ? null : ["below", "above"].includes(snapshot?.status); }
  function matchesDatapoint(dp, snapshot) {
    return Boolean(dp && snapshot && dp.sourceFormulaId === snapshot.sourceFormula && dp.valueNum === snapshot.rawValue && dp.rawValue === snapshot.rawValue && dp.unit === snapshot.unit && normalized(dp.displayValue) === normalized(displayText(snapshot)) && String(dp.norm || "") === normText(snapshot) && dp.outOfRange === outOfRange(snapshot) && dp.assessment === snapshot.status && (dp.category || null) === snapshot.category && dp.tone === snapshot.tone && String(dp.comparator || "") === snapshot.comparator);
  }
  function augmentDatapoint(element, dp) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-cacr-snapshot"));
    if (!snapshot || snapshot.sourceFormula !== dp.sourceFormulaId) return false;
    Object.assign(dp, { cacrSnapshot: snapshot, valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, unit: snapshot.unit, comparator: snapshot.comparator, displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: outOfRange(snapshot), assessment: snapshot.status, category: snapshot.category, tone: snapshot.tone, interpretation: snapshot.qualification?.note || snapshot.categoryDescription || snapshot.statusText || "", boundary: snapshot.boundary || "", referenceProfileId: snapshot.profileId || "", referenceProfileVersion: snapshot.profileVersion ?? null });
    return true;
  }
  function prepareValues(values, context = {}, snapshot) {
    const result = { ...(values || {}) }, frozen = snapshot && readSnapshot(JSON.stringify(snapshot));
    if (frozen?.sourceFormula === FORMULA) {
      for (const [id, key] of Object.entries(FIELD_MAP)) result[id] = inputValue(frozen, key) ?? DEFAULTS[id] ?? "";
      for (const [id, key] of Object.entries(CONTEXT_MAP)) if (hasContextField(frozen.context, key)) result[id] = contextValue(frozen.context, key);
      result.sex = frozen.context.sex || "";
    } else {
      // Explicit editing is the only migration point for the legacy U_Ca/Ucr
      // operands. A dormant dedicated input must not override the saved pair.
      for (const id of Object.keys(result)) if (id.startsWith("CACR_DZM_")) delete result[id];
      Object.assign(result, DEFAULTS, { CACR_DZM_calcium: values?.U_Ca ?? "", CACR_DZM_creatinine: values?.Ucr ?? "", CACR_DZM_durationKnown: false });
      if (own(values, "CACR_DZM_collectionHours")) result.CACR_DZM_collectionHours = values.CACR_DZM_collectionHours;
      if (own(values, "CACR_DZM_collectionProblem")) result.CACR_DZM_collectionProblem = values.CACR_DZM_collectionProblem;
      if (typeof context.population?.currentPreterm === "boolean") result.CACR_DZM_currentPreterm = context.population.currentPreterm;
      else if (typeof context.currentPreterm === "boolean") result.CACR_DZM_currentPreterm = context.currentPreterm;
      if (!own(result, "sex") && own(context, "sex")) result.sex = context.sex;
    }
    return result;
  }
  function editableFields(values) {
    const direct = values?.CACR_DZM_inputMode === "direct";
    const select = (id, label, options) => ({ id, label, type: "select", required: true, options: options.map(value => ({ value, label: value })) });
    const fields = [select("CACR_DZM_inputMode", "Sposób wpisania", ["concentration", "direct"])];
    fields[0].options = [{ value: "concentration", label: "Oblicz ze stężeń" }, { value: "direct", label: "Gotowy wynik Ca/Cr" }];
    if (direct) fields.push({ id: "CACR_DZM_reportedValue", label: "Ca/Cr z wyniku badania", type: "text", required: true, unitFieldId: "CACR_DZM_reportedUnit", options: [] }, select("CACR_DZM_reportedUnit", "Jednostka wyniku", [...UNIT_OPTIONS, ...(["g/g", "mol/mol"].includes(values.CACR_DZM_reportedUnit) ? [values.CACR_DZM_reportedUnit] : [])]));
    else fields.push({ id: "CACR_DZM_calcium", label: "Wapń w moczu", type: "text", required: true, unitFieldId: "CACR_DZM_calciumUnit", options: [] }, select("CACR_DZM_calciumUnit", "Jednostka wapnia", INPUT_UNITS), { id: "CACR_DZM_creatinine", label: "Kreatynina w moczu", type: "text", required: true, unitFieldId: "CACR_DZM_creatinineUnit", options: [] }, select("CACR_DZM_creatinineUnit", "Jednostka kreatyniny", INPUT_UNITS));
    return fields;
  }
  function captureFields(values, fields = []) {
    const generated = editableFields(values), ids = new Set(generated.map(field => field.id));
    const retained = fields.filter(field => own(values, field.id) && !field.id.startsWith("CACR_DZM_") && !["U_Ca", "Ucr"].includes(field.id));
    for (const id of [...Object.keys(FIELD_MAP), ...Object.keys(CONTEXT_MAP)]) if (own(values, id) && !ids.has(id)) generated.push({ id, label: id, type: "text", required: false, historicalContext: true, unitFieldId: "", options: [] });
    return [...generated, ...retained];
  }
  return Object.freeze({ FORMULA, LABEL, FIELD_MAP, CONTEXT_MAP, DEFAULTS, readSnapshot, validFrozen, augmentDatapoint, prepareValues, editableFields, captureFields, displayText, normText, outOfRange, matchesDatapoint, normalized, canonicalUnit, hasContextField, contextValue, inputValue });
});
