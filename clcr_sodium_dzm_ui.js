(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrSodiumDzmUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const layouts = new WeakMap();
  const boundDocuments = new WeakSet();
  const unitBindings = new WeakMap();
  const UNIT_CONTROLS = Object.freeze({ Na_volumeUnit: ["volume", "Na_volume"], Na_reportedUnit: ["reportedValue", "Na_reportedValue"] });
  const CONTROLS = [
    { id: "Na_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "Na_concentration", label: "Sód w moczu", placeholder: "np. 100" },
    { id: "Na_volume", label: "Objętość całej zbiórki", placeholder: "np. 1500" },
    { id: "Na_volumeUnit", label: "Jednostka objętości", options: [["mL"], ["L"]] },
    { id: "Na_reportedValue", label: "Dobowe wydalanie z wyniku badania", placeholder: "np. 150" },
    { id: "Na_reportedUnit", label: "Jednostka gotowego wyniku", options: [["mmol/24h", "mmol/24 h"], ["mgNa/24h", "mg Na/24 h"], ["gNa/24h", "g Na/24 h"]] },
    { id: "Na_collectionHours", label: "Rzeczywisty czas zbiórki (godz.)", value: "24", placeholder: "24" },
    { id: "Na_collectionSource", label: "Źródło czasu zbiórki", type: "hidden", value: "assumed-24h" },
    { id: "Na_durationNeedsConfirmation", label: "Czas wymaga uzupełnienia", type: "hidden", value: "false" },
    { id: "Na_outputUnit", label: "Jednostka wyniku", type: "hidden", value: "mmol/24h" },
    { id: "Na_unitConversions", label: "Dokładne dane przed zmianą jednostki", type: "hidden", value: "" },
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
      const value = JSON.parse(doc.getElementById("Na_unitConversions")?.value || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(["volume", "reportedValue"].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : {};
    } catch (_) { return {}; }
  }

  function writeConversions(doc, value) {
    const field = doc.getElementById("Na_unitConversions");
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
        const converted = next === originalUnit ? originalValue : convertedInput(browser.VildaClcrSodiumDzm || root.VildaClcrSodiumDzm, key, originalValue, originalUnit, next);
        if (converted === null) {
          // An invalid entry remains editable; a valid quantity is never
          // silently relabelled when its conversion cannot be represented.
          const parsed = (browser.VildaClcrSodiumDzm || root.VildaClcrSodiumDzm)?.parseValue?.(originalValue);
          if (parsed?.exact && parsed.value >= 0) { control.value = previous; binding.unit = previous; return; }
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
        if (!event.target?.matches?.("[data-sodium-dzm-output-unit]")) return;
        const control = doc.getElementById("Na_outputUnit");
        if (!control) return;
        control.value = event.target.value === "gNa/24h" ? "gNa/24h" : "mmol/24h";
        const EventType = doc.defaultView?.Event || root.Event;
        control.dispatchEvent(new EventType("change", { bubbles: true }));
      });

    }
    let registry = doc.getElementById("clcrSodiumDzmControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "sodium-dzm-control-registry");
      registry.id = "clcrSodiumDzmControlRegistry";
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
    const duration = doc.getElementById("Na_collectionHours");
    const source = doc.getElementById("Na_collectionSource");
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
    const anchor = layout.document.createComment(`sodium-dzm-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit) });
    view.wrapper.classList.add("sodium-dzm-entry-field");
    if (unit) view.wrapper.classList.add("sodium-dzm-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("sodiumDzmInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
    return view;
  }

  function fieldRow(layout, host, valueId, unitId, direct) {
    const field = element(layout.document, "div", "sodium-dzm-input-field");
    const row = element(layout.document, "div", `sodium-dzm-value-row${direct ? " sodium-dzm-value-row--reported" : ""}`);
    field.append(row);
    host.append(field);
    moveField(layout, valueId, row);
    if (unitId) moveField(layout, unitId, row, true);
    else row.append(element(layout.document, "span", "sodium-dzm-fixed-unit", "mmol/L"));
    return field;
  }

  function disclosure(layout, label, id) {
    const row = element(layout.document, "div", "sodium-dzm-context-row");
    const copy = element(layout.document, "div");
    const caption = element(layout.document, "span", "sodium-dzm-context-label", label);
    const value = element(layout.document, "strong", "sodium-dzm-context-value");
    const button = element(layout.document, "button", "sodium-dzm-context-button", "Zmień");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    const editor = element(layout.document, "div", "sodium-dzm-inline-editor");
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
    const card = element(doc, "section", "sodium-dzm-input-card");
    card.id = "sodiumDzmInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia sodu w dobowej zbiórce moczu");
    const mode = element(doc, "div", "sodium-dzm-input-mode");
    mode.setAttribute("role", "group");
    mode.setAttribute("aria-label", "Sposób wpisania wyniku");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężenia"], ["reported", "Gotowy wynik"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button";
      button.dataset.sodiumDzmMode = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("Na_inputMode");
        if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout);
      });
      layout.modeButtons.push(button);
      mode.append(button);
    });
    const concentration = element(doc, "div", "sodium-dzm-mode-fields");
    const reported = element(doc, "div", "sodium-dzm-mode-fields");
    card.append(mode, concentration, reported);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const sodiumField = fieldRow(layout, concentration, "Na_concentration");
    sodiumField.append(element(doc, "p", "sodium-dzm-field-hint", "Dla sodu 1 mmol/L = 1 mEq/L."));
    fieldRow(layout, concentration, "Na_volume", "Na_volumeUnit");
    fieldRow(layout, reported, "Na_reportedValue", "Na_reportedUnit", true);
    reported.append(element(doc, "p", "sodium-dzm-field-hint", "Gotowy wynik dobowy nie jest ponownie przeliczany. Znany czas lub błąd zbiórki nadal ogranicza porównanie."));
    layout.concentration = concentration;
    layout.reported = reported;
    layout.duration = disclosure(layout, "Czas zbiórki", "sodiumDzmDurationEditor");
    moveField(layout, "Na_collectionHours", layout.duration.editor);
    layout.duration.editor.append(element(doc, "p", "sodium-dzm-field-hint", "Dla innego czasu pokażemy przeliczenie do 24 godzin, bez porównania z normą dobowej zbiórki."));
    layout.assumption = element(doc, "p", "sodium-dzm-assumption");
    layout.error = element(doc, "p", "sodium-dzm-field-error");
    layout.error.id = "sodiumDzmInputError";
    layout.error.hidden = true;
    layout.error.setAttribute("role", "alert");
    layout.readiness = element(doc, "p", "sodium-dzm-readiness");
    layout.readiness.setAttribute("aria-live", "polite");
    card.append(layout.assumption, layout.error, layout.readiness);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function evaluate(doc) {
    const browser = doc.defaultView || root;
    const engine = browser.VildaClcrSodiumDzm || root.VildaClcrSodiumDzm;
    if (!engine?.readInputFromDocument || !engine.evaluate) return null;
    return engine.evaluate(engine.readInputFromDocument(doc), (browser.ClcrSodiumDzmReferenceData || root.ClcrSodiumDzmReferenceData)?.DEFAULT_POLICY);
  }

  function placeOutputPicker(layout) {
    const report = layout.document.getElementById("clcrResultReport");
    const heading = report?.querySelector(".clcr-result-report__head");
    if (!heading) return;
    const host = report.querySelector(".sodium-dzm-proposal-card, .sodium-dzm-result-empty, .sodium-dzm-result-error");
    // A result replacement owns a fresh picker. An empty or input-error
    // replacement removes the old one; a numeric-range error supplies its own
    // picker so the clinician can recover by selecting another output unit.
    if (host !== layout.outputHost) {
      const next = host?.querySelector(".sodium-dzm-output-picker") || null;
      layout.outputPicker?.remove();
      layout.outputHost = host;
      layout.outputPicker = next;
    }
    if (layout.outputPicker && layout.outputPicker.parentNode !== heading) heading.append(layout.outputPicker);
  }

  function observeResult(layout) {
    const report = layout.document.getElementById("clcrResultReport");
    const Observer = layout.document.defaultView?.MutationObserver || root.MutationObserver;
    if (!report || !Observer || layout.outputObserver) return;
    layout.outputObserver = new Observer(() => placeOutputPicker(layout));
    layout.outputObserver.observe(report, { childList: true, subtree: true });
  }

  function refreshLayout(layout) {
    const doc = layout.document;
    const reported = doc.getElementById("Na_inputMode")?.value === "reported";
    layout.concentration.hidden = reported;
    layout.reported.hidden = !reported;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.sodiumDzmMode === (reported ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const model = evaluate(doc);
    const rawHours = doc.getElementById("Na_collectionHours")?.value?.trim() || "";
    const duration = (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.readFromDocument(doc, { fieldId: "Na_collectionHours", sourceId: "Na_collectionSource" });
    const unresolvedDuration = duration?.missing || !duration?.valid && doc.getElementById("Na_collectionSource")?.value === "historical-missing";
    const correctionNeeded = unresolvedDuration || duration?.valid === false || duration?.hours !== 24;
    layout.duration.value.textContent = unresolvedDuration ? "Uzupełnij czas" : `${String(duration?.valid ? duration.hours : rawHours || "24").replace(".", ",")} godz.`;
    layout.duration.row.hidden = reported && !correctionNeeded;
    // Keep an actively edited auto-opened field open until Zmień closes it;
    // collapsing on blur can move the next button before its click completes.
    if (doc.activeElement?.id === "Na_collectionHours") layout.duration.userOpen = true;
    const durationOpen = !layout.duration.row.hidden && (layout.duration.userOpen || unresolvedDuration || model?.invalidIds?.includes("Na_collectionHours"));
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
    observeResult(layout);
    placeOutputPicker(layout);
  }

  function restore(doc) {
    const layout = layouts.get(doc);
    if (!layout) return;
    layout.outputObserver?.disconnect();
    layout.outputPicker?.remove();
    layout.moves.forEach(({ view, anchor, attributes, unit }) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
      anchor.remove();
      view.wrapper.classList.remove("sodium-dzm-entry-field");
      if (unit) view.wrapper.classList.remove("sodium-dzm-unit-field");
      Object.entries(attributes).forEach(([key, value]) => {
        if (value === null) view.control.removeAttribute(key);
        else view.control.setAttribute(key, value);
      });
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(doc);
    doc.documentElement.removeAttribute("data-clcr-sodium-dzm-active");
  }

  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return;
      layouts.set(doc, layout);
    }
    doc.documentElement.dataset.clcrSodiumDzmActive = "1";
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

  // Every clinical string, conversion and reference cell is captured by the
  // engine. Rendering saved history never consults today's patient or policy.
  function shownResult(model) {
    return model.presentation || {
      valueText: model.display?.text || String(model.rawValue ?? ""),
      unitText: model.unit || "mmol/24 h", rawValue: model.rawValue,
      referenceValue: model.referenceText || "Brak normy do porównania",
      referenceText: model.referenceText || "", outputUnit: model.outputUnit || "mmol/24h",
    };
  }

  function outputUnit(model) {
    const unit = model.presentation?.outputUnit || model.outputUnit || model.input?.outputUnit;
    return unit === "gNa/24h" ? unit : "mmol/24h";
  }

  function referenceAvailable(model) {
    return model.referenceAvailable === true && model.reference &&
      Number.isFinite(model.reference.lower) && Number.isFinite(model.reference.upper);
  }

  // Keep each endpoint intact. A narrow screen may wrap at the separator,
  // never between the digits of a laboratory reference value.
  function rangeMarkup(value) {
    const bounds = String(value).split("–");
    if (bounds.length !== 2) return escape(value);
    return `<span class="sodium-dzm-reference-bound">${escape(bounds[0])}–</span><wbr><span class="sodium-dzm-reference-bound">${escape(bounds[1])}</span>`;
  }

  function referenceSourceLabel(model) {
    const label = model.reference?.sourceLabel || model.referenceRows?.[0]?.sourceLabel || model.population?.label || "Wybrany profil";
    return String(label).split(" · ")[0];
  }

  function shortReferenceSourceLabel(model) {
    return referenceSourceLabel(model).replace(/\s+\d+$/, "");
  }

  function renderReferenceTable(model, shown) {
    const rows = Array.isArray(model.referenceTable) ? model.referenceTable : [];
    if (!rows.length) return "";
    const cell = data => `<td${data?.active ? ' class="sodium-dzm-current-cell"' : ""}>${rangeMarkup(data?.text || "Nie ustalono")}</td>`;
    return `<h3>Przyjęte normy</h3><p class="sodium-dzm-table-caption">${escape(referenceSourceLabel(model))} · ${escape(shown.unitText)} · pełna zbiórka 24 h</p><table class="clcr-result-category-table" aria-label="Normy sodu w dobowej zbiórce moczu"><thead><tr><th>Wiek</th><th>Mężczyźni / chłopcy</th><th>Kobiety / dziewczynki</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.label || row.population || "")}</td>${cell(row.male)}${cell(row.female)}</tr>`).join("")}</tbody></table>`;
  }

  function renderDetails(model) {
    const notes = model.notes || {}, shown = shownResult(model);
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const standardSections = [
      ["Jak dobrano normę", notes.referenceCalculation || model.reference?.explanation || notes.scope],
      ["Jak liczymy?", notes.formula || notes.calculation],
      ["Przeliczenia jednostek", notes.conversion],
      ["Ta sama ilość sodu", notes.massEquivalentText],
      ["Równoważnik soli", notes.saltEquivalentText ? `${notes.saltEquivalentText}. ${model.saltEquivalent?.explanation || notes.saltEquivalent || ""}`.trim() : ""],
      ["Znaczenie zbiórki", notes.collection],
      ["Ograniczenia interpretacji", notes.limitations],
      ["Znany kontekst zbiórki", model.blocked ? notes.knownContradiction : ""],
    ].filter(([, value]) => typeof value === "string" && value);
    const copy = standardSections.map(([heading, value]) => `<h3>${escape(heading)}</h3>${paragraph(value)}`).join("");
    const sections = (Array.isArray(notes.sections) ? notes.sections : []).map(section => `<h3>${escape(section.title || section.label || "")}</h3>${(Array.isArray(section.paragraphs) ? section.paragraphs : [section.text]).map(value => paragraph(value)).join("")}`).join("");
    const fullValue = shown.fullValueText || shown.unroundedValueText || notes.fullValueText;
    const precision = (shown.approximate || shown.roundedDisplay) && fullValue
      ? `<h3>Wynik przed zaokrągleniem</h3><p class="sodium-dzm-unrounded-result">${escape(fullValue)} ${escape(shown.unitText)}</p>${paragraph(shown.precisionNote || notes.precisionNote)}` : "";
    return `<details class="clcr-result-details sodium-dzm-proposal-details" id="clcr-sodium-dzm-details" data-clcr-formula="Na_mmol_d" tabindex="-1"><summary>Szczegóły i źródła</summary>${renderReferenceTable(model, shown)}${precision}${copy}${sections}${sources.length ? `<h3>Źródła</h3><ul class="sodium-dzm-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }

  function unitPicker(model) {
    const unit = outputUnit(model);
    return `<label class="sodium-dzm-output-picker" data-clcr-formula="Na_mmol_d"><span>Pokaż w</span><select data-sodium-dzm-output-unit aria-label="Jednostka wyniku sodu"><option value="mmol/24h"${unit === "mmol/24h" ? " selected" : ""}>mmol/24 h</option><option value="gNa/24h"${unit === "gNa/24h" ? " selected" : ""}>g Na/24 h</option></select></label>`;
  }

  function axisMarkup(model, shown) {
    if (!referenceAvailable(model) || !Number.isFinite(shown.lower) || !Number.isFinite(shown.upper) || !Number.isFinite(shown.rawValue)) return "";
    const maximum = Math.max(shown.upper * 1.25, shown.rawValue * 1.15);
    if (!Number.isFinite(maximum) || maximum <= 0) return "";
    const low = 100 * shown.lower / maximum, high = 100 * shown.upper / maximum;
    const point = Math.min(100, Math.max(0, 100 * shown.rawValue / maximum));
    // Hide uninformative geometry for an extreme result. The two numerical
    // limits in the integrated result card remain visible in every case.
    if (![low, high, point].every(Number.isFinite) || high - low < 30) return "";
    const endpoints = String(shown.referenceValue).replace(/^≈/, "").split("–");
    return `<div class="sodium-dzm-norm-axis" style="--low:${low}%;--high:${high}%;--point:${point}%" role="img" aria-label="Wynik ${escape(shown.valueText)} ${escape(shown.unitText)}; norma ${escape(shown.referenceText || shown.referenceValue)}"><span class="sodium-dzm-norm-band-title">Norma</span><div class="sodium-dzm-norm-track"><i class="sodium-dzm-norm-boundary sodium-dzm-norm-boundary--low"></i><i class="sodium-dzm-norm-boundary sodium-dzm-norm-boundary--high"></i><i class="sodium-dzm-norm-point"></i></div><div class="sodium-dzm-norm-labels"><span class="sodium-dzm-norm-label--low">${escape(endpoints[0] || "")}</span><span class="sodium-dzm-norm-label--high">${escape(endpoints[1] || "")}</span></div><p class="sodium-dzm-norm-axis-caption">Znacznik pokazuje wynik pacjenta.</p></div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      const title = model.blocked ? "Nie można ocenić tej zbiórki" : missing ? "Tu pojawi się wynik" : "Sprawdź wpisane dane";
      return `<div class="${missing ? "sodium-dzm-result-empty" : "sodium-dzm-result-error"}" data-clcr-formula="Na_mmol_d">${model.errorCode === "numeric-range" ? unitPicker(model) : ""}<strong>${title}</strong>${paragraph(model.error || "Wpisz stężenie i objętość albo jeden gotowy wynik dobowy. Masa, wzrost i wiek nie blokują obliczenia liczby.")}</div>${renderDetails(model)}`;
    }
    const shown = shownResult(model), value = String(shown.valueText);
    const available = referenceAvailable(model);
    const reference = available ? String(shown.referenceValue) : "Brak normy do porównania";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    const policy = model.policy || model.referencePolicy || {};
    const attributes = {
      "data-clcr-formula": "Na_mmol_d", "data-clcr-series": "Na_mmol_d", "data-clcr-code": "sodium-24h",
      "data-clcr-value": shown.rawValue, "data-clcr-display-value": value, "data-clcr-value-length": value.length,
      "data-clcr-display-unit": shown.unitText, "data-clcr-display-label": "Dobowe wydalanie sodu",
      "data-clcr-status": model.statusText || "Dobowe wydalanie sodu", "data-clcr-assessment": assessment,
      "data-clcr-tone": tone, "data-clcr-reference-comparison": available && model.referenceActive !== false,
      "data-clcr-reference-profile": policy.id || model.reference?.profileId || "",
      "data-clcr-reference-profile-version": policy.version || "",
      "data-clcr-sodium-dzm-output-unit": outputUnit(model),
      "data-clcr-sodium-dzm-snapshot": JSON.stringify(model),
    };
    const attr = Object.entries(attributes).map(([key, val]) => `${key}="${escape(val)}"`).join(" ");
    const precision = shown.approximate || shown.roundedDisplay
      ? paragraph(shown.precisionNote || "≈ oznacza zaokrąglenie wyświetlanej liczby. Ocena korzysta z wartości przed zaokrągleniem; więcej cyfr znajdziesz w Szczegółach.", "sodium-dzm-rounding-note") : "";
    return `<div class="result-box clcr-result-card sodium-dzm-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" ${attr}>${unitPicker(model)}<h3 class="sodium-dzm-result-status">${escape(model.statusText || "Dobowe wydalanie sodu")}</h3><div class="clcr-result-main sodium-dzm-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${value.length > 5}" data-dense="${value.length > 8}" data-extra-dense="${value.length > 12}">${escape(value)}</strong><span class="sodium-dzm-result-unit">${escape(shown.unitText)}</span></div><div class="clcr-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${available ? "range" : "none"}"><p class="clcr-result-reference-label">Norma dla wieku</p><strong class="clcr-result-reference-value sodium-dzm-reference-value" data-long="${reference.length > 10}">${rangeMarkup(reference)}</strong><span class="sodium-dzm-reference-unit">${available ? escape(shown.unitText) : "&#160;"}</span>${available ? paragraph(`Zakres laboratoryjny · ${shortReferenceSourceLabel(model)}`, "sodium-dzm-reference-hint") : ""}</div></div>${axisMarkup(model, shown)}${paragraph(model.interpretation || model.notes?.briefContext || "", "sodium-dzm-result-copy")}${precision}${cautions.map(value => paragraph(value, "sodium-dzm-result-caution")).join("")}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ ensureControls, sync, restore, refresh, renderResult });
});
