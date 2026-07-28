(function (root, factory) {
  const api = factory();
  if (root) root.ClcrStoneSafety = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SOURCE = Object.freeze({
    id: "EAU_UROLITHIASIS_2026",
    label: "EAU Guidelines on Urolithiasis 2026",
    url: "https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf",
  });

  const MOLAR_MASS_MG_PER_MMOL = Object.freeze({
    calcium: 40.078,
    magnesium: 24.305,
    phosphorus: 30.973761998,
    phosphate: 94.9714,
    uricAcid: 168.1103,
    oxalicAcid: 90.0349,
    oxalateIon: 88.019,
    citricAcid: 192.1235,
    cystine: 240.3005,
    creatinine: 113.1179,
  });

  const PEDIATRIC_CACR_MOLAR_LIMITS = Object.freeze([
    Object.freeze({ ageBand: "under1", upperMolMol: 2.2 }),
    Object.freeze({ ageBand: "over1ToUnder3", upperMolMol: 1.5 }),
    Object.freeze({ ageBand: "over3ToUnder5", upperMolMol: 1.1 }),
    Object.freeze({ ageBand: "over5ToUnder7", upperMolMol: 0.8 }),
    Object.freeze({ ageBand: "over7ToUnder18", upperMolMol: 0.6 }),
  ]);

  function toFiniteNumber(value) {
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatPolishDecimal(value, digits) {
    return Number(value).toFixed(digits).replace(".", ",");
  }

  function freezeResult(result) {
    return Object.freeze({
      sourceId: SOURCE.id,
      ...result,
    });
  }

  function withheld(code, message, details) {
    return freezeResult({
      ok: false,
      status: "withheld",
      code,
      message,
      ...(details || {}),
    });
  }

  function interpreted(status, code, message, details) {
    return freezeResult({
      ok: true,
      status,
      code,
      message,
      ...(details || {}),
    });
  }

  function normalizeSex(value) {
    if (value == null) return null;
    const normalized = String(value).trim().toLowerCase();
    if (
      normalized === "m" ||
      normalized === "male" ||
      normalized === "man" ||
      normalized === "mężczyzna" ||
      normalized === "mezczyzna"
    ) {
      return "male";
    }
    if (
      normalized === "f" ||
      normalized === "k" ||
      normalized === "female" ||
      normalized === "woman" ||
      normalized === "kobieta"
    ) {
      return "female";
    }
    return null;
  }

  function normalizeConcentrationUnit(value) {
    if (value == null) return null;
    const normalized = String(value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace("µ", "u");
    if (normalized === "mg/dl") return "mg/dL";
    if (normalized === "mg/l") return "mg/L";
    if (normalized === "mmol/l") return "mmol/L";
    return null;
  }

  function resolveMolarMass(analyte, reportingEntity) {
    switch (analyte) {
      case "calcium":
        return Object.freeze({
          ok: true,
          reportingEntity: "calcium",
          molarMassMgPerMmol: MOLAR_MASS_MG_PER_MMOL.calcium,
        });
      case "magnesium":
        return Object.freeze({
          ok: true,
          reportingEntity: "magnesium",
          molarMassMgPerMmol: MOLAR_MASS_MG_PER_MMOL.magnesium,
        });
      case "uricAcid":
        return Object.freeze({
          ok: true,
          reportingEntity: "uricAcid",
          molarMassMgPerMmol: MOLAR_MASS_MG_PER_MMOL.uricAcid,
        });
      case "citrate":
        return Object.freeze({
          ok: true,
          reportingEntity: "citricAcid",
          molarMassMgPerMmol: MOLAR_MASS_MG_PER_MMOL.citricAcid,
        });
      case "inorganicPhosphorus":
        return Object.freeze({
          ok: true,
          reportingEntity: "phosphorus",
          molarMassMgPerMmol: MOLAR_MASS_MG_PER_MMOL.phosphorus,
        });
      case "phosphate":
        return Object.freeze({
          ok: true,
          reportingEntity: "phosphate",
          molarMassMgPerMmol: MOLAR_MASS_MG_PER_MMOL.phosphate,
        });
      case "cystine":
        return Object.freeze({
          ok: true,
          reportingEntity: "cystine",
          molarMassMgPerMmol: MOLAR_MASS_MG_PER_MMOL.cystine,
        });
      case "oxalate":
        if (
          reportingEntity !== "oxalicAcid" &&
          reportingEntity !== "oxalateIon"
        ) {
          return Object.freeze({
            ok: false,
            error:
              "Dla szczawianu wskaż reportingEntity: oxalicAcid albo oxalateIon; nie wolno domyślać się konwencji raportowania laboratorium.",
          });
        }
        return Object.freeze({
          ok: true,
          reportingEntity,
          molarMassMgPerMmol:
            MOLAR_MASS_MG_PER_MMOL[reportingEntity],
        });
      default:
        return Object.freeze({
          ok: false,
          error: "Nieobsługiwany analit DZM.",
        });
    }
  }

  /**
   * Normalises an actual timed collection to an exact 24-hour amount.
   * A complete collection protocol must be confirmed explicitly.
   */
  function convertDzmAnalyte(input) {
    const source = input || {};
    const concentration = toFiniteNumber(source.concentration);
    const collectedVolumeMl = toFiniteNumber(source.collectedVolumeMl);
    const durationMinutes = toFiniteNumber(source.durationMinutes);
    const unit = normalizeConcentrationUnit(source.concentrationUnit);
    const mass = resolveMolarMass(source.analyte, source.reportingEntity);

    if (source.collectionComplete !== true) {
      return withheld(
        "incompleteCollection",
        "Nie przeliczono wyniku na 24 godziny: nie potwierdzono kompletnego protokołu czasowej zbiórki moczu.",
      );
    }
    if (concentration === null || concentration < 0) {
      return withheld(
        "invalidConcentration",
        "Stężenie analitu musi być skończoną wartością nieujemną.",
      );
    }
    if (!(collectedVolumeMl > 0)) {
      return withheld(
        "invalidVolume",
        "Objętość zebranej próbki musi być większa od zera.",
      );
    }
    if (!(durationMinutes > 0)) {
      return withheld(
        "invalidDuration",
        "Rzeczywisty czas zbiórki musi być większy od zera.",
      );
    }
    if (!unit) {
      return withheld(
        "unsupportedUnit",
        "Obsługiwane jednostki stężenia to mg/dL, mg/L i mmol/L.",
      );
    }
    if (!mass.ok) {
      return withheld("reportingEntityRequired", mass.error);
    }

    const normalisationFactor = 1440 / durationMinutes;
    const normalisedVolumeMl24 = collectedVolumeMl * normalisationFactor;
    const collectedVolumeL = collectedVolumeMl / 1000;
    const actualMg =
      unit === "mg/dL"
        ? (concentration * collectedVolumeMl) / 100
        : unit === "mg/L"
          ? concentration * collectedVolumeL
          : concentration * collectedVolumeL * mass.molarMassMgPerMmol;
    const actualMmol =
      unit === "mmol/L"
        ? concentration * collectedVolumeL
        : actualMg / mass.molarMassMgPerMmol;

    return freezeResult({
      ok: true,
      status: "calculated",
      code: "dzmConverted",
      analyte: source.analyte,
      reportingEntity: mass.reportingEntity,
      concentrationUnit: unit,
      molarMassMgPerMmol: mass.molarMassMgPerMmol,
      durationMinutes,
      collectedVolumeMl,
      normalisationFactor,
      normalisedVolumeMl24,
      actualMg,
      actualMmol,
      totalMg24: actualMg * normalisationFactor,
      totalMmol24: actualMmol * normalisationFactor,
      message:
        durationMinutes === 1440
          ? "Wynik obliczono z kompletnej 24-godzinnej zbiórki."
          : "Wynik /24 h przeliczono z rzeczywistego czasu kompletnej zbiórki; nie zakładano automatycznie 1440 minut.",
    });
  }

  function interpretAdultCalcium(input) {
    const mmol24 = toFiniteNumber(input && input.mmol24);
    if (mmol24 === null || mmol24 < 0) {
      return withheld(
        "invalidCalcium",
        "Nie można ocenić wydalania wapnia bez nieujemnego wyniku w mmol/24 h.",
      );
    }
    if (mmol24 > 8) {
      return interpreted(
        "high",
        "aboveHighCalciumLimit",
        "Wydalanie wapnia przekracza 8,0 mmol/24 h. Jest to próg używany przez EAU w kontekście wysokiej kalciurii; wynik wymaga oceny razem z typem złogu, sodem, dietą, wapniem i PTH w surowicy. Sam wynik nie ustala przyczyny ani rozpoznania.",
        { valueMmol24: mmol24, attentionLimit: 5, highLimit: 8 },
      );
    }
    if (mmol24 > 5) {
      return interpreted(
        "attention",
        "aboveCalciumAttentionLimit",
        "Wydalanie wapnia przekracza limit 5,0 mmol/24 h wymagający uwagi według EAU, ale nie przekracza 8,0 mmol/24 h. Ryzyko jest ciągłe i wynik należy interpretować w pełnym profilu metabolicznym.",
        { valueMmol24: mmol24, attentionLimit: 5, highLimit: 8 },
      );
    }
    return interpreted(
      "noFlag",
      "notAboveCalciumAttentionLimit",
      "Wydalanie wapnia nie przekracza progu uwagi 5,0 mmol/24 h. Nie wyklucza to ryzyka kamicy ani innych nieprawidłowości profilu moczu.",
      { valueMmol24: mmol24, attentionLimit: 5, highLimit: 8 },
    );
  }

  function interpretAdultMagnesium(input) {
    const mmol24 = toFiniteNumber(input && input.mmol24);
    if (mmol24 === null || mmol24 < 0) {
      return withheld(
        "invalidMagnesium",
        "Nie można ocenić wydalania magnezu bez nieujemnego wyniku w mmol/24 h.",
      );
    }
    if (mmol24 < 3) {
      return interpreted(
        "low",
        "belowMagnesiumLimit",
        "Wydalanie magnezu jest poniżej 3,0 mmol/24 h. Taki wynik może towarzyszyć małej podaży lub zmniejszonemu wchłanianiu; nie stanowi samodzielnego rozpoznania.",
        { valueMmol24: mmol24, lowerLimit: 3 },
      );
    }
    return interpreted(
      "noFlag",
      "notBelowMagnesiumLimit",
      "Wydalanie magnezu nie jest niższe niż 3,0 mmol/24 h. Wynik należy nadal odnieść do pełnego profilu i funkcji nerek.",
      { valueMmol24: mmol24, lowerLimit: 3 },
    );
  }

  function interpretAdultUricAcid(input) {
    const mmol24 = toFiniteNumber(input && input.mmol24);
    const sex = normalizeSex(input && input.sex);
    if (mmol24 === null || mmol24 < 0) {
      return withheld(
        "invalidUricAcid",
        "Nie można ocenić wydalania kwasu moczowego bez nieujemnego wyniku w mmol/24 h.",
      );
    }
    if (!sex) {
      return withheld(
        "sexRequired",
        "Wstrzymano interpretację kwasu moczowego: próg EAU zależy od płci biologicznej użytej w tabeli referencyjnej.",
        { valueMmol24: mmol24 },
      );
    }
    const upperLimit = sex === "female" ? 4 : 5;
    if (mmol24 > upperLimit) {
      return interpreted(
        "high",
        "aboveUricAcidLimit",
        `Wydalanie kwasu moczowego przekracza próg EAU ${formatPolishDecimal(upperLimit, 1)} mmol/24 h dla ${sex === "female" ? "kobiet" : "mężczyzn"}. Wynik wymaga odniesienia do pH, diety, leków i typu złogu; nie rozpoznaje samodzielnie przyczyny kamicy.`,
        { valueMmol24: mmol24, sex, upperLimit },
      );
    }
    return interpreted(
      "noFlag",
      "notAboveUricAcidLimit",
      `Wydalanie kwasu moczowego nie przekracza progu EAU ${formatPolishDecimal(upperLimit, 1)} mmol/24 h dla ${sex === "female" ? "kobiet" : "mężczyzn"}. Niskie pH nadal może sprzyjać złogom moczanowym mimo braku przekroczenia tego progu.`,
      { valueMmol24: mmol24, sex, upperLimit },
    );
  }

  function interpretAdultOxalate(input) {
    const mmol24 = toFiniteNumber(input && input.mmol24);
    const reportingEntity = input && input.reportingEntity;
    const mass = resolveMolarMass("oxalate", reportingEntity);
    if (mmol24 === null || mmol24 < 0) {
      return withheld(
        "invalidOxalate",
        "Nie można ocenić wydalania szczawianu bez nieujemnego wyniku w mmol/24 h.",
      );
    }
    if (!mass.ok) {
      return withheld("reportingEntityRequired", mass.error, {
        valueMmol24: mmol24,
      });
    }
    const details = {
      valueMmol24: mmol24,
      reportingEntity,
      mildLimit: 0.4,
      entericLimit: 0.5,
      primaryLimit: 1,
    };
    if (mmol24 > 1) {
      return interpreted(
        "urgentAttention",
        "abovePrimaryOxalateAttentionLimit",
        "Wydalanie szczawianu przekracza 1,0 mmol/24 h, powyżej progu budzącego podejrzenie hiperoksalurii pierwotnej w EAU. Wynik nie rozpoznaje choroby, ale wymaga pilnej weryfikacji zbiórki, metody i oceny specjalistycznej.",
        details,
      );
    }
    if (mmol24 > 0.5) {
      return interpreted(
        "high",
        "aboveEntericOxalateAttentionLimit",
        "Wydalanie szczawianu przekracza 0,5 mmol/24 h. EAU wskazuje taki poziom jako wymagający rozważenia przyczyn jelitowych lub wtórnych; wynik sam nie ustala etiologii.",
        details,
      );
    }
    if (mmol24 > 0.4) {
      return interpreted(
        "attention",
        "mildOxalateElevation",
        "Wydalanie szczawianu jest powyżej 0,40 i nie wyższe niż 0,50 mmol/24 h, czyli w przedziale łagodnego zwiększenia opisanym przez EAU. Interpretuj je razem z dietą, witaminą C i pełnym profilem.",
        details,
      );
    }
    return interpreted(
      "noFlag",
      "notAboveOxalateLimit",
      "Wydalanie szczawianu nie przekracza 0,40 mmol/24 h. Wynik nie wyklucza ryzyka zależnego od objętości, wapnia, cytrynianu i przesycenia moczu.",
      details,
    );
  }

  function interpretAdultCitrate(input) {
    const mmol24 = toFiniteNumber(input && input.mmol24);
    const sex = normalizeSex(input && input.sex);
    if (mmol24 === null || mmol24 < 0) {
      return withheld(
        "invalidCitrate",
        "Nie można ocenić wydalania cytrynianu bez nieujemnego wyniku w mmol/24 h.",
      );
    }
    if (!sex) {
      return withheld(
        "sexRequired",
        "Wstrzymano interpretację cytrynianu: dolny próg EAU zależy od płci biologicznej użytej w tabeli referencyjnej.",
        { valueMmol24: mmol24 },
      );
    }
    const lowerLimit = sex === "female" ? 1.9 : 1.7;
    if (mmol24 < lowerLimit) {
      return interpreted(
        "low",
        "belowCitrateLimit",
        `Wydalanie cytrynianu jest poniżej progu EAU ${formatPolishDecimal(lowerLimit, 1)} mmol/24 h dla ${sex === "female" ? "kobiet" : "mężczyzn"}. Należy uwzględnić stan kwasowo-zasadowy, potas, dietę i leczenie; wynik nie ustala samodzielnie przyczyny.`,
        { valueMmol24: mmol24, sex, lowerLimit },
      );
    }
    return interpreted(
      "noFlag",
      "notBelowCitrateLimit",
      `Wydalanie cytrynianu nie jest niższe niż próg EAU ${formatPolishDecimal(lowerLimit, 1)} mmol/24 h dla ${sex === "female" ? "kobiet" : "mężczyzn"}. Nie oznacza to braku pozostałych czynników ryzyka.`,
      { valueMmol24: mmol24, sex, lowerLimit },
    );
  }

  function interpretAdultInorganicPhosphorus(input) {
    const mmol24 = toFiniteNumber(input && input.mmol24);
    if (mmol24 === null || mmol24 < 0) {
      return withheld(
        "invalidInorganicPhosphorus",
        "Nie można ocenić fosforu nieorganicznego bez nieujemnego wyniku w mmol/24 h.",
      );
    }
    if (mmol24 > 35) {
      return interpreted(
        "high",
        "aboveInorganicPhosphorusLimit",
        "Wydalanie fosforu nieorganicznego przekracza 35 mmol/24 h. Znaczenie wyniku zależy od pH, wapnia, diety i typu złogu; sam wynik nie stanowi rozpoznania.",
        { valueMmol24: mmol24, upperLimit: 35 },
      );
    }
    return interpreted(
      "noFlag",
      "notAboveInorganicPhosphorusLimit",
      "Wydalanie fosforu nieorganicznego nie przekracza 35 mmol/24 h. Wynik należy interpretować razem z pH i wydalaniem wapnia.",
      { valueMmol24: mmol24, upperLimit: 35 },
    );
  }

  function interpretAdultCystine(input) {
    const mmol24 = toFiniteNumber(input && input.mmol24);
    const knownCystinuria = !!(input && input.knownCystinuria);
    if (mmol24 === null || mmol24 < 0) {
      return withheld(
        "invalidCystine",
        "Nie można ocenić wydalania cystyny bez nieujemnego wyniku w mmol/24 h.",
      );
    }
    if (input && input.thiolTherapy === true) {
      return withheld(
        "thiolTherapyLimitsAssay",
        "Wstrzymano automatyczną interpretację cystyny podczas leczenia lekiem tiolowym: rutynowe metody mogą niedokładnie rozdzielać cystynę, cysteinę i kompleksy lek–cysteina.",
        { valueMmol24: mmol24 },
      );
    }
    if (mmol24 >= 3) {
      return interpreted(
        "urgentAttention",
        "atCystineTreatmentConsiderationLimit",
        "Wydalanie cystyny osiąga co najmniej 3,0 mmol/24 h, czyli próg, przy którym EAU omawia dodatkowe leczenie tioproniną. To nie jest automatyczne zalecenie leczenia; decyzja wymaga opieki specjalistycznej, oceny nawrotów, pH, objętości i metody oznaczenia.",
        {
          valueMmol24: mmol24,
          abnormalLimit: 0.125,
          treatmentConsiderationLimit: 3,
        },
      );
    }
    if (knownCystinuria) {
      return interpreted(
        "contextOnly",
        "knownCystinuriaScreeningLimitNotApplied",
        "W rozpoznanej cystynurii nie zastosowano progu przesiewowego 0,125 mmol/24 h. Wydalanie jest poniżej progu 3,0 mmol/24 h omawianego przez EAU przy rozważaniu dodatkowego leczenia tioproniną; wynik nie jest samodzielnym celem leczenia i wymaga oceny objętości, pH, nawrotów oraz metody oznaczenia.",
        {
          valueMmol24: mmol24,
          screeningLimitNotApplied: 0.125,
          treatmentConsiderationLimit: 3,
          knownCystinuria: true,
        },
      );
    }
    if (mmol24 > 0.125) {
      return interpreted(
        "high",
        "aboveCystineAbnormalLimit",
        "Wydalanie cystyny przekracza 0,125 mmol/24 h, poziom uznawany przez EAU za nieprawidłowy w ilościowym oznaczeniu DZM. Wynik wymaga potwierdzenia w kontekście analizy złogu i oceny specjalistycznej.",
        {
          valueMmol24: mmol24,
          abnormalLimit: 0.125,
          treatmentConsiderationLimit: 3,
        },
      );
    }
    return interpreted(
      "noFlag",
      "notAboveCystineAbnormalLimit",
      "Wydalanie cystyny nie przekracza 0,125 mmol/24 h. Ujemny wynik nie zastępuje analizy złogu ani badania osadu, jeśli podejrzenie kliniczne pozostaje wysokie.",
      {
        valueMmol24: mmol24,
        abnormalLimit: 0.125,
        treatmentConsiderationLimit: 3,
      },
    );
  }

  function interpretAdultUrineVolume(input) {
    const volumeL24 = toFiniteNumber(input && input.volumeL24);
    const context =
      input && input.context === "cystinuria" ? "cystinuria" : "general";
    if (volumeL24 === null || volumeL24 < 0) {
      return withheld(
        "invalidUrineVolume",
        "Nie można ocenić diurezy bez nieujemnej objętości w L/24 h.",
      );
    }
    const goal = context === "cystinuria" ? 3 : 2.5;
    if (volumeL24 > goal) {
      return interpreted(
        "goalMet",
        "urineVolumeGoalMet",
        context === "cystinuria"
          ? "Objętość moczu przekracza 3,0 L/24 h, czyli cel rozcieńczenia moczu podany przez EAU dla cystynurii. Cel wymaga dalszej indywidualizacji klinicznej."
          : "Objętość moczu przekracza ogólny cel EAU 2,5 L/24 h dla prewencji nawrotów. Nie wyklucza to innych czynników ryzyka.",
        { valueL24: volumeL24, context, goalL24: goal },
      );
    }
    return interpreted(
      "belowGoal",
      "urineVolumeGoalNotMet",
      context === "cystinuria"
        ? "Objętość moczu nie przekracza celu 3,0 L/24 h stosowanego przez EAU w cystynurii. Jest to cel terapeutyczny, a nie samodzielna diagnoza."
        : "Objętość moczu nie przekracza ogólnego celu EAU 2,5 L/24 h dla prewencji nawrotów. Cel płynowy należy dostosować do przeciwwskazań i stanu klinicznego.",
      { valueL24: volumeL24, context, goalL24: goal },
    );
  }

  function interpretAdultDzmPh(input) {
    const ph = toFiniteNumber(input && input.ph);
    if (ph === null || !(ph > 0 && ph <= 14)) {
      return withheld(
        "invalidPh",
        "pH moczu musi być skończoną wartością w zakresie >0–14.",
      );
    }
    const treatmentContext = input && input.treatmentContext;
    const requiresPersistentProfile =
      treatmentContext === "cystinuria" ||
      treatmentContext === "uricAcidChemolysis" ||
      ph < 5.5 ||
      ph > 6.2;
    if (
      requiresPersistentProfile &&
      (!input || input.persistentAbnormalPh !== true)
    ) {
      return interpreted(
        "contextOnly",
        "phPatternNotRepeated",
        "Wartość pH pokazano bez klasyfikacji progiem: nie potwierdzono profilu w powtarzanych pomiarach. Pojedyncze pH z czasowej zbiórki nie rozpoznaje zaburzenia ani nie służy do samodzielnej zmiany leczenia.",
        { ph, treatmentContext: treatmentContext || null },
      );
    }
    if (treatmentContext === "cystinuria") {
      if (ph > 7.5) {
        return interpreted(
          "goalMet",
          "cystinuriaPhGoalMet",
          "pH przekracza cel 7,5 używany przez EAU podczas alkalinizacji w cystynurii. Leczenie wymaga seryjnych pomiarów świeżego moczu i nadzoru nad nadmierną alkalinizacją.",
          { ph, treatmentContext, goal: 7.5 },
        );
      }
      return interpreted(
        "belowGoal",
        "cystinuriaPhGoalNotMet",
        "pH nie przekracza celu 7,5 używanego przez EAU podczas alkalinizacji w cystynurii. Pojedynczy wynik DZM nie służy do samodzielnej zmiany dawki.",
        { ph, treatmentContext, goal: 7.5 },
      );
    }
    if (treatmentContext === "uricAcidChemolysis") {
      if (ph >= 7 && ph <= 7.2) {
        return interpreted(
          "goalMet",
          "uricAcidChemolysisPhTarget",
          "pH mieści się w zakresie 7,0–7,2 stosowanym przez EAU podczas doustnej chemolizy złogów moczanowych. Wymagane są seryjne pomiary świeżego moczu i nadzór kliniczny.",
          { ph, treatmentContext, lowerGoal: 7, upperGoal: 7.2 },
        );
      }
      if (ph > 7.2) {
        return interpreted(
          "aboveGoal",
          "uricAcidChemolysisPhAboveTarget",
          "pH przekracza 7,2, czyli górną granicę zakresu EAU dla chemolizy moczanowej; nadmierna alkalinizacja może sprzyjać fosforanom wapnia. Nie zmieniaj leczenia wyłącznie na podstawie kalkulatora.",
          { ph, treatmentContext, lowerGoal: 7, upperGoal: 7.2 },
        );
      }
      return interpreted(
        "belowGoal",
        "uricAcidChemolysisPhBelowTarget",
        "pH jest poniżej 7,0, czyli zakresu EAU używanego podczas chemolizy moczanowej. Pojedynczy wynik DZM nie służy do samodzielnej zmiany leczenia.",
        { ph, treatmentContext, lowerGoal: 7, upperGoal: 7.2 },
      );
    }

    if (ph < 5.5) {
      return interpreted(
        "attention",
        "hyperacidicUrinePattern",
        "pH DZM jest poniżej 5,5, co EAU opisuje jako wzorzec hiperkwasowego moczu sprzyjający krystalizacji kwasu moczowego. Wynik nie określa samodzielnie przyczyny.",
        { ph, threshold: 5.5 },
      );
    }
    if (ph > 7) {
      return interpreted(
        "attention",
        "alkalineUrineCheckInfection",
        "pH DZM jest powyżej 7,0. Utrzymujący się taki wynik wymaga uwzględnienia zakażenia i posiewu, ale sam pH nie rozpoznaje infekcji.",
        { ph, threshold: 7 },
      );
    }
    if (ph > 6.2) {
      const fastingSpotPh = toFiniteNumber(
        input && input.fastingSecondMorningSpotPh,
      );
      if (
        fastingSpotPh !== null &&
        fastingSpotPh > 5.8 &&
        input &&
        input.infectionExcluded === true
      ) {
        return interpreted(
          "attention",
          "rtaScreenPatternPresent",
          "pH DZM >6,2 oraz pH drugiego porannego moczu na czczo >5,8 po wykluczeniu zakażenia spełniają przesiewowy wzorzec EAU wymagający dalszej diagnostyki dRTA. Nie jest to rozpoznanie.",
          {
            ph,
            fastingSecondMorningSpotPh: fastingSpotPh,
            dzmThreshold: 6.2,
            spotThreshold: 5.8,
          },
        );
      }
      return interpreted(
        "contextOnly",
        "rtaScreenIncomplete",
        "pH DZM jest powyżej 6,2, ale na tej podstawie nie wolno rozpoznawać dRTA. Do przesiewowego wzorca EAU potrzebne są także pH drugiego porannego moczu na czczo >5,8 i wykluczenie zakażenia.",
        {
          ph,
          fastingSecondMorningSpotPh: fastingSpotPh,
          dzmThreshold: 6.2,
          spotThreshold: 5.8,
        },
      );
    }
    return interpreted(
      "contextOnly",
      "noUniversalPhCategory",
      "pH nie spełnia progów przesiewowych <5,5 ani >6,2. Nie należy nazywać tego uniwersalną normą: optymalne pH zależy od typu złogu i leczenia.",
      { ph },
    );
  }

  function interpretPediatricCalcium24h(input) {
    const totalMmol24 = toFiniteNumber(input && input.totalMmol24);
    const weightKg = toFiniteNumber(input && input.weightKg);
    if (totalMmol24 === null || totalMmol24 < 0) {
      return withheld(
        "invalidPediatricCalcium",
        "Nie można ocenić pediatrycznego wydalania wapnia bez nieujemnego wyniku w mmol/24 h.",
      );
    }
    if (!(weightKg > 0)) {
      return withheld(
        "weightRequired",
        "Wstrzymano interpretację pediatrycznego wapnia w DZM: wymagane jest aktualne dodatnie oznaczenie masy ciała.",
        { totalMmol24 },
      );
    }
    const mmolKg24 = totalMmol24 / weightKg;
    if (mmolKg24 >= 0.1) {
      return interpreted(
        "attention",
        "notBelowPediatricCalciumLimit",
        "Wydalanie wapnia nie mieści się w opublikowanym przez EAU przedziale <0,1 mmol/kg/24 h. Wynik przesiewowy wymaga oceny kompletności zbiórki, diety, sodu i kontekstu klinicznego; sam nie stanowi rozpoznania.",
        {
          totalMmol24,
          weightKg,
          mmolKg24,
          publishedUpperExclusive: 0.1,
        },
      );
    }
    return interpreted(
      "noFlag",
      "belowPediatricCalciumLimit",
      "Wydalanie wapnia jest poniżej opublikowanego przez EAU progu 0,1 mmol/kg/24 h. Nie wyklucza to kamicy ani nie zastępuje pełnej oceny metabolicznej.",
      {
        totalMmol24,
        weightKg,
        mmolKg24,
        publishedUpperExclusive: 0.1,
      },
    );
  }

  function parsePediatricAge(input) {
    const years = toFiniteNumber(input && input.ageYears);
    const months =
      input && input.ageMonths != null
        ? toFiniteNumber(input.ageMonths)
        : 0;
    const days =
      input && input.ageDays != null ? toFiniteNumber(input.ageDays) : 0;
    if (
      years === null ||
      months === null ||
      days === null ||
      !Number.isInteger(years) ||
      !Number.isInteger(months) ||
      !Number.isInteger(days) ||
      years < 0 ||
      years >= 18 ||
      months < 0 ||
      months > 11 ||
      days < 0 ||
      days > 31
    ) {
      return Object.freeze({ valid: false });
    }
    const exactYears = years + months / 12 + days / 365.2425;
    return Object.freeze({
      valid: true,
      years,
      months,
      days,
      exactYears,
      exactSourceBoundary:
        months === 0 &&
        days === 0 &&
        (years === 1 || years === 3 || years === 5 || years === 7),
    });
  }

  function pediatricCacrLimit(age) {
    if (age.exactYears < 1) return PEDIATRIC_CACR_MOLAR_LIMITS[0];
    if (age.exactYears > 1 && age.exactYears < 3)
      return PEDIATRIC_CACR_MOLAR_LIMITS[1];
    if (age.exactYears > 3 && age.exactYears < 5)
      return PEDIATRIC_CACR_MOLAR_LIMITS[2];
    if (age.exactYears > 5 && age.exactYears < 7)
      return PEDIATRIC_CACR_MOLAR_LIMITS[3];
    if (age.exactYears > 7 && age.exactYears < 18)
      return PEDIATRIC_CACR_MOLAR_LIMITS[4];
    return null;
  }

  function interpretPediatricCalciumCreatinineSpot(input) {
    const source = input || {};
    const age = parsePediatricAge(source);
    const ratioMolMolInput = toFiniteNumber(source.ratioMolMol);
    const ratioMgMgInput = toFiniteNumber(source.ratioMgMg);

    if (source.sameSpecimen !== true) {
      return withheld(
        "sameSpecimenRequired",
        "Wstrzymano Ca/Cr: wapń i kreatynina muszą pochodzić z tej samej próbki moczu.",
      );
    }
    if (!age.valid) {
      return withheld(
        "invalidPediatricAge",
        "Wstrzymano Ca/Cr: wymagany jest prawidłowy wiek pediatryczny w latach, miesiącach i opcjonalnie dniach.",
      );
    }
    if (
      (ratioMolMolInput === null || ratioMolMolInput < 0) &&
      (ratioMgMgInput === null || ratioMgMgInput < 0)
    ) {
      return withheld(
        "invalidCalciumCreatinineRatio",
        "Wstrzymano Ca/Cr: podaj nieujemny stosunek w mol/mol albo mg/mg.",
      );
    }

    const ratioMolMol =
      ratioMolMolInput !== null && ratioMolMolInput >= 0
        ? ratioMolMolInput
        : (ratioMgMgInput * MOLAR_MASS_MG_PER_MMOL.creatinine) /
          MOLAR_MASS_MG_PER_MMOL.calcium;
    const ratioMgMg =
      ratioMgMgInput !== null && ratioMgMgInput >= 0
        ? ratioMgMgInput
        : (ratioMolMol * MOLAR_MASS_MG_PER_MMOL.calcium) /
          MOLAR_MASS_MG_PER_MMOL.creatinine;

    if (age.exactSourceBoundary) {
      return withheld(
        "ageBoundaryAmbiguous",
        "Wstrzymano automatyczną kategorię Ca/Cr na dokładnej granicy 1., 3., 5. lub 7. roku życia, ponieważ przedziały wieku w tabeli EAU nakładają się na tych punktach. Pokazuj liczbę bez koloru i bez kategorii.",
        {
          ageYearsExact: age.exactYears,
          ratioMolMol,
          ratioMgMg,
        },
      );
    }

    const limit = pediatricCacrLimit(age);
    if (!limit) {
      return withheld(
        "pediatricCacrAgeUnsupported",
        "Brak bezpiecznego pediatrycznego progu Ca/Cr dla podanego wieku.",
        {
          ageYearsExact: age.exactYears,
          ratioMolMol,
          ratioMgMg,
        },
      );
    }
    const publishedApproxMgMg =
      (limit.upperMolMol * MOLAR_MASS_MG_PER_MMOL.calcium) /
      MOLAR_MASS_MG_PER_MMOL.creatinine;
    const details = {
      ageBand: limit.ageBand,
      ageYearsExact: age.exactYears,
      ratioMolMol,
      ratioMgMg,
      upperMolMolExclusive: limit.upperMolMol,
      exactMassEquivalentMgMg: publishedApproxMgMg,
    };
    if (ratioMolMol >= limit.upperMolMol) {
      return interpreted(
        "attention",
        "notBelowPediatricCacrLimit",
        `Ca/Cr nie mieści się w opublikowanym przedziale <${limit.upperMolMol} mol/mol dla tej grupy wieku. Jest to wynik przesiewowy zależny od wieku, pory pobrania i diety; nie stanowi samodzielnego rozpoznania.`,
        details,
      );
    }
    return interpreted(
      "noFlag",
      "belowPediatricCacrLimit",
      `Ca/Cr jest poniżej opublikowanego progu ${limit.upperMolMol} mol/mol dla tej grupy wieku. Wynik nie wyklucza kamicy ani nie zastępuje wiarygodnej DZM, gdy jest możliwa.`,
      details,
    );
  }

  function interpretAdultStonePanel(input) {
    const source = input || {};
    return Object.freeze({
      sourceId: SOURCE.id,
      calcium:
        source.calciumMmol24 == null
          ? null
          : interpretAdultCalcium({ mmol24: source.calciumMmol24 }),
      magnesium:
        source.magnesiumMmol24 == null
          ? null
          : interpretAdultMagnesium({ mmol24: source.magnesiumMmol24 }),
      uricAcid:
        source.uricAcidMmol24 == null
          ? null
          : interpretAdultUricAcid({
              mmol24: source.uricAcidMmol24,
              sex: source.sex,
            }),
      oxalate:
        source.oxalateMmol24 == null
          ? null
          : interpretAdultOxalate({
              mmol24: source.oxalateMmol24,
              reportingEntity: source.oxalateReportingEntity,
            }),
      citrate:
        source.citrateMmol24 == null
          ? null
          : interpretAdultCitrate({
              mmol24: source.citrateMmol24,
              sex: source.sex,
            }),
      inorganicPhosphorus:
        source.inorganicPhosphorusMmol24 == null
          ? null
          : interpretAdultInorganicPhosphorus({
              mmol24: source.inorganicPhosphorusMmol24,
            }),
      cystine:
        source.cystineMmol24 == null
          ? null
          : interpretAdultCystine({
              mmol24: source.cystineMmol24,
              thiolTherapy: source.thiolTherapy,
              knownCystinuria: source.knownCystinuria,
            }),
      urineVolume:
        source.urineVolumeL24 == null
          ? null
          : interpretAdultUrineVolume({
              volumeL24: source.urineVolumeL24,
              context: source.volumeContext,
            }),
      ph:
        source.urinePh == null
          ? null
          : interpretAdultDzmPh({
              ph: source.urinePh,
              treatmentContext: source.phTreatmentContext,
              fastingSecondMorningSpotPh:
                source.fastingSecondMorningSpotPh,
              infectionExcluded: source.infectionExcluded,
              persistentAbnormalPh: source.persistentAbnormalPh,
            }),
    });
  }

  return Object.freeze({
    SOURCE,
    MOLAR_MASS_MG_PER_MMOL,
    PEDIATRIC_CACR_MOLAR_LIMITS,
    normalizeSex,
    resolveMolarMass,
    convertDzmAnalyte,
    interpretAdultCalcium,
    interpretAdultMagnesium,
    interpretAdultUricAcid,
    interpretAdultOxalate,
    interpretAdultCitrate,
    interpretAdultInorganicPhosphorus,
    interpretAdultCystine,
    interpretAdultUrineVolume,
    interpretAdultDzmPh,
    interpretPediatricCalcium24h,
    interpretPediatricCalciumCreatinineSpot,
    interpretAdultStonePanel,
  });
});
