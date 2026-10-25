/* Lazy, ordered resources for saved Klirens records. No calculator page or
 * DOM workflow is loaded into the main patient card. Merely reading history
 * never invokes a clinical engine; editing loads its dependencies on demand.
 */
(function (root, factory) {
  "use strict";
  if (root && !root.ClcrRecordResources) root.ClcrRecordResources = factory(root);
})(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";
  const doc = root.document;
  const base = new URL(".", doc.currentScript?.src || root.location.href);
  const pending = new Map();
  let readerPromise = null, editorPromise = null;
  const reader = [
    ["clcr_oxcr_persistence.js?v=1", "ClcrOxcrPersistence"],
    ["clcr_citcr_persistence.js?v=1", "ClcrCitcrPersistence"],
    ["clcr_fena_persistence.js?v=1", "ClcrFenaPersistence"],
    ["clcr_fek_persistence.js?v=1", "ClcrFekPersistence"],
    ["clcr_fecl_persistence.js?v=1", "ClcrFeclPersistence"],
    ["clcr_fehco3_persistence.js?v=1", "ClcrFehco3Persistence"],
    // readSaved is pure and needed for the new capture format. Its recalculate
    // method is not called while opening history and resolves engines lazily.
    ["clcr_saved_calculation.js?v=1", "ClcrSavedCalculation"],
    ["clcr_saved_results.js?v=1", "ClcrSavedResults"],
    ["clcr_saved_results_view.js?v=1", "ClcrSavedResultsView"],
  ];
  const editor = [
    ["clcr_clinical_safety.js?v=12", "ClcrClinicalSafety"],
    ["clcr_stone_safety.js?v=1", "ClcrStoneSafety"],
    ["clcr_dialysis_safety.js?v=1", "ClcrDialysisSafety"],
    ["clcr_extended_egfr.js?v=1", "ClcrExtendedEgfr"],
    ["clcr_calculation_assumptions.js?v=2", "VildaClcrCalculationAssumptions"],
    ["clcr_result_reference_data.js?v=7", "ClcrResultReferenceData"],
    ["clcr_acr_reference_data.js?v=1", "VildaClcrAcrReferenceData"],
    ["clcr_acr.js?v=1", "VildaClcrAcr"],
    ["clcr_pcr_reference_data.js?v=1", "VildaClcrPcrReferenceData"],
    ["clcr_pcr.js?v=1", "VildaClcrPcr"],
    ["clcr_cacr_reference_data.js?v=1", "VildaClcrCacrReferenceData"],
    ["clcr_cacr.js?v=1", "VildaClcrCacr"],
    ["clcr_oxcr_reference_data.js?v=1", "VildaClcrOxcrReferenceData"],
    ["clcr_oxcr.js?v=1", "VildaClcrOxcr"],
    ["clcr_citcr_reference_data.js?v=1", "VildaClcrCitcrReferenceData"],
    ["clcr_citcr.js?v=1", "VildaClcrCitcr"],
    ["clcr_fena_reference_data.js?v=1", "VildaClcrFenaReferenceData"],
    ["clcr_fena.js?v=1", "VildaClcrFena"],
    ["clcr_fek_reference_data.js?v=1", "VildaClcrFekReferenceData"],
    ["clcr_fek.js?v=1", "VildaClcrFek"],
    ["clcr_fecl_reference_data.js?v=1", "VildaClcrFeclReferenceData"],
    ["clcr_fecl.js?v=1", "VildaClcrFecl"],
    ["clcr_fehco3_reference_data.js?v=1", "VildaClcrFehco3ReferenceData"],
    ["clcr_fehco3.js?v=1", "VildaClcrFehco3"],
    ["clcr_measured_clearance_reference_data.js?v=1", "ClcrMeasuredClearanceReferenceData"],
    ["clcr_measured_clearance_reference.js?v=1", "ClcrMeasuredClearanceReference"],
    ["clcr_result_presentation.js?v=7", "ClcrResultPresentation"],
    ["clcr_saved_legacy_calculator.js?v=1", "ClcrSavedLegacyCalculator"],
    ["clcr_result_details.js?v=1", "ClcrResultDetails"],
  ];
  function load(path, name, style = false) {
    if (name && root[name]) return Promise.resolve();
    const url = new URL(path, base);
    if (url.origin !== root.location.origin) return Promise.reject(new Error("Moduł zapisu musi pochodzić z tej samej aplikacji."));
    if (pending.has(url.href)) return pending.get(url.href);
    const promise = new Promise((resolve, reject) => {
      const attr = style ? "href" : "src";
      const existing = Array.from(doc.querySelectorAll(style ? 'link[rel="stylesheet"]' : "script[src]")).find(node => {
        try { return new URL(node.getAttribute(attr), base).href === url.href; } catch (_) { return false; }
      });
      if (existing && (style && existing.sheet || existing.getAttribute("data-clcr-record-resource") === "loaded")) { resolve(); return; }
      const node = existing || doc.createElement(style ? "link" : "script");
      let timer = null, finished = false;
      function done(error) {
        if (finished) return;
        finished = true;
        if (timer) root.clearTimeout(timer);
        if (error || name && !root[name]) {
          // A failed static tag must also be replaceable on retry; its error
          // event will not fire a second time merely by attaching a listener.
          if (node.parentNode) node.parentNode.removeChild(node);
          reject(error || new Error("Nie można uruchomić modułu " + path.split("?")[0] + "."));
        } else { node.setAttribute("data-clcr-record-resource", "loaded"); resolve(); }
      }
      node.addEventListener("load", () => done());
      node.addEventListener("error", () => done(new Error("Nie można wczytać modułu " + path.split("?")[0] + ".")));
      timer = root.setTimeout(() => done(new Error("Upłynął czas wczytywania modułu zapisu.")), 15000);
      if (!existing) {
        if (style) node.setAttribute("rel", "stylesheet");
        else node.async = false;
        node.setAttribute(attr, url.href);
        doc.head.appendChild(node);
      }
    });
    pending.set(url.href, promise);
    promise.catch(() => { pending.delete(url.href); });
    return promise;
  }
  function ordered(list) { return list.reduce((promise, asset) => promise.then(() => load(asset[0], asset[1])), Promise.resolve()); }
  function ensureReader() {
    if (!readerPromise) {
      readerPromise = Promise.all([load("clcr_saved_results_view.css?v=1", null, true), ordered(reader)])
        .then(() => ({ reader: root.ClcrSavedResults, view: root.ClcrSavedResultsView }));
      readerPromise.catch(() => { readerPromise = null; });
    }
    return readerPromise;
  }
  function ensureEditor() {
    if (!editorPromise) {
      editorPromise = ensureReader().then(() => Promise.all([load("clcr_result_details.css?v=1", null, true), ordered(editor)]))
        .then(() => root.ClcrResultDetails);
      editorPromise.catch(() => { editorPromise = null; });
    }
    return editorPromise;
  }
  return Object.freeze({ ensureReader, ensureEditor, manifest: Object.freeze({ reader: Object.freeze(reader), editor: Object.freeze(editor) }) });
});
