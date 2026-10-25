function BSA_DuBois(e, n) {
  return 0.007184 * Math.pow(e, 0.425) * Math.pow(n, 0.725);
}
function clCrCG(e, n, t, o) {
  const a = e === "F" ? 0.85 : 1;
  return ((140 - n) * t * a) / (72 * o);
}
// The indexed variant intentionally uses completed years. Keep the original
// CG helper and the shared patient age unchanged for the other equations.
function clCrCGNormalized(sex, ageYears, weight, scr, bsaM2) {
  if (
    !["M", "F"].includes(sex) ||
    !Number.isFinite(ageYears) || ageYears < 18 ||
    ![weight, scr, bsaM2].every((value) => Number.isFinite(value) && value > 0)
  ) return null;
  return clCrCG(sex, Math.floor(ageYears), weight, scr) * 1.73 / bsaM2;
}
function eGFR_CKD_EPI_2021_cr(e, n, t) {
  if (
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.computeCkdEpi2021Cr == "function"
  )
    return window.ClcrClinicalSafety.computeCkdEpi2021Cr({
      sex: e,
      ageYears: n,
      creatinineMgDl: t,
    });
  const o = e === "F" ? 0.7 : 0.9,
    a = e === "F" ? -0.241 : -0.302,
    s = Math.min(t / o, 1),
    p = Math.max(t / o, 1);
  let h = 142 * Math.pow(s, a) * Math.pow(p, -1.2) * Math.pow(0.9938, n);
  return (e === "F" && (h *= 1.012), h);
}
function clCrSchwartzIDMS(e, n) {
  if (!(e > 0) || !(n > 0)) return { gfr: null, k: 0.413 };
  const t = 0.413;
  const o =
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.computeBedsideSchwartz == "function"
      ? window.ClcrClinicalSafety.computeBedsideSchwartz({
          heightCm: e,
          creatinineMgDl: n,
        })
      : (t * e) / n;
  return { gfr: o, k: t };
}
function eGFR_CKiD_U25_cr(e, n, t, o) {
  if (
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.computeCkidU25Creatinine == "function"
  )
    return window.ClcrClinicalSafety.computeCkidU25Creatinine({
      sex: e,
      ageYears: n,
      heightCm: t,
      creatinineMgDl: o,
    });
  return null;
}
function eGFR_neonatal_term(e, n, t, o, a) {
  if (
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.computeNeonatalEgfr == "function"
  )
    return window.ClcrClinicalSafety.computeNeonatalEgfr({
      termBorn: e,
      daysOfLife: n,
      heightCm: t,
      creatinineMgDl: o,
      bodyWeightKg: a,
    });
  return null;
}
const refRanges = {},
  clRefRanges = {},
  excr_mgkg = (e, n, t) => (e && n && t ? (e * n) / (100 * t) : null),
  excr_mmol_d = (e, n) => (e && n ? (e * n) / 1e3 : null),
  ratio = (e, n) => (e && n ? e / n : null),
  AG_serum = (e, n, t) =>
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.computeAnionGapWithoutPotassium ==
      "function"
      ? window.ClcrClinicalSafety.computeAnionGapWithoutPotassium({
          sodium: e,
          chloride: n,
          bicarbonate: t,
        })
      : e && n && t
        ? e - n - t
        : null,
  K_frac = (e, n) => (e && n ? (e / (e + n)) * 100 : null),
  $ = (e) => document.getElementById(e);
