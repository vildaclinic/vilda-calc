function BSA_DuBois(e, n) {
  return 0.007184 * Math.pow(e, 0.425) * Math.pow(n, 0.725);
}
function clCrCG(e, n, t, o) {
  const a = e === "F" ? 0.85 : 1;
  return ((140 - n) * t * a) / (72 * o);
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
    Ox_Cr_spot: "St\u0119\u017Cenie szczawian\xF3w w pr\xF3bce moczu (mg/dl).",
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
  } else if (maxValues[n] !== void 0 && t > maxValues[n])
    return (
      o && (o.textContent = "Warto\u015B\u0107 wydaje si\u0119 zbyt wysoka"),
      e.classList.add("error"),
      !1
    );
  return (o && (o.textContent = ""), e.classList.remove("error"), !0);
}
function validateClcrAgeContext(e) {
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
  if (
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.formulaSafety == "function"
  ) {
    const t = window.ClcrClinicalSafety.readAgeFromDocument(document),
      o = window.ClcrClinicalSafety.creatininePolicy(
        document.getElementById("creatinineState")?.value || "unknown",
        !!document.getElementById("suspectedAKI")?.checked,
      ),
      a = {
        termStatus:
          document.getElementById("neonatalTermStatus")?.value || "",
        bodyWeightKg:
          document.getElementById("weight")?.value || "",
        scrAssay:
          document.getElementById("ScrAssay")?.value || "",
      };
    if (!window.ClcrClinicalSafety.formulaSafety(e, t, o, a).eligible) return !1;
  }
  return n.requires.every((t) => {
        const o = document.getElementById(t);
        if (!o) return !1;
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
function update() {
  const e = $("fullName").value.trim();
  $("patientName").textContent = e || "";
  const ageContext =
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.readAgeFromDocument == "function"
        ? window.ClcrClinicalSafety.readAgeFromDocument(document)
        : null,
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
  const creatinineState = $("creatinineState")
      ? $("creatinineState").value
      : "unknown",
    suspectedAKI = !!($("suspectedAKI") && $("suspectedAKI").checked),
    creatinineContext =
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.creatininePolicy == "function"
        ? window.ClcrClinicalSafety.creatininePolicy(
            creatinineState,
            suspectedAKI,
          )
        : {
            calculationAllowed: !suspectedAKI && creatinineState !== "rapidlyChanging",
            categoryAllowed: creatinineState === "stable" && !suspectedAKI,
            status: creatinineState,
            message: "",
          },
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
  const x = +$("Ucr").value,
    N = readClcrOptionalNumber("Ucr_spot"),
    _ = $("Ucr_spot_unit") ? $("Ucr_spot_unit").value : "mg/dl";
  const c =
    _ && _ !== "" && N !== null && N > 0
      ? _ === "umol"
        ? N / 88.4
        : N
      : null;
  const f = +$("U_Alb").value,
    spotProtein = +$("U_Prot_spot").value,
    F = readClcrOptionalNumber("Ca_spot"),
    g = $("Ca_spot_unit") ? $("Ca_spot_unit").value : "mg/dl";
  let E = null;
  F !== null &&
    F >= 0 &&
    g &&
    g !== "" &&
    (g === "mmol/L"
      ? (E = (F * 40.078) / 10)
      : g === "mg/dl" && (E = F));
  const spotCalciumMmolL =
      F === null || F < 0
        ? null
        : g === "mmol/L"
          ? F
          : g === "mg/dl"
            ? (F * 10) / 40.078
            : null,
    spotCreatinineMmolL =
      N === null || N <= 0
        ? null
        : _ === "umol"
          ? N / 1000
          : _ === "mg/dl"
            ? (N * 10) / 113.1179
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
  let j = null,
    acrMgMmol = null,
    pcrValue = null,
    pcrMgMmol = null;
  const albuminProvided =
      $("U_Alb") && String($("U_Alb").value || "").trim() !== "",
    proteinSpotProvided =
      $("U_Prot_spot") &&
      String($("U_Prot_spot").value || "").trim() !== "",
    sameSpotSpecimen = !!(
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
    acrRatio =
      sameSpotSpecimen &&
      albuminProvided &&
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.computeUrineAnalyteCreatinineRatio ==
        "function"
        ? window.ClcrClinicalSafety.computeUrineAnalyteCreatinineRatio({
            analyteMgL: f,
            urineCreatinine: N,
            urineCreatinineUnit: _,
          })
        : null,
    pcrRatio =
      sameSpotSpecimen &&
      proteinSpotProvided &&
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.computeUrineAnalyteCreatinineRatio ==
        "function"
        ? window.ClcrClinicalSafety.computeUrineAnalyteCreatinineRatio({
            analyteMgL: spotProtein,
            urineCreatinine: N,
            urineCreatinineUnit: _,
          })
        : null;
  acrRatio
    ? ((j = acrRatio.mgG),
      (acrMgMmol = acrRatio.mgMmol),
      ($("U_ACR").value = j.toFixed(1)))
    : ($("U_ACR").value = "");
  pcrRatio
    ? ((pcrValue = pcrRatio.mgG),
      (pcrMgMmol = pcrRatio.mgMmol),
      ($("U_PCR").value = pcrValue.toFixed(1)))
    : ($("U_PCR").value = "");
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
    spotFeK = computeSpotFractionalExcretion(
      spotUrinePotassium,
      spotSerumPotassium,
    ),
    spotFeCl = computeSpotFractionalExcretion(
      spotUrineChloride,
      spotSerumChloride,
    ),
    spotFeHco3 = computeSpotFractionalExcretion(
      spotUrineBicarbonate,
      spotSerumBicarbonate,
    ),
    spotUag =
      spotPairedChemistry &&
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
    collectionProtocol = {
      ...urineCollectionProtocol,
      serumSampleDuringCollection: !!$(
        "serumSampleDuringCollection",
      )?.checked,
    },
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
      i.type === "checkbox" ? i.checked : (i.value || "").trim() !== "",
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
  const timedCrCl =
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.computeTimedCreatinineClearance ==
      "function"
      ? window.ClcrClinicalSafety.computeTimedCreatinineClearance({
          urineCreatinineMgDl: x,
          serumCreatinineMgDl: d,
          volumeMl: R,
          collectionStartAt: $("collectionStartAt")?.value || "",
          collectionEndAt: $("collectionEndAt")?.value || "",
          serumSampleAt: $("serumSampleAt")?.value || "",
          bsaM2: W,
          weightKg: s,
          protocol: collectionProtocol,
        })
      : null;
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
  let ne = null;
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
    const i = (ne * 1.73) / W;
    me(
      "Cockcroft\u2013Gault\xA0(1,73\u202Fm\xB2)",
      i,
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
      ageContext.totalMonths === 0 &&
      ageContext.daysOfLife !== null &&
      populationContext.termStatus === "term" &&
      s > 2.5 &&
      populationContext.scrAssay === "enzymatic_idms" &&
      p > 0 &&
      d > 0 &&
      creatinineContext.calculationAllowed
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
    ckdEpiCrCysResult =
      extendedEgfr &&
      typeof extendedEgfr.computeCkdEpi2021CrCys === "function"
        ? extendedEgfr.computeCkdEpi2021CrCys(extendedEgfrInput)
        : null,
    ckidU25CysResult =
      extendedEgfr &&
      typeof extendedEgfr.computeCkidU25Cys === "function"
        ? extendedEgfr.computeCkidU25Cys(extendedEgfrInput)
        : null,
    ckidU25CrCysResult =
      extendedEgfr &&
      typeof extendedEgfr.computeCkidU25CrCys === "function"
        ? extendedEgfr.computeCkidU25CrCys(extendedEgfrInput)
        : null;
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
      selectedSafety =
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
    function q(r, w, Z = "", de, Vt) {
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
      S += `<div class="result-box${at ? "" : " out-of-range"}" data-clcr-formula="${$t}" data-clcr-code="${Dt}"><strong>${r}:</strong> ${displayValue}${Z}${calculationDetail}${lt}</div>`;
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
        creatinineAssayEligible = [
          "enzymatic_idms",
          "jaffe_idms",
        ].includes(populationContext.scrAssay),
        cystatinAssayEligible =
          cystatinCStandardization === "ERM-DA471/IFCC",
        validGEntries = gfrEntries.filter(
          (w) =>
            w &&
            isFiniteNum(w.value) &&
            creatinineContext.categoryAllowed &&
            (w.requiresCreatinine !== true ||
              creatinineAssayEligible) &&
            (w.requiresCystatin !== true ||
              cystatinAssayEligible) &&
            t >= 2,
        ),
        hasG = validGEntries.length > 0,
        hasA =
          r.includeA !== !1 &&
          u &&
          isFiniteNum(j) &&
          t >= 2 &&
          spotSampleKind === "firstMorning" &&
          spotConfounders.length === 0;
      r.includeBsa !== !1 &&
        W &&
        (S =
          `<div class="result-box"${bsaFormulaId ? ` data-clcr-formula="${clcrEscapeHtml(bsaFormulaId)}"` : ""}><strong>Powierzchnia cia\u0142a (${clcrEscapeHtml(bsaMethod)})</strong> ${W.toFixed(2)}\u202Fm\xB2</div>` +
          S);
      validGEntries.forEach((entry) => {
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
          .filter((entry) => entry.value < 90)
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
        S += `<div class="result-box" data-clcr-formula="${w}"><strong>Uwaga:</strong> pojedynczy wynik eGFR/ACR nie rozpoznaje przewlekłej choroby nerek; należy ocenić przewlekłość, przyczynę i inne markery uszkodzenia nerek.</div>`;
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
      if (cgContextRendered) return;
      cgContextRendered = !0;
      S +=
        '<div class="result-box warn-yellow" data-clcr-formula="cg"><strong>Założenie Cockcrofta–Gaulta:</strong> użyto podanej rzeczywistej masy ciała. W otyłości, niedowadze, obrzękach lub przy nietypowej masie mięśniowej potrzebna jest jawna polityka masy. To eCrCl, nie eGFR; dawkowanie należy sprawdzić w informacji o konkretnym leku i jego badanej populacji.</div>';
    }
    function appendSpotRatioGuidance() {
      if (!isFiniteNum(j) && !isFiniteNum(pcrValue)) return;
      if (spotConfounders.length) {
        S += `<div class="result-box warn-yellow" data-clcr-formula="${isFiniteNum(j) ? "ACR" : "PCR"}"><strong>Interpretacja wstrzymana:</strong> zaznaczono czynnik mogący przejściowo zmienić ACR/PCR (${clcrEscapeHtml(spotConfounders.join(", "))}). Powtórz badanie po jego ustąpieniu.</div>`;
      }
      if (o && t < 18) {
        if (!isFiniteNum(j) || !isFiniteNum(pcrValue)) {
          S +=
            '<div class="result-box warn-yellow" data-clcr-formula="PCR"><strong>Panel pediatryczny niekompletny:</strong> KDIGO zaleca u dzieci oznaczenie zarówno ACR, jak i PCR w tej samej pierwszej porannej próbce.</div>';
        }
        if (spotSampleKind !== "firstMorning") {
          S +=
            '<div class="result-box warn-yellow" data-clcr-formula="PCR"><strong>Próbka pediatryczna:</strong> wynik liczbowy jest prowizoryczny. Do początkowej oceny albuminurii/białkomoczu użyj pierwszego porannego moczu; dodatni wynik losowy wymaga takiego potwierdzenia.</div>';
          return;
        }
        if (spotConfounders.length) return;
        const thresholds =
          window.ClcrClinicalSafety &&
          typeof window.ClcrClinicalSafety.pediatricUrineRatioThresholds ==
            "function"
            ? window.ClcrClinicalSafety.pediatricUrineRatioThresholds(t)
            : null;
        if (!thresholds || thresholds.ageBand === "under6Months") {
          S +=
            '<div class="result-box" data-clcr-formula="PCR"><strong>Wiek &lt;6 miesięcy:</strong> pokazano wyłącznie wartości liczbowe; kalkulator nie stosuje automatycznych progów ACR/PCR w tej grupie.</div>';
          return;
        }
        if (thresholds.ageBand === "sixMonthsToUnder2") {
          if (isFiniteNum(pcrValue)) {
            const comparison =
              pcrValue < thresholds.pcrMgG ? "poniżej" : "równe lub powyżej";
            S += `<div class="result-box" data-clcr-formula="PCR"><strong>PCR 6 mies.–&lt;2 lata:</strong> ${comparison} ${thresholds.pcrMgG}\u202Fmg/g; KDIGO opisuje wartość &lt;${thresholds.pcrMgG}\u202Fmg/g w pierwszym porannym moczu jako zwykle prawidłową. Wynik graniczny lub wyższy wymaga potwierdzenia klinicznego.</div>`;
          }
          if (
            isFiniteNum(pcrValue) &&
            thresholds.nephroticPcrMgG &&
            pcrValue >= thresholds.nephroticPcrMgG
          ) {
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="PCR"><strong>PCR w zakresie nerczycowym:</strong> sam PCR nie rozpoznaje zespołu nerczycowego; potrzebne są albumina w surowicy, obrzęki i pełna ocena kliniczna.</div>';
          }
          return;
        }
        const findings = [];
        isFiniteNum(j) &&
          j >= thresholds.acrMgG &&
          findings.push(`ACR \u2265${thresholds.acrMgG}\u202Fmg/g`);
        isFiniteNum(pcrValue) &&
          pcrValue >= thresholds.pcrMgG &&
          findings.push(`PCR \u2265${thresholds.pcrMgG}\u202Fmg/g`);
        if (findings.length) {
          S += `<div class="result-box warn-yellow" data-clcr-formula="PCR"><strong>Pierwszy poranny mocz:</strong> ${clcrEscapeHtml(findings.join(" oraz "))}. Wynik wymaga powtórnego potwierdzenia, gdy dziecko jest zdrowe i nie miesiączkuje; sam wynik nie rozpoznaje PChN.</div>`;
        } else if (isFiniteNum(j) && isFiniteNum(pcrValue)) {
          S +=
            '<div class="result-box" data-clcr-formula="PCR"><strong>Pierwszy poranny mocz:</strong> ACR jest &lt;30\u202Fmg/g, a PCR &lt;200\u202Fmg/g; KDIGO opisuje te wartości jako zwykle prawidłowe u dzieci od 2. roku życia.</div>';
        }
        if (
          isFiniteNum(pcrValue) &&
          thresholds.nephroticPcrMgG &&
          pcrValue >= thresholds.nephroticPcrMgG
        ) {
          S +=
            '<div class="result-box warn-yellow" data-clcr-formula="PCR"><strong>PCR w zakresie nerczycowym:</strong> sam PCR nie rozpoznaje zespołu nerczycowego; potrzebne są albumina w surowicy, obrzęki i pełna ocena kliniczna.</div>';
        }
      } else if (o) {
        if (spotSampleKind !== "firstMorning") {
          const confirmation =
            isFiniteNum(j) && j >= 30
              ? " ACR \u226530\u202Fmg/g z próbki losowej należy potwierdzić kolejną pierwszą poranną próbką."
              : "";
          S += `<div class="result-box warn-yellow" data-clcr-formula="ACR"><strong>Rodzaj próbki:</strong> pierwszy poranny mocz jest preferowany; do czasu takiego pobrania kategoria A jest wstrzymana.${confirmation}</div>`;
        }
      }
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
        u && W && s > 0 && isFiniteNum(ne) ? (ne * 1.73) / W : null));
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
      (result.warnings || []).forEach((warning) => {
        S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(formulaId)}"><strong>Profil równania:</strong> ${clcrEscapeHtml(warning)}</div>`;
      });
      if (
        formulaId.startsWith("ckid_u25") &&
        cystatinCAssayMethod !== "nephelometric"
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
      switch (r) {
        case "egfr":
          m.egfr != null &&
            q(
              "2021 CKD\u2011EPI eGFRcr",
              m.egfr,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "egfr",
              r,
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
            );
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="ckid_u25"><strong>Profil CKiD U25:</strong> równanie opracowano głównie u dzieci i młodych osób z łagodną lub umiarkowaną CKD. Przy wysokim/prawidłowym GFR może zaniżać wynik; trend i kontekst kliniczny są ważniejsze niż pojedyncza liczba.</div>';
          }
          if (m.ckid_u25 != null && t >= 18 && t < 26) {
            S +=
              '<div class="result-box" data-clcr-formula="ckid_u25"><strong>Wiek 18–25 lat:</strong> zgodnie z NIDDK wynik CKiD U25 należy oceniać razem z wynikiem kalkulatora dla dorosłych (2021 CKD‑EPI).</div>';
          }
          break;
        case "neonatal_egfr":
          m.neonatal_egfr != null &&
            q(
              "eGFR noworodka donoszonego (0,31 \xD7 wzrost/Scr)",
              m.neonatal_egfr,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "neonatal_egfr",
              r,
            );
          if (m.neonatal_egfr != null) {
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="neonatal_egfr"><strong>Ograniczenie:</strong> wzór służy do identyfikacji zmienionej filtracji u noworodków donoszonych do 28. dnia życia; P30 wynosi 74,4%, dlatego wynik wymaga ostrożnej oceny klinicznej i nie otrzymuje kategorii G KDIGO.</div>';
            if (ageContext.daysOfLife < 3) {
              S +=
                '<div class="result-box warn-yellow" data-clcr-formula="neonatal_egfr"><strong>Pierwsze 72 godziny życia:</strong> kreatynina noworodka może nadal odzwierciedlać kreatyninę matczyną i szybko się zmieniać; wynik ma szczególnie wysoką niepewność.</div>';
            }
          }
          break;
        case "cg":
          if (m.cg != null) {
            q(
              "eCrCl Cockcroft\u2013Gault (masa rzeczywista)",
              m.cg,
              "\u202FmL/min",
              "cg",
              r,
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
            );
            appendCgContext();
          }
          break;
        case "cl24":
          if (m.cl24 != null) {
            q(
              "Zmierzony klirens kreatyniny (bezwzględny)",
              m.cl24.absoluteMlMin,
              "\u202FmL/min",
              "cl24",
              r,
            );
            q(
              `Zmierzony klirens kreatyniny (1,73\u202Fm\xB2; ${bsaMethod})`,
              m.cl24.indexedMlMin173,
              "\u202FmL/min/1,73\u202Fm\xB2",
              "cl24",
              r,
            );
            q(
              "Rzeczywisty czas zbiórki",
              m.cl24.durationHours,
              "\u202Fh",
              "collection_duration",
              r,
            );
            q(
              "Wydalanie kreatyniny przeliczone na dobę",
              m.cl24.creatinineMgDay,
              "\u202Fmg/24 h",
              "cer",
              r,
            );
            q(
              "Wydalanie kreatyniny przeliczone na masę ciała",
              m.cl24.creatinineMgKgDay,
              "\u202Fmg/kg/24 h",
              "cer",
              r,
            );
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="cl24"><strong>Ograniczenie:</strong> to zmierzony klirens kreatyniny, nie zmierzony GFR. Wydzielanie cewkowe kreatyniny zwykle zawyża GFR, a wynik jest bardzo wrażliwy na kompletność zbiórki. CER pokazano bez automatycznej oceny kompletności.</div>';
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
            );
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="sch_idms"><strong>Profil walidacyjny:</strong> równanie opracowano u dzieci z CKD w wieku 1–16 lat, z mierzonym GFR około 15–75 mL/min/1,73 m² i kreatyniną oznaczaną metodą zgodną z IDMS. CKiD U25 pozostaje preferowaną współczesną ścieżką kreatyninową.</div>';
          }
          break;
        case "ACR":
          if (isFiniteNum(j)) {
            q(
              "Albumina/kreatynina (ACR; próbka moczu)",
              j,
              "\u202Fmg/g",
              "acr",
              r,
            );
            q(
              "Albumina/kreatynina (ACR; jednostka alternatywna)",
              acrMgMmol,
              "\u202Fmg/mmol",
              "acr_mmol",
              r,
            );
          } else if (l === "ACR" && !sameSpotSpecimen) {
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="ACR"><strong>Nie obliczono:</strong> potwierdź, że albumina i kreatynina pochodzą z tej samej próbki.</div>';
          }
          break;
        case "PCR":
          if (isFiniteNum(pcrValue)) {
            q(
              "Białko/kreatynina (PCR; próbka moczu)",
              pcrValue,
              "\u202Fmg/g",
              "pcr",
              r,
            );
            q(
              "Białko/kreatynina (PCR; jednostka alternatywna)",
              pcrMgMmol,
              "\u202Fmg/mmol",
              "pcr_mmol",
              r,
            );
          } else if (l === "PCR" && !sameSpotSpecimen) {
            S +=
              '<div class="result-box warn-yellow" data-clcr-formula="PCR"><strong>Nie obliczono:</strong> potwierdź, że białko całkowite i kreatynina pochodzą z tej samej próbki.</div>';
          }
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
          transitionPartner && L(transitionPartner);
          if (
            transitionPartner &&
            !isFiniteNum(formulaMeta[transitionPartner]?.value)
          ) {
            S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(transitionPartner)}"><strong>Porównanie w wieku 18\u201125 lat niekompletne:</strong> NIDDK zaleca ocenę wyniku U25 razem z odpowiednim kalkulatorem dla dorosłych; uzupełnij wymagane markery, wzrost i metadane oznaczeń.</div>`;
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
          gfrEntries: partnerEntry
            ? [selectedEntry, partnerEntry]
            : [selectedEntry],
        });
      }
      else if (l === "neonatal_egfr" && selectedSafety.eligible)
        T({ includeG: !1, includeA: !1 });
      else if (l === "ACR") {
        T({ includeG: !1, includeA: !0 });
        appendSpotRatioGuidance();
      } else if (l === "PCR") {
        z();
        appendSpotRatioGuidance();
      }
      else z();
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
        appendSpotRatioGuidance();
        if (ageContext.totalMonths === 0 && ageContext.daysOfLife === null) {
          S +=
            '<div class="result-box warn-yellow" data-clcr-formula="neonatal_egfr"><strong>Wiek noworodkowy:</strong> podaj ukończone dni życia (0–28) i potwierdź urodzenie o czasie, aby ocenić dostępność wzoru.</div>';
        } else if (
          ageContext.totalMonths === 0 &&
          ageContext.daysOfLife !== null &&
          (populationContext.termStatus !== "term" ||
            !(Number(populationContext.bodyWeightKg) > 2.5) ||
            populationContext.scrAssay !== "enzymatic_idms")
        ) {
          const r =
            window.ClcrClinicalSafety &&
            typeof window.ClcrClinicalSafety.formulaSafety == "function"
              ? window.ClcrClinicalSafety.formulaSafety(
                  "neonatal_egfr",
                  ageContext,
                  creatinineContext,
                  populationContext,
                )
              : null;
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
        ].includes(populationContext.scrAssay),
        automaticCystatinEligible =
          cystatinCStandardization === "ERM-DA471/IFCC";
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
              markerEligible:
                automaticCreatinineEligible &&
                automaticCystatinEligible,
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
    const selectedCreatinineFormula = [
      "egfr",
      "ckid_u25",
      "egfr_cr_cys",
      "ckid_u25_cr_cys",
      "neonatal_egfr",
      "cg",
      "cg_norm",
      "cl24",
      "sch_idms",
    ].includes(l);
    const creatinineEstimateShown =
      selectedCreatinineFormula ||
      (!l &&
        [
          m.egfr,
          m.ckid_u25,
          m.egfr_cr_cys,
          m.ckid_u25_cr_cys,
          m.neonatal_egfr,
          m.cg,
          m.cg_norm,
          m.cl24,
          m.sch_idms && m.sch_idms.gfr,
        ].some(isFiniteNum));
    if (
      d &&
      creatinineEstimateShown &&
      populationContext.scrAssay !== "enzymatic_idms"
    ) {
      const assayMessage =
        populationContext.scrAssay === "jaffe_idms"
          ? "Podano metodę Jaffego kalibrowaną do IDMS. Równania pediatryczne i noworodkowe preferują oznaczenie enzymatyczne; uwzględnij możliwy wpływ metody, zwłaszcza przy małych stężeniach."
          : populationContext.scrAssay === "not_idms"
            ? "Nie potwierdzono standaryzacji do IDMS. Wynik równania kreatyninowego może nie być porównywalny z populacją walidacyjną i nie powinien być kategorycznie interpretowany."
            : "Nie podano metody oznaczenia kreatyniny. Równania zakładają kreatyninę standaryzowaną do IDMS; w pediatrii zalecana jest metoda enzymatyczna.";
      S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(l || "egfr")}"><strong>Metoda kreatyniny:</strong> ${clcrEscapeHtml(assayMessage)}</div>`;
    }
    if (
      creatinineContext.status === "unknown" &&
      d &&
      (!l || selectedCreatinineFormula) &&
      selectedSafety.eligible
    ) {
      const r = l || (t < 18 ? "ckid_u25" : "egfr");
      S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(r)}"><strong>Założenie kreatyniny:</strong> ${clcrEscapeHtml(creatinineContext.message)}</div>`;
    }
    if (
      creatinineContext.status === "unknown" &&
      cystatinC !== null &&
      (!l ||
        ["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(l))
    ) {
      S += `<div class="result-box warn-yellow" data-clcr-formula="${clcrEscapeHtml(l || (t < 26 ? "ckid_u25_cys" : "egfr_cr_cys"))}"><strong>Stan markerów filtracji:</strong> nie potwierdzono stanu stacjonarnego. Wynik jest oszacowaniem bez kategorii G; w ostrym procesie klinicznym należy ocenić dynamikę markerów i metody alternatywne.</div>`;
    }
    if (
      !l &&
      cystatinC !== null &&
      cystatinCStandardization !== "ERM-DA471/IFCC"
    ) {
      S +=
        '<div class="result-box warn-yellow" data-clcr-formula="ckid_u25_cys"><strong>Nie obliczono eGFR z cystatyną C:</strong> wymagane jest potwierdzenie identyfikowalności oznaczenia do ERM-DA471/IFCC.</div>';
    }
    le = S;
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
    _t = ratio(E, c),
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
  function y(i, l, u = "", S) {
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
    ve += `<div class="result-box${m ? "" : " out-of-range"}"><strong>${q}:</strong> ${l.toFixed(L)} ${u}${V}</div>`;
  }
  (y("Wydalanie kwasu moczowego", kt, "mg/kg/24 h", "UA_mgkg"),
    y("Wydalanie wapnia", Te, "mg/kg/24 h", "Ca_mgkg"),
    y("Wydalanie magnezu", xt, "mg/kg/24 h", "Mg_mgkg"),
    y(
      "Wydalanie fosforu nieorganicznego (P\u1D62)",
      Ct,
      "mg P/24 h",
      "PO4_mgkg",
    ),
    y("Wydalanie szczawianów", je, "mg/kg/24 h", "Ox_mgkg"),
    y("Wydalanie cytrynianów", Be, "mg/kg/24 h", "Cit_mgkg"),
    y("Kwas moczowy/kreatynina", Et, "mg/mg", "KM_Cr"),
    y("Wapń/kreatynina", St, "mg/mg", "Ca_Cr"),
    y("Magnez/wapń", Pt, "mg/mg", "Mg_Ca"),
    y("Fosfor nieorganiczny/kreatynina", It, "mg/mg", "PO4_Cr"),
    y("Wapń/cytryniany", yt, "mg/mg", "Ca_Cit"),
    y("Wydalanie\xA0sodu\xA0(Na)", bt, "mmol/24 h"),
    y("Wydalanie\xA0potasu\xA0(K)", zt, "mmol/24 h"),
    y(
      "Stosunek\xA0potasu\xA0do\xA0sumy\xA0potasu\xA0i\xA0sodu\xA0(K/(K+Na))",
      Ft,
      "%",
      "K_frac",
    ),
    y(
      "Luka anionowa surowicy (bez K; nieskorygowana o albuminę)",
      Tt,
      "mmol/L",
    ),
    y("Bia\u0142ko całkowite w DZM", vt, "mg/24 h"),
    y("Bia\u0142ko całkowite w DZM", proteinG24, "g/24 h"),
    o &&
      t < 18 &&
      y("Białko całkowite znormalizowane do BSA", proteinPerBsa, "mg/m\xB2/24 h"),
    y("Białko/kreatynina w DZM", Rt, "mg/mg"));
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
  [
    ["FENa", spotFeNa],
    ["FEK", spotFeK],
    ["FECl", spotFeCl],
    ["FEHCO\u2083", spotFeHco3],
  ].forEach(([label, result]) => {
    if (!result || !result.ok) return;
    renderedSpotFractionalExcretion = !0;
    y(
      `${label} (sparowana próbka punktowa)`,
      result.valuePct,
      "%",
    );
  });
  if (isFiniteNum(spotUag)) {
    y(
      "Luka anionowa moczu (UAG; próbka punktowa)",
      spotUag,
      "mmol/L",
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
  if (spotChemistryRequested && !spotPairedChemistry) {
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
      ve += `<div class="result-box" data-clcr-formula="TMP_GFR"><strong>TmP/GFR:</strong> ${tmpValueMmol}\u202Fmmol/L (${tmpValueMg}\u202Fmg/dL)</div>`;
      ve += `<div class="result-box" data-clcr-formula="TMP_GFR"><strong>TRP:</strong> ${trpPct}%</div>`;
      ve += `<div class="result-box" data-clcr-formula="TMP_GFR"><strong>FEPO\u2084:</strong> ${fePct}%</div>`;
      ve += `<div class="result-box" data-clcr-formula="TMP_GFR"><strong>Metoda:</strong> ${branchLabel}</div>`;
      ve +=
        '<div class="result-box" data-clcr-formula="TMP_GFR"><strong>Próbka:</strong> na czczo; drugi poranny mocz; krew i mocz pobrane równocześnie.</div>';
      ve +=
        '<div class="result-box warn-yellow" data-clcr-formula="TMP_GFR"><strong>Interpretacja:</strong> wynik należy oceniać łącznie z fosforem w surowicy, wiekiem, funkcją nerek i metodą laboratoryjną. Kalkulator nie stosuje automatycznych zakresów ani rozpoznania nerkowej utraty fosforanów.</div>';
    }
  }
  (clcrSetTrustedMarkup($("elecInfo"), ve, "electrolyte result html"),
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
    spotOxalateReportingEntity =
      $("oxalateSpotReportingEntity")?.value === "oxalic_acid"
        ? "oxalicAcid"
        : $("oxalateSpotReportingEntity")?.value === "oxalate_ion"
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
  function appendStoneValue(label, valueMarkup, cssClass = "") {
    if (!valueMarkup) return;
    he += `<div class="result-box${cssClass ? ` ${cssClass}` : ""}"><strong>${clcrEscapeHtml(label)}:</strong> ${valueMarkup}</div>`;
  }
  function appendStoneDzmValue(label, conversion, options = {}) {
    if (!conversion) return;
    if (!conversion.ok) {
      appendStoneValue(
        `${label} \u2014 nie obliczono`,
        clcrEscapeHtml(conversion.message || "Nieprawidłowe dane DZM."),
        "warn-yellow",
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
  function appendStoneInterpretation(label, result) {
    if (!result) return;
    appendStoneValue(
      result.ok ? label : `${label} \u2014 interpretacja wstrzymana`,
      clcrEscapeHtml(result.message || ""),
      stoneStatusClass(result),
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
          : null,
      spotCalciumCreatinineMolMol =
        sameSpotSpecimen &&
        spotCalciumMmolL !== null &&
        spotCalciumMmolL >= 0 &&
        spotCreatinineMmolL !== null &&
        spotCreatinineMmolL > 0
          ? spotCalciumMmolL / spotCreatinineMmolL
          : null,
      spotCalciumCreatinineMgMg =
        spotCalciumCreatinineMolMol === null
          ? null
          : (spotCalciumCreatinineMolMol * 40.078) / 113.1179,
      pediatricCaCr =
        o &&
        t < 18 &&
        spotCalciumCreatinineMolMol !== null &&
        stoneEngine &&
        typeof stoneEngine.interpretPediatricCalciumCreatinineSpot ===
          "function"
          ? stoneEngine.interpretPediatricCalciumCreatinineSpot({
              ageYears: ageContext.years,
              ageMonths: ageContext.months,
              ageDays: ageContext.daysOfLife || 0,
              ratioMolMol: spotCalciumCreatinineMolMol,
              ratioMgMg: spotCalciumCreatinineMgMg,
              sameSpecimen: sameSpotSpecimen,
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
    if (spotCalciumCreatinineMgMg !== null) {
      appendStoneValue(
        "Ca/Cr (ta sama próbka punktowa)",
        `${spotCalciumCreatinineMgMg.toFixed(3)} mg/mg (${formatStoneThresholdSafe(
          spotCalciumCreatinineMolMol,
          3,
          pediatricCaCr,
        )} mol/mol)`,
      );
    } else if (
      stoneFieldProvided("Ca_spot") ||
      stoneFieldProvided("Ucr_spot")
    ) {
      appendStoneValue(
        "Ca/Cr \u2014 nie obliczono",
        "Wapń i kreatynina muszą pochodzić z tej samej próbki, a kreatynina musi być większa od 0.",
        "warn-yellow",
      );
    }
    const spotOxalate = readClcrOptionalNumber("Ox_Cr_spot"),
      spotCitrate = readClcrOptionalNumber("Cit_Cr_spot"),
      spotOxCr =
        sameSpotSpecimen &&
        !!spotOxalateReportingEntity &&
        spotOxalate !== null &&
        spotOxalate >= 0 &&
        c !== null &&
        c > 0
          ? spotOxalate / c
          : null,
      spotCitCr =
        sameSpotSpecimen &&
        spotCitrate !== null &&
        spotCitrate >= 0 &&
        c !== null &&
        c > 0
          ? spotCitrate / c
          : null;
    spotOxCr !== null &&
      appendStoneValue(
        "Ox/Cr (ta sama próbka punktowa)",
        `${spotOxCr.toFixed(3)} ${
          spotOxalateReportingEntity === "oxalicAcid"
            ? "mg kwasu szczawiowego/mg kreatyniny"
            : "mg jonu szczawianowego/mg kreatyniny"
        } \u2014 bez automatycznego progu dla wieku`,
      );
    spotCitCr !== null &&
      appendStoneValue(
        "Cit/Cr (ta sama próbka punktowa)",
        `${spotCitCr.toFixed(3)} mg kwasu cytrynowego/mg kreatyniny \u2014 bez automatycznego progu dla wieku i płci`,
      );
    if (
      stoneFieldProvided("Ox_Cr_spot") &&
      !spotOxalateReportingEntity
    ) {
      appendStoneValue(
        "Ox/Cr \u2014 nie obliczono",
        "Wybierz z wyniku laboratorium, czy masa oznacza kwas szczawiowy, czy jon szczawianowy.",
        "warn-yellow",
      );
    }
    if (
      !sameSpotSpecimen &&
      (stoneFieldProvided("Ox_Cr_spot") ||
        stoneFieldProvided("Cit_Cr_spot"))
    ) {
      appendStoneValue(
        "Wskaźniki punktowe \u2014 nie obliczono",
        "Potwierdź, że analit i kreatynina pochodzą z tej samej próbki moczu.",
        "warn-yellow",
      );
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
        )} \u2014 pojedynczy wynik bez automatycznego rozpoznania`,
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
        formatStoneThresholdSafe(we, 2, adultStone && adultStone.ph),
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
        ["Wapń", adultStone.calcium],
        ["Magnez", adultStone.magnesium],
        ["Kwas moczowy", adultStone.uricAcid],
        ["Szczawiany", adultStone.oxalate],
        ["Cytryniany", adultStone.citrate],
        ["Fosfor nieorganiczny (P\u1D62)", adultStone.inorganicPhosphorus],
        ["Cystyna", adultStone.cystine],
        ["Cel objętości moczu", adultStone.urineVolume],
        ["Profil pH", adultStone.ph],
      ].forEach(([label, interpretation]) =>
        appendStoneInterpretation(label, interpretation),
      );
    } else if (o && t < 18) {
      appendStoneInterpretation("Wapń w DZM \u2014 pediatria", pediatricCa24);
      appendStoneInterpretation("Ca/Cr \u2014 pediatria", pediatricCaCr);
      if (
        stoneDzm.magnesium ||
        stoneDzm.uricAcid ||
        stoneDzm.phosphorus ||
        stoneDzm.oxalate ||
        stoneDzm.citrate ||
        stoneDzm.cystine ||
        spotOxCr !== null ||
        spotCitCr !== null
      ) {
        appendStoneValue(
          "Pozostałe parametry pediatryczne",
          "Pokazano wartości liczbowe bez automatycznych progów. Wiekowe tabele Ox/Cr, Cit/Cr, Mg/Cr, moczanów i wyników /1,73 m\u00B2 wymagają osobno wersjonowanego profilu referencyjnego.",
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
          clcrSetTrustedMarkup(i, u, "stone result html"),
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
          ktvResult.style.display = "block";
        }
        if (ektvResult && result.values.eKtV !== null) {
          const method = result.metadata.eKtVMethod;
          clcrSetTrustedMarkup(
            ektvResult,
            `<strong>Szacowane eKt/Vurea:</strong> ${clcrEscapeHtml(result.display.eKtV)}<br><span>Dostęp ${clcrEscapeHtml(method.access)}; T w minutach; C=${method.constantMinutes} min.</span>`,
            "ektv result",
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
  try {
    const o = document.createElement("div");
    (o.setAttribute("role", "status"),
      o.setAttribute("aria-live", "polite"),
      (o.textContent = t),
      (o.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(420px,calc(100vw - 32px));background:#fff;color:#2f3137;border:1px solid rgba(211,47,47,.28);border-left:4px solid #d32f2f;border-radius:14px;box-shadow:0 18px 45px rgba(0,0,0,.16);padding:12px 14px;font:500 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'),
      document.body.appendChild(o),
      setTimeout(() => {
        try {
          o.remove();
        } catch {}
      }, 9e3));
  } catch {}
}
function getClcrFormattedAge() {
  const e =
    window.ClcrClinicalSafety &&
    typeof window.ClcrClinicalSafety.readAgeFromDocument == "function"
      ? window.ClcrClinicalSafety.readAgeFromDocument(document)
      : null;
  return e && e.valid
    ? window.ClcrClinicalSafety.formatAge(e)
    : "wiek nieokreślony";
}
function getClcrCreatinineContextText() {
  const e = document.getElementById("creatinineState"),
    n = e?.options[e.selectedIndex]?.text || "Nie określono",
    t = document.getElementById("suspectedAKI")?.checked ? "tak" : "nie";
  return `${n}; podejrzenie AKI: ${t}`;
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
  clearBtn.addEventListener("click", () => {
    resetApp(!1);
  });
