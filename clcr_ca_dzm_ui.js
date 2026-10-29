(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrCaDzmUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const layouts = new WeakMap();
  const CONTROLS = [
    { id: "CA_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "CA_concentration", label: "Wapń w moczu", placeholder: "np. 5" },
    { id: "CA_concentrationUnit", label: "Jednostka wapnia", options: [["mmol/L"], ["mg/dL"], ["mg/L"]] },
    { id: "CA_volume", label: "Objętość całej zbiórki", placeholder: "np. 1200" },
    { id: "CA_volumeUnit", label: "Jednostka objętości", options: [["mL"], ["L"]] },
    { id: "CA_reportedValue", label: "Wydalanie z wyniku badania", placeholder: "np. 360" },
    { id: "CA_reportedUnit", label: "Jednostka gotowego wydalania", options: [["mg/24h", "mg/24 h"], ["mmol/24h", "mmol/24 h"], ["mg/kg/24h", "mg/kg/24 h"]] },
    { id: "CA_collectionHours", label: "Rzeczywisty czas zbiórki", value: "24", placeholder: "24" },
    { id: "CA_collectionSource", label: "Pochodzenie czasu zbiórki", type: "hidden", value: "assumed-24h" },
  ];
  CONTROLS.push({ id: "CA_clinicalMode", label: "Kontekst interpretacji", options: [["general", "Ocena ogólna / kamica"], ["hypo", "Niedoczynność przytarczyc"], ["phpt", "Pierwotna nadczynność przytarczyc"]] });
  const EDIT_ATTRIBUTES = ["aria-describedby", "aria-invalid"];

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Called before workflow decoration, so raw values participate in its normal
  // session capture, patient switching, dirty tracking and saved-result editing.
  function ensureControls(doc) {
    const form = doc?.getElementById("clcrForm");
    if (!form) return [];
    let registry = doc.getElementById("clcrCaDzmControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "ca-dzm-control-registry");
      registry.id = "clcrCaDzmControlRegistry";
      registry.hidden = true;
      form.append(registry);
    }
    return CONTROLS.map(spec => {
      const existing = doc.getElementById(spec.id);
      if (existing) { if (spec.id === "CA_collectionHours") root.ClcrCollectionDuration?.bindControl(existing, { sourceControl: doc.getElementById("CA_collectionSource") }); return existing; }
      const label = element(doc, "label", "", spec.label);
      label.htmlFor = spec.id;
      const control = element(doc, spec.options ? "select" : "input");
      control.id = spec.id;
      if (spec.options) {
        spec.options.forEach(([value, text]) => {
          const option = element(doc, "option", "", text || value);
          option.value = value;
          control.append(option);
        });
        control.value = spec.options[0][0];
      } else {
        control.type = spec.type || "text";
        if (!spec.type) {
          control.setAttribute("inputmode", "decimal");
          control.setAttribute("spellcheck", "false");
          control.setAttribute("autocomplete", "off");
        }
        if (spec.placeholder) control.setAttribute("placeholder", spec.placeholder);
        control.value = spec.value || "";
      }
      control.setAttribute("aria-label", spec.label);
      label.append(control);
      registry.append(label);
      if (spec.id === "CA_collectionSource") root.ClcrCollectionDuration?.bindControl(doc.getElementById("CA_collectionHours"), { sourceControl: control });
      return control;
    });
  }

  function getView(doc, options, id) {
    const registered = options.fieldViews?.get(id);
    if (registered) return registered;
    const control = doc.getElementById(id);
    const wrapper = control?.closest("label");
    return control && wrapper ? { control, wrapper } : null;
  }

  function moveField(layout, id, target, unit) {
    const view = getView(layout.document, layout.options, id);
    if (!view?.wrapper?.parentNode) return null;
    const anchor = layout.document.createComment(`ca-dzm-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit) });
    view.wrapper.classList.add("ca-dzm-entry-field");
    if (unit) view.wrapper.classList.add("ca-dzm-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("caDzmInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
    return view;
  }

  function fieldRow(layout, host, valueId, unitId, direct) {
    const field = element(layout.document, "div", "ca-dzm-input-field");
    const row = element(layout.document, "div", `ca-dzm-value-row${direct ? " ca-dzm-value-row--reported" : ""}`);
    field.append(row);
    host.append(field);
    moveField(layout, valueId, row);
    moveField(layout, unitId, row, true);
    return field;
  }

  function disclosure(layout, label, id) {
    const row = element(layout.document, "div", "ca-dzm-context-row");
    const copy = element(layout.document, "div");
    const caption = element(layout.document, "span", "ca-dzm-context-label", label);
    const value = element(layout.document, "strong", "ca-dzm-context-value");
    const button = element(layout.document, "button", "ca-dzm-context-button", "Zmień");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    const editor = element(layout.document, "div", "ca-dzm-inline-editor");
    editor.id = id;
    editor.hidden = true;
    const disclosure = { row, value, button, editor, userOpen: false };
    copy.append(caption, value);
    row.append(copy, button);
    button.addEventListener("click", () => {
      disclosure.userOpen = editor.hidden;
      editor.hidden = !disclosure.userOpen;
      button.setAttribute("aria-expanded", String(!editor.hidden));
      if (!editor.hidden) editor.querySelector("input")?.focus();
    });
    layout.card.append(row, editor);
    return disclosure;
  }

  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm");
    if (!form) return null;
    ensureControls(doc);
    const card = element(doc, "section", "ca-dzm-input-card");
    card.id = "caDzmInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia dobowego wydalania wapnia");
    const mode = element(doc, "div", "ca-dzm-input-mode");
    mode.setAttribute("role", "group");
    mode.setAttribute("aria-label", "Sposób wpisania wyniku");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężeń"], ["reported", "Gotowe wydalanie"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button";
      button.dataset.caDzmMode = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("CA_inputMode");
        if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout);
      });
      layout.modeButtons.push(button);
      mode.append(button);
    });
    const concentration = element(doc, "div", "ca-dzm-mode-fields");
    const reported = element(doc, "div", "ca-dzm-mode-fields");
    card.append(mode, concentration, reported);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    fieldRow(layout, concentration, "CA_concentration", "CA_concentrationUnit");
    fieldRow(layout, concentration, "CA_volume", "CA_volumeUnit");
    fieldRow(layout, reported, "CA_reportedValue", "CA_reportedUnit", true);
    reported.append(element(doc, "p", "ca-dzm-field-hint", "Gotowy wynik dobowy nie wymaga ponownego wpisywania objętości."));
    layout.concentration = concentration;
    layout.reported = reported;
    layout.weight = disclosure(layout, "Masa ciała", "caDzmWeightEditor");
    layout.weightView = moveField(layout, "weight", layout.weight.editor);
    layout.weight.editor.append(element(doc, "p", "ca-dzm-field-hint", "Używamy znanej masy. Popraw ją, jeśli pomiar dotyczy innej masy ciała."));
    layout.duration = disclosure(layout, "Czas zbiórki", "caDzmDurationEditor");
    moveField(layout, "CA_collectionHours", layout.duration.editor);
    layout.duration.editor.append(element(doc, "p", "ca-dzm-field-hint", "Dla innego czasu pokażemy przeliczenie do 24 godzin, bez porównania z normą dobowej zbiórki."));
    layout.clinical = element(doc, "details", "ca-dzm-clinical-context");
    layout.clinicalSummary = element(doc, "summary");
    const clinicalHost = element(doc, "div", "ca-dzm-clinical-select");
    layout.clinicalText = element(doc, "span", "ca-dzm-clinical-face");
    layout.clinicalText.setAttribute("aria-hidden", "true");
    layout.clinicalHelp = element(doc, "p", "ca-dzm-field-hint");
    layout.card.append(layout.clinical);
    layout.clinical.append(layout.clinicalSummary, clinicalHost, layout.clinicalHelp);
    moveField(layout, "CA_clinicalMode", clinicalHost);
    clinicalHost.append(layout.clinicalText);
    layout.assumption = element(doc, "p", "ca-dzm-assumption");
    layout.error = element(doc, "p", "ca-dzm-field-error");
    layout.error.id = "caDzmInputError";
    layout.error.hidden = true;
    layout.error.setAttribute("role", "alert");
    layout.readiness = element(doc, "p", "ca-dzm-readiness");
    layout.readiness.setAttribute("aria-live", "polite");
    card.append(layout.assumption, layout.error, layout.readiness);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function evaluate(doc) {
    const browser = doc.defaultView || root;
    const engine = browser.VildaClcrCaDzm || root.VildaClcrCaDzm;
    if (!engine?.readInputFromDocument || !engine.evaluate) return null;
    return engine.evaluate(engine.readInputFromDocument(doc), (browser.ClcrCaDzmReferenceData || root.ClcrCaDzmReferenceData)?.DEFAULT_POLICY);
  }

  function refreshLayout(layout) {
    const doc = layout.document;
    const reported = doc.getElementById("CA_inputMode")?.value === "reported";
    layout.concentration.hidden = reported;
    layout.reported.hidden = !reported;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.caDzmMode === (reported ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const model = evaluate(doc);
    const rawWeight = doc.getElementById("weight")?.value?.trim() || "";
    const rawHours = doc.getElementById("CA_collectionHours")?.value?.trim() || "";
    const duration = (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.readFromDocument(doc, { fieldId: "CA_collectionHours" });
    const unresolvedDuration = duration?.missing || !duration?.valid && doc.getElementById("CA_collectionSource")?.value === "historical-missing";
    const input = model?.input || {};
    const knownAdult = model?.populationCategory === "adult";
    layout.weight.row.hidden = knownAdult && !(reported && input.reportedUnit === "mg/kg/24h");
    layout.weight.value.textContent = rawWeight ? `${rawWeight.replace(".", ",")} kg` : "Niepodana · nie blokuje ilości dobowej";
    layout.weight.button.textContent = rawWeight ? "Zmień" : "Dodaj";
    const weightOpen = !layout.weight.row.hidden && (layout.weight.userOpen || model?.invalidIds?.includes("weight"));
    layout.weight.editor.hidden = !weightOpen;
    layout.weight.button.setAttribute("aria-expanded", String(Boolean(weightOpen)));
    layout.duration.value.textContent = unresolvedDuration ? "Uzupełnij czas" : `${String(duration?.valid ? duration.hours : rawHours || "24").replace(".", ",")} godz.`;
    layout.duration.row.hidden = reported;
    // Keep an actively edited auto-opened field open until Zmień closes it;
    // collapsing on blur can move the next button before its click completes.
    if (doc.activeElement?.id === "CA_collectionHours") layout.duration.userOpen = true;
    const durationOpen = !reported && (layout.duration.userOpen || unresolvedDuration || model?.invalidIds?.includes("CA_collectionHours"));
    layout.duration.editor.hidden = !durationOpen;
    layout.duration.button.setAttribute("aria-expanded", String(Boolean(durationOpen)));
    const context = doc.getElementById("CA_clinicalMode");
    layout.clinicalSummary.textContent = context?.value === "hypo" ? "Niedoczynność przytarczyc · Zmień" : context?.value === "phpt" ? "Rozpoznana PHPT · Zmień" : "Uwzględnij chorobę przytarczyc (opcjonalnie)";
    layout.clinicalText.textContent = context?.selectedOptions?.[0]?.textContent || "";
    layout.clinicalHelp.textContent = model?.populationCategory === "child" ? "Dotyczy rozpoznanej choroby. Zmienia komentarz; norma dla wieku pozostaje ta sama." : "Dotyczy rozpoznanej choroby. Zmienia opis i punkt odniesienia; bez dodatkowych badań do obliczenia.";
    layout.assumption.textContent = reported
      ? "Gotowy wynik traktujemy zgodnie z podaną jednostką jako wydalanie dobowe."
      : unresolvedDuration ? "Czas tej zbiórki nie został zapisany. Wpisz rzeczywistą liczbę godzin."
        : "Domyślnie przyjmujemy pełną zbiórkę 24 h. Jeśli trwała inaczej, zmień czas.";
    layout.assumption.hidden = model?.blocked === true;
    const invalid = Boolean(model && !model.valid && model.errorCode && !/^missing-/.test(model.errorCode));
    layout.error.hidden = !invalid;
    layout.error.textContent = invalid ? model.error || "Sprawdź wpisane wartości." : "";
    layout.moves.forEach(({ view }) => view.control.setAttribute("aria-invalid", String(model?.invalidIds?.includes(view.control.id) === true)));
    layout.readiness.dataset.complete = String(model?.valid === true);
    layout.readiness.textContent = model?.valid ? "✓ Dane kompletne" : invalid ? "Sprawdź wpisane wartości" : model?.error || "Wpisz dane do obliczenia";
  }

  function restore(doc) {
    const layout = layouts.get(doc);
    if (!layout) return;
    layout.moves.forEach(({ view, anchor, attributes, unit }) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
      anchor.remove();
      view.wrapper.classList.remove("ca-dzm-entry-field");
      if (unit) view.wrapper.classList.remove("ca-dzm-unit-field");
      Object.entries(attributes).forEach(([key, value]) => {
        if (value === null) view.control.removeAttribute(key);
        else view.control.setAttribute(key, value);
      });
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(doc);
    doc.documentElement.removeAttribute("data-clcr-ca-dzm-active");
  }

  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return;
      layouts.set(doc, layout);
    }
    doc.documentElement.dataset.clcrCaDzmActive = "1";
    refreshLayout(layout);
  }

  function refresh(doc) {
    const layout = layouts.get(doc);
    if (layout) refreshLayout(layout);
  }

  function paragraph(value, className) {
    return value ? `<p${className ? ` class="${className}"` : ""}>${escape(value)}</p>` : "";
  }

  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło");
    const link = /^https:\/\//.test(source.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    return `${link}${source.locator ? `<small>${escape(source.locator)}</small>` : ""}`;
  }

  function renderDetails(model) {
    const notes = model.notes || {};
    const references = Array.isArray(model.referenceRows) ? model.referenceRows : Array.isArray(model.references) ? model.references : [];
    const educational = Array.isArray(model.educationalReferences) ? model.educationalReferences : [];
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const sections = Array.isArray(notes.sections) ? notes.sections : [];
    const table = references.length ? `<h3>Dzieci i dorośli — różne zastosowania</h3><table class="clcr-result-category-table" aria-label="Zakresy odniesienia wydalania wapnia"><thead><tr><th>Pacjent</th><th>Odniesienie</th></tr></thead><tbody>${references.map(row => `<tr${row.active ? ' class="ca-dzm-current-reference"' : ""}><td>${escape(row.population || row.label || row.ageLabel || "")}${row.sourceLabel ? `<small class="ca-dzm-table-source">${escape(row.sourceLabel)}</small>` : ""}</td><td>${escape(row.text || row.referenceText || "")}${row.unit ? ` <span>${escape(row.unit)}</span>` : ""}</td></tr>`).join("")}</tbody></table>` : "";
    const standardSections = [
      ["Kontekst wybranego porównania", notes.contextExplanation], ["Zakresy odniesienia", notes.scope],
      ["Wiek i granice normy", notes.ageBoundary],
      ["Jak liczymy?", notes.formula || notes.calculation],
      ["Przeliczenia jednostek", notes.conversion],
      ["Dokładność wyniku", notes.rounding],
      ["Znaczenie zbiórki", notes.collection],
      ["Zakres laboratoryjny a ryzyko kamicy", notes.stoneRisk],
      ["Ograniczenia interpretacji", notes.limitations],
      ["Znany kontekst zbiórki", model.blocked ? notes.knownContradiction : ""],
    ].filter(([, text]) => typeof text === "string" && text);
    const copy = standardSections.map(([heading, text]) => `<h3>${escape(heading)}</h3>${paragraph(text)}`).join("");
    const extra = sections.map(section => `<h3>${escape(section.title || section.label || "")}</h3>${(Array.isArray(section.paragraphs) ? section.paragraphs : [section.text]).map(text => paragraph(text)).join("")}`).join("");
    const educationalTable = educational.length ? `<h3>Progi z innych zastosowań</h3><table class="clcr-result-category-table" aria-label="Progi edukacyjne, nie norma aktywnego wyniku"><thead><tr><th>Profil</th><th>Próg</th></tr></thead><tbody>${educational.map(row => `<tr><td>${escape(row.label || row.population || "")}</td><td>${escape(row.text || row.targetText || "")}${row.unit ? ` <span>${escape(row.unit)}</span>` : ""}</td></tr>`).join("")}</tbody></table>` : "";
    if (!table && !copy && !extra && !educationalTable && !sources.length) return "";
    return `<details class="clcr-result-details ca-dzm-proposal-details" id="clcr-ca-dzm-details" data-clcr-formula="Ca_mgkg" tabindex="-1"><summary>Szczegóły i źródła</summary>${table}${copy}${extra}${educationalTable}${sources.length ? `<h3>Źródła</h3><ul class="ca-dzm-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }

  function referenceAvailable(model) {
    const reference = model.reference;
    return model.referenceAvailable === true && model.referenceActive === true && reference &&
      (["upper", "criterion"].includes(reference.kind) && Number.isFinite(reference.upper) && reference.upper > 0 ||
       reference.kind === "interval" && Number.isFinite(reference.lower) && Number.isFinite(reference.upper) && reference.upper > reference.lower);
  }

  function referenceValue(model) {
    const text = String(model.referenceText || model.reference?.text || "Brak normy do porównania");
    const unit = String(model.unit || "");
    return unit && text.endsWith(unit) ? text.slice(0, -unit.length).trim() : text;
  }

  function renderReference(model) {
    const available = referenceAvailable(model);
    const shown = referenceValue(model);
    return `<div class="clcr-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${available ? escape(model.reference.kind) : "none"}"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Norma dla wieku")}</p><strong class="clcr-result-reference-value ca-dzm-reference-value" data-long="${shown.length > 10}">${escape(shown)}</strong>${available ? `<span class="ca-dzm-reference-unit">${escape(model.unit)}</span>` : ""}${paragraph(model.referenceHint, "ca-dzm-reference-hint")}</div>`;
  }

  function formattedNumber(value) {
    return Number.isFinite(value) ? value.toLocaleString("pl-PL", { maximumSignificantDigits: 12 }) : "";
  }

  function renderRange(model, shown) {
    if (!referenceAvailable(model)) return "";
    const reference = model.reference;
    const lower = ["upper", "criterion"].includes(reference.kind) ? 0 : reference.lower;
    const upper = reference.upper;
    const scale = Math.max(upper, model.rawValue);
    const end = Math.max(upper / scale * 1.36, model.rawValue / scale * 1.18);
    const position = value => 4 + 92 * (value / scale) / end;
    const lo = position(lower);
    const hi = position(upper);
    const result = position(model.rawValue);
    const labelPosition = Math.min(85, Math.max(15, result));
    const upperText = reference.upperText || formattedNumber(upper);
    const lowerText = reference.lowerText || formattedNumber(lower);
    const caption = `${model.referenceLabel || "Norma dla wieku"}: ${model.referenceText || reference.text || ""}${String(model.referenceText || reference.text || "").includes(model.unit) ? "" : ` ${model.unit}`}`;
    return `<div class="ca-dzm-range-visual" role="img" aria-label="${escape(`${caption}; wynik ${shown} ${model.unit}`)}"><svg class="ca-dzm-range-graphic" width="100%" height="78" aria-hidden="true" focusable="false"><text class="ca-dzm-range-marker-label" x="${labelPosition}%" y="17">${escape(shown.length > 9 ? "Wynik" : `Wynik ${shown}`)}</text><rect class="ca-dzm-range-track" x="4%" y="29" width="92%" height="12" rx="6"></rect>${reference.kind === "criterion" ? "" : `<rect class="ca-dzm-range-normal" x="${lo}%" y="29" width="${hi - lo}%" height="12" rx="${["upper", "criterion"].includes(reference.kind) ? 6 : 0}"></rect>`}${reference.kind === "interval" ? `<line class="ca-dzm-range-boundary" x1="${lo}%" x2="${lo}%" y1="24" y2="46"></line>` : ""}<line class="ca-dzm-range-boundary" x1="${hi}%" x2="${hi}%" y1="24" y2="46"></line><circle class="ca-dzm-range-marker" cx="${result}%" cy="35" r="5"></circle><text class="ca-dzm-range-label" x="${lo}%" y="63">${escape(lowerText)}</text><text class="ca-dzm-range-label" x="${hi}%" y="63">${escape(upperText)}</text></svg>${paragraph(caption, "ca-dzm-range-caption")}</div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "ca-dzm-result-empty" : "ca-dzm-result-error"}" data-clcr-formula="Ca_mgkg"><strong>${missing ? "Uzupełnij dane do obliczenia" : "Sprawdź wpisane dane"}</strong>${paragraph(model.error || "Tutaj zobaczysz wynik, normę dla wieku i krótki komentarz.")}</div>${renderDetails(model)}`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(note => typeof note === "string" && note) : [];
    const dailyDisplay = typeof model.dailyDisplay === "string" ? model.dailyDisplay : model.dailyDisplay?.text;
    const equivalent = model.unit === "mg/kg/24 h" && Number.isFinite(model.dailyMg)
      ? `<p class="ca-dzm-equivalent">W całej dobie: <strong>${escape(dailyDisplay || formattedNumber(model.dailyMg))} mg/24 h</strong></p>` : Number.isFinite(model.perKg) ? `<p class="ca-dzm-equivalent">Na kg masy ciała: <strong>${escape(model.perKgDisplay || formattedNumber(model.perKg))} mg/kg/24 h</strong></p>` : "";
    return `<div class="result-box clcr-result-card ca-dzm-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="Ca_mgkg" data-clcr-series="Ca_mgkg" data-clcr-code="calcium-24h" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="${escape(model.unit)}" data-clcr-display-label="Dobowe wydalanie wapnia" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${referenceAvailable(model)}" data-clcr-ca-dzm-snapshot="${escape(JSON.stringify(model))}">${paragraph(model.contextLabel, "ca-dzm-interpretation-context")}<h3 class="ca-dzm-result-status">${escape(model.statusText || "Dobowe wydalanie wapnia")}</h3><div class="clcr-result-main ca-dzm-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${shown.length > 6}" data-dense="${shown.length > 9}">${escape(shown)}</strong><span class="ca-dzm-result-unit">${escape(model.unit)}</span></div>${renderReference(model)}</div>${equivalent}${renderRange(model, shown)}${paragraph(model.interpretation, "ca-dzm-result-copy")}${cautions.map(note => paragraph(note, "ca-dzm-result-caution")).join("")}${paragraph(referenceAvailable(model) ? model.notes?.sourceSummary : "", "ca-dzm-reference-source")}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ ensureControls, sync, restore, refresh, renderResult });
});
