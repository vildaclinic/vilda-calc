(function (root, factory) {
  const api = factory();
  if (root) root.ClcrResultPresentation = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function finite(value) {
    if (value === "" || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function normalizeUnit(value) {
    return String(value || "").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
  }
  function categoryRows(profile, kind) {
    return profile && profile[kind] && Array.isArray(profile[kind].rows) ? profile[kind].rows : [];
  }
  function referenceFor(input, profile) {
    const formulaId = input.formulaId || "";
    const age = finite(input.ageYears);
    const referenceContext = input.referenceContext || {};
    const unit = normalizeUnit(input.unit);
    const noReference = {
      label: "Norma", value: profile?.neutral?.[formulaId] || "Brak uniwersalnej normy",
      unit: "", population: "", source: null, educational: false, kind: "none", rows: [],
    };
    if (!profile) return noReference;
    if (profile.gfrFormulaIds.includes(formulaId)) {
      if (age === null || age < profile.gfr.minimumCategoryAgeYears) {
        return { ...noReference, value: "Nie dobrano normy dla tego wieku" };
      }
      if (unit !== normalizeUnit(profile.gfr.unit)) return noReference;
      return {
        label: age < 18 ? (profile.pediatricCreatinineFormulaIds?.includes(formulaId) ? "Norma dla wieku" : "Norma (G1)") : "Norma", value: profile.gfr.referenceValue,
        unit: profile.gfr.unit, population: age < 18 ? "Dzieci i młodzież od 2 lat" : "Dorośli",
        source: profile.sources.kdigo, educational: !input.presentation?.category,
        kind: "gfr", rows: categoryRows(profile, "gfr"), limitation: profile.gfr.limitation,
      };
    }
    if (formulaId === "ACR") {
      if (age === null || age < profile.acr.minimumCategoryAgeYears || unit !== profile.acr.unit) {
        return { ...noReference, value: "Nie dobrano normy dla wieku lub jednostki" };
      }
      return {
        label: "Norma", value: profile.acr.referenceValue, unit: profile.acr.unit,
        population: age < 18 ? "Dzieci i młodzież od 2 lat" : "Dorośli",
        source: profile.sources.kdigo, educational: !input.presentation?.category,
        kind: "acr", rows: categoryRows(profile, "acr"), limitation: profile.acr.limitation,
      };
    }
    if (formulaId === "PCR") {
      const band = age === null ? null : profile.pcr.bands.find((entry) => age >= entry.minAgeYears && age < entry.maxAgeYears);
      if (!band || unit !== profile.pcr.unit) return noReference;
      return {
        ...noReference, label: "Norma dla wieku", value: `<${band.upperExclusive}`,
        unit: profile.pcr.unit, population: band.population, source: profile.sources.kdigo,
        kind: "pcr", educational: input.presentation?.classified !== true,
      };
    }
    if (["cg", "cg_norm"].includes(formulaId)) return { ...noReference, source: profile.sources.cg, population: "Dorośli" };
    if (formulaId === "KTV" || input.series?.startsWith("KTV_")) {
      const metricKey = input.series || input.code || "";
      const metric = metricKey === "KTV_urr" ? "urr" : metricKey === "KTV_ektv" ? "eKtV" : "spKtV";
      if (metric === "eKtV") return { ...noReference, label: "Cel", value: "Nie ustalono celu eKt/V w tym profilu", source: profile.sources.kdoqi };
      if (referenceContext.dialysisEligible !== true) return { ...noReference, label: "Cel", value: "Nie dobrano celu dla tego schematu dializy" };
      const duration = finite(referenceContext.durationMinutes);
      if (metric === "urr" && !(duration !== null && duration < 300)) return { ...noReference, label: "Cel", value: "Nie zastosowano historycznych progów URR" };
      const metricData = profile.dialysis[metric];
      return {
        ...noReference, label: metric === "urr" ? "Cel historyczny" : "Cel sesyjny",
        value: metricData.referenceValue, unit: metricData.unit === "bez jednostki" ? "" : metricData.unit,
        minimum: metricData.minimumValue, population: profile.dialysis.population + (metric === "urr" ? "; sesja <5 h" : ""),
        source: metric === "urr" ? profile.sources.kdoqiUrr : profile.sources.kdoqi,
        kind: "dialysis", limitation: profile.dialysis.limitation,
      };
    }
    // Existing EAU classifications supply exact, already converted mass limits.
    // A reference with another unit stays in details; no silent unit conversion.
    if (referenceContext.stone?.ok && formulaId === "CaCr_spot" && unit === "mg/mg") {
      const limit = finite(referenceContext.stone.exactMassEquivalentMgMg);
      if (limit !== null) return {
        ...noReference, label: "Norma dla wieku", value: `<${limit.toPrecision(5).replace(".", ",")}`,
        unit, population: profile.pediatricCaCrPopulations?.[referenceContext.stone.ageBand] || "Dzieci i młodzież", source: profile.sources.eau,
        kind: "stone", limitation: "Próg opublikowano w mol/mol; pokazano odpowiadający mu stosunek masowy. Kategoria jest wyznaczona przez silnik na pełnej precyzji, przed zaokrągleniem.",
      };
    }
    if (formulaId === "pH24" && referenceContext.stone?.ok && referenceContext.stone.status !== "contextOnly") {
      const target = profile.stonePhTargets?.[referenceContext.stone.treatmentContext];
      if (target) return { ...noReference, label: "Cel", value: target.value, population: target.population, source: profile.sources.eau, kind: "stone-target" };
    }
    return noReference;
  }
  function createModel(input, profile) {
    const source = input || {};
    const rawValue = finite(source.value);
    const presentation = source.presentation || {};
    const markerBlocked = profile?.markerSensitiveFormulaIds?.includes(source.formulaId) && source.markerPolicy?.calculationAllowed === false;
    const valueVisible = rawValue !== null && !markerBlocked && presentation.valueVisible !== false;
    const reference = referenceFor(source, profile);
    const category = valueVisible && presentation.category ? presentation.category : null;
    const currentRow = reference.rows.find((entry) => entry.code === category?.code);
    const tone = valueVisible && ["success", "warning", "danger"].includes(presentation.tone) ? presentation.tone : "neutral";
    const reasons = Array.isArray(presentation.reasons) ? presentation.reasons.filter(Boolean) : [];
    const interpretation = presentation.label || currentRow?.meaning || source.label || "Wynik obliczenia";
    return Object.freeze({
      formulaId: source.formulaId || "", series: source.series || "", code: source.code || "",
      rawValue, valueVisible, displayValue: source.displayValue == null ? String(rawValue) : String(source.displayValue),
      unit: normalizeUnit(source.unit), label: source.label || "Wynik obliczenia",
      boundary: profile?.gfrFormulaIds?.includes(source.formulaId) && !category ? "" : source.boundary || "",
      tone, category, interpretation, reference, categories: reference.rows, reasons,
      detailHtml: source.detailHtml || "", method: source.method || source.label || "", profileId: profile?.id || "",
    });
  }
  function tableMarkup(model) {
    if (!model.categories.length) return "";
    const title = model.reference.kind === "acr" ? "Kategorie albuminurii" : "Kategorie GFR";
    return `<table class="clcr-result-category-table"><caption>${title} · ${escape(model.reference.unit)}</caption><thead><tr><th scope="col">Kategoria</th><th scope="col">Zakres</th><th scope="col">Znaczenie</th></tr></thead><tbody>${model.categories.map((entry) => {
      const current = model.category?.code === entry.code;
      return `<tr data-clcr-category-row="${escape(entry.code)}" data-clcr-tone="${escape(entry.tone)}"${current ? ' aria-current="true"' : ""}><th scope="row">${escape(entry.code)}</th><td>${escape(entry.range)}</td><td>${escape(entry.meaning)}${current ? '<span class="clcr-result-current-label">Wynik pacjenta</span>' : ""}</td></tr>`;
    }).join("")}</tbody></table>`;
  }
  function render(input, profile) {
    const model = createModel(input, profile);
    if (!model.valueVisible) return "";
    const suffix = `${model.formulaId}-${model.series || model.code || "value"}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const detailsId = `clcr-result-details-${suffix}`;
    const reference = model.reference;
    const categoryButton = model.category && model.categories.length
      ? `<button type="button" class="clcr-result-category" data-clcr-category-control aria-controls="${detailsId}" aria-expanded="false" aria-label="${escape(model.category.code)} — pokaż wszystkie kategorie">${escape(model.category.code)}</button>`
      : "";
    const seriesAttributes = model.series ? ` data-clcr-series="${escape(model.series)}" data-clcr-value="${model.rawValue}"` : "";
    const sourceMarkup = reference.source
      ? `<a href="${escape(reference.source.url)}" target="_blank" rel="noopener noreferrer">${escape(reference.source.label)}</a>`
      : "";
    const populationSource = [escape(reference.population), sourceMarkup].filter(Boolean).join(" · ");
    const details = [
      tableMarkup(model),
      model.method ? `<p><strong>Metoda:</strong> ${escape(model.method)}</p>` : "",
      ...model.reasons.map((reason) => `<p>${escape(reason)}</p>`),
      reference.educational ? "<p>Norma ma charakter informacyjny. Dostępne dane nie pozwalają sklasyfikować tego pomiaru.</p>" : "",
      reference.limitation ? `<p>${escape(reference.limitation)}</p>` : "",
      model.boundary ? `<p>Wartość przed zaokrągleniem: ${escape(model.boundary)} ${escape(model.unit)}.</p>` : "",
      model.detailHtml,
    ].join("");
    return `<div class="result-box clcr-result-card${["warning", "danger"].includes(model.tone) ? " out-of-range" : ""}" data-clcr-formula="${escape(model.formulaId)}" data-clcr-code="${escape(model.code)}"${seriesAttributes} data-clcr-tone="${model.tone}" data-clcr-display-value="${escape(model.displayValue)}" data-clcr-value-length="${model.displayValue.length}" data-clcr-display-unit="${escape(model.unit)}" data-clcr-display-label="${escape(model.label)}" data-clcr-status="${escape(model.interpretation)}" data-clcr-category="${escape(model.category?.code || "")}" data-clcr-boundary="${escape(model.boundary)}" data-clcr-reference-profile="${escape(model.profileId)}"><div class="clcr-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta ${categoryButton}</p><strong class="clcr-result-value">${escape(model.displayValue.replace(".", ","))}</strong><span class="clcr-result-unit">${escape(model.unit)}</span>${model.boundary ? `<small class="clcr-result-boundary">Przed zaokrągleniem: ${escape(model.boundary)}</small>` : ""}</div><div class="clcr-result-reference${reference.kind === "none" ? " clcr-result-reference--text clcr-result-reference--unavailable" : ""}" data-clcr-reference="${escape(reference.kind)}" data-clcr-reference-kind="${escape(reference.kind)}" data-clcr-reference-length="${reference.value.length}"><p class="clcr-result-reference-label">${escape(reference.label)}</p><strong class="clcr-result-reference-value">${escape(reference.value)}</strong>${reference.unit ? `<span class="clcr-result-reference-unit">${escape(reference.unit)}</span>` : ""}${reference.minimum ? `<small class="clcr-result-reference-minimum">Minimum: ${escape(reference.minimum)}${reference.unit ? " " + escape(reference.unit) : ""}</small>` : ""}</div></div><p class="clcr-result-interpretation">${escape(model.interpretation)}</p></div>${populationSource ? `<p class="clcr-result-source" data-clcr-formula="${escape(model.formulaId)}">${populationSource}</p>` : ""}<details class="clcr-result-details" id="${detailsId}" data-clcr-formula="${escape(model.formulaId)}" tabindex="-1"><summary>${model.reference.kind === "acr" ? "Szczegóły — kategorie A1–A3" : model.reference.kind === "gfr" ? "Szczegóły — kategorie G1–G5" : "Szczegóły i źródła"}</summary>${details}</details>`;
  }
  function bindCategoryControls(scope) {
    const target = scope || (typeof document !== "undefined" ? document : null);
    if (!target || target.__clcrCategoryControlsBound) return;
    target.__clcrCategoryControlsBound = true;
    target.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-clcr-category-control]");
      if (!button || !target.contains(button)) return;
      const documentRef = button.ownerDocument;
      const details = documentRef.getElementById(button.getAttribute("aria-controls"));
      if (!details) return;
      details.open = true;
      button.setAttribute("aria-expanded", "true");
      const summary = details.querySelector?.("summary");
      if (summary && typeof summary.focus === "function") summary.focus();
      else details.focus();
    });
    target.addEventListener("toggle", (event) => {
      const details = event.target;
      if (!details.matches?.(".clcr-result-details")) return;
      target.querySelectorAll("[data-clcr-category-control]").forEach((button) => {
        if (button.getAttribute("aria-controls") === details.id) button.setAttribute("aria-expanded", String(details.open));
      });
    }, true);
  }
  return Object.freeze({ createModel, referenceFor, render, bindCategoryControls });
});
