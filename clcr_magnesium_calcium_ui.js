/* Dedicated Mg/Ca DZM controls and a captured, deliberately unassessed result. */
(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrMagnesiumCalciumUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const layouts = new WeakMap();
  const INPUT_UNITS = ["mg/L", "mg/dL", "mmol/L", "µmol/L"];
  const REPORTED_UNITS = ["mg/mg", "mmol/mmol"];
  const ALIASES = Object.freeze({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" });
  const CONTROLS = [
    { id: "MGCA_inputMode", label: "Sposób wpisania wyniku Mg/Ca", type: "hidden", value: "concentration" },
    { id: "MGCA_magnesium", label: "Magnez w moczu", placeholder: "np. 20" },
    { id: "MGCA_magnesiumUnit", label: "Jednostka magnezu w moczu", options: INPUT_UNITS, value: "mg/L" },
    { id: "MGCA_calcium", label: "Wapń w moczu", placeholder: "np. 2" },
    { id: "MGCA_calciumUnit", label: "Jednostka wapnia w moczu", options: INPUT_UNITS, value: "mmol/L" },
    { id: "MGCA_reportedValue", label: "Mg/Ca z wyniku badania", placeholder: "np. 0,50 lub <0,30" },
    { id: "MGCA_reportedUnit", label: "Jednostka gotowego wyniku Mg/Ca", options: REPORTED_UNITS, value: "mg/mg" },
    { id: "MGCA_sameSpecimen", label: "Pochodzenie oznaczeń moczu", type: "hidden", value: "assumed" },
    { id: "MGCA_collectionProblem", label: "Znany problem zbiórki", type: "hidden", value: "" },
    { id: "MGCA_collectionHours", label: "Zachowany czas zbiórki", type: "hidden", value: "" },
    { id: "MGCA_durationKnown", label: "Zachowana informacja o czasie zbiórki", type: "hidden", value: "" },
  ];
  const EDIT_ATTRIBUTES = ["aria-describedby", "aria-invalid"];
  const SOURCES = [
    { label: "EAU Urolithiasis 2026 · ocena metaboliczna", url: "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention" },
    { label: "NIST · masa molowa magnezu", url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=7439-95-4" },
    { label: "NIST · masa molowa wapnia", url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=7440-70-2" },
    { label: "Araujo e Sá i wsp., 1992 · badanie porannej próbki u dzieci", url: "https://www.actamedicaportuguesa.com/revista/index.php/amp/article/view/3216" },
  ];
  const escape = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function ensureControls(doc) {
    const form = doc?.getElementById("clcrForm");
    if (!form) return [];
    let registry = doc.getElementById("clcrMagnesiumCalciumControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "mgca-control-registry"); registry.id = "clcrMagnesiumCalciumControlRegistry";
      registry.hidden = true; form.append(registry);
    }
    return CONTROLS.map(spec => {
      const existing = doc.getElementById(spec.id);
      if (existing) return existing;
      const control = element(doc, spec.options ? "select" : "input");
      control.id = spec.id; control.setAttribute("aria-label", spec.label);
      if (spec.options) {
        const options = spec.id === "MGCA_reportedUnit" ? [...spec.options, ...Object.keys(ALIASES)] : spec.options;
        options.forEach(value => { const option = element(doc, "option", "", value); option.value = value; option.hidden = Object.hasOwn(ALIASES, value); control.append(option); });
        control.value = spec.value || spec.options[0];
      } else {
        control.type = spec.type || "text"; control.value = spec.value || "";
        if (!spec.type) { control.setAttribute("inputmode", "decimal"); control.setAttribute("spellcheck", "false"); control.setAttribute("autocomplete", "off"); control.setAttribute("placeholder", spec.placeholder || ""); }
      }
      if (spec.type === "hidden") registry.append(control);
      else { const label = element(doc, "label", "", spec.label); label.htmlFor = spec.id; label.append(control); registry.append(label); }
      return control;
    });
  }
  function getView(layout, id) {
    const registered = layout.options.fieldViews?.get(id);
    if (registered) return registered;
    const control = layout.document.getElementById(id), wrapper = control?.closest("label");
    return control && wrapper ? { control, wrapper } : null;
  }
  function moveField(layout, id, target, unit) {
    const view = getView(layout, id);
    if (!view?.wrapper?.parentNode) return;
    const anchor = layout.document.createComment(`mgca-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit, hidden: view.wrapper.hidden });
    view.wrapper.classList.add("mgca-entry-field");
    if (unit) view.wrapper.classList.add("mgca-unit-field");
    view.wrapper.hidden = false; target.append(view.wrapper);
  }
  function fieldRow(layout, host, valueId, unitId) {
    const row = element(layout.document, "div", "mgca-value-row"); host.append(row);
    moveField(layout, valueId, row, false); moveField(layout, unitId, row, true);
  }
  function refreshLayout(layout) {
    const doc = layout.document, direct = doc.getElementById("MGCA_inputMode")?.value === "direct";
    const report = doc.getElementById("MGCA_reportedUnit");
    if (report && Object.hasOwn(ALIASES, report.value)) report.value = ALIASES[report.value];
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    layout.concentration.hidden = direct; layout.reported.hidden = !direct; layout.assumption.hidden = direct;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String((button.dataset.mgcaMode === "direct") === direct)));
    const different = ["different", "false", "no"].includes(String(doc.getElementById("MGCA_sameSpecimen")?.value || ""));
    layout.assumption.textContent = different ? "Oznaczenia z różnych zbiórek nie pozwalają obliczyć Mg/Ca." : "Przyjmujemy, że oba stężenia pochodzą z tej samej wymieszanej zbiórki moczu.";
    const problem = ["true", "yes"].includes(String(doc.getElementById("MGCA_collectionProblem")?.value || ""));
    layout.facts.textContent = problem ? "Zachowano informację o problemie zbiórki." : different && direct ? "Informacja o różnych zbiórkach dotyczy obliczenia ze stężeń. Gotowy wskaźnik z laboratorium zachowujemy osobno." : "";
    layout.facts.hidden = !layout.facts.textContent;
    layout.card.dataset.mgcaMode = direct ? "direct" : "concentration";
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm"); if (!form) return null;
    ensureControls(doc);
    const card = element(doc, "section", "mgca-input-card"); card.id = "mgcaInputCard"; card.setAttribute("aria-label", "Dane do Mg/Ca z dobowej zbiórki moczu");
    const mode = element(doc, "div", "mgca-input-mode"); mode.setAttribute("role", "group"); mode.setAttribute("aria-label", "Sposób wpisania Mg/Ca z DZM");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężeń"], ["direct", "Gotowy wynik Mg/Ca"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label); button.type = "button"; button.dataset.mgcaMode = value;
      button.setAttribute("aria-controls", value === "direct" ? "mgcaReportedFields" : "mgcaConcentrationFields");
      button.addEventListener("click", () => {
        const control = doc.getElementById("MGCA_inputMode"); if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout); if (typeof layout.options.onChange === "function") layout.options.onChange();
      });
      layout.modeButtons.push(button); mode.append(button);
    });
    const hint = element(doc, "p", "mgca-field-hint", "Wybierz jednostki zgodne z wynikiem laboratorium.");
    layout.concentration = element(doc, "div", "mgca-mode-fields"); layout.concentration.id = "mgcaConcentrationFields";
    layout.reported = element(doc, "div", "mgca-mode-fields"); layout.reported.id = "mgcaReportedFields";
    const reportHint = element(doc, "p", "mgca-field-hint", "Przepisz wskaźnik razem z jednostką i ewentualnym znakiem nierówności.");
    const material = element(doc, "p", "mgca-material"); material.append(element(doc, "span", "", "Materiał"), element(doc, "strong", "", "Dobowa zbiórka moczu (DZM)"));
    layout.assumption = element(doc, "p", "mgca-assumption"); layout.facts = element(doc, "p", "mgca-known-facts"); layout.facts.hidden = true;
    card.append(mode, hint, layout.concentration, layout.reported, material, layout.assumption, layout.facts);
    const clear = doc.getElementById("clearContainer"); if (clear?.parentNode === form) form.insertBefore(card, clear); else form.append(card);
    fieldRow(layout, layout.concentration, "MGCA_magnesium", "MGCA_magnesiumUnit");
    fieldRow(layout, layout.concentration, "MGCA_calcium", "MGCA_calciumUnit");
    fieldRow(layout, layout.reported, "MGCA_reportedValue", "MGCA_reportedUnit"); layout.reported.append(reportHint);
    layout.onEdit = event => { if (String(event.target?.id || "").startsWith("MGCA_")) refreshLayout(layout); };
    form.addEventListener("input", layout.onEdit); form.addEventListener("change", layout.onEdit);
    refreshLayout(layout); return layout;
  }
  function restore(doc) {
    const layout = layouts.get(doc);
    if (layout) {
      [...layout.moves].reverse().forEach(({ view, anchor, attributes, unit, hidden }) => {
        if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
        anchor.remove(); view.wrapper.classList.remove("mgca-entry-field"); if (unit) view.wrapper.classList.remove("mgca-unit-field"); view.wrapper.hidden = hidden;
        Object.entries(attributes).forEach(([key, value]) => value === null ? view.control.removeAttribute(key) : view.control.setAttribute(key, value));
      });
      layout.card.remove(); layout.form.removeEventListener("input", layout.onEdit); layout.form.removeEventListener("change", layout.onEdit); layouts.delete(doc);
    }
    doc?.documentElement?.removeAttribute("data-clcr-mgca-active");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) { layout = createLayout(doc, options); if (!layout) return; layouts.set(doc, layout); }
    layout.options = options; doc.documentElement.dataset.clcrMgcaActive = "1"; refreshLayout(layout);
  }
  function refresh(doc) { const layout = layouts.get(doc); if (layout) refreshLayout(layout); }
  function valueMarkup(shown) {
    const scientific = /^([<>≤≥]?≈?\d+(?:[.,]\d+)?)[eE]([+-]?\d+)$/.exec(shown);
    if (!scientific) return { html: escape(shown), scientific: false };
    return { html: `<span class="mgca-scientific-mantissa">${escape(scientific[1])}</span><span class="mgca-scientific-power">× 10<sup>${escape(scientific[2].replace(/^\+/, ""))}</sup></span>`, scientific: true };
  }
  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło");
    return /^https:\/\//.test(source.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  }
  function precisionMarkup(model, unit) {
    const full = model.display?.fullValueText || `${model.comparator || model.operator || ""}${String(model.rawValue).replace(".", ",")}`;
    const exact = model.display?.fullValueComplete === false ? model.exactValue : null;
    return `<p class="mgca-unrounded-result"><strong>Pełna wartość liczbowa:</strong> ${escape(full)} ${escape(unit)}.</p>${exact ? `<p class="mgca-unrounded-result">Dokładny ułamek: ${escape(model.comparator || model.operator || "")}${escape(exact.numerator)}/${escape(exact.denominator)} ${escape(unit)}.</p>` : ""}`;
  }
  function contextMarkup(model) {
    const context = model.context || model.snapshot?.context || {}, facts = [];
    if (context.collectionProblem === true || context.collectionProblem === "true" || context.collectionProblem === "yes") facts.push("Zachowano informację o problemie zbiórki.");
    if (context.collectionHours !== "" && context.collectionHours != null) facts.push(`Zachowany czas zbiórki: ${context.collectionHours} h.`);
    if (context.durationKnown === false || context.durationKnown === "false" || context.durationKnown === "no") facts.push("Czas zbiórki oznaczono jako nieznany.");
    const sameSpecimen = context.concentrationSameSpecimen ?? context.sameSpecimen;
    if (["different", "false", "no"].includes(String(sameSpecimen || ""))) facts.push("Zgłoszono różne zbiórki dla stężeń; gotowy wskaźnik z raportu jest odrębnym wynikiem.");
    if (model.contextNote) facts.push(model.contextNote);
    return facts.length ? `<h3>Zachowane informacje o zbiórce</h3><p>${escape([...new Set(facts)].join(" "))}</p>` : "";
  }
  function calculationMarkup(model) {
    const input = model.input || model.snapshot?.input || {};
    if (model.mode === "direct" || input.mode === "direct") return "Przepisany wskaźnik z jednostką i ewentualnym znakiem nierówności raportu.";
    const magnesium = input.magnesiumValue ?? input.magnesium, calcium = input.calciumValue ?? input.calcium;
    return magnesium != null && calcium != null ? `${magnesium} ${input.magnesiumUnit || ""} Mg ÷ ${calcium} ${input.calciumUnit || ""} Ca, po uzgodnieniu jednostek masowych.` : "Mg/Ca = stężenie magnezu ÷ stężenie wapnia, po uzgodnieniu jednostek masowych.";
  }
  function detailsMarkup(model, unit) {
    const alternate = model.alternate || {}, available = model.alternateAvailable ?? alternate.available;
    const alternateUnit = model.alternateUnit || alternate.unit || "";
    const alternateText = alternate.display?.text ?? `${model.comparator || model.operator || ""}${String(model.alternateValue ?? alternate.value ?? "").replace(".", ",")}`;
    const conversion = available ? `Ten sam wskaźnik w drugiej jednostce: ${alternateText} ${alternateUnit}.` : alternateUnit ? `Przeliczenie na ${alternateUnit} jest poza zakresem liczbowym kalkulatora. Wynik w jednostce raportu pozostaje zachowany.` : "";
    return `<details class="clcr-result-details mgca-result-details" id="clcr-magnesium-calcium-details" data-clcr-formula="Mg_Ca" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Co opisuje ten wskaźnik?</h3><p>Mg/Ca opisuje proporcję magnezu do wapnia w tej samej zbiórce. Niższy iloraz może wynikać zarówno z mniejszego stężenia magnezu, jak i z większego stężenia wapnia.</p><h3>Norma dla DZM</h3><p>W źródłach przyjętych do tego kalkulatora nie potwierdzono odpowiedniego zakresu Mg/Ca w DZM dla wieku. Badania porannych próbek oraz statystyki grup z kamicą dotyczą innych materiałów lub populacji.</p><p>Dlatego wynik pozostaje opisowy, bez automatycznej kategorii „prawidłowy” lub „nieprawidłowy”.</p><h3>Obliczenie i jednostki</h3><p>${escape(calculationMarkup(model))}</p>${precisionMarkup(model, unit)}${conversion ? `<p>${escape(conversion)}</p>` : ""}<p>Masy molowe: magnez 24,305 g/mol, wapń 40,078 g/mol. Po uzgodnieniu jednostek dzielimy stężenie Mg przez stężenie Ca. Wspólna objętość i czas skracają się w ilorazie.</p><p>g/g odpowiada mg/mg, a mol/mol — mmol/mmol. Stosunek masowy i molowy mają różne wartości liczbowe. Znak ≈ oznacza skrócenie prezentacji; zapis zachowuje pełną wartość.</p>${contextMarkup(model)}<h3>Ocena wydalania magnezu i wapnia</h3><p>W ocenie profilu metabolicznego moczu przydatne są także osobne ilości dobowe magnezu i wapnia.</p><div class="mgca-detail-links"><button type="button" data-clcr-mgca-formula="Mg_mgkg">Dobowe wydalanie magnezu →</button><button type="button" data-clcr-mgca-formula="Ca_mgkg">Dobowe wydalanie wapnia →</button></div><h3>Źródła</h3>${(Array.isArray(model.sources) && model.sources.length ? model.sources : SOURCES).map(source => `<p>${sourceMarkup(source)}</p>`).join("")}</details>`;
  }
  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue) || model.rawValue < 0) {
      const missing = ["", "missing-input", "missing-magnesium", "missing-calcium", "missing-reported-value"].includes(model.reasonCode || "");
      const empty = model.mode === "direct" ? "Wpisz gotowy wskaźnik Mg/Ca z laboratorium i wybierz jego jednostkę." : "Wpisz stężenie magnezu i wapnia z tej samej dobowej zbiórki moczu.";
      return `<div class="${missing ? "mgca-result-empty" : "mgca-result-error"}" data-clcr-formula="Mg_Ca"${missing ? "" : ' role="alert"'}><strong>${missing ? "Tutaj pojawi się wynik Mg/Ca" : "Sprawdź dane Mg/Ca"}</strong><p>${escape(model.message || model.qualification?.note || empty)}</p></div>`;
    }
    const shown = String(model.display?.text ?? model.display?.value ?? model.rawValue).replace(".", ","), unit = model.display?.unit || model.unit || "mg/mg";
    const value = valueMarkup(shown), snapshot = model.snapshot || model;
    const attributes = {
      "data-clcr-formula": "Mg_Ca", "data-clcr-series": "Mg_Ca", "data-clcr-source": "Mg_Ca", "data-clcr-code": "mgca",
      "data-clcr-value": model.rawValue, "data-clcr-display-value": model.display?.value ?? model.rawValue, "data-clcr-value-length": Math.min(32, shown.length),
      "data-clcr-display-unit": unit, "data-clcr-display-label": "Magnez/wapń — Mg/Ca (DZM)", "data-clcr-status": "Wskaźnik Mg/Ca", "data-clcr-assessment": "unassessed",
      "data-clcr-comparison": "", "data-clcr-comparator": model.comparator || model.operator || "", "data-clcr-category": "", "data-clcr-boundary": model.boundary || "",
      "data-clcr-tone": "neutral", "data-clcr-reference-profile": model.profileId || "", "data-clcr-reference-comparison": "false", "data-clcr-mgca-snapshot": JSON.stringify(snapshot),
    };
    return `<div class="result-box clcr-result-card mgca-result-card" data-mgca-presentation="B" ${Object.entries(attributes).map(([name, content]) => `${name}="${escape(content)}"`).join(" ")}><p class="clcr-result-interpretation mgca-result-status">Wskaźnik Mg/Ca</p><div class="clcr-result-main mgca-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-scientific="${value.scientific}" aria-label="${escape(shown)}" data-density="${shown.length > 8 ? "long" : shown.length > 6 ? "medium" : "normal"}">${value.html}</strong><span class="clcr-result-unit">${escape(unit)}</span></div><div class="clcr-result-reference clcr-result-reference--unavailable mgca-result-reference" data-clcr-reference="mgca" data-clcr-reference-kind="none"><p class="clcr-result-reference-label">Norma dla DZM</p><strong class="clcr-result-reference-value">Brak zakresu</strong><span class="clcr-result-reference-unit" aria-hidden="true">&nbsp;</span></div></div><p class="mgca-result-copy">Ten wynik nie ma przypisanej normy dla DZM. Wskaźnik opisuje proporcję magnezu do wapnia w tej zbiórce.</p></div>${detailsMarkup(model, unit)}`;
  }
  return Object.freeze({ ensureControls, sync, refresh, restore, renderResult });
});
