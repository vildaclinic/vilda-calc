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
    var host = options.host, d = host.ownerDocument, nameInput = options.nameInput;
    var abort = new w.AbortController(), disposed = false, working = false, rows = [], choices = [], active = -1, selectedEntry = null, lastAutomaticName = null;
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
    var help = node('p', 'vpt-icd10-help', 'Wybierz podpowiedź albo zatwierdź wpis jako kod ręczny. Pole możesz pozostawić puste.'); help.id = id + '-help';
    query.setAttribute('aria-describedby', help.id);
    var live = node('p', 'vpt-icd10-status'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    var popup = node('div', 'vpt-icd10-list'); popup.id = id + '-list'; popup.hidden = true; popup.setAttribute('role', 'listbox'); popup.setAttribute('aria-label', 'Kody ICD-10');
    var selected = node('div', 'vpt-icd10-selected'); selected.hidden = true;
    var officialName = node('p', 'vpt-icd10-official'), parent = node('p', 'vpt-icd10-parent');
    var useName = node('button', 'vpt-button vpt-text vpt-icd10-use-name', 'Użyj nazwy z katalogu'); useName.type = 'button';
    selected.append(officialName, parent, useName);
    var source = node('p', 'vpt-icd10-source', 'Polski katalog ICD-10 · Centrum e-Zdrowia · 31.03.2021');
    host.classList.add('vpt-field', 'vpt-icd10'); host.append(label, query, code, help, popup, live, selected, source);
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
      selected.hidden = !code.value;
      officialName.textContent = selectedEntry ? selectedEntry.code + ' — ' + selectedEntry.name : 'Kod ręczny: ' + code.value;
      parent.textContent = selectedEntry && selectedEntry.parentName ? 'Kategoria: ' + selectedEntry.parentCode + ' — ' + selectedEntry.parentName : '';
      parent.hidden = !parent.textContent;
      useName.hidden = !selectedEntry || nameInput.value === selectedEntry.name;
    }
    function commit(entry, manual) {
      if (!current()) return;
      var beforeCode = code.value, beforeName = nameInput.value;
      code.value = manual == null ? entry.code : manual;
      query.value = code.value;
      if (entry && (!beforeName.trim() || lastAutomaticName !== null && beforeName === lastAutomaticName)) {
        nameInput.value = entry.name; lastAutomaticName = entry.name;
      }
      close(); validate(); showSelected();
      live.textContent = manual == null ? 'Wybrano ' + entry.code + ' — ' + entry.name + '.' : 'Zatwierdzono kod ręczny: ' + manual + '.';
      if (beforeCode !== code.value || beforeName !== nameInput.value) options.onCommit();
      query.focus({ preventScroll: true });
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
    }, { signal: abort.signal });
    showSelected(); validate();
    return {
      handleInput: function (event) {
        if (disposed) return false;
        if (event.target === nameInput) { if (current()) showSelected(); return false; }
        if (event.target !== query) return false;
        if (!current()) return true;
        if (!query.value.trim()) {
          var changed = !!code.value; code.value = ''; query.value = ''; showSelected();
          if (changed) options.onCommit();
        }
        validate();
        // Blur can dispatch change between another control's pointerdown and
        // click. Reopening the in-flow list here would move that click target.
        if (!event.type || event.type === 'input') render();
        return true;
      },
      setWorking: function (value) { if (disposed) return; working = !!value; if (working) close(); },
      destroy: function () {
        if (disposed) return;
        close(); abort.abort(); query.setCustomValidity(''); query.value = ''; code.value = ''; live.textContent = ''; officialName.textContent = ''; parent.textContent = '';
        popup.replaceChildren(); disposed = true; rows = []; choices = []; selectedEntry = null; lastAutomaticName = null; options = null; nameInput = null; host = null; query = null; code = null;
      }
    };
  }
  w.VildaICD10Picker = Object.freeze({ mount: mount });
})(typeof window !== 'undefined' ? window : globalThis);
