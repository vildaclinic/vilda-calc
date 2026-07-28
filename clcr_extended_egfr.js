(function (root, factory) {
  const api = factory();
  if (root) root.ClcrExtendedEgfr = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /*
   * Public input contract:
   * - every function requires ageYears and explicit measurement units;
   * - sex-dependent equations accept only "F" or "M";
   * - creatinine requires creatinineStandardization: "IDMS";
   * - cystatin C requires cystatinCStandardization:
   *   "ERM-DA471/IFCC" (the NIDDK underscore spelling is also recognized).
   * No function infers a unit, sex, population, or assay standardization.
   */

  const EQUATIONS = Object.freeze({
    haycockBsa: "Haycock BSA (pediatric application policy)",
    ckdEpi2021CrCys: "2021 CKD-EPI eGFRcr-cys",
    ckidU25Cys: "CKiD U25 eGFRcys",
    ckidU25CrCys: "CKiD U25 eGFRcr-cys",
  });

  const UNITS = Object.freeze({
    bsa: "m²",
    egfr: "mL/min/1.73 m²",
    heightCm: "cm",
    heightM: "m",
    weightKg: "kg",
    creatinineMgDl: "mg/dL",
    creatinineMicromolL: "µmol/L",
    creatinineMicromolLAscii: "umol/L",
    cystatinCMgL: "mg/L",
  });

  const STANDARDIZATIONS = Object.freeze({
    creatinine: "IDMS",
    cystatinC: "ERM-DA471/IFCC",
    cystatinCAlias: "ERM-DA471_IFCC",
  });

  const AGE_RANGES = Object.freeze({
    haycockPediatric: Object.freeze({
      minYearsInclusive: 0,
      maxYearsExclusive: 18,
    }),
    ckdEpi2021CrCys: Object.freeze({
      minYearsInclusive: 18,
      maxYearsInclusive: 120,
    }),
    ckidU25: Object.freeze({
      minYearsInclusive: 1,
      maxYearsExclusive: 26,
    }),
  });

  const EMPTY_WARNINGS = Object.freeze([]);
  const U25_CYS_WARNINGS = Object.freeze([
    "CKiD U25 eGFRcys opracowano dla dzieci i młodych dorosłych z łagodną lub umiarkowaną CKD; nie należy używać samego wyniku do przesiewu bezobjawowej, zdrowej populacji.",
  ]);
  const U25_COMBINED_WARNINGS = Object.freeze([
    "CKiD U25 eGFRcr-cys jest średnią dwóch oszacowań U25 i dotyczy populacji z łagodną lub umiarkowaną CKD.",
  ]);

  function toFiniteNumber(value) {
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function issue(code, error, field) {
    return Object.freeze({ code, error, field });
  }

  function failure(equation, unit, problem) {
    return Object.freeze({
      ok: false,
      value: null,
      unit,
      equation,
      code: problem.code,
      error: problem.error,
      field: problem.field,
      warnings: EMPTY_WARNINGS,
      details: null,
    });
  }

  function success(equation, unit, value, details, warnings) {
    if (!Number.isFinite(value)) {
      return failure(
        equation,
        unit,
        issue(
          "NON_FINITE_RESULT",
          "Nie można wyznaczyć skończonego wyniku dla podanych danych.",
          "",
        ),
      );
    }
    return Object.freeze({
      ok: true,
      value,
      unit,
      equation,
      code: "",
      error: "",
      field: "",
      warnings: warnings || EMPTY_WARNINGS,
      details: Object.freeze(details || {}),
    });
  }

  function validateAge(ageValue, range, description) {
    const ageYears = toFiniteNumber(ageValue);
    if (ageYears === null) {
      return {
        problem: issue(
          "AGE_REQUIRED",
          "Podaj wiek jako skończoną liczbę lat.",
          "ageYears",
        ),
      };
    }

    const belowMinimum = ageYears < range.minYearsInclusive;
    const aboveExclusiveMaximum =
      range.maxYearsExclusive != null &&
      ageYears >= range.maxYearsExclusive;
    const aboveInclusiveMaximum =
      range.maxYearsInclusive != null &&
      ageYears > range.maxYearsInclusive;

    if (belowMinimum || aboveExclusiveMaximum || aboveInclusiveMaximum) {
      return {
        problem: issue(
          "AGE_OUT_OF_RANGE",
          `Wiek jest poza zakresem ${description}.`,
          "ageYears",
        ),
      };
    }
    return { value: ageYears };
  }

  function validateSex(sex) {
    if (sex !== "F" && sex !== "M") {
      return {
        problem: issue(
          "SEX_INVALID",
          'Płeć biologiczna wymagana przez równanie musi mieć wartość "F" albo "M"; nie zastosowano wartości domyślnej.',
          "sex",
        ),
      };
    }
    return { value: sex };
  }

  function validatePositive(value, field, label) {
    const parsed = toFiniteNumber(value);
    if (parsed === null || !(parsed > 0)) {
      const code = `${field.replace(/([A-Z])/g, "_$1").toUpperCase()}_INVALID`;
      return {
        problem: issue(
          code,
          `${label} musi być skończoną liczbą większą od 0.`,
          field,
        ),
      };
    }
    return { value: parsed };
  }

  function normalizeHeightToMeters(input) {
    const height = validatePositive(
      input && input.heightValue,
      "heightValue",
      "Wzrost",
    );
    if (height.problem) return height;

    const heightUnit = input && input.heightUnit;
    if (heightUnit === UNITS.heightCm) {
      return { value: height.value / 100, inputUnit: heightUnit };
    }
    if (heightUnit === UNITS.heightM) {
      return { value: height.value, inputUnit: heightUnit };
    }
    return {
      problem: issue(
        "HEIGHT_UNIT_INVALID",
        'Jednostka wzrostu musi mieć jawną wartość "cm" albo "m".',
        "heightUnit",
      ),
    };
  }

  function normalizeCreatinineToMgDl(input) {
    const creatinine = validatePositive(
      input && input.creatinineValue,
      "creatinineValue",
      "Stężenie kreatyniny",
    );
    if (creatinine.problem) return creatinine;

    const unit = input && input.creatinineUnit;
    let valueMgDl;
    if (unit === UNITS.creatinineMgDl) {
      valueMgDl = creatinine.value;
    } else if (
      unit === UNITS.creatinineMicromolL ||
      unit === UNITS.creatinineMicromolLAscii
    ) {
      valueMgDl = creatinine.value / 88.4;
    } else {
      return {
        problem: issue(
          "CREATININE_UNIT_INVALID",
          'Jednostka kreatyniny musi mieć jawną wartość "mg/dL", "µmol/L" albo "umol/L".',
          "creatinineUnit",
        ),
      };
    }

    if (
      !input ||
      input.creatinineStandardization !== STANDARDIZATIONS.creatinine
    ) {
      return {
        problem: issue(
          "CREATININE_STANDARDIZATION_REQUIRED",
          "Równanie wymaga potwierdzonej standaryzacji kreatyniny do procedury referencyjnej IDMS.",
          "creatinineStandardization",
        ),
      };
    }
    return { value: valueMgDl, inputUnit: unit };
  }

  function normalizeCystatinCToMgL(input) {
    const cystatinC = validatePositive(
      input && input.cystatinCValue,
      "cystatinCValue",
      "Stężenie cystatyny C",
    );
    if (cystatinC.problem) return cystatinC;

    if (!input || input.cystatinCUnit !== UNITS.cystatinCMgL) {
      return {
        problem: issue(
          "CYSTATIN_C_UNIT_INVALID",
          'Jednostka cystatyny C musi mieć jawną wartość "mg/L".',
          "cystatinCUnit",
        ),
      };
    }
    if (
      input.cystatinCStandardization !== STANDARDIZATIONS.cystatinC &&
      input.cystatinCStandardization !== STANDARDIZATIONS.cystatinCAlias
    ) {
      return {
        problem: issue(
          "CYSTATIN_C_STANDARDIZATION_REQUIRED",
          "Równanie wymaga cystatyny C z potwierdzoną identyfikowalnością do materiału ERM-DA471/IFCC.",
          "cystatinCStandardization",
        ),
      };
    }
    return {
      value: cystatinC.value,
      inputUnit: input.cystatinCUnit,
    };
  }

  function computeHaycockBsa(input) {
    const equation = EQUATIONS.haycockBsa;
    const age = validateAge(
      input && input.ageYears,
      AGE_RANGES.haycockPediatric,
      "pediatrycznej polityki Haycock: od urodzenia do dnia poprzedzającego 18. urodziny",
    );
    if (age.problem) return failure(equation, UNITS.bsa, age.problem);

    const height = validatePositive(
      input && input.heightValue,
      "heightValue",
      "Wzrost",
    );
    if (height.problem) return failure(equation, UNITS.bsa, height.problem);
    if (!input || input.heightUnit !== UNITS.heightCm) {
      return failure(
        equation,
        UNITS.bsa,
        issue(
          "HEIGHT_UNIT_INVALID",
          'Wzór Haycocka w tym kontrakcie wymaga wzrostu w "cm".',
          "heightUnit",
        ),
      );
    }

    const weight = validatePositive(
      input && input.weightValue,
      "weightValue",
      "Masa ciała",
    );
    if (weight.problem) return failure(equation, UNITS.bsa, weight.problem);
    if (!input || input.weightUnit !== UNITS.weightKg) {
      return failure(
        equation,
        UNITS.bsa,
        issue(
          "WEIGHT_UNIT_INVALID",
          'Wzór Haycocka wymaga masy ciała w "kg".',
          "weightUnit",
        ),
      );
    }

    const value =
      0.024265 *
      Math.pow(height.value, 0.3964) *
      Math.pow(weight.value, 0.5378);
    return success(equation, UNITS.bsa, value, {
      ageYears: age.value,
      heightCm: height.value,
      weightKg: weight.value,
      agePolicy: "0 <= ageYears < 18",
    });
  }

  function computeCkdEpi2021CrCys(input) {
    const equation = EQUATIONS.ckdEpi2021CrCys;
    const age = validateAge(
      input && input.ageYears,
      AGE_RANGES.ckdEpi2021CrCys,
      "2021 CKD-EPI eGFRcr-cys: 18–120 lat",
    );
    if (age.problem) return failure(equation, UNITS.egfr, age.problem);

    const sex = validateSex(input && input.sex);
    if (sex.problem) return failure(equation, UNITS.egfr, sex.problem);

    const creatinine = normalizeCreatinineToMgDl(input);
    if (creatinine.problem)
      return failure(equation, UNITS.egfr, creatinine.problem);

    const cystatinC = normalizeCystatinCToMgL(input);
    if (cystatinC.problem)
      return failure(equation, UNITS.egfr, cystatinC.problem);

    const kappa = sex.value === "F" ? 0.7 : 0.9;
    const alpha = sex.value === "F" ? -0.219 : -0.144;
    const creatinineRatio = creatinine.value / kappa;
    const cystatinRatio = cystatinC.value / 0.8;

    let value =
      135 *
      Math.pow(Math.min(creatinineRatio, 1), alpha) *
      Math.pow(Math.max(creatinineRatio, 1), -0.544) *
      Math.pow(Math.min(cystatinRatio, 1), -0.323) *
      Math.pow(Math.max(cystatinRatio, 1), -0.778) *
      Math.pow(0.9961, age.value);
    if (sex.value === "F") value *= 0.963;

    return success(equation, UNITS.egfr, value, {
      ageYears: age.value,
      sex: sex.value,
      creatinineMgDl: creatinine.value,
      cystatinCMgL: cystatinC.value,
      creatinineInputUnit: creatinine.inputUnit,
      creatinineStandardization: STANDARDIZATIONS.creatinine,
      cystatinCStandardization: STANDARDIZATIONS.cystatinC,
    });
  }

  function ckidU25CystatinKappa(ageYears, sex) {
    if (sex === "F") {
      if (ageYears < 12) return 79.9 * Math.pow(1.004, ageYears - 12);
      if (ageYears < 18) return 79.9 * Math.pow(0.974, ageYears - 12);
      return 68.3;
    }
    if (ageYears < 15) return 87.2 * Math.pow(1.011, ageYears - 15);
    if (ageYears < 18) return 87.2 * Math.pow(0.96, ageYears - 15);
    return 77.1;
  }

  function ckidU25CreatinineKappa(ageYears, sex) {
    if (ageYears < 12) {
      return (sex === "F" ? 36.1 : 39.0) * Math.pow(1.008, ageYears - 12);
    }
    if (ageYears < 18) {
      return (
        (sex === "F" ? 36.1 : 39.0) *
        Math.pow(sex === "F" ? 1.023 : 1.045, ageYears - 12)
      );
    }
    return sex === "F" ? 41.4 : 50.8;
  }

  function validateCkidU25Core(input, equation) {
    const age = validateAge(
      input && input.ageYears,
      AGE_RANGES.ckidU25,
      "CKiD U25: wiek 1–25 lat, do dnia poprzedzającego 26. urodziny",
    );
    if (age.problem) return { result: failure(equation, UNITS.egfr, age.problem) };

    const sex = validateSex(input && input.sex);
    if (sex.problem) return { result: failure(equation, UNITS.egfr, sex.problem) };

    const cystatinC = normalizeCystatinCToMgL(input);
    if (cystatinC.problem) {
      return { result: failure(equation, UNITS.egfr, cystatinC.problem) };
    }
    return { age, sex, cystatinC };
  }

  function computeCkidU25Cys(input) {
    const equation = EQUATIONS.ckidU25Cys;
    const validated = validateCkidU25Core(input, equation);
    if (validated.result) return validated.result;

    const kappa = ckidU25CystatinKappa(
      validated.age.value,
      validated.sex.value,
    );
    const value = kappa / validated.cystatinC.value;
    return success(
      equation,
      UNITS.egfr,
      value,
      {
        ageYears: validated.age.value,
        sex: validated.sex.value,
        cystatinCMgL: validated.cystatinC.value,
        kappa,
        cystatinCStandardization: STANDARDIZATIONS.cystatinC,
        agePolicy: "1 <= ageYears < 26",
      },
      U25_CYS_WARNINGS,
    );
  }

  function computeCkidU25CrCys(input) {
    const equation = EQUATIONS.ckidU25CrCys;
    const validated = validateCkidU25Core(input, equation);
    if (validated.result) return validated.result;

    const height = normalizeHeightToMeters(input);
    if (height.problem) return failure(equation, UNITS.egfr, height.problem);

    const creatinine = normalizeCreatinineToMgDl(input);
    if (creatinine.problem)
      return failure(equation, UNITS.egfr, creatinine.problem);

    const cystatinKappa = ckidU25CystatinKappa(
      validated.age.value,
      validated.sex.value,
    );
    const creatinineKappa = ckidU25CreatinineKappa(
      validated.age.value,
      validated.sex.value,
    );
    const egfrCreatinine =
      (creatinineKappa * height.value) / creatinine.value;
    const egfrCystatin = cystatinKappa / validated.cystatinC.value;
    const value = (egfrCreatinine + egfrCystatin) / 2;

    return success(
      equation,
      UNITS.egfr,
      value,
      {
        ageYears: validated.age.value,
        sex: validated.sex.value,
        heightM: height.value,
        creatinineMgDl: creatinine.value,
        cystatinCMgL: validated.cystatinC.value,
        creatinineKappa,
        cystatinKappa,
        egfrCreatinine,
        egfrCystatin,
        combination: "arithmetic mean of U25 eGFRcr and U25 eGFRcys",
        creatinineStandardization: STANDARDIZATIONS.creatinine,
        cystatinCStandardization: STANDARDIZATIONS.cystatinC,
        agePolicy: "1 <= ageYears < 26",
      },
      U25_COMBINED_WARNINGS,
    );
  }

  return Object.freeze({
    EQUATIONS,
    UNITS,
    STANDARDIZATIONS,
    AGE_RANGES,
    computeHaycockBsa,
    computeCkdEpi2021CrCys,
    computeCkidU25Cys,
    computeCkidU25CrCys,
    computeCkdEpi2021CreatinineCystatinC: computeCkdEpi2021CrCys,
    computeCkidU25CystatinC: computeCkidU25Cys,
    computeCkidU25CreatinineCystatinC: computeCkidU25CrCys,
  });
});
