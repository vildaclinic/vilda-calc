(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrAcr = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const INPUT_MESSAGES = Object.freeze({
    "invalid-mode": "Wybierz sposób wprowadzenia ACR.",
    "missing-reported-value": "Wpisz wynik ACR z laboratorium.",
    "invalid-reported-value": "Wpisz nieujemny wynik ACR. Możesz zachować znak <, ≤, > lub ≥ z raportu.",
    "invalid-reported-unit": "Wybierz jednostkę wyniku ACR: mg/g lub mg/mmol.",
    "different-specimens": "Nie można obliczyć ACR z oznaczeń z różnych próbek. Wpisz albuminę i kreatyninę z tej samej próbki moczu albo gotowy wynik ACR z laboratorium.",
    "missing-albumin": "Wpisz stężenie albuminy w moczu.",
    "invalid-albumin": "Stężenie albuminy w moczu musi być liczbą nieujemną.",
    "missing-creatinine": "Wpisz stężenie kreatyniny w moczu.",
    "invalid-creatinine": "Stężenie kreatyniny w moczu musi być liczbą większą od zera.",
    "invalid-albumin-unit": "Wybierz jednostkę albuminy w moczu: mg/L lub mg/dL.",
    "invalid-creatinine-unit": "Wybierz jednostkę kreatyniny w moczu: mg/dL, µmol/L lub mmol/L.",
    "invalid-conversion": "Nie można obliczyć ACR z podanych wartości. Sprawdź stężenia i jednostki.",
  });

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

  function absent(value) {
    return value == null || (typeof value === "string" && value.trim() === "");
  }

  function finiteNonnegative(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  // No parseFloat: '<30', '30 mg/g', blank, NaN and Infinity must not silently
  // become exact numeric results. Comparators are supported only for a reported
  // laboratory ratio, never for either concentration in the calculation mode.
  function parseReportedValue(value) {
    if (finiteNonnegative(value)) return { value, comparator: "" };
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^([<>]=?|[≤≥])?\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/);
    if (!match) return null;
    const numeric = Number(match[2].replace(",", "."));
    if (!finiteNonnegative(numeric)) return null;
    const comparator = ({ "<=": "≤", ">=": "≥" })[match[1]] || match[1] || "";
    // ACR cannot be negative, so a strictly negative-only interval is empty.
    if (comparator === "<" && numeric === 0) return null;
    return { value: numeric, comparator };
  }

  function concentrationValue(value) {
    const parsed = parseReportedValue(value);
    return parsed && parsed.comparator === "" ? parsed.value : null;
  }

  function validProfile(profile) {
    return profile && typeof profile.id === "string" && profile.id !== "" &&
      profile.quantity === "urine-albumin-creatinine-ratio" &&
      profile.source && typeof profile.source.label === "string" &&
      profile.population && typeof profile.population.label === "string" &&
      finiteNonnegative(profile.population.minimumAgeYearsInclusive) &&
      profile.axes && ["mg/g", "mg/mmol"].every((unit) => {
        const axis = profile.axes[unit];
        return axis && Number.isFinite(axis.lowerThreshold) && axis.lowerThreshold > 0 &&
          Number.isFinite(axis.upperThreshold) && axis.upperThreshold > axis.lowerThreshold;
      }) && Array.isArray(profile.categories) && profile.categories.length === 3 &&
      ["A1", "A2", "A3"].every((code) => profile.categories.filter((row) =>
        row && row.code === code && typeof row.label === "string" &&
        ["success", "warning", "danger", "neutral"].includes(row.tone)).length === 1) &&
      profile.notes && ["confirmation", "normal", "missingAge", "underAge", "confounded", "censored"].every((key) => typeof profile.notes[key] === "string");
  }

  function exactCategory(value, axis) {
    return value < axis.lowerThreshold ? "A1" : value <= axis.upperThreshold ? "A2" : "A3";
  }

  // Give a single category only if every possible nonnegative value allowed by
  // the reported comparator belongs to it. The interval is never plotted or
  // saved as an exact measurement equal to its endpoint.
  function intervalCategory(value, comparator, axis) {
    if (!comparator) return exactCategory(value, axis);
    if (comparator === "<" && value <= axis.lowerThreshold) return "A1";
    if (comparator === "≤" && value < axis.lowerThreshold) return "A1";
    if (comparator === ">" && value >= axis.upperThreshold) return "A3";
    if (comparator === "≥" && value > axis.upperThreshold) return "A3";
    return null;
  }

  function buildReference(profile, unit) {
    const axis = profile.axes[unit];
    const lower = axis.lowerThreshold;
    const upper = axis.upperThreshold;
    return {
      label: "Norma dla wieku",
      limit: `<${lower}`,
      unit,
      lowerThreshold: lower,
      upperThreshold: upper,
      categories: profile.categories.map((row) => ({
        ...copy(row),
        range: row.code === "A1" ? `<${lower}` : row.code === "A2" ? `${lower}–${upper}` : `>${upper}`,
        lower: row.code === "A1" ? null : row.code === "A2" ? lower : upper,
        lowerInclusive: row.code === "A2",
        upper: row.code === "A1" ? lower : row.code === "A2" ? upper : null,
        upperInclusive: row.code === "A2",
      })),
      source: copy(profile.source),
      population: copy(profile.population),
      profileId: profile.id,
      profileVersion: profile.version == null ? null : profile.version,
    };
  }

  function evaluate(input, profile) {
    const request = input && typeof input === "object" ? input : {};
    const mode = request.mode == null ? "concentration" : request.mode;
    const ageYears = finiteNonnegative(request.ageYears) ? request.ageYears : null;
    const confounders = Array.isArray(request.confounders)
      ? [...new Set(request.confounders.filter((key) => typeof key === "string" && key.trim() !== ""))]
      : [];
    const context = {
      ageYears,
      sameSpecimen: mode === "direct" ? "not-applicable" :
        ["confirmed", "different"].includes(request.sameSpecimen) ? request.sameSpecimen : "assumed",
      sampleType: ["firstMorning", "secondMorning", "random", "timed"].includes(request.sampleType) ? request.sampleType : "",
      confounders,
    };
    const sourceInput = mode === "direct" ? {
      reportedValue: typeof request.reportedValue === "string" || finiteNonnegative(request.reportedValue) ? request.reportedValue : null,
      reportedUnit: typeof request.reportedUnit === "string" ? request.reportedUnit : "",
    } : {
      albuminValue: typeof request.albuminValue === "string" || finiteNonnegative(request.albuminValue) ? request.albuminValue : null,
      albuminUnit: typeof request.albuminUnit === "string" ? request.albuminUnit : "",
      creatinineValue: typeof request.creatinineValue === "string" || finiteNonnegative(request.creatinineValue) ? request.creatinineValue : null,
      creatinineUnit: typeof request.creatinineUnit === "string" ? request.creatinineUnit : "",
    };
    const base = {
      valid: false, reasonCode: "", message: "", mode, rawValue: null, unit: "", comparator: "",
      exact: false, convertedValue: null, convertedUnit: "", category: null,
      categoryDescription: "", status: "unassessed", tone: "neutral", statusText: "",
      referenceAvailable: false, reference: null,
      qualification: { reasonCode: "", note: "", requiresConfirmation: false },
      display: null, boundary: "", context, input: sourceInput,
      profileId: null, profileVersion: null, source: null, population: null,
      restrictions: null, notes: null,
    };

    function finish(reasonCode) {
      const result = { ...base, reasonCode: reasonCode || "" };
      if (!result.valid) {
        result.message = INPUT_MESSAGES[result.reasonCode] || "Sprawdź dane potrzebne do obliczenia ACR.";
        result.statusText = result.message;
      }
      return freeze({ ...result, snapshot: result.valid ? { schema: "clcr-acr", version: 1, ...copy(result) } : null });
    }

    if (!["concentration", "direct"].includes(mode)) return finish("invalid-mode");
    let value;
    let comparator = "";
    let unit;
    if (mode === "direct") {
      const parsed = parseReportedValue(request.reportedValue);
      if (!parsed) return finish(absent(request.reportedValue) ? "missing-reported-value" : "invalid-reported-value");
      if (!["mg/g", "mg/mmol"].includes(request.reportedUnit)) return finish("invalid-reported-unit");
      value = parsed.value;
      comparator = parsed.comparator;
      unit = request.reportedUnit;
    } else {
      if (context.sameSpecimen === "different") return finish("different-specimens");
      const albumin = concentrationValue(request.albuminValue);
      const creatinine = concentrationValue(request.creatinineValue);
      if (albumin === null) return finish(absent(request.albuminValue) ? "missing-albumin" : "invalid-albumin");
      if (creatinine === null || creatinine <= 0) return finish(absent(request.creatinineValue) ? "missing-creatinine" : "invalid-creatinine");
      let albuminMgL;
      if (request.albuminUnit === "mg/L") albuminMgL = albumin;
      else if (request.albuminUnit === "mg/dL" || request.albuminUnit === "mg/dl") albuminMgL = albumin * 10;
      else return finish("invalid-albumin-unit");
      let creatinineMgDl;
      if (request.creatinineUnit === "mg/dL" || request.creatinineUnit === "mg/dl") creatinineMgDl = creatinine;
      else if (["µmol/L", "μmol/L", "umol"].includes(request.creatinineUnit)) creatinineMgDl = creatinine / 88.4;
      else if (request.creatinineUnit === "mmol/L") creatinineMgDl = creatinine * 1000 / 88.4;
      else return finish("invalid-creatinine-unit");
      const creatinineGL = creatinineMgDl * 0.01;
      if (!Number.isFinite(albuminMgL) || !Number.isFinite(creatinineGL) || creatinineGL <= 0) return finish("invalid-conversion");
      value = albuminMgL / creatinineGL;
      unit = "mg/g";
    }
    if (!finiteNonnegative(value)) return finish("invalid-conversion");
    const convertedValue = unit === "mg/g" ? value / 8.84 : value * 8.84;
    if (!finiteNonnegative(convertedValue)) return finish("invalid-conversion");
    Object.assign(base, {
      valid: true, rawValue: value, unit, comparator, exact: comparator === "",
      convertedValue, convertedUnit: unit === "mg/g" ? "mg/mmol" : "mg/g",
      statusText: "ACR — wynik liczbowy",
      // Censored results retain their endpoint precision instead of turning,
      // for example, '<29.96' into the different interval '<30.0'.
      display: { value: comparator ? String(value) : value.toFixed(1), text: "", unit, comparator, boundary: "", rounded: !comparator && Number(value.toFixed(1)) !== value },
    });
    base.display.text = comparator + base.display.value;

    if (!profile || !validProfile(profile)) {
      base.qualification = { reasonCode: profile ? "invalid-profile" : "missing-profile", note: "Nie dobrano źródła normy ACR.", requiresConfirmation: false };
      return finish(base.qualification.reasonCode);
    }
    Object.assign(base, {
      profileId: profile.id, profileVersion: profile.version == null ? null : profile.version,
      source: copy(profile.source), population: copy(profile.population),
      restrictions: copy(profile.restrictions || {}), notes: copy(profile.notes || {}),
    });
    if (ageYears === null || ageYears < profile.population.minimumAgeYearsInclusive) {
      const reasonCode = ageYears === null ? (absent(request.ageYears) ? "missing-age" : "invalid-age") : "under-age";
      base.qualification = { reasonCode, note: ageYears === null ? profile.notes.missingAge : profile.notes.underAge, requiresConfirmation: false };
      return finish(reasonCode);
    }
    base.referenceAvailable = true;
    base.reference = buildReference(profile, unit);
    if (confounders.length) {
      base.statusText = "ACR — interpretacja wymaga potwierdzenia";
      base.qualification = { reasonCode: "confounded-sample", note: profile.notes.confounded, requiresConfirmation: true };
      return finish("confounded-sample");
    }
    const axis = profile.axes[unit];
    const code = intervalCategory(value, comparator, axis);
    if (!code) {
      base.statusText = "Przedział nie określa jednej kategorii ACR";
      base.qualification = { reasonCode: "censored-multiple-categories", note: profile.notes.censored, requiresConfirmation: false };
      return finish("censored-multiple-categories");
    }
    const row = profile.categories.find((category) => category.code === code);
    Object.assign(base, {
      category: code, categoryDescription: row.label, tone: row.tone,
      status: code === "A1" ? "within" : "above", statusText: row.label,
      qualification: { reasonCode: "", note: code === "A1" ? profile.notes.normal : profile.notes.confirmation, requiresConfirmation: code !== "A1" },
    });
    if (!comparator && exactCategory(Number(base.display.value), axis) !== code) {
      base.boundary = value < axis.lowerThreshold ? `<${axis.lowerThreshold}` : `>${axis.upperThreshold}`;
      base.display.boundary = base.boundary;
    }
    return finish("");
  }

  return Object.freeze({ evaluate, parseReportedValue });
});
