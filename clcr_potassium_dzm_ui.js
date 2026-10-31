(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrPotassiumDzmUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const layouts = new WeakMap();
  const boundDocuments = new WeakSet();
  const unitBindings = new WeakMap();
  const UNIT_CONTROLS = Object.freeze({ K_volumeUnit: ["volume", "K_volume"] });
  const CONTROLS = [
    { id: "K_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "K_concentration", label: "Potas w moczu", placeholder: "np. 100" },
    { id: "K_volume", label: "Objętość całej zbiórki", placeholder: "np. 1500" },
    { id: "K_volumeUnit", label: "Jednostka objętości", options: [["mL"], ["L"]] },
    { id: "K_reportedValue", label: "Dobowe wydalanie z wyniku badania", placeholder: "np. 150" },
    { id: "K_reportedUnit", label: "Jednostka gotowego wyniku", type: "hidden", value: "mmol/24h" },
    { id: "K_collectionHours", label: "Rzeczywisty czas zbiórki (godz.)", value: "24", placeholder: "24" },
    { id: "K_collectionSource", label: "Źródło czasu zbiórki", type: "hidden", value: "assumed-24h" },
    { id: "K_durationNeedsConfirmation", label: "Czas wymaga uzupełnienia", type: "hidden", value: "false" },
    { id: "K_outputUnit", label: "Jednostka wyniku", type: "hidden", value: "mmol/24h" },
    { id: "K_unitConversions", label: "Dokładne dane przed zmianą jednostki", type: "hidden", value: "" },
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
      const value = JSON.parse(doc.getElementById("K_unitConversions")?.value || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(["volume"].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : {};
    } catch (_) { return {}; }
  }

  function writeConversions(doc, value) {
    const field = doc.getElementById("K_unitConversions");
    const encoded = Object.keys(value).length ? JSON.stringify(value) : "";
    if (field) field.value = encoded;
    // The shared serializer preserves hidden empty controls from this vault.
    // An explicit unit conversion or edit also owns its explicit clear here.
    const vault = doc.defaultView?.__vildaClcrVersionValueVault || root.__vildaClcrVersionValueVault;
    if (vault && typeof vault === "object" && !Array.isArray(vault)) vault.K_unitConversions = encoded;
  }

  // Preserve the original typed quantity across unit-only changes so a
  // rounded editable conversion cannot change the clinical comparison.
  function convertedInput(engine, key, value, fromUnit, toUnit) {
    const converted = engine?.convertUnitInput?.(value, fromUnit, toUnit, key);
    return converted?.ok ? converted.text : null;
  }

  // Decimal separator normalization is not a new quantity. Compare exact
  // fractions so an edit that rounds to the same Number still invalidates
  // the original conversion, while a comma/dot-only change preserves it.
  function sameExactQuantity(engine, first, second) {
    const a = engine?.parseValue?.(first)?.exact, b = engine?.parseValue?.(second)?.exact;
    return Boolean(a && b && BigInt(a.numerator) * BigInt(b.denominator) === BigInt(b.numerator) * BigInt(a.denominator));
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
        const engine = browser.VildaClcrPotassiumDzm || root.VildaClcrPotassiumDzm;
        const current = valueField.value, conversions = conversionData(doc), prior = conversions[key];
        const pristine = prior && prior.convertedUnit === previous && sameExactQuantity(engine, prior.convertedValue, current);
        const originalValue = pristine ? prior.originalValue : current, originalUnit = pristine ? prior.originalUnit : previous;
        if (!current.trim()) { delete conversions[key]; writeConversions(doc, conversions); return; }
        const converted = next === originalUnit ? originalValue : convertedInput(engine, key, originalValue, originalUnit, next);
        if (converted === null) {
          // An invalid entry remains editable; a valid quantity is never
          // silently relabelled when its conversion cannot be represented.
          const parsed = engine?.parseValue?.(originalValue);
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
        const browser = doc.defaultView || root;
        if (event.isTrusted === false || browser.__vildaPersistRestoring) return;
        const binding = Object.entries(UNIT_CONTROLS).find(([, [, id]]) => event.target?.id === id);
        if (!binding) return;
        const [unitId, [key]] = binding, conversions = conversionData(doc), prior = conversions[key];
        if (!Object.hasOwn(conversions, key)) return;
        const engine = browser.VildaClcrPotassiumDzm || root.VildaClcrPotassiumDzm;
        if (prior?.convertedUnit === doc.getElementById(unitId)?.value && sameExactQuantity(engine, prior.convertedValue, event.target.value)) return;
        delete conversions[key]; writeConversions(doc, conversions);
      }, true);
    }
    let registry = doc.getElementById("clcrPotassiumDzmControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "potassium-dzm-control-registry");
      registry.id = "clcrPotassiumDzmControlRegistry";
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
    const duration = doc.getElementById("K_collectionHours");
    const source = doc.getElementById("K_collectionSource");
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
    const anchor = layout.document.createComment(`potassium-dzm-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit) });
    view.wrapper.classList.add("potassium-dzm-entry-field");
    if (unit) view.wrapper.classList.add("potassium-dzm-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("potassiumDzmInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
    return view;
  }

  function fieldRow(layout, host, valueId, unitId, direct) {
    const field = element(layout.document, "div", "potassium-dzm-input-field");
    const row = element(layout.document, "div", `potassium-dzm-value-row${direct ? " potassium-dzm-value-row--reported" : ""}`);
    field.append(row);
    host.append(field);
    moveField(layout, valueId, row);
    if (unitId) moveField(layout, unitId, row, true);
    else row.append(element(layout.document, "span", "potassium-dzm-fixed-unit", direct ? "mmol/24 h" : "mmol/L"));
    return field;
  }

  function disclosure(layout, label, id) {
    const row = element(layout.document, "div", "potassium-dzm-context-row");
    const copy = element(layout.document, "div");
    const caption = element(layout.document, "span", "potassium-dzm-context-label", label);
    const value = element(layout.document, "strong", "potassium-dzm-context-value");
    const button = element(layout.document, "button", "potassium-dzm-context-button", "Zmień");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);
    const editor = element(layout.document, "div", "potassium-dzm-inline-editor");
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
    const card = element(doc, "section", "potassium-dzm-input-card");
    card.id = "potassiumDzmInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia potasu w dobowej zbiórce moczu");
    const mode = element(doc, "div", "potassium-dzm-input-mode");
    mode.setAttribute("role", "group");
    mode.setAttribute("aria-label", "Sposób wpisania wyniku");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężenia"], ["reported", "Gotowy wynik"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button";
      button.dataset.potassiumDzmMode = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("K_inputMode");
        if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout);
      });
      layout.modeButtons.push(button);
      mode.append(button);
    });
    const concentration = element(doc, "div", "potassium-dzm-mode-fields");
    const reported = element(doc, "div", "potassium-dzm-mode-fields");
    card.append(mode, concentration, reported);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const potassiumField = fieldRow(layout, concentration, "K_concentration");
    potassiumField.append(element(doc, "p", "potassium-dzm-field-hint", "Dla potasu 1 mmol/L = 1 mEq/L."));
    fieldRow(layout, concentration, "K_volume", "K_volumeUnit");
    fieldRow(layout, reported, "K_reportedValue", null, true);
    reported.append(element(doc, "p", "potassium-dzm-field-hint", "Wpisz gotową ilość dobową. Nie przeliczamy jej ponownie przez objętość ani czas. mEq/24 h odpowiada mmol/24 h."));
    layout.concentration = concentration;
    layout.reported = reported;
    layout.duration = disclosure(layout, "Czas zbiórki", "potassiumDzmDurationEditor");
    moveField(layout, "K_collectionHours", layout.duration.editor);
    layout.duration.editor.append(element(doc, "p", "potassium-dzm-field-hint", "Dla innego czasu pokażemy przeliczenie do 24 godzin, bez porównania z normą dobowej zbiórki."));
    layout.assumption = element(doc, "p", "potassium-dzm-assumption");
    layout.error = element(doc, "p", "potassium-dzm-field-error");
    layout.error.id = "potassiumDzmInputError";
    layout.error.hidden = true;
    layout.error.setAttribute("role", "alert");
    layout.readiness = element(doc, "p", "potassium-dzm-readiness");
    layout.readiness.setAttribute("aria-live", "polite");
    card.append(layout.assumption, layout.error, layout.readiness);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function evaluate(doc) {
    const browser = doc.defaultView || root;
    const engine = browser.VildaClcrPotassiumDzm || root.VildaClcrPotassiumDzm;
    if (!engine?.readInputFromDocument || !engine.evaluate) return null;
    return engine.evaluate(engine.readInputFromDocument(doc), (browser.ClcrPotassiumDzmReferenceData || root.ClcrPotassiumDzmReferenceData)?.DEFAULT_POLICY);
  }

  function refreshLayout(layout) {
    const doc = layout.document;
    const reported = doc.getElementById("K_inputMode")?.value === "reported";
    layout.concentration.hidden = reported;
    layout.reported.hidden = !reported;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.potassiumDzmMode === (reported ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const model = evaluate(doc);
    const rawHours = doc.getElementById("K_collectionHours")?.value?.trim() || "";
    const duration = (doc.defaultView?.ClcrCollectionDuration || root.ClcrCollectionDuration)?.readFromDocument(doc, { fieldId: "K_collectionHours", sourceId: "K_collectionSource" });
    const unresolvedDuration = duration?.missing || !duration?.valid && doc.getElementById("K_collectionSource")?.value === "historical-missing";
    const correctionNeeded = unresolvedDuration || duration?.valid === false || duration?.hours !== 24;
    layout.duration.value.textContent = unresolvedDuration ? "Uzupełnij czas" : `${String(duration?.valid ? duration.hours : rawHours || "24").replace(".", ",")} godz.`;
    layout.duration.row.hidden = reported && !correctionNeeded;
    // Keep an actively edited auto-opened field open until Zmień closes it;
    // collapsing on blur can move the next button before its click completes.
    if (doc.activeElement?.id === "K_collectionHours") layout.duration.userOpen = true;
    const durationOpen = !layout.duration.row.hidden && (layout.duration.userOpen || unresolvedDuration || model?.invalidIds?.includes("K_collectionHours"));
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
      view.wrapper.classList.remove("potassium-dzm-entry-field");
      if (unit) view.wrapper.classList.remove("potassium-dzm-unit-field");
      Object.entries(attributes).forEach(([key, value]) => {
        if (value === null) view.control.removeAttribute(key);
        else view.control.setAttribute(key, value);
      });
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(doc);
    doc.documentElement.removeAttribute("data-clcr-potassium-dzm-active");
  }

  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return;
      layouts.set(doc, layout);
    }
    doc.documentElement.dataset.clcrPotassiumDzmActive = "1";
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

  function referenceAvailable(model) {
    return model.referenceAvailable === true && model.reference &&
      Number.isFinite(model.reference.lower) && Number.isFinite(model.reference.upper);
  }

  // Keep each endpoint intact. A narrow screen may wrap at the separator,
  // never between the digits of a laboratory reference value.
  function rangeMarkup(value) {
    const bounds = String(value).split("–");
    if (bounds.length !== 2) return escape(value);
    return `<span class="potassium-dzm-reference-bound">${escape(bounds[0])}–</span><wbr><span class="potassium-dzm-reference-bound">${escape(bounds[1])}</span>`;
  }

  function referenceSourceLabel(model) {
    const label = model.reference?.sourceLabel || model.referenceRows?.[0]?.sourceLabel || model.population?.label || "Labcorp";
    return String(label).split(" · ")[0];
  }

  function shortReferenceSourceLabel(model) {
    return referenceSourceLabel(model).replace(/\s+\d+$/, "");
  }

  function renderReferenceTable(model, shown) {
    const rows = Array.isArray(model.referenceTable) ? model.referenceTable : [];
    if (!rows.length) return "";
    const cell = data => `<td${data?.active ? ' class="potassium-dzm-current-cell" aria-current="true"' : ""}>${rangeMarkup(data?.text || "Nie ustalono")}</td>`;
    return `<h3>Przyjęte normy</h3><p class="potassium-dzm-table-caption">${escape(referenceSourceLabel(model))} · ${escape(shown.unitText)} · pełna zbiórka 24 h</p><table class="clcr-result-category-table" aria-label="Normy potasu w dobowej zbiórce moczu"><thead><tr><th scope="col">Wiek</th><th scope="col">Mężczyźni / chłopcy</th><th scope="col">Kobiety / dziewczynki</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.label || row.population || "")}</td>${cell(row.male)}${cell(row.female)}</tr>`).join("")}</tbody></table>`;
  }

  function renderDetails(model) {
    const notes = model.notes || {}, shown = shownResult(model);
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const standardSections = [
      ["Jak dobrano normę", notes.referenceCalculation || model.reference?.explanation || notes.scope],
      ["Jak liczymy?", notes.formula || notes.calculation],
      ["Przeliczenia jednostek", notes.conversion],
      ["Znaczenie zbiórki", notes.collection],
      ["Ograniczenia interpretacji", notes.limitations],
      ["Znany kontekst zbiórki", model.blocked ? notes.knownContradiction : ""],
    ].filter(([, value]) => typeof value === "string" && value);
    const copy = standardSections.map(([heading, value]) => `<h3>${escape(heading)}</h3>${paragraph(value)}`).join("");
    const sections = (Array.isArray(notes.sections) ? notes.sections : []).map(section => `<h3>${escape(section.title || section.label || "")}</h3>${(Array.isArray(section.paragraphs) ? section.paragraphs : [section.text]).map(value => paragraph(value)).join("")}`).join("");
    const fullValue = shown.fullValueText || shown.unroundedValueText || notes.fullValueText;
    const quantity = shown.exactValue || model.exactMain;
    const exactFraction = shown.fullValueComplete === false && quantity?.numerator && quantity?.denominator
      ? paragraph(`Dokładny ułamek: ${quantity.numerator}/${quantity.denominator} ${shown.unitText}. Znak … oznacza dalsze cyfry rozwinięcia dziesiętnego.`, "potassium-dzm-unrounded-result") : "";
    const precision = (shown.approximate || shown.roundedDisplay) && fullValue
      ? `<h3>Wynik przed zaokrągleniem</h3><p class="potassium-dzm-unrounded-result">${escape(fullValue)} ${escape(shown.unitText)}</p>${exactFraction}${paragraph(shown.precisionNote || notes.precisionNote)}` : "";
    return `<details class="clcr-result-details potassium-dzm-proposal-details" id="clcr-potassium-dzm-details" data-clcr-formula="K_mmol_d" tabindex="-1"><summary>Szczegóły i źródła</summary>${renderReferenceTable(model, shown)}${precision}${copy}${sections}${sources.length ? `<h3>Źródła</h3><ul class="potassium-dzm-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
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
    // Native SVG coordinates carry only geometry. No viewBox means the CSS
    // text size stays constant as the available card width changes.
    return `<div class="potassium-dzm-norm-axis" role="img" aria-label="Wynik ${escape(shown.valueText)} ${escape(shown.unitText)}; norma ${escape(shown.referenceText || shown.referenceValue)}"><svg class="potassium-dzm-norm-graphic" width="100%" height="76" aria-hidden="true" focusable="false"><rect class="potassium-dzm-norm-background" x="0" y="34" width="100%" height="12" rx="6"/><rect class="potassium-dzm-norm-band" x="${low}%" y="34" width="${high - low}%" height="12"/><rect class="potassium-dzm-norm-track" x="0" y="34" width="100%" height="12" rx="6"/><line class="potassium-dzm-norm-boundary potassium-dzm-norm-boundary--low" x1="${low}%" x2="${low}%" y1="29" y2="49"/><line class="potassium-dzm-norm-boundary potassium-dzm-norm-boundary--high" x1="${high}%" x2="${high}%" y1="29" y2="49"/><line class="potassium-dzm-norm-point" x1="${point}%" x2="${point}%" y1="24" y2="52"/><circle class="potassium-dzm-norm-point-cap" cx="${point}%" cy="22" r="4.5"/><text class="potassium-dzm-norm-band-title" x="${(low + high) / 2}%" y="12">Norma</text><g class="potassium-dzm-norm-labels"><text class="potassium-dzm-norm-label--low" x="${low}%" y="61">${escape(endpoints[0] || "")}</text><text class="potassium-dzm-norm-label--high" x="${high}%" y="61">${escape(endpoints[1] || "")}</text></g></svg><p class="potassium-dzm-norm-axis-caption">Znacznik pokazuje wynik pacjenta.</p></div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      const title = model.blocked ? "Nie można ocenić tej zbiórki" : missing ? "Tu pojawi się wynik" : "Sprawdź wpisane dane";
      return `<div class="${missing ? "potassium-dzm-result-empty" : "potassium-dzm-result-error"}" data-clcr-formula="K_mmol_d"><strong>${title}</strong>${paragraph(model.error || "Wpisz stężenie i objętość albo jeden gotowy wynik dobowy. Masa, wzrost i wiek nie blokują obliczenia liczby.")}</div>${renderDetails(model)}`;
    }
    const shown = shownResult(model), value = String(shown.valueText);
    const available = referenceAvailable(model);
    const reference = available ? String(shown.referenceValue) : "Brak normy do porównania";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    const policy = model.policy || model.referencePolicy || {};
    const attributes = {
      "data-clcr-formula": "K_mmol_d", "data-clcr-series": "K_mmol_d", "data-clcr-code": "potassium-24h",
      "data-clcr-value": shown.rawValue, "data-clcr-display-value": value, "data-clcr-value-length": value.length,
      "data-clcr-display-unit": shown.unitText, "data-clcr-display-label": "Dobowe wydalanie potasu",
      "data-clcr-status": model.statusText || "Dobowe wydalanie potasu", "data-clcr-assessment": assessment,
      "data-clcr-tone": tone, "data-clcr-reference-comparison": available && model.referenceActive !== false,
      "data-clcr-reference-profile": policy.id || model.reference?.profileId || "",
      "data-clcr-reference-profile-version": policy.version || "",
      "data-clcr-potassium-dzm-output-unit": "mmol/24h",
      "data-clcr-potassium-dzm-snapshot": JSON.stringify(model),
    };
    const attr = Object.entries(attributes).map(([key, val]) => `${key}="${escape(val)}"`).join(" ");
    const precision = shown.approximate || shown.roundedDisplay
      ? paragraph(shown.precisionNote || "≈ oznacza zaokrąglenie wyświetlanej liczby. Ocena korzysta z wartości przed zaokrągleniem; więcej cyfr znajdziesz w Szczegółach.", "potassium-dzm-rounding-note") : "";
    return `<div class="result-box clcr-result-card potassium-dzm-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" ${attr}><h3 class="potassium-dzm-result-status">${escape(model.statusText || "Dobowe wydalanie potasu")}</h3><div class="clcr-result-main potassium-dzm-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${value.length > 5}" data-dense="${value.length > 8}" data-extra-dense="${value.length > 12}">${escape(value)}</strong><span class="potassium-dzm-result-unit">${escape(shown.unitText)}</span></div><div class="clcr-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${available ? "range" : "none"}"><p class="clcr-result-reference-label">Norma dla wieku <span class="potassium-dzm-inline-source">· ${escape(shortReferenceSourceLabel(model))}</span></p><strong class="clcr-result-reference-value potassium-dzm-reference-value" data-long="${reference.length > 10}">${rangeMarkup(reference)}</strong><span class="potassium-dzm-reference-unit">${available ? escape(shown.unitText) : "&#160;"}</span>${available ? paragraph("Orientacyjny zakres źródła", "potassium-dzm-reference-hint") : ""}</div></div>${axisMarkup(model, shown)}${paragraph(model.interpretation || model.notes?.briefContext || "", "potassium-dzm-result-copy")}${precision}${cautions.map(value => paragraph(value, "potassium-dzm-result-caution")).join("")}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ ensureControls, sync, restore, refresh, renderResult });
});
