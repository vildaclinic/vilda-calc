/* Szukaj — local preview of patients and their matters inside Przypomnienia.
 * Selection is read-only; navigation requires an explicit user action.
 */
(function (win) {
  'use strict';
  if (!win || !win.document || win.VildaGlobalSearchView) return;

  function day(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''; }
  function date(value) { var result = day(value); return result ? result.split('-').reverse().join('.') : ''; }
  function mount(host, options) {
    options = options || {};
    if (!host || !host.ownerDocument) throw new Error('Brak miejsca na wyszukiwarkę.');
    var doc = host.ownerDocument, vault = options.vault || win.VildaVault;
    var account = vault && vault.getCurrentUser && vault.getCurrentUser(), accountId = account && account.userId;
    var destroyed = false, visible = true, stale = false, sequence = 0, requests = 0, timer = null, service = null;
    var state = { query: '', time: 'all', status: 'all', id: null, rows: [], limit: 50, loading: false, error: null, detail: false };
    var origin = null;
    function current() {
      var user = vault && vault.getCurrentUser && vault.getCurrentUser();
      return !destroyed && host.isConnected && vault && vault.isUnlocked() && user && user.userId === accountId && (!options.isCurrent || options.isCurrent());
    }
    function node(tag, className, text) { var result = doc.createElement(tag); if (className) result.className = className; if (text != null) result.textContent = text; return result; }
    function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    function button(text, className, action) { var result = node('button', className, text); result.type = 'button'; result.addEventListener('click', action); return result; }
    function context() { return { query: state.query, time: state.time, status: state.status, id: state.id }; }
    function changed() { if (options.onChange) options.onChange(context()); }
    function selected() { return state.rows.find(function (row) { return row.id === state.id; }); }
    function mobile() { return doc.documentElement.classList.contains('vilda-phone') || !!(win.matchMedia && win.matchMedia('(max-width:700px)').matches); }
    function activeSearch() { return !!state.query.trim() || state.time !== 'all' || state.status !== 'all' || !!state.id; }
    function wipe(resetQuery) {
      sequence += 1; requests += 1; if (timer) win.clearTimeout(timer); timer = null;
      state.rows = []; state.id = null; state.loading = false; state.detail = false; state.error = null; origin = null;
      if (resetQuery) { state.query = ''; state.time = state.status = 'all'; search.value = ''; time.value = status.value = 'all'; }
      render(); changed();
    }
    function invalidated(reason) {
      stale = true;
      if (!current() || reason === 'lock' || reason === 'unlock' || reason === 'session') { wipe(true); return; }
      sequence += 1; requests += 1; state.rows = []; state.error = null; render();
      if (visible) schedule();
    }
    var root = node('section', 'vgs' + (options.full ? ' vgs-full' : ' vgs-inline'));
    root.setAttribute('aria-label', 'Szukaj');
    var toolbar = node('div', 'vgs-toolbar'); toolbar.setAttribute('role', 'search'); toolbar.setAttribute('aria-label', 'Wyszukiwanie pacjentów i spraw');
    var search = node('input', 'vb22-search vgs-query'); search.type = 'search'; search.autocomplete = 'off'; search.placeholder = 'Szukaj pacjenta lub sprawy…'; search.setAttribute('aria-label', 'Szukaj we wszystkich pacjentach i sprawach');
    toolbar.appendChild(search);
    function selector(label, values) {
      var result = node('select', 'vgs-select'); result.setAttribute('aria-label', label);
      values.forEach(function (entry) { var option = node('option', '', entry[1]); option.value = entry[0]; result.appendChild(option); }); toolbar.appendChild(result); return result;
    }
    var time = selector('Terminy spraw', [['all', 'Wszystkie terminy'], ['future', 'Przyszłe sprawy'], ['past', 'Przeszłe sprawy'], ['today', 'Dzisiaj'], ['undated', 'Bez terminu']]);
    var status = selector('Stan spraw', [['all', 'Wszystkie stany'], ['open', 'Otwarte'], ['waiting', 'Oczekujące'], ['completed', 'Zakończone'], ['no-show', 'Nie zgłosił się']]);
    root.appendChild(toolbar);
    var announcement = node('p', 'vgs-announcement'); announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite'); root.appendChild(announcement);
    var layout = node('div', 'vb22-layout vgs-layout'), left = node('section', 'vb22-list-pane vgs-list-pane');
    left.setAttribute('aria-label', 'Wyniki wyszukiwania');
    var list = node('div', 'vb22-list vgs-list'); list.setAttribute('role', 'list'); left.appendChild(list); layout.appendChild(left);
    var detail = node('section', 'vb22-detail vgs-detail'); detail.setAttribute('aria-label', 'Podgląd wyniku');
    if (options.full) layout.appendChild(detail);
    root.appendChild(layout); host.appendChild(root);

    function edit() {
      state.query = search.value; state.time = time.value; state.status = status.value;
      state.id = null; state.detail = false; state.limit = 50; origin = null; state.rows = []; state.error = null; sequence += 1; requests += 1;
      state.loading = activeSearch();
      render(); changed(); schedule();
    }
    search.addEventListener('input', edit); time.addEventListener('change', edit); status.addEventListener('change', edit);
    function schedule() {
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(function () { timer = null; refresh(); }, 100);
    }
    function empty(text, target) { var result = node('p', 'vb22-empty', text); (target || list).appendChild(result); return result; }
    function primaryDate(row) { return row.eventDateISO || row.clinicalDateISO || row.reminderDateISO || row.dueDateISO || ''; }
    function canOpenPatient(row) {
      return !!row.patientId && row.canOpenPatient !== false && !row.isActivity && row.patientId !== (vault.ACTIVITY_PATIENT_ID || '__vilda_activity__') && row.patientId !== (vault.EXTERNAL_PATIENT_ID || '__vilda_external__');
    }
    function rowNode(row) {
      var wrapper = node('div', 'vgs-item'); wrapper.setAttribute('role', 'listitem');
      var result = button('', 'vb22-row vgs-row' + (state.id === row.id && options.full ? ' is-selected' : ''), function () { select(row.id); });
      result.dataset.searchId = row.id; result.setAttribute('aria-current', String(state.id === row.id));
      result.appendChild(node('span', 'vb22-row-patient', row.patientName || (row.kind === 'patient' ? row.title : 'Sprawa ogólna')));
      var meta = node('span', 'vb22-row-meta'), when = date(primaryDate(row));
      meta.appendChild(node('span', 'vb22-row-date', when || (row.kind === 'patient' ? 'Karta pacjenta' : 'Bez terminu')));
      meta.appendChild(node('span', 'vgs-kind', row.label)); result.appendChild(meta);
      if (row.kind !== 'patient') result.appendChild(node('span', 'vb22-row-title', row.title || row.label));
      result.setAttribute('aria-label', [row.patientName || 'Sprawa ogólna', row.label, row.kind !== 'patient' && row.title, when, row.statusLabel].filter(Boolean).join('. '));
      wrapper.appendChild(result); return wrapper;
    }
    function renderList() {
      var scroll = list.scrollTop; clear(list);
      if (state.error) {
        var error = node('div', 'vb22-error'); error.setAttribute('role', 'alert'); error.appendChild(node('p', '', 'Nie udało się przeszukać danych. Spróbuj ponownie.'));
        error.appendChild(button('Spróbuj ponownie', 'vb22-text', function () { refresh(); })); list.appendChild(error); return;
      }
      if (state.loading && !state.rows.length) { empty('Wyszukiwanie…'); return; }
      if (!activeSearch()) { empty('Wpisz nazwisko, nazwę badania albo fragment notatki.'); return; }
      state.rows.slice(0, state.limit).forEach(function (row) { list.appendChild(rowNode(row)); });
      if (!state.rows.length) empty('Brak pasujących wyników. Zmień hasło, stan lub zakres terminów.');
      if (state.rows.length > state.limit) list.appendChild(button('Pokaż kolejne wyniki (' + (state.rows.length - state.limit) + ')', 'vb22-text vgs-more', function () { state.limit += 50; renderList(); }));
      list.scrollTop = scroll;
    }
    function navigate(action) {
      if (!current()) { wipe(true); return; }
      try {
        Promise.resolve(action()).catch(function () {
          if (!current()) return;
          var message = node('p', 'vb22-error', 'Nie udało się otworzyć zapisu. Spróbuj ponownie.'); message.setAttribute('role', 'alert'); detail.appendChild(message);
        });
      } catch (_) { if (current()) empty('Nie udało się otworzyć zapisu. Spróbuj ponownie.', detail); }
    }
    function renderDetail() {
      clear(detail);
      detail.appendChild(button('← Wyniki wyszukiwania', 'vb22-text vgs-back', back));
      var row = selected();
      if (!row) { empty('Wybierz wynik, aby zobaczyć szczegóły.', detail); return; }
      detail.appendChild(node('p', 'vb22-detail-label', row.label));
      if (canOpenPatient(row) && options.openPatient) detail.appendChild(button((row.patientName || row.title || 'Pacjent') + ' ↗', 'vb22-text vb22-patient-link', function () { navigate(function () { return options.openPatient(row.patientId, row.kind === 'patient' ? null : row.noteId || null, row); }); }));
      else detail.appendChild(node('h3', '', row.patientName || 'Sprawa ogólna'));
      if (row.kind !== 'patient') detail.appendChild(node('h4', 'vb22-detail-title vgs-title', row.title || row.label));
      if (row.statusLabel) detail.appendChild(node('p', 'vb22-category vgs-status', row.statusLabel));
      var dates = node('dl', 'vgs-dates');
      function dateLine(label, value) { if (!date(value)) return; dates.appendChild(node('dt', '', label)); dates.appendChild(node('dd', '', date(value))); }
      dateLine('Termin wydarzenia', row.eventDateISO);
      dateLine('Termin przypomnienia', row.reminderDateISO);
      dateLine('Data wpisu / badania', row.clinicalDateISO);
      if (!row.eventDateISO && !row.reminderDateISO && !row.clinicalDateISO) dateLine('Termin', row.dueDateISO);
      dateLine('Wykonano', row.completedAtISO); dateLine('Nie zgłosił się', row.noShowAtISO);
      if (dates.childNodes.length) detail.appendChild(dates);
      if (row.body) detail.appendChild(node('p', 'vb22-body', row.body));
      var actions = node('div', 'vb22-actions vgs-actions');
      var source = row.source || {}, reminder = row.isReminder || !!source.reminderContext || ['followup', 'treatment', 'observation', 'wynik-badania', 'reminder-exam', 'procedura'].indexOf(source.category) >= 0;
      if (row.noteId && day(source.dueDateISO) && reminder && !(source.careContext && source.careContext.planId) && options.openReminder) actions.appendChild(button('Otwórz sprawę', 'vb22-primary', function () { navigate(function () { return options.openReminder(row.noteId, row); }); }));
      if (row.planId && options.openCare) actions.appendChild(button('Otwórz plan opieki ↗', 'vb22-primary', function () { navigate(function () { return options.openCare(row.planId, row.stepId || null, row); }); }));
      if (row.kind === 'event' && row.noteId && options.openCalendar) actions.appendChild(button('Otwórz w Terminarzu ↗', 'vb22-primary', function () { navigate(function () { return options.openCalendar(row.noteId, row); }); }));
      if (canOpenPatient(row) && options.openPatient) actions.appendChild(button(row.kind === 'patient' ? 'Otwórz kartę pacjenta ↗' : 'Otwórz w karcie pacjenta ↗', actions.childNodes.length ? 'vb22-text' : 'vb22-primary', function () { navigate(function () { return options.openPatient(row.patientId, row.noteId || null, row); }); }));
      if (actions.childNodes.length) detail.appendChild(actions);
    }
    function render() {
      root.classList.toggle('vgs-show-detail', state.detail); root.setAttribute('aria-busy', String(state.loading));
      announcement.textContent = state.loading ? 'Wyszukiwanie…' : activeSearch() ? 'Liczba wyników: ' + state.rows.length : '';
      renderList(); if (options.full) renderDetail();
    }
    async function refresh() {
      if (timer) win.clearTimeout(timer); timer = null;
      if (!current()) { wipe(true); return []; }
      if (!visible) { stale = true; state.loading = false; render(); return []; }
      if (!activeSearch()) { state.loading = false; render(); return []; }
      var ticket = ++sequence; state.loading = true; state.error = null; render();
      try {
        if (!service) throw new Error('Wyszukiwarka jest niedostępna.');
        var rows = await service.search(state.query, { time: state.time, status: state.status });
        if (!current() || ticket !== sequence) return [];
        state.rows = rows; state.loading = false; stale = false;
        if (!selected()) { state.id = null; state.detail = false; }
        render(); changed(); return rows;
      } catch (error) {
        if (!current()) { wipe(true); return []; }
        if (ticket !== sequence) return [];
        state.loading = false; state.rows = []; state.id = null; state.detail = false;
        if (error && (error.code === 'STALE_GLOBAL_SEARCH' || error.code === 'GLOBAL_SEARCH_LOCKED')) { render(); return []; }
        state.error = error; render(); return [];
      }
    }
    function select(id) {
      if (!current()) { wipe(true); return; }
      var row = state.rows.find(function (item) { return item.id === id; }); if (!row) return;
      requests += 1; state.id = row.id; changed();
      if (!options.full && options.requestExpand) { options.requestExpand(context()); return; }
      origin = { scrollTop: list.scrollTop, query: state.query, time: state.time, status: state.status, id: state.id, limit: state.limit };
      state.detail = true; render(); detail.scrollTop = 0;
      if (mobile()) { var backButton = detail.querySelector('.vgs-back'); if (backButton) backButton.focus({ preventScroll: true }); }
    }
    function back() {
      if (!current()) { wipe(true); return; }
      state.detail = false;
      if (origin) { state.query = origin.query; state.time = origin.time; state.status = origin.status; state.id = origin.id; state.limit = origin.limit; search.value = state.query; time.value = state.time; status.value = state.status; }
      render(); if (origin) list.scrollTop = origin.scrollTop;
      var item = Array.from(list.querySelectorAll('[data-search-id]')).find(function (result) { return result.dataset.searchId === state.id; });
      if (item) item.focus({ preventScroll: true }); changed();
    }
    async function request(value) {
      value = value || {}; var ticket = ++requests; state.query = String(value.query || ''); state.time = value.time || 'all'; state.status = value.status || 'all';
      state.id = value.id || (value.noteId ? 'note:' + value.noteId : value.planId ? 'plan:' + value.planId : null); state.limit = 50; state.detail = false; origin = null;
      var requestedId = state.id; state.rows = []; state.error = null;
      search.value = state.query; time.value = state.time; status.value = state.status;
      await refresh(); if (ticket === requests && requestedId && current()) select(requestedId);
    }
    if (win.VildaGlobalSearch && typeof win.VildaGlobalSearch.create === 'function') service = win.VildaGlobalSearch.create({ vault: vault, document: doc, onInvalidate: invalidated });
    render();
    return {
      refresh: refresh,
      invalidate: function () { if (service) service.invalidate('view'); else invalidated('view'); },
      request: request,
      select: select,
      backToList: back,
      setVisible: function (value) { visible = !!value; if (visible && stale && !state.loading) refresh(); },
      getContext: context,
      destroy: function () { destroyed = true; sequence += 1; requests += 1; if (timer) win.clearTimeout(timer); if (service) service.destroy(); state.rows = []; state.query = ''; state.id = null; root.remove(); }
    };
  }
  win.VildaGlobalSearchView = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
