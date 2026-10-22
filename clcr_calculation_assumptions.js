(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrCalculationAssumptions = api;
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

  // Owner-approved calculation conditions, not patient/laboratory facts.
  // Formula domains, equations and reference ranges belong to their engines.
  const POLICY = freeze({
    id: "KLIRENS_CALCULATION_ASSUMPTIONS_2026_10_22_V2",
    markerFormulaIds: [
      "egfr", "ckid_u25", "egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys",
      "neonatal_egfr", "sch_idms", "cg", "cg_norm", "cl24", "TMP_GFR",
    ],
    idmsFormulaIds: ["egfr", "ckid_u25", "egfr_cr_cys", "ckid_u25_cr_cys", "neonatal_egfr", "sch_idms"],
    ifccFormulaIds: ["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"],
  });

  const STANDARDIZATIONS = freeze({ creatinine: "IDMS", cystatinC: "ERM-DA471/IFCC" });
  const CONDITIONS = freeze({
    stableKidneyFunction: "stabilna czynność nerek",
    noSuspectedAKI: "brak podejrzenia AKI",
    idms: "kreatynina standaryzowana do IDMS",
    ifcc: "oznaczenie cystatyny C standaryzowane do IFCC",
  });

  function token(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/[\s/-]+/g, "_");
  }

  function joinedText(conditions) {
    if (!conditions.length) return "";
    const ending = conditions.length === 1 ? conditions[0]
      : `${conditions.slice(0, -1).join(", ")} oraz ${conditions[conditions.length - 1]}`;
    return `Założenia: ${ending}.`;
  }

  function resolve(formulaId, context) {
    const source = context || {};
    const markerApplicable = POLICY.markerFormulaIds.includes(formulaId);
    const idmsApplicable = POLICY.idmsFormulaIds.includes(formulaId);
    const ifccApplicable = POLICY.ifccFormulaIds.includes(formulaId);
    const neonatal = formulaId === "neonatal_egfr";
    const rawState = source.creatinineState == null ? "unknown" : String(source.creatinineState);
    const scrAssay = source.scrAssay == null ? "" : String(source.scrAssay);
    const assumptions = [];
    const blockers = [];
    const provenance = {
      creatinineState: "not_applicable", suspectedAKI: "not_applicable",
      creatinineStandardization: "not_applicable", cystatinCStandardization: "not_applicable",
    };
    const effective = {
      creatinineState: rawState,
      suspectedAKI: source.suspectedAKI === true,
      scrAssay,
      presentationAssay: scrAssay,
      creatinineStandardization: source.creatinineStandardization == null ? "" : String(source.creatinineStandardization),
      cystatinCStandardization: source.cystatinCStandardization == null ? "" : String(source.cystatinCStandardization),
      markerPolicy: {
        calculationAllowed: true, categoryAllowed: false, status: "not_applicable", message: "",
      },
    };
    function assume(id) {
      assumptions.push({ id, text: CONDITIONS[id], provenance: "assumed" });
    }
    function block(code, message) {
      blockers.push({ code, message });
    }

    if (markerApplicable) {
      const knownAKI = source.suspectedAKI === true;
      const knownRapidChange = rawState === "rapidlyChanging";
      const knownBlock = source.markerPolicy?.calculationAllowed === false || source.markerPolicy?.status === "blocked";
      if (knownAKI || knownRapidChange || knownBlock) {
        provenance.creatinineState = knownRapidChange || knownBlock || rawState === "stable" ? "provided" : neonatal ? "not_applicable" : "assumed";
        provenance.suspectedAKI = knownAKI ? "provided" : "assumed";
        block("MARKER_STATE_CONTRADICTS_ASSUMPTIONS", source.markerPolicy?.message || "Znane podejrzenie AKI lub szybko zmieniający się marker wyklucza raportowanie bieżącej czynności nerek tym wzorem.");
      } else {
        // Neonatal physiology does not imply a fixed GFR or a steady Scr.
        // not_applicable means no stationary-state assumption was made;
        // recorded AKI/rapid change are still checked above, never ignored.
        if (!neonatal) effective.creatinineState = "stable";
        effective.suspectedAKI = false;
        provenance.creatinineState = rawState === "stable" ? "provided" : neonatal ? "not_applicable" : "assumed";
        // An unchecked legacy checkbox was not a confirmed clinical assessment.
        provenance.suspectedAKI = "assumed";
        if (!neonatal && provenance.creatinineState === "assumed") assume("stableKidneyFunction");
        assume("noSuspectedAKI");
      }
    }

    // Unknown technique can use the explicit IDMS calculation assumption.
    // A recorded Jaffe technique remains outside this conservative neonatal path.
    if (neonatal && ["jaffe", "jaffe_idms", "jaffe_non_idms"].includes(token(scrAssay))) {
      block("NEONATAL_CREATININE_METHOD_UNSUPPORTED", "Dla zapisanej metody Jaffego nie obliczono eGFR noworodkowego. Zalecane jest oznaczenie enzymatyczne.");
    }

    if (idmsApplicable) {
      const standard = token(source.creatinineStandardization);
      const assay = token(scrAssay);
      const incompatible = ["non_idms", "not_standardized_to_idms"].includes(standard) ||
        ["non_idms", "enzymatic_non_idms", "jaffe_non_idms"].includes(assay);
      const provided = standard === "idms" || ["enzymatic_idms", "jaffe_idms"].includes(assay) || source.crCysStandardizationConfirmed === true;
      if (incompatible) {
        provenance.creatinineStandardization = "provided";
        block("CREATININE_STANDARDIZATION_INCOMPATIBLE", "Zapisane oznaczenie kreatyniny jest jawnie niezgodne z IDMS wymaganym przez ten wzór.");
      } else {
        effective.creatinineStandardization = STANDARDIZATIONS.creatinine;
        provenance.creatinineStandardization = provided ? "provided" : "assumed";
        if (!provided) assume("idms");
        // Method-neutral compatibility token; never invent enzymatic/Jaffe data.
        effective.presentationAssay = ["enzymatic_idms", "jaffe_idms"].includes(scrAssay) ? scrAssay : "idms";
      }
    }

    if (ifccApplicable) {
      const standard = token(source.cystatinCStandardization);
      const incompatible = ["non_ifcc", "not_standardized_to_ifcc", "non_erm_da471_ifcc"].includes(standard);
      const provided = standard === "erm_da471_ifcc" || source.crCysStandardizationConfirmed === true;
      if (incompatible) {
        provenance.cystatinCStandardization = "provided";
        block("CYSTATIN_C_STANDARDIZATION_INCOMPATIBLE", "Zapisane oznaczenie cystatyny C jest jawnie niezgodne ze standardem IFCC wymaganym przez ten wzór.");
      } else {
        effective.cystatinCStandardization = STANDARDIZATIONS.cystatinC;
        provenance.cystatinCStandardization = provided ? "provided" : "assumed";
        if (!provided) assume("ifcc");
      }
    }

    const allowed = blockers.length === 0;
    if (markerApplicable) {
      effective.markerPolicy = {
        calculationAllowed: allowed,
        categoryAllowed: allowed && !neonatal,
        status: allowed ? neonatal && rawState !== "stable" ? "unknown" : "stable" : "blocked",
        message: blockers.map((entry) => entry.message).join(" "),
      };
    }
    const conditions = [];
    if (markerApplicable) {
      if (!neonatal) conditions.push(CONDITIONS.stableKidneyFunction);
      conditions.push(CONDITIONS.noSuspectedAKI);
    }
    if (idmsApplicable) conditions.push(CONDITIONS.idms);
    if (ifccApplicable) conditions.push(CONDITIONS.ifcc);
    return freeze({
      formulaId, policyId: POLICY.id, allowed, calculationContext: effective,
      assumptions, assumptionsText: allowed ? neonatal ? `Założenia obliczenia: ${conditions.join(" i ")}.` : joinedText(conditions) : "", provenance, blockers,
    });
  }

  return Object.freeze({ POLICY, STANDARDIZATIONS, resolve });
});
