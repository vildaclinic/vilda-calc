/* Patient treatment documentation. Native note actors own persistence and
 * revisions; the caller owns patient-card authority and legacy monitor nodes.
 * This module presents recorded facts. It does not infer diagnoses or doses. */
(function (w) {
  'use strict';
  if (!w || w.VildaPatientTreatment) return;
  var d = w.document, instances = new Set(), watchedVaults = new WeakSet();
  var editorDialog = null, activeEditor = null, observer = null;
  var methodNames = { pharmacological: 'Farmakoterapia', nonpharmacological: 'Postępowanie niefarmakologiczne', other: 'Inne' };
  var lifetimeEvents = ['vilda:user-state-cleared', 'vilda:patient-loaded', 'vilda:auth-loaded',
    'vilda:session-changed', 'vilda:data-applied', 'vilda:main-session-restored'];

  function node(tag, cls, text) {
    var result = d.createElement(tag);
    if (cls) result.className = cls;
    if (text != null) result.textContent = String(text);
    return result;
  }
  function wipe(root) {
    if (!root) return;
    var descendants = Array.from(root.querySelectorAll('*'));
    root.querySelectorAll('input,select,textarea').forEach(function (field) {
      try { field.value = ''; if ('checked' in field) field.checked = false; } catch (_) { /* Readonly native controls may reject a reset. */ }
    });
    root.replaceChildren(); descendants.forEach(function (element) { element.textContent = ''; });
  }
  function dateLabel(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.slice(8, 10) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4) : 'Brak daty';
  }
  function today() {
    var measured = null;
    try { measured = w.VildaDobAge && w.VildaDobAge.readMeasuredAtISO && w.VildaDobAge.readMeasuredAtISO(); }
    catch (_) { /* A fresh document can precede its measured-date owner. */ }
    if (/^\d{4}-\d{2}-\d{2}$/.test(measured || '')) return measured;
    var currentDate = new Date();
    return currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + String(currentDate.getDate()).padStart(2, '0');
  }
  function loadedSequence() {
    var api = w.VildaDataImportExport;
    return api && typeof api.getApplyLoadedDataSequence === 'function' ? api.getApplyLoadedDataSequence() : null;
  }
  function actorCurrent(view) {
    try {
      if (!view || view.disposed || w.VildaVault !== view.vault || !view.vault.isUnlocked()) return false;
      var user = view.vault.getCurrentUser();
      if (!user || user.userId !== view.userId || loadedSequence() !== view.loadedSequence) return false;
      if (view.token != null) view.vault.assertSyncOperationSession(view.token);
      return !view.options.isCurrent || view.options.isCurrent() === true;
    } catch (_) { return false; }
  }
  function current(view) { return !!(actorCurrent(view) && view.root.isConnected && view.host.isConnected); }
  function summary(view) {
    var ready = view && !view.disposed && view.phase === 'ready' && view.data;
    var active = ready ? view.data.episodes.filter(function (entry) { return entry.context.status === 'active'; }) : [];
    return { status: view && !view.disposed ? view.phase : 'error', activeCount: ready ? active.length : null,
      activeLabels: active.map(function (entry) { return entry.context.title; }) };
  }
  function emitSummary(view) { if (current(view) && typeof view.options.onSummary === 'function') view.options.onSummary(summary(view)); }
  function status(view, text, error) {
    if (!view.status) return;
    view.status.textContent = text || ''; view.status.hidden = !text;
    view.status.setAttribute('role', error ? 'alert' : 'status');
    view.status.classList.toggle('is-error', !!error);
  }
  function message(error) {
    var code = String(error && error.code || '');
    if (code === 'TREATMENT_VISIT_READONLY') return 'Wybierz „Edytuj wizytę” dla daty przypisanej do rozpoznania.';
    if (/CONFLICT|REVISION|CHANGED/.test(code)) return 'Zapis zmienił się w innym miejscu. Zachowaj wpisaną treść, anuluj formularz i otwórz aktualny zapis.';
    if (/STALE|SESSION|LOCK|OWNER/.test(code)) return 'Sesja lub pacjent uległy zmianie. Otwórz ponownie aktualną Kartę pacjenta.';
    if (/INVALID|VALIDATION/.test(code)) return error && error.forUser && error.message ? error.message : 'Sprawdź pola formularza i daty. Nie udało się zapisać wpisu.';
    return 'Nie udało się potwierdzić zapisu. Zachowaj wpisaną treść, anuluj formularz i sprawdź aktualną dokumentację przed kolejną próbą.';
  }
  function button(view, label, action, id, callback, primary) {
    var control = node('button', 'vpt-button' + (primary ? ' vpt-primary' : ' vpt-text'), label);
    control.type = 'button'; control.dataset.treatmentAction = action;
    if (id) control.dataset.treatmentId = id;
    control.addEventListener('click', function () { if (current(view) && view.phase === 'ready') callback(); }, { signal: view.renderAbort.signal });
    return control;
  }
  function heading(title, detail, action) {
    var header = node('div', 'vpt-heading'), copy = node('div', 'vpt-heading-copy');
    copy.appendChild(node('h4', '', title)); if (detail) copy.appendChild(node('p', 'vpt-meta', detail));
    header.appendChild(copy); if (action) header.appendChild(action); return header;
  }
  function treatmentStatus(status) {
    var active = status === 'active', tag = node('span', 'vpt-badge', active ? 'Aktywne' : 'Zakończone');
    if (active) tag.dataset.active = '';
    return tag;
  }
  function blank(text) { return node('p', 'vpt-empty', text); }
  function diagnosisLabel(dto) { return (dto.context.code ? dto.context.code + ' — ' : '') + dto.context.name; }
  function indication(view, episode) {
    var ids = episode.context.diagnosisIds;
    if (!ids.length) return 'Rozpoznania nie uzupełniono';
    return ids.map(function (id) {
      var diagnosis = view.data.diagnoses.find(function (entry) { return entry.id === id; });
      return diagnosis ? diagnosisLabel(diagnosis) : 'Rozpoznanie niedostępne';
    }).join(' · ');
  }
  function line(label, value, fact) {
    var row = node('div', 'vpt-line');
    if (fact) row.dataset.fact = fact;
    row.append(node('span', 'vpt-meta', label), node('span', '', value)); return row;
  }
  function latestDate(entries) { return entries.reduce(function (latest, entry) { return entry.dateISO > latest ? entry.dateISO : latest; }, ''); }
  function renderDiagnoses(view) {
    var section = node('section', 'vpt-section vpt-diagnoses'), compact = view.options.compact;
    var add = button(view, 'Dodaj rozpoznanie', 'new-diagnosis', null, function () { diagnosisEditor(view); });
    var head = heading(compact ? 'Rozpoznania' : 'Rozpoznania pacjenta', compact ? '' : 'Kod ICD-10 jest opcjonalny.', add);
    if (compact) head.appendChild(button(view, 'Dodaj leczenie', 'new-therapy', null, function () { episodeEditor(view); }, true));
    section.appendChild(head);
    if (!view.data.diagnoses.length) section.appendChild(blank(compact ? 'Brak rozpoznań.' : 'Rozpoznania nie uzupełniono.'));
    else {
      var list = node('div', 'vpt-diagnosis-list');
      view.data.diagnoses.forEach(function (dto) {
        var row = node('div', 'vpt-diagnosis-row'), copy = node('div'); row.dataset.treatmentDiagnosisId = dto.id; row.tabIndex = -1;
        var active = dto.context.status === 'active', date = dateLabel(dto.context.dateISO);
        var status = active ? 'Aktywne rozpoznanie' : 'Rozpoznanie zamknięte';
        if (compact) status = active ? '' : 'Zamknięte';
        copy.append(node('strong', '', diagnosisLabel(dto)), node('p', 'vpt-meta', status ? status + ' · ' + date : date));
        row.append(copy, button(view, 'Edytuj', 'edit-diagnosis', dto.id, function () { diagnosisEditor(view, dto); })); list.appendChild(row);
      });
      section.appendChild(list);
    }
    return section;
  }
  function renderEpisode(view, dto) {
    var context = dto.context, compact = view.options.compact, selected = view.selected === dto.id;
    var card = node('article', 'vpt-section vpt-episode-card'); card.dataset.treatmentTherapyId = dto.id;
    if (compact && selected) card.dataset.selected = '';
    var head = heading(context.title, methodNames[context.method] || methodNames.other);
    head.appendChild(treatmentStatus(context.status)); card.appendChild(head);
    if (!compact) card.appendChild(node('p', 'vpt-meta', indication(view, dto)));
    var startDate = dateLabel(context.startDateISO);
    if (!compact || startDate !== 'Brak daty') {
      var dates = node('div', 'vpt-episode-dates'), start = node('div');
      start.append(node('span', 'vpt-meta', compact ? 'Od' : 'Początek'), node('strong', '', startDate));
      dates.appendChild(start);
      if (!compact) {
        var latest = node('div');
        latest.append(node('span', 'vpt-meta', 'Ostatni wpis'), node('strong', '', dateLabel(latestDate(context.followups))));
        dates.appendChild(latest);
      }
      card.appendChild(dates);
    }
    var actions = node('div', 'vpt-actions');
    var course = button(view, !compact && selected ? 'Wybrany przebieg' : 'Przebieg', 'show-therapy', dto.id, function () {
      view.selected = dto.id; render(view); var detail = view.root.querySelector('[data-treatment-detail-id]'); if (detail) detail.focus({ preventScroll: true });
    });
    if (compact && selected) course.setAttribute('aria-current', 'true');
    actions.appendChild(course);
    if (!compact) actions.appendChild(button(view, 'Edytuj', 'edit-therapy', dto.id, function () { episodeEditor(view, dto); }));
    card.appendChild(actions); return card;
  }
  function renderDetail(view, dto) {
    var context = dto.context, compact = view.options.compact, section = node('section', 'vpt-section vpt-detail');
    section.dataset.treatmentDetailId = dto.id; section.tabIndex = -1;
    var edit = button(view, 'Edytuj leczenie', 'edit-therapy', dto.id, function () { episodeEditor(view, dto); });
    section.appendChild(heading(compact ? 'Przebieg leczenia' : context.title, compact ? '' : 'Zapis leczenia i dokumentacja kontroli.', edit));
    if (compact) {
      section.setAttribute('aria-label', 'Przebieg leczenia — ' + context.title);
      if (context.diagnosisIds.length) section.appendChild(line('Powiązane z', indication(view, dto), 'diagnosis'));
    } else {
      var state = node('div', 'vpt-line');
      state.append(node('span', 'vpt-meta', 'Stan leczenia'), treatmentStatus(context.status));
      section.append(state, line('Metoda', methodNames[context.method] || methodNames.other), line('Rozpoznanie', indication(view, dto)), line('Początek', dateLabel(context.startDateISO)));
    }
    var endDate = dateLabel(context.endDateISO);
    if (context.status === 'closed' && (!compact || endDate !== 'Brak daty')) section.appendChild(line('Zakończenie', endDate, 'end'));
    if (context.method === 'pharmacological') {
      if (!compact || context.medication) section.appendChild(line(compact ? 'Preparat' : 'Zapisany preparat', context.medication || 'Nie zapisano preparatu', 'medicine'));
      if (!compact || context.dose) section.appendChild(line(compact ? 'Dawka' : 'Zapisana dawka', context.dose || 'Nie zapisano dawki', 'dose'));
    }
    if (context.notes) section.appendChild(node('p', 'vpt-note', context.notes));
    if (context.nextDateISO) section.appendChild(line('Następna kontrola', dateLabel(context.nextDateISO), 'next-control'));
    var course = node('div', 'vpt-course'); course.appendChild(heading(compact ? 'Wpisy' : 'Kontrole i przebieg', '', button(view, 'Dodaj wpis', 'new-followup', dto.id, function () { followupEditor(view, dto); })));
    if (!context.followups.length) course.appendChild(blank(compact ? 'Brak wpisów.' : 'Brak zapisanych kontroli.'));
    else {
      var list = node('ol', 'vpt-timeline');
      context.followups.slice().sort(function (a, b) { return b.dateISO.localeCompare(a.dateISO) || a.id.localeCompare(b.id); }).forEach(function (entry) {
        var item = node('li'), time = node('time', 'vpt-meta', dateLabel(entry.dateISO)), copy = node('div'); time.dateTime = entry.dateISO;
        copy.append(node('h5', '', entry.kind), node('p', 'vpt-note', entry.body));
        copy.appendChild(button(view, 'Edytuj wpis', 'edit-followup', entry.id, function () { followupEditor(view, dto, entry); })); item.append(time, copy); list.appendChild(item);
      }); course.appendChild(list);
    }
    section.appendChild(course); return section;
  }
  function focusHint(view, hint) {
    if (!current(view) || !hint) return false;
    var control = Array.from(view.root.querySelectorAll('[data-treatment-action]')).find(function (entry) {
      return entry.dataset.treatmentAction === hint.action && (!hint.id || entry.dataset.treatmentId === hint.id);
    });
    if (!control || control.disabled || !control.getClientRects().length) return false;
    view.restoringFocus = true;
    try { control.focus({ preventScroll: true }); } finally { view.restoringFocus = false; }
    return true;
  }
  function clearFocusHint(view) {
    view.restoreHint = null;
    if (!view.cancelFocus) return;
    ['focusin', 'pointerdown', 'keydown', 'input'].forEach(function (name) { d.removeEventListener(name, view.cancelFocus, true); });
    view.cancelFocus = null;
  }
  function rememberFocusHint(view, hint) {
    clearFocusHint(view);
    if (!hint || typeof hint.action !== 'string' || !/^[a-z-]{1,40}$/.test(hint.action)
      || hint.id != null && (typeof hint.id !== 'string' || hint.id.length > 256)) return;
    // Retain only opaque UI identity across the loading render, never its
    // detached button or decrypted record. Real intervening activity wins.
    view.restoreHint = { action: hint.action, id: hint.id || '' };
    view.cancelFocus = function (event) {
      if (view.restoringFocus) return;
      // Removing a focused button can leave the document body focused.
      // That neutral fallback is not a new user focus destination.
      if (event.type === 'focusin' && (event.target === d.body || event.target === d.documentElement)) return;
      clearFocusHint(view);
    };
    ['focusin', 'pointerdown', 'keydown', 'input'].forEach(function (name) { d.addEventListener(name, view.cancelFocus, true); });
  }
  function applyRecordFocus(view) {
    if (!view.focusId) return false;
    var target = Array.from(view.root.querySelectorAll('[data-treatment-diagnosis-id],[data-treatment-detail-id],[data-treatment-unsupported-id]')).find(function (entry) {
      return entry.dataset.treatmentDiagnosisId === view.focusId || entry.dataset.treatmentDetailId === view.focusId || entry.dataset.treatmentUnsupportedId === view.focusId;
    });
    if (!target) return false;
    view.focusId = null; target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest', behavior: 'instant' }); return true;
  }
  function render(view) {
    if (!current(view)) return;
    var focused = d.activeElement, hint = focused && view.root.contains(focused) && focused.matches('button[data-treatment-action]')
      ? { action: focused.dataset.treatmentAction, id: focused.dataset.treatmentId } : view.restoreHint;
    rememberFocusHint(view, hint);
    view.renderAbort.abort(); view.renderAbort = new w.AbortController(); wipe(view.content);
    if (view.phase !== 'ready') {
      view.content.appendChild(blank(view.phase === 'error' ? 'Nie udało się odczytać dokumentacji leczenia.' : 'Wczytywanie dokumentacji leczenia…'));
      if (view.phase === 'error') {
        var retry = node('button', 'vpt-button', 'Spróbuj ponownie'); retry.type = 'button';
        retry.addEventListener('click', function () { refresh(view); }, { signal: view.renderAbort.signal }); view.content.appendChild(retry);
      }
      if (view.add) view.add.disabled = true;
      if (view.phase === 'error') clearFocusHint(view);
      return;
    }
    if (view.add) view.add.disabled = false;
    view.content.appendChild(renderDiagnoses(view));
    if (view.data.unsupported.length) {
      var unsupported = node('section', 'vpt-section'); unsupported.appendChild(heading('Pozostałe zapisy leczenia', 'Te zapisy pochodzą z nowszej wersji aplikacji i pozostają tylko do odczytu.'));
      view.data.unsupported.forEach(function (dto) {
        var item = node('article', 'vpt-unsupported'); item.dataset.treatmentUnsupportedId = dto.id; item.tabIndex = -1;
        item.appendChild(node('h5', '', dto.baseNote && dto.baseNote.title || 'Zapis leczenia'));
        if (dto.baseNote && typeof dto.baseNote.body === 'string') item.appendChild(node('p', 'vpt-note', dto.baseNote.body));
        unsupported.appendChild(item);
      }); view.content.appendChild(unsupported);
    }
    var episodes = view.data.episodes.slice().sort(function (a, b) { return (a.context.status === 'closed') - (b.context.status === 'closed') || a.context.title.localeCompare(b.context.title, 'pl'); });
    if (view.focusId && episodes.some(function (entry) { return entry.id === view.focusId; })) view.selected = view.focusId;
    if (view.selected && !episodes.some(function (entry) { return entry.id === view.selected; })) view.selected = null;
    if (view.options.compact) {
      if (!view.selected) view.selected = episodes[0]?.id || null;
      view.options.onSelection?.(view.selected);
    }
    if (episodes.length) {
      var grid = node('div', 'vpt-episode-grid'); episodes.forEach(function (entry) { grid.appendChild(renderEpisode(view, entry)); }); view.content.appendChild(grid);
      var chosen = episodes.find(function (entry) { return entry.id === view.selected; }); if (chosen) view.content.appendChild(renderDetail(view, chosen));
    } else if (!view.legacyNodes.length) view.content.appendChild(blank('Nie zapisano jeszcze leczenia.'));
    if (!applyRecordFocus(view)) focusHint(view, view.restoreHint);
    clearFocusHint(view);
  }
  function changed(view) {
    if (!current(view)) return;
    emitSummary(view);
    if (typeof view.options.onChange === 'function') view.options.onChange(summary(view));
  }
  async function refresh(view) {
    if (!actorCurrent(view)) { destroy(view); return false; }
    if (!view.root.isConnected) { view.pendingRefresh = true; return false; }
    if (activeEditor && activeEditor.owner === view) { view.pendingRefresh = true; return false; }
    var read = ++view.readGeneration; view.pendingRefresh = false; view.phase = 'loading'; view.data = null;
    view.root.setAttribute('aria-busy', 'true'); status(view, ''); render(view); emitSummary(view);
    try {
      if (!view.scope) view.scope = w.VildaPatientTreatmentStore.createScope({ vault: view.vault, patientId: view.patientId, isCurrent: function () { return current(view); } });
      var next = await view.scope.read();
      if (!current(view) || read !== view.readGeneration) return false;
      view.data = next; view.phase = 'ready'; view.root.removeAttribute('aria-busy'); render(view); emitSummary(view); return true;
    } catch (_) {
      if (!current(view) || read !== view.readGeneration) return false;
      view.data = null; view.phase = 'error'; view.root.removeAttribute('aria-busy'); render(view); emitSummary(view); return false;
    }
  }
  function requestRefresh(view) {
    if (view.disposed) return;
    view.pendingRefresh = true;
    if (view.refreshQueued) return;
    view.refreshQueued = true;
    Promise.resolve().then(function () { view.refreshQueued = false; if (view.pendingRefresh && actorCurrent(view)) refresh(view); });
  }
  function ensureEditor() {
    if (editorDialog) return editorDialog;
    if (!w.VildaHomeWorkspace || !w.VildaHomeWorkspace.createDialog) return null;
    editorDialog = w.VildaHomeWorkspace.createDialog({ id: 'vhomePatientTreatmentDialog', titleId: 'vhomePatientTreatmentTitle', title: 'Dokumentacja leczenia', applyLabel: 'Zapisz',
      onClose: function () { if (activeEditor) closeEditor(activeEditor, false, true); }, onApply: function () { /* Native form submission owns the only write. */ } });
    editorDialog.classList.add('vhome-treatment-editor');
    var title = editorDialog.querySelector('#vhomePatientTreatmentTitle'), copy = node('div', 'vpt-editor-heading');
    var patient = node('p', 'vpt-editor-owner'); patient.hidden = true; title.before(copy); copy.append(patient, title);
    editorDialog.querySelector('.vhome-dialog-close').setAttribute('aria-label', 'Zamknij formularz leczenia');
    editorDialog.addEventListener('close', function () { if (activeEditor && activeEditor.dialog === editorDialog && !editorDialog.open) closeEditor(activeEditor, true, false); });
    return editorDialog;
  }
  function editorCurrent(view) { return !!(view && activeEditor === view && !view.closed && current(view.owner)); }
  function setWorking(view, value) {
    view.saving = value;
    if (view.picker) view.picker.setWorking(value || view.uncertain);
    view.dialog.querySelectorAll('input,select,textarea,button').forEach(function (field) { field.disabled = value; });
    view.dialog.setAttribute('aria-busy', String(value));
    if (!value) {
      view.dialog.querySelector('.vhome-dialog-apply').disabled = view.uncertain;
      if (view.removeButton) view.removeButton.disabled = view.uncertain;
      syncEditor(view);
    }
  }
  function closeEditor(view, force, focus) {
    if (!view || view.closed || activeEditor !== view) return true;
    if (!force && editorCurrent(view)) {
      if (view.saving) return false;
      if (view.dirty && !w.confirm('Masz niezapisane zmiany. Odrzucić je i zamknąć formularz?')) return false;
    }
    view.closed = true; activeEditor = null;
    if (view.beforeUnload) { w.removeEventListener('beforeunload', view.beforeUnload); view.beforeUnload = null; }
    if (view.releaseBack) { try { view.releaseBack(); } catch (_) { /* Continue wiping a disposed editor. */ } view.releaseBack = null; }
    if (view.releaseDialog) { try { view.releaseDialog(); } catch (_) { /* Continue wiping a disposed editor. */ } view.releaseDialog = null; }
    if (view.history) { view.history.release(); view.history = null; }
    if (view.picker) { view.picker.destroy(); view.picker = null; }
    if (view.dialog.open) view.dialog.close();
    view.dialog.removeAttribute('aria-busy'); view.dialog.removeAttribute('aria-modal');
    var ownerLabel = view.dialog.querySelector('.vpt-editor-owner'); ownerLabel.textContent = ''; ownerLabel.hidden = true;
    wipe(view.dialog.querySelector('.vhome-dialog-body')); view.dialog.remove();
    view.submit = null; view.form = null; view.dto = null; view.removeButton = null;
    if (focus && current(view.owner)) {
      if (view.opener && view.opener.isConnected) view.opener.focus({ preventScroll: true }); else focusHint(view.owner, view.hint);
    }
    if (view.owner.pendingRefresh && current(view.owner)) requestRefresh(view.owner);
    return true;
  }
  function editorError(view, text) {
    if (!editorCurrent(view)) return;
    view.error.textContent = text; view.error.hidden = false; view.error.focus({ preventScroll: true });
  }
  function syncEditor(view) {
    if (!editorCurrent(view) || !view.form) return;
    if (view.kind !== 'therapy') return;
    var method = view.form.elements.namedItem('method').value;
    view.form.querySelector('[data-treatment-medication-fields]').hidden = method !== 'pharmacological';
  }
  async function writeEditor(view, operation, removing) {
    view.error.hidden = true; view.error.textContent = ''; setWorking(view, true);
    try {
      if (!editorCurrent(view)) { if (activeEditor === view) closeEditor(view, true, false); return; }
      var result = await operation();
      if (!editorCurrent(view)) { if (activeEditor === view) closeEditor(view, true, false); return; }
      var owner = view.owner;
      owner.restoreHint = removing ? { action: 'new-diagnosis' } : view.hint;
      owner.pendingRefresh = false;
      if (view.kind === 'therapy' || view.kind === 'followup') owner.selected = result.id;
      closeEditor(view, true, false);
      if (!current(owner)) return;
      await refresh(owner);
      if (!current(owner)) return;
      status(owner, removing ? 'Usunięto rozpoznanie.' : 'Zapisano dokumentację leczenia.'); changed(owner);
    } catch (error) {
      if (!editorCurrent(view)) { if (activeEditor === view) closeEditor(view, true, false); return; }
      // A failed post-write reread can leave an unknown outcome. Repeated
      // create would allocate a new note ID; require a fresh explicit editor.
      view.uncertain = !/INVALID|VALIDATION|TREATMENT_VISIT_READONLY/.test(String(error && error.code || ''));
      setWorking(view, false); editorError(view, message(error));
    }
  }
  async function submitEditor() {
    var view = activeEditor;
    if (!editorCurrent(view) || view.readOnly || view.saving || view.uncertain || !view.form.reportValidity()) return;
    var values;
    try { values = view.read(new w.FormData(view.form)); }
    catch (_) { editorError(view, 'Sprawdź pola formularza.'); return; }
    await writeEditor(view, function () { return view.submit(values, view.visitBinding); }, false);
  }
  async function removeDiagnosis(view) {
    if (!editorCurrent(view) || view.readOnly || view.saving || view.uncertain) return;
    var question = view.dto.baseNote.visitContext ? 'Usunąć to rozpoznanie z dokumentacji wizyty?' : 'Usunąć to rozpoznanie z kartoteki pacjenta?';
    if (view.owner.data.episodes.some(function (entry) { return entry.context.diagnosisIds.includes(view.dto.id); })) {
      question += ' W powiązanym leczeniu pojawi się informacja „Rozpoznanie niedostępne”.';
    }
    if (view.dirty) question += ' Zmiany w formularzu zostaną odrzucone.';
    if (!w.confirm(question) || !editorCurrent(view)) return;
    await writeEditor(view, function () { return view.owner.scope.removeDiagnosis(view.dto, view.visitBinding); }, true);
  }
  function openEditor(owner, options) {
    if (!current(owner) || owner.phase !== 'ready') return false;
    var visitBinding = owner.options.captureVisitBinding?.(owner.patientId) || null;
    if (visitBinding?.blocked) { status(owner, 'Poczekaj na zakończenie operacji wizyty i ponownie otwórz formularz.', true); return false; }
    if (activeEditor && !closeEditor(activeEditor, false, true)) return false;
    var dialog = ensureEditor(); if (!dialog) { status(owner, 'Nie udało się otworzyć formularza.', true); return false; }
    dialog.classList.toggle('vpt-compact', owner.options.compact === true);
    var diagnosisVisit = options.kind === 'diagnosis' ? options.dto?.baseNote.visitContext : null;
    var opener = d.activeElement, view = { owner: owner, dialog: dialog, kind: options.kind, dto: options.dto || null,
      opener: opener, hint: { action: opener && opener.dataset.treatmentAction, id: opener && opener.dataset.treatmentId },
      readOnly: !!diagnosisVisit && diagnosisVisit.visitId !== visitBinding?.visitContext?.visitId,
      dirty: false, saving: false, uncertain: false, closed: false, beforeUnload: null, submit: options.submit, read: options.read, releaseBack: null, releaseDialog: null, history: null, picker: null };
    view.visitBinding = visitBinding;
    activeEditor = view;
    dialog.querySelector('#vhomePatientTreatmentTitle').textContent = options.title;
    var ownerLabel = dialog.querySelector('.vpt-editor-owner');
    ownerLabel.textContent = typeof owner.options.patientLabel === 'string' ? owner.options.patientLabel : ''; ownerLabel.hidden = !ownerLabel.textContent;
    var saveButton = dialog.querySelector('.vhome-dialog-apply');
    saveButton.textContent = options.saveLabel || 'Zapisz'; saveButton.type = 'submit'; saveButton.setAttribute('form', 'vhomePatientTreatmentForm');
    saveButton.hidden = view.readOnly;
    dialog.querySelectorAll('button').forEach(function (control) { control.disabled = false; });
    var form = node('form', 'vpt-form'); form.id = 'vhomePatientTreatmentForm'; form.dataset.treatmentForm = options.kind;
    view.form = form; view.error = node('p', 'vpt-error'); view.error.hidden = true; view.error.tabIndex = -1; view.error.setAttribute('role', 'alert'); form.appendChild(view.error);
    try { options.build(form, view); }
    catch (_) { closeEditor(view, true, false); status(owner, 'Nie udało się otworzyć formularza.', true); return false; }
    if (view.readOnly) form.querySelectorAll('input,select,textarea,button').forEach(function (control) { control.disabled = true; });
    dialog.querySelector('.vhome-dialog-body').replaceChildren(form);
    form.addEventListener('submit', function (event) { event.preventDefault(); submitEditor(); });
    if (!dialog.isConnected) d.body.appendChild(dialog);
    try {
      if (typeof owner.options.onDialog === 'function') {
        var releaseDialog = owner.options.onDialog(dialog, { requestClose: function () { return closeEditor(view, false, true); } });
        if (typeof releaseDialog === 'function') view.releaseDialog = releaseDialog;
      }
      w.VildaHomeWorkspace.fitDialog(dialog); dialog.setAttribute('aria-modal', 'true'); dialog.showModal();
      view.beforeUnload = function (event) {
        if (!editorCurrent(view) || !dialog.isConnected || !dialog.open) {
          if (activeEditor === view) closeEditor(view, true, false);
          return;
        }
        if (!view.dirty && !view.saving && !view.uncertain) return;
        event.preventDefault(); event.returnValue = '';
      };
      w.addEventListener('beforeunload', view.beforeUnload);
      if (typeof owner.options.registerBack === 'function') {
        var releaseBack = owner.options.registerBack(function () { return closeEditor(view, false, true); });
        if (typeof releaseBack === 'function') view.releaseBack = releaseBack;
      }
      else if (w.VildaHomeDialogHistory) {
        view.history = w.VildaHomeDialogHistory.create({ group: owner.options.historyGroup || owner,
          isOpen: function () { return editorCurrent(view) && dialog.open; }, requestClose: function () { return closeEditor(view, false, true); } }); view.history.enter();
      }
      syncEditor(view);
      var first = form.querySelector('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || dialog.querySelector('.vhome-dialog-cancel');
      first?.focus({ preventScroll: true });
      return true;
    } catch (_) { closeEditor(view, true, false); status(owner, 'Nie udało się otworzyć formularza.', true); return false; }
  }
  function field(label, name, value, type, required, maxLength) {
    var wrap = node('label', 'vpt-field'), control = node(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') control.type = type || 'text';
    control.name = name; control.value = value == null ? '' : String(value); control.autocomplete = 'off';
    if (required) control.required = true; if (maxLength) control.maxLength = maxLength;
    if (type === 'textarea') control.rows = 6;
    wrap.append(node('span', '', label), control); return wrap;
  }
  function select(label, name, choices, value) {
    var wrap = node('label', 'vpt-field'), control = node('select'); control.name = name;
    choices.forEach(function (entry) { var choice = node('option', '', entry[1]); choice.value = entry[0]; control.appendChild(choice); }); control.value = value;
    wrap.append(node('span', '', label), control); return wrap;
  }
  function diagnosisEditor(view, dto) {
    var context = dto && dto.context || {};
    openEditor(view, { kind: 'diagnosis', dto: dto, title: dto ? 'Edytuj rozpoznanie' : 'Dodaj rozpoznanie',
      build: function (form, editor) {
        var visit = editor.visitBinding?.visitContext;
        if (dto && (!dto.baseNote.visitContext || editor.readOnly)) visit = dto.baseNote.visitContext;
        var destination = visit ? (editor.readOnly ? 'Powiązanie z wizytą z ' : 'Zapis z powiązaniem do wizyty z ') + dateLabel(visit.clinicalDateISO)
          : 'Zapis w kartotece pacjenta';
        form.appendChild(node('p', 'vpt-editor-context', destination));
        if (editor.readOnly) form.appendChild(node('p', 'vpt-meta', 'Aby zmienić lub usunąć rozpoznanie, wybierz „Edytuj wizytę” dla tej daty.'));
        var grid = node('div', 'vpt-form-grid'), name = field('Nazwa rozpoznania', 'name', context.name, 'text', true, 200);
        var code = editor.readOnly ? field('Kod ICD-10', 'code', context.code, 'text') : node('div');
        grid.append(name, code,
          select('Status rozpoznania', 'status', [['active', 'Aktywne'], ['closed', 'Zamknięte']], context.status || 'active'), field('Data rozpoznania', 'dateISO', context.dateISO || today(), 'date', true));
        form.appendChild(grid);
        if (!editor.readOnly) {
          if (!view.options.compact) form.appendChild(node('p', 'vpt-meta', 'Rozpoznanie i kod wybiera lekarz. Rozpoznanie można zapisać bez kodu ICD-10.'));
          editor.picker = w.VildaICD10Picker.mount({ host: code, nameInput: name.querySelector('input'), code: context.code, compact: view.options.compact,
            isCurrent: function () { return editorCurrent(editor) && !editor.saving && !editor.uncertain; },
            onCommit: function () { if (editorCurrent(editor) && !editor.saving && !editor.uncertain) { editor.dirty = true; syncEditor(editor); } } });
        }
        if (dto) {
          editor.removeButton = node('button', 'vpt-button vpt-remove', 'Usuń rozpoznanie');
          editor.removeButton.type = 'button'; editor.removeButton.dataset.treatmentAction = 'remove-diagnosis';
          editor.removeButton.addEventListener('click', function () { removeDiagnosis(editor); });
          form.appendChild(editor.removeButton);
        }
      }, read: function (data) { return { name: data.get('name').trim(), code: data.get('code').trim(), status: data.get('status'), dateISO: data.get('dateISO') }; },
      submit: function (values, binding) { return dto ? view.scope.updateDiagnosis(dto, values, binding) : view.scope.createDiagnosis(values, binding); } });
  }
  function episodeEditor(view, dto) {
    var context = dto && dto.context || {}, originalIds = context.diagnosisIds || [];
    var missingIds = originalIds.filter(function (id) { return !view.data.diagnoses.some(function (entry) { return entry.id === id; }); });
    openEditor(view, { kind: 'therapy', dto: dto, title: dto ? 'Edytuj leczenie' : 'Dodaj leczenie',
      build: function (form) {
        var grid = node('div', 'vpt-form-grid');
        grid.append(field('Nazwa leczenia', 'title', context.title, 'text', true, 160), select('Metoda', 'method', Object.keys(methodNames).map(function (key) { return [key, methodNames[key]]; }), context.method || 'other'),
          select('Stan leczenia', 'status', [['active', 'Aktywne'], ['closed', 'Zakończone']], context.status || 'active'), field('Początek · opcjonalnie', 'startDateISO', context.startDateISO, 'date'));
        var end = field('Zakończenie · jeśli dotyczy', 'endDateISO', context.endDateISO, 'date'); end.dataset.treatmentEndField = ''; grid.append(end, field('Następna kontrola · opcjonalnie', 'nextDateISO', context.nextDateISO, 'date')); form.appendChild(grid);
        if (view.data.diagnoses.length) {
          var diagnoses = node('fieldset', 'vpt-diagnosis-options'); diagnoses.appendChild(node('legend', '', 'Powiązane rozpoznania · opcjonalnie'));
          view.data.diagnoses.forEach(function (entry) {
            var label = node('label', 'vpt-check'), check = node('input'); check.type = 'checkbox'; check.name = 'diagnosisIds'; check.value = entry.id; check.checked = originalIds.indexOf(entry.id) !== -1;
            label.append(check, node('span', '', diagnosisLabel(entry))); diagnoses.appendChild(label);
          }); form.appendChild(diagnoses);
        } else form.appendChild(node('p', 'vpt-meta', 'Rozpoznania nie uzupełniono. Leczenie można zapisać bez przypisanego rozpoznania.'));
        if (missingIds.length) form.appendChild(node('p', 'vpt-meta', 'Niektóre powiązane rozpoznania są niedostępne. Ich zapisane powiązania zostaną zachowane.'));
        var medication = node('div', 'vpt-form-grid'); medication.dataset.treatmentMedicationFields = '';
        medication.append(field('Zapisany preparat · jeśli dotyczy', 'medication', context.medication, 'text', false, 160), field('Zapisana dawka · jeśli dotyczy', 'dose', context.dose, 'text', false, 120));
        form.append(medication, field('Uwagi i ustalenia', 'notes', context.notes, 'textarea', false, 3000), node('p', 'vpt-meta', 'Zakończenie leczenia nie zmienia statusu rozpoznania.'));
      }, read: function (data) {
        return { title: data.get('title').trim(), method: data.get('method'), status: data.get('status'), startDateISO: data.get('startDateISO'), endDateISO: data.get('endDateISO'), nextDateISO: data.get('nextDateISO'),
          diagnosisIds: data.getAll('diagnosisIds').concat(missingIds), medication: data.get('medication').trim(), dose: data.get('dose').trim(), notes: data.get('notes').trim(), followups: context.followups || [] };
      }, submit: function (values, binding) { return dto ? view.scope.updateEpisode(dto, values) : view.scope.createEpisode(values, binding); } });
  }
  function followupEditor(view, dto, entry) {
    entry = entry || null;
    openEditor(view, { kind: 'followup', dto: dto, title: entry ? 'Edytuj wpis przebiegu leczenia' : 'Wpis przebiegu leczenia', saveLabel: 'Zapisz wpis',
      build: function (form) {
        form.appendChild(node('p', 'vpt-editor-context', dto.context.title));
        var grid = node('div', 'vpt-form-grid'); grid.append(field('Data', 'dateISO', entry ? entry.dateISO : today(), 'date', true),
          select('Rodzaj wpisu', 'kind', [['Kontrola', 'Kontrola'], ['Ustalenia', 'Ustalenia'], ['Zmiana leczenia', 'Zmiana leczenia']], entry ? entry.kind : 'Kontrola'));
        form.append(grid, field('Przebieg i ustalenia', 'body', entry ? entry.body : '', 'textarea', true, 3000));
      }, read: function (data) { return { dateISO: data.get('dateISO'), kind: data.get('kind'), body: data.get('body').trim() }; },
      submit: function (values, binding) { return entry ? view.scope.updateFollowup(dto, entry.id, values) : view.scope.addFollowup(dto, values, binding); } });
  }
  // Native persistence captures arbitrary document-level input names. These
  // fields belong solely to note actors, so intercept only this editor before
  // document capture and run its local dirty/visibility updates explicitly.
  function editorInput(event) {
    var view = activeEditor;
    if (!view || !view.form || !view.form.contains(event.target)) return;
    event.stopImmediatePropagation();
    if (!editorCurrent(view) || view.readOnly || view.saving) return;
    if (view.picker && view.picker.handleInput(event)) return;
    view.dirty = true; syncEditor(view);
  }
  w.addEventListener('input', editorInput, true); w.addEventListener('change', editorInput, true);
  function destroy(view) {
    if (!view || view.disposed) return;
    view.disposed = true; view.readGeneration += 1;
    if (activeEditor && activeEditor.owner === view) closeEditor(activeEditor, true, false);
    clearFocusHint(view); view.renderAbort.abort(); view.ownerAbort.abort(); if (view.scope) view.scope.dispose();
    wipe(view.root); view.root.remove(); view.data = null; view.legacyNodes = []; view.options = {}; view.scope = null;
    view.root = null; view.host = null; view.content = null; view.status = null; view.add = null;
    view.patientId = ''; view.userId = ''; view.token = null; view.vault = null;
    instances.delete(view);
    if (!instances.size && observer) { observer.disconnect(); observer = null; }
  }
  function inspect() {
    Array.from(instances).forEach(function (view) {
      if (!actorCurrent(view) || view.wasConnected && !view.root.isConnected) destroy(view);
      else if (view.root.isConnected) { view.wasConnected = true; if (view.pendingRefresh && !view.refreshQueued) requestRefresh(view); }
    });
  }
  function observeVault(vault) {
    if (watchedVaults.has(vault)) return; watchedVaults.add(vault);
    if (typeof vault.onLock === 'function') vault.onLock(function () { Array.from(instances).forEach(function (view) { if (view.vault === vault) destroy(view); }); });
    ['onPatientSaved', 'onPatientNoteChanged', 'onPatientDeleted'].forEach(function (name) {
      if (typeof vault[name] !== 'function') return;
      vault[name](function (event) {
        Array.from(instances).forEach(function (view) {
          if (view.vault !== vault || event && event.patientId && event.patientId !== view.patientId) return;
          if (name === 'onPatientDeleted') destroy(view); else requestRefresh(view);
        });
      });
    });
  }
  function mount(host, options) {
    options = options || {};
    var vault = options.vault || w.VildaVault, user, token;
    try { user = vault && vault.getCurrentUser(); token = vault && vault.captureSyncOperationSession(); }
    catch (_) { return null; }
    if (!host || !options.patientId || !user || !vault.isUnlocked() || !w.VildaPatientTreatmentStore) return null;
    var root = node('div', 'vhome-treatment'); root.dataset.treatmentRoot = '';
    if (options.compact) root.classList.add('vpt-compact');
    var view = { host: host, root: root, options: options, vault: vault, userId: user.userId, token: token, loadedSequence: loadedSequence(), patientId: options.patientId,
      disposed: false, phase: 'loading', data: null, readGeneration: 0, pendingRefresh: true, refreshQueued: false, selected: options.selectedEpisodeId || null, restoreHint: null, cancelFocus: null, restoringFocus: false,
      focusId: typeof options.focusNoteId === 'string' ? options.focusNoteId : null,
      legacyNodes: Array.isArray(options.legacyPanels) ? options.legacyPanels.filter(function (entry) { return entry && entry.nodeType === 1; }) : [], renderAbort: new w.AbortController(), ownerAbort: new w.AbortController(), wasConnected: false, scope: null };
    if (options.compact) options.titleNode?.remove();
    else {
      var toolbar = node('div', 'vpt-toolbar'), toolbarCopy = node('div', 'vpt-toolbar-copy');
      if (options.titleNode && options.titleNode.nodeType === 1 && options.titleNode.tagName === 'H3') toolbarCopy.appendChild(options.titleNode);
      toolbarCopy.appendChild(node('p', 'vpt-meta', 'Rozpoznania, metody leczenia i zapisane kontrole.')); toolbar.appendChild(toolbarCopy);
      view.add = node('button', 'vpt-button vpt-primary', 'Dodaj leczenie'); view.add.type = 'button'; view.add.dataset.treatmentAction = 'new-therapy';
      view.add.addEventListener('click', function () { if (current(view) && view.phase === 'ready') episodeEditor(view); }, { signal: view.ownerAbort.signal }); toolbar.appendChild(view.add); root.appendChild(toolbar);
    }
    view.status = node('p', 'vpt-status'); view.status.hidden = true; root.appendChild(view.status); view.content = node('div', 'vpt-content'); root.appendChild(view.content);
    if (view.legacyNodes.length) {
      var legacy = node('div', 'vpt-legacy'); legacy.setAttribute('aria-label', 'Monitorowanie leczenia');
      view.legacyNodes.forEach(function (entry) { legacy.appendChild(entry); }); root.appendChild(legacy);
    }
    host.appendChild(root); instances.add(view);
    observeVault(vault);
    if (!observer && typeof w.MutationObserver === 'function') { observer = new w.MutationObserver(inspect); observer.observe(d.documentElement, { childList: true, subtree: true }); }
    requestRefresh(view);
    return Object.freeze({ refresh: function () { return refresh(view); }, destroy: function () { destroy(view); },
      isEditing: function () { return !!(activeEditor && activeEditor.owner === view && !activeEditor.closed); },
      requestClose: function () { return !activeEditor || activeEditor.owner !== view || closeEditor(activeEditor, false, true); },
      focusRecord: function (noteId) {
        if (!current(view) || typeof noteId !== 'string' || activeEditor && activeEditor.owner === view) return false;
        view.focusId = noteId;
        if (view.phase !== 'ready') return true;
        var known = view.data.diagnoses.concat(view.data.episodes, view.data.unsupported).some(function (entry) { return entry.id === noteId; });
        if (!known) { view.focusId = null; return false; }
        render(view); return true;
      },
      getSummary: function () { return summary(view); } });
  }
  lifetimeEvents.forEach(function (name) { d.addEventListener(name, inspect); });
  w.VildaPatientTreatment = Object.freeze({ mount: mount });
})(typeof window !== 'undefined' ? window : null);
