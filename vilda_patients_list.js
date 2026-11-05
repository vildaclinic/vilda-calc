/* Baza pacjentów: presentation and temporary navigation state only.
 * Patient records, list rules and mutations remain in VildaVault/AuthUI.
 * This file is the readable browser source; it has no build step. */
(function (win) {
  'use strict';
  if (!win || win.VildaPatientsList) return;

  const SORTS = [
    ['recent-desc', 'Ostatnio zapisani'],
    ['name-asc', 'Alfabetycznie A–Z'],
    ['name-desc', 'Alfabetycznie Z–A']
  ];
  const SOURCE_LABELS = { all: 'Wszyscy', base: 'Z bazy', ext: 'Spoza bazy', lists: 'Listy' };
  const SVG = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
    note: '<path d="M5 3h10l4 4v14H5Z"/><path d="M14 3v5h5M8 12h8M8 16h8"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>'
  };

  function create(options) {
    const opts = options || {};
    const doc = win.document;
    const vault = opts.vault;
    const patients = Array.isArray(opts.patients) ? opts.patients.slice() : [];
    const byId = new Map(patients.map((patient) => [patient.patientId, patient]));
    const initial = opts.initialState || {};
    const normalize = opts.normalize || ((value) => String(value || '').toLocaleLowerCase('pl'));
    const state = {
      filter: ['all', 'base', 'ext', 'lists', 'dup'].includes(initial.filter) ? initial.filter : 'all',
      listId: initial.listId || null,
      query: initial.query || '',
      listQuery: initial.listQuery || '',
      sourceFilter: ['all', 'base', 'ext'].includes(initial.sourceFilter) ? initial.sourceFilter : 'all',
      sort: SORTS.some(([id]) => id === initial.sort) ? initial.sort : 'recent-desc',
      adding: Boolean(initial.adding),
      selected: Object.assign({}, initial.selected || {}),
      catalogScrollTop: Number(initial.catalogScrollTop) || 0,
      listScrollTop: Number(initial.listScrollTop) || 0
    };
    // Earlier versions used the same input for names of lists and patients.
    if (state.filter === 'lists' && !state.listId && !Object.prototype.hasOwnProperty.call(initial, 'listQuery')) {
      state.listQuery = state.query;
      state.query = '';
    }
    let destroyed = false;
    let mounted = false;
    let finalSnapshot = null;
    let readSequence = 0;
    let listCache = null;
    let catalogPromise = null;
    let memberCache = null;
    let listReader = null;
    const memberPromises = new Map();
    let busy = Boolean(opts.loading);
    let rowWindow = null;
    const rowHeights = new Map(Array.isArray(initial.rowHeights) ? initial.rowHeights : []);
    let measuredWidth = Number(initial.measuredWidth) || 0;
    const dateFormatter = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let picker = null;
    let pickerBody = null;
    let pickerInput = null;
    let pickerReturnFocus = null;
    let unregisterBack = null;
    let observer = null;
    let editorObserver = null;
    let pendingRefresh = false;
    let restoreScroll = Number(initial.scrollTop) || 0;
    let restoreAnchor = initial.rowAnchor || null;
    let restoreRowFocus = initial.rowFocus || null;
    let focusTimer = null;
    const media = typeof win.matchMedia === 'function' ? win.matchMedia('(min-width: 992px)') : null;
    let desktop = media ? media.matches : (win.innerWidth || 1024) >= 992;

    function el(tag, className, text) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = String(text);
      return node;
    }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function icon(name) {
      const node = el('span', 'pt-icon');
      node.setAttribute('aria-hidden', 'true');
      node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + SVG[name] + '</svg>';
      return node;
    }
    function button(className, text, action) {
      const node = el('button', className, text);
      node.type = 'button';
      if (action) node.addEventListener('click', action);
      return node;
    }
    function textButton(className, text, action, iconName) {
      const node = button(className, null, action);
      if (iconName) node.appendChild(icon(iconName));
      node.appendChild(el('span', null, text));
      return node;
    }
    function alive() {
      if (destroyed || !mounted || !root.isConnected) return false;
      return typeof opts.isCurrent !== 'function' || opts.isCurrent();
    }
    function mayUseLists() { return typeof opts.hasListAccess === 'function' && Boolean(opts.hasListAccess()); }
    function guardedRead(sequence) { return alive() && sequence === readSequence; }
    function peopleLabel(count) {
      return count + ' ' + (count === 1 ? 'osoba' : count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14) ? 'osoby' : 'osób');
    }
    function isCatalog() { return state.filter === 'lists' && !state.listId; }
    function currentSearch() { return isCatalog() ? state.listQuery : state.query; }
    function describeList(list) {
      if (!list.rule) return 'Lista ręczna';
      const rule = typeof opts.describeRule === 'function' ? opts.describeRule(list.rule) : '';
      return 'Automatyczna' + (rule ? ' · ' + rule : '');
    }
    function sorted(rows, sort) {
      if (typeof opts.sortPatients === 'function') return opts.sortPatients(rows, sort || state.sort);
      return rows.slice().sort((a, b) => String(a.header && a.header.name || '').localeCompare(String(b.header && b.header.name || ''), 'pl'));
    }
    function matchesName(patient, query) {
      return !query || normalize(patient.header && patient.header.name || '').indexOf(normalize(query)) !== -1;
    }
    function sourceMatches(patient, source) {
      return source !== 'base' && source !== 'ext' || (source === 'ext') === Boolean(patient.__ext);
    }

    const root = el('div', 'vilda-auth-screen vilda-auth-patients vilda-patients2 vilda-patient-database');
    root.setAttribute('data-patient-database', 'list');
    const header = el('div', 'pt-head');
    const titleRow = el('div', 'pt-title-row');
    const titles = el('div', 'pt-titles');
    const home = textButton('pt-home', 'Wróć do strony głównej', () => { if ((!busy || opts.loading) && opts.onHome) opts.onHome(); }, 'back');
    const title = el('h2', 'vilda-auth-title', 'Baza pacjentów');
    const total = el('p', 'pt-total', peopleLabel(patients.length) + ' · ' + patients.filter((p) => !p.__ext).length + ' z bazy · ' + patients.filter((p) => p.__ext).length + ' spoza bazy');
    header.appendChild(home); titles.appendChild(title); titles.appendChild(total);
    const add = button('pt-add pt-primary', null, () => { if (!busy && opts.onAddPatient) opts.onAddPatient(); });
    add.setAttribute('aria-label', 'Dodaj pacjenta');
    add.appendChild(el('span', 'pt-plus', '+'));
    add.appendChild(el('span', 'pt-add-full', 'Dodaj pacjenta'));
    add.appendChild(el('span', 'pt-add-short', 'Dodaj'));
    titleRow.appendChild(titles); titleRow.appendChild(add); header.appendChild(titleRow);

    const toolbar = el('div', 'pt-toolbar');
    const searchBox = el('div', 'pt-search');
    searchBox.appendChild(icon('search'));
    const search = el('input');
    search.type = 'search'; search.autocomplete = 'off'; search.spellcheck = false;
    search.setAttribute('aria-label', 'Szukaj po imieniu i nazwisku');
    const clearSearch = textButton('pt-clear', '', () => {
      if (isCatalog()) state.listQuery = ''; else state.query = '';
      render(); search.focus();
    }, 'close');
    clearSearch.setAttribute('aria-label', 'Wyczyść wyszukiwanie');
    searchBox.appendChild(search); searchBox.appendChild(clearSearch); toolbar.appendChild(searchBox);
    const sourceTabs = el('div', 'pt-seg');
    sourceTabs.setAttribute('role', 'group'); sourceTabs.setAttribute('aria-label', 'Widok bazy');
    const tabNodes = {};
    ['all', 'base', 'ext', 'lists'].forEach((key) => {
      const tab = button('', SOURCE_LABELS[key], () => chooseTab(key));
      tab.setAttribute('data-filter', key);
      tab.setAttribute('aria-pressed', 'false');
      // Keep the accessible name stable for existing keyboard navigation.
      tab.setAttribute('aria-label', SOURCE_LABELS[key]);
      tab.appendChild(el('span', 'pt-tab-count'));
      tabNodes[key] = tab; sourceTabs.appendChild(tab);
    });
    toolbar.appendChild(sourceTabs);
    const listsTrigger = textButton('pt-lists-trigger pt-secondary', 'Listy', openPicker, 'note');
    listsTrigger.setAttribute('aria-haspopup', 'dialog'); toolbar.appendChild(listsTrigger);
    const sortWrap = el('div', 'pt-sortwrap');
    const sortButton = button('pt-sortpill pt-secondary');
    sortButton.setAttribute('aria-haspopup', 'menu'); sortButton.setAttribute('aria-expanded', 'false');
    const sortLabel = el('span', 'sl'); sortButton.appendChild(sortLabel); sortButton.appendChild(icon('down'));
    const sortMenu = el('div', 'pt-sortmenu'); sortMenu.setAttribute('role', 'menu'); sortMenu.hidden = true;
    SORTS.forEach(([id, label]) => {
      const item = button('pt-sortopt', label, () => {
        if (busy) return;
        state.sort = id;
        if (typeof opts.onSortChange === 'function') opts.onSortChange(id);
        closeSort(); render(); scroll.scrollTop = 0; sortButton.focus();
      });
      item.setAttribute('data-s', id); item.setAttribute('role', 'menuitemradio');
      sortMenu.appendChild(item);
    });
    sortButton.addEventListener('click', () => {
      sortMenu.hidden = !sortMenu.hidden;
      sortButton.setAttribute('aria-expanded', String(!sortMenu.hidden));
      if (!sortMenu.hidden && sortMenu.firstChild) sortMenu.firstChild.focus();
    });
    sortWrap.appendChild(sortButton); sortWrap.appendChild(sortMenu); toolbar.appendChild(sortWrap);
    const newList = button('pl-new pt-primary', '+ Nowa lista', () => editList(null)); toolbar.appendChild(newList);
    const count = el('div', 'pt-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    toolbar.appendChild(count); header.appendChild(toolbar); root.appendChild(header);
    const duplicates = el('div', 'pt-dupbar');
    const duplicateText = el('span', 'lt');
    const duplicateButton = button('pt-secondary', 'Przejrzyj', () => {
      if (busy) return;
      state.filter = state.filter === 'dup' ? 'all' : 'dup'; state.listId = null;
      render(); scroll.scrollTop = 0;
    });
    duplicates.appendChild(duplicateText); duplicates.appendChild(duplicateButton); root.appendChild(duplicates);
    if (opts.legacyNotice) root.appendChild(opts.legacyNotice);
    const scroll = el('div', 'pt-scroll'); root.appendChild(scroll);
    const footer = el('div', 'pt-list-footer');
    const footerCount = el('span');
    footer.appendChild(footerCount); footer.appendChild(el('span', null, 'Kliknięcie nazwiska otwiera kartę pacjenta ↗'));
    root.appendChild(footer);

    function closeSort() { sortMenu.hidden = true; sortButton.setAttribute('aria-expanded', 'false'); }
    function outsideSort(event) {
      if (!sortWrap.contains(event.target)) closeSort();
    }
    function keyboardSort(event) {
      if (sortMenu.hidden) return;
      const items = Array.from(sortMenu.querySelectorAll('button'));
      const index = items.indexOf(doc.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); closeSort(); sortButton.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        if (items[next]) items[next].focus();
      }
    }
    function syncControls() {
      root.setAttribute('data-layout', desktop ? 'desktop' : 'compact');
      root.setAttribute('aria-busy', String(busy));
      Object.keys(tabNodes).forEach((key) => {
        const active = state.filter === key;
        tabNodes[key].classList.toggle('on', active);
        tabNodes[key].setAttribute('aria-pressed', String(active));
        tabNodes[key].hidden = key === 'lists' && !desktop;
        tabNodes[key].disabled = busy;
      });
      const counts = { all: patients.length, base: patients.filter((p) => !p.__ext).length, ext: patients.filter((p) => p.__ext).length, lists: listCache ? listCache.length : null };
      Object.keys(tabNodes).forEach((key) => { tabNodes[key].querySelector('.pt-tab-count').textContent = counts[key] == null ? '' : String(counts[key]); });
      listsTrigger.hidden = desktop;
      listsTrigger.disabled = busy;
      newList.hidden = !(desktop && isCatalog() && mayUseLists());
      newList.disabled = busy;
      sortWrap.hidden = isCatalog() || state.filter === 'dup';
      sortButton.disabled = busy;
      sortLabel.textContent = SORTS.find(([id]) => id === state.sort)[1];
      Array.from(sortMenu.querySelectorAll('button')).forEach((node) => {
        const checked = node.getAttribute('data-s') === state.sort;
        node.classList.toggle('on', checked); node.setAttribute('aria-checked', String(checked));
      });
      search.value = currentSearch(); search.disabled = busy;
      const hint = isCatalog() ? 'Szukaj listy' : state.listId ? 'Szukaj pacjenta na liście' : 'Szukaj po imieniu i nazwisku';
      search.placeholder = isCatalog() ? 'Szukaj listy' : 'Imię lub nazwisko…'; search.setAttribute('aria-label', hint); clearSearch.hidden = !search.value; clearSearch.disabled = busy;
      home.disabled = busy && !opts.loading; add.disabled = busy;
      total.hidden = Boolean(opts.loading);
      refreshDuplicates();
      footer.hidden = Boolean(opts.loading) || isCatalog() || state.filter === 'dup';
      syncBack();
    }
    function refreshDuplicates() {
      const number = Number(opts.duplicates && opts.duplicates.count) || 0;
      duplicates.hidden = !number || state.filter === 'lists';
      duplicateText.textContent = 'Podobne nazwiska · ' + number + (number === 1 ? ' grupa do sprawdzenia' : ' grup do sprawdzenia');
      duplicateButton.textContent = state.filter === 'dup' ? '← Wróć do bazy' : 'Przejrzyj';
      duplicateButton.disabled = busy;
    }
    function chooseTab(key) {
      if (busy) return;
      if (key === 'lists' && !desktop) { openPicker(); return; }
      state.filter = key; state.listId = null; state.adding = false; state.selected = {};
      state.sourceFilter = 'all'; memberCache = null; closeSort(); closePicker(false);
      render(); scroll.scrollTop = 0;
    }
    function savePosition() {
      if (isCatalog()) state.catalogScrollTop = scroll.scrollTop;
      else if (state.listId) state.listScrollTop = scroll.scrollTop;
    }
    function backToCatalog() {
      if (busy) return;
      savePosition(); state.listId = null; state.filter = 'lists'; state.adding = false; state.selected = {}; memberCache = null;
      restoreScroll = state.catalogScrollTop; restoreAnchor = null;
      if (desktop) render(); else openPicker();
    }
    function chooseList(id) {
      if (busy) return;
      savePosition(); closePicker(false);
      state.filter = 'lists'; state.listId = id; state.adding = false; state.selected = {}; state.sourceFilter = 'all'; memberCache = null;
      restoreScroll = 0; restoreAnchor = null; render();
    }
    function syncBack() {
      // Resizing or completing a read must not move this screen above the
      // existing rule editor in the shared Back stack.
      if (!destroyed && doc.querySelector('.vilda-pl-overlay')) return;
      if (unregisterBack) { unregisterBack(); unregisterBack = null; }
      if (destroyed || typeof opts.registerBack !== 'function') return;
      let handler = null;
      if (picker) handler = () => { closePicker(true); render(); };
      else if (state.adding) handler = () => { if (!busy) { state.adding = false; state.selected = {}; render(); } };
      else if (state.listId) handler = backToCatalog;
      else if (state.filter === 'lists' || state.filter === 'dup') handler = () => chooseTab('all');
      if (handler) unregisterBack = opts.registerBack(handler);
    }
    function empty(host, heading, message, actionText, action) {
      const box = el('div', 'pt-empty'); box.appendChild(el('h3', null, heading));
      if (message) box.appendChild(el('p', null, message));
      if (actionText) box.appendChild(button('pt-secondary', actionText, action));
      host.appendChild(box);
    }
    function denied(host) {
      empty(host, 'Listy pacjentów — funkcja PRO', 'Listy ręczne i automatyczne są częścią pakietu PRO. Dostęp można aktywować w Subskrypcji.');
    }
    function errorMessage(host, label, retry) {
      clear(host); empty(host, label, 'Spróbuj ponownie.', 'Ponów', retry);
    }
    function presentationFor(patient) {
      const supplied = typeof opts.describePatient === 'function' ? opts.describePatient(patient) || {} : {};
      if (Object.prototype.hasOwnProperty.call(supplied, 'birth')) return supplied;
      const data = patient.header || {};
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(data.dobISO || '') ? data.dobISO : '';
      const year = /^\d{4}$/.test(String(data.birthYear || '')) ? String(data.birthYear) : '';
      return Object.assign({}, supplied, {
        birth: iso ? iso.split('-').reverse().join('.') : year || '—',
        birthHint: iso ? '' : year ? 'tylko rok' : 'nie podano',
        age: '', sex: data.sex === 'F' || data.sex === 'K' ? 'Kobieta' : data.sex === 'M' ? 'Mężczyzna' : ''
      });
    }
    function savedDate(value) {
      if (!value) return '—';
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '—';
    }
    function patientRow(patient, list, members) {
      const data = patient.header || {};
      const name = data.name || '(bez nazwiska)';
      // A wrapper and a single primary button avoid nested interactive controls.
      const presentation = presentationFor(patient);
      const row = el('div', 'pt-row' + (presentation.duplicate === 'base' ? ' pt-row--dup' : presentation.duplicate === 'mixed' ? ' pt-row--softdup' : '')); row.setAttribute('data-patient-id', patient.patientId);
      const open = button('pt-row-open', null, () => {
        if (!busy && opts.onOpenPatient) opts.onOpenPatient(patient);
      });
      open.title = 'Otwórz: ' + name; open.setAttribute('aria-label', 'Otwórz kartę: ' + name);
      const info = el('span', 'pt-info'); const nameLine = el('span', 'pt-name');
      nameLine.appendChild(el('span', 'pt-person-name', name));
      if (patient.__ext) nameLine.appendChild(el('span', 'pt-badge', 'spoza bazy'));
      info.appendChild(nameLine);
      const metadata = el('span', 'pt-meta');
      if (presentation.birth && presentation.birth !== '—') {
        metadata.appendChild(el('span', 'pt-mobile-birth', (presentation.birthHint === 'tylko rok' ? 'rok ur. ' : 'ur. ') + presentation.birth));
      }
      [presentation.age, presentation.sex].filter(Boolean).forEach((value) => metadata.appendChild(el('span', 'pt-demographic', value)));
      info.appendChild(metadata);
      const birth = el('span', 'pt-birth', presentation.birth || '—');
      birth.setAttribute('aria-label', 'Data urodzenia: ' + (presentation.birth && presentation.birth !== '—' ? presentation.birth : 'nie podano'));
      if (presentation.birthHint) birth.appendChild(el('small', null, presentation.birthHint));
      if (presentation.duplicate) info.appendChild(el('span', 'pt-duplicate-hint', presentation.duplicate === 'base' ? 'Rozróżnij osoby datą urodzenia' : 'Możliwy duplikat — przejrzyj podobne nazwiska'));
      const date = el('span', 'pt-saved'); date.appendChild(el('small', null, 'Ostatni zapis'));
      const time = el('time', null, savedDate(patient.lastSavedAtISO));
      if (patient.lastSavedAtISO) time.setAttribute('datetime', String(patient.lastSavedAtISO));
      date.appendChild(time);
      open.appendChild(info); open.appendChild(birth); open.appendChild(date); open.appendChild(icon('arrow')); row.appendChild(open);
      if (state.adding) {
        const checkbox = el('input', 'pl-cb'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(state.selected[patient.patientId]);
        checkbox.setAttribute('aria-label', 'Dodaj do listy: ' + name);
        function changed() {
          state.selected[patient.patientId] = checkbox.checked;
          updateAddCount();
        }
        checkbox.addEventListener('change', changed);
        row.insertBefore(checkbox, open);
        // The primary action in selection mode is selection, never card navigation.
        const select = button('pt-row-open', null, () => { checkbox.checked = !checkbox.checked; changed(); });
        select.setAttribute('aria-label', 'Zaznacz do dodania: ' + name);
        while (open.firstChild) select.appendChild(open.firstChild);
        row.removeChild(open); row.appendChild(select);
      } else if (list) {
        const remove = button('pl-rm', 'Usuń z listy', () => removeMember(list, patient, members));
        remove.title = 'Zdejmij z tej listy'; remove.setAttribute('aria-label', 'Usuń z listy: ' + name); row.appendChild(remove);
      }
      return row;
    }
    function patientRows(host, rows, list, members) {
      const surface = el('div', 'pt-results');
      const columns = el('div', 'pt-columns');
      columns.setAttribute('aria-hidden', 'true');
      columns.appendChild(el('span', null, 'Imię i nazwisko'));
      columns.appendChild(el('span', null, 'Data urodzenia'));
      columns.appendChild(el('span', null, 'Ostatni zapis'));
      columns.appendChild(el('span'));
      // Extra selection/removal actions have their own width; omit headings in
      // that mode instead of aligning misleading labels over those actions.
      columns.hidden = Boolean(state.adding || list);
      surface.appendChild(columns);
      const body = el('div', 'pt-result-rows');
      body.setAttribute('role', 'list'); body.setAttribute('aria-label', 'Pacjenci');
      surface.appendChild(body); host.appendChild(surface);
      const makeRow = (patient, index) => {
        const node = patientRow(patient, list, members);
        node.setAttribute('role', 'listitem');
        node.setAttribute('aria-posinset', String(index + 1));
        node.setAttribute('aria-setsize', String(rows.length));
        return node;
      };
      if (rows.length <= 60) rows.forEach((patient, index) => body.appendChild(makeRow(patient, index)));
      else rowWindow = windowRows(body, rows, makeRow);
      footerCount.textContent = peopleLabel(rows.length) + (list ? ' na wybranej liście' : '');
    }
    // Only visible rows and a small overscan exist in the DOM. Unknown heights
    // are estimates, replaced by measured heights; keep the first visible person
    // anchored while the estimates settle (also for wrapping names on phones).
    function windowRows(body, rows, makeRow) {
      const width = Math.round(scroll.clientWidth);
      if (measuredWidth !== width) { rowHeights.clear(); measuredWidth = width; }
      const mode = (state.adding ? 'add:' : state.listId ? 'list:' : 'all:');
      const key = (index) => mode + rows[index].patientId;
      let offsets = [], current = new Map(), frame = null, stopped = false;
      let rangeKey = '', resizeObserver = null;
      function prefix() {
        offsets = [0];
        rows.forEach((patient, index) => offsets.push(offsets[index] + (rowHeights.get(key(index)) || 86)));
      }
      function origin() { return body.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop; }
      function indexAt(value) {
        let left = 0, right = rows.length;
        while (left < right) { const middle = (left + right) >>> 1; if (offsets[middle + 1] <= value) left = middle + 1; else right = middle; }
        return Math.min(rows.length - 1, left);
      }
      function anchor() {
        const position = scroll.scrollTop - origin();
        const index = indexAt(Math.max(0, position));
        return { patientId: rows[index].patientId, offset: position - offsets[index] };
      }
      function measure() {
        if (stopped || !body.isConnected) return;
        const top = origin(), index = indexAt(Math.max(0, scroll.scrollTop - top));
        const delta = scroll.scrollTop - top - offsets[index];
        let changed = false;
        current.forEach((node, item) => {
          const height = node.getBoundingClientRect().height;
          if (height > 0 && Math.abs((rowHeights.get(key(item)) || 86) - height) > .5) { rowHeights.set(key(item), height); changed = true; }
        });
        if (changed) { prefix(); draw(true); scroll.scrollTop = top + offsets[index] + delta; }
      }
      function schedule() {
        if (stopped || frame != null) return;
        frame = win.requestAnimationFrame(() => { frame = null; draw(); measure(); });
      }
      function draw(force, ensureIndex) {
        if (stopped) return;
        const top = Math.max(0, scroll.scrollTop - origin());
        const start = Math.max(0, indexAt(top) - 8);
        const end = Math.min(rows.length, indexAt(top + Math.max(scroll.clientHeight, 300)) + 9);
        const active = doc.activeElement;
        const focusedRow = active && active.closest ? active.closest('.pt-row') : null;
        const focusedIndex = focusedRow && body.contains(focusedRow) ? Number(focusedRow.dataset.virtualIndex) : -1;
        const indices = [];
        for (let index = start; index < end; index += 1) indices.push(index);
        for (const index of [focusedIndex, ensureIndex]) if (Number.isInteger(index) && index >= 0 && index < rows.length && !indices.includes(index)) indices.push(index);
        indices.sort((a, b) => a - b);
        const nextKey = indices.join(',');
        if (!force && nextKey === rangeKey) return;
        rangeKey = nextKey;
        const next = new Map(), fragment = doc.createDocumentFragment();
        let last = 0;
        function spacer(height) {
          if (height <= 0) return;
          // Runtime geometry: this measured gap preserves the full scroll length
          // of unmounted rows. Its variable pixel height cannot be a static class.
          const node = el('div', 'pt-row-spacer'); node.style.height = height + 'px'; node.setAttribute('aria-hidden', 'true'); fragment.appendChild(node);
        }
        indices.forEach((index) => {
          spacer(offsets[index] - offsets[last]);
          const node = current.get(index) || makeRow(rows[index], index);
          node.dataset.virtualIndex = String(index);
          next.set(index, node); fragment.appendChild(node); last = index + 1;
        });
        spacer(offsets[rows.length] - offsets[last]);
        if (resizeObserver) { current.forEach((node, index) => { if (!next.has(index)) resizeObserver.unobserve(node); }); }
        body.replaceChildren(fragment); current = next;
        if (resizeObserver) current.forEach((node) => resizeObserver.observe(node));
        if (active && body.contains(active) && doc.activeElement !== active) active.focus({ preventScroll: true });
      }
      function focusRow(index, control) {
        const target = Math.max(0, Math.min(rows.length - 1, index));
        scroll.scrollTop = origin() + offsets[target];
        draw(true, target); measure();
        const node = current.get(target);
        if (node) {
          const controls = node.querySelectorAll('button, input');
          const focus = controls[Math.min(control || 0, controls.length - 1)];
          if (focus) focus.focus({ preventScroll: true });
        }
        schedule();
      }
      function keyboard(event) {
        const row = event.target.closest && event.target.closest('.pt-row');
        if (!row || !body.contains(row)) return;
        const index = Number(row.dataset.virtualIndex), controls = Array.from(row.querySelectorAll('button, input'));
        const control = controls.indexOf(doc.activeElement);
        let next = null, nextControl = control;
        if (event.key === 'Tab') {
          if (!event.shiftKey && control === controls.length - 1 && index < rows.length - 1) { next = index + 1; nextControl = 0; }
          if (event.shiftKey && control === 0 && index > 0) { next = index - 1; nextControl = state.adding || state.listId ? 1 : 0; }
        } else if (event.key === 'ArrowDown') next = index + 1;
        else if (event.key === 'ArrowUp') next = index - 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = rows.length - 1;
        else if (event.key === 'PageDown') next = indexAt(offsets[index] + scroll.clientHeight);
        else if (event.key === 'PageUp') next = indexAt(Math.max(0, offsets[index] - scroll.clientHeight));
        if (next != null) { event.preventDefault(); focusRow(next, nextControl); }
      }
      prefix();
      if (typeof win.ResizeObserver === 'function') resizeObserver = new win.ResizeObserver(() => schedule());
      scroll.addEventListener('scroll', schedule, { passive: true });
      body.addEventListener('keydown', keyboard);
      draw(); schedule();
      return {
        anchor,
        focusPatient(value) {
          const index = value ? rows.findIndex((patient) => patient.patientId === value.patientId) : -1;
          if (index < 0) return;
          draw(true, index);
          const node = current.get(index), controls = node && node.querySelectorAll('button, input');
          const focus = controls && controls[Math.min(Number(value.control) || 0, controls.length - 1)];
          if (focus) focus.focus({ preventScroll: true });
        },
        restore(value) {
          const index = value ? rows.findIndex((patient) => patient.patientId === value.patientId) : -1;
          if (Number.isInteger(index) && index >= 0) { scroll.scrollTop = origin() + offsets[index] + (Number(value.offset) || 0); draw(true, index); measure(); }
          else { draw(); measure(); }
        },
        resize() {
          const nextWidth = Math.round(scroll.clientWidth), previous = anchor();
          if (measuredWidth !== nextWidth) {
            rowHeights.clear(); measuredWidth = nextWidth; prefix(); rangeKey = '';
            const index = rows.findIndex((patient) => patient.patientId === previous.patientId);
            scroll.scrollTop = origin() + offsets[index] + previous.offset;
          }
          schedule();
        },
        destroy() {
          stopped = true; if (frame != null) win.cancelAnimationFrame(frame);
          if (resizeObserver) resizeObserver.disconnect();
          scroll.removeEventListener('scroll', schedule); body.removeEventListener('keydown', keyboard);
        }
      };
    }
    function renderPatients() {
      const rows = sorted(patients.filter((patient) => sourceMatches(patient, state.filter) && matchesName(patient, state.query)));
      count.textContent = 'Wyświetlono: ' + rows.length;
      if (!rows.length) {
        empty(scroll, patients.length ? 'Brak pasujących osób' : 'Baza jest jeszcze pusta', patients.length ? 'Zmień wyszukiwanie lub wybierz inny zakres.' : 'Dodaj pacjenta, aby rozpocząć pracę z bazą.', patients.length ? 'Wyczyść wyszukiwanie i filtry' : '+ Dodaj pacjenta', () => {
          if (patients.length) { state.query = ''; chooseTab('all'); }
          else if (opts.onAddPatient) opts.onAddPatient();
        });
      } else patientRows(scroll, rows);
      footerCount.textContent = peopleLabel(rows.length);
    }
    function reader() {
      if (!listReader) listReader = typeof vault.createPatientListReader === 'function' ? vault.createPatientListReader({ isCurrent: alive }) : vault;
      return listReader;
    }
    function invalidateLists() {
      if (listReader && listReader !== vault && typeof listReader.dispose === 'function') listReader.dispose();
      listReader = null; listCache = null; catalogPromise = null; memberCache = null; memberPromises.clear();
    }
    function getMembers(list) {
      const id = typeof list === 'string' ? list : list.id;
      if (!memberPromises.has(id)) {
        const source = reader();
        const promise = Promise.resolve().then(() => source.getPatientListMembers(list)).catch((error) => {
          if (memberPromises.get(id) === promise) memberPromises.delete(id);
          throw error;
        });
        memberPromises.set(id, promise);
      }
      return memberPromises.get(id);
    }
    function getCatalog() {
      if (listCache) return Promise.resolve(listCache);
      if (!catalogPromise) {
        const source = reader();
        const pending = Promise.resolve().then(() => source.listPatientLists()).then((lists) => {
          const rows = (lists || []).map((list) => ({ list, members: null }));
          if (catalogPromise === pending) {
            if (alive() && mayUseLists()) listCache = rows;
            catalogPromise = null;
          }
          return rows;
        }, (error) => { if (catalogPromise === pending) catalogPromise = null; throw error; });
        catalogPromise = pending;
      }
      return catalogPromise;
    }
    function countMembers(node, entry, sequence) {
      function currentCount() { return guardedRead(sequence) && mayUseLists() && node.isConnected && listCache && listCache.includes(entry); }
      function done(members) {
        if (!currentCount()) return;
        entry.members = members;
        node.textContent = peopleLabel(Number(members.count) || 0);
        node.removeAttribute('aria-label');
      }
      if (entry.members) { done(entry.members); return; }
      node.textContent = '…'; node.setAttribute('aria-label', 'Liczba osób: wczytywanie');
      getMembers(entry.list).then(done).catch(() => {
        if (!currentCount()) return;
        node.textContent = 'Nie wczytano'; node.setAttribute('aria-label', 'Nie udało się wczytać liczby osób');
        // Opening this list retains the existing error/retry flow. A failed
        // count never masquerades as a list with zero members.
      });
    }
    function catalogRows(host, entries, sequence) {
      const query = state.listQuery;
      const filtered = entries.filter(({ list }) => !query || normalize(list.name || '').indexOf(normalize(query)) !== -1);
      if (host === scroll) {
        count.textContent = 'Listy pacjentów: ' + entries.length + (query ? ' · pokazano ' + filtered.length : '');
      }
      if (!filtered.length) {
        empty(host, entries.length ? 'Brak pasujących list' : 'Nie masz jeszcze list', entries.length ? 'Zmień nazwę wpisaną w wyszukiwarkę.' : 'Utwórz listę ręczną lub automatyczną.', entries.length ? 'Wyczyść wyszukiwanie' : '+ Nowa lista', () => {
          if (entries.length) { state.listQuery = ''; if (pickerInput) pickerInput.value = ''; render(); }
          else editList(null);
        });
        return;
      }
      const grid = el('div', 'pl-grid');
      const counts = [];
      filtered.forEach((entry) => {
        const { list } = entry;
        const wrapper = el('div', 'pl-row');
        const tile = button('pl-tile', null, () => chooseList(list.id));
        tile.title = 'Otwórz listę: ' + list.name; tile.setAttribute('data-list-id', list.id);
        tile.appendChild(icon('note'));
        const text = el('span', 'pl-description'); text.appendChild(el('strong', 'pl-tnm', list.name || '(bez nazwy)'));
        text.appendChild(el('small', 'pl-tmt', describeList(list) + (list.description ? ' · ' + list.description : '')));
        tile.appendChild(text);
        const number = el('span', 'pl-num', '…'); tile.appendChild(number);
        counts.push({ node: number, entry }); tile.appendChild(icon('arrow'));
        wrapper.appendChild(tile);
        const edit = button('pl-edit', 'Edytuj', () => editList(list)); edit.setAttribute('aria-label', 'Edytuj listę: ' + list.name); wrapper.appendChild(edit);
        grid.appendChild(wrapper);
      });
      host.appendChild(grid);
      counts.forEach(({ node, entry }) => countMembers(node, entry, sequence));
    }
    function renderCatalog(host, sequence) {
      if (!mayUseLists()) { denied(host); if (host === scroll) count.textContent = 'Listy pacjentów'; return; }
      if (host === scroll) count.textContent = 'Ładowanie list…';
      host.appendChild(el('div', 'pt-loading', 'Ładowanie list…'));
      getCatalog().then((entries) => {
        if (!guardedRead(sequence) || !mayUseLists() || (host !== scroll && host !== pickerBody)) return;
        clear(host); catalogRows(host, entries, sequence); syncControls(); restorePosition();
      }).catch(() => { if (guardedRead(sequence)) errorMessage(host, 'Nie udało się wczytać list.', () => render()); });
    }
    function loadMembers(id) {
      if (memberCache && memberCache.list.id === id) return Promise.resolve(memberCache);
      return getCatalog().then((entries) => {
        const entry = entries.find(({ list }) => list.id === id);
        return entry ? getMembers(entry.list).then((members) => ({ list: entry.list, members })) : null;
      });
    }
    function selectedCount() { return Object.keys(state.selected).filter((id) => state.selected[id]).length; }
    function updateAddCount() {
      const save = scroll.querySelector('.pl-confirm-add');
      if (save) save.textContent = 'Dodaj (' + selectedCount() + ')';
    }
    function memberHeading(list, members) {
      const container = el('div', 'pl-bar');
      container.appendChild(textButton('pl-back', 'Wszystkie listy', backToCatalog, 'back'));
      const bar = el('div', 'pl-detail-heading');
      const text = el('div'); text.appendChild(el('h3', 'pl-list-title', list.name));
      text.appendChild(el('p', null, describeList(list) + ' · ' + peopleLabel(Number(members.count) || 0))); bar.appendChild(text);
      const actions = el('div', 'pl-actions');
      if (state.adding) {
        actions.appendChild(button('pl-confirm-add go pt-primary', 'Dodaj (' + selectedCount() + ')', () => addMembers(list)));
        actions.appendChild(button('gh pt-secondary', 'Anuluj', () => { if (!busy) { state.adding = false; state.selected = {}; render(); } }));
      } else {
        actions.appendChild(button('go pt-secondary', '+ Dodaj pacjentów', () => { state.adding = true; state.selected = {}; state.listScrollTop = scroll.scrollTop; render(); scroll.scrollTop = 0; }));
        actions.appendChild(button('pl-edit gh pt-secondary', 'Edytuj listę', () => editList(list)));
      }
      bar.appendChild(actions); container.appendChild(bar);
      if (state.sourceFilter !== 'all') {
        const removeFilter = textButton('pt-source-scope pt-secondary', SOURCE_LABELS[state.sourceFilter], () => { state.sourceFilter = 'all'; render(); }, 'close');
        removeFilter.setAttribute('aria-label', 'Usuń filtr rodzaju rekordu'); container.appendChild(removeFilter);
      }
      return container;
    }
    function renderMembers(sequence) {
      if (!mayUseLists()) { count.textContent = 'Listy pacjentów'; denied(scroll); return; }
      const id = state.listId;
      count.textContent = 'Ładowanie listy…'; scroll.appendChild(el('div', 'pt-loading', 'Ładowanie listy…'));
      loadMembers(id).then((result) => {
        if (!guardedRead(sequence) || state.listId !== id || !mayUseLists()) return;
        if (!result) {
          state.listId = null; state.adding = false; state.selected = {}; invalidateLists();
          if (desktop) render(); else { state.filter = 'all'; render(); openPicker(); }
          return;
        }
        memberCache = result;
        const { list, members } = result;
        clear(scroll); count.textContent = 'Lista: ' + list.name; scroll.appendChild(memberHeading(list, members));
        const ids = new Set(members.memberIds || []);
        const candidates = state.adding ? patients.filter((patient) => !ids.has(patient.patientId)) : (members.memberIds || []).map((memberId) => byId.get(memberId)).filter(Boolean);
        const rows = sorted(candidates.filter((patient) => sourceMatches(patient, state.sourceFilter) && matchesName(patient, state.query)), state.adding ? 'name-asc' : state.sort);
        if (state.adding) scroll.appendChild(el('div', 'pt-sec', 'Zaznacz pacjentów do dodania'));
        if (rows.length) patientRows(scroll, rows, state.adding ? null : list, members);
        else {
          const filtered = Boolean(state.query || state.sourceFilter !== 'all');
          empty(scroll, state.adding ? 'Brak pacjentów do dodania' : filtered ? 'Brak pasujących osób' : 'Lista jest pusta', filtered ? 'Zmień wyszukiwanie lub filtr rodzaju rekordu.' : list.rule ? 'Lista aktualizuje się według zapisanej reguły. Możesz edytować regułę lub dodać pacjentów ręcznie.' : 'Dodaj pacjentów przyciskiem „+ Dodaj pacjentów”.');
        }
        footerCount.textContent = peopleLabel(rows.length) + (state.adding ? ' do wyboru' : ' na wybranej liście');
        syncControls(); restorePosition();
      }).catch(() => { if (guardedRead(sequence)) errorMessage(scroll, 'Nie udało się wczytać listy.', () => { memberCache = null; render(); }); });
    }
    function listMutationFailure(error) {
      if (alive() && typeof win.alert === 'function') win.alert('Nie udało się zapisać zmiany listy: ' + (error && error.message || error));
    }
    async function addMembers(list) {
      if (busy || !alive() || !mayUseLists()) return;
      const ids = Object.keys(state.selected).filter((id) => state.selected[id]);
      if (!ids.length) { state.adding = false; render(); return; }
      busy = true; syncControls(); invalidateLists();
      try {
        for (const id of ids) {
          if (!alive() || !mayUseLists()) return;
          await vault.addPatientToList(list.id, id);
        }
        if (alive()) { state.adding = false; state.selected = {}; invalidateLists(); restoreScroll = state.listScrollTop; }
      } catch (error) { listMutationFailure(error); invalidateLists(); }
      finally { busy = false; if (alive()) render(); }
    }
    async function removeMember(list, patient, members) {
      if (busy || !alive() || !mayUseLists()) return;
      const viaRule = Boolean(members && members.viaRule && members.viaRule[patient.patientId]);
      const message = 'Zdjąć „' + (patient.header && patient.header.name || '') + '” z listy?' + (viaRule ? '\nLista automatyczna — zapiszemy wykluczenie, aby reguła nie dodała tej osoby ponownie.' : '');
      if (typeof win.confirm !== 'function' || !win.confirm(message)) return;
      busy = true; syncControls(); invalidateLists();
      try { await vault.removePatientFromList(list.id, patient.patientId); if (alive()) { invalidateLists(); } }
      catch (error) { listMutationFailure(error); }
      finally { busy = false; if (alive()) render(); }
    }
    function editList(list) {
      if (!alive() || busy || !mayUseLists() || typeof opts.onEditList !== 'function') return;
      const returnPicker = Boolean(picker);
      invalidateLists();
      closePicker(false, true);
      opts.onEditList(list, { onDone: (result) => {
        if (!alive()) return;
        invalidateLists();
        if (list && !result && state.listId === list.id) { state.listId = null; state.adding = false; state.selected = {}; }
        render();
        if (returnPicker && !desktop) openPicker();
      } });
      // The existing rule editor calls onDone only after save/delete. Observe its
      // removal as well so Cancel, Escape and Back return to the same picker.
      const editor = doc.querySelector('.vilda-pl-overlay');
      if (editorObserver) { editorObserver.disconnect(); editorObserver = null; }
      if (editor && editor.parentNode && typeof win.MutationObserver === 'function') {
        editorObserver = new win.MutationObserver(() => {
          if (editor.isConnected) return;
          editorObserver.disconnect(); editorObserver = null;
          if (alive() && !desktop && (returnPicker || isCatalog())) openPicker();
          else if (alive()) syncBack();
          flushDeferredRefresh();
        });
        editorObserver.observe(editor.parentNode, { childList: true });
      }
    }
    function render() {
      if (destroyed) return;
      const sequence = ++readSequence;
      syncControls();
      if (rowWindow) { rowWindow.destroy(); rowWindow = null; }
      clear(scroll);
      if (opts.loading) { count.textContent = ''; scroll.appendChild(el('div', 'pt-loading', 'Wczytywanie Bazy pacjentów…')); return; }
      if (state.filter === 'dup') {
        count.textContent = 'Podobne nazwiska';
        if (opts.duplicates && typeof opts.duplicates.render === 'function') opts.duplicates.render(scroll);
      } else if (state.filter === 'lists' && state.listId) renderMembers(sequence);
      else if (isCatalog()) {
        if (desktop) renderCatalog(scroll, sequence);
        else { renderPatients(); if (mounted && !picker && !doc.querySelector('.vilda-pl-overlay')) openPicker(); }
      } else renderPatients();
      if (pickerBody) { clear(pickerBody); renderCatalog(pickerBody, sequence); }
      restorePosition();
    }
    function restorePosition() {
      if (restoreScroll == null || !mounted) return;
      const position = restoreScroll, savedAnchor = restoreAnchor, savedFocus = restoreRowFocus;
      // A list read has not populated the scroll host yet.
      if (scroll.querySelector('.pt-loading')) return;
      restoreScroll = null; restoreAnchor = null; restoreRowFocus = null;
      const schedule = win.requestAnimationFrame || ((callback) => win.setTimeout(callback, 0));
      schedule(() => {
        if (!alive()) return;
        scroll.scrollTop = position;
        if (rowWindow) { rowWindow.restore(savedAnchor); rowWindow.focusPatient(savedFocus); }
        else if (savedFocus) {
          const node = Array.from(scroll.querySelectorAll('.pt-row')).find((row) => row.dataset.patientId === savedFocus.patientId);
          const controls = node && node.querySelectorAll('button, input');
          const focus = controls && controls[Math.min(Number(savedFocus.control) || 0, controls.length - 1)];
          if (focus) focus.focus({ preventScroll: true });
        }
      });
    }
    function closePicker(restoreFocus, keepDeferredRefresh) {
      if (!picker) return;
      const previous = pickerReturnFocus;
      if (picker.parentNode) picker.parentNode.removeChild(picker);
      picker = null; pickerBody = null; pickerInput = null; pickerReturnFocus = null;
      if (!desktop && isCatalog()) state.filter = 'all';
      syncBack();
      if (restoreFocus && previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
      if (!keepDeferredRefresh) flushDeferredRefresh();
    }
    function deferRefresh() {
      if (destroyed || (!picker && !editorObserver)) return false;
      pendingRefresh = true;
      return true;
    }
    function flushDeferredRefresh() {
      if (destroyed || !pendingRefresh || picker || doc.querySelector('.vilda-pl-overlay')) return;
      pendingRefresh = false;
      if (typeof opts.onDeferredRefresh === 'function') opts.onDeferredRefresh();
    }
    function pickerKeyboard(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(true); render(); return; }
      if (event.key !== 'Tab' || !picker) return;
      const focusable = Array.from(picker.querySelectorAll('button, input, select, [tabindex="0"]')).filter((node) => !node.disabled && !node.hidden);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) return;
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    function openPicker() {
      if (destroyed || busy || !mounted) return;
      if (desktop) { state.filter = 'lists'; state.listId = null; render(); return; }
      if (picker) return;
      pickerReturnFocus = doc.activeElement;
      const overlay = el('div', 'vilda-auth-overlay-sheet vilda-patients-list-picker');
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Listy');
      const sheet = el('section', 'pt-picker-sheet');
      const top = el('div', 'pt-picker-head'); top.appendChild(el('h2', null, 'Listy'));
      const close = textButton('pt-picker-close', '', () => { closePicker(true); render(); }, 'close'); close.setAttribute('aria-label', 'Zamknij listy'); top.appendChild(close); sheet.appendChild(top);
      pickerInput = el('input', 'pt-picker-search'); pickerInput.type = 'search'; pickerInput.placeholder = 'Szukaj listy'; pickerInput.setAttribute('aria-label', 'Szukaj listy'); pickerInput.value = state.listQuery;
      pickerInput.addEventListener('input', () => { state.listQuery = pickerInput.value; render(); }); sheet.appendChild(pickerInput);
      pickerBody = el('div', 'pt-picker-body'); sheet.appendChild(pickerBody);
      const actions = el('div', 'pt-picker-actions');
      actions.appendChild(button('pt-secondary', 'Cała baza', () => { closePicker(false); chooseTab('all'); }));
      if (mayUseLists()) actions.appendChild(button('pl-new pt-primary', '+ Nowa lista', () => editList(null)));
      sheet.appendChild(actions); overlay.appendChild(sheet); picker = overlay;
      overlay.addEventListener('click', (event) => { if (event.target === overlay) { closePicker(true); render(); } });
      overlay.addEventListener('keydown', pickerKeyboard);
      doc.body.appendChild(overlay); syncBack();
      const sequence = ++readSequence; renderCatalog(pickerBody, sequence);
      // Do not open the virtual keyboard merely to choose an existing list.
      close.focus();
    }
    function resize() {
      const next = media ? media.matches : (win.innerWidth || 1024) >= 992;
      if (destroyed || !mounted) return;
      if (desktop === next) { if (rowWindow) rowWindow.resize(); return; }
      savePosition();
      restoreScroll = scroll.scrollTop; restoreAnchor = rowWindow ? rowWindow.anchor() : null; restoreRowFocus = focusedPatient();
      desktop = next;
      if (desktop && picker) { closePicker(false); state.filter = 'lists'; state.listId = null; }
      render();
    }
    function proChanged() {
      if (!alive()) return;
      invalidateLists();
      render();
    }
    search.addEventListener('input', () => { if (isCatalog()) state.listQuery = search.value; else state.query = search.value; render(); scroll.scrollTop = 0; });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && search.value) { event.stopPropagation(); if (isCatalog()) state.listQuery = ''; else state.query = ''; render(); }
    });

    function focusedPatient() {
      const active = doc.activeElement, row = active && active.closest ? active.closest('.pt-row') : null;
      return row && scroll.contains(row) ? { patientId: row.dataset.patientId, control: Array.from(row.querySelectorAll('button, input')).indexOf(active) } : null;
    }
    function read() {
      if (finalSnapshot) return Object.assign({}, finalSnapshot, { selected: Object.assign({}, finalSnapshot.selected) });
      return Object.assign({}, state, {
        selected: Object.assign({}, state.selected),
        scrollTop: scroll.scrollTop,
        rowAnchor: rowWindow ? rowWindow.anchor() : null, rowFocus: focusedPatient(),
        rowHeights: Array.from(rowHeights.entries()), measuredWidth,
        focused: doc.activeElement === search,
        selectionStart: search.selectionStart,
        selectionEnd: search.selectionEnd
      });
    }
    function destroy() {
      if (destroyed) return;
      finalSnapshot = read(); destroyed = true; ++readSequence; invalidateLists();
      closePicker(false); closeSort();
      if (rowWindow) { rowWindow.destroy(); rowWindow = null; }
      if (unregisterBack) { unregisterBack(); unregisterBack = null; }
      if (observer) observer.disconnect();
      if (editorObserver) editorObserver.disconnect();
      if (focusTimer != null) win.clearTimeout(focusTimer);
      win.removeEventListener('resize', resize);
      if (media && typeof media.removeEventListener === 'function') media.removeEventListener('change', resize);
      doc.removeEventListener('click', outsideSort);
      doc.removeEventListener('keydown', keyboardSort);
      doc.removeEventListener('vildaProAccessChanged', proChanged);
      win.removeEventListener('vildaProAccessChanged', proChanged);
    }
    function mount() {
      if (mounted || destroyed) return;
      mounted = true;
      win.addEventListener('resize', resize);
      if (media && typeof media.addEventListener === 'function') media.addEventListener('change', resize);
      doc.addEventListener('click', outsideSort);
      doc.addEventListener('keydown', keyboardSort);
      doc.addEventListener('vildaProAccessChanged', proChanged);
      win.addEventListener('vildaProAccessChanged', proChanged);
      if (typeof win.MutationObserver === 'function' && root.parentNode) {
        observer = new win.MutationObserver(() => { if (!root.isConnected) destroy(); });
        observer.observe(root.parentNode, { childList: true });
      }
      render();
      if (desktop && initial.focused !== false && !initial.rowFocus) focusTimer = win.setTimeout(() => {
        if (!alive() || picker) return;
        search.focus();
        if (typeof search.setSelectionRange === 'function' && initial.selectionStart != null) {
          try { search.setSelectionRange(initial.selectionStart, initial.selectionEnd); } catch { /* search input differs across engines */ }
        }
      }, 60);
    }
    syncControls();
    return { root, read, destroy, mount, refreshDuplicates, deferRefresh };
  }
  function createLoading(options) { return create(Object.assign({}, options, { loading: true, patients: [], initialState: { focused: false } })); }
  win.VildaPatientsList = Object.freeze({ create, createLoading });
})(typeof window !== 'undefined' ? window : null);
