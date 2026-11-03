/* Minimal B/Cr DZM controls and one captured result with the applicable reference. */
(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrProteinCreatinineUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const layouts = new WeakMap();
  const legacyControlStates = new WeakMap();
  const PROTEIN_UNITS = ["mg/L", "mg/dL", "g/L"];
  const CREATININE_UNITS = ["mg/dL", "mg/L", "mmol/L", "µmol/L"];
  const REPORTED_UNITS = ["mg/mg", "mg/g", "mg/mmol"];
  const ALIASES = Object.freeze({ "g/g": "mg/mg" });
  const CONTROLS = [
    { id: "BCR_inputMode", label: "Sposób wpisania wyniku B/Cr", type: "hidden", value: "concentration" },
    { id: "BCR_protein", label: "Białko całkowite w moczu", placeholder: "np. 300" },
    { id: "BCR_proteinUnit", label: "Jednostka białka całkowitego w moczu", options: PROTEIN_UNITS, value: "mg/L" },
    { id: "BCR_creatinine", label: "Kreatynina w moczu", placeholder: "np. 100" },
    { id: "BCR_creatinineUnit", label: "Jednostka kreatyniny w moczu", options: CREATININE_UNITS, value: "mg/dL" },
    { id: "BCR_reportedValue", label: "B/Cr z wyniku badania", placeholder: "np. 0,3 lub <0,10" },
    { id: "BCR_reportedUnit", label: "Jednostka gotowego wyniku B/Cr", options: REPORTED_UNITS, value: "mg/mg" },
    { id: "BCR_sameSpecimen", label: "Pochodzenie oznaczeń moczu", type: "hidden", value: "assumed" },
    { id: "BCR_collectionProblem", label: "Znany problem zbiórki", type: "hidden", value: "" },
    { id: "BCR_collectionHours", label: "Zachowany czas zbiórki", type: "hidden", value: "" },
    { id: "BCR_durationKnown", label: "Zachowana informacja o czasie zbiórki", type: "hidden", value: "" },
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
    let registry = doc.getElementById("clcrProteinCreatinineControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "bcr-control-registry"); registry.id = "clcrProteinCreatinineControlRegistry";
      registry.hidden = true; form.append(registry);
    }
    return CONTROLS.map(spec => {
      const existing = doc.getElementById(spec.id);
      if (existing) return existing;
      const control = element(doc, spec.options ? "select" : "input");
      control.id = spec.id; control.setAttribute("aria-label", spec.label);
      if (spec.options) {
        const options = spec.id === "BCR_reportedUnit" ? [...spec.options, ...Object.keys(ALIASES)] : spec.options;
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
  // Historical inputs may contain decimal commas or invalid raw evidence.
  // A number input would silently erase these strings during restoration.
  function prepareLegacyControls(doc) {
    if (!doc) return;
    let states = legacyControlStates.get(doc);
    if (!states) { states = new Map(); legacyControlStates.set(doc, states); }
    ["U_Prot", "V24", "Ucr"].forEach(id => {
      const control = doc.getElementById(id); if (!control) return;
      if (!states.has(id)) states.set(id, { control, type: control.getAttribute("type") || control.type || "text", inputmode: control.getAttribute("inputmode") });
      control.type = "text"; control.setAttribute("type", "text"); control.setAttribute("inputmode", "decimal");
    });
  }
  function restoreLegacyControls(doc) {
    const states = legacyControlStates.get(doc); if (!states) return;
    for (const [id, saved] of states) {
      const raw = String(saved.control.value ?? "");
      const compatibleNumber = raw === "" || /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) && Number.isFinite(Number(raw));
      if (saved.type === "number" && !compatibleNumber) continue;
      saved.control.type = saved.type; saved.control.setAttribute("type", saved.type);
      if (saved.inputmode === null) saved.control.removeAttribute("inputmode"); else saved.control.setAttribute("inputmode", saved.inputmode);
      states.delete(id);
    }
    if (!states.size) legacyControlStates.delete(doc);
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
    const anchor = layout.document.createComment(`bcr-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit, hidden: view.wrapper.hidden });
    view.wrapper.classList.add("bcr-entry-field");
    if (unit) view.wrapper.classList.add("bcr-unit-field");
    view.wrapper.hidden = false; target.append(view.wrapper);
  }
  function fieldRow(layout, host, valueId, unitId) {
    const row = element(layout.document, "div", "bcr-value-row"); host.append(row);
    moveField(layout, valueId, row, false); moveField(layout, unitId, row, true);
  }
  function refreshLayout(layout) {
    const doc = layout.document, mode = doc.getElementById("BCR_inputMode")?.value || "concentration", direct = mode === "direct", legacy = mode === "legacy";
    if (legacy) prepareLegacyControls(doc); else restoreLegacyControls(doc);
    const report = doc.getElementById("BCR_reportedUnit");
    if (report && Object.hasOwn(ALIASES, report.value)) report.value = ALIASES[report.value];
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    layout.concentration.hidden = direct || legacy; layout.reported.hidden = !direct; layout.legacy.hidden = !legacy; layout.assumption.hidden = direct;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.bcrMode === mode)));
    const different = ["different", "false", "no"].includes(String(doc.getElementById("BCR_sameSpecimen")?.value || ""));
    layout.assumption.textContent = different ? "Oznaczenia z różnych zbiórek nie pozwalają obliczyć B/Cr." : "Przyjmujemy, że oba stężenia pochodzą z tej samej wymieszanej zbiórki moczu.";
    const problem = ["true", "yes"].includes(String(doc.getElementById("BCR_collectionProblem")?.value || ""));
    layout.facts.textContent = problem ? "Zachowano informację o problemie zbiórki." : different && direct ? "Informacja o różnych zbiórkach dotyczy obliczenia ze stężeń. Gotowy wskaźnik z laboratorium zachowujemy osobno." : "";
    layout.facts.hidden = !layout.facts.textContent;
    layout.card.dataset.bcrMode = mode;
    const engine = doc.defaultView?.VildaClcrProteinCreatinine || root.VildaClcrProteinCreatinine;
    const completion = engine?.readiness?.(engine.readInputFromDocument(doc));
    layout.readiness.hidden = !completion;
    if (completion) {
      layout.requiredCount.textContent = `${completion.count}/${completion.total}`;
      layout.readiness.dataset.complete = String(completion.count === completion.total);
    }
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm"); if (!form) return null;
    ensureControls(doc);
    const card = element(doc, "section", "bcr-input-card"); card.id = "bcrInputCard"; card.setAttribute("aria-label", "Dane do B/Cr z dobowej zbiórki moczu");
    const mode = element(doc, "div", "bcr-input-mode"); mode.setAttribute("role", "group"); mode.setAttribute("aria-label", "Sposób wpisania B/Cr z DZM");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężeń"], ["direct", "Gotowy wynik B/Cr"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label); button.type = "button"; button.dataset.bcrMode = value;
      button.setAttribute("aria-controls", value === "direct" ? "bcrReportedFields" : "bcrConcentrationFields");
      button.addEventListener("click", () => {
        const control = doc.getElementById("BCR_inputMode"); if (!control || control.value === value) return;
        if (control.value === "legacy" && value === "concentration") {
          for (const id of ["BCR_protein", "BCR_creatinine"]) { const field = doc.getElementById(id); if (field) field.value = ""; }
        }
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout); if (typeof layout.options.onChange === "function") layout.options.onChange();
      });
      layout.modeButtons.push(button); mode.append(button);
    });
    const hint = element(doc, "p", "bcr-field-hint", "Wybierz jednostki zgodne z wynikiem laboratorium.");
    layout.concentration = element(doc, "div", "bcr-mode-fields"); layout.concentration.id = "bcrConcentrationFields";
    layout.reported = element(doc, "div", "bcr-mode-fields"); layout.reported.id = "bcrReportedFields";
    layout.legacy = element(doc, "div", "bcr-mode-fields"); layout.legacy.id = "bcrLegacyFields";
    layout.legacy.append(element(doc, "p", "bcr-field-hint bcr-legacy-note", "Odtworzono dane dawnego formularza: ilość białka w całej zbiórce."));
    const reportHint = element(doc, "p", "bcr-field-hint", "Przepisz wskaźnik razem z jednostką i ewentualnym znakiem nierówności.");
    const material = element(doc, "p", "bcr-material"); material.append(element(doc, "span", "", "Materiał"), element(doc, "strong", "", "Dobowa zbiórka moczu (DZM)"));
    layout.assumption = element(doc, "p", "bcr-assumption"); layout.facts = element(doc, "p", "bcr-known-facts"); layout.facts.hidden = true;
    layout.readiness = element(doc, "p", "bcr-readiness"); layout.readiness.setAttribute("aria-live", "polite");
    layout.requiredCount = element(doc, "strong", "", "0/2"); layout.requiredCount.id = "bcrRequiredCount";
    layout.readiness.append(element(doc, "span", "", "Wymagane dane"), layout.requiredCount);
    card.append(mode, hint, layout.concentration, layout.reported, layout.legacy, material, layout.assumption, layout.facts, layout.readiness);
    const clear = doc.getElementById("clearContainer"); if (clear?.parentNode === form) form.insertBefore(card, clear); else form.append(card);
    fieldRow(layout, layout.concentration, "BCR_protein", "BCR_proteinUnit");
    fieldRow(layout, layout.concentration, "BCR_creatinine", "BCR_creatinineUnit");
    fieldRow(layout, layout.reported, "BCR_reportedValue", "BCR_reportedUnit"); layout.reported.append(reportHint);
    [["U_Prot", "mg"], ["V24", "mL"], ["Ucr", "mg/dL"]].forEach(([id, unit]) => {
      const row = element(doc, "div", "bcr-value-row bcr-legacy-row"); layout.legacy.append(row);
      moveField(layout, id, row, false); row.append(element(doc, "span", "bcr-fixed-unit", unit));
    });
    layout.onEdit = event => { if (String(event.target?.id || "").startsWith("BCR_") || ["U_Prot", "V24", "Ucr"].includes(event.target?.id)) refreshLayout(layout); };
    form.addEventListener("input", layout.onEdit); form.addEventListener("change", layout.onEdit);
    refreshLayout(layout); return layout;
  }
  function restore(doc) {
    const layout = layouts.get(doc);
    if (layout) {
      [...layout.moves].reverse().forEach(({ view, anchor, attributes, unit, hidden }) => {
        if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
        anchor.remove(); view.wrapper.classList.remove("bcr-entry-field"); if (unit) view.wrapper.classList.remove("bcr-unit-field"); view.wrapper.hidden = hidden;
        Object.entries(attributes).forEach(([key, value]) => value === null ? view.control.removeAttribute(key) : view.control.setAttribute(key, value));
      });
      layout.card.remove(); layout.form.removeEventListener("input", layout.onEdit); layout.form.removeEventListener("change", layout.onEdit); layouts.delete(doc);
    }
    restoreLegacyControls(doc);
    doc?.documentElement?.removeAttribute("data-clcr-bcr-active");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) { layout = createLayout(doc, options); if (!layout) return; layouts.set(doc, layout); }
    layout.options = options; doc.documentElement.dataset.clcrBcrActive = "1"; refreshLayout(layout);
  }
  function refresh(doc) { const layout = layouts.get(doc); if (layout) refreshLayout(layout); }
  function valueMarkup(shown) {
    const scientific = /^([<>≤≥]?≈?\d+(?:[.,]\d+)?)[eE]([+-]?\d+)$/.exec(shown);
    if (!scientific) return { html: escape(shown), scientific: false };
    return { html: `<span class="bcr-scientific-mantissa">${escape(scientific[1])}</span><span class="bcr-scientific-power">× 10<sup>${escape(scientific[2].replace(/^\+/, ""))}</sup></span>`, scientific: true };
  }
  function sourceMarkup(source) {
    const label = escape(source.label || source.title || "Źródło");
    return /^https:\/\//.test(source.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  }
  function precisionMarkup(model, unit) {
    const full = model.display?.fullValueText || `${model.comparator || model.operator || ""}${String(model.rawValue).replace(".", ",")}`;
    const exact = model.display?.fullValueComplete === false ? model.exactValue : null;
    return `<p class="bcr-unrounded-result"><strong>Pełna wartość liczbowa:</strong> ${escape(full)} ${escape(unit)}.</p>${exact ? `<p class="bcr-unrounded-result">Dokładny ułamek: ${escape(model.comparator || model.operator || "")}${escape(exact.numerator)}/${escape(exact.denominator)} ${escape(unit)}.</p>` : ""}`;
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
    if (model.mode === "legacy" || input.mode === "legacy") return `Dane dawnego formularza: białko w całej zbiórce ${input.legacyProteinMassMg ?? ""} mg, objętość ${input.legacyVolumeMl ?? ""} mL, kreatynina ${input.legacyCreatinineMgDl ?? ""} mg/dL. B/Cr = masa białka ÷ (stężenie kreatyniny × objętość), po uzgodnieniu jednostek.`;
    if (model.mode === "direct" || input.mode === "direct") return `Przepisany wskaźnik: ${input.reportedValue ?? ""} ${input.reportedUnit || ""}. Wynik i norma są prezentowane w mg/mg.`;
    const protein = input.proteinValue ?? input.protein, creatinine = input.creatinineValue ?? input.creatinine;
    return protein != null && creatinine != null ? `${protein} ${input.proteinUnit || ""} białka ÷ ${creatinine} ${input.creatinineUnit || ""} kreatyniny, po uzgodnieniu jednostek masowych.` : "B/Cr = stężenie białka całkowitego ÷ stężenie kreatyniny, po uzgodnieniu jednostek masowych.";
  }
  function tableMarkup(model) {
    const rows = Array.isArray(model.referenceTable) ? model.referenceTable : [], reference = model.referenceAvailable ? model.reference : null;
    if (!rows.length) return "";
    const format = value => String(value ?? "").replace(".", ",");
    return `<table class="bcr-reference-table"><caption>Pełne przedziały źródłowe · B/Cr w mg/mg</caption><thead><tr><th scope="col">Wiek</th><th scope="col">Chłopcy</th><th scope="col">Dziewczynki</th></tr></thead><tbody>${rows.map(row => {
      const current = reference?.sourceLabel === "ARUP" && reference.ageMinYears === row.minAge && reference.ageMaxYears === row.maxAge;
      return `<tr><th scope="row">${escape(row.label)}</th>${["male", "female"].map((sex, index) => {
        const range = row[sex] || {}, selected = current && [index ? "F" : "M", sex, index ? "f" : "m"].includes(reference.sex);
        const bounds = String(range.display || `${format(range.low)}–${format(range.high)}`).split("–");
        return `<td${selected ? ' class="bcr-reference-cell--active" aria-current="true"' : ""}><span class="bcr-table-range"><span>${escape(bounds[0])}–</span><span>${escape(bounds[1] || "")}</span></span>${selected ? '<span class="bcr-reference-current">Zakres pacjenta</span>' : ""}</td>`;
      }).join("")}</tr>`;
    }).join("")}</tbody></table>`;
  }
  function axisMarkup(model, reference, shown, unit) {
    if (!reference || model.comparator || model.operator || model.rawValue === 0 || !["normal", "high"].includes(model.status)) return "";
    const maximum = reference.high * 2, aboveScale = model.rawValue > maximum;
    const point = Math.max(1, Math.min(99, 100 * model.rawValue / maximum));
    if (!Number.isFinite(point) || !Number.isFinite(maximum) || maximum <= 0) return "";
    const pediatric = reference.sourceLabel === "ARUP" || reference.kind === "laboratory-interval";
    const upper = escape(String(reference.high).replace(".", ","));
    const caption = pediatric ? `Górna granica normy: ${upper} ${escape(unit)}.` : `Zakres KDIGO: poniżej ${upper} ${escape(unit)}.`;
    return `<div class="bcr-norm-axis" role="img" aria-label="Wynik ${escape(shown)} ${escape(unit)}; ${escape(pediatric ? "górna granica normy" : "zakres wg KDIGO")} ${escape(reference.display)} ${escape(unit)}${aboveScale ? "; wynik powyżej skali" : ""}"><svg class="bcr-norm-graphic" width="100%" height="88" aria-hidden="true" focusable="false"><rect class="bcr-norm-background" x="0" y="37" width="100%" height="12" rx="6"/><rect class="bcr-norm-band" x="0" y="37" width="50%" height="12" rx="6"/><line class="bcr-norm-boundary" x1="50%" x2="50%" y1="32" y2="55"/><line class="bcr-norm-point" x1="${point}%" x2="${point}%" y1="26" y2="52"/><circle class="bcr-norm-point-cap" cx="${point}%" cy="24" r="4"/><text class="bcr-norm-point-title" x="${point}%" y="13" text-anchor="${point > 80 ? "end" : point < 20 ? "start" : "middle"}">Wynik${aboveScale ? " →" : ""}</text><text class="bcr-norm-band-title" x="25%" y="76">${pediatric ? "do granicy" : "zakres KDIGO"}</text><text class="bcr-norm-label bcr-norm-label--start" x="0" y="76">0</text><text class="bcr-norm-label" x="50%" y="76">${upper}</text></svg><p class="bcr-norm-axis-caption">${aboveScale ? "Wynik powyżej skali. " : ""}${caption}</p></div>`;
  }
  function pediatricReferenceMarkup(model) {
    const source = model.sources?.find(item => item.shortLabel === "ARUP" || item.id === "ARUP_0020479");
    if (!source || !model.referenceTable?.length) return "";
    const adolescent = model.referenceTable.find(row => row.minAge === 13 && row.maxAge === 16);
    const sexException = adolescent ? ` W grupie 13–<16 lat górna granica wynosi ${String(adolescent.female?.high).replace(".", ",")} u dziewczynek i ${String(adolescent.male?.high).replace(".", ",")} mg/mg u chłopców.` : "";
    return `<h3>Normy dla wieku i płci · 7–17 lat</h3><p><strong>Źródło zakresu przyjętego w aplikacji: ${sourceMarkup({ ...source, label: "ARUP" })}.</strong> Katalog badania przyjmuje mocz z dobowej zbiórki. To zakres laboratoryjny przyjęty do porównania; aplikacja nie zna laboratorium wykonującego badanie pacjenta.</p>${tableMarkup(model)}<p>W głównej karcie pokazujemy górną granicę. Wynik równy tej granicy pozostaje niepodwyższony; jest to przyjęty sposób odczytu przedziałów ARUP. Niski wskaźnik nie jest rozpoznaniem niedoboru białka. Źródłowe mg/g przeliczono dokładnie na mg/mg przez podzielenie przez 1000.</p><h3>Dlaczego zakresy zależą od płci?</h3><p>Kreatynina jest w mianowniku B/Cr. Mniejsze jej wydalanie może dać większy iloraz przy takiej samej ilości białka. Wydalanie kreatyniny wiąże się m.in. z masą mięśniową i dojrzewaniem.</p><p>Granice nie są jednak zawsze wyższe u dziewczynek.${escape(sexException)} To zakresy z katalogu, a nie wartości wyliczone ze wzoru na płeć. Katalog nie podaje pełnej metodyki ustalenia obecnej tabeli.</p>`;
  }
  function adultReferenceMarkup(model) {
    const policy = model.policy || model.snapshot?.policy || {}, categories = model.adultCategories || policy.adultCategories || [];
    const source = model.sources?.find(item => item.shortLabel === "KDIGO 2020" || item.id === "KDIGO_2020_TABLE_2");
    if (!source || !categories.length) return "";
    return `<h3>Zakresy B/Cr wg KDIGO · dorośli</h3><table class="bcr-reference-table bcr-adult-table"><thead><tr><th scope="col">B/Cr · mg/mg</th><th scope="col">Opis</th></tr></thead><tbody>${categories.map(row => `<tr${model.reference?.kind === "clinical-comparison" && model.category?.id === row.id && ["normal", "high"].includes(model.status) ? ' class="bcr-category-row--active" aria-current="true"' : ""}><td>${escape(String(row.display || row.range || "").replaceAll(".", ","))}</td><td>${escape(row.label)}</td></tr>`).join("")}</tbody></table><p><strong>KDIGO 2020, tabela 2:</strong> opublikowane kategorie PCR dotyczą zbiórki czasowej lub próbki jednorazowej. W aplikacji porównujemy z nimi wyniki dorosłych od 18 lat. To odniesienie kliniczne, nie przedział wyznaczony osobno dla wieku i płci.</p><p>Wartości źródłowe mg/g przeliczono dokładnie na mg/mg przez podzielenie przez 1000. Pierwsza granica jest ścisła; druga należy do środkowego przedziału. Do konwersji mg/mmol używamy masy molowej kreatyniny 113,12 mg/mmol, bez zastępowania dokładnych progów przybliżonymi wartościami w innej jednostce.</p>`;
  }
  function detailsMarkup(model, unit) {
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const pediatric = pediatricReferenceMarkup(model), adult = adultReferenceMarkup(model);
    const referenceDetails = model.reference?.kind === "clinical-comparison" || model.context?.ageYears >= 18 ? adult + pediatric : pediatric + adult;
    return `<details class="clcr-result-details bcr-result-details" id="clcr-protein-creatinine-details" data-clcr-formula="B_Cr" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Jak rozumieć B/Cr?</h3><p>To ilość białka całkowitego odniesiona do kreatyniny w tej samej zbiórce. Wyższy wskaźnik może wynikać z większej ilości białka lub mniejszej ilości kreatyniny. Sam B/Cr nie określa dobowej utraty białka w mg/24 h.</p>${referenceDetails}<p>Dla dzieci poniżej 7 lat nie przyjęto normy B/Cr dla DZM; wynik liczbowy pozostaje dostępny. Nie przenosimy automatycznie norm pediatrycznej próbki jednorazowej. Wiek i płeć pobieramy z danych pacjenta, bez nowych pytań w tym formularzu.</p><h3>Obliczenie i jednostki</h3><p>${escape(calculationMarkup(model))}</p>${precisionMarkup(model, unit)}<p>B/Cr = białko [mg/L] ÷ kreatynina [mg/L]. Wspólna objętość i czas skracają się w ilorazie; nie trzeba ich wpisywać. Do przeliczenia kreatyniny stosujemy 113,12 mg/mmol. Gotowe mg/g dzielimy przez 1000, a mg/mmol przez 113,12.</p><p>Znak ≈ oznacza skrócenie prezentacji, a wielokropek — dalsze cyfry rozwinięcia dziesiętnego. Przy wyniku z nierównością nie pokazujemy dokładnego punktu na osi.</p>${contextMarkup(model)}<h3>Źródła</h3>${sources.map(source => `<p>${sourceMarkup(source)}${source.limitation ? `<span class="bcr-source-note">${escape(source.limitation)}</span>` : ""}</p>`).join("")}</details>`;
  }
  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue) || model.rawValue < 0) {
      const missing = ["", "missing-input", "missing-protein", "missing-creatinine", "missing-reported-value", "missing-legacy-protein", "missing-legacy-volume"].includes(model.reasonCode || "");
      const empty = model.mode === "direct" ? "Wpisz gotowy wskaźnik B/Cr z laboratorium i wybierz jego jednostkę." : "Wpisz stężenie białka całkowitego i kreatyniny z tej samej dobowej zbiórki moczu.";
      return `<div class="${missing ? "bcr-result-empty" : "bcr-result-error"}" data-clcr-formula="B_Cr"${missing ? "" : ' role="alert"'}><strong>${missing ? "Tutaj pojawi się wynik B/Cr" : "Sprawdź dane B/Cr"}</strong><p>${escape(model.message || empty)}</p></div>`;
    }
    const shown = String(model.display?.text ?? model.display?.value ?? model.rawValue).replace(".", ","), unit = "mg/mg";
    const value = valueMarkup(shown), snapshot = model.snapshot || model, reference = model.referenceAvailable ? model.reference : null;
    const assessed = reference && !model.comparator && !model.operator && model.rawValue > 0 && ["normal", "high"].includes(model.status);
    const tone = assessed ? model.status === "normal" ? "success" : "warning" : "neutral";
    const attributes = {
      "data-clcr-formula": "B_Cr", "data-clcr-series": "B_Cr", "data-clcr-source": "B_Cr", "data-clcr-code": "bcr",
      "data-clcr-value": model.rawValue, "data-clcr-display-value": model.display?.value ?? model.rawValue, "data-clcr-value-length": Math.min(32, shown.length),
      "data-clcr-display-unit": unit, "data-clcr-display-label": "Białko całkowite/kreatynina — B/Cr (DZM)", "data-clcr-status": model.statusText || "B/Cr — bez oceny normy", "data-clcr-assessment": model.status || "unassessed",
      "data-clcr-comparison": assessed ? ({ normal: "within", low: "below", high: "above" }[model.status]) : "", "data-clcr-comparator": model.comparator || model.operator || "", "data-clcr-category": assessed ? model.category?.id || model.status : "", "data-clcr-boundary": model.boundary || "",
      "data-clcr-tone": tone, "data-clcr-reference-profile": model.profileId || "", "data-clcr-reference-comparison": Boolean(assessed), "data-clcr-protein-creatinine-snapshot": JSON.stringify(snapshot),
    };
    const pediatric = reference?.sourceLabel === "ARUP" || reference?.kind === "laboratory-interval";
    const referenceCaption = reference ? pediatric ? "Górna granica normy" : "Zakres wg KDIGO" : "Porównanie";
    const norm = `<div class="clcr-result-reference bcr-result-reference${reference ? "" : " clcr-result-reference--unavailable"}" data-clcr-reference="bcr" data-clcr-reference-kind="${reference ? "upper-limit" : "none"}"><p class="clcr-result-reference-label">${referenceCaption}${pediatric ? '<span class="bcr-reference-context">Dla wieku i płci</span>' : ""}</p><strong class="clcr-result-reference-value">${escape(reference?.display || "Brak dobranej normy")}</strong><span class="clcr-result-reference-unit">${reference ? unit : "—"}</span></div>`;
    return `<div class="result-box clcr-result-card bcr-result-card${tone === "warning" ? " out-of-range" : ""}" data-bcr-presentation="B" ${Object.entries(attributes).map(([name, content]) => `${name}="${escape(content)}"`).join(" ")}><p class="clcr-result-interpretation bcr-result-status">${escape(model.statusText || "B/Cr — bez oceny normy")}</p><div class="clcr-result-main bcr-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value" data-scientific="${value.scientific}" aria-label="${escape(shown)}" data-density="${shown.length > 8 ? "long" : shown.length > 6 ? "medium" : "normal"}">${value.html}</strong><span class="clcr-result-unit">${unit}</span></div>${norm}</div>${axisMarkup(model, reference, shown, unit)}${model.message ? `<p class="bcr-result-copy">${escape(model.message)}</p>` : ""}${model.display?.approximate ? '<p class="bcr-result-copy bcr-precision-note">≈ Skrócony zapis; dokładniejsza wartość w Szczegółach.</p>' : ""}</div>${detailsMarkup(model, unit)}`;
  }
  return Object.freeze({ ensureControls, prepareLegacyControls, sync, refresh, restore, renderResult });
});
