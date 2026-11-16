/* Opt-in perinatal draft. Native SGA owns all calculations and result HTML.
 * The main form's existing birth carry owns persistence; opening/cancelling
 * does not create a clinical record or change either source of birth data. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomePerinatal) return;
  var d = w.document, started = false, button, status, dialog, draft = null, refreshFrame = 0, savedBirthOwner = null, clearRefreshTimer = null;
  var startupBirthUntouched = true, startupSequence = applySequence();
  // The native importer may keep shared form fields during anonymous startup.
  // Its guarded one-time birth recovery must end before any user edit or Clear.
  function allowsStartupBirthRestore() {
    var allowed = startupBirthUntouched && startupSequence === applySequence()
      && typeof w.vildaBirthData === 'undefined' && patientId() === null;
    startupBirthUntouched = false;
    return allowed;
  }
  ['input', 'change'].forEach(function (name) {
    w.addEventListener(name, function (event) { if (event.isTrusted) startupBirthUntouched = false; }, true);
  });
  w.addEventListener('vilda:user-state-cleared', function () { startupBirthUntouched = false; });
  var fields = [
    ['weeks', 'Ukończone tygodnie ciąży'], ['days', 'Dodatkowe dni'],
    ['weight', 'Masa urodzeniowa · g'], ['length', 'Długość przy urodzeniu · cm'],
    ['head', 'Obwód głowy przy urodzeniu · cm']
  ];
  var labels = { niklasson: 'Niklasson', intergrowth: 'INTERGROWTH-21st', malewski: 'Malewski · PL, masa' };
  function el(tag, cls, text) {
    var node = d.createElement(tag); if (cls) node.className = cls;
    if (text != null) node.textContent = text; return node;
  }
  function clone(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
  function text(value) { return value == null ? '' : String(value); }
  function patientId() { try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; } catch (_) { return null; } }
  function sex() { var field = d.getElementById('sex'); return field ? field.value : ''; }
  function canEdit() {
    try {
      return !!(w.VildaVault && w.VildaVault.isUnlocked() && w.VildaAuthUI && w.VildaAuthUI.isBootReady()
        && w.VildaProAccess && w.VildaProAccess.hasAccess() && !w.__vildaPersistRestoring && !w.__vildaLustroWpis
        && !(w.VildaDataImportExport && w.VildaDataImportExport.isMainSessionRestorePending())
        && !(w.VildaPersistence && (typeof w.VildaPersistence.isAutosaveSuppressed === 'function' && w.VildaPersistence.isAutosaveSuppressed()
          || typeof w.VildaPersistence.isClearInProgress === 'function' && w.VildaPersistence.isClearInProgress()))
        && !(Number(w.__vildaPersistClearUntil || 0) > Date.now())
        && !(w.VildaPanelPacjent && w.VildaPanelPacjent.nieaktualny()));
    } catch (_) { return false; }
  }
  function snapshot() {
    if (!canEdit()) return null;
    var vault = w.VildaVault, user = vault.getCurrentUser(), measured = w.VildaDobAge ? w.VildaDobAge.readMeasuredAtISO() : null;
    return { account: user && user.userId, patientId: patientId(), sex: sex(), loadSequence: applySequence(),
      birth: clone(w.vildaBirthData), perinatal: clone(w.lastLoadedData && w.lastLoadedData.perinatal),
      visit: w.VildaVisitContext ? w.VildaVisitContext.capture({ user: { measuredAtISO: measured } },
        { patientId: patientId(), readOnly: true }) : null };
  }
  function scope(value) { return value && JSON.stringify([value.account, value.patientId, value.sex, value.visit]); }
  function applySequence() { return w.VildaDataImportExport.getApplyLoadedDataSequence(); }
  // The main page normally carries birth data without owning an editor. Only
  // an explicit Save in this modal grants ownership, bound to this exact value,
  // patient/visit, load generation and unlocked vault session. A later global
  // assignment must not acquire the same right to overwrite a carried record.
  function ownsCurrentBirth() {
    var owner = savedBirthOwner;
    if (!owner || w.VildaVault !== owner.vault) return false;
    try {
      if (owner.token != null) owner.vault.assertSyncOperationSession(owner.token);
      return applySequence() === owner.sequence && scope(snapshot()) === owner.scope
        && JSON.stringify(w.vildaBirthData) === owner.value;
    } catch (_) { return false; }
  }
  function stillOwned() {
    if (!draft || w.VildaVault !== draft.vault) return false;
    try {
      if (draft.token != null) draft.vault.assertSyncOperationSession(draft.token);
      return JSON.stringify(snapshot()) === draft.fingerprint;
    } catch (_) { return false; }
  }
  function initialState(value) {
    var perinatal = w.VildaPerinatalSource && w.VildaPerinatalSource.naKarte(value.perinatal, value.sex);
    // An explicitly saved empty birth carry stays empty on reopen. Perinatal
    // prefills only a previously absent SGA carry, without modifying its record.
    var source = value.birth || perinatal;
    var requested = source && (source.sourceKeys || (source.sourceChoice === 'compare'
      ? w.VildaSgaBirth.SOURCE_KEYS : [source.sourceChoice || 'niklasson'])) || ['niklasson'];
    var sources = w.VildaSgaBirth.SOURCE_KEYS.filter(function (key) { return requested.indexOf(key) >= 0; });
    if (!sources.length) sources = ['niklasson'];
    var state = { sourceKeys: sources, sourceChoice: sources.length > 1 ? 'compare' : sources[0],
      sex: value.sex === 'M' ? 'male' : value.sex === 'F' ? 'female' : '' };
    fields.forEach(function (entry) { state[entry[0]] = source ? text(source[entry[0]]) : entry[0] === 'days' ? '0' : ''; });
    return state;
  }
  function present(state) { return ['weeks', 'weight', 'length', 'head'].some(function (key) { return text(state[key]).trim() !== ''; }); }
  function evaluation(state) {
    if (!present(state)) return { status: 'empty', view: null };
    var view = w.VildaSgaBirth.evaluatePresentation(state);
    var saved = !view.error && w.VildaBirthAssessment.create(Object.assign({}, state, { hasComputed: true }),
      view.models, undefined, view.notes);
    return { status: saved ? 'complete' : 'partial', view: view };
  }
  function refresh() {
    refreshFrame = 0; if (!started) return;
    w.clearTimeout(clearRefreshTimer); clearRefreshTimer = null;
    var current = snapshot(), value = current ? evaluation(initialState(current)).status : 'empty';
    status.textContent = { empty: 'Nie uzupełniono', partial: 'Częściowe dane', complete: 'Uzupełnione' }[value];
    button.disabled = !current; button.dataset.birthStatus = value;
    button.setAttribute('aria-expanded', String(!!(dialog && dialog.open)));
    // Native Clear suppresses editing for its existing timed window. Refresh
    // once that actual boundary expires, even when the blank form emits no
    // further input or summary event. No persistence guard is shortened.
    var until = Number(w.__vildaPersistClearUntil || 0);
    if (!current && until > Date.now()) clearRefreshTimer = w.setTimeout(schedule, until - Date.now() + 1);
  }
  function schedule() { if (!refreshFrame) refreshFrame = w.requestAnimationFrame(refresh); }
  function close(force, restoreFocus, fromHistory) {
    if (!dialog || !dialog.open) return true;
    if (!force && draft && draft.dirty && !w.confirm('Odrzucić niezapisane zmiany danych okołoporodowych?')) return false;
    var previous = draft; draft = null;
    if (previous) { w.clearInterval(previous.timer); w.clearTimeout(previous.previewTimer); }
    dialog.close(); dialog.removeAttribute('aria-modal'); dialog.querySelector('.vhome-dialog-body').replaceChildren();
    button.setAttribute('aria-expanded', 'false');
    if (!fromHistory && previous && w.history.state && w.history.state.vildaHomeDialog === previous.historyToken) w.history.back();
    if (!force || restoreFocus) button.focus({ preventScroll: true });
    return true;
  }
  function showPreview() {
    if (!draft || !stillOwned()) { close(true); return; }
    var result = evaluation(draft.values), host = dialog.querySelector('[data-home-birth-results]');
    var message = dialog.querySelector('[data-home-birth-status]');
    message.dataset.birthStatus = result.status;
    message.textContent = result.status === 'empty' ? 'Wpisz dane urodzeniowe, aby zobaczyć wynik SGA.'
      : result.view.error || 'Wyniki aktualizowane automatycznie.';
    host.hidden = !result.view || !!result.view.error;
    if (host.hidden) host.replaceChildren();
    else w.VildaHtml.setTrustedHtml(host, result.view.html, { context: 'sga-birth:resultsEl' });
  }
  function captureInput(event) {
    if (!dialog || !dialog.open || !dialog.contains(event.target)) return;
    event.stopImmediatePropagation();
    if (!draft || !stillOwned()) { close(true); return; }
    var target = event.target, field = target.getAttribute('data-home-birth-field');
    if (field) draft.values[field] = target.value;
    else if (target.hasAttribute('data-home-birth-source')) {
      var selected = Array.from(dialog.querySelectorAll('[data-home-birth-source]:checked')).map(function (input) { return input.value; });
      if (!selected.length) { target.checked = true; return; }
      draft.values.sourceKeys = selected; draft.values.sourceChoice = selected.length > 1 ? 'compare' : selected[0];
    } else return;
    draft.dirty = true; w.clearTimeout(draft.previewTimer); draft.previewTimer = w.setTimeout(showPreview, 220);
  }
  function apply() {
    if (!stillOwned()) { close(true); return; }
    var current = draft, base = current.base, values = clone(current.values), view = evaluation(values).view;
    var next = Object.assign({}, base.birth || {}, values, { hasComputed: false });
    delete next.assessment;
    var previous = base.birth && w.VildaBirthAssessment.read(Object.assign({}, next,
      { hasComputed: true, assessment: base.birth.assessment }));
    var saved = previous || view && !view.error && w.VildaBirthAssessment.create(Object.assign({}, next, { hasComputed: true }), view.models, undefined, view.notes);
    if (saved) { next.hasComputed = true; next.assessment = saved; }
    // This is the same canonical carry used by the native main-form collector.
    // The independent perinatal record is never silently overwritten here.
    if (!stillOwned()) { close(true); return; }
    var changed = JSON.stringify(next) !== JSON.stringify(base.birth);
    if (changed) {
      w.vildaBirthData = clone(next);
      savedBirthOwner = { vault: current.vault, token: current.token, sequence: applySequence(),
        scope: scope(base), value: JSON.stringify(next) };
    }
    close(true, true);
    if (changed && scope(snapshot()) === scope(base)) {
      if (w.VildaZrodlaPacjenta) w.VildaZrodlaPacjenta.ogloszJesliInne('birth', next);
      if (scope(snapshot()) !== scope(base)) return;
      if (typeof w.vildaPersistFlushNow === 'function') w.vildaPersistFlushNow({ force: true });
      if (scope(snapshot()) === scope(base) && w.VildaDataImportExport && typeof w.VildaDataImportExport.saveMainSessionNow === 'function')
        w.VildaDataImportExport.saveMainSessionNow({ collectUserData: function () { return w.collectUserData(); } });
    }
    refresh();
  }
  function control(key, title, grid) {
    var label = el('label', '', title), input;
    if (key === 'weeks' || key === 'days') {
      input = el('select');
      var blank = el('option', '', key === 'weeks' ? 'Wybierz' : 'Nie podano'); blank.value = ''; input.appendChild(blank);
      var low = key === 'weeks' ? 22 : 0, high = key === 'weeks' ? 43 : 6;
      for (var index = low; index <= high; index += 1) { var option = el('option', '', String(index)); option.value = String(index); input.appendChild(option); }
    } else {
      input = el('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off';
      input.placeholder = key === 'head' ? 'Opcjonalnie' : key === 'weight' ? 'np. 2450' : 'np. 47,5';
    }
    input.setAttribute('data-home-birth-field', key); input.value = draft.values[key];
    label.appendChild(input); grid.appendChild(label);
  }
  function showDiscrepancy(host) {
    var api = w.VildaUrodzeniowaRozbieznosc;
    if (!api || !draft.base.birth || !draft.base.perinatal) return;
    var other = w.VildaPerinatalSource.naKarte(draft.base.perinatal, draft.base.sex);
    var model = api.model({ wariant: 'sga', ten: draft.base.birth, drugi: other,
      plec: draft.values.sex, klucz: draft.values.sourceKeys[0], silnik: w.VildaSgaBirth });
    if (model) host.appendChild(api.zbuduj(d, model));
  }
  function open() {
    if (!started || !canEdit()) return false;
    if (dialog && dialog.open) return true;
    var base = snapshot(); if (!base) return false;
    if (!dialog) dialog = w.VildaHomeWorkspace.createDialog({ id: 'vhomePerinatalDialog', titleId: 'vhomePerinatalTitle',
      title: 'Dane okołoporodowe', applyLabel: 'Zapisz dane i zamknij', onClose: function () { close(false); }, onApply: apply });
    var vault = w.VildaVault;
    draft = { base: base, fingerprint: JSON.stringify(base), values: initialState(base), vault: vault,
      token: typeof vault.captureSyncOperationSession === 'function' ? vault.captureSyncOperationSession() : null,
      dirty: false, historyToken: 'perinatal-' + Date.now(), timer: null, previewTimer: null };
    var body = dialog.querySelector('.vhome-dialog-body');
    var name = ['firstName', 'lastName'].map(function (id) { return d.getElementById(id).value; }).filter(Boolean).join(' ');
    body.appendChild(el('p', 'vhome-dialog-context', name + (name ? ' · ' : '')
      + (draft.values.sex === 'male' ? 'Chłopiec' : draft.values.sex === 'female' ? 'Dziewczynka' : 'Nie wybrano płci')));
    body.appendChild(el('p', 'vhome-perinatal-intro', 'Dane są wspólne z kartą SGA w DocPro. Wyniki aktualizują się automatycznie podczas wpisywania.'));
    showDiscrepancy(body);
    var grid = el('div', 'vhome-perinatal-fields'); fields.forEach(function (entry) { control(entry[0], entry[1], grid); }); body.appendChild(grid);
    body.appendChild(el('p', 'vhome-perinatal-note', 'Do obliczenia potrzebne są płeć, wiek ciążowy i co najmniej jeden pomiar. Obwód głowy jest opcjonalny; dostępność parametrów zależy od źródła.'));
    body.appendChild(el('h3', 'vhome-perinatal-heading', 'Źródła referencyjne'));
    var sources = el('div', 'vhome-perinatal-sources'); sources.setAttribute('role', 'group'); sources.setAttribute('aria-label', 'Źródła referencyjne SGA');
    w.VildaSgaBirth.SOURCE_KEYS.forEach(function (key) {
      var label = el('label'), input = el('input'); input.type = 'checkbox'; input.value = key;
      input.checked = draft.values.sourceKeys.indexOf(key) >= 0; input.setAttribute('data-home-birth-source', '');
      label.append(input, d.createTextNode(labels[key])); sources.appendChild(label);
    }); body.appendChild(sources);
    var live = el('p', 'vhome-perinatal-status'); live.setAttribute('data-home-birth-status', ''); live.setAttribute('role', 'status'); body.appendChild(live);
    var results = el('section', 'vhome-perinatal-results'); results.setAttribute('data-home-birth-results', ''); body.appendChild(results);
    var clear = el('button', 'vhome-perinatal-clear', 'Wyczyść dane okołoporodowe'); clear.type = 'button';
    clear.addEventListener('click', function () {
      if (!stillOwned()) { close(true); return; }
      fields.forEach(function (entry) { var value = entry[0] === 'days' ? '0' : ''; draft.values[entry[0]] = value;
        dialog.querySelector('[data-home-birth-field="' + entry[0] + '"]').value = value; });
      draft.dirty = true; w.clearTimeout(draft.previewTimer); showPreview();
    }); body.appendChild(clear);
    w.VildaHomeWorkspace.fitDialog(dialog); dialog.setAttribute('aria-modal', 'true'); dialog.showModal();
    w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: draft.historyToken }), '', w.location.href);
    button.setAttribute('aria-expanded', 'true');
    draft.timer = w.setInterval(function () { if (!stillOwned()) close(true); }, 250);
    showPreview(); dialog.querySelector('[data-home-birth-field]').focus({ preventScroll: true }); return true;
  }
  function start() {
    if (started || !w.VildaHomeWorkspace || !w.VildaSgaBirth || !w.VildaBirthAssessment) return;
    var host = d.querySelector('.vhome-data-shortcuts'); if (!host) return;
    started = true; button = el('button'); button.id = 'vhomePerinatalButton'; button.type = 'button';
    status = w.VildaHomeWorkspace.decorateShortcut(button, 'okołoporodowe', 'vhomePerinatalStatus');
    button.setAttribute('aria-controls', 'vhomePerinatalDialog'); button.addEventListener('click', open); host.appendChild(button);
    w.addEventListener('input', captureInput, true); w.addEventListener('change', captureInput, true);
    ['input', 'change', 'vilda:data-applied', 'vilda:patient-loaded', 'vilda:user-state-cleared', 'vilda:session-changed',
      'vilda:auth-boot-settled', 'vilda:auth-hidden', 'vilda:main-session-restored', 'vilda:persist-restored', 'vildaProAccessChanged',
      'vilda:initial-main-session-restore-settled', 'vilda:state-restored', 'vilda:professional-summary-updated']
      .forEach(function (name) { d.addEventListener(name, schedule); });
    w.addEventListener('pageshow', schedule);
    ['vilda:user-state-cleared', 'vilda:patient-loaded', 'vilda:auth-loaded'].forEach(function (name) {
      d.addEventListener(name, function () { savedBirthOwner = null; close(true); });
    });
    // The native persistence adapter emits Clear on window, not document.
    w.addEventListener('vilda:user-state-cleared', function () { savedBirthOwner = null; close(true); schedule(); });
    if (w.VildaVault && typeof w.VildaVault.onLock === 'function') w.VildaVault.onLock(function () { savedBirthOwner = null; close(true); schedule(); });
    w.addEventListener('popstate', function () {
      if (!draft || !dialog.open || w.history.state && w.history.state.vildaHomeDialog === draft.historyToken) return;
      if (close(false, true, true) === false) w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: draft.historyToken }), '', w.location.href);
    });
    refresh();
  }
  w.VildaHomePerinatal = Object.freeze({ open: open, refresh: schedule, ownsCurrentBirth: ownsCurrentBirth,
    allowsStartupBirthRestore: allowsStartupBirthRestore });
  d.addEventListener('vilda:home-workspace-ready', start);
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(typeof window !== 'undefined' ? window : globalThis);
