// Moduł „Obliczenia dla dzieci z zespołem Downa" — centyle DS wagi, wzrostu, BMI (od 2 r.ż.),
// obwodu głowy i proporcji masy do długości (WFL DS, <2 lat) dla wieku 0–20 lat.
// Dane: window.DS z ds_lms.js — Zemel BS i wsp., Pediatrics 2015;136(5):e1204 (siatki DSGS/AAP).
// Naprawa etapów 2–3 po audycie (2026-09-01): bramka pustego wieku, walidacje pomiarów,
// Z-score w trybie PRO, tony i ogony 3/10/90/97 jak w całej aplikacji, nota źródłowa w karcie,
// ocena WFL DS zamiast noty „stosuj WFL". Silnik LMS bez zmian merytorycznych (etap 1 = dane).

function __ds_readAgeYears() {
  const n = document.getElementById("age"), e = document.getElementById("ageMonths");
  const a = n ? String(n.value).trim() : "", m = e ? String(e.value).trim() : "";
  if (a === "" && m === "") return NaN; // puste pola ≠ noworodek (bramka etapu 2)
  const t = parseFloat(a) || 0, i = parseFloat(m) || 0;
  return t + i / 12;
}
function __ds_readSex() {
  const n = document.getElementById("sex");
  return n && n.value === "F" ? "F" : "M";
}
function __ds_readWeight() {
  const n = document.getElementById("weight");
  return parseFloat(n && n.value);
}
function __ds_readHeightCm() {
  const n = document.getElementById("height");
  return parseFloat(n && n.value);
}

function __ds_zFromLMS(n, e, t, i) {
  return !(e > 0) || !(t > 0) || !(i > 0) ? NaN : n === 0 ? Math.log(i / e) / t : (Math.pow(i / e, n) - 1) / (n * t);
}
function __ds_phi(n) { return Math.exp(-0.5 * n * n) / Math.sqrt(2 * Math.PI); }
function __ds_cdf(n) {
  const e = 0.31938153, t = -0.356563782, i = 1.781477937, s = -1.821255978, d = 1.330274429,
    o = 1 / (1 + 0.2316419 * Math.abs(n)),
    u = ((((d * o + s) * o + i) * o + t) * o + e) * o,
    _ = 1 - __ds_phi(Math.abs(n)) * u;
  return n >= 0 ? _ : 1 - _;
}

// Klasyfikacja i format ogonów spójne z resztą aplikacji (obwody, proporcja masy): 3/10/90/97.
function __ds_classify(n) {
  if (n == null || !isFinite(n)) return "";
  if (n < 3 || n > 97) return "danger";
  if (n < 10 || n > 90) return "warning";
  return "";
}
function __ds_fmtPerc(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n < 3) return "&lt;3. centyla";
  if (n > 97) return "&gt;97. centyla";
  return Math.round(n) + ". centyl";
}
function __ds_round1(n) { return (Math.round(n * 10) / 10).toFixed(1).replace(".", ","); }
function __ds_fmtZ(n) {
  const t = n.toFixed(2).replace(".", ",");
  return n > 0 ? "+" + t : t;
}
function __ds_isPro() {
  try { const t = document.getElementById("resultsModeToggle"); if (t) return !!t.checked; } catch (e) { }
  try { if (typeof window.professionalMode !== "undefined") return !!window.professionalMode; } catch (e) { }
  try {
    const p = window.VildaPersistence && typeof window.VildaPersistence.readPreferenceRaw === "function"
      ? window.VildaPersistence.readPreferenceRaw("RESULTS_MODE", "standard") : null;
    if (p === "professional") return true;
  } catch (e) { }
  return false;
}

function __ds_interpMonths(n, e) {
  const t = Object.keys(n).map(Number).sort((u, _) => u - _);
  if (e <= t[0]) return n[String(t[0])];
  if (e >= t[t.length - 1]) return n[String(t[t.length - 1])];
  const i = Math.floor(e), s = Math.ceil(e), d = n[String(i)], r = n[String(s)];
  if (!d || !r || i === s) return d || r || null;
  const o = (e - i) / (s - i);
  return [d[0] + o * (r[0] - d[0]), d[1] + o * (r[1] - d[1]), d[2] + o * (r[2] - d[2])];
}
function __ds_interpYears(n, e) {
  const t = Object.keys(n).map(Number).sort((u, _) => u - _);
  if (e <= t[0]) return n[String(t[0])];
  if (e >= t[t.length - 1]) return n[String(t[t.length - 1])];
  let i = t[0], s = t[t.length - 1];
  for (let u = 1; u < t.length; u++) if (t[u] >= e) { s = t[u]; i = t[u - 1]; break; }
  const d = n[String(i)], r = n[String(s)];
  if (!d || !r || i === s) return d || r || null;
  const o = (e - i) / (s - i);
  return [d[0] + o * (r[0] - d[0]), d[1] + o * (r[1] - d[1]), d[2] + o * (r[2] - d[2])];
}

