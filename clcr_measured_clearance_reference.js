(function (root, factory) {
  const api = factory();
  if (root) root.ClcrMeasuredClearanceReference = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    }
    return value;
  }

  function positive(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  function absent(value) {
    return value == null || (typeof value === "string" && value.trim() === "");
  }

  function validRange(range) {
    return range && positive(range.lower) && positive(range.upper) && range.lower <= range.upper;
  }

  function validProfile(profile) {
    return profile && typeof profile === "object" &&
      typeof profile.id === "string" && profile.id !== "" &&
      profile.quantity === "measured-creatinine-clearance" &&
      positive(profile.indexingAreaM2) &&
      profile.unit === `mL/min/${String(profile.indexingAreaM2).replace(".", ",")} m²` &&
      profile.source && typeof profile.source.label === "string" &&
      profile.population && typeof profile.population.label === "string" &&
      profile.ageRange && Number.isFinite(profile.ageRange.minimumInclusive) &&
      profile.ageRange.minimumInclusive >= 0 &&
      Number.isFinite(profile.ageRange.maximumExclusive) &&
      profile.ageRange.maximumExclusive > profile.ageRange.minimumInclusive &&
      profile.collection && positive(profile.collection.nominalHours) &&
      Array.isArray(profile.bands) && profile.bands.length > 0 &&
      profile.bands.every((band) => band &&
        Number.isFinite(band.minimumAgeInclusive) &&
        Number.isFinite(band.maximumAgeExclusive) &&
        band.maximumAgeExclusive > band.minimumAgeInclusive &&
        band.minimumAgeInclusive >= profile.ageRange.minimumInclusive &&
        band.maximumAgeExclusive <= profile.ageRange.maximumExclusive &&
        (band.both ? validRange(band.both) : validRange(band.male) && validRange(band.female)));
  }

  // Pure evaluator: the caller explicitly chooses a named source. It does not
  // calculate or guess BSA, infer a patient's sex, or supply a fallback profile.
  function evaluate(input, profile) {
    const request = input && typeof input === "object" ? input : {};
    const base = {
      available: false,
      status: "unavailable",
      reasonCode: "",
      missingFields: [],
      profileId: profile && typeof profile.id === "string" ? profile.id : "",
      profileVersion: profile && profile.version != null ? profile.version : null,
      source: null,
      population: null,
      selectedBand: null,
      indexedRange: null,
      absoluteRange: null,
      value: positive(request.value) ? request.value : null,
      unit: "mL/min",
      indexedValue: null,
      ageYears: Number.isFinite(request.ageYears) ? request.ageYears : null,
      sex: ["M", "F"].includes(request.sex) ? request.sex : null,
      bsa: positive(request.bsa) ? request.bsa : null,
      bsaMethod: typeof request.bsaMethod === "string" ? request.bsaMethod : "",
      durationHours: positive(request.durationHours) ? request.durationHours : null,
      referencePreview: true,
      protocolContext: null,
      protocolNote: "",
      restrictions: null,
      limitations: [],
    };

    function unavailable(reasonCode, missingFields) {
      return freeze({ ...base, reasonCode, missingFields: missingFields || [] });
    }

    if (!profile) return unavailable("missing-profile");
    if (!validProfile(profile)) return unavailable("invalid-profile");
    base.source = copy(profile.source);
    base.population = copy(profile.population);
    base.restrictions = copy(profile.restrictions || {});
    base.limitations = copy(profile.limitations || []);
    base.protocolContext = copy(profile.collection);

    if (!positive(request.value)) return unavailable(absent(request.value) ? "missing-value" : "invalid-value", ["value"]);
    if (request.unit !== "mL/min") return unavailable("invalid-unit", ["unit"]);
    if (!positive(request.durationHours)) return unavailable(absent(request.durationHours) ? "missing-duration" : "invalid-duration", ["durationHours"]);
    // This annotates a comparison; it is deliberately not an exact-24-hour
    // eligibility gate or an invented tolerance around the source protocol.
    if (request.durationHours !== profile.collection.nominalHours) {
      base.protocolNote = profile.collection.nonNominalNote || "Zakres źródłowy dotyczy innego czasu zbiórki.";
    }

    if (absent(request.ageYears)) {
      return unavailable("missing-age", positive(request.bsa) ? ["ageYears"] : ["ageYears", "bsa"]);
    }
    if (typeof request.ageYears !== "number" || !Number.isFinite(request.ageYears) || request.ageYears < 0) {
      return unavailable("invalid-age", ["ageYears"]);
    }
    if (request.ageYears < profile.ageRange.minimumInclusive || request.ageYears >= profile.ageRange.maximumExclusive) {
      return unavailable("out-of-age");
    }

    const matches = profile.bands.filter((band) =>
      request.ageYears >= band.minimumAgeInclusive && request.ageYears < band.maximumAgeExclusive);
    if (!matches.length) return unavailable("no-age-band");
    if (matches.length !== 1) return unavailable("ambiguous-age-band");
    const band = matches[0];
    const sexRequired = !band.both;
    base.selectedBand = {
      id: typeof band.id === "string" ? band.id : "",
      minimumAgeInclusive: band.minimumAgeInclusive,
      maximumAgeExclusive: band.maximumAgeExclusive,
      sexRequired,
      sex: sexRequired && ["M", "F"].includes(request.sex) ? request.sex : null,
    };
    if (sexRequired && !["M", "F"].includes(request.sex)) {
      return unavailable("missing-sex", positive(request.bsa) ? ["sex"] : ["sex", "bsa"]);
    }
    const range = band.both || (request.sex === "M" ? band.male : band.female);
    base.indexedRange = {
      lower: range.lower, upper: range.upper, unit: profile.unit,
      lowerInclusive: true, upperInclusive: true,
    };
    if (!positive(request.bsa)) return unavailable(absent(request.bsa) ? "missing-bsa" : "invalid-bsa", ["bsa"]);

    const lower = range.lower * request.bsa / profile.indexingAreaM2;
    const upper = range.upper * request.bsa / profile.indexingAreaM2;
    const indexedValue = request.value * (profile.indexingAreaM2 / request.bsa);
    if (![lower, upper, indexedValue].every(positive)) return unavailable("invalid-conversion", ["bsa"]);
    base.absoluteRange = { lower, upper, unit: "mL/min", lowerInclusive: true, upperInclusive: true };
    base.indexedValue = indexedValue;

    // Compare on the same unrounded absolute axis used by the visible primary
    // result. Rounded labels and the auxiliary indexed value never classify it.
    return freeze({
      ...base,
      available: true,
      status: request.value < lower ? "below" : request.value > upper ? "above" : "within",
    });
  }

  return Object.freeze({ evaluate });
});
