(function (root, factory) {
  const api = factory();
  if (root) root.ClcrPcrUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const CONTEXT_FIELDS = [
    "PCR_same_specimen", "spotSampleKind", "spotMenstruation",
    "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness",
  ];
  const KNOWN_FACTS = Object.freeze([
    ["spotInfection", "Infekcja"], ["spotHematuria", "Krwiomocz"],
    ["spotMenstruation", "Miesiączka"], ["spotExercise", "Intensywny wysiłek"],
    ["spotAcuteIllness", "Gorączka / ostra choroba lub stan przejściowy"],
  ]);

  function emitEdit(layout, control) {
    const EventClass = layout.document.defaultView?.Event;
    if (!EventClass || !control) return;
    control.dispatchEvent(new EventClass("input", { bubbles: true }));
    control.dispatchEvent(new EventClass("change", { bubbles: true }));
  }

  function refreshKnownFacts(layout) {
    const direct = modeOf(layout) === "direct";
    const facts = KNOWN_FACTS.filter(([id]) => layout.fieldViews.get(id)?.control.checked).map(([, label]) => label);
    const specimen = layout.fieldViews.get("PCR_same_specimen");
    if (!direct && specimen?.control.value === "different") facts.unshift("Oznaczenia z różnych próbek");
    const sample = layout.fieldViews.get("spotSampleKind");
    const knownSample = Boolean(sample?.control.value);
    if (knownSample) facts.push(`Próbka: ${sample.control.selectedOptions?.[0]?.textContent || sample.control.value}`);
    layout.factSummary.textContent = facts.length ? `Znane informacje: ${facts.join("; ")}.` : "";
    layout.factSummary.hidden = facts.length === 0;
    layout.problemSelect.options[0].textContent = facts.length ? "Dodaj kolejną informację" : "Nie dodano informacji";
    layout.problemSelect.value = "";
    layout.differentOption.disabled = direct;
    if (sample) sample.wrapper.hidden = !knownSample;
  }

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function element(documentRef, tag, className, text) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function rememberMove(layout, node, preferredAnchor) {
    if (layout.moves.has(node)) return;
    const anchor = preferredAnchor?.parentNode ? preferredAnchor : layout.document.createComment("pcr-field-origin");
    const owned = anchor !== preferredAnchor;
    if (owned) node.parentNode.insertBefore(anchor, node);
    layout.moves.set(node, { anchor, owned });
  }

  function move(layout, node, target, preferredAnchor) {
    if (!node || !target || node.parentNode === target) return;
    rememberMove(layout, node, preferredAnchor);
    target.appendChild(node);
  }

  function modeOf(layout) {
    return layout.document.getElementById("PCR_entry_mode")?.value === "direct" ? "direct" : "concentration";
  }

  function refreshMode(layout) {
    const direct = modeOf(layout) === "direct";
    layout.concentrationFields.hidden = direct;
    layout.directFields.hidden = !direct;
    layout.assumption.hidden = direct;
    layout.buttons.concentration.setAttribute("aria-pressed", String(!direct));
    layout.buttons.direct.setAttribute("aria-pressed", String(direct));
    const specimen = layout.fieldViews.get("PCR_same_specimen");
    if (specimen) specimen.wrapper.hidden = direct;
    const specimenControl = specimen?.control;
    // Carry a known negative shared answer into the visible PCR context. This
    // preserves a fact; it does not silently turn an unanswered checkbox into
    // confirmation. A deliberate new 'confirmed' answer can correct it.
    if (specimenControl && specimenControl.value === "") {
      const legacyAnswer = layout.document.getElementById("ui_spotSameSpecimen_answer")?.value || "";
      if (legacyAnswer === "no") specimenControl.value = "different";
      else if (legacyAnswer === "yes" || (legacyAnswer !== "unknown" &&
          layout.document.getElementById("spotSameSpecimen")?.checked)) specimenControl.value = "confirmed";
    }
    layout.assumption.textContent = specimenControl?.value === "different"
      ? "Oznaczenia z różnych próbek nie pozwalają obliczyć PCR."
      : specimenControl?.value === "confirmed"
        ? "Potwierdzono, że oba oznaczenia pochodzą z tej samej próbki moczu."
        : "Zakładamy, że oba oznaczenia pochodzą z tej samej próbki moczu.";
    layout.card.dataset.pcrMode = direct ? "direct" : "concentration";
    refreshKnownFacts(layout);
  }

  function refreshAge(layout) {
    const clinical = layout.document.defaultView?.ClcrClinicalSafety;
    const age = clinical?.readAgeFromDocument?.(layout.document);
    layout.ageText.textContent = `Wiek pacjenta: ${age?.valid ? clinical.formatAge(age) : "niepodany"}`;
  }

  function mountAgeContext(layout) {
    const panel = layout.document.getElementById("clcrActivePanel");
    if (!panel) return;
    if (layout.ageContext.parentNode !== panel) panel.appendChild(layout.ageContext);
    if (layout.ageFields.parentNode !== panel) panel.appendChild(layout.ageFields);
    ["age", "ageMonths"].forEach((id) => {
      const view = layout.fieldViews.get(id);
      if (!view) return;
      move(layout, view.wrapper, layout.ageFields, view.contextAnchor);
      view.wrapper.hidden = false;
    });
    refreshAge(layout);
  }

  function createLayout(documentRef, options) {
    const form = documentRef.getElementById("clcrForm");
    if (!form) return null;
    const card = element(documentRef, "section", "pcr-input-card");
    card.id = "pcrInputCard";
    card.setAttribute("aria-label", "Dane do PCR");
    const modes = element(documentRef, "div", "pcr-mode-switch");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "Sposób wprowadzenia PCR");
    const buttons = {};
    [["concentration", "Oblicz ze stężeń"], ["direct", "Gotowy wynik PCR"]].forEach(([value, label]) => {
      const button = element(documentRef, "button", "", label);
      button.type = "button";
      button.dataset.pcrMode = value;
      button.setAttribute("aria-controls", value === "direct" ? "pcrDirectFields" : "pcrConcentrationFields");
      buttons[value] = button;
      modes.appendChild(button);
    });
    const concentrationFields = element(documentRef, "div", "pcr-entry-fields");
    concentrationFields.id = "pcrConcentrationFields";
    const directFields = element(documentRef, "div", "pcr-entry-fields");
    directFields.id = "pcrDirectFields";
    const assumption = element(documentRef, "p", "pcr-assumption", "Zakładamy, że oba oznaczenia pochodzą z tej samej próbki moczu.");
    const details = element(documentRef, "details", "pcr-sample-info");
    details.id = "pcrSampleInfo";
    details.appendChild(element(documentRef, "summary", "", "Znany problem z próbką"));
    const problemLabel = element(documentRef, "label", "pcr-known-problem-label", "Informacja dodatkowa (opcjonalnie)");
    problemLabel.htmlFor = "ui_pcr_known_problem";
    const problemSelect = element(documentRef, "select", "pcr-known-problem");
    problemSelect.id = "ui_pcr_known_problem";
    problemSelect.dataset.clcrDerivedControl = "true";
    let differentOption;
    [["", "Nie dodano informacji"], ["different", "Oznaczenia z różnych próbek"], ...KNOWN_FACTS].forEach(([value, label]) => {
      const option = element(documentRef, "option", "", label);
      option.value = value;
      if (value === "different") differentOption = option;
      problemSelect.appendChild(option);
    });
    const factSummary = element(documentRef, "p", "pcr-known-facts-summary");
    factSummary.hidden = true;
    const corrections = element(documentRef, "details", "pcr-fact-corrections");
    corrections.appendChild(element(documentRef, "summary", "", "Skoryguj informacje"));
    const context = element(documentRef, "div", "pcr-sample-info__fields");
    corrections.appendChild(context);
    const factHint = element(documentRef, "p", "pcr-known-facts-hint", "Dodanie informacji nie usuwa wcześniej zapisanych faktów. Ich korekta jest dostępna poniżej.");
    details.append(problemLabel, problemSelect, factSummary, factHint, corrections);
    card.append(modes, concentrationFields, directFields, assumption, details);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.appendChild(card);
    const layout = {
      document: documentRef, form, card, buttons, concentrationFields,
      directFields, assumption, details, context, moves: new Map(),
      rows: new Map(), names: new Map(), unitLabels: new Map(),
      fieldViews: options.fieldViews, onChange: options.onChange,
      problemSelect, differentOption, factSummary, corrections,
    };
    problemSelect.addEventListener("change", () => {
      const selected = problemSelect.value;
      if (selected === "different") {
        const specimen = layout.fieldViews.get("PCR_same_specimen")?.control;
        if (specimen) {
          specimen.value = "different";
          emitEdit(layout, specimen);
        }
      } else if (KNOWN_FACTS.some(([id]) => id === selected)) {
        const view = layout.fieldViews.get(selected);
        if (view) {
          view.control.checked = true;
          if (view.answerSelect) {
            view.answerSelect.value = "yes";
            emitEdit(layout, view.answerSelect);
          }
          emitEdit(layout, view.control);
        }
      }
      refreshMode(layout);
      if (typeof layout.onChange === "function") layout.onChange();
    });
    const ageContext = element(documentRef, "div", "pcr-patient-age");
    const ageText = element(documentRef, "span");
    const ageEdit = element(documentRef, "button", "pcr-patient-age__edit", "Zmień");
    const ageFields = element(documentRef, "div", "pcr-age-fields");
    ageFields.id = "pcrAgeFields";
    ageFields.hidden = true;
    ageEdit.type = "button";
    ageEdit.setAttribute("aria-expanded", "false");
    ageEdit.setAttribute("aria-controls", ageFields.id);
    ageContext.append(ageText, ageEdit);
    Object.assign(layout, { ageContext, ageText, ageEdit, ageFields });
    ageEdit.addEventListener("click", () => {
      ageFields.hidden = !ageFields.hidden;
      ageEdit.setAttribute("aria-expanded", String(!ageFields.hidden));
      ageEdit.textContent = ageFields.hidden ? "Zmień" : "Gotowe";
      if (!ageFields.hidden) layout.fieldViews.get("age")?.control.focus();
    });
    layout.onFieldEdit = (event) => {
      if (["age", "ageMonths", "ageDays"].includes(event.target?.id)) refreshAge(layout);
      if (["PCR_entry_mode", "PCR_same_specimen", "ui_spotSameSpecimen_answer"].includes(event.target?.id)) refreshMode(layout);
      if (CONTEXT_FIELDS.includes(event.target?.id) || KNOWN_FACTS.some(([id]) => event.target?.id === `ui_${id}_answer`)) refreshKnownFacts(layout);
    };
    form.addEventListener("input", layout.onFieldEdit);
    form.addEventListener("change", layout.onFieldEdit);
    Object.entries(buttons).forEach(([value, button]) => {
      button.addEventListener("click", () => {
        const control = documentRef.getElementById("PCR_entry_mode");
        if (!control || control.value === value) return;
        control.value = value;
        refreshMode(layout);
        const EventClass = documentRef.defaultView?.Event;
        if (EventClass) control.dispatchEvent(new EventClass("change", { bubbles: true }));
        if (typeof layout.onChange === "function") layout.onChange();
      });
    });
    return layout;
  }

  function pair(layout, valueId, unitId, title, target) {
    const valueView = layout.fieldViews.get(valueId);
    const unitView = layout.fieldViews.get(unitId);
    if (!valueView || !unitView) return;
    const { wrapper, control } = valueView;
    move(layout, wrapper, target, valueView.contextAnchor);
    wrapper.hidden = false;
    wrapper.classList.add("pcr-entry-field");
    const name = wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "pcr-value-row");
      control.parentNode.insertBefore(row, control);
      move(layout, control, row);
      layout.rows.set(valueId, row);
    }
    if (!layout.unitLabels.has(unitView.control)) {
      layout.unitLabels.set(unitView.control, {
        labelledby: unitView.control.getAttribute("aria-labelledby"),
        label: unitView.control.getAttribute("aria-label"),
      });
    }
    move(layout, unitView.control, row);
    unitView.control.removeAttribute("aria-labelledby");
    unitView.control.setAttribute("aria-label", `Jednostka: ${title.toLocaleLowerCase("pl")}`);
    unitView.wrapper.hidden = true;
    control.setAttribute("inputmode", "decimal");
  }

  function restore(documentRef) {
    const layout = layouts.get(documentRef);
    if (!layout) {
      documentRef.documentElement?.removeAttribute("data-clcr-pcr-active");
      return;
    }
    // Restore controls before their containers so shared urine fields retain
    // their existing labels, event handlers and the PCR workflow.
    Array.from(layout.moves.entries()).reverse().forEach(([node, { anchor, owned }]) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
      if (owned) anchor.remove();
    });
    layout.names.forEach((text, name) => { name.textContent = text; });
    layout.unitLabels.forEach((attributes, control) => {
      if (attributes.labelledby === null) control.removeAttribute("aria-labelledby");
      else control.setAttribute("aria-labelledby", attributes.labelledby);
      if (attributes.label === null) control.removeAttribute("aria-label");
      else control.setAttribute("aria-label", attributes.label);
    });
    layout.rows.forEach((row) => row.remove());
    layout.fieldViews.forEach((view) => view.wrapper.classList.remove("pcr-entry-field"));
    layout.card.remove();
    layout.ageContext.remove();
    layout.ageFields.remove();
    layout.form.removeEventListener("input", layout.onFieldEdit);
    layout.form.removeEventListener("change", layout.onFieldEdit);
    layouts.delete(documentRef);
    documentRef.documentElement?.removeAttribute("data-clcr-pcr-active");
  }

  function sync(documentOrOptions, parameters) {
    const options = parameters ? { ...parameters, document: documentOrOptions } : documentOrOptions;
    const documentRef = options?.document || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    if (!options?.active) {
      restore(documentRef);
      return;
    }
    let layout = layouts.get(documentRef);
    if (!layout) {
      layout = createLayout(documentRef, options);
      if (!layout) return;
      layouts.set(documentRef, layout);
    }
    layout.fieldViews = options.fieldViews;
    layout.onChange = options.onChange;
    if (!layout.fieldViews?.get) return;
    documentRef.documentElement.dataset.clcrPcrActive = "1";
    mountAgeContext(layout);
    pair(layout, "U_Prot_spot", "U_Prot_spot_unit", "Białko całkowite w moczu", layout.concentrationFields);
    pair(layout, "Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", layout.concentrationFields);
    pair(layout, "PCR_reported", "PCR_reported_unit", "PCR z laboratorium", layout.directFields);
    CONTEXT_FIELDS.forEach((id) => {
      const view = layout.fieldViews.get(id);
      if (!view) return;
      move(layout, view.wrapper, layout.context, view.contextAnchor);
      view.wrapper.hidden = false;
    });
    refreshMode(layout);
  }

  function refresh(documentRef) {
    const layout = layouts.get(documentRef);
    if (!layout) return;
    refreshAge(layout);
    refreshMode(layout);
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
      const missing = ["", "missing-input", "missing-protein", "missing-creatinine", "missing-reported-value"].includes(model.reasonCode || "");
      const empty = model.mode === "direct" ? "Wpisz wynik PCR z laboratorium i wybierz jego jednostkę." : "Wpisz stężenie białka całkowitego i kreatyniny w moczu.";
      return `<div class="${missing ? "pcr-result-empty" : "pcr-result-error"}" data-clcr-formula="PCR"><strong>${escape(missing ? "Tutaj pojawi się wynik PCR" : "Sprawdź dane PCR")}</strong><p>${escape(model.message || model.statusText || model.qualification?.note || empty)}</p></div>`;
    }
    const snapshot = model.snapshot || model;
    const reference = model.referenceAvailable ? model.reference : null;
    const category = typeof model.category === "string" ? model.category : model.category?.code || "";
    const tone = ["success", "warning", "danger"].includes(model.tone) ? model.tone : "neutral";
    const shown = String(model.display?.text ?? model.display?.value ?? model.rawValue).replace(".", ",");
    const unit = model.display?.unit || model.unit || "";
    const boundary = model.boundary || model.display?.boundary || "";
    const qualifiedLow = category === "normal" && tone === "neutral" && model.qualification?.reasonCode === "confounded-sample";
    const norm = reference
      ? `<div class="clcr-result-reference pcr-proposal-reference" data-clcr-reference="pcr" data-clcr-reference-kind="pcr"><p class="clcr-result-reference-label">${escape(reference.label || "Norma dla wieku")}</p><strong class="clcr-result-reference-value">${escape(reference.limit)}</strong><span class="clcr-result-reference-unit">${escape(reference.unit || unit)}</span></div>` : "";
    const rows = reference?.categories || [];
    const table = rows.length
      ? `<table class="clcr-result-category-table"><caption>Zakresy PCR · ${escape(reference.unit || unit)}</caption><thead><tr><th scope="col">Ocena</th><th scope="col">Zakres</th></tr></thead><tbody>${rows.map((entry) => {
        const current = category === entry.code;
        const label = current && qualifiedLow ? "Poniżej progu dla wieku" : entry.label || entry.meaning || "";
        const rowTone = current ? tone : entry.tone || "neutral";
        return `<tr data-clcr-category-row="${escape(entry.code)}" data-clcr-tone="${escape(rowTone)}"${current ? ' aria-current="true"' : ""}><th scope="row">${escape(label)}</th><td>${escape(entry.range)}${current ? '<span class="clcr-result-current-label">Wynik pacjenta</span>' : ""}</td></tr>`;
      }).join("")}</tbody></table>` : "";
    const population = reference ? (typeof reference.population === "string" ? reference.population : reference.population?.label || model.population?.label || "") : "";
    const suppliedSources = [reference?.source, model.source, ...(Array.isArray(reference?.sources) ? reference.sources : []), ...(Array.isArray(model.sources) ? model.sources : [])].filter(Boolean);
    const sources = suppliedSources.filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url && candidate.label === source.label) === index);
    const source = sourceMarkup(reference?.source || model.source || sources[0]);
    const sourceLine = [escape(population), source].filter(Boolean).join(" · ");
    const pediatric = typeof model.context?.ageYears === "number" && model.context.ageYears < 18;
    const notes = Array.isArray(model.detailNotes) ? [...model.detailNotes] : [
      model.mode === "concentration" ? model.notes?.concentration : "",
      model.notes?.sample, model.notes?.transientFactors, model.notes?.diagnosis,
      model.notes?.chronicity, model.notes?.units,
      pediatric ? model.notes?.agePolicy : "", pediatric ? model.notes?.pediatric : "",
      pediatric ? model.notes?.nephrotic : "", model.notes?.monitoring, model.notes?.laboratory,
    ].filter((note, index, all) => typeof note === "string" && note && all.indexOf(note) === index);
    // A converted, rounded endpoint must never replace a censored report.
    const converted = !model.comparator && Number.isFinite(model.convertedValue)
      ? `<p><strong>Przeliczenie:</strong> ≈${escape(model.convertedValue.toLocaleString("pl-PL", { maximumFractionDigits: 2 }))} ${escape(model.convertedUnit)}.</p>` : "";
    const qualification = model.qualification?.note || "";
    const comparison = Boolean(reference && model.comparison && model.comparison !== "ambiguous");
    return `<div class="result-box clcr-result-card pcr-proposal-card${["warning", "danger"].includes(tone) ? " out-of-range" : ""}" data-clcr-formula="PCR" data-clcr-series="PCR" data-clcr-code="pcr" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(model.display?.value ?? model.rawValue)}" data-clcr-value-length="${Math.min(32, shown.length)}" data-clcr-display-unit="${escape(unit)}" data-clcr-display-label="Białko/kreatynina — PCR" data-clcr-status="${escape(model.statusText)}" data-clcr-category="${escape(category)}" data-clcr-boundary="${escape(boundary)}" data-clcr-tone="${tone}" data-clcr-reference-profile="${escape(model.profileId)}" data-clcr-reference-comparison="${comparison}" data-clcr-pcr-snapshot="${escape(JSON.stringify(snapshot))}"><div class="clcr-result-main pcr-proposal-main${reference ? "" : " pcr-proposal-main--single"}"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value">${escape(shown)}</strong><span class="clcr-result-unit">${escape(unit)}</span>${boundary ? `<small class="clcr-result-boundary">Przed zaokrągleniem: ${escape(boundary)} ${escape(unit)}</small>` : ""}</div>${norm}</div><p class="clcr-result-interpretation pcr-proposal-status">${escape(model.statusText || model.categoryDescription || "PCR — wynik liczbowy")}</p>${qualification ? `<p class="pcr-confirmation">${escape(qualification)}</p>` : ""}</div>${sourceLine ? `<p class="clcr-result-source pcr-source" data-clcr-formula="PCR">${sourceLine}</p>` : ""}<details class="clcr-result-details pcr-proposal-details" id="clcr-pcr-details" data-clcr-formula="PCR" tabindex="-1"><summary>Szczegóły i źródła</summary>${table}${converted}${notes.map((note) => `<p>${escape(note)}</p>`).join("")}${boundary ? `<p>Wartość użyta do oceny: ${escape(String(model.rawValue).replace(".", ","))} ${escape(unit)}. Ocenę wyznaczamy przed zaokrągleniem.</p>` : ""}${sources.length ? `<p>${sources.map(sourceMarkup).join(" · ")}</p>` : ""}</details>`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
