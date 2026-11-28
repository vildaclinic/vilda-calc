/* Patient documentation on the opt-in home workspace. Native Vault models,
 * laboratory history, care-plan actors and note editor retain data ownership.
 * This module owns only the compact preview and its presentation lifetime.
 */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomePatient) return;
  var d = w.document, card = null, dialog = null, active = null, model = null;
  var started = false, frame = 0, refreshRequested = true, generation = 0, readGeneration = 0;
  var nativeView = null, noteView = null, modal = null, selectedTab = 'notes';
  var previewState = null;
  var inline = null;
  var subscribed = new WeakSet();
  var identityReadGeneration = 0;
  var tabNames = [['labs', 'Badania'], ['care', 'Plany'], ['notes', 'Notatki']];
  var lifecycle = ['vilda:user-state-cleared', 'vilda:data-applied', 'vilda:patient-loaded', 'vilda:auth-loaded', 'vilda:session-changed'];

  function el(tag, cls, value) {
    var node = d.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = value;
    return node;
  }
  function byId(id) { return d.getElementById(id); }
  function button(label, fn, cls) {
    var node = el('button', cls || 'vhome-patient-button', label);
    node.type = 'button'; node.addEventListener('click', fn); return node;
  }
  function patientId() {
    try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; }
    catch (_) { return null; }
  }
  function documentationBinding(id) {
    if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return null;
    var host = w.VildaHomeGabinet || w.VildaHomeEncounter, capture = host?.captureDocumentationBinding;
    return typeof capture === 'function' ? capture.call(host, id) : {blocked:true};
  }
  function presentationFrom(record) {
    var header = record && record.header;
    if (!header || typeof header !== 'object' || Array.isArray(header)) return null;
    var first = typeof header.firstName === 'string' ? header.firstName : '';
    var last = typeof header.lastName === 'string' ? header.lastName : '';
    var name = typeof header.name === 'string' ? header.name : '';
    return {patientId:record.patientId, name:name || [last,first].filter(Boolean).join(' ') || 'Pacjent',
      displayName:[first,last].filter(Boolean).join(' ') || name || 'Pacjent', firstName:first, lastName:last,
      dobISO:typeof header.dobISO === 'string' ? header.dobISO : '', sex:typeof header.sex === 'string' ? header.sex : ''};
  }
  function publishPresentation(view, record) {
    if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true || !current(view) || record?.patientId !== view.owner.patientId) return;
    var presentation = presentationFrom(record); if (!presentation) return;
    view.presentation = presentation;
    d.querySelectorAll('[data-home-patient-identity]').forEach(function (host) {
      if (host.dataset.homePatientIdentity === presentation.patientId) {
        var label = host.querySelector('[data-home-patient-name]'); if (label) label.textContent = presentation.name;
      }
    });
    d.dispatchEvent(new w.CustomEvent('vilda:patient-profile-presentation-ready', {detail:{patientId:presentation.patientId}}));
  }
  function refreshPresentation(id) {
    var view = active;
    if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true || !current(view) || id !== view.owner.patientId) return;
    var ticket = ++identityReadGeneration;
    Promise.resolve().then(function () { return current(view) ? view.vault.getPatient(id) : null; }).then(function (record) {
      if (ticket === identityReadGeneration) publishPresentation(view, record);
    }).catch(function () { /* A profile read never substitutes an old visit or changes the active form. */ });
  }
  function dateLabel(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(8, 10) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4);
    var date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString('pl-PL') : 'Brak daty';
  }
  function ownerSnapshot() {
    try {
      var vault = w.VildaVault, importer = w.VildaDataImportExport, panel = w.VildaPanelPacjent;
      var id = patientId(), user = vault && vault.getCurrentUser();
      if (!id || !user || !vault.isUnlocked() || !w.VildaAuthUI?.isBootReady() || !w.VildaProAccess?.hasAccess()
        || !importer || typeof importer.getApplyLoadedDataSequence !== 'function'
        || !panel || panel.nieaktualny() || panel.wlasciciel() !== id
        || w.__vildaPersistRestoring || w.__vildaLustroWpis || importer.isMainSessionRestorePending()
        || w.VildaPersistence?.isClearInProgress?.()
        || Number(w.__vildaPersistClearUntil || 0) > Date.now()) return null;
      var measured = w.VildaDobAge?.readMeasuredAtISO();
      return { account: user.userId, patientId: id, load: importer.getApplyLoadedDataSequence(),
        visit: w.VildaVisitContext?.capture({ user: { measuredAtISO: measured } }, { patientId: id, readOnly: true }) || null };
    } catch (_) { return null; }
  }
  function current(view) {
    try {
      if (!view || view !== active || view.generation !== generation || view.vault !== w.VildaVault) return false;
      view.vault.assertSyncOperationSession(view.token);
      return JSON.stringify(ownerSnapshot()) === view.key;
    } catch (_) { return false; }
  }
  function destroyNative() {
    var old = nativeView; nativeView = null;
    if (old && typeof old.destroy === 'function') old.destroy();
  }
  function announce(value) {
    var target = dialog && dialog.querySelector('[data-home-patient-status]');
    if (target) target.textContent = value;
  }
  function close(force, focus) {
    var native = w.VildaHomePatientNative;
    if (native && (force || native.isOpen())) {
      var accepted = native.close(force);
      if (!force) return accepted;
    }
    return w.VildaHomeDialogHistory.batch(function () {
      if (noteView) {
        if (force) noteView.destroy();
        else if (noteView.isCurrent()) {
          // An explicit parent-close request first addresses ONLY its top note.
          // Browser Back itself is dispatched by the common history owner.
          if (noteView.requestClose()) noteView = null;
          return false;
        }
      }
      noteView = null;
      if (!modal && !dialog?.open) return true;
      if (!force && modal?.history && !modal.history.isTop()) {
        w.VildaHomeDialogHistory.requestTop(); return false;
      }
      if (!force && nativeView?.isEditing?.()) {
        announce('Najpierw zakończ lub anuluj otwarty formularz planu.'); return false;
      }
      var old = modal; modal = null; destroyNative();
      if (dialog.open) dialog.close(); dialog.removeAttribute('aria-modal'); dialog.querySelector('.vhome-dialog-body').replaceChildren();
      if (old && old.history) old.history.release();
      if (focus || !force) {
        var opener = old && old.opener;
        if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
      }
      return true;
    });
  }
  function clearDecrypted() {
    if (active) active.presentation = null;
    generation += 1; readGeneration += 1; identityReadGeneration += 1; model = null; active = null; refreshRequested = true;
    previewState = null;
    closeInline(true);
    close(true, false);
    if (card) {
      card.querySelectorAll('.vhome-patient-tabpanel').forEach(function (panel) { panel.replaceChildren(); });
      var count = byId('vhomePatientLabCount'); if (count) { count.textContent = ''; count.hidden = true; }
      var treatment = byId('vhomePatientTreatmentSummary'); if (treatment) { treatment.textContent = ''; treatment.hidden = true; }
      card.querySelectorAll('button').forEach(function (control) { control.disabled = true; });
      card.removeAttribute('aria-busy');
    }
  }
  function requestRead() { refreshRequested = true; if (inline) inline.needsRead = true; schedule(); }
  function statusSnapshotId(id) {
    var encounter = w.VildaHomeEncounter?.state?.(id);
    return encounter?.sourceSnapshotId || encounter?.snapshotId || null;
  }
  function ownsInline(scope, id) {
    return !!(scope && inline === scope && scope.patientId === id && scope.host.isConnected
      && scope.host === byId('vhomePatientOverview') && !scope.host.hidden
      && statusSnapshotId(id) === scope.snapshotId && current(scope.owner));
  }
  function closeInline(force) {
    if (!inline) return true;
    if (w.VildaHomePatientNative?.releaseInline?.(force) === false) return false;
    var scope = inline; inline = null; scope.host.replaceChildren();
    return true;
  }
  function inlineIssue(scope) {
    if (!ownsInline(scope, scope.patientId)) return;
    var message = el('p', 'vhome-patient-empty', 'Nie udało się odczytać zapisanej karty tej wizyty.');
    var retry = button('Spróbuj ponownie', function () { if (ownsInline(scope, scope.patientId)) requestRead(); });
    scope.shell.replaceChildren(message, retry);
  }
  function inlineBack(scope, callback) {
    var live = true;
    var handle = w.VildaHomeDialogHistory.create({
      group: scope.owner,
      isOpen: function () { return live && ownsInline(scope, scope.patientId); },
      requestClose: function () { return callback(); }
    });
    handle.enter();
    return function () { live = false; handle.release(); };
  }
  async function refreshInline() {
    var scope = inline;
    if (!scope || !scope.needsRead || scope.pending || !ownsInline(scope, scope.patientId)) return;
    var auth = byId('vilda-auth-ui-root');
    if (auth?.getClientRects().length || w.VildaHomePatientNative?.deferRefresh?.()) return;
    scope.needsRead = false; scope.pending = true;
    try {
      const planId = scope.focusCarePlanId;
      scope.focusCarePlanId = null;
      if (planId && scope.selected === 'care') {
        // An explicit directory link uses the same patient-scoped plan mount as
        // the native chart. It also works for staged plans stored outside Notes.
        await w.VildaAuthUI.showPatientCard(scope.patientId, null, {homePatientPresentation: true, homePatientInline: scope},
          {_homeInlineRender: true, activeTab: 'care', carePlanId: planId, careDetail: true});
      } else {
        await w.VildaAuthUI.renderHomePatientInline(scope);
      }
      if (ownsInline(scope, scope.patientId) && !scope.shell.querySelector('.vilda-auth-screen,button')) inlineIssue(scope);
    } catch (_) { inlineIssue(scope); }
    finally { scope.pending = false; if (inline === scope && scope.needsRead) schedule(); }
  }
  function openInline(host, options) {
    if (!host || host !== byId('vhomePatientOverview') || !host.isConnected || host.hidden) return false;
    if (typeof w.VildaAuthUI?.renderHomePatientInline !== 'function') return false;
    if (!current(active)) { schedule(); return false; }
    var id = active.owner.patientId; options = options || {};
    if (inline && ownsInline(inline, id)) {
      if (options.activeTab && inline.selected !== options.activeTab) selectInline(options.activeTab);
      return true;
    }
    closeInline(true);
    var shell = el('div', 'vilda-auth-card');
    shell.setAttribute('role', 'region'); shell.setAttribute('aria-label', 'Karta pacjenta');
    var waiting = el('p', 'vhome-patient-empty', 'Wczytywanie karty pacjenta…');
    waiting.setAttribute('role', 'status'); shell.appendChild(waiting); host.replaceChildren(shell);
    inline = { host: host, shell: shell, owner: active, patientId: id, snapshotId: statusSnapshotId(id),
      selected: options.activeTab || 'antro', needsRead: true, pending: false,
      workspaceHeader: options.workspaceHeader === true,
      onClose: options.onClose, onAnalysis: options.onAnalysis, showError: function () { inlineIssue(this); } };
    var scope = inline;
    scope.captureVisitBinding = function (patientId) {
      if (!ownsInline(scope, patientId)) return w.__VILDA_HOME_GABINET_PREVIEW__ === true ? {blocked:true} : null;
      return w.__VILDA_HOME_GABINET_PREVIEW__ === true ? documentationBinding(patientId) : w.VildaHomeEncounter?.captureBinding?.(patientId) || null;
    };
    scope.registerBack = function (callback) { return inlineBack(scope, callback); };
    // Status uses the saved values and measurement age from the selected visit.
    // Other native tabs retain their own dated, patient-wide record lists.
    scope.historicalSnapshots = function (records) {
      return records.filter(function (record) { return record.snapshotId === scope.snapshotId; });
    };
    refreshInline(); return true;
  }
  // Recording the first document of an encounter also persists its patient
  // snapshot. Keep the live editor only for that same verified owner and load.
  function ownsSavePublication(event, patientId) {
    const detail = event && event.detail, scope = inline;
    if (!scope || !detail || detail.source !== 'save' || detail.referenceVerified !== true ||
        !detail.snapshotId || detail.patientId !== patientId || detail.applySequence !== scope.owner.owner.load ||
        !ownsInline(scope,patientId)) return false;
    const encounter = w.VildaHomeEncounter.state(patientId);
    return (encounter.mode === 'new' || encounter.mode === 'edit') && !!encounter.visitId &&
      encounter.visitId === scope.owner.owner.visit?.visitId;
  }
  function selectInline(key) {
    if (!inline || !ownsInline(inline, inline.patientId)) return false;
    if (w.VildaHomePatientNative?.selectInline?.(key)) return true;
    if (inline.pending) { inline.selected = key; return true; }
    return false;
  }
  function focusInlineNote(id) {
    var scope = inline;
    if (typeof id !== 'string' || !id || !scope || !ownsInline(scope, scope.patientId)) return false;
    scope.focusNoteId = id;
    scope.selected = 'notes';
    requestRead();
    return true;
  }
  function focusInlineCarePlan(id) {
    const scope = inline;
    if (!scope || scope.selected !== 'care' || typeof id !== 'string' || !id || !ownsInline(scope, scope.patientId)) return false;
    scope.focusCarePlanId = id;
    scope.needsRead = true;
    schedule();
    return true;
  }
  function focusInlineReminder(id) {
    const scope = inline;
    if (!scope || scope.selected !== 'reminders' || typeof id !== 'string' || !id || !ownsInline(scope, scope.patientId)) return false;
    scope.reminderTarget?.button?.removeAttribute('aria-current');
    scope.reminderTarget = {id, button: null};
    applyInlineReminderFocus(byId('remindersInline'));
    return true;
  }
  function applyInlineReminderFocus(host) {
    const scope = inline, target = scope?.reminderTarget;
    if (!target || !ownsInline(scope, scope.patientId) || scope.selected !== 'reminders' || !scope.shell.contains(host)
        || !w.VildaHomeRemindersRuntime?.ownsOverviewHost(host)) return;
    const ready = host.querySelector('.vhome-reminders-overview[data-home-reminders-phase="ready"]');
    if (!ready) return;
    const row = Array.from(ready.querySelectorAll('button[data-note-id]')).find(button => button.dataset.noteId === target.id);
    if (!row) { scope.reminderTarget = null; return; }
    row.setAttribute('aria-current', 'true');
    // A native list refresh may replace the focused button. Preserve that
    // position while respecting focus moved to another control or editor.
    if (!target.button || !target.button.isConnected && d.activeElement === d.body) row.focus();
    target.button = row;
  }
  function subscribe(vault) {
    if (!vault || subscribed.has(vault)) return;
    subscribed.add(vault);
    if (typeof vault.onLock === 'function') vault.onLock(function () { if (w.VildaVault === vault) { clearDecrypted(); schedule(); } });
    if (typeof vault.onUnlock === 'function') vault.onUnlock(function () { if (w.VildaVault === vault) requestRead(); });
    ['onPatientSaved', 'onPatientNoteChanged', 'onPatientDeleted'].forEach(function (name) {
      if (typeof vault[name] !== 'function') return;
      vault[name](function (event) {
        if (w.VildaVault !== vault || event?.patientId && event.patientId !== patientId()) return;
        if (name === 'onPatientDeleted') clearDecrypted();
        requestRead();
      });
    });
  }
  async function load(view, attempt) {
    var serial = ++readGeneration, identityTicket = identityReadGeneration;
    if (!current(view)) return;
    card.setAttribute('aria-busy', 'true');
    try {
      // Shared native resource gate: no copied resource manifest, reference
      // selector or hidden native component is manufactured for this preview.
      var history = w.VildaLabHistoryTab;
      if (history && typeof history.ensureReaderDependencies === 'function') {
        try { await history.ensureReaderDependencies({ includeClcr: false, isCurrent: function () { return current(view); } }); }
        catch (_) { /* Adapter reports the failed lab dependency; notes/care may still be readable. */ }
        if (!current(view) || serial !== readGeneration) return;
      }
      var next = await w.VildaHomePatientData.read({ vault: view.vault, patientId: view.owner.patientId,
        isCurrent: function () { return current(view) && serial === readGeneration; } });
      if (!current(view) || serial !== readGeneration) return;
      var clcrMissing = next.errors.some(function (error) { return error.code === 'HOME_PATIENT_CLCR_READER_UNAVAILABLE'; });
      if (attempt !== 1 && (clcrMissing || next.areas.labs === 'partial')) {
        if (clcrMissing && typeof history?.ensureReaderDependencies === 'function') {
          try { await history.ensureReaderDependencies({ includeClcr: true, isCurrent: function () { return current(view); } }); }
          catch (_) { /* Retain a visible lab error while the other projections remain available. */ }
          if (!current(view) || serial !== readGeneration) return;
        }
        return load(view, 1);
      }
      model = next;
      if (identityTicket === identityReadGeneration) publishPresentation(view, next.patient);
    } catch (error) {
      if (!current(view) || serial !== readGeneration) return;
      // Failures never become zero counts or fictitious empty clinical lists.
      model = null;
    }
    if (!current(view) || serial !== readGeneration) return;
    card.removeAttribute('aria-busy'); renderPreview();
    if (dialog?.open && modal?.mode === 'overview') renderOverview();
  }
  function caption(panel, label, value) {
    var wrap = el('div', 'vhome-patient-caption'); wrap.appendChild(el('span', '', label));
    if (value) { var time = el('time', '', dateLabel(value)); time.dateTime = value; wrap.appendChild(time); }
    panel.appendChild(wrap); return wrap;
  }
  function empty(host, value) { host.appendChild(el('p', 'vhome-patient-empty', value)); }
  function ready(area) { return !!(current(active) && model && model.areas.patient === 'ready' && model.areas[area] === 'ready'); }
  function areaMessage(area, none) {
    if (!active) return 'Wczytaj zapisanego pacjenta, aby zobaczyć dokumentację.';
    if (!model && card.hasAttribute('aria-busy')) return 'Wczytywanie dokumentacji pacjenta…';
    if (!model || model.areas[area] !== 'ready') return 'Nie udało się odczytać tej części dokumentacji. Spróbuj ponownie.';
    return none;
  }
  function link(panel, label, action, enabled) {
    var target = button(label, action, 'vhome-patient-link'); target.disabled = !enabled;
    panel.appendChild(target); return target;
  }
  function toneClass(value) { return ['within', 'below', 'above', 'outside'].indexOf(value) !== -1 ? value : 'neutral'; }
  function compactLabs(panel) {
    var rows = ready('labs') ? model.latestLabRows : [];
    // The accepted compact header describes ONE date. Show the latest actual
    // date/source group only, never mix older samples below that date label.
    var first = rows && rows[0];
    rows = first ? rows.filter(function (row) { return row.dateISO === first.dateISO && row.dateSource === first.dateSource; }).slice(0, 3) : [];
    var head = caption(panel, 'Ostatnie wyniki', first && first.dateISO);
    if (first && first.dateSource !== 'badanie') {
      var source = { kontrola: 'Data kontroli GH', wpis: 'Data wpisu', termin: 'Termin zlecenia' }[first.dateSource];
      if (source) head.firstElementChild.textContent = source;
    }
    var body = el('div', 'vhome-patient-preview-body'); panel.appendChild(body);
    if (!rows.length) empty(body, areaMessage('labs', 'Brak zapisanych wyników badań.'));
    else {
      var table = el('table', 'vhome-patient-labs'), tbody = el('tbody'); table.appendChild(tbody); body.appendChild(table);
      rows.forEach(function (row) {
        var tr = el('tr'), th = el('th'), valueCell = el('td'), normsCell = el('td'), info = row.presentation;
        th.scope = 'row'; th.appendChild(el('span', 'vhome-patient-analyte', row.label)); th.title = row.label;
        var shown = row.entry.display || row.entry.raw || '—';
        if (info.unit) [String.fromCharCode(160) + info.unit, ' ' + info.unit].some(function (suffix) {
          if (shown.length <= suffix.length || shown.slice(-suffix.length) !== suffix) return false;
          shown = shown.slice(0, -suffix.length); return true;
        });
        var value = el('span', 'vhome-patient-result tone-' + toneClass(info.tone), shown);
        valueCell.appendChild(value);
        if (info.unit) valueCell.appendChild(el('small', 'vhome-patient-unit', ' ' + info.unit));
        if (info.symbol) valueCell.appendChild(el('span', 'vhome-patient-native-symbol tone-' + toneClass(info.tone), ' ' + info.symbol));
        if (info.norms.length) info.norms.forEach(function (norm) {
          // Labels and boundaries remain the recorded native presentation.
          var badge = el('span', 'vhome-patient-badge', norm.label || 'Zakres z zapisu');
          badge.title = (norm.label ? norm.label + ': ' : '') + norm.text;
          badge.setAttribute('aria-label', badge.title);
          normsCell.appendChild(badge);
        });
        else normsCell.appendChild(el('span', 'vhome-patient-badge', 'Brak zakresu'));
        if (info.warning) { var warning = el('span', 'vhome-patient-native-warning', info.warning); warning.dataset.warningKind = info.warningKind || ''; normsCell.appendChild(warning); }
        tr.append(th, valueCell, normsCell); tbody.appendChild(tr);
      });
    }
    var control = link(panel, 'Wszystkie badania', function () { open('labs'); }, current(active));
    control.id = 'vhomePatientLabsOpen';
    if (active && !ready('labs') && !card.hasAttribute('aria-busy')) link(panel, 'Spróbuj ponownie', requestRead, true);
  }
  function summaryFor(plan) {
    return plan && typeof w.VildaCarePlans?.describeSummary === 'function'
      ? w.VildaCarePlans.describeSummary(plan.source) : null;
  }
  function compactCare(panel) {
    var plan = ready('care') ? model.latestPlanSummary : null, summary = summaryFor(plan);
    var head = caption(panel, 'Plan pacjenta');
    if (summary?.stateLabel) head.appendChild(el('span', 'vhome-patient-badge', summary.stateLabel));
    var body = el('div', 'vhome-patient-preview-body'); panel.appendChild(body);
    if (!plan) empty(body, areaMessage('care', 'Nie utworzono jeszcze planu opieki.'));
    else {
      body.appendChild(el('h3', 'vhome-patient-preview-title', plan.title || 'Plan opieki'));
      if (plan.goal) body.appendChild(el('p', 'vhome-patient-excerpt', plan.goal));
      var metadata = [];
      if (summary && Number.isInteger(summary.stepCount)) metadata.push(summary.stepCount + ' · liczba kroków');
      if (summary?.nextDateISO) metadata.push('najbliższy termin ' + dateLabel(summary.nextDateISO));
      if (metadata.length) body.appendChild(el('p', 'vhome-patient-plan-meta', metadata.join(' · ')));
    }
    link(panel, 'Otwórz plan opieki', function () { open('care', { planId: plan && plan.id }); }, current(active)).id = 'vhomePatientCareOpen';
  }
  function compactNotes(panel) {
    var note = ready('notes') ? model.latestNote : null;
    caption(panel, note ? note.scope === 'general' ? 'Notatka ogólna' : 'Notatka z wizyty' : 'Ostatnia notatka', note && note.dateISO);
    var body = el('div', 'vhome-patient-preview-body'); panel.appendChild(body);
    if (!note) empty(body, areaMessage('notes', 'Brak zapisanych notatek.'));
    else {
      body.appendChild(el('h3', 'vhome-patient-preview-title', note.title || 'Notatka'));
      body.appendChild(el('p', 'vhome-patient-excerpt', note.body));
    }
    link(panel, 'Dodaj notatkę', function () { openNote(null); }, current(active)).id = 'vhomePatientNoteAdd';
  }
  function selectTab(name, focus) {
    if (!tabNames.some(function (entry) { return entry[0] === name; })) return;
    selectedTab = name;
    card.querySelectorAll('[role=tab]').forEach(function (tab) {
      var selected = tab.dataset.homePatientTab === name;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus({ preventScroll: true });
    });
    card.querySelectorAll('[role=tabpanel]').forEach(function (panel) { panel.hidden = panel.id !== 'vhomePatientPanel-' + name; });
  }
  function renderPreview() {
    if (!started) return;
    var access = false; try { access = !!w.VildaProAccess?.hasAccess(); } catch (_) { /* Access is fail-closed. */ }
    card.hidden = !access;
    byId('vhomePatientExpand').disabled = !current(active);
    var busy = card.hasAttribute('aria-busy');
    if (previewState && previewState.model === model && previewState.owner === active && previewState.busy === busy && previewState.access === access) return;
    var focused = d.activeElement, focusId = focused && card.contains(focused) ? focused.id : null;
    previewState = { model: model, owner: active, busy: busy, access: access };
    card.querySelectorAll('[role=tab]').forEach(function (tab) { tab.disabled = false; });
    var count = byId('vhomePatientLabCount'), value = model?.counts.labResults;
    count.hidden = !Number.isInteger(value); count.textContent = Number.isInteger(value) ? String(value) : '';
    var treatment = byId('vhomePatientTreatmentSummary'), treatmentText = '';
    try { treatmentText = w.VildaAuthUI?.describePatientTreatmentSummary?.(model?.patient?.snapshots?.[0]?.payload) || ''; }
    catch (_) { /* No summary is inferred after a failed native read. */ }
    var generic = model?.treatmentSummary;
    if (generic?.status === 'ready' && Number.isInteger(generic.activeCount) && generic.activeCount > 0) {
      var genericText = generic.activeCount === 1 && Array.isArray(generic.activeLabels) ? generic.activeLabels[0] : 'Aktywne leczenie: ' + generic.activeCount;
      treatmentText = [treatmentText, genericText].filter(Boolean).join(' · ');
    }
    treatment.textContent = treatmentText; treatment.hidden = !treatmentText;
    tabNames.forEach(function (entry) {
      var panel = byId('vhomePatientPanel-' + entry[0]); panel.replaceChildren();
      if (entry[0] === 'labs') compactLabs(panel);
      else if (entry[0] === 'care') compactCare(panel);
      else compactNotes(panel);
    });
    selectTab(selectedTab, false);
    if (focusId && byId(focusId)?.isConnected) byId(focusId).focus({ preventScroll: true });
    var grid = byId('vhomeMainCards'), heading = byId('vhomeAnalysisHeading');
    if (grid && heading) heading.hidden = grid.hidden = Array.from(grid.children).every(function (node) { return node.hidden; });
  }
  function section(host, label) { var node = el('section', 'vhome-patient-section'); node.appendChild(el('h3', '', label)); host.appendChild(node); return node; }
  function addContext(host) {
    var context = el('div', 'vhome-patient-context');
    context.dataset.homePatientIdentity = active?.owner.patientId || '';
    var label = el('strong', '', active?.presentation?.name || model?.identity?.name || 'Pacjent'); label.dataset.homePatientName = '';
    context.appendChild(label);
    var date = active?.owner.visit?.clinicalDateISO;
    context.appendChild(el('span', '', date ? 'Wizyta · ' + dateLabel(date) : 'Dokumentacja pacjenta'));
    host.appendChild(context);
    var payload = model?.patient?.snapshots?.[0]?.payload;
    var source = w.VildaDsSource?.getState?.();
    if (source?.status === 'ready' && source.patientId === active?.owner.patientId && source.diagnosisCode) {
      host.appendChild(el('span', 'vhome-patient-badge', 'Zemel 2015 · z rozpoznania ' + source.diagnosisCode));
    } else if (payload?.clinical?.downSyndrome === true) {
      host.appendChild(el('span', 'vhome-patient-badge', 'Zespół Downa · cecha Karty pacjenta'));
    }
  }
  function renderOverview() {
    if (!dialog?.open || !modal || !current(active)) return;
    var focused = d.activeElement, focusedAction = focused && dialog.contains(focused) ? focused.getAttribute('data-home-patient-action') : null;
    destroyNative(); var body = dialog.querySelector('.vhome-dialog-body'); body.replaceChildren();
    var root = el('div', 'vhome-patient-overview'); body.appendChild(root); addContext(root);
    var actions = el('div', 'vhome-patient-actions'); root.appendChild(actions);
    [['labs', 'Wyniki badań'], ['care', 'Plan opieki'], ['note', 'Notatka']].forEach(function (entry) {
      var action = button(entry[1], function () { if (entry[0] === 'note') openNote(null); else open(entry[0]); });
      action.dataset.homePatientAction = entry[0]; actions.appendChild(action);
    });
    var plan = ready('care') ? model.latestPlanSummary : null;
    var care = section(root, plan?.title || 'Plan opieki');
    if (!plan) empty(care, areaMessage('care', 'Nie utworzono jeszcze planu opieki.'));
    else {
      var summary = summaryFor(plan);
      if (summary?.stateLabel) care.appendChild(el('span', 'vhome-patient-badge', summary.stateLabel));
      if (plan.goal) care.appendChild(el('p', '', plan.goal));
    }
    var perinatal = section(root, 'Dane okołoporodowe');
    var birth = model?.patient?.snapshots?.[0]?.payload?.birth;
    var savedSga = typeof w.VildaPatientSgaModel?.build === 'function' ? w.VildaPatientSgaModel.build(birth) : null;
    var summaryText = savedSga ? 'SGA: ' + savedSga.value + ' · ' + savedSga.subtitle + '. Wiek ciążowy: ' + savedSga.gestationLabel : '';
    perinatal.appendChild(el('p', '', summaryText || 'Nie uzupełniono'));
    var sga = button('SGA · DocPro', function () { open('sga'); }); sga.dataset.homePatientAction = 'sga'; perinatal.appendChild(sga);
    var note = ready('notes') ? model.latestNote : null, notes = section(root, 'Ostatnia notatka');
    if (!note) empty(notes, areaMessage('notes', 'Brak zapisanych notatek.'));
    else {
      notes.appendChild(el('p', 'vhome-patient-note-meta', [dateLabel(note.dateISO), note.scope === 'general' ? 'Notatka ogólna' : 'Notatka kliniczna', note.title].filter(Boolean).join(' · ')));
      notes.appendChild(el('p', 'vhome-patient-note-text', note.body));
      var edit = button(note.destination?.readOnly ? 'Otwórz wpis' : 'Otwórz notatkę', function () { openNote(note); });
      edit.dataset.homePatientAction = 'note-edit'; notes.appendChild(edit);
    }
    if (focusedAction) dialog.querySelector('[data-home-patient-action="' + focusedAction + '"]')?.focus({ preventScroll: true });
  }
  function fitNativeDialog(target, metadata) {
    // The root integration extends the shared workspace dialog sizing rule to
    // this presentation class. Original form nodes/actors are left untouched.
    target.classList.add('vhome-patient-native-dialog');
    var fit = function () { w.VildaHomeWorkspace.fitDialog(target); }; fit();
    w.addEventListener('resize', fit);
    if (w.visualViewport) w.visualViewport.addEventListener('resize', fit);
    var stopHistory;
    if (metadata && typeof metadata.requestClose === 'function') {
      // Clcr supplies its original Close/Cancel button actor after showing.
      // Its editor's native cancel event relies on the browser default action,
      // so Back must use that supplied actor rather than a synthetic cancel.
      var history = w.VildaHomeDialogHistory.create({ group: active,
        isOpen: function () { return target.isConnected && target.open; },
        requestClose: metadata.requestClose });
      history.enter(); stopHistory = function () { history.release(); };
    } else stopHistory = w.VildaHomeDialogHistory.watchNativeDialog(target, { group: active });
    return function () {
      stopHistory(); w.removeEventListener('resize', fit);
      if (w.visualViewport) w.visualViewport.removeEventListener('resize', fit);
    };
  }
  function onSaved(view) {
    if (!current(view)) return;
    requestRead();
    if (nativeView && typeof nativeView.refresh === 'function') nativeView.refresh();
  }
  function openNote(note, nativeOptions) {
    var view = active;
    if (!current(view) || !w.VildaHomePatientNoteHost) return false;
    nativeOptions = nativeOptions || {};
    if (note && note.patientId !== view.owner.patientId) return false;
    // New laboratory results are entered in the existing converter flow.
    // Do not revive the retired manual lab template in a general-note editor.
    if (!note && nativeOptions.template === 'lab') return false;
    var source = note && (note.source || note);
    var originModal = modal && dialog?.open ? modal : null;
    if (source?.category === 'wynik-klirens') return open('labs', { labFocusNoteId: source.id });
    noteView = w.VildaHomePatientNoteHost.open({ patientId: view.owner.patientId, note: source || null,
      template: nativeOptions.template, anchor: nativeOptions.anchor, suggestLinkedAge: nativeOptions.suggestLinkedAge,
      isCurrent: function () { return current(view) && (!originModal
        || modal === originModal && dialog?.open && dialog.isConnected); }, opener: d.activeElement, historyGroup: view,
      openPlan: function (destination) { if (current(view)) open('care', destination); },
      onSaved: function (result) { if (!current(view)) return; onSaved(view); if (typeof nativeOptions.onSaved === 'function') nativeOptions.onSaved(result); }
    });
    if (!noteView) announce('Nie można otworzyć notatki. Sprawdź bieżącego pacjenta i odśwież dokumentację.');
    return !!noteView;
  }
  async function nativeNoteById(view, id, callback) {
    if (!current(view) || !id || typeof view.vault.getPatientNote !== 'function') return;
    try {
      var note = await view.vault.getPatientNote(id);
      if (!current(view) || !note || note.id !== id || note.patientId !== view.owner.patientId) return;
      callback(note);
    } catch (_) { if (current(view)) announce('Nie udało się odczytać wpisu. Odśwież dokumentację.'); }
  }
  function renderNative(mode, options) {
    var view = active;
    if (!current(view) || !modal || !dialog?.open) return false;
    if (nativeView?.isEditing?.()) { announce('Najpierw zakończ lub anuluj otwarty formularz planu.'); return false; }
    destroyNative(); var body = dialog.querySelector('.vhome-dialog-body'); body.replaceChildren();
    var back = button('← Karta pacjenta', function () { open('overview'); }); back.dataset.homePatientAction = 'overview'; body.appendChild(back);
    addContext(body); var host = el('div', 'vhome-patient-native-host'); host.dataset.homePatientView = mode; body.appendChild(host);
    if (mode === 'labs') {
      if (!w.VildaLabHistoryTab?.render) { empty(host, 'Nie można otworzyć badań. Odśwież aplikację.'); return false; }
      nativeView = w.VildaLabHistoryTab.render(host, view.owner.patientId, {
        vault: view.vault, focusNoteId: options.labFocusNoteId || null,
        isCurrent: function () { return current(view) && dialog?.open && dialog.isConnected && modal?.mode === 'labs'; },
        onDialog: fitNativeDialog,
        openEditor: function (request) {
          if (!current(view)) return;
          if (!request.note && request.template === 'lab') {
            // Transitional old native markup can still expose this callback.
            // Invoke its EXISTING converter link and navigation listener; never
            // reconstruct a writer or revive the retired manual template.
            var original = host.querySelector('a.vilda-lab-hist-check');
            if (original) original.click();
            else announce('Przelicznik wyników jest niedostępny. Odśwież aplikację.');
            return;
          }
          openNote(request.note, request);
        },
        onChanged: function () { onSaved(view); }
        // Delete remains absent until the native guarded delete actor is
        // publicly exposed. No raw removePatientNote call is substituted here.
      });
    } else if (mode === 'sga') {
      var birth = model?.patient?.snapshots?.[0]?.payload?.birth;
      var saved = typeof w.VildaPatientSgaModel?.build === 'function' ? w.VildaPatientSgaModel.build(birth) : null;
      if (!saved) empty(host, 'Brak zapisanych danych okołoporodowych. Uzupełnij je w formularzu głównym i zapisz pacjenta.');
      else if (typeof w.VildaPatientSgaUI?.renderSummary !== 'function') empty(host, 'Podgląd zapisanej oceny SGA jest niedostępny. Odśwież aplikację.');
      else {
        host.appendChild(el('p', 'vhome-patient-note-meta', 'Zapisana ocena SGA · bez ponownego przeliczania'));
        var summaryHost = el('div', 'vhome-patient-sga-summary'); host.appendChild(summaryHost);
        w.VildaPatientSgaUI.renderSummary(summaryHost, saved);
      }
    } else if (mode === 'care') {
      if (!w.VildaCarePlans?.mount) { empty(host, 'Nie można otworzyć planów opieki. Odśwież aplikację.'); return false; }
      nativeView = w.VildaCarePlans.mount(host, {
        full: true, patientId: view.owner.patientId, vault: view.vault,
        captureVisitBinding: w.__VILDA_HOME_GABINET_PREVIEW__ === true ? function (id) {
          return current(view) && id === view.owner.patientId ? documentationBinding(id) : {blocked:true};
        } : undefined,
        planId: options.planId || options.carePlanId || null, noteId: options.noteId || options.careNoteId || null,
        detail: options.detail, isCurrent: function () { return current(view) && dialog?.open && dialog.isConnected && modal?.mode === 'care'; },
        onDialog: fitNativeDialog, onChange: function () { onSaved(view); },
        openPatient: function (id, noteId) {
          if (!current(view) || id !== view.owner.patientId) return;
          if (noteId) nativeNoteById(view, noteId, function (note) { openNote(note); }); else open('overview');
        },
        openRecordDetails: function (record, changed, isCurrentRecord) {
          return nativeNoteById(view, record.id, function (note) {
            if (!isCurrentRecord()) return;
            openNote(note, { onSaved: function () { if (isCurrentRecord() && typeof changed === 'function') changed(); } });
          });
        },
        openCalendar: function (id) { return nativeNoteById(view, id, function (note) { openNote(note); }); }
      });
    }
    return true;
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = w.VildaHomeWorkspace.createDialog({ id: 'vhomePatientDialog', titleId: 'vhomePatientTitle', title: 'Karta pacjenta',
      applyLabel: 'Zamknij', onApply: function () { close(false, true); }, onClose: function () { close(false, true); } });
    dialog.querySelector('.vhome-dialog-cancel').hidden = true;
    var status = el('p', 'vhome-patient-dialog-status'); status.dataset.homePatientStatus = ''; status.setAttribute('role', 'status');
    dialog.querySelector('.vhome-dialog-footer').prepend(status);
    function parentRemoved() {
      if (modal && (!dialog.isConnected || !dialog.open)) close(true, false);
    }
    dialog.addEventListener('close', parentRemoved);
    if (typeof w.MutationObserver === 'function') {
      var parentObserver = new w.MutationObserver(parentRemoved);
      parentObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
      parentObserver.observe(d.documentElement, { childList: true, subtree: true });
    }
  }
  function open(mode, options) {
    if (!current(active)) { requestRead(); return false; }
    mode = mode || 'overview'; options = options || {};
    if (nativeView?.isEditing?.()) { announce('Najpierw zakończ lub anuluj otwarty formularz planu.'); return false; }
    if (noteView?.isCurrent?.()) {
      if (!noteView.requestClose()) return false;
      noteView = null;
    }
    if (w.VildaHomePatientNative && typeof w.VildaAuthUI?.showPatientCard === 'function') {
      var target = { overview: 'antro', status: 'antro', labs: 'lab', care: 'care', notes: 'notes', timeline: 'timeline', treatment: 'treatment', sga: 'antro' }[mode] || 'antro';
      var nativeOptions = Object.assign({}, options, { activeTab: target });
      if (options.planId) nativeOptions.carePlanId = options.planId;
      if (options.noteId) nativeOptions.careNoteId = options.noteId;
      if (options.detail) nativeOptions.careDetail = options.detail;
      var opener = d.activeElement && card.contains(d.activeElement) ? d.activeElement.id : 'vhomePatientExpand';
      w.VildaAuthUI.showPatientCard(active.owner.patientId, null, { homePatientPresentation: true, homePatientOpenerId: opener }, nativeOptions);
      return true;
    }
    // Recover an asset/version failure visibly; never substitute the retired
    // overview for the accepted native card.
    ensureDialog();
    if (!dialog.isConnected) d.body.appendChild(dialog);
    if (!dialog.open) {
      modal = { opener: d.activeElement, mode: 'unavailable', history: null };
      var pending = modal;
      pending.history = w.VildaHomeDialogHistory.create({ group: active,
        isOpen: function () { return modal === pending && dialog.open; },
        requestClose: function () { return close(false, true); } });
      pending.history.enter(); w.VildaHomeWorkspace.fitDialog(dialog); dialog.showModal();
    }
    dialog.querySelector('.vhome-dialog-body').replaceChildren(el('p', 'vhome-patient-empty', 'Nie można otworzyć Karty pacjenta. Odśwież aplikację.'));
    return false;
  }

  function refresh() {
    frame = 0; if (!started) return;
    subscribe(w.VildaVault);
    var owner = ownerSnapshot(), key = JSON.stringify(owner);
    if (active && !current(active)) clearDecrypted();
    if (!owner) { renderPreview(); return; }
    if (!active) {
      try {
        active = { owner: owner, key: key, vault: w.VildaVault,
          token: w.VildaVault.captureSyncOperationSession(), generation: generation };
      } catch (_) { active = null; renderPreview(); return; }
      refreshRequested = true;
      d.dispatchEvent(new w.CustomEvent('vilda:home-patient-inline-ready'));
    }
    if (refreshRequested) { refreshRequested = false; load(active, 0); }
    renderPreview();
    refreshInline();
  }
  function schedule() { if (!frame) frame = w.requestAnimationFrame(refresh); }
  function start() {
    if (started || !w.VildaHomeWorkspace || !w.VildaHomePatientData || !w.VildaHomeDialogHistory || !byId('vhomeMainCards')) return;
    started = true; var grid = byId('vhomeMainCards');
    card = el('section', 'vhome-patient-card'); card.id = 'vhomePatientCard'; card.setAttribute('aria-labelledby', 'vhomePatientHeading');
    var heading = el('div', 'vhome-patient-heading'), title = el('h2', '', 'Karta pacjenta'); title.id = 'vhomePatientHeading';
    var expand = button('', function () { open('overview'); }, 'vhome-patient-expand'); expand.id = 'vhomePatientExpand';
    expand.setAttribute('aria-label', 'Powiększ kartę pacjenta'); expand.setAttribute('aria-haspopup', 'dialog'); expand.setAttribute('aria-controls', 'vhomePatientDialog');
    var icon = byId('vhomeGrowthExpand')?.querySelector('svg'); if (icon) expand.appendChild(icon.cloneNode(true));
    var headingCopy = el('div', 'vhome-patient-heading-copy'), treatment = el('p', 'vhome-patient-treatment-summary');
    treatment.id = 'vhomePatientTreatmentSummary'; treatment.hidden = true;
    headingCopy.append(title, treatment); heading.append(headingCopy, expand); card.appendChild(heading);
    var tabs = el('div', 'vhome-patient-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Dokumentacja pacjenta');
    tabNames.forEach(function (entry) {
      var tab = button('', function () { selectTab(entry[0], false); }, 'vhome-patient-tab');
      tab.id = 'vhomePatientTab-' + entry[0]; tab.dataset.homePatientTab = entry[0]; tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'vhomePatientPanel-' + entry[0]); tab.appendChild(el('span', 'vhome-patient-tab-label', entry[1]));
      if (entry[0] === 'labs') { var count = el('span', 'vhome-patient-count'); count.id = 'vhomePatientLabCount'; count.hidden = true; tab.appendChild(count); }
      tabs.appendChild(tab);
    });
    tabs.addEventListener('keydown', function (event) {
      var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']; if (keys.indexOf(event.key) === -1) return;
      var index = tabNames.findIndex(function (entry) { return entry[0] === selectedTab; });
      index = event.key === 'Home' ? 0 : event.key === 'End' ? tabNames.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabNames.length) % tabNames.length;
      event.preventDefault(); selectTab(tabNames[index][0], true);
    }); card.appendChild(tabs);
    tabNames.forEach(function (entry) {
      var panel = el('div', 'vhome-patient-tabpanel'); panel.id = 'vhomePatientPanel-' + entry[0]; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'vhomePatientTab-' + entry[0]); card.appendChild(panel);
    });
    // Real DOM order is also the single-column and keyboard order.
    var growth = byId('vhomeGrowthCard'), diet = byId('vhomeDietCard');
    if (growth) growth.after(card); else if (diet) diet.before(card); else grid.appendChild(card);
    lifecycle.forEach(function (name) { d.addEventListener(name, function (event) {
      if (name === 'vilda:patient-loaded' && ownsSavePublication(event,inline?.patientId)) { requestRead(); return; }
      clearDecrypted(); schedule();
    }); });
    // Native Clear is dispatched on window, not always on document.
    w.addEventListener('vilda:user-state-cleared', function () { clearDecrypted(); schedule(); });
    ['vilda:auth-boot-settled', 'vilda:auth-hidden', 'vilda:main-session-restored', 'vilda:initial-main-session-restore-settled',
      'vilda:state-restored', 'vildaProAccessChanged', 'vilda:sync-merged', 'vilda:clcr-results-changed'].forEach(function (name) { d.addEventListener(name, requestRead); });
    d.addEventListener('vilda:patient-profile-changed', function (event) { refreshPresentation(event.detail?.patientId); });
    ['input', 'change'].forEach(function (name) { d.addEventListener(name, function () { if (active && !current(active)) clearDecrypted(); schedule(); }); });
    w.addEventListener('pageshow', requestRead);
    // The native APIs have no generic account-change subscription. This small
    // owner check also covers direct same-tab session changes between events.
    w.setInterval(function () {
      if (active && !current(active)) { clearDecrypted(); schedule(); }
      else if (!active) {
        // A shell pane may finish restoring after its last data event. Resume
        // a requested overview only when its owner can be verified again.
        var host = byId('vhomePatientOverview');
        if (host && !host.hidden && ownerSnapshot()) schedule();
      }
    }, 250);
    refresh();
  }
  w.VildaHomePatient = Object.freeze({ open: open, close: close, refresh: requestRead,
    getPatientPresentation: function (id) {
      var view = active;
      return w.__VILDA_HOME_GABINET_PREVIEW__ === true && current(view) && id === view.owner.patientId && view.presentation
        ? Object.assign({}, view.presentation) : null;
    },
    openInline: openInline, closeInline: closeInline, selectInline: selectInline, ownsInline: ownsInline, focusInlineNote: focusInlineNote,
    focusInlineCarePlan, focusInlineReminder, applyInlineReminderFocus, ownsSavePublication: ownsSavePublication,
    isInlineOpen: function () { return !!inline && ownsInline(inline, inline.patientId); },
    captureOwner: function () { var view = active; return view ? function () { return current(view); } : null; }
  });
  d.addEventListener('vilda:home-workspace-ready', start);
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(typeof window !== 'undefined' ? window : null);
