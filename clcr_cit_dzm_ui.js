(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrCitDzmUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const layouts = new WeakMap();
  const boundDocuments = new WeakSet();
  const unitBindings = new WeakMap();
  const UNIT_CONTROLS = Object.freeze({ CITDZM_concentrationUnit: ["concentration", "CITDZM_concentration"], CITDZM_volumeUnit: ["volume", "CITDZM_volume"], CITDZM_reportedUnit: ["reportedValue", "CITDZM_reportedValue"] });
  const conversionWarnings = new WeakMap();
  const CONTROLS = [
    { id: "CITDZM_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "CITDZM_concentration", label: "Cytryniany w moczu", placeholder: "np. 0,8" },
    { id: "CITDZM_concentrationUnit", label: "Jednostka stężenia cytrynianów", options: [["mmol/L"], ["µmol/L"], ["mg/L"], ["mg/dL"]] },
    { id: "CITDZM_volume", label: "Objętość całej zbiórki", placeholder: "np. 1500" },
    { id: "CITDZM_volumeUnit", label: "Jednostka objętości", options: [["mL"], ["L"]] },
    { id: "CITDZM_reportedValue", label: "Dobowe wydalanie cytrynianów", placeholder: "np. 1,4" },
    { id: "CITDZM_reportedUnit", label: "Jednostka gotowego wyniku", options: [["mmol/24h", "mmol/24 h"], ["mg/24h", "mg/24 h"]] },
    { id: "CITDZM_collectionHours", label: "Czas zbiórki", value: "24", placeholder: "24" },
    { id: "CITDZM_collectionSource", label: "Źródło czasu zbiórki", type: "hidden", value: "assumed-24h" },
    { id: "CITDZM_durationNeedsConfirmation", label: "Czas wymaga uzupełnienia", type: "hidden", value: "false" },
    { id: "CITDZM_reportingEntity", label: "Postać podana w wyniku laboratoryjnym", options: [["unknown", "Nie podano / nie wiem"], ["citrate_ion", "Jon cytrynianowy"], ["citric_acid", "Kwas cytrynowy bezwodny"]] },
    { id: "CITDZM_unitConversions", label: "Dokładne dane przed zmianą jednostki", type: "hidden", value: "" },
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
      const value = JSON.parse(doc.getElementById("CITDZM_unitConversions")?.value || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(["concentration", "volume", "reportedValue"].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : {};
    } catch (_) { return {}; }
  }

  function writeConversions(doc, value) {
    const field = doc.getElementById("CITDZM_unitConversions");
    if (field) field.value = Object.keys(value).length ? JSON.stringify(value) : "";
  }

  // Preserve the original typed quantity across unit-only changes so a
  // rounded editable conversion cannot change the clinical comparison.
  function convertedInput(engine, key, value, fromUnit, toUnit, entity) {
    const converted = engine?.convertUnitInput?.(value, fromUnit, toUnit, key, entity);
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
        const entity = doc.getElementById("CITDZM_reportingEntity")?.value || "unknown";
        conversionWarnings.delete(doc);
        const pristine = prior && prior.convertedValue === current && prior.convertedUnit === previous;
        const originalValue = pristine ? prior.originalValue : current, originalUnit = pristine ? prior.originalUnit : previous;
        if (!current.trim()) { delete conversions[key]; writeConversions(doc, conversions); return; }
        const converted = next === originalUnit ? originalValue : convertedInput(browser.VildaClcrCitDzm || root.VildaClcrCitDzm, key, originalValue, originalUnit, next, entity);
        if (converted === null) {
          // Never relabel an entered mass as a molar quantity without its
          // reporting entity, or replace a valid quantity with rounded data.
          control.value = previous;
          binding.unit = previous;
          const needsEntity = entity === "unknown" && key !== "volume" &&
            originalUnit.startsWith("mg/") !== next.startsWith("mg/");
          conversionWarnings.set(doc, { needsEntity, message: needsEntity
            ? "Do przeliczenia tej jednostki wybierz postać podaną w raporcie. Następnie ponownie wybierz jednostkę."
            : "Nie można przeliczyć wpisanej wartości. Sprawdź ją przed zmianą jednostki." });
          return;
        }
        valueField.value = converted;
        if (next === originalUnit) delete conversions[key];
        else conversions[key] = { originalValue, originalUnit, convertedValue: converted, convertedUnit: next, reportingEntity: entity };
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
        conversionWarnings.delete(doc);
        const conversions = conversionData(doc);
        if (Object.hasOwn(conversions, key)) { delete conversions[key]; writeConversions(doc, conversions); }
      }, true);
      const changeEntity = event => {
        if (event.target?.id !== "CITDZM_reportingEntity" || event.isTrusted === false || (doc.defaultView || root).__vildaPersistRestoring) return;
        // This describes the report's mass, not a conversion of its typed value.
        writeConversions(doc, {});
        conversionWarnings.delete(doc);
      };
      doc.addEventListener("input", changeEntity, true);
      doc.addEventListener("change", changeEntity, true);

    }
    let registry = doc.getElementById("clcrCitDzmControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "cit-dzm-control-registry");
      registry.id = "clcrCitDzmControlRegistry";
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
    const duration = doc.getElementById("CITDZM_collectionHours");
    const source = doc.getElementById("CITDZM_collectionSource");
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
    const anchor = layout.document.createComment(`cit-dzm-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit) });
    view.wrapper.classList.add("cit-dzm-entry-field");
    if (unit) view.wrapper.classList.add("cit-dzm-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("citDzmInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
    return view;
  }

  function fieldRow(layout, host, valueId, unitId, direct) {
    const field = element(layout.document, "div", "cit-dzm-input-field");
    const row = element(layout.document, "div", `cit-dzm-value-row${direct ? " cit-dzm-value-row--reported" : ""}`);
    field.append(row);
    host.append(field);
    moveField(layout, valueId, row);
    moveField(layout, unitId, row, true);
    return field;
  }

  function disclosure(layout, label, id) {
    const row = element(layout.document, "div", "cit-dzm-context-row");
    const copy = element(layout.document, "div");
    const caption = element(layout.document, "span", "cit-dzm-context-label", label);
    const value = element(layout.document, "strong", "cit-dzm-context-value");
    const button = element(layout.document, "button", "cit-dzm-context-button", "Zmień");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    const editor = element(layout.document, "div", "cit-dzm-inline-editor");
    editor.id = id;
    editor.hidden = true;
    const disclosure = { row, value, button, editor, userOpen: false };
    copy.append(caption, value);
    row.append(copy, button);
    button.addEventListener("click", () => {
      disclosure.userOpen = editor.hidden;
      editor.hidden = !disclosure.userOpen;
      button.setAttribute("aria-expanded", String(!editor.hidden));
      if (!editor.hidden) editor.querySelector("input, select")?.focus();
    });
    layout.card.append(row, editor);
    return disclosure;
  }

  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm");
    if (!form) return null;
    ensureControls(doc);
    const card = element(doc, "section", "cit-dzm-input-card");
    card.id = "citDzmInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia dobowego wydalania cytrynianów");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    const mode = element(doc, "div", "cit-dzm-input-mode");
    mode.setAttribute("role", "group");
    mode.setAttribute("aria-label", "Sposób wpisania wyniku");
    [["concentration", "Oblicz ze stężenia"], ["reported", "Gotowy wynik"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button";
      button.dataset.citDzmMode = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("CITDZM_inputMode");
        if (!control || control.value === value) return;
        control.value = value;
        conversionWarnings.delete(doc);
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout);
      });
      layout.modeButtons.push(button);
      mode.append(button);
    });
    const concentration = element(doc, "div", "cit-dzm-mode-fields");
    const reported = element(doc, "div", "cit-dzm-mode-fields");
    card.append(mode, concentration, reported);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    fieldRow(layout, concentration, "CITDZM_concentration", "CITDZM_concentrationUnit");
    fieldRow(layout, concentration, "CITDZM_volume", "CITDZM_volumeUnit");
    fieldRow(layout, reported, "CITDZM_reportedValue", "CITDZM_reportedUnit", true);
    reported.append(element(doc, "p", "cit-dzm-field-hint", "Wynik już przeliczony przez laboratorium na 24 godziny."));
    layout.concentration = concentration;
    layout.reported = reported;
    layout.duration = element(doc, "div", "cit-dzm-duration-field");
    const durationRow = element(doc, "div", "cit-dzm-value-row");
    layout.duration.append(durationRow);
    card.append(layout.duration);
    moveField(layout, "CITDZM_collectionHours", durationRow);
    durationRow.append(element(doc, "span", "cit-dzm-static-unit", "godz."));
    layout.durationHint = element(doc, "p", "cit-dzm-field-hint", "Domyślnie 24 godziny. Zmień tylko, jeśli zbiórka trwała inaczej.");
    layout.duration.append(layout.durationHint);
    layout.entity = disclosure(layout, "Postać masowa", "citDzmEntityEditor");
    moveField(layout, "CITDZM_reportingEntity", layout.entity.editor);
    layout.entity.editor.append(element(doc, "p", "cit-dzm-field-hint", "Zmień tylko, jeśli raport określa postać. Sama nazwa „cytryniany” jej nie rozstrzyga."));
    layout.assumption = element(doc, "p", "cit-dzm-assumption", "Porównanie z normą dotyczy kompletnej zbiórki 24-godzinnej.");
    layout.error = element(doc, "p", "cit-dzm-field-error");
    layout.error.id = "citDzmInputError";
    layout.error.hidden = true;
    layout.error.setAttribute("role", "alert");
    layout.unitMessage = element(doc, "p", "cit-dzm-field-hint");
    layout.unitMessage.id = "citDzmUnitMessage";
    layout.unitMessage.hidden = true;
    layout.unitMessage.setAttribute("role", "status");
    layout.readiness = element(doc, "p", "cit-dzm-readiness");
    layout.readiness.setAttribute("aria-live", "polite");
    card.append(layout.assumption, layout.error, layout.unitMessage, layout.readiness);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function evaluate(doc) {
    const browser = doc.defaultView || root;
    const engine = browser.VildaClcrCitDzm || root.VildaClcrCitDzm;
    if (!engine?.readInputFromDocument || !engine.evaluate) return null;
    return engine.evaluate(engine.readInputFromDocument(doc), (browser.ClcrCitDzmReferenceData || root.ClcrCitDzmReferenceData)?.DEFAULT_POLICY);
  }

  function refreshLayout(layout) {
    const doc = layout.document;
    const reported = doc.getElementById("CITDZM_inputMode")?.value === "reported";
    layout.concentration.hidden = reported;
    layout.reported.hidden = !reported;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.citDzmMode === (reported ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const model = evaluate(doc);
    const hours = doc.getElementById("CITDZM_collectionHours")?.value?.trim() || "";
    const duration = (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.readFromDocument(doc, { fieldId: "CITDZM_collectionHours", sourceId: "CITDZM_collectionSource" });
    const unresolved = duration?.missing || doc.getElementById("CITDZM_collectionSource")?.value === "historical-missing";
    layout.duration.hidden = reported && !unresolved && duration?.valid !== false && (!hours || Number(hours.replace(",", ".")) === 24);
    layout.durationHint.textContent = unresolved
      ? "Czas tej zbiórki nie został zapisany. Wpisz rzeczywistą liczbę godzin."
      : reported ? "Gotowego wyniku nie przeliczamy ponownie. Znany inny czas ogranicza porównanie z normą."
        : "Domyślnie 24 godziny. Zmień tylko, jeśli zbiórka trwała inaczej.";
    const unit = doc.getElementById(reported ? "CITDZM_reportedUnit" : "CITDZM_concentrationUnit")?.value || "";
    const mass = unit.startsWith("mg/");
    const concentration = doc.getElementById("CITDZM_concentration");
    const concentrationUnit = doc.getElementById("CITDZM_concentrationUnit")?.value;
    if (concentration) concentration.setAttribute("placeholder", ({ "mmol/L": "np. 0,8", "µmol/L": "np. 800", "mg/L": "np. 200", "mg/dL": "np. 20" })[concentrationUnit] || "");
    const warning = conversionWarnings.get(doc);
    const entityValue = doc.getElementById("CITDZM_reportingEntity")?.value || "unknown";
    layout.entity.value.textContent = ({ unknown: "Nie podano", citrate_ion: "Jon cytrynianowy", citric_acid: "Kwas cytrynowy bezwodny" })[entityValue] || "Nie podano";
    layout.entity.row.hidden = !mass && !warning?.needsEntity;
    if (warning?.needsEntity) layout.entity.userOpen = true;
    const open = !layout.entity.row.hidden && layout.entity.userOpen;
    layout.entity.editor.hidden = !open;
    layout.entity.button.setAttribute("aria-expanded", String(open));
    if (open && warning?.needsEntity && !warning.focusHandled) {
      warning.focusHandled = true;
      doc.getElementById("CITDZM_reportingEntity")?.focus?.();
    }
    layout.unitMessage.hidden = !warning;
    layout.unitMessage.textContent = warning?.message || "";
    const invalid = Boolean(model && !model.valid && model.errorCode && !/^missing-/.test(model.errorCode));
    layout.error.hidden = !invalid;
    layout.error.textContent = invalid ? model.error || "Sprawdź wpisane wartości." : "";
    layout.moves.forEach(({ view }) => view.control.setAttribute("aria-invalid", String(model?.invalidIds?.includes(view.control.id) === true)));
    const required = reported ? ["CITDZM_reportedValue"] : ["CITDZM_concentration", "CITDZM_volume"];
    const filled = required.filter(id => doc.getElementById(id)?.value?.trim() && !model?.invalidIds?.includes(id)).length;
    layout.readiness.dataset.complete = String(model?.valid === true);
    layout.readiness.textContent = invalid ? "Sprawdź wpisane wartości" : `Wymagane dane ${filled}/${required.length}`;
    syncUnitBindings(doc);
  }

  function restore(doc) {
    const layout = layouts.get(doc);
    if (!layout) return;
    layout.moves.forEach(({ view, anchor, attributes, unit }) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
      anchor.remove();
      view.wrapper.classList.remove("cit-dzm-entry-field");
      if (unit) view.wrapper.classList.remove("cit-dzm-unit-field");
      Object.entries(attributes).forEach(([key, value]) => {
        if (value === null) view.control.removeAttribute(key);
        else view.control.setAttribute(key, value);
      });
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(doc);
    conversionWarnings.delete(doc);
    doc.documentElement.removeAttribute("data-clcr-cit-dzm-active");
  }

  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return;
      layouts.set(doc, layout);
    }
    doc.documentElement.dataset.clcrCitDzmActive = "1";
    refreshLayout(layout);
  }

  function refresh(doc) {
    const layout = layouts.get(doc);
    if (layout) refreshLayout(layout);
  }

  function reset(doc) {
    for (const spec of CONTROLS) {
      const control = doc.getElementById(spec.id);
      if (control) control.value = spec.options ? spec.options[0][0] : spec.value || "";
    }
    conversionWarnings.delete(doc);
    const layout = layouts.get(doc);
    if (layout) layout.entity.userOpen = false;
    syncUnitBindings(doc);
    refresh(doc);
  }

  function paragraph(value, className) {
    return typeof value === "string" && value ? `<p${className ? ` class="${className}"` : ""}>${escape(value)}</p>` : "";
  }

  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło");
    const link = /^https:\/\//.test(source.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    return `${link}${source.locator || source.location ? `<small>${escape(source.locator || source.location)}</small>` : ""}`;
  }

  function referenceAvailable(model) {
    return model.referenceAvailable === true && model.referenceActive !== false && model.reference && Number.isFinite(model.reference.lower);
  }

  function referenceVisible(model) {
    return model.referenceAvailable === true && model.reference && Number.isFinite(model.reference.lower);
  }

  function renderDetails(model) {
    const notes = model.notes || {};
    const rows = Array.isArray(model.referenceRows) ? model.referenceRows : [];
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const table = rows.length ? `<h3>Przyjęte normy</h3><table class="clcr-result-category-table" aria-label="Normy dobowego wydalania cytrynianów"><thead><tr><th>Pacjent</th><th>Norma</th></tr></thead><tbody>${rows.map(row => `<tr${row.active ? ' class="cit-dzm-current-reference"' : ""}><td>${escape(row.population || row.label || "")}</td><td>${escape(row.text || row.referenceText || "")}${row.unit && !String(row.text || row.referenceText || "").endsWith(row.unit) ? ` ${escape(row.unit)}` : ""}</td></tr>`).join("")}</tbody></table>` : "";
    const referenceCalculation = model.reference ? notes.referenceCalculation || model.reference.explanation : model.referenceReason;
    const sections = [
      ["Jak liczymy?", notes.formula || notes.calculation || (model.input?.mode === "reported" ? "Gotowy wynik jest już odniesiony do 24 godzin. Nie przeliczamy go ponownie przez czas lub objętość zbiórki." : "Wydalanie = stężenie w mmol/L lub mg/L × objętość w L × 24 / czas zbiórki w godzinach.")],
      ["Norma dla pacjenta", referenceCalculation],
      ["Dodatkowe przeliczenie", model.populationCategory === "pediatric" && model.indexedDisplay ? `${model.indexedDisplay} mmol/1,73 m²/24 h. To ta sama ilość cytrynianów odniesiona do powierzchni ciała, a nie osobny pomiar.` : ""],
      ["Powierzchnia ciała", notes.bodySurfaceArea || notes.bsa],
      ["Przeliczenia jednostek", notes.conversion],
      ["Zakres porównania", notes.scope],
      ["Granice wieku", notes.ageBoundary],
      ["Znaczenie wyniku", notes.clinicalDetails],
      ["Różnice między źródłami", notes.alternativeSource || notes.alternativeReference || notes.alternativeSources],
      ["Dokładność wyniku", notes.rounding],
      ["Znaczenie zbiórki", notes.collectionDetails || notes.collection],
      ["Ograniczenia interpretacji", notes.limitations],
      ["Znany problem ze zbiórką", model.blocked ? notes.knownContradiction : ""],
    ].filter(([, value]) => typeof value === "string" && value);
    const copy = sections.map(([heading, value]) => `<h3>${escape(heading)}</h3>${paragraph(value)}`).join("");
    const extra = (Array.isArray(notes.sections) ? notes.sections : []).map(section => `<h3>${escape(section.title || section.label || "")}</h3>${(Array.isArray(section.paragraphs) ? section.paragraphs : [section.text]).map(value => paragraph(value)).join("")}`).join("");
    const clinicalNotes = [...new Set((Array.isArray(model.details) ? model.details : []).filter(value => typeof value === "string" && value && value !== referenceCalculation && !sections.some(([, text]) => text === value)))];
    const clinical = clinicalNotes.length ? `<h3>Znaczenie wyniku</h3>${clinicalNotes.map(value => paragraph(value)).join("")}` : "";
    return `<details class="clcr-result-details cit-dzm-proposal-details" id="clcr-cit-dzm-details" data-clcr-formula="Cit_mgkg" tabindex="-1"><summary>Szczegóły i źródła</summary>${table}${copy}${extra}${clinical}${sources.length ? `<h3>Źródła</h3><ul class="cit-dzm-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }

  function renderRange(model, shown) {
    if (!referenceAvailable(model) || !Number.isFinite(shown.lower) || shown.lower <= 0 || !Number.isFinite(shown.rawValue) || shown.rawValue < 0 || model.tone === "neutral") return "";
    const scale = Math.max(shown.lower, shown.rawValue);
    const end = Math.max(shown.lower / scale * 1.6, shown.rawValue / scale * 1.18);
    const position = value => 4 + 92 * (value / scale) / end;
    const boundary = position(shown.lower), point = position(shown.rawValue);
    const caption = `Norma: ${shown.referenceValue} ${shown.unitText}`;
    const exactLabel = String(shown.referenceValue).replace(/^[>≥]\s*/, "");
    const label = exactLabel.length > 10 ? "Granica normy" : exactLabel;
    return `<div class="cit-dzm-range-visual" role="img" aria-label="${escape(`${caption}; wynik ${shown.valueText} ${shown.unitText}`)}"><svg class="cit-dzm-range-graphic" width="100%" height="78" aria-hidden="true" focusable="false"><text class="cit-dzm-range-marker-label" x="${Math.min(85, Math.max(15, point))}%" y="17">Wynik</text><rect class="cit-dzm-range-track" x="4%" y="29" width="92%" height="12" rx="6"></rect><rect class="cit-dzm-range-normal" x="${boundary}%" y="29" width="${96 - boundary}%" height="12" rx="0"></rect><line class="cit-dzm-range-boundary" x1="${boundary}%" x2="${boundary}%" y1="26" y2="45"></line><circle class="cit-dzm-range-marker" cx="${point}%" cy="35" r="5"></circle><text class="cit-dzm-range-label" x="4%" y="63">0</text><text class="cit-dzm-range-label" x="${boundary}%" y="63">${escape(label)}</text></svg>${paragraph(caption, "cit-dzm-range-caption")}</div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "cit-dzm-result-empty" : "cit-dzm-result-error"}" data-clcr-formula="Cit_mgkg"><strong>${missing ? "Tutaj pojawi się wynik" : "Sprawdź wpisane dane"}</strong>${paragraph(model.error || "Wpisz stężenie cytrynianów i objętość moczu albo gotowy wynik dobowy.")}</div>${renderDetails(model)}`;
    }
    // Use the frozen presentation supplied by the calculation and saved record.
    // No current patient data or reference policy is read by this renderer.
    const shown = model.presentation || { valueText: model.display?.text || String(model.rawValue), rawValue: model.rawValue, unitText: model.unit, referenceValue: model.referenceText, lower: model.reference?.lower };
    const value = String(shown.valueText), available = referenceAvailable(model), visible = referenceVisible(model);
    const reference = visible ? String(shown.referenceValue) : "Brak normy do porównania";
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    const pediatricReference = visible && (model.reference.bsa || model.reference.bsaM2 || model.populationCategory === "pediatric");
    const referenceHint = model.notes?.referenceHint || (model.referencePolicy?.label ? `Dolna granica: ${model.referencePolicy.label} · ocena ryzyka kamicy.` : "Dolna granica stosowana w ocenie ryzyka kamicy.");
    return `<div class="result-box clcr-result-card cit-dzm-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="Cit_mgkg" data-clcr-series="Cit_total24" data-clcr-code="citrate-24h" data-clcr-value="${shown.rawValue}" data-clcr-display-value="${escape(value)}" data-clcr-value-length="${value.length}" data-clcr-display-unit="${escape(shown.unitText)}" data-clcr-display-label="Dobowe wydalanie cytrynianów" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${available}" data-clcr-reference-profile="${escape(model.policy?.id || "")}" data-clcr-cit-dzm-snapshot="${escape(JSON.stringify(model))}"><h3 class="cit-dzm-result-status">${escape(model.statusText || "Dobowe wydalanie cytrynianów")}</h3><div class="clcr-result-main cit-dzm-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${value.length > 6}" data-dense="${value.length > 9}">${escape(value)}</strong><span class="cit-dzm-result-unit">${escape(shown.unitText)}</span></div><div class="clcr-result-reference${visible ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${visible ? "lower" : "none"}"><p class="clcr-result-reference-label">Norma dla pacjenta</p><strong class="clcr-result-reference-value cit-dzm-reference-value" data-long="${reference.length > 10}" data-compact="${reference.length <= 7}">${escape(reference)}</strong><span class="cit-dzm-reference-unit">${visible ? escape(shown.unitText) : "&#160;"}</span></div></div>${paragraph(visible ? referenceHint + (pediatricReference ? " Przeliczona dla powierzchni ciała." : "") : "", "cit-dzm-reference-hint")}${paragraph(model.interpretation, "cit-dzm-result-copy")}${cautions.map(value => paragraph(value, "cit-dzm-result-caution")).join("")}${renderRange(model, shown)}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ ensureControls, sync, restore, refresh, reset, renderResult });
});