const CLCR_KTV_RESULT_IDS = Object.freeze([
  "ktvValidation",
  "ktvResult",
  "ektvResult",
  "urrResult",
  "ktvInterpretation",
]);
function readClcrOptionalNumber(e) {
  const n = $(e),
    t = n ? String(n.value || "").trim() : "";
  if (t === "") return null;
  const o = Number(t);
  return Number.isFinite(o) ? o : null;
}
function readClcrCollectionDurationMinutes() {
  const e = document.getElementById("collectionStartAt"),
    n = document.getElementById("collectionEndAt"),
    t = e && e.value ? Date.parse(e.value) : NaN,
    o = n && n.value ? Date.parse(n.value) : NaN;
  if (!Number.isFinite(t) || !Number.isFinite(o) || !(o > t)) return null;
  const a = (o - t) / 6e4;
  return Number.isFinite(a) && a > 0 ? a : null;
}
// This adapter is shared by the cl24 readiness check and actual calculation.
// It deliberately leaves the dated collection used by other formulas intact.
function readCl24CalculationInput() {
  function number(id) {
    const raw = String($(id)?.value ?? "").trim();
    if (!raw) return null;
    const value = Number(raw.replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  const hoursRaw = String($("Cl24DurationHours")?.value ?? "").trim();
  const hours = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(hoursRaw)
    ? number("Cl24DurationHours") : null;
  const age = readClcrFormulaAge("cl24");
  // Completed age 0 already excludes this reference source (which starts at
  // age 3). Missing months must not turn that fact into an unknown age. This
  // fallback is only for source eligibility, never an invented exact age/BSA.
  const ageEligibilityOnly = !age?.valid && number("age") === 0 &&
    String($("ageMonths")?.value ?? "").trim() === "";
  const ageYears = age?.valid ? age.exactYears : ageEligibilityOnly ? 0 : null;
  const weightKg = number("weight"), heightCm = number("height");
  let bsaM2 = null, bsaMethod = "";
  if (!ageEligibilityOnly && ageYears !== null && weightKg > 0 && heightCm > 0) {
    if (ageYears < 18) {
      const bsa = window.ClcrExtendedEgfr?.computeHaycockBsa({
        ageYears, heightValue: heightCm, heightUnit: "cm", weightValue: weightKg, weightUnit: "kg",
      });
      if (bsa?.ok) { bsaM2 = bsa.value; bsaMethod = "Haycock"; }
    } else {
      bsaM2 = BSA_DuBois(weightKg, heightCm);
      bsaMethod = "Du Bois";
    }
  }
  const collectionFields = {
    startVoidDiscarded: "collectionStartVoidDiscarded", finalVoidIncluded: "collectionFinalVoidIncluded",
    noMissedVoids: "collectionNoMissedVoids", noSpillage: "collectionNoSpillage",
    noExtraVoids: "collectionNoExtraVoids", storageFollowed: "collectionStorageFollowed",
  };
  const protocol = {}, knownProblems = [];
  Object.entries(collectionFields).forEach(([key, id]) => {
    // A false legacy checkbox alone means unconfirmed, not an observed error.
    const answer = document.getElementById(`ui_${id}_answer`)?.value
      ?? window.__vildaClcrVersionValueVault?.[`ui_${id}_answer`] ?? "";
    protocol[key] = answer !== "no";
    if (answer === "no") knownProblems.push(id);
  });
  const collectionProblem = !!$("Cl24CollectionProblem")?.checked || knownProblems.length > 0;
  const scr = number("Scr"), scrUnit = $("ScrUnit")?.value;
  const serumCreatinineMgDl = scrUnit === "umol" && scr !== null ? scr / 88.4
    : scrUnit === "mg/dl" ? scr : null;
  return {
    urineCreatinineMgDl: number("Ucr"), serumCreatinineMgDl, volumeMl: number("V24"),
    durationMinutes: hours !== null && hours > 0 ? hours * 60 : null,
    durationSource: hours !== null && hours > 0
      ? ($("Cl24DurationSource")?.value === "legacy-dates" ? "legacy-dates" : "hours") : "missing",
    bsaM2, bsaMethod, weightKg, heightCm, ageYears, ageEligibilityOnly, sex: $("sex")?.value || "",
    protocolMode: "assumed-complete", protocol, collectionProblem, knownProblems,
    collectionAssumptions: {
      collectionCompleteness: collectionProblem ? "known-problem" : "assumed",
      serumSampling: "assumed-compatible",
    },
  };
}
function clcrMeasuredReferenceContext(input, result) {
  const profile = window.ClcrMeasuredClearanceReferenceData?.PROFILES?.PATHWEST_CCL_2026_03_20;
  const reference = window.ClcrMeasuredClearanceReference?.evaluate({
    value: result?.absoluteMlMin, unit: "mL/min", ageYears: input.ageYears, sex: input.sex,
    bsa: input.bsaM2, bsaMethod: input.bsaMethod, durationHours: result?.durationHours,
  }, profile);
  if (!reference) return null;
  const missingFieldIds = [];
  for (const key of reference.missingFields || []) {
    if (key === "ageYears") missingFieldIds.push("age");
    if (key === "sex") missingFieldIds.push("sex");
    if (key === "bsa") {
      if (!(input.weightKg > 0)) missingFieldIds.push("weight");
      if (!(input.heightCm > 0)) missingFieldIds.push("height");
    }
  }
  return { ...reference, missingFieldIds, durationSource: input.durationSource,
    collectionAssumptions: input.collectionAssumptions,
    inputs: { serumCreatinineMgDl: input.serumCreatinineMgDl, urineCreatinineMgDl: input.urineCreatinineMgDl,
      volumeMl: input.volumeMl, durationMinutes: input.durationMinutes,
      ageYears: input.ageYears, sex: input.sex, weightKg: input.weightKg, heightCm: input.heightCm } };
}
function clcrMeasuredClearanceDetails(input, result, reference) {
  const text = (value, digits = 2) => Number.isFinite(value)
    ? String(Number(value.toFixed(digits))).replace(".", ",") : "";
  const original = reference?.indexedRange;
  const converted = reference?.absoluteRange;
  const source = reference?.source;
  const band = reference?.selectedBand;
  const bandLabel = band ? `${band.sexRequired ? band.sex === "M" ? "mężczyźni" : "kobiety" : "obie płcie"}, od ${band.minimumAgeInclusive} do poniżej ${band.maximumAgeExclusive} lat` : "";
  return `<p><strong>Jak obliczono:</strong> kreatynina w moczu ÷ kreatynina w surowicy × objętość moczu ÷ rzeczywisty czas w minutach.</p>
<p><strong>Czas użyty:</strong> ${text(result.durationHours, 6)} h = ${text(result.durationMinutes, 6)} min.${input.durationSource === "legacy-dates" ? " Odtworzono z zapisanych dat początku i końca zbiórki." : ""}</p>
<p><strong>Wydalanie kreatyniny:</strong> ${text(result.creatinineMgDay)} mg/24 h${result.creatinineMgKgDay !== null ? ` (${text(result.creatinineMgKgDay)} mg/kg/24 h)` : ""}. Samo wydalanie nie potwierdza kompletności zbiórki.</p>
${original ? `<p><strong>Zakres źródłowy:</strong> ${text(original.lower, 1)}–${text(original.upper, 1)} ${clcrEscapeHtml(original.unit)} (${clcrEscapeHtml(bandLabel)}). ${clcrEscapeHtml(reference.population?.label || "")}</p>` : ""}
${converted ? `<p><strong>Powierzchnia ciała:</strong> ${text(input.bsaM2, 3)} m² (${clcrEscapeHtml(input.bsaMethod)}). Norma w jednostce wyniku = zakres źródłowy × powierzchnia ciała / 1,73: ${text(converted.lower, 1)}–${text(converted.upper, 1)} mL/min. Granice zaokrąglono do jednego miejsca po przecinku; ocena wykorzystuje pełne wartości. W katalogu PathWest nie podano wzoru BSA.</p>` : ""}
<p><strong>Założenia zbiórki:</strong> pełna, prawidłowa zbiórka; kreatynina w surowicy odpowiadająca okresowi zbiórki. Dopuszczalny odstęp pobrania określa laboratorium.</p>
<p><strong>Interpretacja:</strong> klirens kreatyniny zwykle zawyża GFR. Wynik w zakresie nie wyklucza choroby nerek; nie przypisujemy kategorii G ani nie rozpoznajemy hiperfiltracji na podstawie przekroczenia górnej granicy.</p>
<p>Zakres według PathWest dla zbiórki dobowej.${reference?.protocolNote ? ` ${clcrEscapeHtml(reference.protocolNote)}` : ""} Jeśli laboratorium wykonujące badanie podało własną normę, preferuj ten zakres.</p>
${input.ageYears !== null && input.ageYears < 3 ? "<p>Wybrany zakres PathWest obejmuje wiek od 3 lat. Dla młodszych dzieci dostępne są odrębne normy pediatryczne.</p>" : ""}
<p><strong>Źródła:</strong> ${source?.url ? `<a href="${clcrEscapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${clcrEscapeHtml(source.label || source.title || "PathWest")}</a> · ` : ""}<a href="https://renal.testcatalog.org/show/CRCL" target="_blank" rel="noopener noreferrer">Mayo Clinic Laboratories</a>.</p>`;
}
(document
  .querySelectorAll("#clcrForm input, #clcrForm select")
  .forEach((e) => e.addEventListener("input", update)),
  document.querySelectorAll('#clcrForm input[type="checkbox"]').forEach((e) => {
    e.addEventListener("change", () => {
      typeof update == "function" && update();
    });
  }),
  document.addEventListener("DOMContentLoaded", () => {
    const e = document.getElementById("ktvToggle");
    if (e) {
      const n = () => {
        const t = document.getElementById("ktvFields");
        (t && (t.style.display = e.checked ? "block" : "none"),
          e.checked ||
            CLCR_KTV_RESULT_IDS.forEach((id) => {
              const resultElement = document.getElementById(id);
              resultElement && (resultElement.style.display = "none");
            }),
          typeof update == "function" && update());
      };
      (e.addEventListener("click", n), e.addEventListener("change", n));
    }
  }));
const maxValues = {
    age: 120,
    ageMonths: 11,
    ageDays: 28,
    weight: 300,
    height: 250,
    Scr: 20,
    CystatinC: 10,
    Ucr: 500,
    V24: 1e4,
    S_Na: 200,
    S_K: 10,
    S_Cl: 200,
    S_HCO3: 50,
    S_PO4: 20,
    S_UA: 30,
    U_Na: 300,
    U_K: 200,
    U_Cl: 300,
    U_HCO3: 200,
    U_PO4: 200,
    U_UA: 200,
    U_Ca: 10,
    U_Mg: 100,
    U_Alb: 5e3,
    U_ACR: 2e4,
    U_Prot_spot: 5e4,
    U_PCR: 5e4,
    Ucr_spot: 5e4,
    Scr_spot: 2e4,
    U_Na_spot: 300,
    S_Na_spot: 200,
    U_K_spot: 200,
    S_K_spot: 15,
    U_Cl_spot: 300,
    S_Cl_spot: 200,
    U_HCO3_spot: 200,
    S_HCO3_spot: 60,
    U_PO4_spot: 200,
    S_PO4_spot: 20,
    S_Ca: 15,
    U_Ox: 120,
    U_Cit: 400,
    Ox_Cr_spot: 120,
    Cit_Cr_spot: 400,
    Ca_spot: 30,
    U_Cys: 2e3,
    U_pH: 9,
    pH24: 9,
    S_PTH: 2e3,
    S_VitD: 200,
    ktvSessionsPerWeek: 7,
    ktvDurationMinutes: 480,
    ktvUF: 10,
    ktvW: 300,
    ktvKru: 30,
    UreaPre: 400,
    UreaPost: 400,
  },
  infoTexts = {
    fullName: "Imi\u0119 i nazwisko pacjenta.",
    age: "Wiek pacjenta w latach.",
    ageMonths:
      "Pełne miesiące od ostatnich urodzin (0–11); są dodawane do wieku w latach.",
    ageDays:
      "Ukończone dni życia (0–28), używane wyłącznie w zwalidowanej ścieżce noworodka donoszonego.",
    neonatalTermStatus:
      "Wzór noworodkowy 0,31 × wzrost/Scr jest dostępny wyłącznie po potwierdzeniu urodzenia o czasie.",
    sex: "P\u0142e\u0107 pacjenta (M \u2013 m\u0119\u017Cczyzna, F \u2013 kobieta).",
    weight:
      "Masa cia\u0142a w kilogramach, u\u017Cywana w obliczeniach BSA i Cockcroft\u2013Gault.",
    height: "Wzrost w centymetrach, u\u017Cywany w obliczeniach BSA.",
    Scr: "St\u0119\u017Cenie kreatyniny w surowicy; potrzebne do oblicze\u0144 klirensu i eGFR.",
    ScrAssay:
      "Metoda oznaczenia kreatyniny. Równania eGFR zakładają standaryzację do IDMS; dla ścieżki noworodkowej wymagane jest oznaczenie enzymatyczne.",
    creatinineState:
      "Równania eGFR zakładają markery filtracji zbliżone do stanu stacjonarnego. Przy szybko zmieniającej się kreatyninie lub cystatynie C albo przy podejrzeniu AKI bieżąca interpretacja jest blokowana.",
    suspectedAKI:
      "Zaznaczenie blokuje raportowanie eGFR/eCrCl jako bieżącej funkcji nerek.",
    CystatinC:
      "Stężenie cystatyny C w mg/L, używane w równaniach eGFRcr-cys i eGFRcys.",
    CystatinCStandardization:
      "Równania wymagają oznaczenia cystatyny C identyfikowalnego do materiału ERM-DA471/IFCC.",
    CystatinCAssayMethod:
      "CKiD U25 eGFRcys opracowano z oznaczeniami nefelometrycznymi; inną metodę należy uwzględnić jako ograniczenie porównywalności.",
    Ucr: "St\u0119\u017Cenie kreatyniny w wymieszanej czasowej zbi\xF3rce moczu; niezb\u0119dne do obliczenia klirensu.",
    V24: "Całkowita objęto\u015B\u0107 czasowej zbi\xF3rki moczu w mililitrach.",
    collectionStartAt:
      "Dokładna data i godzina odrzucenia początkowej mikcji.",
    collectionEndAt:
      "Dokładna data i godzina włączenia końcowej mikcji.",
    serumSampleAt:
      "Czas pobrania kreatyniny w surowicy musi mieścić się między początkiem a końcem zbiórki.",
    spotSampleKind:
      "Pierwszy poranny mocz jest preferowany dla ACR/PCR; standardowy TmP/GFR wymaga drugiego porannego moczu.",
    spotSameSpecimen:
      "Wszystkie anality użyte we wskaźniku punktowym i kreatynina muszą pochodzić z tej samej próbki moczu.",
    spotPairedChemistry:
      "Frakcje wydalnicze wymagają analitu i kreatyniny z tej samej próbki moczu oraz równocześnie pobranej próbki krwi.",
    S_Na: "St\u0119\u017Cenie sodu w surowicy (mmol/L).",
    S_K: "St\u0119\u017Cenie potasu w surowicy (mmol/L).",
    S_Cl: "St\u0119\u017Cenie chlork\xF3w w surowicy (mmol/L).",
    S_HCO3: "St\u0119\u017Cenie wodorow\u0119glan\xF3w w surowicy (mmol/L).",
    S_PO4: "St\u0119\u017Cenie fosforu nieorganicznego (P\u1D62) w surowicy (mg/dl lub mmol/L).",
    S_UA: "St\u0119\u017Cenie kwasu moczowego w surowicy (mg/dl).",
    U_Na: "St\u0119\u017Cenie sodu w moczu (mmol/L).",
    U_K: "St\u0119\u017Cenie potasu w moczu (mmol/L).",
    U_Cl: "St\u0119\u017Cenie chlork\xF3w w moczu (mmol/L).",
    U_HCO3: "St\u0119\u017Cenie wodorow\u0119glan\xF3w w moczu (mmol/L).",
    U_PO4: "St\u0119\u017Cenie fosforu nieorganicznego (P\u1D62) w moczu, raportowane jako masa pierwiastkowego fosforu (mg P/dl).",
    U_UA: "St\u0119\u017Cenie kwasu moczowego w moczu (mg/dl).",
    U_Ca: "St\u0119\u017Cenie wapnia w moczu (mmol/L).",
    U_Mg: "St\u0119\u017Cenie magnezu w moczu (mg/L).",
    U_Prot:
      "Całkowita masa białka w całej czasowej zbiórce (mg); wynik /24 h jest przeliczany z rzeczywistego czasu.",
    U_Alb:
      "St\u0119\u017Cenie albuminy w pr\xF3bce moczu (mg/L); u\u017Cywane do obliczenia ACR.",
    U_ACR: "Stosunek albuminy do kreatyniny (mg/g), obliczany automatycznie.",
    U_Prot_spot:
      "Stężenie białka całkowitego w tej samej próbce moczu (mg/L).",
    U_PCR: "Stosunek białka całkowitego do kreatyniny (mg/g), obliczany automatycznie.",
    tmpOvernightFasting:
      "Standardowy profil TmP/GFR wymaga nocnego pozostawania na czczo.",
    tmpPairedSameTime:
      "Fosfor i kreatynina muszą pochodzić z równocześnie pobranych próbek krwi i drugiego porannego moczu.",
    S_Ca: "St\u0119\u017Cenie wapnia ca\u0142kowitego w surowicy (mg/dl lub mmol/L).",
    U_pH: "pH pojedynczej próbki moczu. Pojedynczy wynik nie potwierdza utrwalonego profilu pH ani rozpoznania.",
    stoneSpotFasting:
      "Dla oceny podejrzenia dRTA wymagany jest drugi poranny mocz pobrany na czczo.",
    stonePhPersistent:
      "Interpretacja utrwalonego profilu pH wymaga powtarzanych pomiarów, a nie pojedynczej wartości.",
    stoneUtiExcluded:
      "Wykluczenie zakażenia jest konieczne przed interpretacją zasadowego pH jako profilu wspierającego dRTA.",
    Ox_Cr_spot: "Stężenie szczawianów w tej samej próbce moczu. Jednostkę i postać masową przepisz z raportu.",
    oxalateSpotReportingEntity:
      "Wskaż, czy masa szczawianów w próbce punktowej oznacza kwas szczawiowy, czy jon szczawianowy; tych konwencji nie wolno mieszać.",
    Cit_Cr_spot:
      "St\u0119\u017Cenie cytrynian\xF3w raportowanych jako kwas cytrynowy w pr\xF3bce moczu (mg/dl).",
    S_PTH: "Parathormon w surowicy (pg/ml).",
    S_VitD: "25\u2011hydroksy\u2011witamina\xA0D w surowicy (ng/ml).",
    U_Ox: "Stężenie szczawianów w czasowej zbiórce moczu. Wybierz, czy laboratorium raportuje masę kwasu szczawiowego, czy jonu szczawianowego.",
    oxalateReportingEntity:
      "Masa molowa zależy od sposobu raportowania: kwas szczawiowy i jon szczawianowy nie są wymiennymi jednostkami masowymi.",
    U_Cit:
      "Stężenie cytrynianów raportowane jako kwas cytrynowy w czasowej zbiórce moczu (mg/dl).",
    U_Cys: "St\u0119\u017Cenie cystyny w dobowej zbi\xF3rce moczu (mg/dl).",
    pH24:
      "pH moczu z czasowej zbiórki; nie jest automatycznie traktowane jako średnia z pojedynczych mikcji.",
    stoneKnownCystinuria:
      "W rozpoznanej cystynurii obowiązują odrębne cele objętości i pH; nie są one normami przesiewowymi.",
    stoneThiolTherapy:
      "Leki tiolowe mogą zakłócać rutynowe oznaczenie cystyny; automatyczna interpretacja ilościowa jest wtedy blokowana.",
    stoneMetabolicEvaluationContext:
      "Progi EAU i cel objętości dotyczą swoistej oceny metabolicznej lub profilaktyki nawrotów kamicy, a nie każdej zbiórki wykonywanej do CrCl.",
    stoneCollectionPlausibilityReviewed:
      "Deklaracja oznacza, że wiarygodność zbiórki oceniono klinicznie, w tym z uwzględnieniem dobowego wydalania kreatyniny; kalkulator nie stosuje uniwersalnego zakresu CER.",
    stoneTwoCollectionsConfirmed:
      "EAU zaleca dwie kolejne 24-godzinne zbiórki do swoistej oceny metabolicznej. Bez potwierdzenia kalkulator pokazuje wartości, ale wstrzymuje progi.",
    ScrUnit:
      "Jednostka st\u0119\u017Cenia kreatyniny w surowicy (mg/dl lub \xB5mol/L).",
    S_Ca_unit:
      "Jednostka st\u0119\u017Cenia wapnia ca\u0142kowitego w surowicy (mg/dl lub mmol/L).",
    S_PO4_unit:
      "Jednostka st\u0119\u017Cenia fosforu nieorganicznego (P\u1D62) w surowicy (mg/dl lub mmol/L).",
    ktvToggle:
      "Zaznacz to pole, aby pokaza\u0107 sekcj\u0119 zaawansowanych oblicze\u0144 KT/V.",
    ktvModality:
      "Moduł dotyczy wyłącznie przerywanej hemodializy (IHD), nie dializy otrzewnowej ani terapii ciągłych.",
    ktvSessionsPerWeek:
      "Rzeczywista planowa częstość IHD jest potrzebna do doboru dokładnego współczynnika GFAC.",
    ktvPidiDays:
      "Rzeczywisty poprzedzający odstęp międzydializacyjny (PIDI) dla badanej sesji; nie należy wyprowadzać go wyłącznie z liczby sesji na tydzień.",
    ktvDurationMinutes:
      "Czas trwania badanej sesji dializy w minutach.",
    ktvUF:
      "Ultrafiltracja netto podczas sesji w litrach (UF, L).",
    ktvW: "Masa cia\u0142a pacjenta po zako\u0144czeniu dializy, w kilogramach (W, kg).",
    ktvUreaAnalyte:
      "Przed i po dializie musi być oznaczony ten sam analit: mocznik albo BUN.",
    ktvUreaUnit:
      "Obie próbki muszą mieć tę samą jednostkę; równanie wykorzystuje ich stosunek.",
    UreaPre:
      "Stężenie wybranego analitu przed rozpoczęciem dializy, w jednostce wspólnej dla obu próbek.",
    UreaPost:
      "Stężenie mocznika lub BUN po zakończeniu dializy, w tym samym analicie i jednostce co próbka przed dializą.",
    ktvAccessType:
      "Typ dostępu określa stałą korekty odbicia mocznika dla szacowanego eKt/Vurea: 35 min dla AVF/AVG i 22 min dla CVC.",
    ktvPostMethod:
      "Prawidłowa próbka po IHD wymaga zwalidowanego protokołu slow-flow albo stop-dialysate-flow; u dzieci stosowana jest konserwatywnie tylko metoda slow-flow.",
    ktvSameSession:
      "Próbki przed i po muszą pochodzić z tej samej ocenianej sesji IHD.",
    ktvPreBeforeDialysis:
      "Próbkę przed należy pobrać bezpośrednio przed rozpoczęciem ocenianej sesji.",
    ktvPreNoDilution:
      "Sól, heparyna lub inny płyn podany przed pobraniem może rozcieńczyć próbkę i zniekształcić wynik.",
    ktvKru:
      "Resztkowy klirens mocznika (Kru) w ml/min/1,73 m². Progi sesyjne 1,2/1,4 wymagają aktualnego Kru <2.",
    ktvKruMeasuredAt:
      "Pomiar Kru uznaje się za aktualny do 3 miesięcy; przy zmianie diurezy wymaga wcześniejszej kontroli.",
    ktvTreatmentsDelivered:
      "Ocena progowa pojedynczej sesji wymaga potwierdzenia, że cały oceniany schemat realizowano regularnie bez skracania zabiegów.",
  };
window.ClcrInfoTexts = Object.freeze({ ...infoTexts });
document.addEventListener("DOMContentLoaded", () => {
  ((window.currentVersion = ""),
    document.querySelectorAll('#clcrForm input[type="number"]').forEach((e) => {
      const n = document.createElement("div");
      ((n.className = "validation-message"), e.parentNode.appendChild(n));
    }));
});
function validateField(e) {
  const n = e.id,
    t = parseFloat(e.value),
    o = e.parentNode.querySelector(".validation-message");
  if (!e.value)
    return (o && (o.textContent = ""), e.classList.remove("error"), !0);
  if (isNaN(t))
    return (
      o && (o.textContent = "Nieprawid\u0142owa liczba"),
      e.classList.add("error"),
      !1
    );
  if (
    (n === "age" || n === "ageMonths" || n === "ageDays") &&
    !Number.isInteger(t)
  )
    return (
      o && (o.textContent = "Wiek musi być podany jako liczba całkowita"),
      e.classList.add("error"),
      !1
    );
  if (t < 0)
    return (
      o && (o.textContent = "Warto\u015B\u0107 nie mo\u017Ce by\u0107 ujemna"),
      e.classList.add("error"),
      !1
    );
  if (n === "Scr") {
    let a = t;
    const s = document.getElementById("ScrUnit");
    if (
      ((s ? s.value : "mg/dl") === "umol" && (a = t / 88.4),
      maxValues.Scr !== void 0 && a > maxValues.Scr)
    )
      return (
        o && (o.textContent = "Warto\u015B\u0107 wydaje si\u0119 zbyt wysoka"),
        e.classList.add("error"),
        !1
      );
  } else if (n === "S_Ca") {
    let a = t;
    const s = document.getElementById("S_Ca_unit");
    if (
      ((s ? s.value : "mg/dl") === "mmol/L" && (a = t * 4),
      maxValues.S_Ca !== void 0 && a > maxValues.S_Ca)
    )
      return (
        o && (o.textContent = "Warto\u015B\u0107 wydaje si\u0119 zbyt wysoka"),
        e.classList.add("error"),
        !1
      );
  } else if (n === "S_PO4") {
    let a = t;
    const s = document.getElementById("S_PO4_unit");
    if (
      ((s ? s.value : "mg/dl") === "mmol/L" && (a = t * 3.1),
      maxValues.S_PO4 !== void 0 && a > maxValues.S_PO4)
    )
      return (
        o && (o.textContent = "Warto\u015B\u0107 wydaje si\u0119 zbyt wysoka"),
        e.classList.add("error"),
        !1
      );
  } else if (n === "U_Alb" && $("U_Alb_unit")?.value === "mg/dL" && t * 10 > maxValues.U_Alb) {
    if (o) o.textContent = "Wartość wydaje się zbyt wysoka";
    e.classList.add("error");
    return false;
  } else if (n === "U_Prot_spot" && t * ({ "mg/L": 1, "mg/dL": 10, "g/L": 1000 }[$("U_Prot_spot_unit")?.value || "mg/L"] || 1) > maxValues.U_Prot_spot) {
    if (o) o.textContent = "Wartość wydaje się zbyt wysoka";
    e.classList.add("error");
    return false;
  } else if ($("formulaPicker")?.value === "CaCr_spot" && ["Ca_spot", "Ucr_spot"].includes(n)) {
    // Ca/Cr validates finite, nonnegative concentrations in its own engine.
    // A unitless legacy ceiling (Ca=30) cannot reject equivalent mg/dL and
    // mmol/L values differently; other formulas retain their existing limits.
  } else if ($("formulaPicker")?.value === "OxCr_spot" && ["Ox_Cr_spot", "Ucr_spot"].includes(n)) {
    // The Ox/Cr engine validates finite concentrations consistently across units.
  } else if ($("formulaPicker")?.value === "CitCr_spot" && ["Cit_Cr_spot", "Ucr_spot"].includes(n)) {
    // The Cit/Cr engine validates concentrations in their declared units.
  } else if ($("formulaPicker")?.value === "FENa_spot" && ["U_Na_spot", "S_Na_spot", "Ucr_spot", "Scr_spot"].includes(n)) {
    // FENa validates its four finite concentrations in their declared units.
    // A unitless ceiling must not reject equivalent creatinine concentrations.
  } else if ($("formulaPicker")?.value === "FEK_spot" && ["U_K_spot", "S_K_spot", "Ucr_spot", "Scr_spot"].includes(n)) {
    // FEK validates its four finite concentrations in their declared units.
    // No source supports a unitless ceiling on these concentration controls.
  } else if (maxValues[n] !== void 0 && t > maxValues[n])
    return (
      o && (o.textContent = "Warto\u015B\u0107 wydaje si\u0119 zbyt wysoka"),
      e.classList.add("error"),
      !1
    );
  return (o && (o.textContent = ""), e.classList.remove("error"), !0);
}
function validateClcrAgeContext(e) {
  // Cit/Cr reference bands use completed years; zero years needs no extra
  // months or days to select the source's birth–<3-years interval.
  if (["CitCr_spot", "FENa_spot", "FEK_spot"].includes($("formulaPicker")?.value)) return;
  const n = document.getElementById("age"),
    t = document.getElementById("ageMonths");
  if (!n || (n.value || "").trim() === "") return;
  if (e && e.valid) return;
  const o = t && t.parentNode ? t.parentNode.querySelector(".validation-message") : null;
  t && t.classList.add("error");
  if (o)
    o.textContent =
      Number(n.value) === 0 && (!t || (t.value || "").trim() === "")
        ? "U pacjenta w wieku 0 lat podaj pełne miesiące (0–11)"
        : "Nieprawidłowa wartość wieku w latach, miesiącach lub dniach życia";
}
function canComputeFormula(e) {
  const n = typeof FORMULAS < "u" ? FORMULAS.find((t) => t.id === e) : null;
  if (!n) return !1;
  if (e === "ACR") return evaluateClcrAcr().valid === true;
  if (e === "PCR") return evaluateClcrPcr().valid === true;
  if (e === "CaCr_spot") return evaluateClcrCacr().valid === true;
  if (e === "OxCr_spot") return evaluateClcrOxcr().valid === true;
  if (e === "CitCr_spot") return evaluateClcrCitcr().valid === true;
  if (e === "FENa_spot") return evaluateClcrFena().valid === true;
  if (e === "FEK_spot") return evaluateClcrFek().valid === true;
  if (
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.formulaSafety == "function"
  ) {
    const t = readClcrFormulaAge(e),
      resolution = resolveClcrCalculationAssumptions(e),
      o = resolution.calculationContext.markerPolicy,
      a = {
        termStatus:
          document.getElementById("neonatalTermStatus")?.value || "",
        bodyWeightKg:
          document.getElementById("weight")?.value || "",
        scrAssay:
          document.getElementById("ScrAssay")?.value || "",
      };
    if (!resolution.allowed || !window.ClcrClinicalSafety.formulaSafety(e, t, o, a).eligible) return !1;
  }
  if (e === "cl24") {
    return window.ClcrClinicalSafety?.computeTimedCreatinineClearance(readCl24CalculationInput()).ok === true;
  }
  return n.requires.every((t) => {
        const o = document.getElementById(t);
        if (!o) return !1;
        if (e === "AGu_spot" && t === "spotSameSpecimen") {
          return typeof window.ClcrUiWorkflow?.uagSpecimenConfirmed === "function"
            ? window.ClcrUiWorkflow.uagSpecimenConfirmed()
            : o.checked || !!document.getElementById("spotPairedChemistry")?.checked;
        }
        if (o.type === "checkbox") return o.checked;
        if (o.tagName === "SELECT") return o.value !== "" && o.value != null;
        if (o.type === "datetime-local")
          return (o.value || "").trim() !== "";
        const a = o.value;
        if (a === "" || a == null) return !1;
        const s = +a;
        const p = new Set([
          "age",
          "ageMonths",
          "ageDays",
          "ktvUF",
          "U_Alb",
          "U_Prot_spot",
          "U_Na_spot",
          "U_K_spot",
          "U_Cl_spot",
          "U_HCO3_spot",
        ]);
        return !Number.isNaN(s) && (p.has(t) ? s >= 0 : s > 0);
      });
}
function readClcrFormulaAge(formulaId) {
  const clinical = window.ClcrClinicalSafety;
  if (!clinical || typeof clinical.readAgeFromDocument !== "function") return null;
  // Ignore months for this calculation, without overwriting the canonical
  // patient input (including restored months used by the other formulas).
  return formulaId === "cg_norm" && typeof clinical.parseAge === "function"
    ? clinical.parseAge(document.getElementById("age")?.value || "", 0)
    : clinical.readAgeFromDocument(document);
}
// ACR has its own input source. A laboratory ratio never fabricates urine
// concentrations, and an unchecked legacy checkbox is not a negative fact.
function readClcrAcrInput({ concentrationOnly = false } = {}) {
  const age = readClcrFormulaAge("ACR");
  const specimen = $("ACR_same_specimen")?.value || "";
  const legacyAnswer = $("ui_spotSameSpecimen_answer")?.value || "";
  const legacyNo = legacyAnswer === "no";
  return {
    mode: !concentrationOnly && $("ACR_entry_mode")?.value === "direct" ? "direct" : "concentration",
    albuminValue: $("U_Alb")?.value ?? "",
    albuminUnit: $("U_Alb_unit") ? $("U_Alb_unit").value : "mg/L",
    creatinineValue: $("Ucr_spot")?.value ?? "",
    creatinineUnit: $("Ucr_spot_unit") ? $("Ucr_spot_unit").value : "mg/dl",
    reportedValue: $("ACR_reported")?.value ?? "",
    reportedUnit: $("ACR_reported_unit") ? $("ACR_reported_unit").value : "mg/g",
    ageYears: age?.valid ? age.exactYears : null,
    sameSpecimen: specimen === "different" ? "different" : specimen === "confirmed" ? "confirmed"
      : legacyNo ? "different" : legacyAnswer === "unknown" ? "assumed"
        : $("spotSameSpecimen")?.checked || legacyAnswer === "yes" ? "confirmed" : "assumed",
    sampleType: $("spotSampleKind")?.value || "",
    confounders: [["spotMenstruation", "menstruation"], ["spotHematuria", "hematuria"],
      ["spotInfection", "infection"], ["spotExercise", "exercise"], ["spotAcuteIllness", "acuteIllness"]]
      .filter(([id]) => !!$(id)?.checked).map(([, key]) => key),
  };
}
function evaluateClcrAcr(options) {
  return window.VildaClcrAcr?.evaluate(readClcrAcrInput(options), window.VildaClcrAcrReferenceData?.getProfile("KDIGO_ACR_2024"))
    || { valid: false, reasonCode: "ACR_UNAVAILABLE" };
}
function evaluateClcrPcr(options) {
  const engine = window.VildaClcrPcr;
  return engine?.evaluate(engine.readInputFromDocument(document, options), window.VildaClcrPcrReferenceData?.getProfile("KDIGO_PCR_2024_2025"))
    || { valid: false, reasonCode: "PCR_UNAVAILABLE", message: "Nie można obliczyć PCR. Odśwież aplikację." };
}
function evaluateClcrCacr(options) {
  const engine = window.VildaClcrCacr;
  return engine?.evaluate(engine.readInputFromDocument(document, options), window.VildaClcrCacrReferenceData?.getProfile("MAYO_CACR3_RANDOM_2026_10"))
    || { valid: false, reasonCode: "CACR_UNAVAILABLE", message: "Nie można obliczyć Ca/Cr. Odśwież aplikację." };
}
function evaluateClcrOxcr(options) {
  const engine = window.VildaClcrOxcr;
  return engine?.evaluate(engine.readInputFromDocument(document, options), window.VildaClcrOxcrReferenceData?.DEFAULT_POLICY)
    || { valid: false, reasonCode: "OXCR_UNAVAILABLE", message: "Nie można obliczyć Ox/Cr. Odśwież aplikację." };
}
function evaluateClcrCitcr(options) {
  const engine = window.VildaClcrCitcr;
  return engine?.evaluate(engine.readInputFromDocument(document, options), window.VildaClcrCitcrReferenceData?.DEFAULT_POLICY)
    || { valid: false, reasonCode: "CITCR_UNAVAILABLE", message: "Nie można obliczyć Cit/Cr. Odśwież aplikację." };
}
function evaluateClcrFena() {
  const engine = window.VildaClcrFena;
  return engine?.evaluate(engine.readInputFromDocument(document), window.VildaClcrFenaReferenceData?.DEFAULT_POLICY)
    || { valid: false, errorCode: "FENA_UNAVAILABLE", error: "Nie można obliczyć FENa. Odśwież aplikację." };
}
function evaluateClcrFek() {
  const engine = window.VildaClcrFek;
  return engine?.evaluate(engine.readInputFromDocument(document), window.VildaClcrFekReferenceData?.DEFAULT_POLICY)
    || { valid: false, errorCode: "FEK_UNAVAILABLE", error: "Nie można obliczyć FEK. Odśwież aplikację." };
}
function clcrCgNormalizedDetails(ageYears, bsaM2, sources = []) {
  const ageUsed = Math.floor(ageYears);
  const sourceLinks = sources.map((source) => `<a href="${clcrEscapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${clcrEscapeHtml(source.label)}</a>`).join(" · ");
  return `<p><strong>Jak obliczono:</strong> użyto rzeczywistej masy ciała. Wiek użyty we wzorze: ${clcrEscapeHtml(ageUsed)} ukończonych lat. Wynik Cockcrofta–Gaulta przeliczono na 1,73 m²: CG × 1,73 / powierzchnia ciała.</p>
<p><strong>Powierzchnia ciała (Du Bois):</strong> ${clcrEscapeHtml(bsaM2.toFixed(2).replace(".", ","))} m².</p>
<p><strong>Ograniczenia:</strong> otyłość, niedowaga, obrzęki lub nietypowa masa mięśniowa mogą zmniejszać wiarygodność oszacowania. Przeliczenie na 1,73 m² nie usuwa tych ograniczeń.</p>
<p>To klirens kreatyniny (eCrCl), a nie eGFR. Wzór CG opracowano przed współczesną standaryzacją oznaczeń kreatyniny.</p>
${sourceLinks ? `<p><strong>Źródła:</strong> ${sourceLinks}.</p>` : ""}`;
}
function isFiniteNum(e) {
  return e != null && Number.isFinite(e);
}
function clearClcrResultElement(e) {
  const n = $(e);
  if (n)
    try {
      clcrClearElement(n);
    } catch {
      n.textContent = "";
    }
}
function hideAllClcrResultOutputs(e = {}) {
  const n = e.clear !== !1;
  (["results", "elecCard", "stoneCard"].forEach((t) => {
    const o = $(t);
    o && (o.style.display = "none");
  }),
    CLCR_KTV_RESULT_IDS.forEach((t) => {
      const o = $(t);
      if (o && ((o.style.display = "none"), n))
        try {
          clcrClearElement(o);
        } catch {
          o.textContent = "";
        }
    }),
    n && ["clcrInfo", "elecInfo", "stoneInfo"].forEach(clearClcrResultElement));
}
// Consolidate our own trusted engine markup, without cloning numerical data or
// parsing displayed numbers. The selected primary remains a direct child so
// snapshots and the series/history API retain their original anchors.
function packClcrSupplementaryMarkup(markup, formulaId) {
  if (!markup || !formulaId || !window.ClcrResultPresentation) return markup;
  const staging = document.createElement("div");
  clcrSetTrustedMarkup(staging, markup, "clcr-result-presentation-staging");
  const nodes = [...staging.children];
  const primary = nodes.find((node) => node.classList.contains("clcr-result-card") && node.dataset.clcrFormula === formulaId);
  if (!primary && ["CitCr_spot", "FENa_spot", "FEK_spot"].includes(formulaId)) {
    const pending = nodes.filter((node) => node.dataset.clcrFormula === formulaId && node.matches(".citcr-result-empty, .citcr-result-error, .fena-result-empty, .fena-result-error, .fek-result-empty, .fek-result-error"));
    if (pending.length) return pending.map((node) => node.outerHTML).join("");
  }
  if (!primary) return markup;
  const details = nodes.find((node) => node.classList.contains("clcr-result-details") && node.dataset.clcrFormula === formulaId);
  if (!details) return markup;
  if (["OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot"].includes(formulaId)) {
    // This card already carries its complete source and specimen context.
    // Unrelated stone-panel EAU notes must not label a Fimlab/NHS reference.
    nodes.filter((node) => node !== primary && node !== details &&
      !(node.classList.contains("clcr-result-source") && node.dataset.clcrFormula === formulaId)).forEach((node) => node.remove());
    return staging.innerHTML;
  }
  if (formulaId === "cl24") {
    // All measured-clearance context is already included in its own Details.
    // Generic dated-collection output belongs to the other urine modules.
    nodes.filter((node) => node !== primary && node !== details).forEach((node) => node.remove());
    return staging.innerHTML;
  }
  const source = nodes.find((node) => node.classList.contains("clcr-result-source") && node.dataset.clcrFormula === formulaId);
  const assumptions = nodes.find((node) => node.classList.contains("clcr-result-assumptions") && node.dataset.clcrFormula === formulaId);
  const earlyCaution = formulaId === "neonatal_egfr"
    ? nodes.find((node) => node.matches(".clcr-neonatal-early-note[data-neonatal-early-note]") && node.dataset.clcrFormula === formulaId)
    : null;
  const extras = document.createElement("div");
  extras.className = "clcr-result-extra";
  nodes.forEach((node) => {
    const owner = node.dataset.clcrFormula;
    if (owner && owner !== formulaId && node.dataset.clcrComparisonFor !== formulaId) {
      node.remove();
    } else if (node !== primary && node !== details && node !== source && node !== assumptions && node !== earlyCaution) extras.appendChild(node);
  });
  if (extras.childElementCount) details.appendChild(extras);
  return staging.innerHTML;
}
function consolidateClcrEngineOutputs(formulaId) {
  if (!formulaId || !window.ClcrResultPresentation) return;
  const containers = [$("clcrInfo"), $("elecInfo"), $("stoneInfo")].filter(Boolean);
  const primary = containers.flatMap((container) => [...container.children]).find((node) => node.matches(".clcr-result-card") && node.dataset.clcrFormula === formulaId);
  if (!primary) return;
  const container = primary.parentElement;
  const details = [...container.children].find((node) => node.matches(".clcr-result-details") && node.dataset.clcrFormula === formulaId);
  if (!details) return;
  let extras = details.querySelector(".clcr-result-extra");
  containers.filter((other) => other !== container).forEach((other) => {
    [...other.children].forEach((node) => {
      if (node.dataset.clcrFormula !== formulaId && node.dataset.clcrComparisonFor !== formulaId) {
        node.remove();
        return;
      }
      if (!extras) { extras = document.createElement("div"); extras.className = "clcr-result-extra"; details.appendChild(extras); }
      extras.appendChild(node);
    });
  });
}
// Effective calculation assumptions never write back to specimen/patient inputs.
function clcrMeasuredAssayAssumption(scrAssay) {
  const assay = String(scrAssay || "").trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if (["non_idms", "enzymatic_non_idms", "jaffe_non_idms"].includes(assay)) {
    return { provenance: "provided", standardization: "non_IDMS",
      text: "Zapisano oznaczenie kreatyniny bez standaryzacji IDMS; wpływ metody oceń zgodnie z laboratorium." };
  }
  const provided = ["enzymatic_idms", "jaffe_idms"].includes(assay);
  return { provenance: provided ? "provided" : "assumed", standardization: "IDMS",
    text: provided ? "Zapisane oznaczenie kreatyniny jest standaryzowane do IDMS."
      : "Przyjęto oznaczenie kreatyniny standaryzowane do IDMS." };
}
function resolveClcrCalculationAssumptions(formulaId) {
  const context = {
    creatinineState: $("creatinineState")?.value || "unknown",
    suspectedAKI: !!$("suspectedAKI")?.checked,
    scrAssay: $("ScrAssay")?.value || "",
    cystatinCStandardization: $("CystatinCStandardization")?.value || "",
    crCysStandardizationConfirmed: !!$("CrCysStandardizationConfirmed")?.checked,
  };
  const resolution = window.VildaClcrCalculationAssumptions.resolve(formulaId, context);
  if (formulaId !== "cl24") return resolution;
  // Method is a disclosed assumption here, not an IDMS eligibility gate for
  // the urine/plasma ratio. Never replace a recorded contrary method.
  const assay = clcrMeasuredAssayAssumption(context.scrAssay);
  return { ...resolution,
    assumptionsText: resolution.allowed ? `${resolution.assumptionsText} ${assay.text}`.trim() : "",
    provenance: { ...resolution.provenance, creatinineStandardization: assay.provenance },
    calculationContext: { ...resolution.calculationContext, creatinineStandardization: assay.standardization },
  };
}
function update() {
  const e = $("fullName").value.trim();
  $("patientName").textContent = e || "";
  const ageContext = readClcrFormulaAge($("formulaPicker")?.value || ""),
    n = $("age") ? String($("age").value || "").trim() : "",
    t = ageContext && ageContext.valid ? ageContext.exactYears : NaN,
    o = !!(ageContext && ageContext.valid),
    a = $("sex").value,
    sexKnown = a === "F" || a === "M",
    s = +$("weight").value,
    p = +$("height").value,
    h = +$("Scr").value,
    A = $("ScrUnit") ? $("ScrUnit").value : "mg/dl",
    cystatinC = readClcrOptionalNumber("CystatinC"),
    cystatinCStandardization =
      $("CystatinCStandardization")?.value || "",
    cystatinCAssayMethod = $("CystatinCAssayMethod")?.value || "";
  const creatinineContext = resolveClcrCalculationAssumptions("cg").calculationContext.markerPolicy,
    populationContext = {
      termStatus: $("neonatalTermStatus")
        ? $("neonatalTermStatus").value
        : "",
      bodyWeightKg: s,
      scrAssay: $("ScrAssay") ? $("ScrAssay").value : "",
    };
  let d;
  !A || A === ""
    ? (d = null)
    : h
      ? (d = A === "umol" ? h / 88.4 : h)
      : (d = null);
  const N = readClcrOptionalNumber("Ucr_spot"),
    _ = $("Ucr_spot_unit") ? $("Ucr_spot_unit").value : "mg/dl";
  const c =
    _ && _ !== "" && N !== null && N > 0
      ? _ === "umol"
        ? N / 88.4
        : _ === "mmol/L" ? N * 1000 / 88.4 : _ === "mg/dl" ? N : null
      : null;
  const O = +$("U_PO4_spot").value,
    D = document.getElementById("U_PO4_spot_unit"),
    te = D ? D.value : "mg/dl";
  const k = +$("S_PO4_spot").value,
    Q = document.getElementById("S_PO4_spot_unit"),
    U = Q ? Q.value : "mg/dl";
  const P = +$("Scr_spot").value,
    K = document.getElementById("Scr_spot_unit"),
    I = K ? K.value : "mg/dl";
  let j = null;
  const sameSpotSpecimen = !!(
      $("spotSameSpecimen") && $("spotSameSpecimen").checked
    ),
    spotSampleKind = $("spotSampleKind")
      ? $("spotSampleKind").value
      : "",
    spotConfounders = [
      ["spotMenstruation", "miesiączka"],
      ["spotHematuria", "krwiomocz"],
      ["spotInfection", "zakażenie / infekcja"],
      ["spotExercise", "intensywny wysiłek"],
      ["spotAcuteIllness", "ostra choroba"],
    ]
      .filter(([id]) => !!$(id)?.checked)
      .map(([, label]) => label),
    acrEvaluation = evaluateClcrAcr({ concentrationOnly: $("formulaPicker")?.value !== "ACR" }),
    acrRatio = acrEvaluation.valid && acrEvaluation.mode === "concentration"
      ? { mgG: acrEvaluation.rawValue, mgMmol: acrEvaluation.convertedValue } : null,
    pcrEvaluation = evaluateClcrPcr({ concentrationOnly: $("formulaPicker")?.value !== "PCR" }),
    cacrEvaluation = evaluateClcrCacr({ concentrationOnly: $("formulaPicker")?.value !== "CaCr_spot" }),
    oxcrEvaluation = evaluateClcrOxcr({ concentrationOnly: $("formulaPicker")?.value !== "OxCr_spot" }),
    citcrEvaluation = evaluateClcrCitcr({ concentrationOnly: $("formulaPicker")?.value !== "CitCr_spot" }),
    fenaEvaluation = evaluateClcrFena(),
    fekEvaluation = evaluateClcrFek();
  acrRatio
    ? ((j = acrRatio.mgG),
      ($("U_ACR").value = j.toFixed(1)))
    : ($("U_ACR").value = "");
  $("U_PCR").value = pcrEvaluation.valid && pcrEvaluation.mode === "concentration"
    ? pcrEvaluation.rawValue.toFixed(1) : "";
  const spotPairedChemistry = !!$("spotPairedChemistry")?.checked,
    spotUrineSodium = readClcrOptionalNumber("U_Na_spot"),
    spotSerumSodium = readClcrOptionalNumber("S_Na_spot"),
    spotUrinePotassium = readClcrOptionalNumber("U_K_spot"),
    spotSerumPotassium = readClcrOptionalNumber("S_K_spot"),
    spotUrineChloride = readClcrOptionalNumber("U_Cl_spot"),
    spotSerumChloride = readClcrOptionalNumber("S_Cl_spot"),
    spotUrineBicarbonate = readClcrOptionalNumber("U_HCO3_spot"),
    spotSerumBicarbonate = readClcrOptionalNumber("S_HCO3_spot"),
    computeSpotFractionalExcretion = (urineAnalyte, serumAnalyte) =>
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.computeFractionalExcretion == "function"
        ? window.ClcrClinicalSafety.computeFractionalExcretion({
            urineAnalyte,
            serumAnalyte,
            urineCreatinine: N,
            urineCreatinineUnit: _,
            serumCreatinine: P,
            serumCreatinineUnit: I,
            pairedSameTime: spotPairedChemistry,
            sameUrineSpecimen: spotPairedChemistry,
          })
        : null,
    spotFeNa = computeSpotFractionalExcretion(
      spotUrineSodium,
      spotSerumSodium,
    ),
    spotFeK = { ok: fekEvaluation.valid === true, valuePct: fekEvaluation.rawValue, error: fekEvaluation.error },
    spotFeCl = computeSpotFractionalExcretion(
      spotUrineChloride,
      spotSerumChloride,
    ),
    spotFeHco3 = computeSpotFractionalExcretion(
      spotUrineBicarbonate,
      spotSerumBicarbonate,
    ),
    uagSpecimenConfirmed = typeof window.ClcrUiWorkflow?.uagSpecimenConfirmed === "function"
      ? window.ClcrUiWorkflow.uagSpecimenConfirmed() : sameSpotSpecimen,
    spotUag =
      uagSpecimenConfirmed &&
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.computeUrineAnionGap == "function"
        ? window.ClcrClinicalSafety.computeUrineAnionGap({
            sodium: spotUrineSodium,
            potassium: spotUrinePotassium,
            chloride: spotUrineChloride,
          })
        : null;
  /*
   * Etap 0: automatyczne zakresy Ca/Cr oraz TmP/GFR są wyłączone.
   * Ich właściwa interpretacja wymaga dokładnego wieku, płci, materiału,
   * metody oznaczeń i jednego spójnego zestawu referencyjnego.
   */
  refRanges.Ca_Cr_spot = {};
  const R = +$("V24").value,
    collectionDurationMinutes = readClcrCollectionDurationMinutes();
  const urineCollectionProtocol = {
      startVoidDiscarded: !!$(
        "collectionStartVoidDiscarded",
      )?.checked,
      finalVoidIncluded: !!$("collectionFinalVoidIncluded")?.checked,
      noMissedVoids: !!$("collectionNoMissedVoids")?.checked,
      noSpillage: !!$("collectionNoSpillage")?.checked,
      noExtraVoids: !!$("collectionNoExtraVoids")?.checked,
      storageFollowed: !!$("collectionStorageFollowed")?.checked,
    },
    urineCollectionProtocolComplete = Object.values(
      urineCollectionProtocol,
    ).every(Boolean),
    collectionDailyVolume =
      R > 0 &&
      collectionDurationMinutes &&
      urineCollectionProtocolComplete
        ? R * (1440 / collectionDurationMinutes)
        : null;
  if (
    (document
      .querySelectorAll('#clcrForm input[type="number"]')
      .forEach((i) => validateField(i)),
    document
      .querySelectorAll(
        '#clcrForm input[type="number"], #clcrForm input[type="text"]',
      )
      .forEach((i) => {
        if (i.closest("#patientSet")) {
          i.classList.remove("is-filled");
          return;
        }
        if (i.readOnly || i.type === "checkbox") {
          i.classList.remove("is-filled");
          return;
        }
        const l = (i.value || "").trim() !== "",
          u = !i.classList.contains("error");
        l && u ? i.classList.add("is-filled") : i.classList.remove("is-filled");
      }),
    validateClcrAgeContext(ageContext),
    window.ClcrUiWorkflow &&
    typeof window.ClcrUiWorkflow.hasBlockingValidationError === "function"
      ? window.ClcrUiWorkflow.hasBlockingValidationError()
      : document.querySelector("#clcrForm .error"))
  ) {
    (hideAllClcrResultOutputs({ clear: !0 }),
      typeof syncClcrReportVisibility == "function" &&
        syncClcrReportVisibility());
    return;
  }
  const rt = o && d,
    dt = [...document.querySelectorAll("#clcrForm input")].some((i) =>
      i.type === "hidden" ? false : i.type === "checkbox" ? i.checked : (i.value || "").trim() !== "",
    );
  let Ne = !1;
  {
    const i = document.getElementById("formulaPicker");
    i && (i.value || "").trim() !== "" && (Ne = !0);
  }
  if (!(dt || Ne)) {
    (hideAllClcrResultOutputs({ clear: !0 }),
      typeof syncClcrReportVisibility == "function" &&
        syncClcrReportVisibility());
    return;
  }
  let W = null,
    bsaMethod = "";
  if (o && t < 18 && s > 0 && p > 0) {
    const haycockResult =
      window.ClcrExtendedEgfr &&
      typeof window.ClcrExtendedEgfr.computeHaycockBsa === "function"
        ? window.ClcrExtendedEgfr.computeHaycockBsa({
            ageYears: t,
            heightValue: p,
            heightUnit: "cm",
            weightValue: s,
            weightUnit: "kg",
          })
        : null;
    if (haycockResult && haycockResult.ok) {
      W = haycockResult.value;
      bsaMethod = "Haycock";
    }
  } else if (o && t >= 18 && s > 0 && p > 0) {
    W = BSA_DuBois(s, p);
    bsaMethod = "Du Bois";
  }
  const measuredInput = readCl24CalculationInput();
  const timedCrCl =
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.computeTimedCreatinineClearance ==
      "function"
      ? window.ClcrClinicalSafety.computeTimedCreatinineClearance(measuredInput)
      : null;
  const measuredReference = timedCrCl?.ok ? clcrMeasuredReferenceContext(measuredInput, timedCrCl) : null;
  function renderResultCard(input) {
    const presenter = window.ClcrResultPresentation;
    const referenceProfile = window.ClcrResultReferenceData?.PROFILE;
    if (!presenter || !referenceProfile) return null;
    const formulaId = input.formulaId || input.series || "";
    const ageYears = o ? t : null;
    let assumptions = resolveClcrCalculationAssumptions(formulaId);
    if (formulaId === "cl24") {
      assumptions = { ...assumptions,
        assumptionsText: `${assumptions.assumptionsText || ""} Założenia zbiórki: pełna, prawidłowa zbiórka; kreatynina w surowicy odpowiadająca okresowi zbiórki.`.trim(),
        provenance: { ...assumptions.provenance, ...measuredInput.collectionAssumptions, durationSource: measuredInput.durationSource },
      };
    }
    const effective = assumptions.calculationContext;
    let presentation = input.presentation || null;
    if (!presentation && referenceProfile.gfrFormulaIds.includes(formulaId)) {
      if (["egfr", "ckid_u25", "sch_idms"].includes(formulaId)) {
        presentation = window.ClcrClinicalSafety.egfrPresentation({
          value: input.value, age: ageYears,
          assay: effective.presentationAssay, markerPolicy: effective.markerPolicy,
        });
        if (presentation.state === "limited") {
          presentation = { ...presentation, label: "Szacowany eGFR — ocena ograniczona" };
        }
      } else {
        const markerEligible = assumptions.allowed && effective.markerPolicy.categoryAllowed;
        const category = markerEligible && ageYears !== null && ageYears >= referenceProfile.gfr.minimumCategoryAgeYears
          ? window.ClcrClinicalSafety.kdigoGCategory(input.value) : null;
        const row = referenceProfile.gfr.rows.find((entry) => entry.code === category?.code);
        presentation = {
          valueVisible: assumptions.allowed && effective.markerPolicy.calculationAllowed,
          category, tone: row?.tone || "neutral",
          label: category ? (referenceProfile.gfr.resultLabels?.[category.code] || row.meaning)
            : "Ocena zależna od wieku",
          reasons: markerEligible ? [] : assumptions.blockers.map((entry) => entry.message),
        };
      }
    } else if (!presentation && formulaId === "ACR") {
      const eligible = ageYears !== null && ageYears >= 2 && spotSampleKind === "firstMorning" && spotConfounders.length === 0;
      const category = eligible ? window.ClcrClinicalSafety.kdigoACategory(input.value) : null;
      const row = referenceProfile.acr.rows.find((entry) => entry.code === category?.code);
      presentation = {
        category, tone: row?.tone || "neutral",
        label: row?.meaning || "Wskaźnik albumina/kreatynina — ocena ograniczona",
        reasons: eligible ? [] : ["Do klasyfikacji ACR potrzebny jest właściwy wiek, pierwsza poranna próbka i brak czynników przejściowych. Nie nadano kategorii A."],
      };
    } else if (!presentation && ["cg", "cg_norm", "cl24"].includes(formulaId)) {
      presentation = {
        label: formulaId === "cl24" ? "Zmierzony klirens kreatyniny" : "Oszacowany klirens kreatyniny",
        tone: "neutral", reasons: ["To klirens kreatyniny, nie eGFR.", ...(creatinineContext.status === "unknown" ? [creatinineContext.message] : [])],
      };
    }
    if (["ckid_u25", "ckid_u25_cr_cys", "sch_idms"].includes(formulaId) && populationContext.scrAssay === "jaffe_idms") {
      presentation = {
        ...presentation,
        reasons: [...(presentation?.reasons || []), "Podano metodę Jaffego kalibrowaną do IDMS. W równaniach pediatrycznych zalecane jest oznaczenie enzymatyczne; uwzględnij możliwy wpływ metody, zwłaszcza przy małych stężeniach."],
      };
    }
    if (!assumptions.allowed) {
      presentation = { ...presentation, valueVisible: false, category: null };
    }
    return presenter.render({
      ...input, formulaId, presentation: presentation || { label: input.label, tone: "neutral" },
      ageYears, ageDays: ageContext?.daysOfLife ?? null,
      markerPolicy: effective.markerPolicy, assay: effective.presentationAssay,
      calculationAssumptions: assumptions,
      creatinineStandardization: effective.creatinineStandardization,
      cystatinStandardization: effective.cystatinCStandardization,
      sampleKind: spotSampleKind, confounders: spotConfounders,
    }, referenceProfile);
  }
  let le = "";
  W &&
    (le += `<div class="result-box"><strong>Powierzchnia cia\u0142a (${clcrEscapeHtml(bsaMethod)})</strong> ${W.toFixed(2)}\u202Fm\xB2</div>`);
  function me(i, l, u = "", S) {
    if (!isFiniteNum(l)) return;
    const q = ageContext && ageContext.valid ? ageContext.group : null,
      T = q ? clRefRanges[S]?.[q] || null : null;
    let z = !0,
      m = "";
    if (T) {
      const V = T.min !== void 0 ? T.min : "",
        L = T.max !== void 0 ? T.max : "";
      ((m = ` (<span class="range">${V !== "" ? V : "\u2013"}\u2011${L !== "" ? L : "\u2013"}${u}</span>)`),
        ((T.min !== void 0 && l < T.min) || (T.max !== void 0 && l > T.max)) &&
          (z = !1));
    }
    le += `<div class="result-box${z ? "" : " out-of-range"}"><strong>${i}:</strong> ${l.toFixed(0)}${u}${m}</div>`;
  }
  let ne = null,
    normalizedCg = null;
  if (
    (o &&
      t >= 18 &&
      sexKnown &&
      creatinineContext.calculationAllowed &&
      s > 0 &&
      d > 0 &&
      ((ne = clCrCG(a, t, s, d)),
      me("Cockcroft\u2013Gault", ne, "\u202Fml/min", "cg")),
    W && ne != null)
  ) {
    normalizedCg = clCrCGNormalized(a, t, s, d, W);
    me(
      "Cockcroft\u2013Gault\xA0(1,73\u202Fm\xB2)",
      normalizedCg,
      "\u202Fml/min/1.73\u202Fm\xB2",
      "cg",
    );
  }
  const X =
    o &&
    t >= 18 &&
    sexKnown &&
    d > 0 &&
    creatinineContext.calculationAllowed
      ? eGFR_CKD_EPI_2021_cr(a, t, d)
      : null;
  const neonatalAssumptions = resolveClcrCalculationAssumptions("neonatal_egfr");
  const neonatalEffective = neonatalAssumptions.calculationContext;
  const neonatalSafety = !neonatalAssumptions.allowed
    ? { eligible: false, reason: neonatalAssumptions.blockers.map((entry) => entry.message).join(" ") }
    : typeof window.ClcrClinicalSafety?.formulaSafety === "function"
      ? window.ClcrClinicalSafety.formulaSafety(
          "neonatal_egfr",
          ageContext,
          neonatalEffective.markerPolicy,
          {
            ...populationContext,
            scrAssay: neonatalEffective.presentationAssay,
            creatinineStandardization: neonatalEffective.creatinineStandardization,
          },
        )
      : { eligible: false, reason: "Wzór jest niedostępny." };
  const ckidU25Gfr =
      o &&
      t >= 1 &&
      t < 26 &&
      sexKnown &&
      p > 0 &&
      d > 0 &&
      creatinineContext.calculationAllowed
        ? eGFR_CKiD_U25_cr(a, t, p, d)
        : null,
    neonatalGfr =
      o &&
      neonatalSafety.eligible &&
      p > 0 &&
      d > 0
        ? eGFR_neonatal_term(
            !0,
            ageContext.daysOfLife,
            p,
            d,
            s,
          )
        : null;
  const extendedEgfrInput = {
      ageYears: t,
      sex: a,
      heightValue: p,
      heightUnit: "cm",
      creatinineValue: h,
      creatinineUnit: A === "umol" ? "umol/L" : "mg/dL",
      creatinineStandardization:
        populationContext.scrAssay === "enzymatic_idms" ||
        populationContext.scrAssay === "jaffe_idms"
          ? "IDMS"
          : "",
      cystatinCValue: cystatinC,
      cystatinCUnit: "mg/L",
      cystatinCStandardization,
    },
    extendedEgfr = window.ClcrExtendedEgfr,
    computeExtendedWithAssumptions = (formulaId, method) => {
      const resolution = resolveClcrCalculationAssumptions(formulaId);
      if (!resolution.allowed || !extendedEgfr || typeof extendedEgfr[method] !== "function") return null;
      const effective = resolution.calculationContext;
      const result = extendedEgfr[method]({
        ...extendedEgfrInput,
        creatinineStandardization: effective.creatinineStandardization,
        cystatinCStandardization: effective.cystatinCStandardization,
      });
      // Pure-engine details describe its effective arguments. Attach provenance
      // explicitly so no adapter can mistake assumed standards for sample facts.
      return { ...result, calculationAssumptions: resolution };
    },
    ckdEpiCrCysResult = computeExtendedWithAssumptions("egfr_cr_cys", "computeCkdEpi2021CrCys"),
    ckidU25CysResult = computeExtendedWithAssumptions("ckid_u25_cys", "computeCkidU25Cys"),
    ckidU25CrCysResult = computeExtendedWithAssumptions("ckid_u25_cr_cys", "computeCkidU25CrCys");
  me(
    "2021 CKD\u2011EPI eGFRcr",
    X,
    "\u202FmL/min/1,73\u202Fm\xB2",
    "egfr",
  );
  let oe = null,
    ue = "";
  t >= 18 &&
    creatinineContext.categoryAllowed &&
    isFiniteNum(X) &&
    (X >= 90
      ? (oe = "G1 (\u226590)")
      : X >= 60
        ? (oe = "G2 (60\u201389)")
        : X >= 45
          ? ((oe = "G3a (45\u201359)"), (ue = ""))
          : X >= 30
            ? ((oe = "G3b (30\u201344)"),
              (ue = ""))
            : X >= 15
              ? ((oe = "G4 (15\u201329)"),
                (ue = ""))
              : ((oe = "G5 (<15)"),
                (ue = "")),
    (le += `<div class="result-box"><strong>Kategoria GFR wg KDIGO:</strong> ${oe}</div>`));
  let se = null,
    ze = "";
  if (
    (j &&
      (j < 30
        ? (se = "A1 \u2013\xA0<30\u202Fmg/g (prawid\u0142owa)")
        : j <= 300
          ? ((se = "A2 \u2013\xA030\u2011300\u202Fmg/g (umiarkowana)"),
            (ze = "warn-yellow"))
          : ((se = "A3 \u2013\xA0>300\u202Fmg/g (znaczna)"),
            (ze = "out-of-range")),
      (le += `<div class="result-box ${ze}"><strong>Albuminuria (KDIGO):</strong> ${se}</div>`)),
    oe && se)
  ) {
    const i = oe.split(" ")[0],
      l = se.split(" ")[0];
    le += `<div class="result-box"><strong>Kategorie G/A wg KDIGO:</strong> ${i}/${l}</div>`;
  }
  {
    const i = document.getElementById("formulaPicker"),
      l = i ? i.value : "";
    o &&
      t >= 0 &&
      t < 18 &&
      (l === "cg" || l === "egfr") &&
      (le +=
        '<div class="result-box warn-yellow"><strong>Uwaga:</strong> u dzieci zaleca si\u0119 stosowa\u0107 wzory Schwartza do oceny GFR.</div>');
  }
  if (
    o &&
    t >= 1 &&
    t < 17 &&
    creatinineContext.calculationAllowed
  ) {
    const { gfr: u } = clCrSchwartzIDMS(p, d);
    me(
      "Bedside Schwartz 2009 (IDMS; k\u202F=\u202F0,413)",
      u,
      "\u202FmL/min/1,73\u202Fm\xB2",
      "sch",
    );
  }
  const mt = window.currentVersion || "basic";
  (function () {
    const i = document.getElementById("formulaPicker"),
      l = (i && i.value) || "",
      u = o && t >= 18,
      selectedAssumptions = resolveClcrCalculationAssumptions(l),
      selectedSafety = ["CaCr_spot", "OxCr_spot", "CitCr_spot"].includes(l) ? { eligible: true, reason: "" } : !selectedAssumptions.allowed
        ? { eligible: false, reason: selectedAssumptions.blockers.map((entry) => entry.message).join(" ") }
        : l === "neonatal_egfr" ? neonatalSafety :
        l &&
        window.ClcrClinicalSafety &&
        typeof window.ClcrClinicalSafety.formulaSafety == "function"
          ? window.ClcrClinicalSafety.formulaSafety(
              l,
              ageContext,
              creatinineContext,
              populationContext,
            )
          : { eligible: !l || o, reason: "" };
    let S = "";
    function q(r, w, Z = "", de, Vt, Sk) {
      if (!isFiniteNum(w)) return;
      const Nt = ageContext && ageContext.valid ? ageContext.group : null,
        ae = Nt ? clRefRanges[de]?.[Nt] || null : null;
      let at = !0,
        lt = "";
      if (ae) {
        const ct = ae.min !== void 0 ? ae.min : "",
          st = ae.max !== void 0 ? ae.max : "";
        ((lt = ` (<span class="range">${ct !== "" ? ct : "\u2013"}\u2011${st !== "" ? st : "\u2013"}${Z}</span>)`),
          ((ae.min !== void 0 && w < ae.min) ||
            (ae.max !== void 0 && w > ae.max)) &&
            (at = !1));
      }
      const $t = clcrEscapeHtml(Vt || de || ""),
        Dt = clcrEscapeHtml(de || ""),
        gfrDisplay =
          [
            "egfr",
            "ckid_u25",
            "egfr_cr_cys",
            "ckid_u25_cys",
            "ckid_u25_cr_cys",
            "sch",
          ].includes(de) &&
          window.ClcrClinicalSafety &&
          typeof window.ClcrClinicalSafety.formatGfrForDisplay == "function"
            ? window.ClcrClinicalSafety.formatGfrForDisplay(w)
            : null,
        acrDisplay =
          de === "acr" &&
          window.ClcrClinicalSafety &&
          typeof window.ClcrClinicalSafety.formatAcrForDisplay == "function"
            ? window.ClcrClinicalSafety.formatAcrForDisplay(w)
            : null,
        displayValue = gfrDisplay
          ? gfrDisplay.rounded
          : acrDisplay
            ? acrDisplay.rounded
            : de === "pcr" || de === "acr_mmol" || de === "pcr_mmol"
              ? w.toFixed(1)
              : w.toFixed(0),
        calculationDetail =
          (gfrDisplay && gfrDisplay.crossesCategoryBoundary) ||
          (acrDisplay && acrDisplay.crossesCategoryBoundary)
            ? ` <span class="calculation-detail">(położenie wartości surowej względem progu: ${clcrEscapeHtml((gfrDisplay || acrDisplay).raw)})</span>`
            : "";
      const seriesAttr = Sk
        ? ` data-clcr-series="${clcrEscapeHtml(Sk)}" data-clcr-value="${w}"`
        : "";
      if (Sk) {
        const card = renderResultCard({
          formulaId: Vt || de || Sk, code: de, series: Sk,
          value: w, displayValue, unit: Z, label: r,
          calculationAgeYears: Sk === "cg_norm" ? Math.floor(t) : undefined,
          referenceContext: Sk === "cl24" ? { measuredClearance: measuredReference } : undefined,
          detailHtml: Sk === "cl24" && timedCrCl?.ok
            ? clcrMeasuredClearanceDetails(measuredInput, timedCrCl, measuredReference) + `<p>${clcrEscapeHtml(resolveClcrCalculationAssumptions("cl24").assumptionsText || "")}</p>`
            : Sk === "cg_norm"
            ? clcrCgNormalizedDetails(t, W, [
                ...(window.ClcrResultReferenceData?.PROFILE?.cgIndexed?.sources || []),
                window.ClcrResultReferenceData?.PROFILE?.cgIndexed?.limitationSource,
              ].filter(Boolean))
            : undefined,
          calculationComponents: Sk === "ckid_u25_cr_cys" && ckidU25CrCysResult?.ok ? {
            egfrCreatinine: ckidU25CrCysResult.details.egfrCreatinine,
            egfrCystatin: ckidU25CrCysResult.details.egfrCystatin,
          } : undefined,
          boundary: (acrDisplay || (o && t >= 2 ? gfrDisplay : null))?.crossesCategoryBoundary ? (gfrDisplay || acrDisplay).raw : "",
        });
        if (card !== null) { S += card; return; }
      }
      if (l === "cg" && de === "cg" && Sk === "cg") {
        const markerNote = creatinineContext.status === "unknown"
          ? '<p class="clcr-egfr-note">Nie potwierdzono stabilności kreatyniny — wynik orientacyjny.</p>'
          : "";
        S += `<div class="result-box clcr-egfr-result clcr-cg-result"
          data-clcr-formula="${$t}" data-clcr-code="${Dt}"${seriesAttr}
          data-clcr-tone="neutral"
          data-clcr-display-value="${clcrEscapeHtml(displayValue)}"
          data-clcr-display-unit="${clcrEscapeHtml(Z.trim())}"
          data-clcr-display-label="Cockcroft–Gault · masa rzeczywista"
          data-clcr-status="Oszacowany klirens kreatyniny">
          <div class="clcr-egfr-result-heading">
            <strong class="clcr-egfr-status">Oszacowany klirens kreatyniny</strong>
          </div>
          <div class="clcr-egfr-number">
            <span class="clcr-egfr-value">${displayValue}</span>
            <span class="clcr-egfr-unit">${Z.trim()}</span>
          </div>
          <div class="clcr-egfr-formula">Cockcroft–Gault · masa rzeczywista</div>
          ${markerNote}
        </div>`;
        return;
      }
      if (
        ["egfr", "ckid_u25"].includes(de) &&
        typeof window.ClcrClinicalSafety?.egfrPresentation === "function"
      ) {
        const presentation = window.ClcrClinicalSafety.egfrPresentation({
          value: w,
          age: t,
          assay: populationContext.scrAssay,
          markerPolicy: creatinineContext,
        });
        if (!presentation.valueVisible) return;
        const category = presentation.category;
        const abnormal = ["warning", "danger"].includes(presentation.tone);
        const categoryBadge = category
          ? `<span class="clcr-egfr-category">${clcrEscapeHtml(category.code)}</span>`
          : "";
        const categoryDescription = category
          ? `<p class="clcr-egfr-category-description">Kategoria GFR wg KDIGO: ${clcrEscapeHtml(category.label)}</p>`
          : "";
        const reasons = presentation.reasons.map(
          (reason) => `<p class="clcr-egfr-note">${clcrEscapeHtml(reason)}</p>`,
        ).join("");
        const pediatricNote = category && t >= 2 && t < 18 && w < 90
          ? '<p class="clcr-egfr-note">eGFR &lt;90 mL/min/1,73 m² u dziecka w wieku co najmniej 2 lat jest wartością niską i wymaga oceny w pełnym kontekście klinicznym; pojedynczy wynik nie rozpoznaje CKD.</p>'
          : "";
        const boundary = category && gfrDisplay?.crossesCategoryBoundary
          ? gfrDisplay.raw
          : "";
        S += `<div class="result-box clcr-egfr-result${abnormal ? " out-of-range" : ""}"
          data-clcr-formula="${$t}" data-clcr-code="${Dt}"${seriesAttr}
          data-clcr-tone="${presentation.tone}"
          data-clcr-display-value="${clcrEscapeHtml(displayValue)}"
          data-clcr-display-unit="${clcrEscapeHtml(Z.trim())}"
          data-clcr-display-label="${clcrEscapeHtml(r)}"
          data-clcr-status="${clcrEscapeHtml(presentation.label)}"
          data-clcr-category="${category ? category.code : ""}"
          data-clcr-boundary="${clcrEscapeHtml(boundary)}">
          <div class="clcr-egfr-result-heading">
            <strong class="clcr-egfr-status">${clcrEscapeHtml(presentation.label)}</strong>
            ${categoryBadge}
          </div>
          <div class="clcr-egfr-number">
            <span class="clcr-egfr-value">${displayValue}</span>
            <span class="clcr-egfr-unit">${Z.trim()}</span>
          </div>
          ${category ? calculationDetail : ""}
          <div class="clcr-egfr-formula">eGFR · ${clcrEscapeHtml(r)}</div>
          ${categoryDescription}${reasons}${pediatricNote}
        </div>`;
        return;
      }
      S += `<div class="result-box${at ? "" : " out-of-range"}" data-clcr-formula="${$t}" data-clcr-code="${Dt}"${seriesAttr}><strong>${r}:</strong> ${displayValue}${Z}${calculationDetail}${lt}</div>`;
    }
    function T(r = {}) {
      const gfrEntries =
          r.includeG === !1
            ? []
            : Array.isArray(r.gfrEntries)
              ? r.gfrEntries
              : [
                  {
                    value: X,
                    formulaId: "egfr",
                    label: "2021 CKD\u2011EPI",
                    requiresCreatinine: true,
                    requiresCystatin: false,
                  },
                ],
        bsaFormulaId =
          r.bsaFormulaId ||
          l ||
          (gfrEntries[0] && gfrEntries[0].formulaId) ||
          "",
        validGEntries = gfrEntries.filter((entry) => {
          if (!entry || !isFiniteNum(entry.value) || t < 2) return false;
          const resolution = resolveClcrCalculationAssumptions(entry.formulaId);
          return resolution.allowed && resolution.calculationContext.markerPolicy.categoryAllowed;
        }),
        hasG = validGEntries.length > 0,
        hasA =
          r.includeA !== !1 &&
          u &&
          isFiniteNum(j) &&
          t >= 2 &&
          spotSampleKind === "firstMorning" &&
          spotConfounders.length === 0;
      if (r.includeBsa !== !1 && W) {
        const bsaMarkup = `<div class="result-box"${bsaFormulaId ? ` data-clcr-formula="${clcrEscapeHtml(bsaFormulaId)}"` : ""}><strong>Powierzchnia cia\u0142a (${clcrEscapeHtml(bsaMethod)})</strong> ${W.toFixed(2)}\u202Fm\xB2</div>`;
        if (["egfr", "ckid_u25"].includes(l)) {
          S += `<details class="clcr-egfr-result-details" data-clcr-formula="${clcrEscapeHtml(bsaFormulaId)}"><summary>Powierzchnia ciała — szczegóły</summary>${bsaMarkup}</details>`;
        } else S = bsaMarkup + S;
      }
      validGEntries.forEach((entry) => {
        // The average already carries its G category and full table in one card.
        if (entry.formulaId === "ckid_u25_cr_cys") return;
        if (
          ["egfr", "ckid_u25"].includes(entry.formulaId) &&
          typeof window.ClcrClinicalSafety?.egfrPresentation === "function"
        ) return;
        const w =
          window.ClcrClinicalSafety &&
          typeof window.ClcrClinicalSafety.kdigoGCategory == "function"
            ? window.ClcrClinicalSafety.kdigoGCategory(entry.value)
            : null;
        if (!w) return;
        const formulaId = clcrEscapeHtml(entry.formulaId || "egfr"),
          sourceLabel = entry.label
            ? ` (${clcrEscapeHtml(entry.label)})`
            : "";
        S += `<div class="result-box" data-clcr-formula="${formulaId}"><strong>Kategoria GFR wg KDIGO${sourceLabel}:</strong> ${w.label}</div>`;
      });
      if (t >= 2 && t < 18) {
        const warnedFormulaIds = new Set();
        validGEntries
          .filter((entry) => entry.formulaId !== "ckid_u25_cr_cys" && entry.value < 90 && !(
            ["egfr", "ckid_u25"].includes(entry.formulaId) &&
            typeof window.ClcrClinicalSafety?.egfrPresentation === "function"
          ))
          .forEach((entry) => {
            const formulaId = entry.formulaId || "ckid_u25";
            if (warnedFormulaIds.has(formulaId)) return;
            warnedFormulaIds.add(formulaId);
            S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(formulaId)}"><strong>Ocena pediatryczna:</strong> eGFR &lt;90 mL/min/1,73 m² u dziecka w wieku co najmniej 2 lat jest wartością niską i wymaga oceny w pełnym kontekście klinicznym; pojedynczy wynik nie rozpoznaje CKD.</div>`;
          });
      }
      if (hasA) {
        const w =
          window.ClcrClinicalSafety &&
          typeof window.ClcrClinicalSafety.kdigoACategory == "function"
            ? window.ClcrClinicalSafety.kdigoACategory(j)
            : null;
        w &&
          (S += `<div class="result-box" data-clcr-formula="ACR"><strong>Kategoria albuminurii wg KDIGO:</strong> ${w.label}</div>`);
      }
      if (hasG || hasA) {
        const w = hasG
          ? clcrEscapeHtml(validGEntries[0].formulaId || "egfr")
          : "ACR";
        if (w !== "ckid_u25_cr_cys") S += `<div class="result-box" data-clcr-formula="${w}"><strong>Uwaga:</strong> pojedynczy wynik eGFR/ACR nie rozpoznaje przewlekłej choroby nerek; należy ocenić przewlekłość, przyczynę i inne markery uszkodzenia nerek.</div>`;
      }
    }
    function z() {
      W &&
        (S =
          `<div class="result-box"><strong>Powierzchnia cia\u0142a (${clcrEscapeHtml(bsaMethod)})</strong> ${W.toFixed(2)}\u202Fm\xB2</div>` +
          S);
    }
    let cgContextRendered = !1;
    function appendCgContext() {
      // The indexed result supplies its own concise, correctly owned Details.
      if (l === "cg_norm") return;
      if (cgContextRendered) return;
      cgContextRendered = !0;
      if (l === "cg") {
        S += '<details class="clcr-egfr-result-details clcr-cg-limitations" data-clcr-formula="cg"><summary>Ograniczenia i źródła</summary><p>Użyto rzeczywistej masy ciała. Otyłość, niedowaga, obrzęki lub nietypowa masa mięśniowa mogą zmniejszać wiarygodność oszacowania. Wzór opracowano przed standaryzacją oznaczeń kreatyniny.</p><p><a href="https://doi.org/10.1159/000180580" target="_blank" rel="noopener noreferrer">Cockcroft i Gault, 1976</a> · <a href="https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf#page=134" target="_blank" rel="noopener noreferrer">KDIGO 2024, §4.2, S249</a></p></details>';
        return;
      }
      S +=
        '<div class="result-box warn-yellow" data-clcr-formula="cg"><strong>Założenie Cockcrofta–Gaulta:</strong> użyto podanej rzeczywistej masy ciała. W otyłości, niedowadze, obrzękach lub przy nietypowej masie mięśniowej potrzebna jest jawna polityka masy. To eCrCl, nie eGFR; dawkowanie należy sprawdzić w informacji o konkretnym leku i jego badanej populacji.</div>';
    }
    const m = {};
    ((m.egfr = isFiniteNum(X) ? X : null),
      (m.ckid_u25 = isFiniteNum(ckidU25Gfr) ? ckidU25Gfr : null),
      (m.egfr_cr_cys =
        ckdEpiCrCysResult && ckdEpiCrCysResult.ok
          ? ckdEpiCrCysResult.value
          : null),
      (m.ckid_u25_cys =
        ckidU25CysResult && ckidU25CysResult.ok
          ? ckidU25CysResult.value
          : null),
      (m.ckid_u25_cr_cys =
        ckidU25CrCysResult && ckidU25CrCysResult.ok
          ? ckidU25CrCysResult.value
          : null),
      (m.neonatal_egfr = isFiniteNum(neonatalGfr) ? neonatalGfr : null),
      (m.cg = u && s > 0 && isFiniteNum(ne) ? ne : null),
      (m.cg_norm =
        u && W && s > 0 && isFiniteNum(normalizedCg) ? normalizedCg : null));
    const V =
      timedCrCl &&
      timedCrCl.ok &&
      creatinineContext.calculationAllowed
        ? timedCrCl
        : null;
    if (
      ((m.cl24 = V), (m.sch_var = null), (m.sch_idms = null), p > 0 && d > 0)
    ) {
      if (
        o &&
        t >= 1 &&
        t < 17 &&
        creatinineContext.calculationAllowed
      ) {
        const r = clCrSchwartzIDMS(p, d);
        r && isFiniteNum(r.gfr) && (m.sch_idms = r);
      }
    }
    function appendExtendedEgfrFailure(formulaId, result) {
      if (l !== formulaId || !result || result.ok) return;
      S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(formulaId)}"><strong>Nie obliczono:</strong> ${clcrEscapeHtml(result.error || "Uzupełnij wymagane dane i metadane oznaczeń.")}</div>`;
    }
    function appendExtendedEgfrWarnings(formulaId, result) {
      if (!result || !result.ok) return;
      // The average profile is visible next to its result, without a duplicate warning.
      (formulaId === "ckid_u25_cr_cys" ? [] : result.warnings || []).forEach((warning) => {
        S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(formulaId)}"><strong>Profil równania:</strong> ${clcrEscapeHtml(warning)}</div>`;
      });
      if (
        formulaId.startsWith("ckid_u25") &&
        cystatinCAssayMethod !== "nephelometric" &&
        (formulaId !== "ckid_u25_cr_cys" || ["immunoturbidimetric", "other"].includes(cystatinCAssayMethod))
      ) {
        const methodLabel =
          cystatinCAssayMethod === "immunoturbidimetric"
            ? "metodę immunoturbidymetryczną"
            : cystatinCAssayMethod === "other"
              ? "inną metodę"
              : "nie określono metody";
        S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(formulaId)}"><strong>Metoda cystatyny C:</strong> ${clcrEscapeHtml(methodLabel)}. NIDDK opisuje dla CKiD U25 oznaczenie nefelometryczne; uwzględnij możliwe ograniczenie porównywalności.</div>`;
      }
    }
    function L(r) {
      if (!resolveClcrCalculationAssumptions(r).allowed) return;
      switch (r) {
        case "egfr":
          m.egfr != null &&
            q(
              "2021 CKD\u2011EPI eGFRcr",
              m.egfr,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "egfr",
              r,
              "egfr",
            );
          break;
        case "egfr_cr_cys":
          if (m.egfr_cr_cys != null) {
            q(
              "2021 CKD\u2011EPI eGFRcr\u2011cys",
              m.egfr_cr_cys,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "egfr_cr_cys",
              r,
              "egfr_cr_cys",
            );
            appendExtendedEgfrWarnings(r, ckdEpiCrCysResult);
          } else appendExtendedEgfrFailure(r, ckdEpiCrCysResult);
          break;
        case "ckid_u25_cys":
          if (m.ckid_u25_cys != null) {
            q(
              "CKiD U25 eGFRcys",
              m.ckid_u25_cys,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "ckid_u25_cys",
              r,
              "ckid_u25_cys",
            );
            appendExtendedEgfrWarnings(r, ckidU25CysResult);
          } else appendExtendedEgfrFailure(r, ckidU25CysResult);
          break;
        case "ckid_u25_cr_cys":
          if (m.ckid_u25_cr_cys != null) {
            q(
              "CKiD U25 eGFRcr\u2011cys (średnia)",
              m.ckid_u25_cr_cys,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "ckid_u25_cr_cys",
              r,
              "ckid_u25_cr_cys",
            );
            appendExtendedEgfrWarnings(r, ckidU25CrCysResult);
          } else appendExtendedEgfrFailure(r, ckidU25CrCysResult);
          break;
        case "ckid_u25":
          if (m.ckid_u25 != null) {
            q(
              "CKiD U25 eGFRcr (2021)",
              m.ckid_u25,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "ckid_u25",
              r,
              "ckid_u25",
            );
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="ckid_u25"><strong>Profil CKiD U25:</strong> równanie opracowano głównie u dzieci i młodych osób z łagodną lub umiarkowaną CKD. Przy wyższych wartościach GFR niepewność oszacowania wymaga uwzględnienia trendu i pełnego kontekstu klinicznego.</div>';
          }
          if (m.ckid_u25 != null && t >= 18 && t < 26) {
            S +=
              '<div class="result-box" data-clcr-formula="ckid_u25"><strong>Wiek 18–25 lat:</strong> zgodnie z NIDDK wynik CKiD U25 należy oceniać razem z wynikiem kalkulatora dla dorosłych (2021 CKD‑EPI).</div>';
          }
          break;
        case "neonatal_egfr":
          m.neonatal_egfr != null &&
            q(
              window.ClcrResultReferenceData?.PROFILE?.neonatal?.resultLabel || "Szacowany eGFR",
              m.neonatal_egfr,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "neonatal_egfr",
              r,
              "neonatal_egfr",
            );
          break;
        case "cg":
          if (m.cg != null) {
            q(
              "eCrCl Cockcroft\u2013Gault (masa rzeczywista)",
              m.cg,
              "\u202FmL/min",
              "cg",
              r,
              "cg",
            );
            appendCgContext();
          }
          break;
        case "cg_norm":
          if (m.cg_norm != null) {
            q(
              "eCrCl Cockcroft\u2013Gault (1,73\u202Fm\xB2; masa rzeczywista)",
              m.cg_norm,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "cg",
              r,
              "cg_norm",
            );
            appendCgContext();
          }
          break;
        case "cl24":
          if (m.cl24 != null) {
            q(
              "Klirens kreatyniny",
              m.cl24.absoluteMlMin,
              "\u202FmL/min",
              "cl24",
              r,
              "cl24",
            );
          } else if (l === "cl24" && timedCrCl && !timedCrCl.ok) {
            S += `<div class="result-box warn-yellow" data-clcr-formula="cl24"><strong>Nie obliczono:</strong> ${clcrEscapeHtml(timedCrCl.error)}</div>`;
          }
          break;
        case "sch_var":
          S +=
            '<div class="result-box warn-yellow" data-clcr-formula="sch_var"><strong>Nie obliczono:</strong> Legacy Schwartz został wyłączony z rutynowego użycia.</div>';
          break;
        case "sch_idms":
          if (m.sch_idms != null) {
            q(
              "Bedside Schwartz 2009 (IDMS; k\u202F=\u202F0,413)",
              m.sch_idms.gfr,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "sch",
              r,
              "sch_idms",
            );
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="sch_idms"><strong>Profil walidacyjny:</strong> równanie opracowano u dzieci z CKD w wieku 1–16 lat, z mierzonym GFR około 15–75 mL/min/1,73 m² i kreatyniną oznaczaną metodą zgodną z IDMS. CKiD U25 pozostaje preferowaną współczesną ścieżką kreatyninową.</div>';
          }
          break;
        case "ACR":
          if (acrEvaluation.valid && window.ClcrAcrUi) S += window.ClcrAcrUi.renderResult(acrEvaluation);
          break;
        case "PCR":
          if (pcrEvaluation.valid && window.ClcrPcrUi) S += window.ClcrPcrUi.renderResult(pcrEvaluation);
          break;
      }
    }
    if (l) {
      if (!selectedSafety.eligible) {
        const r = clcrEscapeHtml(selectedSafety.reason || "Wzór jest niedostępny.");
        S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(l)}"><strong>Nie obliczono:</strong> ${r}</div>`;
      } else {
        L(l);
      }
      if (
        [
          "egfr",
          "ckid_u25",
          "egfr_cr_cys",
          "ckid_u25_cys",
          "ckid_u25_cr_cys",
        ].includes(l) &&
        selectedSafety.eligible
      ) {
        const transitionAge = t >= 18 && t < 26,
          formulaMeta = {
            egfr: {
              value: m.egfr,
              label: "2021 CKD\u2011EPI eGFRcr",
              requiresCreatinine: true,
              requiresCystatin: false,
            },
            egfr_cr_cys: {
              value: m.egfr_cr_cys,
              label: "2021 CKD\u2011EPI eGFRcr\u2011cys",
              requiresCreatinine: true,
              requiresCystatin: true,
            },
            ckid_u25: {
              value: m.ckid_u25,
              label: "CKiD U25 eGFRcr",
              requiresCreatinine: true,
              requiresCystatin: false,
            },
            ckid_u25_cys: {
              value: m.ckid_u25_cys,
              label: "CKiD U25 eGFRcys",
              requiresCreatinine: false,
              requiresCystatin: true,
            },
            ckid_u25_cr_cys: {
              value: m.ckid_u25_cr_cys,
              label: "CKiD U25 eGFRcr\u2011cys",
              requiresCreatinine: true,
              requiresCystatin: true,
            },
          },
          transitionPartner = {
            egfr: "ckid_u25",
            egfr_cr_cys: "ckid_u25_cr_cys",
            ckid_u25: "egfr",
            ckid_u25_cys: null,
            ckid_u25_cr_cys: "egfr_cr_cys",
          }[l];
        if (transitionAge && l === "ckid_u25_cys") {
          S +=
            '<div class="result-box warn-yellow" data-clcr-formula="ckid_u25_cys"><strong>Porównanie w wieku 18–25 lat:</strong> kalkulator nie implementuje dorosłego równania opartego wyłącznie na cystatynie C. Nie porównano CKiD U25 eGFRcys z równaniem łączonym eGFRcr‑cys, ponieważ używają różnych zestawów markerów.</div>';
        }
        if (transitionAge) {
          if (transitionPartner) {
            const selectedMarkup = S;
            S = "";
            L(transitionPartner);
            const comparisonMarkup = S;
            S = selectedMarkup + (comparisonMarkup ? `<div data-clcr-comparison-for="${clcrEscapeHtml(l)}">${comparisonMarkup}</div>` : "");
          }
          if (
            transitionPartner &&
            !isFiniteNum(formulaMeta[transitionPartner]?.value)
          ) {
            S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(l)}"><strong>Porównanie w wieku 18\u201125 lat niekompletne:</strong> NIDDK zaleca ocenę wyniku U25 razem z odpowiednim kalkulatorem dla dorosłych; uzupełnij wymagane markery, wzrost i metadane oznaczeń.</div>`;
          }
        }
        const selectedEntry = {
            value: formulaMeta[l]?.value,
            formulaId: l,
            label: formulaMeta[l]?.label,
            requiresCreatinine: formulaMeta[l]?.requiresCreatinine,
            requiresCystatin: formulaMeta[l]?.requiresCystatin,
          },
          partnerEntry =
            transitionAge && transitionPartner
              ? {
                  value: formulaMeta[transitionPartner]?.value,
                  formulaId: transitionPartner,
                  label: formulaMeta[transitionPartner]?.label,
                  requiresCreatinine:
                    formulaMeta[transitionPartner]?.requiresCreatinine,
                  requiresCystatin:
                    formulaMeta[transitionPartner]?.requiresCystatin,
                }
              : null;
        T({
          includeG: !0,
          includeA: !1,
          includeBsa: l !== "ckid_u25_cr_cys",
          gfrEntries: partnerEntry
            ? [selectedEntry, partnerEntry]
            : [selectedEntry],
        });
      }
      else if (l === "neonatal_egfr" && selectedSafety.eligible)
        T({ includeG: !1, includeA: !1, includeBsa: !1 });
      else if (l === "ACR") {
        // Its single result already contains the category and source context.
      } else if (l === "PCR") {
        // PCR owns its one result, applicable limits and specimen qualification.
      } else if (["CaCr_spot", "OxCr_spot", "CitCr_spot"].includes(l)) {
        // Its Mayo card below owns the number, two-sided norm and limitations.
      }
      else if (l !== "cg_norm") z();
    } else {
      if (!o) {
        S +=
          '<div class="result-box warn-yellow"><strong>Wiek:</strong> podaj pełne lata i miesiące; u pacjenta w wieku 0 lat pole miesięcy jest wymagane.</div>';
      } else if (!creatinineContext.calculationAllowed) {
        S += `<div class="result-box warn-yellow"><strong>Nie obliczono eGFR/eCrCl:</strong> ${clcrEscapeHtml(creatinineContext.message)}</div>`;
      } else {
        L("neonatal_egfr");
        L("ckid_u25");
        if (cystatinC !== null) {
          t < 26 && (L("ckid_u25_cr_cys"), L("ckid_u25_cys"));
          t >= 18 && L("egfr_cr_cys");
        }
        L("egfr");
        L("cg");
        L("cg_norm");
        L("cl24");
        L("ACR");
        L("PCR");
        if (ageContext.totalMonths === 0 && ageContext.daysOfLife === null) {
          S +=
            '<div class="result-box warn-yellow" data-clcr-formula="neonatal_egfr"><strong>Wiek noworodkowy:</strong> podaj ukończone dni życia (0–28) i potwierdź urodzenie o czasie, aby ocenić dostępność wzoru.</div>';
        } else if (
          ageContext.totalMonths === 0 &&
          ageContext.daysOfLife !== null &&
          !neonatalSafety.eligible
        ) {
          const r = neonatalSafety;
          S += `<div class="result-box warn-yellow" data-clcr-formula="neonatal_egfr"><strong>Nie obliczono eGFR noworodka:</strong> ${clcrEscapeHtml(r && r.reason ? r.reason : "nie potwierdzono populacji wzoru.")}</div>`;
        } else if (t < 1 && ageContext.totalMonths > 0) {
          S +=
            '<div class="result-box warn-yellow"><strong>Brak właściwego wzoru:</strong> kalkulator nie raportuje eGFR u niemowląt po 28. dniu życia i przed ukończeniem 1. roku, ponieważ nie wdrożono zwalidowanego równania dla tej populacji.</div>';
        }
      }
      const automaticGfrEntries = [],
        automaticCreatinineEligible = [
          "enzymatic_idms",
          "jaffe_idms",
        ].includes(resolveClcrCalculationAssumptions("egfr").calculationContext.presentationAssay) ||
          resolveClcrCalculationAssumptions("egfr").calculationContext.creatinineStandardization === "IDMS",
        automaticCystatinEligible =
          resolveClcrCalculationAssumptions("ckid_u25_cys").calculationContext.cystatinCStandardization === "ERM-DA471/IFCC";
      if (o && t < 26) {
        const pediatricAutomatic = [
          {
              value: m.ckid_u25_cr_cys,
              formulaId: "ckid_u25_cr_cys",
              label: "CKiD U25 eGFRcr\u2011cys",
              requiresCreatinine: true,
              requiresCystatin: true,
              markerEligible:
                automaticCreatinineEligible &&
                automaticCystatinEligible,
            },
          {
            value: m.ckid_u25,
            formulaId: "ckid_u25",
            label: "CKiD U25 eGFRcr",
            requiresCreatinine: true,
            requiresCystatin: false,
            markerEligible: automaticCreatinineEligible,
          },
          {
            value: m.ckid_u25_cys,
            formulaId: "ckid_u25_cys",
            label: "CKiD U25 eGFRcys",
            requiresCreatinine: false,
            requiresCystatin: true,
            markerEligible: automaticCystatinEligible,
          },
        ].find(
          (entry) => entry.markerEligible && isFiniteNum(entry.value),
        );
        pediatricAutomatic &&
          automaticGfrEntries.push(pediatricAutomatic);
      }
      if (o && t >= 18) {
        const adultAutomatic = [
          {
              value: m.egfr_cr_cys,
              formulaId: "egfr_cr_cys",
              label: "2021 CKD\u2011EPI eGFRcr\u2011cys",
              requiresCreatinine: true,
              requiresCystatin: true,
              markerEligible: resolveClcrCalculationAssumptions("egfr_cr_cys").allowed,
            },
          {
            value: m.egfr,
            formulaId: "egfr",
            label: "2021 CKD\u2011EPI eGFRcr",
            requiresCreatinine: true,
            requiresCystatin: false,
            markerEligible: automaticCreatinineEligible,
          },
        ].find(
          (entry) => entry.markerEligible && isFiniteNum(entry.value),
        );
        adultAutomatic && automaticGfrEntries.push(adultAutomatic);
      }
      T({
        includeG: automaticGfrEntries.length > 0,
        includeA: !0,
        gfrEntries: automaticGfrEntries,
      });
    }
    le = packClcrSupplementaryMarkup(S, l);
  })();
  const $e = document.getElementById("formulaPicker"),
    _e = ($e && $e.value) || "",
    Ee = [
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
      "ACR",
      "PCR",
    ];
  if ((le || "").trim() || rt || (mt === "spot" && se)) {
    const i = document.getElementById("samePatientMode"),
      l = $("clcrInfo"),
      u = $("results");
    ((i && i.checked && _e && Ee.indexOf(_e) === -1) ||
      clcrSetTrustedMarkup(l, le, "clcr result html"),
      u && (u.style.display = "grid"),
      window.clcrSamePatientAggregator &&
        typeof window.clcrSamePatientAggregator.afterClcrRender == "function" &&
        window.clcrSamePatientAggregator.afterClcrRender({
          formulaId: _e,
          clFormulaIds: Ee,
          clcrInfoEl: l,
          resultsEl: u,
        }));
  } else {
    const i = $("clcrInfo"),
      l = $("results");
    (clcrClearElement(i),
      l && (l.style.display = "none"),
      window.clcrSamePatientAggregator &&
        typeof window.clcrSamePatientAggregator.afterClcrRender == "function" &&
        window.clcrSamePatientAggregator.afterClcrRender({
          formulaId: _e,
          clFormulaIds: Ee,
          clcrInfoEl: i,
          resultsEl: l,
        }));
  }
  const Y = +$("Ucr").value,
    ie = s,
    De = +$("U_UA").value,
    Gt = +$("S_UA").value,
    Ke = +$("U_Ca").value,
    Me = +$("U_Mg").value,
    fe = +$("U_PO4").value;
  const ke = readClcrOptionalNumber("U_Na"),
    He = readClcrOptionalNumber("S_Na"),
    xe = readClcrOptionalNumber("U_K"),
    qe = readClcrOptionalNumber("U_Cl"),
    Je = readClcrOptionalNumber("S_Cl"),
    Xe = readClcrOptionalNumber("S_HCO3"),
    Ce = +$("U_Prot").value,
    Ie = +$("S_Ca").value,
    Ze = document.getElementById("S_Ca_unit"),
    Re = Ze ? Ze.value : "mg/dl";
  let Qe = null;
  Ie && Re && Re !== "" && (Qe = Re === "mmol/L" ? Ie * 4 : Ie);
  const Ht = Qe,
    ye = readClcrOptionalNumber("U_pH"),
    ft = +$("Ox_Cr_spot").value,
    pt = +$("Cit_Cr_spot").value,
    Wt = readClcrOptionalNumber("S_PTH"),
    qt = readClcrOptionalNumber("S_VitD"),
    gt = +$("U_Ox").value,
    Fe = +$("U_Cit").value,
    Ye = +$("U_Cys").value,
    we = readClcrOptionalNumber("pH24"),
    pe = Ke ? Ke * 4 : null,
    Ue = Me ? Me / 10 : null,
    je = excr_mgkg(gt, collectionDailyVolume, ie),
    Be = excr_mgkg(Fe, collectionDailyVolume, ie),
    oxalateMg24 =
      gt && collectionDailyVolume
        ? (gt * collectionDailyVolume) / 100
        : null,
    citrateMg24 =
      Fe && collectionDailyVolume
        ? (Fe * collectionDailyVolume) / 100
        : null,
    cystineDzm =
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.computeCystineDzm == "function"
        ? window.ClcrClinicalSafety.computeCystineDzm({
            concentrationMgDl:
              $("U_Cys") && String($("U_Cys").value || "").trim() !== ""
                ? Ye
                : null,
            volumeMl:
              collectionDailyVolume > 0 ? collectionDailyVolume : null,
          })
        : Ye >= 0 && collectionDailyVolume > 0
          ? {
              concentrationMgL: Ye * 10,
              totalMg24h: (Ye * collectionDailyVolume) / 100,
              totalMmol24h:
                (Ye * collectionDailyVolume) / 100 / 240.3,
            }
          : null,
    cystineMg24 = cystineDzm ? cystineDzm.totalMg24h : null,
    cystineMmol24 = cystineDzm ? cystineDzm.totalMmol24h : null,
    yt = pe && Fe ? pe / Fe : null,
    wt = ratio(ft, c),
    ht = ratio(pt, c),
    kt = excr_mgkg(De, collectionDailyVolume, ie),
    Te = excr_mgkg(pe, collectionDailyVolume, ie),
    xt = excr_mgkg(Ue, collectionDailyVolume, ie),
    phosphorusDzm =
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.computePhosphorusDzm == "function"
        ? window.ClcrClinicalSafety.computePhosphorusDzm({
            concentrationMgDl:
              $("U_PO4") && String($("U_PO4").value || "").trim() !== ""
                ? fe
                : null,
            volumeMl:
              collectionDailyVolume > 0 ? collectionDailyVolume : null,
          })
        : fe >= 0 && collectionDailyVolume > 0
          ? {
              totalMg24h: (fe * collectionDailyVolume) / 100,
              totalMmol24h:
                (fe * collectionDailyVolume) / 100 / 30.9738,
            }
          : null,
    Ct = phosphorusDzm ? phosphorusDzm.totalMg24h : null,
    PiMmol24 = phosphorusDzm ? phosphorusDzm.totalMmol24h : null,
    proteinDzm =
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.computeProteinDzm == "function"
        ? window.ClcrClinicalSafety.computeProteinDzm({
            totalMg24h:
              $("U_Prot") &&
              String($("U_Prot").value || "").trim() !== "" &&
              collectionDurationMinutes &&
              urineCollectionProtocolComplete
                ? Ce * (1440 / collectionDurationMinutes)
                : null,
            bsaM2: W,
          })
        : Ce >= 0 &&
            collectionDurationMinutes &&
            urineCollectionProtocolComplete
          ? {
              totalMg24h: Ce * (1440 / collectionDurationMinutes),
              totalG24h:
                (Ce * (1440 / collectionDurationMinutes)) / 1000,
              mgM2Per24h:
                W > 0
                  ? (Ce * (1440 / collectionDurationMinutes)) / W
                  : null,
            }
          : null,
    vt = proteinDzm ? proteinDzm.totalMg24h : null,
    proteinG24 = proteinDzm ? proteinDzm.totalG24h : null,
    proteinPerBsa = proteinDzm ? proteinDzm.mgM2Per24h : null,
    uricAcidMg24 =
      De && collectionDailyVolume
        ? (De * collectionDailyVolume) / 100
        : null,
    calciumMmol24 =
      Ke && collectionDailyVolume
        ? (Ke * collectionDailyVolume) / 1e3
        : null,
    magnesiumMg24 =
      Me && collectionDailyVolume
        ? (Me * collectionDailyVolume) / 1e3
        : null,
    bt = excr_mmol_d(ke, collectionDailyVolume),
    zt = excr_mmol_d(xe, collectionDailyVolume),
    Et = ratio(De, Y),
    St = ratio(pe, Y),
    Pt = Ue && pe ? Ue / pe : null,
    It = ratio(fe, Y),
    Rt = Ce && Y && R ? Ce / ((Y * R) / 100) : null,
    Ft = K_frac(xe, ke),
    Tt = AG_serum(He, Je, Xe);
  const tmpGfrRequested =
      _e === "TMP_GFR" ||
      [
        "U_PO4_spot",
        "S_PO4_spot",
        "Scr_spot",
      ].some((id) => {
        const element = $(id);
        return element && String(element.value || "").trim() !== "";
      }),
    tmpGfrSafety =
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.formulaSafety == "function"
        ? window.ClcrClinicalSafety.formulaSafety(
            "TMP_GFR",
            ageContext,
            creatinineContext,
            populationContext,
          )
        : { eligible: o && creatinineContext.calculationAllowed, reason: "" },
    tmpGfrResult =
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.computeTmpGfr == "function"
        ? window.ClcrClinicalSafety.computeTmpGfr({
            ageYears: t,
            sampleKind: spotSampleKind,
            pairedSameTime: !!$("tmpPairedSameTime")?.checked,
            overnightFasting: !!$("tmpOvernightFasting")?.checked,
            serumPhosphate: k,
            serumPhosphateUnit: U,
            urinePhosphate: O,
            urinePhosphateUnit: te,
            serumCreatinine: P,
            serumCreatinineUnit: I,
            urineCreatinine: N,
            urineCreatinineUnit: _,
          })
        : null;
  let ve = "";
  function y(i, l, u = "", S, Sk) {
    if (!isFiniteNum(l)) return;
    const q = i.replace(/\u00A0/g, " "),
      T = ageContext && ageContext.valid ? ageContext.group : null,
      z = T ? refRanges[S]?.[T] || null : null;
    let m = !0,
      V = "";
    if (z) {
      const L = z.min !== void 0 ? z.min : "",
        r = z.max !== void 0 ? z.max : "";
      ((V = ` (<span class="range">${L !== "" ? L : "\u2013"}\u2011${r !== "" ? r : "\u2013"}${u}</span>)`),
        ((z.min !== void 0 && l < z.min) || (z.max !== void 0 && l > z.max)) &&
          (m = !1));
    }
    const L = u === "mg/mg" ? 3 : 1;
    const Sa = Sk
      ? ` data-clcr-series="${clcrEscapeHtml(Sk)}" data-clcr-value="${l}"`
      : "";
    if (Sk) {
      const formulaId = ["Prot_mg24", "Prot_g24", "Prot_bsa"].includes(Sk) ? "Prot_mgkg" : (S || Sk);
      const card = renderResultCard({ formulaId, code: S || Sk, series: Sk, value: l, displayValue: l.toFixed(L), unit: u, label: q });
      if (card !== null) { ve += card; return; }
    }
    ve += `<div class="result-box${m ? "" : " out-of-range"}"${Sa}><strong>${q}:</strong> ${l.toFixed(L)} ${u}${V}</div>`;
  }
  (y("Wydalanie kwasu moczowego", kt, "mg/kg/24 h", "UA_mgkg", "UA_mgkg"),
    y("Wydalanie wapnia", Te, "mg/kg/24 h", "Ca_mgkg", "Ca_mgkg"),
    y("Wydalanie magnezu", xt, "mg/kg/24 h", "Mg_mgkg", "Mg_mgkg"),
    y(
      "Wydalanie fosforu nieorganicznego (P\u1D62)",
      Ct,
      "mg P/24 h",
      "PO4_mgkg", "PO4_mgkg",
    ),
    y("Wydalanie szczawianów", je, "mg/kg/24 h", "Ox_mgkg", "Ox_mgkg"),
    y("Wydalanie cytrynianów", Be, "mg/kg/24 h", "Cit_mgkg", "Cit_mgkg"),
    y("Kwas moczowy/kreatynina", Et, "mg/mg", "KM_Cr", "KM_Cr"),
    y("Wapń/kreatynina", St, "mg/mg", "Ca_Cr", "Ca_Cr"),
    y("Magnez/wapń", Pt, "mg/mg", "Mg_Ca", "Mg_Ca"),
    y("Fosfor nieorganiczny/kreatynina", It, "mg/mg", "PO4_Cr", "PO4_Cr"),
    y("Wapń/cytryniany", yt, "mg/mg", "Ca_Cit", "Ca_Cit"),
    y("Wydalanie\xA0sodu\xA0(Na)", bt, "mmol/24 h", undefined, "Na_mmol_d"),
    y("Wydalanie\xA0potasu\xA0(K)", zt, "mmol/24 h", undefined, "K_mmol_d"),
    y(
      "Stosunek\xA0potasu\xA0do\xA0sumy\xA0potasu\xA0i\xA0sodu\xA0(K/(K+Na))",
      Ft,
      "%",
      "K_frac", "K_frac",
    ),
    y(
      "Luka anionowa surowicy (bez K; nieskorygowana o albuminę)",
      Tt,
      "mmol/L", undefined, "AGs",
    ),
    y("Bia\u0142ko całkowite w DZM", vt, "mg/24 h", undefined, "Prot_mg24"),
    y("Bia\u0142ko całkowite w DZM", proteinG24, "g/24 h", undefined, "Prot_g24"),
    o &&
      t < 18 &&
      y("Białko całkowite znormalizowane do BSA", proteinPerBsa, "mg/m\xB2/24 h", undefined, "Prot_bsa"),
    y("Białko/kreatynina w DZM", Rt, "mg/mg", undefined, "B_Cr"));
  const spotFeFormulaIds = new Set([
      "FENa_spot",
      "FEK_spot",
      "FECl_spot",
      "FEHCO3_spot",
      "AGu_spot",
    ]),
    spotChemistryRequested =
      spotFeFormulaIds.has(_e) ||
      spotPairedChemistry ||
      [
        spotUrineSodium,
        spotSerumSodium,
        spotUrinePotassium,
        spotSerumPotassium,
        spotUrineChloride,
        spotSerumChloride,
        spotUrineBicarbonate,
        spotSerumBicarbonate,
      ].some((value) => value !== null);
  let renderedSpotFractionalExcretion = !1;
  if (window.ClcrFenaUi && (fenaEvaluation.valid || _e === "FENa_spot")) {
    ve += window.ClcrFenaUi.renderResult(fenaEvaluation);
  }
  if (window.ClcrFekUi && (fekEvaluation.valid || _e === "FEK_spot")) {
    ve += window.ClcrFekUi.renderResult(fekEvaluation);
  } else if (_e === "FEK_spot") {
    ve += '<div class="fek-result-error" data-clcr-formula="FEK_spot"><strong>Nie można wyświetlić FEK</strong><p>Odśwież aplikację, aby wczytać moduł wyniku FEK.</p></div>';
  }
  [
    ["FECl", spotFeCl, "FECl_spot"],
    ["FEHCO\u2083", spotFeHco3, "FEHCO3_spot"],
  ].forEach(([label, result, seriesKey]) => {
    if (!result || !result.ok) return;
    renderedSpotFractionalExcretion = !0;
    y(
      `${label} (sparowana próbka punktowa)`,
      result.valuePct,
      "%",
      undefined,
      seriesKey,
    );
  });
  if (isFiniteNum(spotUag)) {
    y(
      "Luka anionowa moczu (UAG; próbka punktowa)",
      spotUag,
      "mmol/L",
      undefined,
      "AGu_spot",
    );
  }
  const selectedFeResult = {
      FENa_spot: spotFeNa,
      FEK_spot: spotFeK,
      FECl_spot: spotFeCl,
      FEHCO3_spot: spotFeHco3,
    }[_e],
    selectedSpotChemistryMissing =
      (selectedFeResult && !selectedFeResult.ok) ||
      (_e === "AGu_spot" && !isFiniteNum(spotUag)),
    selectedSpotChemistryLabel =
      {
        FENa_spot: "FENa",
        FEK_spot: "FEK",
        FECl_spot: "FECl",
        FEHCO3_spot: "FEHCO\u2083",
        AGu_spot: "UAG",
      }[_e] || "FE/UAG";
  if (_e === "AGu_spot" && !uagSpecimenConfirmed) {
    ve += '<div class="result-box warn-yellow" data-clcr-formula="AGu_spot"><strong>Nie obliczono UAG:</strong> potwierdź, że sód, potas i chlorki pochodzą z tej samej próbki moczu.</div>';
  } else if (["FENa_spot", "FEK_spot"].includes(_e)) {
    // The selected audited FE has one result/error card from its own engine.
  } else if (spotChemistryRequested && _e !== "AGu_spot" && !spotPairedChemistry) {
    ve +=
      '<div class="result-box warn-yellow"><strong>Nie obliczono FE/UAG:</strong> potwierdź, że anality i kreatynina pochodzą z tej samej próbki moczu, a krew pobrano równocześnie.</div>';
  } else if (selectedSpotChemistryMissing) {
    ve += `<div class="result-box warn-yellow"><strong>Nie obliczono ${clcrEscapeHtml(selectedSpotChemistryLabel)}:</strong> ${clcrEscapeHtml(selectedFeResult && selectedFeResult.error ? selectedFeResult.error : "uzupełnij wymagane stężenia z tej samej próbki moczu.")}</div>`;
  } else if (
    spotChemistryRequested &&
    !renderedSpotFractionalExcretion &&
    !isFiniteNum(spotUag)
  ) {
    ve += `<div class="result-box warn-yellow"><strong>Nie obliczono FE/UAG:</strong> ${clcrEscapeHtml(selectedFeResult && selectedFeResult.error ? selectedFeResult.error : "uzupełnij wymagane stężenia ze sparowanych próbek.")}</div>`;
  } else if (renderedSpotFractionalExcretion) {
    const limitations = [];
    $("spotDiureticUse")?.checked && limitations.push("stosowanie diuretyku");
    $("spotKnownCKD")?.checked && limitations.push("rozpoznana CKD");
    ve += `<div class="result-box warn-yellow"><strong>Frakcje wydalnicze:</strong> pokazano surowe wyniki bez uniwersalnych zakresów. Interpretacja zależy od wskazania, GFR, leczenia i czasu pobrania${limitations.length ? `; zaznaczono: ${clcrEscapeHtml(limitations.join(", "))}` : ""}.</div>`;
    if (spotFeHco3 && spotFeHco3.ok && !$("spotBicarbonateLoad")?.checked) {
      ve +=
        '<div class="result-box warn-yellow"><strong>FEHCO₃:</strong> bez udokumentowanego testu obciążenia wodorowęglanem wynik nie jest interpretowany jako test proksymalnej kwasicy cewkowej.</div>';
    }
  }
  if (isFiniteNum(spotUag)) {
    ve += $("spotNagmaContext")?.checked
      ? '<div class="result-box"><strong>UAG:</strong> znak wyniku należy oceniać łącznie z odpowiedzią amonową nerek i ograniczeniami metody; kalkulator nie stosuje uniwersalnej normy.</div>'
      : '<div class="result-box warn-yellow"><strong>UAG:</strong> bez potwierdzonej kwasicy metabolicznej z prawidłową luką surowicy pokazano wyłącznie wartość liczbową, bez interpretacji.</div>';
  }
  const timedCollectionAnalyteProvided = [
    "U_Na",
    "U_K",
    "U_PO4",
    "U_UA",
    "U_Ca",
    "U_Mg",
    "U_Prot",
    "U_Ox",
    "U_Cit",
    "U_Cys",
  ].some((id) => {
    const element = $(id);
    return element && String(element.value || "").trim() !== "";
  });
  if (timedCollectionAnalyteProvided && !collectionDurationMinutes) {
    ve +=
      '<div class="result-box warn-yellow"><strong>Zbiórka czasowa:</strong> nie obliczono wartości /24 h bez prawidłowej daty i godziny początku oraz końca zbiórki.</div>';
  } else if (
    timedCollectionAnalyteProvided &&
    collectionDurationMinutes &&
    !urineCollectionProtocolComplete
  ) {
    ve +=
      '<div class="result-box warn-yellow"><strong>Nie obliczono wartości /24 h:</strong> nie potwierdzono kompletnego protokołu czasowej zbiórki moczu. Pominięcie, rozlanie lub dodanie porcji unieważnia ilościowe wyniki dobowe.</div>';
  } else if (
    timedCollectionAnalyteProvided &&
    collectionDurationMinutes &&
    Math.abs(collectionDurationMinutes - 1440) > 0.5
  ) {
    ve += `<div class="result-box"><strong>Czas zbiórki:</strong> ${(collectionDurationMinutes / 60).toFixed(2)} h; ilości dobowe przeliczono z rzeczywistego czasu, bez zakładania 24 h.</div>`;
  }
  if (tmpGfrRequested) {
    if (!tmpGfrSafety.eligible) {
      ve += `<div class="result-box warn-yellow" data-clcr-formula="TMP_GFR"><strong>Nie obliczono TmP/GFR:</strong> ${clcrEscapeHtml(tmpGfrSafety.reason)}</div>`;
    } else if (!tmpGfrResult || !tmpGfrResult.ok) {
      ve += `<div class="result-box warn-yellow" data-clcr-formula="TMP_GFR"><strong>Nie obliczono TmP/GFR:</strong> ${clcrEscapeHtml(tmpGfrResult && tmpGfrResult.error ? tmpGfrResult.error : "uzupełnij wymagane dane.")}</div>`;
    } else {
      const branchLabel =
          tmpGfrResult.branch === "pediatric-direct"
            ? "metoda pediatryczna Brodehla, bez korekcji nomogramowej"
            : tmpGfrResult.branch === "linear"
              ? "Walton\u2013Bijvoet/Payne, gałąź TRP \u22640,86"
              : "Walton\u2013Bijvoet/Payne, gałąź TRP >0,86",
        tmpValueMmol = tmpGfrResult.tmpGfrMmolL.toFixed(3),
        tmpValueMg = tmpGfrResult.tmpGfrMgDl.toFixed(2),
        trpPct = (tmpGfrResult.trp * 100).toFixed(1),
        fePct = (tmpGfrResult.fePo4 * 100).toFixed(1);
      const tmpCard = renderResultCard({
        formulaId: "TMP_GFR", code: "TMP_GFR", series: "TMP_GFR", value: tmpGfrResult.tmpGfrMmolL,
        displayValue: tmpValueMmol, unit: "mmol/L", label: "TmP/GFR",
        detailHtml: `<p>Jednostka alternatywna: ${tmpValueMg} mg/dL. TRP: ${trpPct}%. FEPO₄: ${fePct}%. Metoda: ${clcrEscapeHtml(branchLabel)}.</p>`,
      });
      if (tmpCard !== null) ve += tmpCard;
      else ve += `<div class="result-box" data-clcr-formula="TMP_GFR" data-clcr-series="TMP_GFR" data-clcr-value="${tmpGfrResult.tmpGfrMmolL}"><strong>TmP/GFR:</strong> ${tmpValueMmol}\u202Fmmol/L (${tmpValueMg}\u202Fmg/dL)</div>`;
      ve += `<div class="result-box" data-clcr-formula="TMP_GFR"><strong>TRP:</strong> ${trpPct}%</div>`;
      ve += `<div class="result-box" data-clcr-formula="TMP_GFR"><strong>FEPO\u2084:</strong> ${fePct}%</div>`;
      ve += `<div class="result-box" data-clcr-formula="TMP_GFR"><strong>Metoda:</strong> ${branchLabel}</div>`;
      ve +=
        '<div class="result-box" data-clcr-formula="TMP_GFR"><strong>Próbka:</strong> na czczo; drugi poranny mocz; krew i mocz pobrane równocześnie.</div>';
      ve +=
        '<div class="result-box warn-yellow" data-clcr-formula="TMP_GFR"><strong>Interpretacja:</strong> wynik należy oceniać łącznie z fosforem w surowicy, wiekiem, funkcją nerek i metodą laboratoryjną. Kalkulator nie stosuje automatycznych zakresów ani rozpoznania nerkowej utraty fosforanów.</div>';
    }
  }
  (clcrSetTrustedMarkup($("elecInfo"), packClcrSupplementaryMarkup(ve, _e), "electrolyte result html"),
    ($("elecCard").style.display = ve ? "block" : "none"));
  let he = "";
  const stoneEngine = window.ClcrStoneSafety,
    stoneVersionActive =
      (window.currentVersion || "basic") === "pro" ||
      (window.currentVersion || "basic") === "spot" ||
      (window.currentVersion || "basic") === "advanced",
    stoneFieldProvided = (id) => {
      const element = $(id);
      return !!element && String(element.value || "").trim() !== "";
    },
    oxalateReportingEntity =
      $("oxalateReportingEntity")?.value === "oxalic_acid"
        ? "oxalicAcid"
        : $("oxalateReportingEntity")?.value === "oxalate_ion"
          ? "oxalateIon"
          : "",
    convertStoneDzm = (id, analyte, concentrationUnit, reportingEntity) => {
      if (!stoneVersionActive || !stoneFieldProvided(id)) return null;
      if (
        !stoneEngine ||
        typeof stoneEngine.convertDzmAnalyte !== "function"
      ) {
        return {
          ok: false,
          message: "Brak zwalidowanego modułu konwersji parametrów kamicy.",
        };
      }
      return stoneEngine.convertDzmAnalyte({
        analyte,
        concentration: readClcrOptionalNumber(id),
        concentrationUnit,
        collectedVolumeMl: R,
        durationMinutes: collectionDurationMinutes,
        collectionComplete: urineCollectionProtocolComplete,
        reportingEntity,
      });
    },
    stoneDzm = {
      calcium: convertStoneDzm("U_Ca", "calcium", "mmol/L"),
      magnesium: convertStoneDzm("U_Mg", "magnesium", "mg/L"),
      uricAcid: convertStoneDzm("U_UA", "uricAcid", "mg/dL"),
      phosphorus: convertStoneDzm(
        "U_PO4",
        "inorganicPhosphorus",
        "mg/dL",
      ),
      oxalate: convertStoneDzm(
        "U_Ox",
        "oxalate",
        "mg/dL",
        oxalateReportingEntity,
      ),
      citrate: convertStoneDzm("U_Cit", "citrate", "mg/dL"),
      cystine: convertStoneDzm("U_Cys", "cystine", "mg/dL"),
    },
    stoneKnownCystinuria = !!$("stoneKnownCystinuria")?.checked,
    stoneClinicalContext =
      stoneKnownCystinuria ||
      !!$("stoneMetabolicEvaluationContext")?.checked,
    stoneCurrentCollectionExactly24h =
      isFiniteNum(collectionDurationMinutes) &&
      Math.abs(collectionDurationMinutes - 1440) <= 0.5,
    stoneCollectionInterpretationReady =
      urineCollectionProtocolComplete &&
      stoneCurrentCollectionExactly24h &&
      !!$("stoneCollectionPlausibilityReviewed")?.checked &&
      !!$("stoneTwoCollectionsConfirmed")?.checked,
    stonePanelRequested =
      stoneClinicalContext ||
      [
        "U_Ca",
        "U_Mg",
        "U_UA",
        "U_PO4",
        "U_Ox",
        "U_Cit",
        "U_Cys",
        "pH24",
        "Ca_spot",
        "Ox_Cr_spot",
        "Cit_Cr_spot",
        "U_pH",
      ].some(stoneFieldProvided);
  function appendStoneValue(label, valueMarkup, cssClass = "", Sk, Sv, options = {}) {
    if (!valueMarkup) return;
    const Sa =
      Sk && isFiniteNum(Sv)
        ? ` data-clcr-series="${clcrEscapeHtml(Sk)}" data-clcr-value="${Sv}"`
        : "";
    if (Sk && isFiniteNum(Sv)) {
      const units = { CaCr_spot: "mg/mg", OxCr_spot: "mg/mg", CitCr_spot: "mg/mg", pH_spot: "", pH24: "" };
      const digits = ["pH_spot", "pH24"].includes(Sk) ? 2 : 3;
      const interpreted = options.interpretation;
      const presentation = interpreted?.ok && interpreted.status !== "contextOnly" ? {
        tone: ["attention", "high", "low", "belowGoal", "aboveGoal"].includes(interpreted.status) ? "warning" : interpreted.status === "urgentAttention" ? "danger" : "success",
        label: interpreted.code === "notBelowPediatricCacrLimit" ? "Zwiększony dla wieku" : interpreted.code === "belowPediatricCacrLimit" ? "Poniżej progu dla wieku" : interpreted.status === "goalMet" ? "Cel osiągnięty" : interpreted.status === "belowGoal" ? "Poniżej celu" : interpreted.status === "aboveGoal" ? "Powyżej celu" : "Wynik wymaga oceny w kontekście klinicznym",
        reasons: [interpreted.message],
      } : { label, tone: "neutral", reasons: interpreted?.message ? [interpreted.message] : [] };
      const stoneDisplayValue = formatStoneThresholdSafe(Sv, digits, interpreted);
      const massLimit = interpreted?.exactMassEquivalentMgMg;
      let boundary = "";
      if (Sk === "CaCr_spot" && isFiniteNum(massLimit)) {
        const rounded = Number(stoneDisplayValue);
        if (Sv < massLimit && rounded >= massLimit) boundary = `<${massLimit.toPrecision(6)}`;
        if (Sv >= massLimit && rounded < massLimit) boundary = `≥${massLimit.toPrecision(6)}`;
      }
      const card = renderResultCard({
        formulaId: Sk, code: Sk, series: Sk, value: Sv, boundary,
        displayValue: stoneDisplayValue, unit: units[Sk] || "", label,
        presentation, referenceContext: { stone: interpreted },
        detailHtml: `<p>${clcrEscapeHtml(label)}: ${valueMarkup}</p>`,
      });
      if (card !== null) { he += card; return; }
    }
    const formulaId = options.formulaId || Sk;
    he += `<div class="result-box${cssClass ? ` ${cssClass}` : ""}"${Sa}${formulaId ? ` data-clcr-formula="${clcrEscapeHtml(formulaId)}"` : ""}><strong>${clcrEscapeHtml(label)}:</strong> ${valueMarkup}</div>`;
  }
  function appendStoneDzmValue(label, conversion, options = {}) {
    if (!conversion) return;
    if (!conversion.ok) {
      appendStoneValue(
        `${label} \u2014 nie obliczono`,
        clcrEscapeHtml(conversion.message || "Nieprawidłowe dane DZM."),
        "warn-yellow",
        null, null, options,
      );
      return;
    }
    const mgDigits = options.mgDigits == null ? 1 : options.mgDigits,
      mmolDigits = options.mmolDigits == null ? 3 : options.mmolDigits,
      massLabel = options.massLabel || "mg/24 h",
      mmolDisplay = formatStoneThresholdSafe(
        conversion.totalMmol24,
        mmolDigits,
        options.interpretation,
      );
    appendStoneValue(
      label,
      `${mmolDisplay} mmol/24 h (${conversion.totalMg24.toFixed(mgDigits)} ${clcrEscapeHtml(massLabel)})`,
      "", null, null, options,
    );
  }
  function formatStoneThresholdSafe(
    value,
    digits,
    interpretation,
    boundaryOverride = null,
  ) {
    if (!isFiniteNum(value)) return "";
    const strictBoundaryByCode = {
        aboveHighCalciumLimit: [">", 8],
        aboveCalciumAttentionLimit: [">", 5],
        belowMagnesiumLimit: ["<", 3],
        aboveUricAcidLimit: [
          ">",
          interpretation && interpretation.upperLimit,
        ],
        abovePrimaryOxalateAttentionLimit: [">", 1],
        aboveEntericOxalateAttentionLimit: [">", 0.5],
        mildOxalateElevation: [">", 0.4],
        belowCitrateLimit: [
          "<",
          interpretation && interpretation.lowerLimit,
        ],
        aboveInorganicPhosphorusLimit: [">", 35],
        aboveCystineAbnormalLimit: [">", 0.125],
        knownCystinuriaScreeningLimitNotApplied: ["<", 3],
        urineVolumeGoalMet: [
          ">",
          interpretation && interpretation.goalL24,
        ],
        hyperacidicUrinePattern: ["<", 5.5],
        alkalineUrineCheckInfection: [">", 7],
        rtaScreenPatternPresent: [">", 6.2],
        rtaScreenIncomplete: [">", 6.2],
        cystinuriaPhGoalMet: [">", 7.5],
        uricAcidChemolysisPhBelowTarget: ["<", 7],
        uricAcidChemolysisPhAboveTarget: [">", 7.2],
        belowPediatricCacrLimit: [
          "<",
          interpretation && interpretation.upperMolMolExclusive,
        ],
      },
      boundary =
        boundaryOverride ||
        (interpretation && strictBoundaryByCode[interpretation.code]),
      roundedText = value.toFixed(digits),
      rounded = Number(roundedText);
    if (
      boundary &&
      isFiniteNum(boundary[1]) &&
      ((boundary[0] === ">" &&
        value > boundary[1] &&
        rounded <= boundary[1]) ||
        (boundary[0] === "<" &&
          value < boundary[1] &&
          rounded >= boundary[1]))
    ) {
      return `${boundary[0]}${Number(boundary[1]).toFixed(digits)}`;
    }
    return roundedText;
  }
  function stoneStatusClass(result) {
    if (!result || !result.ok) return "warn-yellow";
    return [
      "high",
      "low",
      "attention",
      "urgentAttention",
      "belowGoal",
      "aboveGoal",
    ].includes(result.status)
      ? "out-of-range"
      : result.status === "contextOnly"
        ? "warn-yellow"
        : "";
  }
  function appendStoneInterpretation(label, result, formulaId) {
    if (!result) return;
    appendStoneValue(
      result.ok ? label : `${label} \u2014 interpretacja wstrzymana`,
      clcrEscapeHtml(result.message || ""),
      stoneStatusClass(result),
      null, null, { formulaId },
    );
  }
  if (stoneVersionActive) {
    const adultStone =
        o &&
        t >= 18 &&
        stoneClinicalContext &&
        stoneCollectionInterpretationReady &&
        stoneEngine &&
        typeof stoneEngine.interpretAdultStonePanel === "function"
          ? stoneEngine.interpretAdultStonePanel({
              calciumMmol24: stoneDzm.calcium?.ok
                ? stoneDzm.calcium.totalMmol24
                : null,
              magnesiumMmol24: stoneDzm.magnesium?.ok
                ? stoneDzm.magnesium.totalMmol24
                : null,
              uricAcidMmol24: stoneDzm.uricAcid?.ok
                ? stoneDzm.uricAcid.totalMmol24
                : null,
              oxalateMmol24: stoneDzm.oxalate?.ok
                ? stoneDzm.oxalate.totalMmol24
                : null,
              oxalateReportingEntity,
              citrateMmol24: stoneDzm.citrate?.ok
                ? stoneDzm.citrate.totalMmol24
                : null,
              inorganicPhosphorusMmol24: stoneDzm.phosphorus?.ok
                ? stoneDzm.phosphorus.totalMmol24
                : null,
              cystineMmol24: stoneDzm.cystine?.ok
                ? stoneDzm.cystine.totalMmol24
                : null,
              thiolTherapy: !!$("stoneThiolTherapy")?.checked,
              knownCystinuria: stoneKnownCystinuria,
              urineVolumeL24:
                collectionDailyVolume === null
                  ? null
                  : collectionDailyVolume / 1000,
              volumeContext: stoneKnownCystinuria
                ? "cystinuria"
                : "general",
              urinePh:
                collectionDurationMinutes &&
                urineCollectionProtocolComplete
                  ? we
                  : null,
              phTreatmentContext: stoneKnownCystinuria
                ? "cystinuria"
                : null,
              fastingSecondMorningSpotPh:
                spotSampleKind === "secondMorning" &&
                $("stoneSpotFasting")?.checked
                  ? ye
                  : null,
              infectionExcluded:
                !!$("stoneUtiExcluded")?.checked &&
                !$("spotInfection")?.checked,
              persistentAbnormalPh: !!$("stonePhPersistent")?.checked,
              sex: a,
            })
          : null,
      pediatricCa24 =
        o &&
        t < 18 &&
        stoneClinicalContext &&
        stoneCollectionInterpretationReady &&
        stoneDzm.calcium?.ok &&
        stoneEngine &&
        typeof stoneEngine.interpretPediatricCalcium24h === "function"
          ? stoneEngine.interpretPediatricCalcium24h({
              totalMmol24: stoneDzm.calcium.totalMmol24,
              weightKg: s,
            })
          : null;

    const adultInterpretationByKey = adultStone
      ? {
          calcium: adultStone.calcium,
          magnesium: adultStone.magnesium,
          uricAcid: adultStone.uricAcid,
          phosphorus: adultStone.inorganicPhosphorus,
          oxalate: adultStone.oxalate,
          citrate: adultStone.citrate,
          cystine: adultStone.cystine,
        }
      : {};
    Object.entries(stoneDzm).forEach(([key, conversion]) => {
      const labels = {
        calcium: "Wapń w DZM",
        magnesium: "Magnez w DZM",
        uricAcid: "Kwas moczowy w DZM",
        phosphorus: "Fosfor nieorganiczny (P\u1D62) w DZM",
        oxalate: "Szczawiany w DZM",
        citrate: "Cytryniany w DZM",
        cystine: "Cystyna w DZM",
      };
      appendStoneDzmValue(labels[key], conversion, {
        formulaId: { calcium: "Ca_mgkg", magnesium: "Mg_mgkg", uricAcid: "UA_mgkg", phosphorus: "PO4_mgkg", oxalate: "Ox_mgkg", citrate: "Cit_mgkg", cystine: "stone-cystine" }[key],
        interpretation: adultInterpretationByKey[key],
        massLabel:
          key === "phosphorus"
            ? "mg P/24 h"
            : key === "oxalate"
              ? oxalateReportingEntity === "oxalicAcid"
                ? "mg kwasu szczawiowego/24 h"
                : oxalateReportingEntity === "oxalateIon"
                  ? "mg jonu szczawianowego/24 h"
                  : "mg/24 h"
              : key === "citrate"
                ? "mg kwasu cytrynowego/24 h"
                : "mg/24 h",
      });
    });

    if (stonePanelRequested && collectionDailyVolume !== null) {
      appendStoneValue(
        "Objętość moczu przeliczona na 24 h",
        `${formatStoneThresholdSafe(
          collectionDailyVolume / 1000,
          2,
          adultStone && adultStone.urineVolume,
        )} L/24 h`,
      );
    }
    if (window.ClcrCacrUi && (cacrEvaluation.valid || $("formulaPicker")?.value === "CaCr_spot")) {
      // The selected view and legacy broad view share the same source-native
      // Mayo interpretation. Never add a second EAU Ca/Cr interpretation.
      he += window.ClcrCacrUi.renderResult(cacrEvaluation);
    }
    if (window.ClcrOxcrUi && (oxcrEvaluation.valid || $("formulaPicker")?.value === "OxCr_spot")) {
      he += window.ClcrOxcrUi.renderResult(oxcrEvaluation);
    }
    if (window.ClcrCitcrUi && (citcrEvaluation.valid || $("formulaPicker")?.value === "CitCr_spot")) {
      he += window.ClcrCitcrUi.renderResult(citcrEvaluation);
    }
    isFiniteNum(ye) &&
      appendStoneValue(
        "pH próbki moczu",
        `${formatStoneThresholdSafe(
          ye,
          2,
          adultStone && adultStone.ph,
          adultStone &&
            ["rtaScreenPatternPresent", "rtaScreenIncomplete"].includes(
              adultStone.ph?.code,
            )
            ? [">", 5.8]
            : null,
        )} \u2014 pojedynczy wynik bez automatycznego rozpoznania`, "", "pH_spot", ye,
      );
    Ie > 0 &&
      appendStoneValue(
        "Wapń całkowity w surowicy",
        `${Ie.toFixed(2)} ${clcrEscapeHtml(Re)} \u2014 wartość kontekstowa, bez korekcji o albuminę`,
      );
    isFiniteNum(Wt) &&
      appendStoneValue(
        "PTH w surowicy",
        `${Wt.toFixed(0)} pg/mL \u2014 wartość kontekstowa bez automatycznego zakresu laboratoryjnego`,
      );
    isFiniteNum(qt) &&
      appendStoneValue(
        "25-OH-D w surowicy",
        `${qt.toFixed(1)} ng/mL \u2014 wartość kontekstowa bez automatycznego zakresu laboratoryjnego`,
      );
    isFiniteNum(we) &&
      collectionDurationMinutes &&
      urineCollectionProtocolComplete &&
      appendStoneValue(
        "pH czasowej zbiórki",
        formatStoneThresholdSafe(we, 2, adultStone && adultStone.ph), "", "pH24", we,
        { interpretation: adultStone && adultStone.ph },
      );
    if (
      isFiniteNum(we) &&
      (!collectionDurationMinutes || !urineCollectionProtocolComplete)
    ) {
      appendStoneValue(
        "pH dobowej zbiórki \u2014 interpretacja wstrzymana",
        "Podaj prawidłowy czas i potwierdź kompletny protokół zbiórki.",
        "warn-yellow",
      );
    }

    const timedStoneRequested =
      Object.values(stoneDzm).some(Boolean) ||
      stoneFieldProvided("pH24") ||
      (stoneClinicalContext && collectionDailyVolume !== null);
    if (timedStoneRequested && !stoneClinicalContext) {
      appendStoneValue(
        "Interpretacja progami EAU wstrzymana",
        "Potwierdź, że zbiórka służy swoistej ocenie metabolicznej lub profilaktyce nawrotów kamicy. Wartości liczbowe pozostają widoczne bez automatycznego celu i bez kategorii.",
        "warn-yellow",
      );
    } else if (
      timedStoneRequested &&
      stoneClinicalContext &&
      !stoneCollectionInterpretationReady
    ) {
      const missingCollectionChecks = [];
      urineCollectionProtocolComplete ||
        missingCollectionChecks.push("kompletny protokół zbiórki");
      stoneCurrentCollectionExactly24h ||
        missingCollectionChecks.push(
          "bieżąca zbiórka trwająca dokładnie 24 godziny",
        );
      $("stoneCollectionPlausibilityReviewed")?.checked ||
        missingCollectionChecks.push(
          "kliniczny przegląd wiarygodności/CER",
        );
      $("stoneTwoCollectionsConfirmed")?.checked ||
        missingCollectionChecks.push("dwie kolejne zbiórki 24-godzinne");
      appendStoneValue(
        "Interpretacja progami EAU wstrzymana",
        `Brakuje: ${missingCollectionChecks.join(", ")}. Pokazano wyłącznie wartości liczbowe.`,
        "warn-yellow",
      );
    }
    if (adultStone) {
      [
        ["Wapń", adultStone.calcium, "Ca_mgkg"],
        ["Magnez", adultStone.magnesium, "Mg_mgkg"],
        ["Kwas moczowy", adultStone.uricAcid, "UA_mgkg"],
        ["Szczawiany", adultStone.oxalate, "Ox_mgkg"],
        ["Cytryniany", adultStone.citrate, "Cit_mgkg"],
        ["Fosfor nieorganiczny (P\u1D62)", adultStone.inorganicPhosphorus, "PO4_mgkg"],
        ["Cystyna", adultStone.cystine, "stone-cystine"],
        ["Cel objętości moczu", adultStone.urineVolume, "stone-volume"],
        ["Profil pH", adultStone.ph, "pH24"],
      ].forEach(([label, interpretation, formulaId]) =>
        appendStoneInterpretation(label, interpretation, formulaId),
      );
    } else if (o && t < 18) {
      appendStoneInterpretation("Wapń w DZM \u2014 pediatria", pediatricCa24, "Ca_mgkg");
      if (
        stoneDzm.magnesium ||
        stoneDzm.uricAcid ||
        stoneDzm.phosphorus ||
        stoneDzm.oxalate ||
        stoneDzm.citrate ||
        stoneDzm.cystine
      ) {
        appendStoneValue(
          "Pozostałe parametry pediatryczne",
          "Pokazano wartości liczbowe bez automatycznych progów. Wiekowe tabele Mg/Cr, moczanów i wyników /1,73 m\u00B2 wymagają osobno wersjonowanego profilu referencyjnego.",
          "warn-yellow",
        );
      }
      if (stoneKnownCystinuria) {
        appendStoneValue(
          "Cystynuria pediatryczna",
          "Nie zastosowano automatycznie dorosłych celów 3,0 L/24 h ani pH >7,5. Pediatryczne cele płynowe i alkalizacji wymagają indywidualizacji względem powierzchni ciała, wieku, tolerancji i prowadzenia specjalistycznego.",
          "warn-yellow",
        );
      }
    }
    if (stoneVersionActive && !o) {
      appendStoneValue(
        "Interpretacja kamicy wstrzymana",
        "Podaj pełny wiek pacjenta, aby dobrać oddzielną ścieżkę pediatryczną albo dorosłą.",
        "warn-yellow",
      );
    }
    if (he) {
      appendStoneValue(
        "Źródło progów",
        "EAU Guidelines on Urolithiasis 2026; progi są stosowane wyłącznie do zgodnej populacji, jednostki i rodzaju próbki.",
      );
    }
  }
  let be = "";
  {
    const i = document.getElementById("stoneInfo"),
      l = document.getElementById("stoneCard");
    if (i && l)
      if (
        ((window.currentVersion || "basic") === "pro" ||
          (window.currentVersion || "basic") === "spot" ||
          (window.currentVersion || "basic") === "advanced") &&
        (he || be)
      ) {
        let u = "";
        (he && (u += he),
          be && (he && (u += "<hr>"), (u += be)),
          clcrSetTrustedMarkup(i, packClcrSupplementaryMarkup(u, _e), "stone result html"),
          (l.style.display = "block"));
      } else (clcrClearElement(i), (l.style.display = "none"));
  }
  const it = document.getElementById("ktvFields"),
    Ve = document.getElementById("ktvToggle");
  if (it && Ve)
    if (
      ((it.style.display =
        Ve.checked && mt === "pro" ? "block" : "none"),
      Ve.checked && mt === "pro")
    ) {
      const readKtvNumber = (L) => {
          const r = $(L),
            w = r ? String(r.value || "").trim() : "";
          if (w === "") return null;
          const Z = Number(w);
          return Number.isFinite(Z) ? Z : null;
        },
        result =
          window.ClcrDialysisSafety &&
          typeof window.ClcrDialysisSafety.computeDialysisAdequacy ==
            "function"
            ? window.ClcrDialysisSafety.computeDialysisAdequacy({
                ageYears: ageContext && ageContext.valid ? ageContext.years : null,
                ageMonths: ageContext && ageContext.valid ? ageContext.months : null,
                modality: $("ktvModality")?.value || "",
                sessionsPerWeek: readKtvNumber("ktvSessionsPerWeek"),
                pidiDays: $("ktvPidiDays")?.value || "",
                preUrea: readKtvNumber("UreaPre"),
                postUrea: readKtvNumber("UreaPost"),
                ureaAnalyte: $("ktvUreaAnalyte")?.value || "",
                ureaUnit: $("ktvUreaUnit")?.value || "",
                durationMinutes: readKtvNumber("ktvDurationMinutes"),
                netUfLiters: readKtvNumber("ktvUF"),
                postWeightKg: readKtvNumber("ktvW"),
                accessType: $("ktvAccessType")?.value || "unknown",
                kruValue: $("ktvKru")?.classList.contains("error")
                  ? null
                  : readKtvNumber("ktvKru"),
                kruUnit: "mL/min/1.73m\u00B2",
                kruMeasuredAt: $("ktvKruMeasuredAt")?.value || "",
                evaluationDate:
                  typeof window.ClcrDialysisSafety.localIsoDate === "function"
                    ? window.ClcrDialysisSafety.localIsoDate(new Date())
                    : null,
                treatmentsDeliveredReliably: !!$(
                  "ktvTreatmentsDelivered",
                )?.checked,
                sampling: {
                  sameSession: !!$("ktvSameSession")?.checked,
                  preBeforeDialysis: !!$("ktvPreBeforeDialysis")?.checked,
                  preNoSalineHeparinDilution: !!$(
                    "ktvPreNoDilution",
                  )?.checked,
                  postMethod: $("ktvPostMethod")?.value || "",
                },
              })
            : {
                ok: !1,
                messages: {
                  errors: [
                    {
                      message:
                        "Brak zwalidowanego modułu obliczeń dializacyjnych.",
                    },
                  ],
                  warnings: [],
                  info: [],
                },
              },
        validation = $("ktvValidation"),
        ktvResult = $("ktvResult"),
        ektvResult = $("ektvResult"),
        urrResult = $("urrResult"),
        ktvInterpretation = $("ktvInterpretation");
      CLCR_KTV_RESULT_IDS.map((id) => $(id)).forEach((L) => {
        if (!L) return;
        L.hidden = false;
        try {
          clcrClearElement(L);
        } catch {
          L.textContent = "";
        }
        L.style.display = "none";
        L.classList.remove("out-of-range", "warn-yellow");
      });
      if (!result.ok) {
        const errors =
          result.messages && Array.isArray(result.messages.errors)
            ? result.messages.errors
            : [];
        const errorMarkup = errors.length
          ? errors
              .map((entry) => clcrEscapeHtml(entry.message || "Nieprawidłowe dane."))
              .join("<br>")
          : "Nieprawidłowe lub niekompletne dane Kt/V.";
        validation &&
          (clcrSetTrustedMarkup(
            validation,
            `<strong>Nie obliczono spKt/Vurea:</strong> ${errorMarkup}`,
            "ktv validation",
          ),
          validation.classList.add("warn-yellow"),
          (validation.style.display = "block"));
      } else {
        if (ktvResult) {
          clcrSetTrustedMarkup(
            ktvResult,
            `<strong>spKt/Vurea \u2014 Daugirdas II:</strong> ${clcrEscapeHtml(result.display.spKtV)}<br><span>GFAC ${result.values.gfac.toFixed(4)}; ${result.metadata.sessionsPerWeek}\u00D7/tydz.; PIDI ${result.metadata.pidiDays} d. Wynik pojedynczej sesji.</span>`,
            "ktv result",
          );
          ktvResult.setAttribute("data-clcr-series", "KTV_spktv");
          ktvResult.setAttribute(
            "data-clcr-value",
            String(result.values.spKtV),
          );
          ktvResult.style.display = "block";
        }
        if (ektvResult && result.values.eKtV !== null) {
          const method = result.metadata.eKtVMethod;
          clcrSetTrustedMarkup(
            ektvResult,
            `<strong>Szacowane eKt/Vurea:</strong> ${clcrEscapeHtml(result.display.eKtV)}<br><span>Dostęp ${clcrEscapeHtml(method.access)}; T w minutach; C=${method.constantMinutes} min.</span>`,
            "ektv result",
          );
          ektvResult.setAttribute("data-clcr-series", "KTV_ektv");
          ektvResult.setAttribute(
            "data-clcr-value",
            String(result.values.eKtV),
          );
          ektvResult.style.display = "block";
        }
        if (urrResult) {
          const urrContext = result.classification.urr
            ? `<br><span>${clcrEscapeHtml(result.classification.urr.label)}; URR jest wskaźnikiem pomocniczym i nie zastępuje spKt/V.</span>`
            : "<br><span>Wskaźnik pomocniczy; bez automatycznego progu w tym profilu.</span>";
          clcrSetTrustedMarkup(
            urrResult,
            `<strong>URR:</strong> ${clcrEscapeHtml(result.display.urrPct)}%${urrContext}`,
            "urr result",
          );
          urrResult.setAttribute("data-clcr-series", "KTV_urr");
          urrResult.setAttribute(
            "data-clcr-value",
            String(result.values.urrPct),
          );
          urrResult.style.display = "block";
        }
        if (ktvInterpretation) {
          const classification = result.classification.spKtV;
          const messageEntries = [
            ...(result.messages.warnings || []),
            ...(result.messages.info || []),
          ];
          let interpretationMarkup = classification
            ? `<strong>Ocena sesji:</strong> ${clcrEscapeHtml(classification.label)}.`
            : "<strong>Ocena sesji:</strong> pokazano wynik techniczny bez progów adekwatności dla dorosłej IHD 3\u00D7/tydz.";
          if (messageEntries.length) {
            interpretationMarkup +=
              "<br>" +
              messageEntries
                .map((entry) => clcrEscapeHtml(entry.message || ""))
                .filter(Boolean)
                .join("<br>");
          }
          clcrSetTrustedMarkup(
            ktvInterpretation,
            interpretationMarkup,
            "ktv interpretation",
          );
          if (
            classification &&
            classification.code === "BELOW_MINIMUM"
          ) {
            ktvInterpretation.classList.add("out-of-range");
          } else if (
            !classification ||
            classification.code === "MINIMUM_MET_BELOW_TARGET"
          ) {
            ktvInterpretation.classList.add("warn-yellow");
          }
          ktvInterpretation.style.display = "block";
        }
        if (window.ClcrResultPresentation && window.ClcrResultReferenceData) {
          const warnings = [...(result.messages.warnings || []), ...(result.messages.info || [])];
          const detailHtml = warnings.map((entry) => `<p>${clcrEscapeHtml(entry.message || "")}</p>`).join("");
          function writeDialysisCard(element, series, value, displayValue, label, classification) {
            if (!element || !isFiniteNum(value)) return;
            const tone = classification?.code === "BELOW_MINIMUM" ? "danger" : classification?.code === "MINIMUM_MET_BELOW_TARGET" ? "warning" : classification?.code === "TARGET_MET" ? "success" : "neutral";
            const unit = series === "KTV_urr" ? "%" : "bez jednostki";
            const metricMethodHtml = series === "KTV_spktv"
              ? `<p>GFAC ${result.values.gfac.toFixed(4)}; ${result.metadata.sessionsPerWeek}×/tydz.; PIDI ${result.metadata.pidiDays} d. Wynik pojedynczej sesji.</p>`
              : series === "KTV_ektv" && result.metadata.eKtVMethod
                ? `<p>Dostęp ${clcrEscapeHtml(result.metadata.eKtVMethod.access)}; T w minutach; C=${result.metadata.eKtVMethod.constantMinutes} min.</p>`
                : "<p>URR jest wskaźnikiem pomocniczym i nie zastępuje spKt/V.</p>";
            const numericDisplay = Number(displayValue);
            const profile = window.ClcrResultReferenceData.PROFILE;
            const thresholds = series === "KTV_spktv" ? profile.dialysis.spKtV : series === "KTV_urr" ? profile.dialysis.urr : null;
            let boundary = "";
            if (classification && thresholds) {
              if (value < thresholds.minimum && numericDisplay >= thresholds.minimum) boundary = `<${thresholds.minimum}`;
              else if (value < thresholds.target && numericDisplay >= thresholds.target) boundary = `<${thresholds.target}`;
            }
            const card = renderResultCard({
              formulaId: "KTV", code: series, value, displayValue, unit, label, boundary,
              presentation: { label: classification?.label || label, tone },
              referenceContext: {
                dialysisEligible: result.classification.interpretationAllowed === true,
                durationMinutes: result.metadata.durationHours * 60,
              },
              detailHtml: metricMethodHtml + detailHtml,
            });
            if (card === null) return;
            clcrSetTrustedMarkup(element, card, "dialysis result presentation");
            element.classList.remove("result-box", "out-of-range", "warn-yellow");
            element.classList.add("clcr-result-metric");
            element.setAttribute("data-clcr-formula", "KTV");
            element.setAttribute("data-clcr-series", series);
            element.setAttribute("data-clcr-value", String(value));
            element.setAttribute("data-clcr-display-value", String(displayValue));
            element.setAttribute("data-clcr-display-unit", unit);
            element.setAttribute("data-clcr-display-label", label);
            element.setAttribute("data-clcr-status", classification?.label || label);
          }
          writeDialysisCard(ktvResult, "KTV_spktv", result.values.spKtV, result.display.spKtV, "spKt/V — dawka pojedynczej sesji", result.classification.spKtV);
          writeDialysisCard(ektvResult, "KTV_ektv", result.values.eKtV, result.display.eKtV, "Szacowane eKt/V", null);
          writeDialysisCard(urrResult, "KTV_urr", result.values.urrPct, result.display.urrPct, "URR — redukcja mocznika", result.classification.urr);
          if (ktvInterpretation) ktvInterpretation.hidden = true;
        }
      }
    } else
      CLCR_KTV_RESULT_IDS.forEach((i) => {
        mt !== "pro" && (Ve.checked = !1);
        const l = document.getElementById(i);
        if (!l) return;
        l.style.display = "none";
        try {
          clcrClearElement(l);
        } catch {
          l.textContent = "";
        }
      });
  {
    const i = document.getElementById("clearContainer");
    i && (i.style.display = "block");
  }
  consolidateClcrEngineOutputs(_e);
  window.ClcrResultPresentation?.bindCategoryControls(document);
  window.ClcrLayout?.refresh?.();
  typeof syncClcrReportVisibility == "function" && syncClcrReportVisibility();
}
try {
  window.clcrUpdate = update;
} catch {}
function showClcrDependencyNotice(e, n) {
  const t = n || "Brakuje bibliotek potrzebnych do wygenerowania PDF.";
  try {
    if (
      window.VildaDeps &&
      typeof window.VildaDeps.notifyMissingDependencies == "function"
    ) {
      window.VildaDeps.notifyMissingDependencies(e || "clcr-pdf-export", {
        message: t,
      });
      return;
    }
    if (
      window.VildaDeps &&
      typeof window.VildaDeps.showDependencyNotice == "function"
    ) {
      window.VildaDeps.showDependencyNotice(t, {
        moduleName: "clcr-pdf-export",
      });
      return;
    }
  } catch {}
  try {
    if (typeof patientReportShowToast == "function") {
      patientReportShowToast(t);
      return;
    }
  } catch {}
  // P-DYMKI: dymek przez jeden modul (vilda_dymek.js); pozycje wzgledem docka daje klasa .vilda-dymek.
  try {
    const D = typeof window < "u" ? window.VildaDymek : null;
    if (D && typeof D.pokaz === "function") {
      D.pokaz(t, { ton: "blad", poz: "prawo", czas: 9e3 });
      return;
    }
  } catch {}
}
function getClcrFormattedAge() {
  const formulaId = document.getElementById("formulaPicker")?.value || "";
  const e = readClcrFormulaAge(formulaId);
  return e && e.valid
    ? window.ClcrClinicalSafety.formatAge(e) + (formulaId === "cg_norm" ? " (ukończone lata użyte we wzorze)" : "")
    : "wiek nieokreślony";
}
function getClcrCreatinineContextText() {
  const formulaId = document.getElementById("formulaPicker")?.value || "";
  const resolution = resolveClcrCalculationAssumptions(formulaId);
  const parts = [resolution.assumptionsText];
  const state = document.getElementById("creatinineState")?.value;
  if (state === "rapidlyChanging") parts.push("Podano: szybko zmieniający się marker filtracji.");
  if (document.getElementById("suspectedAKI")?.checked) parts.push("Podano: podejrzenie AKI.");
  parts.push(...resolution.blockers.map((entry) => entry.message));
  return parts.filter(Boolean).join(" ") || "Założenia eGFR nie dotyczą wybranego obliczenia.";
}
function isClcrElementActuallyVisible(e) {
  if (!e || !(e.textContent || "").trim()) return !1;
  let n = e;
  while (n && n.nodeType === 1) {
    if (
      n.hidden ||
      n.style.display === "none" ||
      n.style.visibility === "hidden"
    )
      return !1;
    if (typeof window.getComputedStyle == "function") {
      const t = window.getComputedStyle(n);
      if (t.display === "none" || t.visibility === "hidden") return !1;
    }
    n = n.parentElement;
  }
  return !0;
}
($("downloadPDF").addEventListener("click", async () => {
  if (
    (typeof update == "function" && update(),
    typeof window < "u" && typeof window.vildaEnsurePdfLibraries == "function")
  )
    try {
      await window.vildaEnsurePdfLibraries();
    } catch {}
  if (
    typeof window < "u" &&
    window.VildaDeps &&
    typeof window.VildaDeps.checkModuleDeps == "function"
  ) {
    const v = window.VildaDeps.checkModuleDeps("clcr-pdf-export", {
      silent: !0,
    });
    if (v && v.ok === !1) {
      showClcrDependencyNotice(
        v,
        "Brakuje bibliotek potrzebnych do wygenerowania PDF.",
      );
      return;
    }
  }
  const e =
      typeof window < "u" && typeof window.vildaRequireFunction == "function"
        ? window.vildaRequireFunction("jspdf.jsPDF", {
            moduleName: "clcr-pdf-export",
          })
        : window.jspdf && typeof window.jspdf.jsPDF == "function"
          ? window.jspdf.jsPDF
          : null,
    n =
      typeof window < "u" && typeof window.vildaRequireFunction == "function"
        ? window.vildaRequireFunction("html2canvas", {
            moduleName: "clcr-pdf-export",
          })
        : typeof html2canvas == "function"
          ? html2canvas
          : null;
  if (!e || !n) {
    showClcrDependencyNotice(
      "clcr-pdf-export",
      "Brakuje bibliotek potrzebnych do wygenerowania PDF.",
    );
    return;
  }
  const t = document.getElementById("pdfReport");
  clcrClearElement(t);
  const o = document.createElement("h2");
  ((o.textContent = "Raport klirensu / eGFR"), t.appendChild(o));
  const a = document.createElement("div");
  a.className = "section";
  const s = document.createElement("h3");
  ((s.textContent = "Dane pacjenta"), a.appendChild(s));
  const p = document.getElementById("sex"),
    h = p?.options[p.selectedIndex]?.text || "",
    A = (v, P, K) => {
      const I = document.createElement("p"),
        H = document.createElement("strong");
      ((H.textContent = v + ":"),
        I.appendChild(H),
        I.appendChild(
          document.createTextNode(" " + (P || "\u2013") + (K || "")),
        ),
        a.appendChild(I));
    };
  (A("Imi\u0119 i nazwisko", ($("fullName").value || "").trim(), ""),
    A("Wiek", getClcrFormattedAge(), ""),
    A("P\u0142e\u0107", h || "", ""),
    A("Masa", $("weight").value || "", " kg"),
    A("Wzrost", $("height").value || "", " cm"),
    A("Kontekst markerów filtracji", getClcrCreatinineContextText(), ""),
    t.appendChild(a));
  const d = (v, P) => {
    const K = document.getElementById(v);
    if (!K || !K.children || K.children.length === 0) return;
    const I = document.createElement("div");
    I.className = "section";
    const H = document.createElement("h3");
    ((H.textContent = P),
      I.appendChild(H),
      Array.from(K.children).forEach((j) => {
        const b = document.createElement("p");
        ((b.className = "result-item"),
          j.classList.contains("out-of-range") &&
            b.classList.add("out-of-range"),
          j.classList.contains("warn-yellow") &&
            b.classList.add("warn-yellow"),
          Array.from(j.childNodes || []).forEach((B) =>
            b.appendChild(B.cloneNode(!0)),
          ),
          I.appendChild(b));
      }),
      t.appendChild(I));
  };
  (d("clcrInfo", "Klirens / eGFR"),
    d("elecInfo", "Inne wska\u017Aniki"),
    d("stoneInfo", "Parametry związane z kamicą \u2014 interpretacja zależna od populacji i próbki"));
  {
    const ktvExportElements = CLCR_KTV_RESULT_IDS
      .filter((id) => id !== "ktvValidation")
      .map((id) => document.getElementById(id));
    if (ktvExportElements.some(isClcrElementActuallyVisible)) {
      const I = document.createElement("div");
      I.className = "section";
      const H = document.createElement("h3");
      ((H.textContent = "Wyniki KT/V"),
        I.appendChild(H),
        ktvExportElements.forEach((j) => {
          if (isClcrElementActuallyVisible(j)) {
            const b = document.createElement("p");
            ((b.className = "result-item"),
              j.classList.contains("out-of-range") &&
                b.classList.add("out-of-range"),
              j.classList.contains("warn-yellow") &&
                b.classList.add("warn-yellow"),
              Array.from(j.childNodes || []).forEach((B) =>
                b.appendChild(B.cloneNode(!0)),
              ),
              I.appendChild(b));
          }
        }),
        t.appendChild(I));
    }
  }
  t.style.display = "block";
  const x = 10,
    N = { w: 210, h: 297 },
    _ = { w: N.w - x * 2, h: N.h - x * 2 };
  let c;
  try {
    c = await n(t, { scale: 2, useCORS: !0, backgroundColor: null });
  } finally {
    t.style.display = "none";
  }
  const f = c.width / _.w,
    F = c.height / f,
    g = F > _.h ? _.h / F : 1,
    E = _.w * g,
    O = F * g,
    D = new e({ orientation: "p", unit: "mm", format: "a4", compress: !0 }),
    te = x + (_.w - E) / 2,
    C = x + (_.h - O) / 2,
    k = c.toDataURL("image/png");
  D.addImage(k, "PNG", te, C, E, O);
  const Q = $("fullName").value.trim().replace(/\s+/g, "_"),
    U = (Q ? Q + "_" : "") + "Klirens_VildaClinic.pdf";
  D.save(U);
}),
  $("downloadDOCX").addEventListener("click", async () => {
    typeof update == "function" && update();
    const e = document.getElementById("sex"),
      n = e?.options[e.selectedIndex]?.text || "",
      t = [
        [
          "Imi\u0119 i nazwisko:",
          ($("fullName").value || "").trim() || "\u2013",
        ],
        ["Wiek:", getClcrFormattedAge()],
        ["P\u0142e\u0107:", n || "\u2013"],
        ["Masa:", $("weight").value ? $("weight").value + " kg" : "\u2013"],
        ["Wzrost:", $("height").value ? $("height").value + " cm" : "\u2013"],
        ["Kontekst markerów filtracji:", getClcrCreatinineContextText()],
      ];
    function o(C) {
      const k = [],
        Q = document.getElementById(C);
      return (
        !Q ||
          !Q.children ||
          Array.from(Q.children).forEach((U) => {
            const v = U.textContent.trim().replace(/\u00A0/g, " "),
              P = U.classList.contains("out-of-range"),
              K = U.classList.contains("warn-yellow");
            k.push({ text: v, isOut: P, isWarn: K });
          }),
        k
      );
    }
    const a = o("clcrInfo"),
      s = o("elecInfo"),
      p = o("stoneInfo"),
      h = [];
    CLCR_KTV_RESULT_IDS
      .filter((id) => id !== "ktvValidation")
      .map((id) => document.getElementById(id))
      .forEach((C) => {
      if (isClcrElementActuallyVisible(C)) {
        const k = C.textContent.trim().replace(/\u00A0/g, " ");
        k &&
          h.push({
            text: k,
            isOut: C.classList.contains("out-of-range"),
            isWarn: C.classList.contains("warn-yellow"),
          });
      }
    });
    if (typeof docx < "u" && docx.Packer)
      try {
        let K = function (J, G) {
          !G ||
            G.length === 0 ||
            (P.push(
              new k({
                children: [new U({ text: J, bold: !0, size: 28 })],
                spacing: { before: 200, after: 100 },
              }),
            ),
            G.forEach(({ text: ee, isOut: R, isWarn: F }) => {
              P.push(
                new k({
                  children: [
                    new U({
                      text: ee,
                      color: R ? "C62828" : F ? "9A6700" : "000000",
                    }),
                  ],
                  spacing: { after: 50 },
                }),
              );
            }));
        };
        var te = K;
        const {
            Document: C,
            Paragraph: k,
            Packer: Q,
            TextRun: U,
            AlignmentType: v,
          } = docx,
          P = [];
        (P.push(
          new k({
            children: [
              new U({ text: "Raport klirensu / eGFR", bold: !0, size: 32 }),
            ],
            alignment: v.CENTER,
            spacing: { after: 300 },
          }),
        ),
          P.push(
            new k({
              children: [new U({ text: "Dane pacjenta", bold: !0, size: 28 })],
              spacing: { before: 200, after: 100 },
            }),
          ),
          t.forEach(([J, G]) => {
            P.push(
              new k({
                children: [
                  new U({ text: J + " ", bold: !0 }),
                  new U({ text: G }),
                ],
                spacing: { after: 50 },
              }),
            );
          }),
          K("Klirens / eGFR", a),
          K("Inne wska\u017Aniki", s),
          K("Parametry związane z kamicą \u2014 interpretacja zależna od populacji i próbki", p),
          K("Wyniki KT/V", h));
        const I = new C({
          creator: "Vilda Clinic",
          description:
            "Raport wygenerowany przez kalkulator klirensu kreatyniny / eGFR",
          title: "Raport klirensu / eGFR",
        });
        I.addSection({ children: P });
        const H = await Q.toBlob(I),
          j = $("fullName").value.trim().replace(/\s+/g, "_"),
          b = (j ? j + "_" : "") + "Klirens_VildaClinic.docx",
          B = URL.createObjectURL(H),
          M = document.createElement("a");
        ((M.href = B),
          (M.download = b),
          document.body.appendChild(M),
          M.click(),
          document.body.removeChild(M),
          setTimeout(() => URL.revokeObjectURL(B), 1e3));
        return;
      } catch (C) {
        console.error("DOCX generation failed, falling back to HTML", C);
      }
    const N = (C) =>
        typeof clcrEscapeHtml == "function"
          ? clcrEscapeHtml(C)
          : String(C ?? "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;"),
      _ = [];
    (_.push('<h1 style="text-align:center;">Raport klirensu / eGFR</h1>'),
      _.push("<h2>Dane pacjenta</h2>"),
      t.forEach(([C, k]) => {
        _.push(`<p><strong>${N(C)}</strong> ${N(k)}</p>`);
      }));
    function c(C, k) {
      !k ||
        k.length === 0 ||
        (_.push(`<h2>${N(C)}</h2>`),
        k.forEach(({ text: Q, isOut: U, isWarn: F }) => {
          const v = U
            ? ' style="color:#c62828;"'
            : F
              ? ' style="color:#9a6700;"'
              : "";
          _.push(`<p${v}>${N(Q)}</p>`);
        }));
    }
    (c("Klirens / eGFR", a),
      c("Inne wska\u017Aniki", s),
      c("Parametry związane z kamicą \u2014 interpretacja zależna od populacji i próbki", p),
      c("Wyniki KT/V", h));
    const f = `<html><head><meta charset="utf-8"><title>Raport</title></head><body>${_.join("")}</body></html>`,
      F = new Blob(["\uFEFF" + f], { type: "application/msword" }),
      g = $("fullName").value.trim().replace(/\s+/g, "_"),
      E = (g ? g + "_" : "") + "Klirens_VildaClinic.doc",
      O = URL.createObjectURL(F),
      D = document.createElement("a");
    ((D.href = O),
      (D.download = E),
      document.body.appendChild(D),
      D.click(),
      document.body.removeChild(D),
      setTimeout(() => URL.revokeObjectURL(O), 1e3));
  }),
  $("askAI").addEventListener("click", async () => {
    typeof update == "function" && update();
    const e = document.getElementById("sex"),
      n = e?.options[e.selectedIndex]?.text || "",
      t = [];
    (t.push(
      `Imi\u0119 i nazwisko: ${($("fullName").value || "").trim() || "\u2013"}`,
    ),
      t.push(`Wiek: ${getClcrFormattedAge()}`),
      t.push(`P\u0142e\u0107: ${n || "\u2013"}`),
      t.push(`Masa: ${$("weight").value || "\u2013"} kg`),
      t.push(`Wzrost: ${$("height").value || "\u2013"} cm`),
      t.push(`Kontekst markerów filtracji: ${getClcrCreatinineContextText()}`));
    function o(g) {
      const E = [],
        O = document.getElementById(g);
      return (
        !O ||
          !O.children ||
          Array.from(O.children).forEach((D) => {
            E.push(D.textContent.trim().replace(/\u00A0/g, " "));
          }),
        E
      );
    }
    const a = o("clcrInfo"),
      s = o("elecInfo"),
      p = o("stoneInfo"),
      h = [];
    CLCR_KTV_RESULT_IDS
      .filter((id) => id !== "ktvValidation")
      .map((id) => document.getElementById(id))
      .forEach((g) => {
      if (isClcrElementActuallyVisible(g)) {
        const E = g.textContent.trim().replace(/\u00A0/g, " ");
        E && h.push(E);
      }
    });
    let x = `Raport klirensu / eGFR

`;
    ((x +=
      `Dane pacjenta:
` +
      t.join(`
`) +
      `

`),
      a.length > 0 &&
        (x +=
          `Klirens / eGFR:
` +
          a.join(`
`) +
          `

`),
      s.length > 0 &&
        (x +=
          `Inne wska\u017Aniki:
` +
          s.join(`
`) +
          `

`),
      p.length > 0 &&
        (x +=
          `Parametry związane z kamicą \u2014 interpretacja zależna od populacji i próbki:
` +
          p.join(`
`) +
          `

`),
      h.length > 0 &&
        (x +=
          `Wyniki KT/V:
` +
          h.join(`
`) +
          `

`));
    const stoneSafetyInstruction =
        "Interpretacje parametrów kamicy pochodzą z profilu EAU Urolithiasis 2026 i obowiązują wyłącznie dla jawnie wskazanej populacji, płci, jednostki oraz kompletnej próbki. Nie rozszerzaj progów dorosłych na dzieci ani progów Ca/Cr na DZM; komunikaty przesiewowe nie stanowią rozpoznania ani samodzielnej decyzji terapeutycznej.",
      tubularSafetyInstruction =
        "Nie klasyfikuj TmP/GFR jako prawidłowego ani nie rozpoznawaj nerkowej utraty fosforanów bez źródłowo dopasowanego profilu referencyjnego, hipofosfatemii, funkcji nerek, metody laboratoryjnej i potwierdzonego protokołu próbki. Frakcje wydalnicze i UAG traktuj jako wyniki kontekstowe, bez uniwersalnych norm.",
      _ = [
        "Jeste\u015B asystentem medycznym, kt\xF3ry interpretuje raporty laboratoryjne i obliczenia eGFR.",
        stoneSafetyInstruction,
        tubularSafetyInstruction,
        "Zinterpretuj nast\u0119puj\u0105cy raport pacjenta. Podaj kr\xF3tkie podsumowanie i ewentualne zalecenia:",
        x,
      ].join(`

`);
    try {
      (await navigator.clipboard.writeText(_),
        alert(
          `Przygotowano zapytanie do AI. Zosta\u0142o ono skopiowane do schowka. Wklej je w ChatGPT, aby uzyska\u0107 interpretacj\u0119 wynik\xF3w:

` + _,
        ));
    } catch {
      alert(
        `Przygotowano zapytanie do AI. Z powodu ustawie\u0144 przegl\u0105darki nie mo\u017Cna by\u0142o automatycznie skopiowa\u0107 tekstu. Skopiuj poni\u017Cszy tekst r\u0119cznie i wklej go w ChatGPT, aby uzyska\u0107 interpretacj\u0119 wynik\xF3w:

` + _,
      );
    }
  }));
