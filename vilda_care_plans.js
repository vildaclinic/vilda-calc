/* Plany opieki — patient-owned plans and parallel steps.
 * Rendering only. All writes go through the guarded encrypted vault API.
 */
(function (win) {
  'use strict';
  if (!win || !win.document) return;
  var serial = 0, vaultObservers = new WeakMap();
  // Legacy vault hooks do not return unsubscribe functions. Subscribe once per
  // vault and keep only live views in this module-owned registry.
  function observeVault(vault, change, lock) {
    if (!vault) return function () {};
    var listeners = vaultObservers.get(vault);
    if (!listeners) {
      listeners = new Set(); vaultObservers.set(vault, listeners);
      var changed = function () { Array.from(listeners).forEach(function (listener) { listener.change(); }); };
      ['onPatientNoteChanged', 'onPatientSaved', 'onPatientDeleted'].forEach(function (key) { if (typeof vault[key] === 'function') vault[key](changed); });
      if (typeof vault.onLock === 'function') vault.onLock(function () { Array.from(listeners).forEach(function (listener) { listener.lock(); }); });
    }
    var listener = { change: change, lock: lock }; listeners.add(listener);
    return function () { listeners.delete(listener); };
  }
  var KINDS = ['Badanie', 'Kontrola', 'Konsultacja', 'Hospitalizacja', 'Dokumentacja', 'Skierowanie', 'Kontakt', 'Inny krok', 'Oczekujący wynik'];
  function today() {
    var value = new Date();
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }
  function day(value) { return typeof value === 'string' ? value.slice(0, 10) : ''; }
  function date(value) { var valueDay = day(value); return /^\d{4}-\d{2}-\d{2}$/.test(valueDay) ? valueDay.split('-').reverse().join('.') : 'Bez terminu'; }
  function daysLate(value) {
    var valueDay = day(value);
    return valueDay ? Math.max(0, Math.round((Date.parse(today() + 'T12:00:00Z') - Date.parse(valueDay + 'T12:00:00Z')) / 86400000)) : 0;
  }
  function operationId() {
    if (win.crypto && typeof win.crypto.randomUUID === 'function') return win.crypto.randomUUID();
    var bytes = new Uint8Array(16); win.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  }
  function searchKey(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLocaleLowerCase('pl'); }
  function patientName(record) {
    var header = record && record.header || {};
    return header.name || [header.lastName, header.firstName].filter(Boolean).join(' ') || record && record.name || 'Pacjent';
  }
  function steps(plan) { return Array.isArray(plan && plan.steps) ? plan.steps : []; }
  function openSteps(plan) { return steps(plan).filter(function (step) { return step.state !== 'done' && step.state !== 'cancelled'; }); }
  function doneSteps(plan) { return steps(plan).filter(function (step) { return step.state === 'done'; }); }
  function closed(plan) { return plan && plan.status === 'closed'; }
  function recordId(value) { return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(value); }
  function readablePlan(note, patientId) {
    var context = note && note.careContext;
    return !!(note && note.patientId === patientId && recordId(note.id) && note.category === 'care-plan'
      && typeof note.title === 'string' && note.title.trim() && context && context.version === 1 && context.role === 'plan'
      && Array.isArray(context.steps) && Array.isArray(context.log));
  }
  function patientPlans(notes, patientId) {
    var plans = new Map();
    (Array.isArray(notes) ? notes : []).forEach(function (note) { if (readablePlan(note, patientId)) plans.set(note.id, note); });
    return plans;
  }
  function planReferences(context, note) {
    var link = note.careContext;
    if (link.role === 'decision') return note.id === 'care-decision-' + link.planId;
    if (link.role === 'note') return context.log.some(function (entry) { return entry && (entry.noteId === note.id || entry.resultNoteId === note.id); });
    var field = { step: 'reminderNoteId', calendar: 'calendarNoteId', result: 'resultNoteId' }[link.role];
    return context.steps.some(function (step) { return step && step[field] === note.id && (!link.stepId || step.id === link.stepId); })
      || link.role === 'result' && context.log.some(function (entry) { return entry && (entry.noteId === note.id || entry.resultNoteId === note.id); });
  }
  function destination(plans, note, patientId) {
    var ordinary = { kind: 'notes', noteId: note && note.id || null }, context = note && note.careContext;
    if (!note || note.patientId !== patientId || !recordId(note.id) || !context || context.version !== 1) return ordinary;
    if (context.role === 'plan') return plans.has(note.id) ? { kind: 'care', planId: note.id, noteId: null, role: 'plan' } : ordinary;
    if (!['step', 'decision', 'calendar', 'result', 'note'].includes(context.role) || !recordId(context.planId) || !plans.has(context.planId)) return ordinary;
    if (!planReferences(plans.get(context.planId).careContext, note)) return ordinary;
    return { kind: context.role === 'calendar' ? 'calendar' : 'care', planId: context.planId,
      noteId: ['step', 'decision'].includes(context.role) ? null : note.id, role: context.role };
  }
  // A projection of the patient-card Notes tab only. Other views and sync keep
  // the complete original records. Orphaned/future metadata must remain readable.
  function projectPatientNotes(notes, patientId) {
    var source = Array.isArray(notes) ? notes : [], plans = patientPlans(source, patientId);
    return source.filter(function (note) { return destination(plans, note, patientId).kind === 'notes'; });
  }
  function resolveNoteDestination(notes, note, patientId) { return destination(patientPlans(notes, patientId), note, patientId); }
  function dueStep(plan) { return openSteps(plan).slice().sort(function (a, b) { return String(a.reminderDateISO || '9999').localeCompare(String(b.reminderDateISO || '9999')); })[0]; }
  function planState(plan) {
    if (closed(plan)) return ['done', 'Zamknięty'];
    if (plan.needsDecision || !openSteps(plan).length) return ['decision', 'Do ustalenia'];
    if (openSteps(plan).some(function (step) { return step.state === 'pending' && step.reminderDateISO && day(step.reminderDateISO) <= today(); })) return ['current', 'Do działania'];
    if (openSteps(plan).some(function (step) { return step.state === 'waiting'; })) return ['waiting', 'Oczekuję na wynik'];
    return ['planned', 'Zaplanowany'];
  }
  function mount(host, options) {
    options = options || {};
    if (!host || !host.ownerDocument) throw new Error('Brak miejsca na widok planów opieki.');
    var doc = host.ownerDocument, vault = options.vault || win.VildaVault, destroyed = false, sequence = 0, refreshTimer = null;
    var account = vault && vault.getCurrentUser && vault.getCurrentUser(), accountId = account && account.userId;
    var state = { plans: [], patients: [], names: new Map(), selected: options.planId || null, filter: 'all', query: '', loading: false, busy: false, editing: false, detail: typeof options.detail === 'boolean' ? options.detail : !!(options.full && options.planId), stale: false, loaded: false };
    var editor = null, unsubscribe = [], selectedOrigin = null, lifecycleObserver = null;
    var record = null, recordNoteId = null, recordError = null, recordSequence = 0, selectionSequence = 0, recordOrigin = null, initialRecord = options.noteId || null;
    function current() { var user = vault && vault.getCurrentUser && vault.getCurrentUser(); return !destroyed && host.isConnected && vault && vault.isUnlocked() && user && user.userId === accountId && (!options.isCurrent || options.isCurrent()); }
    function node(tag, className, text) { var element = doc.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; }
    function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    function button(text, className, action) { var element = node('button', className, text); element.type = 'button'; if (action) element.addEventListener('click', action); return element; }
    function name(plan) { return state.names.get(plan.patientId) || plan.patientName || 'Pacjent'; }
    function activePlan() { return state.plans.find(function (plan) { return plan.id === state.selected; }); }
    function busy(working, editing) { state.busy = working; if (editing !== undefined) state.editing = editing; root.setAttribute('aria-busy', String(working)); if (options.onBusy) options.onBusy(state.busy, state.editing); }
    function errorBox(error, target) {
      var box = node('div', 'vcp-error'); box.setAttribute('role', 'alert');
      box.appendChild(node('p', '', error && error.message || 'Nie udało się odczytać planów. Spróbuj ponownie.')); target.appendChild(box); return box;
    }
    function notify(message) { feedback.textContent = message; feedback.hidden = !message; }
    function badge(label, kind) { return node('span', 'vcp-status' + (kind ? ' vcp-status-' + kind : ''), label); }
    function planBadge(plan) { var value = planState(plan); return badge(value[1], value[0]); }
    function dateBadge(value) {
      var count = daysLate(value);
      if (count) return badge(count + (count === 1 ? ' dzień' : ' dni') + ' po terminie', count <= 3 ? 'near' : count <= 14 ? 'medium' : 'late');
      return badge(day(value) === today() ? 'Na dziś' : 'Zaplanowane', day(value) === today() ? 'near' : 'planned');
    }
    var root = node('section', 'vcp ' + (options.full ? 'vcp-full' : 'vcp-inline'));
    root.setAttribute('aria-label', 'Plany opieki'); root.classList.toggle('vcp-show-detail', state.detail);
    var tools = node('div', 'vcp-tools');
    var createButton = button('+ Nowy plan', 'vcp-text vcp-create', create); createButton.setAttribute('aria-label', 'Nowy plan');
    if (options.showCreateButton !== false) { tools.appendChild(createButton); root.appendChild(tools); }
    var feedback = node('div', 'vcp-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true; root.appendChild(feedback);
    var layout = node('div', 'vcp-layout'), left = node('section', 'vcp-list-pane'), fixed = node('div', 'vcp-list-fixed');
    var search = node('input', 'vcp-search'); search.type = 'search'; search.placeholder = 'Szukaj pacjenta lub planu…'; search.setAttribute('aria-label', 'Szukaj pacjenta lub planu');
    search.addEventListener('input', function () { state.query = search.value; renderList(); }); fixed.appendChild(search);
    var filters = node('nav', 'vcp-filters'); filters.setAttribute('aria-label', 'Filtry planów opieki'); fixed.appendChild(filters); left.appendChild(fixed);
    var list = node('div', 'vcp-list'); list.setAttribute('aria-label', 'Lista planów opieki'); left.appendChild(list); layout.appendChild(left);
    var detail = node('section', 'vcp-detail'); detail.setAttribute('aria-label', 'Szczegóły planu'); if (options.full) layout.appendChild(detail); root.appendChild(layout); host.appendChild(root);
    var filterLabels = [['all', 'Otwarte'], ['needs', 'Do działania'], ['waiting', 'Oczekuję'], ['closed', 'Zamknięte']];
    function matchFilter(plan, key) {
      if (key === 'closed') return closed(plan);
      if (closed(plan)) return false;
      if (key === 'needs') return plan.needsDecision || !openSteps(plan).length || openSteps(plan).some(function (step) { return step.state === 'pending' && step.reminderDateISO && day(step.reminderDateISO) <= today(); });
      if (key === 'waiting') return openSteps(plan).some(function (step) { return step.state === 'waiting'; });
      return true;
    }
    function visible() {
      var query = searchKey(state.query.trim());
      return state.plans.filter(function (plan) { return matchFilter(plan, state.filter) && (!query || searchKey(name(plan) + ' ' + plan.title + ' ' + steps(plan).map(function (step) { return step.title; }).join(' ')).includes(query)); });
    }
    function renderFilters() {
      clear(filters); filterLabels.forEach(function (entry) {
        var item = button('', state.filter === entry[0] ? 'is-active' : '', function () { if (state.editing || state.busy) return; state.filter = entry[0]; render(); });
        item.appendChild(node('span', '', entry[1])); var count = state.plans.filter(function (plan) { return matchFilter(plan, entry[0]); }).length;
        item.appendChild(node('span', 'vcp-count', String(count))); item.setAttribute('aria-label', entry[1] + ', liczba planów: ' + count); item.setAttribute('aria-pressed', String(state.filter === entry[0])); item.disabled = state.editing || state.busy; filters.appendChild(item);
      });
    }
    function renderList() {
      var scroll = list.scrollTop; clear(list);
      if (state.loading && !state.loaded) { var loading = node('p', 'vcp-empty', 'Wczytywanie planów…'); loading.setAttribute('role', 'status'); list.appendChild(loading); return; }
      var plans = visible();
      if (!state.selected || !state.plans.some(function (plan) { return plan.id === state.selected; })) { resetRecord(); state.selected = plans[0] && plans[0].id || null; }
      plans.forEach(function (plan) {
        var row = button('', 'vcp-row' + (state.selected === plan.id ? ' is-selected' : ''), function () { select(plan.id); }); row.dataset.planId = plan.id;
        row.appendChild(node('span', 'vcp-patient', name(plan))); row.appendChild(node('span', 'vcp-row-title', plan.title));
        var next = dueStep(plan), due = plan.needsDecision ? plan.decisionDueDateISO : next && next.reminderDateISO;
        var meta = node('span', 'vcp-row-meta'); meta.appendChild(node('span', 'vcp-date', date(closed(plan) ? plan.closedAtISO : due)));
        meta.appendChild(closed(plan) ? planBadge(plan) : due && day(due) <= today() ? dateBadge(due) : planBadge(plan)); row.appendChild(meta);
        row.appendChild(node('span', 'vcp-row-next', closed(plan) ? 'Zamknięto: ' + (plan.closeReason || '') : plan.needsDecision || !next ? 'Dalsze postępowanie do ustalenia' : next.title));
        row.appendChild(node('span', 'vcp-row-progress', doneSteps(plan).length + ' z ' + steps(plan).length + ' kroków zakończonych'));
        row.setAttribute('aria-current', String(state.selected === plan.id)); row.disabled = state.editing || state.busy; list.appendChild(row);
      });
      if (!plans.length) list.appendChild(node('p', 'vcp-empty', state.plans.length ? 'Brak planów w tym widoku. Zmień filtr lub wyszukiwanie.' : 'Nie masz jeszcze planów opieki. Dodaj pierwszy plan dla pacjenta.'));
      list.scrollTop = scroll;
    }
    function render() { if (!current()) return; createButton.disabled = state.busy || state.editing; search.disabled = state.busy || state.editing; renderFilters(); renderList(); if (!state.editing) renderDetail(); }
    async function select(planId, noteId) {
      var selection = ++selectionSequence; initialRecord = null;
      if (!state.loaded && current()) await refresh();
      if (!state.loaded || selection !== selectionSequence) return;
      if (!current() || state.editing || state.busy) return;
      if (!options.full && options.requestExpand) { options.requestExpand(planId, false, noteId || null); return; }
      resetRecord();
      selectedOrigin = { scrollTop: list.scrollTop, query: state.query, filter: state.filter, id: planId };
      state.selected = planId; if (closed(activePlan())) state.filter = 'closed'; state.detail = true; root.classList.add('vcp-show-detail'); render(); detail.scrollTop = 0;
      var back = detail.querySelector('.vcp-back'); if (back && mobile()) back.focus({ preventScroll: true });
      if (noteId) await openRecord(noteId);
    }
    function mobile() { return win.document.documentElement.classList.contains('vilda-phone') || !!(win.matchMedia && win.matchMedia('(max-width:700px)').matches); }
    function back() {
      if (state.editing || state.busy) return; state.detail = false; root.classList.remove('vcp-show-detail');
      if (options.onReturnToReminders && options.onReturnToReminders() === true) return;
      if (selectedOrigin) { state.filter = selectedOrigin.filter; state.query = selectedOrigin.query; search.value = state.query; } render();
      if (selectedOrigin) list.scrollTop = selectedOrigin.scrollTop;
      var row = Array.from(list.querySelectorAll('[data-plan-id]')).find(function (item) { return item.dataset.planId === state.selected; }); if (row) row.focus({ preventScroll: true });
    }
    function openPatient(plan, noteId) { if (!state.editing && !state.busy && options.openPatient) options.openPatient(plan.patientId, noteId || null); }
    function resetRecord() { recordSequence += 1; record = null; recordNoteId = null; recordError = null; recordOrigin = null; }
    function returnToPlan() {
      var origin = recordOrigin; resetRecord(); renderDetail();
      if (origin) {
        detail.scrollTop = origin.scrollTop;
        var candidates = Array.from(detail.querySelectorAll('button'));
        var button = candidates.find(function (entry) { return entry.dataset.recordId === origin.id; });
        if (button) button.focus({ preventScroll: true });
      }
    }
    async function openRecord(noteId, refreshing) {
      var plan = activePlan();
      if (!current() || state.editing || state.busy || !plan || !recordId(noteId)) return;
      if (!options.full && options.requestExpand) { options.requestExpand(plan.id, false, noteId); return; }
      if (!refreshing) recordOrigin = { scrollTop: detail.scrollTop, id: noteId };
      var ticket = ++recordSequence, planId = plan.id, patientId = plan.patientId;
      recordNoteId = noteId; record = null; recordError = null; renderDetail();
      if (!refreshing) detail.scrollTop = 0;
      try {
        var original = await vault.getPatientNote(noteId);
        if (!current() || ticket !== recordSequence || state.selected !== planId || recordNoteId !== noteId) return;
        var context = original && original.careContext;
        if (!original || original.id !== noteId || original.patientId !== patientId || !context || context.version !== 1
          || context.planId !== planId || !['result', 'note', 'calendar'].includes(context.role)) throw new Error('Ten wpis jest niedostępny lub nie należy już do tego planu. Sprawdź dokumentację pacjenta.');
        record = original; renderDetail();
        if (!refreshing) { var heading = detail.querySelector('.vcp-record h2'); if (heading) heading.focus({ preventScroll: true }); }
      } catch (error) {
        if (!current() || ticket !== recordSequence || state.selected !== planId || recordNoteId !== noteId) return;
        recordError = error; renderDetail();
      }
    }
    function recordLink(label, noteId) {
      var item = button(label, 'vcp-text', function () { openRecord(noteId); }); item.dataset.recordId = noteId; return item;
    }
    function renderRecord(plan) {
      var section = node('section', 'vcp-record'); section.dataset.noteId = recordNoteId; section.setAttribute('aria-label', 'Wpis planu opieki');
      section.appendChild(button('← Wróć do planu', 'vcp-back vcp-text', returnToPlan));
      section.appendChild(node('p', 'vcp-patient', name(plan))); section.appendChild(node('p', 'vcp-record-plan', plan.title));
      if (recordError) {
        var error = errorBox(recordError, section); error.appendChild(button('Spróbuj ponownie', 'vcp-text', function () { openRecord(recordNoteId, true); }));
        if (options.openPatient) error.appendChild(button('Otwórz Kartę pacjenta ↗', 'vcp-text', function () { openPatient(plan); }));
      } else if (!record) { var loading = node('p', 'vcp-empty', 'Wczytywanie wpisu…'); loading.setAttribute('role', 'status'); section.appendChild(loading); }
      else {
        var heading = node('h2', 'vcp-title', record.title || 'Wpis planu opieki'); heading.tabIndex = -1; section.appendChild(heading);
        if (record.dueDateISO) section.appendChild(node('p', 'vcp-step-meta', 'Termin wydarzenia: ' + date(record.dueDateISO) + (record.dueTime ? ' · ' + record.dueTime : '')));
        if (record.clinicalDateISO) section.appendChild(node('p', 'vcp-step-meta', 'Data badania / ustalenia: ' + date(record.clinicalDateISO)));
        if (record.labResult) {
          var lab = record.labResult, value = typeof lab.valueNum === 'number' && isFinite(lab.valueNum) ? String(lab.valueNum) : lab.value;
          var result = node('div', 'vcp-record-lab');
          if (lab.test) result.appendChild(node('p', '', 'Badanie: ' + lab.test));
          if (value) result.appendChild(node('p', '', 'Zapisany wynik: ' + value + (lab.unit ? ' ' + lab.unit : '')));
          if (lab.norm) result.appendChild(node('p', '', 'Zapisana norma: ' + lab.norm)); section.appendChild(result);
        }
        section.appendChild(node('div', 'vcp-record-body', record.body || 'Brak dodatkowej treści.'));
        if (record.careContext.role === 'result') section.appendChild(node('p', 'vcp-help', 'Wynik jest również dostępny w Badaniach Karty pacjenta.'));
        if (options.openRecordDetails) section.appendChild(button('Szczegóły wpisu', 'vcp-text', async function () {
          if (!current() || !record) return;
          var noteId = recordNoteId, ticket = recordSequence;
          function isCurrentRecord() { return current() && !state.editing && !state.busy && ticket === recordSequence && recordNoteId === noteId && state.selected === plan.id; }
          try { await options.openRecordDetails(record, function () { if (isCurrentRecord()) openRecord(noteId, true); }, isCurrentRecord); }
          catch (error) { if (isCurrentRecord()) { recordError = error; renderDetail(); } }
        }));
      }
      detail.appendChild(section);
    }
    function renderDetail() {
      var scroll = detail.scrollTop, menuOpen = !!detail.querySelector('.vcp-menu[open]'); clear(detail);
      var selected = activePlan();
      if (recordNoteId && selected) { renderRecord(selected); detail.scrollTop = scroll; return; }
      var backLabel = typeof options.backLabel === 'function' ? options.backLabel() : options.backLabel;
      detail.appendChild(button(backLabel || '← Lista planów', 'vcp-back vcp-text', back));
      var plan = activePlan(); if (!plan) { detail.appendChild(node('p', 'vcp-empty', 'Wybierz plan z listy albo dodaj nowy plan opieki.')); return; }
      var top = node('div', 'vcp-detail-top'), patient = node('div', '');
      patient.appendChild(options.openPatient ? button(name(plan) + ' ↗', 'vcp-patient-link', function () { openPatient(plan); }) : node('h3', 'vcp-patient', name(plan)));
      patient.appendChild(node('p', 'vcp-detail-date', 'Plan od ' + date(plan.createdAtISO))); top.appendChild(patient);
      var menu = node('details', 'vcp-menu'); menu.open = menuOpen; var summary = node('summary', '', '⋯'); summary.setAttribute('aria-label', 'Opcje planu'); menu.appendChild(summary);
      var actions = node('div', 'vcp-menu-items'); actions.appendChild(button('Edytuj nazwę i cel', '', function () { menu.open = false; editPlan(plan); }));
      if (!closed(plan)) actions.appendChild(button('Dołącz istniejący termin', '', function () { menu.open = false; linkEvent(plan); }));
      actions.appendChild(button('Dodaj ustalenie', '', function () { menu.open = false; addNote(plan); }));
      var finish = button(closed(plan) ? 'Wznów plan' : 'Zamknij plan', '', function () { menu.open = false; if (closed(plan)) reopen(plan); else closePlan(plan); });
      finish.disabled = !closed(plan) && !!plan.syncNeedsReview; if (finish.disabled) finish.title = 'Najpierw potwierdź przegląd zmian po synchronizacji.'; actions.appendChild(finish); menu.appendChild(actions); top.appendChild(menu); detail.appendChild(top);
      detail.appendChild(node('h2', 'vcp-title', plan.title)); if (plan.goal) detail.appendChild(node('p', 'vcp-goal', plan.goal));
      var strip = node('div', 'vcp-plan-strip'); strip.appendChild(planBadge(plan)); strip.appendChild(node('span', '', doneSteps(plan).length + ' z ' + steps(plan).length + ' kroków zakończonych'));
      var overdue = openSteps(plan).filter(function (step) { return daysLate(step.reminderDateISO) > 0; }).length;
      strip.appendChild(node('span', '', openSteps(plan).length + ' otwarte' + (overdue ? ' · ' + overdue + ' po terminie' : ''))); detail.appendChild(strip);
      if (plan.syncNeedsReview) {
        var review = node('section', 'vcp-sync-review'); review.setAttribute('aria-label', 'Przegląd zmian po synchronizacji');
        review.appendChild(node('strong', '', 'Plan wymaga przeglądu po synchronizacji'));
        review.appendChild(node('p', '', 'Plan zmieniano równolegle na kilku urządzeniach. Sprawdź kroki i ustalenia. Przed zamknięciem planu potwierdź przegląd.'));
        review.appendChild(button('Potwierdzam przegląd planu', 'vcp-outline', function () { acknowledgeMerge(plan); })); detail.appendChild(review);
      }
      if (closed(plan)) {
        var closure = node('div', 'vcp-closed'); closure.appendChild(node('strong', '', 'Plan zamknięty · ' + date(plan.closedAtISO)));
        closure.appendChild(node('p', '', [plan.closeReason, plan.closeText].filter(Boolean).join(' · '))); detail.appendChild(closure);
      } else if (plan.needsDecision || !openSteps(plan).length) {
        var decision = node('div', 'vcp-decision'); decision.appendChild(node('strong', '', 'Dalsze postępowanie do ustalenia'));
        decision.appendChild(node('p', '', 'Plan pozostaje otwarty. Dodaj kolejny krok lub zapisz powód zamknięcia.' + (plan.decisionDueDateISO ? ' Powrót do decyzji: ' + date(plan.decisionDueDateISO) + '.' : '')));
        var decisionActions = node('div', 'vcp-button-row'); decisionActions.appendChild(button('Ustal kolejny krok', 'vcp-outline', function () { stepForm(plan); })); var closeDecision = button('Zamknij plan', 'vcp-text', function () { closePlan(plan); }); closeDecision.disabled = !!plan.syncNeedsReview; if (closeDecision.disabled) closeDecision.title = 'Najpierw potwierdź przegląd zmian po synchronizacji.'; decisionActions.appendChild(closeDecision); decision.appendChild(decisionActions); detail.appendChild(decision);
      }
      var heading = node('div', 'vcp-section-heading'); heading.appendChild(node('h3', '', 'Kroki planu')); if (!closed(plan)) heading.appendChild(button('+ Dodaj krok', 'vcp-text', function () { stepForm(plan); })); detail.appendChild(heading);
      steps(plan).forEach(function (step, index) { detail.appendChild(stepNode(plan, step, index)); });
      var bottom = node('div', 'vcp-detail-bottom'); if (options.openPatient) bottom.appendChild(button('Otwórz w Karcie pacjenta ↗', 'vcp-outline', function () { openPatient(plan); }));
      bottom.appendChild(button('+ Zapisz ustalenie', 'vcp-text', function () { addNote(plan); })); detail.appendChild(bottom);
      var history = node('details', 'vcp-history'); history.open = true; history.appendChild(node('summary', '', 'Przebieg planu · ' + (plan.log || []).length + ' wpisów'));
      var timeline = node('div', 'vcp-timeline'); (plan.log || []).slice().reverse().forEach(function (entry) {
        var item = node('div', 'vcp-timeline-entry'); item.appendChild(node('time', '', date(entry.dateISO || entry.date || entry.atISO))); item.appendChild(node('p', '', entry.text || 'Zaktualizowano plan.'));
        if (entry.noteId || entry.resultNoteId) item.appendChild(recordLink('Otwórz wpis', entry.noteId || entry.resultNoteId)); timeline.appendChild(item);
      }); history.appendChild(timeline); detail.appendChild(history); detail.scrollTop = scroll;
    }
    function stepNode(plan, step, index) {
      var item = node('article', 'vcp-step'); item.dataset.stepId = step.id;
      item.appendChild(node('span', 'vcp-step-marker vcp-step-' + step.state, step.state === 'done' ? '✓' : step.state === 'waiting' ? '◷' : step.state === 'cancelled' ? '−' : String(index + 1)));
      var content = node('div', 'vcp-step-content'), top = node('div', 'vcp-step-top'); top.appendChild(node('h4', 'vcp-step-title', step.title));
      var labels = { pending: 'Do wykonania', waiting: 'Oczekuję na wynik', done: 'Zakończony', cancelled: 'Niewykonany' }; top.appendChild(badge(labels[step.state] || 'Do wykonania', step.state === 'waiting' ? 'waiting' : step.state === 'done' ? 'done' : 'planned')); content.appendChild(top);
      var meta = [];
      if (step.state === 'done') meta.push('Zakończono: ' + date(step.completedDateISO));
      else if (step.state === 'cancelled') meta.push('Krok zakończony bez wykonania');
      else meta.push((step.state === 'waiting' ? 'Sprawdź wynik: ' : 'Przypomnij: ') + date(step.reminderDateISO));
      if (step.kind) meta.push(step.kind);
      if (step.eventDateISO) meta.push('Termin wydarzenia: ' + date(step.eventDateISO) + (step.eventTime ? ' · ' + step.eventTime : ''));
      content.appendChild(node('p', 'vcp-step-meta', meta.join(' · '))); if (step.description) content.appendChild(node('p', 'vcp-description', step.description));
      var actions = node('div', 'vcp-step-actions');
      if (!closed(plan) && step.state !== 'done' && step.state !== 'cancelled') {
        actions.appendChild(button(step.state === 'waiting' ? 'Wpisz wynik' : 'Zapisz wykonanie', 'vcp-action', function () { outcome(plan, step, step.state === 'waiting' ? 'result' : 'complete'); }));
        if (step.state !== 'waiting') actions.appendChild(button('Czekam na wynik', '', function () { outcome(plan, step, 'wait'); }));
        actions.appendChild(button('Edytuj', 'vcp-subtle', function () { stepForm(plan, step); }));
      }
      if (step.calendarNoteId && options.openCalendar) actions.appendChild(button('Otwórz termin ↗', '', function () { options.openCalendar(step.calendarNoteId); }));
      if (step.resultNoteId) actions.appendChild(recordLink('Otwórz wynik', step.resultNoteId));
      content.appendChild(actions); item.appendChild(content); return item;
    }
    async function refresh() {
      if (!current()) return;
      if (state.editing || state.busy) { state.stale = true; return; }
      if (typeof vault.listCarePlans !== 'function') { clear(list); errorBox(new Error('Odśwież aplikację, aby korzystać z planów opieki.'), list); return; }
      if (refreshTimer) { win.clearTimeout(refreshTimer); refreshTimer = null; }
      var ticket = ++sequence; state.loading = true; if (!state.loaded) render();
      try {
        var result = await Promise.all([vault.listCarePlans(options.patientId ? { patientId: options.patientId } : {}), vault.listPatients()]);
        if (!current() || ticket !== sequence) return;
        var nextPlans = Array.isArray(result[0]) ? result[0] : [], nextPatients = Array.isArray(result[1]) ? result[1] : [];
        function snapshot(plans, patients) { return JSON.stringify([plans.slice().sort(function (a, b) { return a.id.localeCompare(b.id); }), patients.map(function (entry) { return [entry.patientId, patientName(entry)]; }).sort()]); }
        var changed = !state.loaded || snapshot(nextPlans, nextPatients) !== snapshot(state.plans, state.patients);
        state.plans = nextPlans; state.patients = nextPatients;
        if (!state.loaded && options.planId && closed(activePlan())) state.filter = 'closed';
        state.names.clear(); state.patients.forEach(function (patient) { state.names.set(patient.patientId, patientName(patient)); });
        state.loaded = true; state.stale = false;
      } catch (error) {
        if (current() && ticket === sequence) { state.loading = false; render(); clear(list); var retry = errorBox(error, list); retry.appendChild(button('Spróbuj ponownie', 'vcp-text', refresh)); }
        return;
      } finally { if (ticket === sequence) state.loading = false; }
      if (current() && ticket === sequence) {
        if (recordNoteId && activePlan()) { if (changed) render(); await openRecord(recordNoteId, true); }
        else if (changed) render();
        if (initialRecord) { var firstRecord = initialRecord; initialRecord = null; await openRecord(firstRecord); }
      }
    }
    function scheduleRefresh() { if (destroyed) return; if (state.editing || state.busy) { state.stale = true; return; } if (refreshTimer) win.clearTimeout(refreshTimer); refreshTimer = win.setTimeout(function () { refreshTimer = null; refresh(); }, 80); }
    function field(parent, label, type, value, required) {
      var wrap = node('label', 'vcp-field'), caption = node('span', '', label); wrap.appendChild(caption);
      var input = node(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input', ''); if (type !== 'textarea' && type !== 'select') input.type = type;
      input.value = value || ''; input.required = !!required; if (type === 'textarea') input.rows = 4; input.setAttribute('aria-label', label); wrap.appendChild(input); parent.appendChild(wrap); return input;
    }
    function selectField(parent, label, values, value) {
      var select = field(parent, label, 'select', '', false); values.forEach(function (entry) { var option = node('option', '', Array.isArray(entry) ? entry[1] : entry); option.value = Array.isArray(entry) ? entry[0] : entry; select.appendChild(option); }); select.value = value || (Array.isArray(values[0]) ? values[0][0] : values[0]); return select;
    }
    function help(parent, text) { parent.appendChild(node('p', 'vcp-help', text)); }
    function check(parent, label, checked, required) {
      var wrap = node('label', 'vcp-check'), input = node('input', ''); input.type = 'checkbox'; input.checked = !!checked; input.required = !!required; wrap.appendChild(input); wrap.appendChild(node('span', '', label)); parent.appendChild(wrap); return input;
    }
    function notice(parent, text, warning) { var box = node('div', 'vcp-notice' + (warning ? ' vcp-warning' : ''), text); parent.appendChild(box); }
    function showEditor(title, plan, build, saveLabel, submit) {
      if (!current() || state.editing || state.busy) return null;
      var origin = doc.activeElement, dialog = node('dialog', 'vcp vcp-dialog'), form = node('form', 'vcp-form');
      var header = node('header', 'vcp-form-head'), titleWrap = node('div', '');
      titleWrap.appendChild(node('p', 'vcp-form-patient', plan ? name(plan) : 'Nowy plan opieki'));
      var heading = node('h2', '', title); heading.id = 'vcp-form-title-' + ++serial; titleWrap.appendChild(heading); header.appendChild(titleWrap);
      var closeButton = button('×', 'vcp-icon', cancel); closeButton.setAttribute('aria-label', 'Anuluj formularz planu'); header.appendChild(closeButton); form.appendChild(header);
      var body = node('div', 'vcp-form-body'), errors = node('div', 'vcp-form-errors'); body.appendChild(errors); form.appendChild(body);
      var footer = node('footer', 'vcp-form-actions'), cancelButton = button('Anuluj', 'vcp-outline', cancel), saveButton = node('button', 'vcp-primary', saveLabel); saveButton.type = 'submit'; footer.appendChild(cancelButton); footer.appendChild(saveButton); form.appendChild(footer); dialog.appendChild(form);
      var model = { dialog: dialog, form: form, body: body, errors: errors, save: saveButton, cancel: cancel, plan: plan, operationId: operationId() };
      editor = model; busy(false, true); doc.body.appendChild(dialog);
      function cancel() {
        if (state.busy) return;
        if (typeof model.onDialogClose === 'function') { model.onDialogClose(); model.onDialogClose = null; }
        if (dialog.open) dialog.close(); dialog.remove(); if (editor === model) editor = null; busy(false, false); render();
        if (origin && origin.isConnected && origin.focus) origin.focus({ preventScroll: true });
        if (state.stale) refresh();
      }
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); cancel(); });
      function setWorking(value) { busy(value, true); Array.from(form.querySelectorAll('button,input,select,textarea')).forEach(function (control) { control.disabled = value; }); if (!value && model.sync) model.sync(); }
      form.addEventListener('submit', async function (event) {
        event.preventDefault(); if (!current() || editor !== model || state.busy) return;
        clear(errors); if (model.validate && !model.validate()) return; if (!form.reportValidity()) return;
        var request;
        try { request = submit(model); } catch (error) { errorBox(error, errors); return; }
        if (!request) return;
        request.operationId = model.operationId;
        if (plan) { request.planId = plan.id; request.patientId = plan.patientId; request.baseRev = plan.rev; }
        setWorking(true);
        try {
          var result = await vault.mutateCarePlan(request);
          if (!current() || editor !== model) return;
          if (!result || !result.saved) throw new Error(result && result.conflict ? 'Plan zmienił się w innej karcie lub na innym urządzeniu. Zachowaj wpisaną treść, anuluj formularz i otwórz go ponownie.' : result && result.reason === 'deleted' ? 'Ten plan lub jego wpis został usunięty. Anuluj formularz i odśwież listę.' : 'Nie udało się zapisać planu. Anuluj formularz i odśwież listę.');
          resetRecord();
          var savedPlan = result.plan; if (savedPlan) { state.plans = state.plans.filter(function (entry) { return entry.id !== savedPlan.id; }); state.plans.push(savedPlan); state.selected = savedPlan.id; }
          else if (result.planId) state.selected = result.planId;
          if (savedPlan && closed(savedPlan)) state.filter = 'closed'; else state.filter = 'all';
          state.query = ''; search.value = ''; state.detail = !!options.full; root.classList.toggle('vcp-show-detail', state.detail);
          state.stale = false; setWorking(false); cancel(); notify(request.action === 'result' ? 'Wynik zapisany w kartotece. Plan pozostaje otwarty.' : request.action === 'close' ? 'Zapisano zamknięcie i powód zakończenia planu.' : request.action === 'acknowledgeMerge' ? 'Zapisano potwierdzenie przeglądu planu.' : 'Zapisano zmiany planu.');
          if (options.onChange) options.onChange(result); await refresh();
        } catch (error) { if (current() && editor === model) { setWorking(false); errorBox(error, errors); errors.scrollIntoView({ block: 'nearest' }); } }
      });
      build(model);
      if (typeof options.onDialog === 'function') model.onDialogClose = options.onDialog(dialog);
      dialog.showModal(); body.scrollTop = 0;
      var first = body.querySelector('input:not([type=checkbox]):not([type=radio]),textarea,select'); if (first) first.focus({ preventScroll: true });
      return model;
    }
    async function create() {
      if (!state.loaded && current()) await refresh();
      if (!state.loaded) return;
      if (!current() || state.editing || state.busy) return;
      if (!options.full && options.requestExpand) { options.requestExpand(null, true); return; }
      showEditor('Dodaj plan opieki', null, function (model) {
        var chosen = options.patientId ? state.patients.find(function (entry) { return entry.patientId === options.patientId; }) : null;
        var picker = node('section', 'vcp-picker'), patientSearch = field(picker, 'Szukaj pacjenta', 'search', '', false); patientSearch.placeholder = 'Nazwisko lub imię…'; patientSearch.autocomplete = 'off';
        var selection = node('div', 'vcp-selected-patient'), results = node('div', 'vcp-patient-results'), status = node('p', 'vcp-help'); status.setAttribute('role', 'status'); picker.appendChild(selection); picker.appendChild(status); picker.appendChild(results); model.body.appendChild(picker);
        function birthDate(record) {
          var value = record && record.header && record.header.dobISO;
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
          var parsed = new Date(value + 'T12:00:00Z');
          return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
        }
        function patientIdentity(record) {
          var recordName = patientName(record), dob = birthDate(record), id = String(record.patientId || '');
          var peers = state.patients.filter(function (entry) { return searchKey(patientName(entry)) === searchKey(recordName); });
          var identity = dob ? 'ur. ' + date(dob) : 'Brak daty urodzenia';
          if (!dob || peers.some(function (entry) { return entry.patientId !== record.patientId && birthDate(entry) === dob; })) {
            var length = Math.min(8, id.length);
            while (length < id.length && peers.some(function (entry) { return entry.patientId !== record.patientId && String(entry.patientId || '').slice(0, length) === id.slice(0, length); })) length = Math.min(id.length, length + 4);
            identity += ' · ID wpisu: ' + id.slice(0, length);
          }
          return { text: identity, label: recordName + (peers.length > 1 ? ' · ' + identity : '') };
        }
        function patientSummary(record, target) {
          var identity = patientIdentity(record), summary = node('span', 'vcp-patient-summary'), details = node('span', 'vcp-help vcp-patient-identity', identity.text);
          details.id = 'vcp-patient-identity-' + ++serial;
          summary.appendChild(node('span', 'vcp-patient', patientName(record))); summary.appendChild(details); target.appendChild(summary);
          return { label: identity.label, descriptionId: details.id };
        }
        function renderPatients() {
          clear(selection); clear(results); patientSearch.parentElement.hidden = !!chosen; selection.hidden = !chosen;
          if (chosen) {
            patientSummary(chosen, selection);
            if (!options.patientId) selection.appendChild(button('Wyczyść wybór', 'vcp-text', function () { chosen = null; patientSearch.value = ''; renderPatients(); patientSearch.focus({ preventScroll: true }); }));
            status.textContent = 'Plan zostanie zapisany w Karcie wybranego pacjenta.';
          } else {
            var query = searchKey(patientSearch.value), matches = state.patients.filter(function (record) { return searchKey(patientName(record)).includes(query); });
            matches.slice(0, 20).forEach(function (record) {
              var item = button('', 'vcp-patient-option', function () { chosen = record; patientSearch.setCustomValidity(''); renderPatients(); });
              var identity = patientSummary(record, item); item.setAttribute('aria-label', identity.label); item.setAttribute('aria-describedby', identity.descriptionId);
              item.dataset.patientId = record.patientId; results.appendChild(item);
            });
            status.textContent = matches.length ? matches.length > 20 ? 'Pokazano 20 wyników. Wpisz więcej znaków, aby zawęzić listę.' : 'Wybierz pacjenta z listy.' : 'Brak pasujących pacjentów.';
          }
          model.save.disabled = !chosen || state.busy;
        }
        patientSearch.addEventListener('input', renderPatients); renderPatients();
        model.title = field(model.body, 'Nazwa planu', 'text', '', true); model.title.maxLength = 240;
        model.goal = field(model.body, 'Cel i ustalenia (opcjonalnie)', 'textarea', '', false); model.goal.maxLength = 20000;
        help(model.body, 'Po utworzeniu planu dodasz pierwszy krok albo dołączysz istniejący termin.');
        model.patientId = function () { return chosen && chosen.patientId; }; model.sync = renderPatients;
        model.validate = function () { if (chosen) return true; patientSearch.setCustomValidity('Wybierz pacjenta z listy.'); patientSearch.reportValidity(); return false; };
      }, 'Utwórz plan', function (model) { return { action: 'create', patientId: model.patientId(), title: model.title.value.trim(), goal: model.goal.value.trim() }; });
    }
    function stepFields(parent, value) {
      value = value || {}; var controls = {};
      controls.title = field(parent, 'Co jest do zrobienia?', 'text', value.title || '', true); controls.title.maxLength = 240;
      var pair = node('div', 'vcp-field-pair'); parent.appendChild(pair);
      controls.kind = selectField(pair, 'Rodzaj', KINDS, value.kind || 'Badanie'); controls.state = selectField(pair, 'Stan', [['pending', 'Do wykonania'], ['waiting', 'Oczekuję na wynik']], value.state || 'pending');
      controls.reminder = field(parent, 'Dzień przypomnienia / sprawdzenia', 'date', day(value.reminderDateISO), false);
      help(parent, 'Przyszły krok będzie w planie od razu, a w Do wykonania dopiero w swoim dniu. Termin możesz pozostawić pusty.');
      controls.calendar = check(parent, 'Mam ustalony termin wydarzenia', !!value.eventDateISO, false);
      controls.existingCalendarId = value.calendarNoteId || null;
      controls.detachRequested = false;
      var detachNotice = node('p', 'vcp-help', 'Termin zostanie odłączony od planu. Rezerwacja pozostanie w Terminarzu.'); detachNotice.setAttribute('role', 'status'); parent.appendChild(detachNotice);
      var eventFields = node('div', 'vcp-event-fields'); parent.appendChild(eventFields);
      controls.eventDate = field(eventFields, 'Termin wydarzenia', 'date', day(value.eventDateISO), true);
      controls.eventTime = field(eventFields, 'Godzina (opcjonalnie)', 'time', value.eventTime || '', false);
      if (value.calendarNoteId) help(parent, 'Zmiana dnia przypomnienia nie przesuwa terminu wydarzenia. Termin zmieniasz w osobnym polu.');
      controls.description = field(parent, 'Ustalenia (opcjonalnie)', 'textarea', value.description || '', false); controls.description.maxLength = 20000;
      controls.sync = function () { eventFields.hidden = !controls.calendar.checked; controls.eventDate.disabled = controls.eventTime.disabled = !controls.calendar.checked; detachNotice.hidden = !controls.detachRequested; };
      controls.calendar.addEventListener('change', function () { controls.detachRequested = !!controls.existingCalendarId && !controls.calendar.checked; controls.sync(); }); controls.sync(); return controls;
    }
    function stepValue(controls) {
      var value = { title: controls.title.value.trim(), kind: controls.kind.value, state: controls.state.value, reminderDateISO: controls.reminder.value || null, eventDateISO: controls.calendar.checked ? controls.eventDate.value : null, eventTime: controls.calendar.checked ? controls.eventTime.value || null : null, description: controls.description.value.trim() };
      if (controls.detachRequested) value.detachEvent = true;
      return value;
    }
    function stepForm(plan, step) {
      if (closed(plan)) return;
      showEditor(step ? 'Edytuj krok' : 'Dodaj krok do planu', plan, function (model) { notice(model.body, plan.title + '\nKroki mogą być realizowane równolegle. Każdy zachowuje własny termin i stan.'); model.fields = stepFields(model.body, step); model.sync = model.fields.sync; }, step ? 'Zapisz zmianę' : 'Dodaj krok', function (model) { return { action: step ? 'editStep' : 'addStep', stepId: step && step.id, step: stepValue(model.fields) }; });
    }
    function sixMonths() { var value = new Date(), dateNum = value.getDate(); value.setDate(1); value.setMonth(value.getMonth() + 6); var last = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate(); value.setDate(Math.min(dateNum, last)); return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0'); }
    function continuationFields(model, plan, step) {
      var otherOpen = openSteps(plan).some(function (entry) { return entry.id !== step.id; });
      var group = node('fieldset', 'vcp-continuation'); group.appendChild(node('legend', '', 'Co dalej w tym planie?')); var choices = node('div', 'vcp-radio-options'); group.appendChild(choices); model.body.appendChild(group);
      var selected = otherOpen ? 'existing' : 'later', radios = [];
      [['existing', 'Plan ma już dalsze kroki'], ['later', 'Ustalę później'], ['next', 'Dodaję kolejny krok']].forEach(function (entry) {
        if (entry[0] === 'existing' && !otherOpen) return;
        var label = node('label', ''), input = node('input', ''); input.type = 'radio'; input.name = 'continuation-' + serial; input.value = entry[0]; input.checked = selected === entry[0]; label.appendChild(input); label.appendChild(node('span', '', entry[1])); choices.appendChild(label); radios.push(input);
      });
      var later = node('div', 'vcp-later'); model.body.appendChild(later); var decisionDate = field(later, 'Kiedy wrócić do ustalenia dalszego postępowania?', 'date', today(), true); help(later, 'Plan pozostanie otwarty. W podanym dniu pojawi się sprawa do ustalenia.');
      var next = node('div', 'vcp-next-fields'); model.body.appendChild(next);
      var title = field(next, 'Kolejny krok', 'text', '', true); title.maxLength = 240;
      var due = field(next, 'Przypomnij w dniu', 'date', '', true);
      next.appendChild(button('Za 6 miesięcy', 'vcp-date-shortcut', function () { due.value = sixMonths(); }));
      var kind = selectField(next, 'Rodzaj kolejnego kroku', KINDS, 'Kontrola');
      var calendar = check(next, 'Mam ustalony termin — dodaj do Terminarza', false, false);
      var eventFields = node('div', 'vcp-next-calendar'); next.appendChild(eventFields);
      var eventDate = field(eventFields, 'Termin kolejnego wydarzenia', 'date', '', true), eventTime = field(eventFields, 'Godzina kolejnego wydarzenia (opcjonalnie)', 'time', '', false);
      function choice() { return radios.find(function (input) { return input.checked; }).value; }
      function sync() {
        var value = choice(); later.hidden = value !== 'later'; next.hidden = value !== 'next'; decisionDate.disabled = value !== 'later';
        Array.from(next.querySelectorAll('input,select,button')).forEach(function (input) { input.disabled = value !== 'next'; });
        eventFields.hidden = value !== 'next' || !calendar.checked; eventDate.disabled = eventTime.disabled = value !== 'next' || !calendar.checked;
      }
      radios.forEach(function (input) { input.addEventListener('change', sync); }); calendar.addEventListener('change', sync); sync(); model.sync = sync;
      return function () { var value = choice(); return { continuation: value, decisionDateISO: value === 'later' ? decisionDate.value : null, next: value === 'next' ? { title: title.value.trim(), kind: kind.value, state: 'pending', reminderDateISO: due.value, eventDateISO: calendar.checked ? eventDate.value : null, eventTime: calendar.checked ? eventTime.value || null : null, description: '' } : null }; };
    }
    function outcome(plan, step, action) {
      if (closed(plan)) return;
      var result = action === 'result', wait = action === 'wait';
      showEditor(result ? 'Wpisz wynik' : wait ? 'Zapisz wykonanie i oczekiwanie' : 'Zapisz wykonanie', plan, function (model) {
        notice(model.body, step.title + '\n' + (result ? 'Wynik będzie dostępny w planie i Badaniach Karty pacjenta. Zakończenie kroku pozostawi plan otwarty.' : wait ? 'Badanie zostanie zakończone. Dodamy osobny krok oczekiwania na wynik.' : 'Opis wykonania pozostanie w przebiegu planu.'));
        model.text = field(model.body, result ? 'Treść wyniku' : 'Co wykonano / jakie są ustalenia?', 'textarea', '', true); model.text.maxLength = 20000;
        model.date = field(model.body, result ? 'Data otrzymania wyniku' : 'Data wykonania', 'date', today(), true);
        model.date.max = today();
        if (wait) { model.check = field(model.body, 'Kiedy sprawdzić dostępność wyniku?', 'date', '', true); help(model.body, 'To dzień przypomnienia, odrębny od terminu badania.'); }
        else model.continuation = continuationFields(model, plan, step);
      }, result ? 'Zapisz wynik' : wait ? 'Zapisz i oczekuj' : 'Zapisz wykonanie', function (model) { return Object.assign({ action: action, stepId: step.id, text: model.text.value.trim(), dateISO: model.date.value, checkDateISO: wait ? model.check.value : null }, wait ? {} : model.continuation()); });
    }
    function editPlan(plan) {
      showEditor('Nazwa i cel planu', plan, function (model) { model.title = field(model.body, 'Nazwa planu', 'text', plan.title, true); model.title.maxLength = 240; model.goal = field(model.body, 'Cel i ustalenia (opcjonalnie)', 'textarea', plan.goal, false); model.goal.maxLength = 20000; }, 'Zapisz', function (model) { return { action: 'edit', title: model.title.value.trim(), goal: model.goal.value.trim() }; });
    }
    function addNote(plan) {
      showEditor('Zapisz ustalenie', plan, function (model) { notice(model.body, 'Wpis będzie dostępny w przebiegu planu.'); model.text = field(model.body, 'Co ustalono?', 'textarea', '', true); model.text.maxLength = 20000; model.date = field(model.body, 'Data ustalenia', 'date', today(), true); model.date.max = today(); }, 'Zapisz ustalenie', function (model) { return { action: 'addNote', text: model.text.value.trim(), dateISO: model.date.value }; });
    }
    function closePlan(plan) {
      if (plan.syncNeedsReview) { notify('Najpierw sprawdź kroki i ustalenia oraz potwierdź przegląd planu po synchronizacji.'); return; }
      var open = openSteps(plan);
      showEditor('Zamknij plan', plan, function (model) {
        notice(model.body, open.length ? 'Pozostaje ' + open.length + ' otwartych kroków. Zamknięcie nie oznacza, że zostały wykonane.' : 'Wszystkie kroki zostały rozstrzygnięte. Zapisz, dlaczego kończysz ten plan.', !!open.length);
        model.reason = selectField(model.body, 'Powód zamknięcia', ['Cel planu osiągnięty', 'Opiekę przekazano innemu specjaliście', 'Odstąpiono od dalszej realizacji'], 'Cel planu osiągnięty');
        model.text = field(model.body, 'Ustalenia / komu przekazano opiekę?', 'textarea', '', true); model.text.maxLength = 20000;
        if (open.length) { model.cancelOpen = check(model.body, 'Kończę pozostałe kroki jako niewykonane', false, true); help(model.body, 'Powiązane terminy pozostają w Terminarzu. Ich zmianę lub odwołanie ustal osobno. Skierowanie nie oznacza wykonania konsultacji ani operacji.'); }
      }, 'Zamknij plan', function (model) { return { action: 'close', reason: model.reason.value, text: model.text.value.trim(), cancelOpen: !open.length || model.cancelOpen.checked }; });
    }
    function acknowledgeMerge(plan) {
      showEditor('Przegląd planu po synchronizacji', plan, function (model) {
        notice(model.body, 'Plan zmieniano równolegle na kilku urządzeniach. Potwierdź po sprawdzeniu kroków i zapisanych ustaleń. Potwierdzenie pozostanie w przebiegu planu. Potwierdzenie ujednolici terminy i stany wpisów w Terminarzu oraz przypomnień zgodnie z wyświetlonym planem. Najpierw popraw ewentualne rozbieżności.', true);
      }, 'Potwierdzam przegląd planu', function () { return { action: 'acknowledgeMerge' }; });
    }
    function reopen(plan) {
      showEditor('Wznów plan', plan, function (model) { notice(model.body, 'Historia wykonanych kroków zostanie zachowana. Po wznowieniu ustalisz kolejny krok.'); model.text = field(model.body, 'Powód wznowienia (opcjonalnie)', 'textarea', '', false); }, 'Wznów plan', function (model) { return { action: 'reopen', text: model.text.value.trim() }; });
    }
    function linkEvent(plan) {
      if (closed(plan)) return;
      var model = showEditor('Dołącz istniejący termin', plan, function (form) {
        notice(form.body, 'Dołączasz istniejący wpis pacjenta z Terminarza. Nie utworzymy drugiego wydarzenia.');
        form.search = field(form.body, 'Szukaj terminu', 'search', '', false); form.search.placeholder = 'Treść wydarzenia…';
        form.options = field(form.body, 'Wybierz termin', 'select', '', true);
        form.due = field(form.body, 'Dzień przypomnienia / sprawdzenia', 'date', '', false);
        help(form.body, 'Dzień przypomnienia może różnić się od terminu wydarzenia.'); form.status = node('p', 'vcp-help', 'Wczytywanie terminów…'); form.status.setAttribute('role', 'status'); form.body.appendChild(form.status); form.save.disabled = true; form.notes = [];
        form.render = function () {
          var query = searchKey(form.search.value), before = form.options.value; clear(form.options);
          var choices = form.notes.filter(function (note) { return !query || searchKey((note.title || '') + ' ' + (note.body || '')).includes(query); });
          choices.forEach(function (note) { var option = node('option', '', date(note.dueDateISO) + (note.dueTime ? ' · ' + note.dueTime : '') + ' · ' + (note.title || 'Wydarzenie')); option.value = note.id; form.options.appendChild(option); });
          if (choices.some(function (note) { return note.id === before; })) form.options.value = before;
          form.status.textContent = choices.length ? 'Wybierz istniejący termin tego pacjenta.' : 'Brak pasujących niepowiązanych terminów.'; form.save.disabled = !choices.length || state.busy;
        };
        form.search.addEventListener('input', form.render); form.sync = form.render;
      }, 'Dołącz termin', function (form) { return { action: 'linkEvent', noteId: form.options.value, reminderDateISO: form.due.value || null }; });
      if (!model) return;
      Promise.resolve(vault.listPatientNotesForPatient(plan.patientId)).then(function (notes) {
        if (!current() || editor !== model) return;
        var used = new Set(state.plans.flatMap(function (entry) { return steps(entry).map(function (step) { return step.calendarNoteId; }); }).filter(Boolean));
        model.notes = (notes || []).filter(function (note) { return note && note.dueDateISO && !note.completedAtISO && !note.noShowAtISO && !used.has(note.id) && !(note.careContext && (note.careContext.planId || ['plan', 'step', 'decision'].includes(note.careContext.role))); }).sort(function (a, b) { return String(a.dueDateISO).localeCompare(String(b.dueDateISO)); }); model.render();
      }).catch(function (error) { if (current() && editor === model) { clear(model.errors); errorBox(error, model.errors); model.status.textContent = 'Nie udało się wczytać terminów. Anuluj formularz i spróbuj ponownie.'; } });
    }
    function destroy() {
      if (destroyed) return; destroyed = true; sequence += 1; selectionSequence += 1; resetRecord(); if (refreshTimer) win.clearTimeout(refreshTimer);
      if (lifecycleObserver) lifecycleObserver.disconnect();
      if (editor) {
        if (typeof editor.onDialogClose === 'function') editor.onDialogClose();
        if (editor.dialog.open) editor.dialog.close(); editor.dialog.remove(); editor = null;
      }
      unsubscribe.forEach(function (fn) { try { if (typeof fn === 'function') fn(); } catch {} });
      doc.removeEventListener('vilda:sync-merged', scheduleRefresh); root.remove(); if (options.onBusy) options.onBusy(false, false);
    }
    unsubscribe.push(observeVault(vault, scheduleRefresh, destroy));
    doc.addEventListener('vilda:sync-merged', scheduleRefresh);
    if (typeof win.MutationObserver === 'function' && doc.body) {
      lifecycleObserver = new win.MutationObserver(function () { if (!current()) destroy(); });
      lifecycleObserver.observe(doc.body, { childList: true, subtree: true });
    }
    var controller = { refresh: refresh, destroy: destroy, create: create, select: select, openRecord: openRecord, isEditing: function () { return state.editing || state.busy; }, getSelected: function () { return state.selected; }, getContext: function () { return { planId: state.selected, noteId: recordNoteId, detail: state.detail }; } };
    refresh(); return controller;
  }
  win.VildaCarePlans = { mount: mount, projectPatientNotes: projectPatientNotes, resolveNoteDestination: resolveNoteDestination };
})(typeof window !== 'undefined' ? window : null);
