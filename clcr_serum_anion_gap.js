(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrSerumAnionGap = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const ENGINE_VERSION = 1;
  const DEFAULTS = Object.freeze({ S_Na: "", S_Cl: "", S_HCO3: "", AGS_albuminEnabled: false, S_Albumin: "", S_Albumin_unit: "g/L" });
  const FIELD_IDS = Object.freeze(Object.keys(DEFAULTS)), REQUIRED_FIELD_IDS = Object.freeze(["S_Na", "S_Cl", "S_HCO3"]);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const absent = value => value == null || typeof value === "string" && value.trim() === "";
  const primitive = value => value == null || ["string", "number", "boolean"].includes(typeof value) ? typeof value === "number" && !Number.isFinite(value) ? "[invalid measurement]" : value ?? null : "[invalid measurement]";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function copy(value) { if (Array.isArray(value)) return value.map(copy); if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])); return value; }
  const ten = power => 10n ** BigInt(power);
  function normalize(n, e) {
    if (n === 0n) return { n: 0n, e: 0 };
    while (n % 10n === 0n) { n /= 10n; e += 1; }
    return { n, e };
  }
  // Decimal operands are kept exact before subtraction. Binary floating-point
  // subtraction would turn 140.1 - 116 - 24.1 into a spurious negative result.
  function decimal(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).trim();
    if (!text || text.length > 512) return null;
    const match = /^([+-]?)(?:(\d+)(?:[.,](\d*))?|[.,](\d+))(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match) return null;
    const fraction = match[3] || match[4] || "", exponent = Number(match[5] || 0), number = Number(text.replace(",", "."));
    // This allocation bound is numerical, not a physiological threshold.
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 4096 || !Number.isFinite(number)) return null;
    const n = BigInt((match[2] || "0") + fraction) * (match[1] === "-" ? -1n : 1n);
    if (n !== 0n && number === 0) return null;
    return { ...normalize(n, exponent - fraction.length), number: Object.is(number, -0) ? 0 : number };
  }
  function add(a, b) { const e = Math.min(a.e, b.e); return normalize(a.n * ten(a.e - e) + b.n * ten(b.e - e), e); }
  function negate(value) { return { n: -value.n, e: value.e }; }
  function multiply(a, b) { return normalize(a.n * b.n, a.e + b.e); }
  function compare(a, b) { const n = add(a, negate(b)).n; return n < 0n ? -1 : n > 0n ? 1 : 0; }
  function plain(value) {
    const negative = value.n < 0n, digits = String(negative ? -value.n : value.n);
    const point = digits.length + value.e;
    const text = value.e >= 0 ? digits + "0".repeat(value.e) : point > 0 ? digits.slice(0, point) + "." + digits.slice(point) : "0." + "0".repeat(-point) + digits;
    return (negative ? "-" : "") + text;
  }
  function wire(value) { return { coefficient: String(value.n), exponent: value.e }; }
  function fromWire(value) {
    if (!object(value) || typeof value.coefficient !== "string" || value.coefficient.length > 6000 || !/^-?\d+$/.test(value.coefficient) || !Number.isInteger(value.exponent) || Math.abs(value.exponent) > 6000) return null;
    return normalize(BigInt(value.coefficient), value.exponent);
  }
  function representable(exact, number) { return Number.isFinite(number) && (exact.n === 0n || number !== 0); }
  function presentation(value) {
    const exactText = plain(value), negative = value.n < 0n;
    let compact = exactText, approximate = false;
    if (exactText.length > 12) {
      let digits = String(negative ? -value.n : value.n), exponent = digits.length - 1 + value.e;
      if (digits.length > 6) {
        approximate = /[1-9]/.test(digits.slice(6));
        let kept = BigInt(digits.slice(0, 6));
        if (Number(digits[6]) >= 5) kept += 1n;
        digits = String(kept);
        if (digits.length > 6) { exponent += 1; digits = digits.slice(0, 6); }
      }
      digits = digits.replace(/0+$/, "") || "0";
      compact = (negative ? "-" : "") + digits[0] + (digits.length > 1 ? "." + digits.slice(1) : "") + "e" + exponent;
    }
    const local = text => text.replace(".", ",").replace(/-/g, "−");
    return { value: compact, text: (approximate ? "≈" : "") + local(compact), unit: "mmol/L", approximate, rounded: approximate,
      fullValueText: local(exactText), fullValueComplete: true, exactText };
  }
  function formatValue(value, exactValue) {
    if (!Number.isFinite(value)) return "";
    const exact = fromWire(exactValue) || decimal(value);
    if (!exact || !representable(exact, value) || Number(plain(exact)) !== value) return "";
    return presentation(exact).text;
  }
  function inputData(value) {
    const source = object(value) ? value : {};
    const read = (key, alias) => primitive(own(source, key) ? source[key] : own(source, alias) ? source[alias] : "");
    return { sodiumValue: read("sodiumValue", "sodiumRaw"), chlorideValue: read("chlorideValue", "chlorideRaw"), bicarbonateValue: read("bicarbonateValue", "bicarbonateRaw"),
      albuminEnabled: source.albuminEnabled === true || source.albuminEnabled === "true", albuminValue: read("albuminValue", "albuminRaw"),
      albuminUnit: absent(source.albuminUnit) ? "g/L" : primitive(source.albuminUnit), ageYears: primitive(source.ageYears) };
  }
  function readiness(input) {
    const request = inputData(input), validFieldIds = [], missingFieldIds = [], invalidFieldIds = [];
    const values = [request.sodiumValue, request.chlorideValue, request.bicarbonateValue];
    values.forEach((value, index) => {
      const parsed = decimal(value), id = REQUIRED_FIELD_IDS[index];
      if (absent(value)) missingFieldIds.push(id);
      else if (!parsed || parsed.n < 0n) invalidFieldIds.push(id);
      else validFieldIds.push(id);
    });
    return freeze({ count: validFieldIds.length, total: 3, complete: validFieldIds.length === 3, requiredFieldIds: [...REQUIRED_FIELD_IDS], validFieldIds, missingFieldIds, invalidFieldIds });
  }
  function validProfile(profile) {
    const ref = profile?.reference, correction = profile?.correction;
    return Boolean(object(profile) && typeof profile.id === "string" && profile.id && Number.isInteger(profile.version) && profile.version > 0 && profile.formulaId === "AGs" &&
      profile.quantity === "serum-anion-gap" && profile.nativeUnit === "mmol/L" && profile.referenceKind === "interval" && typeof profile.population === "string" &&
      Number.isFinite(ref?.minimumAgeYears) && ref.minimumAgeYears >= 0 && Number.isFinite(ref.minimum) && Number.isFinite(ref.maximum) && ref.minimum <= ref.maximum &&
      typeof ref.lowerInclusive === "boolean" && typeof ref.upperInclusive === "boolean" && ref.unit === "mmol/L" &&
      Number.isFinite(correction?.targetAlbuminGl) && correction.targetAlbuminGl > 0 && decimal(correction.coefficientGl)?.n > 0n &&
      correction.referenceAvailable === false && correction.automaticClassification === false &&
      profile.source && ["id", "label", "url"].every(key => typeof profile.source[key] === "string") && Array.isArray(profile.sources) && profile.sources.length > 0 &&
      profile.sources.every(source => object(source) && ["id", "label", "url"].every(key => typeof source[key] === "string")) &&
      profile.sources.some(source => source.id === correction.sourceId) && object(profile.notes) &&
      ["referenceLabel", "referenceHint", "normal", "low", "high", "unknownAge", "underAge", "noProfile", "albuminLower", "correction", "correctionUnassessed"].every(key => typeof profile.notes[key] === "string"));
  }
  function evaluate(input, profile) {
    const request = inputData(input), ready = readiness(request), hasProfile = validProfile(profile), notes = hasProfile ? profile.notes : {};
    const age = absent(request.ageYears) ? null : decimal(request.ageYears), ageKnown = Boolean(age && age.n >= 0n), ageYears = ageKnown ? age.number : null;
    const available = hasProfile && ageKnown && compare(age, decimal(profile.reference.minimumAgeYears)) >= 0;
    const noReference = !hasProfile ? "Nie dobrano zweryfikowanego zakresu porównania; wynik liczbowy jest dostępny." : !ageKnown ? notes.unknownAge : notes.underAge;
    const ref = available ? profile.reference : null;
    const reference = ref ? { min: ref.minimum, max: ref.maximum, low: ref.minimum, high: ref.maximum, minimum: ref.minimum, maximum: ref.maximum,
      lowerInclusive: ref.lowerInclusive, upperInclusive: ref.upperInclusive, minimumAgeYears: ref.minimumAgeYears, unit: "mmol/L", kind: "interval",
      label: notes.referenceLabel, text: String(ref.minimum).replace(".", ",") + "–" + String(ref.maximum).replace(".", ",") + " mmol/L",
      source: copy(profile.source), sourceId: ref.sourceId, population: profile.population, method: ref.method, specimen: ref.specimen } : null;
    const base = {
      schema: "clcr-serum-anion-gap", version: 1, engineVersion: ENGINE_VERSION, sourceFormula: "AGs", valid: false, canSave: false,
      rawValue: null, value: null, pointValue: null, canonicalNumber: null, exactValue: null, exactText: "", exact: false, zero: false, sign: null, unit: "mmol/L", display: null,
      status: "unassessed", tone: "neutral", statusText: "Wynik obliczony", interpretation: "", message: "", reasonCode: "", errorCode: "", error: "", category: null,
      invalidIds: [...ready.invalidFieldIds], missingIds: [...ready.missingFieldIds], readiness: copy(ready), complete: ready.count,
      input: request, context: { ageYears, ageKnown, ageExactText: ageKnown ? plain(age) : null, ageExactValue: ageKnown ? wire(age) : null }, referenceAvailable: available, referenceActive: available, reference,
      min: reference?.min ?? null, max: reference?.max ?? null, outOfRange: null,
      referenceLabel: hasProfile ? notes.referenceLabel : "Norma dla wieku", referenceText: reference?.text || "Brak normy do porównania", referenceHint: available ? notes.referenceHint : noReference,
      correction: null, profileId: hasProfile ? profile.id : null, profileVersion: hasProfile ? profile.version : null,
      policy: hasProfile ? copy(profile) : null, population: hasProfile ? profile.population : null, source: hasProfile ? copy(profile.source) : null,
      sources: hasProfile ? copy(profile.sources) : [], notes: copy(notes), restrictions: hasProfile ? copy(profile.restrictions || {}) : {},
    };
    function fail(code, message) { return freeze({ ...base, reasonCode: code, errorCode: code, error: message, message, statusText: message, snapshot: null }); }
    if (!ready.complete) return fail(ready.invalidFieldIds.length ? "invalid-concentration" : "missing-concentration", ready.invalidFieldIds.length
      ? "Wpisz nieujemne stężenia jako liczby z wyniku badania." : "Uzupełnij sód, chlorki i wodorowęglany. Potrzebne są trzy stężenia.");
    const raw = add(add(decimal(request.sodiumValue), negate(decimal(request.chlorideValue))), negate(decimal(request.bicarbonateValue)));
    const exactText = plain(raw), value = Number(exactText);
    if (!representable(raw, value)) return fail("numeric-range", "Wynik przekracza obsługiwany zakres liczbowy. Sprawdź wpisane stężenia.");
    const low = available ? compare(raw, decimal(ref.minimum)) : null, high = available ? compare(raw, decimal(ref.maximum)) : null;
    const status = !available ? "unassessed" : low < 0 || low === 0 && !ref.lowerInclusive ? "low" : high > 0 || high === 0 && !ref.upperInclusive ? "high" : "normal";
    const titles = { unassessed: "Wynik obliczony", normal: "AG w przyjętej normie", low: "Obniżona luka anionowa", high: "Podwyższona luka anionowa" };
    Object.assign(base, { valid: true, canSave: true, rawValue: value, value, pointValue: value, canonicalNumber: value, exactValue: wire(raw), exactText, exact: true,
      zero: raw.n === 0n, sign: raw.n < 0n ? "negative" : raw.n > 0n ? "positive" : "zero", display: presentation(raw), status,
      tone: status === "normal" ? "normal" : status === "unassessed" ? "neutral" : "warn", statusText: titles[status],
      interpretation: available ? notes[status] : noReference, reasonCode: available ? "" : !hasProfile ? profile == null ? "missing-profile" : "invalid-profile" : ageKnown ? "age-outside-reference" : "unknown-age",
      outOfRange: available ? status !== "normal" : null });
    if (request.albuminEnabled) {
      const albumin = decimal(request.albuminValue);
      if (absent(request.albuminValue)) base.correction = { valid: false, missing: true, error: "", reasonCode: "missing-albumin", message: "Wpisz albuminę, aby zobaczyć korektę." };
      else if (!albumin || albumin.n <= 0n || !["g/L", "g/dL"].includes(request.albuminUnit)) {
        base.correction = { valid: false, missing: false, error: "Wpisz dodatnie stężenie albuminy w wybranej jednostce.", reasonCode: "invalid-albumin" };
        base.invalidIds.push("S_Albumin"); base.canSave = false;
      } else if (!hasProfile) {
        base.correction = { valid: false, missing: false, error: "Nie dobrano zweryfikowanej reguły korekty albuminowej.", reasonCode: "missing-correction-policy" }; base.canSave = false;
      } else {
        const albuminGl = request.albuminUnit === "g/dL" ? multiply(albumin, decimal(10)) : albumin;
        const delta = multiply(add(decimal(profile.correction.targetAlbuminGl), negate(albuminGl)), decimal(profile.correction.coefficientGl));
        const corrected = add(raw, delta), correctedText = plain(corrected), correctedNumber = Number(correctedText);
        if (!representable(corrected, correctedNumber)) {
          base.correction = { valid: false, missing: false, error: "Nie można przedstawić korekty dla tej wartości albuminy.", reasonCode: "numeric-range" };
          base.invalidIds.push("S_Albumin"); base.canSave = false;
        } else {
          base.correction = { valid: true, missing: false, error: "", reasonCode: "", value: correctedNumber, rawValue: correctedNumber, unit: "mmol/L",
            exactValue: wire(corrected), exactText: correctedText, display: presentation(corrected), albuminGl: plain(albuminGl), delta: plain(delta),
            targetAlbuminGl: profile.correction.targetAlbuminGl, coefficientGl: profile.correction.coefficientGl,
            source: copy(profile.sources.find(source => source.id === profile.correction.sourceId)), comment: available ? notes.correction : notes.correctionUnassessed, referenceAvailable: false };
          if (status === "normal" && compare(albuminGl, decimal(profile.correction.targetAlbuminGl)) < 0) base.interpretation += " " + notes.albuminLower;
        }
      }
    }
    base.message = base.interpretation;
    return freeze({ ...base, snapshot: base.canSave ? { ...copy(base), schema: "clcr-serum-anion-gap", version: 1 } : null });
  }
  function readInputFromValues(values, context = {}) {
    const source = object(values) ? values : {}, supplied = object(context) ? context : {};
    const scoped = object(supplied.serumAnionGap) ? supplied.serumAnionGap : supplied;
    const read = id => own(source, id) ? source[id] : DEFAULTS[id];
    return inputData({ sodiumValue: read("S_Na"), chlorideValue: read("S_Cl"), bicarbonateValue: read("S_HCO3"), albuminEnabled: read("AGS_albuminEnabled"),
      albuminValue: read("S_Albumin"), albuminUnit: read("S_Albumin_unit"), ageYears: scoped.ageYears });
  }
  function readInputFromDocument(documentRef, options = {}) {
    const doc = documentRef || (typeof document !== "undefined" ? document : null), values = {};
    for (const id of FIELD_IDS) { const control = doc?.getElementById(id); if (control) values[id] = control.type === "checkbox" ? control.checked === true : control.value; }
    return readInputFromValues(values, options?.context || options);
  }
  function toSnapshot(result) { return result?.valid === true && result.canSave === true && result.snapshot?.schema === "clcr-serum-anion-gap" ? freeze(copy(result.snapshot)) : null; }
  return Object.freeze({ ENGINE_VERSION, evaluate, readiness, readInputFromValues, inputFromValues: readInputFromValues, readInputFromDocument, formatValue, toSnapshot, DEFAULTS, FIELD_IDS, REQUIRED_FIELD_IDS });
});
