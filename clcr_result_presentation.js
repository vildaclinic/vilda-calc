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
        label: ["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(formulaId)
          ? profile.gfr.cystatinReferenceLabel || "Zakres G1 (KDIGO)"
          : age < 18 ? (profile.pediatricCreatinineFormulaIds?.includes(formulaId) ? "Norma dla wieku" : "Norma (G1)") : "Norma", value: profile.gfr.referenceValue,
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
  // This is an estimate-to-reference comparison, not permission to assign G.
  // The supplied profile owns the threshold, age range and displayed wording.
  function u25EstimatePresentation(input, profile) {
    const source = input || {};
    if (source.calculationAssumptions) return source.presentation || null;
    const config = profile?.u25CreatinineEstimate;
    if (!config || source.formulaId !== config.formulaId) return null;
    const supplied = source.presentation || {};
    const policy = source.markerPolicy || {};
    const value = finite(source.value);
    const age = finite(source.ageYears);
    const neutral = { ...supplied, category: null, tone: "neutral", referenceComparison: false, assumptions: "" };
    if (policy.calculationAllowed === false || policy.status === "blocked" || supplied.valueVisible === false) {
      return { ...neutral, valueVisible: false };
    }
    if (value === null || value < 0 || age === null || age < config.minAgeYears || age >= config.maxAgeYearsExclusive) {
      return { ...neutral, valueVisible: false };
    }
    const minimumReferenceAge = finite(profile.gfr?.minimumCategoryAgeYears);
    const threshold = finite(profile.gfr?.referenceLowerInclusive);
    const unitMatches = normalizeUnit(source.unit) === normalizeUnit(profile.gfr?.unit);
    if (!unitMatches || minimumReferenceAge === null || threshold === null || threshold <= 0) return neutral;
    const assay = String(source.assay || "");
    const assayEligible = config.eligibleAssays.includes(assay);
    if (assay && !assayEligible) {
      return { ...neutral, label: "Szacowany eGFR — ocena ograniczona", reasons: [config.assayReason] };
    }
    if (age < minimumReferenceAge) {
      return { ...neutral, label: config.ageSpecificLabel, reasons: [config.ageSpecificReason], assumptions: config.assumptions };
    }
    if (policy.status === "stable" && policy.categoryAllowed === true && assayEligible) return supplied;
    if (policy.calculationAllowed !== true || !["unknown", "stable"].includes(policy.status)) return neutral;
    const belowReference = value < threshold;
    const pediatric = age < config.pediatricMaxAgeYearsExclusive;
    const display = finite(source.displayValue);
    const boundary = display !== null && belowReference !== (display < threshold)
      ? `${belowReference ? "<" : "≥"}${threshold}` : "";
    return {
      ...neutral,
      label: pediatric
        ? (belowReference ? config.pediatricLowLabel : config.pediatricNotLowLabel)
        : (belowReference ? config.adultLowLabel : config.adultNotLowLabel),
      tone: belowReference ? "warning" : "neutral",
      reasons: [config.comparisonDetail],
      referenceComparison: true,
      assumptions: config.assumptions,
      boundary,
    };
  }
  function createModel(input, profile) {
    const source = input || {};
    const rawValue = finite(source.value);
    const presentation = u25EstimatePresentation(source, profile) || source.presentation || {};
    const markerBlocked = profile?.markerSensitiveFormulaIds?.includes(source.formulaId) && source.markerPolicy?.calculationAllowed === false;
    const valueVisible = rawValue !== null && !markerBlocked && presentation.valueVisible !== false;
    const reference = referenceFor({ ...source, presentation }, profile);
    const category = valueVisible && presentation.category ? presentation.category : null;
    const currentRow = reference.rows.find((entry) => entry.code === category?.code);
    const tone = valueVisible && ["success", "warning", "danger"].includes(presentation.tone) ? presentation.tone : "neutral";
    const reasons = Array.isArray(presentation.reasons) ? presentation.reasons.filter(Boolean) : [];
    const interpretation = presentation.label || currentRow?.meaning || source.label || "Wynik obliczenia";
    const averageConfig = profile?.u25Average && profile.u25Average.formulaId === source.formulaId ? profile.u25Average : null;
    const rawComponents = source.calculationComponents || {};
    const creatinineComponent = finite(rawComponents.egfrCreatinine);
    const cystatinComponent = finite(rawComponents.egfrCystatin);
    const componentThreshold = reference.kind === "gfr" ? finite(profile.gfr?.referenceLowerInclusive) : null;
    const averageComponents = averageConfig && valueVisible &&
      normalizeUnit(source.unit) === normalizeUnit(profile.gfr?.unit) &&
      creatinineComponent !== null && creatinineComponent > 0 &&
      cystatinComponent !== null && cystatinComponent > 0
      ? Object.freeze([
          { id: "creatinine", label: averageConfig.creatinineLabel, value: creatinineComponent },
          { id: "cystatinC", label: averageConfig.cystatinLabel, value: cystatinComponent },
        ].map((component) => {
          const displayValue = component.value.toFixed(2);
          const belowReference = componentThreshold !== null && component.value < componentThreshold;
          const crossesReference = componentThreshold !== null &&
            belowReference !== (Number(displayValue) < componentThreshold);
          return Object.freeze({
            ...component, displayValue: displayValue.replace(".", ","),
            tone: componentThreshold === null ? "neutral" : belowReference ? "warning" : "success",
            boundary: crossesReference ? `${belowReference ? "<" : "≥"}${String(componentThreshold).replace(".", ",")}` : "",
          });
        }))
      : Object.freeze([]);
    return Object.freeze({
      formulaId: source.formulaId || "", series: source.series || "", code: source.code || "",
      rawValue, valueVisible, displayValue: source.displayValue == null ? String(rawValue) : String(source.displayValue),
      unit: normalizeUnit(source.unit), label: source.label || "Wynik obliczenia",
      boundary: presentation.referenceComparison ? presentation.boundary : profile?.gfrFormulaIds?.includes(source.formulaId) && !category ? "" : source.boundary || "",
      tone, category, interpretation, reference, categories: reference.rows, reasons,
      referenceComparison: presentation.referenceComparison === true,
      assumptions: valueVisible ? source.calculationAssumptions?.assumptionsText || presentation.assumptions || "" : "",
      assumptionProvenance: source.calculationAssumptions?.provenance || null,
      populationNote: valueVisible ? profile?.populationNotes?.[source.formulaId] || "" : "",
      categoryRange: category && reference.kind === "gfr" ? currentRow?.range || "" : "",
      averageComponents,
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
  function averageComponentsMarkup(model, config) {
    if (!config || !model.averageComponents.length) return "";
    const reference = model.reference;
    const componentRows = model.averageComponents.map((component) =>
      `<tr data-clcr-component="${escape(component.id)}" data-clcr-component-value="${component.value}" data-clcr-component-tone="${escape(component.tone)}"><th scope="row">${escape(component.label)}</th> <td class="clcr-result-component-value">${escape(component.displayValue)}${component.boundary ? ` (${escape(component.boundary)})` : ""}</td></tr>`,
    ).join("\n");
    const referenceMarkup = reference.kind === "gfr"
      ? `<p class="clcr-result-components-reference">${escape(reference.label)} ${escape(config.referenceDescription)}: <strong>${escape(reference.value)} ${escape(reference.unit)}</strong>.</p>` : "";
    return `<section class="clcr-result-average-components" data-clcr-average-components>
<p><strong>${escape(config.heading)}</strong></p>
<table class="clcr-result-category-table clcr-result-components-table">
<caption>${escape(config.componentsCaption)} · ${escape(model.unit)}</caption>
<tbody>
${componentRows}
</tbody>
</table>
${referenceMarkup}
<p>${escape(config.roundingDescription)}</p>
</section>\n`;
  }
  function averageSourcesMarkup(config) {
    const sources = Array.isArray(config?.sources) ? config.sources : [];
    if (!sources.length) return "";
    return `<p data-clcr-average-sources>Źródła: ${sources.map((source) => `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}</a>`).join(" · ")}</p>`;
  }
  function render(input, profile) {
    const model = createModel(input, profile);
    if (!model.valueVisible) return "";
    const suffix = `${model.formulaId}-${model.series || model.code || "value"}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const detailsId = `clcr-result-details-${suffix}`;
    const reference = model.reference;
    const averageConfig = profile?.u25Average && profile.u25Average.formulaId === model.formulaId ? profile.u25Average : null;
    const categoryButton = model.category && model.categories.length
      ? `<button type="button" class="clcr-result-category" data-clcr-category-control aria-controls="${detailsId}" aria-expanded="false" aria-label="${escape(model.category.code)} — pokaż wszystkie kategorie">${escape(model.category.code)}</button>`
      : "";
    const seriesAttributes = model.series ? ` data-clcr-series="${escape(model.series)}" data-clcr-value="${model.rawValue}"` : "";
    const sourceMarkup = reference.source
      ? `<a href="${escape(reference.source.url)}" target="_blank" rel="noopener noreferrer">${escape(reference.source.label)}</a>`
      : "";
    const populationSource = [escape(reference.population), sourceMarkup].filter(Boolean).join(" · ");
    const resultLimitation = reference.limitation || (averageConfig ? profile.gfr?.limitation : "");
    const details = [
      averageComponentsMarkup(model, averageConfig),
      tableMarkup(model),
      model.method ? `<p><strong>Metoda:</strong> ${escape(model.method)}</p>` : "",
      ...model.reasons.map((reason) => `<p>${escape(reason)}</p>`),
      reference.educational && !model.referenceComparison ? "<p>Norma ma charakter informacyjny. Dostępne dane nie pozwalają sklasyfikować tego pomiaru.</p>" : "",
      resultLimitation ? `<p>${escape(resultLimitation)}</p>` : "",
      model.boundary ? `<p>Wartość przed zaokrągleniem: ${escape(model.boundary)} ${escape(model.unit)}.</p>` : "",
      averageConfig ? `<p><strong>${escape(averageConfig.methodRecommendationLabel)}:</strong> ${escape(averageConfig.methodRecommendation)}</p><p>${escape(averageConfig.discrepancyDescription)}</p>${averageSourcesMarkup(averageConfig)}` : "",
      model.detailHtml,
    ].join("");
    return `<div class="result-box clcr-result-card${["warning", "danger"].includes(model.tone) ? " out-of-range" : ""}" data-clcr-formula="${escape(model.formulaId)}" data-clcr-code="${escape(model.code)}"${seriesAttributes} data-clcr-tone="${model.tone}" data-clcr-display-value="${escape(model.displayValue)}" data-clcr-value-length="${model.displayValue.length}" data-clcr-display-unit="${escape(model.unit)}" data-clcr-display-label="${escape(model.label)}" data-clcr-status="${escape(model.interpretation)}" data-clcr-category="${escape(model.category?.code || "")}" data-clcr-boundary="${escape(model.boundary)}" data-clcr-reference-profile="${escape(model.profileId)}" data-clcr-reference-comparison="${model.referenceComparison}" data-clcr-assumptions="${escape(model.assumptions)}" data-clcr-assumption-provenance="${escape(JSON.stringify(model.assumptionProvenance))}"><div class="clcr-result-main"><div class="clcr-result-patient"><p class="clcr-result-patient-label">Wynik pacjenta ${categoryButton}</p><strong class="clcr-result-value">${escape(model.displayValue.replace(".", ","))}</strong><span class="clcr-result-unit">${escape(model.unit)}</span>${model.boundary ? `<small class="clcr-result-boundary">Przed zaokrągleniem: ${escape(model.boundary)}</small>` : ""}</div><div class="clcr-result-reference${reference.kind === "none" ? " clcr-result-reference--text clcr-result-reference--unavailable" : ""}" data-clcr-reference="${escape(reference.kind)}" data-clcr-reference-kind="${escape(reference.kind)}" data-clcr-reference-length="${reference.value.length}"><p class="clcr-result-reference-label">${escape(reference.label)}</p><strong class="clcr-result-reference-value">${escape(reference.value)}</strong>${reference.unit ? `<span class="clcr-result-reference-unit">${escape(reference.unit)}</span>` : ""}${reference.minimum ? `<small class="clcr-result-reference-minimum">Minimum: ${escape(reference.minimum)}${reference.unit ? " " + escape(reference.unit) : ""}</small>` : ""}</div></div><p class="clcr-result-interpretation">${escape(model.interpretation)}</p>${model.categoryRange ? `<p class="clcr-result-category-summary">Zakres oszacowania: ${escape(model.category.code)} · ${escape(model.categoryRange)}</p>` : ""}</div>${model.assumptions ? `<p class="clcr-result-assumptions" data-clcr-formula="${escape(model.formulaId)}">${escape(model.assumptions)}</p>` : ""}${model.populationNote ? `<p class="clcr-result-population-note clcr-result-source" data-clcr-formula="${escape(model.formulaId)}">${escape(model.populationNote)}</p>` : ""}${!averageConfig && populationSource ? `<p class="clcr-result-source" data-clcr-formula="${escape(model.formulaId)}">${populationSource}</p>` : ""}<details class="clcr-result-details" id="${detailsId}" data-clcr-formula="${escape(model.formulaId)}" tabindex="-1"><summary>${averageConfig ? escape(model.categories.length ? averageConfig.detailsSummary : averageConfig.detailsSummaryWithoutCategories) : model.reference.kind === "acr" ? "Szczegóły — kategorie A1–A3" : model.reference.kind === "gfr" ? "Szczegóły — kategorie G1–G5" : "Szczegóły i źródła"}</summary>${details}</details>`;
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
  return Object.freeze({ createModel, referenceFor, u25EstimatePresentation, render, bindCategoryControls });
});
