(function (root, factory) {
  const api = factory();
  if (root) root.ClcrCitcrUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const initializedDocuments = new WeakSet();
  const defaultsResetBound = new WeakSet();
  const CONTEXT_FIELDS = ["CitCr_same_specimen"];
  const KNOWN_FACTS = Object.freeze([
    ["spotInfection", "Infekcja"], ["spotHematuria", "Krwiomocz"],
    ["spotMenstruation", "Miesiączka"], ["spotExercise", "Intensywny wysiłek"],
    ["spotAcuteIllness", "Gorączka / ostra choroba lub stan przejściowy"],
    ["spotDiureticUse", "Stosowanie diuretyków"],
    ["spotKnownCKD", "Znana przewlekła choroba nerek"],
  ]);

  function emitEdit(layout, control) {
    const EventClass = layout.document.defaultView?.Event;
    if (!EventClass || !control) return;
    control.dispatchEvent(new EventClass("input", { bubbles: true }));
    control.dispatchEvent(new EventClass("change", { bubbles: true }));
  }

  function refreshKnownFacts(layout) {
    const direct = modeOf(layout) === "direct";
    // Existing facts remain patient data; this view does not add a routine
    // factor questionnaire or invent negative answers for the Cit/Cr profiles.
    const facts = KNOWN_FACTS.filter(([id]) => {
      const view = layout.fieldViews.get(id);
      const answer = view?.answerSelect?.value;
      return answer === "yes" || (!["no", "unknown"].includes(answer) && view?.control.checked);
    }).map(([, label]) => label);
    const specimen = layout.fieldViews.get("CitCr_same_specimen");
    const different = specimen?.control.value === "different";
    if (different) facts.unshift(direct ? "Różne próbki zgłoszone dla obliczenia ze stężeń" : "Oznaczenia z różnych próbek");
    const sample = layout.fieldViews.get("spotSampleKind");
    const knownSample = Boolean(sample?.control.value);
    if (knownSample) facts.push(`Próbka: ${sample.control.selectedOptions?.[0]?.textContent || sample.control.value}`);
    layout.factSummary.textContent = facts.length ? `Znane informacje: ${facts.join("; ")}.` : "";
    layout.factSummary.hidden = facts.length === 0;
    layout.problemSelect.value = different ? "different" : "";
    layout.differentOption.disabled = direct;
    layout.corrections.hidden = direct || (!different && specimen?.control.value !== "confirmed");
    layout.factHint.textContent = direct && different
      ? "Informacja o różnych próbkach dotyczy obliczenia ze stężeń. Gotowy wskaźnik oceniamy niezależnie."
      : different ? "Zgłoszone różne próbki pozostają zapisane. Jeśli ta informacja jest błędna, skoryguj ją poniżej."
        : "Zmień tylko wtedy, gdy wiesz, że oznaczenia pochodzą z różnych próbek.";
  }

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function element(documentRef, tag, className, text) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function rememberMove(layout, node, preferredAnchor) {
    if (layout.moves.has(node)) return;
    const anchor = preferredAnchor?.parentNode ? preferredAnchor : layout.document.createComment("citcr-field-origin");
    const owned = anchor !== preferredAnchor;
    if (owned) node.parentNode.insertBefore(anchor, node);
    layout.moves.set(node, { anchor, owned });
  }

  function move(layout, node, target, preferredAnchor) {
    if (!node || !target || node.parentNode === target) return;
    rememberMove(layout, node, preferredAnchor);
    target.appendChild(node);
  }

  function modeOf(layout) {
    return layout.document.getElementById("CitCr_entry_mode")?.value === "direct" ? "direct" : "concentration";
  }

  function refreshMode(layout) {
    const direct = modeOf(layout) === "direct";
    layout.concentrationFields.hidden = direct;
    layout.directFields.hidden = !direct;
    layout.assumption.hidden = direct;
    layout.buttons.concentration.setAttribute("aria-pressed", String(!direct));
    layout.buttons.direct.setAttribute("aria-pressed", String(direct));
    const specimen = layout.fieldViews.get("CitCr_same_specimen");
    if (specimen) specimen.wrapper.hidden = direct;
    const specimenControl = specimen?.control;
    // Carry a known negative shared answer into the visible Cit/Cr context. This
    // preserves a fact; it does not silently turn an unanswered checkbox into
    // confirmation. A deliberate new 'confirmed' answer can correct it.
    if (specimenControl && specimenControl.value === "") {
      const legacyAnswer = layout.document.getElementById("ui_spotSameSpecimen_answer")?.value || "";
      if (legacyAnswer === "no") specimenControl.value = "different";
      else if (legacyAnswer === "yes" || (legacyAnswer !== "unknown" &&
          layout.document.getElementById("spotSameSpecimen")?.checked)) specimenControl.value = "confirmed";
    }
    layout.assumption.textContent = specimenControl?.value === "different"
      ? "Oznaczenia z różnych próbek nie pozwalają obliczyć Cit/Cr."
      : specimenControl?.value === "confirmed"
        ? "Potwierdzono, że oba oznaczenia pochodzą z tej samej próbki moczu."
        : "Zakładamy, że oba oznaczenia pochodzą z tej samej próbki moczu.";
    layout.card.dataset.citcrMode = direct ? "direct" : "concentration";
    refreshKnownFacts(layout);
    refreshUnits(layout);
  }

  function refreshAge(layout) {
    const clinical = layout.document.defaultView?.ClcrClinicalSafety;
    const ageYears = layout.document.defaultView?.VildaClcrCitcr?.readInputFromDocument?.(layout.document)?.ageYears;
    const validAge = typeof ageYears === "number" && Number.isFinite(ageYears);
    const age = validAge ? {
      valid: true, years: Math.floor(ageYears),
      months: Number(layout.document.getElementById("ageMonths")?.value || 0), daysOfLife: null,
    } : null;
    const ageLabel = validAge ? ageYears === 0 ? "poniżej 1 roku"
      : clinical?.formatAge?.(age) || `${Math.floor(ageYears)} lat` : "niepodany";
    const adult = validAge && ageYears >= 18;
    const sex = layout.document.getElementById("sex")?.value || "";
    layout.ageText.textContent = `Wiek pacjenta: ${ageLabel}${adult ? ` · ${{ F: "kobieta", M: "mężczyzna" }[sex] || "płeć niepodana"}` : ""}`;
    const sexView = layout.fieldViews.get("sex");
    if (sexView) sexView.wrapper.hidden = !adult;
  }

  function mountAgeContext(layout) {
    const panel = layout.document.getElementById("clcrActivePanel");
    if (!panel) return;
    if (layout.ageContext.parentNode !== panel) panel.appendChild(layout.ageContext);
    if (layout.ageFields.parentNode !== panel) panel.appendChild(layout.ageFields);
    ["age", "ageMonths", "sex"].forEach((id) => {
      const view = layout.fieldViews.get(id);
      if (!view) return;
      move(layout, view.wrapper, layout.ageFields, view.contextAnchor);
      view.wrapper.hidden = false;
      const name = view.wrapper.querySelector(".clcr-field__name");
      const title = { age: "Wiek — lata", ageMonths: "Dodatkowe miesiące", sex: "Płeć z danych pacjenta (opcjonalnie)" }[id];
      if (name && title) {
        if (!layout.names.has(name)) layout.names.set(name, name.textContent);
        name.textContent = title;
      }
    });
    refreshAge(layout);
  }

  function createLayout(documentRef, options) {
    const form = documentRef.getElementById("clcrForm");
    if (!form) return null;
    const card = element(documentRef, "section", "citcr-input-card");
    card.id = "citcrInputCard";
    card.setAttribute("aria-label", "Dane do Cit/Cr");
    const modes = element(documentRef, "div", "citcr-mode-switch");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "Sposób wprowadzenia Cit/Cr");
    const buttons = {};
    [["concentration", "Oblicz ze stężeń"], ["direct", "Gotowy wynik Cit/Cr"]].forEach(([value, label]) => {
      const button = element(documentRef, "button", "", label);
      button.type = "button";
      button.dataset.citcrMode = value;
      button.setAttribute("aria-controls", value === "direct" ? "citcrDirectFields" : "citcrConcentrationFields");
      buttons[value] = button;
      modes.appendChild(button);
    });
    const concentrationFields = element(documentRef, "div", "citcr-entry-fields");
    concentrationFields.id = "citcrConcentrationFields";
    const directFields = element(documentRef, "div", "citcr-entry-fields");
    directFields.id = "citcrDirectFields";
    const assumption = element(documentRef, "p", "citcr-assumption", "Zakładamy, że oba oznaczenia pochodzą z tej samej próbki moczu.");
    const details = element(documentRef, "details", "citcr-sample-info");
    details.id = "citcrSampleInfo";
    details.appendChild(element(documentRef, "summary", "", "Znany problem z próbką"));
    const problemLabel = element(documentRef, "label", "citcr-known-problem-label", "Próbki moczu (opcjonalnie)");
    problemLabel.htmlFor = "ui_citcr_known_problem";
    const problemSelect = element(documentRef, "select", "citcr-known-problem");
    problemSelect.id = "ui_citcr_known_problem";
    problemSelect.dataset.clcrDerivedControl = "true";
    let differentOption;
    [["", "Nie zgłoszono różnych próbek"], ["different", "Oznaczenia z różnych próbek"]].forEach(([value, label]) => {
      const option = element(documentRef, "option", "", label);
      option.value = value;
      if (value === "different") differentOption = option;
      problemSelect.appendChild(option);
    });
    const factSummary = element(documentRef, "p", "citcr-known-facts-summary");
    factSummary.hidden = true;
    const corrections = element(documentRef, "details", "citcr-fact-corrections");
    corrections.appendChild(element(documentRef, "summary", "", "Skoryguj informacje"));
    const context = element(documentRef, "div", "citcr-sample-info__fields");
    corrections.appendChild(context);
    const factHint = element(documentRef, "p", "citcr-known-facts-hint", "Zmień tylko wtedy, gdy wiesz, że oznaczenia pochodzą z różnych próbek.");
    details.append(problemLabel, problemSelect, factSummary, factHint, corrections);
    card.append(modes, concentrationFields, directFields, assumption, details);
    const clear = documentRef.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.appendChild(card);
    const layout = {
      document: documentRef, form, card, buttons, concentrationFields,
      directFields, assumption, details, context, moves: new Map(),
      rows: new Map(), names: new Map(), unitLabels: new Map(), unitHelpers: new Map(),
      fieldViews: options.fieldViews, onChange: options.onChange,
      problemSelect, differentOption, factSummary, factHint, corrections,
    };
    problemSelect.addEventListener("change", () => {
      const selected = problemSelect.value;
      if (selected === "different") {
        const specimen = layout.fieldViews.get("CitCr_same_specimen")?.control;
        if (specimen) {
          specimen.value = "different";
          emitEdit(layout, specimen);
        }
      } else if (layout.fieldViews.get("CitCr_same_specimen")?.control.value === "different") {
        // Choosing an unanswered option cannot silently erase a known
        // contradiction. Correction is explicit on the canonical control.
        corrections.open = true;
        layout.fieldViews.get("CitCr_same_specimen")?.control.focus();
      }
      refreshMode(layout);
      if (typeof layout.onChange === "function") layout.onChange();
    });
    const ageContext = element(documentRef, "div", "citcr-patient-age");
    const ageText = element(documentRef, "span");
    const ageEdit = element(documentRef, "button", "citcr-patient-age__edit", "Zmień");
    const ageFields = element(documentRef, "div", "citcr-age-fields");
    ageFields.id = "citcrAgeFields";
    ageFields.hidden = true;
    ageEdit.type = "button";
    ageEdit.setAttribute("aria-expanded", "false");
    ageEdit.setAttribute("aria-controls", ageFields.id);
    ageContext.append(ageText, ageEdit);
    Object.assign(layout, { ageContext, ageText, ageEdit, ageFields });
    ageEdit.addEventListener("click", () => {
      ageFields.hidden = !ageFields.hidden;
      ageEdit.setAttribute("aria-expanded", String(!ageFields.hidden));
      ageEdit.textContent = ageFields.hidden ? "Zmień" : "Gotowe";
      if (!ageFields.hidden) layout.fieldViews.get("age")?.control.focus();
    });
    layout.onFieldEdit = (event) => {
      if (["age", "ageMonths", "ageDays", "sex"].includes(event.target?.id)) refreshAge(layout);
      if (["CitCr_entry_mode", "CitCr_same_specimen", "ui_spotSameSpecimen_answer"].includes(event.target?.id)) refreshMode(layout);
      if (["Cit_Cr_spot_unit", "CitCr_reported_unit", "citrateSpotReportingEntity", "CitCr_reported_basis"].includes(event.target?.id)) refreshUnits(layout);
      if ([...CONTEXT_FIELDS, "spotSampleKind"].includes(event.target?.id) || KNOWN_FACTS.some(([id]) => [id, `ui_${id}_answer`].includes(event.target?.id))) refreshKnownFacts(layout);
    };
    form.addEventListener("input", layout.onFieldEdit);
    form.addEventListener("change", layout.onFieldEdit);
    Object.entries(buttons).forEach(([value, button]) => {
      button.addEventListener("click", () => {
        const control = documentRef.getElementById("CitCr_entry_mode");
        if (!control || control.value === value) return;
        control.value = value;
        refreshMode(layout);
        const EventClass = documentRef.defaultView?.Event;
        if (EventClass) control.dispatchEvent(new EventClass("change", { bubbles: true }));
        if (typeof layout.onChange === "function") layout.onChange();
      });
    });
    return layout;
  }

  function pair(layout, valueId, unitId, title, target) {
    const valueView = layout.fieldViews.get(valueId);
    const unitView = layout.fieldViews.get(unitId);
    if (!valueView || !unitView) return;
    const { wrapper, control } = valueView;
    move(layout, wrapper, target, valueView.contextAnchor);
    wrapper.hidden = false;
    wrapper.classList.add("citcr-entry-field");
    const name = wrapper.querySelector(".clcr-field__name");
    if (name) {
      if (!layout.names.has(name)) layout.names.set(name, name.textContent);
      name.textContent = title;
    }
    let row = layout.rows.get(valueId);
    if (!row) {
      row = element(layout.document, "div", "citcr-value-row");
      control.parentNode.insertBefore(row, control);
      move(layout, control, row);
      layout.rows.set(valueId, row);
    }
    if (!layout.unitLabels.has(unitView.control)) {
      layout.unitLabels.set(unitView.control, {
        labelledby: unitView.control.getAttribute("aria-labelledby"),
        label: unitView.control.getAttribute("aria-label"),
        describedby: unitView.control.getAttribute("aria-describedby"),
      });
    }
    move(layout, unitView.control, row);
    unitView.control.removeAttribute("aria-labelledby");
    unitView.control.setAttribute("aria-label", `Jednostka: ${title.toLocaleLowerCase("pl")}`);
    unitView.wrapper.hidden = true;
    control.setAttribute("inputmode", "decimal");
    if (["Cit_Cr_spot_unit", "CitCr_reported_unit"].includes(unitId) && !layout.unitHelpers.has(unitId)) {
      const concentration = unitId === "Cit_Cr_spot_unit";
      const basisId = concentration ? "citrateSpotReportingEntity" : "CitCr_reported_basis";
      const basisView = layout.fieldViews.get(basisId);
      if (!basisView) return;
      const editor = element(layout.document, "details", "citcr-basis-editor");
      editor.id = concentration ? "citcrCitrateBasisDetails" : "citcrReportedBasisDetails";
      const summary = element(layout.document, "summary");
      const helper = element(layout.document, "span", "citcr-unit-help");
      helper.id = concentration ? "citcrCitrateUnitHelp" : "citcrReportedUnitHelp";
      helper.hidden = true;
      const action = element(layout.document, "span", "citcr-basis-action", "Zmień");
      action.setAttribute("aria-hidden", "true");
      summary.append(helper, action);
      const label = element(layout.document, "span", "citcr-basis-label", "Postać podana w raporcie");
      label.id = `${editor.id}Label`;
      const basisControl = basisView.control;
      layout.unitLabels.set(basisControl, {
        labelledby: basisControl.getAttribute("aria-labelledby"),
        label: basisControl.getAttribute("aria-label"),
        describedby: basisControl.getAttribute("aria-describedby"),
      });
      editor.append(summary, label);
      move(layout, basisControl, editor);
      basisControl.setAttribute("aria-labelledby", label.id);
      editor.appendChild(element(layout.document, "p", "", "Zmień tylko, jeśli raport określa postać. Sama nazwa „cytryniany” jej nie rozstrzyga."));
      basisView.wrapper.hidden = true;
      wrapper.appendChild(editor);
      layout.unitHelpers.set(unitId, { helper, editor, basisControl, control: unitView.control, title });
      unitView.control.setAttribute("aria-describedby", [unitView.control.getAttribute("aria-describedby"), helper.id].filter(Boolean).join(" "));
    }
    const basisId = unitId === "Cit_Cr_spot_unit" ? "citrateSpotReportingEntity"
      : unitId === "CitCr_reported_unit" ? "CitCr_reported_basis" : null;
    if (basisId) {
      const basisView = layout.fieldViews.get(basisId);
      if (basisView) basisView.wrapper.hidden = true;
    }
  }

  function refreshUnits(layout) {
    const labels = { ion: "jon cytrynianowy", acid: "kwas cytrynowy bezwodny", unknown: "nie podano" };
    layout.unitHelpers.forEach(({ helper, editor, basisControl, control, title }) => {
      const mass = control.value.startsWith("mg/");
      const basis = mass ? basisControl.value : "";
      editor.hidden = !mass;
      if (!mass) editor.open = false;
      helper.hidden = !mass;
      helper.textContent = mass ? `Postać z raportu: ${labels[basis] || "nie podano"}` : "";
      control.setAttribute("aria-label", `Jednostka: ${title.toLocaleLowerCase("pl")}${mass ? `; postać z raportu: ${labels[basis] || "nie podano"}` : ""}`);
    });
  }

  function restore(documentRef) {
    const layout = layouts.get(documentRef);
    if (!layout) {
      documentRef.documentElement?.removeAttribute("data-clcr-citcr-active");
      return;
    }
    // Restore controls before their containers so shared urine fields retain
    // their existing labels, event handlers and the Cit/Cr workflow.
    Array.from(layout.moves.entries()).reverse().forEach(([node, { anchor, owned }]) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
      if (owned) anchor.remove();
    });
    layout.names.forEach((text, name) => { name.textContent = text; });
    layout.unitLabels.forEach((attributes, control) => {
      if (attributes.labelledby === null) control.removeAttribute("aria-labelledby");
      else control.setAttribute("aria-labelledby", attributes.labelledby);
      if (attributes.label === null) control.removeAttribute("aria-label");
      else control.setAttribute("aria-label", attributes.label);
      if (attributes.describedby === null) control.removeAttribute("aria-describedby");
      else control.setAttribute("aria-describedby", attributes.describedby);
    });
    layout.rows.forEach((row) => row.remove());
    layout.unitHelpers.forEach(({ editor }) => editor.remove());
    layout.fieldViews.forEach((view) => view.wrapper.classList.remove("citcr-entry-field"));
    layout.card.remove();
    layout.ageContext.remove();
    layout.ageFields.remove();
    layout.form.removeEventListener("input", layout.onFieldEdit);
    layout.form.removeEventListener("change", layout.onFieldEdit);
    layouts.delete(documentRef);
    documentRef.documentElement?.removeAttribute("data-clcr-citcr-active");
  }

  function sync(documentOrOptions, parameters) {
    const options = parameters ? { ...parameters, document: documentOrOptions } : documentOrOptions;
    const documentRef = options?.document || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    if (!options?.active) {
      restore(documentRef);
      return;
    }
    if (!defaultsResetBound.has(documentRef)) {
      const form = documentRef.getElementById("clcrForm");
      if (form) {
        defaultsResetBound.add(documentRef);
        // A native reset restores the shared creatinine select to its legacy
        // HTML default. The next empty Cit/Cr pathway must start in SI again.
        form.addEventListener("reset", () => initializedDocuments.delete(documentRef));
      }
    }
    if (!initializedDocuments.has(documentRef)) {
      initializedDocuments.add(documentRef);
      // Set the SI unit only for an untouched, empty concentration pathway.
      // Session restoration owns explicit saved units and historical defaults.
      const citrate = documentRef.getElementById("Cit_Cr_spot");
      const creatinine = documentRef.getElementById("Ucr_spot");
      const unit = documentRef.getElementById("Ucr_spot_unit");
      if (!documentRef.defaultView?.__vildaPersistRestoring && citrate?.value === "" && creatinine?.value === "" && unit) unit.value = "mmol/L";
    }
    let layout = layouts.get(documentRef);
    if (!layout) {
      layout = createLayout(documentRef, options);
      if (!layout) return;
      layouts.set(documentRef, layout);
    }
    layout.fieldViews = options.fieldViews;
    layout.onChange = options.onChange;
    if (!layout.fieldViews?.get) return;
    documentRef.documentElement.dataset.clcrCitcrActive = "1";
    mountAgeContext(layout);
    pair(layout, "Cit_Cr_spot", "Cit_Cr_spot_unit", "Cytryniany w moczu", layout.concentrationFields);
    pair(layout, "Ucr_spot", "Ucr_spot_unit", "Kreatynina w moczu", layout.concentrationFields);
    pair(layout, "CitCr_reported", "CitCr_reported_unit", "Cit/Cr z laboratorium", layout.directFields);
    CONTEXT_FIELDS.forEach((id) => {
      const view = layout.fieldViews.get(id);
      if (!view) return;
      move(layout, view.wrapper, layout.context, view.contextAnchor);
      view.wrapper.hidden = false;
    });
    refreshMode(layout);
  }

  function refresh(documentRef) {
    const layout = layouts.get(documentRef);
    if (!layout) return;
    refreshAge(layout);
    refreshMode(layout);
  }

  function sourceMarkup(source) {
    if (!source) return "";
    const label = escape(source.label || source.title || "Źródło");
    return /^https:\/\//.test(source.url || "")
      ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  }

  function knownFactText(model) {
    const labels = {
      menstruation: "Miesiączka", hematuria: "Krwiomocz", infection: "Infekcja",
      exercise: "Intensywny wysiłek", acuteIllness: "Gorączka / ostra choroba",
      diuretics: "Stosowanie diuretyków", diureticUse: "Stosowanie diuretyków",
      knownCKD: "Znana przewlekła choroba nerek", knownCkd: "Znana przewlekła choroba nerek",
      ...Object.fromEntries(KNOWN_FACTS),
    };
    const context = model.context || {};
    const known = context.knownFacts;
    const facts = Array.isArray(known) ? known.filter(value => typeof value === "string")
      : known && typeof known === "object" ? Object.entries(known).map(([key, value]) => {
        const label = labels[key] || key;
        return value === true ? label : value === false ? `${label}: nie`
          : value == null || value === "unknown" ? `${label}: nie wiadomo` : `${label}: ${value}`;
      }) : [];
    (Array.isArray(context.confounders) ? context.confounders : []).forEach(key => {
      if (!known || Array.isArray(known) || !Object.prototype.hasOwnProperty.call(known, key)) facts.push(labels[key] || key);
    });
    const sample = { firstMorning: "pierwszy poranny mocz", secondMorning: "drugi poranny mocz", random: "próbka losowa", timed: "zbiórka czasowa" }[context.sampleType];
    if (sample) facts.push(`Próbka: ${sample}`);
    if (model.mode === "concentration") facts.push(context.sameSpecimen === "confirmed"
      ? "Potwierdzono tę samą próbkę moczu" : "Wspólna próbka moczu jest założeniem obliczenia");
    return facts.filter((value, index, all) => value && all.indexOf(value) === index).join("; ");
  }

  function referenceTable(rows, original = false) {
    const groups = [];
    rows.forEach(row => {
      const key = row.profileId || row.sourceLabel || "reference";
      let group = groups.find(item => item.key === key);
      if (!group) { group = { key, label: row.sourceLabel || "Normy dla wieku", source: row.source, rows: [] }; groups.push(group); }
      group.rows.push(row);
    });
    return groups.map(group => {
      const unit = original ? group.rows[0].sourceOriginal?.unit || group.rows[0].unit || group.rows[0].nativeUnit || "mmol/mmol"
        : group.rows[0].display?.unit || group.rows[0].unit || "";
      const lowerOnly = group.rows.every(row => row.display?.upper === null || row.upper === null);
      return `<table class="clcr-result-category-table"><caption>${escape(group.label)}</caption><thead><tr><th scope="col">${lowerOnly ? "Wiek" : "Profil"}</th><th scope="col">${lowerOnly ? "Norma" : "Zakres"} (${escape(unit)})</th></tr></thead><tbody>${group.rows.map(row => {
        const range = original ? row.sourceOriginal?.range || row.range || "" : row.display?.range || row.range || "";
        return `<tr data-clcr-age-row="${escape(row.id || "")}" data-clcr-tone="neutral"${row.selected && !original ? ' aria-current="true"' : ""}><th scope="row">${escape(row.label || row.sourceAge || "")}</th><td>${escape(range)}</td></tr>`;
      }).join("")}</tbody></table>`;
    }).join("");
  }

  function renderResult(result) {
    const model = result || {};
    if (!model.valid || !Number.isFinite(model.rawValue)) {
      const missing = ["", "missing-input", "missing-citrate", "missing-creatinine", "missing-reported-value"].includes(model.reasonCode || "");
      const empty = model.mode === "direct" ? "Wpisz gotowy wskaźnik Cit/Cr z laboratorium i wybierz jego jednostkę."
        : "Wpisz stężenie cytrynianów i kreatyniny w moczu. Wiek służy wyłącznie dobraniu normy.";
      return `<div class="${missing ? "citcr-result-empty" : "citcr-result-error"}" data-clcr-formula="CitCr_spot"><strong>${escape(missing ? "Tutaj pojawi się wynik Cit/Cr" : "Sprawdź dane Cit/Cr")}</strong><p>${escape(model.message || model.qualification?.note || empty)}</p></div>`;
    }
    const reference = model.referenceAvailable ? model.reference : null;
    const category = typeof model.category === "string" ? model.category : "";
    const tone = ["success", "warning", "danger"].includes(model.tone) ? model.tone : "neutral";
    const shown = String(model.display?.text ?? model.display?.value ?? model.rawValue).replace(".", ",");
    const unit = model.display?.unit || model.unit || "";
    const boundary = model.boundary || model.display?.boundary || "";
    const approximate = Boolean(reference?.display?.approximate || reference?.converted);
    const low = reference?.display?.lower == null ? null : String(reference.display.lower).replace(".", ",");
    const high = String(reference?.display?.upper ?? "").replace(".", ",");
    const range = String(reference?.display?.range || reference?.range || "").replace(/\./g, ",");
    const splitReference = Boolean(reference && range.length > 10);
    const lowerOnly = Boolean(reference && reference.display?.upper == null);
    const rangeMarkup = splitReference
      ? lowerOnly ? `<span>&gt; ${approximate ? "≈" : ""}${escape(low)}</span>`
        : `<span>od ${approximate ? "≈" : ""}${escape(low)}</span><span>do ${approximate ? "≈" : ""}${escape(high)}</span>` : escape(range);
    const norm = reference
      ? `<div class="clcr-result-reference citcr-proposal-reference" data-clcr-reference="citcr" data-clcr-reference-kind="citcr"><p class="clcr-result-reference-label">${escape(reference.label || "Norma dla wieku")}</p><strong class="clcr-result-reference-value" data-reference-converted="${approximate ? "1" : "0"}" data-reference-split="${splitReference ? "1" : "0"}">${rangeMarkup}</strong><span class="clcr-result-reference-unit">${escape(reference.unit || unit)}</span></div>` : "";
    const rows = Array.isArray(reference?.table) ? reference.table : Array.isArray(model.referenceTable) ? model.referenceTable : [];
    const table = referenceTable(rows);
    const originalTable = referenceTable(Array.isArray(model.sourceReferenceTable) ? model.sourceReferenceTable : [], true);
    const source = reference?.source || model.source;
    const sourceLine = reference ? `Porównanie orientacyjne · ${sourceMarkup(source)}` : "";
    const notes = model.notes || {};
    const facts = knownFactText(model);
    const details = [
      ["Źródło i rodzaj normy", notes.source], ["Metody zakresu", notes.methods],
      ["Dwa oddzielne źródła", notes.sourceTransition], ["Przeliczenia", notes.units],
      ["Stałe przeliczeniowe", notes.constants],
      ["Znaczenie obniżonego wyniku", notes.lowResultSource],
      ["Próbka", notes.sample], ["Ograniczenia", notes.diagnosis],
      ["Potwierdzenie", notes.confirmation], ["Pobranie i konserwacja", notes.conservation],
      ["Obliczenie", model.mode === "concentration" ? notes.concentration : "Oryginalny wynik, jednostka i znak nierówności z laboratorium pozostają częścią oceny."],
      ["Zakres wieku", notes.agePolicy], ["Znane informacje", facts],
    ].filter(([, text]) => typeof text === "string" && text);
    const qualification = model.qualification?.note || "";
    const comparisonAvailable = Boolean(reference && ["below", "within", "above"].includes(model.comparison));
    const snapshot = model.snapshot || model;
    const basis = { ion: "jon cytrynianowy", acid: "kwas cytrynowy" }[model.basis] || "";
    const tableUnitNote = table
      ? `Normy poniżej mają tę samą jednostkę co wynik: ${unit}${basis ? ` (${basis}${model.basis === "acid" ? " bezwodny" : ""})` : ""}.${unit.startsWith("mg/") ? " Znak ≈ oznacza zaokrąglenie przeliczonych granic." : ""}`
      : `Do przeliczenia norm na ${unit} potrzebna jest postać cytrynianów z raportu. Oryginalne wartości źródeł są dostępne poniżej.`;
    return `<div class="result-box clcr-result-card citcr-proposal-card${["warning", "danger"].includes(tone) ? " out-of-range" : ""}" data-clcr-formula="CitCr_spot" data-clcr-series="CitCr_spot" data-clcr-code="citcr" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(model.display?.value ?? model.rawValue)}" data-clcr-value-length="${Math.min(60, shown.length)}" data-clcr-number-size="${shown.length > 12 ? "very-long" : shown.length > 8 ? "long" : shown.length > 6 ? "medium" : "regular"}" data-clcr-display-unit="${escape(unit)}" data-clcr-display-label="Cytryniany/kreatynina — Cit/Cr" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${escape(model.status)}" data-clcr-comparison="${escape(model.comparison || "")}" data-clcr-comparator="${escape(model.comparator || "")}" data-clcr-category="${escape(category)}" data-clcr-boundary="${escape(boundary)}" data-clcr-tone="${tone}" data-clcr-reference-profile="${escape(model.profileId)}" data-clcr-reference-comparison="${comparisonAvailable}" data-clcr-citcr-snapshot="${escape(JSON.stringify(snapshot))}"><div class="clcr-result-main citcr-proposal-main${reference ? "" : " citcr-proposal-main--single"}"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta</p><strong class="clcr-result-value">${escape(shown)}</strong><span class="clcr-result-unit">${escape(unit)}</span>${basis ? `<small class="citcr-basis-note">${escape(basis)}</small>` : ""}${boundary ? `<small class="clcr-result-boundary">${escape(boundary)}</small>` : ""}</div>${norm}</div><p class="clcr-result-interpretation citcr-proposal-status">${escape(model.statusText || "Cit/Cr — wynik liczbowy")}</p>${qualification ? `<p class="citcr-confirmation">${escape(qualification)}</p>` : ""}</div>${sourceLine ? `<p class="clcr-result-source citcr-source" data-clcr-formula="CitCr_spot">${sourceLine}</p>` : ""}<details class="clcr-result-details citcr-proposal-details" id="clcr-citcr-details" data-clcr-formula="CitCr_spot" tabindex="-1"><summary>Szczegóły i źródła</summary><p class="citcr-table-unit-note">${escape(tableUnitNote)}</p>${table}${originalTable ? `<details class="citcr-source-originals"><summary>Oryginalne jednostki w źródłach</summary><p>To te same normy przed przeliczeniem. Główne tabele powyżej są w jednostce wybranej dla wyniku.</p>${originalTable}</details>` : ""}${source ? `<p>${sourceMarkup(source)}</p>` : ""}${details.map(([label, text]) => `<p><strong>${escape(label)}:</strong> ${escape(text)}</p>`).join("")}${boundary ? `<p>Wartość użyta do oceny: ${escape(String(model.rawValue).replace(".", ","))} ${escape(unit)}. Ocenę wyznaczamy przed zaokrągleniem.</p>` : ""}</details>`;
  }

  return Object.freeze({ sync, restore, refresh, renderResult });
});
