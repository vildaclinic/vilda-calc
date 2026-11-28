/* Local ICD-10 catalogue picker. Search text is transient; only an explicit
 * choice (or clearing the field) changes the hidden, submitted code. */
(function (w) {
  'use strict';
  if (!w || w.VildaICD10Picker) return;
  var serial = 0, catalogue = null;
  function getCatalogue() {
    if (!catalogue && w.VildaICD10Search && w.VildaICD10PLData) catalogue = w.VildaICD10Search.create(w.VildaICD10PLData);
    return catalogue;
  }
  function mount(options) {
    var host = options.host, d = host.ownerDocument, nameInput = options.nameInput, compact = options.compact === true;
    var abort = new w.AbortController(), disposed = false, working = false, rows = [], choices = [], active = -1, selectedEntry = null, catalogueChoice = null, lastAutomaticName = null;
    var engine = getCatalogue(), id = 'vpt-icd10-' + (++serial);
    function node(tag, cls, text) {
      var element = d.createElement(tag);
      if (cls) element.className = cls;
      if (text != null) element.textContent = text;
      return element;
    }
    var label = node('label', '', 'Kod ICD-10 · opcjonalnie'); label.htmlFor = id;
    var query = node('input', 'vpt-icd10-query'); query.id = id; query.type = 'text'; query.maxLength = 256; query.autocomplete = 'off'; query.spellcheck = false;
    query.placeholder = 'Szukaj kodu lub polskiej nazwy';
    query.setAttribute('role', 'combobox'); query.setAttribute('aria-autocomplete', 'list'); query.setAttribute('aria-expanded', 'false'); query.setAttribute('aria-controls', id + '-list');
    var code = node('input'); code.type = 'hidden'; code.name = 'code'; code.value = options.code || ''; query.value = code.value;
    var help = node('p', 'vpt-icd10-help', compact ? 'Wybierz podpowiedź lub zatwierdź kod ręczny.'
      : 'Wybierz podpowiedź albo zatwierdź wpis jako kod ręczny. Pole możesz pozostawić puste.'); help.id = id + '-help';
    query.setAttribute('aria-describedby', help.id);
    var live = node('p', 'vpt-icd10-status'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    var popup = node('div', 'vpt-icd10-list'); popup.id = id + '-list'; popup.hidden = true; popup.setAttribute('role', 'listbox'); popup.setAttribute('aria-label', 'Kody ICD-10');
    var selected = node('div', 'vpt-icd10-selected'); selected.hidden = true;
    var officialName = node('p', 'vpt-icd10-official'), parent = node('p', 'vpt-icd10-parent');
    var useName = node('button', 'vpt-button vpt-text vpt-icd10-use-name', 'Użyj nazwy z katalogu'); useName.type = 'button';
    selected.append(officialName, parent, useName);
    host.classList.add('vpt-field', 'vpt-icd10'); host.append(label, query, code, help, popup, live, selected);
    if (!compact) host.appendChild(node('p', 'vpt-icd10-source', 'Polski katalog ICD-10 · Centrum e-Zdrowia · 31.03.2021'));
    function current() { return !disposed && !working && options.isCurrent() === true; }
    function pending() { return query.value.trim() !== code.value; }
    function close() {
      if (disposed) return;
      popup.hidden = true; query.setAttribute('aria-expanded', 'false'); query.removeAttribute('aria-activedescendant'); active = -1;
      rows.forEach(function (row) { row.setAttribute('aria-selected', 'false'); });
    }
    function validate() {
      var unresolved = pending();
      query.setCustomValidity(unresolved ? 'Wybierz kod z katalogu albo zatwierdź wpis jako kod ręczny. Możesz też wyczyścić pole.' : '');
      if (!unresolved) query.removeAttribute('aria-invalid');
    }
    function showSelected() {
      selectedEntry = engine && code.value ? engine.lookup(code.value) : null;
      officialName.textContent = selectedEntry ? selectedEntry.code + ' — ' + selectedEntry.name : 'Kod ręczny: ' + code.value;
      parent.textContent = selectedEntry && selectedEntry.parentName ? 'Kategoria: ' + selectedEntry.parentCode + ' — ' + selectedEntry.parentName : '';
      parent.hidden = !parent.textContent;
      useName.hidden = !selectedEntry || nameInput.value === selectedEntry.name;
      selected.hidden = compact ? useName.hidden : !code.value;
    }
    function commit(entry, manual, restoreFocus) {
      if (!current()) return false;
      var beforeCode = code.value, beforeName = nameInput.value, beforeChoice = catalogueChoice?.code;
      catalogueChoice = manual == null ? entry : null;
      code.value = manual == null ? entry.code : manual;
      query.value = code.value;
      if (entry && (!beforeName.trim() || lastAutomaticName !== null && beforeName === lastAutomaticName)) {
        nameInput.value = entry.name; lastAutomaticName = entry.name;
      }
      close(); validate(); showSelected();
      live.textContent = manual == null ? 'Wybrano ' + entry.code + ' — ' + entry.name + '.' : 'Zatwierdzono kod ręczny: ' + manual + '.';
      if (beforeCode !== code.value || beforeName !== nameInput.value || beforeChoice !== catalogueChoice?.code) options.onCommit();
      if (restoreFocus !== false) query.focus({ preventScroll: true });
      return true;
    }
    function addRow(entry, manual) {
      var row = node('button', 'vpt-button vpt-text vpt-icd10-option'); row.type = 'button'; row.tabIndex = -1; row.id = id + '-option-' + rows.length;
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false');
      if (entry) {
        row.dataset.icd10Code = entry.code;
        row.append(node('strong', 'vpt-icd10-option-name', entry.code + ' — ' + entry.name));
        if (entry.parentName) row.append(node('span', 'vpt-icd10-parent', 'Kategoria: ' + entry.parentCode + ' — ' + entry.parentName));
      } else {
        row.dataset.icd10Manual = 'true'; row.append(node('span', 'vpt-icd10-option-name', 'Użyj wpisu „' + manual + '” jako kodu ręcznego'));
      }
      popup.appendChild(row); rows.push(row); choices.push({ entry: entry, manual: manual });
    }
    function render() {
      if (!current()) return;
      var value = query.value.trim();
      close(); popup.replaceChildren(); rows = []; choices = [];
      if (!value) { live.textContent = ''; return; }
      var result = engine ? engine.search(value, { limit: 12 }) : { items: [], total: 0 };
      result.items.forEach(function (entry) { addRow(entry, null); });
      if (value.length <= 24) addRow(null, value);
      live.textContent = result.total ? (result.total > result.items.length ? 'Znaleziono ' + result.total + ' kodów. Pokazano ' + result.items.length + '. Dopisz więcej znaków, aby zawęzić listę.' : 'Znaleziono kodów: ' + result.total + '.') : 'Brak kodu w tym wydaniu katalogu. Możesz zatwierdzić kod ręcznie.';
      if (value.length > 24) live.textContent += ' Kod ręczny może mieć najwyżej 24 znaki.';
      if (!rows.length) popup.appendChild(node('p', 'vpt-icd10-empty', 'Brak pasujących kodów. Zmień lub skróć wyszukiwanie.'));
      popup.hidden = false; query.setAttribute('aria-expanded', 'true');
    }
    function activate(index) {
      if (!current() || popup.hidden || !rows.length) return;
      active = Math.max(0, Math.min(index, rows.length - 1));
      rows.forEach(function (row, position) { row.setAttribute('aria-selected', String(position === active)); });
      var row = rows[active]; query.setAttribute('aria-activedescendant', row.id);
      var bounds = popup.getBoundingClientRect(), rect = row.getBoundingClientRect();
      if (rect.top < bounds.top) popup.scrollTop += rect.top - bounds.top;
      else if (rect.bottom > bounds.bottom) popup.scrollTop += rect.bottom - bounds.bottom;
    }
    query.addEventListener('click', render, { signal: abort.signal });
    popup.addEventListener('pointerdown', function (event) {
      if (current() && event.pointerType === 'mouse' && rows.some(function (row) { return row.contains(event.target); })) event.preventDefault();
    }, { signal: abort.signal });
    popup.addEventListener('click', function (event) {
      if (!current()) return;
      var index = rows.findIndex(function (row) { return row.contains(event.target); });
      if (index >= 0) commit(choices[index].entry, choices[index].manual);
    }, { signal: abort.signal });
    query.addEventListener('invalid', function () { if (current()) query.setAttribute('aria-invalid', 'true'); }, { signal: abort.signal });
    host.addEventListener('keydown', function (event) {
      if (!current() || event.isComposing) return;
      if (event.key === 'Escape' && !popup.hidden) { event.preventDefault(); event.stopPropagation(); close(); query.focus({ preventScroll: true }); }
      else if (event.key === 'Tab') close();
      else if (event.target === query && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault(); if (popup.hidden) render();
        activate(active < 0 ? event.key === 'ArrowDown' ? 0 : rows.length - 1 : active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.target === query && event.key === 'Enter') {
        // A query is never a form submission, and no first result is implicit.
        event.preventDefault(); if (!popup.hidden && active >= 0) rows[active].click();
      }
    }, { signal: abort.signal });
    host.addEventListener('focusout', function (event) { if (current() && event.relatedTarget && !host.contains(event.relatedTarget)) close(); }, { signal: abort.signal });
    d.addEventListener('pointerdown', function (event) { if (current() && !host.contains(event.target)) close(); }, { capture: true, signal: abort.signal });
    useName.addEventListener('click', function () {
      if (!current() || !selectedEntry) return;
      if (nameInput.value !== selectedEntry.name) { nameInput.value = selectedEntry.name; lastAutomaticName = selectedEntry.name; options.onCommit(); }
      showSelected(); live.textContent = 'Użyto nazwy z katalogu.';
      if (compact) query.focus({ preventScroll: true });
    }, { signal: abort.signal });
    showSelected(); validate();
    return {
      handleInput: function (event) {
        if (disposed) return false;
        if (event.target === nameInput) { if (current()) showSelected(); return false; }
        if (event.target !== query) return false;
        if (!current()) return true;
        if (!query.value.trim()) {
          var changed = !!code.value; code.value = ''; query.value = ''; catalogueChoice = null; showSelected();
          if (changed) options.onCommit();
        }
        validate();
        // Blur can dispatch change between another control's pointerdown and
        // click. Reopening the in-flow list here would move that click target.
        if (!event.type || event.type === 'input') render();
        return true;
      },
      getCommittedCode: function () { return disposed || pending() ? null : code.value; },
      getCatalogueSelection: function () { return !disposed && !pending() && catalogueChoice ? { code: catalogueChoice.code, name: catalogueChoice.name } : null; },
      commitCatalogueSelection: function (choice) {
        var entry = engine?.lookup(choice?.code);
        return !!entry && entry.code === choice.code && entry.name === choice.name && commit(entry, null, false);
      },
      setWorking: function (value) { if (disposed) return; working = !!value; if (working) close(); },
      destroy: function () {
        if (disposed) return;
        close(); abort.abort(); query.setCustomValidity(''); query.value = ''; code.value = ''; live.textContent = ''; officialName.textContent = ''; parent.textContent = '';
        popup.replaceChildren(); disposed = true; rows = []; choices = []; selectedEntry = null; catalogueChoice = null; lastAutomaticName = null; options = null; nameInput = null; host = null; query = null; code = null;
      }
    };
  }
  function mountDiagnosisField(options) {
    const host = options.host, d = host.ownerDocument;
    const catalogueOnly = options.catalogueOnly === true;
    const id = 'vpt-intake-diagnosis-' + (++serial);
    let selection = null, candidate = null, disposed = false, unsubscribe = null;
    function node(tag, className, text) {
      const element = d.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function button(text, className) {
      const element = node('button', className, text);
      element.type = 'button';
      return element;
    }
    const field = node(catalogueOnly ? 'div' : 'section', 'vpt-optional-diagnosis');
    const row = node('div', 'vpt-optional-diagnosis-row');
    const summary = node('div', 'vpt-optional-diagnosis-summary');
    const label = node('strong', '', 'Rozpoznanie');
    label.id = id;
    const optional = node('small', '', 'opcjonalnie');
    const value = node('p', 'vpt-optional-diagnosis-value');
    value.setAttribute('aria-live', 'polite');
    const pick = button('Wybierz z ICD-10', 'vpt-intake-diagnosis-button');
    pick.setAttribute('aria-haspopup', 'dialog');
    const notice = node('p', 'vpt-optional-diagnosis-note');
    if (catalogueOnly) {
      field.classList.add('vpt-icd-catalogue-launcher');
      field.append(pick);
    } else {
      field.setAttribute('aria-labelledby', id);
      summary.append(label, ' ', optional, value);
      row.append(summary, pick);
      field.append(row, notice);
    }
    host.append(field);

    const dialog = node('dialog', 'vpt-intake-diagnosis-dialog');
    dialog.id = id + '-dialog';
    pick.setAttribute('aria-controls', dialog.id);
    const heading = node('header', 'vpt-intake-diagnosis-heading');
    const intro = node('div');
    const title = node('h2', '', 'Wybierz rozpoznanie');
    title.id = id + '-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const context = node('p', 'vpt-optional-diagnosis-note', options.context || '');
    context.hidden = !options.context;
    if (options.context) {
      context.id = id + '-context';
      dialog.setAttribute('aria-describedby', context.id);
    }
    intro.append(title, context);
    const x = button('×', 'vpt-intake-diagnosis-button vpt-intake-diagnosis-close');
    x.setAttribute('aria-label', 'Zamknij wybór rozpoznania');
    x.autofocus = true;
    heading.append(intro, x);
    const body = node('div', 'vpt-intake-diagnosis-body');
    const catalogueView = node('div', 'vpt-intake-diagnosis-search');
    const queryLabel = node('label', '', 'Kod ICD-10 lub nazwa');
    const query = node('input');
    query.type = 'search'; query.id = id + '-query'; queryLabel.htmlFor = query.id;
    query.autocomplete = 'off'; query.maxLength = 256; query.spellcheck = false;
    query.placeholder = 'Wpisz kod lub nazwę rozpoznania';
    const searchField = node('div', 'vpt-icd-search-field');
    const clearSearch = button('×', 'vpt-icd-search-clear');
    clearSearch.setAttribute('aria-label', 'Wyczyść wyszukiwanie');
    searchField.append(query, clearSearch);
    const results = node('section', 'vpt-icd-favorites');
    const listHeading = node('div', 'vpt-icd-favorites-heading');
    const listTitle = node('h3', '', 'Ulubione');
    listTitle.id = id + '-list-title';
    const back = button('Pokaż ulubione', 'vpt-icd-favorites-back');
    listHeading.append(listTitle, back);
    const catalogueStatus = node('p', 'vpt-icd-favorites-empty');
    const list = node('ul', 'vpt-diagnosis-catalog');
    list.setAttribute('aria-labelledby', listTitle.id);
    const limit = node('p', 'vpt-icd-favorites-limit', 'Zawęź wyszukiwanie, aby zobaczyć kolejne dopasowania.');
    const favoriteError = node('p', 'vpt-icd-favorite-error');
    favoriteError.setAttribute('role', 'alert');
    favoriteError.hidden = true;
    const announcement = node('p', 'vpt-icd-favorite-announcement');
    announcement.setAttribute('role', 'status');
    results.append(listHeading, list, catalogueStatus, limit);
    catalogueView.append(queryLabel, searchField, favoriteError, results);

    const selected = node('div', 'vpt-intake-diagnosis-selected');
    const selectedCopy = node('div');
    const selectedName = node('p');
    selectedCopy.append(node('strong', '', 'Wybrane rozpoznanie'), selectedName);
    const change = button('Zmień', 'vpt-intake-diagnosis-button');
    selected.append(selectedCopy, change);
    const selectedNotice = node('p', 'vpt-optional-diagnosis-note');
    selectedNotice.setAttribute('role', 'status');
    body.append(catalogueView, selected, selectedNotice);

    const footer = node('footer', 'vpt-intake-diagnosis-actions');
    const remove = button('Usuń wybór', 'vpt-intake-diagnosis-button vpt-intake-diagnosis-remove');
    const cancel = button('Anuluj', 'vpt-intake-diagnosis-button');
    const apply = button('Dodaj do formularza', 'vpt-intake-diagnosis-button vpt-intake-diagnosis-apply');
    footer.append(remove, cancel, apply);
    dialog.append(heading, body, footer, announcement);
    d.body.append(dialog);

    function current() { return !disposed && options.isCurrent() === true; }
    function copy(choice) { return choice ? { code: choice.code, name: choice.name } : null; }
    function format(choice) { return choice ? choice.code + ' · ' + choice.name : ''; }
    function showNotice(element, choice) {
      const applies = !!(options.notice && w.VildaDsSource?.canonicalDiagnosisCode?.(choice?.code));
      element.textContent = applies ? options.notice : '';
      element.hidden = !applies;
    }
    function renderField() {
      if (catalogueOnly) return;
      value.textContent = format(selection);
      value.hidden = !selection;
      optional.hidden = !!selection;
      pick.textContent = selection ? 'Zmień rozpoznanie' : 'Wybierz z ICD-10';
      showNotice(notice, selection);
    }
    function renderEditor() {
      catalogueView.hidden = !!candidate;
      selected.hidden = !candidate;
      selectedName.textContent = format(candidate);
      showNotice(selectedNotice, candidate);
      remove.hidden = catalogueOnly || !selection;
      apply.disabled = !candidate;
    }
    function renderCatalogue() {
      if (!current()) return;
      const text = query.value.trim();
      const engine = getCatalogue();
      const favorites = w.VildaICD10Favorites;
      const available = !!(engine && favorites?.canUse());
      const codes = new Set(available ? favorites.getCodes(engine) : []);
      const result = text && engine ? engine.search(text, { limit: 12 }) : null;
      const entries = result ? result.items : Array.from(codes, code => engine.lookup(code)).filter(Boolean);
      const focused = list.contains(d.activeElement) ? d.activeElement : null;
      const previousIndex = focused ? Array.from(list.children).indexOf(focused.closest('li')) : -1;
      const previousScroll = list.scrollTop;
      listTitle.textContent = text ? 'Wyniki wyszukiwania' : 'Ulubione';
      clearSearch.hidden = back.hidden = !text;
      catalogueStatus.hidden = false;
      if (!engine) catalogueStatus.textContent = 'Katalog ICD-10 jest chwilowo niedostępny.';
      else if (entries.length) catalogueStatus.hidden = true;
      else if (text) catalogueStatus.textContent = 'Brak wyników. Spróbuj wpisać inny kod lub nazwę.';
      else catalogueStatus.textContent = available ? 'Brak ulubionych rozpoznań. Użyj gwiazdki przy kodzie w wynikach wyszukiwania.'
        : 'Ulubione są dostępne po odblokowaniu konta.';
      list.hidden = !entries.length;
      limit.hidden = !result || result.total <= entries.length;
      list.replaceChildren(...entries.map(function (entry) {
        const item = node('li', 'vpt-icd-result-row');
        const option = button('', 'vpt-intake-diagnosis-option');
        option.dataset.icd10Code = entry.code;
        option.append(node('strong', '', entry.code), ' ', node('span', '', entry.name));
        option.onclick = function () {
          if (!current() || !dialog.open || !list.contains(option)) return;
          candidate = copy(entry);
          renderEditor();
          apply.focus({ preventScroll: true });
        };
        item.append(option);
        if (available) {
          const star = button('', 'vpt-icd-favorite-toggle');
          const icon = node('span', 'vpt-icd-favorite-icon');
          icon.setAttribute('aria-hidden', 'true');
          star.dataset.icd10FavoriteCode = entry.code;
          star.setAttribute('aria-label', 'Ulubione, ' + entry.code + ' ' + entry.name);
          star.setAttribute('aria-pressed', String(codes.has(entry.code)));
          star.title = codes.has(entry.code) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych';
          star.append(icon);
          star.onclick = function () {
            if (!current() || !dialog.open || !list.contains(star)) return;
            const updated = favorites.toggle(entry.code, engine, () => current() && dialog.open);
            if (!current() || !dialog.open) return;
            favoriteError.hidden = !!updated;
            favoriteError.textContent = updated ? '' : 'Nie udało się zapisać ulubionych. Spróbuj ponownie.';
            if (updated) announcement.textContent = (updated.includes(entry.code) ? 'Dodano do ulubionych: ' : 'Usunięto z ulubionych: ') + entry.code;
          };
          item.append(star);
        }
        return item;
      }));
      list.scrollTop = previousScroll;
      if (focused) {
        const key = focused.dataset.icd10FavoriteCode ? 'icd10FavoriteCode' : 'icd10Code';
        const selector = key === 'icd10FavoriteCode' ? '[data-icd10-favorite-code]' : '[data-icd10-code]';
        const buttons = Array.from(list.querySelectorAll(selector));
        const match = buttons.find(option => option.dataset[key] === focused.dataset[key]);
        const next = match || buttons[Math.min(previousIndex, buttons.length - 1)] || query;
        next.focus({ preventScroll: true });
        if (next !== query) {
          const row = next.getBoundingClientRect(), bounds = list.getBoundingClientRect();
          if (row.top < bounds.top) list.scrollTop += row.top - bounds.top;
          else if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
        }
      }
    }
    function select(choice) {
      selection = copy(choice);
      renderField();
      options.onChange?.(copy(selection));
    }
    function close() {
      if (!dialog.open) return false;
      unsubscribe?.(); unsubscribe = null;
      dialog.close();
      return true;
    }
    pick.onclick = function () {
      const owner = catalogueOnly ? host.closest('dialog[open]') : null;
      const parentOwner = catalogueOnly ? options.ownerDialog?.() : null;
      if (!current() || Array.from(d.querySelectorAll('dialog[open]')).some(open => open !== owner && open !== parentOwner)) return;
      unsubscribe?.(); unsubscribe = null;
      candidate = null;
      query.value = '';
      renderCatalogue(); renderEditor();
      dialog.showModal();
      unsubscribe = w.VildaICD10Favorites?.subscribe(function () {
        if (!dialog.open) return;
        if (!current()) { close(); return; }
        if (!candidate) renderCatalogue();
      });
    };
    function handleInput(event) {
      if (event.target !== query || disposed) return false;
      if (current() && dialog.open && event.type === 'input') {
        list.scrollTop = 0;
        favoriteError.hidden = true;
        renderCatalogue();
      }
      return true;
    }
    query.addEventListener('input', handleInput);
    query.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.isComposing) event.preventDefault(); });
    back.onclick = clearSearch.onclick = function () {
      if (!current() || !dialog.open) return;
      query.value = '';
      query.focus({ preventScroll: true });
      list.scrollTop = 0;
      favoriteError.hidden = true;
      renderCatalogue();
    };
    x.onclick = cancel.onclick = close;
    change.onclick = function () {
      if (!current() || !dialog.open) return;
      candidate = null;
      renderCatalogue(); renderEditor();
      query.focus();
    };
    remove.onclick = function () { if (current() && dialog.open && !catalogueOnly) { select(null); close(); } };
    apply.onclick = function () { if (current() && dialog.open && candidate) { select(candidate); close(); } };
    dialog.addEventListener('close', function () {
      if (dialog.open) return;
      unsubscribe?.(); unsubscribe = null;
      candidate = null;
      query.value = '';
      list.replaceChildren();
      favoriteError.hidden = true;
      announcement.textContent = '';
      if (current() && !pick.disabled) pick.focus({ preventScroll: true });
    });
    renderField();
    return {
      element: field,
      getSelection: function () { return copy(selection); },
      handleInput: handleInput,
      reset: function () { close(); if (selection) select(null); },
      setDisabled: function (value) { pick.disabled = !!value; if (value) close(); },
      isOpen: function () { return dialog.open; },
      close: close,
      dispose: function () { disposed = true; selection = candidate = null; unsubscribe?.(); unsubscribe = null; close(); field.remove(); dialog.remove(); }
    };
  }
  async function persistDiagnosis({ vault, patientId, diagnosis, id, dateISO, visitContext, isCurrent }) {
    const model = w.VildaPatientTreatmentModel;
    const entry = getCatalogue()?.lookup(diagnosis?.code);
    if (!model || !entry || entry.code !== diagnosis.code || entry.name !== diagnosis.name) {
      throw new Error('Wybierz rozpoznanie z katalogu ICD-10.');
    }
    const userId = vault.getCurrentUser()?.userId;
    const session = vault.captureSyncOperationSession();
    function current() {
      return !!userId && w.VildaVault === vault && vault.isUnlocked() && vault.getCurrentUser()?.userId === userId
        && vault.assertSyncOperationSession(session) === true && isCurrent() === true;
    }
    function check() {
      if (!current()) throw new Error('Kontekst pacjenta się zmienił. Otwórz kartę ponownie.');
    }
    check();
    const patient = await vault.getPatient(patientId);
    check();
    if (patient?.patientId !== patientId) throw new Error('Nie można potwierdzić kartoteki pacjenta.');
    const treatmentContext = model.normalize({ schemaVersion: 1, kind: 'diagnosis', name: entry.name,
      code: entry.code, codingSystem: 'ICD-10', status: 'active', dateISO });
    const { title, body, category, clinicalDateISO } = model.describe(treatmentContext);
    const note = { id, patientId, title, body, category, linkedAgeMonths: null, clinicalDateISO, treatmentContext };
    if (visitContext) {
      note.visitContext = { version: visitContext.version, visitId: visitContext.visitId, clinicalDateISO: visitContext.clinicalDateISO };
    }
    const saved = await vault.savePatientNoteOnce(note, { isCurrent: current, requireActiveVisit: !!visitContext });
    check();
    if (saved?.saved !== true || saved.id !== id) throw new Error('Nie udało się zapisać rozpoznania.');
    const stored = await vault.getPatientNote(id);
    check();
    if (stored?.id !== id || stored.patientId !== patientId
      || JSON.stringify(model.decode(stored).context) !== JSON.stringify(treatmentContext)
      || (visitContext && (stored.visitContext?.visitId !== note.visitContext.visitId
        || stored.visitContext.clinicalDateISO !== note.visitContext.clinicalDateISO))) {
      throw new Error('Nie można potwierdzić zapisanego rozpoznania.');
    }
    return { code: entry.code, name: entry.name };
  }
  w.VildaICD10Picker = Object.freeze({ mount: mount, mountDiagnosisField: mountDiagnosisField, persistDiagnosis: persistDiagnosis });
})(typeof window !== 'undefined' ? window : globalThis);
