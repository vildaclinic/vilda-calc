(function (root, factory) {
  const api = factory();
  if (root) root.ClcrDialysisSafety = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const GFAC_BY_SCHEDULE_AND_PIDI = Object.freeze({
    2: Object.freeze({ 3: 0.0055, 4: 0.0045 }),
    3: Object.freeze({ 2: 0.008, 3: 0.006 }),
    4: Object.freeze({ 1: 0.0155, 2: 0.009 }),
    5: Object.freeze({ 1: 0.0175, 2: 0.0095 }),
    6: Object.freeze({ 1: 0.0175, 2: 0.0095 }),
    7: Object.freeze({ 1: 0.0175, 2: 0.0175 }),
  });

  const SOURCES = Object.freeze({
    spKtV:
      "Daugirdas et al. Nephrol Dial Transplant. 2013;28:2156–2160. doi:10.1093/ndt/gfs115",
    eKtV:
      "Daugirdas. Adv Ren Replace Ther. 1995;2:295–304. doi:10.1016/S1073-4449(12)80028-8",
    targets:
      "KDOQI Clinical Practice Guideline for Hemodialysis Adequacy: 2015 update; KDOQI 2006 HD adequacy guideline 4",
    sampling: "KDOQI 2006 HD adequacy guideline 3",
  });

  const SUPPORTED_UREA_UNITS = Object.freeze(
    new Set(["mg/dl", "mg/l", "mmol/l", "g/l"]),
  );
  const MAX_DURATION_MINUTES = 480;
  const MAX_NET_UF_LITERS = 10;
  const MAX_POST_WEIGHT_KG = 300;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value))
      return value;
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function isMissing(value) {
    return value === "" || value == null;
  }

  function toFiniteNumber(value) {
    if (isMissing(value)) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeToken(value) {
    return isMissing(value)
      ? ""
      : String(value).trim().toLowerCase().replace(/\s+/g, "");
  }

  function normalizeAnalyte(value) {
    const token = normalizeToken(value);
    if (token === "bun") return "BUN";
    if (token === "urea" || token === "mocznik") return "urea";
    return null;
  }

  function normalizeUreaUnit(value) {
    const token = normalizeToken(value)
      .replace(/µ/g, "u")
      .replace(/μ/g, "u");
    return SUPPORTED_UREA_UNITS.has(token) ? token : null;
  }

  function normalizeAccess(value) {
    const token = normalizeToken(value).replace(/[-/]/g, "_");
    if (["av", "avf", "avg", "avf_avg", "avfavg"].includes(token))
      return "AVF_AVG";
    if (
      ["cvc", "catheter", "cewnik", "centralvenouscatheter"].includes(token)
    )
      return "CVC";
    if (token === "" || token === "unknown" || token === "nieznany")
      return "UNKNOWN";
    return "INVALID";
  }

  function normalizeKruUnit(value) {
    const token = normalizeToken(value)
      .replace(/²/g, "2")
      .replace(/\^2/g, "2")
      .replace(/ml/g, "ml");
    return token === "ml/min/1.73m2" ? "mL/min/1.73m²" : null;
  }

  function makeMessage(code, message, field) {
    return field ? { code, message, field } : { code, message };
  }

  function parseAge(input, errors) {
    const years = toFiniteNumber(input && input.ageYears);
    const months = isMissing(input && input.ageMonths)
      ? 0
      : toFiniteNumber(input && input.ageMonths);
    if (
      years === null ||
      months === null ||
      !Number.isInteger(years) ||
      !Number.isInteger(months) ||
      years < 0 ||
      years > 120 ||
      months < 0 ||
      months > 11 ||
      years * 12 + months > 120 * 12
    ) {
      errors.push(
        makeMessage(
          "AGE_INVALID",
          "Podaj prawidłowy wiek w pełnych latach i miesiącach.",
          "ageYears",
        ),
      );
      return null;
    }
    const exactYears = (years * 12 + months) / 12;
    return {
      years,
      months,
      exactYears,
      population: exactYears < 18 ? "pediatric" : "adult",
    };
  }

  function parseIsoDate(value) {
    if (typeof value !== "string") return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    )
      return null;
    return date;
  }

  function isoToday() {
    return localIsoDate(new Date());
  }

  function localIsoDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addUtcMonths(date, months) {
    const targetYear = date.getUTCFullYear();
    const targetMonth = date.getUTCMonth() + months;
    const lastDay = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0),
    ).getUTCDate();
    return new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        Math.min(date.getUTCDate(), lastDay),
      ),
    );
  }

  function resolveKru(input, errors, warnings) {
    const rawValue = input && input.kruValue;
    const evaluationDateText =
      (input && input.evaluationDate) || isoToday();
    const evaluationDate = parseIsoDate(evaluationDateText);
    if (!evaluationDate) {
      errors.push(
        makeMessage(
          "EVALUATION_DATE_INVALID",
          "Data oceny musi mieć format RRRR-MM-DD.",
          "evaluationDate",
        ),
      );
    }

    if (isMissing(rawValue)) {
      warnings.push(
        makeMessage(
          "KRU_UNKNOWN",
          "Nie podano okresowo zmierzonego resztkowego klirensu mocznika (Kru); wynik pozostaje bez oceny progami 1,2/1,4.",
          "kruValue",
        ),
      );
      return {
        value: null,
        unit: null,
        measuredAt: null,
        evaluationDate: evaluationDateText,
        current: false,
        low: null,
      };
    }

    const value = toFiniteNumber(rawValue);
    if (value === null || value < 0) {
      errors.push(
        makeMessage(
          "KRU_INVALID",
          "Kru musi być skończoną wartością nieujemną.",
          "kruValue",
        ),
      );
      return {
        value: null,
        unit: null,
        measuredAt: null,
        evaluationDate: evaluationDateText,
        current: false,
        low: null,
      };
    }

    const unit = normalizeKruUnit(input && input.kruUnit);
    if (!unit) {
      errors.push(
        makeMessage(
          "KRU_UNIT_INVALID",
          "Kru należy podać w mL/min/1,73 m².",
          "kruUnit",
        ),
      );
    }

    const measuredAtText = input && input.kruMeasuredAt;
    const measuredAt = parseIsoDate(measuredAtText);
    let current = false;
    if (!measuredAt) {
      warnings.push(
        makeMessage(
          "KRU_DATE_MISSING_OR_INVALID",
          "Bez prawidłowej daty pomiaru Kru nie można zastosować progów adekwatności.",
          "kruMeasuredAt",
        ),
      );
    } else if (evaluationDate && measuredAt > evaluationDate) {
      warnings.push(
        makeMessage(
          "KRU_DATE_IN_FUTURE",
          "Data pomiaru Kru nie może przypadać po dacie oceny.",
          "kruMeasuredAt",
        ),
      );
    } else if (evaluationDate) {
      current = evaluationDate <= addUtcMonths(measuredAt, 3);
      if (!current) {
        warnings.push(
          makeMessage(
            "KRU_STALE",
            "Pomiar Kru jest starszy niż 3 miesiące; nie użyto go do automatycznej interpretacji.",
            "kruMeasuredAt",
          ),
        );
      }
    }

    if (value >= 2) {
      warnings.push(
        makeMessage(
          "KRU_NOT_LOW",
          "Kru wynosi co najmniej 2 mL/min/1,73 m²; progi sesyjne 1,2/1,4 nie są automatycznie stosowane.",
          "kruValue",
        ),
      );
    }

    return {
      value,
      unit,
      measuredAt: measuredAt ? measuredAtText : null,
      evaluationDate: evaluationDateText,
      current: !!(unit && current),
      low: value < 2,
    };
  }

  function validateSampling(input, age, errors) {
    const sampling = input && input.sampling;
    if (!sampling || sampling.sameSession !== true) {
      errors.push(
        makeMessage(
          "SAMPLES_NOT_CONFIRMED_SAME_SESSION",
          "Próbki przed i po dializie muszą pochodzić z tej samej sesji.",
          "sampling.sameSession",
        ),
      );
    }
    if (!sampling || sampling.preBeforeDialysis !== true) {
      errors.push(
        makeMessage(
          "PRE_SAMPLE_TIMING_INVALID",
          "Próbkę przed dializą należy pobrać przed rozpoczęciem zabiegu.",
          "sampling.preBeforeDialysis",
        ),
      );
    }
    if (!sampling || sampling.preNoSalineHeparinDilution !== true) {
      errors.push(
        makeMessage(
          "PRE_SAMPLE_DILUTION_NOT_EXCLUDED",
          "Należy potwierdzić pobranie próbki przed podaniem soli, heparyny lub innym rozcieńczeniem.",
          "sampling.preNoSalineHeparinDilution",
        ),
      );
    }

    const postMethod = sampling && sampling.postMethod;
    if (
      postMethod !== "slow_flow_100ml_15s" &&
      postMethod !== "stop_dialysate_3min"
    ) {
      errors.push(
        makeMessage(
          "POST_SAMPLE_METHOD_INVALID",
          "Wybierz zwalidowany protokół próbki po dializie: slow-flow 100 mL/min przez 15 s albo stop-dialysate-flow przez 3 min.",
          "sampling.postMethod",
        ),
      );
    } else if (
      age &&
      age.population === "pediatric" &&
      postMethod === "stop_dialysate_3min"
    ) {
      errors.push(
        makeMessage(
          "PEDIATRIC_STOP_DIALYSATE_UNVALIDATED",
          "Metoda stop-dialysate-flow nie została zwalidowana w dializie pediatrycznej; wymagana jest ścieżka slow-flow.",
          "sampling.postMethod",
        ),
      );
    }
    return postMethod || null;
  }

  function resolveGfac(sessionsPerWeek, pidiDays) {
    const schedule = GFAC_BY_SCHEDULE_AND_PIDI[sessionsPerWeek];
    return schedule && Object.prototype.hasOwnProperty.call(schedule, pidiDays)
      ? schedule[pidiDays]
      : null;
  }

  function classifySpKtV(value) {
    if (value < 1.2)
      return {
        code: "BELOW_MINIMUM",
        label: "Poniżej minimalnej dawki sesyjnej (<1,2)",
      };
    if (value < 1.4)
      return {
        code: "MINIMUM_MET_BELOW_TARGET",
        label: "Minimum osiągnięte; poniżej celu (1,2–<1,4)",
      };
    return {
      code: "TARGET_MET",
      label: "Cel sesyjny osiągnięty (≥1,4)",
    };
  }

  function classifyUrr(value) {
    if (value < 65)
      return {
        code: "BELOW_MINIMUM",
        label: "URR poniżej historycznego minimum 65%",
      };
    if (value < 70)
      return {
        code: "MINIMUM_MET_BELOW_TARGET",
        label: "URR minimum osiągnięte; poniżej celu 70%",
      };
    return {
      code: "TARGET_MET",
      label: "Historyczny cel URR 70% osiągnięty",
    };
  }

  function thresholdSafeSpDisplay(value) {
    const rounded = Number(value.toFixed(2));
    if (value < 1.2 && rounded >= 1.2) return "<1.20";
    if (value < 1.4 && rounded >= 1.4) return "<1.40";
    return value.toFixed(2);
  }

  function thresholdSafeUrrDisplay(value) {
    const rounded = Number(value.toFixed(1));
    if (value < 65 && rounded >= 65) return "<65.0";
    if (value < 70 && rounded >= 70) return "<70.0";
    return value.toFixed(1);
  }

  function emptyValues() {
    return {
      ratio: null,
      gfac: null,
      logarithmArgument: null,
      spKtV: null,
      eKtV: null,
      urrPct: null,
    };
  }

  function buildFailure(errors, warnings, info, metadata) {
    return deepFreeze({
      ok: false,
      values: emptyValues(),
      display: { spKtV: null, eKtV: null, urrPct: null },
      classification: {
        interpretationAllowed: false,
        basis: "unrounded_values",
        blockers: [],
        spKtV: null,
        urr: null,
      },
      metadata: metadata || {},
      messages: { errors, warnings, info },
    });
  }

  function computeDialysisAdequacy(input) {
    const source = input || {};
    const errors = [];
    const warnings = [];
    const info = [];
    const age = parseAge(source, errors);
    const modality = normalizeToken(source.modality).toUpperCase();
    const sessionsPerWeek = toFiniteNumber(source.sessionsPerWeek);
    const pidiDays = toFiniteNumber(source.pidiDays);
    const durationMinutes = toFiniteNumber(source.durationMinutes);
    const netUfLiters = toFiniteNumber(source.netUfLiters);
    const postWeightKg = toFiniteNumber(source.postWeightKg);
    const accessType = normalizeAccess(source.accessType);

    if (modality !== "IHD") {
      errors.push(
        makeMessage(
          "MODALITY_UNSUPPORTED",
          "Ten moduł oblicza wyłącznie adekwatność przerywanej hemodializy (IHD).",
          "modality",
        ),
      );
    }
    if (
      sessionsPerWeek === null ||
      !Number.isInteger(sessionsPerWeek) ||
      sessionsPerWeek < 2 ||
      sessionsPerWeek > 7
    ) {
      errors.push(
        makeMessage(
          "FREQUENCY_UNSUPPORTED",
          "Liczba sesji IHD musi być całkowita i mieścić się w zakresie 2–7 na tydzień.",
          "sessionsPerWeek",
        ),
      );
    }
    if (
      pidiDays === null ||
      !Number.isInteger(pidiDays) ||
      pidiDays < 1 ||
      pidiDays > 4
    ) {
      errors.push(
        makeMessage(
          "PIDI_INVALID",
          "PIDI należy wybrać jako sesyjny przedział 1, 2, 3 albo 4 dni.",
          "pidiDays",
        ),
      );
    }
    if (
      durationMinutes === null ||
      !(durationMinutes > 0 && durationMinutes <= MAX_DURATION_MINUTES)
    ) {
      errors.push(
        makeMessage(
          "DURATION_INVALID",
          "Czas IHD musi być podany w minutach i mieścić się w zakresie >0–480 min.",
          "durationMinutes",
        ),
      );
    }
    if (
      netUfLiters === null ||
      !(netUfLiters >= 0 && netUfLiters <= MAX_NET_UF_LITERS)
    ) {
      errors.push(
        makeMessage(
          "NET_UF_INVALID",
          "Netto UF musi być podane w litrach i mieścić się w zakresie 0–10 L.",
          "netUfLiters",
        ),
      );
    }
    if (
      postWeightKg === null ||
      !(postWeightKg > 0 && postWeightKg <= MAX_POST_WEIGHT_KG)
    ) {
      errors.push(
        makeMessage(
          "POST_WEIGHT_INVALID",
          "Masa po IHD musi być większa od 0 i nie większa niż 300 kg.",
          "postWeightKg",
        ),
      );
    }
    if (accessType === "INVALID") {
      errors.push(
        makeMessage(
          "ACCESS_TYPE_INVALID",
          "Typ dostępu musi być AVF/AVG, CVC albo unknown.",
          "accessType",
        ),
      );
    }

    if (age && age.exactYears < 2) {
      errors.push(
        makeMessage(
          "PEDIATRIC_INFANT_UNSUPPORTED",
          "Uproszczony moduł Kt/V nie jest dostępny poniżej 2. roku życia; brak bezpiecznie przyjętej ścieżki dla niemowląt.",
          "ageYears",
        ),
      );
    }

    const commonAnalyte = source.ureaAnalyte;
    const preAnalyte = normalizeAnalyte(source.preAnalyte || commonAnalyte);
    const postAnalyte = normalizeAnalyte(source.postAnalyte || commonAnalyte);
    const commonUnit = source.ureaUnit;
    const preUnit = normalizeUreaUnit(source.preUnit || commonUnit);
    const postUnit = normalizeUreaUnit(source.postUnit || commonUnit);
    const preUrea = toFiniteNumber(source.preUrea);
    const postUrea = toFiniteNumber(source.postUrea);

    if (!preAnalyte || !postAnalyte) {
      errors.push(
        makeMessage(
          "UREA_ANALYTE_INVALID",
          "Dla obu próbek wybierz ten sam analit: BUN albo mocznik.",
          "ureaAnalyte",
        ),
      );
    } else if (preAnalyte !== postAnalyte) {
      errors.push(
        makeMessage(
          "UREA_ANALYTE_MISMATCH",
          "Próbki przed i po IHD muszą oznaczać ten sam analit.",
          "postAnalyte",
        ),
      );
    }
    if (!preUnit || !postUnit) {
      errors.push(
        makeMessage(
          "UREA_UNIT_INVALID",
          "Dla obu próbek wybierz obsługiwaną jednostkę stężenia.",
          "ureaUnit",
        ),
      );
    } else if (preUnit !== postUnit) {
      errors.push(
        makeMessage(
          "UREA_UNIT_MISMATCH",
          "Próbki przed i po IHD muszą być podane w tej samej jednostce.",
          "postUnit",
        ),
      );
    }
    if (preUrea === null || !(preUrea > 0)) {
      errors.push(
        makeMessage(
          "PRE_UREA_INVALID",
          "Stężenie przed IHD musi być skończone i większe od 0.",
          "preUrea",
        ),
      );
    }
    if (postUrea === null || !(postUrea > 0)) {
      errors.push(
        makeMessage(
          "POST_UREA_INVALID",
          "Stężenie po IHD musi być skończone i większe od 0.",
          "postUrea",
        ),
      );
    }

    const postMethod = validateSampling(source, age, errors);
    const kru = resolveKru(source, errors, warnings);
    const gfac =
      Number.isInteger(sessionsPerWeek) && Number.isInteger(pidiDays)
        ? resolveGfac(sessionsPerWeek, pidiDays)
        : null;
    if (
      Number.isInteger(sessionsPerWeek) &&
      Number.isInteger(pidiDays) &&
      gfac === null
    ) {
      errors.push(
        makeMessage(
          "GFAC_UNAVAILABLE",
          "Brak źródłowego GFAC dla tej pary częstości i PIDI; nie interpoluje się ani nie podstawia domyślnie 0,008. Użyj formalnego modelowania mocznika.",
          "pidiDays",
        ),
      );
    }
    if (
      [5, 6, 7].includes(sessionsPerWeek) &&
      durationMinutes !== null &&
      durationMinutes > 300
    ) {
      errors.push(
        makeMessage(
          "GFAC_LONG_SESSION_UNSUPPORTED",
          "Dla 5–7 sesji/tydzień i czasu >300 min publikacja podaje jedynie przybliżoną korektę GFAC; wymagane jest formalne modelowanie mocznika.",
          "durationMinutes",
        ),
      );
    }

    const metadataBase = {
      formula: "spKt/Vurea — Daugirdas II z GFAC zależnym od PIDI",
      sources: SOURCES,
      population: age ? age.population : null,
      ageExactYears: age ? age.exactYears : null,
      modality: modality || null,
      sessionsPerWeek,
      pidiDays,
      samplingPostMethod: postMethod,
      accessType: accessType === "INVALID" ? null : accessType,
      kru,
      resultScope: "single_session",
      units: {
        spKtV: "bez jednostki",
        eKtV: "bez jednostki",
        urrPct: "%",
        duration: "min",
        netUf: "L",
        postWeight: "kg",
      },
    };

    if (errors.length) {
      return buildFailure(errors, warnings, info, metadataBase);
    }

    const ratio = postUrea / preUrea;
    if (!(ratio > 0 && ratio < 1)) {
      errors.push(
        makeMessage(
          "UREA_RATIO_INVALID",
          "Stężenie po IHD musi być mniejsze od stężenia przed IHD; wymagane jest 0 < R < 1.",
          "postUrea",
        ),
      );
      return buildFailure(errors, warnings, info, metadataBase);
    }

    const durationHours = durationMinutes / 60;
    const logarithmArgument = ratio - gfac * durationHours;
    if (!(logarithmArgument > 0)) {
      errors.push(
        makeMessage(
          "DAUGIRDAS_DOMAIN_ERROR",
          "Dane są poza dziedziną wzoru: R − GFAC × t musi być większe od 0.",
          "postUrea",
        ),
      );
      return buildFailure(errors, warnings, info, {
        ...metadataBase,
        gfac,
        durationHours,
      });
    }

    const spKtV =
      -Math.log(logarithmArgument) +
      (4 - 3.5 * ratio) * (netUfLiters / postWeightKg);
    const urrPct = (1 - ratio) * 100;
    if (!Number.isFinite(spKtV) || !Number.isFinite(urrPct)) {
      errors.push(
        makeMessage(
          "NON_FINITE_RESULT",
          "Nie można wyznaczyć skończonego wyniku dla podanych danych.",
        ),
      );
      return buildFailure(errors, warnings, info, {
        ...metadataBase,
        gfac,
        durationHours,
      });
    }

    let eKtV = null;
    let eKtVMethod = null;
    if (age.population === "adult" && accessType === "AVF_AVG") {
      eKtV = spKtV * (durationMinutes / (durationMinutes + 35));
      eKtVMethod = { access: "AVF/AVG", constantMinutes: 35 };
    } else if (age.population === "adult" && accessType === "CVC") {
      eKtV = spKtV * (durationMinutes / (durationMinutes + 22));
      eKtVMethod = { access: "CVC", constantMinutes: 22 };
    } else if (age.population === "adult") {
      warnings.push(
        makeMessage(
          "ACCESS_UNKNOWN_EKTV_NOT_CALCULATED",
          "Bez typu dostępu pokazano spKt/V i URR, ale nie obliczono szacowanego eKt/V.",
          "accessType",
        ),
      );
    } else {
      warnings.push(
        makeMessage(
          "PEDIATRIC_EKTV_NOT_CALCULATED",
          "W ścieżce pediatrycznej nie zastosowano automatycznie dorosłego przybliżenia eKt/V zależnego od dostępu.",
          "accessType",
        ),
      );
    }

    const blockers = [];
    if (age.population !== "adult")
      blockers.push("PEDIATRIC_NO_AUTOMATIC_TARGETS");
    if (sessionsPerWeek !== 3)
      blockers.push("SCHEDULE_NOT_THRICE_WEEKLY");
    if (!kru.current) blockers.push("KRU_NOT_CURRENT");
    if (kru.low !== true) blockers.push("KRU_NOT_BELOW_2");
    if (source.treatmentsDeliveredReliably !== true)
      blockers.push("REGULAR_DELIVERY_NOT_CONFIRMED");

    const interpretationAllowed = blockers.length === 0;
    let spClassification = null;
    let urrClassification = null;
    if (interpretationAllowed) {
      spClassification = {
        ...classifySpKtV(spKtV),
        rawValue: spKtV,
      };
      if (durationMinutes < 300) {
        urrClassification = {
          ...classifyUrr(urrPct),
          rawValue: urrPct,
        };
      } else {
        warnings.push(
          makeMessage(
            "URR_THRESHOLD_TIME_UNSUPPORTED",
            "Historyczne minimum URR 65% jest alternatywą dla zabiegów krótszych niż 5 godzin; pokazano wyłącznie surowy URR.",
            "durationMinutes",
          ),
        );
      }
      info.push(
        makeMessage(
          "SINGLE_SESSION_TARGET_CONTEXT",
          "Progi spKt/V 1,2/1,4 opisują pojedynczą sesję dorosłego pacjenta leczonego regularnie IHD 3×/tydz. z aktualnym Kru <2 mL/min/1,73 m²; nie dowodzą adekwatności całego tygodnia.",
        ),
      );
    } else {
      if (age.population === "pediatric") {
        warnings.push(
          makeMessage(
            "PEDIATRIC_RAW_RESULT_ONLY",
            "Wynik pediatryczny ma charakter techniczny; nie zastosowano dorosłych progów 1,2/1,4 ani 65/70.",
          ),
        );
      } else if (sessionsPerWeek !== 3) {
        warnings.push(
          makeMessage(
            "WEEKLY_STDKTV_REQUIRED",
            "Dla schematu innego niż 3×/tydz. pojedynczy spKt/V nie ocenia adekwatności tygodniowej; potrzebny jest stdKt/V uwzględniający UF i Kru.",
          ),
        );
      }
      if (source.treatmentsDeliveredReliably !== true) {
        warnings.push(
          makeMessage(
            "REGULAR_DELIVERY_NOT_CONFIRMED",
            "Nie potwierdzono regularnego dostarczania pełnych sesji; pojedynczy wynik nie może być automatycznie interpretowany jako adekwatność leczenia.",
            "treatmentsDeliveredReliably",
          ),
        );
      }
    }

    return deepFreeze({
      ok: true,
      values: {
        ratio,
        gfac,
        logarithmArgument,
        spKtV,
        eKtV,
        urrPct,
      },
      display: {
        spKtV: thresholdSafeSpDisplay(spKtV),
        eKtV: eKtV === null ? null : eKtV.toFixed(2),
        urrPct: thresholdSafeUrrDisplay(urrPct),
      },
      classification: {
        interpretationAllowed,
        basis: "unrounded_values",
        blockers,
        spKtV: spClassification,
        urr: urrClassification,
      },
      metadata: {
        ...metadataBase,
        durationHours,
        gfac,
        gfacLookupKey: `${sessionsPerWeek}/week:${pidiDays}d`,
        eKtVMethod,
      },
      messages: { errors, warnings, info },
    });
  }

  return Object.freeze({
    GFAC_BY_SCHEDULE_AND_PIDI,
    localIsoDate,
    computeDialysisAdequacy,
  });
});
