/* Shared numeric duration for new timed urine collections. Historical reads
 * never call this module; historical edits must explicitly request no default.
 */
(function (root, factory) {
  const api = factory(root || {});
  if (root) root.ClcrCollectionDuration = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const HOURS_ID = "Cl24DurationHours";
  const SOURCE_ID = "Cl24DurationSource";
  const HOURS_FIELDS = Object.freeze([HOURS_ID, "CA_collectionHours", "UA_collectionHours", "MG_collectionHours", "PO4_collectionHours", "Prot_collectionHours", "Na_collectionHours"]);
  const SOURCES = Object.freeze({ [HOURS_ID]: SOURCE_ID, CA_collectionHours: "CA_collectionSource", UA_collectionHours: "UA_collectionSource", MG_collectionHours: "MG_collectionSource", PO4_collectionHours: "PO4_collectionSource", Prot_collectionHours: "Prot_collectionSource", Na_collectionHours: "Na_collectionSource" });
  const FORMULA_FIELDS = Object.freeze({ Na_mmol_d: Object.freeze({ fieldId: "Na_collectionHours", sourceId: "Na_collectionSource", modeId: "Na_inputMode",
    concentration: Object.freeze(["Na_concentration", "Na_volume", "Na_collectionHours"]), reported: Object.freeze(["Na_reportedValue"]) }) });
  const PROTOCOL_IDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const PROTOCOL_KEYS = Object.freeze(["startVoidDiscarded", "finalVoidIncluded", "noMissedVoids", "noSpillage", "noExtraVoids", "storageFollowed"]);
  const bindings = new WeakMap(), layouts = new WeakMap();
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const confirmed = value => value === true || value === "true";
  const confirmationId = fieldId => fieldId === HOURS_ID ? "durationNeedsConfirmation" : fieldId.split("_")[0] + "_durationNeedsConfirmation";

  function historicalControl(control) {
    const doc = control?.ownerDocument, vault = doc?.defaultView?.__vildaClcrVersionValueVault || {};
    const sourceId = SOURCES[control?.id], flagId = confirmationId(control?.id || HOURS_ID);
    const source = doc?.getElementById?.(sourceId)?.value ?? vault[sourceId];
    const flag = doc?.getElementById?.(flagId);
    return source === "historical-missing" || control?.id === "Na_collectionHours" && source === "invalid" || confirmed(flag ? flag.type === "checkbox" ? flag.checked : flag.value : vault[flagId]);
  }
  function updateDurationSummary(layout, duration) {
    const unresolved = !duration.valid && historicalControl(layout.control);
    layout.value.textContent = unresolved ? "Uzupełnij czas" : `${String(duration.valid ? duration.hours : layout.control.value).replace(".", ",")} godz.`;
    layout.hint.textContent = unresolved
      ? "W tym zapisie nie utrwalono czasu zbiórki. Wpisz rzeczywistą liczbę godzin."
      : "Jeśli pole pozostanie puste, przyjmujemy 24 h. Dla zbiórki trwającej inaczej wpisz rzeczywisty czas.";
  }

  function parseHours(value) {
    if (absent(value)) return null;
    if (typeof value !== "number" && typeof value !== "string") return null;
    const text = String(value).trim();
    if (!/^\+?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    const hours = Number(text.replace(",", "."));
    return Number.isFinite(hours) && hours > 0 && Number.isFinite(hours * 60) ? hours : null;
  }
  function resolveHours(value, options = {}) {
    const missing = absent(value);
    const hours = missing && options.historical !== true ? 24 : parseHours(value);
    const valid = hours !== null;
    const assumed = valid && (missing || hours === 24 && options.source === "assumed-24h");
    const source = valid ? assumed ? "assumed-24h" : ["hours", "captured", "legacy-dates"].includes(options.source) ? options.source : "hours" : missing ? "historical-missing" : "invalid";
    return { valid, hours, minutes: valid ? hours * 60 : null, source, assumed, missing: !valid && missing, invalid: !valid && !missing,
      error: valid ? "" : missing ? "Wpisz czas zbiórki w godzinach — nie został utrwalony w tym zapisie." : "Wpisz prawidłowy czas zbiórki większy od 0 godzin." };
  }
  function collectionFacts(values = {}, context = {}) {
    const protocol = {}, knownProblems = [];
    const facts = { ...(context.knownFacts || {}), ...(values.knownFacts || {}) };
    PROTOCOL_IDS.forEach((id, index) => {
      const key = PROTOCOL_KEYS[index];
      // An unchecked legacy checkbox is unconfirmed, not a negative finding.
      const negative = values[`ui_${id}_answer`] === "no" || facts[id] === false || facts[`ui_${id}_answer`] === "no" || context.protocol?.[key] === false;
      protocol[key] = !negative;
      if (negative) knownProblems.push(id);
    });
    if (values.Cl24CollectionProblem === true || facts.Cl24CollectionProblem === true || context.collectionProblem === true) knownProblems.push("Cl24CollectionProblem");
    return { complete: knownProblems.length === 0, protocol, knownProblems, protocolMode: "assumed-complete", collectionAssumptions: { collectionCompleteness: knownProblems.length ? "known-problem" : "assumed" } };
  }
  function fromValues(values = {}, context = {}, options = {}) {
    const fieldId = options.fieldId || HOURS_ID, sourceId = options.sourceId || SOURCES[fieldId] || SOURCE_ID;
    const flagId = confirmationId(fieldId);
    const explicitInvalid = fieldId === "Na_collectionHours" && values[sourceId] === "invalid";
    const historical = options.historical === true || confirmed(values.durationNeedsConfirmation) || confirmed(values[flagId]) || values[sourceId] === "historical-missing" || explicitInvalid || context.durationHistorical === true || context.durationNeedsConfirmation === true;
    let hours, source;
    const needsCapturedFallback = !own(values, fieldId) || historical && absent(values[fieldId]) && absent(values[sourceId]);
    if (!needsCapturedFallback) { hours = values[fieldId]; source = values[sourceId]; }
    else if (own(context, "collectionHours")) { hours = context.collectionHours; source = context.durationSource || "captured"; }
    else if (own(context, "durationHours")) { hours = context.durationHours; source = context.durationSource || "captured"; }
    else {
      const minutes = [context.durationMinutes, context.collectionDurationMinutes, context.collectionAnalysis?.durationMinutes].find(value => finite(value) && value > 0);
      if (minutes !== undefined) { hours = minutes / 60; source = "captured"; }
    }
    const duration = resolveHours(hours, { historical, source });
    if (explicitInvalid) Object.assign(duration, { valid: false, hours: null, minutes: null, assumed: false, source: "invalid", missing: false, invalid: true,
      error: "Wpisz prawidłowy czas zbiórki większy od 0 godzin." });
    return { ...duration, ...collectionFacts(values, context) };
  }
  function readFromDocument(documentRef, options = {}) {
    const doc = documentRef || root.document, values = {}, vault = doc?.defaultView?.__vildaClcrVersionValueVault || {};
    const fieldId = options.fieldId || HOURS_ID, sourceId = options.sourceId || SOURCES[fieldId] || SOURCE_ID;
    for (const id of [fieldId, sourceId, confirmationId(fieldId), "Cl24CollectionProblem", ...PROTOCOL_IDS, ...PROTOCOL_IDS.map(id => `ui_${id}_answer`)]) {
      const control = doc?.getElementById?.(id);
      if (control) values[id] = control.type === "checkbox" ? control.checked : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    return fromValues(values, options.context || {}, options);
  }
  // A native form.reset() clears dynamically mounted text inputs even though
  // their new-collection meaning remains an assumed24h. Persist that meaning
  // consistently with restoration, without changing the focused editor, its
  // DOM value or the version-value vault while a doctor is still typing.
  function normalizeCapturedInputs(values = {}) {
    const result = { ...values };
    for (const fieldId of HOURS_FIELDS) {
      if (!own(values, fieldId)) continue;
      const sourceId = SOURCES[fieldId], flagId = confirmationId(fieldId);
      const historical = values[sourceId] === "historical-missing" || confirmed(values[flagId]);
      const explicitInvalid = fieldId === "Na_collectionHours" && values[sourceId] === "invalid";
      if (absent(values[fieldId]) && !historical && !explicitInvalid) {
        result[fieldId] = "24";
        result[sourceId] = "assumed-24h";
      }
      // Existing DOM strings and older boolean metadata are both retained.
      // False means no unresolved historical gap, never a valid collection.
      if (!own(values, flagId)) result[flagId] = historical;
    }
    return result;
  }
  function resolveFormulaFields(formulaId) { return FORMULA_FIELDS[formulaId] || null; }
  function requiredFields(formulaId, values = {}) {
    const fields = resolveFormulaFields(formulaId);
    return fields ? fields[values[fields.modeId] === "reported" ? "reported" : "concentration"].slice() : null;
  }
  function bindControl(control, options = {}) {
    if (!control) return control;
    const doc = control.ownerDocument;
    const sourceControl = options.sourceControl || doc?.getElementById?.(SOURCES[control.id]);
    if (bindings.has(control)) { if (sourceControl) bindings.get(control).sourceControl = sourceControl; return control; }
    const binding = { sourceControl };
    const mark = value => { if (binding.sourceControl) binding.sourceControl.value = value; };
    control.addEventListener("input", event => {
      if (event.isTrusted !== false) {
        const positive = parseHours(control.value) !== null;
        if (!historicalControl(control) || positive) mark(absent(control.value) ? "assumed-24h" : "hours");
        if (positive) {
          const flagId = confirmationId(control.id), flag = doc?.getElementById?.(flagId);
          if (flag) { if (flag.type === "checkbox") flag.checked = false; else flag.value = "false"; }
          const vault = doc?.defaultView?.__vildaClcrVersionValueVault;
          if (vault && typeof vault === "object") vault[flagId] = false;
        }
      }
      const layout = layouts.get(doc);
      if (layout?.control === control) updateDurationSummary(layout, readFromDocument(doc));
    }, true);
    control.addEventListener("blur", () => {
      if (!absent(control.value) || historicalControl(control)) return;
      control.value = "24";
      mark("assumed-24h");
      const EventClass = doc?.defaultView?.Event || root.Event;
      if (typeof EventClass === "function") control.dispatchEvent(new EventClass("input", { bubbles: true }));
    });
    bindings.set(control, binding);
    return control;
  }
  function ensureDefaults(documentRef) {
    const doc = documentRef || root.document;
    if (!doc?.getElementById) return;
    for (const id of HOURS_FIELDS) {
      const control = doc.getElementById(id);
      if (!control) continue;
      const source = doc.getElementById(SOURCES[id]);
      if (historicalControl(control)) { bindControl(control, { sourceControl: source }); continue; }
      if (absent(control.value)) { control.value = "24"; if (source) source.value = "assumed-24h"; }
      else if (source && (absent(source.value) || source.value === "assumed-24h" && parseHours(control.value) !== 24)) source.value = "hours";
      bindControl(control, { sourceControl: source });
    }
  }
  function element(doc, name, className, text) {
    const node = doc.createElement(name);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function syncDurationView(documentRef, options = {}) {
    const doc = documentRef || root.document, view = options.fieldViews?.get(HOURS_ID);
    const control = view?.control || doc?.getElementById?.(HOURS_ID), wrapper = view?.wrapper || control?.closest?.("label");
    if (!control || !wrapper?.parentNode) return;
    let layout = layouts.get(doc);
    if (!options.active) {
      if (layout) {
        if (wrapper.parentNode === layout.editor) {
          if (layout.anchor.parentNode && layout.anchor.isConnected !== false) layout.anchor.parentNode.insertBefore(wrapper, layout.anchor);
          else (view?.originalParent?.isConnected ? view.originalParent : doc.getElementById("dzmSet") || doc.getElementById("clcrForm") || doc.body)?.append(wrapper);
        }
        layout.host.remove(); layout.anchor.remove(); layouts.delete(doc);
      }
      return;
    }
    if (!layout) {
      const anchor = doc.createComment("clcr-duration-origin");
      wrapper.parentNode.insertBefore(anchor, wrapper);
      const host = element(doc, "section", "clcr-duration-disclosure"), row = element(doc, "div", "clcr-duration-row");
      const description = element(doc, "div"), value = element(doc, "strong"), button = element(doc, "button", "clcr-duration-change", "Zmień"), editor = element(doc, "div", "clcr-duration-editor");
      host.id = "clcrCommonDuration"; editor.id = "clcrCommonDurationEditor"; button.type = "button";
      button.setAttribute("aria-controls", editor.id); description.append(element(doc, "span", "", "Czas zbiórki"), value); row.append(description, button); host.append(row, editor);
      const hint = element(doc, "p", "clcr-duration-hint");
      editor.append(hint);
      (options.container || wrapper.parentNode).append(host);
      layout = { host, row, value, button, editor, hint, anchor, open: false, control, wrapper };
      layouts.set(doc, layout);
      button.addEventListener("click", () => { layout.open = !layout.open; syncDurationView(doc, { ...options, active: true }); if (layout.open) control.focus(); });
    }
    if (options.container && layout.host.parentNode !== options.container) options.container.append(layout.host);
    if (wrapper.parentNode !== layout.editor) { layout.anchor.remove(); wrapper.parentNode.insertBefore(layout.anchor, wrapper); layout.editor.prepend(wrapper); }
    const duration = readFromDocument(doc);
    updateDurationSummary(layout, duration);
    layout.editor.hidden = !layout.open && duration.valid;
    layout.button.setAttribute("aria-expanded", String(!layout.editor.hidden));
    wrapper.hidden = false;
    bindControl(control);
  }
  if (root.document?.addEventListener) root.document.addEventListener("DOMContentLoaded", () => ensureDefaults(root.document));
  return Object.freeze({ HOURS_ID, SOURCE_ID, HOURS_FIELDS, PROTOCOL_IDS, SOURCES, FORMULA_FIELDS, resolveFormulaFields, requiredFields, parseHours, resolveHours, collectionFacts, fromValues, readFromDocument, normalizeCapturedInputs, bindControl, ensureDefaults, syncDurationView });
});
