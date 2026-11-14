/* Historia wizyt: read-only view of canonical, encrypted visit snapshots.
 * Selecting a visit never loads it into the clinical form or restores a revision.
 */
(function (w) {
  'use strict';
  if (w.VildaVisitHistory) return;
  var d = w.document, active = null, watchedVaults = new WeakSet(), serial = 0;

  function element(tag, className, value) {
    var node = d.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function text(value) {
    return typeof value === 'string' || (typeof value === 'number' && isFinite(value)) ? String(value).trim() : '';
  }
  function civilDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text(value));
    if (!m) return '';
    var date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (date.getUTCFullYear() !== Number(m[1]) || date.getUTCMonth() !== Number(m[2]) - 1 || date.getUTCDate() !== Number(m[3])) return '';
    return m[3] + '.' + m[2] + '.' + m[1];
  }
  function savedTime(value) {
    var date = new Date(value);
    return isFinite(date.getTime()) ? date.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : 'Nie zapisano';
  }
  function age(user) {
    var years = text(user.age), months = text(user.ageMonths), weeks = text(user.ageWeeks), parts = [];
    if (weeks !== '') return weeks + ' tyg.';
    if (years !== '') parts.push(years + ' lat');
    if (months !== '' && (Number(months) !== 0 || years === '')) parts.push(months + ' mies.');
    return parts.join(' ') || 'Nie zapisano';
  }
  function measurement(value, unit) {
    var raw = text(value);
    return raw ? raw.replace('.', ',') + ' ' + unit : 'Nie zapisano';
  }
  function sameOwner(state) {
    try {
      if (!state.vault.isUnlocked() || w.VildaVault !== state.vault) return false;
      var owner = state.vault.getCurrentUser();
      if (!owner || owner.userId !== state.userId) return false;
      state.vault.assertSyncOperationSession(state.token);
      return !state.options.isCurrent || state.options.isCurrent();
    } catch (_) { return false; }
  }
  function current(state) {
    return active === state && !state.closed && sameOwner(state);
  }
  function close(state, restoreFocus) {
    state = state || active;
    if (!state || state.closed) return;
    var canRestore = restoreFocus !== false && sameOwner(state);
    state.closed = true;
    state.rows = [];
    state.request += 1;
    if (active === state) active = null;
    if (state.timer) w.clearInterval(state.timer);
    d.removeEventListener('keydown', state.keyHandler, true);
    d.removeEventListener('focusin', state.scopeHandler, true);
    d.removeEventListener('pointerdown', state.scopeHandler, true);
    d.removeEventListener('vilda:user-state-cleared', state.clearHandler);
    d.removeEventListener('vilda:data-applied', state.scopeHandler);
    if (typeof state.dialog.close === 'function' && state.dialog.open) state.dialog.close();
    if (state.detail) state.detail.textContent = '';
    if (state.list) state.list.textContent = '';
    if (state.announcement) state.announcement.textContent = '';
    state.dialog.textContent = '';
    state.dialog.remove();
    if (canRestore && state.opener && state.opener.isConnected && typeof state.opener.focus === 'function') state.opener.focus();
    if (typeof state.options.onClose === 'function') state.options.onClose();
  }
  function scopeCheck(state) {
    if (current(state)) return true;
    close(state, false);
    return false;
  }
  function field(grid, label, value) {
    var item = element('div', 'vvisit-field');
    item.appendChild(element('dt', '', label));
    item.appendChild(element('dd', '', value));
    grid.appendChild(item);
  }
  function showDetail(state, index) {
    if (!scopeCheck(state)) return;
    var row = state.rows[index];
    if (!row) return;
    state.selected = index;
    Array.prototype.forEach.call(state.list.querySelectorAll('button'), function (button, i) {
      button.setAttribute('aria-pressed', i === index ? 'true' : 'false');
    });
    var user = row.payload && row.payload.user || {}, advanced = row.payload && row.payload.advanced || {};
    var detail = state.detail;
    detail.textContent = '';
    detail.appendChild(element('p', 'vvisit-eyebrow', 'Zapisany stan wizyty'));
    detail.appendChild(element('h3', 'vvisit-date', civilDate(row.clinicalDateISO) || 'Data wizyty nieznana'));
    if (row.origin === 'legacy-inferred') {
      detail.appendChild(element('p', 'vvisit-origin', 'Wizyta odtworzona z dawnych zapisów'));
      detail.appendChild(element('p', 'vvisit-muted', row.dateSource === 'measuredAt'
        ? 'Wpis utworzono na podstawie zapisanej daty pomiaru. Dawne zapisy nie rozróżniały odrębnych wizyt w tym samym dniu.'
        : 'Użyto daty zapisu danych. Faktyczna data wizyty nie jest potwierdzona. Dawne zapisy nie rozróżniały odrębnych wizyt w tym samym dniu.'));
    }
    var grid = element('dl', 'vvisit-measurements');
    field(grid, 'Wiek w zapisanych danych', age(user));
    field(grid, 'Płeć', user.sex === 'M' ? 'Chłopiec / mężczyzna' : user.sex === 'F' ? 'Dziewczynka / kobieta' : 'Nie zapisano');
    field(grid, 'Wysokość ciała', measurement(user.height, 'cm'));
    field(grid, 'Masa ciała', measurement(user.weight, 'kg'));
    detail.appendChild(grid);
    var extras = element('dl', 'vvisit-additional');
    if (civilDate(user.measuredAtISO)) field(extras, 'Data pomiaru', civilDate(user.measuredAtISO));
    if (text(user.waist)) field(extras, 'Obwód talii', measurement(user.waist, 'cm'));
    if (text(user.hip)) field(extras, 'Obwód bioder', measurement(user.hip, 'cm'));
    if (text(user.tannerStage)) field(extras, 'Zapisany stopień Tannera', text(user.tannerStage));
    if (text(advanced.boneAgeYears)) field(extras, 'Zapisany wiek kostny', measurement(advanced.boneAgeYears, 'lat'));
    if (text(advanced.motherHeight)) field(extras, 'Wzrost matki', measurement(advanced.motherHeight, 'cm'));
    if (text(advanced.fatherHeight)) field(extras, 'Wzrost ojca', measurement(advanced.fatherHeight, 'cm'));
    if (extras.children.length) detail.appendChild(extras);
    var meta = element('div', 'vvisit-save-meta');
    meta.appendChild(element('p', '', 'Ostatni zapis tej wizyty: ' + savedTime(row.updatedAtISO || row.savedAtISO)));
    if (Number.isInteger(row.revisionCount) && row.revisionCount > 1) meta.appendChild(element('p', '', 'Zachowane wersje tej wizyty: ' + row.revisionCount));
    detail.appendChild(meta);
    state.announcement.textContent = 'Wybrana wizyta: ' + (civilDate(row.clinicalDateISO) || 'data nieznana') + '. Wiek: ' + age(user) + '.';
  }
  function showRows(state, rows) {
    // Patient/account checks happen AFTER the asynchronous read. Never paint a
    // response from a replaced session, even if the vault completed its read.
    if (!scopeCheck(state)) return false;
    state.rows = rows.filter(function (row) {
      return row && row.patientId === state.patientId && text(row.visitId) && row.payload && typeof row.payload === 'object';
    });
    state.list.textContent = '';
    state.detail.textContent = '';
    state.body.setAttribute('aria-busy', 'false');
    state.count.textContent = 'Liczba wizyt: ' + state.rows.length;
    if (!state.rows.length) {
      state.detail.appendChild(element('p', 'vvisit-empty', 'Brak zapisanych wizyt tego pacjenta.'));
      state.announcement.textContent = 'Brak zapisanych wizyt.';
      return true;
    }
    var dates = Object.create(null), occurrences = Object.create(null);
    state.rows.forEach(function (row) { var date = text(row.clinicalDateISO); dates[date] = (dates[date] || 0) + 1; });
    state.rows.forEach(function (row, index) {
      var date = text(row.clinicalDateISO), user = row.payload.user || {};
      occurrences[date] = (occurrences[date] || 0) + 1;
      var button = element('button', 'vvisit-visit');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-controls', state.detail.id);
      button.appendChild(element('span', 'vvisit-visit-date', civilDate(date) || 'Data nieznana'));
      button.appendChild(element('span', 'vvisit-visit-age', 'Wiek: ' + age(user)));
      if (dates[date] > 1) button.appendChild(element('span', 'vvisit-visit-context', 'Wpis ' + occurrences[date] + ' z ' + dates[date] + ' tego dnia'));
      if (row.origin === 'legacy-inferred') button.appendChild(element('span', 'vvisit-visit-context', 'Z dawnych zapisów'));
      button.addEventListener('click', function () { showDetail(state, index); });
      state.list.appendChild(button);
    });
    showDetail(state, 0);
    return true;
  }
  async function read(state) {
    if (!scopeCheck(state)) return false;
    var request = ++state.request;
    state.body.setAttribute('aria-busy', 'true');
    state.detail.textContent = '';
    state.detail.appendChild(element('p', 'vvisit-empty', 'Odczytywanie historii wizyt…'));
    try {
      var rows = await state.vault.getPatientVisits(state.patientId);
      if (!scopeCheck(state) || request !== state.request) return false;
      if (!Array.isArray(rows)) throw new Error('Invalid visit list');
      return showRows(state, rows);
    } catch (_) {
      if (!scopeCheck(state) || request !== state.request) return false;
      state.body.setAttribute('aria-busy', 'false');
      state.detail.textContent = '';
      state.detail.appendChild(element('p', 'vvisit-empty', 'Nie udało się odczytać historii wizyt. Spróbuj ponownie.'));
      var retry = element('button', 'vvisit-retry', 'Spróbuj ponownie');
      retry.type = 'button';
      retry.addEventListener('click', function () { read(state); });
      state.detail.appendChild(retry);
      state.announcement.textContent = 'Nie udało się odczytać historii wizyt.';
      return false;
    }
  }
  function open(patientId, options) {
    close();
    options = options || {};
    var vault = w.VildaVault, owner, token;
    try {
      if (!text(patientId) || !vault || !vault.isUnlocked() || typeof vault.getPatientVisits !== 'function') return Promise.resolve(false);
      owner = vault.getCurrentUser();
      if (!owner || !owner.userId) return Promise.resolve(false);
      token = vault.captureSyncOperationSession();
      vault.assertSyncOperationSession(token);
      if (options.isCurrent && !options.isCurrent()) return Promise.resolve(false);
    } catch (_) { return Promise.resolve(false); }
    var id = 'vvisit-' + (++serial), dialog = element('dialog', 'vvisit-dialog');
    dialog.setAttribute('aria-labelledby', id + '-title');
    dialog.setAttribute('aria-describedby', id + '-description');
    var state = { vault: vault, userId: owner.userId, token: token, patientId: patientId, options: options,
      dialog: dialog, opener: d.activeElement, rows: [], request: 0, closed: false };
    active = state;
    // App chrome intentionally styles every <header>; this is local dialog
    // layout, with its accessible title supplied by aria-labelledby above.
    var header = element('div', 'vvisit-header'), heading = element('div', 'vvisit-heading');
    var title = element('h2', '', 'Historia wizyt');
    title.id = id + '-title';
    heading.appendChild(title);
    if (text(options.patientName)) heading.appendChild(element('p', 'vvisit-patient-name', text(options.patientName)));
    header.appendChild(heading);
    var dismiss = element('button', 'vvisit-close', 'Zamknij');
    dismiss.type = 'button';
    dismiss.addEventListener('click', function () { close(state); });
    header.appendChild(dismiss);
    dialog.appendChild(header);
    var description = element('p', 'vvisit-description', 'Wybierz wizytę, aby obejrzeć jej ostatni zapis. Podgląd nie zmienia danych w formularzu.');
    description.id = id + '-description';
    dialog.appendChild(description);
    state.count = element('p', 'vvisit-count', 'Odczytywanie…');
    dialog.appendChild(state.count);
    state.body = element('div', 'vvisit-body');
    state.list = element('nav', 'vvisit-list');
    state.list.setAttribute('aria-label', 'Zapisane wizyty');
    state.detail = element('section', 'vvisit-detail');
    state.detail.id = id + '-detail';
    state.detail.setAttribute('aria-label', 'Podgląd wybranej wizyty');
    state.body.appendChild(state.list);
    state.body.appendChild(state.detail);
    dialog.appendChild(state.body);
    state.announcement = element('p', 'vvisit-sr-only');
    state.announcement.setAttribute('role', 'status');
    state.announcement.setAttribute('aria-live', 'polite');
    dialog.appendChild(state.announcement);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(state); });
    dialog.addEventListener('close', function () { close(state); });
    state.scopeHandler = function () { scopeCheck(state); };
    state.clearHandler = function () { close(state, false); };
    state.keyHandler = function (event) {
      if (!scopeCheck(state)) return;
      if (event.key === 'Escape') { event.preventDefault(); close(state); return; }
      if (event.key !== 'Tab') return;
      var buttons = Array.prototype.filter.call(dialog.querySelectorAll('button'), function (b) { return !b.disabled && !b.hidden; });
      var first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (d.activeElement === first || !dialog.contains(d.activeElement))) { event.preventDefault(); if (last) last.focus(); }
      else if (!event.shiftKey && (d.activeElement === last || !dialog.contains(d.activeElement))) { event.preventDefault(); if (first) first.focus(); }
    };
    d.addEventListener('keydown', state.keyHandler, true);
    d.addEventListener('focusin', state.scopeHandler, true);
    d.addEventListener('pointerdown', state.scopeHandler, true);
    d.addEventListener('vilda:user-state-cleared', state.clearHandler);
    d.addEventListener('vilda:data-applied', state.scopeHandler);
    if (!watchedVaults.has(vault) && typeof vault.onLock === 'function') {
      watchedVaults.add(vault);
      vault.onLock(function () { if (active && active.vault === vault) close(active, false); });
    }
    d.body.appendChild(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); }
    dismiss.focus();
    if (typeof w.setInterval === 'function') state.timer = w.setInterval(function () { scopeCheck(state); }, 250);
    return read(state);
  }
  w.VildaVisitHistory = Object.freeze({ open: open, close: function () { close(); } });
})(typeof window !== 'undefined' ? window : globalThis);
