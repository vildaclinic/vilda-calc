/* Frozen citrate daily results. History reads captured quantities and references;
 * it never calls the current clinical engine or borrows today's patient data. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrCitDzmPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const LABEL = "Dobowe wydalanie cytrynianów", TEST_KEY = "clcr:Cit_total24";
  const NOTE_HEADER = "Cytryniany w DZM — dane użyte w chwili zapisu:";
  const FIELD_MAP = Object.freeze({ CITDZM_inputMode: "mode", CITDZM_concentration: "concentration", CITDZM_concentrationUnit: "concentrationUnit", CITDZM_volume: "volume", CITDZM_volumeUnit: "volumeUnit", CITDZM_collectionHours: "hours", CITDZM_collectionSource: "durationSource", CITDZM_durationNeedsConfirmation: "durationNeedsConfirmation", CITDZM_reportedValue: "reportedValue", CITDZM_reportedUnit: "reportedUnit", CITDZM_reportingEntity: "reportingEntity", weight: "weightKg", height: "heightCm", sex: "sex" });
  const DEFAULTS = Object.freeze({ CITDZM_inputMode: "concentration", CITDZM_concentration: "", CITDZM_concentrationUnit: "mmol/L", CITDZM_volume: "", CITDZM_volumeUnit: "mL", CITDZM_collectionHours: "24", CITDZM_collectionSource: "assumed-24h", CITDZM_durationNeedsConfirmation: false, CITDZM_reportedValue: "", CITDZM_reportedUnit: "mmol/24h", CITDZM_reportingEntity: "unknown", CITDZM_unitConversions: "{}" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const clean = value => typeof value === "string" ? value.trim() : "";
  const copy = value => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function safeTree(value, depth = 0) {
    if (value === null || typeof value === "boolean" || finite(value) || typeof value === "string" && value.length <= 12000) return true;
    if (!value || typeof value !== "object" || depth > 15 || Object.keys(value).length > 300) return false;
    return Object.entries(Object.getOwnPropertyDescriptors(value)).every(([key, descriptor]) => !["__proto__", "prototype", "constructor"].includes(key) && !descriptor.get && !descriptor.set && safeTree(descriptor.value, depth + 1));
  }
  function fraction(value) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(",", ".");
    const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || text.length > 4096) return null;
    const decimals = match[2] ?? match[3] ?? "", exponent = Number(match[4] || 0) - decimals.length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    const n = BigInt((match[1] || "0") + decimals);
    return exponent >= 0 ? { n: n * 10n ** BigInt(exponent), d: 1n } : { n, d: 10n ** BigInt(-exponent) };
  }
  function exact(value) {
    if (!object(value) || !/^\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "") || BigInt(value.denominator) <= 0n) return null;
    return { n: BigInt(value.numerator), d: BigInt(value.denominator) };
  }
  const sameQuantity = (a, b) => Boolean(a && b && a.n * b.d === b.n * a.d);
  const product = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
  const quotient = (a, b) => b.n > 0n ? { n: a.n * b.d, d: a.d * b.n } : null;
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  function represented(value) {
    if (value.n === 0n) return 0;
    const rounded = (n, d) => { const q = n / d, r = n % d; return q + (r * 2n > d || r * 2n === d && q % 2n === 1n ? 1n : 0n); };
    let exponent = value.n.toString(2).length - value.d.toString(2).length;
    if (exponent >= 0 ? value.n < value.d * 2n ** BigInt(exponent) : value.n * 2n ** BigInt(-exponent) < value.d) exponent -= 1;
    if (exponent > 1023) return Infinity;
    if (exponent < -1075) return 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    return Number(scale >= 0 ? rounded(value.n * 2n ** BigInt(scale), value.d) : rounded(value.n, value.d * 2n ** BigInt(-scale))) * 2 ** -scale;
  }
  const MASS = Object.freeze({ citrate_ion: "189.099", citric_acid: "192.1235" });
  const unitFactor = unit => fraction(unit === "mg/dL" ? "10" : unit === "mL" || String(unit).startsWith("µmol/") ? "0.001" : "1");
  const massUnit = unit => String(unit).startsWith("mg/");
  function capturedArithmetic(snapshot) {
    const input = snapshot.input, conversions = input.unitConversions;
    if (!object(conversions) || Object.keys(conversions).some(key => !["concentration", "volume", "reportedValue"].includes(key))) return false;
    const units = { concentration: ["mg/L", "mg/dL", "mmol/L", "µmol/L"], volume: ["mL", "L"], reportedValue: ["mg/24h", "mmol/24h"] };
    const fields = { concentration: "concentrationUnit", volume: "volumeUnit", reportedValue: "reportedUnit" };
    function quantity(key) {
      const unit = input[fields[key]], operand = fraction(input[key]);
      if (!units[key].includes(unit) || !operand || !finite(represented(operand)) || operand.n > 0n && represented(operand) === 0 || key === "volume" && operand.n === 0n) return null;
      const entry = conversions[key];
      if (!entry) return operand;
      if (!object(entry) || Object.keys(entry).some(name => !["originalValue", "originalUnit", "convertedValue", "convertedUnit", "reportingEntity"].includes(name)) || String(entry.convertedValue) !== String(input[key]) || entry.convertedUnit !== unit || !units[key].includes(entry.originalUnit)) return null;
      const original = fraction(entry.originalValue);
      if (!original || !finite(represented(original)) || original.n > 0n && represented(original) === 0) return null;
      let converted = product(original, unitFactor(entry.originalUnit));
      const entity = entry.reportingEntity ?? input.reportingEntity;
      if (key !== "volume" && (massUnit(entry.originalUnit) || massUnit(unit)) && entity !== input.reportingEntity) return null;
      if (key !== "volume" && massUnit(entry.originalUnit) !== massUnit(unit)) {
        const mass = fraction(MASS[entity]); if (!mass) return null;
        converted = massUnit(entry.originalUnit) ? quotient(converted, mass) : product(converted, mass);
      }
      converted = quotient(converted, unitFactor(unit));
      return represented(converted) === represented(operand) ? converted : null;
    }
    const facts = input.knownFacts || {};
    if (facts.Cl24CollectionProblem === true || facts.knownIncomplete === true || ["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"].some(id => facts[id] === false || facts["ui_" + id + "_answer"] === "no")) return false;
    const parsedHours = fraction(input.hours);
    const hours = parsedHours && parsedHours.n > 0n && finite(represented(parsedHours)) && represented(parsedHours) > 0 && input.durationSource !== "invalid" ? parsedHours : null;
    if (hours ? !sameQuantity(hours, exact(snapshot.exactHours)) || snapshot.hours !== represented(hours) : snapshot.exactHours !== null || snapshot.hours !== null) return false;
    const reported = input.mode === "reported", active = reported ? "reportedValue" : "concentration", activeUnit = input[fields[active]];
    if (!["reported", "concentration"].includes(input.mode) || !["unknown", "citrate_ion", "citric_acid"].includes(input.reportingEntity)) return false;
    let daily = quantity(active);
    if (!daily) return false;
    daily = product(daily, unitFactor(activeUnit));
    if (!reported) {
      const volume = quantity("volume"), hours = fraction(input.hours);
      if (!volume || !hours || hours.n <= 0n || input.durationNeedsConfirmation) return false;
      daily = quotient(product(product(daily, product(volume, unitFactor(input.volumeUnit))), fraction("24")), hours);
    }
    if (!sameQuantity(daily, exact(snapshot.exactMain))) return false;
    const mass = fraction(MASS[input.reportingEntity]);
    const mg = massUnit(activeUnit) ? daily : mass ? product(daily, mass) : null;
    const mmol = massUnit(activeUnit) ? mass ? quotient(daily, mass) : null : daily;
    const basisValue = massUnit(activeUnit) ? ({ citrate_ion: "citrate-ion", citric_acid: "citric-acid" })[input.reportingEntity] || "unknown" : "citrate-amount";
    if (snapshot.reportingBasis !== basisValue || snapshot.unit !== (massUnit(activeUnit) ? "mg/24 h" : "mmol/24 h")) return false;
    for (const [key, amount] of [["Mg", mg], ["Mmol", mmol]]) {
      const recorded = snapshot["exactDaily" + key], raw = snapshot["daily" + key];
      if (amount ? !sameQuantity(amount, exact(recorded)) || (finite(represented(amount)) && (amount.n === 0n || represented(amount) > 0) ? raw !== represented(amount) : raw !== null) : recorded !== null || raw !== null) return false;
    }
    return true;
  }

  const unitText = snapshot => clean(snapshot?.unit || snapshot?.presentation?.unitText);
  const valueNum = snapshot => snapshot?.rawValue;
  const displayText = snapshot => clean(snapshot?.presentation?.valueText || snapshot?.display?.text);
  const normText = snapshot => snapshot?.referenceAvailable === true ? clean(snapshot.presentation?.referenceText) : "";
  const assessment = snapshot => ({ within: "within", boundary: "below", low: "below" })[snapshot?.status] || "unassessed";
  const toneText = snapshot => snapshot?.tone === "normal" ? "success" : snapshot?.tone;
  function basis(snapshot) { return clean(snapshot?.reportingBasis) || "unknown"; }
  function referenceRecord(snapshot) {
    const reference = snapshot?.reference;
    return reference ? { ...copy(reference), bounds: { low: reference.lower, high: null, lowInclusive: reference.lowerInclusive === true, highInclusive: false }, source: { id: reference.sourceId, label: reference.sourceLabel, url: reference.sourceUrl }, profileVersion: snapshot.referencePolicy?.version ?? null } : null;
  }
  function capturedReference(snapshot) {
    const reference = snapshot.reference;
    if (!reference) return snapshot.referenceAvailable === false && equal(snapshot.references, []) && snapshot.referenceActive === false;
    if (snapshot.referenceAvailable !== true || reference.kind !== "lower" || reference.min !== reference.lower || reference.upper !== null || reference.max !== null || reference.exactUpper !== null || reference.upperInclusive !== false || reference.sourceUpper !== null) return false;
    const policy = snapshot.referencePolicy, input = snapshot.input;
    if (!object(policy) || policy.schema !== "clcr-cit-dzm-reference-policy" || !finite(input.ageYears) || input.ageYears < 0 || reference.unit !== snapshot.unit || reference.sourceId !== policy.sourceId || reference.lowerInclusive !== (input.ageYears < policy.adultAgeYears ? policy.pediatricLowerInclusive : policy.adultLowerInclusive) || reference.operator !== (input.ageYears < policy.adultAgeYears ? ">" : "≥") || reference.adultCap !== null || reference.capped !== false) return false;
    const source = policy.sources?.find(item => item.id === policy.sourceId);
    if (!source || reference.sourceLabel !== source.label || reference.sourceUrl !== source.url || reference.sample !== source.sample || reference.method !== source.method || reference.population !== source.population || !equal(snapshot.sources, policy.sources) || !equal(snapshot.population, policy.population)) return false;
    const pediatric = input.ageYears < policy.adultAgeYears;
    if (!["M", "F"].includes(input.sex) || input.ageYears < policy.pediatricMinAgeYears || reference.sex !== input.sex) return false;
    const sourceLimit = (pediatric ? policy.pediatricLowerIndexedMmolPerDay : policy.adultLowerMmolPerDay)?.[input.sex];
    const limit = fraction(sourceLimit), index = fraction(policy.bodySurfaceIndex);
    if (!limit || limit.n <= 0n || !index || index.n <= 0n || !finite(policy.adultAgeYears) || reference.sourceLower !== sourceLimit) return false;
    let squared = product(limit, limit);
    if (pediatric) {
      const weight = fraction(input.weightKg), height = fraction(input.heightCm);
      if (!weight || !height || weight.n <= 0n || height.n <= 0n || reference.bsaMethod !== "Mosteller") return false;
      const bsaSquared = quotient(product(weight, height), fraction("3600"));
      if (!sameQuantity(bsaSquared, exact(snapshot.exactBsaSquared)) || !sameQuantity(bsaSquared, exact(reference.exactBsaSquared)) || (!finite(snapshot.bsaM2) || Math.abs(snapshot.bsaM2 - Math.sqrt(represented(bsaSquared))) > Math.max(Number.MIN_VALUE, snapshot.bsaM2 * Number.EPSILON * 4)) || reference.bsaM2 !== snapshot.bsaM2) return false;
      squared = quotient(product(squared, bsaSquared), product(index, index));
    }
    if (snapshot.unit === "mg/24 h") {
      const mass = fraction(MASS[input.reportingEntity]); if (!mass) return false;
      squared = product(squared, product(mass, mass));
    }
    if (!sameQuantity(squared, exact(reference.exactLowerSquared))) return false;
    const lower = exact(reference.exactLower);
    if (lower && !sameQuantity(product(lower, lower), squared)) return false;
    const numericLower = lower ? represented(lower) : Math.sqrt(represented(squared));
    if (!finite(reference.lower) || Math.abs(numericLower - reference.lower) > Math.max(Number.MIN_VALUE, numericLower * Number.EPSILON * 4)) return false;
    if (!equal(snapshot.references, [reference]) || !equal(snapshot.policy, { id: policy.id, version: policy.version }) || snapshot.presentation.lower !== reference.lower || !equal(snapshot.presentation.exactLower, reference.exactLower) || !equal(snapshot.presentation.exactLowerSquared, reference.exactLowerSquared)) return false;
    if (snapshot.presentation.referenceValue !== reference.operator + snapshot.presentation.lowerValueText || snapshot.presentation.referenceText !== snapshot.presentation.referenceValue + " " + snapshot.unit || snapshot.referenceText !== snapshot.presentation.referenceText || reference.text !== snapshot.presentation.referenceValue || reference.lowerText !== snapshot.presentation.lowerValueText) return false;
    const shownLower = fraction(snapshot.presentation.lowerValueText);
    const places = snapshot.presentation.precision;
    if (!shownLower || !Number.isInteger(places) || places < 0 || places > 1100) return false;
    const textParts = /^(\d+)(?:[.,](\d+))?(?:e([+-]?\d+))?$/i.exec(snapshot.presentation.lowerValueText);
    if (!textParts) return false;
    const displayStep = 10 ** (Number(textParts[3] || 0) - (textParts[2] || "").length);
    if (Math.abs(represented(shownLower) - reference.lower) > Math.max(Number.MIN_VALUE, 0.500001 * displayStep, reference.lower * Number.EPSILON * 4)) return false;
    const main = exact(snapshot.exactMain), shownMain = fraction(displayText(snapshot).replace(/^≈\s*/, ""));
    const relation = lower ? compare(main, lower) : compare(product(main, main), squared);
    return relation === compare(shownMain, shownLower);
  }
  function capturedDisplay(snapshot, main) {
    const label = displayText(snapshot), text = label.replace(/^≈\s*/, ""), shown = fraction(text);
    if (!shown || (shown.n === 0n) !== (main.n === 0n) || !equal(snapshot.presentation.exactValue, snapshot.exactMain)) return false;
    const same = sameQuantity(shown, main);
    if (snapshot.presentation.valueApproximate !== !same || label.startsWith("≈") && same) return false;
    const match = /^(\d+)(?:[.,](\d+))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match) return false;
    const scale = Number(match[3] || 0) - (match[2] || "").length;
    const quantum = scale >= 0 ? { n: 10n ** BigInt(scale), d: 1n } : { n: 1n, d: 10n ** BigInt(-scale) };
    const difference = { n: shown.n * main.d - main.n * shown.d, d: shown.d * main.d };
    if (difference.n < 0n) difference.n = -difference.n;
    return compare(difference, quotient(quantum, fraction("2"))) <= 0;
  }

  function capturedAssessment(snapshot) {
    const policy = snapshot.referencePolicy, input = snapshot.input, main = exact(snapshot.exactMain);
    if (!main) return false;
    if (!snapshot.reference) {
      const hours = exact(snapshot.exactHours), weight = fraction(input.weightKg), height = fraction(input.heightCm);
      const fullDay = hours && sameQuantity(hours, fraction("24"));
      const hasAge = finite(input.ageYears) && input.ageYears >= 0 && (input.agePrecision !== "completed-years" || Number.isInteger(input.ageYears));
      const notes = policy?.notes || {};
      const reason = !policy ? "Wynik pozostaje bez automatycznego porównania z normą." : !fullDay ? input.mode === "reported" ? hours ? notes.reportedNon24 : notes.reportedUnknownDuration : notes.non24 : !snapshot.exactDailyMmol ? notes.unknownEntity : !hasAge ? notes.noAge : input.ageYears < policy.pediatricMinAgeYears ? notes.infant : !["M", "F"].includes(input.sex) ? notes.noSex : input.ageYears < policy.adultAgeYears && (!weight || !height || !weight.n || !height.n || !finite(snapshot.bsaM2) || snapshot.bsaM2 <= 0) ? notes.noBsa : "";
      const zero = Boolean(policy && main.n === 0n);
      return Boolean(reason) && snapshot.status === (zero ? "zero" : "unassessed") && snapshot.tone === "neutral" && snapshot.outOfRange === null && snapshot.referenceActive === false && snapshot.referenceReason === reason && snapshot.interpretation === (zero ? notes.zeroDetails : reason);
    }
    const squared = exact(snapshot.reference.exactLowerSquared), hours = exact(snapshot.exactHours);
    if (!policy || !squared || !hours || !sameQuantity(hours, fraction("24")) || input.durationNeedsConfirmation) return false;
    const relation = compare(product(main, main), squared), inclusive = snapshot.reference.lowerInclusive === true;
    const status = main.n === 0n ? "zero" : relation === 0 && !inclusive ? "boundary" : relation < 0 ? "low" : "within";
    const tone = status === "zero" ? "neutral" : status === "within" ? "normal" : "warning";
    const outOfRange = status === "zero" ? null : status !== "within";
    return snapshot.status === status && snapshot.tone === tone && snapshot.outOfRange === outOfRange && snapshot.referenceActive === (status !== "zero") && snapshot.interpretation === policy.notes?.[status === "zero" ? "zeroDetails" : status];
  }

  // Structural and arithmetic checks are completed against the captured schema,
  // never against a mutable reference policy or formatter from the engine.
  function validSnapshot(snapshot) {
    if (!object(snapshot) || !safeTree(snapshot) || snapshot.schema !== "clcr-cit-dzm" || snapshot.version !== 1 || snapshot.valid !== true || !object(snapshot.input)) return false;
    if (!capturedArithmetic(snapshot)) return false;
    if (!["mg/24 h", "mmol/24 h"].includes(unitText(snapshot)) || !finite(valueNum(snapshot)) || valueNum(snapshot) < 0) return false;
    if (!["citrate-ion", "citric-acid", "unknown", "citrate-amount"].includes(basis(snapshot))) return false;
    const main = exact(snapshot.exactMain);
    if (!main || !finite(represented(main)) || represented(main) !== valueNum(snapshot) || main.n > 0n && valueNum(snapshot) === 0) return false;
    if (!object(snapshot.presentation) || snapshot.presentation.rawValue !== valueNum(snapshot) || snapshot.presentation.unitText !== snapshot.unit || snapshot.display?.text !== displayText(snapshot)) return false;
    if (!capturedDisplay(snapshot, main) || !capturedReference(snapshot) || !capturedAssessment(snapshot)) return false;
    if (!["success", "warning", "danger", "neutral"].includes(toneText(snapshot)) || typeof snapshot.interpretation !== "string") return false;
    if ((snapshot.referenceAvailable === true || snapshot.sourceReferenceAvailable === true)) {
      const reference = snapshot.reference;
      if (!object(reference) || !finite(reference.lower) || !(reference.lower > 0) || !normText(snapshot)) return false;
      const lower = exact(reference.exactLower), squared = exact(reference.exactLowerSquared);
      if (!lower && !squared) return false;
      const relation = lower ? compare(main, lower) : compare(product(main, main), squared);
      const lowerInclusive = reference.lowerInclusive === true;
      const outside = relation < 0 || relation === 0 && !lowerInclusive;
      if (snapshot.referenceActive !== false && (snapshot.outOfRange !== outside || assessment(snapshot) !== (outside ? "below" : "within"))) return false;
      if (snapshot.referenceActive === false && snapshot.outOfRange != null) return false;
    } else if (snapshot.outOfRange != null || assessment(snapshot) !== "unassessed" || toneText(snapshot) !== "neutral") return false;
    return true;
  }
  function readSnapshot(serialized) {
    if (typeof serialized !== "string" || serialized.length > 50000) return null;
    try { const parsed = JSON.parse(serialized); return validSnapshot(parsed) ? parsed : null; } catch (_) { return null; }
  }
  function matchesDatapoint(datapoint, snapshot) {
    return validSnapshot(snapshot) && datapoint?.sourceFormulaId === "Cit_mgkg" && ["Cit_total24", TEST_KEY].includes(datapoint.id || datapoint.testKey) && datapoint.valueNum === valueNum(snapshot) && datapoint.rawValue === valueNum(snapshot) && datapoint.unit === unitText(snapshot) && datapoint.displayValue === displayText(snapshot) && datapoint.norm === normText(snapshot) && datapoint.basis === basis(snapshot) && datapoint.outOfRange === snapshot.outOfRange && datapoint.assessment === assessment(snapshot) && datapoint.tone === toneText(snapshot) && datapoint.interpretation === snapshot.interpretation && equal(datapoint.reference, referenceRecord(snapshot));
  }
  function augmentDatapoint(element, datapoint) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-cit-dzm-snapshot"));
    if (!snapshot || !datapoint) return false;
    Object.assign(datapoint, { id: "Cit_total24", testKey: TEST_KEY, sourceFormulaId: "Cit_mgkg", label: LABEL, rawValue: valueNum(snapshot), valueNum: valueNum(snapshot), displayValue: displayText(snapshot), unit: unitText(snapshot), basis: basis(snapshot), comparator: "", norm: normText(snapshot), reference: referenceRecord(snapshot), tone: toneText(snapshot), assessment: assessment(snapshot), outOfRange: snapshot.outOfRange, interpretation: snapshot.interpretation, category: null, referenceProfileId: snapshot.policy?.id || "", referenceProfileVersion: snapshot.policy?.version ?? null, citDzmSnapshot: snapshot });
    return true;
  }
  function applyLabResult(datapoint, lab) {
    const snapshot = datapoint?.citDzmSnapshot;
    if (!matchesDatapoint(datapoint, snapshot)) return false;
    Object.assign(lab, { test: LABEL, testKey: TEST_KEY, value: displayText(snapshot), valueNum: valueNum(snapshot), unit: unitText(snapshot) });
    const norm = normText(snapshot); if (norm) lab.norm = norm; else delete lab.norm;
    return true;
  }
  function referenceNote(datapoint) {
    const snapshot = datapoint?.citDzmSnapshot;
    if (!matchesDatapoint(datapoint, snapshot)) return "";
    const basisLabel = { "citrate-ion": "jon cytrynianowy", "citric-acid": "kwas cytrynowy bezwodny", "unknown": "niepodana", "citrate-amount": "ilość molowa cytrynianów" }[basis(snapshot)];
    return [NOTE_HEADER, `Wynik: ${displayText(snapshot)} ${unitText(snapshot)}.`, normText(snapshot) ? `Norma użyta przy zapisie: ${normText(snapshot)}.` : "Brak zapisanej normy.", `Opis wyniku: ${snapshot.interpretation}`, `Postać wyniku: ${basisLabel}.`, ...[snapshot.notes?.assumption, snapshot.reference?.sourceLabel ? `Źródło: ${snapshot.reference.sourceLabel}.` : ""].filter(Boolean)].join("\n");
  }
  function savedAssessment(note) {
    const body = clean(note?.body), start = body.indexOf("[VILDA_CLCR_CALCULATION_V1]"), end = body.indexOf("[/VILDA_CLCR_CALCULATION_V1]", start);
    if (start < 0 || end <= start || body.length > 100000) return null;
    let envelope;
    try { envelope = JSON.parse(body.slice(start + "[VILDA_CLCR_CALCULATION_V1]".length, end).trim()); } catch (_) { return null; }
    const snapshot = readSnapshot(JSON.stringify(envelope?.assessment?.citDzmSnapshot));
    if (!snapshot || envelope.formulaId !== "Cit_mgkg" || !["Cit_total24", TEST_KEY].includes(envelope.parameterKey)) return null;
    const lab = note.labResult || {}, expected = envelope.assessment;
    if (!matchesDatapoint(expected, snapshot) || lab.test !== LABEL || lab.testKey && lab.testKey !== TEST_KEY || lab.unit !== unitText(snapshot) || lab.valueNum !== valueNum(snapshot) || clean(lab.value).replace(".", ",") !== displayText(snapshot).replace(".", ",") || clean(lab.norm) !== normText(snapshot)) return null;
    return snapshot;
  }
  const hasSavedAssessment = note => clean(note?.body).includes(NOTE_HEADER);
  function prepareValues(values = {}, context = {}, prior = null) {
    const result = { ...values }, input = prior?.input || {};
    for (const [id, key] of Object.entries(FIELD_MAP)) if (!own(result, id)) result[id] = input[key] ?? DEFAULTS[id] ?? "";
    result.CITDZM_unitConversions ??= JSON.stringify(input.unitConversions || {});
    for (const [id, value] of Object.entries(input.knownFacts || {})) if (!own(result, id) && ["string", "boolean", "number"].includes(typeof value)) result[id] = value;
    if (!own(result, "age")) result.age = input.ageYears == null ? "" : String(input.ageYears);
    // A missing historical clock is never silently upgraded to a fresh24h.
    if (!prior && !own(values, "CITDZM_collectionHours")) {
      result.CITDZM_collectionHours = context.collectionHours ?? "";
      result.CITDZM_collectionSource = result.CITDZM_collectionHours === "" ? "historical-missing" : "captured";
      result.CITDZM_durationNeedsConfirmation = result.CITDZM_collectionHours === "";
    }
    return result;
  }
  function editableFields(values = {}) {
    const field = (id, label, required = false, unitFieldId = "", options = []) => ({ id, label, required, unitFieldId, historicalContext: false, type: options.length ? "select" : "text", options: options.map(value => object(value) ? value : ({ value, label: value })) });
    return [field("CITDZM_inputMode", "Sposób wprowadzania", false, "", [{ value: "concentration", label: "Oblicz ze stężenia" }, { value: "reported", label: "Gotowy wynik" }]), ...(values.CITDZM_inputMode === "reported" ? [field("CITDZM_reportedValue", "Gotowy wynik dobowy", true, "CITDZM_reportedUnit"), field("CITDZM_reportedUnit", "Jednostka wyniku", false, "", ["mmol/24h", "mg/24h"])] : [field("CITDZM_concentration", "Cytryniany w moczu", true, "CITDZM_concentrationUnit"), field("CITDZM_concentrationUnit", "Jednostka stężenia", false, "", ["mg/L", "mg/dL", "mmol/L", "µmol/L"]), field("CITDZM_volume", "Objętość zbiórki", true, "CITDZM_volumeUnit"), field("CITDZM_volumeUnit", "Jednostka objętości", false, "", ["mL", "L"])]), field("CITDZM_reportingEntity", "Postać masowa w raporcie", false, "", [{ value: "unknown", label: "Nie podano" }, { value: "citrate_ion", label: "Jon cytrynianowy" }, { value: "citric_acid", label: "Kwas cytrynowy" }]), field("CITDZM_collectionHours", "Czas zbiórki · godziny", values.CITDZM_inputMode !== "reported"), field("weight", "Masa ciała w dniu badania · kg"), field("height", "Wzrost w dniu badania · cm")];
  }
  function captureFields(values, previous = []) {
    const contextFields = ["age", "ageMonths", "ageDays", "sex"].filter(id => own(values, id)).map(id => ({ ...(previous.find(field => field.id === id) || { id, label: ({ age: "Wiek w dniu badania", ageMonths: "Miesiące", ageDays: "Dni", sex: "Płeć w dniu badania" })[id], type: "text" }), required: false, historicalContext: true }));
    return [...editableFields(values), ...contextFields];
  }
  function savedBasis(note, unit) {
    const snapshot = savedAssessment(note); if (snapshot) return basis(snapshot);
    if (/mmol\//.test(unit || "")) return "citrate-amount";
    const body = clean(note?.body), start = body.indexOf("[VILDA_CLCR_CALCULATION_V1]"), end = body.indexOf("[/VILDA_CLCR_CALCULATION_V1]", start);
    if (start >= 0 && end > start) try { const old = JSON.parse(body.slice(start + "[VILDA_CLCR_CALCULATION_V1]".length, end).trim()); return old.formulaId === "Cit_mgkg" && own(old.values, "U_Cit") ? "citric-acid" : "unknown"; } catch (_) { /* legacy incomplete capture */ }
    return "unknown";
  }
  return Object.freeze({ LABEL, TEST_KEY, NOTE_HEADER, FIELD_MAP, DEFAULTS, readSnapshot, validSnapshot, matchesDatapoint, valueNum, unitText, displayText, normText, assessment, basis, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, prepareValues, editableFields, captureFields, savedBasis });
});
