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
  function element(tag, text, className) {
    const node = w.document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function visitLabel(date) {
    return date ? 'Wizyta z ' + date.split('-').reverse().join('.') : 'Wizyta bez potwierdzonej daty';
  }
  function timestamp(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('pl-PL', {dateStyle: 'short', timeStyle: 'short'}) : '';
  }
  let activeDialog;
  function openDialog({id, title, applyLabel, opener, isCurrent, onClose, onApply}) {
    if (activeDialog || !isCurrent()) return null;
    const doc = w.document;
    const dialog = doc.getElementById(id) || w.VildaHomeWorkspace.createDialog({
      id, titleId: id + 'Title', title, applyLabel: applyLabel || '',
      onClose: () => activeDialog?.close(), onApply: () => activeDialog?.apply()
    });
    const body = dialog.querySelector('.vhome-dialog-body'), cancel = dialog.querySelector('.vhome-dialog-cancel');
    cancel.textContent = onApply ? 'Anuluj' : 'Zamknij';
    dialog.querySelector('.vhome-dialog-apply').hidden = !onApply;
    dialog.setAttribute('aria-modal', 'true');
    if (onApply) dialog.querySelector('.vhome-dialog-close').setAttribute('aria-label', 'Zamknij potwierdzenie');
    const listeners = lockListeners(w.VildaVault);
    const locked = () => close(false);
    const back = w.VildaHomeDialogHistory?.create({isOpen: () => dialog.open, requestClose: () => close()});
    const timer = w.setInterval(() => { if (!dialog.open || !isCurrent()) close(false); }, 250);
    function close(focus = true) {
      if (activeDialog !== view) return true;
      activeDialog = null;
      listeners.delete(locked);
      w.clearInterval(timer);
      w.removeEventListener('pagehide', locked);
      if (dialog.open) dialog.close();
      body.replaceChildren();
      back?.release();
      if (focus && isCurrent() && opener.isConnected) opener.focus({preventScroll: true});
      onClose?.();
      return true;
    }
    const view = {body, close, apply: onApply, isOpen: () => activeDialog === view && dialog.open && isCurrent()};
    activeDialog = view;
    listeners.add(locked);
    w.addEventListener('pagehide', locked);
    w.VildaHomeWorkspace.fitDialog(dialog);
    dialog.showModal();
    back?.enter();
    cancel.focus({preventScroll: true});
    return view;
  }
  function confirmRemoval(capture, isCurrent, opener) {
    return new Promise(resolve => {
      let confirmed = false;
      const view = openDialog({
        id: 'vhomeVisitTrashConfirm', title: 'Przenieść wizytę do kosza?', applyLabel: 'Przenieś do kosza', isCurrent, opener,
        onClose: () => resolve(confirmed),
        onApply() { confirmed = isCurrent(); view.close(); }
      });
      if (!view) { resolve(false); return; }
      view.body.append(element('h3', capture.patientName), element('p', visitLabel(capture.dateCertain && capture.date), 'vht-visit'));
      const saved = timestamp(capture.savedAtISO);
      if (saved) view.body.append(element('p', 'Ostatni zapis · ' + saved, 'vht-meta'));
      view.body.append(element('p', 'Wizyta trafi do kosza na 30 dni. Możesz ją przywrócić ze wszystkimi zapisanymi wersjami, pomiarami i danymi z formularzy.'),
        element('p', 'Badania, notatki, plany opieki i przypomnienia pozostaną w Karcie pacjenta.'));
      if (w.VildaSaveStatusIndicator?.getCurrentDecision()?.state === 'dirty') {
        view.body.append(element('p', 'Niezapisane zmiany w tej wizycie zostaną odrzucone.'));
      }
    });
  }
  function mount(host, options) {
    const {patientId, patientName, isCurrent, onBack} = options;
    const doc = host.ownerDocument, vault = w.VildaVault, projection = w.VildaHomeVisitProjection;
    const token = vault.captureSyncOperationSession();
    let scene, detail, bin, restoring = false, rows = [], notes = null, plans = null, closed = false, readingDocuments;
    let notesStatus = 'loading', monitoringStatus = 'loading', latestVisit = null;
    let documentRead = 0, monitoringRead = 0;
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
      documentRead++; monitoringRead++;
      listeners.delete(onLock);
      bin?.close(false);
      detail?.close(false);
      scene?.destroy();
      back?.release();
      doc.removeEventListener('keydown', escape);
      doc.removeEventListener('focusin', check, true);
      doc.removeEventListener('pointerdown', check, true);
      w.removeEventListener('pagehide', onLock);
      scopeEvents.forEach(event => doc.removeEventListener(event, check));
      w.clearInterval(timer);
      rows = []; notes = plans = latestVisit = null;
      host.replaceChildren();
      host.removeAttribute('aria-busy');
    }
    async function readDocuments() {
      if (!check()) return;
      const request = ++documentRead;
      notesStatus = 'loading';
      const [documents, care] = await Promise.allSettled([
        vault.listPatientNotesForPatient(patientId), vault.listCarePlans({patientId})
      ]);
      if (!check() || request !== documentRead) return;
      notes = Array.isArray(documents.value) ? documents.value.filter(note => note?.patientId === patientId) : null;
      notesStatus = notes ? 'ready' : 'error';
      plans = Array.isArray(care.value) ? care.value : null;
    }
    async function readVisits() {
      if (!check()) return [];
      const request = ++monitoringRead;
      monitoringStatus = 'loading';
      try {
        const saved = await vault.getPatientVisits(patientId);
        if (!check()) return [];
        if (!Array.isArray(saved)) throw new Error('Invalid visit list');
        const visits = saved.filter(row => row?.patientId === patientId && row.visitId && row.payload);
        if (request === monitoringRead) {
          latestVisit = visits[0] || null;
          monitoringStatus = 'ready';
        }
        return visits;
      } catch (error) {
        if (current() && request === monitoringRead) { latestVisit = null; monitoringStatus = 'error'; }
        throw error;
      }
    }
    async function refreshGeneral() {
      if (!check()) return;
      notesStatus = monitoringStatus = 'loading';
      detail?.refresh();
      readingDocuments ||= readDocuments().finally(() => { readingDocuments = null; });
      await Promise.allSettled([readVisits(), readingDocuments]);
      if (check()) detail?.refresh();
    }
    function general() {
      const data = projection.getGeneral({patientId, name: patientName}, notes,
        {currentRecords: true, notesStatus, latestVisit, monitoringStatus});
      const noteEntries = notesStatus === 'ready' ? data.notes.map(note => ({...note, meta: note.dateLabel})) :
        [{body: notesStatus === 'loading' ? 'Odczytywanie notatek pacjenta…' : 'Nie udało się odczytać notatek pacjenta.'}];
      return {sections: [...data.sections, {title: 'Notatki ogólne', entries: noteEntries}],
        retry: data.currentStatus === 'error' || monitoringStatus === 'error'};
    }
    function open(index, opener) {
      if (!check() || !rows[index] || detail) return;
      detail = w.VildaHomeVisitDetail.open({
        rows, index, patientName, opener, isCurrent: current,
        onSelect: i => scene.select(i),
        onClose(restoreFocus) {
          detail = null;
          if (restoreFocus && options.initialVisitId && !closed) onBack();
        },
        onEdit: options.onEdit, onStart: options.onStart, onOpenRecord: options.onOpenRecord,
        getGeneral: general, getComparison: projection.getComparison, onRefreshGeneral: refreshGeneral,
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
    async function openBin(opener, issue) {
      if (!check() || bin || restoring) return;
      const view = openDialog({id: 'vhomeVisitTrash', title: 'Kosz wizyt', opener, isCurrent: current,
        onClose: () => { bin = null; }});
      if (!view) return;
      bin = view;
      const notice = element('p', issue || 'Odczytywanie wizyt…', 'vht-meta');
      notice.setAttribute('role', 'status');
      view.body.append(element('h3', patientName), notice);
      try {
        const groups = await vault.listTrashedVisits(patientId);
        if (!view.isOpen()) return;
        const own = groups.filter(group => group.patientId === patientId);
        notice.textContent = issue || (own.length ? 'Każdą wizytę możesz przywrócić wraz z jej zapisanymi wersjami.' : 'Kosz wizyt tego pacjenta jest pusty.');
        const list = element('ul', '', 'vht-list');
        const dayOf = w.VildaHomeVisitComparisonModel.clinicalDate;
        const dayCounts = new Map();
        for (const group of own) {
          const day = dayOf(group);
          dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
        }
        for (const group of own) {
          const row = element('li'), info = element('div');
          const day = dayOf(group);
          info.id = 'vht-visit-' + list.childElementCount;
          info.append(element('strong', visitLabel(day)));
          if (dayCounts.get(day) > 1) {
            const saved = timestamp(group.savedAtISO);
            if (saved) info.append(element('span', 'Ostatni zapis · ' + saved));
            info.append(element('span', 'Identyfikator wizyty · ' + group.visitId.slice(-8)));
          }
          const expiry = timestamp(group.expiresAtISO), removed = timestamp(group.deletedAtISO);
          if (removed) info.append(element('span', 'Usunięto · ' + removed));
          if (expiry) info.append(element('span', 'Można przywrócić do ' + expiry));
          const restore = element('button', 'Przywróć wizytę');
          restore.type = 'button';
          restore.setAttribute('aria-describedby', info.id);
          restore.addEventListener('click', async () => {
            if (!view.isOpen() || restoring) return;
            restoring = true;
            // The native guard may need to present a pending draft before restoring.
            view.close(false);
            let error = '';
            try {
              if (await w.VildaHomeEncounter.restoreTrashedVisit(patientId, group, current)) return;
            } catch (_) { error = 'Nie udało się przywrócić wizyty. Sprawdź jej dostępność w koszu.'; }
            finally { restoring = false; }
            if (current()) openBin(opener, error);
          });
          row.append(info, restore);
          list.append(row);
        }
        if (own.length) view.body.append(list);
      } catch (_) {
        if (!view.isOpen()) return;
        notice.textContent = 'Nie udało się odczytać kosza wizyt.';
        const retry = element('button', 'Spróbuj ponownie'); retry.type = 'button';
        retry.onclick = () => { view.close(false); openBin(opener); };
        view.body.append(retry);
      }
    }
    function message(label, retry) {
      host.replaceChildren();
      const notice = doc.createElement('p');
      notice.setAttribute('role', 'status'); notice.textContent = label;
      host.append(notice);
      if (!options.sharedHeader) {
        const leave = doc.createElement('button');
        leave.type = 'button'; leave.textContent = options.backLabel;
        leave.addEventListener('click', () => onBack());
        host.append(leave);
      }
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
        const [visits] = await Promise.all([readVisits(), readDocuments()]);
        if (!check()) return;
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
        scene = w.VildaHomeVisitScene.mount(host, {rows, patientName, onOpen: open, onBack,
          backLabel: options.backLabel, sharedHeader: options.sharedHeader, onTrash: openBin});
        if (options.initialVisitId) {
          const index = rows.findIndex(row => row.visitId === options.initialVisitId);
          if (index >= 0) {
            scene.select(index);
            open(index, host.querySelector('.vhs-open'));
          } else {
            scene.destroy(); scene = null;
            message('Wybrana wizyta jest już niedostępna.', false);
          }
        }
      } catch (_) {
        if (check()) message('Nie udało się odczytać historii wizyt.', true);
      } finally { if (!closed) host.removeAttribute('aria-busy'); }
    }
    doc.addEventListener('keydown', escape);
    doc.addEventListener('focusin', check, true);
    doc.addEventListener('pointerdown', check, true);
    w.addEventListener('pagehide', onLock);
    scopeEvents.forEach(event => doc.addEventListener(event, check));
    const timer = w.setInterval(check, 250);
    back?.enter();
    read();
    return {destroy};
  }
  w.VildaHomeVisitHistory = Object.freeze({mount, confirmRemoval});
})(window);
