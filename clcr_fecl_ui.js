(function (root, factory) {
  const api = factory();
  if (root) root.ClcrFeclUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const VALUE_FIELDS = ["U_Cl_spot", "Ucr_spot", "S_Cl_spot", "Scr_spot"];

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
      const anchor = layout.document.createComment("fecl-field-origin");
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
    return layout.document.defaultView?.VildaClcrFecl?.readInputFromDocument?.(layout.document) || {};
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
    const card = element(documentRef, "section", "fecl-input-card");
    card.id = "feclInputCard";
    card.setAttribute("aria-label", "Dane do FECl");
    const heading = element(documentRef, "div", "fecl-readiness");
    const count = element(documentRef, "strong");
    count.id = "feclRequiredCount";
    heading.append(element(documentRef, "span", "", "Wymagane dane"), count);
    const progressTrack = element(documentRef, "div", "fecl-progress-track");
    progressTrack.setAttribute("role", "progressbar");
    progressTrack.setAttribute("aria-label", "Uzupełnione stężenia do FECl");
    progressTrack.setAttribute("aria-valuemin", "0");
    progressTrack.setAttribute("aria-valuemax", "4");
    const progress = element(documentRef, "span");
    progress.id = "feclProgressBar";
    progressTrack.append(progress);
    const age = element(documentRef, "p", "fecl-patient-age");
    const groups = {};
    [["urine", "Mocz", "feclUrineFields"], ["serum", "Krew", "feclSerumFields"]].forEach(([key, title, id]) => {
      const section = element(documentRef, "section", "fecl-sample-group");
      section.id = id;
      const groupHeading = element(documentRef, "h3", "", title);
      groupHeading.id = `${id}Heading`;
      section.setAttribute("aria-labelledby", groupHeading.id);
      section.append(groupHeading);
      groups[key] = section;
    });
    const assumption = element(documentRef, "p", "fecl-assumption", "Zakładamy tę samą próbkę moczu i równoczesne pobranie krwi.");
    const details = element(documentRef, "details", "fecl-sample-info");
    details.id = "feclSampleInfo";
    details.append(element(documentRef, "summary", "", "Znany problem z próbkami"));
    const label = element(documentRef, "label", "", "Zmień tylko, jeśli masz taką informację");
    label.htmlFor = "ui_fecl_sample_issue";
    const problemSelect = element(documentRef, "select");
    problemSelect.id = "ui_fecl_sample_issue";
    problemSelect.dataset.clcrDerivedControl = "true";
    [["", "Nie podano problemu"], ["different-urine", "Oznaczenia moczu z różnych próbek"], ["different-time", "Krew pobrana w innym czasie"]].forEach(([value, text]) => {
      const option = element(documentRef, "option", "", text); option.value = value; problemSelect.append(option);
    });
    const fact = element(documentRef, "p", "fecl-known-sample-fact");
    details.append(label, problemSelect, fact);
    card.append(heading, progressTrack, age, groups.urine, groups.serum, assumption, details);
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
        // any event can recompute FECl or another urine calculation.
        if (changed) {
          changedControls.forEach(node => emit(layout, node));
          emit(layout, control);
        }
      } else {
        // This is an explicit correction of the optional issue, not a claim
        // that sampling was confirmed. Independent TmP/GFR and FEHCO3
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
    wrapper.classList.add("fecl-entry-field");
    const name = wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "fecl-value-row");
      valueView.control.parentNode.insertBefore(row, valueView.control);
      move(layout, valueView.control, row);
      layout.rows.set(valueId, row);
      if (!unitId) {
        const fixed = element(layout.document, "span", "fecl-fixed-unit", "mmol/L");
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
    layout.fieldViews.forEach(view => view.wrapper.classList.remove("fecl-entry-field"));
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(documentRef);
    documentRef.documentElement.removeAttribute("data-clcr-fecl-active");
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
    documentRef.documentElement.dataset.clcrFeclActive = "1";
    pair(layout, "U_Cl_spot", null, "Chlorki w moczu", layout.groups.urine);
    pair(layout, "Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", layout.groups.urine);
    pair(layout, "S_Cl_spot", null, "Chlorki w surowicy", layout.groups.serum);
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
    return `<div class="clcr-result-reference" data-clcr-reference-kind="none"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Norma dla wieku")}</p><strong class="clcr-result-reference-value fecl-reference-value" data-no-reference="true">${escape(model.referenceText || "Brak normy do porównania")}</strong></div>`;
  }

  function renderDetails(model) {
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const known = Array.isArray(model.cautions) ? model.cautions.filter(item => typeof item === "string" && item).join("; ") : "";
    const sourcesMarkup = sources.length ? `<ul class="fecl-source-links">${sources.map(source => `<li>${sourceMarkup(source)}${source.locator ? `<small>${escape(source.locator)}</small>` : ""}</li>`).join("")}</ul>` : "";
    return `<details class="clcr-result-details fecl-proposal-details" id="clcr-fecl-details" data-clcr-formula="FECl_spot" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Co oznacza FECl?</h3><p>FECl określa, jaki odsetek przefiltrowanych chlorków jest wydalany z moczem. Wynik zależy m.in. od podaży chlorków, nawodnienia, czynności nerek i diuretyków.</p><h3>Norma dla wieku</h3><p>W zweryfikowanych źródłach nie ustalono zakresu referencyjnego FECl odpowiedniego do porównania wyniku według wieku. Dlatego wynik pozostaje neutralny, bez statusu „w normie” lub „poza normą”. Brak wieku nie blokuje obliczenia.</p><h3>Próg w konkretnym kontekście klinicznym</h3><p>Konsensus KDIGO dotyczący zespołu Gitelmana z 2017 r. wymienia FECl &gt;0,5% jako jedno z eksperckich kryteriów podejrzenia tego zespołu w kontekście hipokaliemicznej zasadowicy metabolicznej. To opinia ekspertów wymagająca weryfikacji w obserwacjach klinicznych, a nie norma dla wieku ani samodzielne kryterium rozpoznania. Ten formularz nie zbiera kryteriów potrzebnych do takiej oceny i nie klasyfikuje wyniku według tego progu.</p><h3>Wzór i jednostki</h3><p class="fecl-formula">FECl = 100 × U<sub>Cl</sub> × S<sub>Cr</sub> / (S<sub>Cl</sub> × U<sub>Cr</sub>).</p><p>Chlorki podaj w mmol/L; dla Cl⁻ 1 mmol/L = 1 mEq/L. Kreatyninę w obu próbkach sprowadzamy do wspólnej jednostki: 1 mg/dL = 88,4 µmol/L = 0,0884 mmol/L.</p><p>Chlorki w moczu mogą wynosić zero. Chlorki w surowicy oraz obie wartości kreatyniny muszą być dodatnie. Dodatni mały wynik zachowuje dodatnią wartość; dokładny iloraz pozostaje w zapisie.</p><h3>Założenia i znane czynniki</h3><p>Ta sama próbka moczu i równocześnie pobrana krew są założeniem, chyba że zachowano potwierdzenie. Znana niezgodność blokuje obliczenie; korekta nie usuwa wpisanych stężeń. Znany diuretyk lub PChN wymaga ostrożnej interpretacji, bez automatycznego uznania FECl za nieprawidłowe.</p>${known ? `<p><strong>Znane informacje:</strong> ${escape(known)}.</p>` : ""}${model.display?.boundary ? `<p>${escape(model.display.boundary)}</p>` : ""}${sourcesMarkup}</details>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "fecl-result-empty" : "fecl-result-error"}" data-clcr-formula="FECl_spot"><strong>${missing ? "Tutaj pojawi się wynik FECl" : "Sprawdź dane FECl"}</strong><p>${escape(model.error || "Wpisz chlorki i kreatyninę w moczu oraz w surowicy. Potrzebne są cztery stężenia.")}</p></div>`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const tone = model.tone === "warning" ? "warning" : "neutral";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    return `<div class="result-box clcr-result-card fecl-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="FECl_spot" data-clcr-series="FECl_spot" data-clcr-code="fecl" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="%" data-clcr-display-label="Frakcja wydalania chlorków — FECl" data-clcr-status="${escape(model.interpretation)}" data-clcr-assessment="${escape(model.status || "unassessed")}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${model.referenceActive === true}" data-clcr-fecl-snapshot="${escape(JSON.stringify(model))}"><div class="clcr-result-main fecl-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik FECl</p><strong class="clcr-result-value" data-long="${shown.length > 5}" data-dense="${shown.length > 8}" title="Wartość przed zaokrągleniem: ${escape(String(model.rawValue).replace(".", ","))}%">${escape(shown)}</strong><span class="clcr-result-unit">%</span></div>${referenceMarkup(model)}</div>${cautions.length ? `<p class="fecl-scope-tag">${cautions.map(escape).join(" · ")}</p>` : ""}<p class="fecl-result-copy">${escape(model.interpretation || "Sam wynik nie rozstrzyga o nerkowej utracie chlorków. Oceń go łącznie z nawodnieniem, czynnością nerek i leczeniem.")}</p></div>${renderDetails(model)}`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
