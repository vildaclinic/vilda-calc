/* Read-only history of the selected patient. The encounter owns loading a
 * saved revision into the working form after an explicit edit action. */
(function (w) {
  'use strict';
  const sessions = new WeakMap();
  function lockListeners(vault) {
    if (!sessions.has(vault)) {
      const listeners = new Set();
      sessions.set(vault, listeners);
      vault.onLock?.(() => listeners.forEach(close => close()));
    }
    return sessions.get(vault);
  }
  function mount(host, options) {
    const {patientId, patientName, isCurrent, onBack} = options;
    const doc = host.ownerDocument, vault = w.VildaVault, projection = w.VildaHomeVisitProjection;
    const token = vault.captureSyncOperationSession();
    let scene, detail, rows = [], notes = null, plans = null, closed = false, readingDocuments;
    function current() {
      if (closed || !isCurrent() || w.VildaVault !== vault || !vault.isUnlocked()) return false;
      try { vault.assertSyncOperationSession(token); return true; } catch (_) { return false; }
    }
    function check() {
      if (current()) return true;
      if (!closed) onBack(false);
      return false;
    }
    const onLock = () => onBack(false);
    const scopeEvents = ['vilda:user-state-cleared', 'vilda:patient-loaded', 'vilda:session-changed'];
    const listeners = lockListeners(vault);
    listeners.add(onLock);
    const back = w.VildaHomeDialogHistory?.create({isOpen: () => !closed, requestClose: () => onBack()});
    function escape(event) {
      if (event.key === 'Escape' && !detail && !doc.querySelector('dialog[open]') && check()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onBack();
      }
    }
    function destroy() {
      if (closed) return;
      closed = true;
      listeners.delete(onLock);
      detail?.close(false);
      scene?.destroy();
      back?.release();
      doc.removeEventListener('keydown', escape);
      doc.removeEventListener('focusin', check, true);
      doc.removeEventListener('pointerdown', check, true);
      scopeEvents.forEach(event => doc.removeEventListener(event, check));
      w.clearInterval(timer);
      rows = []; notes = plans = null;
      host.replaceChildren();
      host.removeAttribute('aria-busy');
    }
    async function readDocuments() {
      const [documents, care] = await Promise.allSettled([
        vault.listPatientNotesForPatient(patientId), vault.listCarePlans({patientId})
      ]);
      if (!check()) return;
      notes = Array.isArray(documents.value) ? documents.value.filter(note => note?.patientId === patientId) : null;
      plans = Array.isArray(care.value) ? care.value : null;
    }
    function general() {
      if (!notes) return {sections: [{title: 'Notatki ogólne', entries: [{body: 'Nie udało się odczytać notatek pacjenta.'}]}]};
      const data = projection.getGeneral({patientId, name: patientName}, notes);
      return {sections: [{title: 'Notatki ogólne', entries: data.notes.map(note => ({...note, meta: note.dateLabel}))}]};
    }
    function open(index, opener) {
      if (!check() || !rows[index] || detail) return;
      detail = w.VildaHomeVisitDetail.open({
        rows, index, patientName, opener, isCurrent: current,
        onSelect: i => scene.select(i), onClose: () => { detail = null; },
        onEdit: options.onEdit, onOpenRecord: options.onOpenRecord,
        getGeneral: general, getComparison: projection.getComparison,
        renderChart: (container, row, metric, expanded) => projection.renderChart(container, row, rows, metric, expanded),
        appendDocuments(container, row, refresh) {
          w.VildaVisitHistory.appendDocuments(container, row, patientId, notes, plans, async () => {
            if (!check()) return;
            readingDocuments ||= readDocuments().finally(() => { readingDocuments = null; });
            await readingDocuments;
            if (check() && container.isConnected) refresh();
          });
        }
      });
    }
    function message(label, retry) {
      host.replaceChildren();
      const notice = doc.createElement('p');
      notice.setAttribute('role', 'status'); notice.textContent = label;
      const leave = doc.createElement('button');
      leave.type = 'button'; leave.textContent = options.backLabel;
      leave.addEventListener('click', () => onBack());
      host.append(notice, leave);
      if (retry) {
        const button = doc.createElement('button');
        button.type = 'button'; button.textContent = 'Spróbuj ponownie';
        button.addEventListener('click', read, {once: true}); host.append(button); button.focus();
      }
    }
    async function read() {
      host.setAttribute('aria-busy', 'true');
      message('Odczytywanie historii wizyt…');
      try {
        const [saved] = await Promise.all([vault.getPatientVisits(patientId), readDocuments()]);
        if (!check()) return;
        const visits = saved.filter(row => row?.patientId === patientId && row.visitId && row.payload);
        const totals = new Map(), positions = new Map();
        visits.forEach(row => totals.set(row.clinicalDateISO, (totals.get(row.clinicalDateISO) || 0) + 1));
        const excerpts = new Map();
        for (const note of notes || []) {
          const id = note.visitContext?.visitId;
          if (!id || excerpts.has(id) || note.treatmentContext || note.careContext || note.reminderContext ||
              w.VildaLabHistory?.isResultNote(note) || w.VildaLabHistory?.isClcrResultNote(note)) continue;
          const excerpt = typeof note.body === 'string' && note.body.trim() || note.title;
          if (typeof excerpt === 'string' && excerpt.trim()) excerpts.set(id, excerpt.trim().slice(0, 200));
        }
        rows = visits.map(row => {
          const date = row.clinicalDateISO, index = (positions.get(date) || 0) + 1;
          positions.set(date, index);
          const result = projection.project(row, {ordinal: date && totals.get(date) > 1 ? 'Wpis ' + index + ' z ' + totals.get(date) + ' tego dnia' : ''});
          if (!result.description) result.description = excerpts.get(row.visitId) || '';
          return result;
        });
        scene = w.VildaHomeVisitScene.mount(host, {rows, patientName, onOpen: open, onBack, backLabel: options.backLabel});
      } catch (_) {
        if (check()) message('Nie udało się odczytać historii wizyt.', true);
      } finally { if (!closed) host.removeAttribute('aria-busy'); }
    }
    doc.addEventListener('keydown', escape);
    doc.addEventListener('focusin', check, true);
    doc.addEventListener('pointerdown', check, true);
    scopeEvents.forEach(event => doc.addEventListener(event, check));
    const timer = w.setInterval(check, 250);
    back?.enter();
    read();
    return {destroy};
  }
  w.VildaHomeVisitHistory = Object.freeze({mount});
})(window);
