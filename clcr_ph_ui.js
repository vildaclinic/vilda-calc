(function (root, factory) {
  const api = factory();
  if (root) root.ClcrPhUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const INPUT_ATTRIBUTES = ["type", "inputmode", "maxlength", "spellcheck", "placeholder", "aria-label", "aria-describedby", "aria-invalid"];

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function element(documentRef, tag, className, text) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function refreshLayout(layout) {
    const control = layout.document.getElementById("U_pH");
    const raw = control?.value?.trim() || "";
    const result = layout.document.defaultView?.VildaClcrPh?.compute({ urinePh: raw });
    const valid = result?.valid === true;
    const invalid = Boolean(raw && result && !valid);
    layout.count.textContent = valid ? "1/1" : "0/1";
    layout.readiness.dataset.complete = String(valid);
    layout.readyLabel.textContent = valid ? "✓ Dane kompletne" : invalid ? "Sprawdź wpisaną wartość" : "Wymagane dane";
    layout.error.hidden = !invalid;
    layout.error.textContent = invalid ? result.error || "Sprawdź zapis pH na wyniku badania." : "";
    control?.setAttribute("aria-invalid", String(invalid));
  }

  function createLayout(documentRef, options) {
    const form = documentRef.getElementById("clcrForm");
    const view = options.fieldViews?.get("U_pH");
    if (!form || !view?.wrapper?.parentNode || !view.control) return null;
    const card = element(documentRef, "section", "ph-input-card");
    card.id = "phInputCard";
    card.setAttribute("aria-label", "Dane do oceny pH moczu");
    const field = element(documentRef, "div", "ph-input-field");
    const hint = element(documentRef, "p", "ph-field-hint", "Wpisz zmierzone pH. Nie wymaga przeliczania jednostek.");
    hint.id = "phInputHelp";
    const error = element(documentRef, "p", "ph-field-error");
    error.id = "phInputError";
    error.hidden = true;
    const readiness = element(documentRef, "p", "ph-readiness");
    readiness.setAttribute("aria-live", "polite");
    const readyLabel = element(documentRef, "span", "", "Wymagane dane");
    const count = element(documentRef, "strong", "", "0/1");
    count.id = "phRequiredCount";
    readiness.append(readyLabel, count);
    card.append(field, hint, error, readiness);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const anchor = documentRef.createComment("ph-field-origin");
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    field.append(view.wrapper);
    view.wrapper.classList.add("ph-entry-field");
    view.wrapper.hidden = false;
    const name = view.wrapper.querySelector(".clcr-field__name");
    const previousName = name?.textContent;
    if (name) name.textContent = "pH z wyniku badania";
    const attributes = Object.fromEntries(INPUT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    view.control.setAttribute("type", "text");
    view.control.setAttribute("inputmode", "decimal");
    view.control.setAttribute("maxlength", "64");
    view.control.setAttribute("spellcheck", "false");
    view.control.setAttribute("placeholder", "np. 6,5");
    view.control.setAttribute("aria-label", "pH z wyniku badania");
    const descriptionIds = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
    descriptionIds.add(hint.id);
    descriptionIds.add(error.id);
    view.control.setAttribute("aria-describedby", Array.from(descriptionIds).join(" "));
    const layout = { document: documentRef, form, card, view, anchor, name, previousName, attributes, readiness, readyLabel, count, error };
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function restore(documentRef) {
    const layout = layouts.get(documentRef);
    if (!layout) return;
    if (layout.anchor.parentNode) layout.anchor.parentNode.insertBefore(layout.view.wrapper, layout.anchor.nextSibling);
    layout.anchor.remove();
    layout.view.wrapper.classList.remove("ph-entry-field");
    if (layout.name) layout.name.textContent = layout.previousName;
    Object.entries(layout.attributes).forEach(([key, value]) => {
      if (value === null) layout.view.control.removeAttribute(key);
      else layout.view.control.setAttribute(key, value);
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(documentRef);
    documentRef.documentElement.removeAttribute("data-clcr-ph-active");
  }

  function sync(documentRef, options) {
    if (!options?.active) { restore(documentRef); return; }
    let layout = layouts.get(documentRef);
    if (!layout) {
      layout = createLayout(documentRef, options);
      if (!layout) return;
      layouts.set(documentRef, layout);
    }
    layout.view.wrapper.hidden = false;
    documentRef.documentElement.dataset.clcrPhActive = "1";
    refreshLayout(layout);
  }

  function refresh(documentRef) {
    const layout = layouts.get(documentRef);
    if (layout) refreshLayout(layout);
  }

  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło");
    const link = /^https:\/\//.test(source.url || "")
      ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    const extraLink = source.additionalLabel && /^https:\/\//.test(source.additionalUrl || "")
      ? `<small><a href="${escape(source.additionalUrl)}" target="_blank" rel="noopener noreferrer">${escape(source.additionalLabel)}</a></small>` : "";
    return `${link}${source.locator ? `<small>${escape(source.locator)}</small>` : ""}${extraLink}`;
  }

  function paragraph(text) {
    return text ? `<p>${escape(text)}</p>` : "";
  }

  function renderDetails(model) {
    const notes = model.notes || {};
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const rows = Array.isArray(model.educationalReferences) ? model.educationalReferences : [];
    if (!Object.keys(notes).length && !sources.length && !rows.length) return "";
    const table = rows.length ? `<table class="clcr-result-category-table" aria-label="Cele leczenia w wybranych sytuacjach klinicznych, nie zakresy normy"><thead><tr><th>Sytuacja</th><th>Cel pH</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.label)}</td><td>${escape(row.targetText || row.text)}</td></tr>`).join("")}</tbody></table>` : "";
    const sourceList = sources.length ? `<h3>Źródła</h3><ul class="ph-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : "";
    return `<details class="clcr-result-details ph-proposal-details" id="clcr-ph-details" data-clcr-formula="pH_spot" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Co oznacza norma ogólna?</h3>${paragraph(notes.scope)}${paragraph(notes.labVariation)}<h3>Kwaśny nie znaczy nieprawidłowy</h3>${paragraph(notes.acidic)}<h3>Próbka i pomiar</h3>${paragraph(notes.sample)}${paragraph(notes.measurement)}${paragraph(notes.limitations)}<h3>Cele leczenia różnią się od normy</h3>${paragraph(notes.therapy)}${table}${paragraph(notes.therapyCaution)}${sourceList}</details>`;
  }

  function intervalAvailable(model) {
    const reference = model.reference;
    return model.referenceAvailable === true && model.referenceActive === true && reference?.kind === "interval"
      && Number.isFinite(reference.lower) && Number.isFinite(reference.upper) && reference.upper > reference.lower;
  }

  function referenceMarkup(model) {
    const available = intervalAvailable(model);
    return `<div class="clcr-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${available ? "interval" : "none"}"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Norma ogólna")}</p><strong class="clcr-result-reference-value ph-reference-value">${escape(model.referenceText || "Brak normy do porównania")}</strong>${model.referenceHint ? `<p class="ph-reference-hint">${escape(model.referenceHint)}</p>` : ""}</div>`;
  }

  function renderRange(model, shown) {
    if (!intervalAvailable(model)) return "";
    const lower = model.reference.lower;
    const upper = model.reference.upper;
    const padding = Math.max((upper - lower) / 7, 0.5);
    const start = Math.min(lower - padding, Math.floor(model.rawValue) - padding);
    const end = Math.max(upper + padding * 2, Math.ceil(model.rawValue) + padding);
    const position = value => 100 * (value - start) / (end - start);
    const lowerText = lower.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 16 });
    const upperText = upper.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 16 });
    const markerLabel = shown.length > 8 ? "Wynik" : `Wynik ${shown}`;
    const inclusive = model.reference.lowerInclusive && model.reference.upperInclusive ? " włącznie" : "";
    const lowerPosition = `${position(lower)}%`;
    const upperPosition = `${position(upper)}%`;
    const resultPosition = `${position(model.rawValue)}%`;
    const labelPosition = `${Math.max(12, Math.min(88, position(model.rawValue)))}%`;
    return `<div class="ph-range-visual" role="img" aria-label="${escape(`Norma ogólna ${model.referenceText}${inclusive}; wynik ${shown}`)}"><svg class="ph-range-graphic" width="100%" height="63" aria-hidden="true" focusable="false"><text class="ph-range-marker-label" x="${labelPosition}" y="19">${escape(markerLabel)}</text><rect class="ph-range-track" x="0" y="26" width="100%" height="12" rx="6"></rect><rect class="ph-range-normal" x="${lowerPosition}" y="26" width="${position(upper) - position(lower)}%" height="12"></rect><line class="ph-range-boundary" x1="${lowerPosition}" x2="${lowerPosition}" y1="26" y2="38"></line><line class="ph-range-boundary" x1="${upperPosition}" x2="${upperPosition}" y1="26" y2="38"></line><line class="ph-range-marker" x1="${resultPosition}" x2="${resultPosition}" y1="24.5" y2="39.5"></line><text class="ph-range-label" x="${lowerPosition}" y="55">${escape(lowerText)}</text><text class="ph-range-label" x="${upperPosition}" y="55">${escape(upperText)}</text></svg><p class="ph-range-caption" aria-hidden="true">Zaznaczony zakres = norma ogólna</p></div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/i.test(model.errorCode);
      return `<div class="${missing ? "ph-result-empty" : "ph-result-error"}" data-clcr-formula="pH_spot"><strong>${missing ? "Wpisz pH moczu" : "Sprawdź pH"}</strong><p>${escape(missing ? "Tutaj zobaczysz wynik, normę ogólną i krótki komentarz." : model.error || "Popraw wartość w formularzu. Wynik nie został oceniony.")}</p></div>${renderDetails(model)}`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    return `<div class="result-box clcr-result-card ph-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="pH_spot" data-clcr-series="pH_spot" data-clcr-code="ph-urine" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="" data-clcr-display-label="pH moczu" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${intervalAvailable(model)}" data-clcr-ph-snapshot="${escape(JSON.stringify(model))}"><h3 class="ph-result-status">${escape(model.statusText || "pH moczu")}</h3><div class="clcr-result-main ph-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${shown.length > 6}" data-dense="${shown.length > 9}">${escape(shown)}</strong></div>${referenceMarkup(model)}</div>${renderRange(model, shown)}${paragraph(model.interpretation).replace("<p>", '<p class="ph-result-copy">')}${cautions.map(note => `<p class="ph-result-caution">${escape(note)}</p>`).join("")}${model.notes?.sourceSummary ? `<p class="ph-reference-source">${escape(model.notes.sourceSummary)}</p>` : ""}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