function __ds_getLMS(n, e, t) {
  if (!window.DS) return null;
  const i = window.DS;
  if (e < 2) {
    const s = Math.max(0, Math.min(36, e * 12));
    if (t === "WT") return __ds_interpMonths(n === "M" ? i.DS_INFANT_WEIGHT_BOYS : i.DS_INFANT_WEIGHT_GIRLS, s);
    if (t === "HT") return __ds_interpMonths(n === "M" ? i.DS_INFANT_LENGTH_BOYS : i.DS_INFANT_LENGTH_GIRLS, Math.max(1, s));
    if (t === "HC") return __ds_interpMonths(n === "M" ? i.DS_INFANT_HEAD_BOYS : i.DS_INFANT_HEAD_GIRLS, Math.max(1, s));
    return null;
  } else {
    const s = Math.min(20, Math.max(2, e));
    return t === "WT" ? __ds_interpYears(n === "M" ? i.DS_CHILD_WEIGHT_BOYS : i.DS_CHILD_WEIGHT_GIRLS, s)
      : t === "HT" ? __ds_interpYears(n === "M" ? i.DS_CHILD_HEIGHT_BOYS : i.DS_CHILD_HEIGHT_GIRLS, s)
      : t === "HC" ? __ds_interpYears(n === "M" ? i.DS_CHILD_HEAD_BOYS : i.DS_CHILD_HEAD_GIRLS, s)
      : t === "BMI" ? __ds_interpYears(n === "M" ? i.DS_CHILD_BMI_BOYS : i.DS_CHILD_BMI_GIRLS, s)
      : null;
  }
}
function __ds_percentile(n, e, t, i) {
  const s = __ds_getLMS(n, e, t);
  if (!s) return null;
  const d = __ds_zFromLMS(s[0], s[1], s[2], i);
  return isFinite(d) ? __ds_cdf(d) * 100 : null;
}

// Etap 3: proporcja masy do długości (weight-for-length DS, Zemel 0–36 mies.) —
// wiersz LMS interpolowany liniowo po DŁUGOŚCI (klucze cm; poza pokryciem → null).
function __ds_wflLMS(n, e) {
  if (!window.DS) return null;
  const t = n === "M" ? window.DS.DS_WFL_BOYS : window.DS.DS_WFL_GIRLS;
  if (!t) return null;
  const i = Object.keys(t).map(Number).sort((u, _) => u - _);
  if (!isFinite(e) || e < i[0] || e > i[i.length - 1]) return null;
  return __ds_interpMonths(t, e); // te same klucze całkowite co miesiące — interpolacja identyczna
}
function __ds_wflPercentile(n, e, t) {
  const i = __ds_wflLMS(n, e);
  if (!i) return null;
  const s = __ds_zFromLMS(i[0], i[1], i[2], t);
  return isFinite(s) ? __ds_cdf(s) * 100 : null;
}
function __ds_wflRange(n) {
  if (!window.DS) return null;
  const t = n === "M" ? window.DS.DS_WFL_BOYS : window.DS.DS_WFL_GIRLS;
  if (!t) return null;
  const i = Object.keys(t).map(Number).sort((u, _) => u - _);
  return [i[0], i[i.length - 1]];
}

// Linia wyniku: kolor centyla wg tonu, Z-score w trybie PRO.
function __ds_lineHtml(label, valueTxt, perc, z, pro) {
  const tone = __ds_classify(perc);
  const color = tone === "danger" ? "#c62828" : tone === "warning" ? "#c75d00" : "";
  const open = color ? `<span style="color:${color};font-weight:600">` : "<span>";
  let html = `<div><strong>${label}:</strong> <span class="result-val">${valueTxt}</span> — ${open}${__ds_fmtPerc(perc)}</span> (DS)`;
  if (pro && perc != null && isFinite(perc) && typeof z === "number" && isFinite(z)) {
    html += ` <span class="muted">(Z‑score = ${__ds_fmtZ(z)})</span>`;
  }
  return html + "</div>";
}
function __ds_zFor(sex, age, metric, value) {
  const s = __ds_getLMS(sex, age, metric);
  return s ? __ds_zFromLMS(s[0], s[1], s[2], value) : NaN;
}

