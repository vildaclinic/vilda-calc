(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrProteinDzmUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const layouts = new WeakMap();
  const boundDocuments = new WeakSet();
  const unitBindings = new WeakMap();
  const UNIT_CONTROLS = Object.freeze({ Prot_concentrationUnit: ["concentration", "Prot_concentration"], Prot_volumeUnit: ["volume", "Prot_volume"], Prot_reportedUnit: ["reportedValue", "Prot_reportedValue"] });
  const CONTROLS = [
    { id: "Prot_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "Prot_concentration", label: "Białko całkowite w moczu", placeholder: "np. 200" },
    { id: "Prot_concentrationUnit", label: "Jednostka stężenia białka", options: [["mg/L"], ["mg/dL"], ["g/L"]] },
    { id: "Prot_volume", label: "Objętość całej zbiórki", placeholder: "np. 1500" },
    { id: "Prot_volumeUnit", label: "Jednostka objętości", options: [["mL"], ["L"]] },
    { id: "Prot_reportedValue", label: "Dobowe wydalanie z wyniku badania", placeholder: "np. 300" },
    { id: "Prot_reportedUnit", label: "Jednostka gotowego wyniku", options: [["mg/24h", "mg/24 h"], ["g/24h", "g/24 h"]] },
    { id: "Prot_collectionHours", label: "Rzeczywisty czas zbiórki", value: "24", placeholder: "24" },
    { id: "Prot_collectionSource", label: "Źródło czasu zbiórki", type: "hidden", value: "assumed-24h" },
    { id: "Prot_durationNeedsConfirmation", label: "Czas wymaga uzupełnienia", type: "hidden", value: "false" },
    { id: "Prot_outputUnit", label: "Jednostka wyniku", type: "hidden", value: "mg/24h" },
    { id: "Prot_unitConversions", label: "Dokładne dane przed zmianą jednostki", type: "hidden", value: "" },
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

  function conversionData(doc) {
    try {
      const value = JSON.parse(doc.getElementById("Prot_unitConversions")?.value || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(["concentration", "volume", "reportedValue"].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : {};
    } catch (_) { return {}; }
  }

  function writeConversions(doc, value) {
    const field = doc.getElementById("Prot_unitConversions");
    if (field) field.value = Object.keys(value).length ? JSON.stringify(value) : "";
  }

  // Preserve the original typed quantity across unit-only changes so a
  // rounded editable conversion cannot change the clinical comparison.
  function convertedInput(engine, key, value, fromUnit, toUnit) {
    const converted = engine?.convertUnitInput?.(value, fromUnit, toUnit, key);
    return converted?.ok ? converted.text : null;
  }

  function bindUnitControls(doc) {
    const browser = doc.defaultView || root;
    for (const [id, [key, valueId]] of Object.entries(UNIT_CONTROLS)) {
      const control = doc.getElementById(id);
      if (!control || unitBindings.has(control)) continue;
      const binding = { unit: control.value };
      unitBindings.set(control, binding);
      const convert = event => {
        const next = control.value, previous = binding.unit;
        binding.unit = next;
        if (next === previous || event.isTrusted === false || browser.__vildaPersistRestoring) return;
        const valueField = doc.getElementById(valueId);
        if (!valueField) return;
        const current = valueField.value, conversions = conversionData(doc), prior = conversions[key];
        const pristine = prior && prior.convertedValue === current && prior.convertedUnit === previous;
        const originalValue = pristine ? prior.originalValue : current, originalUnit = pristine ? prior.originalUnit : previous;
        if (!current.trim()) { delete conversions[key]; writeConversions(doc, conversions); return; }
        const converted = next === originalUnit ? originalValue : convertedInput(browser.VildaClcrProteinDzm || root.VildaClcrProteinDzm, key, originalValue, originalUnit, next);
        if (converted === null) {
          // An invalid entry remains editable; a valid quantity is never
          // silently relabelled when its conversion cannot be represented.
          const parsed = (browser.VildaClcrProteinDzm || root.VildaClcrProteinDzm)?.parseValue?.(originalValue);
          if (parsed?.lossless && parsed.value >= 0) { control.value = previous; binding.unit = previous; return; }
          delete conversions[key]; writeConversions(doc, conversions); return;
        }
        valueField.value = converted;
        if (next === originalUnit) delete conversions[key];
        else conversions[key] = { originalValue, originalUnit, convertedValue: converted, convertedUnit: next };
        writeConversions(doc, conversions);
      };
      // Native selects emit input before change. Convert at the control before
      // form refresh reads the new unit; change then sees the completed unit.
      control.addEventListener("input", convert);
      control.addEventListener("change", convert);
    }
  }

  function syncUnitBindings(doc) {
    for (const id of Object.keys(UNIT_CONTROLS)) {
      const control = doc.getElementById(id), binding = control && unitBindings.get(control);
      if (binding) binding.unit = control.value;
    }
  }

  // Called before workflow decoration, so raw values participate in its normal
  // session capture, patient switching, dirty tracking and saved-result editing.
  function ensureControls(doc) {
    const form = doc?.getElementById("clcrForm");
    if (!form) return [];
    if (!boundDocuments.has(doc)) {
      boundDocuments.add(doc);
      doc.addEventListener("input", event => {
        if (event.isTrusted === false || (doc.defaultView || root).__vildaPersistRestoring) return;
        const key = Object.values(UNIT_CONTROLS).find(([, id]) => event.target?.id === id)?.[0];
        if (!key) return;
        const conversions = conversionData(doc);
        if (Object.hasOwn(conversions, key)) { delete conversions[key]; writeConversions(doc, conversions); }
      }, true);
      doc.addEventListener("change", event => {
        if (!event.target?.matches?.("[data-protein-dzm-output-unit]")) return;
        const control = doc.getElementById("Prot_outputUnit");
        if (!control) return;
        control.value = event.target.value === "g/24h" ? "g/24h" : "mg/24h";
        const EventType = doc.defaultView?.Event || root.Event;
        control.dispatchEvent(new EventType("change", { bubbles: true }));
      });

    }
    let registry = doc.getElementById("clcrProteinDzmControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "protein-dzm-control-registry");
      registry.id = "clcrProteinDzmControlRegistry";
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
    const duration = doc.getElementById("Prot_collectionHours");
    const source = doc.getElementById("Prot_collectionSource");
    (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.bindControl?.(duration, { sourceControl: source });
    bindUnitControls(doc);
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
    const anchor = layout.document.createComment(`protein-dzm-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit) });
    view.wrapper.classList.add("protein-dzm-entry-field");
    if (unit) view.wrapper.classList.add("protein-dzm-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("proteinDzmInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
    return view;
  }

  function fieldRow(layout, host, valueId, unitId, direct) {
    const field = element(layout.document, "div", "protein-dzm-input-field");
    const row = element(layout.document, "div", `protein-dzm-value-row${direct ? " protein-dzm-value-row--reported" : ""}`);
    field.append(row);
    host.append(field);
    moveField(layout, valueId, row);
    moveField(layout, unitId, row, true);
    return field;
  }

  function disclosure(layout, label, id) {
    const row = element(layout.document, "div", "protein-dzm-context-row");
    const copy = element(layout.document, "div");
    const caption = element(layout.document, "span", "protein-dzm-context-label", label);
    const value = element(layout.document, "strong", "protein-dzm-context-value");
    const button = element(layout.document, "button", "protein-dzm-context-button", "Zmień");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    const editor = element(layout.document, "div", "protein-dzm-inline-editor");
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
    const card = element(doc, "section", "protein-dzm-input-card");
    card.id = "proteinDzmInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia białka całkowitego w dobowej zbiórce moczu");
    const mode = element(doc, "div", "protein-dzm-input-mode");
    mode.setAttribute("role", "group");
    mode.setAttribute("aria-label", "Sposób wpisania wyniku");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężenia"], ["reported", "Gotowy wynik"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button";
      button.dataset.proteinDzmMode = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("Prot_inputMode");
        if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout);
      });
      layout.modeButtons.push(button);
      mode.append(button);
    });
    const concentration = element(doc, "div", "protein-dzm-mode-fields");
    const reported = element(doc, "div", "protein-dzm-mode-fields");
    card.append(mode, concentration, reported);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    fieldRow(layout, concentration, "Prot_concentration", "Prot_concentrationUnit");
    fieldRow(layout, concentration, "Prot_volume", "Prot_volumeUnit");
    fieldRow(layout, reported, "Prot_reportedValue", "Prot_reportedUnit", true);
    reported.append(element(doc, "p", "protein-dzm-field-hint", "Gotowy wynik dobowy nie jest ponownie przeliczany. Znany czas lub błąd zbiórki nadal ogranicza porównanie."));
    layout.concentration = concentration;
    layout.reported = reported;
    layout.duration = disclosure(layout, "Czas zbiórki", "proteinDzmDurationEditor");
    moveField(layout, "Prot_collectionHours", layout.duration.editor);
    layout.duration.editor.append(element(doc, "p", "protein-dzm-field-hint", "Dla innego czasu pokażemy przeliczenie do 24 godzin, bez porównania z normą dobowej zbiórki."));
    layout.assumption = element(doc, "p", "protein-dzm-assumption");
    layout.error = element(doc, "p", "protein-dzm-field-error");
    layout.error.id = "proteinDzmInputError";
    layout.error.hidden = true;
    layout.error.setAttribute("role", "alert");
    layout.readiness = element(doc, "p", "protein-dzm-readiness");
    layout.readiness.setAttribute("aria-live", "polite");
    card.append(layout.assumption, layout.error, layout.readiness);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function evaluate(doc) {
    const browser = doc.defaultView || root;
    const engine = browser.VildaClcrProteinDzm || root.VildaClcrProteinDzm;
    if (!engine?.readInputFromDocument || !engine.evaluate) return null;
    return engine.evaluate(engine.readInputFromDocument(doc), (browser.ClcrProteinDzmReferenceData || root.ClcrProteinDzmReferenceData)?.DEFAULT_POLICY);
  }

  function refreshLayout(layout) {
    const doc = layout.document;
    const reported = doc.getElementById("Prot_inputMode")?.value === "reported";
    layout.concentration.hidden = reported;
    layout.reported.hidden = !reported;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.proteinDzmMode === (reported ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const model = evaluate(doc);
    const rawHours = doc.getElementById("Prot_collectionHours")?.value?.trim() || "";
    const duration = (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.readFromDocument(doc, { fieldId: "Prot_collectionHours", sourceId: "Prot_collectionSource" });
    const unresolvedDuration = duration?.missing || !duration?.valid && doc.getElementById("Prot_collectionSource")?.value === "historical-missing";
    const correctionNeeded = unresolvedDuration || duration?.valid === false || duration?.hours !== 24;
    layout.duration.value.textContent = unresolvedDuration ? "Uzupełnij czas" : `${String(duration?.valid ? duration.hours : rawHours || "24").replace(".", ",")} godz.`;
    layout.duration.row.hidden = reported && !correctionNeeded;
    // Keep an actively edited auto-opened field open until Zmień closes it;
    // collapsing on blur can move the next button before its click completes.
    if (doc.activeElement?.id === "Prot_collectionHours") layout.duration.userOpen = true;
    const durationOpen = !layout.duration.row.hidden && (layout.duration.userOpen || unresolvedDuration || model?.invalidIds?.includes("Prot_collectionHours"));
    layout.duration.editor.hidden = !durationOpen;
    layout.duration.button.setAttribute("aria-expanded", String(Boolean(durationOpen)));
    layout.assumption.textContent = reported
      ? "Gotowy wynik traktujemy zgodnie z podaną jednostką jako wydalanie dobowe."
      : unresolvedDuration ? "Czas tej zbiórki nie został zapisany. Wpisz rzeczywistą liczbę godzin."
        : "Domyślnie przyjmujemy pełną zbiórkę 24 h. Jeśli trwała inaczej, zmień czas.";
    layout.assumption.hidden = model?.blocked === true || reported && !correctionNeeded;
    const invalid = Boolean(model && !model.valid && model.errorCode && !/^missing-/.test(model.errorCode));
    layout.error.hidden = !invalid;
    layout.error.textContent = invalid ? model.error || "Sprawdź wpisane wartości." : "";
    layout.moves.forEach(({ view }) => view.control.setAttribute("aria-invalid", String(model?.invalidIds?.includes(view.control.id) === true)));
    syncUnitBindings(doc);
    layout.readiness.dataset.complete = String(model?.valid === true);
    layout.readiness.textContent = model?.valid ? "✓ Dane kompletne" : invalid ? "Sprawdź wpisane wartości" : model?.error || "Wpisz dane do obliczenia";
  }

  function restore(doc) {
    const layout = layouts.get(doc);
    if (!layout) return;
    layout.moves.forEach(({ view, anchor, attributes, unit }) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
      anchor.remove();
      view.wrapper.classList.remove("protein-dzm-entry-field");
      if (unit) view.wrapper.classList.remove("protein-dzm-unit-field");
      Object.entries(attributes).forEach(([key, value]) => {
        if (value === null) view.control.removeAttribute(key);
        else view.control.setAttribute(key, value);
      });
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(doc);
    doc.documentElement.removeAttribute("data-clcr-protein-dzm-active");
  }

  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return;
      layouts.set(doc, layout);
    }
    doc.documentElement.dataset.clcrProteinDzmActive = "1";
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
    const references = Array.isArray(model.referenceRows) ? model.referenceRows : [];
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const table = references.length ? `<h3>Przyjęte normy</h3><table class="clcr-result-category-table" aria-label="Przyjęte normy białka całkowitego w dobowej zbiórce moczu"><thead><tr><th>Pacjent</th><th>Norma</th></tr></thead><tbody>${references.map(row => `<tr${row.active ? ' class="protein-dzm-current-reference"' : ""}><td>${escape(row.population || row.label || row.ageLabel || "")}${row.sourceLabel ? `<small class="protein-dzm-table-source">${escape(row.sourceLabel)}</small>` : ""}</td><td>${escape(row.text || row.referenceText || "")}${row.unit && !String(row.text || row.referenceText || "").trim().endsWith(String(row.unit).trim()) ? ` <span>${escape(row.unit)}</span>` : ""}</td></tr>`).join("")}</tbody></table>` : "";
    const indexed = model.indexedDisplay;
    const indexedText = typeof indexed === "string" ? indexed : indexed?.text || indexed?.valueText;
    const indexedUnit = typeof indexed === "object" && indexed?.unitText ? indexed.unitText : "mg/m²/24 h";
    const reference = model.reference;
    const calculation = typeof notes.referenceCalculation === "string" ? notes.referenceCalculation : reference?.explanation || notes.contextExplanation;
    const standardSections = [
      ["Jak wyznaczono normę", calculation],
      ["Zakres porównania", notes.scope],
      ["Wiek i granice normy", notes.ageBoundary],
      ["Dodatkowe przeliczenie", indexedText ? `${indexedText} ${indexedUnit}. To ta sama ilość białka, a nie osobny pomiar.` : ""],
      ["Jak liczymy?", notes.formula || notes.calculation],
      ["Przeliczenia jednostek", notes.conversion],
      ["Dokładność wyniku", notes.rounding],
      ["Znaczenie zbiórki", notes.collection],
      ["Ograniczenia interpretacji", notes.limitations],
      ["Znany kontekst zbiórki", model.blocked ? notes.knownContradiction : ""],
    ].filter(([, text]) => typeof text === "string" && text);
    const copy = standardSections.map(([heading, text]) => `<h3>${escape(heading)}</h3>${paragraph(text)}`).join("");
    const extra = (Array.isArray(notes.sections) ? notes.sections : []).map(section => `<h3>${escape(section.title || section.label || "")}</h3>${(Array.isArray(section.paragraphs) ? section.paragraphs : [section.text]).map(text => paragraph(text)).join("")}`).join("");
    return `<details class="clcr-result-details protein-dzm-proposal-details" id="clcr-protein-dzm-details" data-clcr-formula="Prot_mgkg" tabindex="-1"><summary>Szczegóły i źródła</summary>${table}${copy}${extra}${sources.length ? `<h3>Źródła</h3><ul class="protein-dzm-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }

  function referenceAvailable(model) {
    return model.referenceAvailable === true && model.referenceActive !== false && model.reference &&
      Number.isFinite(model.reference.upper);
  }

  function outputUnit(model) {
    const unit = model?.outputUnit || root.document?.getElementById("Prot_outputUnit")?.value;
    return unit === "g/24h" ? unit : "mg/24h";
  }

  function shownResult(model) {
    return (model.presentation?.outputUnit === outputUnit(model) ? model.presentation : root.VildaClcrProteinDzm?.presentation?.(model, outputUnit(model))) || {
      valueText: model.display?.text || String(model.rawValue ?? ""), unitText: model.unit || "mg/24 h",
      referenceValue: model.referenceText || "Brak normy do porównania", referenceText: model.referenceText || "",
    };
  }

  function unitPicker(model) {
    const unit = outputUnit(model);
    return `<label class="protein-dzm-output-picker" data-clcr-formula="Prot_mgkg"><span>Pokaż w</span><select data-protein-dzm-output-unit aria-label="Jednostka wyniku białka"><option value="mg/24h"${unit === "mg/24h" ? " selected" : ""}>mg/24 h</option><option value="g/24h"${unit === "g/24h" ? " selected" : ""}>g/24 h</option></select></label>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "protein-dzm-result-empty" : "protein-dzm-result-error"}" data-clcr-formula="Prot_mgkg"><strong>${missing ? "Uzupełnij dane do obliczenia" : "Sprawdź wpisane dane"}</strong>${paragraph(model.error || "Wpisz stężenie i objętość albo gotowy wynik dobowy. Dane pacjenta nie blokują obliczenia ilości dobowej.")}</div>${renderDetails(model)}`;
    }
    const shown = shownResult(model);
    const value = String(shown.valueText);
    const available = referenceAvailable(model);
    const reference = available ? String(shown.referenceValue) : "Brak normy do porównania";
    const bounds = available ? reference.split("–") : [];
    const referenceMarkup = bounds.length === 2
      ? `<span class="protein-dzm-reference-bound">${escape(bounds[0])}</span><span class="protein-dzm-reference-bound">–${escape(bounds[1])}</span>`
      : escape(reference);
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const tone = ["normal", "warning", "danger"].includes(model.tone) ? model.tone : "neutral";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(note => typeof note === "string" && note) : [];
    return `<div class="result-box clcr-result-card protein-dzm-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="Prot_mgkg" data-clcr-series="Prot_mg24" data-clcr-code="protein-24h" data-clcr-value="${shown.rawValue}" data-clcr-display-value="${escape(value)}" data-clcr-value-length="${value.length}" data-clcr-display-unit="${escape(shown.unitText)}" data-clcr-display-label="Białko całkowite w DZM" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${available}" data-clcr-reference-profile="${escape(model.policy?.id || "")}" data-clcr-reference-profile-version="${model.policy?.version || ""}" data-clcr-protein-dzm-output-unit="${escape(outputUnit(model))}" data-clcr-protein-dzm-snapshot="${escape(JSON.stringify(model))}">${unitPicker(model)}<h3 class="protein-dzm-result-status">${escape(model.statusText || "Białko całkowite w DZM")}</h3><div class="clcr-result-main protein-dzm-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${value.length > 6}" data-dense="${value.length > 9}">${escape(value)}</strong><span class="protein-dzm-result-unit">${escape(shown.unitText)}</span></div><div class="clcr-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${available ? "upper" : "none"}"><p class="clcr-result-reference-label">Norma dla pacjenta</p><strong class="clcr-result-reference-value protein-dzm-reference-value" data-long="${reference.length > 10}" data-compact="${reference.length <= 7}">${referenceMarkup}</strong><span class="protein-dzm-reference-unit">${available ? escape(shown.unitText) : "&#160;"}</span>${paragraph(available ? (model.reference.bsa ? model.reference.capped ? "Zastosowano limit dla dorosłych." : "Przeliczona wg powierzchni ciała." : "Norma dla dorosłych.") : "", "protein-dzm-reference-hint")}</div></div>${paragraph(model.interpretation || model.notes?.briefContext || "", "protein-dzm-result-copy")}${cautions.map(note => paragraph(note, "protein-dzm-result-caution")).join("")}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ ensureControls, sync, restore, refresh, renderResult });
});
