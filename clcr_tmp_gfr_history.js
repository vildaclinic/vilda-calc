/* Patient-scoped comparison inputs only. A locked, changed, or unreadable
 * patient record must never be replaced with a fictitious previous result. */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory;
  if (root?.document) root.ClcrTmpGfrHistory = factory(root);
})(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";
  const doc = root.document;
  let generation = 0, patientId = null, notes = null, pending = false, failed = false;
  let refreshQueued = false;

  function todayISO() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function refreshResult() {
    if (refreshQueued) return;
    refreshQueued = true;
    root.setTimeout(() => {
      refreshQueued = false;
      if (doc.getElementById("formulaPicker")?.value === "TMP_GFR" && root.clcrIsResetting !== true) root.update?.();
    }, 0);
  }

  function invalidate() {
    generation += 1;
    patientId = null;
    notes = null;
    pending = false;
    failed = false;
    refreshResult();
  }

  function load(id) {
    const token = ++generation;
    patientId = id;
    pending = true;
    failed = false;
    notes = null;
    Promise.resolve().then(() => root.ClcrVisitSave.readTmpGfrHistory(id)).then(value => {
      if (token !== generation || id !== root.ClcrVisitSave?.resolveCurrentPatientId?.() || !root.ClcrVisitSave?.vaultUnlocked?.()) return;
      if (!Array.isArray(value)) throw new Error("Invalid history");
      notes = value;
      pending = false;
      refreshResult();
    }).catch(() => {
      if (token !== generation) return;
      pending = false;
      failed = true;
      notes = null;
      refreshResult();
    });
  }

  function comparison(input) {
    if (input?.burosumab !== true) return {};
    const api = root.ClcrVisitSave;
    const id = api?.resolveCurrentPatientId?.();
    if (!id || !api?.vaultUnlocked?.()) {
      if (patientId !== null || pending || notes !== null) {
        generation += 1; patientId = null; notes = null; pending = false; failed = false;
      }
      return { previous: null, comparisonReason: "patient-unavailable" };
    }
    if (typeof api.readTmpGfrHistory !== "function") return { previous: null, comparisonReason: "history-unavailable" };
    if (patientId !== id || (!pending && !failed && notes === null)) load(id);
    if (pending) return { previous: null, comparisonReason: "history-loading" };
    if (failed) return { previous: null, comparisonReason: "history-unavailable" };
    const selection = root.ClcrTmpGfrPersistence?.getPreviousComparison?.(notes, input, {
      patientId: id, clinicalDateISO: input.clinicalDate || todayISO(),
    });
    return selection ? { previous: selection.previous, comparisonReason: selection.reason || null }
      : { previous: null, comparisonReason: "history-unavailable" };
  }

  function init() {
    doc.addEventListener("vilda:patient-loaded", invalidate);
    doc.addEventListener("vilda:persist-restored", invalidate);
    doc.addEventListener("input", event => {
      if (event.target?.id === "clcrVisitDate") refreshResult();
    });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
  return Object.freeze({ comparison, invalidate, todayISO });
});
