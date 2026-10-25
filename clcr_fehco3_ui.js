(function (root, factory) {
  const api = factory();
  if (root) root.ClcrFehco3Ui = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const VALUE_FIELDS = ["U_HCO3_spot", "Ucr_spot", "S_HCO3_spot", "Scr_spot"];

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function element(documentRef, tag, className, text) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function move(layout, node, target) {
    if (!node || !target || node.parentNode === target) return;
    if (!layout.moves.has(node)) {
      const anchor = layout.document.createComment("fehco3-field-origin");
      node.parentNode.insertBefore(anchor, node);
      layout.moves.set(node, anchor);
    }
    target.appendChild(node);
  }

  function emit(layout, control) {
    const EventClass = layout.document.defaultView?.Event;
    if (!control || !EventClass) return;
    control.dispatchEvent(new EventClass("input", { bubbles: true }));
    control.dispatchEvent(new EventClass("change", { bubbles: true }));
  }

  function currentInput(layout) {
    return layout.document.defaultView?.VildaClcrFehco3?.readInputFromDocument?.(layout.document) || {};
  }

  function refreshLayout(layout) {
    const input = currentInput(layout);
    const age = typeof input.ageYears === "number" && Number.isFinite(input.ageYears) ? input.ageYears : null;
    const context = input.ageContext;
    const yearsText = value => `${value} ${value === 1 ? "rok" : value % 10 >= 2 && value % 10 <= 4 && !(value % 100 >= 12 && value % 100 <= 14) ? "lata" : "lat"}`;
    const stated = value => value != null && String(value).trim() !== "";
    const hasDays = context?.precision === "completed-days" && stated(context.rawDays);
    const hasMonths = context?.precision === "completed-months" && stated(context.rawMonths);
    const ageText = context?.valid && hasDays && Number.isInteger(context.daysOfLife) && context.daysOfLife >= 0
      ? `${context.daysOfLife} dni życia`
      : context?.valid && Number.isInteger(context.years)
        ? hasMonths && Number.isInteger(context.months)
          ? context.years === 0 ? `${context.months} mies.` : `${yearsText(context.years)} · ${context.months} mies.`
          : yearsText(context.years)
        : age === null ? "niepodany" : age < 1 ? `${Math.round(age * 12)} mies.` : yearsText(Math.floor(age));
    layout.age.textContent = `Wiek z danych pacjenta: ${ageText}`;
    const filled = VALUE_FIELDS.filter((id, index) => {
      const raw = layout.document.getElementById(id)?.value?.trim();
      if (!raw) return false;
      const value = Number(raw.replace(",", "."));
      return Number.isFinite(value) && (index === 0 ? value >= 0 : value > 0);
    }).length;
    layout.count.textContent = `${filled}/4`;
    layout.progressTrack.dataset.filled = String(filled);
    layout.progressTrack.setAttribute("aria-valuenow", String(filled));
    const status = layout.document.getElementById("FENa_sample_status")?.value || "";
    const urineProblem = input.sameUrineSpecimen === false || input.sameUrineSpecimen === "no" || input.sameUrineSpecimen === "different" || status === "different-urine";
    const timeProblem = input.pairedSameTime === false || input.pairedSameTime === "no" || input.pairedSameTime === "different" || status === "different-time";
    layout.problemSelect.value = urineProblem ? "different-urine" : timeProblem ? "different-time" : "";
    layout.fact.textContent = urineProblem ? "Zapisano oznaczenia z różnych próbek moczu. Obliczenie pozostaje zablokowane."
      : timeProblem ? "Zapisano krew pobraną w innym czasie niż mocz. Obliczenie pozostaje zablokowane." : "";
    layout.fact.hidden = !urineProblem && !timeProblem;
  }

  function createLayout(documentRef, options) {
    const form = documentRef.getElementById("clcrForm");
    if (!form) return null;
    const card = element(documentRef, "section", "fehco3-input-card");
    card.id = "fehco3InputCard";
    card.setAttribute("aria-label", "Dane do FEHCO₃");
    const heading = element(documentRef, "div", "fehco3-readiness");
    const count = element(documentRef, "strong");
    count.id = "fehco3RequiredCount";
    heading.append(element(documentRef, "span", "", "Wymagane dane"), count);
    const progressTrack = element(documentRef, "div", "fehco3-progress-track");
    progressTrack.setAttribute("role", "progressbar");
    progressTrack.setAttribute("aria-label", "Uzupełnione stężenia do FEHCO₃");
    progressTrack.setAttribute("aria-valuemin", "0");
    progressTrack.setAttribute("aria-valuemax", "4");
    const progress = element(documentRef, "span");
    progress.id = "fehco3ProgressBar";
    progressTrack.append(progress);
    const age = element(documentRef, "p", "fehco3-patient-age");
    const groups = {};
    [["urine", "Mocz", "fehco3UrineFields"], ["serum", "Krew", "fehco3SerumFields"]].forEach(([key, title, id]) => {
      const section = element(documentRef, "section", "fehco3-sample-group");
      section.id = id;
      const groupHeading = element(documentRef, "h3", "", title);
      groupHeading.id = `${id}Heading`;
      section.setAttribute("aria-labelledby", groupHeading.id);
      section.append(groupHeading);
      groups[key] = section;
    });
    const assumption = element(documentRef, "p", "fehco3-assumption", "Zakładamy tę samą próbkę moczu i równoczesne pobranie krwi.");
    const details = element(documentRef, "details", "fehco3-sample-info");
    details.id = "fehco3SampleInfo";
    details.append(element(documentRef, "summary", "", "Znany problem z próbkami"));
    const label = element(documentRef, "label", "", "Zmień tylko, jeśli masz taką informację");
    label.htmlFor = "ui_fehco3_sample_issue";
    const problemSelect = element(documentRef, "select");
    problemSelect.id = "ui_fehco3_sample_issue";
    problemSelect.dataset.clcrDerivedControl = "true";
    [["", "Nie podano problemu"], ["different-urine", "Oznaczenia moczu z różnych próbek"], ["different-time", "Krew pobrana w innym czasie"]].forEach(([value, text]) => {
      const option = element(documentRef, "option", "", text); option.value = value; problemSelect.append(option);
    });
    const fact = element(documentRef, "p", "fehco3-known-sample-fact");
    details.append(label, problemSelect, fact);
    const inputHelp = element(documentRef, "p", "fehco3-input-help", "Z gazometrii wpisz HCO₃⁻ aktualne, nie standardowe.");
    card.append(heading, progressTrack, age, groups.urine, groups.serum, inputHelp, assumption, details);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const layout = { document: documentRef, form, card, groups, count, progress, progressTrack, age, details, problemSelect, fact,
      moves: new Map(), names: new Map(), attributes: new Map(), rows: new Map(), optionLabels: new Map(), fieldViews: options.fieldViews };
    const writeSampleFact = (id, checked, answerValue = checked ? "yes" : "no") => {
      const checkbox = documentRef.getElementById(id);
      const answer = documentRef.getElementById(`ui_${id}_answer`);
      if (checkbox) checkbox.checked = checked;
      if (answer) answer.value = answerValue;
      const vault = documentRef.defaultView?.__vildaClcrVersionValueVault;
      if (vault) { vault[id] = checked; vault[`ui_${id}_answer`] = answerValue; }
      return answer || checkbox;
    };
    const commitSampleProblem = () => {
      const control = documentRef.getElementById("FENa_sample_status");
      const selected = problemSelect.value;
      if (selected) {
        const changed = control.value !== selected;
        control.value = selected;
        const vault = documentRef.defaultView?.__vildaClcrVersionValueVault;
        if (vault) vault.FENa_sample_status = selected;
        // The legacy paired confirmation means BOTH common urine and timely
        // blood. A new contradiction invalidates that shared fact for every FE.
        // A blood timing problem does not negate a known common urine sample.
        const tmpAnswer = documentRef.getElementById("ui_tmpPairedSameTime_answer")?.value
          ?? vault?.ui_tmpPairedSameTime_answer;
        const changedControls = [
          writeSampleFact("spotPairedChemistry", false),
          // TmP/GFR shares these creatinine samples but has its own protocol.
          // A urine mismatch does not establish a blood timing mismatch.
          writeSampleFact("tmpPairedSameTime", false, selected === "different-time" || tmpAnswer === "no" ? "no" : "unknown"),
        ];
        if (selected === "different-urine") changedControls.push(writeSampleFact("spotSameSpecimen", false));
        // All canonical controls and the authoritative vault are updated before
        // any event can recompute FEHCO₃ or another urine calculation.
        if (changed) {
          changedControls.forEach(node => emit(layout, node));
          emit(layout, control);
        }
      } else {
        // This is an explicit correction of the optional issue, not a claim
        // that sampling was confirmed. Independent TmP/GFR and bicarbonate-loading
        // protocols keep their own negative or unknown answers.
        const input = currentInput(layout);
        const different = value => value === false || value === "no" || value === "different";
        control.value = "";
        const vault = documentRef.defaultView?.__vildaClcrVersionValueVault;
        if (vault) vault.FENa_sample_status = "";
        const changedControls = [];
        if (different(input.pairedSameTime)) changedControls.push(writeSampleFact("spotPairedChemistry", false, "unknown"));
        if (different(input.sameUrineSpecimen)) changedControls.push(writeSampleFact("spotSameSpecimen", false, "unknown"));
        changedControls.forEach(node => emit(layout, node));
        emit(layout, control);
      }
      refreshLayout(layout);
    };
    // Commit before a bubbling form refresh derives the selector from the
    // previous canonical sample facts. Repeated native change is idempotent.
    problemSelect.addEventListener("input", commitSampleProblem);
    problemSelect.addEventListener("change", commitSampleProblem);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function pair(layout, valueId, unitId, title, target) {
    const valueView = layout.fieldViews.get(valueId);
    const unitView = unitId ? layout.fieldViews.get(unitId) : null;
    if (!valueView || unitId && !unitView) return;
    const wrapper = valueView.wrapper;
    move(layout, wrapper, target);
    wrapper.hidden = false;
    wrapper.classList.add("fehco3-entry-field");
    const name = wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "fehco3-value-row");
      valueView.control.parentNode.insertBefore(row, valueView.control);
      move(layout, valueView.control, row);
      layout.rows.set(valueId, row);
      if (!unitId) {
        const fixed = element(layout.document, "span", "fehco3-fixed-unit", "mmol/L");
        fixed.setAttribute("aria-hidden", "true");
        row.append(fixed);
        const attributes = { inputmode: valueView.control.getAttribute("inputmode"), describedby: valueView.control.getAttribute("aria-describedby"), label: valueView.control.getAttribute("aria-label") };
        layout.attributes.set(valueView.control, attributes);
        valueView.control.setAttribute("aria-label", title + " (mmol/L)");
      }
    }
    valueView.control.setAttribute("inputmode", "decimal");
    if (unitView) {
      const control = unitView.control;
      if (!layout.attributes.has(control)) layout.attributes.set(control, {
        labelledby: control.getAttribute("aria-labelledby"), label: control.getAttribute("aria-label"),
      });
      move(layout, control, row);
      control.removeAttribute("aria-labelledby");
      control.setAttribute("aria-label", `Jednostka: ${title.toLocaleLowerCase("pl")}`);
      unitView.wrapper.hidden = true;
      Array.from(control.options).forEach(option => {
        if (!layout.optionLabels.has(option)) layout.optionLabels.set(option, option.textContent);
        if (option.value.toLowerCase() === "mg/dl") option.textContent = "mg/dL";
      });

    }
  }

  function restore(documentRef) {
    const layout = layouts.get(documentRef);
    if (!layout) return;
    Array.from(layout.moves.entries()).reverse().forEach(([node, anchor]) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
      anchor.remove();
    });
    layout.names.forEach((text, name) => { name.textContent = text; });
    layout.attributes.forEach((attributes, control) => {
      Object.entries(attributes).forEach(([key, value]) => {
        const name = key === "inputmode" ? key : `aria-${key}`;
        if (value === null) control.removeAttribute(name); else control.setAttribute(name, value);
      });
    });
    layout.optionLabels.forEach((text, option) => { option.textContent = text; });
    layout.rows.forEach(row => row.remove());
    layout.fieldViews.forEach(view => view.wrapper.classList.remove("fehco3-entry-field"));
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(documentRef);
    documentRef.documentElement.removeAttribute("data-clcr-fehco3-active");
  }

  function sync(documentRef, options) {
    if (!options?.active) { restore(documentRef); return; }
    let layout = layouts.get(documentRef);
    if (!layout) {
      layout = createLayout(documentRef, options);
      if (!layout) return;
      layouts.set(documentRef, layout);
    }
    layout.fieldViews = options.fieldViews;
    documentRef.documentElement.dataset.clcrFehco3Active = "1";
    pair(layout, "U_HCO3_spot", null, "Wodorowęglany w moczu", layout.groups.urine);
    pair(layout, "Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", layout.groups.urine);
    pair(layout, "S_HCO3_spot", null, "Wodorowęglany we krwi", layout.groups.serum);
    pair(layout, "Scr_spot", "Scr_spot_unit", "Kreatynina w surowicy", layout.groups.serum);
    refreshLayout(layout);
  }

  function refresh(documentRef) {
    const layout = layouts.get(documentRef);
    if (layout) refreshLayout(layout);
  }

  function sourceMarkup(source) {
    if (!source) return "";
    const label = escape(source.label || source.title || "Źródło");
    return /^https:\/\//.test(source.url || "")
      ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  }

  function referenceMarkup(model) {
    return `<div class="clcr-result-reference" data-clcr-reference-kind="none"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Norma dla wieku")}</p><strong class="clcr-result-reference-value fehco3-reference-value" data-no-reference="true">${escape(model.referenceText || "Brak normy do porównania")}</strong></div>`;
  }

  function renderDetails(model) {
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const known = Array.isArray(model.cautions) ? model.cautions.filter(item => typeof item === "string" && item).join("; ") : "";
    const notes = model.notes || {};
    const diagnostic = model.diagnosticBands;
    const rows = Array.isArray(diagnostic?.bands) ? diagnostic.bands : [];
    const table = rows.length ? `<h3>Progi po obciążeniu wodorowęglanem</h3><p>${escape(diagnostic.condition || notes.diagnosticContext || "")}</p><table class="clcr-result-category-table" aria-label="Warunkowe progi FEHCO₃ po obciążeniu"><caption>${escape(diagnostic.title || "Progi testu obciążenia")}</caption><thead><tr><th>FEHCO₃</th><th>Znaczenie w warunkach testu</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.label)}</td><td>${escape(row.text)}</td></tr>`).join("")}</tbody></table><p>${escape(diagnostic.caution || "")}</p>` : "";
    const sourcesMarkup = sources.length ? `<ul class="fehco3-source-links">${sources.map(source => `<li>${sourceMarkup(source)}${source.locator ? `<small>${escape(source.locator)}</small>` : ""}</li>`).join("")}</ul>` : "";
    return `<details class="clcr-result-details fehco3-proposal-details" id="clcr-fehco3-details" data-clcr-formula="FEHCO3_spot" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Co oznacza FEHCO₃?</h3><p>FEHCO₃ określa, jaki odsetek przefiltrowanych wodorowęglanów jest wydalany z moczem. Wynik zależy od stężenia HCO₃⁻ we krwi i warunków badania, w tym podawania zasad. Przy obniżonym HCO₃⁻ we krwi mały FEHCO₃ nie wyklucza zaburzenia reabsorpcji proksymalnej.</p><h3>Norma dla wieku</h3><p>${escape(notes.scope || "Nie dobrano zweryfikowanej normy do rutynowej próbki według wieku. Progi testu obciążenia nie są normą zdrowej populacji. Wiek nie jest potrzebny do obliczenia.")}</p>${table}<h3>Właściwy parametr z raportu</h3><p>${escape(notes.bloodReport || "Laboratoryjne CO₂ całkowite (tCO₂) jest przybliżeniem HCO₃⁻; nie przeliczamy go dodatkowo.")} ${escape(notes.urineReport || "W moczu użyj stężenia HCO₃⁻ z raportu, nie samego pH.")}</p><h3>Wzór i jednostki</h3><p class="fehco3-formula">FEHCO₃ = 100 × U<sub>HCO₃</sub> × S<sub>Cr</sub> / (S<sub>HCO₃</sub> × U<sub>Cr</sub>).</p><p>${escape(notes.conversion || "HCO₃⁻ podaj w mmol/L; dla tego jednowartościowego jonu 1 mmol/L = 1 mEq/L. Kreatyninę w obu próbkach sprowadzamy do wspólnej jednostki: 1 mg/dL = 88,4 µmol/L = 0,0884 mmol/L.")}</p><p>HCO₃⁻ w moczu może wynosić zero. HCO₃⁻ we krwi oraz obie wartości kreatyniny muszą być dodatnie. Mały dodatni wynik zachowuje dodatnią wartość; dokładny iloraz pozostaje w zapisie. Precyzja zapisu nie zwiększa dokładności oznaczenia laboratoryjnego.</p><h3>Próbki i znane informacje</h3><p>Ta sama próbka moczu i równocześnie pobrana krew są opisanym założeniem, chyba że zachowano potwierdzenie. Znana niezgodność blokuje obliczenie i nie usuwa wpisanych stężeń. Znane informacje o leczeniu i czynności nerek pozostają przy wyniku. Nie zakładamy, że wykonano test obciążenia lub spełniono jego protokół.</p>${known ? `<p><strong>Znane informacje:</strong> ${escape(known)}.</p>` : ""}${model.display?.boundary ? `<p>${escape(model.display.boundary)}</p>` : ""}${sourcesMarkup}</details>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "fehco3-result-empty" : "fehco3-result-error"}" data-clcr-formula="FEHCO3_spot"><strong>${missing ? "Tutaj pojawi się wynik FEHCO₃" : "Sprawdź dane FEHCO₃"}</strong><p>${escape(model.error || "Wpisz wodorowęglany i kreatyninę w moczu oraz w surowicy. Potrzebne są cztery stężenia.")}</p></div>`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const tone = model.tone === "warning" ? "warning" : "neutral";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    return `<div class="result-box clcr-result-card fehco3-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="FEHCO3_spot" data-clcr-series="FEHCO3_spot" data-clcr-code="fehco3" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="%" data-clcr-display-label="Frakcja wydalania wodorowęglanów — FEHCO₃" data-clcr-status="${escape(model.interpretation)}" data-clcr-assessment="${escape(model.status || "unassessed")}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${model.referenceActive === true}" data-clcr-fehco3-snapshot="${escape(JSON.stringify(model))}"><div class="clcr-result-main fehco3-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik FEHCO₃</p><strong class="clcr-result-value" data-long="${shown.length > 5}" data-dense="${shown.length > 8}" title="Wartość przed zaokrągleniem: ${escape(String(model.rawValue).replace(".", ","))}%">${escape(shown)}</strong><span class="clcr-result-unit">%</span></div>${referenceMarkup(model)}</div>${cautions.length ? `<p class="fehco3-scope-tag">${cautions.map(escape).join(" · ")}</p>` : ""}<p class="fehco3-result-copy">${escape(model.interpretation || "Sam wynik nie potwierdza ani nie wyklucza proksymalnej kwasicy cewkowej. Interpretacja zależy od stężenia HCO₃⁻ we krwi i warunków badania.")}</p></div>${renderDetails(model)}`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
