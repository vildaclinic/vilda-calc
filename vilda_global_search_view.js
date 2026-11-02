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
    var state = { query: '', time: 'all', status: 'all', id: null, rows: [], limit: 50, loading: false, error: null, detail: false, missing: false };
    var origin = null, pendingRestore = null, focusRevision = 0;
    var position = { list: 0, detail: 0 };
    function current() {
      var user = vault && vault.getCurrentUser && vault.getCurrentUser();
      return !destroyed && host.isConnected && vault && vault.isUnlocked() && user && user.userId === accountId && (!options.isCurrent || options.isCurrent());
    }
    function node(tag, className, text) { var result = doc.createElement(tag); if (className) result.className = className; if (text != null) result.textContent = text; return result; }
    function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    function button(text, className, action, focusKey) { var result = node('button', className, text); result.type = 'button'; result.addEventListener('click', action); if (focusKey) result.setAttribute('data-vgs-focus', focusKey); return result; }
    function scalar(value, fallback) { return typeof value === 'string' ? value : fallback; }
    function offset(value) { return typeof value === 'number' && isFinite(value) && value >= 0 ? value : 0; }
    function limit(value) { return Math.max(50, Math.floor(offset(value))); }
    function choice(value, allowed) { return allowed.indexOf(value) >= 0 ? value : 'all'; }
    function copyOrigin(value, fallback) {
      if (!value || typeof value !== 'object') return null;
      return { query: scalar(value.query, fallback.query), time: choice(value.time, ['all', 'future', 'past', 'today', 'undated']),
        status: choice(value.status, ['all', 'open', 'waiting', 'completed', 'no-show']), id: scalar(value.id, null),
        limit: limit(value.limit), listScrollTop: offset(value.listScrollTop == null ? value.scrollTop : value.listScrollTop) };
    }
    function snapshot(value) {
      value = value && typeof value === 'object' ? value : {};
      var id = scalar(value.id, null) || (typeof value.noteId === 'string' ? 'note:' + value.noteId : typeof value.planId === 'string' ? 'plan:' + value.planId : null);
      var result = { version: 1, query: scalar(value.query, ''), time: choice(value.time, ['all', 'future', 'past', 'today', 'undated']),
        status: choice(value.status, ['all', 'open', 'waiting', 'completed', 'no-show']), id: id,
        mode: value.mode === 'list' || value.mode === 'detail' ? value.mode : id ? 'detail' : 'list', limit: limit(value.limit),
        listScrollTop: offset(value.listScrollTop), detailScrollTop: offset(value.detailScrollTop), origin: null, focus: scalar(value.focus, null) };
      result.origin = copyOrigin(value.origin, result);
      return result;
    }
    function owned(element) { return !!element && root.contains(element); }
    function focused() {
      var element = doc.activeElement;
      if (!owned(element)) return null;
      while (element && element !== root) {
        var key = element.getAttribute && element.getAttribute('data-vgs-focus');
        if (key) return key;
        element = element.parentNode;
      }
      return null;
    }
    function context() {
      if (!current()) return snapshot({});
      if (pendingRestore) return snapshot(pendingRestore.snapshot);
      if (visible && (typeof root.checkVisibility !== 'function' || root.checkVisibility())) {
        position.list = offset(list.scrollTop); if (state.detail) position.detail = offset(detail.scrollTop);
      }
      return snapshot({ query: state.query, time: state.time, status: state.status, id: state.id, mode: state.detail ? 'detail' : 'list',
        limit: state.limit, listScrollTop: position.list, detailScrollTop: position.detail, origin: origin, focus: focused() });
    }
    function focusGuard(key) { return { key: key, node: doc.activeElement, revision: focusRevision }; }
    function mayFocus(guard) {
      var active = doc.activeElement;
      return !!guard && current() && guard.revision === focusRevision && (!active || active === doc.body || active === guard.node || owned(active));
    }
    function restoreFocus(key) {
      if (!key) return null;
      var element = Array.from(root.querySelectorAll('[data-vgs-focus]')).find(function (item) { return item.getAttribute('data-vgs-focus') === key; });
      if (mobile() && !state.detail && element && detail.contains(element)) element = null;
      if (mobile() && state.detail && element && left.contains(element)) element = null;
      if (!element) element = state.detail ? detail.querySelector('.vgs-back') || detail : left;
      if (element && element !== doc.activeElement) element.focus({ preventScroll: true });
      return element;
    }
    function install(value) {
      state.query = value.query; state.time = value.time; state.status = value.status; state.id = value.id;
      state.limit = value.limit; state.detail = !!options.full && value.mode === 'detail'; origin = copyOrigin(value.origin, value);
      position.list = value.listScrollTop; position.detail = value.detailScrollTop;
      search.value = state.query; time.value = state.time; status.value = state.status;
    }
    function listOrigin(value) { return { query: value.query, time: value.time, status: value.status, id: value.id, limit: value.limit, listScrollTop: value.listScrollTop }; }
    function reconcile(value) {
      var index = state.rows.findIndex(function (row) { return row.id === value.id; });
      state.missing = !!value.id && index < 0;
      if (state.missing) { value.id = null; value.mode = 'list'; value.detailScrollTop = 0; value.origin = null; value.focus = 'list'; }
      if (index >= 0) {
        value.limit = Math.max(value.limit, Math.ceil((index + 1) / 50) * 50);
        if (value.origin) value.origin.limit = Math.max(value.origin.limit, value.limit);
        else if (value.mode === 'detail') value.origin = listOrigin(value);
      }
      install(value);
    }
    function changed() { if (options.onChange) options.onChange(context()); }
    function selected() { return state.rows.find(function (row) { return row.id === state.id; }); }
    function mobile() { return doc.documentElement.classList.contains('vilda-phone') || !!(win.matchMedia && win.matchMedia('(max-width:700px)').matches); }
    function activeSearch() { return !!state.query.trim() || state.time !== 'all' || state.status !== 'all' || !!state.id; }
    function wipe(resetQuery) {
      sequence += 1; requests += 1; if (timer) win.clearTimeout(timer); timer = null;
      state.rows = []; state.id = null; state.loading = false; state.detail = false; state.error = null; state.missing = false; state.limit = 50;
      origin = null; pendingRestore = null; position.list = position.detail = 0;
      if (resetQuery) { state.query = ''; state.time = state.status = 'all'; search.value = ''; time.value = status.value = 'all'; }
      render(snapshot({ query: state.query, time: state.time, status: state.status })); changed();
    }
    function invalidated(reason) {
      stale = true;
      if (!current() || reason === 'lock' || reason === 'unlock' || reason === 'session') { wipe(true); return; }
      var value = context(), guard = pendingRestore ? pendingRestore.guard : focusGuard(value.focus);
      pendingRestore = { snapshot: value, guard: guard };
      sequence += 1; requests += 1; state.rows = []; state.error = null; state.loading = visible && activeSearch(); render(value, guard);
      if (visible) schedule();
    }
    var root = node('section', 'vgs' + (options.full ? ' vgs-full' : ' vgs-inline'));
    root.setAttribute('aria-label', 'Szukaj');
    var toolbar = node('div', 'vgs-toolbar'); toolbar.setAttribute('role', 'search'); toolbar.setAttribute('aria-label', 'Wyszukiwanie pacjentów i spraw');
    var search = node('input', 'vb22-search vgs-query'); search.type = 'search'; search.autocomplete = 'off'; search.placeholder = 'Szukaj pacjenta lub sprawy…'; search.setAttribute('aria-label', 'Szukaj we wszystkich pacjentach i sprawach');
    search.setAttribute('data-vgs-focus', 'query');
    toolbar.appendChild(search);
    function selector(label, values) {
      var result = node('select', 'vgs-select'); result.setAttribute('aria-label', label);
      values.forEach(function (entry) { var option = node('option', '', entry[1]); option.value = entry[0]; result.appendChild(option); }); toolbar.appendChild(result); return result;
    }
    var time = selector('Terminy spraw', [['all', 'Wszystkie terminy'], ['future', 'Przyszłe sprawy'], ['past', 'Przeszłe sprawy'], ['today', 'Dzisiaj'], ['undated', 'Bez terminu']]);
    var status = selector('Stan spraw', [['all', 'Wszystkie stany'], ['open', 'Otwarte'], ['waiting', 'Oczekujące'], ['completed', 'Zakończone'], ['no-show', 'Nie zgłosił się']]);
    time.setAttribute('data-vgs-focus', 'time'); status.setAttribute('data-vgs-focus', 'status');
    root.appendChild(toolbar);
    var announcement = node('p', 'vgs-announcement'); announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite'); root.appendChild(announcement);
    var layout = node('div', 'vb22-layout vgs-layout'), left = node('section', 'vb22-list-pane vgs-list-pane');
    left.setAttribute('aria-label', 'Wyniki wyszukiwania');
    left.tabIndex = -1; left.setAttribute('data-vgs-focus', 'list');
    var list = node('div', 'vb22-list vgs-list'); list.setAttribute('role', 'list'); left.appendChild(list); layout.appendChild(left);
    var detail = node('section', 'vb22-detail vgs-detail'); detail.setAttribute('aria-label', 'Podgląd wyniku');
    detail.tabIndex = -1; detail.setAttribute('data-vgs-focus', 'detail');
    if (options.full) layout.appendChild(detail);
    root.appendChild(layout); host.appendChild(root);
    function outsideInteraction(event) { if (!event || !owned(event.target)) focusRevision += 1; }
    doc.addEventListener('focusin', outsideInteraction, true); doc.addEventListener('pointerdown', outsideInteraction, true);
    list.addEventListener('scroll', function () { if (visible && !pendingRestore) position.list = offset(list.scrollTop); });
    detail.addEventListener('scroll', function () { if (visible && !pendingRestore) position.detail = offset(detail.scrollTop); });

    function edit() {
      state.query = search.value; state.time = time.value; state.status = status.value;
      state.id = null; state.detail = false; state.limit = 50; origin = null; pendingRestore = null; state.rows = []; state.error = null; state.missing = false;
      position.list = position.detail = 0; sequence += 1; requests += 1;
      state.loading = activeSearch();
      render(snapshot({ query: state.query, time: state.time, status: state.status, mode: 'list', focus: focused() })); changed(); schedule();
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
      result.setAttribute('data-vgs-focus', 'row:' + row.id);
      result.appendChild(node('span', 'vb22-row-patient', row.patientName || (row.kind === 'patient' ? row.title : 'Sprawa ogólna')));
      var meta = node('span', 'vb22-row-meta'), when = date(primaryDate(row));
      meta.appendChild(node('span', 'vb22-row-date', when || (row.kind === 'patient' ? 'Karta pacjenta' : 'Bez terminu')));
      meta.appendChild(node('span', 'vgs-kind', row.label)); result.appendChild(meta);
      if (row.kind !== 'patient') result.appendChild(node('span', 'vb22-row-title', row.title || row.label));
      result.setAttribute('aria-label', [row.patientName || 'Sprawa ogólna', row.label, row.kind !== 'patient' && row.title, when, row.statusLabel].filter(Boolean).join('. '));
      wrapper.appendChild(result); return wrapper;
    }
    function renderList() {
      clear(list);
      if (state.error) {
        var error = node('div', 'vb22-error'); error.setAttribute('role', 'alert'); error.appendChild(node('p', '', 'Nie udało się przeszukać danych. Spróbuj ponownie.'));
        error.appendChild(button('Spróbuj ponownie', 'vb22-text', function () { refresh(); }, 'retry')); list.appendChild(error); return;
      }
      if (state.loading && !state.rows.length) { empty('Wyszukiwanie…'); return; }
      if (!activeSearch()) { empty('Wpisz nazwisko, nazwę badania albo fragment notatki.'); return; }
      if (state.missing) { var notice = empty('Wskazany wpis jest niedostępny lub nie pasuje do aktualnych filtrów.'); notice.setAttribute('role', 'status'); }
      state.rows.slice(0, state.limit).forEach(function (row) { list.appendChild(rowNode(row)); });
      if (!state.rows.length) empty('Brak pasujących wyników. Zmień hasło, stan lub zakres terminów.');
      if (state.rows.length > state.limit) list.appendChild(button('Pokaż kolejne wyniki (' + (state.rows.length - state.limit) + ')', 'vb22-text vgs-more', function () {
        var value = context(), next = state.rows[state.limit]; value.limit = state.limit + 50; value.focus = next ? 'row:' + next.id : 'more';
        state.limit = value.limit; if (pendingRestore) pendingRestore.snapshot = value; render(value, focusGuard(value.focus)); changed();
      }, 'more'));
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
      detail.appendChild(button('← Wyniki wyszukiwania', 'vb22-text vgs-back', back, 'back'));
      var row = selected();
      if (!row) { empty('Wybierz wynik, aby zobaczyć szczegóły.', detail); return; }
      detail.appendChild(node('p', 'vb22-detail-label', row.label));
      if (canOpenPatient(row) && options.openPatient) detail.appendChild(button((row.patientName || row.title || 'Pacjent') + ' ↗', 'vb22-text vb22-patient-link', function () { navigate(function () { return options.openPatient(row.patientId, row.kind === 'patient' ? null : row.noteId || null, row); }); }, 'patient-heading'));
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
      if (row.kind === 'lab' && row.source && row.source.category !== 'wynik-klirens' && options.renderLabContext) options.renderLabContext(detail, row.source.labResult);
      var actions = node('div', 'vb22-actions vgs-actions');
      var source = row.source || {}, reminder = row.isReminder || !!source.reminderContext || ['followup', 'treatment', 'observation', 'wynik-badania', 'reminder-exam', 'procedura'].indexOf(source.category) >= 0;
      if (row.noteId && day(source.dueDateISO) && reminder && !(source.careContext && source.careContext.planId) && options.openReminder) actions.appendChild(button('Otwórz sprawę', 'vb22-primary', function () { navigate(function () { return options.openReminder(row.noteId, row); }); }, 'reminder'));
      if (row.planId && options.openCare) actions.appendChild(button('Otwórz plan opieki ↗', 'vb22-primary', function () { navigate(function () { return options.openCare(row.planId, row.stepId || null, row); }); }, 'care'));
      if (row.kind === 'event' && row.noteId && options.openCalendar) actions.appendChild(button('Otwórz w Terminarzu ↗', 'vb22-primary', function () { navigate(function () { return options.openCalendar(row.noteId, row); }); }, 'calendar'));
      if (canOpenPatient(row) && options.openPatient) actions.appendChild(button(row.kind === 'patient' ? 'Otwórz kartę pacjenta ↗' : 'Otwórz w karcie pacjenta ↗', actions.childNodes.length ? 'vb22-text' : 'vb22-primary', function () { navigate(function () { return options.openPatient(row.patientId, row.noteId || null, row); }); }, 'patient'));
      if (actions.childNodes.length) detail.appendChild(actions);
    }
    function render(value, guard) {
      value = value || context();
      var active = doc.activeElement, liveFocus = focused(), allowed = mayFocus(guard);
      var key = allowed && guard.key && active === guard.node ? guard.key : liveFocus || (allowed ? guard.key : null);
      root.classList.toggle('vgs-show-detail', state.detail); root.setAttribute('aria-busy', String(state.loading));
      announcement.textContent = state.loading ? 'Wyszukiwanie…' : activeSearch() ? 'Liczba wyników: ' + state.rows.length : '';
      renderList(); if (options.full) renderDetail();
      position.list = value.listScrollTop; position.detail = value.detailScrollTop;
      list.scrollTop = position.list; if (options.full) detail.scrollTop = position.detail;
      if (key && current()) {
        var restored = restoreFocus(key);
        if (allowed && key === guard.key && restored) guard.node = restored;
      }
    }
    async function refresh() {
      if (timer) win.clearTimeout(timer); timer = null;
      if (!current()) { wipe(true); return []; }
      if (!visible) { stale = true; state.loading = false; return []; }
      if (!activeSearch()) { state.loading = false; pendingRestore = null; render(); return []; }
      if (!pendingRestore) { var remembered = context(); pendingRestore = { snapshot: remembered, guard: focusGuard(remembered.focus) }; }
      var ticket = ++sequence; state.loading = true; state.error = null; render(pendingRestore.snapshot, pendingRestore.guard);
      try {
        if (!service) throw new Error('Wyszukiwarka jest niedostępna.');
        var rows = await service.search(state.query, { time: state.time, status: state.status });
        if (!current() || ticket !== sequence) return [];
        var restore = pendingRestore || { snapshot: context(), guard: null };
        state.rows = rows; state.loading = false; stale = false;
        reconcile(restore.snapshot); pendingRestore = null;
        if (state.missing && restore.guard) restore.guard.key = 'list';
        render(restore.snapshot, restore.guard); changed(); return rows;
      } catch (error) {
        if (!current()) { wipe(true); return []; }
        if (ticket !== sequence) return [];
        var failed = pendingRestore ? pendingRestore.snapshot : context();
        state.loading = false; state.rows = []; state.id = null; state.detail = false; state.missing = false; pendingRestore = null;
        failed.id = null; failed.mode = 'list'; failed.detailScrollTop = 0; failed.origin = null; install(failed);
        if (error && (error.code === 'STALE_GLOBAL_SEARCH' || error.code === 'GLOBAL_SEARCH_LOCKED')) { render(failed); return []; }
        state.error = error; render(failed); return [];
      }
    }
    function select(id) {
      if (!current()) { wipe(true); return; }
      var row = state.rows.find(function (item) { return item.id === id; }); if (!row) return;
      var value = context(); requests += 1; value.id = row.id; value.mode = 'detail'; value.detailScrollTop = 0;
      value.origin = listOrigin(value); value.focus = mobile() ? 'back' : 'detail'; state.missing = false;
      reconcile(value);
      if (pendingRestore) pendingRestore.snapshot = value;
      changed();
      if (!options.full && options.requestExpand) { options.requestExpand(snapshot(value)); return; }
      render(value, focusGuard(value.focus));
    }
    function back() {
      if (!current()) { wipe(true); return; }
      var value = context(), previous = value.origin;
      if (previous) {
        value.query = previous.query; value.time = previous.time; value.status = previous.status; value.id = previous.id;
        value.limit = previous.limit; value.listScrollTop = previous.listScrollTop;
      }
      value.mode = 'list'; value.detailScrollTop = 0; value.focus = value.id ? 'row:' + value.id : 'list';
      if (state.rows.length || !state.loading) reconcile(value); else install(value);
      var guard = focusGuard(value.focus);
      if (pendingRestore) pendingRestore = { snapshot: value, guard: guard };
      render(value, guard); changed();
    }
    async function request(value) {
      if (!current()) { wipe(true); return false; }
      value = snapshot(value); var ticket = ++requests; sequence += 1;
      if (!value.focus && value.id) value.focus = value.mode === 'detail' ? mobile() ? 'back' : 'detail' : 'row:' + value.id;
      install(value); state.rows = []; state.error = null; state.missing = false;
      pendingRestore = { snapshot: value, guard: focusGuard(value.focus) };
      await refresh();
      if (ticket !== requests || !current()) return false;
      if (!visible) return false;
      if (!options.full && selected() && value.mode === 'detail' && options.requestExpand) {
        var expanded = context(); expanded.mode = 'detail'; if (!expanded.origin) expanded.origin = listOrigin(expanded);
        options.requestExpand(expanded);
      }
      return !state.error;
    }
    if (win.VildaGlobalSearch && typeof win.VildaGlobalSearch.create === 'function') service = win.VildaGlobalSearch.create({ vault: vault, document: doc, onInvalidate: invalidated, prepareNotes: options.prepareNotes, formatMedicationDose: options.formatMedicationDose });
    render();
    return {
      refresh: refresh,
      invalidate: function () { if (service) service.invalidate('view'); else invalidated('view'); },
      request: request,
      select: select,
      backToList: back,
      handleEscape: function () { if (!current()) { wipe(true); return false; } if (!state.detail) return false; back(); return true; },
      setVisible: function (value) {
        var previous = visible, remembered = context(); visible = !!value;
        if (visible && stale && !state.loading) {
          if (!pendingRestore) pendingRestore = { snapshot: remembered, guard: null };
          refresh();
        } else if (visible && !previous && !state.loading) render(remembered);
      },
      getContext: context,
      destroy: function () { destroyed = true; sequence += 1; requests += 1; if (timer) win.clearTimeout(timer); if (service) service.destroy();
        pendingRestore = null; origin = null; position.list = position.detail = 0; state.rows = []; state.query = ''; state.id = null;
        doc.removeEventListener('focusin', outsideInteraction, true); doc.removeEventListener('pointerdown', outsideInteraction, true); root.remove(); }
    };
  }
  win.VildaGlobalSearchView = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
