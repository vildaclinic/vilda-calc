/* Frozen Ca/Cit records. The reader checks the captured arithmetic and source
 * policy without evaluating today's engine or borrowing today's patient age. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrCaCitPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const FORMULA = "Ca_Cit", LABEL = "Wapń/cytryniany (DZM)", MOL_LABEL = LABEL + " · mmol/mmol";
  const NOTE_HEADER = "Ca/Cit — dane użyte w chwili zapisu:";
  const FIELD_MAP = Object.freeze({ CACIT_inputMode: "mode", CACIT_calcium: "calciumValue", CACIT_calciumUnit: "calciumUnit", CACIT_citrate: "citrateValue", CACIT_citrateUnit: "citrateUnit", CACIT_reportedValue: "reportedValue", CACIT_reportedUnit: "reportedUnit" });
  const CONTEXT_MAP = Object.freeze({ CACIT_sameSpecimen: "concentrationSameSpecimen", CACIT_collectionProblem: "collectionProblem", CACIT_collectionHours: "collectionHours", CACIT_durationKnown: "durationKnown", CACIT_sampleType: "sampleType", CACIT_sampleSource: "sampleSource", CACIT_durationSource: "durationSource", CACIT_reportedSameSpecimen: "reportedSameSpecimen" });
  const DEFAULTS = Object.freeze({ CACIT_inputMode: "concentration", CACIT_calcium: "", CACIT_calciumUnit: "mmol/L", CACIT_citrate: "", CACIT_citrateUnit: "mg/dL", CACIT_reportedValue: "", CACIT_reportedUnit: "mg/mg" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  function safe(value, depth = 0) {
    if (value === null || typeof value === "boolean" || typeof value === "string" && value.length <= 12000 || finite(value)) return true;
    if (depth > 18 || !value || typeof value !== "object" || Object.keys(value).length > 400) return false;
    return Object.entries(Object.getOwnPropertyDescriptors(value)).every(([key, descriptor]) => !["__proto__", "prototype", "constructor"].includes(key) && !descriptor.get && !descriptor.set && safe(descriptor.value, depth + 1));
  }
  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (object(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function fraction(value, length = 4096) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(",", ".");
    const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || text.length > length) return null;
    const decimals = match[2] ?? match[3] ?? "", exponent = Number(match[4] || 0) - decimals.length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    const n = BigInt((match[1] || "0") + decimals);
    return exponent >= 0 ? { n: n * 10n ** BigInt(exponent), d: 1n } : { n, d: 10n ** BigInt(-exponent) };
  }
  function wire(value) {
    return object(value) && /^\d{1,4096}$/.test(value.numerator || "") && /^\d{1,4096}$/.test(value.denominator || "") && BigInt(value.denominator) > 0n ? { n: BigInt(value.numerator), d: BigInt(value.denominator) } : null;
  }
  const multiply = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
  const divide = (a, b) => b.n ? { n: a.n * b.d, d: a.d * b.n } : null;
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const equal = (a, b) => Boolean(a && b && compare(a, b) === 0);
  function numberOf(value) {
    if (!value.n) return 0;
    const rounded = (n, d) => { const q = n / d, r = n % d; return q + (r * 2n > d || r * 2n === d && q % 2n === 1n ? 1n : 0n); };
    let exponent = value.n.toString(2).length - value.d.toString(2).length;
    if (exponent >= 0 ? value.n < value.d * 2n ** BigInt(exponent) : value.n * 2n ** BigInt(-exponent) < value.d) exponent -= 1;
    if (exponent > 1023) return Infinity;
    if (exponent < -1075) return 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    return Number(scale >= 0 ? rounded(value.n * 2n ** BigInt(scale), value.d) : rounded(value.n, value.d * 2n ** BigInt(-scale))) * 2 ** -scale;
  }
  function validShown(display, exact, comparator) {
    if (!object(display) || typeof display.approximate !== "boolean" || display.rounded !== display.approximate) return false;
    const shown = fraction(display.value);
    if (!shown || exact.n && !shown.n || !exact.n && shown.n || normalized(display.text) !== comparator + (display.approximate ? "≈" : "") + normalized(display.value)) return false;
    const same = equal(shown, exact);
    if (display.approximate === same) return false;
    if (!same) {
      const match = /^(?:\+)?\d*(?:[.,](\d*))?(?:e([+-]?\d+))?$/i.exec(display.value);
      if (!match) return false;
      const quantum = fraction("1e" + (Number(match[2] || 0) - (match[1] || "").length));
      const difference = { n: shown.n * exact.d > exact.n * shown.d ? shown.n * exact.d - exact.n * shown.d : exact.n * shown.d - shown.n * exact.d, d: shown.d * exact.d };
      if (!quantum || compare(difference, divide(quantum, fraction("2"))) > 0) return false;
    }
    if (typeof display.fullValueText !== "string" || typeof display.fullValueComplete !== "boolean") return false;
    const match = /^([<>]=?|[≤≥])?\s*(.*?)(…)?$/.exec(display.fullValueText);
    const sign = match && ({ "<=": "≤", ">=": "≥" })[match[1]] || match?.[1] || "";
    const full = match && fraction(match[2]);
    if (!full || sign !== "" || Boolean(match[3]) && display.fullValueComplete) return false;
    if (display.fullValueComplete) return equal(full, exact);
    const digits = /^(?:\+)?\d*(?:[.,](\d*))?(?:e([+-]?\d+))?$/i.exec(match[2]);
    const quantum = digits && fraction("1e" + (Number(digits[2] || 0) - (digits[1] || "").length));
    return Boolean(quantum && compare(full, exact) < 0 && compare({ n: exact.n * full.d - full.n * exact.d, d: exact.d * full.d }, quantum) < 0);
  }
  function canonicalUnit(value) {
    const key = String(value ?? "").replace(/\s/g, "").replace(/μ/g, "µ").toLowerCase();
    return ({ "µmol/l": "µmol/L", "umol/l": "µmol/L", "umol": "µmol/L", "mmol/l": "mmol/L", "mg/l": "mg/L", "mg/dl": "mg/dL", "mg/mg": "mg/mg", "mmol/mmol": "mmol/mmol", "mol/mol": "mmol/mmol", "g/g": "mg/mg" })[key] || String(value ?? "");
  }
  function calciumFactor(unit, molar) {
    unit = canonicalUnit(unit);
    const calciumMass = fraction("40.078");
    const factors = { "mmol/L": fraction("1"), "µmol/L": fraction("0.001"), "mg/L": divide(fraction("1"), calciumMass), "mg/dL": divide(fraction("10"), calciumMass) };
    const factor = factors[unit];
    return factor && (molar ? factor : multiply(factor, calciumMass));
  }
  function validFrozen(snapshot) {
    if (!object(snapshot) || !safe(snapshot) || snapshot.schema !== "clcr-ca-cit" || snapshot.version !== 1 || snapshot.valid !== true || snapshot.sourceFormula !== FORMULA) return false;
    const input = snapshot.input, context = snapshot.context, exact = wire(snapshot.exactValue);
    if (!object(input) || !object(context) || !exact || !finite(snapshot.rawValue) || snapshot.rawValue < 0 || numberOf(exact) !== snapshot.rawValue || exact.n && !snapshot.rawValue || !["mg/mg", "mmol/mmol"].includes(snapshot.unit)) return false;
    const comparator = snapshot.comparator || "";
    if (!["", "<", "≤", ">", "≥"].includes(comparator) || snapshot.mode !== input.mode) return false;
    let expected, unit;
    if (input.mode === "reported") {
      const match = /^([<>]=?|[≤≥])?\s*(.+)$/.exec(String(input.reportedValue ?? "").trim());
      const sign = match && ({ "<=": "≤", ">=": "≥" })[match[1]] || match?.[1] || "";
      expected = match && fraction(match[2]);
      unit = canonicalUnit(input.reportedUnit);
      if (!["mg/mg", "mmol/mmol"].includes(unit)) return false;
      if (own(input, "reportedUnitOriginal") && (typeof input.reportedUnitOriginal !== "string" || canonicalUnit(input.reportedUnitOriginal) !== unit)) return false;
      if (!expected || !unit || sign !== comparator || comparator === "<" && !expected.n) return false;
    } else if (input.mode === "concentration") {
      const calcium = fraction(input.calciumValue), citrate = fraction(input.citrateValue);
      const molar = ["mmol/L", "µmol/L"].includes(canonicalUnit(input.citrateUnit)), scale = calciumFactor(input.calciumUnit, molar);
      const citScale = ({ "mg/L": "1", "mg/dL": "10", "mmol/L": "1", "µmol/L": "0.001" })[canonicalUnit(input.citrateUnit)];
      if (!calcium || !citrate?.n || !scale || !citScale || comparator || context.concentrationSameSpecimen === "different" || context.sameSpecimen === "different") return false;
      expected = divide(multiply(calcium, scale), multiply(citrate, fraction(citScale)));
      unit = molar ? "mmol/mmol" : "mg/mg";
    } else return false;
    if (!equal(expected, exact) || snapshot.unit !== unit || !validShown(snapshot.display, exact, comparator)) return false;
    if (context.ageYears !== null && (!finite(context.ageYears) || context.ageYears < 0) || ![null, "M", "F", "male", "female", ""].includes(context.sex)) return false;
    if (snapshot.referenceAvailable !== Boolean(snapshot.reference) || snapshot.referenceActive && !snapshot.reference) return false;
    if (!validAssessment(snapshot, exact, comparator)) return false;
    return typeof snapshot.comment === "string" && snapshot.comment.length > 0;
  }
  function selectedBand(policy, context) {
    const age = wire(context.ageExact) || fraction(context.ageYearsRaw), interval = context.ageInterval;
    if (!age || context.ageYears === null || numberOf(age) !== context.ageYears) return null;
    return policy.bands.find(item => compare(age, fraction(item.minimumAgeYearsInclusive)) >= 0 && compare(age, fraction(item.maximumAgeYearsExclusive)) < 0 && (!interval || interval.maximumAgeYearsExclusive <= item.maximumAgeYearsExclusive));
  }
  function validAssessment(snapshot, exact, comparator) {
    const policy = snapshot.referencePolicy, context = snapshot.context;
    if (snapshot.exact !== (comparator === "") || snapshot.zero !== (!exact.n && (!comparator || comparator === "≤")) || snapshot.classificationUnit !== "mg/mg" || snapshot.classificationValue !== (snapshot.unit === "mg/mg" ? snapshot.rawValue : null)) return false;
    if (snapshot.conversionConstants?.calciumMgPerMmol !== "40.078") return false;
    const age = wire(context.ageExact) || fraction(context.ageYearsRaw);
    if (context.ageYears !== null && (!age || numberOf(age) !== context.ageYears)) return false;
    if (!policy) return snapshot.profileId === null && snapshot.profileVersion === null && snapshot.policy === null && snapshot.source === null && snapshot.reference === null && snapshot.status === "unassessed" && snapshot.tone === "neutral" && snapshot.category === null && ["missing-profile", "invalid-profile"].includes(snapshot.reasonCode);
    if (!object(policy) || policy.formulaId !== FORMULA || policy.nativeUnit !== "mg/mg" || policy.quantity !== "urine-calcium-citrate-ratio" || !Array.isArray(policy.bands) || !object(policy.source) || !object(policy.restrictions) || policy.restrictions.allowMolarConversion !== false || policy.restrictions.upperInclusive !== true || !object(policy.notes) || !object(policy.categories)) return false;
    if (snapshot.profileId !== policy.id || snapshot.profileVersion !== policy.version || stable(snapshot.policy) !== stable({ id: policy.id, version: policy.version }) || stable(snapshot.source) !== stable(policy.source) || stable(snapshot.notes) !== stable(policy.notes) || stable(snapshot.restrictions) !== stable(policy.restrictions)) return false;
    const facts = context.knownFacts || {};
    const incomplete = facts.Cl24CollectionProblem === true || facts.knownIncomplete === true || ["collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionStorageFollowed"].some(key => facts[key] === false);
    const hours = String(context.collectionHours ?? "").trim(), duration = fraction(hours);
    const band = selectedBand(policy, context), row = band?.bySex?.[context.sex];
    let reason = "", note = "";
    if (snapshot.unit !== policy.nativeUnit) { reason = "molar-no-reference"; note = policy.notes.molar; }
    else if (snapshot.mode === "reported" && context.concentrationSameSpecimen === "different" && context.reportedSameSpecimen !== "confirmed") { reason = "different-specimens-reported"; note = policy.notes.differentSpecimens; }
    else if (context.collectionProblem === true || incomplete) { reason = "collection-problem"; note = policy.notes.collectionProblem; }
    else if (["historical-missing", "historical-unknown", "unknown"].includes(context.sampleSource) || ["historical-missing", "historical-unknown"].includes(context.durationSource) || context.durationKnown === false) { reason = "historical-unknown-sample"; note = policy.notes.historicalSample; }
    else if (!policy.restrictions.applicableSampleTypes?.includes(context.sampleType)) { reason = "unsupported-specimen"; note = policy.notes.unsupportedSample; }
    else if (hours && (!duration || !duration.n)) { reason = "invalid-duration"; note = policy.notes.invalidDuration; }
    else if (hours && !equal(duration, fraction(policy.restrictions.requiredCollectionHours))) { reason = "non-24h-collection"; note = policy.notes.otherDuration; }
    else if (context.ageYears === null) { reason = context.ageYearsRaw === null ? "missing-age" : "invalid-age"; note = policy.notes.missingAge; }
    else if (!band) {
      const minimum = Math.min(...policy.bands.map(item => item.minimumAgeYearsInclusive)), maximum = Math.max(...policy.bands.map(item => item.maximumAgeYearsExclusive));
      reason = context.ageYears < minimum ? "under-age" : context.ageYears >= maximum ? "adult-no-reference" : "no-age-band";
      note = reason === "under-age" ? policy.notes.underAge : reason === "adult-no-reference" ? policy.notes.adult : "Nie dobrano jednoznacznej normy Ca/Cit dla tego wieku.";
    } else if (!context.sex) { reason = "missing-sex"; note = policy.notes.missingSex; }
    if (reason) return snapshot.outOfRange === null && snapshot.reference === null && snapshot.referenceAvailable === false && snapshot.status === "unassessed" && snapshot.category === null && snapshot.tone === "neutral" && snapshot.reasonCode === reason && snapshot.comment === note;
    const reference = snapshot.reference;
    if (!row || !object(reference) || !finite(row.upper) || row.upper <= 0 || reference.upper !== row.upper || reference.nativeHigh !== row.upper || reference.unit !== "mg/mg" || reference.nativeUnit !== "mg/mg" || reference.upperInclusive !== true || !equal(wire(reference.exactUpper), fraction(row.upper))) return false;
    const limit = "≤" + String(row.upper).replace(".", ",");
    if (reference.limit !== limit || reference.range !== limit || reference.display?.limit !== limit || reference.display?.upper !== String(row.upper).replace(".", ",") || reference.display?.unit !== "mg/mg" || stable(reference.band) !== stable({ ...band, ...row, sex: context.sex }) || stable(reference.source) !== stable(policy.source) || reference.profileId !== policy.id || reference.profileVersion !== policy.version) return false;
    if (snapshot.referenceAvailable !== true) return false;
    let category = null;
    if (!snapshot.zero) {
      const relation = compare(exact, fraction(row.upper));
      if (!comparator) category = relation > 0 ? "above" : "within";
      else if (["<", "≤"].includes(comparator) && relation <= 0) category = "within";
      else if ([">", "≥"].includes(comparator) && (relation > 0 || relation === 0 && comparator === ">")) category = "above";
    }
    const expectedReason = snapshot.zero ? "zero-result" : category ? "" : "censored-multiple-categories";
    const expectedComment = snapshot.zero ? policy.notes.zero : category ? policy.notes[category] : policy.notes.censored;
    return snapshot.outOfRange === (category ? category === "above" : null) && snapshot.category === category && snapshot.status === (category || "unassessed") && snapshot.tone === (category ? policy.categories[category]?.tone : "neutral") && snapshot.reasonCode === expectedReason && snapshot.comment === expectedComment;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 60000) return null;
    try { const value = JSON.parse(encoded); return validFrozen(value) ? value : null; } catch (_) { return null; }
  }
  const parameterId = snapshot => snapshot?.unit === "mmol/mmol" ? "Ca_Cit_mol" : "Ca_Cit";
  const label = snapshot => snapshot?.unit === "mmol/mmol" ? MOL_LABEL : LABEL;
  const displayText = snapshot => String(snapshot?.display?.text ?? "").replace(/\./g, ",");
  const normText = snapshot => snapshot?.reference ? String(snapshot.reference.limit || snapshot.reference.range || "≤" + (snapshot.reference.upper ?? snapshot.reference.high ?? snapshot.reference.max)).replace(/\./g, ",") + " " + snapshot.unit : "";
  const assessment = snapshot => ({ normal: "within", high: "above", within: "within", above: "above" })[snapshot?.status] || "unassessed";
  function properties(snapshot) {
    return { id: parameterId(snapshot), testKey: "clcr:" + parameterId(snapshot), caCitSnapshot: snapshot, label: label(snapshot), valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, unit: snapshot.unit, comparator: snapshot.comparator || "", displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: assessment(snapshot) === "unassessed" ? null : assessment(snapshot) === "above", assessment: assessment(snapshot), category: snapshot.category ?? null, tone: snapshot.tone === "normal" ? "success" : snapshot.tone === "warn" ? "warning" : snapshot.tone, reference: snapshot.reference, referenceAvailable: snapshot.referenceAvailable, source: snapshot.source, interpretation: snapshot.comment, assumptions: snapshot.context.concentrationSameSpecimen === "assumed" || snapshot.context.sameSpecimen === "assumed" ? snapshot.notes?.sample || snapshot.referencePolicy?.notes?.sample || "" : "", boundary: snapshot.boundary || "", referenceProfileId: snapshot.profileId || "", referenceProfileVersion: snapshot.profileVersion ?? null };
  }
  function matchesDatapoint(dp, snapshot) {
    return Boolean(dp && snapshot && dp.sourceFormulaId === FORMULA && Object.entries(properties(snapshot)).every(([key, value]) => key === "caCitSnapshot" || stable(dp[key]) === stable(value)));
  }
  function augmentDatapoint(element, dp) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-ca-cit-snapshot"));
    if (!snapshot || dp?.sourceFormulaId !== FORMULA) return false;
    Object.assign(dp, properties(snapshot)); return true;
  }
  function applyLabResult(dp, lab) {
    lab.value = displayText(dp.caCitSnapshot); lab.valueNum = dp.rawValue; lab.testKey = dp.testKey;
    if (dp.comparator) delete lab.valueNum;
  }
  function referenceNote(dp) {
    const snapshot = dp?.caCitSnapshot;
    if (!snapshot || !validFrozen(snapshot) || !matchesDatapoint(dp, snapshot)) return "";
    return [NOTE_HEADER, "Wynik: " + displayText(snapshot) + " " + snapshot.unit + ".", "Pełny zapis: " + (snapshot.comparator || "") + snapshot.display.fullValueText + (snapshot.display.fullValueComplete ? "" : "…") + " " + snapshot.unit + ".", snapshot.reference ? "Norma pokazana przy wyniku: " + normText(snapshot) + "." : "Brak porównania z normą.", snapshot.comment, snapshot.context.ageYears !== null ? "Wiek użyty przy ocenie: " + snapshot.context.ageYears + " lat." : "", snapshot.source?.label ? "Źródło normy: " + snapshot.source.label + "." : "", snapshot.source?.url ? "Adres źródła: " + snapshot.source.url : "", snapshot.referencePolicy?.notes?.massBasis || ""].filter(Boolean).join("\n");
  }
  function savedAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "", start = body.indexOf("[VILDA_CLCR_CALCULATION_V1]"), end = body.indexOf("[/VILDA_CLCR_CALCULATION_V1]", start);
    if (start < 0 || end <= start || body.length > 100000) return null;
    try {
      const envelope = JSON.parse(body.slice(start + "[VILDA_CLCR_CALCULATION_V1]".length, end));
      const snapshot = readSnapshot(JSON.stringify(envelope.assessment?.caCitSnapshot)), lab = note.labResult || {};
      if (!snapshot || envelope.formulaId !== FORMULA || envelope.parameterKey !== parameterId(snapshot) || !matchesDatapoint(envelope.assessment, snapshot) || lab.test !== label(snapshot) || lab.unit !== snapshot.unit || normalized(lab.value) !== normalized(displayText(snapshot)) || normalized(lab.norm) !== normalized(normText(snapshot)) || (snapshot.comparator ? own(lab, "valueNum") : lab.valueNum !== snapshot.rawValue)) return null;
      return snapshot;
    } catch (_) { return null; }
  }
  function prepareValues(values = {}, context = {}, prior) {
    const frozen = prior && readSnapshot(JSON.stringify(prior)), result = {};
    for (const [id, key] of Object.entries(FIELD_MAP)) result[id] = frozen ? frozen.input[key] ?? DEFAULTS[id] : own(values, id) ? values[id] : DEFAULTS[id];
    const facts = frozen?.context || context.caCit || context;
    for (const [id, key] of Object.entries(CONTEXT_MAP)) if (frozen ? own(facts, key) : own(values, id) || own(facts, key)) result[id] = frozen ? facts[key] : own(values, id) ? values[id] : facts[key];
    if (!frozen && !own(values, "CACIT_inputMode")) {
      result.CACIT_calcium = values.U_Ca ?? ""; result.CACIT_citrate = values.U_Cit ?? "";
      const contexts = [values, facts, values.knownFacts, facts.knownFacts].filter(object);
      const aliases = { CACIT_sameSpecimen: ["concentrationSameSpecimen", "sameSpecimen", "sameUrineSample"], CACIT_sampleType: ["sampleType", "specimen"], CACIT_sampleSource: ["sampleSource"], CACIT_collectionHours: ["collectionHours", "durationHours", "hours", "Cl24DurationHours"], CACIT_durationKnown: ["durationKnown"], CACIT_durationSource: ["durationSource"], CACIT_collectionProblem: ["collectionProblem"] };
      for (const [id, keys] of Object.entries(aliases)) if (!own(result, id)) {
        const source = contexts.find(candidate => keys.some(key => own(candidate, key)));
        if (source) result[id] = source[keys.find(key => own(source, key))];
      }
      if (contexts.some(candidate => candidate.Cl24CollectionProblem === true || candidate.knownIncomplete === true)) result.CACIT_collectionProblem = true;
      // Placement in the old DZM section is not evidence of a specimen/time.
      result.CACIT_sampleType ??= "unknown"; result.CACIT_sampleSource ??= "historical-missing";
      result.CACIT_durationKnown ??= false; result.CACIT_collectionHours ??= ""; result.CACIT_durationSource ??= "historical-missing";
      for (const id of ["age", "ageMonths", "ageDays", "sex"]) if (own(values, id)) result[id] = values[id];
    }
    if (frozen) for (const id of ["CACIT_calciumUnit", "CACIT_citrateUnit", "CACIT_reportedUnit"]) result[id] = canonicalUnit(result[id]);
    return result;
  }
  function editableFields(values = {}) {
    const select = (id, labelText, options) => ({ id, label: labelText, type: "select", required: true, options: options.map(value => typeof value === "string" ? { value, label: value } : value) });
    const field = (id, labelText, unitFieldId) => ({ id, label: labelText, type: "text", required: true, unitFieldId, options: [] });
    return [select("CACIT_inputMode", "Sposób wpisania", [{ value: "concentration", label: "Oblicz ze stężeń" }, { value: "reported", label: "Gotowy wynik Ca/Cit" }]), ...(values.CACIT_inputMode === "reported" ? [field("CACIT_reportedValue", "Ca/Cit z wyniku badania", "CACIT_reportedUnit"), select("CACIT_reportedUnit", "Jednostka wyniku", ["mg/mg", "mmol/mmol"])] : [field("CACIT_calcium", "Wapń w moczu", "CACIT_calciumUnit"), select("CACIT_calciumUnit", "Jednostka wapnia", ["mmol/L", "µmol/L", "mg/L", "mg/dL"]), field("CACIT_citrate", "Cytryniany w moczu", "CACIT_citrateUnit"), select("CACIT_citrateUnit", "Jednostka cytrynianów", ["µmol/L", "mmol/L", "mg/L", "mg/dL"])])];
  }
  function captureFields(values) {
    const fields = editableFields(values), ids = new Set(fields.map(field => field.id));
    for (const id of Object.keys(values)) if (!ids.has(id)) fields.push({ id, label: id, type: typeof values[id] === "boolean" ? "checkbox" : "text", required: false, historicalContext: true, options: [] });
    return fields;
  }
  const hasSavedAssessment = note => typeof note?.body === "string" && note.body.includes(NOTE_HEADER);
  return Object.freeze({ FORMULA, LABEL, MOL_LABEL, NOTE_HEADER, FIELD_MAP, canonicalUnit, CONTEXT_MAP, DEFAULTS, readSnapshot, validFrozen, parameterId, label, displayText, normText, assessment, matchesDatapoint, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, prepareValues, editableFields, captureFields });
});
