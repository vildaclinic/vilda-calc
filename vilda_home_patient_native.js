/* Opt-in B1 presentation of the authoritative native patient card.
 * Native AuthUI retains reads, computations, actions, routing and history.
 * This module only moves the supplied live nodes and presents their results.
 */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomePatientNative) return;
  var d = w.document, active = null, serial = 0, boundVaults = new WeakSet();
  var order = ['antro', 'treatment', 'traj', 'notes', 'timeline', 'lab', 'care'];
  var names = { antro: 'Status', treatment: 'Leczenie', traj: 'Siatki centylowe', notes: 'Notatki', timeline: 'Historia', lab: 'Badania', care: 'Plany opieki', reminders: 'Przypomnienia' };
  var focusActions = new Set(['new-diagnosis', 'edit-diagnosis', 'new-therapy', 'edit-therapy', 'show-therapy', 'new-followup', 'edit-followup']);

  function node(tag, className, value) {
    var item = d.createElement(tag);
    if (className) item.className = className;
    if (value != null) item.textContent = value;
    return item;
  }
  function button(label, callback, className) {
    var item = node('button', className || 'vhome-b1-button', label);
    item.type = 'button'; item.addEventListener('click', callback); return item;
  }
  function dateLabel(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value.slice(8) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4) : '';
  }
  function describeLegacy(panels) {
    if (!Array.isArray(panels)) return '';
    return [[panels[0], 'Leczenie GH / IGF-1'], [panels[2], 'Leczenie otyłości']].filter(function (entry) { return entry[0]; })
      .map(function (entry) {
        var state = entry[0].querySelector('.vilda-gh-summary-head .vilda-gh-summary-chip');
        return entry[1] + (state?.textContent ? ' · ' + state.textContent.trim() : '');
      }).join(' · ');
  }
  function blocked(view) {
    return !!(view.treatment?.isEditing?.() || view.note?.isEditing?.() || view.dialogCleanups.size
      || view.inline && w.VildaHomeRemindersRuntime?.overviewIsEditing?.());
  }
  function resumeRefresh(view) {
    if (!view || !view.deferred || view.resumeQueued) return;
    view.resumeQueued = true;
    Promise.resolve().then(function () {
      view.resumeQueued = false;
      if (!current(view) || !view.deferred || blocked(view)) return;
      view.deferred = false; view.resumeNativeRefresh();
    });
  }
  function loadedSequence() {
    try { return w.VildaDataImportExport?.getApplyLoadedDataSequence?.(); }
    catch (_) { return null; }
  }
  function current(view) {
    try {
      if (!view || view.disposed || active !== view || view.vault !== w.VildaVault || !view.vault.isUnlocked()) return false;
      view.vault.assertSyncOperationSession(view.token);
      if (w.VildaProAccess && !w.VildaProAccess.hasAccess()) return false;
      if (view.homeOwner && view.homeOwner() !== true) return false;
      return view.ownerCurrent() === true && view.root.isConnected && loadedSequence() === view.loaded;
    } catch (_) { return false; }
  }
  function captureFocus(view, native) {
    if (!native.backgroundRefresh || !view || native.patientId !== view.patientId || !current(view)) return null;
    var focused = d.activeElement;
    if (!focused || !view.root.contains(focused) || !focused.matches('button[data-treatment-action]') || !focused.getClientRects().length) return null;
    var action = focused.dataset.treatmentAction, id = focused.dataset.treatmentId || '';
    if (!focusActions.has(action) || id.length > 256) return null;
    // Opaque UI identity only: never retain the detached button or its record.
    return { action: action, id: id };
  }
  function clearFocus(view) {
    view.pendingFocus = null;
    if (!view.cancelFocus) return;
    d.removeEventListener('focusin', view.cancelFocus, true);
    d.removeEventListener('pointerdown', view.cancelFocus, true);
    d.removeEventListener('keydown', view.cancelFocus, true);
    view.cancelFocus = null;
  }
  function armFocus(view) {
    if (!view.pendingFocus) return;
    view.cancelFocus = function () { if (!view.restoringFocus) clearFocus(view); };
    d.addEventListener('focusin', view.cancelFocus, true);
    d.addEventListener('pointerdown', view.cancelFocus, true);
    d.addEventListener('keydown', view.cancelFocus, true);
  }
  function restoreFocus(view, final) {
    var hint = view.pendingFocus;
    if (!hint) return;
    if (!current(view) || view.selected !== 'treatment') { clearFocus(view); return; }
    var target = Array.from(view.root.querySelectorAll('button[data-treatment-action]')).find(function (item) {
      return item.dataset.treatmentAction === hint.action && (item.dataset.treatmentId || '') === hint.id;
    });
    if (target && !target.disabled && target.getClientRects().length) {
      view.restoringFocus = true;
      try { target.focus({preventScroll: true}); } finally { view.restoringFocus = false; clearFocus(view); }
    } else if (final) clearFocus(view);
  }
  function wipe(root) {
    if (!root) return;
    root.querySelectorAll('input,textarea,select').forEach(function (field) { try { field.value = ''; } catch (_) {} });
    var descendants = Array.from(root.querySelectorAll('*'));
    root.remove(); descendants.forEach(function (item) { item.textContent = ''; }); root.textContent = '';
  }
  function hideMenu(view, focus) {
    if (!view || !view.menu) return;
    view.menu.hidden = true; view.menuToggle.setAttribute('aria-expanded', 'false');
    if (view.menuBack) { view.menuBack(); view.menuBack = null; }
    if (focus && current(view)) view.menuToggle.focus({ preventScroll: true });
  }
  function destroy(view) {
    if (!view || view.disposed) return;
    view.disposed = true; hideMenu(view, false);
    clearFocus(view);
    if (view.observer) view.observer.disconnect();
    if (view.fit) { w.removeEventListener('resize', view.fit); w.visualViewport?.removeEventListener('resize', view.fit); }
    // Invalidate the exact owner before disposing native async editors. Their
    // existing submit guards must never borrow a replacement card's lifetime.
    var disposeNativeViews = view.disposeNativeViews; view.disposeNativeViews = null;
    if (typeof disposeNativeViews === 'function') disposeNativeViews();
    if (view.treatment) view.treatment.destroy();
    if (view.note) view.note.destroy();
    view.dialogCleanups.forEach(function (cleanup) { cleanup(); }); view.dialogCleanups.clear();
    if (view.back) view.back();
    d.removeEventListener('pointerdown', view.outside);
    d.removeEventListener('vilda:patient-loaded', view.ownerChanged);
    d.removeEventListener('vilda:data-applied', view.ownerChanged);
    d.removeEventListener('vilda:user-state-cleared', view.ownerChanged);
    w.removeEventListener('vilda:user-state-cleared', view.ownerChanged);
    if (active === view) active = null;
    if (view.reminderSlot) w.VildaHomeRemindersRuntime?.unmountOverview?.(view.reminderSlot);
    wipe(view.root);
    view.root = null; view.panels = null; view.tabs = null; view.treatment = null;
  }
  function close(view) {
    if (!current(view)) return false;
    hideMenu(view, false);
    if (view.note?.isEditing?.()) return view.note.requestClose() === true && !view.note.isEditing();
    if (view.treatment?.isEditing?.()) return view.treatment.requestClose() === true && !view.treatment.isEditing();
    var nativeClose = view.close;
    nativeClose();
    if (!view.root?.isConnected) destroy(view);
    var opener = view.openerId && d.getElementById(view.openerId);
    if (opener?.isConnected) opener.focus({preventScroll: true});
    return true;
  }
  function showMenu(view) {
    if (!current(view)) return;
    if (!view.menu.hidden) { hideMenu(view, true); return; }
    view.menu.hidden = false; view.menuToggle.setAttribute('aria-expanded', 'true');
    view.menuBack = view.registerBack(function () { hideMenu(view, true); });
    view.menu.querySelector('button')?.focus({ preventScroll: true });
  }
  function treatmentSummary(view, summary) {
    if (!view.summary) return;
    var generic = summary?.status === 'ready' && summary.activeCount > 0
      ? summary.activeCount === 1 ? summary.activeLabels[0] : 'Aktywne leczenie: ' + summary.activeCount : '';
    var label = [view.legacySummary, generic].filter(Boolean).join(' · ') || 'Dokumentacja leczenia pacjenta';
    view.summary.querySelector('strong').textContent = label;
  }
  function mountTreatment(view) {
    if (!current(view) || view.treatment) return;
    var module = w.VildaPatientTreatment;
    if (!module || typeof module.mount !== 'function') {
      view.treatmentBody.replaceChildren(node('p', 'vilda-patient-empty-msg', 'Moduł leczenia jest niedostępny. Odśwież aplikację.'));
      view.legacy.forEach(function (item) { view.treatmentBody.appendChild(item); });
      return;
    }
    view.treatment = module.mount(view.treatmentBody, {
      patientId: view.patientId, patientLabel: view.patientName, vault: view.vault, captureVisitBinding: view.inline?.captureVisitBinding, isCurrent: function () { return current(view); },
      titleNode: view.treatmentTitle,
      focusNoteId: view.treatmentFocus || null,
      legacyPanels: view.legacy, registerBack: view.registerBack,
      onDialog: function (dialog, metadata) { return nativeDialog(view, dialog, Object.assign({}, metadata, {historyHandled: true})); },
      onSummary: function (summary) { if (current(view)) { treatmentSummary(view, summary); resumeRefresh(view); if (summary.status === 'ready' || summary.status === 'error') restoreFocus(view, true); } },
      onChange: function (summary) {
        if (!current(view)) return;
        treatmentSummary(view, summary); view.changed(); w.VildaHomePatient?.refresh?.();
      }
    });
  }
  function select(view, key) {
    if (!view || view.disposed || !view.tabs.some(function (tab) { return tab.dataset.tab === key; })) return;
    hideMenu(view, false); view.selected = key;
    if (view.inline) view.inline.selected = key;
    view.tabs.forEach(function (tab) {
      var selected = tab.dataset.tab === key;
      tab.classList.toggle('vilda-patient-tab--active', selected);
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    });
    view.panels.forEach(function (panel) {
      var selected = panel.dataset.tab === key;
      panel.classList.toggle('vilda-patient-tab-content--hidden', !selected);
      panel.hidden = !selected;
    });
    view.mobile.value = key;
    if (view.scroller) view.scroller.scrollTop = 0;
    if (key === 'treatment') mountTreatment(view);
  }
  function choose(view, key) {
    if (!current(view)) return false;
    if (view.treatment?.isEditing?.()) { view.treatment.requestClose(); return false; }
    if (view.note?.isEditing?.()) { view.note.requestClose(); return false; }
    var target = view.tabs.find(function (tab) { return tab.dataset.tab === key; });
    if (!target) return false;
    target.click(); return true;
  }
  function nativeDialog(view, target, metadata) {
    if (!current(view) || !target) return null;
    target.classList.add('vhome-patient-native-dialog', 'vhome-b1-child-dialog');
    var closed = false, observer = null, release = null;
    function isOpen() { return target.isConnected && (typeof metadata?.isOpen === 'function' ? metadata.isOpen() : target.open); }
    function fit() { w.VildaHomeWorkspace?.fitDialog?.(target); }
    function cleanup() {
      if (closed) return; closed = true;
      target.classList.remove('vhome-b1-child-dialog');
      if (observer) observer.disconnect(); if (release) release();
      target.removeEventListener('close', sync); w.removeEventListener('resize', fit);
      w.visualViewport?.removeEventListener('resize', fit); view.dialogCleanups.delete(cleanup);
      if (typeof metadata?.dispose === 'function') metadata.dispose();
      resumeRefresh(view);
    }
    function sync() { if (!isOpen()) cleanup(); }
    if (!metadata?.historyHandled) release = view.registerBack(function () {
        if (!current(view) || !isOpen()) { cleanup(); return; }
        if (metadata && typeof metadata.requestClose === 'function') metadata.requestClose();
        else target.dispatchEvent(new w.Event('cancel', {cancelable: true}));
      });
    target.addEventListener('close', sync); w.addEventListener('resize', fit); w.visualViewport?.addEventListener('resize', fit);
    observer = new w.MutationObserver(function () { if (!isOpen() || !current(view)) cleanup(); });
    observer.observe(d.documentElement, {childList: true, subtree: true});
    view.dialogCleanups.add(cleanup); fit(); cleanup.actorLifetimeVersion = 1; return cleanup;
  }
  function statusGroups(view, native) {
    var host = native.panels.antro;
    if (!host) return;
    var original = Array.from(host.children), grids = original.filter(function (item) { return item.classList.contains('vilda-patient-stats-grid'); });
    var title = node('div', 'vhome-b1-section-heading'); title.appendChild(node('h3', '', 'Status'));
    title.appendChild(node('p', '', 'Zapisane wyniki i kontekst pacjenta.'));
    var groups = [title];
    if (grids[0] && native.measureNodes.length) {
      var measure = node('section', 'vhome-b1-status-measure');
      var context = node('div', 'vhome-b1-status-context'), date = dateLabel(native.measuredAtISO);
      context.appendChild(node('strong', '', date ? 'Pomiar · ' + date : 'Zapisany pomiar'));
      if (native.ageLabel) context.appendChild(node('span', '', native.ageLabel));
      measure.appendChild(context);
      var ageNote = original.find(function (item) { return item.classList.contains('vilda-patient-age-note'); });
      if (ageNote) measure.appendChild(ageNote);
      measure.appendChild(grids[0]); groups.push(measure);
      ['height', 'weight', 'bmi', 'cole'].forEach(function (key) {
        var item = native.primaryMetrics[key]; if (!item) return;
        item.dataset.homePatientMetric = key;
        if (key === 'weight') item.querySelector('.vilda-patient-stat-label').textContent = 'Masa';
        var value = item.querySelector('.vilda-patient-stat-value');
        if (value) {
          value.dataset.homePatientMetricValue = '';
          // Split only an already formatted value; no number or unit changes.
          var formatted = value.textContent, parts = /^(.*?)(\s*(?:kg\/m²|cm|kg|%))$/.exec(formatted);
          if (parts) value.replaceChildren(d.createTextNode(parts[1]), node('span', 'vhome-b1-metric-unit', parts[2]));
        }
        item.dataset.tone = item.classList.contains('vilda-patient-stat--alert') ? 'danger'
          : item.classList.contains('vilda-patient-stat--improve') ? 'warn'
            : item.classList.contains('vilda-patient-stat--ok') ? 'normal' : 'neutral';
        var assessment = native.metricAssessments && native.metricAssessments[key];
        if (['bmi','cole'].indexOf(key) !== -1 && typeof assessment === 'string' && assessment.trim()) {
          var alreadyShown = Array.from(item.querySelectorAll('.vilda-patient-stat-sub,.vilda-patient-stat-sub-alt,.vilda-patient-stat-extra,.vhome-b1-assessment'))
            .some(function (text) { return text.textContent.trim() === assessment.trim(); });
          if (!alreadyShown) item.appendChild(node('span', 'vhome-b1-assessment', assessment));
        }
      });
    }
    var growthNodes = native.growthNodes.filter(function (item) { return item && item !== native.sgaNode; });
    if (growthNodes.length) {
      var growth = node('section', 'vhome-b1-status-growth');
      var head = node('div', 'vhome-b1-section-heading'); head.appendChild(node('h3', '', 'Wzrastanie i dane rodzinne'));
      var analysis = button('Pełna analiza', function () {
        if (!current(view)) return;
        if (view.inline) view.inline.onAnalysis();
        else { view.close(); w.VildaHomeGrowth?.open?.('analysis'); }
      }, 'vhome-b1-text-button'); head.appendChild(analysis); growth.appendChild(head);
      var grid = node('div', 'vilda-patient-stats-grid'); growthNodes.forEach(function (item) { grid.appendChild(item); });
      growth.appendChild(grid); groups.push(growth);
    }
    if (native.sgaNode) {
      native.sgaNode.classList.add('vhome-b1-sga-summary'); groups.push(native.sgaNode);
    }
    native.extraPanels.filter(Boolean).forEach(function (item) { groups.push(item); });
    original.forEach(function (item) {
      if (item.classList.contains('vilda-patient-empty-msg') || item.classList.contains('vilda-copy-summary-row')) groups.push(item);
    });
    view.summary = node('div', 'vhome-b1-treatment-summary');
    view.summary.appendChild(node('strong', '', view.legacySummary || 'Dokumentacja leczenia pacjenta'));
    view.summary.appendChild(button('Otwórz leczenie →', function () { choose(view, 'treatment'); }, 'vhome-b1-text-button'));
    groups.push(view.summary); host.replaceChildren.apply(host, groups);
  }
  function decorate(native) {
    if (!native || !native.root || !native.patientId || typeof native.isCurrent !== 'function' || typeof native.selectTreatment !== 'function') return null;
    var focus = captureFocus(active, native);
    if (active) destroy(active);
    var vault = w.VildaVault, token;
    try { token = vault.captureSyncOperationSession(); } catch (_) { return null; }
    var root = native.root, view = {
      root: root, patientId: native.patientId, patientName: native.patientName || 'Pacjent', openerId: native.openerId || '', vault: vault, token: token, loaded: loadedSequence(), ownerCurrent: native.isCurrent,
      homeOwner: w.VildaHomePatient?.captureOwner?.() || null, inline: native.inline || null,
      disposed: false, selected: native.activeTab || 'antro', close: native.close, changed: native.onChanged, disposeNativeViews: native.disposeNativeViews,
      registerBack: native.registerBack, legacy: native.legacyPanels.filter(Boolean), legacySummary: native.legacySummary || '',
      tabs: [], panels: [], treatment: null, note: null, treatmentFocus: native.focusNoteId || null, dialogCleanups: new Set(), menuBack: null, observer: null, back: null, mounted: false,
      deferred: false, resumeQueued: false, resumeNativeRefresh: native.resumeRefresh, pendingFocus: focus, cancelFocus: null, restoringFocus: false
    };
    active = view; var suffix = String(++serial);
    root.classList.add('vhome-native-patient-card'); root.dataset.homePatientId = view.patientId;
    var header = node('header', 'vhome-b1-heading'), identity = node('div', 'vhome-b1-heading-copy');
    identity.appendChild(node('h2', '', 'Karta pacjenta')); identity.appendChild(node('span', 'vhome-b1-identity', native.patientName || 'Pacjent'));
    var actions = node('div', 'vhome-b1-actions'), menuWrap = node('div', 'vhome-b1-menu-wrap');
    view.menuToggle = button('Działania ⌄', function () { showMenu(view); }, 'vhome-b1-menu-toggle');
    view.menuToggle.setAttribute('aria-haspopup', 'menu'); view.menuToggle.setAttribute('aria-expanded', 'false');
    view.menu = node('div', 'vhome-b1-action-menu'); view.menu.id = 'vhomePatientNativeActions-' + suffix;
    view.menu.hidden = true; view.menu.setAttribute('role', 'menu'); view.menuToggle.setAttribute('aria-controls', view.menu.id);
    [['edit','Edytuj pacjenta'],['newMeasure','Nowy pomiar'],['visits','Historia wizyt'],['versions','Historia wersji'],['load',null],['return',null]].forEach(function (entry) {
      if (view.inline && (entry[0] === 'load' || entry[0] === 'return')) return;
      var item = native.actions[entry[0]]; if (!item) return;
      if (view.inline && entry[0] === 'visits' && w.VildaHomeGabinet?.openVisitHistory) {
        item = button(entry[1], function () {
          if (current(view)) w.VildaHomeEncounter.history(view.patientId, view.patientName);
        }, item.className);
      }
      if (entry[1]) { item.replaceChildren(d.createTextNode(entry[1])); item.setAttribute('aria-label', entry[1]); }
      item.setAttribute('role', 'menuitem'); item.dataset.homePatientAction = entry[0];
      item.addEventListener('click', function () { hideMenu(view, false); }); view.menu.appendChild(item);
    });
    menuWrap.append(view.menuToggle, view.menu); actions.appendChild(menuWrap);
    actions.appendChild(button('×', function () { close(view); }, 'vhome-b1-close'));
    actions.lastElementChild.setAttribute('aria-label', 'Zamknij kartę pacjenta'); header.append(identity, actions);
    var mobile = node('div', 'vhome-b1-mobile-nav'), label = node('label', '', 'Sekcja karty');
    view.mobile = node('select', 'vhome-b1-mobile-select'); view.mobile.id = 'vhomePatientNativeSection-' + suffix; label.htmlFor = view.mobile.id;
    mobile.append(label, view.mobile);
    var workspace = node('div', 'vhome-b1-workspace'), nav = native.tabs;
    nav.classList.add('vhome-b1-nav'); nav.setAttribute('aria-label', 'Sekcje karty pacjenta');
    var treatmentTab = button('Leczenie', function () { if (current(view)) native.selectTreatment(); }, 'vilda-patient-tab'); treatmentTab.dataset.tab = 'treatment';
    var treatmentPanel = node('section', 'vilda-patient-tab-content vilda-patient-tab-content--hidden'); treatmentPanel.dataset.tab = 'treatment';
    view.treatmentTitle = node('h3', '', 'Leczenie'); treatmentPanel.appendChild(view.treatmentTitle);
    view.treatmentBody = node('div', 'vhome-b1-treatment-body'); treatmentPanel.appendChild(view.treatmentBody);
    var tabMap = Object.create(null); Array.from(nav.children).forEach(function (item) { if (item.dataset.tab) tabMap[item.dataset.tab] = item; }); tabMap.treatment = treatmentTab;
    var panels = Object.assign({}, native.panels, { treatment: treatmentPanel });
    var sectionOrder = order;
    if (view.inline) {
      var reminders = button(names.reminders, function () { if (current(view)) select(view, 'reminders'); }, 'vilda-patient-tab');
      reminders.dataset.tab = 'reminders';
      tabMap.reminders = reminders;
      var reminderPanel = node('section', 'vilda-patient-tab-content');
      reminderPanel.dataset.tab = 'reminders';
      view.reminderSlot = node('div'); view.reminderSlot.id = 'vhomePatientRemindersSlot';
      view.reminderSlot.dataset.homePatientId = view.patientId;
      reminderPanel.appendChild(view.reminderSlot); panels.reminders = reminderPanel; sectionOrder = order.concat('reminders');
    }
    view.scroller = node('div', 'vhome-b1-panels');
    sectionOrder.forEach(function (key) {
      var tab = tabMap[key], panel = panels[key]; if (!tab || !panel) return;
      if (['treatment','care','reminders'].indexOf(key) !== -1 && !tab.querySelector('svg')) {
        var icon = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('class', 'vilda-patient-tab-ico'); icon.setAttribute('width', '20'); icon.setAttribute('height', '20'); icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.6'); icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round'); icon.setAttribute('aria-hidden', 'true');
        var path = d.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', key === 'care' ? 'M5 4h14v17H5zM9 4V2h6v2M8 11l2 2 4-4M8 17h8' : 'M5 3v5a4 4 0 0 0 8 0V3M3 3h4M11 3h4M9 12v3a5 5 0 0 0 10 0v-3M22 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0');
        if (key === 'reminders') path.setAttribute('d', 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4');
        icon.appendChild(path); var text = tab.textContent; tab.replaceChildren(icon, node('span', 'vilda-patient-tab-lbl', text));
      }
      tab.id = 'vhomePatientNativeTab-' + suffix + '-' + key; tab.setAttribute('role', 'tab');
      panel.id = 'vhomePatientNativePanel-' + suffix + '-' + key; panel.setAttribute('role', 'tabpanel');
      tab.setAttribute('aria-controls', panel.id); panel.setAttribute('aria-labelledby', tab.id);
      if (key === 'lab') panel.dataset.homePatientView = 'labs';
      if (key === 'care') panel.dataset.homePatientView = 'care';
      var option = node('option', '', key === 'traj' ? tab.textContent.trim() : names[key]); option.value = key; view.mobile.appendChild(option);
      nav.appendChild(tab); view.scroller.appendChild(panel); view.tabs.push(tab); view.panels.push(panel);
    });
    view.mobile.addEventListener('change', function () { choose(view, view.mobile.value); });
    nav.addEventListener('click', function (event) {
      if (!view.treatment?.isEditing?.() && !view.note?.isEditing?.()) return;
      var target = event.target.closest('button[data-tab]');
      if (!target || target.dataset.tab === view.selected) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (view.note?.isEditing?.()) view.note.requestClose(); else view.treatment.requestClose();
    }, true);
    nav.addEventListener('keydown', function (event) {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].indexOf(event.key) === -1) return;
      var index = Math.max(0, view.tabs.indexOf(d.activeElement));
      index = event.key === 'Home' ? 0 : event.key === 'End' ? view.tabs.length - 1
        : (index + (['ArrowDown','ArrowRight'].indexOf(event.key) !== -1 ? 1 : -1) + view.tabs.length) % view.tabs.length;
      event.preventDefault(); view.tabs[index].focus({ preventScroll: true }); choose(view, view.tabs[index].dataset.tab);
    });
    workspace.append(nav, view.scroller);
    var footer = node('footer', 'vhome-b1-footer'); footer.appendChild(node('span', 'vhome-b1-footer-note', 'Dokumentacja tego pacjenta'));
    footer.appendChild(button('Zamknij kartę', function () { close(view); }));
    statusGroups(view, native); root.replaceChildren(header, mobile, workspace, footer);
    view.outside = function (event) { if (view.menu && !view.menu.hidden && !menuWrap.contains(event.target)) hideMenu(view, false); };
    d.addEventListener('pointerdown', view.outside);
    root.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !view.menu.hidden) { event.preventDefault(); event.stopImmediatePropagation(); hideMenu(view, true); }
    }, true);
    view.ownerChanged = function () { if (view.mounted && !current(view)) destroy(view); };
    ['vilda:patient-loaded','vilda:data-applied','vilda:user-state-cleared'].forEach(function (name) { d.addEventListener(name, view.ownerChanged); });
    w.addEventListener('vilda:user-state-cleared', view.ownerChanged);
    if (w.VildaHomePatientNativeNote?.create) view.note = w.VildaHomePatientNativeNote.create({
      patientId: view.patientId, isCurrent: function () { return current(view); }, openNative: native.openNote,
      openPlan: function (destination) { if (current(view)) native.openPlan(destination); }, onDisposed: function () { resumeRefresh(view); }
    });
    if (!boundVaults.has(vault)) { boundVaults.add(vault); vault.onLock(function () { if (active?.vault === vault) destroy(active); }); }
    return Object.freeze({
      actorLifetimeVersion: typeof w.VildaHomePatient?.captureOwner === 'function' ? 1 : 0,
      select: function (key) { select(view, key); },
      onDialog: function (target, metadata) { return nativeDialog(view, target, metadata); },
      openNote: function (request) {
        if (!current(view) || request?.patientId !== view.patientId) return false;
        if (request.note && Object.prototype.hasOwnProperty.call(request.note, 'treatmentContext')) {
          view.treatmentFocus = request.note.id; choose(view, 'treatment'); view.treatment?.focusRecord?.(view.treatmentFocus); return true;
        }
        return view.note ? view.note.open(request) : false;
      },
      mounted: function () {
        if (view.disposed || !root.isConnected) return;
        view.mounted = true; armFocus(view); select(view, view.selected);
        // The connected hidden treatment host may perform its guarded read.
        // Status must include persisted generic therapies on first opening.
        mountTreatment(view);
        var shell = root.parentElement, heading = header.querySelector('h2');
        heading.id = 'vhomePatientNativeHeading-' + suffix;
        if (shell?.classList.contains('vilda-auth-card')) shell.setAttribute('aria-labelledby', heading.id);
        if (view.reminderSlot) w.VildaHomeRemindersRuntime?.mountOverview?.(view.reminderSlot, view.patientId);
        view.fit = function () {
          if (!shell?.isConnected) return;
          w.VildaHomeWorkspace?.fitDialog?.(shell);
          var height = shell.style.getPropertyValue('--vhome-dialog-viewport-height');
          // The overlay must share the fitted card's measured visible iframe
          // height; CSS cannot read its intersection with the parent viewport.
          if (height && shell.parentElement) shell.parentElement.style.setProperty('--vhome-dialog-viewport-height', height);
        };
        if (!view.inline) { view.fit(); w.addEventListener('resize', view.fit); w.visualViewport?.addEventListener('resize', view.fit); }
        view.observer = new w.MutationObserver(function () { if (!current(view)) destroy(view); });
        view.observer.observe(d.documentElement, { childList: true, subtree: true });
      },
      destroy: function () { destroy(view); },
      isCurrent: function () { return current(view); }
    });
  }
  w.VildaHomePatientNative = Object.freeze({ decorate: decorate, describeLegacy: describeLegacy,
    selectInline: function (key) { return !!active?.inline && choose(active, key); },
    releaseInline: function (force) {
      if (!active?.inline) return true;
      if (!force && blocked(active)) return false;
      destroy(active); return true;
    },
    deferRefresh: function () { if (!active || !current(active) || !blocked(active)) return false; active.deferred = true; return true; },
    close: function (force) { if (!active) return true; if (force) { var view = active; destroy(view); view.close(); return true; } return close(active); },
    isOpen: function () { return !!(active && current(active)); }
  });
})(typeof window !== 'undefined' ? window : null);
