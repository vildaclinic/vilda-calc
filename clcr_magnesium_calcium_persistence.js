/* Frozen Mg/Ca DZM measurements. Reading verifies the captured arithmetic;
 * it never selects a current clinical policy or recalculates historical inputs. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrMagnesiumCalciumPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const FORMULA = "Mg_Ca", LABEL = "Magnez/wapń (DZM)";
  const UNIT_OPTIONS = Object.freeze(["mg/mg", "mmol/mmol"]);
  const INPUT_UNITS = Object.freeze(["mg/L", "mg/dL", "mmol/L", "µmol/L"]);
  const FIELD_MAP = Object.freeze({ MGCA_inputMode: "mode", MGCA_magnesium: "magnesiumValue", MGCA_magnesiumUnit: "magnesiumUnit", MGCA_calcium: "calciumValue", MGCA_calciumUnit: "calciumUnit", MGCA_reportedValue: "reportedValue", MGCA_reportedUnit: "reportedUnit" });
  const CONTEXT_MAP = Object.freeze({ MGCA_sameSpecimen: "sameSpecimen", MGCA_collectionProblem: "collectionProblem", MGCA_collectionHours: "collectionHours", MGCA_durationKnown: "durationKnown" });
  const DEFAULTS = Object.freeze({ MGCA_inputMode: "concentration", MGCA_magnesium: "", MGCA_magnesiumUnit: "mg/L", MGCA_calcium: "", MGCA_calciumUnit: "mmol/L", MGCA_reportedValue: "", MGCA_reportedUnit: "mg/mg", MGCA_sameSpecimen: "assumed" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/−/g, "-").replace(/,/g, ".");
  const canonicalUnit = value => ({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" })[value] || value;
  const hasContextField = (context, key) => key === "sameSpecimen" ? own(context, "concentrationSameSpecimen") || own(context, key) : own(context, key);
  const contextValue = (context, key) => key === "sameSpecimen" ? context?.concentrationSameSpecimen ?? (context?.sameSpecimen === "not-applicable" ? "assumed" : context?.sameSpecimen) : context?.[key];
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
    const text = String(value).trim().replace(/−/g, "-").replace(",", ".");
    if (text.length > maximumLength) return null;
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    const n = BigInt((match[2] || "0") + (match[3] || ""));
    if (!n) return reduced(0n);
    if (match[1] === "-") return null;
    const scale = (match[3] || "").length - Number(match[4] || 0);
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
    const match = /^[+-]?(\d*)(?:[.,](\d*))?(?:e([+-]?\d+))?$/i.exec(text.replace(/−/g, "-"));
    if (!match) return false;
    const exponent = Number(match[3] || 0) - (match[2] || "").length;
    const quantum = fraction("1e" + exponent);
    if (!quantum) return false;
    const difference = reduced(shown.n * quantity.d > quantity.n * shown.d ? shown.n * quantity.d - quantity.n * shown.d : quantity.n * shown.d - shown.n * quantity.d, shown.d * quantity.d);
    return compare(difference, divide(quantum, fraction("2"))) <= 0;
  }
  function validFullText(display, quantity, comparator) {
    if (typeof display.fullValueText !== "string" || typeof display.fullValueComplete !== "boolean") return false;
    const original = display.fullValueText;
    const match = /^([<>]=?|[≤≥])?\s*(.*?)(…)?$/.exec(original);
    const recordedComparator = match && ({ "<=": "≤", ">=": "≥" })[match[1]] || match?.[1] || "";
    if (!match || recordedComparator !== comparator || Boolean(match[3]) === display.fullValueComplete) return false;
    const numeric = normalized(match[2]), full = fraction(numeric, 4096);
    if (!full || quantity.n && !full.n) return false;
    if (display.fullValueComplete) return equal(full, quantity);
    const decimal = /^[+-]?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(numeric);
    if (!decimal || compare(full, quantity) >= 0) return false;
    const gap = reduced(quantity.n * full.d - full.n * quantity.d, quantity.d * full.d);
    return compare(gap, fraction("1e" + (Number(decimal[3] || 0) - (decimal[2] || "").length))) < 0;
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
    if (["mg/mg", "g/g"].includes(unit)) return fraction("1");
    if (["mmol/mmol", "mol/mol"].includes(unit)) return divide(fraction(constants.magnesiumMgPerMmol), fraction(constants.calciumMgPerMmol));
    return null;
  }
  function concentration(unit, mass) {
    if (["mg/dL", "mg/dl"].includes(unit)) return fraction("10");
    if (unit === "mg/L") return fraction("1");
    if (unit === "mmol/L") return fraction(mass);
    if (["µmol/L", "μmol/L", "umol/L", "umol"].includes(unit)) return multiply(fraction(mass), fraction("0.001"));
    return null;
  }
  function validFrozen(snapshot) {
    if (!safe(snapshot) || !object(snapshot) || snapshot.schema !== "clcr-magnesium-calcium" || snapshot.version !== 1 || snapshot.valid !== true || snapshot.sourceFormula !== FORMULA) return false;
    if (!finite(snapshot.rawValue) || snapshot.rawValue < 0 || !["", "<", "≤", ">", "≥"].includes(snapshot.comparator) || snapshot.operator !== snapshot.comparator || snapshot.exact !== (snapshot.comparator === "") || snapshot.pointValue !== (snapshot.comparator ? null : snapshot.rawValue) || snapshot.zero !== (snapshot.rawValue === 0)) return false;
    if (snapshot.status !== "unassessed" || snapshot.assessment !== "unassessed" || snapshot.category !== null || snapshot.tone !== "neutral" || snapshot.reference !== null || snapshot.referenceAvailable !== false || snapshot.outOfRange !== null || !Array.isArray(snapshot.referenceTable) || snapshot.referenceTable.length !== 0) return false;
    const constants = snapshot.conversionConstants;
    if (!object(constants) || constants.magnesiumMgPerMmol !== "24.305" || constants.calciumMgPerMmol !== "40.078") return false;
    const main = wire(snapshot.exactValue), mass = wire(snapshot.exactMass), unit = factor(snapshot.unit, constants);
    if (!main || !mass || !unit || !equal(multiply(main, unit), mass) || numberOf(main) !== snapshot.rawValue || main.n && !snapshot.rawValue) return false;
    const input = snapshot.input, context = snapshot.context;
    if (!object(input) || !object(context) || context.sampleType !== "timed" || !["assumed", "confirmed", "different"].includes(contextValue(context, "sameSpecimen"))) return false;
    if (snapshot.profileId === null) {
      if (snapshot.profileVersion !== null || snapshot.policy !== null || snapshot.source !== null) return false;
    } else if (snapshot.profileId !== "MGCA_DZM_2026_11" || snapshot.profileVersion !== 1 || snapshot.source?.id !== "MGCA_DZM_REVIEW_2026_11" || snapshot.policy?.id !== snapshot.profileId || snapshot.policy?.version !== snapshot.profileVersion || snapshot.policy?.referenceKind !== "no-verified-reference" || snapshot.policy?.referenceAvailable !== false || ["source", "sources", "notes", "restrictions", "conversionConstants"].some(key => stable(snapshot[key]) !== stable(snapshot.policy[key]))) return false;
    if (snapshot.mode === "direct") {
      if (String(input.reportedValue ?? "").trim().length > 512) return false;
      const match = /^([<>]=?|[≤≥])?\s*(.+)$/.exec(String(input.reportedValue ?? "").trim());
      const comparator = match && ({ "<=": "≤", ">=": "≥" })[match[1]] || match?.[1] || "";
      if (!match || comparator !== snapshot.comparator || canonicalUnit(input.reportedUnit) !== snapshot.unit || !equal(fraction(match[2]), main) || snapshot.comparator === "<" && !main.n || context.sameSpecimen !== "not-applicable") return false;
    } else if (snapshot.mode === "concentration") {
      if ([input.magnesiumValue, input.calciumValue].some(value => String(value ?? "").trim().length > 512)) return false;
      const magnesium = fraction(input.magnesiumValue), calcium = fraction(input.calciumValue);
      const mgScale = concentration(input.magnesiumUnit, constants.magnesiumMgPerMmol), caScale = concentration(input.calciumUnit, constants.calciumMgPerMmol);
      if (!magnesium || !calcium?.n || !mgScale || !caScale || contextValue(context, "sameSpecimen") === "different" || context.sameSpecimen !== contextValue(context, "sameSpecimen") || snapshot.comparator || snapshot.unit !== "mg/mg" || !equal(divide(multiply(magnesium, mgScale), multiply(calcium, caScale)), main)) return false;
      const mgNumber = numberOf(magnesium), caNumber = numberOf(calcium);
      if (!finite(mgNumber) || magnesium.n && mgNumber === 0 || !finite(caNumber) || caNumber <= 0) return false;
    } else return false;
    if (!object(snapshot.display) || typeof snapshot.display.value !== "string" || typeof snapshot.display.text !== "string" || snapshot.display.unit !== snapshot.unit) return false;
    if (!validShown(snapshot.display.value, main, snapshot.display.approximate) || normalized(snapshot.display.text) !== snapshot.comparator + (snapshot.display.approximate ? "≈" : "") + normalized(snapshot.display.value) || snapshot.display.rounded !== snapshot.display.approximate || !validFullText(snapshot.display, main, snapshot.comparator)) return false;
    if (snapshot.restrictions && (snapshot.restrictions.sampleType !== "timed" || snapshot.restrictions.noVerifiedReferenceForAnyAgeOrSex !== true || snapshot.restrictions.thresholdsFromOtherSpecimensApplied !== false || snapshot.restrictions.diagnosesDisease !== false || snapshot.restrictions.assessesBurosumabEfficacy !== false)) return false;
    const alternateUnit = snapshot.unit === "mg/mg" ? "mmol/mmol" : "mg/mg";
    const exactAlternate = divide(mass, factor(alternateUnit, constants));
    const alternateNumber = numberOf(exactAlternate), available = finite(alternateNumber) && (!exactAlternate.n || alternateNumber > 0);
    if (snapshot.alternateUnit !== alternateUnit || snapshot.alternateAvailable !== available || !equal(wire(snapshot.exactAlternate), exactAlternate)) return false;
    if (available && snapshot.alternateValue !== alternateNumber || !available && snapshot.alternateValue !== null) return false;
    if (!object(snapshot.alternate) || snapshot.alternate.available !== available || snapshot.alternate.comparator !== snapshot.comparator || snapshot.alternate.unit !== alternateUnit || snapshot.alternate.value !== snapshot.alternateValue) return false;
    if (available) {
      const display = snapshot.alternate.display;
      if (!object(display) || display.unit !== alternateUnit || !validShown(display.value, exactAlternate, display.approximate) || normalized(display.text) !== snapshot.comparator + (display.approximate ? "≈" : "") + normalized(display.value) || display.rounded !== display.approximate || !validFullText(display, exactAlternate, snapshot.comparator)) return false;
    }
    return true;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 60000) return null;
    try { const value = JSON.parse(encoded); return validFrozen(value) ? value : null; } catch (_) { return null; }
  }
  function displayText(snapshot) { return String(snapshot?.display?.text ?? "").replace(/\./g, ","); }
  function normText() { return ""; }
  function outOfRange() { return null; }
  function matchesDatapoint(dp, snapshot) {
    return Boolean(dp && snapshot && dp.sourceFormulaId === FORMULA && dp.label === LABEL && dp.valueNum === snapshot.rawValue && dp.rawValue === snapshot.rawValue && dp.unit === snapshot.unit && normalized(dp.displayValue) === normalized(displayText(snapshot)) && !String(dp.norm || "") && dp.outOfRange === null && dp.assessment === "unassessed" && dp.category === null && dp.tone === "neutral" && dp.reference === null && dp.referenceAvailable === false && stable(dp.source) === stable(snapshot.source) && dp.referenceProfileId === (snapshot.profileId || "") && dp.referenceProfileVersion === snapshot.profileVersion && String(dp.comparator || "") === snapshot.comparator);
  }
  function augmentDatapoint(element, dp) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-mgca-snapshot"));
    if (!snapshot || dp?.sourceFormulaId !== FORMULA) return false;
    Object.assign(dp, { magnesiumCalciumSnapshot: snapshot, valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, unit: snapshot.unit, comparator: snapshot.comparator, displayValue: displayText(snapshot), norm: "", outOfRange: null, assessment: "unassessed", category: null, tone: "neutral", reference: null, referenceAvailable: false, source: snapshot.source, interpretation: snapshot.notes?.reference || snapshot.interpretation || "Brak zweryfikowanego zakresu referencyjnego Mg/Ca dla DZM.", assumptions: snapshot.context.sameSpecimen === "assumed" ? String(snapshot.notes?.assumption || "") : "", boundary: "", referenceProfileId: snapshot.profileId || "", referenceProfileVersion: snapshot.profileVersion ?? null });
    return true;
  }
  function prepareValues(values, context = {}, snapshot) {
    const result = { ...(values || {}) }, frozen = snapshot && readSnapshot(JSON.stringify(snapshot));
    if (frozen) {
      for (const id of Object.keys(result)) if (id.startsWith("MGCA_")) delete result[id];
      for (const [id, key] of Object.entries(FIELD_MAP)) result[id] = inputValue(frozen, key) ?? DEFAULTS[id] ?? "";
      for (const [id, key] of Object.entries(CONTEXT_MAP)) if (hasContextField(frozen.context, key)) result[id] = contextValue(frozen.context, key);
      // The edit selector offers the two canonical units. The unchanged alias
      // remains in the frozen input and is retained by explicit recalculation.
      result.MGCA_reportedUnit = canonicalUnit(result.MGCA_reportedUnit);
    } else {
      // Only an explicit edit migrates the active historical pair. Dedicated
      // values captured from another calculator cannot replace these operands.
      for (const id of Object.keys(result)) if (id.startsWith("MGCA_")) delete result[id];
      Object.assign(result, DEFAULTS, { MGCA_magnesium: values?.U_Mg ?? "", MGCA_calcium: values?.U_Ca ?? "" });
      for (const id of Object.keys(CONTEXT_MAP)) if (own(values, id)) result[id] = values[id];
      for (const [id, key] of Object.entries(CONTEXT_MAP)) if (!own(values, id) && hasContextField(context, key)) result[id] = contextValue(context, key);
    }
    return result;
  }
  function editableFields(values) {
    const direct = values?.MGCA_inputMode === "direct";
    const select = (id, label, options) => ({ id, label, type: "select", required: true, options: options.map(value => ({ value, label: value })) });
    const fields = [select("MGCA_inputMode", "Sposób wpisania", ["concentration", "direct"])];
    fields[0].options = [{ value: "concentration", label: "Oblicz ze stężeń" }, { value: "direct", label: "Gotowy wynik Mg/Ca" }];
    if (direct) fields.push({ id: "MGCA_reportedValue", label: "Mg/Ca z wyniku badania", type: "text", required: true, unitFieldId: "MGCA_reportedUnit", options: [] }, select("MGCA_reportedUnit", "Jednostka wyniku", UNIT_OPTIONS));
    else fields.push({ id: "MGCA_magnesium", label: "Magnez w moczu", type: "text", required: true, unitFieldId: "MGCA_magnesiumUnit", options: [] }, select("MGCA_magnesiumUnit", "Jednostka magnezu", INPUT_UNITS), { id: "MGCA_calcium", label: "Wapń w moczu", type: "text", required: true, unitFieldId: "MGCA_calciumUnit", options: [] }, select("MGCA_calciumUnit", "Jednostka wapnia", INPUT_UNITS));
    return fields;
  }
  function captureFields(values, fields = []) {
    const generated = editableFields(values), ids = new Set(generated.map(field => field.id));
    const retained = fields.filter(field => own(values, field.id) && !field.id.startsWith("MGCA_") && !["U_Mg", "U_Ca"].includes(field.id));
    for (const id of [...Object.keys(FIELD_MAP), ...Object.keys(CONTEXT_MAP)]) if (own(values, id) && !ids.has(id)) generated.push({ id, label: id, type: "text", required: false, historicalContext: true, unitFieldId: "", options: [] });
    return [...generated, ...retained];
  }
  return Object.freeze({ FORMULA, LABEL, FIELD_MAP, CONTEXT_MAP, DEFAULTS, readSnapshot, validFrozen, augmentDatapoint, prepareValues, editableFields, captureFields, displayText, normText, outOfRange, matchesDatapoint, normalized, canonicalUnit, hasContextField, contextValue, inputValue });
});
