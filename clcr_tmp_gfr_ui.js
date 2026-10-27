(function (root, factory) {
  const api = factory();
  if (root) root.ClcrTmpGfrUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const FIELDS = [
    ["U_PO4_spot", "U_PO4_spot_unit", "Fosforany w moczu", "urine"],
    ["Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", "urine"],
    ["S_PO4_spot", "S_PO4_spot_unit", "Fosforany w surowicy", "serum"],
    ["Scr_spot", "Scr_spot_unit", "Kreatynina w surowicy", "serum"],
  ];

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function numberText(value, digits = 2) {
    if (!Number.isFinite(value)) return "";
    return value.toLocaleString("pl-PL", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
  }

  function element(documentRef, tag, className, text) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function move(layout, node, target, preferredAnchor) {
    if (!node || !target || node.parentNode === target) return;
    if (!layout.moves.has(node)) {
      const anchor = preferredAnchor?.parentNode ? preferredAnchor : layout.document.createComment("tmp-gfr-field-origin");
      const owned = anchor !== preferredAnchor;
      if (owned) node.parentNode.insertBefore(anchor, node);
      layout.moves.set(node, { anchor, owned });
    }
    target.appendChild(node);
  }

  function rememberAttributes(layout, control, names) {
    const remembered = layout.attributes.get(control) || {};
    names.forEach(name => { if (!(name in remembered)) remembered[name] = control.getAttribute(name); });
    layout.attributes.set(control, remembered);
  }

  function refreshLayout(layout) {
    const documentRef = layout.document;
    const engine = documentRef.defaultView?.VildaClcrTmpGfr;
    const input = engine?.readInputFromDocument?.(documentRef) || {};
    const clinical = documentRef.defaultView?.ClcrClinicalSafety;
    const age = clinical?.readAgeFromDocument?.(documentRef);
    const ageValid = age?.valid === true || Number.isFinite(input.ageYears);
    layout.ageText.textContent = `Wiek pacjenta: ${age?.valid && clinical?.formatAge ? clinical.formatAge(age) : Number.isFinite(input.ageYears) ? `${numberText(input.ageYears, 0)} lat` : "niepodany"}`;
    if (!ageValid) layout.ageFields.hidden = false;
    layout.ageEdit.textContent = layout.ageFields.hidden ? "Zmień" : "Gotowe";
    layout.ageEdit.setAttribute("aria-expanded", String(!layout.ageFields.hidden));
    const filled = FIELDS.filter(([id], index) => {
      const raw = documentRef.getElementById(id)?.value?.trim();
      if (!raw) return false;
      const value = Number(raw.replace(",", "."));
      return Number.isFinite(value) && (index === 0 ? value >= 0 : value > 0);
    }).length;
    layout.count.textContent = `${filled}/4`;
    layout.track.dataset.filled = String(filled);
    layout.track.setAttribute("aria-valuenow", String(filled));
    layout.therapyFields.hidden = documentRef.getElementById("tmpBurosumab")?.checked !== true;
    const sameUrine = input.sameUrineSpecimen;
    const paired = input.pairedSameTime;
    const different = value => [false, "no", "different"].includes(value);
    const sampleIssue = different(sameUrine) || different(paired);
    layout.fact.hidden = !sampleIssue;
    layout.fact.textContent = sampleIssue
      ? "Zapisano niezgodność próbek krwi lub moczu. Sprawdź dane; aby wprowadzić nowe oznaczenia, użyj przycisku „Wyczyść wszystkie pola”." : "";
    const knownRenalFacts = [
      input.knownCKD === true ? "przewlekła choroba nerek" : "",
      input.knownAKI === true ? "podejrzenie AKI" : "",
      input.rapidlyChangingCreatinine === true ? "szybka zmiana kreatyniny" : "",
    ].filter(Boolean);
    layout.assumption.textContent = knownRenalFacts.length
      ? `Znane informacje: ${knownRenalFacts.join("; ")}. Uwzględniamy je przy wyniku. Warunki pobrania opisano w szczegółach.`
      : "Jeśli nie podano inaczej, zakładamy sparowane próbki krwi i moczu oraz stabilną czynność nerek, bez podejrzenia AKI. Warunki pobrania opisano w szczegółach.";
  }

  function createLayout(documentRef, options) {
    const form = documentRef.getElementById("clcrForm");
    if (!form) return null;
    const card = element(documentRef, "section", "tmp-gfr-input-card");
    card.id = "tmpGfrInputCard";
    card.setAttribute("aria-label", "Dane do TmP/GFR i TRP");
    const readiness = element(documentRef, "div", "tmp-gfr-readiness");
    const count = element(documentRef, "strong");
    count.id = "tmpGfrRequiredCount";
    readiness.append(element(documentRef, "span", "", "Wymagane stężenia"), count);
    const track = element(documentRef, "div", "tmp-gfr-progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Uzupełnione stężenia do TmP/GFR");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "4");
    track.append(element(documentRef, "span"));
    const ageContext = element(documentRef, "div", "tmp-gfr-patient-age");
    const ageText = element(documentRef, "span");
    const ageEdit = element(documentRef, "button", "tmp-gfr-age-edit", "Zmień");
    ageEdit.type = "button";
    const ageFields = element(documentRef, "div", "tmp-gfr-age-fields");
    ageFields.id = "tmpGfrAgeFields";
    ageFields.hidden = true;
    ageEdit.setAttribute("aria-controls", ageFields.id);
    ageContext.append(ageText, ageEdit);
    const groups = {};
    [["urine", "Mocz"], ["serum", "Krew"]].forEach(([key, title]) => {
      const group = element(documentRef, "section", "tmp-gfr-sample-group");
      group.id = key === "urine" ? "tmpGfrUrineFields" : "tmpGfrSerumFields";
      const heading = element(documentRef, "h3", "", title);
      heading.id = `${group.id}Heading`;
      group.setAttribute("aria-labelledby", heading.id);
      group.append(heading);
      groups[key] = group;
    });
    const assumption = element(documentRef, "p", "tmp-gfr-assumption");
    const fact = element(documentRef, "p", "tmp-gfr-known-sample-fact");
    fact.hidden = true;
    const therapy = element(documentRef, "section", "tmp-gfr-therapy-options");
    therapy.setAttribute("aria-label", "Opcjonalny kontekst leczenia");
    const therapyToggle = element(documentRef, "label", "tmp-gfr-therapy-toggle");
    therapyToggle.htmlFor = "tmpBurosumab";
    const toggleText = element(documentRef, "span");
    toggleText.append(element(documentRef, "strong", "", "Monitorowanie burosumabu · XLH"), element(documentRef, "small", "", "Opcjonalnie — nie jest potrzebne do obliczenia"));
    therapyToggle.append(toggleText);
    const therapyFields = element(documentRef, "div", "tmp-gfr-therapy-fields");
    therapyFields.id = "tmpGfrTherapyFields";
    therapyFields.hidden = true;
    const timingLabel = element(documentRef, "label", "", "Ile dni od ostatniej dawki do pobrania?");
    timingLabel.htmlFor = "tmpDaysSinceDose";
    const daysRow = element(documentRef, "div", "tmp-gfr-value-row tmp-gfr-days-row");
    daysRow.append(element(documentRef, "span", "tmp-gfr-days-unit", "dni"));
    const timingHelp = element(documentRef, "p", "", "Czas pobrania zapiszemy przy wyniku, aby ułatwić kolejne porównania. Jeśli go nie znasz, pozostaw pole puste.");
    timingHelp.id = "tmpGfrTimingHelp";
    therapyFields.append(timingLabel, daysRow, timingHelp);
    therapy.append(therapyToggle, therapyFields);
    card.append(readiness, track, ageContext, ageFields, groups.urine, groups.serum, assumption, fact, therapy);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const layout = { document: documentRef, form, card, groups, count, track, fact, assumption, ageText, ageEdit, ageFields,
      therapyToggle, therapyFields, daysRow, moves: new Map(), names: new Map(), attributes: new Map(),
      rows: new Map(), optionLabels: new Map(), fieldViews: options.fieldViews };
    ageEdit.addEventListener("click", () => {
      ageFields.hidden = !ageFields.hidden;
      ageEdit.textContent = ageFields.hidden ? "Zmień" : "Gotowe";
      ageEdit.setAttribute("aria-expanded", String(!ageFields.hidden));
      if (!ageFields.hidden) layout.fieldViews.get("age")?.control.focus();
    });
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function pair(layout, valueId, unitId, title, group) {
    const value = layout.fieldViews.get(valueId);
    const unit = layout.fieldViews.get(unitId);
    if (!value || !unit) return;
    move(layout, value.wrapper, layout.groups[group], value.contextAnchor);
    value.wrapper.hidden = false;
    value.wrapper.classList.add("tmp-gfr-entry-field");
    const name = value.wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "tmp-gfr-value-row");
      value.control.parentNode.insertBefore(row, value.control);
      move(layout, value.control, row);
      layout.rows.set(valueId, row);
    }
    rememberAttributes(layout, value.control, ["inputmode"]);
    value.control.setAttribute("inputmode", "decimal");
    rememberAttributes(layout, unit.control, ["aria-labelledby", "aria-label"]);
    move(layout, unit.control, row);
    unit.control.removeAttribute("aria-labelledby");
    unit.control.setAttribute("aria-label", `Jednostka: ${title.toLocaleLowerCase("pl")}`);
    unit.wrapper.hidden = true;
    Array.from(unit.control.options || []).forEach(option => {
      if (!layout.optionLabels.has(option)) layout.optionLabels.set(option, option.textContent);
      if (option.value.toLowerCase() === "mg/dl") option.textContent = "mg/dL";
    });
  }

  function mountContext(layout) {
    ["age", "ageMonths"].forEach(id => {
      const view = layout.fieldViews.get(id);
      if (!view) return;
      move(layout, view.wrapper, layout.ageFields, view.contextAnchor);
      view.wrapper.hidden = false;
    });
    const monitoring = layout.document.getElementById("tmpBurosumab");
    if (monitoring) {
      move(layout, monitoring, layout.therapyToggle);
      layout.therapyToggle.insertBefore(monitoring, layout.therapyToggle.firstChild);
      rememberAttributes(layout, monitoring, ["aria-controls"]);
      monitoring.setAttribute("aria-controls", layout.therapyFields.id);
      const view = layout.fieldViews.get("tmpBurosumab");
      if (view) view.wrapper.hidden = true;
    }
    const days = layout.document.getElementById("tmpDaysSinceDose");
    if (days) {
      move(layout, days, layout.daysRow);
      layout.daysRow.insertBefore(days, layout.daysRow.firstChild);
      rememberAttributes(layout, days, ["aria-describedby", "inputmode"]);
      days.setAttribute("aria-describedby", "tmpGfrTimingHelp");
      days.setAttribute("inputmode", "numeric");
      const view = layout.fieldViews.get("tmpDaysSinceDose");
      if (view) view.wrapper.hidden = true;
    }
  }

  function restore(documentRef) {
    const layout = layouts.get(documentRef);
    if (!layout) return;
    Array.from(layout.moves.entries()).reverse().forEach(([node, { anchor, owned }]) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
      if (owned) anchor.remove();
    });
    layout.names.forEach((text, name) => { name.textContent = text; });
    layout.attributes.forEach((attributes, control) => Object.entries(attributes).forEach(([name, value]) => {
      if (value === null) control.removeAttribute(name); else control.setAttribute(name, value);
    }));
    layout.optionLabels.forEach((text, option) => { option.textContent = text; });
    layout.rows.forEach(row => row.remove());
    layout.fieldViews.forEach(view => view.wrapper.classList.remove("tmp-gfr-entry-field"));
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(documentRef);
    documentRef.documentElement.removeAttribute("data-clcr-tmp-gfr-active");
  }

  function sync(documentRef, options) {
    if (!options?.active) { restore(documentRef); return; }
    if (!options.fieldViews?.get) return;
    let layout = layouts.get(documentRef);
    if (!layout) {
      layout = createLayout(documentRef, options);
      if (!layout) return;
      layouts.set(documentRef, layout);
    }
    layout.fieldViews = options.fieldViews;
    documentRef.documentElement.dataset.clcrTmpGfrActive = "1";
    FIELDS.forEach(args => pair(layout, ...args));
    mountContext(layout);
    refreshLayout(layout);
  }

  function refresh(documentRef) {
    const layout = layouts.get(documentRef);
    if (layout) refreshLayout(layout);
  }

  function rangeText(reference) {
    if (!reference) return "";
    return reference.displayText || reference.text || `${numberText(reference.low ?? reference.lower)}–${numberText(reference.high ?? reference.upper)}`;
  }

  function referenceMarkup(model) {
    const reference = model.reference;
    const alternatives = Array.isArray(model.referenceAlternatives) ? model.referenceAlternatives : [];
    const available = !!reference && Number.isFinite(reference.low ?? reference.lower) && Number.isFinite(reference.high ?? reference.upper);
    const value = available ? rangeText(reference) : model.referenceText || "Brak normy do porównania";
    return `<div class="clcr-result-reference" data-clcr-reference-kind="${available ? "range" : "none"}"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Norma dla wieku")}</p><strong class="clcr-result-reference-value tmp-gfr-reference-value" data-no-reference="${!available}">${escape(value)}</strong>${available ? `<span class="tmp-gfr-reference-unit">${escape(reference.unit || model.display?.unit || model.unit)}</span>` : ""}${alternatives.length ? `<ul class="tmp-gfr-reference-alternatives">${alternatives.map(item => `<li>${escape(item.label || item.ageLabel)}: <strong>${escape(rangeText(item))} ${escape(item.unit || model.unit)}</strong></li>`).join("")}</ul>` : ""}</div>`;
  }

  function trpMarkup(model) {
    const result = model.trpResult || {};
    const shown = result.display?.text ?? numberText(model.trp * 100, 1);
    return `<section class="tmp-gfr-trp-row" aria-label="Pomocniczy wynik TRP"><div class="tmp-gfr-trp-main"><div><h4>TRP — reabsorpcja fosforanów</h4><strong class="tmp-gfr-trp-value">${escape(shown)}${escape(result.display?.unit || result.unit || "%")}</strong></div><div><p class="tmp-gfr-trp-reference-label">${escape(result.referenceLabel || "Zakres orientacyjny")}</p><strong class="tmp-gfr-trp-reference-value">${escape(result.referenceText || "")}</strong></div></div>${result.interpretation ? `<p class="tmp-gfr-trp-note">${escape(result.interpretation)}</p>` : ""}</section>`;
  }

  function serumMarkup(model) {
    const serum = model.serumPhosphate;
    if (!serum || !Number.isFinite(serum.value)) return "";
    const tone = ["danger", "warning", "success"].includes(serum.tone) ? serum.tone : "neutral";
    const reference = serum.reference;
    const range = reference ? `${rangeText(reference)} ${reference.unit || serum.unit}` : serum.referenceText || "Brak normy do porównania";
    const hint = serum.referenceHint || reference?.sourceLabel || "";
    return `<section class="tmp-gfr-serum-row" data-serum-tone="${tone}" aria-label="Fosforany we krwi"><h4>Fosforany we krwi</h4><p class="tmp-gfr-serum-result"><strong>${escape(serum.display?.text ?? numberText(serum.value))} ${escape(serum.display?.unit || serum.unit)}</strong>${serum.statusText ? ` · ${escape(serum.statusText)}` : ""}</p><p class="tmp-gfr-serum-reference">${escape(serum.referenceLabel || "Norma dla wieku")}: <strong>${escape(range)}</strong>${hint ? `<small>${escape(hint)}</small>` : ""}</p></section>`;
  }

  function dateText(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value.split("-").reverse().join(".") : String(value || "");
  }

  function treatmentMarkup(model) {
    const treatment = model.treatment || model.therapy;
    if (treatment?.enabled !== true) return "";
    const comparison = treatment.comparison;
    const pointMarkup = point => `<div><span>${escape(dateText(point?.date))}</span><strong>${escape(point?.display?.text ?? point?.display ?? numberText(point?.value))}</strong></div>`;
    const trend = treatment.comparisonAllowed === true && comparison?.previous && comparison?.current
      ? `<div class="tmp-gfr-trend-row">${pointMarkup(comparison.previous)}<span aria-hidden="true">→</span>${pointMarkup(comparison.current)}<span class="tmp-gfr-trend-unit">${escape(comparison.unit || model.unit)}</span></div>` : "";
    const previous = comparison?.previous;
    const previousSummary = !trend && previous
      ? `<p class="tmp-gfr-previous-summary">Poprzedni zapis: ${escape(previous.display?.text ?? previous.display ?? numberText(previous.value))} ${escape(comparison.unit || model.unit)}${previous.date ? ` · ${escape(dateText(previous.date))}` : ""}${Number.isFinite(previous.daysSinceDose) ? ` · ${escape(previous.daysSinceDose)} dni po dawce` : ""}</p>` : "";
    const limitations = Array.isArray(treatment.limitations) ? treatment.limitations.filter(item => typeof item === "string" && item) : [];
    const cautions = Array.isArray(treatment.cautions) ? treatment.cautions.filter(item => typeof item === "string" && item) : [];
    // The engine owns every clinical judgement. An alert changes only this
    // treatment section, never the TmP/GFR value or its neutral reference.
    const tone = treatment.tone === "danger" || treatment.alert === true ? "danger" : "neutral";
    return `<section class="tmp-gfr-therapy-summary" data-treatment-tone="${tone}" aria-label="Monitorowanie burosumabu w XLH"><h3>${escape(treatment.title || "Podczas leczenia burosumabem")}</h3>${trend}${previousSummary}${trend && comparison?.label ? `<p class="tmp-gfr-trend-label">${escape(comparison.label)}</p>` : ""}${treatment.trendMessage ? `<p class="tmp-gfr-trend-message">${escape(treatment.trendMessage)}</p>` : ""}${treatment.message ? `<p class="tmp-gfr-therapy-copy">${escape(treatment.message)}</p>` : ""}${cautions.map(text => `<p class="tmp-gfr-treatment-caution">${escape(text)}</p>`).join("")}${limitations.map(text => `<p class="tmp-gfr-treatment-note">${escape(text)}</p>`).join("")}</section>`;
  }

  function sourceMarkup(source) {
    if (!source) return "";
    const label = escape(source.label || source.title || "Źródło");
    return /^https:\/\//.test(source.url || "")
      ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>${source.locator ? `<small>${escape(source.locator)}</small>` : ""}` : label;
  }

  function renderDetails(model) {
    const notes = model.notes || {};
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const rows = Array.isArray(model.referenceRows) ? model.referenceRows : [];
    const groups = new Map();
    rows.forEach(row => {
      const method = row.methodLabel || row.method || "Zakresy źródłowe";
      if (!groups.has(method)) groups.set(method, []);
      groups.get(method).push(row);
    });
    // Tables for different formulae are separate: the GPN direct-method range
    // must not appear to be the reference for the adult Walton calculation.
    const table = Array.from(groups, ([method, group]) => `<table class="clcr-result-category-table" aria-label="${escape(`Zakresy TmP/GFR: ${method}`)}"><caption>${escape(method)}</caption><thead><tr><th>Wiek</th><th>TmP/GFR</th></tr></thead><tbody>${group.map(row => `<tr${row.selected ? ' aria-current="true"' : ""}><td>${escape(row.label || row.ageLabel)}${row.sourceLabel ? `<small>${escape(row.sourceLabel)}</small>` : ""}</td><td>${escape(rangeText(row))} ${escape(row.unit || model.unit)}</td></tr>`).join("")}</tbody></table>`).join("");
    const section = (title, text) => text ? `<h3>${escape(title)}</h3><p>${escape(text)}</p>` : "";
    return `<details class="clcr-result-details tmp-gfr-proposal-details" id="clcr-tmp-gfr-details" data-clcr-formula="TMP_GFR" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Wynik pomocniczy</h3><dl class="tmp-gfr-aux-results"><div><dt>FEPO₄ — frakcja wydalania fosforanów</dt><dd>${escape(model.fePo4Display?.text ?? numberText(model.fePo4 * 100, 1))}%</dd></div></dl>${notes.trp ? `<p>${escape(notes.trp)}</p>` : ""}${section("Metoda obliczenia", notes.method || model.methodLabel || model.method)}${section("Wzór i jednostki", notes.formula)}${notes.conversion ? `<p>${escape(notes.conversion)}</p>` : ""}<h3>Norma dla wieku</h3>${notes.reference ? `<p>${escape(notes.reference)}</p>` : ""}${table}${notes.serumReference ? `<p>${escape(notes.serumReference)}</p>` : ""}${section("Porównywanie podczas leczenia", notes.treatment)}${notes.timing ? `<p>${escape(notes.timing)}</p>` : ""}${section("Warunki pobrania", notes.sample)}${notes.renal ? `<p>${escape(notes.renal)}</p>` : ""}${sources.length ? `<h3>Źródła</h3><ul class="tmp-gfr-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/.test(model.errorCode);
      return `<div class="${missing ? "tmp-gfr-result-empty" : "tmp-gfr-result-error"}" data-clcr-formula="TMP_GFR"><strong>${missing ? "Tutaj pojawi się wynik TmP/GFR" : "Sprawdź dane TmP/GFR"}</strong><p>${escape(model.error || "Wpisz fosforany i kreatyninę w moczu oraz w surowicy. Wiek pobieramy z danych pacjenta.")}</p></div>`;
    }
    const shown = String(model.display?.text ?? numberText(model.rawValue));
    const unit = model.display?.unit || model.unit || "mmol/L";
    const tone = ["warning", "success", "danger"].includes(model.tone) ? model.tone : "neutral";
    const referenceActive = !!model.reference && model.status !== "unassessed";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    const source = model.reference ? [model.reference.sourceLabel, model.reference.ageLabel, model.reference.methodLabel].filter(Boolean).join(" · ") : "";
    return `<div class="result-box clcr-result-card tmp-gfr-proposal-card" data-clcr-formula="TMP_GFR" data-clcr-series="TMP_GFR" data-clcr-code="TMP_GFR" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="${escape(unit)}" data-clcr-display-label="TmP/GFR" data-clcr-status="${escape(model.interpretation)}" data-clcr-assessment="${escape(model.status || "unassessed")}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${referenceActive}" data-clcr-tmp-gfr-snapshot="${escape(JSON.stringify(model))}"><h3 class="tmp-gfr-result-status">${escape(model.statusText || "TmP/GFR")}</h3><div class="clcr-result-main tmp-gfr-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${shown.length > 5}" data-dense="${shown.length > 8}">${escape(shown)}</strong><span class="clcr-result-unit">${escape(unit)}</span></div>${referenceMarkup(model)}</div>${model.interpretation ? `<p class="tmp-gfr-result-copy">${escape(model.interpretation)}</p>` : ""}${source ? `<p class="tmp-gfr-reference-source">${escape(source)}</p>` : ""}${cautions.length ? `<p class="tmp-gfr-scope-tag">${cautions.map(escape).join(" · ")}</p>` : ""}${trpMarkup(model)}${serumMarkup(model)}${treatmentMarkup(model)}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
