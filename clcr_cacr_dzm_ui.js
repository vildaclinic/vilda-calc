/* Dedicated DZM controls; result rendering shares the captured Ca/Cr view. */
(function (root, factory) {
  const api = factory(root);
  if (root) { root.ClcrCacrDzmUi = api; if (root.document) api.ensureControls(root.document); }
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const layouts = new WeakMap();
  const INPUT_UNITS = ["mg/dL", "mg/L", "mmol/L", "µmol/L"];
  const REPORTED_UNITS = ["mg/mg", "mg/g", "mmol/mmol", "mg/mmol", "mmol/mol"];
  const ALIASES = Object.freeze({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" });
  const CONTROLS = [
    { id: "CACR_DZM_inputMode", label: "Sposób wpisania wyniku", type: "hidden", value: "concentration" },
    { id: "CACR_DZM_calcium", label: "Wapń w moczu", placeholder: "np. 5" },
    { id: "CACR_DZM_calciumUnit", label: "Jednostka wapnia w moczu", options: INPUT_UNITS, value: "mmol/L" },
    { id: "CACR_DZM_creatinine", label: "Kreatynina w moczu", placeholder: "np. 100" },
    { id: "CACR_DZM_creatinineUnit", label: "Jednostka kreatyniny w moczu", options: INPUT_UNITS, value: "mg/dL" },
    { id: "CACR_DZM_reportedValue", label: "Ca/Cr z wyniku badania", placeholder: "np. 0,20 lub <0,02" },
    { id: "CACR_DZM_reportedUnit", label: "Jednostka gotowego wyniku Ca/Cr", options: REPORTED_UNITS },
    { id: "CACR_DZM_sameSpecimen", label: "Pochodzenie oznaczeń moczu", type: "hidden", value: "assumed" },
    { id: "CACR_DZM_collectionProblem", label: "Znany problem zbiórki", type: "hidden", value: "" },
    { id: "CACR_DZM_collectionHours", label: "Zachowany czas zbiórki", type: "hidden", value: "" },
    { id: "CACR_DZM_durationKnown", label: "Zachowana informacja o czasie zbiórki", type: "hidden", value: "" },
    { id: "CACR_DZM_currentPreterm", label: "Własny bieżący kontekst wcześniaczy", type: "hidden", value: "" },
  ];
  const EDIT_ATTRIBUTES = ["aria-describedby", "aria-invalid"];
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function ensureControls(doc) {
    const form = doc?.getElementById("clcrForm");
    if (!form) return [];
    let registry = doc.getElementById("clcrCacrDzmControlRegistry");
    if (!registry) {
      registry = element(doc, "div", "cacr-dzm-control-registry"); registry.id = "clcrCacrDzmControlRegistry";
      registry.hidden = true; form.append(registry);
    }
    return CONTROLS.map(spec => {
      const existing = doc.getElementById(spec.id);
      if (existing) return existing;
      const control = element(doc, spec.options ? "select" : "input");
      control.id = spec.id; control.setAttribute("aria-label", spec.label);
      if (spec.options) {
        const options = spec.id === "CACR_DZM_reportedUnit" ? [...spec.options, ...Object.keys(ALIASES)] : spec.options;
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
    const anchor = layout.document.createComment(`cacr-dzm-field-origin-${id}`);
    view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
    const attributes = Object.fromEntries(EDIT_ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
    layout.moves.push({ view, anchor, attributes, unit, hidden: view.wrapper.hidden });
    view.wrapper.classList.add("cacr-dzm-entry-field");
    if (unit) view.wrapper.classList.add("cacr-dzm-unit-field");
    view.wrapper.hidden = false; target.append(view.wrapper);
  }
  function fieldRow(layout, host, valueId, unitId) {
    const row = element(layout.document, "div", "cacr-dzm-value-row"); host.append(row);
    moveField(layout, valueId, row, false); moveField(layout, unitId, row, true);
  }
  function refreshLayout(layout) {
    const doc = layout.document, direct = doc.getElementById("CACR_DZM_inputMode")?.value === "direct";
    const report = doc.getElementById("CACR_DZM_reportedUnit");
    if (report && Object.hasOwn(ALIASES, report.value)) report.value = ALIASES[report.value];
    layout.moves.forEach(({ view }) => { view.wrapper.hidden = false; });
    layout.concentration.hidden = direct; layout.reported.hidden = !direct; layout.assumption.hidden = direct;
    layout.modeButtons.forEach(button => button.setAttribute("aria-pressed", String((button.dataset.cacrDzmMode === "direct") === direct)));
    const different = ["different", "false", "no"].includes(String(doc.getElementById("CACR_DZM_sameSpecimen")?.value || ""));
    layout.assumption.textContent = different ? "Oznaczenia z różnych próbek nie pozwalają obliczyć Ca/Cr." : "Przyjmujemy, że oba stężenia pochodzą z tej samej próbki moczu.";
    const problem = ["true", "yes"].includes(String(doc.getElementById("CACR_DZM_collectionProblem")?.value || ""));
    layout.facts.textContent = problem ? "Zachowano informację o problemie zbiórki. Wynik liczbowy jest dostępny, a automatyczna ocena pozostaje wstrzymana." : different && direct ? "Zgłoszone różne próbki dotyczą obliczenia ze stężeń. Gotowy wskaźnik z laboratorium oceniany jest osobno." : "";
    layout.facts.hidden = !layout.facts.textContent;
    layout.card.dataset.cacrDzmMode = direct ? "direct" : "concentration";
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm"); if (!form) return null;
    ensureControls(doc);
    const card = element(doc, "section", "cacr-dzm-input-card"); card.id = "cacrDzmInputCard"; card.setAttribute("aria-label", "Dane do Ca/Cr z dobowej zbiórki moczu");
    const mode = element(doc, "div", "cacr-dzm-input-mode"); mode.setAttribute("role", "group"); mode.setAttribute("aria-label", "Sposób wpisania Ca/Cr z DZM");
    const layout = { document: doc, form, options, card, moves: [], modeButtons: [] };
    [["concentration", "Oblicz ze stężeń"], ["direct", "Gotowy wynik Ca/Cr"]].forEach(([value, label]) => {
      const button = element(doc, "button", "", label); button.type = "button"; button.dataset.cacrDzmMode = value;
      button.setAttribute("aria-controls", value === "direct" ? "cacrDzmReportedFields" : "cacrDzmConcentrationFields");
      button.addEventListener("click", () => {
        const control = doc.getElementById("CACR_DZM_inputMode"); if (!control || control.value === value) return;
        control.value = value;
        const EventType = doc.defaultView?.Event || root.Event;
        if (EventType) control.dispatchEvent(new EventType("change", { bubbles: true }));
        refreshLayout(layout); if (typeof layout.options.onChange === "function") layout.options.onChange();
      });
      layout.modeButtons.push(button); mode.append(button);
    });
    const hint = element(doc, "p", "cacr-dzm-field-hint", "Wybierz jednostki zgodne z wynikiem laboratorium.");
    layout.concentration = element(doc, "div", "cacr-dzm-mode-fields"); layout.concentration.id = "cacrDzmConcentrationFields";
    layout.reported = element(doc, "div", "cacr-dzm-mode-fields"); layout.reported.id = "cacrDzmReportedFields";
    const reportHint = element(doc, "p", "cacr-dzm-field-hint", "Przepisz wskaźnik z jednostką i ewentualnym znakiem nierówności. g/g odpowiada mg/mg, a mol/mol — mmol/mmol.");
    const material = element(doc, "p", "cacr-dzm-material"); material.append(element(doc, "span", "", "Materiał"), element(doc, "strong", "", "Dobowa zbiórka moczu (DZM)"));
    layout.assumption = element(doc, "p", "cacr-dzm-assumption"); layout.facts = element(doc, "p", "cacr-dzm-known-facts"); layout.facts.hidden = true;
    card.append(mode, hint, layout.concentration, layout.reported, material, layout.assumption, layout.facts);
    const clear = doc.getElementById("clearContainer"); if (clear?.parentNode === form) form.insertBefore(card, clear); else form.append(card);
    fieldRow(layout, layout.concentration, "CACR_DZM_calcium", "CACR_DZM_calciumUnit");
    fieldRow(layout, layout.concentration, "CACR_DZM_creatinine", "CACR_DZM_creatinineUnit");
    fieldRow(layout, layout.reported, "CACR_DZM_reportedValue", "CACR_DZM_reportedUnit"); layout.reported.append(reportHint);
    layout.onEdit = event => { if (String(event.target?.id || "").startsWith("CACR_DZM_")) refreshLayout(layout); };
    form.addEventListener("input", layout.onEdit); form.addEventListener("change", layout.onEdit);
    refreshLayout(layout); return layout;
  }
  function restore(doc) {
    const layout = layouts.get(doc);
    if (layout) {
      [...layout.moves].reverse().forEach(({ view, anchor, attributes, unit, hidden }) => {
        if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
        anchor.remove(); view.wrapper.classList.remove("cacr-dzm-entry-field"); if (unit) view.wrapper.classList.remove("cacr-dzm-unit-field"); view.wrapper.hidden = hidden;
        Object.entries(attributes).forEach(([key, value]) => value === null ? view.control.removeAttribute(key) : view.control.setAttribute(key, value));
      });
      layout.card.remove(); layout.form.removeEventListener("input", layout.onEdit); layout.form.removeEventListener("change", layout.onEdit); layouts.delete(doc);
    }
    doc.documentElement?.removeAttribute("data-clcr-cacr-dzm-active");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) { layout = createLayout(doc, options); if (!layout) return; layouts.set(doc, layout); }
    layout.options = options; doc.documentElement.dataset.clcrCacrDzmActive = "1"; refreshLayout(layout);
  }
  function refresh(doc) { const layout = layouts.get(doc); if (layout) refreshLayout(layout); }
  function renderResult(result) { return root.ClcrCacrUi?.renderResult(result, { formulaId: "Ca_Cr" }) || '<div class="cacr-result-error" data-clcr-formula="Ca_Cr"><strong>Nie można wyświetlić Ca/Cr z DZM. Odśwież aplikację.</strong></div>'; }
  return Object.freeze({ ensureControls, sync, refresh, restore, renderResult });
});
