/* Serum anion gap without K: three concentrations and one integrated result. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.ClcrSerumAnionGapUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const layouts = new WeakMap(), controlStates = new WeakMap();
  const FIELDS = Object.freeze([["S_Na", "Sód (Na⁺)", "np. 140"], ["S_Cl", "Chlorki (Cl⁻)", "np. 104"], ["S_HCO3", "Wodorowęglany / CO₂ całkowity", "np. 24"]]);
  const ATTRIBUTES = ["type", "inputmode", "min", "max", "step", "placeholder", "aria-describedby", "aria-invalid"];
  const escape = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
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
  function evaluateLayout(layout) {
    const doc = layout.document, host = doc.defaultView || root;
    const engine = host.VildaClcrSerumAnionGap || root.VildaClcrSerumAnionGap;
    const context = layout.options.context || (host.ClcrSerumAnionGapSession || root.ClcrSerumAnionGapSession)?.readContext?.() || {};
    const profile = (host.VildaClcrSerumAnionGapData || root.VildaClcrSerumAnionGapData)?.getProfile?.("MAYO_ELPSR_AGS_2026_11");
    return engine?.readInputFromDocument && engine?.evaluate ? engine.evaluate(engine.readInputFromDocument(doc, { context }), profile) : null;
  }
  function refreshLayout(layout) {
    const doc = layout.document, model = evaluateLayout(layout);
    const enabled = doc.getElementById("AGS_albuminEnabled")?.checked === true;
    layout.optionalButton?.setAttribute("aria-expanded", String(enabled));
    if (layout.optionalSign) layout.optionalSign.textContent = enabled ? "−" : "+";
    if (layout.albuminBody) layout.albuminBody.hidden = !enabled;
    layout.moves.forEach(({ view, id }) => { view.wrapper.hidden = id === "AGS_albuminEnabled"; });
    layout.readiness.hidden = !model?.readiness;
    if (model?.readiness) {
      layout.count.textContent = `${model.readiness.count}/${model.readiness.total}`;
      layout.readiness.dataset.complete = String(model.readiness.complete);
    }
    const invalidIds = model?.invalidIds || [];
    FIELDS.forEach(([id]) => {
      const input = doc.getElementById(id); if (!input) return;
      const previous = String(input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      input.setAttribute("aria-describedby", [...new Set([...previous, "agsUnitHelp", ...(id === "S_HCO3" ? ["agsBicarbonateHelp"] : [])])].join(" "));
      input.setAttribute("aria-invalid", String(invalidIds.includes(id)));
    });
    const correction = model?.correction;
    const albumin = doc.getElementById("S_Albumin");
    if (albumin) {
      albumin.setAttribute("aria-describedby", "agsAlbuminHelp agsAlbuminError");
      albumin.setAttribute("aria-invalid", String(enabled && Boolean(correction?.error)));
    }
    if (layout.albuminError) {
      layout.albuminError.hidden = !enabled || !correction?.error;
      layout.albuminError.textContent = enabled ? correction?.error || "" : "";
    }
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm"); if (!form) return null;
    prepareControls(doc);
    const card = element(doc, "section", "ags-input-card"); card.id = "agsInputCard";
    card.setAttribute("aria-label", "Dane do luki anionowej surowicy bez potasu");
    const layout = { document: doc, form, options, card, moves: [] };
    const moveView = (id, parent, className, label) => {
      const control = doc.getElementById(id);
      const view = options.fieldViews?.get(id) || (control ? { control, wrapper: control.closest("label") } : null);
      if (!view?.wrapper?.parentNode) return null;
      const anchor = doc.createComment(`ags-field-origin-${id}`);
      view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
      const name = view.wrapper.querySelector(".clcr-field__name");
      layout.moves.push({ id, view, anchor, hidden: view.wrapper.hidden, labelText: view.labelText, name, nameText: name?.textContent, className });
      view.wrapper.classList.add(className); view.wrapper.hidden = false;
      if (label) { view.labelText = label; if (name) name.textContent = label; }
      parent.append(view.wrapper);
      return view;
    };
    card.append(element(doc, "p", "ags-input-intro", "Trzy stężenia z tego samego badania krwi. Obliczenie bez potasu."));
    FIELDS.forEach(([id, label]) => {
      const row = element(doc, "div", "ags-value-row");
      if (!moveView(id, row, "ags-entry-field", label)) return;
      row.append(element(doc, "span", "ags-fixed-unit", "mmol/L")); card.append(row);
      if (id === "S_HCO3") {
        const hint = element(doc, "p", "ags-field-hint", "Z panelu biochemicznego: tCO₂. Z gazometrii: aktualne HCO₃⁻, nie standardowe.");
        hint.id = "agsBicarbonateHelp"; card.append(hint);
      }
    });
    const units = element(doc, "p", "ags-field-hint", "Dla tych jonów wartości w mEq/L są takie same jak w mmol/L.");
    units.id = "agsUnitHelp"; card.append(units);
    const albuminBody = doc.getElementById("agsAlbuminControls");
    const enabled = doc.getElementById("AGS_albuminEnabled");
    if (albuminBody && enabled && doc.getElementById("S_Albumin") && doc.getElementById("S_Albumin_unit")) {
      layout.albuminBody = albuminBody; layout.albuminBodyHidden = albuminBody.hidden;
      layout.albuminAnchor = doc.createComment("ags-albumin-origin"); albuminBody.parentNode.insertBefore(layout.albuminAnchor, albuminBody);
      const optional = element(doc, "div", "ags-optional");
      layout.optionalButton = element(doc, "button", "ags-optional-toggle"); layout.optionalButton.id = "agsAlbuminToggle";
      layout.optionalButton.type = "button"; layout.optionalButton.setAttribute("aria-controls", "agsAlbuminControls");
      layout.optionalButton.append(element(doc, "span", "", "Uwzględnij albuminę (opcjonalnie)"));
      layout.optionalSign = element(doc, "span", "ags-optional-sign", "+"); layout.optionalSign.setAttribute("aria-hidden", "true"); layout.optionalButton.append(layout.optionalSign);
      const row = element(doc, "div", "ags-value-row ags-albumin-row");
      moveView("S_Albumin", row, "ags-entry-field", "Albumina w surowicy");
      moveView("S_Albumin_unit", row, "ags-unit-field");
      const enableView = options.fieldViews?.get("AGS_albuminEnabled");
      if (enableView) moveView("AGS_albuminEnabled", albuminBody, "ags-enabled-field");
      const hint = element(doc, "p", "ags-field-hint", "Albumina służy do dodatkowego przeliczenia. Jej brak nie blokuje AG."); hint.id = "agsAlbuminHelp";
      layout.albuminError = element(doc, "p", "ags-albumin-error"); layout.albuminError.id = "agsAlbuminError"; layout.albuminError.setAttribute("role", "alert"); layout.albuminError.hidden = true;
      albuminBody.append(row, hint, layout.albuminError);
      layout.albuminExtras = [row, hint, layout.albuminError];
      optional.append(layout.optionalButton, albuminBody); card.append(optional);
      layout.onToggle = () => {
        enabled.checked = !enabled.checked;
        enabled.dispatchEvent(new (doc.defaultView?.Event || Event)("change", { bubbles: true }));
        refreshLayout(layout);
      };
      layout.optionalButton.addEventListener("click", layout.onToggle);
    }
    layout.readiness = element(doc, "p", "ags-readiness"); layout.readiness.setAttribute("aria-live", "polite");
    layout.count = element(doc, "strong", "", "0/3"); layout.count.id = "agsRequiredCount";
    layout.readiness.append(element(doc, "span", "", "Wymagane dane"), layout.count); card.append(layout.readiness);
    const clear = doc.getElementById("clearContainer"); if (clear?.parentNode === form) form.insertBefore(card, clear); else form.append(card);
    layout.onEdit = event => { if ([...FIELDS.map(([id]) => id), "S_Albumin", "S_Albumin_unit", "AGS_albuminEnabled"].includes(event.target?.id)) refreshLayout(layout); };
    form.addEventListener("input", layout.onEdit); form.addEventListener("change", layout.onEdit);
    refreshLayout(layout); return layout;
  }
  function restore(doc) {
    const layout = layouts.get(doc);
    if (layout) {
      [...layout.moves].reverse().forEach(({ view, anchor, hidden, labelText, name, nameText, className }) => {
        if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
        anchor.remove(); view.wrapper.classList.remove(className); view.wrapper.hidden = hidden;
        view.labelText = labelText; if (name) name.textContent = nameText;
      });
      if (layout.albuminBody) {
        layout.albuminExtras.forEach(node => node.remove());
        if (layout.albuminAnchor.parentNode) layout.albuminAnchor.parentNode.insertBefore(layout.albuminBody, layout.albuminAnchor.nextSibling);
        layout.albuminAnchor.remove(); layout.albuminBody.hidden = layout.albuminBodyHidden;
      }
      layout.optionalButton?.removeEventListener("click", layout.onToggle);
      layout.card.remove(); layout.form.removeEventListener("input", layout.onEdit); layout.form.removeEventListener("change", layout.onEdit); layouts.delete(doc);
    }
    restoreControls(doc); doc?.documentElement?.removeAttribute("data-clcr-ags-active");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) { layout = createLayout(doc, options); if (!layout) return; layouts.set(doc, layout); }
    layout.options = options; doc.documentElement.dataset.clcrAgsActive = "1"; refreshLayout(layout);
  }
  function refresh(doc) { const layout = layouts.get(doc); if (layout) refreshLayout(layout); }
  function shown(value) { return String(value ?? "").replace(".", ",").replace(/^-/, "−"); }
  function valueMarkup(value) {
    const scientific = /^(≈?[−-]?\d+(?:[.,]\d+)?)(?:[eE]|\s*×\s*10\^)([+−-]?\d+)$/.exec(value);
    return scientific ? `<span class="ags-scientific-mantissa">${escape(scientific[1])}</span><span class="ags-scientific-power">× 10<sup>${escape(scientific[2].replace(/^\+/, ""))}</sup></span>` : escape(value);
  }
  function sourceMarkup(source) {
    const label = escape(source.label || source.title || source.name || "Źródło");
    return /^https:\/\//.test(source.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  }
  function referenceAvailable(model) { return model.referenceAvailable === true && Number.isFinite(model.reference?.min ?? model.reference?.low) && Number.isFinite(model.reference?.max ?? model.reference?.high); }
  function detailsMarkup(model) {
    const reference = model.reference || {}, notes = model.notes || {};
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const full = shown(model.display?.fullValueText ?? model.exactText ?? model.rawValue);
    const correction = model.correction;
    const referenceSource = typeof reference.source === "string" ? reference.source : reference.source?.label || reference.source?.name;
    const range = referenceAvailable(model) ? `<table class="ags-reference-table"><thead><tr><th>Wiek</th><th>Norma AG bez korekcji</th></tr></thead><tbody><tr><td>${escape(reference.population || model.population || "Dla profilu przyjętego podczas obliczenia")}</td><td>${escape(shown(reference.min ?? reference.low))}–${escape(shown(reference.max ?? reference.high))} mmol/L</td></tr></tbody></table>` : "";
    return `<details class="clcr-result-details ags-result-details" id="clcr-serum-anion-gap-details" data-clcr-formula="AGs" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Jak obliczamy wynik?</h3><p class="ags-calculation">AG = Na⁺ − (Cl⁻ + HCO₃⁻)</p><p><strong>Pełna wartość AG bez korekcji:</strong> ${escape(full)} mmol/L.</p><h3>Norma przyjęta w aplikacji</h3>${range}<p>${escape(model.referenceHint || reference.note || "Przyjęty zakres; norma na wydruku może się różnić.")}</p>${referenceSource ? `<p>Źródło zakresu przyjętego w aplikacji: ${escape(referenceSource)}.</p>` : ""}<p>Norma dotyczy AG bez korekcji względem albuminy. Zakres zależy od metody oznaczenia elektrolitów i CO₂; przy interpretacji uwzględnij normę na wydruku.</p><h3>Albumina</h3><p>Albumina jest jednym z anionów uwzględnianych pośrednio przez AG. Przy małym stężeniu albuminy AG może być niższa.</p><p class="ags-calculation">AG po uwzględnieniu albuminy = AG + 0,25 × (40 − albumina w g/L)<br>Dla g/dL: AG + 2,5 × (4 − albumina).</p>${correction?.valid ? `<p><strong>Pełna wartość po uwzględnieniu albuminy:</strong> ${escape(shown(correction.display?.fullValueText ?? correction.exactText ?? correction.rawValue ?? correction.value))} mmol/L.</p>` : ""}<p>40 g/L jest poziomem przyjętym do przeliczenia, a nie dolną granicą normy albuminy. Przy albuminie powyżej 40 g/L korekta zmniejsza AG. Przeliczenie nie otrzymuje osobnej automatycznej oceny.</p><h3>Co oznacza wynik?</h3><p>${escape(notes.high || "Zwiększona AG może towarzyszyć gromadzeniu nieoznaczanych rutynowo anionów. Samo AG nie rozpoznaje kwasicy ani jej przyczyny; znaczenie mają pozostałe wyniki i obraz kliniczny.")}</p><p>${escape(notes.low || "Mała lub ujemna AG wymaga sprawdzenia oznaczeń i oceny między innymi stężenia albuminy. Ujemny wynik obliczenia jest możliwy i nie jest automatycznie błędem wzoru.")}</p><p>AG w przyjętej normie nie wyklucza wszystkich zaburzeń kwasowo-zasadowych ani zwiększonego stężenia mleczanu.</p><h3>Próbka i metoda</h3><p>Trzy stężenia z tego samego pobrania. Z panelu biochemicznego stosuje się tCO₂, a z gazometrii aktualne, nie standardowe HCO₃⁻. Metody te nie są w każdych warunkach zamienne.</p><p>Dla jednowartościowych jonów wartości w mEq/L i mmol/L są liczbowo takie same. Znak ≈ oznacza skrócenie prezentacji; klasyfikacja korzysta z pełnej wartości.</p><h3>Źródła</h3>${sources.map(source => `<p>${sourceMarkup(source)}${source.limitation ? `<span class="ags-source-note">${escape(source.limitation)}</span>` : ""}</p>`).join("")}</details>`;
  }
  function scaleMarkup(model) {
    if (!referenceAvailable(model)) return "";
    const low = model.reference.min ?? model.reference.low, high = model.reference.max ?? model.reference.high;
    const position = value => Math.max(0, Math.min(100, (value + 10) / 50 * 100));
    return `<div class="ags-scale" role="img" aria-label="AG ${escape(shown(model.display?.text ?? model.rawValue))} mmol/L. Norma od ${escape(shown(low))} do ${escape(shown(high))} mmol/L."><svg class="ags-scale-track" width="100%" height="10" aria-hidden="true" focusable="false"><rect class="ags-scale-background" width="100%" height="10" rx="5"/><rect class="ags-scale-band" x="${position(low)}%" width="${position(high) - position(low)}%" height="10"/><line class="ags-scale-edge" x1="${position(low)}%" x2="${position(low)}%" y1="0" y2="10"/><line class="ags-scale-edge" x1="${position(high)}%" x2="${position(high)}%" y1="0" y2="10"/><line class="ags-scale-marker" x1="${position(model.rawValue)}%" x2="${position(model.rawValue)}%" y1="-8" y2="16"/><text class="ags-scale-marker-label" x="${position(model.rawValue)}%" y="-25">Wynik</text><text class="ags-scale-marker-arrow" x="${position(model.rawValue)}%" y="-11">▼</text><text class="ags-scale-boundary" x="${position(low)}%" y="23">${escape(shown(low))}</text><text class="ags-scale-boundary" x="${position(high)}%" y="23">${escape(shown(high))}</text></svg><div class="ags-scale-ends" aria-hidden="true"><span>−10</span><span>40</span></div><p class="ags-scale-note">Norma: od ${escape(shown(low))} do ${escape(shown(high))} mmol/L.</p>${model.rawValue < -10 || model.rawValue > 40 ? '<p class="ags-scale-note">Wynik znajduje się poza pokazanym fragmentem skali.</p>' : ""}</div>`;
  }
  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const code = model.reasonCode || model.errorCode || model.reason || "";
      const missing = !code || /^missing/.test(code);
      return `<div class="${missing ? "ags-result-empty" : "ags-result-error"}" data-clcr-formula="AGs"${missing ? "" : ' role="alert"'}><strong>${missing ? "Tutaj pojawi się wynik" : "Sprawdź wpisane dane"}</strong><p>${escape(model.message || model.error || "Wpisz sód, chlorki i wodorowęglany. Potrzebne są trzy stężenia.")}</p></div>`;
    }
    const display = shown(model.display?.text ?? model.display?.value ?? model.rawValue);
    const available = referenceAvailable(model), low = model.reference?.min ?? model.reference?.low, high = model.reference?.max ?? model.reference?.high;
    const status = ["low", "high", "normal"].includes(model.status) && available ? model.status : "unassessed";
    const tone = status === "low" || status === "high" ? "warn" : status === "normal" ? "normal" : "neutral";
    const attributes = {
      "data-clcr-formula": "AGs", "data-clcr-series": "AGs", "data-clcr-source": "AGs", "data-clcr-code": "ags",
      "data-clcr-value": model.rawValue, "data-clcr-display-value": model.display?.text ?? model.rawValue, "data-clcr-display-unit": "mmol/L",
      "data-clcr-display-label": "Luka anionowa surowicy — AG bez potasu", "data-clcr-status": model.interpretation || model.statusText || "",
      "data-clcr-assessment": status, "data-clcr-tone": tone, "data-clcr-reference-profile": model.profileId || "", "data-clcr-reference-profile-version": model.profileVersion || "",
      "data-clcr-reference-comparison": String(available), "data-clcr-serum-anion-gap-snapshot": JSON.stringify(model.snapshot || model),
    };
    const correction = model.correction;
    const corrected = correction?.valid ? shown(correction.display?.text ?? correction.display?.value ?? correction.rawValue ?? correction.value) : "";
    const correctionText = correction?.comment || (available ? "Norma powyżej dotyczy AG bez korekcji." : "Przeliczenie do albuminy 40 g/L, bez automatycznej oceny.");
    return `<div class="result-box clcr-result-card ags-result-card" data-ags-presentation="B" ${Object.entries(attributes).map(([name, value]) => `${name}="${escape(value)}"`).join(" ")}><h3 class="ags-result-status">${escape(model.statusText || "Wynik obliczony")}</h3><div class="clcr-result-main ags-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">AG bez korekcji</p><strong class="clcr-result-value" data-density="${display.length > 7 ? "long" : "normal"}" aria-label="${escape(display)}">${valueMarkup(display)}</strong><span class="clcr-result-unit">mmol/L</span></div><div class="clcr-result-reference ags-result-reference${available ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference="ags" data-clcr-reference-kind="${available ? "range" : "none"}"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Norma dla wieku")}</p><strong class="clcr-result-reference-value">${available ? `${escape(shown(low))}–${escape(shown(high))}` : "Brak normy do porównania"}</strong>${available ? '<span class="ags-reference-unit">mmol/L</span>' : '<span class="ags-reference-unit"></span>'}</div></div><p class="ags-result-copy">${escape(model.interpretation || model.message || "")}</p>${scaleMarkup(model)}${correction?.valid ? `<div class="ags-correction-row"><p class="ags-correction-title">Po uwzględnieniu albuminy</p><p class="ags-correction-number">${valueMarkup(corrected)} <span>mmol/L</span></p><p class="ags-correction-comment">${escape(correctionText)}</p></div>` : ""}${available ? '<p class="ags-reference-footnote">Przyjęty zakres; norma na wydruku może się różnić.</p>' : ""}</div>${detailsMarkup(model)}`;
  }
  return Object.freeze({ prepareControls, sync, refresh, restore, renderResult });
});
