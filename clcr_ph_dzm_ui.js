(function (root, factory) {
  const api = factory();
  if (root) root.ClcrPhDzmUi = api;
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
    const control = layout.document.getElementById("pH24");
    const raw = control?.value?.trim() || "";
    const result = layout.document.defaultView?.VildaClcrPhDzm?.compute({ urinePh: raw });
    const valid = result?.valid === true;
    const invalid = Boolean(raw && result && !valid);
    layout.count.textContent = valid ? "1/1" : "0/1";
    layout.readiness.dataset.complete = String(valid);
    layout.readyLabel.textContent = "Wymagane dane";
    layout.error.hidden = !invalid;
    layout.error.textContent = invalid ? result.error || "Sprawdź zapis pH na wyniku badania." : "";
    control?.setAttribute("aria-invalid", String(invalid));
  }

  function createLayout(documentRef, options) {
    const form = documentRef.getElementById("clcrForm");
    const view = options.fieldViews?.get("pH24");
    if (!form || !view?.wrapper?.parentNode || !view.control) return null;
    const card = element(documentRef, "section", "ph-dzm-input-card");
    card.id = "phDzmInputCard";
    card.setAttribute("aria-label", "Dane do oceny pH DZM");
    const field = element(documentRef, "div", "ph-dzm-input-field");
    const hint = element(documentRef, "p", "ph-dzm-field-hint", "pH nie ma jednostki. Nie wpisuj średniej z pomiarów w ciągu dnia.");
    hint.id = "phDzmInputHelp";
    const error = element(documentRef, "p", "ph-dzm-field-error");
    error.id = "phDzmInputError";
    error.hidden = true;
    const readiness = element(documentRef, "p", "ph-dzm-readiness");
    readiness.setAttribute("aria-live", "polite");
    const readyLabel = element(documentRef, "span", "", "Wymagane dane");
    const count = element(documentRef, "strong", "", "0/1");
    count.id = "phDzmRequiredCount";
    readiness.append(readyLabel, count);
    const sampleHint = element(documentRef, "p", "ph-dzm-field-hint", "pH oznacza się przed zakwaszeniem lub alkalizacją próbki do innych badań.");
    card.append(field, hint, sampleHint, error, readiness);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const anchor = documentRef.createComment("ph-dzm-field-origin");
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    field.append(view.wrapper);
    view.wrapper.classList.add("ph-dzm-entry-field");
    view.wrapper.hidden = false;
    const name = view.wrapper.querySelector(".clcr-field__name");
    const previousName = name?.textContent;
    if (name) name.textContent = "pH w DZM";
    const attributes = Object.fromEntries(INPUT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    view.control.setAttribute("type", "text");
    view.control.setAttribute("inputmode", "decimal");
    view.control.setAttribute("maxlength", "64");
    view.control.setAttribute("spellcheck", "false");
    view.control.setAttribute("placeholder", "np. 5,2");
    view.control.setAttribute("aria-label", "pH w DZM");
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
    layout.view.wrapper.classList.remove("ph-dzm-entry-field");
    if (layout.name) layout.name.textContent = layout.previousName;
    Object.entries(layout.attributes).forEach(([key, value]) => {
      if (value === null) layout.view.control.removeAttribute(key);
      else layout.view.control.setAttribute(key, value);
    });
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(documentRef);
    documentRef.documentElement.removeAttribute("data-clcr-ph-dzm-active");
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
    documentRef.documentElement.dataset.clcrPhDzmActive = "1";
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
    const table = rows.length ? `<table class="clcr-result-category-table" aria-label="Informacje pomocnicze w ocenie kamicy, odrębne od normy ogólnej"><thead><tr><th>Sytuacja</th><th>Znaczenie pH</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.label)}</td><td>${escape(row.targetText || row.text)}</td></tr>`).join("")}</tbody></table>` : "";
    const sourceList = sources.length ? `<h3>Źródła</h3><ul class="ph-dzm-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : "";
    return `<details class="clcr-result-details ph-dzm-proposal-details" id="clcr-ph-dzm-details" data-clcr-formula="pH24" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Co oznacza norma ogólna?</h3>${paragraph(notes.scope)}${paragraph(notes.labVariation)}<h3>pH a ocena kamicy</h3>${paragraph(notes.acidic)}${paragraph(notes.stoneRisk)}${paragraph(notes.rta)}<h3>Odczyt i warunki oznaczenia</h3>${model.valid && Number.isFinite(model.rawValue) ? `<p>pH wpisane z raportu: ${escape(model.input?.urinePh ?? model.rawValue)}.</p>` : ""}${paragraph(notes.sample)}${paragraph(notes.measurement)}${paragraph(notes.limitations)}<h3>Monitorowanie alkalizacji</h3>${paragraph(notes.therapy)}${table}${paragraph(notes.therapyCaution)}${sourceList}</details>`;
  }

  function intervalAvailable(model) {
    const reference = model.reference;
    return model.referenceAvailable === true && model.referenceActive === true && reference?.kind === "interval"
      && Number.isFinite(reference.lower) && Number.isFinite(reference.upper) && reference.upper > reference.lower;
  }

  function referenceMarkup(model) {
    const available = intervalAvailable(model);
    return `<div class="clcr-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference-kind="${available ? "interval" : "none"}"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Norma ogólna")}</p><strong class="clcr-result-reference-value ph-dzm-reference-value">${escape(model.referenceText || "Brak normy do porównania")}</strong></div>`;
  }

  function renderRange(model, shown) {
    if (!intervalAvailable(model)) return "";
    const lower = model.reference.lower;
    const upper = model.reference.upper;
    // These endpoints are visual geometry, not another reference interval.
    // The comparison itself always uses the frozen interval supplied by the model.
    const padding = Math.max((upper - lower) / 7, 0.5);
    const start = Math.min(3, lower - padding);
    const end = Math.max(9, upper + padding);
    const rawPosition = value => 100 * (value - start) / (end - start);
    const position = value => Math.max(0, Math.min(100, rawPosition(value)));
    const lowerText = lower.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 16 });
    const upperText = upper.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 16 });
    const markerLabel = "Wynik";
    const inclusive = model.reference.lowerInclusive && model.reference.upperInclusive ? " włącznie" : "";
    const clipped = model.rawValue < start || model.rawValue > end;
    const lowerPosition = `${position(lower)}%`;
    const upperPosition = `${position(upper)}%`;
    const resultPosition = `${position(model.rawValue)}%`;
    const labelPosition = `${Math.max(12, Math.min(88, position(model.rawValue)))}%`;
    return `<div class="ph-dzm-range-visual" role="img" aria-label="${escape(`Norma ogólna ${model.referenceText}${inclusive}; wynik ${shown}${clipped ? "; wynik poza zakresem osi" : ""}`)}"><svg class="ph-dzm-range-graphic" width="100%" height="63" aria-hidden="true" focusable="false"><text class="ph-dzm-range-marker-label" x="${labelPosition}" y="19">${escape(markerLabel)}</text><rect class="ph-dzm-range-track" x="0" y="26" width="100%" height="12" rx="6"></rect><rect class="ph-dzm-range-normal" x="${lowerPosition}" y="26" width="${position(upper) - position(lower)}%" height="12"></rect><line class="ph-dzm-range-boundary" x1="${lowerPosition}" x2="${lowerPosition}" y1="26" y2="38"></line><line class="ph-dzm-range-boundary" x1="${upperPosition}" x2="${upperPosition}" y1="26" y2="38"></line><line class="ph-dzm-range-marker" x1="${resultPosition}" x2="${resultPosition}" y1="24.5" y2="39.5"></line><text class="ph-dzm-range-end" x="0" y="55" text-anchor="start">${escape(String(start).replace(".", ","))}</text><text class="ph-dzm-range-end" x="100%" y="55" text-anchor="end">${escape(String(end).replace(".", ","))}</text><text class="ph-dzm-range-label" x="${lowerPosition}" y="55">${escape(lowerText)}</text><text class="ph-dzm-range-label" x="${upperPosition}" y="55">${escape(upperText)}</text></svg><p class="ph-dzm-range-caption">Zaznaczony przedział: norma ogólna. Nie jest celem leczenia kamicy.${clipped ? ` Wynik poza zakresem osi (${escape(String(start).replace(".", ","))}–${escape(String(end).replace(".", ","))}).` : ""}</p></div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/i.test(model.errorCode);
      return `<div class="${missing ? "ph-dzm-result-empty" : "ph-dzm-result-error"}" data-clcr-formula="pH24"><strong>${missing ? "Wpisz pH DZM" : "Sprawdź pH"}</strong><p>${escape(missing ? "Tutaj zobaczysz wynik, normę ogólną i krótki komentarz." : model.error || "Popraw wartość w formularzu. Wynik nie został oceniony.")}</p></div>${renderDetails(model)}`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const tone = ["normal", "warning"].includes(model.tone) ? model.tone : "neutral";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    return `<div class="result-box clcr-result-card ph-dzm-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="pH24" data-clcr-series="pH24" data-clcr-code="ph-dzm-urine" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="" data-clcr-display-label="pH DZM" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${intervalAvailable(model)}" data-clcr-ph-dzm-snapshot="${escape(JSON.stringify(model))}"><h3 class="ph-dzm-result-status">${escape(model.statusText || "pH DZM")}</h3><div class="clcr-result-main ph-dzm-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-long="${shown.length > 5}" data-dense="${shown.length > 8}">${escape(shown)}</strong></div>${referenceMarkup(model)}</div>${paragraph(model.interpretation).replace("<p>", '<p class="ph-dzm-result-copy">')}${cautions.map(note => `<p class="ph-dzm-result-caution">${escape(note)}</p>`).join("")}${renderRange(model, shown)}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
