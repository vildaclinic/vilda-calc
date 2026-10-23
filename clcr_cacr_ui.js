(function (root, factory) {
  const api = factory();
  if (root) root.ClcrCacrUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const CONTEXT_FIELDS = ["CaCr_same_specimen"];
  const KNOWN_FACTS = Object.freeze([
    ["spotInfection", "Infekcja"], ["spotHematuria", "Krwiomocz"],
    ["spotMenstruation", "Miesiączka"], ["spotExercise", "Intensywny wysiłek"],
    ["spotAcuteIllness", "Gorączka / ostra choroba lub stan przejściowy"],
    ["spotDiureticUse", "Stosowanie diuretyków"],
    ["spotKnownCKD", "Znana przewlekła choroba nerek"],
  ]);

  function emitEdit(layout, control) {
    const EventClass = layout.document.defaultView?.Event;
    if (!EventClass || !control) return;
    control.dispatchEvent(new EventClass("input", { bubbles: true }));
    control.dispatchEvent(new EventClass("change", { bubbles: true }));
  }

  function refreshKnownFacts(layout) {
    const direct = modeOf(layout) === "direct";
    // Existing facts remain patient data; this view does not add a routine
    // factor questionnaire or invent negative answers for the Mayo profile.
    const facts = KNOWN_FACTS.filter(([id]) => {
      const view = layout.fieldViews.get(id);
      const answer = view?.answerSelect?.value;
      return answer === "yes" || (!["no", "unknown"].includes(answer) && view?.control.checked);
    }).map(([, label]) => label);
    const specimen = layout.fieldViews.get("CaCr_same_specimen");
    const different = specimen?.control.value === "different";
    if (different) facts.unshift(direct ? "Różne próbki zgłoszone dla obliczenia ze stężeń" : "Oznaczenia z różnych próbek");
    const sample = layout.fieldViews.get("spotSampleKind");
    const knownSample = Boolean(sample?.control.value);
    if (knownSample) facts.push(`Próbka: ${sample.control.selectedOptions?.[0]?.textContent || sample.control.value}`);
    layout.factSummary.textContent = facts.length ? `Znane informacje: ${facts.join("; ")}.` : "";
    layout.factSummary.hidden = facts.length === 0;
    layout.problemSelect.value = different ? "different" : "";
    layout.differentOption.disabled = direct;
    layout.corrections.hidden = direct || (!different && specimen?.control.value !== "confirmed");
    layout.factHint.textContent = direct && different
      ? "Informacja o różnych próbkach dotyczy obliczenia ze stężeń. Gotowy wskaźnik oceniamy niezależnie."
      : different ? "Zgłoszone różne próbki pozostają zapisane. Jeśli ta informacja jest błędna, skoryguj ją poniżej."
        : "Zmień tylko wtedy, gdy wiesz, że oznaczenia pochodzą z różnych próbek.";
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
    const anchor = preferredAnchor?.parentNode ? preferredAnchor : layout.document.createComment("cacr-field-origin");
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
    return layout.document.getElementById("CaCr_entry_mode")?.value === "direct" ? "direct" : "concentration";
  }

  function refreshMode(layout) {
    const direct = modeOf(layout) === "direct";
    layout.concentrationFields.hidden = direct;
    layout.directFields.hidden = !direct;
    layout.assumption.hidden = direct;
    layout.buttons.concentration.setAttribute("aria-pressed", String(!direct));
    layout.buttons.direct.setAttribute("aria-pressed", String(direct));
    const specimen = layout.fieldViews.get("CaCr_same_specimen");
    if (specimen) specimen.wrapper.hidden = direct;
    const specimenControl = specimen?.control;
    // Carry a known negative shared answer into the visible Ca/Cr context. This
    // preserves a fact; it does not silently turn an unanswered checkbox into
    // confirmation. A deliberate new 'confirmed' answer can correct it.
    if (specimenControl && specimenControl.value === "") {
      const legacyAnswer = layout.document.getElementById("ui_spotSameSpecimen_answer")?.value || "";
      if (legacyAnswer === "no") specimenControl.value = "different";
      else if (legacyAnswer === "yes" || (legacyAnswer !== "unknown" &&
          layout.document.getElementById("spotSameSpecimen")?.checked)) specimenControl.value = "confirmed";
    }
    layout.assumption.textContent = specimenControl?.value === "different"
      ? "Oznaczenia z różnych próbek nie pozwalają obliczyć Ca/Cr."
      : specimenControl?.value === "confirmed"
        ? "Potwierdzono, że oba oznaczenia pochodzą z tej samej próbki moczu."
        : "Zakładamy, że oba oznaczenia pochodzą z tej samej próbki moczu.";
    layout.card.dataset.cacrMode = direct ? "direct" : "concentration";
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
    const card = element(documentRef, "section", "cacr-input-card");
    card.id = "cacrInputCard";
    card.setAttribute("aria-label", "Dane do Ca/Cr");
    const modes = element(documentRef, "div", "cacr-mode-switch");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "Sposób wprowadzenia Ca/Cr");
    const buttons = {};
    [["concentration", "Oblicz ze stężeń"], ["direct", "Gotowy wynik Ca/Cr"]].forEach(([value, label]) => {
      const button = element(documentRef, "button", "", label);
      button.type = "button";
      button.dataset.cacrMode = value;
      button.setAttribute("aria-controls", value === "direct" ? "cacrDirectFields" : "cacrConcentrationFields");
      buttons[value] = button;
      modes.appendChild(button);
    });
    const concentrationFields = element(documentRef, "div", "cacr-entry-fields");
    concentrationFields.id = "cacrConcentrationFields";
    const directFields = element(documentRef, "div", "cacr-entry-fields");
    directFields.id = "cacrDirectFields";
    const assumption = element(documentRef, "p", "cacr-assumption", "Zakładamy, że oba oznaczenia pochodzą z tej samej próbki moczu.");
    const details = element(documentRef, "details", "cacr-sample-info");
    details.id = "cacrSampleInfo";
    details.appendChild(element(documentRef, "summary", "", "Znany problem z próbką"));
    const problemLabel = element(documentRef, "label", "cacr-known-problem-label", "Próbki moczu (opcjonalnie)");
    problemLabel.htmlFor = "ui_cacr_known_problem";
    const problemSelect = element(documentRef, "select", "cacr-known-problem");
    problemSelect.id = "ui_cacr_known_problem";
    problemSelect.dataset.clcrDerivedControl = "true";
    let differentOption;
    [["", "Nie zgłoszono różnych próbek"], ["different", "Oznaczenia z różnych próbek"]].forEach(([value, label]) => {
      const option = element(documentRef, "option", "", label);
      option.value = value;
      if (value === "different") differentOption = option;
      problemSelect.appendChild(option);
    });
    const factSummary = element(documentRef, "p", "cacr-known-facts-summary");
    factSummary.hidden = true;
    const corrections = element(documentRef, "details", "cacr-fact-corrections");
    corrections.appendChild(element(documentRef, "summary", "", "Skoryguj informacje"));
    const context = element(documentRef, "div", "cacr-sample-info__fields");
    corrections.appendChild(context);
    const factHint = element(documentRef, "p", "cacr-known-facts-hint", "Zmień tylko wtedy, gdy wiesz, że oznaczenia pochodzą z różnych próbek.");
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
      problemSelect, differentOption, factSummary, factHint, corrections,
    };
    problemSelect.addEventListener("change", () => {
      const selected = problemSelect.value;
      if (selected === "different") {
        const specimen = layout.fieldViews.get("CaCr_same_specimen")?.control;
        if (specimen) {
          specimen.value = "different";
          emitEdit(layout, specimen);
        }
      } else if (layout.fieldViews.get("CaCr_same_specimen")?.control.value === "different") {
        // Choosing an unanswered option cannot silently erase a known
        // contradiction. Correction is explicit on the canonical control.
        corrections.open = true;
        layout.fieldViews.get("CaCr_same_specimen")?.control.focus();
      }
      refreshMode(layout);
      if (typeof layout.onChange === "function") layout.onChange();
    });
    const ageContext = element(documentRef, "div", "cacr-patient-age");
    const ageText = element(documentRef, "span");
    const ageEdit = element(documentRef, "button", "cacr-patient-age__edit", "Zmień");
    const ageFields = element(documentRef, "div", "cacr-age-fields");
    ageFields.id = "cacrAgeFields";
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
      if (["CaCr_entry_mode", "CaCr_same_specimen", "ui_spotSameSpecimen_answer"].includes(event.target?.id)) refreshMode(layout);
      if ([...CONTEXT_FIELDS, "spotSampleKind"].includes(event.target?.id) || KNOWN_FACTS.some(([id]) => [id, `ui_${id}_answer`].includes(event.target?.id))) refreshKnownFacts(layout);
    };
    form.addEventListener("input", layout.onFieldEdit);
    form.addEventListener("change", layout.onFieldEdit);
    Object.entries(buttons).forEach(([value, button]) => {
      button.addEventListener("click", () => {
        const control = documentRef.getElementById("CaCr_entry_mode");
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
    wrapper.classList.add("cacr-entry-field");
    const name = wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "cacr-value-row");
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
      documentRef.documentElement?.removeAttribute("data-clcr-cacr-active");
      return;
    }
    // Restore controls before their containers so shared urine fields retain
    // their existing labels, event handlers and the Ca/Cr workflow.
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
    layout.fieldViews.forEach((view) => view.wrapper.classList.remove("cacr-entry-field"));
    layout.card.remove();
    layout.ageContext.remove();
    layout.ageFields.remove();
    layout.form.removeEventListener("input", layout.onFieldEdit);
    layout.form.removeEventListener("change", layout.onFieldEdit);
    layouts.delete(documentRef);
    documentRef.documentElement?.removeAttribute("data-clcr-cacr-active");
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
    documentRef.documentElement.dataset.clcrCacrActive = "1";
    mountAgeContext(layout);
    pair(layout, "Ca_spot", "Ca_spot_unit", "Wapń w moczu", layout.concentrationFields);
    pair(layout, "Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", layout.concentrationFields);
    pair(layout, "CaCr_reported", "CaCr_reported_unit", "Ca/Cr z laboratorium", layout.directFields);
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

  function fixedNative(value) {
    return Number(value).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  }

  function knownFactText(model) {
    const labels = {
      menstruation: "Miesiączka", hematuria: "Krwiomocz", infection: "Infekcja",
      exercise: "Intensywny wysiłek", acuteIllness: "Gorączka / ostra choroba",
      diuretics: "Stosowanie diuretyków", diureticUse: "Stosowanie diuretyków",
      knownCKD: "Znana przewlekła choroba nerek", knownCkd: "Znana przewlekła choroba nerek",
      ...Object.fromEntries(KNOWN_FACTS),
    };
    const context = model.context || {};
    const known = context.knownFacts;
    const facts = Array.isArray(known) ? known.filter(value => typeof value === "string")
      : known && typeof known === "object" ? Object.entries(known).map(([key, value]) => {
        const label = labels[key] || key;
        return value === true ? label : value === false ? `${label}: nie`
          : value == null || value === "unknown" ? `${label}: nie wiadomo` : `${label}: ${value}`;
      }) : [];
    (Array.isArray(context.confounders) ? context.confounders : []).forEach(key => {
      if (!known || Array.isArray(known) || !Object.prototype.hasOwnProperty.call(known, key)) facts.push(labels[key] || key);
    });
    const sample = { firstMorning: "pierwszy poranny mocz", secondMorning: "drugi poranny mocz", random: "próbka losowa", timed: "zbiórka czasowa" }[context.sampleType];
    if (sample) facts.push(`Próbka: ${sample}`);
    if (model.mode === "concentration") facts.push(context.sameSpecimen === "confirmed"
      ? "Potwierdzono tę samą próbkę moczu" : "Wspólna próbka moczu jest założeniem obliczenia");
    return facts.filter((value, index, all) => value && all.indexOf(value) === index).join("; ");
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = ["", "missing-input", "missing-calcium", "missing-creatinine", "missing-reported-value"].includes(model.reasonCode || "");
      const empty = model.mode === "direct" ? "Wpisz gotowy wskaźnik Ca/Cr z laboratorium i wybierz jego jednostkę."
        : "Wpisz stężenie wapnia i kreatyniny w moczu. Wiek służy wyłącznie dobraniu normy.";
      return `<div class="${missing ? "cacr-result-empty" : "cacr-result-error"}" data-clcr-formula="CaCr_spot"><strong>${escape(missing ? "Tutaj pojawi się wynik Ca/Cr" : "Sprawdź dane Ca/Cr")}</strong><p>${escape(model.message || model.qualification?.note || empty)}</p></div>`;
    }
    const reference = model.referenceAvailable ? model.reference : null;
    const category = typeof model.category === "string" ? model.category : "";
    const tone = ["success", "warning", "danger"].includes(model.tone) ? model.tone : "neutral";
    const shown = String(model.display?.text ?? model.display?.value ?? model.rawValue).replace(".", ",");
    const unit = model.display?.unit || model.unit || "";
    const boundary = model.boundary || model.display?.boundary || "";
    const nativeRange = ["mg/mg", "g/g"].includes(reference?.unit);
    const low = reference ? nativeRange ? fixedNative(reference.lower) : reference.display?.lower || String(reference.lower).replace(".", ",") : "";
    const high = reference ? nativeRange ? fixedNative(reference.upper) : reference.display?.upper || String(reference.upper).replace(".", ",") : "";
    const approximate = Boolean(reference?.display?.approximate || reference?.converted);
    const range = `${approximate ? "≈" : ""}${low}–${high}`;
    // Keep longer converted ranges in the fixed reference column. This is a
    // presentation of the model's range, never a second classification axis.
    const splitReference = Boolean(reference && range.length > 10);
    const rangeMarkup = splitReference
      ? `<span>od ${approximate ? "≈" : ""}${escape(low)}</span><span>do ${approximate ? "≈" : ""}${escape(high)}</span>` : escape(range);
    const norm = reference
      ? `<div class="clcr-result-reference cacr-proposal-reference" data-clcr-reference="cacr" data-clcr-reference-kind="cacr"><p class="clcr-result-reference-label">${escape(reference.label || "Norma dla wieku")}</p><strong class="clcr-result-reference-value" data-reference-split="${splitReference ? "1" : "0"}">${rangeMarkup}</strong><span class="clcr-result-reference-unit">${escape(reference.unit || unit)}</span></div>` : "";
    const rows = Array.isArray(reference?.table) ? reference.table : [];
    const table = rows.length
      ? `<table class="clcr-result-category-table"><caption>Normy dla wieku · mg/mg</caption><thead><tr><th scope="col">Wiek</th><th scope="col">Zakres</th></tr></thead><tbody>${rows.map(entry => {
        const selected = entry.selected || entry.id && entry.id === reference.band?.id;
        return `<tr data-clcr-age-row="${escape(entry.id || "")}" data-clcr-tone="neutral"${selected ? ' aria-current="true"' : ""}><th scope="row">${escape(entry.label || entry.sourceAge || "")}</th><td>${escape(fixedNative(entry.nativeLow ?? entry.lower))}–${escape(fixedNative(entry.nativeHigh ?? entry.upper))}${selected ? '<span class="clcr-result-current-label">Wiek pacjenta</span>' : ""}</td></tr>`;
      }).join("")}</tbody></table>` : "";
    const source = reference?.source || model.source;
    const population = reference?.band?.label || reference?.population?.ageBand || "";
    const sourceLine = reference ? [escape(population), sourceMarkup(source)].filter(Boolean).join(" · ") : "";
    const notes = model.notes || {};
    const methods = source?.methods;
    const methodText = methods ? `Wapń — ${methods.calcium}; kreatynina — ${methods.creatinine}. ${notes.universal || ""}` : "";
    const facts = knownFactText(model);
    const details = [
      ["Źródło i rodzaj normy", notes.source], ["Metody zakresu", methodText],
      ["Przeliczenia", notes.units], ["Próbka", notes.sample],
      ["Ograniczenia", notes.diagnosis], ["Potwierdzenie", notes.confirmation],
      ["Leki i interferencje", notes.interference],
      ["Obliczenie", model.mode === "concentration" ? notes.concentration : "Oryginalny wynik, jednostka i znak nierówności z laboratorium pozostają częścią oceny."],
      ["Zakres wieku", notes.agePolicy], ["Znane informacje", facts],
    ].filter(([, text]) => typeof text === "string" && text);
    const qualification = model.qualification?.note || "";
    const comparisonAvailable = Boolean(reference && ["below", "within", "above"].includes(model.comparison));
    const snapshot = model.snapshot || model;
    return `<div class="result-box clcr-result-card cacr-proposal-card${["warning", "danger"].includes(tone) ? " out-of-range" : ""}" data-clcr-formula="CaCr_spot" data-clcr-series="CaCr_spot" data-clcr-code="cacr" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(model.display?.value ?? model.rawValue)}" data-clcr-value-length="${Math.min(32, shown.length)}" data-clcr-display-unit="${escape(unit)}" data-clcr-display-label="Wapń/kreatynina — Ca/Cr" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${escape(model.status)}" data-clcr-comparison="${escape(model.comparison || "")}" data-clcr-comparator="${escape(model.comparator || "")}" data-clcr-category="${escape(category)}" data-clcr-boundary="${escape(boundary)}" data-clcr-tone="${tone}" data-clcr-reference-profile="${escape(model.profileId)}" data-clcr-reference-comparison="${comparisonAvailable}" data-clcr-cacr-snapshot="${escape(JSON.stringify(snapshot))}"><div class="clcr-result-main cacr-proposal-main${reference ? "" : " cacr-proposal-main--single"}"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value">${escape(shown)}</strong><span class="clcr-result-unit">${escape(unit)}</span>${boundary ? `<small class="clcr-result-boundary">Przed zaokrągleniem: ${escape(boundary)} ${escape(unit)}</small>` : ""}</div>${norm}</div><p class="clcr-result-interpretation cacr-proposal-status">${escape(model.statusText || "Ca/Cr — wynik liczbowy")}</p>${qualification ? `<p class="cacr-confirmation">${escape(qualification)}</p>` : ""}</div>${sourceLine ? `<p class="clcr-result-source cacr-source" data-clcr-formula="CaCr_spot">${sourceLine}</p>` : ""}<details class="clcr-result-details cacr-proposal-details" id="clcr-cacr-details" data-clcr-formula="CaCr_spot" tabindex="-1"><summary>Szczegóły i źródła</summary>${table}${source ? `<p>${sourceMarkup(source)}</p>` : ""}${details.map(([label, text]) => `<p><strong>${escape(label)}:</strong> ${escape(text)}</p>`).join("")}${boundary ? `<p>Wartość użyta do oceny: ${escape(String(model.rawValue).replace(".", ","))} ${escape(unit)}. Ocenę wyznaczamy przed zaokrągleniem.</p>` : ""}</details>`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
