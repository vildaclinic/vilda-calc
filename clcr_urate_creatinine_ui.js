/* KM/Cr: reversible form mounting and the captured integrated result card. */
(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrUrateCreatinineUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const layouts = new WeakMap();
  const INPUT_UNITS = ["mg/dL", "mg/L", "mmol/L", "µmol/L"];
  const CONTROLS = [
    { id: "URCR_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "URCR_uricAcid", label: "Kwas moczowy w moczu", placeholder: "np. 100" },
    { id: "URCR_uricAcidUnit", label: "Jednostka kwasu moczowego w moczu", options: INPUT_UNITS },
    { id: "URCR_creatinine", label: "Kreatynina w moczu", placeholder: "np. 100" },
    { id: "URCR_creatinineUnit", label: "Jednostka kreatyniny w moczu", options: INPUT_UNITS },
    { id: "URCR_reportedValue", label: "KM/Cr z wyniku badania", placeholder: "np. 0,67" },
    { id: "URCR_reportedUnit", label: "Jednostka gotowego wyniku KM/Cr", options: ["mmol/mmol", "mg/mg", "mg/g"] },
    { id: "URCR_specimen", label: "Rodzaj próbki", options: [["random", "Próbka jednorazowa"], ["timed", "Dobowa zbiórka moczu (DZM)"], ["unknown", "Typ próbki nieznany · dawny zapis"]] },
    { id: "URCR_outputUnit", label: "Jednostka wyniku", type: "hidden", value: "mmol/mmol" },
  ];
  const EDIT_ATTRIBUTES = ["aria-describedby", "aria-invalid"];
  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function ensureControls(doc) {
    const form = doc?.getElementById("clcrForm");
    if (!form) return [];
    let registry = doc.getElementById("clcrUrateCreatinineControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "urate-creatinine-control-registry");
      registry.id = "clcrUrateCreatinineControlRegistry";
      registry.hidden = true;
      form.append(registry);
    }
    return CONTROLS.map(spec => {
      const existing = doc.getElementById(spec.id);
      if (existing) return existing;
      const control = element(doc, spec.options ? "select" : "input");
      control.id = spec.id;
      control.setAttribute("aria-label", spec.label);
      if (spec.options) {
        spec.options.forEach(item => {
          const [value, text] = Array.isArray(item) ? item : [item, item];
          const option = element(doc, "option", "", text);
          option.value = value;
          if (value === "unknown") option.hidden = true;
          control.append(option);
        });
        control.value = Array.isArray(spec.options[0]) ? spec.options[0][0] : spec.options[0];
      } else {
        control.type = spec.type || "text";
        control.value = spec.value || "";
        if (!spec.type) {
          control.setAttribute("inputmode", "decimal");
          control.setAttribute("spellcheck", "false");
          control.setAttribute("autocomplete", "off");
          control.setAttribute("placeholder", spec.placeholder || "");
        }
      }
      // Hidden state has no visible label and is never a standalone question.
      if (spec.type === "hidden") registry.append(control);
      else {
        const label = element(doc, "label", "", spec.label);
        label.htmlFor = spec.id;
        label.append(control);
        registry.append(label);
      }
      return control;
    });
  }
  function getView(doc, options, id) {
    const registered = options.fieldViews?.get(id);
    if (registered) return registered;
    const control = doc.getElementById(id), wrapper = control?.closest("label");
    return control && wrapper ? { control, wrapper } : null;
  }
  function moveField(layout, id, target, unit) {
    const view = getView(layout.document, layout.options, id);
    if (!view?.wrapper?.parentNode) return null;
    const anchor = layout.document.createComment(`urate-creatinine-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit) });
    view.wrapper.classList.add("urate-creatinine-entry-field");
    if (unit) view.wrapper.classList.add("urate-creatinine-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("urateCreatinineInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
    return view;
  }
  function fieldRow(layout, host, valueId, unitId) {
    const field = element(layout.document, "div", "urate-creatinine-input-field");
    const row = element(layout.document, "div", "urate-creatinine-value-row");
    field.append(row); host.append(field);
    moveField(layout, valueId, row);
    moveField(layout, unitId, row, true);
    return field;
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm");
    if (!form) return null;
    ensureControls(doc);
    const card = element(doc, "section", "urate-creatinine-input-card");
    card.id = "urateCreatinineInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia stosunku kwasu moczowego do kreatyniny");
    const mode = element(doc, "div", "urate-creatinine-input-mode");
    mode.setAttribute("role", "group"); mode.setAttribute("aria-label", "Sposób wpisania wyniku");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [], specimenOpen: false };
    [["concentration", "Oblicz ze stężeń"], ["reported", "Gotowy wynik KM/Cr"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button"; button.dataset.urateCreatinineMode = value; button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("URCR_inputMode");
        if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout);
      });
      layout.modeButtons.push(button); mode.append(button);
    });
    const hint = element(doc, "p", "urate-creatinine-field-hint", "Wybierz jednostki zgodne z wynikiem laboratorium.");
    const concentration = element(doc, "div", "urate-creatinine-mode-fields");
    const reported = element(doc, "div", "urate-creatinine-mode-fields");
    card.append(mode, hint, concentration, reported);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear); else form.append(card);
    fieldRow(layout, concentration, "URCR_uricAcid", "URCR_uricAcidUnit");
    fieldRow(layout, concentration, "URCR_creatinine", "URCR_creatinineUnit");
    fieldRow(layout, reported, "URCR_reportedValue", "URCR_reportedUnit");
    reported.append(element(doc, "p", "urate-creatinine-field-hint", "Wpisz sam stosunek. Nie potrzebujemy czasu ani objętości moczu."));
    const row = element(doc, "div", "urate-creatinine-context-row"), copy = element(doc, "div");
    const caption = element(doc, "span", "urate-creatinine-context-label", "Rodzaj próbki");
    layout.specimenValue = element(doc, "strong", "urate-creatinine-context-value");
    layout.specimenButton = element(doc, "button", "urate-creatinine-context-button", "Zmień");
    layout.specimenButton.type = "button";
    layout.specimenButton.setAttribute("aria-expanded", "false");
    layout.specimenButton.setAttribute("aria-controls", "urateCreatinineSpecimenEditor");
    layout.specimenEditor = element(doc, "div", "urate-creatinine-inline-editor");
    layout.specimenEditor.id = "urateCreatinineSpecimenEditor"; layout.specimenEditor.hidden = true;
    copy.append(caption, layout.specimenValue); row.append(copy, layout.specimenButton); card.append(row, layout.specimenEditor);
    moveField(layout, "URCR_specimen", layout.specimenEditor);
    layout.specimenEditor.append(element(doc, "p", "urate-creatinine-field-hint", "Rodzaj próbki zmienia dostępność normy. Samo obliczenie nadal wymaga tylko dwóch stężeń albo gotowego stosunku."));
    layout.specimenButton.addEventListener("click", () => {
      layout.specimenOpen = layout.specimenEditor.hidden;
      refreshLayout(layout);
      if (layout.specimenOpen) doc.getElementById("URCR_specimen")?.focus();
    });
    layout.assumption = element(doc, "p", "urate-creatinine-assumption", "Przyjmujemy, że oba stężenia pochodzą z tej samej próbki moczu.");
    layout.error = element(doc, "p", "urate-creatinine-field-error");
    layout.error.id = "urateCreatinineInputError"; layout.error.hidden = true; layout.error.setAttribute("role", "alert");
    layout.readiness = element(doc, "p", "urate-creatinine-readiness"); layout.readiness.setAttribute("aria-live", "polite");
    card.append(layout.assumption, layout.error, layout.readiness);
    layout.concentration = concentration; layout.reported = reported;
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit); form.addEventListener("change", layout.onEdit);
    return layout;
  }
  function evaluate(doc) {
    const browser = doc.defaultView || root, engine = browser.VildaClcrUrateCreatinine || root.VildaClcrUrateCreatinine;
    if (!engine?.compute || !engine.readInputFromDocument) return null;
    const source = browser.ClcrUrateCreatinineReferenceData || root.ClcrUrateCreatinineReferenceData;
    return engine.compute(engine.readInputFromDocument(doc), source?.DATA || source?.DEFAULT_POLICY);
  }
  function specimenLabel(value) {
    return value === "random" ? "Próbka jednorazowa" : value === "timed" ? "Dobowa zbiórka moczu (DZM)" : value === "unknown" ? "Typ próbki nieznany · dawny zapis" : "Wybierz rodzaj próbki";
  }
  function refreshLayout(layout) {
    const doc = layout.document, reported = doc.getElementById("URCR_inputMode")?.value === "reported";
    layout.concentration.hidden = reported; layout.reported.hidden = !reported;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.urateCreatinineMode === (reported ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const specimen = doc.getElementById("URCR_specimen"), model = evaluate(doc);
    layout.specimenValue.textContent = specimenLabel(specimen?.value);
    for (const option of Array.from(specimen?.children || [])) if (option.value === "unknown") option.hidden = specimen.value !== "unknown";
    const invalidIds = Array.isArray(model?.invalidIds) ? model.invalidIds : [];
    const open = layout.specimenOpen || invalidIds.includes("URCR_specimen");
    layout.specimenEditor.hidden = !open; layout.specimenButton.setAttribute("aria-expanded", String(Boolean(open)));
    layout.assumption.hidden = reported || model?.blocked === true;
    const invalid = Boolean(model && !model.valid && model.errorCode && !/^missing-/.test(model.errorCode));
    layout.error.hidden = !invalid; layout.error.textContent = invalid ? model.error || "Sprawdź wpisane wartości." : "";
    layout.moves.forEach(({ view }) => view.control.setAttribute("aria-invalid", String(invalidIds.includes(view.control.id))));
    const required = reported ? ["URCR_reportedValue"] : ["URCR_uricAcid", "URCR_creatinine"];
    const count = required.filter(id => String(doc.getElementById(id)?.value || "").trim()).length;
    layout.readiness.dataset.complete = String(model?.valid === true);
    layout.readiness.textContent = invalid ? "Sprawdź dane oznaczone na czerwono" : model?.valid ? `✓ Wymagane dane ${required.length}/${required.length}` : `Wymagane dane ${count}/${required.length}`;
  }
  function restore(doc) {
    const layout = layouts.get(doc); if (!layout) return;
    layout.moves.forEach(({ view, anchor, attributes, unit }) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
      anchor.remove(); view.wrapper.classList.remove("urate-creatinine-entry-field");
      if (unit) view.wrapper.classList.remove("urate-creatinine-unit-field");
      Object.entries(attributes).forEach(([key, value]) => value === null ? view.control.removeAttribute(key) : view.control.setAttribute(key, value));
    });
    layout.card.remove(); layout.form.removeEventListener("input", layout.onEdit); layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(doc); doc.documentElement.removeAttribute("data-clcr-urate-creatinine-active");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) { layout = createLayout(doc, options); if (!layout) return; layouts.set(doc, layout); }
    doc.documentElement.dataset.clcrUrateCreatinineActive = "1"; refreshLayout(layout);
  }
  function refresh(doc) { const layout = layouts.get(doc); if (layout) refreshLayout(layout); }
  function paragraph(value, className) { return value ? `<p${className ? ` class="${className}"` : ""}>${escape(value)}</p>` : ""; }
  function shownResult(model) {
    return model.presentation || { valueText: model.display?.text || String(model.rawValue ?? ""), unitText: model.unit || "mmol/mmol", rawValue: model.rawValue, referenceValue: model.referenceText || "Brak normy do porównania", referenceText: model.referenceText || "" };
  }
  function referenceAvailable(model) { return model.referenceAvailable === true && model.reference && Number.isFinite(model.reference.lower) && Number.isFinite(model.reference.upper); }
  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło"), url = String(source.url || "");
    const link = /^https:\/\//.test(url) ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    return `${link}${source.locator ? `<small>${escape(source.locator)}</small>` : ""}`;
  }
  function referenceTable(model, shown) {
    const rows = Array.isArray(model.referenceRows) ? model.referenceRows : Array.isArray(model.referenceTable) ? model.referenceTable : [];
    if (!rows.length) return "";
    const label = shown.referenceLabel || model.reference?.sourceLabel || "Norma dla wieku";
    return `<h3>${escape(label)}</h3><p class="urate-creatinine-table-caption">Próbka jednorazowa · ${escape(shown.unitText)}</p><table class="clcr-result-category-table" aria-label="Zakresy KM/Cr dla próbki jednorazowej"><thead><tr><th scope="col">Wiek</th><th scope="col">Norma</th></tr></thead><tbody>${rows.map(row => `<tr${row.active ? ' class="urate-creatinine-current-row" aria-current="true"' : ""}><td>${escape(row.label || "")}${row.sourceAgeLabel ? `<small class="urate-creatinine-source-age">W źródle: ${escape(row.sourceAgeLabel)}</small>` : ""}</td><td>${escape(row.text || "")}</td></tr>`).join("")}</tbody></table>`;
  }
  function detailsHtml(result) {
    const model = result || {}, shown = shownResult(model), notes = model.notes || {};
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const educational = Array.isArray(model.educationalReferences) ? model.educationalReferences : [];
    const sections = [
      ["Jak dobrano normę", notes.referenceCalculation || notes.contextExplanation || model.reference?.explanation || notes.scope],
      ["Przyjęte przedziały wieku", model.referencePolicy?.agePolicy],
      ["Granice zakresu", model.referencePolicy?.endpointPolicy],
      ["Jak liczymy?", notes.formula || notes.calculation],
      ["Przeliczenia jednostek", notes.conversion],
      ["Rodzaj próbki", notes.specimen || notes.collection || notes.timed],
      ["Ograniczenia interpretacji", notes.limitations || notes.clinical],
    ].filter(([, value]) => typeof value === "string" && value).map(([heading, value]) => `<h3>${escape(heading)}</h3>${paragraph(value)}`).join("");
    const extra = (Array.isArray(notes.sections) ? notes.sections : []).map(section => `<h3>${escape(section.title || section.label || "")}</h3>${(Array.isArray(section.paragraphs) ? section.paragraphs : [section.text]).map(value => paragraph(value)).join("")}`).join("");
    const quantity = shown.exactValue || model.exactMain, full = shown.fullValueText || shown.unroundedValueText;
    const fraction = shown.fullValueComplete === false && quantity?.numerator && quantity?.denominator ? paragraph(`Dokładny ułamek: ${quantity.numerator}/${quantity.denominator} ${shown.unitText}.`, "urate-creatinine-unrounded-result") : "";
    // A repeating expansion is retained in the snapshot, while its exact
    // fraction keeps the visible explanation useful instead of printing
    // hundreds of digits. Finite near-boundary decimals remain verbatim.
    const expansion = shown.fullValueComplete === false ? `≈${String(model.rawValue).replace(".", ",")}` : full;
    const precision = shown.approximate && full ? `<h3>Wynik przed zaokrągleniem</h3>${paragraph(`${expansion} ${shown.unitText}`, "urate-creatinine-unrounded-result")}${fraction}${paragraph(shown.precisionNote)}` : "";
    return `<details class="clcr-result-details urate-creatinine-proposal-details" id="clcr-urate-creatinine-details" data-clcr-formula="KM_Cr" tabindex="-1"><summary>Szczegóły i źródła</summary>${referenceTable(model, shown)}${precision}${sections}${extra}${sources.length ? `<h3>Źródło zakresów</h3><ul class="urate-creatinine-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}${educational.length ? `<h3>Źródła uzupełniające</h3><ul class="urate-creatinine-source-links">${educational.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }
  function axisMarkup(model, shown) {
    if (!referenceAvailable(model) || model.status === "zero" || model.referenceActive === false) return "";
    const lower = model.reference.lower, upper = model.reference.upper, raw = model.rawValue;
    const maximum = Math.max(upper * 1.25, raw * 1.15);
    if (!Number.isFinite(maximum) || maximum <= 0) return "";
    const low = 100 * lower / maximum, high = 100 * upper / maximum, point = Math.min(98, Math.max(1, 100 * raw / maximum));
    // Keep both numeric boundaries in the card; an extreme number need not
    // compress the reference band into a visually meaningless sliver.
    if (![low, high, point].every(Number.isFinite) || high - low < 30) return "";
    const endpoints = String(shown.referenceValue).replace(/^≈/, "").split("–");
    return `<div class="urate-creatinine-norm-axis" role="img" aria-label="Wynik ${escape(shown.valueText)} ${escape(shown.unitText)}; norma ${escape(shown.referenceText || shown.referenceValue)}"><svg class="urate-creatinine-norm-graphic" width="100%" height="76" aria-hidden="true" focusable="false"><rect class="urate-creatinine-norm-background" x="0" y="34" width="100%" height="12" rx="6"/><rect class="urate-creatinine-norm-band" x="${low}%" y="34" width="${high - low}%" height="12"/><rect class="urate-creatinine-norm-track" x="0" y="34" width="100%" height="12" rx="6"/><line class="urate-creatinine-norm-boundary urate-creatinine-norm-boundary--low" x1="${low}%" x2="${low}%" y1="29" y2="49"/><line class="urate-creatinine-norm-boundary urate-creatinine-norm-boundary--high" x1="${high}%" x2="${high}%" y1="29" y2="49"/><line class="urate-creatinine-norm-point" x1="${point}%" x2="${point}%" y1="24" y2="52"/><circle class="urate-creatinine-norm-point-cap" cx="${point}%" cy="22" r="4.5"/><text class="urate-creatinine-norm-band-title" x="${(low + high) / 2}%" y="12">Norma</text><g class="urate-creatinine-norm-labels"><text class="urate-creatinine-norm-label--low" x="${low}%" y="61">${escape(endpoints[0] || "")}</text><text class="urate-creatinine-norm-label--high" x="${high}%" y="61">${escape(endpoints[1] || "")}</text></g></svg><p class="urate-creatinine-norm-axis-caption">Znacznik pokazuje wynik pacjenta. Granice normy zaznaczono pionowymi liniami.</p></div>`;
  }
  function renderResult(result) {
    const model = result || {}, shown = shownResult(model);
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode), title = missing ? "Tu pojawi się wynik KM/Cr" : "Sprawdź wpisane dane";
      return `<div class="${missing ? "urate-creatinine-result-empty" : "urate-creatinine-result-error"}" data-clcr-formula="KM_Cr"><strong>${title}</strong>${paragraph(model.error || "Wpisz oba stężenia z tej samej próbki albo jeden gotowy wynik KM/Cr.")}</div>${detailsHtml(model)}`;
    }
    let snapshot; try { snapshot = JSON.stringify(model); } catch (_) { return '<div class="urate-creatinine-result-error"><strong>Sprawdź dane wyniku</strong></div>'; }
    const available = referenceAvailable(model), value = String(shown.valueText), reference = String(shown.referenceValue || "Brak normy do porównania");
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const policy = model.referencePolicy || model.policy || {}, status = shown.statusText || model.statusText || "Obliczony KM/Cr";
    const attributes = {
      "data-clcr-formula": "KM_Cr", "data-clcr-series": "KM_Cr", "data-clcr-code": "urate-creatinine",
      "data-clcr-value": model.rawValue, "data-clcr-display-value": value, "data-clcr-value-length": value.length,
      "data-clcr-display-unit": shown.unitText, "data-clcr-display-label": "Kwas moczowy/kreatynina — KM/Cr",
      "data-clcr-status": status, "data-clcr-assessment": assessment, "data-clcr-tone": tone,
      "data-clcr-reference-comparison": available && model.referenceActive !== false,
      "data-clcr-reference-profile": policy.id || model.reference?.profileId || "", "data-clcr-reference-profile-version": policy.version || "",
      "data-clcr-urate-creatinine-status": model.status || "unassessed", "data-clcr-urate-creatinine-output-unit": "mmol/mmol", "data-clcr-urate-creatinine-snapshot": snapshot,
    };
    const attr = Object.entries(attributes).map(([key, val]) => `${key}="${escape(val)}"`).join(" ");
    return `<div class="result-box clcr-result-card urate-creatinine-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" ${attr}><h3 class="urate-creatinine-result-status">${escape(status)}</h3><div class="clcr-result-main urate-creatinine-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${value.length > 3}" data-dense="${value.length > 8}" data-extra-dense="${value.length > 12}">${escape(value)}</strong><span class="urate-creatinine-result-unit">${escape(shown.unitText)}</span></div><div class="clcr-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${available ? "range" : "none"}"><p class="clcr-result-reference-label">${escape(shown.referenceLabel || "Norma dla wieku")}</p><strong class="clcr-result-reference-value urate-creatinine-reference-value">${escape(reference)}</strong><span class="urate-creatinine-reference-unit">${available ? escape(shown.unitText) : "&#160;"}</span></div></div>${paragraph(shown.interpretation || model.interpretation, "urate-creatinine-result-copy")}${axisMarkup(model, shown)}</div>${detailsHtml(model)}`;
  }
  return Object.freeze({ ensureControls, sync, restore, refresh, renderResult, detailsHtml, escape });
});
