(function (root, factory) {
  const api = factory();
  if (root) root.ClcrFekUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const VALUE_FIELDS = ["U_K_spot", "Ucr_spot", "S_K_spot", "Scr_spot"];

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
      const anchor = layout.document.createComment("fek-field-origin");
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
    return layout.document.defaultView?.VildaClcrFek?.readInputFromDocument?.(layout.document) || {};
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
    layout.correction.hidden = !urineProblem && !timeProblem;
    layout.fact.textContent = urineProblem ? "Zapisano oznaczenia z różnych próbek moczu. Obliczenie pozostaje zablokowane."
      : timeProblem ? "Zapisano krew pobraną w innym czasie niż mocz. Obliczenie pozostaje zablokowane." : "";
    layout.fact.hidden = !urineProblem && !timeProblem;
  }

  function createLayout(documentRef, options) {
    const form = documentRef.getElementById("clcrForm");
    if (!form) return null;
    const card = element(documentRef, "section", "fek-input-card");
    card.id = "fekInputCard";
    card.setAttribute("aria-label", "Dane do FEK");
    const heading = element(documentRef, "div", "fek-readiness");
    const count = element(documentRef, "strong");
    count.id = "fekRequiredCount";
    heading.append(element(documentRef, "span", "", "Wymagane dane"), count);
    const progressTrack = element(documentRef, "div", "fek-progress-track");
    progressTrack.setAttribute("role", "progressbar");
    progressTrack.setAttribute("aria-label", "Uzupełnione stężenia do FEK");
    progressTrack.setAttribute("aria-valuemin", "0");
    progressTrack.setAttribute("aria-valuemax", "4");
    const progress = element(documentRef, "span");
    progress.id = "fekProgressBar";
    progressTrack.append(progress);
    const age = element(documentRef, "p", "fek-patient-age");
    const groups = {};
    [["urine", "Mocz", "fekUrineFields"], ["serum", "Krew", "fekSerumFields"]].forEach(([key, title, id]) => {
      const section = element(documentRef, "section", "fek-sample-group");
      section.id = id;
      const groupHeading = element(documentRef, "h3", "", title);
      groupHeading.id = `${id}Heading`;
      section.setAttribute("aria-labelledby", groupHeading.id);
      section.append(groupHeading);
      groups[key] = section;
    });
    const assumption = element(documentRef, "p", "fek-assumption", "Zakładamy wspólną próbkę moczu dla potasu i kreatyniny oraz równocześnie pobraną krew.");
    const details = element(documentRef, "details", "fek-sample-info");
    details.id = "fekSampleInfo";
    details.append(element(documentRef, "summary", "", "Znany problem z próbką"));
    const label = element(documentRef, "label", "", "Zmień tylko, jeśli wiesz o niezgodności próbek");
    label.htmlFor = "ui_fek_sample_issue";
    const problemSelect = element(documentRef, "select");
    problemSelect.id = "ui_fek_sample_issue";
    problemSelect.dataset.clcrDerivedControl = "true";
    [["", "Nie zgłoszono niezgodności"], ["different-urine", "Różne próbki moczu"], ["different-time", "Krew pobrana w innym czasie"]].forEach(([value, text]) => {
      const option = element(documentRef, "option", "", text); option.value = value; problemSelect.append(option);
    });
    const fact = element(documentRef, "p", "fek-known-sample-fact");
    const correction = element(documentRef, "button", "fek-correct-sample", "Skoryguj: próbki są zgodne");
    correction.id = "fekCorrectSampleIssue";
    correction.type = "button";
    correction.hidden = true;
    details.append(label, problemSelect, fact, correction);
    card.append(heading, progressTrack, age, groups.urine, groups.serum, assumption, details);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const layout = { document: documentRef, form, card, groups, count, progress, progressTrack, age, details, problemSelect, fact, correction,
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
        // any event can recompute FEK or another urine calculation.
        if (changed) {
          changedControls.forEach(node => emit(layout, node));
          emit(layout, control);
        }
      } else {
        // An unanswered choice cannot erase an explicit known contradiction.
        refreshLayout(layout);
        if (!correction.hidden) correction.focus();
      }
    };
    // Native selects dispatch input before change. Commit at the control before
    // a form-level refresh can restore its derived value from the old status.
    problemSelect.addEventListener("input", commitSampleProblem);
    problemSelect.addEventListener("change", commitSampleProblem);
    correction.addEventListener("click", () => {
      const control = documentRef.getElementById("FENa_sample_status");
      control.value = "confirmed";
      const vault = documentRef.defaultView?.__vildaClcrVersionValueVault;
      if (vault) vault.FENa_sample_status = "confirmed";
      const changedControls = [writeSampleFact("spotPairedChemistry", true), writeSampleFact("spotSameSpecimen", true)];
      changedControls.forEach(node => emit(layout, node));
      emit(layout, control);
      refreshLayout(layout);
    });
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
    wrapper.classList.add("fek-entry-field");
    const name = wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "fek-value-row");
      valueView.control.parentNode.insertBefore(row, valueView.control);
      move(layout, valueView.control, row);
      layout.rows.set(valueId, row);
      if (!unitId) {
        const fixed = element(layout.document, "span", "fek-fixed-unit", "mmol/L");
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
    layout.fieldViews.forEach(view => view.wrapper.classList.remove("fek-entry-field"));
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(documentRef);
    documentRef.documentElement.removeAttribute("data-clcr-fek-active");
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
    documentRef.documentElement.dataset.clcrFekActive = "1";
    pair(layout, "U_K_spot", null, "Potas w moczu", layout.groups.urine);
    pair(layout, "Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", layout.groups.urine);
    pair(layout, "S_K_spot", null, "Potas w surowicy", layout.groups.serum);
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
    const references = Array.isArray(model.references) ? model.references : model.reference ? [model.reference] : [];
    const active = model.referenceActive === true;
    const primary = references[0];
    const label = model.referenceLabel || (references.length > 1 ? "Dwa zakresy dla wieku"
      : primary ? active ? "Norma dla wieku" : primary.kind === "observed-study-range" ? "Zakres w badaniu dorosłych" : "Zakres zdrowej populacji" : "Porównanie");
    const text = model.referenceText || (model.context === "hypokalemia" ? "Ocena w hipokaliemii" : "Brak zweryfikowanej normy dla wieku");
    const values = references.length > 1 ? references.map(reference => `<span class="fek-reference-band"><small>${escape(reference.ageLabel || reference.population?.label || "")}</small><strong>${escape(reference.text)}</strong></span>`).join("")
      : `<strong class="clcr-result-reference-value fek-reference-value" data-no-reference="${!primary}">${escape(primary?.text || text)}</strong>`;
    const hint = model.referenceHint || (primary?.kind === "observed-study-range" ? "Zakres obserwowany w badaniu"
      : references.length > 1 ? "Granica przedziałów wieku" : primary ? active ? "Orientacyjnie · zdrowa populacja" : "Bez klasyfikacji według tego zakresu" : "");
    return `<div class="clcr-result-reference"><p class="clcr-result-reference-label">${escape(label)}</p>${values}${hint ? `<small class="fek-reference-hint">${escape(hint)}</small>` : ""}</div>`;
  }

  function renderDetails(model) {
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const facts = model.knownFacts || {};
    const notes = model.notes || {};
    const note = key => typeof notes[key] === "string" && notes[key] ? `<p>${escape(notes[key])}</p>` : "";
    const known = [["diureticUse", "Stosowanie diuretyków"], ["knownCKD", "Przewlekła choroba nerek"], ["knownAKI", "Podejrzenie AKI"], ["rapidlyChangingCreatinine", "Niestabilne stężenie kreatyniny"], ["potassiumSupplementation", "Suplementacja potasu"]]
      .filter(([key]) => facts[key] === true).map(([, label]) => label).join("; ");
    const selected = model.referenceActive ? model.reference?.id : null;
    const educational = Array.isArray(model.educationalReferences) ? model.educationalReferences : [];
    const rows = educational.filter(reference => reference.kind === "healthy-percentile");
    const observed = educational.filter(reference => reference.kind === "observed-study-range");
    const percentiles = rows[0]?.percentiles;
    const commonPercentiles = Array.isArray(percentiles) && percentiles.length === 2 && rows.every(reference => JSON.stringify(reference.percentiles) === JSON.stringify(percentiles));
    const rangeHeading = commonPercentiles ? `FEK · P${percentiles[0]}–P${percentiles[1]}` : "Zakres FEK";
    const referenceRows = rows.map(reference => `<tr${selected === reference.id ? ' aria-current="true"' : ""}><th scope="row">${escape(reference.ageLabel)}</th><td>${escape(reference.text)}</td></tr>`).join("");
    const pediatricSection = rows.length ? `<h3>Normy dla wieku — zdrowa populacja</h3><table class="clcr-result-category-table"><thead><tr><th scope="col">Wiek</th><th scope="col">${escape(rangeHeading)}</th></tr></thead><tbody>${referenceRows}</tbody></table>${note("pediatricScope")}${note("referenceAgeBoundaries")}${note("comparisonScope")}` : "";
    const observedSection = observed.length ? `<h3>Dorośli — zakres obserwowany w badaniu</h3>${note("adultStudyScope")}${note("adultComparisonWindow")}` : "";
    const conversion = typeof notes.conversion === "string" ? `<p>${escape(notes.conversion)}</p>` : "";
    const sourcesMarkup = sources.length ? `<ul class="fek-source-links">${sources.map(source => `<li>${sourceMarkup(source)}${source.locator ? `<small>${escape(source.locator)}</small>` : ""}</li>`).join("")}</ul>` : "";
    return `<details class="clcr-result-details fek-proposal-details" id="clcr-fek-details" data-clcr-formula="FEK_spot" tabindex="-1"><summary>Szczegóły i źródła</summary><p>FEK określa, jaki odsetek przefiltrowanego potasu jest wydalany z moczem. Wynik zależy od potasu we krwi, czynności nerek i leczenia.</p>${pediatricSection}${observedSection}<h3>Hipokaliemia i znane czynniki</h3><p>Przy obniżonym potasie we krwi nerki powinny ograniczać jego wydalanie, dlatego zakres zdrowej populacji nie rozstrzyga o adekwatności odpowiedzi. FEK nie ustala samodzielnie przyczyny utraty potasu. Diuretyki, suplementacja potasu, PChN i AKI wpływają na interpretację.</p>${known ? `<p><strong>Znane informacje:</strong> ${escape(known)}.</p>` : ""}<p class="fek-formula"><strong>Obliczenie:</strong> FEK = 100 × U<sub>K</sub> × S<sub>Cr</sub> / (S<sub>K</sub> × U<sub>Cr</sub>). Potas w moczu może wynosić zero, pozostałe trzy stężenia muszą być dodatnie.</p>${conversion}<p><strong>Próbki:</strong> wspólna próbka moczu dla obu oznaczeń i równoczesna krew są założeniem, chyba że zachowano potwierdzenie. Znana niezgodność blokuje obliczenie.</p>${model.display?.boundary ? `<p>${escape(model.display.boundary)}</p>` : ""}${sourcesMarkup}</details>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "fek-result-empty" : "fek-result-error"}" data-clcr-formula="FEK_spot"><strong>${missing ? "Tutaj pojawi się wynik FEK" : "Sprawdź dane FEK"}</strong><p>${escape(model.error || "Wpisz potas i kreatyninę w moczu oraz w surowicy. Potrzebne są cztery stężenia.")}</p></div>`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const status = model.statusText || "";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    return `<div class="result-box clcr-result-card fek-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="FEK_spot" data-clcr-series="FEK_spot" data-clcr-code="fek" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="%" data-clcr-display-label="Frakcja wydalania potasu — FEK" data-clcr-status="${escape(model.interpretation)}" data-clcr-assessment="${escape(model.status || "unassessed")}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${model.referenceActive === true}" data-clcr-fek-snapshot="${escape(JSON.stringify(model))}">${status ? `<p class="fek-result-status">${escape(status)}</p>` : ""}<div class="clcr-result-main fek-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik FEK</p><strong class="clcr-result-value" data-long="${shown.length > 5}" title="Wartość przed zaokrągleniem: ${escape(String(model.rawValue).replace(".", ","))}%">${escape(shown)}</strong><span class="clcr-result-unit">%</span></div>${referenceMarkup(model)}</div>${cautions.length ? `<p class="fek-scope-tag">${cautions.map(escape).join(" · ")}</p>` : ""}<p class="fek-result-copy">${escape(model.interpretation || "FEK wymaga oceny w kontekście klinicznym.")}</p></div>${renderDetails(model)}`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
