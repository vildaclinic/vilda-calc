(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrOxDzmUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const layouts = new WeakMap();
  const boundDocuments = new WeakSet();
  const unitBindings = new WeakMap();
  const UNIT_CONTROLS = Object.freeze({ OXDZM_concentrationUnit: ["concentration", "OXDZM_concentration"], OXDZM_volumeUnit: ["volume", "OXDZM_volume"], OXDZM_reportedUnit: ["reportedValue", "OXDZM_reportedValue"] });
  const conversionWarnings = new WeakMap();
  const CONTROLS = [
    { id: "OXDZM_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "OXDZM_concentration", label: "Szczawiany w moczu", placeholder: "np. 200" },
    { id: "OXDZM_concentrationUnit", label: "Jednostka stężenia szczawianów", options: [["µmol/L"], ["mmol/L"], ["mg/L"], ["mg/dL"]] },
    { id: "OXDZM_volume", label: "Objętość całej zbiórki", placeholder: "np. 1500" },
    { id: "OXDZM_volumeUnit", label: "Jednostka objętości", options: [["mL"], ["L"]] },
    { id: "OXDZM_reportedValue", label: "Dobowe wydalanie szczawianów", placeholder: "np. 0,30" },
    { id: "OXDZM_reportedUnit", label: "Jednostka gotowego wyniku", options: [["mmol/24h", "mmol/24 h"], ["µmol/24h", "µmol/24 h"], ["mg/24h", "mg/24 h"]] },
    { id: "OXDZM_collectionHours", label: "Czas zbiórki", value: "24", placeholder: "24" },
    { id: "OXDZM_collectionSource", label: "Źródło czasu zbiórki", type: "hidden", value: "assumed-24h" },
    { id: "OXDZM_durationNeedsConfirmation", label: "Czas wymaga uzupełnienia", type: "hidden", value: "false" },
    { id: "OXDZM_reportingEntity", label: "Postać podana w wyniku laboratoryjnym", options: [["unknown", "Nie podano / nie wiem"], ["oxalate_ion", "Jon szczawianowy"], ["oxalic_acid", "Kwas szczawiowy bezwodny"]] },
    { id: "OXDZM_unitConversions", label: "Dokładne dane przed zmianą jednostki", type: "hidden", value: "" },
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
      const value = JSON.parse(doc.getElementById("OXDZM_unitConversions")?.value || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(["concentration", "volume", "reportedValue"].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : {};
    } catch (_) { return {}; }
  }

  function writeConversions(doc, value) {
    const field = doc.getElementById("OXDZM_unitConversions");
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
        const entity = doc.getElementById("OXDZM_reportingEntity")?.value || "unknown";
        conversionWarnings.delete(doc);
        const pristine = prior && prior.convertedValue === current && prior.convertedUnit === previous;
        const originalValue = pristine ? prior.originalValue : current, originalUnit = pristine ? prior.originalUnit : previous;
        if (!current.trim()) { delete conversions[key]; writeConversions(doc, conversions); return; }
        const converted = next === originalUnit ? originalValue : convertedInput(browser.VildaClcrOxDzm || root.VildaClcrOxDzm, key, originalValue, originalUnit, next, entity);
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
        if (event.target?.id !== "OXDZM_reportingEntity" || event.isTrusted === false || (doc.defaultView || root).__vildaPersistRestoring) return;
        // This describes the report's mass, not a conversion of its typed value.
        writeConversions(doc, {});
        conversionWarnings.delete(doc);
      };
      doc.addEventListener("input", changeEntity, true);
      doc.addEventListener("change", changeEntity, true);

    }
    let registry = doc.getElementById("clcrOxDzmControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "ox-dzm-control-registry");
      registry.id = "clcrOxDzmControlRegistry";
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
    const duration = doc.getElementById("OXDZM_collectionHours");
    const source = doc.getElementById("OXDZM_collectionSource");
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
    const anchor = layout.document.createComment(`ox-dzm-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit) });
    view.wrapper.classList.add("ox-dzm-entry-field");
    if (unit) view.wrapper.classList.add("ox-dzm-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("oxDzmInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
    return view;
  }

  function fieldRow(layout, host, valueId, unitId, direct) {
    const field = element(layout.document, "div", "ox-dzm-input-field");
    const row = element(layout.document, "div", `ox-dzm-value-row${direct ? " ox-dzm-value-row--reported" : ""}`);
    field.append(row);
    host.append(field);
    moveField(layout, valueId, row);
    moveField(layout, unitId, row, true);
    return field;
  }

  function disclosure(layout, label, id) {
    const row = element(layout.document, "div", "ox-dzm-context-row");
    const copy = element(layout.document, "div");
    const caption = element(layout.document, "span", "ox-dzm-context-label", label);
    const value = element(layout.document, "strong", "ox-dzm-context-value");
    const button = element(layout.document, "button", "ox-dzm-context-button", "Zmień");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    const editor = element(layout.document, "div", "ox-dzm-inline-editor");
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
    const card = element(doc, "section", "ox-dzm-input-card");
    card.id = "oxDzmInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia dobowego wydalania szczawianów");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    const mode = element(doc, "div", "ox-dzm-input-mode");
    mode.setAttribute("role", "group");
    mode.setAttribute("aria-label", "Sposób wpisania wyniku");
    [["concentration", "Oblicz ze stężeń"], ["reported", "Gotowy wynik"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button";
      button.dataset.oxDzmMode = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("OXDZM_inputMode");
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
    const concentration = element(doc, "div", "ox-dzm-mode-fields");
    const reported = element(doc, "div", "ox-dzm-mode-fields");
    card.append(mode, concentration, reported);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    fieldRow(layout, concentration, "OXDZM_concentration", "OXDZM_concentrationUnit");
    fieldRow(layout, concentration, "OXDZM_volume", "OXDZM_volumeUnit");
    fieldRow(layout, reported, "OXDZM_reportedValue", "OXDZM_reportedUnit", true);
    reported.append(element(doc, "p", "ox-dzm-field-hint", "Wynik już przeliczony przez laboratorium na 24 godziny."));
    layout.concentration = concentration;
    layout.reported = reported;
    layout.duration = element(doc, "div", "ox-dzm-duration-field");
    const durationRow = element(doc, "div", "ox-dzm-value-row");
    layout.duration.append(durationRow);
    card.append(layout.duration);
    moveField(layout, "OXDZM_collectionHours", durationRow);
    durationRow.append(element(doc, "span", "ox-dzm-static-unit", "godz."));
    layout.durationHint = element(doc, "p", "ox-dzm-field-hint", "Domyślnie 24 godziny. Zmień tylko, jeśli zbiórka trwała inaczej.");
    layout.duration.append(layout.durationHint);
    layout.entity = disclosure(layout, "Postać masowa", "oxDzmEntityEditor");
    moveField(layout, "OXDZM_reportingEntity", layout.entity.editor);
    layout.entity.editor.append(element(doc, "p", "ox-dzm-field-hint", "Zmień tylko, jeśli raport określa postać. Sama nazwa „szczawiany” jej nie rozstrzyga."));
    layout.assumption = element(doc, "p", "ox-dzm-assumption", "Porównanie z normą dotyczy kompletnej zbiórki 24-godzinnej.");
    layout.error = element(doc, "p", "ox-dzm-field-error");
    layout.error.id = "oxDzmInputError";
    layout.error.hidden = true;
    layout.error.setAttribute("role", "alert");
    layout.unitMessage = element(doc, "p", "ox-dzm-field-hint");
    layout.unitMessage.id = "oxDzmUnitMessage";
    layout.unitMessage.hidden = true;
    layout.unitMessage.setAttribute("role", "status");
    layout.readiness = element(doc, "p", "ox-dzm-readiness");
    layout.readiness.setAttribute("aria-live", "polite");
    card.append(layout.assumption, layout.error, layout.unitMessage, layout.readiness);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function evaluate(doc) {
    const browser = doc.defaultView || root;
    const engine = browser.VildaClcrOxDzm || root.VildaClcrOxDzm;
    if (!engine?.readInputFromDocument || !engine.evaluate) return null;
    return engine.evaluate(engine.readInputFromDocument(doc), (browser.ClcrOxDzmReferenceData || root.ClcrOxDzmReferenceData)?.DEFAULT_POLICY);
  }

  function refreshLayout(layout) {
    const doc = layout.document;
    const reported = doc.getElementById("OXDZM_inputMode")?.value === "reported";
    layout.concentration.hidden = reported;
    layout.reported.hidden = !reported;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.oxDzmMode === (reported ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const model = evaluate(doc);
    const hours = doc.getElementById("OXDZM_collectionHours")?.value?.trim() || "";
    const duration = (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.readFromDocument(doc, { fieldId: "OXDZM_collectionHours", sourceId: "OXDZM_collectionSource" });
    const unresolved = duration?.missing || doc.getElementById("OXDZM_collectionSource")?.value === "historical-missing";
    layout.duration.hidden = reported && !unresolved && duration?.valid !== false && (!hours || Number(hours.replace(",", ".")) === 24);
    layout.durationHint.textContent = unresolved
      ? "Czas tej zbiórki nie został zapisany. Wpisz rzeczywistą liczbę godzin."
      : reported ? "Gotowego wyniku nie przeliczamy ponownie. Znany inny czas ogranicza porównanie z normą."
        : "Domyślnie 24 godziny. Zmień tylko, jeśli zbiórka trwała inaczej.";
    const unit = doc.getElementById(reported ? "OXDZM_reportedUnit" : "OXDZM_concentrationUnit")?.value || "";
    const mass = unit.startsWith("mg/");
    const warning = conversionWarnings.get(doc);
    const entityValue = doc.getElementById("OXDZM_reportingEntity")?.value || "unknown";
    layout.entity.value.textContent = ({ unknown: "Nie podano", oxalate_ion: "Jon szczawianowy", oxalic_acid: "Kwas szczawiowy bezwodny" })[entityValue] || "Nie podano";
    layout.entity.row.hidden = !mass && !warning?.needsEntity;
    if (warning?.needsEntity) layout.entity.userOpen = true;
    const open = !layout.entity.row.hidden && layout.entity.userOpen;
    layout.entity.editor.hidden = !open;
    layout.entity.button.setAttribute("aria-expanded", String(open));
    layout.unitMessage.hidden = !warning;
    layout.unitMessage.textContent = warning?.message || "";
    const invalid = Boolean(model && !model.valid && model.errorCode && !/^missing-/.test(model.errorCode));
    layout.error.hidden = !invalid;
    layout.error.textContent = invalid ? model.error || "Sprawdź wpisane wartości." : "";
    layout.moves.forEach(({ view }) => view.control.setAttribute("aria-invalid", String(model?.invalidIds?.includes(view.control.id) === true)));
    const required = reported ? ["OXDZM_reportedValue"] : ["OXDZM_concentration", "OXDZM_volume"];
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
      view.wrapper.classList.remove("ox-dzm-entry-field");
      if (unit) view.wrapper.classList.remove("ox-dzm-unit-field");
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
    doc.documentElement.removeAttribute("data-clcr-ox-dzm-active");
  }

  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return;
      layouts.set(doc, layout);
    }
    doc.documentElement.dataset.clcrOxDzmActive = "1";
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
    return model.referenceAvailable === true && model.referenceActive !== false && model.reference && Number.isFinite(model.reference.upper);
  }

  function referenceVisible(model) {
    return model.referenceAvailable === true && model.reference && Number.isFinite(model.reference.upper);
  }

  function renderDetails(model) {
    const notes = model.notes || {};
    const policy = model.referencePolicy;
    const rows = Array.isArray(model.referenceRows) && model.referenceRows.length ? model.referenceRows :
      Number.isFinite(policy?.upperMmolPerDay) ? [
        { population: "Dorośli", text: `<${String(policy.upperMmolPerDay).replace(".", ",")}`, unit: "mmol/24 h", active: model.populationCategory === "adult" },
        { population: "Dzieci · po odniesieniu do 1,73 m²", text: `<${String(policy.upperMmolPerDay).replace(".", ",")}`, unit: "mmol/1,73 m²/24 h", active: model.populationCategory === "pediatric" },
      ] : [];
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const table = rows.length ? `<h3>Przyjęte normy</h3><table class="clcr-result-category-table" aria-label="Normy dobowego wydalania szczawianów"><thead><tr><th>Pacjent</th><th>Norma</th></tr></thead><tbody>${rows.map(row => `<tr${row.active ? ' class="ox-dzm-current-reference"' : ""}><td>${escape(row.population || row.label || "")}</td><td>${escape(row.text || row.referenceText || "")}${row.unit && !String(row.text || row.referenceText || "").endsWith(row.unit) ? ` ${escape(row.unit)}` : ""}</td></tr>`).join("")}</tbody></table>` : "";
    const referenceCalculation = model.reference ? notes.referenceCalculation || model.reference.explanation : model.referenceReason;
    const sections = [
      ["Jak liczymy?", notes.formula || notes.calculation || (model.input?.mode === "reported" ? "Gotowy wynik jest już odniesiony do 24 godzin. Nie przeliczamy go ponownie przez czas lub objętość zbiórki." : "Wydalanie = stężenie w mmol/L lub mg/L × objętość w L × 24 / czas zbiórki w godzinach.")],
      ["Norma dla pacjenta", referenceCalculation],
      ["Dodatkowe przeliczenie", model.populationCategory === "pediatric" && model.indexedDisplay ? `${model.indexedDisplay} mmol/1,73 m²/24 h. To ta sama ilość szczawianów odniesiona do powierzchni ciała, a nie osobny pomiar.` : ""],
      ["Powierzchnia ciała", notes.bodySurfaceArea || notes.bsa],
      ["Przeliczenia jednostek", notes.conversion],
      ["Zakres porównania", notes.scope],
      ["Granice wieku", notes.ageBoundary],
      ["Próg stosowany w ocenie kamicy", notes.stoneRisk || notes.eau],
      ["Dokładność wyniku", notes.rounding],
      ["Znaczenie zbiórki", notes.collection],
      ["Ograniczenia interpretacji", notes.limitations],
      ["Znany problem ze zbiórką", model.blocked ? notes.knownContradiction : ""],
    ].filter(([, value]) => typeof value === "string" && value);
    const copy = sections.map(([heading, value]) => `<h3>${escape(heading)}</h3>${paragraph(value)}`).join("");
    const extra = (Array.isArray(notes.sections) ? notes.sections : []).map(section => `<h3>${escape(section.title || section.label || "")}</h3>${(Array.isArray(section.paragraphs) ? section.paragraphs : [section.text]).map(value => paragraph(value)).join("")}`).join("");
    const clinicalNotes = [...new Set((Array.isArray(model.details) ? model.details : []).filter(value => typeof value === "string" && value && value !== referenceCalculation && !sections.some(([, text]) => text === value)))];
    const clinical = clinicalNotes.length ? `<h3>Znaczenie wyniku</h3>${clinicalNotes.map(value => paragraph(value)).join("")}` : "";
    return `<details class="clcr-result-details ox-dzm-proposal-details" id="clcr-ox-dzm-details" data-clcr-formula="Ox_mgkg" tabindex="-1"><summary>Szczegóły i źródła</summary>${table}${copy}${extra}${clinical}${sources.length ? `<h3>Źródła</h3><ul class="ox-dzm-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }

  function renderRange(model, shown) {
    if (!referenceAvailable(model) || !Number.isFinite(shown.upper) || shown.upper <= 0 || !Number.isFinite(shown.rawValue) || shown.rawValue < 0 || model.tone === "neutral") return "";
    const scale = Math.max(shown.upper, shown.rawValue);
    const end = Math.max(shown.upper / scale * 1.6, shown.rawValue / scale * 1.18);
    const position = value => 4 + 92 * (value / scale) / end;
    const boundary = position(shown.upper), point = position(shown.rawValue);
    const caption = `Norma: ${shown.referenceValue} ${shown.unitText}`;
    const exactLabel = String(shown.referenceValue).replace(/^[<≤]\s*/, "");
    const label = exactLabel.length > 10 ? "Granica normy" : exactLabel;
    return `<div class="ox-dzm-range-visual" role="img" aria-label="${escape(`${caption}; wynik ${shown.valueText} ${shown.unitText}`)}"><svg class="ox-dzm-range-graphic" width="100%" height="78" aria-hidden="true" focusable="false"><text class="ox-dzm-range-marker-label" x="${Math.min(85, Math.max(15, point))}%" y="17">Wynik</text><rect class="ox-dzm-range-track" x="4%" y="29" width="92%" height="12" rx="6"></rect><rect class="ox-dzm-range-normal" x="4%" y="29" width="${boundary - 4}%" height="12" rx="0"></rect><line class="ox-dzm-range-boundary" x1="${boundary}%" x2="${boundary}%" y1="26" y2="45"></line><circle class="ox-dzm-range-marker" cx="${point}%" cy="35" r="5"></circle><text class="ox-dzm-range-label" x="4%" y="63">0</text><text class="ox-dzm-range-label" x="${boundary}%" y="63">${escape(label)}</text></svg>${paragraph(caption, "ox-dzm-range-caption")}</div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "ox-dzm-result-empty" : "ox-dzm-result-error"}" data-clcr-formula="Ox_mgkg"><strong>${missing ? "Tutaj pojawi się wynik" : "Sprawdź wpisane dane"}</strong>${paragraph(model.error || "Wpisz stężenie szczawianów i objętość moczu albo gotowy wynik dobowy.")}</div>${renderDetails(model)}`;
    }
    // Use the frozen presentation supplied by the calculation and saved record.
    // No current patient data or reference policy is read by this renderer.
    const shown = model.presentation || { valueText: model.display?.text || String(model.rawValue), rawValue: model.rawValue, unitText: model.unit, referenceValue: model.referenceText, upper: model.reference?.upper };
    const value = String(shown.valueText), available = referenceAvailable(model), visible = referenceVisible(model);
    const reference = visible ? String(shown.referenceValue) : "Brak normy do porównania";
    const tone = ["normal", "warning", "danger"].includes(model.tone) ? model.tone : "neutral";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    const pediatricReference = visible && (model.reference.bsa || model.reference.bsaM2 || model.populationCategory === "pediatric" || model.input?.ageYears != null && model.input.ageYears < 18);
    return `<div class="result-box clcr-result-card ox-dzm-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="Ox_mgkg" data-clcr-series="Ox_total24" data-clcr-code="oxalate-24h" data-clcr-value="${shown.rawValue}" data-clcr-display-value="${escape(value)}" data-clcr-value-length="${value.length}" data-clcr-display-unit="${escape(shown.unitText)}" data-clcr-display-label="Dobowe wydalanie szczawianów" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${available}" data-clcr-reference-profile="${escape(model.policy?.id || "")}" data-clcr-ox-dzm-snapshot="${escape(JSON.stringify(model))}"><h3 class="ox-dzm-result-status">${escape(model.statusText || "Dobowe wydalanie szczawianów")}</h3><div class="clcr-result-main ox-dzm-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${value.length > 6}" data-dense="${value.length > 9}">${escape(value)}</strong><span class="ox-dzm-result-unit">${escape(shown.unitText)}</span></div><div class="clcr-result-reference${visible ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${visible ? "upper" : "none"}"><p class="clcr-result-reference-label">Norma dla pacjenta</p><strong class="clcr-result-reference-value ox-dzm-reference-value" data-long="${reference.length > 10}" data-compact="${reference.length <= 7}">${escape(reference)}</strong><span class="ox-dzm-reference-unit">${visible ? escape(shown.unitText) : "&#160;"}</span></div></div>${paragraph(pediatricReference ? "Norma przeliczona dla powierzchni ciała." : "", "ox-dzm-reference-hint")}${paragraph(model.interpretation, "ox-dzm-result-copy")}${cautions.map(value => paragraph(value, "ox-dzm-result-caution")).join("")}${renderRange(model, shown)}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ ensureControls, sync, restore, refresh, reset, renderResult });
});
