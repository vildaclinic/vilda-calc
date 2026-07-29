(function () {
  const C = { basic: "basic", advanced: "advanced", spot: "spot", pro: "pro" },
    timedCollectionProtocol = Object.freeze([
      "collectionStartAt",
      "collectionEndAt",
      "collectionStartVoidDiscarded",
      "collectionFinalVoidIncluded",
      "collectionNoMissedVoids",
      "collectionNoSpillage",
      "collectionNoExtraVoids",
      "collectionStorageFollowed",
    ]),
    ktvSamplingProtocol = Object.freeze([
      "ktvPostMethod",
      "ktvSameSession",
      "ktvPreBeforeDialysis",
      "ktvPreNoDilution",
    ]),
    l = [
      {
        id: "egfr",
        label: "2021 CKD\u2011EPI eGFRcr",
        version: "basic",
        requires: ["age", "sex", "Scr", "ScrUnit"],
        note: "Wzór wyłącznie dla wieku \u226518 lat. Zakłada kreatyninę standaryzowaną do IDMS; stabilność kreatyniny warunkuje interpretację i kategorię G.",
      },
      {
        id: "ckid_u25",
        label: "CKiD U25 eGFRcr (2021)",
        version: "basic",
        requires: ["age", "sex", "height", "Scr", "ScrUnit"],
        note: "Współczesny wzór pediatryczny opracowany głównie w łagodnej i umiarkowanej CKD. Przy wysokim/prawidłowym GFR może zaniżać wynik; u osób w wieku 18\u201125 lat zawsze porównaj także z 2021 CKD\u2011EPI.",
      },
      {
        id: "egfr_cr_cys",
        label: "2021 CKD\u2011EPI eGFRcr\u2011cys",
        version: "pro",
        requires: [
          "age",
          "sex",
          "Scr",
          "ScrUnit",
          "ScrAssay",
          "CystatinC",
          "CystatinCStandardization",
        ],
        note: "Równanie dla dorosłych \u226518 lat. Wymaga kreatyniny standaryzowanej do IDMS i cystatyny C identyfikowalnej do ERM\u2011DA471/IFCC.",
      },
      {
        id: "ckid_u25_cys",
        label: "CKiD U25 eGFRcys",
        version: "pro",
        requires: [
          "age",
          "sex",
          "CystatinC",
          "CystatinCStandardization",
        ],
        note: "Wiek 1\u201125 lat; profil łagodnej lub umiarkowanej CKD. Sam wariant cystatynowy nie jest przeznaczony do bezkrytycznego przesiewu zdrowej populacji.",
      },
      {
        id: "ckid_u25_cr_cys",
        label: "CKiD U25 eGFRcr\u2011cys (średnia)",
        version: "pro",
        requires: [
          "age",
          "sex",
          "height",
          "Scr",
          "ScrUnit",
          "ScrAssay",
          "CystatinC",
          "CystatinCStandardization",
        ],
        note: "Średnia arytmetyczna oszacowań CKiD U25 eGFRcr i eGFRcys dla wieku 1\u201125 lat. Preferowana, gdy oba markery są wiarygodne w profilu CKiD.",
      },
      {
        id: "neonatal_egfr",
        label: "eGFR noworodka donoszonego (0\u201328 dni)",
        version: "advanced",
        requires: [
          "age",
          "ageMonths",
          "ageDays",
          "neonatalTermStatus",
          "weight",
          "height",
          "Scr",
          "ScrUnit",
          "ScrAssay",
        ],
        note: "Wzór 0,31 \xD7 wzrost/Scr jest przeznaczony wyłącznie dla noworodków donoszonych do 28. dnia życia. Konserwatywna ścieżka wymaga aktualnej masy >2,5 kg i enzymatycznej kreatyniny standaryzowanej do IDMS.",
      },
      {
        id: "cg",
        label: "eCrCl Cockcroft\u2013Gault (masa rzeczywista)",
        version: "basic",
        requires: ["sex", "age", "weight", "Scr", "ScrUnit"],
        note: "Wynik nieindeksowany w mL/min wykorzystuje podaną rzeczywistą masę ciała. Przy otyłości, niedowadze, obrzękach lub nietypowej masie mięśniowej wymaga indywidualnej polityki masy; dawkowanie należy odnieść do informacji o konkretnym leku.",
      },
      {
        id: "cg_norm",
        label: "eCrCl Cockcroft\u2013Gault (1,73\xA0m\xB2; masa rzeczywista)",
        version: "basic",
        requires: ["sex", "age", "weight", "height", "Scr", "ScrUnit"],
        note: "Do przeliczenia na 1,73\xA0m\xB2 potrzebny jest wzrost. Indeksowanie nie usuwa błędu doboru masy; dawkowanie należy odnieść do informacji o konkretnym leku.",
      },
      {
        id: "cl24",
        label: "Zmierzony klirens kreatyniny (zbiórka czasowa)",
        version: "advanced",
        requires: [
          "age",
          "Ucr",
          "V24",
          "collectionStartAt",
          "collectionEndAt",
          "collectionStartVoidDiscarded",
          "collectionFinalVoidIncluded",
          "collectionNoMissedVoids",
          "collectionNoSpillage",
          "collectionNoExtraVoids",
          "collectionStorageFollowed",
          "serumSampleDuringCollection",
          "serumSampleAt",
          "Scr",
          "ScrUnit",
          "weight",
          "height",
        ],
        note: "Wymaga dokładnego czasu i kompletnego protokołu zbiórki, Ucr, V, czasu pobrania Scr mieszczącego się w okresie zbiórki oraz masy i wzrostu.",
      },
      {
        id: "sch_var",
        label: "Legacy Schwartz \u2014 wyłączony z rutynowego użycia",
        version: "basic",
        requires: ["age", "sex", "height", "Scr", "ScrUnit"],
        note: "Wzór historyczny; współczynnika k nie wolno dobierać wyłącznie na podstawie wieku.",
      },
      {
        id: "sch_idms",
        label: "Bedside Schwartz 2009 (IDMS)",
        version: "advanced",
        requires: ["age", "height", "Scr", "ScrUnit"],
        note: "Pomocnicze przybliżenie dostępne wyłącznie dla wieku 1\u201316 lat. Opracowano je u dzieci z CKD i mierzonym GFR około 15\u201175 mL/min/1,73 m\xB2, dla kreatyniny oznaczonej metodą zgodną z IDMS.",
      },
      {
        id: "UA_mgkg",
        label: "Wydalanie kwasu moczowego (DZM; bez automatycznej normy)",
        version: "advanced",
        requires: [
          "age",
          "U_UA",
          "V24",
          "weight",
          ...timedCollectionProtocol,
        ],
      },
      {
        id: "Ca_mgkg",
        label: "Wydalanie wapnia (DZM; bez automatycznej normy)",
        version: "advanced",
        requires: [
          "age",
          "U_Ca",
          "V24",
          "weight",
          ...timedCollectionProtocol,
        ],
      },
      {
        id: "Mg_mgkg",
        label: "Wydalanie magnezu (DZM; bez automatycznej normy)",
        version: "advanced",
        requires: [
          "age",
          "U_Mg",
          "V24",
          "weight",
          ...timedCollectionProtocol,
        ],
      },
      {
        id: "PO4_mgkg",
        label: "Wydalanie fosforu nieorganicznego (P\u1D62; DZM)",
        version: "advanced",
        requires: ["age", "U_PO4", "V24", ...timedCollectionProtocol],
      },
      {
        id: "Prot_mgkg",
        label: "Białko całkowite w DZM",
        version: "advanced",
        requires: ["age", "U_Prot", ...timedCollectionProtocol],
      },
      {
        id: "Na_mmol_d",
        label: "Wydalanie\xA0sodu (mmol/d)",
        version: "advanced",
        requires: ["age", "U_Na", "V24", ...timedCollectionProtocol],
      },
      {
        id: "K_mmol_d",
        label: "Wydalanie\xA0potasu (mmol/d)",
        version: "advanced",
        requires: ["age", "U_K", "V24", ...timedCollectionProtocol],
      },
      {
        id: "KM_Cr",
        label: "KM/Cr (kw.\xA0moczowy/kreatynina)",
        version: "advanced",
        requires: ["age", "U_UA", "Ucr"],
      },
      {
        id: "Ca_Cr",
        label: "Ca/Cr (DZM)",
        version: "advanced",
        requires: ["age", "U_Ca", "Ucr"],
      },
      {
        id: "Mg_Ca",
        label: "Mg/Ca (DZM)",
        version: "advanced",
        requires: ["U_Mg", "U_Ca"],
      },
      {
        id: "PO4_Cr",
        label: "P\u1D62/Cr (DZM) [mg/mg]",
        version: "advanced",
        requires: ["U_PO4", "Ucr"],
      },
      {
        id: "B_Cr",
        label: "Bia\u0142ko/kreatynina (B/Cr)",
        version: "advanced",
        requires: ["U_Prot", "Ucr", "V24"],
      },
      {
        id: "FENa_spot",
        label: "FENa \u2013 sparowana próbka punktowa (%)",
        version: "spot",
        requires: ["spotPairedChemistry", "U_Na_spot", "S_Na_spot", "Ucr_spot", "Ucr_spot_unit", "Scr_spot", "Scr_spot_unit"],
        note: "Wynik surowy bez uniwersalnego zakresu. Interpretacja zależy m.in. od AKI, CKD, diuretyków i czasu pobrania.",
      },
      {
        id: "FEK_spot",
        label: "FEK \u2013 sparowana próbka punktowa (%)",
        version: "spot",
        requires: ["spotPairedChemistry", "U_K_spot", "S_K_spot", "Ucr_spot", "Ucr_spot_unit", "Scr_spot", "Scr_spot_unit"],
        note: "Wynik surowy bez uniwersalnego zakresu; wymaga kontekstu klinicznego.",
      },
      {
        id: "FECl_spot",
        label: "FECl \u2013 sparowana próbka punktowa (%)",
        version: "spot",
        requires: ["spotPairedChemistry", "U_Cl_spot", "S_Cl_spot", "Ucr_spot", "Ucr_spot_unit", "Scr_spot", "Scr_spot_unit"],
        note: "Wynik surowy bez uniwersalnego zakresu; wymaga kontekstu klinicznego.",
      },
      {
        id: "FEHCO3_spot",
        label: "FEHCO\u2083 \u2013 sparowana próbka punktowa (%)",
        version: "spot",
        requires: ["spotPairedChemistry", "U_HCO3_spot", "S_HCO3_spot", "Ucr_spot", "Ucr_spot_unit", "Scr_spot", "Scr_spot_unit"],
        note: "Bez potwierdzonego protokołu obciążenia wodorowęglanem kalkulator pokazuje wyłącznie wynik surowy.",
      },
      {
        id: "AGs",
        label: "Luka anionowa surowicy (bez K)",
        version: "advanced",
        requires: ["age", "S_Na", "S_Cl", "S_HCO3"],
      },
      {
        id: "AGu_spot",
        label: "Luka anionowa moczu (UAG; sparowana próbka punktowa)",
        version: "spot",
        requires: ["spotPairedChemistry", "U_Na_spot", "U_K_spot", "U_Cl_spot"],
        note: "Bez uniwersalnej normy; interpretować wyłącznie w odpowiednim kontekście kwasicy metabolicznej.",
      },
      {
        id: "K_frac",
        label: "K/(K+Na) w moczu (%)",
        version: "advanced",
        requires: ["age", "U_K", "U_Na"],
      },
      {
        id: "ACR",
        label: "ACR \u2013 albumina/kreatynina (spot) [mg/g]",
        version: "spot",
        requires: [
          "spotSameSpecimen",
          "U_Alb",
          "Ucr_spot",
          "Ucr_spot_unit",
        ],
        note: "Albumina i kreatynina muszą pochodzić z tej samej próbki; u dzieci preferowany jest pierwszy poranny mocz oraz równoległy PCR.",
      },
      {
        id: "PCR",
        label: "PCR \u2013 białko/kreatynina (spot) [mg/g]",
        version: "spot",
        requires: [
          "spotSameSpecimen",
          "U_Prot_spot",
          "Ucr_spot",
          "Ucr_spot_unit",
        ],
        note: "Białko całkowite i kreatynina muszą pochodzić z tej samej próbki; u dzieci oznaczaj PCR razem z ACR.",
      },
      {
        id: "CaCr_spot",
        label: "Ca/Cr (spot) [mg/mg]",
        version: "spot",
        requires: [
          "age",
          "spotSameSpecimen",
          "Ca_spot",
          "Ca_spot_unit",
          "Ucr_spot",
          "Ucr_spot_unit",
        ],
      },
      {
        id: "OxCr_spot",
        label: "Ox/Cr (spot) [mg/mg]",
        version: "spot",
        requires: [
          "spotSameSpecimen",
          "oxalateSpotReportingEntity",
          "Ox_Cr_spot",
          "Ucr_spot",
          "Ucr_spot_unit",
        ],
      },
      {
        id: "CitCr_spot",
        label: "Cit/Cr (spot) [mg/mg]",
        version: "spot",
        requires: [
          "age",
          "spotSameSpecimen",
          "Cit_Cr_spot",
          "Ucr_spot",
          "Ucr_spot_unit",
        ],
      },
      {
        id: "TMP_GFR",
        label: "TmP/GFR i TRP (sparowana próbka)",
        version: "spot",
        requires: [
          "age",
          "spotSampleKind",
          "tmpOvernightFasting",
          "tmpPairedSameTime",
          "U_PO4_spot",
          "U_PO4_spot_unit",
          "S_PO4_spot",
          "S_PO4_spot_unit",
          "Ucr_spot",
          "Ucr_spot_unit",
          "Scr_spot",
          "Scr_spot_unit",
        ],
        note: "Wymaga drugiego porannego moczu po nocnym pozostawaniu na czczo oraz równocześnie pobranej próbki krwi.",
      },
      {
        id: "pH_spot",
        label: "pH pr\xF3bki moczu (spot)",
        version: "spot",
        requires: ["U_pH"],
      },
      {
        id: "Ox_mgkg",
        label: "Wydalanie szczawianów (DZM; bez automatycznej normy)",
        version: "pro",
        requires: [
          "age",
          "U_Ox",
          "oxalateReportingEntity",
          "V24",
          "weight",
          ...timedCollectionProtocol,
        ],
      },
      {
        id: "Cit_mgkg",
        label: "Wydalanie cytrynianów (DZM; bez automatycznej normy)",
        version: "pro",
        requires: [
          "age",
          "U_Cit",
          "V24",
          "weight",
          ...timedCollectionProtocol,
        ],
      },
      {
        id: "Ca_Cit",
        label: "Stosunek Ca/Cit (mg/mg)",
        version: "pro",
        requires: ["U_Ca", "U_Cit"],
      },
      {
        id: "pH24",
        label: "pH dobowej zbi\xF3rki (24\xA0h)",
        version: "pro",
        requires: ["pH24", ...timedCollectionProtocol],
      },
      {
        id: "KTV",
        label: "spKt/Vurea, eKt/Vurea i URR (IHD)",
        version: "pro",
        requires: [
          "age",
          "ktvModality",
          "ktvSessionsPerWeek",
          "ktvPidiDays",
          "ktvDurationMinutes",
          "ktvUF",
          "ktvW",
          "ktvUreaAnalyte",
          "ktvUreaUnit",
          "UreaPre",
          "UreaPost",
          ...ktvSamplingProtocol,
        ],
        note: "GFAC jest dobierany wyłącznie dla dokładnie udokumentowanej pary częstości IHD i rzeczywistego PIDI; interpretacja progowa wymaga dodatkowo protokołu próbek i aktualnego Kru.",
      },
    ];
  (function () {
    const e = new Set([
        "cg",
        "cg_norm",
        "egfr",
        "sch_var",
        "sch_idms",
        "UA_mgkg",
        "Ca_mgkg",
        "Mg_mgkg",
        "PO4_mgkg",
        "Prot_mgkg",
        "Na_mmol_d",
        "K_mmol_d",
        "KM_Cr",
        "Ca_Cr",
        "CaCr_spot",
        "CitCr_spot",
        "Cit_mgkg",
        "FENa_spot",
        "FEK_spot",
        "FECl_spot",
        "FEHCO3_spot",
        "K_frac",
        "AGs",
        "AGu_spot",
        "TMP_GFR",
      ]),
      r = new Set([]),
      timedCollectionIds = new Set([
        "UA_mgkg",
        "Ca_mgkg",
        "Mg_mgkg",
        "PO4_mgkg",
        "Prot_mgkg",
        "Na_mmol_d",
        "K_mmol_d",
        "Ox_mgkg",
        "Cit_mgkg",
      ]),
      timedCollectionRequirements = [
        "collectionStartAt",
        "collectionEndAt",
        "collectionStartVoidDiscarded",
        "collectionFinalVoidIncluded",
        "collectionNoMissedVoids",
        "collectionNoSpillage",
        "collectionNoExtraVoids",
        "collectionStorageFollowed",
      ];
    l.forEach((t) => {
      (e.has(t.id) &&
        Array.isArray(t.requires) &&
        !t.requires.includes("age") &&
        t.requires.unshift("age"),
        r.has(t.id) &&
          Array.isArray(t.requires) &&
          !t.requires.includes("sex") &&
          t.requires.unshift("sex"),
        timedCollectionIds.has(t.id) &&
          Array.isArray(t.requires) &&
          timedCollectionRequirements.forEach((requirement) => {
            t.requires.includes(requirement) ||
              t.requires.push(requirement);
          }));
    });
  })();
  const f = {
    "Klirens/eGFR": new Set([
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
    ]),
    DZM: new Set([
      "UA_mgkg",
      "Ca_mgkg",
      "Mg_mgkg",
      "PO4_mgkg",
      "Prot_mgkg",
      "Na_mmol_d",
      "K_mmol_d",
      "KM_Cr",
      "Ca_Cr",
      "Mg_Ca",
      "PO4_Cr",
      "B_Cr",
      "AGs",
      "K_frac",
    ]),
    "Pr\xF3bka moczu (spot)": new Set([
      "ACR",
      "PCR",
      "CaCr_spot",
      "OxCr_spot",
      "CitCr_spot",
      "FENa_spot",
      "FEK_spot",
      "FECl_spot",
      "FEHCO3_spot",
      "AGu_spot",
      "TMP_GFR",
      "pH_spot",
    ]),
    Kamica: new Set(["Ox_mgkg", "Cit_mgkg", "Ca_Cit", "pH24"]),
    "KT/V": new Set(["KTV"]),
  };
  let u = [];
  function v(e) {
    return window.VildaHtml && typeof window.VildaHtml.escapeHtml == "function"
      ? window.VildaHtml.escapeHtml(e)
      : String(e ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
  }
  function P(e) {
    return window.VildaHtml && typeof window.VildaHtml.escapeAttr == "function"
      ? window.VildaHtml.escapeAttr(e)
      : v(e).replace(new RegExp("`", "g"), "&#96;");
  }
  function b(e, r, t) {
    return e
      ? window.VildaHtml && typeof window.VildaHtml.setTrustedHtml == "function"
        ? window.VildaHtml.setTrustedHtml(e, r || "", {
            context: t || "clcr:trusted-markup",
          })
        : ((e.textContent = r || ""), !0)
      : !1;
  }
  function h(e) {
    return e
      ? window.VildaHtml && typeof window.VildaHtml.clearHtml == "function"
        ? window.VildaHtml.clearHtml(e)
        : ((e.textContent = ""), !0)
      : !1;
  }
  function c(e = "") {
    const r = document.getElementById("formulaPicker"),
      t = document.getElementById("formulaLive");
    if (!r || !t) return;
    const o = r.value;
    ([...r.options].slice(1).forEach((a) => a.remove()),
      r.querySelectorAll("optgroup").forEach((a) => a.remove()));
    let i = [];
    if (
      ([
        "Klirens/eGFR",
        "DZM",
        "Pr\xF3bka moczu (spot)",
        "Kamica",
        "KT/V",
      ].forEach((a) => {
        const n = u.filter((d) => f[a] && f[a].has(d.id)),
          s = e
            ? n.filter((d) => d.label.toLowerCase().includes(e.toLowerCase()))
            : n;
        if (s.length === 0) return;
        const w = document.createElement("optgroup");
        ((w.label = a),
          s.forEach((d) => {
            const y = document.createElement("option");
            ((y.value = d.id), (y.textContent = d.label), w.appendChild(y));
          }),
          r.appendChild(w),
          (i = i.concat(s)));
      }),
      e && i.length)
    ) {
      t.style.display = "";
      const a = i
        .slice(0, 30)
        .map(
          (n) =>
            `<div class="fl-item" data-id="${v(n.id)}" style="padding:.4rem .55rem; cursor:pointer; border-top:1px solid #f1f3f3;">${v(n.label)}</div>`,
        )
        .join("");
      clcrSetTrustedMarkup(t, a, "formula live list");
    } else ((t.style.display = "none"), clcrClearElement(t));
    if (o && [...r.options].some((a) => a.value === o)) r.value = o;
    else if (o) {
      r.value = "";
      typeof window.update == "function" && window.update();
    }
  }
  function E(e) {
    if (e.id === "sch_var") return !1;
    const r =
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.readAgeFromDocument == "function"
        ? window.ClcrClinicalSafety.readAgeFromDocument(document)
        : null;
    if (!r || !r.valid) return !0;
    return window.ClcrClinicalSafety.formulaEligibility(e.id, r).eligible;
  }
  function S() {
    if (!document.getElementById("formulaPicker")) return;
    const e = document.getElementById("formulaPicker"),
      r = e ? e.value : "",
      t = l.find((i) => i.id === r);
    ((u = [...l]
      .filter((i) => Object.values(f).some((o) => o.has(i.id)))
      .filter(E)
      .sort((t, i) =>
        t.label.localeCompare(i.label, "pl", { sensitivity: "base" }),
      )),
      (window.ALL_FORMS_SORTED = u),
      c(""));
    if (e && r && u.some((i) => i.id === r)) e.value = r;
    if (e && r && !u.some((i) => i.id === r)) {
      e.value = "";
      const i =
        t &&
        window.ClcrClinicalSafety &&
        typeof window.ClcrClinicalSafety.formulaEligibility == "function"
          ? window.ClcrClinicalSafety.formulaEligibility(
              t.id,
              window.ClcrClinicalSafety.readAgeFromDocument(document),
            )
          : null;
      p(i && i.reason ? i.reason : "Ten wzór nie jest dostępny dla podanego wieku.");
      typeof window.update == "function" && window.update();
    }
    const i =
      document.documentElement.dataset.clcrWorkflowUi === "1"
        ? null
        : document.getElementById("formulaSearch");
    i &&
      !i.dataset.clcrFormulaSearchBound &&
      ((i.dataset.clcrFormulaSearchBound = "1"),
      i.addEventListener("input", () => {
        S();
        c(i.value || "");
      }),
      i.addEventListener("focus", () => {
        S();
      }));
  }
  function _(e) {
    const r = C[e] || e;
    if (typeof window.applyVersion == "function") window.applyVersion(r);
    else {
      const t = document.querySelector(`.version-option[data-version="${r}"]`);
      t && !t.classList.contains("selected") && t.click();
    }
  }
  function g() {
    (document
      .querySelectorAll(".must-fill")
      .forEach((e) => e.classList.remove("must-fill")),
      document
        .querySelectorAll(".must-fill-group")
        .forEach((e) => e.classList.remove("must-fill-group")));
  }
  function p(e) {
    const r = document.getElementById("formulaNote");
    r &&
      (e
        ? ((r.style.display = ""), (r.textContent = e))
        : ((r.style.display = "none"), (r.textContent = "")));
  }
  function m(e, r = !1) {
    if ((g(), !e || !Array.isArray(e.requires))) return;
    let t = null;
    if (
      (e.requires.forEach((i) => {
        const o = document.getElementById(i);
        if (!o) return;
        const missing =
          o.type === "checkbox"
            ? !o.checked
            : (o.value == null ? "" : String(o.value)).trim() === "";
        if (missing) {
          o.classList.add("must-fill");
          const s = o.closest(".input-group") || o.closest("label");
          (s && s.classList.add("must-fill-group"), t || (t = s || o));
        }
      }),
      t && r)
    )
      try {
        t.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
  }
  function U() {
    window.clcrIsResetting = !0;
    let e = !1;
    const r = document.getElementById("samePatientMode"),
      t = typeof window < "u" && window.__vildaClcrPreserveVersionValues === !0;
    (((r && r.checked) || t) && (e = !0),
      !e && typeof resetApp == "function" && resetApp(!0));
    const i = document.getElementById("formulaPicker"),
      o = i ? l.find((n) => n.id === i.value) : null;
    if ((p(""), g(), !o)) {
      window.clcrIsResetting = !1;
      return;
    }
    if (
      window.ClcrClinicalSafety &&
      typeof window.ClcrClinicalSafety.formulaEligibility == "function"
    ) {
      const n = window.ClcrClinicalSafety.formulaEligibility(
        o.id,
        window.ClcrClinicalSafety.readAgeFromDocument(document),
      );
      if (!n.eligible) {
        (p(n.reason), i && (i.value = ""), (window.clcrIsResetting = !1));
        typeof window.update == "function" && window.update();
        return;
      }
    }
    if (o.id === "KTV") {
      typeof window.applyVersion == "function"
        ? window.applyVersion("pro")
        : _("pro");
      const n = document.getElementById("ktvToggle");
      (n && !n.checked && (n.checked = !0),
        setTimeout(() => {
          (m(o, !0),
            o.note && p(o.note),
            typeof window.update == "function" && window.update(),
            (window.clcrIsResetting = !1));
        }, 80));
      return;
    }
    const a = o.version;
    setTimeout(() => {
      let n = !1;
      if (typeof window.applyVersion == "function")
        try {
          (window.applyVersion(a), (n = !0));
        } catch {
          n = !1;
        }
      if (!n)
        try {
          typeof _ == "function" && (_(a), (n = !0));
        } catch {
          n = !1;
        }
      if (!n) {
        const s = document.querySelector(
          `.version-option[data-version="${a}"]`,
        );
        if (s && !s.classList.contains("selected"))
          try {
            (s.click(), (n = !0));
          } catch {}
      }
      (m(o, !0),
        o.note && p(o.note),
        typeof window.update == "function" && window.update(),
        (window.clcrIsResetting = !1));
    }, 80);
  }
  (document.addEventListener("DOMContentLoaded", () => {
    S();
    const e = document.getElementById("formulaPicker");
    if (e && document.documentElement.dataset.clcrWorkflowUi !== "1") {
      const r = () => {
        const t = document.getElementById("formulaSearch");
        (t && t.value && (t.value = ""), typeof S == "function" && S());
        const i = document.getElementById("formulaLive");
        i && ((i.style.display = "none"), clcrClearElement(i));
      };
      (e.addEventListener("mousedown", r), e.addEventListener("focus", r));
    }
    document
      .querySelectorAll("#clcrForm input, #clcrForm select")
      .forEach((r) => {
        r.addEventListener("input", () => {
          const t = document.getElementById("formulaPicker"),
            i = t ? l.find((o) => o.id === t.value) : null;
          i && m(i, !1);
        });
      });
    ["age", "ageMonths", "ageDays"].forEach((r) => {
      const t = document.getElementById(r);
      t &&
        t.addEventListener("input", () => {
          S();
        });
    });
  }),
    (window.onFormulaChange = U),
    (window.setVersion = typeof _ < "u" ? _ : window.setVersion),
    (window.highlightFields = typeof m < "u" ? m : window.highlightFields),
    (window.clearFormulaMustFill =
      typeof g < "u" ? g : window.clearFormulaMustFill),
    (window.showFormulaNote = typeof p < "u" ? p : window.showFormulaNote),
    (window.renderFormulaOptions =
      typeof c < "u" ? c : window.renderFormulaOptions),
    (window.refreshClcrFormulaOptions =
      typeof S < "u" ? S : window.refreshClcrFormulaOptions),
    (window.resetApp = typeof resetApp < "u" ? resetApp : window.resetApp),
    (window.FORMULAS = typeof l < "u" ? l : window.FORMULAS),
    (window.ALL_FORMS_SORTED = typeof u < "u" ? u : window.ALL_FORMS_SORTED),
    (window.applyVersion =
      typeof applyVersion < "u" ? applyVersion : window.applyVersion));
})();
