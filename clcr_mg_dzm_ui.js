(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrMgDzmUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const layouts = new WeakMap();
  const CONTROLS = [
    { id: "MG_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "MG_concentration", label: "Magnez w moczu", placeholder: "np. 20" },
    { id: "MG_concentrationUnit", label: "Jednostka magnezu", options: [["mg/L"], ["mmol/L"], ["mg/dL"]] },
    { id: "MG_volume", label: "Objętość całej zbiórki", placeholder: "np. 1500" },
    { id: "MG_volumeUnit", label: "Jednostka objętości", options: [["mL"], ["L"]] },
    { id: "MG_reportedValue", label: "Wydalanie z wyniku badania", placeholder: "np. 120" },
    { id: "MG_reportedUnit", label: "Jednostka gotowego wydalania", options: [["mg/24h", "mg/24 h"], ["mmol/24h", "mmol/24 h"], ["mg/kg/24h", "mg/kg/24 h"]] },
    { id: "MG_collectionHours", label: "Rzeczywisty czas zbiórki", value: "24", placeholder: "24" },
    { id: "MG_collectionSource", label: "Źródło czasu zbiórki", type: "hidden", value: "assumed-24h" },
  ];
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
    let registry = doc.getElementById("clcrMgDzmControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "mg-dzm-control-registry");
      registry.id = "clcrMgDzmControlRegistry";
      registry.hidden = true;
      form.append(registry);
    }
    const controls = CONTROLS.map(spec => {
      const existing = doc.getElementById(spec.id);
      if (existing) return existing;
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
      return control;
    });
    const duration = doc.getElementById("MG_collectionHours");
    const source = doc.getElementById("MG_collectionSource");
    (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.bindControl?.(duration, { sourceControl: source });
    return controls;
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
    const anchor = layout.document.createComment(`mg-dzm-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit) });
    view.wrapper.classList.add("mg-dzm-entry-field");
    if (unit) view.wrapper.classList.add("mg-dzm-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("mgDzmInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
    return view;
  }

  function fieldRow(layout, host, valueId, unitId, direct) {
    const field = element(layout.document, "div", "mg-dzm-input-field");
    const row = element(layout.document, "div", `mg-dzm-value-row${direct ? " mg-dzm-value-row--reported" : ""}`);
    field.append(row);
    host.append(field);
    moveField(layout, valueId, row);
    moveField(layout, unitId, row, true);
    return field;
  }

  function disclosure(layout, label, id) {
    const row = element(layout.document, "div", "mg-dzm-context-row");
    const copy = element(layout.document, "div");
    const caption = element(layout.document, "span", "mg-dzm-context-label", label);
    const value = element(layout.document, "strong", "mg-dzm-context-value");
    const button = element(layout.document, "button", "mg-dzm-context-button", "Zmień");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    const editor = element(layout.document, "div", "mg-dzm-inline-editor");
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
    const card = element(doc, "section", "mg-dzm-input-card");
    card.id = "mgDzmInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia dobowego wydalania magnezu");
    const mode = element(doc, "div", "mg-dzm-input-mode");
    mode.setAttribute("role", "group");
    mode.setAttribute("aria-label", "Sposób wpisania wyniku");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężeń"], ["reported", "Gotowe wydalanie"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button";
      button.dataset.mgDzmMode = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("MG_inputMode");
        if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout);
      });
      layout.modeButtons.push(button);
      mode.append(button);
    });
    const concentration = element(doc, "div", "mg-dzm-mode-fields");
    const reported = element(doc, "div", "mg-dzm-mode-fields");
    card.append(mode, concentration, reported);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    fieldRow(layout, concentration, "MG_concentration", "MG_concentrationUnit");
    fieldRow(layout, concentration, "MG_volume", "MG_volumeUnit");
    fieldRow(layout, reported, "MG_reportedValue", "MG_reportedUnit", true);
    reported.append(element(doc, "p", "mg-dzm-field-hint", "Gotowy wynik dobowy nie wymaga ponownego wpisywania objętości."));
    layout.concentration = concentration;
    layout.reported = reported;
    layout.patientData = disclosure(layout, "Dane do porównania pediatrycznego", "mgDzmPatientDataEditor");
    layout.patientHint = element(doc, "p", "mg-dzm-field-hint");
    layout.patientHint.textContent = "Masa i wzrost pozwalają porównać wynik na 1,73 m². Nie są warunkiem obliczenia ilości dobowej.";
    layout.weightView = moveField(layout, "weight", layout.patientData.editor);
    layout.heightView = moveField(layout, "height", layout.patientData.editor);
    layout.patientData.editor.append(layout.patientHint);
    layout.duration = disclosure(layout, "Czas zbiórki", "mgDzmDurationEditor");
    moveField(layout, "MG_collectionHours", layout.duration.editor);
    layout.duration.editor.append(element(doc, "p", "mg-dzm-field-hint", "Dla innego czasu pokażemy przeliczenie do 24 godzin, bez porównania z normą dobowej zbiórki."));
    layout.assumption = element(doc, "p", "mg-dzm-assumption");
    layout.error = element(doc, "p", "mg-dzm-field-error");
    layout.error.id = "mgDzmInputError";
    layout.error.hidden = true;
    layout.error.setAttribute("role", "alert");
    layout.readiness = element(doc, "p", "mg-dzm-readiness");
    layout.readiness.setAttribute("aria-live", "polite");
    card.append(layout.assumption, layout.error, layout.readiness);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function evaluate(doc) {
    const browser = doc.defaultView || root;
    const engine = browser.VildaClcrMgDzm || root.VildaClcrMgDzm;
    if (!engine?.readInputFromDocument || !engine.evaluate) return null;
    return engine.evaluate(engine.readInputFromDocument(doc), (browser.ClcrMgDzmReferenceData || root.ClcrMgDzmReferenceData)?.DEFAULT_POLICY);
  }

  function refreshLayout(layout) {
    const doc = layout.document;
    const reported = doc.getElementById("MG_inputMode")?.value === "reported";
    layout.concentration.hidden = reported;
    layout.reported.hidden = !reported;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mgDzmMode === (reported ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const model = evaluate(doc);
    const rawWeight = doc.getElementById("weight")?.value?.trim() || "";
    const rawHeight = doc.getElementById("height")?.value?.trim() || "";
    const rawHours = doc.getElementById("MG_collectionHours")?.value?.trim() || "";
    const duration = (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.readFromDocument(doc, { fieldId: "MG_collectionHours" });
    const unresolvedDuration = duration?.missing || !duration?.valid && doc.getElementById("MG_collectionSource")?.value === "historical-missing";
    const input = model?.input || {};
    const child = model?.populationCategory === "child" || Number.isFinite(input.ageYears) && input.ageYears < 18;
    const perKgEntry = reported && (input.reportedUnit || doc.getElementById("MG_reportedUnit")?.value) === "mg/kg/24h";
    const invalidPatientData = model?.invalidIds?.some(id => ["weight", "height"].includes(id)) === true;
    layout.patientData.row.hidden = !(child || perKgEntry || invalidPatientData);
    const patientParts = [rawWeight ? `${rawWeight.replace(".", ",")} kg` : "Masa niepodana"];
    if (child || model?.invalidIds?.includes("height")) patientParts.push(rawHeight ? `${rawHeight.replace(".", ",")} cm` : "wzrost niepodany");
    layout.patientData.value.textContent = patientParts.join(" · ");
    layout.patientData.button.textContent = rawWeight && (!child || rawHeight) ? "Zmień" : "Dodaj";
    if (layout.heightView) layout.heightView.wrapper.hidden = !child && !model?.invalidIds?.includes("height");
    const patientDataOpen = !layout.patientData.row.hidden && (layout.patientData.userOpen || invalidPatientData);
    layout.patientData.editor.hidden = !patientDataOpen;
    layout.patientData.button.setAttribute("aria-expanded", String(Boolean(patientDataOpen)));
    layout.patientHint.textContent = child
      ? "Używamy danych pacjenta z aplikacji. Masa i wzrost pozwalają porównać wynik na 1,73 m²; nie są warunkiem obliczenia ilości dobowej."
      : "Masa pozwoli przeliczyć gotowy wynik na kg na ilość dobową. Sam wynik na kg pozostaje dostępny bez masy.";
    layout.duration.value.textContent = unresolvedDuration ? "Uzupełnij czas" : `${String(duration?.valid ? duration.hours : rawHours || "24").replace(".", ",")} godz.`;
    layout.duration.row.hidden = reported;
    const durationOpen = !reported && (layout.duration.userOpen || unresolvedDuration || doc.activeElement?.id === "MG_collectionHours" || model?.invalidIds?.includes("MG_collectionHours"));
    layout.duration.editor.hidden = !durationOpen;
    layout.duration.button.setAttribute("aria-expanded", String(Boolean(durationOpen)));
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
      view.wrapper.classList.remove("mg-dzm-entry-field");
      if (unit) view.wrapper.classList.remove("mg-dzm-unit-field");
      Object.entries(attributes).forEach(([key, value]) => {
        if (value === null) view.control.removeAttribute(key);
        else view.control.setAttribute(key, value);
      });
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(doc);
    doc.documentElement.removeAttribute("data-clcr-mg-dzm-active");
  }

  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return;
      layouts.set(doc, layout);
    }
    doc.documentElement.dataset.clcrMgDzmActive = "1";
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
    const table = references.length ? `<h3>Zakres laboratoryjny i próg pediatryczny</h3><table class="clcr-result-category-table" aria-label="Zakresy odniesienia wydalania magnezu"><thead><tr><th>Pacjent</th><th>Odniesienie</th></tr></thead><tbody>${references.map(row => `<tr${row.active ? ' class="mg-dzm-current-reference"' : ""}><td>${escape(row.population || row.label || row.ageLabel || "")}${row.sourceLabel ? `<small class="mg-dzm-table-source">${escape(row.sourceLabel)}</small>` : ""}</td><td>${escape(row.text || row.referenceText || "")}${row.unit ? ` <span>${escape(row.unit)}</span>` : ""}</td></tr>`).join("")}</tbody></table>` : "";
    const standardSections = [
      ["Kontekst wybranego porównania", notes.contextExplanation], ["Zakresy odniesienia", notes.scope],
      ["Wiek i granice normy", notes.ageBoundary],
      ["Przeliczenie na powierzchnię ciała", notes.bodySurfaceArea || notes.bsa],
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
    return `<details class="clcr-result-details mg-dzm-proposal-details" id="clcr-mg-dzm-details" data-clcr-formula="Mg_mgkg" tabindex="-1"><summary>Szczegóły i źródła</summary>${table}${copy}${extra}${educationalTable}${sources.length ? `<h3>Źródła</h3><ul class="mg-dzm-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }

  function referenceAvailable(model) {
    const reference = model.reference;
    return model.referenceAvailable === true && model.referenceActive === true && reference &&
      (reference.kind === "lower" && Number.isFinite(reference.lower) && reference.lower > 0 ||
       reference.kind === "interval" && Number.isFinite(reference.lower) && Number.isFinite(reference.upper) && reference.upper > reference.lower);
  }

  function referenceValue(model) {
    const text = String(model.referenceText || model.reference?.text || "Brak normy do porównania");
    const unit = String(model.unit || "");
    return unit && text.endsWith(unit) ? text.slice(0, -unit.length).trim() : text;
  }

  function renderReference(model) {
    const available = referenceAvailable(model);
    const shown = available ? referenceValue(model) : "Brak normy do porównania";
    return `<div class="clcr-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${available ? escape(model.reference.kind) : "none"}"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Norma dla wieku")}</p><strong class="clcr-result-reference-value mg-dzm-reference-value" data-long="${shown.length > 10}">${escape(shown)}</strong>${available ? `<span class="mg-dzm-reference-unit">${escape(model.unit)}</span>` : ""}${paragraph(model.referenceHint, "mg-dzm-reference-hint")}</div>`;
  }

  function formattedNumber(value) {
    return Number.isFinite(value) ? value.toLocaleString("pl-PL", { maximumSignificantDigits: 12 }) : "";
  }

  function renderRange(model, shown) {
    if (!referenceAvailable(model)) return "";
    const reference = model.reference;
    const threshold = reference.kind === "lower" ? reference.lower : reference.upper;
    // Normalize before multiplying; this keeps SVG geometry finite for every
    // finite stored number without changing the clinical value or comparison.
    const scale = Math.max(threshold, model.rawValue);
    const end = Math.max(threshold / scale * 1.4, model.rawValue / scale * 1.18);
    const position = value => 4 + 92 * (value / scale) / end;
    const lo = position(reference.lower);
    const hi = reference.kind === "lower" ? 96 : position(reference.upper);
    const result = position(model.rawValue);
    const labelPosition = Math.min(85, Math.max(15, result));
    const lowerText = reference.lowerText || formattedNumber(reference.lower);
    const upperText = reference.upperText || formattedNumber(reference.upper);
    const limit = String(model.referenceText || reference.text || "");
    const caption = `${model.referenceLabel || "Norma dla wieku"}: ${limit}${limit.includes(model.unit) ? "" : ` ${model.unit}`}`;
    const ticks = reference.kind === "lower"
      ? `<text class="mg-dzm-range-label" x="4%" y="63">0</text><text class="mg-dzm-range-label" x="${lo}%" y="63">${escape(lowerText)}</text>`
      : hi - lo >= 18
        ? `${lo > 14 ? '<text class="mg-dzm-range-label" x="4%" y="63">0</text>' : ""}<text class="mg-dzm-range-label" x="${lo}%" y="63">${escape(lowerText)}</text><text class="mg-dzm-range-label" x="${hi}%" y="63">${escape(upperText)}</text>`
        : `<text class="mg-dzm-range-label" x="20%" y="63">${escape(`${lowerText}–${upperText}`)}</text>`;
    return `<div class="mg-dzm-range-visual" role="img" aria-label="${escape(`${caption}; wynik ${shown} ${model.unit}`)}"><svg class="mg-dzm-range-graphic" width="100%" height="78" aria-hidden="true" focusable="false"><text class="mg-dzm-range-marker-label" x="${labelPosition}%" y="17">${escape(shown.length > 9 ? "Wynik" : `Wynik ${shown}`)}</text><rect class="mg-dzm-range-track" x="4%" y="29" width="92%" height="12" rx="6"></rect><rect class="mg-dzm-range-normal" x="${lo}%" y="29" width="${hi - lo}%" height="12" rx="${reference.kind === "lower" ? 6 : 0}"></rect><line class="mg-dzm-range-boundary" x1="${lo}%" x2="${lo}%" y1="24" y2="46"></line>${reference.kind === "interval" ? `<line class="mg-dzm-range-boundary" x1="${hi}%" x2="${hi}%" y1="24" y2="46"></line>` : ""}<circle class="mg-dzm-range-marker" cx="${result}%" cy="35" r="5"></circle>${ticks}</svg>${paragraph(caption, "mg-dzm-range-caption")}</div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "mg-dzm-result-empty" : "mg-dzm-result-error"}" data-clcr-formula="Mg_mgkg"><strong>${missing ? "Uzupełnij dane do obliczenia" : "Sprawdź wpisane dane"}</strong>${paragraph(model.error || "Tutaj zobaczysz wynik, normę dla wieku i krótki komentarz.")}</div>${renderDetails(model)}`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(note => typeof note === "string" && note) : [];
    const dailyDisplay = typeof model.dailyDisplay === "string" ? model.dailyDisplay : model.dailyDisplay?.text;
    const equivalent = model.unit === "mg/1,73 m²/24 h" && Number.isFinite(model.dailyMg)
      ? `<p class="mg-dzm-equivalent">W całej dobie: <strong>${escape(dailyDisplay || formattedNumber(model.dailyMg))} mg/24 h</strong></p>` : "";
    return `<div class="result-box clcr-result-card mg-dzm-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="Mg_mgkg" data-clcr-series="Mg_mgkg" data-clcr-code="magnesium-24h" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="${escape(model.unit)}" data-clcr-display-label="Dobowe wydalanie magnezu" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${referenceAvailable(model)}" data-clcr-mg-dzm-snapshot="${escape(JSON.stringify(model))}">${paragraph(model.contextLabel, "mg-dzm-interpretation-context")}<h3 class="mg-dzm-result-status">${escape(model.statusText || "Dobowe wydalanie magnezu")}</h3><div class="clcr-result-main mg-dzm-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${shown.length > 6}" data-dense="${shown.length > 9}">${escape(shown)}</strong><span class="mg-dzm-result-unit">${escape(model.unit)}</span></div>${renderReference(model)}</div>${equivalent}${renderRange(model, shown)}${paragraph(model.interpretation, "mg-dzm-result-copy")}${cautions.map(note => paragraph(note, "mg-dzm-result-caution")).join("")}${paragraph(referenceAvailable(model) ? model.notes?.sourceSummary : "", "mg-dzm-reference-source")}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ ensureControls, sync, restore, refresh, renderResult });
});
