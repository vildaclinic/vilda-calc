/* Shared details and explicit edit/delete transaction for one canonical Klirens note. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (root) root.ClcrResultDetails = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  let active = null;
  const text = value => String(value == null ? "" : value);
  const escape = value => text(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const decimal = value => text(value).replace(".", ",");
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}/.test(value || "") ? value.slice(0, 10).split("-").reverse().join(".") : "Brak daty badania";
  function isDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    // Validate a calendar date by its explicit UTC components. This is not a
    // conversion of a local date or of today's date into a different zone.
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(value + "T12:00:00Z");
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
  }
  const valueLabel = record => record?.displayValue ?? record?.display ?? record?.rawValue ?? record?.valueNum ?? "—";
  function editableInput(field, formulaId, unitIds) {
    // This optional selector intentionally changes a recorded calcium
    // interpretation. Editing it is an explicit correction, not a new
    // specimen checklist or an inferred patient diagnosis.
    if (formulaId === "Ca_mgkg" && field.id === "CA_clinicalMode") return true;
    if (["age", "ageMonths", "sex"].includes(field.id) || field.id === "ageDays" && formulaId !== "neonatal_egfr" || unitIds.has(field.id)) return false;
    if (/unit|Assay|Standardization|creatinineState|suspectedAKI/i.test(field.id) || /_entry_mode$/i.test(field.id)) return false;
    // Routine assumptions and optional specimen/therapy facts stay exactly as
    // recorded. Correcting a value does not ask the clinician to certify them.
    if (["checkbox", "select", "radio"].includes(field.type) && !field.required) return false;
    return true;
  }
  function fieldText(field, values) {
    const value = values[field.id];
    if (field.type === "checkbox") {
      const answer = values[`ui_${field.id}_answer`];
      return answer === "yes" ? "Tak" : answer === "no" ? "Nie" : answer === "unknown" ? "Nie podano" : value ? "Tak" : "Nie podano";
    }
    return field.options?.find(option => String(option.value) === String(value))?.label || text(value);
  }
  function unitText(field, values, fields) {
    const unit = fields.find(item => item.id === field.unitFieldId);
    return unit ? fieldText(unit, values) : field.unitFieldId ? text(values[field.unitFieldId]) : "";
  }
  function humanComment(note) {
    const body = root.ClcrSavedCalculation?.stripSnapshot(note.body) || note.body || "";
    const marker = "\n\nKomentarz lekarza:\n";
    const index = body.indexOf(marker);
    return index < 0 ? "" : body.slice(index + marker.length).trim();
  }
  function rejection(result) {
    return ({ conflict: "Ten pomiar został zmieniony w innym oknie. Otwórz jego aktualne szczegóły i spróbuj ponownie.", missing: "Ten pomiar już nie istnieje. Zmiany nie zostały zapisane.", deleted: "Ten pomiar został usunięty. Zmiany nie zostały zapisane.", "patient-mismatch": "Pomiar nie należy już do wskazanego pacjenta. Otwórz aktualną kartę pacjenta." })[result?.reason] || "Nie udało się zapisać zmiany. Spróbuj ponownie.";
  }
  async function open(options = {}) {
    const doc = options.document || root.document;
    if (!doc?.body) return null;
    if (active) active.destroy();
    const vault = options.vault || root.VildaVault;
    const patientId = text(options.patientId);
    const noteId = text(options.noteId || options.record?.noteId || options.record?.id);
    const token = {};
    let destroyed = false, pending = false, currentNote = null, currentRecord = null, draft = null;
    const host = doc.createElement("div");
    host.className = "clcr-result-dialogs";
    host.innerHTML = '<dialog class="clcr-record-dialog" id="detailsDialog" aria-labelledby="clcrDetailsTitle"><div class="clcr-record-inner"><div class="clcr-record-heading"><h2 id="clcrDetailsTitle">Szczegóły obliczenia</h2><button type="button" class="clcr-record-button secondary" data-clcr-close="detailsDialog">Zamknij</button></div><div id="calculationDetails"></div><p id="detailActionNotice" class="clcr-record-notice" role="status" hidden></p><p id="legacyEditNotice" class="clcr-record-context" hidden></p><div class="clcr-record-actions" id="detailActions" hidden><button type="button" class="clcr-record-button primary" id="editMeasurement">Edytuj pomiar</button><button type="button" class="clcr-record-button danger-outline" id="deleteMeasurement">Usuń pomiar</button></div></div></dialog><dialog class="clcr-record-dialog" id="editDialog" aria-labelledby="clcrEditTitle"><div class="clcr-record-inner"><div class="clcr-record-heading"><h2 id="clcrEditTitle">Edytuj pomiar</h2><button type="button" class="clcr-record-button secondary" data-clcr-close="editDialog">Anuluj</button></div><div id="editSummary" class="clcr-record-context"></div><form id="editForm"><label for="editDate">Data badania</label><input id="editDate" type="date" required><section class="clcr-record-context"><span class="clcr-record-label">Dane z dnia badania</span><strong id="editHistoricalSummary"></strong><p id="editDateContext"></p><button type="button" class="clcr-record-link" id="changeHistoricalContext" aria-expanded="false">Zmień dane z dnia badania</button><div id="historicalFields" hidden><label for="editAge">Wiek w dniu badania · lata</label><input id="editAge" type="text" inputmode="decimal"><div id="editSexField"><label for="editSex">Płeć uwzględniona we wzorze</label><select id="editSex"><option value="">Nie podano</option><option value="F">Kobieta</option><option value="M">Mężczyzna</option></select></div></div></section><fieldset class="clcr-record-inputs"><legend>Oryginalne dane obliczenia</legend><div id="editInputFields"></div></fieldset><p id="editError" class="clcr-record-error" role="alert" hidden></p><div class="clcr-record-actions editor"><button type="button" class="clcr-record-button secondary" data-clcr-close="editDialog">Anuluj</button><button type="submit" class="clcr-record-button primary" id="saveEditedMeasurement">Przelicz i zapisz zmiany</button></div></form></div></dialog><dialog class="clcr-record-dialog clcr-record-delete" id="deleteDialog" aria-labelledby="clcrDeleteTitle"><div class="clcr-record-inner"><span class="clcr-record-delete-icon" aria-hidden="true">×</span><h2 id="clcrDeleteTitle">Usunąć ten pomiar?</h2><p>Pomiar zniknie z Badań pacjenta, historii Klirensu i wykresu.</p><div id="deleteSummary" class="clcr-record-context"></div><p>Pozostałe pomiary pozostaną bez zmian.</p><p id="deleteError" class="clcr-record-error" role="alert" hidden></p><div class="clcr-record-actions"><button type="button" class="clcr-record-button secondary" data-clcr-close="deleteDialog">Anuluj</button><button type="button" class="clcr-record-button danger" id="confirmDeleteMeasurement">Usuń pomiar</button></div></div></dialog>';
    doc.body.appendChild(host);
    const $ = id => host.querySelector("#" + id);
    function show(id) { const dialog = $(id); if (!dialog.open) { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); } }
    function close(id) { const dialog = $(id); if (dialog.open && typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
    function lock(value) { pending = value; host.querySelectorAll("button,input,select").forEach(control => { control.disabled = value; }); if (!value && currentNote) $("editMeasurement").disabled = !root.ClcrSavedCalculation?.describe(currentNote).editable; }
    function error(id, message) { $(id).textContent = message; $(id).hidden = false; }
    function ensureAlive() { return !destroyed && active?.token === token; }
    function focusParent() {
      const target = options.anchor?.isConnected ? options.anchor : doc.querySelector(".vilda-clcr-history button, .vilda-lab-hist button, #cpcNew");
      try { target?.focus(); } catch (_) { /* detached origin */ }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const id of ["deleteDialog", "editDialog", "detailsDialog"]) close(id);
      host.remove();
      if (active?.token === token) active = null;
      focusParent();
    }
    active = { token, destroy };
    const api = { destroy, close: destroy, token };
    function changed(action) {
      try { options.onChanged?.({ patientId, noteId, action }); } catch (_) { /* view may be detached */ }
      const EventClass = doc.defaultView?.CustomEvent || root.CustomEvent;
      if (EventClass) doc.dispatchEvent(new EventClass("vilda:clcr-results-changed", { detail: { patientId } }));
    }
    function projection(note) {
      const saved = root.ClcrSavedCalculation?.readSaved(note);
      if (saved?.valid) return { ...saved, id: note.id, noteId: note.id, note, label: saved.method };
      const projected = root.ClcrSavedResults?.projectPatientNotes?.([note]);
      return projected?.measurements?.[0] || { id: note.id, noteId: note.id, note, label: note.labResult?.test || note.title || "Wynik obliczenia", displayValue: note.labResult?.value || "—", unit: note.labResult?.unit || "", norm: saved?.invalidated ? "" : note.labResult?.norm || "", tone: "neutral", category: null, interpretation: saved?.reason || "Brak zapisanej oceny." };
    }
    function renderDetails(message) {
      currentRecord = projection(currentNote);
      const saved = root.ClcrSavedCalculation?.readSaved(currentNote);
      const description = root.ClcrSavedCalculation?.describe(currentNote) || { editable: false, reason: "Brak danych wejściowych potrzebnych do edycji." };
      const snapshot = description.snapshot;
      const age = snapshot?.capturedContext?.ageYears ?? saved?.context?.ageYears;
      const values = snapshot?.values || {};
      const hasDays = typeof age === "number" && age < 1 && Number(values.age) === 0 && Number(values.ageMonths || 0) === 0 && values.ageDays != null && values.ageDays !== "";
      const context = hasDays ? "Wiek w dniu badania: " + values.ageDays + " dni życia" : age == null ? "Nie zapisano wieku" : "Wiek w dniu badania: " + decimal(age) + " lat";
      const allFields = snapshot?.fields || [];
      const fields = allFields.filter(field => editableInput(field, snapshot.formulaId, new Set()) || /Assay|Standardization/i.test(field.id) && values[field.id] !== "" && values[field.id] !== false);
      const inputRows = fields.map(field => `<div><dt>${escape(field.label)}</dt><dd>${escape(fieldText(field, values))}${field.unitFieldId ? " " + escape(unitText(field, values, allFields)) : ""}</dd></div>`).join("");
      const record = currentRecord;
      $("calculationDetails").dataset.noteId = noteId;
      $("calculationDetails").dataset.recordId = noteId;
      $("calculationDetails").innerHTML = `<p class="clcr-record-eyebrow">KLIRENS · ${escape(dateLabel(currentNote.clinicalDateISO))}</p><h3>${escape(record.label || record.method)}</h3><p class="clcr-record-value ${escape(record.tone || "neutral")}">${escape(decimal(valueLabel(record)))} <span>${escape(record.unit)}</span></p>${record.boundary ? `<p>Przed zaokrągleniem: ${escape(record.boundary)}</p>` : ""}<dl class="clcr-record-grid"><div><dt>Dane z dnia badania</dt><dd>${escape(context)}${values.sex ? " · " + (values.sex === "F" ? "kobieta" : "mężczyzna") : ""}</dd></div><div><dt>Zapisana ocena</dt><dd>${record.category ? escape(record.category) + " · " : ""}${escape(record.interpretation || record.description || record.assessmentText || "Brak zapisanej oceny")}</dd></div>${inputRows}<div><dt>Norma przy zapisie</dt><dd>${escape(record.norm || "Brak zapisanej normy")}</dd></div><div><dt>Metoda</dt><dd>${escape(record.label || record.method)}</dd></div></dl>${record.comment ? `<p class="clcr-record-context">${escape(record.comment)}</p>` : ""}${record.assumptions ? `<p class="clcr-record-source">${escape(record.assumptions)}</p>` : ""}${record.source?.label ? `<p class="clcr-record-source">${escape(record.source.label)} · interpretacja zachowana z dnia zapisu.</p>` : ""}`;
      $("detailActions").hidden = false;
      $("editMeasurement").disabled = !description.editable;
      $("legacyEditNotice").hidden = description.editable;
      $("legacyEditNotice").textContent = description.reason;
      $("detailActionNotice").hidden = !message;
      $("detailActionNotice").textContent = message || "";
    }
    function historicalSummary(values, context) {
      const age = Object.prototype.hasOwnProperty.call(context, "ageYears") ? context.ageYears : text(values.age).trim() ? Number(values.age) + Number(values.ageMonths || 0) / 12 : null;
      if (typeof age === "number" && age < 1 && Number(values.age) === 0 && Number(values.ageMonths || 0) === 0 && values.ageDays != null && values.ageDays !== "") return "Wiek w dniu badania: " + values.ageDays + " dni życia";
      return (Number.isFinite(age) ? "Wiek w dniu badania: " + decimal(age) + " lat" : "Nie zapisano wieku") + (values.sex ? " · płeć: " + (values.sex === "F" ? "kobieta" : "mężczyzna") : "");
    }
    function openEditor() {
      if (pending || !currentNote) return;
      const description = root.ClcrSavedCalculation?.describe(currentNote);
      if (!description?.editable) return;
      draft = { note: clone(currentNote), description, historicalChanged: false, changedFields: new Set() };
      const { values, fields, context } = description;
      $("editSummary").innerHTML = `<strong>${escape(currentRecord.label || currentRecord.method)}</strong><span>Dotychczasowy wynik: <b>${escape(decimal(valueLabel(currentRecord)))} ${escape(currentRecord.unit)}</b> · ${escape(dateLabel(currentNote.clinicalDateISO))}</span>`;
      $("editDate").value = text(currentNote.clinicalDateISO).slice(0, 10);
      $("editHistoricalSummary").textContent = historicalSummary(values, context);
      $("editDateContext").textContent = "Zmiana daty nie zmienia wieku z zapisu.";
      $("historicalFields").hidden = true;
      $("changeHistoricalContext").setAttribute("aria-expanded", "false");
      $("editAge").value = context.ageYears == null ? values.age || "" : decimal(context.ageYears);
      $("editSex").value = values.sex || "";
      $("editSexField").hidden = !Object.prototype.hasOwnProperty.call(values, "sex");
      $("changeHistoricalContext").hidden = !Object.prototype.hasOwnProperty.call(values, "age") && !Object.prototype.hasOwnProperty.call(values, "sex");
      const unitIds = new Set(fields.map(field => field.unitFieldId).filter(Boolean));
      const visible = fields.filter(field => editableInput(field, description.snapshot.formulaId, unitIds));
      $("editInputFields").innerHTML = visible.map(field => {
        const id = "editField-" + field.id, unit = unitText(field, values, fields);
        const attributes = `id="${escape(id)}" data-clcr-edit-field="${escape(field.id)}"${field.required ? " required" : ""}`;
        let control;
        if (field.type === "select") control = `<select ${attributes}>${field.options.map(option => `<option value="${escape(option.value)}"${String(option.value) === String(values[field.id]) ? " selected" : ""}>${escape(option.label)}</option>`).join("")}</select>`;
        else if (field.type === "checkbox") control = `<input ${attributes} type="checkbox"${values[`ui_${field.id}_answer`] === "yes" || !values[`ui_${field.id}_answer`] && values[field.id] ? " checked" : ""}>`;
        else control = `<div class="clcr-record-control"><input ${attributes} type="${["date", "datetime-local"].includes(field.type) ? field.type : "text"}"${["date", "datetime-local"].includes(field.type) ? "" : ' inputmode="decimal"'} value="${escape(values[field.id])}">${unit ? `<span>${escape(unit)}</span>` : ""}</div>`;
        return `<div class="clcr-record-field"><label for="${escape(id)}">${escape(field.label)}</label>${control}</div>`;
      }).join("");
      $("editInputFields").querySelectorAll("[data-clcr-edit-field]").forEach(control => control.addEventListener("input", () => { if (draft) draft.changedFields.add(control.dataset.clcrEditField); }));
      $("editError").hidden = true;
      show("editDialog");
    }
    async function saveEdited(event) {
      event.preventDefault();
      if (pending || !draft) return;
      $("editError").hidden = true;
      if (!$("editForm").reportValidity()) return;
      const date = $("editDate").value;
      if (!isDate(date)) { error("editError", "Wpisz prawidłową datę badania."); return; }
      const values = { ...draft.description.values };
      host.querySelectorAll("[data-clcr-edit-field]").forEach(control => { values[control.dataset.clcrEditField] = control.type === "checkbox" ? control.checked : control.value; });
      const request = { values, changedFieldIds: [...draft.changedFields], clinicalDateISO: date };
      if (draft.historicalChanged) { request.ageYears = $("editAge").value.replace(",", "."); if (!$("editSexField").hidden) request.sex = $("editSex").value; }
      let dp, payload;
      try {
        dp = root.ClcrSavedCalculation.recalculate(draft.description.snapshot, request);
        const snapshot = root.ClcrSavedCalculation.createSnapshot(dp, { capture: dp.capture, patientId, clinicalDateISO: date });
        payload = root.ClcrSavedResults.buildPatientNotePayload(dp, { patientId, clinicalDateISO: date, comment: humanComment(draft.note) });
        payload.body += "\n\n" + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
        Object.assign(payload, { id: noteId, patientId, baseRev: draft.note.rev });
      } catch (cause) { error("editError", cause?.message || "Sprawdź dane obliczenia."); return; }
      if (typeof vault?.updateExistingPatientNote !== "function") { error("editError", "Moduł bezpiecznej edycji nie jest dostępny. Odśwież aplikację."); return; }
      lock(true);
      try {
        const result = await vault.updateExistingPatientNote(payload);
        if (!result?.updated) { if (ensureAlive()) error("editError", rejection(result)); return; }
        changed("updated");
        const fresh = await vault.getPatientNote(noteId);
        if (!ensureAlive()) return;
        if (!fresh || fresh.patientId !== patientId) { destroy(); return; }
        currentNote = fresh;
        close("editDialog");
        draft = null;
        renderDetails("Zapisano zmiany i przeliczono wynik.");
      } catch (cause) { if (ensureAlive()) error("editError", cause?.message || "Nie udało się zapisać zmian."); }
      finally { if (ensureAlive()) lock(false); }
    }
    function openDelete() {
      if (pending || !currentNote) return;
      $("deleteSummary").innerHTML = `<strong>${escape(currentRecord.label || currentRecord.method)}</strong><span class="clcr-record-value ${escape(currentRecord.tone || "neutral")}">${escape(decimal(valueLabel(currentRecord)))} <small>${escape(currentRecord.unit)}</small></span><time datetime="${escape(text(currentNote.clinicalDateISO).slice(0, 10))}">Data badania: ${escape(dateLabel(currentNote.clinicalDateISO))}</time>`;
      $("deleteError").hidden = true;
      show("deleteDialog");
    }
    async function confirmDelete() {
      if (pending || !currentNote) return;
      if (typeof vault?.removeExistingPatientNote !== "function") { error("deleteError", "Moduł bezpiecznego usuwania nie jest dostępny. Odśwież aplikację."); return; }
      lock(true);
      try {
        const result = await vault.removeExistingPatientNote({ id: noteId, patientId, baseRev: currentNote.rev });
        if (!result?.removed) { if (ensureAlive()) error("deleteError", rejection(result)); return; }
        changed("deleted");
        if (ensureAlive()) destroy();
      } catch (cause) { if (ensureAlive()) error("deleteError", cause?.message || "Nie udało się usunąć pomiaru."); }
      finally { if (ensureAlive()) lock(false); }
    }
    host.querySelectorAll("[data-clcr-close]").forEach(button => button.addEventListener("click", () => { if (pending) return; if (button.dataset.clcrClose === "detailsDialog") destroy(); else { close(button.dataset.clcrClose); draft = null; } }));
    for (const id of ["detailsDialog", "editDialog", "deleteDialog"]) $(id).addEventListener("cancel", event => { if (pending) event.preventDefault(); else if (id === "detailsDialog") destroy(); else draft = null; });
    $("editMeasurement").addEventListener("click", openEditor);
    $("deleteMeasurement").addEventListener("click", openDelete);
    $("editForm").addEventListener("submit", saveEdited);
    $("confirmDeleteMeasurement").addEventListener("click", confirmDelete);
    $("changeHistoricalContext").addEventListener("click", () => { $("historicalFields").hidden = !$("historicalFields").hidden; $("changeHistoricalContext").setAttribute("aria-expanded", String(!$("historicalFields").hidden)); });
    for (const id of ["editAge", "editSex"]) $(id).addEventListener("input", () => { if (draft) draft.historicalChanged = true; });
    $("calculationDetails").textContent = "Wczytywanie pomiaru…";
    show("detailsDialog");
    try {
      if (!vault || !patientId || !noteId || typeof vault.getPatientNote !== "function") throw new Error("Nie można odczytać pomiaru. Otwórz kartę pacjenta ponownie.");
      if (typeof vault.isUnlocked === "function" && !vault.isUnlocked()) throw new Error("Odblokuj kartę pacjenta, aby zobaczyć szczegóły pomiaru.");
      const note = await vault.getPatientNote(noteId);
      if (!ensureAlive()) return api;
      if (!note || note.patientId !== patientId || note.category !== "wynik-klirens") throw new Error("Tego pomiaru już nie ma w karcie wskazanego pacjenta.");
      currentNote = note;
      renderDetails();
    } catch (cause) { if (ensureAlive()) $("calculationDetails").textContent = cause?.message || "Nie udało się odczytać pomiaru."; }
    return api;
  }
  return Object.freeze({ open });
});
