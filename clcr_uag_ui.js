(function (root, factory) {
  const api = factory();
  if (root) root.ClcrUagUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const VALUE_FIELDS = ["U_Na_spot", "U_K_spot", "U_Cl_spot"];
  const TITLES = ["Sód w moczu", "Potas w moczu", "Chlorki w moczu"];

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

  function move(layout, node, target) {
    if (!node || !target || node.parentNode === target) return;
    if (!layout.moves.has(node)) {
      const anchor = layout.document.createComment("uag-field-origin");
      node.parentNode.insertBefore(anchor, node);
      layout.moves.set(node, anchor);
    }
    target.appendChild(node);
  }

  function refreshLayout(layout) {
    const engine = layout.document.defaultView?.VildaClcrUag;
    const input = engine?.readInputFromDocument(layout.document) || {};
    const filled = VALUE_FIELDS.filter(id => {
      const raw = layout.document.getElementById(id)?.value?.trim();
      if (!raw) return false;
      return engine?.compute({ urineSodium: raw, urinePotassium: "0", urineChloride: "0" })?.valid === true;
    }).length;
    layout.count.textContent = `${filled}/3`;
    layout.track.dataset.filled = String(filled);
    layout.track.setAttribute("aria-valuenow", String(filled));
    const mismatch = [false, "no", "different", "different-urine"].includes(input.sameUrineSpecimen);
    layout.fact.hidden = !mismatch;
    layout.fact.textContent = mismatch
      ? "Zapisano oznaczenia z różnych próbek moczu. Wpisane wartości pozostają w formularzu. Aby wprowadzić nową próbkę, użyj przycisku „Wyczyść wszystkie pola”." : "";
  }

  function createLayout(documentRef, options) {
    const form = documentRef.getElementById("clcrForm");
    if (!form) return null;
    const card = element(documentRef, "section", "uag-input-card");
    card.id = "uagInputCard";
    card.setAttribute("aria-label", "Dane do UAG");
    const readiness = element(documentRef, "div", "uag-readiness");
    const count = element(documentRef, "strong");
    count.id = "uagRequiredCount";
    readiness.append(element(documentRef, "span", "", "Wymagane dane"), count);
    const track = element(documentRef, "div", "uag-progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Uzupełnione stężenia do UAG");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "3");
    const progress = element(documentRef, "span");
    progress.id = "uagProgressBar";
    track.append(progress);
    const group = element(documentRef, "section", "uag-sample-group");
    group.id = "uagUrineFields";
    const heading = element(documentRef, "h3", "", "Mocz");
    heading.id = "uagUrineFieldsHeading";
    group.setAttribute("aria-labelledby", heading.id);
    group.append(heading);
    const assumption = element(documentRef, "p", "uag-assumption", "Zakładamy, że sód, potas i chlorki pochodzą z tej samej próbki moczu.");
    const fact = element(documentRef, "p", "uag-known-sample-fact");
    fact.hidden = true;
    card.append(readiness, track, group, assumption, fact);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const layout = { document: documentRef, form, card, group, count, track, fact,
      moves: new Map(), names: new Map(), attributes: new Map(), rows: new Map(), fieldViews: options.fieldViews };
    layout.onEdit = () => refreshLayout(layout);
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }

  function pair(layout, id, title) {
    const view = layout.fieldViews.get(id);
    if (!view) return;
    move(layout, view.wrapper, layout.group);
    view.wrapper.hidden = false;
    view.wrapper.classList.add("uag-entry-field");
    const name = view.wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    if (!layout.rows.has(id)) {
      const row = element(layout.document, "div", "uag-value-row");
      view.control.parentNode.insertBefore(row, view.control);
      move(layout, view.control, row);
      const unit = element(layout.document, "span", "uag-fixed-unit", "mmol/L");
      unit.setAttribute("aria-hidden", "true");
      row.append(unit);
      layout.rows.set(id, row);
      layout.attributes.set(view.control, { inputmode: view.control.getAttribute("inputmode"), "aria-label": view.control.getAttribute("aria-label") });
    }
    view.control.setAttribute("inputmode", "decimal");
    view.control.setAttribute("aria-label", `${title} (mmol/L)`);
  }

  function restore(documentRef) {
    const layout = layouts.get(documentRef);
    if (!layout) return;
    Array.from(layout.moves.entries()).reverse().forEach(([node, anchor]) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
      anchor.remove();
    });
    layout.names.forEach((text, name) => { name.textContent = text; });
    layout.attributes.forEach((attributes, control) => Object.entries(attributes).forEach(([name, value]) => {
      if (value === null) control.removeAttribute(name); else control.setAttribute(name, value);
    }));
    layout.rows.forEach(row => row.remove());
    layout.fieldViews.forEach(view => view.wrapper.classList.remove("uag-entry-field"));
    layout.card.remove();
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layouts.delete(documentRef);
    documentRef.documentElement.removeAttribute("data-clcr-uag-active");
  }

  function sync(documentRef, options) {
    if (!options?.active) { restore(documentRef); return; }
    let layout = layouts.get(documentRef);
    if (!layout) {
      layout = createLayout(documentRef, options);
      if (!layout) return;
      layouts.set(documentRef, layout);
    }
    layout.fieldViews = options.fieldViews;
    documentRef.documentElement.dataset.clcrUagActive = "1";
    VALUE_FIELDS.forEach((id, index) => pair(layout, id, TITLES[index]));
    refreshLayout(layout);
  }

  function refresh(documentRef) {
    const layout = layouts.get(documentRef);
    if (layout) refreshLayout(layout);
  }

  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło");
    return /^https:\/\//.test(source.url || "")
      ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>${source.locator ? `<small>${escape(source.locator)}</small>` : ""}` : label;
  }

  function renderDetails(model) {
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const notes = model.notes || {};
    const rows = Array.isArray(model.educationalReferences) ? model.educationalReferences : [];
    const sourcesMarkup = sources.length ? `<ul class="uag-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : "";
    const table = rows.length ? `<table class="clcr-result-category-table" aria-label="Znaczenie znaku UAG, nie zakresy normy"><thead><tr><th>UAG</th><th>Warunkowe znaczenie</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.label)}</td><td>${escape(row.text)}</td></tr>`).join("")}</tbody></table>` : "";
    return `<details class="clcr-result-details uag-proposal-details" id="clcr-uag-details" data-clcr-formula="AGu_spot" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Co oznacza znak UAG?</h3><p>${escape(notes.diagnosticContext || "Sam UAG nie określa, czy występuje kwasica metaboliczna.")} ${escape(notes.respiratoryAlkalosis || "")}</p>${table}<h3>Norma dla wieku</h3><p>${escape(notes.scope || "Nie dobrano przedziału referencyjnego UAG według wieku. Zero jest granicą znaku, nie granicą normy.")}</p><h3>Ograniczenia interpretacji</h3><p>${escape(notes.directMeasurement || "")} ${escape(notes.disagreement || "")}</p><p>${escape(notes.confounders || "")}</p><p>${escape(notes.neonates || "")}</p><p>${escape(notes.measurementUncertainty || "")}</p><h3>Wzór i próbka</h3><p class="uag-formula">UAG = U<sub>Na</sub> + U<sub>K</sub> − U<sub>Cl</sub>.</p><p>${escape(notes.conversion || "Wszystkie trzy stężenia podaj w mmol/L.")} Stężenia nie mogą być ujemne; zero jest dopuszczalne.</p><p>${escape(notes.sample || "Przyjmujemy tę samą próbkę moczu, o ile nie zapisano informacji o różnych próbkach.")} Znana niezgodność blokuje obliczenie i nie usuwa wpisanych wartości.</p>${sourcesMarkup}</details>`;
  }

  function referenceMarkup(model) {
    const boundary = model.referenceAvailable === true && model.reference?.kind === "sign-boundary";
    const value = boundary ? `${escape(model.reference.value)} <small>${escape(model.reference.unit)}</small>` : escape(model.referenceText || "Brak profilu porównania");
    return `<div class="clcr-result-reference" data-clcr-reference-kind="${boundary ? "sign-boundary" : "none"}"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Punkt odniesienia")}</p><strong class="clcr-result-reference-value uag-reference-value">${value}</strong><p class="uag-reference-hint">${escape(model.referenceHint || "")}</p></div>`;
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = !model.errorCode || /^missing-/i.test(model.errorCode);
      return `<div class="${missing ? "uag-result-empty" : "uag-result-error"}" data-clcr-formula="AGu_spot"><strong>${missing ? "Wpisz trzy stężenia z moczu" : "Sprawdź dane UAG"}</strong><p>${escape(model.error || "Wynik pojawi się tutaj po uzupełnieniu sodu, potasu i chlorków.")}</p></div>`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const cautions = Array.isArray(model.cautions) ? model.cautions.filter(value => typeof value === "string" && value) : [];
    return `<div class="result-box clcr-result-card uag-proposal-card" data-clcr-formula="AGu_spot" data-clcr-series="AGu_spot" data-clcr-code="uag" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="mmol/L" data-clcr-display-label="Luka anionowa moczu — UAG" data-clcr-status="${escape(model.interpretation)}" data-clcr-assessment="unassessed" data-clcr-tone="neutral" data-clcr-reference-comparison="false" data-clcr-uag-snapshot="${escape(JSON.stringify(model))}"><h3 class="uag-result-status">${escape(model.statusText || "Luka anionowa moczu")}</h3><div class="clcr-result-main uag-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik UAG</p><strong class="clcr-result-value" data-long="${shown.length > 6}" data-dense="${shown.length > 9}">${escape(shown)}</strong><span class="clcr-result-unit">mmol/L</span></div>${referenceMarkup(model)}</div><p class="uag-result-copy">${escape(model.interpretation)}</p>${cautions.length ? `<p class="uag-scope-tag">${cautions.map(escape).join(" · ")}</p>` : ""}</div>${renderDetails(model)}`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
