/* First increment of the doctor's home workspace. Opt-in is supplied only by
 * the isolated preview build. Existing clinical nodes, listeners and collectors
 * retain ownership; this module neither computes nor saves patient data. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomeWorkspace) return;
  var d = w.document, started = false, frame = 0;
  var dateLabel, historyButton, copyButton, copySource, actions, referenceSection, referenceToggle;
  var referenceSelect, referenceChoices = [];
  var deviceResizeParent = null, deviceFrameObserver = null;

  function element(tag, className, text) {
    var node = d.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function byId(id) { return d.getElementById(id); }
  function deviceViewportWindow() {
    try {
      if (w.parent !== w && w.frameElement && w.frameElement.classList.contains('app-pane')) {
        // Reading the width verifies same-origin access before the parent is
        // used. Shell initialization need not have published its API yet.
        if (typeof w.parent.innerWidth === 'number') return w.parent;
      }
    } catch (_) { /* A foreign embed keeps its own viewport. */ }
    return w;
  }
  function getDeviceViewportWidth() { return deviceViewportWindow().innerWidth; }
  function refreshDeviceLayout() {
    d.documentElement.classList.toggle('vhome-device-compact', getDeviceViewportWidth() <= 1024);
  }
  function unbindDeviceViewportResize() {
    if (deviceResizeParent) {
      try { deviceResizeParent.removeEventListener('resize', schedule); } catch (_) { /* Parent navigation can revoke access. */ }
    }
    if (deviceFrameObserver) deviceFrameObserver.disconnect();
    deviceResizeParent = null; deviceFrameObserver = null;
  }
  function bindDeviceViewportResize() {
    var parent = deviceViewportWindow();
    if (parent === deviceResizeParent) return;
    unbindDeviceViewportResize();
    if (parent === w) return;
    parent.addEventListener('resize', schedule); deviceResizeParent = parent;
    // A native pane replacement can discard this document. Release the
    // parent's callbacks even if that teardown does not deliver pagehide.
    var ownedFrame = w.frameElement;
    if (ownedFrame && typeof w.MutationObserver === 'function') {
      deviceFrameObserver = new w.MutationObserver(function () {
        if (!ownedFrame.isConnected || ownedFrame.contentDocument !== d) unbindDeviceViewportResize();
      });
      deviceFrameObserver.observe(parent.document.documentElement, { childList: true, subtree: true });
    }
  }
  function currentPatientId() {
    try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; }
    catch (_) { return null; }
  }
  function appendExisting(host, ids, label) {
    ids.forEach(function (id) {
      var node = byId(id);
      if (node && label) node = node.closest('label');
      if (node) host.appendChild(node);
    });
  }
  function fieldGroup(host, title, ids) {
    var section = element('div', 'vhome-field-section');
    if (title) section.appendChild(element('h3', 'vhome-section-title', title));
    var grid = element('div', 'vhome-fields');
    appendExisting(grid, ids, true);
    section.appendChild(grid);
    host.appendChild(section);
    return section;
  }
  function buttonLabel(button, title, subtitle, compact) {
    var label = element('span', 'vhome-action-label');
    label.appendChild(element('span', 'vhome-action-full', title));
    label.appendChild(element('span', 'vhome-action-compact', compact));
    label.appendChild(element('small', '', subtitle));
    button.replaceChildren(label);
    button.setAttribute('aria-label', title);
  }
  function doctorResults() {
    var available;
    try { available = !!(w.VildaVault && w.VildaVault.isUnlocked() && w.VildaProAccess && w.VildaProAccess.hasAccess()); }
    catch (_) { available = false; }
    var toggle = byId('resultsModeToggle');
    // Keep the native control and its listener: it owns the local and window
    // mode, persisted preference, source eligibility and recalculation. A CSS
    // class or a write to window.professionalMode alone would leave them apart.
    var restoring = w.__vildaPersistRestoring || w.__vildaSuspendIntakeUserReset
      || w.VildaDataImportExport && w.VildaDataImportExport.isMainSessionRestorePending()
      || w.VildaDobAge && w.VildaDobAge.restorePending();
    // Main-session restore also restores the mode, but can leave an earlier
    // access notification's checkbox checked. Reconcile both native states.
    if (available && toggle && (!toggle.checked || w.professionalMode !== true) && !toggle.disabled && !restoring
      && w.VildaAuthUI && w.VildaAuthUI.isBootReady()) {
      toggle.checked = true;
      toggle.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    d.documentElement.classList.toggle('vhome-doctor-results', !!(available && toggle && toggle.checked && w.professionalMode));
  }
  function refreshActions() {
    if (!copyButton || !copySource) return;
    var allowed = true;
    try {
      var preferences = w.VildaPersistence && w.VildaPersistence.readPreferenceJSON('CARD_VISIBILITY', {});
      allowed = !preferences || preferences.metabolicSummaryBtn !== false;
    } catch (_) { /* The native preference default keeps the action available. */ }
    if (copyButton.hidden === allowed) copyButton.hidden = !allowed;
    actions.classList.toggle('vhome-single-action', !allowed);
    // The native button can be unavailable while the shared section remains
    // visible for dietary advice. Its original inline visibility is therefore
    // part of eligibility even though the empty form shows a disabled action.
    var disabled = !allowed || copyButton.style.display === 'none' || copySource.hidden
      || w.getComputedStyle(copySource).display === 'none';
    if (copyButton.disabled !== disabled) copyButton.disabled = disabled;
  }
  function refreshReference() {
    if (!referenceSection || !referenceToggle) return;
    // Native eligibility owns inline display and disabled. Reading computed
    // display below our hidden carrier would keep the visible selector closed.
    var hidden = referenceToggle.hidden || referenceToggle.style.display === 'none';
    if (referenceSection.hidden !== hidden) referenceSection.hidden = hidden;
    var selected = '', available = false;
    referenceChoices.forEach(function (choice) {
      choice.option.disabled = choice.radio.disabled;
      if (!choice.radio.disabled) available = true;
      if (choice.radio.checked) selected = choice.radio.value;
    });
    referenceSelect.disabled = hidden || !available;
    if (referenceSelect.value !== selected) referenceSelect.value = selected;
  }
  function referenceInput(event) {
    if (event.target !== referenceSelect) return;
    // Document-level autosave captures input/change. This nameless projection
    // must not schedule a second save: intercept only its events at Window,
    // then let the original radio's native events reach all existing owners.
    event.stopImmediatePropagation();
    if (event.type !== 'change') return;
    var choice = referenceChoices.find(function (item) { return item.radio.value === referenceSelect.value; });
    if (choice && !referenceSelect.disabled && !referenceSection.hidden && !choice.radio.disabled) choice.radio.click();
    refreshReference();
  }
  function civilDate() {
    var value = null;
    try {
      if (w.VildaDobAge && typeof w.VildaDobAge.readMeasuredAtISO === 'function') {
        value = w.VildaDobAge.readMeasuredAtISO();
      }
      if (!value && w.sessionStorage.getItem('vildaLoadChoiceV1') === 'restore') return null;
    } catch (_) { return null; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
      + '-' + String(now.getDate()).padStart(2, '0');
  }
  function refresh() {
    if (!started) return;
    refreshDeviceLayout();
    doctorResults();
    var date = civilDate();
    dateLabel.textContent = date ? date.slice(8, 10) + '.' + date.slice(5, 7) + '.' + date.slice(0, 4) : 'Data nieznana';
    if (date) dateLabel.setAttribute('datetime', date);
    else dateLabel.removeAttribute('datetime');
    var id = currentPatientId(), available;
    try { available = !!(id && w.VildaVisitHistory && w.VildaVault && w.VildaVault.isUnlocked()); }
    catch (_) { available = false; }
    historyButton.disabled = !available;
    historyButton.title = available ? 'Otwórz zapisane wizyty pacjenta' : 'Wczytaj zapisanego pacjenta, aby zobaczyć jego wizyty';
    refreshActions();
    refreshReference();
  }
  function schedule() {
    if (frame) return;
    frame = w.requestAnimationFrame(function () { frame = 0; refresh(); });
  }
  function openHistory() {
    var id = currentPatientId();
    if (!id || !w.VildaVisitHistory) return;
    w.VildaVisitHistory.open(id, {
      patientName: byId('name') ? byId('name').value : '',
      isCurrent: function () { return currentPatientId() === id; }
    });
  }
  var pubertyDialog = null, pubertyDraft = null;
  function decorateShortcut(button, secondLine, statusId) {
    var title = element('span', 'vhome-shortcut-title', 'Dane');
    title.appendChild(element('br')); title.appendChild(d.createTextNode(secondLine));
    var icon = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
    var path = d.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'); icon.appendChild(path);
    var status = element('small', 'vhome-shortcut-status'); status.id = statusId;
    button.replaceChildren(title, icon, status); button.classList.add('vhome-input-shortcut');
    button.setAttribute('aria-label', 'Dane ' + secondLine); button.setAttribute('aria-describedby', status.id);
    button.setAttribute('aria-haspopup', 'dialog');
    return status;
  }
  function refreshPubertyShortcut() {
    if (!started) return false;
    var button = byId('tannerToggleBtn');
    if (!button) return false;
    var status = button.querySelector('.vhome-shortcut-status');
    if (!status) {
      status = decorateShortcut(button, 'pokwitaniowe', 'vhomePubertyShortcutStatus');
      button.setAttribute('aria-controls', 'vhomePubertyDialog');
    }
    // Reuse the native, date-aware wording: an earlier or incompatible exam
    // must never look like a current examination just to fit the shortcut.
    var nativeSummary = byId('pubertyAssessmentSummary');
    var summary = nativeSummary ? nativeSummary.textContent : '';
    status.textContent = summary && summary !== 'Nie oceniono stadium'
      ? summary : 'Nie uzupełniono';
    button.setAttribute('aria-expanded', String(!!(pubertyDialog && pubertyDialog.open)));
    return true;
  }
  var pubertyFields = [
    ['advTesticularVolume', 'Objętość jąder', 'M'],
    ['pubertyOnsetAge', 'Wiek początku pokwitania · lata'],
    ['pubertyMenarcheAge', 'Wiek menarche · lata', 'F'],
    ['pubertyMenarcheHeight', 'Wzrost przy menarche · cm', 'F'],
    ['pubertyMenarcheBoneAge', 'Wiek kostny przy menarche · lata', 'F'],
    ['pubertyGnrhaStatus', 'Leczenie analogiem GnRH'],
    ['pubertyCdgp', 'Ocena lekarza · KOWD'],
    ['pubertyGnrhaStartAge', 'Wiek rozpoczęcia leczenia · lata'],
    ['pubertyGnrhaStopAge', 'Wiek zakończenia leczenia · lata']
  ];
  function pubertySnapshot() {
    var state = w.VildaPubertyAssessmentState, vault = w.VildaVault;
    if (!state || typeof state.readReadOnly !== 'function' || !state.canEdit() || !vault || !vault.isUnlocked()
      || !w.VildaAuthUI || !w.VildaAuthUI.isBootReady() || w.__vildaPersistRestoring || w.__vildaLustroWpis
      || w.VildaDataImportExport && w.VildaDataImportExport.isMainSessionRestorePending()) return null;
    if (w.VildaPanelPacjent && w.VildaPanelPacjent.nieaktualny()) return null;
    var context = state.readReadOnly();
    if (context.status === 'unavailable') return null;
    var fields = {};
    pubertyFields.forEach(function (entry) { fields[entry[0]] = byId(entry[0]).value; });
    var user = vault.getCurrentUser();
    var measured = w.VildaDobAge ? w.VildaDobAge.readMeasuredAtISO() : null;
    return { account: user && user.userId, patientId: currentPatientId(), context: context, fields: fields,
      demographic: ['sex', 'age', 'ageMonths', 'ageWeeks', 'dobInput', 'height', 'weight'].map(function (id) {
        return byId(id) ? byId(id).value : null;
      }), visit: w.VildaVisitContext ? w.VildaVisitContext.capture({ user: { measuredAtISO: measured } },
        { patientId: currentPatientId(), readOnly: true }) : null };
  }
  function pubertyCommitOwner(snapshot) {
    return snapshot && JSON.stringify([snapshot.account, snapshot.patientId, snapshot.demographic, snapshot.visit]);
  }
  function samePubertyOwner() {
    if (!pubertyDraft) return false;
    try { return JSON.stringify(pubertySnapshot()) === pubertyDraft.fingerprint; }
    catch (_) { return false; }
  }
  function closePuberty(force, restoreFocus, fromHistory) {
    if (!pubertyDialog || !pubertyDialog.open) return;
    if (!force && pubertyDraft && pubertyDraft.dirty && !w.confirm('Odrzucić niezapisane zmiany danych pokwitaniowych?')) return false;
    var draft = pubertyDraft;
    pubertyDraft = null;
    if (draft) {
      w.clearInterval(draft.timer);
      if (draft.editor) draft.editor.destroy();
    }
    pubertyDialog.close();
    pubertyDialog.removeAttribute('aria-modal');
    if (!fromHistory && draft && draft.historyToken && w.history.state && w.history.state.vildaHomeDialog === draft.historyToken) w.history.back();
    pubertyDialog.querySelector('.vhome-dialog-body').replaceChildren();
    var button = byId('tannerToggleBtn');
    if (button) { button.setAttribute('aria-expanded', 'false'); if (!force || restoreFocus) button.focus({ preventScroll: true }); }
    return true;
  }
  function pubertyDraftEvent(event) {
    if (!pubertyDialog || !pubertyDialog.open || !pubertyDialog.contains(event.target)) return;
    // Temporary controls never reach document-level autosave/activity listeners.
    // Handle their input here before stopping the event's native propagation.
    event.stopImmediatePropagation();
    if (!pubertyDraft) return;
    if (event.target.hasAttribute('data-puberty-select-axis')) {
      if (event.type === 'change') pubertyDraft.editor.handleSelect(event);
      return;
    }
    if (!event.target.hasAttribute('data-puberty-draft-field')) return;
    if (!samePubertyOwner()) { closePuberty(true); return; }
    var id = event.target.getAttribute('data-puberty-draft-field');
    pubertyDraft.fields[id] = event.target.value;
    pubertyDraft.changedFields[id] = true;
    pubertyDraft.dirty = true;
  }
  function applyPuberty() {
    if (!pubertyDraft || !samePubertyOwner()) { closePuberty(true); return; }
    var draft = pubertyDraft;
    var owner = pubertyCommitOwner(pubertySnapshot());
    var stillOwned = function () {
      try { return pubertyDraft === draft && pubertyCommitOwner(pubertySnapshot()) === owner; }
      catch (_) { return false; }
    };
    var controls = Array.from(pubertyDialog.querySelectorAll('[data-puberty-draft-field]'));
    if (controls.some(function (control) { return pubertyDraft.changedFields[control.getAttribute('data-puberty-draft-field')] && !control.closest('label').hidden && !control.reportValidity(); })) return;
    var changes = Object.keys(pubertyDraft.axes).map(function (axis) { return { axis: axis, stage: pubertyDraft.axes[axis] }; });
    // Validate the complete batch before the state module changes any axis.
    var result = changes.length ? w.VildaPubertyAssessmentState.editObservations(changes) : { ok: true };
    if (!stillOwned()) { if (pubertyDraft === draft) closePuberty(true); return; }
    if (!result || !result.ok) {
      pubertyDialog.querySelector('[data-puberty-dialog-error]').textContent = 'Nie można zastosować danych. Sprawdź aktywnego pacjenta i odtworzenie wizyty.';
      return;
    }
    var edited = Object.keys(pubertyDraft.changedFields).map(function (id) {
      var control = byId(id); control.value = pubertyDraft.fields[id]; return control;
    });
    // All canonical values are assigned before notifying existing consumers.
    if (edited.length && !changes.length) w.VildaPubertyAssessmentState.markFactsEdited();
    for (var index = 0; index < edited.length && stillOwned(); index += 1) edited[index].dispatchEvent(new w.Event('change', { bubbles: true }));
    if (!stillOwned()) { if (pubertyDraft === draft) closePuberty(true); return; }
    var dirty = draft.dirty;
    closePuberty(true, true);
    if (dirty) {
      if (w.VildaPubertyAssessmentUI) w.VildaPubertyAssessmentUI.render();
      if (typeof w.debouncedUpdate === 'function') w.debouncedUpdate();
      if (typeof w.vildaPersistFlushNow === 'function') w.vildaPersistFlushNow({ force: true });
    }
  }
  function fitDetailDialog(dialog) {
    if (!dialog) return;
    var height = w.innerHeight;
    try {
      if (w.parent !== w && w.frameElement) {
        var parentViewport = w.parent.visualViewport;
        var bottom = parentViewport ? Math.min(w.parent.innerHeight, parentViewport.offsetTop + parentViewport.height) : w.parent.innerHeight;
        height = Math.min(height, bottom - Math.max(0, w.frameElement.getBoundingClientRect().top));
      } else if (w.visualViewport) height = Math.min(height, w.visualViewport.height);
    } catch (_) { /* A foreign embed cannot expose its viewport. */ }
    if (height > 0) dialog.style.setProperty('--vhome-dialog-viewport-height', height + 'px');
  }
  function createDetailDialog(options) {
    var dialog = element('dialog', 'vhome-detail-dialog');
    dialog.id = options.id;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-labelledby', options.titleId);
    var heading = element('div', 'vhome-dialog-heading');
    var title = element('h2', '', options.title); title.id = options.titleId;
    var close = element('button', 'vhome-dialog-close', '×'); close.type = 'button';
    close.setAttribute('aria-label', 'Zamknij ' + options.title.toLowerCase()); close.addEventListener('click', options.onClose);
    heading.append(title, close);
    var body = element('div', 'vhome-dialog-body');
    var footer = element('div', 'vhome-dialog-footer');
    var cancel = element('button', 'vhome-dialog-cancel', 'Anuluj'); cancel.type = 'button';
    cancel.addEventListener('click', options.onClose);
    var apply = element('button', 'vhome-dialog-apply', options.applyLabel); apply.type = 'button';
    apply.addEventListener('click', options.onApply);
    footer.append(cancel, apply); dialog.append(heading, body, footer);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); options.onClose(); });
    dialog.addEventListener('click', function (event) {
      if (event.target !== dialog) return;
      var rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) options.onClose();
    });
    d.body.appendChild(dialog);
    var fit = function () { fitDetailDialog(dialog); };
    w.addEventListener('resize', fit);
    if (w.visualViewport) w.visualViewport.addEventListener('resize', fit);
    try {
      if (w.parent !== w) {
        w.parent.addEventListener('resize', fit);
        if (w.parent.visualViewport) w.parent.visualViewport.addEventListener('resize', fit);
      }
    } catch (_) { /* Own-document resize remains available in a foreign embed. */ }
    return dialog;
  }
  function createPubertyDialog() {
    var dialog = createDetailDialog({ id: 'vhomePubertyDialog', titleId: 'vhomePubertyTitle', title: 'Dane pokwitaniowe',
      applyLabel: 'Zastosuj dane pokwitaniowe', onApply: applyPuberty, onClose: function () { closePuberty(false); } });
    w.addEventListener('popstate', function () {
      if (!pubertyDraft || !pubertyDialog.open) return;
      if (w.history.state && w.history.state.vildaHomeDialog === pubertyDraft.historyToken) return;
      if (closePuberty(false, true, true) === false) {
        w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: pubertyDraft.historyToken }), '', w.location.href);
      }
    });
    w.addEventListener('input', pubertyDraftEvent, true);
    w.addEventListener('change', pubertyDraftEvent, true);
    ['vilda:user-state-cleared', 'vilda:patient-loaded', 'vilda:auth-loaded'].forEach(function (name) {
      d.addEventListener(name, function () { closePuberty(true); });
    });
    if (w.VildaVault && typeof w.VildaVault.onLock === 'function') w.VildaVault.onLock(function () { closePuberty(true); });
    return dialog;
  }
  function openPuberty() {
    if (!started) return false;
    if (pubertyDialog && pubertyDialog.open) return true;
    var snapshot;
    try { snapshot = pubertySnapshot(); } catch (_) { snapshot = null; }
    // A handled but not-ready request must not fall through to the live editor.
    if (!snapshot || !w.VildaPubertyAssessmentUI) return true;
    if (!pubertyDialog) pubertyDialog = createPubertyDialog();
    pubertyDraft = { fingerprint: JSON.stringify(snapshot), context: snapshot.context, fields: Object.assign({}, snapshot.fields),
      axes: {}, changedFields: {}, sex: byId('sex').value, dirty: false, editor: null, timer: null };
    var body = pubertyDialog.querySelector('.vhome-dialog-body');
    var name = [byId('firstName').value, byId('lastName').value].filter(Boolean).join(' ');
    body.appendChild(element('p', 'vhome-dialog-context', name + (name ? ' · ' : '') + (pubertyDraft.sex === 'F' ? 'Dziewczynka' : 'Chłopiec')));
    var assessment = element('section', 'vhome-dialog-section');
    assessment.appendChild(element('h3', 'vhome-assessment-heading', 'Ocena podczas wizyty'));
    var editor = element('div', 'vhome-puberty-assessment'); assessment.appendChild(editor);
    var context = snapshot.context.visitContext;
    var error = element('p', 'vhome-dialog-error'); error.setAttribute('data-puberty-dialog-error', ''); error.setAttribute('role', 'alert');
    body.append(assessment, error);
    pubertyDraft.editor = w.VildaPubertyAssessmentUI.mountEditor(editor, {
      idPrefix: 'vhomePubertyDraft', controlType: 'select', sex: function () { return pubertyDraft.sex; },
      read: function () { return pubertyDraft.context; },
      onEdit: function (axis, stage) {
        if (!samePubertyOwner() || ['ready', 'absent'].indexOf(pubertyDraft.context.status) < 0) return { ok: false };
        var model = w.VildaPubertyAssessment;
        var raw = pubertyDraft.context.assessment ? model.clone(pubertyDraft.context.assessment)
          : { version: 1, sex: pubertyDraft.sex, observations: { G: null, Th: null, P: null } };
        if (raw.sex !== pubertyDraft.sex) {
          Object.keys(raw.observations).forEach(function (key) {
            if (raw.observations[key] && !Object.prototype.hasOwnProperty.call(raw.observations[key], 'sex')) raw.observations[key].sex = raw.sex;
          }); raw.sex = pubertyDraft.sex;
        }
        raw.observations[axis] = stage === null ? null : { stage: stage, sex: pubertyDraft.sex,
          observedAtISO: context.measuredAtISO, ageMonths: context.ageMonths, source: 'clinician-entry' };
        var view = model.readUser({ pubertyAssessment: raw });
        if (view.status !== 'ready') return { ok: false };
        pubertyDraft.context = view; pubertyDraft.axes[axis] = stage; pubertyDraft.dirty = true;
        return { ok: true };
      }
    });
    var dateLabel = element('label', 'vhome-puberty-date', 'Data oceny · bieżąca wizyta');
    var dateInput = d.createElement('input'); dateInput.type = 'text'; dateInput.readOnly = true;
    dateInput.setAttribute('aria-label', 'Data oceny — data bieżącej wizyty');
    dateInput.value = context.measuredAtISO ? context.measuredAtISO.slice(8, 10) + '.' + context.measuredAtISO.slice(5, 7) + '.' + context.measuredAtISO.slice(0, 4) : ''; dateLabel.appendChild(dateInput); editor.appendChild(dateLabel);
    fitDetailDialog(pubertyDialog);
    pubertyDialog.setAttribute('aria-modal', 'true');
    pubertyDialog.showModal();
    pubertyDraft.historyToken = 'puberty-' + Date.now();
    w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: pubertyDraft.historyToken }), '', w.location.href);
    byId('tannerToggleBtn').setAttribute('aria-expanded', 'true');
    pubertyDraft.timer = w.setInterval(function () { if (!samePubertyOwner()) closePuberty(true); }, 250);
    var first = editor.querySelector('[data-puberty-select-axis]');
    if (first) first.focus({ preventScroll: true });
    return true;
  }

  function start() {
    if (started) return;
    var form = byId('calcForm'), card = d.querySelector('#userSection fieldset.user-card');
    if (!form || !card || !byId('clearAllDataBtn')) return;
    started = true;
    d.documentElement.classList.add('vilda-home-workspace');
    refreshDeviceLayout();

    var header = element('section', 'vhome-visit-heading');
    header.setAttribute('aria-label', 'Bieżąca wizyta');
    var identity = element('div', 'vhome-visit-identity');
    identity.appendChild(element('h1', 'vhome-visit-title', 'Ocena pacjenta'));
    var meta = element('div', 'vhome-visit-meta');
    var kicker = element('span', 'vhome-visit-kicker');
    kicker.appendChild(element('span', 'vhome-visit-full', 'Bieżąca wizyta'));
    var shortKicker = element('span', 'vhome-visit-short', 'Wizyta');
    shortKicker.setAttribute('aria-hidden', 'true');
    kicker.appendChild(shortKicker);
    meta.appendChild(kicker);
    dateLabel = element('time', 'vhome-visit-date');
    meta.appendChild(dateLabel);
    identity.appendChild(meta);
    header.appendChild(identity);
    historyButton = element('button', 'vhome-history-button', 'Historia wizyt');
    historyButton.type = 'button';
    historyButton.addEventListener('click', openHistory);
    header.appendChild(historyButton);
    form.before(header);

    var content = element('div', 'vhome-form-content');
    var heading = element('div', 'vhome-card-heading');
    heading.appendChild(element('h2', '', 'Dane pacjenta'));
    heading.appendChild(element('span', '', 'Bieżąca wizyta'));
    content.appendChild(heading);
    fieldGroup(content, 'Pacjent', ['firstName', 'lastName']);
    appendExisting(content, ['tozsamoscNote']);
    var demographics = fieldGroup(content, '', ['dobInput', 'sex']);
    appendExisting(demographics, ['dobNote', 'dobError', 'dobClear', 'plecZImieniaNote']);
    var age = d.querySelector('.vild-age-row');
    if (age) { age.classList.add('vhome-fields'); content.appendChild(age); }
    appendExisting(content, ['ageWeeksRow']);
    fieldGroup(content, 'Pomiary z wizyty', ['weight', 'height']);
    referenceToggle = byId('dataToggleContainer');
    if (referenceToggle) {
      referenceSection = element('div', 'vhome-reference');
      var referenceLabel = element('label', 'vhome-reference-label');
      referenceLabel.appendChild(element('span', 'vhome-reference-full', 'Siatki referencyjne'));
      referenceLabel.appendChild(element('span', 'vhome-reference-compact', 'Siatki'));
      // No id/name: the persisted source remains the original radio group.
      referenceSelect = element('select', 'vhome-reference-select');
      referenceSelect.setAttribute('aria-label', 'Siatki referencyjne');
      [['sourceOlaf', 'OLAF / OLA'], ['sourcePalczewska', 'Palczewska'], ['sourceWho', 'WHO']].forEach(function (entry) {
        var radio = byId(entry[0]);
        if (!radio) return;
        var option = element('option', '', entry[1]);
        option.value = radio.value;
        referenceSelect.appendChild(option);
        referenceChoices.push({ radio: radio, option: option });
      });
      referenceLabel.appendChild(referenceSelect);
      referenceSection.appendChild(referenceLabel);
      var nativeReference = element('div', 'vhome-reference-native');
      nativeReference.hidden = true;
      nativeReference.appendChild(referenceToggle);
      referenceSection.appendChild(nativeReference);
      content.appendChild(referenceSection);
      new w.MutationObserver(schedule).observe(referenceToggle, {
        attributes: true, subtree: true,
        attributeFilter: ['style', 'hidden', 'disabled', 'checked', 'class', 'data-manual', 'data-preferred-source']
      });
      w.addEventListener('input', referenceInput, true);
      w.addEventListener('change', referenceInput, true);
    }
    var extras = element('div', 'vhome-extra-data');
    var shortcuts = element('div', 'vhome-data-shortcuts');
    appendExisting(shortcuts, ['tannerToggleBtn']);
    extras.appendChild(shortcuts);
    appendExisting(extras, ['pubertyAssessmentSummary', 'tannerStageWrap']);
    var nativePubertySummary = byId('pubertyAssessmentSummary');
    if (nativePubertySummary) new w.MutationObserver(function () { refreshPubertyShortcut(); })
      .observe(nativePubertySummary, { childList: true, characterData: true, subtree: true });
    content.appendChild(extras);
    appendExisting(content, ['loadDataMessage']);
    actions = element('div', 'vhome-form-actions');
    var clear = byId('clearAllDataBtn'), oldActions = clear.parentElement;
    buttonLabel(clear, 'Wyczyść formularz', 'Rozpocznij nowy pomiar', 'Wyczyść');
    actions.appendChild(clear);
    copyButton = byId('metabolicSummaryBtn');
    copySource = byId('metabolicSummarySection');
    if (copyButton && copySource) {
      buttonLabel(copyButton, 'Podsumowanie wyników', 'Kliknij i skopiuj', 'Skopiuj wyniki');
      actions.appendChild(copyButton);
      new w.MutationObserver(schedule).observe(copySource, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
      new w.MutationObserver(schedule).observe(copyButton, { attributes: true, attributeFilter: ['style'] });
    }
    content.appendChild(actions);
    appendExisting(content, ['restoreStateBtn']);
    // The original action wrapper now contains only whitespace/comments. Keep
    // its identity but remove the margin that would become an empty form row.
    oldActions.classList.add('vhome-empty-action-home');
    card.appendChild(content);
    d.dispatchEvent(new w.CustomEvent('vilda:home-workspace-ready'));

    ['input', 'change', 'vilda:data-applied', 'vilda:dob-restored', 'vilda:user-state-cleared',
      'vilda:session-changed', 'vilda:professional-summary-updated', 'vilda:state-restored',
      'vilda:main-session-restored', 'vilda:initial-main-session-restore-settled',
      'vilda:auth-boot-settled', 'vildaProAccessChanged', 'vildaResultsModeChanged'].forEach(function (name) {
      d.addEventListener(name, schedule);
    });
    w.addEventListener('pageshow', function () { bindDeviceViewportResize(); schedule(); });
    w.addEventListener('pagehide', unbindDeviceViewportResize);
    w.addEventListener('resize', schedule);
    bindDeviceViewportResize();
    if (w.VildaVault && typeof w.VildaVault.onLock === 'function') w.VildaVault.onLock(schedule);
    refresh();
    if (w.VildaSummaryLayout) w.VildaSummaryLayout.refresh();
  }
  w.VildaHomeWorkspace = Object.freeze({ start: start, refresh: refresh, openPuberty: openPuberty,
    refreshPubertyShortcut: refreshPubertyShortcut, createDialog: createDetailDialog, fitDialog: fitDetailDialog,
    decorateShortcut: decorateShortcut, getDeviceViewportWidth: getDeviceViewportWidth });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
