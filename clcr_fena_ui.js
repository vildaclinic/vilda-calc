(function (root, factory) {
  const api = factory();
  if (root) root.ClcrFenaUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const VALUE_FIELDS = ["U_Na_spot", "Ucr_spot", "S_Na_spot", "Scr_spot"];

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
      const anchor = layout.document.createComment("fena-field-origin");
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
    return layout.document.defaultView?.VildaClcrFena?.readInputFromDocument?.(layout.document) || {};
  }

  function refreshLayout(layout) {
    const input = currentInput(layout);
    const age = typeof input.ageYears === "number" && Number.isFinite(input.ageYears) ? input.ageYears : null;
    layout.age.textContent = age === null ? "Wiek z danych pacjenta: niepodany" : `Wiek z danych pacjenta: ${Math.floor(age)} lat`;
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
    const card = element(documentRef, "section", "fena-input-card");
    card.id = "fenaInputCard";
    card.setAttribute("aria-label", "Dane do FENa");
    const heading = element(documentRef, "div", "fena-readiness");
    const count = element(documentRef, "strong");
    count.id = "fenaRequiredCount";
    heading.append(element(documentRef, "span", "", "Wymagane dane"), count);
    const progressTrack = element(documentRef, "div", "fena-progress-track");
    progressTrack.setAttribute("role", "progressbar");
    progressTrack.setAttribute("aria-label", "Uzupełnione stężenia do FENa");
    progressTrack.setAttribute("aria-valuemin", "0");
    progressTrack.setAttribute("aria-valuemax", "4");
    const progress = element(documentRef, "span");
    progress.id = "fenaProgressBar";
    progressTrack.append(progress);
    const age = element(documentRef, "p", "fena-patient-age");
    const groups = {};
    [["urine", "Mocz", "fenaUrineFields"], ["serum", "Krew", "fenaSerumFields"]].forEach(([key, title, id]) => {
      const section = element(documentRef, "section", "fena-sample-group");
      section.id = id;
      const groupHeading = element(documentRef, "h3", "", title);
      groupHeading.id = `${id}Heading`;
      section.setAttribute("aria-labelledby", groupHeading.id);
      section.append(groupHeading);
      groups[key] = section;
    });
    const assumption = element(documentRef, "p", "fena-assumption", "Zakładamy wspólną próbkę moczu dla sodu i kreatyniny oraz równocześnie pobraną krew.");
    const details = element(documentRef, "details", "fena-sample-info");
    details.id = "fenaSampleInfo";
    details.append(element(documentRef, "summary", "", "Znany problem z próbką"));
    const label = element(documentRef, "label", "", "Zmień tylko, jeśli wiesz o niezgodności próbek");
    label.htmlFor = "ui_fena_sample_issue";
    const problemSelect = element(documentRef, "select");
    problemSelect.id = "ui_fena_sample_issue";
    problemSelect.dataset.clcrDerivedControl = "true";
    [["", "Nie zgłoszono niezgodności"], ["different-urine", "Różne próbki moczu"], ["different-time", "Krew pobrana w innym czasie"]].forEach(([value, text]) => {
      const option = element(documentRef, "option", "", text); option.value = value; problemSelect.append(option);
    });
    const fact = element(documentRef, "p", "fena-known-sample-fact");
    const correction = element(documentRef, "button", "fena-correct-sample", "Skoryguj: próbki są zgodne");
    correction.id = "fenaCorrectSampleIssue";
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
        // any event can recompute FENa or another urine calculation.
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
    wrapper.classList.add("fena-entry-field");
    const name = wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "fena-value-row");
      valueView.control.parentNode.insertBefore(row, valueView.control);
      move(layout, valueView.control, row);
      layout.rows.set(valueId, row);
      if (!unitId) {
        const fixed = element(layout.document, "span", "fena-fixed-unit", "mmol/L");
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
    layout.fieldViews.forEach(view => view.wrapper.classList.remove("fena-entry-field"));
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(documentRef);
    documentRef.documentElement.removeAttribute("data-clcr-fena-active");
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
    documentRef.documentElement.dataset.clcrFenaActive = "1";
    pair(layout, "U_Na_spot", null, "Sód w moczu", layout.groups.urine);
    pair(layout, "Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", layout.groups.urine);
    pair(layout, "S_Na_spot", null, "Sód w surowicy", layout.groups.serum);
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

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "fena-result-empty" : "fena-result-error"}" data-clcr-formula="FENa_spot"><strong>${missing ? "Tutaj pojawi się wynik FENa" : "Sprawdź dane FENa"}</strong><p>${escape(model.error || "Wpisz sód i kreatyninę w moczu oraz w surowicy. Potrzebne są cztery stężenia.")}</p></div>`;
    }
    const adult = Boolean(model.referenceAvailable && model.reference);
    const confounded = model.knownFacts?.diureticUse === true || model.knownFacts?.knownCKD === true;
    const referenceLabel = model.reference?.label || (adult ? "Progi pomocnicze w AKI (dorośli)" : "Porównanie");
    const referenceText = model.reference?.text || (model.context === "child" ? "Brak uniwersalnej normy dla wieku" : "Brak uniwersalnej normy");
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const snapshot = model.snapshot || model;
    const limits = model.educationalThresholds || {};
    const low = String(limits.low ?? "").replace(".", ","), high = String(limits.high ?? "").replace(".", ",");
    const thresholds = low && high ? [
      ["low", `<${low}%`, "Przy AKI z oligurią może wspierać podejrzenie zmniejszonej perfuzji nerek."],
      ["middle", `${low}–${high}%`, "Wynik między progami; FENa sama nie rozstrzyga mechanizmu AKI."],
      ["high", `>${high}%`, "Przy AKI z oligurią może wspierać podejrzenie uszkodzenia cewek."],
    ] : [];
    const facts = model.knownFacts || {};
    const factsText = [facts.diureticUse === true ? "Stosowanie diuretyków" : "", facts.knownCKD === true ? "Znana przewlekła choroba nerek" : ""].filter(Boolean).join("; ");
    const sources = Array.isArray(model.sources) ? model.sources : model.source ? [model.source] : [];
    return `<div class="result-box clcr-result-card fena-proposal-card" data-clcr-formula="FENa_spot" data-clcr-series="FENa_spot" data-clcr-code="fena" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="%" data-clcr-display-label="Frakcja wydalania sodu — FENa" data-clcr-status="${escape(model.interpretation)}" data-clcr-assessment="unassessed" data-clcr-tone="neutral" data-clcr-fena-snapshot="${escape(JSON.stringify(snapshot))}"><div class="clcr-result-main fena-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik FENa</p><strong class="clcr-result-value" data-long="${shown.length > 8}" title="Wartość przed zaokrągleniem: ${escape(String(model.rawValue).replace(".", ","))}%">${escape(shown)}</strong><span class="clcr-result-unit">%</span></div><div class="clcr-result-reference"><p class="clcr-result-reference-label">${escape(referenceLabel)}</p><strong class="clcr-result-reference-value fena-reference-value" data-no-reference="${!adult}">${escape(referenceText)}</strong></div></div>${adult || confounded ? `<p class="fena-scope-tag">${confounded ? "Znane PChN / diuretyk" : "Tylko w kontekście AKI"}</p>` : ""}<p class="fena-result-copy">${escape(model.interpretation || "FENa wymaga oceny w kontekście klinicznym.")}</p></div><details class="clcr-result-details fena-proposal-details" id="clcr-fena-details" data-clcr-formula="FENa_spot" tabindex="-1"><summary>Szczegóły i źródła</summary><p>FENa nie ma uniwersalnego zakresu prawidłowego dla wieku. Poniższe progi są pomocą w wybranym kontekście AKI u dorosłych, a nie normą zdrowej populacji.</p><table class="clcr-result-category-table"><thead><tr><th scope="col">FENa</th><th scope="col">Znaczenie pomocnicze w AKI</th></tr></thead><tbody>${thresholds.map(([band, threshold, copy]) => `<tr data-fena-band="${band}"${adult && !confounded && model.helperBand === band ? ' aria-current="true"' : ""}><th scope="row">${escape(threshold)}</th><td>${escape(copy)}</td></tr>`).join("")}</tbody></table><p>Największą przydatność opisano przy oligurycznym AKI bez PChN i bez diuretyków. Sam wynik nie rozpoznaje AKI, jego przyczyny ani potrzeby płynoterapii. Przedział ${escape(low)}–${escape(high)}% z końcami włącznie jest sposobem prezentacji między progami, nie normą.</p><p class="fena-formula"><strong>Obliczenie:</strong> FENa = 100 × U<sub>Na</sub> × S<sub>Cr</sub> / (S<sub>Na</sub> × U<sub>Cr</sub>). Kreatyninę sprowadzamy do wspólnej jednostki; 1 mg/dL = 88,4 µmol/L. Dla sodu mmol/L i mEq/L są liczbowo równoważne.</p><p><strong>Próbki:</strong> wspólna próbka moczu dla obu oznaczeń i równoczesna krew są założeniem, chyba że zachowano potwierdzenie. Znana niezgodność blokuje obliczenie.</p>${factsText ? `<p><strong>Znane informacje:</strong> ${escape(factsText)}.</p>` : ""}${sources.length ? `<ul class="fena-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
