/* Shared production arithmetic for the existing timed-urine calculations.
 * The calculator page and the saved-measurement editor call the same helpers.
 * Reference selection remains in the existing clinical/presentation modules.
 */
(function (root, factory) {
  const api = factory(root);
  if (root) root.ClcrSavedLegacyCalculator = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  // Moved unchanged from the leading production functions in inline_04.
  function BSA_DuBois(e, n) {
    return 0.007184 * Math.pow(e, 0.425) * Math.pow(n, 0.725);
  }
  function clCrCG(e, n, t, o) {
    const a = e === "F" ? 0.85 : 1;
    return ((140 - n) * t * a) / (72 * o);
  }
  function clCrCGNormalized(sex, ageYears, weight, scr, bsaM2) {
    if (
      !["M", "F"].includes(sex) ||
      !Number.isFinite(ageYears) || ageYears < 18 ||
      ![weight, scr, bsaM2].every((value) => Number.isFinite(value) && value > 0)
    ) return null;
    return clCrCG(sex, Math.floor(ageYears), weight, scr) * 1.73 / bsaM2;
  }
  // Existing source expressions, now also used by the page (no new equation).
  const excr_mgkg = (e, n, t) => (e && n && t ? (e * n) / (100 * t) : null);
  const excr_mmol_d = (e, n) => (e && n ? (e * n) / 1e3 : null);
  const ratio = (e, n) => (e && n ? e / n : null);
  const K_frac = (e, n) => (e && n ? (e / (e + n)) * 100 : null);
  const calciumMgDl = (e) => e ? e * 4 : null;
  const magnesiumMgDl = (e) => e ? e / 10 : null;
  const dailyAmount = (e, minutes) => e * (1440 / minutes);
  const proteinCreatinineRatio = (e, n, volume) => e && n && volume ? e / ((n * volume) / 100) : null;
  const math = Object.freeze({ BSA_DuBois, clCrCG, clCrCGNormalized, excr_mgkg, excr_mmol_d, ratio, K_frac, calciumMgDl, magnesiumMgDl, dailyAmount, proteinCreatinineRatio });

  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  function number(values, key) {
    const value = values[key];
    if (value === "" || value == null || typeof value === "boolean") return null;
    const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const checked = (values, key) => values[key] === true;
  function requiredModule(name) {
    if (!root[name]) throw new Error("Nie wczytano modułu obliczenia. Odśwież stronę i spróbuj ponownie.");
    return root[name];
  }
  function ageOf(values, context) {
    if (own(values, "age")) {
      const years = number(values, "age");
      const months = own(values, "ageMonths") ? number(values, "ageMonths") : 0;
      if (years === null || years < 0 || (months !== null && (months < 0 || months > 11))) return null;
      return years + (months || 0) / 12;
    }
    const candidates = [context.ageYears, context.ageContext?.exactYears, context.age?.exactYears];
    return candidates.find((value) => Number.isFinite(value) && value >= 0) ?? null;
  }
  function duration(values) {
    const start = Date.parse(values.collectionStartAt || "");
    const end = Date.parse(values.collectionEndAt || "");
    const minutes = (end - start) / 6e4;
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }
  const protocolFields = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  function collection(values) {
    const minutes = duration(values);
    const complete = protocolFields.every((id) => checked(values, id));
    const volume = number(values, "V24");
    return { minutes, complete, volume, dailyVolume: volume > 0 && minutes && complete ? dailyAmount(volume, minutes) : null };
  }
  function bsa(values, age) {
    const weight = number(values, "weight"), height = number(values, "height");
    if (age === null || !(weight > 0) || !(height > 0)) return null;
    if (age >= 18) return BSA_DuBois(weight, height);
    const result = requiredModule("ClcrExtendedEgfr").computeHaycockBsa({ ageYears: age, heightValue: height, heightUnit: "cm", weightValue: weight, weightUnit: "kg" });
    return result.ok ? result.value : null;
  }
  function assumed(formulaId, values) {
    const source = {
      creatinineState: values.creatinineState,
      scrAssay: values.ScrAssay,
      cystatinCStandardization: values.CystatinCStandardization,
      cystatinCAssayMethod: values.CystatinCAssayMethod,
    };
    const result = requiredModule("VildaClcrCalculationAssumptions").resolve(formulaId, source);
    if (!result.allowed) throw new Error(result.blockers?.map((item) => item.message).join(" ") || "Zapisany kontekst nie pozwala na to obliczenie.");
    return result;
  }
  function modeled(formulaId, parameterKey, value, unit, digits, values, context, extra = {}) {
    if (!Number.isFinite(value)) throw new Error("Uzupełnij prawidłowe dane potrzebne do tego obliczenia.");
    const assumptions = assumed(formulaId, values);
    const profile = requiredModule("ClcrResultReferenceData").PROFILE;
    const capturedProfile = context.referenceProfileId || context.profileId;
    if (capturedProfile && capturedProfile !== profile.id && !(formulaId === "cl24" && capturedProfile === "PATHWEST_CCL_2026_03_20")) throw new Error("Zapisany profil odniesienia nie jest dostępny do edycji tego pomiaru.");
    const displayValue = extra.displayValue ?? value.toFixed(digits);
    const label = context.label || root.ClcrSavedResults?.getParam(parameterKey)?.label || formulaId;
    const model = requiredModule("ClcrResultPresentation").createModel({
      formulaId, series: parameterKey, code: parameterKey, value, displayValue, unit,
      label, ageYears: formulaId === "cg_norm" ? number(values, "age") : ageOf(values, context), presentation: extra.presentation || { label, tone: "neutral" },
      calculationAssumptions: assumptions, boundary: extra.boundary || "", referenceContext: extra.referenceContext,
      markerPolicy: assumptions.calculationContext.markerPolicy,
      assay: assumptions.calculationContext.presentationAssay,
      ...extra.modelInput,
    }, profile);
    if (model.valueVisible === false) throw new Error("Zapisany kontekst nie pozwala na pokazanie tego wyniku.");
    const reference = model.reference?.kind !== "none" ? model.reference : null;
    return {
      id: parameterKey, sourceFormulaId: formulaId, valueNum: value, rawValue: value,
      unit: model.unit || unit, displayValue: model.displayValue, comparator: "", boundary: model.boundary || "",
      category: model.category?.code || null, tone: model.tone,
      norm: reference ? `${reference.value}${reference.unit ? ` ${reference.unit}` : ""}` : "",
      outOfRange: ["warning", "danger"].includes(model.tone) ? true : model.tone === "success" ? false : null,
      interpretation: model.interpretation, reference, model,
      assumptions: assumptions.assumptionsText, assumptionProvenance: assumptions.provenance,
      ...extra.datapoint,
    };
  }
  function measured(values, parameterKey, context) {
    const safety = requiredModule("ClcrClinicalSafety");
    const hours = number(values, "Cl24DurationHours");
    const minutes = hours !== null && hours > 0 ? hours * 60 : null;
    const serum = number(values, "Scr");
    const protocol = {}, knownProblems = [];
    const keys = ["startVoidDiscarded", "finalVoidIncluded", "noMissedVoids", "noSpillage", "noExtraVoids", "storageFollowed"];
    protocolFields.forEach((id, index) => {
      protocol[keys[index]] = values[`ui_${id}_answer`] !== "no";
      if (!protocol[keys[index]]) knownProblems.push(id);
    });
    const collectionProblem = checked(values, "Cl24CollectionProblem") || knownProblems.length > 0;
    const age = ageOf(values, context), area = bsa(values, age);
    const input = {
      urineCreatinineMgDl: number(values, "Ucr"), serumCreatinineMgDl: values.ScrUnit === "umol" && serum !== null ? serum / 88.4 : values.ScrUnit === "mg/dl" ? serum : null,
      volumeMl: number(values, "V24"), durationMinutes: minutes,
      durationSource: minutes ? values.Cl24DurationSource === "legacy-dates" ? "legacy-dates" : "hours" : "missing",
      bsaM2: area, bsaMethod: area ? age < 18 ? "Haycock" : "Du Bois" : "", weightKg: number(values, "weight"), heightCm: number(values, "height"), ageYears: age, sex: values.sex || "",
      protocolMode: "assumed-complete", protocol, collectionProblem, knownProblems,
      collectionAssumptions: { collectionCompleteness: collectionProblem ? "known-problem" : "assumed", serumSampling: "assumed-compatible" },
    };
    const result = safety.computeTimedCreatinineClearance(input);
    if (!result.ok) throw new Error(result.error || "Uzupełnij dane klirensu ze zbiórki.");
    const evaluated = requiredModule("ClcrMeasuredClearanceReference").evaluate({
      value: result.absoluteMlMin, unit: "mL/min", ageYears: age, sex: values.sex,
      bsa: area, bsaMethod: input.bsaMethod, durationHours: result.durationHours,
    }, requiredModule("ClcrMeasuredClearanceReferenceData").PROFILES.PATHWEST_CCL_2026_03_20);
    const reference = { ...evaluated, durationSource: input.durationSource, collectionAssumptions: input.collectionAssumptions,
      inputs: { serumCreatinineMgDl: input.serumCreatinineMgDl, urineCreatinineMgDl: input.urineCreatinineMgDl, volumeMl: input.volumeMl, durationMinutes: minutes, ageYears: age, sex: values.sex, weightKg: input.weightKg, heightCm: input.heightCm } };
    const dp = modeled("cl24", parameterKey, result.absoluteMlMin, "mL/min", 1, values, context, {
      referenceContext: { measuredClearance: reference },
      datapoint: { measuredClearanceReference: reference },
    });
    return dp;
  }
  function dialysis(values, parameterKey, context) {
    const result = requiredModule("ClcrDialysisSafety").computeDialysisAdequacy({
      ageYears: number(values, "age"), ageMonths: number(values, "ageMonths") || 0,
      modality: values.ktvModality || "", sessionsPerWeek: number(values, "ktvSessionsPerWeek"), pidiDays: values.ktvPidiDays || "",
      preUrea: number(values, "UreaPre"), postUrea: number(values, "UreaPost"), ureaAnalyte: values.ktvUreaAnalyte || "", ureaUnit: values.ktvUreaUnit || "",
      durationMinutes: number(values, "ktvDurationMinutes"), netUfLiters: number(values, "ktvUF"), postWeightKg: number(values, "ktvW"),
      accessType: values.ktvAccessType || "unknown", kruValue: number(values, "ktvKru"), kruUnit: "mL/min/1.73m²", kruMeasuredAt: values.ktvKruMeasuredAt || "",
      evaluationDate: context.clinicalDateISO || context.evaluationDate || "",
      treatmentsDeliveredReliably: checked(values, "ktvTreatmentsDelivered"),
      sampling: { sameSession: checked(values, "ktvSameSession"), preBeforeDialysis: checked(values, "ktvPreBeforeDialysis"), preNoSalineHeparinDilution: checked(values, "ktvPreNoDilution"), postMethod: values.ktvPostMethod || "" },
    });
    if (!result.ok) throw new Error((result.messages?.errors || []).map((entry) => entry.message).join(" ") || "Nieprawidłowe dane dializy.");
    const metric = parameterKey === "KTV_urr" ? "urrPct" : parameterKey === "KTV_ektv" ? "eKtV" : "spKtV";
    const classification = metric === "urrPct" ? result.classification.urr : metric === "spKtV" ? result.classification.spKtV : null;
    const tone = classification?.code === "BELOW_MINIMUM" ? "danger" : classification?.code === "MINIMUM_MET_BELOW_TARGET" ? "warning" : classification?.code === "TARGET_MET" ? "success" : "neutral";
    const value = result.values[metric], displayValue = result.display[metric];
    const profile = requiredModule("ClcrResultReferenceData").PROFILE;
    const thresholds = metric === "spKtV" ? profile.dialysis.spKtV : metric === "urrPct" ? profile.dialysis.urr : null;
    let boundary = "";
    if (classification && thresholds) {
      if (value < thresholds.minimum && Number(displayValue) >= thresholds.minimum) boundary = `<${thresholds.minimum}`;
      else if (value < thresholds.target && Number(displayValue) >= thresholds.target) boundary = `<${thresholds.target}`;
    }
    return modeled("KTV", parameterKey, value, metric === "urrPct" ? "%" : "bez jednostki", 2, values, context, {
      displayValue, boundary, presentation: { label: classification?.label || "Wynik pojedynczej sesji", tone },
      referenceContext: { dialysisEligible: result.classification.interpretationAllowed === true, durationMinutes: result.metadata.durationHours * 60 },
      datapoint: { dialysisResult: result },
    });
  }
  function recalculate(formulaId, values = {}, parameterKey = formulaId, context = {}) {
    parameterKey = String(parameterKey).replace(/^clcr:/, "");
    if (formulaId === "cl24") return measured(values, parameterKey, context);
    if (formulaId === "KTV") return dialysis(values, parameterKey, context);
    const age = formulaId === "cg_norm" ? number(values, "age") : ageOf(values, context), safety = requiredModule("ClcrClinicalSafety");
    if (["cg", "cg_norm"].includes(formulaId)) {
      if (!["mg/dl", "umol"].includes(values.ScrUnit)) throw new Error("Wybierz zapisaną jednostkę kreatyniny w surowicy.");
      const scr = number(values, "Scr"), serum = values.ScrUnit === "umol" ? scr / 88.4 : scr;
      const weight = number(values, "weight");
      if (age === null || age < 18 || !["F", "M"].includes(values.sex) || !(weight > 0) || !(serum > 0)) throw new Error("Podaj prawidłowe dane osoby dorosłej.");
      const value = formulaId === "cg_norm" ? clCrCGNormalized(values.sex, age, weight, serum, bsa(values, age)) : clCrCG(values.sex, age, weight, serum);
      return modeled(formulaId, parameterKey, value, formulaId === "cg_norm" ? "mL/min/1,73 m²" : "mL/min", 0, values, context);
    }
    if (formulaId === "AGu_spot") {
      const engine = requiredModule("VildaClcrUag"), policy = requiredModule("VildaClcrUagReferenceData").DEFAULT_POLICY;
      const result = engine.evaluate(engine.inputFromValues(values), policy);
      if (!result.valid) throw new Error(result.error || "Sprawdź trzy stężenia w tej samej próbce moczu.");
      return {
        id: parameterKey, sourceFormulaId: formulaId, label: "Luka anionowa moczu (UAG)", testKey: "clcr:AGu_spot",
        valueNum: result.rawValue, rawValue: result.rawValue, unit: result.unit,
        displayValue: result.display.text, boundary: result.display.boundary, comparator: "",
        category: null, assessment: "unassessed", tone: "neutral", norm: "", outOfRange: null,
        interpretation: result.interpretation, uagSnapshot: result,
      };
    }
    if (formulaId === "AGs") {
      const value = safety.computeAnionGapWithoutPotassium({ sodium: number(values, "S_Na"), chloride: number(values, "S_Cl"), bicarbonate: number(values, "S_HCO3") });
      return modeled(formulaId, parameterKey, value, "mmol/L", 1, values, context);
    }
    if (formulaId === "TMP_GFR") {
      const engine = requiredModule("VildaClcrTmpGfr"), policy = requiredModule("VildaClcrTmpGfrReferenceData").DEFAULT_POLICY;
      const result = engine.evaluate(engine.inputFromValues(values, { ...context, ageYears: age }), policy);
      if (!result.valid) throw new Error(result.error || "Nieprawidłowe dane TmP/GFR.");
      const datapoint = {
        id: parameterKey, sourceFormulaId: formulaId, label: "TmP/GFR — próg reabsorpcji fosforanów", testKey: "clcr:TMP_GFR",
        valueNum: result.rawValue, rawValue: result.rawValue, unit: result.unit,
        displayValue: result.display.text, comparator: "", category: null,
        assessment: result.status, tone: result.tone, norm: "", outOfRange: result.outOfRange,
        interpretation: result.interpretation, calculationMethod: result.method, tmpGfrSnapshot: result,
      };
      requiredModule("ClcrTmpGfrPersistence").augmentDatapoint({ getAttribute: () => JSON.stringify(result) }, datapoint);
      return datapoint;
    }
    if (["pH_spot", "pH24"].includes(formulaId)) {
      const value = number(values, formulaId === "pH24" ? "pH24" : "U_pH");
      if (!(value > 0 && value <= 14)) throw new Error("Podaj prawidłowe pH.");
      const sample = collection(values);
      if (formulaId === "pH24" && (!sample.minutes || !sample.complete)) throw new Error("Uzupełnij protokół i czas zbiórki.");
      let interpreted = null;
      if (formulaId === "pH24" && age !== null && age >= 18 && (checked(values, "stoneKnownCystinuria") || checked(values, "stoneMetabolicEvaluationContext")) && sample.complete && Math.abs(sample.minutes - 1440) <= 0.5 && checked(values, "stoneCollectionPlausibilityReviewed") && checked(values, "stoneTwoCollectionsConfirmed")) {
        interpreted = requiredModule("ClcrStoneSafety").interpretAdultDzmPh({ ph: value, treatmentContext: checked(values, "stoneKnownCystinuria") ? "cystinuria" : null, persistentAbnormalPh: checked(values, "stonePhPersistent") });
      }
      const presentation = interpreted?.ok && interpreted.status !== "contextOnly" ? {
        tone: ["attention", "high", "low", "belowGoal", "aboveGoal"].includes(interpreted.status) ? "warning" : interpreted.status === "urgentAttention" ? "danger" : "success",
        label: interpreted.status === "goalMet" ? "Cel osiągnięty" : interpreted.status === "belowGoal" ? "Poniżej celu" : interpreted.status === "aboveGoal" ? "Powyżej celu" : "Wynik wymaga oceny w kontekście klinicznym", reasons: [interpreted.message],
      } : { label: "pH moczu", tone: "neutral", reasons: interpreted?.message ? [interpreted.message] : [] };
      return modeled(formulaId, parameterKey, value, "", 2, values, context, { presentation, referenceContext: { stone: interpreted } });
    }
    const sample = collection(values), daily = sample.dailyVolume;
    const weight = number(values, "weight"), urineCr = number(values, "Ucr");
    const calcium = calciumMgDl(number(values, "U_Ca")), magnesium = magnesiumMgDl(number(values, "U_Mg"));
    let value, unit = "mg/mg", digits = 3;
    const analytes = { UA_mgkg: "U_UA", Ca_mgkg: "U_Ca", Mg_mgkg: "U_Mg", Ox_mgkg: "U_Ox", Cit_mgkg: "U_Cit" };
    if (own(analytes, formulaId)) {
      const concentration = formulaId === "Ca_mgkg" ? calcium : formulaId === "Mg_mgkg" ? magnesium : number(values, analytes[formulaId]);
      value = excr_mgkg(concentration, daily, weight); unit = "mg/kg/24 h"; digits = 1;
    } else if (["Na_mmol_d", "K_mmol_d"].includes(formulaId)) {
      value = excr_mmol_d(number(values, formulaId === "Na_mmol_d" ? "U_Na" : "U_K"), daily); unit = "mmol/24 h"; digits = 1;
    } else if (formulaId === "PO4_mgkg") {
      const result = safety.computePhosphorusDzm({ concentrationMgDl: number(values, "U_PO4"), volumeMl: daily });
      value = result?.totalMg24h ?? null; unit = "mg P/24 h"; digits = 1;
    } else if (formulaId === "Prot_mgkg") {
      const amount = number(values, "U_Prot");
      const result = safety.computeProteinDzm({ totalMg24h: amount !== null && sample.minutes && sample.complete ? dailyAmount(amount, sample.minutes) : null, bsaM2: bsa(values, age) });
      if (parameterKey === "Prot_bsa" && (age === null || age >= 18)) throw new Error("To wyjście dotyczy pediatrycznej oceny z powierzchnią ciała.");
      value = parameterKey === "Prot_g24" ? result?.totalG24h : parameterKey === "Prot_bsa" ? result?.mgM2Per24h : result?.totalMg24h;
      unit = parameterKey === "Prot_g24" ? "g/24 h" : parameterKey === "Prot_bsa" ? "mg/m²/24 h" : "mg/24 h"; digits = 1;
    } else if (formulaId === "KM_Cr") value = ratio(number(values, "U_UA"), urineCr);
    else if (formulaId === "Ca_Cr") value = ratio(calcium, urineCr);
    else if (formulaId === "PO4_Cr") value = ratio(number(values, "U_PO4"), urineCr);
    else if (formulaId === "Mg_Ca") value = ratio(magnesium, calcium);
    else if (formulaId === "Ca_Cit") value = ratio(calcium, number(values, "U_Cit"));
    else if (formulaId === "B_Cr") value = proteinCreatinineRatio(number(values, "U_Prot"), urineCr, sample.volume);
    else if (formulaId === "K_frac") { value = K_frac(number(values, "U_K"), number(values, "U_Na")); unit = "%"; digits = 1; }
    else return null;
    return modeled(formulaId, parameterKey, value, unit, digits, values, context);
  }
  return Object.freeze({ math, recalculate });
});
