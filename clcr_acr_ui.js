(function (root, factory) {
  const api = factory();
  if (root) root.ClcrAcrUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const CONTEXT_FIELDS = [
    "ACR_same_specimen", "spotSampleKind", "spotMenstruation",
    "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness",
  ];

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
    const anchor = preferredAnchor?.parentNode ? preferredAnchor : layout.document.createComment("acr-field-origin");
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
    return layout.document.getElementById("ACR_entry_mode")?.value === "direct" ? "direct" : "concentration";
  }

  function refreshMode(layout) {
    const direct = modeOf(layout) === "direct";
    layout.concentrationFields.hidden = direct;
    layout.directFields.hidden = !direct;
    layout.assumption.hidden = direct;
    layout.buttons.concentration.setAttribute("aria-pressed", String(!direct));
    layout.buttons.direct.setAttribute("aria-pressed", String(direct));
    const specimen = layout.fieldViews.get("ACR_same_specimen");
    if (specimen) specimen.wrapper.hidden = direct;
    const specimenControl = specimen?.control;
    // Carry a known negative shared answer into the visible ACR context. This
    // preserves a fact; it does not silently turn an unanswered checkbox into
    // confirmation. A deliberate new 'confirmed' answer can correct it.
    if (specimenControl && specimenControl.value === "") {
      const legacyAnswer = layout.document.getElementById("ui_spotSameSpecimen_answer")?.value || "";
      if (legacyAnswer === "no") specimenControl.value = "different";
      else if (legacyAnswer === "yes" || (legacyAnswer !== "unknown" &&
          layout.document.getElementById("spotSameSpecimen")?.checked)) specimenControl.value = "confirmed";
    }
    layout.assumption.textContent = specimenControl?.value === "different"
      ? "Oznaczenia z różnych próbek nie pozwalają obliczyć ACR."
      : specimenControl?.value === "confirmed"
        ? "Potwierdzono, że oba oznaczenia pochodzą z tej samej próbki moczu."
        : "Zakładamy, że oba oznaczenia pochodzą z tej samej próbki moczu.";
    layout.card.dataset.acrMode = direct ? "direct" : "concentration";
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
    const card = element(documentRef, "section", "acr-input-card");
    card.id = "acrInputCard";
    card.setAttribute("aria-label", "Dane do ACR");
    const modes = element(documentRef, "div", "acr-mode-switch");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "Sposób wprowadzenia ACR");
    const buttons = {};
    [["concentration", "Oblicz ze stężeń"], ["direct", "Gotowy wynik ACR"]].forEach(([value, label]) => {
      const button = element(documentRef, "button", "", label);
      button.type = "button";
      button.dataset.acrMode = value;
      button.setAttribute("aria-controls", value === "direct" ? "acrDirectFields" : "acrConcentrationFields");
      buttons[value] = button;
      modes.appendChild(button);
    });
    const concentrationFields = element(documentRef, "div", "acr-entry-fields");
    concentrationFields.id = "acrConcentrationFields";
    const directFields = element(documentRef, "div", "acr-entry-fields");
    directFields.id = "acrDirectFields";
    const assumption = element(documentRef, "p", "acr-assumption", "Zakładamy, że oba oznaczenia pochodzą z tej samej próbki moczu.");
    const details = element(documentRef, "details", "acr-sample-info");
    details.id = "acrSampleInfo";
    details.appendChild(element(documentRef, "summary", "", "Informacje o próbce"));
    const context = element(documentRef, "div", "acr-sample-info__fields");
    details.appendChild(context);
    card.append(modes, concentrationFields, directFields, assumption, details);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.appendChild(card);
    const layout = {
      document: documentRef, form, card, buttons, concentrationFields,
      directFields, assumption, details, context, moves: new Map(),
      rows: new Map(), names: new Map(), unitLabels: new Map(),
      fieldViews: options.fieldViews, onChange: options.onChange,
    };
    const ageContext = element(documentRef, "div", "acr-patient-age");
    const ageText = element(documentRef, "span");
    const ageEdit = element(documentRef, "button", "acr-patient-age__edit", "Zmień");
    const ageFields = element(documentRef, "div", "acr-age-fields");
    ageFields.id = "acrAgeFields";
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
      if (["ACR_entry_mode", "ACR_same_specimen", "ui_spotSameSpecimen_answer"].includes(event.target?.id)) refreshMode(layout);
    };
    form.addEventListener("input", layout.onFieldEdit);
    form.addEventListener("change", layout.onFieldEdit);
    Object.entries(buttons).forEach(([value, button]) => {
      button.addEventListener("click", () => {
        const control = documentRef.getElementById("ACR_entry_mode");
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
    wrapper.classList.add("acr-entry-field");
    const name = wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "acr-value-row");
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
      documentRef.documentElement?.removeAttribute("data-clcr-acr-active");
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
    layout.fieldViews.forEach((view) => view.wrapper.classList.remove("acr-entry-field"));
    layout.card.remove();
    layout.ageContext.remove();
    layout.ageFields.remove();
    layout.form.removeEventListener("input", layout.onFieldEdit);
    layout.form.removeEventListener("change", layout.onFieldEdit);
    layouts.delete(documentRef);
    documentRef.documentElement?.removeAttribute("data-clcr-acr-active");
  }

  function sync(options) {
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
    documentRef.documentElement.dataset.clcrAcrActive = "1";
    mountAgeContext(layout);
    pair(layout, "U_Alb", "U_Alb_unit", "Albumina w moczu", layout.concentrationFields);
    pair(layout, "Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", layout.concentrationFields);
    pair(layout, "ACR_reported", "ACR_reported_unit", "ACR z laboratorium", layout.directFields);
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
      const blocked = !["", "missing-input", "missing-albumin", "missing-creatinine", "missing-reported-value"].includes(model.reasonCode || "");
      const validation = {
        "different-specimens": "Nie obliczamy ACR z różnych próbek. Użyj albuminy i kreatyniny oznaczonych w tej samej próbce moczu albo gotowego wyniku ACR z laboratorium.",
        "invalid-albumin": "Podaj nieujemne stężenie albuminy w moczu.",
        "invalid-creatinine": "Stężenie kreatyniny w moczu musi być większe od zera.",
        "invalid-reported-value": "Podaj liczbowy wynik ACR z laboratorium. Zachowaj znak <, >, ≤ lub ≥, jeżeli występuje na wydruku.",
      };
      const empty = model.mode === "direct"
        ? "Wpisz wynik ACR z laboratorium i wybierz jego jednostkę."
        : "Wpisz stężenie albuminy i kreatyniny w moczu.";
      return `<div class="${blocked ? "acr-result-error" : "acr-result-empty"}" data-clcr-formula="ACR"><strong>${escape(blocked ? "Sprawdź dane ACR" : "Tutaj pojawi się wynik ACR")}</strong><p>${escape(model.statusText || model.qualification?.note || validation[model.reasonCode] || empty)}</p></div>`;
    }
    const snapshot = model.snapshot || model;
    const reference = model.referenceAvailable ? model.reference : null;
    const category = typeof model.category === "string" ? model.category : model.category?.code || "";
    const tone = ["success", "warning", "danger"].includes(model.tone) ? model.tone : "neutral";
    const shown = String(model.display?.text ?? model.display?.value ?? model.rawValue).replace(".", ",");
    const unit = model.display?.unit || model.unit || "";
    const boundary = model.boundary || model.display?.boundary || "";
    const detailsId = "clcr-acr-details";
    const badge = category
      ? `<button class="clcr-result-category acr-proposal-badge" type="button" data-clcr-category-control="${escape(category)}" aria-controls="${detailsId}" aria-expanded="false" aria-label="Kategoria ${escape(category)} — pokaż szczegóły">${escape(category)}</button>` : "";
    const norm = reference
      ? `<div class="clcr-result-reference acr-proposal-reference" data-clcr-reference="acr" data-clcr-reference-kind="acr"><p class="clcr-result-reference-label">${escape(reference.label || "Norma dla wieku")}</p><strong class="clcr-result-reference-value">${escape(reference.limit)}</strong><span class="clcr-result-reference-unit">${escape(reference.unit || unit)}</span></div>` : "";
    const rows = reference?.categories || [];
    const table = rows.length
      ? `<table class="clcr-result-category-table"><caption>Kategorie albuminurii · ${escape(reference.unit || unit)}</caption><thead><tr><th scope="col">Kategoria</th><th scope="col">Zakres</th><th scope="col">Znaczenie</th></tr></thead><tbody>${rows.map((entry) => `<tr data-clcr-category-row="${escape(entry.code)}" data-clcr-tone="${escape(entry.tone || "neutral")}"${category === entry.code ? ' aria-current="true"' : ""}><th scope="row">${escape(entry.code)}</th><td>${escape(entry.range)}</td><td>${escape(entry.label || entry.meaning || "")}${category === entry.code ? '<span class="clcr-result-current-label">Wynik pacjenta</span>' : ""}</td></tr>`).join("")}</tbody></table>` : "";
    const population = reference ? (typeof model.population === "string" ? model.population : model.population?.label || reference.population?.label || reference.population || "") : "";
    const source = sourceMarkup(reference?.source || model.source);
    const sourceLine = [escape(population), source].filter(Boolean).join(" · ");
    const notes = Array.isArray(model.detailNotes) ? [...model.detailNotes] : [
      model.mode === "concentration" ? model.notes?.concentration : "",
      model.notes?.sample, model.notes?.transientFactors,
      model.notes?.chronicity, model.notes?.units,
      typeof model.context?.ageYears === "number" && model.context.ageYears < 18 ? model.notes?.pediatric : "",
    ].filter(Boolean);
    // Rounding an inequality's endpoint would change its meaning (for example
    // '<0.001 mg/g' must never become '<0 mg/mmol'). Keep its native unit only.
    const converted = !model.comparator && Number.isFinite(model.convertedValue)
      ? `<p><strong>Przeliczenie:</strong> ≈${escape(model.convertedValue.toLocaleString("pl-PL", { maximumFractionDigits: 2 }))} ${escape(model.convertedUnit)}.</p>` : "";
    const qualification = model.qualification?.note || "";
    return `<div class="result-box clcr-result-card acr-proposal-card${["warning", "danger"].includes(tone) ? " out-of-range" : ""}" data-clcr-formula="ACR" data-clcr-series="ACR" data-clcr-code="acr" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(model.display?.value ?? model.rawValue)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="${escape(unit)}" data-clcr-display-label="Albumina/kreatynina — ACR" data-clcr-status="${escape(model.statusText)}" data-clcr-category="${escape(category)}" data-clcr-boundary="${escape(boundary)}" data-clcr-tone="${tone}" data-clcr-reference-profile="${escape(model.profileId)}" data-clcr-reference-comparison="${Boolean(reference && category)}" data-clcr-acr-snapshot="${escape(JSON.stringify(snapshot))}"><div class="clcr-result-main acr-proposal-main${reference ? "" : " acr-proposal-main--single"}"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta ${badge}</p><strong class="clcr-result-value">${escape(shown)}</strong><span class="clcr-result-unit">${escape(unit)}</span>${boundary ? `<small class="clcr-result-boundary">Przed zaokrągleniem: ${escape(boundary)} ${escape(unit)}</small>` : ""}</div>${norm}</div><p class="clcr-result-interpretation acr-proposal-status">${escape(model.statusText || model.categoryDescription || "ACR — wynik liczbowy")}</p>${qualification ? `<p class="acr-confirmation">${escape(qualification)}</p>` : ""}</div>${sourceLine ? `<p class="clcr-result-source acr-source" data-clcr-formula="ACR">${sourceLine}</p>` : ""}<details class="clcr-result-details acr-proposal-details" id="${detailsId}" data-clcr-formula="ACR" tabindex="-1"><summary>Szczegóły i źródła</summary>${table}${converted}${notes.map((note) => `<p>${escape(note)}</p>`).join("")}${boundary ? `<p>Wartość przed zaokrągleniem: ${escape(boundary)} ${escape(unit)}.</p>` : ""}${source ? `<p>${source}</p>` : ""}</details>`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
