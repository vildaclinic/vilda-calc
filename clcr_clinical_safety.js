(function (root, factory) {
  const api = factory();
  if (root) root.ClcrClinicalSafety = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const KNOWLEDGE_PROFILE = Object.freeze({
    id: "KLIRENS_CLINICAL_RULES_2026_07_28",
    updatedAt: "2026-07-28",
    kdigo: "2024",
    eauUrolithiasis: "2026",
    kdoqiHemodialysis: "2015-update",
    pediatricEgfr: "NIDDK-CKiD-U25-2021",
  });

  const VALIDATION_GATES = Object.freeze({
    ekfc: Object.freeze({
      status: "not_enabled",
      reason:
        "EKFC wymaga odrębnej walidacji na lokalnej populacji i porównania z przyjętą ścieżką CKiD U25/CKD-EPI przed udostępnieniem wyniku.",
    }),
    laboratoryReferenceProfiles: Object.freeze({
      status: "not_configured",
      reason:
        "Zakresy zależne od lokalnej metody laboratoryjnej pozostają wyłączone do czasu wersjonowanego profilu laboratorium.",
    }),
    prospectiveClinicalValidation: Object.freeze({
      status: "required_before_clinical_release",
      reason:
        "Wymagana jest walidacja na zanonimizowanym zestawie przypadków i końcowy przegląd specjalistyczny.",
    }),
  });

  const FORMULA_POLICY = Object.freeze({
    egfr: Object.freeze({ minAgeYears: 18 }),
    ckid_u25: Object.freeze({
      minAgeYears: 1,
      maxAgeYearsExclusive: 26,
    }),
    egfr_cr_cys: Object.freeze({ minAgeYears: 18 }),
    ckid_u25_cys: Object.freeze({
      minAgeYears: 1,
      maxAgeYearsExclusive: 26,
    }),
    ckid_u25_cr_cys: Object.freeze({
      minAgeYears: 1,
      maxAgeYearsExclusive: 26,
    }),
    neonatal_egfr: Object.freeze({ neonatalTermOnly: true }),
    cg: Object.freeze({ minAgeYears: 18 }),
    cg_norm: Object.freeze({ minAgeYears: 18 }),
    cl24: Object.freeze({ ageIndependent: true }),
    sch_var: Object.freeze({
      disabled: true,
      reason:
        "Legacy Schwartz jest wyłączony z rutynowego użycia: współczynnika k nie wolno dobierać wyłącznie na podstawie wieku.",
    }),
    sch_idms: Object.freeze({ minAgeYears: 1, maxAgeYearsInclusive: 16 }),
    TMP_GFR: Object.freeze({ minAgeYears: 0 }),
    KTV: Object.freeze({ minAgeYears: 2 }),
  });

  const CREATININE_FORMULAS = Object.freeze(
    new Set([
      "egfr",
      "ckid_u25",
      "egfr_cr_cys",
      "ckid_u25_cys",
      "ckid_u25_cr_cys",
      "neonatal_egfr",
      "cg",
      "cg_norm",
      "cl24",
      "sch_var",
      "sch_idms",
      "TMP_GFR",
    ]),
  );

  function toFiniteNumber(value) {
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseAge(yearsValue, monthsValue, daysValue) {
    const years = toFiniteNumber(yearsValue);
    const monthsMissing = monthsValue === "" || monthsValue == null;
    const monthsRaw = monthsMissing ? 0 : toFiniteNumber(monthsValue);
    const daysMissing = daysValue === "" || daysValue == null;
    const daysRaw = daysMissing ? null : toFiniteNumber(daysValue);
    const hasYears = years !== null;
    const hasValidMonths =
      monthsRaw !== null &&
      Number.isInteger(monthsRaw) &&
      monthsRaw >= 0 &&
      monthsRaw <= 11;
    const hasValidDays =
      daysMissing ||
      (daysRaw !== null &&
        Number.isInteger(daysRaw) &&
        daysRaw >= 0 &&
        daysRaw <= 28 &&
        years === 0 &&
        monthsRaw === 0);
    const valid =
      hasYears &&
      Number.isInteger(years) &&
      years >= 0 &&
      years <= 120 &&
      hasValidMonths &&
      hasValidDays &&
      !(years === 0 && monthsMissing) &&
      years * 12 + monthsRaw <= 120 * 12;

    if (!valid) {
      return Object.freeze({
        valid: false,
        years: hasYears ? years : null,
        months: monthsRaw,
        daysOfLife: daysRaw,
        exactYears: null,
        totalMonths: null,
        group: null,
      });
    }

    const totalMonths = years * 12 + monthsRaw;
    const daysOfLife =
      years === 0 && monthsRaw === 0 && !daysMissing ? daysRaw : null;
    const exactYears =
      totalMonths / 12 + (daysOfLife === null ? 0 : daysOfLife / 365.2425);
    const group = exactYears < 18 ? "child" : exactYears < 65 ? "adult" : "senior";
    return Object.freeze({
      valid: true,
      years,
      months: monthsRaw,
      daysOfLife,
      exactYears,
      totalMonths,
      group,
    });
  }

  function readAgeFromDocument(doc) {
    const source = doc || (typeof document !== "undefined" ? document : null);
    if (!source) return parseAge(null, null);
    const years = source.getElementById("age");
    const months = source.getElementById("ageMonths");
    const days = source.getElementById("ageDays");
    return parseAge(
      years ? years.value : null,
      months ? months.value : null,
      days ? days.value : null,
    );
  }

  function formatAge(ageContext) {
    if (!ageContext || !ageContext.valid) return "wiek nieokreślony";
    const years = ageContext.years;
    const months = ageContext.months;
    const daysOfLife = ageContext.daysOfLife;
    if (years === 0 && months === 0 && daysOfLife !== null)
      return `${daysOfLife}. dzień życia`;
    if (years === 0) return `${months} mies.`;
    return months ? `${years} lat ${months} mies.` : `${years} lat`;
  }

  function formulaEligibility(formulaId, ageContext) {
    const policy = FORMULA_POLICY[formulaId];
    if (!policy) return Object.freeze({ eligible: true, reason: "" });
    if (policy.disabled) {
      return Object.freeze({
        eligible: false,
        reason: policy.reason || "Wzór jest wyłączony.",
      });
    }
    if (policy.neonatalTermOnly) {
      if (!ageContext || !ageContext.valid) {
        return Object.freeze({
          eligible: false,
          reason:
            "Dla wzoru noworodkowego podaj pełne lata, miesiące oraz ukończone dni życia.",
        });
      }
      if (
        ageContext.totalMonths !== 0 ||
        ageContext.daysOfLife === null ||
        ageContext.daysOfLife < 0 ||
        ageContext.daysOfLife > 28
      ) {
        return Object.freeze({
          eligible: false,
          reason:
            "Wzór noworodkowy jest dostępny wyłącznie od urodzenia do 28. dnia życia.",
        });
      }
      return Object.freeze({ eligible: true, reason: "" });
    }
    if (!policy.ageIndependent && (!ageContext || !ageContext.valid)) {
      return Object.freeze({
        eligible: false,
        reason: "Podaj prawidłowy wiek w pełnych latach i miesiącach.",
      });
    }

    const age = ageContext && ageContext.valid ? ageContext.exactYears : null;
    if (policy.minAgeYears != null && age < policy.minAgeYears) {
      return Object.freeze({
        eligible: false,
        reason:
          formulaId === "egfr"
            ? "2021 CKD‑EPI eGFRcr jest przeznaczony dla pacjentów w wieku co najmniej 18 lat."
            : formulaId === "egfr_cr_cys"
              ? "2021 CKD‑EPI eGFRcr‑cys jest przeznaczony dla pacjentów w wieku co najmniej 18 lat."
            : ["ckid_u25", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(
                  formulaId,
                )
              ? "Równania CKiD U25 są dostępne w wieku 1–25 lat, do dnia poprzedzającego 26. urodziny."
            : formulaId === "KTV"
              ? "Techniczne obliczenie spKt/Vurea nie jest dostępne przed 2. rokiem życia. W wieku 2–17 lat wynik może być pokazany wyłącznie bez dorosłych progów adekwatności i po pediatrycznym protokole slow-flow."
            : formulaId === "sch_idms"
              ? "Bedside Schwartz 2009 w tym kalkulatorze jest dostępny od 1. do 16. roku życia."
              : "Cockcroft–Gault nie jest wzorem pediatrycznym i jest dostępny od 18. roku życia.",
      });
    }
    if (
      policy.maxAgeYearsExclusive != null &&
      age >= policy.maxAgeYearsExclusive
    ) {
      return Object.freeze({
        eligible: false,
        reason:
          "Równania CKiD U25 są dostępne w wieku 1–25 lat, do dnia poprzedzającego 26. urodziny.",
      });
    }
    if (
      policy.maxAgeYearsInclusive != null &&
      age >= policy.maxAgeYearsInclusive + 1
    ) {
      return Object.freeze({
        eligible: false,
        reason:
          formulaId === "ckid_u25"
            ? "CKiD U25 eGFRcr jest dostępny w wieku 1–25 lat, do dnia poprzedzającego 26. urodziny."
            : "Bedside Schwartz 2009 w tym kalkulatorze jest dostępny od 1. do 16. roku życia.",
      });
    }
    return Object.freeze({ eligible: true, reason: "" });
  }

  function computeCkdEpi2021Cr(input) {
    const sex = input && input.sex;
    const ageYears = toFiniteNumber(input && input.ageYears);
    const creatinineMgDl = toFiniteNumber(input && input.creatinineMgDl);
    if (
      (sex !== "F" && sex !== "M") ||
      ageYears === null ||
      ageYears < 18 ||
      creatinineMgDl === null ||
      !(creatinineMgDl > 0)
    ) {
      return null;
    }
    const kappa = sex === "F" ? 0.7 : 0.9;
    const alpha = sex === "F" ? -0.241 : -0.302;
    const ratio = creatinineMgDl / kappa;
    let value =
      142 *
      Math.pow(Math.min(ratio, 1), alpha) *
      Math.pow(Math.max(ratio, 1), -1.2) *
      Math.pow(0.9938, ageYears);
    if (sex === "F") value *= 1.012;
    return Number.isFinite(value) ? value : null;
  }

  function computeBedsideSchwartz(input) {
    const heightCm = toFiniteNumber(input && input.heightCm);
    const creatinineMgDl = toFiniteNumber(input && input.creatinineMgDl);
    if (
      heightCm === null ||
      !(heightCm > 0) ||
      creatinineMgDl === null ||
      !(creatinineMgDl > 0)
    ) {
      return null;
    }
    const value = (0.413 * heightCm) / creatinineMgDl;
    return Number.isFinite(value) ? value : null;
  }

  function computeCkidU25Creatinine(input) {
    const sex = input && input.sex;
    const ageYears = toFiniteNumber(input && input.ageYears);
    const heightCm = toFiniteNumber(input && input.heightCm);
    const creatinineMgDl = toFiniteNumber(input && input.creatinineMgDl);
    if (
      (sex !== "F" && sex !== "M") ||
      ageYears === null ||
      ageYears < 1 ||
      ageYears >= 26 ||
      heightCm === null ||
      !(heightCm > 0) ||
      creatinineMgDl === null ||
      !(creatinineMgDl > 0)
    ) {
      return null;
    }

    let kappa;
    if (ageYears < 12) {
      kappa =
        (sex === "F" ? 36.1 : 39.0) * Math.pow(1.008, ageYears - 12);
    } else if (ageYears < 18) {
      kappa =
        (sex === "F" ? 36.1 : 39.0) *
        Math.pow(sex === "F" ? 1.023 : 1.045, ageYears - 12);
    } else {
      kappa = sex === "F" ? 41.4 : 50.8;
    }

    const value = kappa * (heightCm / 100 / creatinineMgDl);
    return Number.isFinite(value) ? value : null;
  }

  function computeNeonatalEgfr(input) {
    const termBorn = !!(input && input.termBorn);
    const bodyWeightKg = toFiniteNumber(input && input.bodyWeightKg);
    const daysOfLife = toFiniteNumber(input && input.daysOfLife);
    const heightCm = toFiniteNumber(input && input.heightCm);
    const creatinineMgDl = toFiniteNumber(input && input.creatinineMgDl);
    if (
      !termBorn ||
      bodyWeightKg === null ||
      !(bodyWeightKg > 2.5) ||
      daysOfLife === null ||
      !Number.isInteger(daysOfLife) ||
      daysOfLife < 0 ||
      daysOfLife > 28 ||
      heightCm === null ||
      !(heightCm > 0) ||
      creatinineMgDl === null ||
      !(creatinineMgDl > 0)
    ) {
      return null;
    }
    const value = (0.31 * heightCm) / creatinineMgDl;
    return Number.isFinite(value) ? value : null;
  }

  function computeAnionGapWithoutPotassium(input) {
    const sodium = toFiniteNumber(input && input.sodium);
    const chloride = toFiniteNumber(input && input.chloride);
    const bicarbonate = toFiniteNumber(input && input.bicarbonate);
    if (sodium === null || chloride === null || bicarbonate === null) {
      return null;
    }
    const value = sodium - chloride - bicarbonate;
    return Number.isFinite(value) ? value : null;
  }

  function computeUrineAnionGap(input) {
    const sodium = toFiniteNumber(input && input.sodium);
    const potassium = toFiniteNumber(input && input.potassium);
    const chloride = toFiniteNumber(input && input.chloride);
    if (sodium === null || potassium === null || chloride === null) {
      return null;
    }
    const value = sodium + potassium - chloride;
    return Number.isFinite(value) ? value : null;
  }

  function computeProteinDzm(input) {
    const totalMg24h = toFiniteNumber(input && input.totalMg24h);
    const bsaM2 = toFiniteNumber(input && input.bsaM2);
    if (totalMg24h === null || totalMg24h < 0) return null;
    const perBsa =
      bsaM2 !== null && bsaM2 > 0 ? totalMg24h / bsaM2 : null;
    return Object.freeze({
      totalMg24h,
      totalG24h: totalMg24h / 1000,
      mgM2Per24h: Number.isFinite(perBsa) ? perBsa : null,
    });
  }

  function computePhosphorusDzm(input) {
    const concentrationMgDl = toFiniteNumber(
      input && input.concentrationMgDl,
    );
    const volumeMl = toFiniteNumber(input && input.volumeMl);
    if (
      concentrationMgDl === null ||
      concentrationMgDl < 0 ||
      volumeMl === null ||
      !(volumeMl > 0)
    ) {
      return null;
    }
    const totalMg24h = (concentrationMgDl * volumeMl) / 100;
    return Object.freeze({
      totalMg24h,
      totalMmol24h: totalMg24h / 30.9738,
    });
  }

  function computeCystineDzm(input) {
    const concentrationMgDl = toFiniteNumber(
      input && input.concentrationMgDl,
    );
    const volumeMl = toFiniteNumber(input && input.volumeMl);
    if (concentrationMgDl === null || concentrationMgDl < 0) return null;
    const concentrationMgL = concentrationMgDl * 10;
    if (volumeMl === null || !(volumeMl > 0)) {
      return Object.freeze({
        concentrationMgL,
        totalMg24h: null,
        totalMmol24h: null,
      });
    }
    const totalMg24h = (concentrationMgDl * volumeMl) / 100;
    return Object.freeze({
      concentrationMgL,
      totalMg24h,
      totalMmol24h: totalMg24h / 240.3,
    });
  }

  function normalizeUrineCreatinine(value, unit) {
    const numeric = toFiniteNumber(value);
    if (numeric === null || !(numeric > 0)) return null;
    let mgDl = null;
    if (unit === "mg/dl" || unit === "mg/dL") mgDl = numeric;
    else if (unit === "mg/L") mgDl = numeric / 10;
    else if (unit === "umol" || unit === "\u00B5mol/L")
      mgDl = numeric / 88.4;
    else if (unit === "mmol/L") mgDl = numeric / 0.0884;
    if (!(mgDl > 0) || !Number.isFinite(mgDl)) return null;
    return Object.freeze({
      mgDl,
      mmolL: mgDl * 0.0884,
      gL: mgDl * 0.01,
    });
  }

  function computeUrineAnalyteCreatinineRatio(input) {
    const analyteMgL = toFiniteNumber(input && input.analyteMgL);
    const creatinine = normalizeUrineCreatinine(
      input && input.urineCreatinine,
      input && input.urineCreatinineUnit,
    );
    if (analyteMgL === null || analyteMgL < 0 || !creatinine) return null;
    const mgG = analyteMgL / creatinine.gL;
    const mgMmol = analyteMgL / creatinine.mmolL;
    if (!Number.isFinite(mgG) || !Number.isFinite(mgMmol)) return null;
    return Object.freeze({ mgG, mgMmol });
  }

  function computeFractionalExcretion(input) {
    if (
      !input ||
      input.pairedSameTime !== true ||
      input.sameUrineSpecimen !== true
    ) {
      return Object.freeze({
        ok: false,
        valuePct: null,
        error:
          "Frakcja wydalnicza wymaga analitu i kreatyniny z tej samej próbki moczu oraz równocześnie pobranej próbki krwi.",
      });
    }
    const urineAnalyte = toFiniteNumber(input.urineAnalyte),
      serumAnalyte = toFiniteNumber(input.serumAnalyte),
      urineCreatinine = creatinineToMmolL(
        input.urineCreatinine,
        input.urineCreatinineUnit,
      ),
      serumCreatinine = creatinineToMmolL(
        input.serumCreatinine,
        input.serumCreatinineUnit,
      );
    if (
      urineAnalyte === null ||
      urineAnalyte < 0 ||
      serumAnalyte === null ||
      !(serumAnalyte > 0) ||
      urineCreatinine === null ||
      serumCreatinine === null
    ) {
      return Object.freeze({
        ok: false,
        valuePct: null,
        error:
          "Uzupełnij zgodne stężenia analitu w moczu i surowicy oraz kreatyniny w sparowanych próbkach.",
      });
    }
    const valuePct =
      ((urineAnalyte * serumCreatinine) /
        (serumAnalyte * urineCreatinine)) *
      100;
    if (!Number.isFinite(valuePct) || valuePct < 0) {
      return Object.freeze({
        ok: false,
        valuePct: null,
        error: "Nie można wyznaczyć skończonej frakcji wydalniczej.",
      });
    }
    return Object.freeze({ ok: true, valuePct, error: "" });
  }

  function kdigoACategory(value) {
    if (!Number.isFinite(value) || value < 0) return null;
    if (value < 30)
      return Object.freeze({
        code: "A1",
        label: "A1 — prawidłowo do łagodnie zwiększona (<30 mg/g)",
      });
    if (value <= 300)
      return Object.freeze({
        code: "A2",
        label: "A2 — umiarkowanie zwiększona (30–300 mg/g)",
      });
    return Object.freeze({
      code: "A3",
      label: "A3 — znacznie zwiększona (>300 mg/g)",
    });
  }

  function formatAcrForDisplay(value) {
    if (!Number.isFinite(value) || value < 0) return null;
    const rounded = Number(value.toFixed(1));
    const rawCategory = kdigoACategory(value);
    const roundedCategory = kdigoACategory(rounded);
    const crossesCategoryBoundary =
      rawCategory &&
      roundedCategory &&
      rawCategory.code !== roundedCategory.code;
    let raw = "";
    if (crossesCategoryBoundary) {
      if (value < 30 && rounded >= 30) raw = "<30";
      else if (value > 300 && rounded <= 300) raw = ">300";
      else raw = value.toPrecision(6);
    }
    return Object.freeze({
      rounded: rounded.toFixed(1),
      raw,
      category: rawCategory,
      crossesCategoryBoundary: !!crossesCategoryBoundary,
    });
  }

  function pediatricUrineRatioThresholds(ageYearsValue) {
    const ageYears = toFiniteNumber(ageYearsValue);
    if (ageYears === null || ageYears < 0 || ageYears >= 18) return null;
    if (ageYears < 0.5)
      return Object.freeze({
        acrMgG: null,
        pcrMgG: null,
        nephroticPcrMgG: null,
        ageBand: "under6Months",
      });
    if (ageYears < 2)
      return Object.freeze({
        acrMgG: null,
        pcrMgG: 500,
        nephroticPcrMgG: ageYears >= 1 ? 2000 : null,
        ageBand: "sixMonthsToUnder2",
      });
    return Object.freeze({
      acrMgG: 30,
      pcrMgG: 200,
      nephroticPcrMgG: 2000,
      ageBand: "twoToUnder18",
    });
  }

  function phosphateToMmolL(value, unit) {
    const numeric = toFiniteNumber(value);
    if (numeric === null || !(numeric > 0)) return null;
    if (unit === "mmol/L") return numeric;
    if (unit === "mg/dl" || unit === "mg/dL") return numeric / 3.097;
    return null;
  }

  function creatinineToMmolL(value, unit) {
    const normalized = normalizeUrineCreatinine(value, unit);
    return normalized ? normalized.mmolL : null;
  }

  function computeTmpGfr(input) {
    const ageYears = toFiniteNumber(input && input.ageYears);
    if (ageYears === null || ageYears < 0 || ageYears > 120) {
      return Object.freeze({
        ok: false,
        error: "Podaj prawidłowy wiek, aby dobrać metodę TmP/GFR.",
      });
    }
    if (
      !input ||
      input.sampleKind !== "secondMorning" ||
      input.pairedSameTime !== true ||
      input.overnightFasting !== true
    ) {
      return Object.freeze({
        ok: false,
        error:
          "TmP/GFR wymaga drugiego porannego moczu po nocnym pozostawaniu na czczo oraz krwi i moczu pobranych równocześnie.",
      });
    }

    const serumPhosphate = phosphateToMmolL(
        input.serumPhosphate,
        input.serumPhosphateUnit,
      ),
      urinePhosphate = phosphateToMmolL(
        input.urinePhosphate,
        input.urinePhosphateUnit,
      ),
      serumCreatinine = creatinineToMmolL(
        input.serumCreatinine,
        input.serumCreatinineUnit,
      ),
      urineCreatinine = creatinineToMmolL(
        input.urineCreatinine,
        input.urineCreatinineUnit,
      );
    if (
      serumPhosphate === null ||
      urinePhosphate === null ||
      serumCreatinine === null ||
      urineCreatinine === null
    ) {
      return Object.freeze({
        ok: false,
        error:
          "Uzupełnij dodatnie stężenia fosforu i kreatyniny w sparowanej próbce krwi i moczu oraz ich jednostki.",
      });
    }

    const fePo4 =
        (urinePhosphate * serumCreatinine) /
        (serumPhosphate * urineCreatinine),
      trp = 1 - fePo4;
    if (
      !Number.isFinite(fePo4) ||
      !Number.isFinite(trp) ||
      fePo4 < 0 ||
      fePo4 > 1 ||
      trp < 0 ||
      trp > 1
    ) {
      return Object.freeze({
        ok: false,
        error:
          "Dane TmP/GFR są niespójne: FEPO₄ i TRP muszą mieścić się w zakresie 0–1. Sprawdź jednostki i sparowanie próbek.",
      });
    }

    let factor;
    let method;
    let branch;
    if (ageYears < 19) {
      factor = trp;
      method = "Brodehl";
      branch = "pediatric-direct";
    } else if (trp <= 0.86) {
      factor = trp;
      method = "Walton–Bijvoet/Payne";
      branch = "linear";
    } else {
      const denominator = 1 - 0.8 * trp;
      if (!(denominator > 0)) {
        return Object.freeze({
          ok: false,
          error:
            "Dane TmP/GFR są poza dziedziną skorygowanej gałęzi Waltona–Bijvoeta/Payne’a.",
        });
      }
      factor = (0.3 * trp) / denominator;
      method = "Walton–Bijvoet/Payne";
      branch = "corrected";
    }

    const tmpGfrMmolL = serumPhosphate * factor;
    if (!Number.isFinite(tmpGfrMmolL) || tmpGfrMmolL < 0) {
      return Object.freeze({
        ok: false,
        error: "Nie można wyznaczyć skończonego TmP/GFR.",
      });
    }
    return Object.freeze({
      ok: true,
      error: "",
      fePo4,
      trp,
      tmpGfrMmolL,
      tmpGfrMgDl: tmpGfrMmolL * 3.097,
      method,
      branch,
    });
  }

  function computeTimedCreatinineClearance(input) {
    const urineCreatinineMgDl = toFiniteNumber(
        input && input.urineCreatinineMgDl,
      ),
      serumCreatinineMgDl = toFiniteNumber(
        input && input.serumCreatinineMgDl,
      ),
      volumeMl = toFiniteNumber(input && input.volumeMl),
      bsaM2 = toFiniteNumber(input && input.bsaM2),
      weightKg = toFiniteNumber(input && input.weightKg),
      protocol = (input && input.protocol) || {};
    if (
      protocol.startVoidDiscarded !== true ||
      protocol.finalVoidIncluded !== true ||
      protocol.noMissedVoids !== true ||
      protocol.noSpillage !== true ||
      protocol.noExtraVoids !== true ||
      protocol.storageFollowed !== true ||
      protocol.serumSampleDuringCollection !== true
    ) {
      return Object.freeze({
        ok: false,
        error:
          "Nie potwierdzono kompletnego protokołu czasowej zbiórki moczu i pobrania kreatyniny w surowicy podczas zbiórki.",
      });
    }
    const collectionStartMs = Date.parse(
        (input && input.collectionStartAt) || "",
      ),
      collectionEndMs = Date.parse((input && input.collectionEndAt) || ""),
      serumSampleMs = Date.parse((input && input.serumSampleAt) || "");
    if (
      !Number.isFinite(collectionStartMs) ||
      !Number.isFinite(collectionEndMs) ||
      !Number.isFinite(serumSampleMs) ||
      !(collectionEndMs > collectionStartMs) ||
      serumSampleMs < collectionStartMs ||
      serumSampleMs > collectionEndMs
    ) {
      return Object.freeze({
        ok: false,
        error:
          "Podaj dokładny początek i koniec zbiórki oraz czas pobrania kreatyniny w surowicy mieszczący się w tym przedziale.",
      });
    }
    const durationMinutes =
      (collectionEndMs - collectionStartMs) / 60000;
    if (
      urineCreatinineMgDl === null ||
      !(urineCreatinineMgDl > 0) ||
      serumCreatinineMgDl === null ||
      !(serumCreatinineMgDl > 0) ||
      volumeMl === null ||
      !(volumeMl > 0) ||
      durationMinutes === null ||
      !(durationMinutes > 0) ||
      bsaM2 === null ||
      !(bsaM2 > 0) ||
      weightKg === null ||
      !(weightKg > 0)
    ) {
      return Object.freeze({
        ok: false,
        error:
          "Uzupełnij dodatnie Ucr, Scr, objętość, dokładny czas zbiórki, masę i wzrost.",
      });
    }
    const absoluteMlMin =
        (urineCreatinineMgDl / serumCreatinineMgDl) *
        (volumeMl / durationMinutes),
      indexedMlMin173 = absoluteMlMin * (1.73 / bsaM2),
      creatinineMgCollection = (urineCreatinineMgDl * volumeMl) / 100,
      creatinineMgDay =
        creatinineMgCollection * (1440 / durationMinutes),
      creatinineMgKgDay = creatinineMgDay / weightKg;
    if (
      ![
        absoluteMlMin,
        indexedMlMin173,
        creatinineMgCollection,
        creatinineMgDay,
        creatinineMgKgDay,
      ].every(Number.isFinite)
    ) {
      return Object.freeze({
        ok: false,
        error: "Nie można wyznaczyć skończonego klirensu kreatyniny.",
      });
    }
    return Object.freeze({
      ok: true,
      error: "",
      absoluteMlMin,
      indexedMlMin173,
      durationMinutes,
      durationHours: durationMinutes / 60,
      creatinineMgCollection,
      creatinineMgDay,
      creatinineMgKgDay,
    });
  }

  function creatininePolicy(state, suspectedAKI) {
    if (suspectedAKI || state === "rapidlyChanging") {
      return Object.freeze({
        calculationAllowed: false,
        categoryAllowed: false,
        status: "blocked",
        message:
          "Podejrzenie AKI lub szybko zmieniający się marker filtracji: nie raportuje się eGFR/eCrCl jako bieżącej funkcji nerek.",
      });
    }
    if (state === "stable") {
      return Object.freeze({
        calculationAllowed: true,
        categoryAllowed: true,
        status: "stable",
        message: "",
      });
    }
    return Object.freeze({
      calculationAllowed: true,
      categoryAllowed: false,
      status: "unknown",
      message:
        "Nie potwierdzono stabilności używanych markerów filtracji. Wynik jest wyłącznie oszacowaniem; kategoria G i kolorowanie kliniczne są wyłączone.",
    });
  }

  function formulaSafety(
    formulaId,
    ageContext,
    creatinineContext,
    populationContext,
  ) {
    const ageResult = formulaEligibility(formulaId, ageContext);
    if (!ageResult.eligible) return ageResult;
    if (
      formulaId === "neonatal_egfr" &&
      (!populationContext || populationContext.termStatus !== "term")
    ) {
      return Object.freeze({
        eligible: false,
        reason:
          populationContext && populationContext.termStatus === "preterm"
            ? "Wzór 0,31 × wzrost/Scr nie został zwalidowany dla wcześniaków. Nie obliczono eGFR."
            : "Przed użyciem wzoru noworodkowego potwierdź, że pacjent urodził się o czasie.",
      });
    }
    if (formulaId === "neonatal_egfr") {
      const bodyWeightKg = toFiniteNumber(
        populationContext && populationContext.bodyWeightKg,
      );
      if (bodyWeightKg === null) {
        return Object.freeze({
          eligible: false,
          reason:
            "Podaj aktualną masę ciała. Prospektywna walidacja obejmowała donoszone noworodki o bieżącej masie >2,5 kg.",
        });
      }
      if (!(bodyWeightKg > 2.5)) {
        return Object.freeze({
          eligible: false,
          reason:
            "Wzór noworodkowy nie został zwalidowany dla bieżącej masy ciała ≤2,5 kg. Nie obliczono eGFR.",
        });
      }
      if (
        !populationContext ||
        populationContext.scrAssay !== "enzymatic_idms"
      ) {
        return Object.freeze({
          eligible: false,
          reason:
            "Ścieżka noworodkowa wymaga potwierdzenia enzymatycznego oznaczenia kreatyniny standaryzowanego do IDMS.",
        });
      }
    }
    if (
      CREATININE_FORMULAS.has(formulaId) &&
      creatinineContext &&
      !creatinineContext.calculationAllowed
    ) {
      return Object.freeze({
        eligible: false,
        reason:
          formulaId === "TMP_GFR"
            ? "Podejrzenie AKI lub szybko zmieniająca się kreatynina: nie oblicza się TmP/GFR z niespójnego czasowo układu kreatyniny w sparowanych próbkach."
            : ["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(
                  formulaId,
                )
              ? "Podejrzenie AKI lub stan niestacjonarny markerów filtracji: równanie z cystatyną C nie jest raportowane jako bieżąca funkcja nerek."
            : creatinineContext.message,
      });
    }
    return Object.freeze({ eligible: true, reason: "" });
  }

  function kdigoGCategory(value) {
    if (!Number.isFinite(value) || value < 0) return null;
    if (value >= 90)
      return Object.freeze({
        code: "G1",
        label: "G1 — prawidłowa lub wysoka (≥90)",
      });
    if (value >= 60)
      return Object.freeze({
        code: "G2",
        label: "G2 — łagodnie zmniejszona (60–89)",
      });
    if (value >= 45)
      return Object.freeze({
        code: "G3a",
        label: "G3a — łagodnie do umiarkowanie zmniejszona (45–59)",
      });
    if (value >= 30)
      return Object.freeze({
        code: "G3b",
        label: "G3b — umiarkowanie do znacznie zmniejszona (30–44)",
      });
    if (value >= 15)
      return Object.freeze({
        code: "G4",
        label: "G4 — znacznie zmniejszona (15–29)",
      });
    return Object.freeze({
      code: "G5",
      label: "G5 — niewydolność nerek (<15)",
    });
  }

  function formatGfrForDisplay(value) {
    if (!Number.isFinite(value) || value < 0) return null;
    const rounded = Math.round(value);
    const rawCategory = kdigoGCategory(value);
    const roundedCategory = kdigoGCategory(rounded);
    const crossesCategoryBoundary =
      rawCategory &&
      roundedCategory &&
      rawCategory.code !== roundedCategory.code;
    const thresholds = [90, 60, 45, 30, 15];
    let raw = "";
    if (crossesCategoryBoundary) {
      const crossedThreshold = thresholds.find(
        (threshold) => value < threshold && rounded >= threshold,
      );
      raw = crossedThreshold == null
        ? value.toPrecision(6)
        : `<${crossedThreshold}`;
    }
    return Object.freeze({
      rounded: String(rounded),
      raw,
      category: rawCategory,
      crossesCategoryBoundary: !!crossesCategoryBoundary,
    });
  }

  return Object.freeze({
    KNOWLEDGE_PROFILE,
    VALIDATION_GATES,
    FORMULA_POLICY,
    parseAge,
    readAgeFromDocument,
    formatAge,
    formulaEligibility,
    computeCkdEpi2021Cr,
    computeBedsideSchwartz,
    computeCkidU25Creatinine,
    computeNeonatalEgfr,
    computeAnionGapWithoutPotassium,
    computeUrineAnionGap,
    computeProteinDzm,
    computePhosphorusDzm,
    computeCystineDzm,
    normalizeUrineCreatinine,
    computeUrineAnalyteCreatinineRatio,
    computeFractionalExcretion,
    kdigoACategory,
    formatAcrForDisplay,
    pediatricUrineRatioThresholds,
    computeTmpGfr,
    computeTimedCreatinineClearance,
    creatininePolicy,
    formulaSafety,
    kdigoGCategory,
    formatGfrForDisplay,
  });
});
