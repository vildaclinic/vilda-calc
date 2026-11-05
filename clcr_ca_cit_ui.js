(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrCaCitUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const layouts = new WeakMap();
  const CONTROLS = Object.freeze([
    { id: "CACIT_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "CACIT_calcium", label: "Wapń w moczu", placeholder: "np. 2" },
    { id: "CACIT_calciumUnit", label: "Jednostka stężenia wapnia", options: ["mmol/L", "mg/dL", "mg/L"], value: "mmol/L" },
    { id: "CACIT_citrate", label: "Cytryniany w moczu", placeholder: "np. 40" },
    { id: "CACIT_citrateUnit", label: "Jednostka stężenia cytrynianów", options: ["µmol/L", "mmol/L", "mg/L", "mg/dL"], value: "mg/dL" },
    { id: "CACIT_reportedValue", label: "Gotowy wynik Ca/Cit", placeholder: "np. 0,2" },
    { id: "CACIT_reportedUnit", label: "Jednostka gotowego wyniku", options: ["mg/mg", "mmol/mmol"], value: "mg/mg" },
    { id: "CACIT_sameSpecimen", label: "Pochodzenie próbki", type: "hidden", value: "assumed" },
    { id: "CACIT_collectionProblem", label: "Znany problem ze zbiórką", type: "hidden", value: "" },
    { id: "CACIT_collectionHours", label: "Znany czas zbiórki", type: "hidden", value: "" },
    { id: "CACIT_durationKnown", label: "Znany czas zbiórki", type: "hidden", value: "" },
    { id: "CACIT_sampleType", label: "Rodzaj próbki", type: "hidden", value: "timed" },
    { id: "CACIT_sampleSource", label: "Źródło informacji o próbce", type: "hidden", value: "assumed-current" },
    { id: "CACIT_durationSource", label: "Źródło informacji o czasie", type: "hidden", value: "" },
    { id: "CACIT_sourceContext", label: "Zapisany kontekst źródłowy", type: "hidden", value: "" },
  ]);
  const EDIT_ATTRIBUTES = ["aria-describedby", "aria-invalid"];
  const UNIT_HINT = "Wybierz jednostki zgodnie z wynikiem laboratorium. Zmiana jednostki nie zmienia wpisanej liczby.";

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function browser(doc) { return doc?.defaultView || root; }
  function engine(doc) { return browser(doc).VildaClcrCaCit || root.VildaClcrCaCit; }
  function defaultPolicy(doc) {
    const data = browser(doc).ClcrCaCitReferenceData || root.ClcrCaCitReferenceData;
    return data?.DEFAULT_PROFILE || data?.DEFAULT_POLICY || data?.getProfile?.(data.DEFAULT_PROFILE_ID);
  }
  function readInput(doc, context) {
    const session = browser(doc).ClcrCaCitSession || root.ClcrCaCitSession;
    const resolved = context === undefined ? session?.readContext?.(doc) || {} : context;
    return engine(doc)?.readInputFromDocument?.(doc, resolved) || null;
  }
  function evaluate(doc, policy) {
    const calculator = engine(doc), input = readInput(doc);
    return input && calculator?.evaluate ? calculator.evaluate(input, policy || defaultPolicy(doc)) : null;
  }

  // Register the actual controls before the shared workflow captures fields.
  // Unit selectors describe the laboratory report; they never rewrite its number.
  function ensureControls(doc) {
    const form = doc?.getElementById("clcrForm");
    if (!form) return [];
    let registry = doc.getElementById("clcrCaCitControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "ca-cit-control-registry");
      registry.id = "clcrCaCitControlRegistry";
      registry.hidden = true;
      form.append(registry);
    }
    return CONTROLS.map(spec => {
      const existing = doc.getElementById(spec.id);
      if (existing) return existing;
      const wrapper = element(doc, "label");
      wrapper.htmlFor = spec.id;
      wrapper.append(element(doc, "span", "ca-cit-field-label", spec.label));
      const control = element(doc, spec.options ? "select" : "input");
      control.id = spec.id;
      if (spec.options) {
        spec.options.forEach(value => {
          const option = element(doc, "option", "", value);
          option.value = value;
          control.append(option);
        });
      } else {
        control.type = spec.type || "text";
        if (!spec.type) {
          control.setAttribute("inputmode", "decimal");
          control.setAttribute("spellcheck", "false");
          control.setAttribute("autocomplete", "off");
        }
        if (spec.placeholder) control.setAttribute("placeholder", spec.placeholder);
      }
      control.value = spec.value || "";
      control.setAttribute("aria-label", spec.label);
      wrapper.append(control);
      registry.append(wrapper);
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
    if (!view?.wrapper?.parentNode) return;
    const anchor = layout.document.createComment(`ca-cit-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit: Boolean(unit), hidden: view.wrapper.hidden });
    view.wrapper.classList.add("ca-cit-entry-field");
    if (unit) view.wrapper.classList.add("ca-cit-unit-field");
    const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptions.add("caCitUnitHint");
    descriptions.add("caCitInputError");
    view.control.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    view.wrapper.hidden = false;
    target.append(view.wrapper);
  }
  function fieldRow(layout, host, valueId, unitId) {
    const row = element(layout.document, "div", "ca-cit-value-row");
    host.append(row);
    moveField(layout, valueId, row);
    moveField(layout, unitId, row, true);
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm");
    if (!form) return null;
    ensureControls(doc);
    const card = element(doc, "section", "ca-cit-input-card");
    card.id = "caCitInputCard";
    card.setAttribute("aria-label", "Dane do obliczenia stosunku wapnia do cytrynianów");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    card.append(element(doc, "p", "ca-cit-intro", "Wpisz stężenia z tej samej wymieszanej dobowej zbiórki moczu."));
    const modes = element(doc, "div", "ca-cit-input-mode");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "Sposób wpisania wyniku");
    [["concentration", "Oblicz ze stężeń"], ["reported", "Gotowy wynik"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label);
      button.type = "button";
      button.setAttribute("data-ca-cit-mode", value);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const control = doc.getElementById("CACIT_inputMode");
        if (!control || control.value === value) return;
        control.value = value;
        const EventType = browser(doc).Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout);
      });
      layout.modeButtons.push(button);
      modes.append(button);
    });
    layout.concentration = element(doc, "div", "ca-cit-mode-fields");
    layout.direct = element(doc, "div", "ca-cit-mode-fields");
    card.append(modes, layout.concentration, layout.direct);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    fieldRow(layout, layout.concentration, "CACIT_calcium", "CACIT_calciumUnit");
    fieldRow(layout, layout.concentration, "CACIT_citrate", "CACIT_citrateUnit");
    fieldRow(layout, layout.direct, "CACIT_reportedValue", "CACIT_reportedUnit");
    const hint = element(doc, "p", "ca-cit-field-hint", UNIT_HINT);
    hint.id = "caCitUnitHint";
    layout.error = element(doc, "p", "ca-cit-field-error");
    layout.error.id = "caCitInputError";
    layout.error.hidden = true;
    layout.error.setAttribute("role", "alert");
    layout.readiness = element(doc, "p", "ca-cit-readiness");
    layout.readiness.setAttribute("aria-live", "polite");
    card.append(hint, layout.error, layout.readiness);
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }
  function invalidIds(model) {
    if (Array.isArray(model?.invalidIds)) return model.invalidIds;
    const aliases = { calcium: "CACIT_calcium", calciumValue: "CACIT_calcium", citrate: "CACIT_citrate", citrateValue: "CACIT_citrate", reportedValue: "CACIT_reportedValue" };
    const reason = model?.errorCode || model?.reasonCode || "";
    const specific = /calcium/.test(reason) ? "CACIT_calcium" : /citrate/.test(reason) ? "CACIT_citrate" : /reported-value/.test(reason) ? "CACIT_reportedValue" : /reported-unit/.test(reason) ? "CACIT_reportedUnit" : "";
    return [...(model?.errors || []).map(error => aliases[error.field] || error.field).filter(Boolean), ...(specific && !/^missing-/.test(reason) ? [specific] : [])];
  }
  function isMissing(model) {
    const reason = model?.errorCode || model?.reasonCode || "";
    return !model || model.missing === true || model.kind === "empty" || /^missing-/.test(reason) || (!reason && !model.error && !model.message && !(model.errors || []).length);
  }
  function refreshLayout(layout, suppliedModel) {
    const doc = layout.document, direct = doc.getElementById("CACIT_inputMode")?.value === "reported";
    layout.concentration.hidden = direct;
    layout.direct.hidden = !direct;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.getAttribute("data-ca-cit-mode") === (direct ? "reported" : "concentration"))));
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    const model = suppliedModel || evaluate(doc, layout.options.policy);
    const invalid = Boolean(model && !model.valid && !isMissing(model));
    layout.error.hidden = !invalid;
    layout.error.textContent = invalid ? model.error || model.message || model.errors?.map(error => error.message).join(" ") || "Sprawdź wpisane wartości." : "";
    const invalidFields = invalidIds(model);
    layout.moves.forEach(({ view }) => view.control.setAttribute("aria-invalid", String(invalidFields.includes(view.control.id))));
    const required = direct ? ["CACIT_reportedValue"] : ["CACIT_calcium", "CACIT_citrate"];
    const filled = required.filter(id => doc.getElementById(id)?.value?.trim() && !invalidFields.includes(id)).length;
    layout.readiness.setAttribute("data-complete", String(model?.valid === true));
    layout.readiness.textContent = invalid ? "Sprawdź wpisane wartości" : `Wymagane dane ${filled}/${required.length}`;
    return model;
  }
  function restore(doc) {
    const layout = layouts.get(doc);
    if (!layout) return;
    layout.moves.forEach(({ view, anchor, attributes, unit, hidden }) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
      anchor.remove();
      view.wrapper.classList.remove("ca-cit-entry-field");
      if (unit) view.wrapper.classList.remove("ca-cit-unit-field");
      view.wrapper.hidden = hidden;
      Object.entries(attributes).forEach(([key, value]) => {
        if (value === null) view.control.removeAttribute(key);
        else view.control.setAttribute(key, value);
      });
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(doc);
    doc.documentElement.removeAttribute("data-clcr-ca-cit-active");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return null; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return null;
      layouts.set(doc, layout);
    } else layout.options = options;
    doc.documentElement.setAttribute("data-clcr-ca-cit-active", "1");
    refreshLayout(layout, options.model);
    return layout.card;
  }
  function refresh(doc, model) {
    const layout = layouts.get(doc);
    return layout ? refreshLayout(layout, model) : null;
  }
  function reset(doc) {
    for (const spec of CONTROLS) {
      const control = doc.getElementById(spec.id);
      if (control) control.value = spec.value || "";
    }
    return refresh(doc);
  }
  function paragraph(value, className) { return typeof value === "string" && value ? `<p${className ? ` class="${className}"` : ""}>${escape(value)}</p>` : ""; }
  function localNumber(value) { return String(value == null ? "" : value).replace(/\./g, ","); }
  function sourceMarkup(source) {
    if (!source) return "";
    const label = escape(source.label || source.title || source.authors || "Kirejczyk i wsp., 2014 · tabela 2");
    const link = /^https:\/\//.test(source.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    return `${link}${source.locator || source.location || source.section ? `<small>${escape(source.locator || source.location || source.section)}</small>` : ""}`;
  }
  function renderTable(model) {
    const rows = model.referenceTable || model.reference?.table || [];
    if (!rows.length) return "";
    return `<div class="ca-cit-reference-table-wrap"><table class="clcr-result-category-table ca-cit-reference-table"><caption>Ca/Cit (mg/mg) · zakres P5–P95</caption><thead><tr><th scope="col">Wiek</th><th scope="col">Chłopcy</th><th scope="col">Dziewczynki</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escape(row.label)}</th>${["M", "F"].map(sex => {
      const cell = row.bySex?.[sex] || {};
      const active = model.referenceAvailable === true && row.selected === true && row.selectedSex === sex;
      return `<td${active ? ' class="ca-cit-current-reference" aria-current="true"' : ""}>${escape(localNumber(cell.lowerP5))}–${escape(localNumber(cell.upper))}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>${paragraph("Wyróżnienie wskazuje wyłącznie grupę użytą do bieżącego porównania.", "ca-cit-details-note")}`;
  }
  function renderDetails(result) {
    const model = result || {}, notes = model.notes || {};
    const direct = model.input?.mode === "reported";
    const formula = notes.formula || notes.calculation || (direct ? "Gotowy iloraz Ca/Cit jest przyjmowany w jednostce z raportu." : "Ca/Cit = stężenie wapnia / stężenie cytrynianów, w zgodnych jednostkach.");
    const fullText = model.display?.fullValueComplete === false && model.exactValue ? `${model.exactValue.numerator}/${model.exactValue.denominator}` : model.display?.fullValueText || model.display?.full || model.rawValue;
    const canonical = model.canonicalConcentrations;
    const canonicalRows = canonical && !direct ? `<tr><th scope="row">Wapń po sprowadzeniu jednostek</th><td>${escape(localNumber(canonical.calcium))} ${escape(canonical.unit)}</td></tr><tr><th scope="row">Cytryniany po sprowadzeniu jednostek</th><td>${escape(localNumber(canonical.citrate))} ${escape(canonical.unit)}</td></tr>` : "";
    const full = model.valid ? `<table class="ca-cit-calculation-values"><tbody><tr><th scope="row">Pełny wynik Ca/Cit</th><td>${escape(model.comparator || "")}${escape(localNumber(fullText))} ${escape(model.unit)}</td></tr>${canonicalRows}</tbody></table>` : "";
    const group = model.reference?.band;
    const reference = group ? `Użyta grupa: ${group.label} · ${group.sex === "F" ? "dziewczynki" : "chłopcy"}. Górne P95: ${localNumber(model.reference.upper)} mg/mg.` : model.qualification?.note || model.referenceReason || "Porównanie pojawi się po obliczeniu poprawnego wyniku. Zakres dobieramy wyłącznie na podstawie znanych danych pacjenta.";
    const sections = [
      ["Jednostki i ograniczenia", notes.conversion || notes.units || notes.concentration || "Wapń: 40,078 mg/mmol, czyli 1 mmol/L = 4,0078 mg/dL. Dla cytrynianów w mg/L lub mg/dL obliczamy iloraz masowy mg/mg. Nie przeliczamy masy cytrynianów na mole ani moli na masę bez określonej postaci chemicznej."],
      ["Populacja źródłowa", model.population?.label || ""],
      ["Zakres porównania", notes.scope || notes.referenceLimitations || "Zakres pochodzi z badania zdrowych polskich dzieci w wieku 2–<18 lat. Nie przenosimy go na niemowlęta lub dorosłych i nie interpolujemy pomiędzy grupami. Wiek i płeć służą tylko porównaniu; ich brak nie blokuje obliczenia."],
      ["Podstawa masowa cytrynianów", notes.massBasis || notes.chemicalBasis || "Zakres publikacyjny podano w mg/mg; publikacja nie wskazuje, którą postać masową cytrynianów zastosowano (kwas bezwodny, jon czy monohydrat). Dlatego nie przeliczamy normy na mole. Wynik molowy pozostaje bez automatycznej oceny."],
      ["Znaczenie wyniku", notes.clinicalDetails || notes.clinical || notes.diagnosis || "Większy stosunek wapnia do cytrynianów może wiązać się z większą skłonnością do tworzenia złogów wapniowych. Sam Ca/Cit nie rozpoznaje ani nie wyklucza kamicy i nie zastępuje pełnej oceny klinicznej."],
      ["Próbka i zbiórka", notes.collectionDetails || notes.collection || notes.sample || "Obliczenie zakłada dwa oznaczenia z tej samej wymieszanej dobowej zbiórki moczu. Czas i objętość nie są potrzebne do samego ilorazu."],
      ["Dorośli", notes.adults || notes.adult || "U dorosłych Ca/Cit jest wskaźnikiem pomocniczym oceny kamicy; nie przyjmujemy uniwersalnej normy DZM."],
      ["Dane dotyczące dorosłych", notes.adultEvidence || ""],
      ["Dokładność wyniku", notes.rounding || (model.display?.approximate || model.display?.rounded ? "Skrócony zapis oznaczamy ≈. Ocena wyniku uwzględnia pełną wartość przed zaokrągleniem." : "")],
    ].filter(([, text]) => typeof text === "string" && text);
    const extraNotes = (Array.isArray(model.details) ? model.details : []).filter(note => typeof note === "string" && note && !sections.some(([, text]) => text === note));
    const sources = Array.isArray(model.sources) ? model.sources : model.source ? [model.source] : model.reference?.source ? [model.reference.source] : [];
    return `<details class="clcr-result-details ca-cit-details" id="clcr-ca-cit-details" data-clcr-formula="Ca_Cit" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Jak obliczamy wynik?</h3>${paragraph(formula)}${full}<h3>Przyjęta norma dla wieku i płci</h3>${paragraph(reference)}${paragraph("Jako orientacyjną górną granicę przyjmujemy P95 z tabeli 2. Wynik równy P95 należy do przyjętej normy (≤P95). Dolne P5 pokazujemy informacyjnie; mały iloraz nie otrzymuje alarmu.")}${renderTable(model)}${sections.map(([heading, text]) => `<h3>${escape(heading)}</h3>${paragraph(text)}`).join("")}${extraNotes.map(note => paragraph(note)).join("")}${sources.length ? `<h3>Źródła</h3><ul class="ca-cit-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }
  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = isMissing(model);
      return `<div class="${missing ? "ca-cit-result-empty" : "ca-cit-result-error"}" data-clcr-formula="Ca_Cit"><strong>${missing ? "Tutaj pojawi się wynik" : "Sprawdź wpisane dane"}</strong>${paragraph(model.error || model.message || (model.input?.mode === "reported" ? "Wpisz gotowy wynik Ca/Cit z laboratorium." : "Wpisz stężenie wapnia i cytrynianów z tej samej zbiórki."))}</div>${renderDetails(model)}`;
    }
    // Saved results carry their own presentation and reference. Rendering never
    // reads today's patient, engine or reference policy.
    const shown = model.presentation || model.display || {};
    const original = String(shown.valueText || shown.value || shown.text || model.rawValue);
    const approximate = shown.approximate === true || shown.rounded === true || /^≈/.test(original);
    const comparator = shown.comparator || model.comparator || "";
    const number = localNumber(original.replace(/^[<≤>≥]\s*/, "").replace(/^≈\s*/, "")), value = `${comparator}${approximate ? "≈ " : ""}${number}`;
    const visualLength = number.length + (comparator ? 1 : 0) + (approximate ? 1 : 0);
    const unit = shown.unitText || model.unit;
    const visible = model.referenceAvailable === true && Number.isFinite(model.reference?.upper);
    const reference = visible ? localNumber(model.reference.display?.limit || model.reference.limit || `≤${model.reference.upper}`) : "Brak normy do porównania";
    const tone = model.tone === "warning" || model.category === "above" ? "warning" : model.tone === "normal" || model.category === "within" ? "normal" : "neutral";
    const assessment = model.category === "above" ? "outside" : model.category === "within" ? "within" : "unassessed";
    const comment = model.comment || model.interpretation || model.qualification?.note || "";
    return `<div class="result-box clcr-result-card ca-cit-result-card${assessment === "outside" ? " out-of-range" : ""}" data-clcr-formula="Ca_Cit" data-clcr-series="${model.unit === "mmol/mmol" ? "Ca_Cit_mol" : "Ca_Cit"}" data-clcr-code="calcium-citrate-ratio" data-clcr-value="${escape(model.rawValue)}" data-clcr-display-value="${escape(value)}" data-clcr-display-unit="${escape(unit)}" data-clcr-display-label="Stosunek wapnia do cytrynianów" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${visible && assessment !== "unassessed"}" data-clcr-reference-profile="${escape(model.profileId || "")}" data-clcr-ca-cit-snapshot="${escape(JSON.stringify(model.snapshot || model))}"><h3 class="ca-cit-result-status">${escape(model.statusText || "Ca/Cit — wynik liczbowy")}</h3><div class="clcr-result-main ca-cit-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${visualLength > 5}" data-dense="${visualLength > 12}" data-short="${visualLength <= 5}">${comparator ? `<span class="ca-cit-comparator">${escape(comparator)}</span>` : ""}${approximate ? '<span class="ca-cit-approx-prefix">≈ </span>' : ""}<span class="ca-cit-number-text">${escape(number)}</span></strong><span class="ca-cit-result-unit">${escape(unit)}</span></div><div class="clcr-result-reference${visible ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${visible ? "upper" : "none"}"><p class="clcr-result-reference-label">Norma dla wieku</p><strong class="clcr-result-reference-value ca-cit-reference-value">${escape(reference)}</strong><span class="ca-cit-reference-unit">${visible ? escape(unit) : "&#160;"}</span></div></div>${paragraph(visible ? "Dla wieku i płci" : "", "ca-cit-reference-hint")}${paragraph(comment, "ca-cit-result-copy")}</div>${renderDetails(model)}`;
  }
  function update(doc, model, options) {
    refresh(doc, model);
    const host = options?.resultHost || doc.getElementById("elecInfo");
    if (host) host.innerHTML = renderResult(model);
    return model;
  }
  function mount(doc, options) { return sync(doc, { active: true, ...options }); }
  return Object.freeze({ ensureControls, sync, mount, restore, refresh, reset, readInput, evaluate, renderResult, renderDetails, update });
});