function syncClcrReportVisibility() {
  const e = $("results") && $("results").style.display !== "none",
    n = $("elecCard") && $("elecCard").style.display !== "none",
    t = $("stoneCard") && $("stoneCard").style.display !== "none",
    o = CLCR_KTV_RESULT_IDS
      .filter((id) => id !== "ktvValidation")
      .some((id) =>
        isClcrElementActuallyVisible(document.getElementById(id)),
      ),
    a = !(e || n || t || o),
    s = $("downloadPDF"),
    p = $("downloadDOCX");
  (s && (s.style.display = a ? "none" : "block"),
    p && (p.style.display = a ? "none" : "block"));
  const h = document.getElementById("aiFieldset");
  h && (h.hidden = a);
}
const observer = new MutationObserver(syncClcrReportVisibility);
(["results", "elecCard", "stoneCard"].forEach((e) => {
  const n = $(e);
  n && observer.observe(n, { attributes: !0, attributeFilter: ["style"] });
}),
  CLCR_KTV_RESULT_IDS.forEach((e) => {
    const n = document.getElementById(e);
    n && observer.observe(n, { attributes: !0, attributeFilter: ["style"] });
  }),
  syncClcrReportVisibility());
function resetApp(e = !0) {
  if (!e)
    try {
      typeof window.clcrClearVersionValueVault == "function"
        ? window.clcrClearVersionValueVault()
        : (window.__vildaClcrPreserveVersionValues = !1);
    } catch {}
  const n = document.getElementById("samePatientMode"),
    t = n ? n.checked : !1,
    o = {};
  [
    "fullName",
    "age",
    "ageMonths",
    "ageDays",
    "neonatalTermStatus",
    "sex",
    "weight",
    "height",
    "ScrAssay",
    "creatinineState",
    "suspectedAKI",
    "CrCysStandardizationConfirmed",
  ].forEach((c) => {
    const f = document.getElementById(c);
    f && (o[c] = f.type === "checkbox" ? f.checked : f.value);
  });
  const a = document.getElementById("clcrForm"),
    s = document.getElementById("formulaPicker"),
    p = e && s ? s.value : "";
  if ((a && a.reset(), !e)) {
    const c = document.getElementById("prevClcrCard");
    c && c.parentNode && c.parentNode.removeChild(c);
    const f = document.getElementById("clcrForm");
    f && f.classList.remove("has-prev-clcr");
    const F = document.getElementById("prevClcrPlaceholder");
    (F && (F.style.display = "flex"),
      typeof window.setupPrevClcrCardHeight == "function" &&
        window.setupPrevClcrCardHeight());
    const g = document.getElementById("formulaNote");
    (g && ((g.textContent = ""), (g.style.display = "none")),
      s && (s.value = ""));
    const E = document.querySelector(".version-option.selected");
    if (E) E.click();
    else {
      const te = document.querySelector(".param-row");
      (te && (te.style.display = "none"), (window.currentVersion = ""));
    }
    const O = document.getElementById("ktvCard");
    O && (O.style.display = "none");
    const D = document.getElementById("clearContainer");
    D && (D.style.display = "block");
  }
  e && s && (s.value = p);
  const h = document.getElementById("U_ACR");
  const pcrOutput = document.getElementById("U_PCR");
  (h && (h.value = ""),
    pcrOutput && (pcrOutput.value = ""),
    document.querySelectorAll(".validation-message").forEach((c) => {
      c.textContent = "";
    }),
    document
      .querySelectorAll("#clcrForm input, #clcrForm select")
      .forEach((c) => {
        c.classList.remove("error", "is-filled", "must-fill");
      }),
    document
      .querySelectorAll(".must-fill-group")
      .forEach((c) => c.classList.remove("must-fill-group")),
    ["results", "elecCard", "stoneCard"].forEach((c) => {
      const f = document.getElementById(c);
      f && (f.style.display = "none");
    }),
    ["clcrInfo", "elecInfo", "stoneInfo"].forEach((c) => {
      const f = document.getElementById(c);
      f && clcrClearElement(f);
    }),
    CLCR_KTV_RESULT_IDS.forEach((c) => {
      const f = document.getElementById(c);
      if (f) {
        f.style.display = "none";
        try {
          clcrClearElement(f);
        } catch {
          f.textContent = "";
        }
      }
    }));
  const A = document.getElementById("patientName");
  A && (A.textContent = "");
  const d = document.getElementById("ktvToggle"),
    x = document.getElementById("ktvFields");
  (d && (d.checked = !1),
    x && (x.style.display = "none"),
    e &&
      Object.keys(o).forEach((c) => {
        const f = document.getElementById(c),
          F = o[c];
        if (f && F !== "" && F != null)
          try {
            ((f.type === "checkbox" ? (f.checked = !!F) : (f.value = F)),
              ["input", "change"].forEach((g) => {
                try {
                  const E = new Event(g, { bubbles: !0 });
                  f.dispatchEvent(E);
                } catch {}
              }));
          } catch {}
      }));
  const N = document.getElementById("formulaLive");
  N && ((N.style.display = "none"), clcrClearElement(N));
  const _ = document.getElementById("formulaSearch");
  (_ && (_.value = ""),
    e && n && (n.checked = t),
    typeof window.update == "function" && window.update());
  try {
    a && a.scrollIntoView({ behavior: "smooth" });
  } catch {}
}
const clearBtn = document.getElementById("clearBtn");
clearBtn &&
  clearBtn.addEventListener("click", (event) => {
    event.clcrClearedFormula = $("formulaPicker")?.value || "";
    resetApp(!1);
  });
