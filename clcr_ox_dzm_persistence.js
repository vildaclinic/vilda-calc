/* Frozen oxalate daily results. History reads captured quantities and references;
 * it never calls the current clinical engine or borrows today's patient data. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrOxDzmPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const LABEL = "Dobowe wydalanie szczawianów", TEST_KEY = "clcr:Ox_total24";
  const NOTE_HEADER = "Szczawiany w DZM — dane użyte w chwili zapisu:";
  const FIELD_MAP = Object.freeze({ OXDZM_inputMode: "mode", OXDZM_concentration: "concentration", OXDZM_concentrationUnit: "concentrationUnit", OXDZM_volume: "volume", OXDZM_volumeUnit: "volumeUnit", OXDZM_collectionHours: "hours", OXDZM_collectionSource: "durationSource", OXDZM_durationNeedsConfirmation: "durationNeedsConfirmation", OXDZM_reportedValue: "reportedValue", OXDZM_reportedUnit: "reportedUnit", OXDZM_reportingEntity: "reportingEntity", weight: "weightKg", height: "heightCm", egfr: "egfr" });
  const DEFAULTS = Object.freeze({ OXDZM_inputMode: "concentration", OXDZM_concentration: "", OXDZM_concentrationUnit: "µmol/L", OXDZM_volume: "", OXDZM_volumeUnit: "mL", OXDZM_collectionHours: "24", OXDZM_collectionSource: "assumed-24h", OXDZM_durationNeedsConfirmation: false, OXDZM_reportedValue: "", OXDZM_reportedUnit: "mmol/24h", OXDZM_reportingEntity: "unknown", OXDZM_unitConversions: "{}" });
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
  const MASS = Object.freeze({ oxalate_ion: "88.019", oxalic_acid: "90.0349" });
  const unitFactor = unit => fraction(unit === "mg/dL" ? "10" : unit === "mL" || String(unit).startsWith("µmol/") ? "0.001" : "1");
  const massUnit = unit => String(unit).startsWith("mg/");
  function capturedArithmetic(snapshot) {
    const input = snapshot.input, conversions = input.unitConversions;
    if (!object(conversions) || Object.keys(conversions).some(key => !["concentration", "volume", "reportedValue"].includes(key))) return false;
    const units = { concentration: ["mg/L", "mg/dL", "mmol/L", "µmol/L"], volume: ["mL", "L"], reportedValue: ["mg/24h", "mmol/24h", "µmol/24h"] };
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
    const reported = input.mode === "reported", active = reported ? "reportedValue" : "concentration", activeUnit = input[fields[active]];
    if (!["reported", "concentration"].includes(input.mode) || !["unknown", "oxalate_ion", "oxalic_acid"].includes(input.reportingEntity)) return false;
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
    const basisValue = massUnit(activeUnit) ? ({ oxalate_ion: "oxalate-ion", oxalic_acid: "oxalic-acid" })[input.reportingEntity] || "unknown" : "oxalate-amount";
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
  const assessment = snapshot => ({ within: "within", caution: "within", high: "above", marked: "above", boundary: "above", above: "above", low: "below" })[snapshot?.status] || "unassessed";
  const toneText = snapshot => snapshot?.tone === "normal" ? "success" : snapshot?.tone;
  function basis(snapshot) { return clean(snapshot?.reportingBasis) || "unknown"; }
  function referenceRecord(snapshot) {
    const reference = snapshot?.reference;
    return reference ? { ...copy(reference), bounds: { low: null, high: reference.upper, lowInclusive: false, highInclusive: reference.upperInclusive === true }, source: { id: reference.sourceId, label: reference.sourceLabel, url: reference.sourceUrl }, profileVersion: snapshot.referencePolicy?.version ?? null } : null;
  }
  function capturedReference(snapshot) {
    const reference = snapshot.reference;
    if (!reference) return snapshot.referenceAvailable === false;
    const policy = snapshot.referencePolicy, input = snapshot.input;
    if (!object(policy) || policy.schema !== "clcr-ox-dzm-reference-policy" || !finite(input.ageYears) || input.ageYears < 0 || reference.unit !== snapshot.unit || reference.sourceId !== policy.sourceId || reference.upperInclusive !== policy.upperInclusive || reference.operator !== "<" || reference.adultCap !== null || reference.capped !== false) return false;
    const limit = fraction(policy.upperMmolPerDay), index = fraction(policy.bodySurfaceIndex);
    if (!limit || limit.n <= 0n || !index || index.n <= 0n || !finite(policy.adultAgeYears)) return false;
    const pediatric = input.ageYears < policy.adultAgeYears;
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
    if (!sameQuantity(squared, exact(reference.exactUpperSquared))) return false;
    const upper = exact(reference.exactUpper);
    if (upper && !sameQuantity(product(upper, upper), squared)) return false;
    const numericUpper = upper ? represented(upper) : Math.sqrt(represented(squared));
    if (!finite(reference.upper) || Math.abs(numericUpper - reference.upper) > Math.max(Number.MIN_VALUE, numericUpper * Number.EPSILON * 4)) return false;
    if (!equal(snapshot.references, [reference]) || !equal(snapshot.policy, { id: policy.id, version: policy.version }) || snapshot.presentation.upper !== reference.upper || !equal(snapshot.presentation.exactUpper, reference.exactUpper) || !equal(snapshot.presentation.exactUpperSquared, reference.exactUpperSquared)) return false;
    if (snapshot.presentation.referenceValue !== "<" + snapshot.presentation.upperValueText || snapshot.presentation.referenceText !== snapshot.presentation.referenceValue + " " + snapshot.unit || snapshot.referenceText !== snapshot.presentation.referenceText || reference.text !== snapshot.presentation.referenceValue || reference.upperText !== snapshot.presentation.upperValueText) return false;
    const shownUpper = fraction(snapshot.presentation.upperValueText);
    const places = snapshot.presentation.precision;
    if (!shownUpper || !Number.isInteger(places) || places < 0 || places > 1100) return false;
    const textParts = /^(\d+)(?:[.,](\d+))?(?:e([+-]?\d+))?$/i.exec(snapshot.presentation.upperValueText);
    if (!textParts) return false;
    const displayStep = 10 ** (Number(textParts[3] || 0) - (textParts[2] || "").length);
    if (Math.abs(represented(shownUpper) - reference.upper) > Math.max(Number.MIN_VALUE, 0.500001 * displayStep, reference.upper * Number.EPSILON * 4)) return false;
    const main = exact(snapshot.exactMain), shownMain = fraction(displayText(snapshot).replace(/^≈\s*/, ""));
    const relation = upper ? compare(main, upper) : compare(product(main, main), squared);
    return relation === compare(shownMain, shownUpper);
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
    if (!snapshot.reference) return snapshot.status === "unassessed" && snapshot.tone === "neutral" && snapshot.outOfRange === null && snapshot.referenceActive === false;
    const policy = snapshot.referencePolicy, input = snapshot.input, main = exact(snapshot.exactMain), squared = exact(snapshot.reference.exactUpperSquared);
    if (!policy || !main || !squared || snapshot.hours !== 24) return false;
    const facts = input.knownFacts || {};
    if (facts.Cl24CollectionProblem === true || facts.knownIncomplete === true || ["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"].some(id => facts[id] === false || facts["ui_" + id + "_answer"] === "no")) return false;
    const upper = fraction(policy.upperMmolPerDay), pediatric = input.ageYears < policy.adultAgeYears;
    const side = limit => {
      const threshold = fraction(limit); if (!threshold || threshold.n <= 0n) return null;
      return compare(product(main, main), product(squared, quotient(product(threshold, threshold), product(upper, upper))));
    };
    const relation = compare(product(main, main), squared), marked = side(pediatric ? policy.phSuspicionAboveIndexedMmol : policy.stone?.adultMarkedAboveMmol);
    if (marked === null) return false;
    let status = marked > 0 ? "marked" : relation === 0 ? "boundary" : relation > 0 ? "high" : "within";
    let tone = marked > 0 ? "danger" : relation >= 0 ? "warning" : "normal", outOfRange = relation >= 0, active = true;
    let interpretation = policy.notes?.[marked > 0 ? "marked" : relation === 0 ? "boundary" : relation > 0 ? "high" : "within"];
    if (!pediatric && relation < 0 && side(policy.stone?.adultIncreasedAboveMmol) > 0) {
      status = "caution"; tone = "warning";
      interpretation = "W ocenie kamicy EAU uznaje już wydalanie >" + snapshot.presentation.stoneValueText + " " + snapshot.unit + " za zwiększone.";
    }
    const gfr = fraction(input.egfr ?? facts.egfr ?? facts.eGFR), lowGfr = fraction(policy.lowEgfrBelow);
    if (gfr && lowGfr && compare(gfr, lowGfr) < 0 && relation < 0) { status = "limited"; tone = "neutral"; outOfRange = null; active = false; interpretation = policy.notes?.lowEgfrExplanation; }
    return snapshot.status === status && snapshot.tone === tone && snapshot.outOfRange === outOfRange && snapshot.referenceActive === active && snapshot.interpretation === interpretation;
  }

  // Structural and arithmetic checks are completed against the captured schema,
  // never against a mutable reference policy or formatter from the engine.
  function validSnapshot(snapshot) {
    if (!object(snapshot) || !safeTree(snapshot) || snapshot.schema !== "clcr-ox-dzm" || snapshot.version !== 1 || snapshot.valid !== true || !object(snapshot.input)) return false;
    if (!capturedArithmetic(snapshot)) return false;
    if (!["mg/24 h", "mmol/24 h"].includes(unitText(snapshot)) || !finite(valueNum(snapshot)) || valueNum(snapshot) < 0) return false;
    if (!["oxalate-ion", "oxalic-acid", "unknown", "oxalate-amount"].includes(basis(snapshot))) return false;
    const main = exact(snapshot.exactMain);
    if (!main || !finite(represented(main)) || represented(main) !== valueNum(snapshot) || main.n > 0n && valueNum(snapshot) === 0) return false;
    if (!object(snapshot.presentation) || snapshot.presentation.rawValue !== valueNum(snapshot) || snapshot.presentation.unitText !== snapshot.unit || snapshot.display?.text !== displayText(snapshot)) return false;
    if (!capturedDisplay(snapshot, main) || !capturedReference(snapshot) || !capturedAssessment(snapshot)) return false;
    if (!["success", "warning", "danger", "neutral"].includes(toneText(snapshot)) || typeof snapshot.interpretation !== "string") return false;
    if ((snapshot.referenceAvailable === true || snapshot.sourceReferenceAvailable === true)) {
      const reference = snapshot.reference;
      if (!object(reference) || !finite(reference.upper) || !(reference.upper > 0) || !normText(snapshot)) return false;
      const upper = exact(reference.exactUpper), squared = exact(reference.exactUpperSquared);
      if (!upper && !squared) return false;
      const relation = upper ? compare(main, upper) : compare(product(main, main), squared);
      const upperInclusive = reference.upperInclusive === true;
      const outside = relation > 0 || relation === 0 && !upperInclusive;
      if (snapshot.referenceActive !== false && (snapshot.outOfRange !== outside || assessment(snapshot) !== (outside ? "above" : "within"))) return false;
      if (snapshot.referenceActive === false && snapshot.outOfRange != null) return false;
    } else if (snapshot.outOfRange != null || assessment(snapshot) !== "unassessed" || toneText(snapshot) !== "neutral") return false;
    return true;
  }
  function readSnapshot(serialized) {
    if (typeof serialized !== "string" || serialized.length > 50000) return null;
    try { const parsed = JSON.parse(serialized); return validSnapshot(parsed) ? parsed : null; } catch (_) { return null; }
  }
  function matchesDatapoint(datapoint, snapshot) {
    return validSnapshot(snapshot) && datapoint?.sourceFormulaId === "Ox_mgkg" && ["Ox_total24", TEST_KEY].includes(datapoint.id || datapoint.testKey) && datapoint.valueNum === valueNum(snapshot) && datapoint.rawValue === valueNum(snapshot) && datapoint.unit === unitText(snapshot) && datapoint.displayValue === displayText(snapshot) && datapoint.norm === normText(snapshot) && datapoint.basis === basis(snapshot) && datapoint.outOfRange === snapshot.outOfRange && datapoint.assessment === assessment(snapshot) && datapoint.tone === toneText(snapshot) && datapoint.interpretation === snapshot.interpretation && equal(datapoint.reference, referenceRecord(snapshot));
  }
  function augmentDatapoint(element, datapoint) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-ox-dzm-snapshot"));
    if (!snapshot || !datapoint) return false;
    Object.assign(datapoint, { id: "Ox_total24", testKey: TEST_KEY, sourceFormulaId: "Ox_mgkg", label: LABEL, rawValue: valueNum(snapshot), valueNum: valueNum(snapshot), displayValue: displayText(snapshot), unit: unitText(snapshot), basis: basis(snapshot), comparator: "", norm: normText(snapshot), reference: referenceRecord(snapshot), tone: toneText(snapshot), assessment: assessment(snapshot), outOfRange: snapshot.outOfRange, interpretation: snapshot.interpretation, category: null, referenceProfileId: snapshot.policy?.id || "", referenceProfileVersion: snapshot.policy?.version ?? null, oxDzmSnapshot: snapshot });
    return true;
  }
  function applyLabResult(datapoint, lab) {
    const snapshot = datapoint?.oxDzmSnapshot;
    if (!matchesDatapoint(datapoint, snapshot)) return false;
    Object.assign(lab, { test: LABEL, testKey: TEST_KEY, value: displayText(snapshot), valueNum: valueNum(snapshot), unit: unitText(snapshot) });
    const norm = normText(snapshot); if (norm) lab.norm = norm; else delete lab.norm;
    return true;
  }
  function referenceNote(datapoint) {
    const snapshot = datapoint?.oxDzmSnapshot;
    if (!matchesDatapoint(datapoint, snapshot)) return "";
    const basisLabel = { "oxalate-ion": "jon szczawianowy", "oxalic-acid": "kwas szczawiowy bezwodny", "unknown": "niepodana", "oxalate-amount": "ilość molowa szczawianów" }[basis(snapshot)];
    return [NOTE_HEADER, `Wynik: ${displayText(snapshot)} ${unitText(snapshot)}.`, normText(snapshot) ? `Norma użyta przy zapisie: ${normText(snapshot)}.` : "Brak zapisanej normy.", `Opis wyniku: ${snapshot.interpretation}`, `Postać wyniku: ${basisLabel}.`, ...[snapshot.notes?.assumption, snapshot.reference?.sourceLabel ? `Źródło: ${snapshot.reference.sourceLabel}.` : ""].filter(Boolean)].join("\n");
  }
  function savedAssessment(note) {
    const body = clean(note?.body), start = body.indexOf("[VILDA_CLCR_CALCULATION_V1]"), end = body.indexOf("[/VILDA_CLCR_CALCULATION_V1]", start);
    if (start < 0 || end <= start || body.length > 100000) return null;
    let envelope;
    try { envelope = JSON.parse(body.slice(start + "[VILDA_CLCR_CALCULATION_V1]".length, end).trim()); } catch (_) { return null; }
    const snapshot = readSnapshot(JSON.stringify(envelope?.assessment?.oxDzmSnapshot));
    if (!snapshot || envelope.formulaId !== "Ox_mgkg" || !["Ox_total24", TEST_KEY].includes(envelope.parameterKey)) return null;
    const lab = note.labResult || {}, expected = envelope.assessment;
    if (!matchesDatapoint(expected, snapshot) || lab.test !== LABEL || lab.testKey && lab.testKey !== TEST_KEY || lab.unit !== unitText(snapshot) || lab.valueNum !== valueNum(snapshot) || clean(lab.value).replace(".", ",") !== displayText(snapshot).replace(".", ",") || clean(lab.norm) !== normText(snapshot)) return null;
    return snapshot;
  }
  const hasSavedAssessment = note => clean(note?.body).includes(NOTE_HEADER);
  function prepareValues(values = {}, context = {}, prior = null) {
    const result = { ...values }, input = prior?.input || {};
    for (const [id, key] of Object.entries(FIELD_MAP)) if (!own(result, id)) result[id] = input[key] ?? DEFAULTS[id] ?? "";
    result.OXDZM_unitConversions ??= JSON.stringify(input.unitConversions || {});
    for (const [id, value] of Object.entries(input.knownFacts || {})) if (!own(result, id) && ["string", "boolean", "number"].includes(typeof value)) result[id] = value;
    if (!own(result, "age")) result.age = input.ageYears == null ? "" : String(input.ageYears);
    // A missing historical clock is never silently upgraded to a fresh24h.
    if (!prior && !own(values, "OXDZM_collectionHours")) {
      result.OXDZM_collectionHours = context.collectionHours ?? "";
      result.OXDZM_collectionSource = result.OXDZM_collectionHours === "" ? "historical-missing" : "captured";
      result.OXDZM_durationNeedsConfirmation = result.OXDZM_collectionHours === "";
    }
    return result;
  }
  function editableFields(values = {}) {
    const field = (id, label, required = false, unitFieldId = "", options = []) => ({ id, label, required, unitFieldId, historicalContext: false, type: options.length ? "select" : "text", options: options.map(value => object(value) ? value : ({ value, label: value })) });
    return [field("OXDZM_inputMode", "Sposób wprowadzania", false, "", [{ value: "concentration", label: "Oblicz ze stężenia" }, { value: "reported", label: "Gotowy wynik" }]), ...(values.OXDZM_inputMode === "reported" ? [field("OXDZM_reportedValue", "Gotowy wynik dobowy", true, "OXDZM_reportedUnit"), field("OXDZM_reportedUnit", "Jednostka wyniku", false, "", ["µmol/24h", "mmol/24h", "mg/24h"])] : [field("OXDZM_concentration", "Szczawiany w moczu", true, "OXDZM_concentrationUnit"), field("OXDZM_concentrationUnit", "Jednostka stężenia", false, "", ["mg/L", "mg/dL", "mmol/L", "µmol/L"]), field("OXDZM_volume", "Objętość zbiórki", true, "OXDZM_volumeUnit"), field("OXDZM_volumeUnit", "Jednostka objętości", false, "", ["mL", "L"])]), field("OXDZM_reportingEntity", "Postać masowa w raporcie", false, "", [{ value: "unknown", label: "Nie podano" }, { value: "oxalate_ion", label: "Jon szczawianowy" }, { value: "oxalic_acid", label: "Kwas szczawiowy" }]), field("OXDZM_collectionHours", "Czas zbiórki · godziny", true), field("weight", "Masa ciała w dniu badania · kg"), field("height", "Wzrost w dniu badania · cm")];
  }
  function captureFields(values, previous = []) { return [...editableFields(values), ...previous.filter(field => ["age", "ageMonths", "ageDays", "sex"].includes(field.id)).map(field => ({ ...field, required: false, historicalContext: true }))]; }
  function savedBasis(note, unit) {
    const snapshot = savedAssessment(note); if (snapshot) return basis(snapshot);
    if (/mmol\//.test(unit || "")) return "oxalate-amount";
    const body = clean(note?.body), start = body.indexOf("[VILDA_CLCR_CALCULATION_V1]"), end = body.indexOf("[/VILDA_CLCR_CALCULATION_V1]", start);
    if (start >= 0 && end > start) try { const old = JSON.parse(body.slice(start + "[VILDA_CLCR_CALCULATION_V1]".length, end).trim()); return ({ oxalate_ion: "oxalate-ion", oxalic_acid: "oxalic-acid" })[old.values?.oxalateReportingEntity] || "unknown"; } catch (_) { /* legacy incomplete capture */ }
    return "unknown";
  }
  return Object.freeze({ LABEL, TEST_KEY, NOTE_HEADER, FIELD_MAP, DEFAULTS, readSnapshot, validSnapshot, matchesDatapoint, valueNum, unitText, displayText, normText, assessment, basis, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, prepareValues, editableFields, captureFields, savedBasis });
});
