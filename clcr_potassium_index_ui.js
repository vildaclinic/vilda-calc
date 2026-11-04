/* Two urine concentrations and one neutral potassium-index result. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.ClcrPotassiumIndexUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const layouts = new WeakMap(), controlStates = new WeakMap();
  const FIELDS = Object.freeze([["U_K", "Potas w moczu", "np. 60"], ["U_Na", "Sód w moczu", "np. 20"]]);
  const ATTRIBUTES = ["type", "inputmode", "min", "max", "step", "placeholder", "aria-describedby", "aria-invalid"];
  const escape = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  // Prepare before restoring a captured raw value: number inputs otherwise erase
  // decimal commas and invalid evidence that the clinician needs to correct.
  function prepareControls(doc) {
    if (!doc) return;
    let states = controlStates.get(doc);
    if (!states) { states = new Map(); controlStates.set(doc, states); }
    FIELDS.forEach(([id, , placeholder]) => {
      const control = doc.getElementById(id); if (!control) return;
      if (!states.has(id)) states.set(id, { control, attributes: Object.fromEntries(ATTRIBUTES.map(key => [key, control.getAttribute(key)])) });
      control.type = "text"; control.setAttribute("type", "text"); control.setAttribute("inputmode", "decimal");
      ["min", "max", "step"].forEach(key => control.removeAttribute(key));
      control.setAttribute("placeholder", placeholder);
    });
  }
  function restoreControls(doc) {
    const states = controlStates.get(doc); if (!states) return;
    for (const [id, saved] of states) {
      const raw = String(saved.control.value ?? "");
      const numberCompatible = raw === "" || /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) && Number.isFinite(Number(raw));
      Object.entries(saved.attributes).forEach(([key, value]) => {
        if ((key === "type" || key === "inputmode") && saved.attributes.type === "number" && !numberCompatible) return;
        if (value === null) saved.control.removeAttribute(key); else saved.control.setAttribute(key, value);
        if (key === "type" && value) saved.control.type = value;
      });
      if (saved.attributes.type !== "number" || numberCompatible) states.delete(id);
    }
    if (!states.size) controlStates.delete(doc);
  }
  function refreshLayout(layout) {
    const doc = layout.document, engine = doc.defaultView?.VildaClcrPotassiumIndex || root.VildaClcrPotassiumIndex;
    const context = (doc.defaultView?.ClcrPotassiumIndexSession || root.ClcrPotassiumIndexSession)?.readContext?.() || {};
    const input = engine?.readInputFromDocument?.(doc, { context });
    const completion = engine?.readiness?.(input);
    layout.readiness.hidden = !completion;
    if (completion) {
      layout.count.textContent = `${completion.count}/${completion.total}`;
      layout.readiness.dataset.complete = String(completion.count === completion.total);
    }
    layout.moves.forEach(({ view }) => {
      view.wrapper.hidden = false;
      const previous = String(view.control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      view.control.setAttribute("aria-describedby", [...new Set([...previous, "kfrUnitHelp"])].join(" "));
    });
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm"); if (!form) return null;
    prepareControls(doc);
    const card = element(doc, "section", "kfr-input-card"); card.id = "kfrInputCard"; card.setAttribute("aria-label", "Dane do K/(K+Na) w moczu");
    const layout = { document: doc, form, options, card, moves: [] };
    card.append(element(doc, "p", "kfr-input-intro", "Dwa stężenia z tej samej próbki moczu."));
    FIELDS.forEach(([id, label]) => {
      const control = doc.getElementById(id);
      const view = options.fieldViews?.get(id) || (control ? { control, wrapper: control.closest("label") } : null);
      if (!view?.wrapper?.parentNode) return;
      const anchor = doc.createComment(`kfr-field-origin-${id}`);
      view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
      const name = view.wrapper.querySelector(".clcr-field__name");
      layout.moves.push({ view, anchor, hidden: view.wrapper.hidden, labelText: view.labelText, name, nameText: name?.textContent });
      view.wrapper.classList.add("kfr-entry-field"); view.wrapper.hidden = false;
      view.labelText = label; if (name) name.textContent = label;
      const row = element(doc, "div", "kfr-value-row"); row.append(view.wrapper, element(doc, "span", "kfr-fixed-unit", "mmol/L")); card.append(row);
    });
    const units = element(doc, "p", "kfr-field-hint", "Dla potasu i sodu wartości w mEq/L są takie same jak w mmol/L."); units.id = "kfrUnitHelp";
    const assumption = element(doc, "p", "kfr-assumption", "Zbiórka dobowa nie jest wymagana.");
    layout.readiness = element(doc, "p", "kfr-readiness"); layout.readiness.setAttribute("aria-live", "polite");
    layout.count = element(doc, "strong", "", "0/2"); layout.count.id = "kfrRequiredCount";
    layout.readiness.append(element(doc, "span", "", "Wymagane dane"), layout.count);
    card.append(units, assumption, layout.readiness);
    const clear = doc.getElementById("clearContainer"); if (clear?.parentNode === form) form.insertBefore(card, clear); else form.append(card);
    layout.onEdit = event => { if (FIELDS.some(([id]) => event.target?.id === id)) refreshLayout(layout); };
    form.addEventListener("input", layout.onEdit); form.addEventListener("change", layout.onEdit);
    refreshLayout(layout); return layout;
  }
  function restore(doc) {
    const layout = layouts.get(doc);
    if (layout) {
      [...layout.moves].reverse().forEach(({ view, anchor, hidden, labelText, name, nameText }) => {
        if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
        anchor.remove(); view.wrapper.classList.remove("kfr-entry-field"); view.wrapper.hidden = hidden;
        view.labelText = labelText; if (name) name.textContent = nameText;
      });
      layout.card.remove(); layout.form.removeEventListener("input", layout.onEdit); layout.form.removeEventListener("change", layout.onEdit); layouts.delete(doc);
    }
    restoreControls(doc); doc?.documentElement?.removeAttribute("data-clcr-kfr-active");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) { layout = createLayout(doc, options); if (!layout) return; layouts.set(doc, layout); }
    layout.options = options; doc.documentElement.dataset.clcrKfrActive = "1"; refreshLayout(layout);
  }
  function refresh(doc) { const layout = layouts.get(doc); if (layout) refreshLayout(layout); }
  function valueMarkup(shown) {
    const scientific = /^(≈?\d+(?:[.,]\d+)?)[eE]([+-]?\d+)$/.exec(shown);
    return scientific ? `<span class="kfr-scientific-mantissa">${escape(scientific[1])}</span><span class="kfr-scientific-power">× 10<sup>${escape(scientific[2].replace(/^\+/, ""))}</sup></span>` : escape(shown);
  }
  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło");
    return /^https:\/\//.test(source.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  }
  function detailsMarkup(model) {
    const input = model.input || model.snapshot?.input || {}, context = model.context || model.snapshot?.context || {};
    const full = model.display?.fullValueText || String(model.rawValue).replace(".", ",");
    const exact = model.display?.fullValueComplete === false ? model.exactValue : null;
    const sample = context.sampleType || input.sampleType || "unspecified";
    const material = ["timed", "timed-urine", "24h", "dzm"].includes(sample) ? "Zachowany materiał: mocz ze zbiórki czasowej lub dobowej." : sample === "spot" ? "Zachowany materiał: próbka jednorazowa moczu." : "Nie zapisano rodzaju próbki; obliczenie zakłada oba stężenia z tego samego moczu.";
    const sources = Array.isArray(model.sources) ? model.sources : [], notes = model.notes || model.snapshot?.notes || model.policy?.notes || {};
    return `<details class="clcr-result-details kfr-result-details" id="clcr-potassium-index-details" data-clcr-formula="K_frac" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Jak obliczamy wynik?</h3><p class="kfr-calculation">100 × K / (K + Na) = 100 × ${escape(input.potassiumValue ?? "K")} / (${escape(input.potassiumValue ?? "K")} + ${escape(input.sodiumValue ?? "Na")})</p><p><strong>Pełna wartość liczbowa:</strong> ${escape(full)}%.${exact ? ` Dokładny ułamek: ${escape(exact.numerator)}/${escape(exact.denominator)}%.` : ""}</p><p>Wskaźnik opisuje udział potasu w sumie stężeń potasu i sodu. Zakres 0–100% wynika z definicji wzoru — nie jest zakresem normy.</p>${notes.clinicalContext ? `<h3>Zastosowanie w zespole nerczycowym</h3><p>${escape(notes.clinicalContext)}</p><p>${escape(notes.interference || "")}</p>` : ""}<h3>Próbka moczu a DZM</h3><p>${escape(material)}</p>${notes.collection ? `<p>${escape(notes.collection)}</p>` : ""}<h3>Jednostki i dokładność</h3><p>Oba stężenia należy wpisać w mmol/L. Dla jednowartościowych jonów potasu i sodu mEq/L ma tę samą wartość liczbową. Znaku „poniżej granicy oznaczalności” nie zastępujemy zerem. Znak ≈ oznacza skrócenie prezentacji.</p><h3>Źródła</h3>${sources.map(source => `<p>${sourceMarkup(source)}${source.limitation ? `<span class="kfr-source-note">${escape(source.limitation)}</span>` : ""}</p>`).join("")}</details>`;
  }
  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue) || model.rawValue < 0 || model.rawValue > 100) {
      const missing = !model.reasonCode || /^missing-/.test(model.reasonCode);
      return `<div class="${missing ? "kfr-result-empty" : "kfr-result-error"}" data-clcr-formula="K_frac"${missing ? "" : ' role="alert"'}><strong>${missing ? "Tutaj pojawi się wynik K/(K+Na)" : "Sprawdź stężenia potasu i sodu"}</strong><p>${escape(model.message || "Wpisz stężenie potasu i sodu z tej samej próbki moczu.")}</p></div>`;
    }
    const shown = String(model.display?.text ?? model.display?.value ?? model.rawValue).replace(".", ",");
    const sodium = String(model.sodiumDisplay?.text ?? model.sodiumDisplay?.value ?? model.sodiumValue ?? "—").replace(".", ",");
    const attributes = {
      "data-clcr-formula": "K_frac", "data-clcr-series": "K_frac", "data-clcr-source": "K_frac", "data-clcr-code": "kfrac",
      "data-clcr-value": model.rawValue, "data-clcr-display-value": model.display?.text ?? model.rawValue, "data-clcr-display-unit": "%",
      "data-clcr-display-label": "Udział potasu — K/(K+Na)", "data-clcr-status": "K/(K+Na) — bez oceny normy", "data-clcr-assessment": "unassessed",
      "data-clcr-tone": "neutral", "data-clcr-reference-profile": model.profileId || "", "data-clcr-reference-profile-version": model.profileVersion || "",
      "data-clcr-reference-comparison": "false", "data-clcr-potassium-index-snapshot": JSON.stringify(model.snapshot || model),
    };
    return `<div class="result-box clcr-result-card kfr-result-card" data-kfr-presentation="B" ${Object.entries(attributes).map(([name, value]) => `${name}="${escape(value)}"`).join(" ")}><div class="clcr-result-main kfr-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><div class="kfr-value-line"><strong class="clcr-result-value" data-density="${shown.length > 7 ? "long" : "normal"}" data-scientific="${/[eE][+-]?\d+$/.test(shown)}" aria-label="${escape(shown)}">${valueMarkup(shown)}</strong><span class="clcr-result-unit">%</span></div></div><div class="clcr-result-reference clcr-result-reference--unavailable kfr-result-reference" data-clcr-reference="kfr" data-clcr-reference-kind="none"><p class="clcr-result-reference-label">Norma</p><strong class="clcr-result-reference-value">Brak uniwersalnej normy</strong></div></div><p class="kfr-result-copy">${escape(model.message || model.notes?.meaning || "Wynik opisuje udział potasu w sumie potasu i sodu w moczu.")}</p><div class="kfr-composition" role="img" aria-label="Udział w sumie K + Na: potas ${escape(shown)}%, sód ${escape(sodium)}%. To nie jest skala normy."><p>Udział w sumie K + Na</p><svg class="kfr-composition-track" width="100%" height="10" aria-hidden="true" focusable="false"><rect class="kfr-composition-background" width="100%" height="10" rx="5"/><rect class="kfr-composition-fill" width="${model.rawValue}%" height="10" rx="5"/></svg><div class="kfr-composition-labels"><span>K · ${escape(shown)}%</span><span>Na · ${escape(sodium)}%</span></div></div></div>${detailsMarkup(model)}`;
  }
  return Object.freeze({ prepareControls, sync, refresh, restore, renderResult });
});
