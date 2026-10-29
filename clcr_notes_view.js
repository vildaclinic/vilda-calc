/* Read-only presentation of canonical Klirens measurement notes. The existing
 * frozen-record reader owns numbers, references and interpretation. This view
 * never evaluates a clinical policy or rewrites the persisted note body.
 */
(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (root) root.ClcrNotesView = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const CATEGORY = "wynik-klirens";
  const text = value => typeof value === "string" ? value.trim() : "";
  const decimal = value => String(value == null ? "" : value).replace(".", ",");
  let detailsGeneration = 0, activeDetails = null;
  const lockBound = new WeakSet();

  function dateLabel(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text(value));
    return match ? `${match[3]}.${match[2]}.${match[1]}` : "Brak daty badania";
  }

  function humanBody(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    // Persistence data is not a doctor comment. Use the canonical envelope
    // helper where available; recognition of newer formats is display-only.
    let visible = typeof root.ClcrSavedCalculation?.stripSnapshot === "function"
      ? root.ClcrSavedCalculation.stripSnapshot(body) : body;
    const technical = visible.search(/(?:^|\n)\[VILDA_CLCR_CALCULATION_[^\n]*\]/);
    if (technical >= 0) visible = visible.slice(0, technical);
    const marker = /(?:^|\n\n)Komentarz lekarza:\n/.exec(visible);
    if (marker) return visible.slice(marker.index + marker[0].length).trim();
    // Older, manually authored Klirens notes can contain genuine free text.
    // Keep it, but never fall back to rendering a generated clinical tree.
    if (/^\s*Kalkulator klirensu(?:\s|·)/.test(visible) ||
      /(?:^|\n)Utrwalone dane |(?:^|\n).*? \[(?:dane|lista|tekst|liczba|odpowiedź|brak)\]:/.test(visible)) return "";
    return visible.trim();
  }

  function model(note, options = {}) {
    if (!note || note.category !== CATEGORY) return null;
    const patientId = text(options.patientId || note.patientId);
    if (text(note.patientId) && patientId !== note.patientId) return null;
    const lab = note.labResult || {};
    let point = null;
    try {
      point = root.ClcrSavedResults?.projectPatientNotes?.([note], { patientId })?.measurements?.[0] || null;
    } catch (_) { /* An unreadable capture cannot acquire a new assessment. */ }
    const available = !!point && !["invalidated", "unavailable"].includes(point.status);
    const display = text(point?.displayValue) || text(lab.value) || (Number.isFinite(lab.valueNum) ? String(lab.valueNum) : "—");
    const unit = text(point?.unit) || text(lab.unit);
    const label = text(point?.label) || text(lab.test) || text(note.title) || "Wynik obliczenia";
    const norm = available ? text(point.norm) : "";
    const criterion = available && point.reference?.kind === "recorded-criterion";
    const category = available ? text(point.category) : "";
    const outOfRange = available && typeof point.outOfRange === "boolean" ? point.outOfRange : null;
    const tone = available && ["success", "normal", "warning", "danger"].includes(point.tone) ? point.tone : "neutral";
    const status = category || (criterion ? "Ocena kryterium" : outOfRange === true ? "Wynik poza zakresem" : outOfRange === false ? "W zakresie" : "Bez zapisanej oceny");
    const interpretation = available ? text(point.interpretation) : "Zapisana ocena jest niedostępna. Otwórz szczegóły pomiaru.";
    return {
      noteId: text(note.id), patientId, label, display: decimal(display), unit,
      dateISO: text(point?.dateISO) || text(note.clinicalDateISO),
      dateLabel: dateLabel(text(point?.dateISO) || text(note.clinicalDateISO)),
      norm, referenceValue: norm && unit && norm.endsWith(unit) ? norm.slice(0, -unit.length).trim() : norm,
      referenceUnit: norm && unit && norm.endsWith(unit) ? unit : "",
      referenceLabel: norm ? criterion ? "Próg przy zapisie" : "Norma przy zapisie" : "Odniesienie",
      tone, category, outOfRange, status, interpretation,
      boundary: available ? decimal(text(point.boundary)) : "",
      caution: available && text(point.comment) !== interpretation ? text(point.comment) : "",
      comment: humanBody(note),
    };
  }

  function title(note) {
    const record = model(note);
    return record ? `${record.label}: ${record.display}${record.unit ? " " + record.unit : ""}` : "";
  }

  function add(parent, tag, className, content) {
    const node = parent.ownerDocument.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    parent.appendChild(node);
    return node;
  }

  function unlocked(vault) {
    return typeof vault?.isUnlocked !== "function" || vault.isUnlocked();
  }

  function bindLock(vault) {
    if (!vault || typeof vault.onLock !== "function" || lockBound.has(vault)) return;
    lockBound.add(vault);
    vault.onLock(() => {
      detailsGeneration += 1;
      activeDetails?.destroy?.();
      activeDetails = null;
    });
  }

  async function openDetails(options = {}) {
    const note = options.note || {}, vault = options.vault || root.VildaVault;
    const patientId = text(options.patientId || note.patientId), noteId = text(note.id);
    const alive = typeof options.alive === "function" ? options.alive : () => !options.anchor || options.anchor.isConnected;
    if (note.category !== CATEGORY || !noteId || !patientId || note.patientId && note.patientId !== patientId || !unlocked(vault) || !alive()) return null;
    bindLock(vault);
    const generation = ++detailsGeneration;
    const resources = options.resources || root.ClcrRecordResources;
    const details = options.details || await resources?.ensureEditor?.();
    if (generation !== detailsGeneration || !unlocked(vault) || !alive()) return null;
    if (typeof details?.open !== "function") throw new Error("Szczegóły pomiaru są niedostępne. Odśwież aplikację.");
    // A delayed note read after locking must not paint clinical text before
    // the dialog's returned API can be destroyed. Writes keep their existing
    // canonical vault methods and revision checks.
    const guardedVault = {};
    guardedVault.getPatientNote = async id => {
      if (!unlocked(vault) || !alive() || generation !== detailsGeneration) throw new Error("Karta pacjenta jest zablokowana.");
      const result = await vault.getPatientNote(id);
      if (!unlocked(vault) || !alive() || generation !== detailsGeneration) throw new Error("Karta pacjenta jest zablokowana.");
      return result;
    };
    for (const method of ["isUnlocked", "updateExistingPatientNote", "removeExistingPatientNote"]) {
      if (typeof vault?.[method] === "function") guardedVault[method] = vault[method].bind(vault);
    }
    let pendingChange = null;
    const changed = change => {
      if (!alive() || !unlocked(vault)) return;
      if (change?.action === "deleted") { pendingChange = null; options.onChanged?.(change); }
      else { pendingChange = change; options.onRecordChanged?.(change); }
    };
    const flushChanged = () => {
      const change = pendingChange;
      pendingChange = null;
      if (change && generation === detailsGeneration && alive() && unlocked(vault)) options.onChanged?.(change);
    };
    const api = await details.open({
      patientId, noteId, vault: guardedVault, document: options.document,
      anchor: options.anchor, onChanged: changed,
    });
    if (generation !== detailsGeneration || !unlocked(vault) || !alive()) { api?.destroy?.(); return null; }
    const doc = options.document || root.document;
    const dialogHost = doc?.querySelector?.(".clcr-result-dialogs");
    let observer = null;
    const handle = { ...api, destroy() { observer?.disconnect(); api?.destroy?.(); flushChanged(); } };
    handle.close = handle.destroy;
    if (typeof root.MutationObserver === "function" && doc?.body && dialogHost) {
      observer = new root.MutationObserver(() => {
        if (!dialogHost.isConnected) { observer.disconnect(); flushChanged(); if (activeDetails === handle) activeDetails = null; }
        else if (!alive() || !unlocked(vault)) { handle.destroy(); if (activeDetails === handle) { activeDetails = null; detailsGeneration += 1; } }
      });
      observer.observe(doc.body, { childList: true, subtree: true });
    }
    activeDetails = handle;
    return handle;
  }

  function content(host, record) {
    add(host, "h3", "clcr-note-title", record.label);
    const main = add(host, "div", "clcr-note-main");
    main.setAttribute("data-tone", record.tone);
    const value = add(main, "div", "clcr-note-column");
    add(value, "span", "clcr-note-caption", "Wynik pacjenta");
    add(value, "strong", "clcr-note-value", record.display);
    if (record.unit) add(value, "span", "clcr-note-unit", record.unit);
    if (record.boundary) add(value, "span", "clcr-note-boundary", `Granica przed zaokrągleniem: ${record.boundary}.`);
    const reference = add(main, "div", "clcr-note-column");
    add(reference, "span", "clcr-note-caption", record.referenceLabel);
    const limit = add(reference, "strong", "clcr-note-reference", record.referenceValue || "Nie zapisano");
    if (!record.norm) limit.classList.add("clcr-note-reference-empty");
    if (record.referenceUnit) add(reference, "span", "clcr-note-unit", record.referenceUnit);
    add(host, "p", "clcr-note-status", record.status);
    if (record.interpretation) add(host, "p", "clcr-note-interpretation", record.interpretation);
    if (record.caution) add(host, "p", "clcr-note-caution", record.caution);
    if (record.comment) {
      const comment = add(host, "div", "clcr-note-comment");
      add(comment, "strong", "", "Komentarz lekarza");
      add(comment, "p", "", record.comment);
    }
  }

  function render(host, options = {}) {
    let currentNote = options.note, record = model(currentNote, options);
    if (!host || !record) return null;
    const vault = options.vault || root.VildaVault;
    if (!unlocked(vault)) { host.textContent = ""; return null; }
    host.textContent = "";
    host.classList.add("vilda-clcr-note");
    host.setAttribute("data-note-id", record.noteId);
    host.setAttribute("data-clcr-note-state", "ready");
    const meta = add(host, "div", "clcr-note-meta");
    add(meta, "span", "clcr-note-kind", "Klirens");
    const date = add(meta, "time", "", record.dateLabel);
    if (record.dateISO) date.setAttribute("datetime", record.dateISO);
    const body = add(host, "div", "clcr-note-content");
    content(body, record);
    const actions = add(host, "div", "clcr-note-actions");
    const details = add(actions, "button", "clcr-note-button", "Szczegóły obliczenia →");
    details.type = "button";
    const notice = add(host, "p", "clcr-note-notice");
    notice.hidden = true;
    notice.setAttribute("role", "status");
    details.addEventListener("click", () => {
      if (details.disabled || !unlocked(vault)) return;
      details.disabled = true;
      notice.hidden = true;
      openDetails({ ...options, note: currentNote, vault, anchor: details, alive: () => host.isConnected && unlocked(vault),
        onRecordChanged: change => {
          if (typeof vault?.getPatientNote !== "function") return;
          Promise.resolve(vault.getPatientNote(record.noteId)).then(note => {
            if (!host.isConnected || !unlocked(vault) || !note) return;
            const next = model(note, options);
            if (!next) return;
            currentNote = note;
            record = next;
            date.textContent = record.dateLabel;
            if (record.dateISO) date.setAttribute("datetime", record.dateISO);
            body.textContent = "";
            content(body, record);
            options.onRecordChanged?.(change);
          }).catch(() => { /* Dialog still owns the canonical read/error state. */ });
        },
      }).catch(() => {
        if (!host.isConnected || !unlocked(vault)) return;
        notice.textContent = "Nie udało się otworzyć szczegółów pomiaru. Spróbuj ponownie.";
        notice.hidden = false;
      }).finally(() => { if (host.isConnected && unlocked(vault)) details.disabled = false; });
    });
    if (typeof options.openBadania === "function") {
      const link = add(actions, "button", "clcr-note-link", "Zobacz w Badaniach →");
      link.type = "button";
      link.addEventListener("click", () => { if (host.isConnected && unlocked(vault)) options.openBadania(); });
    }
    return { get record() { return record; }, host };
  }

  return Object.freeze({ CATEGORY, model, title, humanBody, render, openDetails });
});