const __DS_SOURCE_NOTE = '<div class="source-note" style="text-align:left;font-size:.8rem;margin-top:.6rem;">Źr\xF3dło referencyjne: Zemel i wsp., „Growth Charts for Children With Down Syndrome in the United States”, Pediatrics 2015 (siatki DSGS/AAP przyjęte przez CDC) — waga/długość/głowa/WFL 0–36 mies., waga/wzrost/BMI/głowa 2–20 lat.</div>';

function __ds_buildResultsHTML() {
  const n = __ds_readAgeYears(), e = __ds_readSex(), t = __ds_readWeight(), i = __ds_readHeightCm();
  const _ = [];
  if (!isFinite(n)) {
    return { html: '<div class="muted">Podaj wiek pacjenta w formularzu, aby obliczyć centyle DS.</div>', severity: "" };
  }
  if (!(n >= 0 && n <= 20)) {
    return { html: "<div>Wiek poza zakresem karty (0–20 lat).</div>", severity: "" };
  }
  const pro = __ds_isPro();
  let worst = "";
  const bump = (perc) => {
    const tone = __ds_classify(perc);
    if (tone === "danger") worst = "danger";
    else if (tone === "warning" && worst !== "danger") worst = "warning";
  };
  const badW = isFinite(t) && (t < 1 || t > 200);
  const badH = isFinite(i) && (i < 30 || i > 210);
  if (badW) _.push('<div><strong>Waga:</strong> <span class="muted">wartość poza wiarygodnym zakresem pomiaru — sprawdź, czy nie doszło do pomyłki.</span></div>');
  else if (isFinite(t)) {
    const r = __ds_percentile(e, n, "WT", t);
    _.push(__ds_lineHtml("Waga", __ds_round1(t) + " kg", r, __ds_zFor(e, n, "WT", t), pro)); bump(r);
  }
  if (badH) _.push('<div><strong>Wzrost:</strong> <span class="muted">wartość poza wiarygodnym zakresem pomiaru — sprawdź, czy nie doszło do pomyłki.</span></div>');
  else if (isFinite(i)) {
    const o = __ds_percentile(e, n, "HT", i);
    _.push(__ds_lineHtml("Wzrost", __ds_round1(i) + " cm", o, __ds_zFor(e, n, "HT", i), pro)); bump(o);
  }
  if (n < 2) {
    // Etap 3: zamiast noty „stosuj WFL" — prawdziwa ocena WFL DS z tej samej publikacji.
    if (isFinite(t) && isFinite(i) && !badW && !badH) {
      const w = __ds_wflPercentile(e, i, t);
      if (w != null) {
        const lms = __ds_wflLMS(e, i);
        const z = lms ? __ds_zFromLMS(lms[0], lms[1], lms[2], t) : NaN;
        _.push(__ds_lineHtml("Masa do długości (WFL DS)", __ds_round1(t) + " kg / " + __ds_round1(i) + " cm", w, z, pro)); bump(w);
      } else {
        const rng = __ds_wflRange(e);
        _.push('<div><strong>Masa do długości (WFL DS):</strong> <span class="muted">długość poza pokryciem norm' + (rng ? " (" + rng[0] + "–" + rng[1] + " cm)" : "") + ".</span></div>");
      }
    }
    _.push('<div><strong>BMI:</strong> — <span class="muted">Normy BMI DS obowiązują od 2. r.ż. — do 2 lat ocenia linia „Masa do długości (WFL DS)”.</span></div>');
  } else if (isFinite(t) && isFinite(i) && !badW && !badH && i > 0) {
    const s = i / 100, d = t / (s * s);
    const u = __ds_percentile(e, n, "BMI", d);
    _.push(__ds_lineHtml("BMI", __ds_round1(d), u, __ds_zFor(e, n, "BMI", d), pro)); bump(u);
  }
  if (_.length === 0) _.push('<div class="muted">Uzupełnij masę i wzrost w formularzu, aby zobaczyć centyle DS.</div>');
  _.push(__DS_SOURCE_NOTE);
  return { html: _.join(""), severity: worst };
}

function __ds_updateSectionVisibility() {
  const n = document.getElementById("downSyndromeSection");
  if (!n) return;
  const e = __ds_readAgeYears();
  // pusty wiek → sekcja widoczna (karta poprosi o wiek); ukrywamy tylko powyżej 20 lat
  if (!isFinite(e) || e <= 20) n.style.display = "block";
  else {
    n.style.display = "none";
    const t = document.getElementById("downSyndromeCard");
    t && (t.style.display = "none");
  }
}

