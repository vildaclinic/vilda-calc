/* Minimal Pᵢ/Cr DZM controls and one captured result with the applicable reference. */
(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrPhosphorusCreatinineUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const layouts = new WeakMap();
  const PHOSPHORUS_UNITS = ["mmol/L", "µmol/L", "mg P/L", "mg P/dL"];
  const CREATININE_UNITS = ["mmol/L", "µmol/L", "mg/L", "mg/dL"];
  const REPORTED_UNITS = ["mg/mg", "mg/g", "mmol/mmol"];
  const ALIASES = Object.freeze({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" });
  const CONTROLS = [
    { id: "PICR_inputMode", label: "Sposób wpisania wyniku Pᵢ/Cr", type: "hidden", value: "concentration" },
    { id: "PICR_phosphorus", label: "Fosfor nieorganiczny w moczu", placeholder: "np. 15" },
    { id: "PICR_phosphorusUnit", label: "Jednostka fosforu nieorganicznego w moczu", options: PHOSPHORUS_UNITS, value: "mmol/L" },
    { id: "PICR_creatinine", label: "Kreatynina w moczu", placeholder: "np. 10" },
    { id: "PICR_creatinineUnit", label: "Jednostka kreatyniny w moczu", options: CREATININE_UNITS, value: "mmol/L" },
    { id: "PICR_reportedValue", label: "Pᵢ/Cr z wyniku badania", placeholder: "np. 0,411 lub <0,10" },
    { id: "PICR_reportedUnit", label: "Jednostka gotowego wyniku Pᵢ/Cr", options: REPORTED_UNITS, value: "mg/mg" },
    { id: "PICR_sameSpecimen", label: "Pochodzenie oznaczeń moczu", type: "hidden", value: "assumed" },
    { id: "PICR_collectionProblem", label: "Znany problem zbiórki", type: "hidden", value: "" },
    { id: "PICR_collectionHours", label: "Zachowany czas zbiórki", type: "hidden", value: "" },
    { id: "PICR_durationKnown", label: "Zachowana informacja o czasie zbiórki", type: "hidden", value: "" },
  ];
  const EDIT_ATTRIBUTES = ["aria-describedby", "aria-invalid"];
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
    let registry = doc.getElementById("clcrPhosphorusCreatinineControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "picr-control-registry"); registry.id = "clcrPhosphorusCreatinineControlRegistry";
      registry.hidden = true; form.append(registry);
    }
    return CONTROLS.map(spec => {
      const existing = doc.getElementById(spec.id);
      if (existing) return existing;
      const control = element(doc, spec.options ? "select" : "input");
      control.id = spec.id; control.setAttribute("aria-label", spec.label);
      if (spec.options) {
        const options = spec.id === "PICR_reportedUnit" ? [...spec.options, ...Object.keys(ALIASES)] : spec.options;
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
    const anchor = layout.document.createComment(`picr-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit, hidden: view.wrapper.hidden });
    view.wrapper.classList.add("picr-entry-field");
    if (unit) view.wrapper.classList.add("picr-unit-field");
    view.wrapper.hidden = false; target.append(view.wrapper);
  }
  function fieldRow(layout, host, valueId, unitId) {
    const row = element(layout.document, "div", "picr-value-row"); host.append(row);
    moveField(layout, valueId, row, false); moveField(layout, unitId, row, true);
  }
  function refreshLayout(layout) {
    const doc = layout.document, direct = doc.getElementById("PICR_inputMode")?.value === "direct";
    const report = doc.getElementById("PICR_reportedUnit");
    if (report && Object.hasOwn(ALIASES, report.value)) report.value = ALIASES[report.value];
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    layout.concentration.hidden = direct; layout.reported.hidden = !direct; layout.assumption.hidden = direct;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String((button.dataset.picrMode === "direct") === direct)));
    const different = ["different", "false", "no"].includes(String(doc.getElementById("PICR_sameSpecimen")?.value || ""));
    layout.assumption.textContent = different ? "Oznaczenia z różnych zbiórek nie pozwalają obliczyć Pᵢ/Cr." : "Przyjmujemy, że oba stężenia pochodzą z tej samej wymieszanej zbiórki moczu.";
    const problem = ["true", "yes"].includes(String(doc.getElementById("PICR_collectionProblem")?.value || ""));
    layout.facts.textContent = problem ? "Zachowano informację o problemie zbiórki." : different && direct ? "Informacja o różnych zbiórkach dotyczy obliczenia ze stężeń. Gotowy wskaźnik z laboratorium zachowujemy osobno." : "";
    layout.facts.hidden = !layout.facts.textContent;
    layout.massHint.hidden = direct || !String(doc.getElementById("PICR_phosphorusUnit")?.value || "").startsWith("mg");
    layout.card.dataset.picrMode = direct ? "direct" : "concentration";
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm"); if (!form) return null;
    ensureControls(doc);
    const card = element(doc, "section", "picr-input-card"); card.id = "picrInputCard"; card.setAttribute("aria-label", "Dane do Pᵢ/Cr z dobowej zbiórki moczu");
    const mode = element(doc, "div", "picr-input-mode"); mode.setAttribute("role", "group"); mode.setAttribute("aria-label", "Sposób wpisania Pᵢ/Cr z DZM");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężeń"], ["direct", "Gotowy wynik Pᵢ/Cr"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label); button.type = "button"; button.dataset.picrMode = value;
      button.setAttribute("aria-controls", value === "direct" ? "picrReportedFields" : "picrConcentrationFields");
      button.addEventListener("click", () => {
        const control = doc.getElementById("PICR_inputMode"); if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout); if (typeof layout.options.onChange === "function") layout.options.onChange();
      });
      layout.modeButtons.push(button); mode.append(button);
    });
    const hint = element(doc, "p", "picr-field-hint", "Wybierz jednostki zgodne z wynikiem laboratorium.");
    layout.concentration = element(doc, "div", "picr-mode-fields"); layout.concentration.id = "picrConcentrationFields";
    layout.reported = element(doc, "div", "picr-mode-fields"); layout.reported.id = "picrReportedFields";
    const reportHint = element(doc, "p", "picr-field-hint", "Przepisz wskaźnik razem z jednostką i ewentualnym znakiem nierówności. Masa dotyczy fosforu (P).");
    const material = element(doc, "p", "picr-material"); material.append(element(doc, "span", "", "Materiał"), element(doc, "strong", "", "Dobowa zbiórka moczu (DZM)"));
    layout.assumption = element(doc, "p", "picr-assumption"); layout.facts = element(doc, "p", "picr-known-facts"); layout.facts.hidden = true;
    card.append(mode, hint, layout.concentration, layout.reported, material, layout.assumption, layout.facts);
    const clear = doc.getElementById("clearContainer"); if (clear?.parentNode === form) form.insertBefore(card, clear); else form.append(card);
    fieldRow(layout, layout.concentration, "PICR_phosphorus", "PICR_phosphorusUnit");
    layout.massHint = element(doc, "p", "picr-field-hint picr-mass-hint", "mg P oznacza masę fosforu, nie masę jonu PO₄.");
    layout.massHint.id = "picrMassHint"; layout.concentration.append(layout.massHint);
    const phosphorusControl = doc.getElementById("PICR_phosphorus");
    phosphorusControl.setAttribute("aria-describedby", [phosphorusControl.getAttribute("aria-describedby"), "picrMassHint"].filter(Boolean).join(" "));
    fieldRow(layout, layout.concentration, "PICR_creatinine", "PICR_creatinineUnit");
    fieldRow(layout, layout.reported, "PICR_reportedValue", "PICR_reportedUnit"); layout.reported.append(reportHint);
    layout.onEdit = event => { if (String(event.target?.id || "").startsWith("PICR_")) refreshLayout(layout); };
    form.addEventListener("input", layout.onEdit); form.addEventListener("change", layout.onEdit);
    refreshLayout(layout); return layout;
  }
  function restore(doc) {
    const layout = layouts.get(doc);
    if (layout) {
      [...layout.moves].reverse().forEach(({ view, anchor, attributes, unit, hidden }) => {
        if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
        anchor.remove(); view.wrapper.classList.remove("picr-entry-field"); if (unit) view.wrapper.classList.remove("picr-unit-field"); view.wrapper.hidden = hidden;
        Object.entries(attributes).forEach(([key, value]) => value === null ? view.control.removeAttribute(key) : view.control.setAttribute(key, value));
      });
      layout.card.remove(); layout.form.removeEventListener("input", layout.onEdit); layout.form.removeEventListener("change", layout.onEdit); layouts.delete(doc);
    }
    doc?.documentElement?.removeAttribute("data-clcr-picr-active");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) { layout = createLayout(doc, options); if (!layout) return; layouts.set(doc, layout); }
    layout.options = options; doc.documentElement.dataset.clcrPicrActive = "1"; refreshLayout(layout);
  }
  function refresh(doc) { const layout = layouts.get(doc); if (layout) refreshLayout(layout); }
  function valueMarkup(shown) {
    const scientific = /^([<>≤≥]?≈?\d+(?:[.,]\d+)?)[eE]([+-]?\d+)$/.exec(shown);
    if (!scientific) return { html: escape(shown), scientific: false };
    return { html: `<span class="picr-scientific-mantissa">${escape(scientific[1])}</span><span class="picr-scientific-power">× 10<sup>${escape(scientific[2].replace(/^\+/, ""))}</sup></span>`, scientific: true };
  }
  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło");
    return /^https:\/\//.test(source.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  }
  function precisionMarkup(model, unit) {
    const full = model.display?.fullValueText || `${model.comparator || model.operator || ""}${String(model.rawValue).replace(".", ",")}`;
    const exact = model.display?.fullValueComplete === false ? model.exactValue : null;
    return `<p class="picr-unrounded-result"><strong>Pełna wartość liczbowa:</strong> ${escape(full)} ${escape(unit)}.</p>${exact ? `<p class="picr-unrounded-result">Dokładny ułamek: ${escape(model.comparator || model.operator || "")}${escape(exact.numerator)}/${escape(exact.denominator)} ${escape(unit)}.</p>` : ""}`;
  }
  function contextMarkup(model) {
    const context = model.context || model.snapshot?.context || {}, facts = [];
    if (context.collectionProblem === true || context.collectionProblem === "true" || context.collectionProblem === "yes" || context.knownFacts?.collectionProblem === true) facts.push("Zachowano informację o problemie zbiórki.");
    if (context.collectionHours !== "" && context.collectionHours != null) facts.push(`Zachowany czas zbiórki: ${context.collectionHours} h.`);
    if (context.durationKnown === false || context.durationKnown === "false" || context.durationKnown === "no") facts.push("Czas zbiórki oznaczono jako nieznany.");
    const sameSpecimen = context.concentrationSameSpecimen ?? context.sameSpecimen;
    if (["different", "false", "no"].includes(String(sameSpecimen || ""))) facts.push("Zgłoszono różne zbiórki dla stężeń; gotowy wskaźnik z raportu jest odrębnym wynikiem.");
    if (model.contextNote) facts.push(model.contextNote);
    return facts.length ? `<h3>Zachowane informacje o zbiórce</h3><p>${escape([...new Set(facts)].join(" "))}</p>` : "";
  }
  function calculationMarkup(model) {
    const input = model.input || model.snapshot?.input || {};
    if (model.mode === "direct" || input.mode === "direct") return `Przepisany wskaźnik: ${input.reportedValue ?? ""} ${input.reportedUnit || ""}. Wynik i norma są prezentowane w mg/mg.`;
    const phosphorus = input.phosphorusValue ?? input.phosphorus, creatinine = input.creatinineValue ?? input.creatinine;
    return phosphorus != null && creatinine != null ? `${phosphorus} ${input.phosphorusUnit || ""} fosforu ÷ ${creatinine} ${input.creatinineUnit || ""} kreatyniny, po uzgodnieniu jednostek masowych.` : "Pᵢ/Cr = stężenie fosforu nieorganicznego ÷ stężenie kreatyniny, po uzgodnieniu jednostek masowych.";
  }
  function tableMarkup(model) {
    const rows = Array.isArray(model.referenceTable) ? model.referenceTable : [], reference = model.referenceAvailable ? model.reference : null;
    if (!rows.length) return "";
    const format = value => String(value ?? "").replace(".", ",");
    return `<table class="picr-reference-table"><caption>Wiek w ukończonych latach · mg/mg</caption><thead><tr><th scope="col">Wiek</th><th scope="col">Chłopcy</th><th scope="col">Dziewczęta</th></tr></thead><tbody>${rows.map(row => {
      const current = reference?.sourceLabel === "ARUP" && reference.ageMinYears === row.minAge && reference.ageMaxYears === row.maxAge;
      return `<tr><th scope="row">${escape(row.label)}</th>${["male", "female"].map((sex, index) => {
        const range = row[sex] || {}, selected = current && [index ? "F" : "M", sex, index ? "f" : "m"].includes(reference.sex);
        return `<td${selected ? ' class="picr-reference-cell--active" aria-current="true"' : ""}>${escape(range.display || `${format(range.low)}–${format(range.high)}`)}${selected ? '<span class="picr-reference-current">Norma pacjenta</span>' : ""}</td>`;
      }).join("")}</tr>`;
    }).join("")}</tbody></table>`;
  }
  function axisMarkup(model, reference, shown, unit) {
    if (!reference || model.comparator || model.operator || model.rawValue === 0 || !["normal", "low", "high"].includes(model.status)) return "";
    if (reference.low == null) return `<p class="picr-norm-axis-caption">Norma: wynik poniżej ${escape(String(reference.high).replace(".", ","))} ${escape(unit)}.</p>`;
    const maximum = reference.high * 1.3, low = 100 * reference.low / maximum, high = 100 * reference.high / maximum;
    const aboveScale = model.rawValue > maximum, point = aboveScale ? 98 : 100 * model.rawValue / maximum;
    if (![low, high, point].every(Number.isFinite)) return "";
    return `<div class="picr-norm-axis" role="img" aria-label="Wynik ${escape(shown)} ${escape(unit)}; norma ${escape(reference.display)} ${escape(unit)}${aboveScale ? "; wynik powyżej skali" : ""}"><svg class="picr-norm-graphic" width="100%" height="84" aria-hidden="true" focusable="false"><rect class="picr-norm-background" x="0" y="35" width="100%" height="12" rx="6"/><rect class="picr-norm-band" x="${low}%" y="35" width="${high - low}%" height="12"/><line class="picr-norm-boundary" x1="${low}%" x2="${low}%" y1="30" y2="53"/><line class="picr-norm-boundary" x1="${high}%" x2="${high}%" y1="30" y2="53"/><line class="picr-norm-point" x1="${point}%" x2="${point}%" y1="24" y2="50"/><circle class="picr-norm-point-cap" cx="${point}%" cy="22" r="4"/><text class="picr-norm-band-title" x="${(low + high) / 2}%" y="14">Norma</text><text class="picr-norm-label" x="${low}%" y="72">${escape(String(reference.low).replace(".", ","))}</text><text class="picr-norm-label" x="${high}%" y="72">${escape(String(reference.high).replace(".", ","))}</text></svg><p class="picr-norm-axis-caption">${aboveScale ? "Wynik powyżej skali. Granice normy pozostają widoczne." : "Znacznik pokazuje wynik. Obie granice należą do normy."}</p></div>`;
  }
  function adultReferenceMarkup(model) {
    const bands = model.policy?.bands || model.snapshot?.policy?.bands || [];
    const source = model.sources?.find(item => item.id === "MAYO_SUP24_2026");
    const band = bands.find(item => item.sourceId === source?.id && item.sex === "male" && item.low == null);
    if (!source || !band) return "";
    const high = String(band.high).replace(".", ","), limit = `${band.upperInclusive ? "≤" : "<"}${high}`;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(source.reportDate || "") ? source.reportDate.split("-").reverse().join(".") : source.reportDate || "";
    return `<h3>Dorośli mężczyźni · Mayo</h3><p><strong>Norma: ${escape(limit)} mg/mg.</strong> Odniesienie pochodzi z przykładowego raportu Mayo SUP24${date ? ` (${escape(date)})` : ""}, opisanego jako raport dorosłego mężczyzny. Stosujemy je od ${escape(band.ageMinYears)} lat.${band.upperInclusive ? "" : ` Dokładnie ${escape(high)} mg/mg jest poza przyjętą normą.`} Nie przenosimy tego zakresu na dorosłe kobiety.</p>`;
  }
  function detailsMarkup(model, unit) {
    const alternate = model.alternate || {}, available = model.alternateAvailable ?? alternate.available;
    const alternateUnit = model.alternateUnit || alternate.unit || "";
    const alternateText = alternate.display?.text ?? `${model.comparator || model.operator || ""}${String(model.alternateValue ?? alternate.value ?? "").replace(".", ",")}`;
    const conversion = available ? `Ten sam wskaźnik w jednostce molowej: ${alternateText} ${alternateUnit}.` : alternateUnit ? `Przeliczenie na ${alternateUnit} jest poza zakresem liczbowym kalkulatora. Wynik masowy pozostaje zachowany.` : "";
    const sources = Array.isArray(model.sources) ? model.sources : [];
    return `<details class="clcr-result-details picr-result-details" id="clcr-phosphorus-creatinine-details" data-clcr-formula="PO4_Cr" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Jak rozumieć Pᵢ/Cr?</h3><p>To ilość fosforu odniesiona do kreatyniny w tej samej zbiórce. Na wynik wpływają dieta i leczenie. Wyższa wartość może wynikać z większej ilości fosforu lub mniejszej ilości kreatyniny.</p><h3>Normy według wieku · ARUP</h3><p>Orientacyjne porównanie z zakresem laboratoryjnym ARUP 0020478. Katalog obejmuje dobową zbiórkę oraz próbkę jednorazową; ta pozycja kalkulatora dotyczy DZM.</p>${tableMarkup(model)}<p>Granice zakresu są włączone. Dla wieku poniżej 7 lat i od 18 lat katalog ARUP nie podaje zakresu Pᵢ/Cr.</p>${adultReferenceMarkup(model)}<h3>Obliczenie i jednostki</h3><p>${escape(calculationMarkup(model))}</p>${precisionMarkup(model, unit)}${conversion ? `<p>${escape(conversion)}</p>` : ""}<p>Wynik i norma są w mg/mg. Źródłowe mg/g podzielono przez 1000. Do przeliczenia jednostek molowych stosujemy: fosfor 30,973761998 g/mol, kreatynina 113,12 g/mol. mg P oznacza masę fosforu, nie PO₄.</p><p>Wspólna objętość i czas skracają się w ilorazie; nie trzeba ich wpisywać. Znak ≈ oznacza skrócenie prezentacji, a wielokropek — dalsze cyfry rozwinięcia dziesiętnego. Przy wyniku z nierównością nie pokazujemy dokładnego punktu na osi.</p>${contextMarkup(model)}<h3>Choroby przytarczyc i XLH</h3><p>Sam Pᵢ/Cr nie rozpoznaje nerkowej utraty fosforanów ani choroby przytarczyc. W hipofosfatemii ocenę nerkowego gospodarowania fosforanami wspierają TRP i TmP/GFR, liczone z odpowiednio dobranych próbek moczu i krwi.</p><div class="picr-detail-links"><button type="button" data-clcr-picr-formula="TMP_GFR">TmP/GFR i TRP →</button></div><h3>Dobowe wydalanie fosforu</h3><p>Gdy potrzebna jest ilość fosforu w całej dobie, skorzystaj z osobnego obliczenia. Sam Pᵢ/Cr nie określa ilości mg P/24 h.</p><div class="picr-detail-links"><button type="button" data-clcr-picr-formula="PO4_mgkg">Dobowe wydalanie fosforanów →</button></div><h3>Monitorowanie burosumabu</h3><p>ChPL Crysvita zaleca kontrolę wapnia i fosforanów w moczu co 3 miesiące, lecz nie określa docelowego Pᵢ/Cr. Ten wskaźnik sam nie potwierdza skuteczności leczenia. Odpowiedź ocenia się m.in. na podstawie fosforanów w surowicy na czczo, TmP/GFR i obrazu klinicznego, z uwzględnieniem czasu od dawki.</p><p>Zbiórka dobowa nie zastępuje automatycznie próbki wymaganej do oceny TmP/GFR.</p><h3>Źródła</h3>${sources.map(source => `<p>${sourceMarkup(source)}</p>`).join("")}</details>`;
  }
  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue) || model.rawValue < 0) {
      const missing = ["", "missing-input", "missing-phosphorus", "missing-creatinine", "missing-reported-value"].includes(model.reasonCode || "");
      const empty = model.mode === "direct" ? "Wpisz gotowy wskaźnik Pᵢ/Cr z laboratorium i wybierz jego jednostkę." : "Wpisz stężenie fosforu nieorganicznego i kreatyniny z tej samej dobowej zbiórki moczu.";
      return `<div class="${missing ? "picr-result-empty" : "picr-result-error"}" data-clcr-formula="PO4_Cr"${missing ? "" : ' role="alert"'}><strong>${missing ? "Tutaj pojawi się wynik Pᵢ/Cr" : "Sprawdź dane Pᵢ/Cr"}</strong><p>${escape(model.message || empty)}</p></div>`;
    }
    const shown = String(model.display?.text ?? model.display?.value ?? model.rawValue).replace(".", ","), unit = "mg/mg";
    const value = valueMarkup(shown), snapshot = model.snapshot || model, reference = model.referenceAvailable ? model.reference : null;
    const assessed = reference && !model.comparator && !model.operator && model.rawValue > 0 && ["normal", "low", "high"].includes(model.status);
    const tone = assessed ? model.status === "normal" ? "success" : "warning" : "neutral";
    const attributes = {
      "data-clcr-formula": "PO4_Cr", "data-clcr-series": "PO4_Cr", "data-clcr-source": "PO4_Cr", "data-clcr-code": "picr",
      "data-clcr-value": model.rawValue, "data-clcr-display-value": model.display?.value ?? model.rawValue, "data-clcr-value-length": Math.min(32, shown.length),
      "data-clcr-display-unit": unit, "data-clcr-display-label": "Fosfor nieorganiczny/kreatynina — Pᵢ/Cr (DZM)", "data-clcr-status": model.statusText || "Pᵢ/Cr — bez oceny normy", "data-clcr-assessment": model.status || "unassessed",
      "data-clcr-comparison": assessed ? ({ normal: "within", low: "below", high: "above" }[model.status]) : "", "data-clcr-comparator": model.comparator || model.operator || "", "data-clcr-category": assessed ? model.status : "", "data-clcr-boundary": model.boundary || "",
      "data-clcr-tone": tone, "data-clcr-reference-profile": model.profileId || "", "data-clcr-reference-comparison": Boolean(assessed), "data-clcr-phosphorus-creatinine-snapshot": JSON.stringify(snapshot),
    };
    const norm = `<div class="clcr-result-reference picr-result-reference${reference ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference="picr" data-clcr-reference-kind="${reference ? "range" : "none"}"><p class="clcr-result-reference-label">Norma dla wieku${reference?.sourceLabel ? `<span class="picr-reference-source">${escape(reference.sourceLabel)}</span>` : ""}</p><strong class="clcr-result-reference-value">${escape(reference?.display || "Brak dobranej normy")}</strong><span class="clcr-result-reference-unit">${reference ? unit : "—"}</span></div>`;
    return `<div class="result-box clcr-result-card picr-result-card${tone === "warning" ? " out-of-range" : ""}" data-picr-presentation="B" ${Object.entries(attributes).map(([name, content]) => `${name}="${escape(content)}"`).join(" ")}><p class="clcr-result-interpretation picr-result-status">${escape(model.statusText || "Pᵢ/Cr — bez oceny normy")}</p><div class="clcr-result-main picr-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-scientific="${value.scientific}" aria-label="${escape(shown)}" data-density="${shown.length > 8 ? "long" : shown.length > 6 ? "medium" : "normal"}">${value.html}</strong><span class="clcr-result-unit">${unit}</span></div>${norm}</div>${axisMarkup(model, reference, shown, unit)}${model.message ? `<p class="picr-result-copy">${escape(model.message)}</p>` : ""}</div>${detailsMarkup(model, unit)}`;
  }
  return Object.freeze({ ensureControls, sync, refresh, restore, renderResult });
});
