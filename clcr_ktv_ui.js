(function (root, factory) {
  const api = factory();
  if (root) root.ClcrKtvUi = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const layouts = new WeakMap();
  const VARIANTS = ["spktv", "ektv", "urr"];
  const LABELS = { spktv: "spKt/V", ektv: "eKt/V", urr: "URR" };
  const NUMERIC = ["UreaPre", "UreaPost", "ktvDurationMinutes", "ktvUF", "ktvW"];
  const CORE = [...NUMERIC, "ktvSessionsPerWeek", "ktvPidiDays", "ktvAccessType"];
  const ATTRIBUTES = ["type", "inputmode", "min", "max", "step", "data-max", "maxlength", "spellcheck", "placeholder", "aria-label", "aria-describedby", "aria-invalid"];
  const NAMES = { UreaPre: "Przed dializą", UreaPost: "Po dializie", ktvDurationMinutes: "Czas dializy", ktvUF: "Ultrafiltracja netto", ktvW: "Masa po dializie", ktvSessionsPerWeek: "Zabiegi w tygodniu", ktvPidiDays: "Odstęp od rozpoczęcia poprzedniej dializy", ktvAccessType: "Rodzaj dostępu" };

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function variantOf(doc) {
    const value = doc.getElementById("ktvVariant")?.value;
    return VARIANTS.includes(value) ? value : "spktv";
  }
  function requiredIds(doc, variant) {
    const provided = doc.defaultView?.VildaClcrKtv?.requiredFieldIds?.(variant);
    if (Array.isArray(provided)) return provided;
    return variant === "urr" ? ["UreaPre", "UreaPost"] : ["UreaPre", "UreaPost", "ktvDurationMinutes", "ktvUF", "ktvW", "ktvSessionsPerWeek", "ktvPidiDays", ...(variant === "ektv" ? ["ktvAccessType"] : [])];
  }
  function evaluation(doc) {
    const win = doc.defaultView;
    if (typeof win?.evaluateClcrKtv === "function") return win.evaluateClcrKtv();
    const engine = win?.VildaClcrKtv;
    return engine?.evaluate && engine?.readInputFromDocument ? engine.evaluate(engine.readInputFromDocument(doc), win?.VildaClcrKtvReferenceData?.DEFAULT_POLICY) : null;
  }
  function option(doc, value, text) {
    const node = element(doc, "option", "", text);
    node.value = String(value);
    return node;
  }
  function syncIntervals(layout) {
    const control = layout.doc.getElementById("ktvPidiDays");
    const frequency = layout.doc.getElementById("ktvSessionsPerWeek")?.value || "";
    if (!control) return;
    const policy = layout.doc.defaultView?.VildaClcrKtvReferenceData?.DEFAULT_POLICY;
    const allowed = layout.doc.defaultView?.VildaClcrKtv?.allowedPidiDays?.(frequency, policy);
    if (!Array.isArray(allowed)) return;
    const current = String(control.value || "");
    const values = allowed.map(String);
    const unknown = current && !values.includes(current);
    const signature = values.join(",") + "|" + (unknown ? current : "");
    if (layout.intervalSignature === signature) return;
    layout.intervalSignature = signature;
    const nodes = [option(layout.doc, "", "Wybierz odstęp")];
    values.forEach(day => nodes.push(option(layout.doc, day, `${day} ${day === "1" ? "dzień" : "dni"} · ${Number(day) * 24} godz.`)));
    if (unknown) nodes.push(option(layout.doc, current, `Nieobsługiwany odstęp: ${current} — sprawdź schemat`));
    control.replaceChildren(...nodes);
    // A schedule edit does not prove or erase the actual preceding interval.
    control.value = current;
  }
  function fieldNames(values) {
    return new Set((Array.isArray(values) ? values : []).map(value => typeof value === "string" ? value : value?.fieldId || value?.id).filter(Boolean));
  }
  function refreshLayout(layout, suppliedModel) {
    const doc = layout.doc;
    const variant = variantOf(doc);
    const visible = new Set(requiredIds(doc, variant));
    layout.buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.clcrKtvVariant === variant)));
    layout.fields.forEach(field => { field.view.wrapper.hidden = !visible.has(field.id); });
    layout.session.hidden = variant === "urr";
    layout.schedule.hidden = variant === "urr";
    layout.access.hidden = variant !== "ektv";
    layout.optional.hidden = variant !== "urr";
    layout.proxyFrequency.value = doc.getElementById("ktvSessionsPerWeek")?.value || "";
    const duration = doc.getElementById("ktvDurationMinutes")?.value || "";
    if (layout.proxyDuration.value !== duration) layout.proxyDuration.value = duration;
    syncIntervals(layout);
    const model = suppliedModel || evaluation(doc);
    const invalid = fieldNames(model?.invalidIds || model?.invalidFields);
    const missing = fieldNames(model?.missingIds || model?.missingFields);
    const required = requiredIds(doc, variant);
    const complete = required.filter(id => {
      const raw = String(doc.getElementById(id)?.value ?? "").trim();
      return raw !== "" && !invalid.has(id) && !missing.has(id);
    }).length;
    layout.count.textContent = `${complete}/${required.length}`;
    layout.readiness.dataset.complete = String(complete === required.length);
    const hasError = invalid.size > 0;
    layout.error.hidden = !hasError;
    layout.error.textContent = hasError ? model?.error || "Sprawdź zaznaczone dane." : "";
    layout.fields.forEach(field => field.view.control.setAttribute("aria-invalid", String(invalid.has(field.id))));
    const age = model?.age?.known ? model.age.years : model?.input?.ageYears ?? model?.context?.ageYears;
    layout.age.textContent = typeof age === "number" && Number.isFinite(age) ? `Wiek pacjenta: ${String(age).replace(".", ",")} lat` : "Nie podano wieku pacjenta";
  }
  function group(doc, title, id) {
    const section = element(doc, "section", "ktv-field-group");
    if (id) section.id = id;
    section.append(element(doc, "h3", "", title));
    return section;
  }
  function hint(doc, text, id) {
    const node = element(doc, "p", "ktv-field-hint", text);
    if (id) node.id = id;
    return node;
  }
  function proxyField(doc, id, title, type) {
    const wrapper = element(doc, "div", "ktv-proxy-field");
    const name = element(doc, "label", "", title);
    name.setAttribute("for", id);
    const control = element(doc, type);
    control.id = id;
    wrapper.append(name, control);
    return { wrapper, control };
  }
  function createLayout(doc, options) {
    const form = doc.getElementById("clcrForm");
    if (!form || !options.fieldViews?.get("UreaPre") || !options.fieldViews?.get("UreaPost")) return null;
    let variantControl = doc.getElementById("ktvVariant");
    if (!variantControl) {
      variantControl = element(doc, "input");
      variantControl.id = "ktvVariant";
      variantControl.setAttribute("type", "hidden");
      variantControl.value = "spktv";
      form.append(variantControl);
    }
    const card = element(doc, "section", "ktv-input-card");
    card.id = "ktvInputCard";
    card.setAttribute("data-clcr-ktv-ui", "1");
    card.setAttribute("aria-label", "Dane do obliczenia dawki hemodializy");
    const intro = hint(doc, "Przewlekła hemodializa przerywana. Ocena pojedynczej sesji.");
    intro.classList.add("ktv-scope");
    const age = element(doc, "p", "ktv-age-context", "Nie podano wieku pacjenta");
    const tabs = element(doc, "div", "ktv-variant-tabs");
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Wariant obliczenia dawki hemodializy");
    const captions = { spktv: "jednopulowy", ektv: "wyrównany", urr: "redukcja mocznika" };
    const buttons = VARIANTS.map(variant => {
      const button = element(doc, "button");
      button.type = "button";
      button.dataset.clcrKtvVariant = variant;
      button.append(element(doc, "strong", "", LABELS[variant]), element(doc, "span", "", captions[variant]));
      tabs.append(button);
      return button;
    });
    const concentrations = group(doc, "Mocznik lub BUN", "ktvConcentrationGroup");
    const concentrationPair = element(doc, "div", "ktv-paired-fields ktv-concentration-pair");
    concentrations.append(concentrationPair, hint(doc, "Obie wartości z tej samej sesji, dla tego samego oznaczenia i w tej samej jednostce.", "ktvConcentrationHelp"));
    const session = group(doc, "Przebieg zabiegu", "ktvSessionGroup");
    const fluidPair = element(doc, "div", "ktv-paired-fields");
    const schedule = group(doc, "Schemat hemodializy", "ktvScheduleGroup");
    const access = group(doc, "Dostęp naczyniowy", "ktvAccessGroup");
    const optional = element(doc, "details", "ktv-optional-context");
    optional.id = "ktvUrrContext";
    const summary = element(doc, "summary", "", "Schemat do porównania z celem");
    summary.append(element(doc, "span", "", "opcjonalnie"));
    optional.append(summary, hint(doc, "Nie jest potrzebny do obliczenia URR. Znane dane tego zabiegu są wykorzystywane automatycznie."));
    const frequency = proxyField(doc, "ktvUrrSessionsPerWeek", "Zabiegi w tygodniu", "select");
    frequency.control.append(option(doc, "", "Brak danych"), ...[2, 3, 4, 5, 6, 7].map(value => option(doc, value, `${value} zabiegów`)));
    const duration = proxyField(doc, "ktvUrrDurationMinutes", "Czas dializy (min)", "input");
    duration.control.setAttribute("type", "text");
    duration.control.setAttribute("inputmode", "decimal");
    duration.control.setAttribute("maxlength", "64");
    duration.control.setAttribute("placeholder", "np. 240");
    optional.append(frequency.wrapper, duration.wrapper);
    const error = element(doc, "p", "ktv-input-error");
    error.id = "ktvInputError";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const assumption = hint(doc, "Przyjmujemy próbki pobrane zgodnie z protokołem przed i po tym samym zabiegu. Wynik opisuje dawkę jednego zabiegu, bez doliczania resztkowej czynności nerek.");
    assumption.classList.add("ktv-assumption");
    const readiness = element(doc, "p", "ktv-readiness");
    readiness.setAttribute("aria-live", "polite");
    const count = element(doc, "strong", "", "0/7");
    count.id = "ktvRequiredCount";
    readiness.append(element(doc, "span", "", "Wymagane dane"), count);
    card.append(intro, age, tabs, concentrations, session, schedule, access, optional, error, assumption, readiness);
    const clear = doc.getElementById("clearContainer");
    if (clear?.parentNode === form) form.insertBefore(card, clear);
    else form.append(card);
    const layout = { doc, form, card, variantControl, buttons, fields: [], concealed: [], session, schedule, access, optional, proxyFrequency: frequency.control, proxyDuration: duration.control, age, error, count, readiness };
    CORE.forEach(id => {
      const view = options.fieldViews.get(id);
      if (!view?.wrapper?.parentNode || !view.control) return;
      const anchor = doc.createComment("ktv-field-origin");
      view.wrapper.parentNode.insertBefore(anchor, view.wrapper);
      const name = view.wrapper.querySelector(".clcr-field__name");
      const attributes = Object.fromEntries(ATTRIBUTES.map(key => [key, view.control.getAttribute(key)]));
      const saved = { id, view, anchor, name, previousName: name?.textContent, attributes, hidden: view.wrapper.hidden, originalOptions: id === "ktvPidiDays" ? Array.from(view.control.children) : null };
      layout.fields.push(saved);
      view.wrapper.classList.add("ktv-entry-field");
      if (name) name.textContent = NAMES[id];
      if (NUMERIC.includes(id)) {
        ["min", "max", "step", "data-max"].forEach(key => view.control.removeAttribute(key));
        view.control.setAttribute("type", "text");
        view.control.setAttribute("inputmode", "decimal");
        view.control.setAttribute("maxlength", "64");
        view.control.setAttribute("spellcheck", "false");
      }
      view.control.setAttribute("aria-label", NAMES[id]);
      const descriptions = new Set((attributes["aria-describedby"] || "").split(/\s+/).filter(Boolean));
      descriptions.add("ktvInputError");
      if (id === "UreaPre" || id === "UreaPost") descriptions.add("ktvConcentrationHelp");
      view.control.setAttribute("aria-describedby", [...descriptions].join(" "));
      if (id === "UreaPre" || id === "UreaPost") concentrationPair.append(view.wrapper);
      else if (id === "ktvDurationMinutes") {
        name && (name.textContent = "Czas dializy (min)");
        session.append(view.wrapper, hint(doc, "Rzeczywisty czas zabiegu, bez przerw."), fluidPair);
      } else if (id === "ktvUF" || id === "ktvW") {
        if (name) name.textContent = id === "ktvUF" ? "Ultrafiltracja netto (L)" : "Masa po dializie (kg)";
        fluidPair.append(view.wrapper);
      } else if (id === "ktvAccessType") access.append(view.wrapper);
      else schedule.append(view.wrapper);
    });
    session.append(hint(doc, "Objętość płynu usuniętego netto w trakcie tego zabiegu."));
    schedule.append(hint(doc, "Odstęp do rozpoczęcia obecnej dializy obejmuje także czas poprzedniego zabiegu."));
    access.append(hint(doc, "Potrzebny wyłącznie do przeliczenia spKt/V na eKt/V."));
    options.fieldViews.forEach((view, id) => {
      if (!CORE.includes(id) && view.wrapper?.closest?.("#ktvFields")) {
        layout.concealed.push({ view, hidden: view.wrapper.hidden });
        view.wrapper.hidden = true;
      }
    });
    layout.onEdit = event => {
      const id = event?.target?.id;
      if (id === "ktvUrrSessionsPerWeek" || id === "ktvUrrDurationMinutes") {
        const canonical = doc.getElementById(id === "ktvUrrSessionsPerWeek" ? "ktvSessionsPerWeek" : "ktvDurationMinutes");
        if (canonical && canonical.value !== event.target.value) {
          canonical.value = event.target.value;
          const EventType = doc.defaultView?.Event;
          if (EventType) canonical.dispatchEvent(new EventType(event.type, { bubbles: true }));
        }
      }
      refreshLayout(layout);
    };
    layout.onVariant = event => {
      const target = event.currentTarget || event.target?.closest?.("[data-clcr-ktv-variant]") || event.target;
      variantControl.value = target.dataset.clcrKtvVariant;
      const EventType = doc.defaultView?.Event;
      if (EventType) {
        variantControl.dispatchEvent(new EventType("input", { bubbles: true }));
        variantControl.dispatchEvent(new EventType("change", { bubbles: true }));
      }
      refreshLayout(layout);
    };
    buttons.forEach(button => button.addEventListener("click", layout.onVariant));
    form.addEventListener("input", layout.onEdit);
    form.addEventListener("change", layout.onEdit);
    return layout;
  }
  function restore(doc) {
    const layout = layouts.get(doc);
    if (!layout) return;
    layout.fields.forEach(field => {
      if (field.anchor.parentNode) field.anchor.parentNode.insertBefore(field.view.wrapper, field.anchor.nextSibling);
      field.anchor.remove();
      field.view.wrapper.classList.remove("ktv-entry-field");
      field.view.wrapper.hidden = field.hidden;
      if (field.name) field.name.textContent = field.previousName;
      if (field.originalOptions) {
        const raw = field.view.control.value;
        field.view.control.replaceChildren(...field.originalOptions);
        if (raw && !field.originalOptions.some(node => node.value === raw)) field.view.control.append(option(doc, raw, `Nieobsługiwany odstęp: ${raw}`));
        field.view.control.value = raw;
      }
      Object.entries(field.attributes).forEach(([key, value]) => value === null ? field.view.control.removeAttribute(key) : field.view.control.setAttribute(key, value));
    });
    layout.concealed.forEach(({ view, hidden }) => { view.wrapper.hidden = hidden; });
    layout.buttons.forEach(button => button.removeEventListener("click", layout.onVariant));
    layout.form.removeEventListener("input", layout.onEdit);
    layout.form.removeEventListener("change", layout.onEdit);
    layout.card.remove();
    layouts.delete(doc);
    doc.documentElement.removeAttribute("data-clcr-ktv-ui");
  }
  function sync(doc, options) {
    if (!options?.active) { restore(doc); return; }
    let layout = layouts.get(doc);
    if (!layout) {
      layout = createLayout(doc, options);
      if (!layout) return;
      layouts.set(doc, layout);
    }
    doc.documentElement.setAttribute("data-clcr-ktv-ui", "1");
    refreshLayout(layout);
  }
  function refresh(doc, model) {
    const layout = layouts.get(doc);
    if (layout) refreshLayout(layout, model);
  }

  function paragraph(text, className) {
    return typeof text === "string" && text ? `<p${className ? ` class="${className}"` : ""}>${escape(text)}</p>` : "";
  }
  function sourceMarkup(source) {
    if (typeof source === "string") return escape(source);
    const title = escape(source?.label || source?.title || "Źródło");
    return /^https:\/\//.test(source?.url || "") ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${title}</a>${paragraph(source.locator, "ktv-source-locator")}` : title;
  }
  function renderDetails(model) {
    const notes = model.notes || {};
    const sources = Array.isArray(model.sources) ? model.sources : [];
    const variant = VARIANTS.includes(model.variant) ? model.variant : "spktv";
    const formula = notes.formula || notes.formulas?.[variant] || notes[variant === "ektv" ? "formulaE" : variant === "urr" ? "formulaUrr" : "formulaSp"];
    const raw = Number.isFinite(model.rawValue) ? `<p class="ktv-exact-value">Pełna wartość ${escape(LABELS[variant])}: ${escape(String(model.rawValue).replace(".", ","))}${model.unit === "%" ? "%" : ""}.</p>` : "";
    const texts = [notes.scope, formula, notes.comparison, notes.children || notes.pediatric, variant !== "urr" ? notes.gfac : "", notes.sampling, notes.therapy, notes.limitations, notes.localGuards].filter(text => typeof text === "string" && text);
    if (!texts.length && !sources.length && !raw && !model.guard) return "";
    return `<details class="clcr-result-details ktv-proposal-details" id="clcr-ktv-details" data-clcr-formula="KTV" data-clcr-ktv-ui="1" tabindex="-1"><summary>Szczegóły i źródła</summary><h3>Metoda i zakres</h3>${texts.map(text => paragraph(text)).join("")}${raw}${paragraph(model.guard?.message)}${sources.length ? `<h3>Źródła</h3><ul class="ktv-source-links">${sources.map(source => `<li>${sourceMarkup(source)}</li>`).join("")}</ul>` : ""}</details>`;
  }
  function activeReference(model) {
    return model.referenceActive === true && model.reference?.kind === "threshold" && Number.isFinite(model.reference.minimum);
  }
  function numberText(value, digits) {
    return Number(value).toLocaleString("pl-PL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function renderScale(model) {
    if (!activeReference(model)) return "";
    const reference = model.reference;
    const minimum = reference.minimum, target = Number.isFinite(reference.target) ? reference.target : minimum;
    const single = minimum === target;
    const percentage = model.unit === "%";
    const maximum = Math.max(percentage ? 100 : 2.2, target * 1.2);
    const position = value => 10 + Math.max(0, Math.min(1, value / maximum)) * 280;
    const text = value => numberText(value, percentage ? 0 : 1) + (percentage ? "%" : "");
    const lowEnd = position(minimum), targetEnd = position(target), point = position(model.rawValue);
    const minimumLabel = `<span><i></i>Minimum <strong>≥${escape(text(minimum))}</strong></span>`;
    const targetLabel = single ? "" : `<span><i></i>Cel <strong>≥${escape(text(target))}</strong></span>`;
    return `<figure class="ktv-dose-scale" aria-label="Porównanie wyniku z ${single ? "minimum" : "minimum i celem"}"><svg viewBox="0 0 300 61" class="ktv-dose-graphic" aria-hidden="true" focusable="false"><rect class="ktv-dose-track" x="10" y="29" width="280" height="11" rx="5"/><rect class="ktv-dose-low" x="10" y="29" width="${lowEnd - 10}" height="11"/>${single ? "" : `<rect class="ktv-dose-mid" x="${lowEnd}" y="29" width="${targetEnd - lowEnd}" height="11"/><line class="ktv-dose-boundary" x1="${lowEnd}" x2="${lowEnd}" y1="26" y2="43"/>`}<line class="ktv-dose-boundary" x1="${targetEnd}" x2="${targetEnd}" y1="26" y2="43"/><text class="ktv-dose-marker-label" x="${Math.max(25, Math.min(275, point))}" y="17">Wynik</text><line class="ktv-dose-marker" x1="${point}" x2="${point}" y1="24" y2="45"/><text class="ktv-dose-end" x="10" y="57">0</text><text class="ktv-dose-end" x="290" y="57" text-anchor="end">${escape(text(maximum))}</text></svg><figcaption class="ktv-dose-legend${single ? " ktv-dose-legend--single" : ""}">${minimumLabel}${targetLabel}</figcaption>${model.rawValue > maximum || model.rawValue < 0 ? paragraph(`Wynik ${model.display?.text || model.rawValue} jest poza zakresem osi.`, "ktv-scale-note") : ""}</figure>`;
  }
  function renderResult(result) {
    const model = result || {};
    const variant = VARIANTS.includes(model.variant) ? model.variant : "spktv";
    if (!model.valid || model.valueReady === false || !Number.isFinite(model.rawValue)) {
      const guard = model.guard;
      const missing = !guard && (!model.errorCode || /^missing-/i.test(model.errorCode));
      const tone = guard?.tone === "warning" || guard?.kind === "model" ? "warning" : missing ? "neutral" : "danger";
      const title = guard ? guard.title || model.statusText || "Sprawdź dane" : missing ? `Tu pojawi się wynik ${LABELS[variant]}` : "Sprawdź dane";
      const copy = guard?.message || model.error || "Uzupełnij dane wybranego wariantu. Wiek ani dane do porównania nie są dodatkowymi wymaganiami do samego URR.";
      return `<div class="ktv-result-placeholder" data-clcr-formula="KTV" data-clcr-ktv-ui="1" data-clcr-tone="${tone}"><strong>${escape(title)}</strong>${paragraph(copy)}</div>${renderDetails(model)}`;
    }
    const shown = String(model.display?.text ?? model.rawValue).replace(".", ",");
    const numberMarkup = escape(shown).replace(/([eE][+-]?\d+)$/, "<wbr>$1");
    const tone = ["normal", "warning", "danger"].includes(model.tone) ? model.tone : "neutral";
    const assessment = model.outOfRange === true ? "outside" : model.outOfRange === false ? "within" : "unassessed";
    const reference = activeReference(model);
    const cautions = Array.isArray(model.cautions) ? model.cautions : [];
    return `<div class="result-box clcr-result-card ktv-proposal-card${model.outOfRange === true ? " out-of-range" : ""}" data-clcr-formula="KTV" data-clcr-ktv-ui="1" data-clcr-series="${escape(model.parameterKey || `KTV_${variant}`)}" data-clcr-ktv-variant="${variant}" data-clcr-value="${model.rawValue}" data-clcr-display-value="${escape(shown)}" data-clcr-value-length="${shown.length}" data-clcr-display-unit="${escape(model.unit || "")}" data-clcr-display-label="${escape(LABELS[variant])}" data-clcr-status="${escape(model.statusText)}" data-clcr-assessment="${assessment}" data-clcr-out-of-range="${String(model.outOfRange ?? null)}" data-clcr-tone="${tone}" data-clcr-reference-comparison="${reference}" data-clcr-ktv-snapshot="${escape(JSON.stringify(model))}"><h3 class="ktv-result-status">${escape(model.statusText || LABELS[variant])}</h3><div class="clcr-result-main ktv-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta · ${escape(LABELS[variant])}</p><strong class="clcr-result-value" data-long="${shown.length > 4}" data-dense="${shown.length > 7}">${numberMarkup}${model.unit === "%" ? '<small class="ktv-result-percent">%</small>' : ""}</strong></div><div class="clcr-result-reference${reference ? "" : " clcr-result-reference--unavailable"}"><p class="clcr-result-reference-label">${escape(model.referenceLabel || "Cel dla tego schematu")}</p><strong class="clcr-result-reference-value ktv-reference-value">${escape(model.referenceText || "Brak porównania")}</strong>${paragraph(model.referenceHint || model.reference?.hint, "ktv-reference-hint")}</div></div>${paragraph(model.interpretation || model.referenceReason, "ktv-result-copy")}${cautions.map(note => paragraph(note, "ktv-result-caution")).join("")}${renderScale(model)}</div>${renderDetails(model)}`;
  }
  return Object.freeze({ sync, refresh, restore, renderResult });
});