function __ds_applySeverity(box, severity) {
  box.classList.remove("rr-warning", "rr-danger");
  if (severity === "warning") box.classList.add("rr-warning");
  else if (severity === "danger") box.classList.add("rr-danger");
}

function __ds_computeAndRender() {
  const n = document.getElementById("dsPercentiles");
  if (!n) return;
  const r = __ds_buildResultsHTML();
  vildaAppSetTrustedHtml(n, r.html, "app:box");
  __ds_applySeverity(n, r.severity);
  n.style.display = "block";
}

function __ds_updateHeadCirc() {
  const n = document.getElementById("headCircumResultDS"), e = document.getElementById("headCircumDS");
  if (!n || !e) return;
  const t = __ds_readAgeYears(), i = __ds_readSex(), s = parseFloat(e.value);
  if (!isFinite(s) || !isFinite(t) || !(t >= 0 && t <= 20)) {
    n.style.display = "none";
    n.classList.remove("rr-warning", "rr-danger");
    vildaAppClearHtml(n);
    return;
  }
  if (s < 25 || s > 65) {
    n.style.display = "block";
    __ds_applySeverity(n, "");
    vildaAppSetTrustedHtml(n, '<div><strong>Obw\xF3d głowy:</strong> <span class="muted">wartość poza wiarygodnym zakresem pomiaru — sprawdź, czy nie doszło do pomyłki.</span></div>', "app:out");
    return;
  }
  const d = __ds_percentile(i, t, "HC", s);
  if (d == null) {
    n.style.display = "block";
    __ds_applySeverity(n, "");
    vildaAppSetTrustedHtml(n, "<div>Brak danych DS dla obwodu głowy w tym wieku.</div>", "app:out");
  } else {
    n.style.display = "block";
    vildaAppSetTrustedHtml(n, __ds_lineHtml("Obw\xF3d głowy", __ds_round1(s) + " cm", d, __ds_zFor(i, t, "HC", s), __ds_isPro()), "app:out");
    __ds_applySeverity(n, __ds_classify(d));
  }
}

window.vildaAppOnReady("app:down-syndrome-module", function () {
  const e = document.getElementById("toggleDownSyndrome"),
    t = document.getElementById("downSyndromeCard"),
    i = document.getElementById("headCircumDS");
  __ds_updateSectionVisibility();
  e && t && e.addEventListener("click", function () {
    if (t.style.display === "none" || t.style.display === "") {
      t.style.display = "block";
      __ds_computeAndRender();
      __ds_updateHeadCirc();
    } else t.style.display = "none";
  });
  const refresh = function () {
    __ds_updateSectionVisibility();
    t && t.style.display === "block" && (__ds_computeAndRender(), __ds_updateHeadCirc());
  };
  ["age", "ageMonths", "weight", "height", "sex"].forEach(function (s) {
    const d = document.getElementById(s);
    d && d.addEventListener("input", refresh);
  });
  i && i.addEventListener("input", __ds_updateHeadCirc);
  const pro = document.getElementById("resultsModeToggle");
  pro && pro.addEventListener("change", refresh);
  document.addEventListener("vildaResultsModeChanged", refresh);
});

(function (e) {
  "use strict";
  if (!e) return;
  const t = {
    __vildaDownSyndromeModule: !0,
    version: "2.0.0",
    readAgeYears: typeof e.__ds_readAgeYears == "function" ? e.__ds_readAgeYears : null,
    readSex: typeof e.__ds_readSex == "function" ? e.__ds_readSex : null,
    readWeight: typeof e.__ds_readWeight == "function" ? e.__ds_readWeight : null,
    readHeightCm: typeof e.__ds_readHeightCm == "function" ? e.__ds_readHeightCm : null,
    percentile: typeof e.__ds_percentile == "function" ? e.__ds_percentile : null,
    wflPercentile: typeof e.__ds_wflPercentile == "function" ? e.__ds_wflPercentile : null,
    buildResultsHtml: typeof e.__ds_buildResultsHTML == "function" ? e.__ds_buildResultsHTML : null,
    updateSectionVisibility: typeof e.__ds_updateSectionVisibility == "function" ? e.__ds_updateSectionVisibility : null,
    computeAndRender: typeof e.__ds_computeAndRender == "function" ? e.__ds_computeAndRender : null,
    updateHeadCirc: typeof e.__ds_updateHeadCirc == "function" ? e.__ds_updateHeadCirc : null
  };
  e.VildaDownSyndrome = t;
  e.vildaDownSyndrome = t;
  e.vildaDownSyndromeVersion = function () { return t.version; };
})(typeof window < "u" ? window : globalThis);
