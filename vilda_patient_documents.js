/* Patient documents: a presentation adapter for the native narrative/PDF APIs.
 * No clinical data is persisted here. A request belongs to one form and patient.
 */
(function (w) {
  'use strict';
  var d = w.document;
  if (!d || w.VildaPatientDocuments) return;
  var summary = null, summaryOwner = null, revision = 0;
  var queuedSummaryRefresh = null, activeSummaryRefresh = null;
  var pending = null, pendingRecord = null, active = null, busy = false, lastState = '';
  var watchedVaults = new WeakSet();
  var reportLabels = [
    ['visit', 'Raport po wizycie'],
    ['diet', 'Raport zaleceń dietetycznych'],
    ['centile', 'Siatka centylowa'],
    ['growth', 'Raport wzrastania']
  ];

  function handlesPage() {
    return /(?:^|\/)(?:index|docpro)\.html$/.test(w.location.pathname) || /\/$/.test(w.location.pathname);
  }

  function professional() {
    return /(?:^|\/)docpro\.html$/.test(w.location.pathname)
      || (typeof professionalMode !== 'undefined' ? !!professionalMode : w.professionalMode === true);
  }

  function owner(allowInactive) {
    try {
      if (!handlesPage()) return null;
      var frame = w.frameElement;
      if (!allowInactive && frame && (frame.hidden || frame.isConnected === false || frame.getAttribute('aria-hidden') === 'true')) return null;
      var shell = w.parent !== w && w.parent.VildaShell;
      if (!allowInactive && shell && typeof shell.isPatientDocumentsSourceCurrent === 'function'
        && !shell.isPatientDocumentsSourceCurrent(w)) return null;
      var id = w.sessionStorage.getItem('vildaCurrentPatientId') || '';
      var api = w.VildaDataImportExport, panel = w.VildaPanelPacjent;
      var dob = w.VildaDobAge, vault = w.VildaVault;
      if (api && typeof api.isMainSessionRestorePending === 'function' && api.isMainSessionRestorePending()
        || w.__vildaPersistRestoring === true || w.__vildaLustroWpis === true
        || Number(w.__vildaPersistClearUntil || 0) > Date.now()
        || dob && typeof dob.restorePending === 'function' && dob.restorePending()
        || panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()
        || panel && typeof panel.wlasciciel === 'function' && (panel.wlasciciel() || '') !== id
        || id && (!vault || typeof vault.isUnlocked !== 'function' || !vault.isUnlocked())) return null;
      if (vault && typeof vault.onLock === 'function' && !watchedVaults.has(vault)) {
        watchedVaults.add(vault);
        vault.onLock(invalidate);
      }
      var source = d.querySelector('input[name="dataSource"]:checked');
      return { id: id, sequence: api && typeof api.getApplyLoadedDataSequence === 'function'
        ? api.getApplyLoadedDataSequence() : null, loaded: w.lastLoadedData,
      source: source && source.value || '', route: w.location.pathname };
    } catch (_) { return null; }
  }

  function sameOwner(a, b) {
    return !!(a && b && a.id === b.id && a.sequence === b.sequence && a.loaded === b.loaded
      && a.source === b.source && a.route === b.route);
  }

  function readiness() {
    var reason = '', phase = 'ready', current;
    if (!handlesPage()) { reason = 'Dokumenty pacjenta są dostępne na stronie głównej i DocPro.'; phase = 'unavailable'; }
    else if (!professional()) { reason = 'Dokumenty pacjenta są dostępne w trybie PRO lub DocPro.'; phase = 'unavailable'; }
    else if (!(current = owner())) { reason = 'Poczekaj na wczytanie danych pacjenta.'; phase = 'preparing'; }
    else if (w.VildaHomeWorkspace?.hasUnspecifiedSex?.()) { reason = 'Wybierz płeć, aby przygotować dokumenty z wynikami.'; phase = 'unavailable'; }
    else if (!summary && !(w.VildaPatientReportLoader && typeof w.VildaPatientReportLoader.ensure === 'function')) { reason = 'Przygotowywanie dokumentów pacjenta…'; phase = 'preparing'; }
    else if (summary && !sameOwner(summaryOwner, current)) { reason = 'Uzupełnij dane, aby przygotować dokumenty pacjenta.'; phase = 'preparing'; }
    else if (summary && !summary.shouldShow) { reason = 'Uzupełnij dane, aby przygotować dokumenty pacjenta.'; phase = 'unavailable'; }
    return { disabled: !!reason || busy, reason: busy ? 'Przygotowywanie dokumentów pacjenta…' : reason, busy: busy, phase: busy ? 'busy' : phase };
  }

  function getState() {
    var state = readiness();
    return { disabled: state.disabled, reason: state.reason, busy: state.busy };
  }

  function publish() {
    // A stale summary and a ready empty summary can have the same public
    // disabled reason. Their presentation phases must still notify the shell.
    var value = readiness(), state = { disabled: value.disabled, reason: value.reason, busy: value.busy }, signature = JSON.stringify(value);
    if (signature === lastState) return;
    lastState = signature;
    d.dispatchEvent(new w.CustomEvent('vilda:patient-documents-state', { detail: state }));
  }

  function setSummaryState(value) {
    if (activeSummaryRefresh && !summaryRefreshCurrent(activeSummaryRefresh)) return;
    summary = { shouldShow: !!(value && value.shouldShow && (value.isDocPro || value.proMode)) };
    summaryOwner = owner(true);
    publish();
  }

  function current(record) {
    try {
      return record.revision === revision && professional() && sameOwner(record.owner, owner())
        && (!record.home || sameImportAccount(record.importAccount))
        && (!record.options.isCurrent || record.options.isCurrent());
    } catch (_) { return false; }
  }

  function focusOpener(record) {
    var target = record.options.opener;
    if (!target || !target.isConnected || !target.getClientRects().length) {
      target = record.doc.querySelector('[data-vilda-chrome-menu-btn]');
    }
    if (target && target.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
  }

  function close(record, restoreFocus) {
    record = record || active;
    if (!record || record.closed) return;
    record.closed = true;
    record.listeners.forEach(function (remove) { remove(); });
    record.listeners.length = 0;
    if (record.dialog) {
      if (record.dialog.open) record.dialog.close();
      record.dialog.remove();
    }
    record.scroll.forEach(function (saved) {
      saved.element.classList.toggle('vilda-patient-documents-scroll-lock', saved.locked);
    });
    if (active === record) active = null;
    if (restoreFocus !== false && current(record)) focusOpener(record);
    publish();
  }

  function invalidate() {
    revision += 1;
    close(active, false);
    publish();
  }

  function captureImportAccount() {
    try {
      var vault = w.VildaVault || null, auth = w.VildaAuthUI;
      var guest = w.VildaGuestMode === true || !!(auth && typeof auth.isGuestMode === 'function' && auth.isGuestMode());
      if (!vault) return guest ? { vault: null, userId: null, unlocked: false, guest: true, token: null } : null;
      if (typeof vault.isUnlocked !== 'function' || typeof vault.getCurrentUser !== 'function') return null;
      var unlocked = vault.isUnlocked(), user = vault.getCurrentUser(), userId = user && user.userId || null, token = null;
      if (unlocked) {
        if (guest || !userId || typeof vault.captureSyncOperationSession !== 'function' || typeof vault.assertSyncOperationSession !== 'function') return null;
        token = vault.captureSyncOperationSession();
        vault.assertSyncOperationSession(token);
      } else if (userId) return null;
      return { vault: vault, userId: userId, unlocked: unlocked, guest: guest, token: token };
    } catch (_) { return null; }
  }

  function sameImportAccount(scope) {
    try {
      if (!scope || (w.VildaVault || null) !== scope.vault) return false;
      var vault = scope.vault, auth = w.VildaAuthUI;
      var guest = w.VildaGuestMode === true || !!(auth && typeof auth.isGuestMode === 'function' && auth.isGuestMode());
      if (guest !== scope.guest) return false;
      if (!vault) return guest === true && scope.userId === null && scope.unlocked === false;
      var user = vault.getCurrentUser();
      if (vault.isUnlocked() !== scope.unlocked || (user && user.userId || null) !== scope.userId) return false;
      if (scope.unlocked) vault.assertSyncOperationSession(scope.token);
      return true;
    } catch (_) { return false; }
  }

  function intakeSummarySettled() {
    var state = typeof w.vildaGetIntakeRestoreReadiness === 'function' && w.vildaGetIntakeRestoreReadiness();
    return !!(state && state.pending === false && state.failed === false);
  }

  function summaryRefreshCurrent(record) {
    try {
      return w.document === d && record.revision === revision && professional()
        && w.updateProfessionalSummaryCard === record.render && intakeSummarySettled()
        && sameImportAccount(record.account) && sameOwner(record.owner, owner());
    } catch (_) { return false; }
  }

  function refreshSummaryAfterIntake() {
    if (activeSummaryRefresh) return;
    publish();
    try {
      var currentOwner = owner(), render = w.updateProfessionalSummaryCard;
      if (!intakeSummarySettled() || !professional() || !currentOwner || !summary
        || sameOwner(summaryOwner, currentOwner) || typeof render !== 'function') return;
      if (queuedSummaryRefresh && summaryRefreshCurrent(queuedSummaryRefresh)) return;
      var record = { owner: currentOwner, render: render, revision: revision, account: captureImportAccount() };
      if (!record.account || !summaryRefreshCurrent(record)) return;
      queuedSummaryRefresh = record;
      // The native summary may have rendered while intake was still pending.
      // Read and render current results after completion; never rebind its old
      // availability flag. Let a synchronous Clear/load retire this request.
      Promise.resolve().then(function () {
        if (queuedSummaryRefresh !== record) return;
        queuedSummaryRefresh = null;
        if (!summaryRefreshCurrent(record) || !summary || sameOwner(summaryOwner, record.owner)) return;
        activeSummaryRefresh = record;
        try { record.render.call(w); }
        finally { activeSummaryRefresh = null; publish(); }
      }).catch(function () { /* A failed render must not make old content ready. */ });
    } catch (_) { /* Readiness is unavailable; keep the existing summary fenced. */ }
  }

  function importCompleted(event) {
    var sequence = event && event.detail && event.detail.applySequence;
    var record = pendingRecord || active;
    // applyLoadedData emits this deferred notification after it has installed
    // the same owner. It must not close documents opened from that completed
    // operation, including a cold report still loading its native modules.
    if (record && !record.closed && Number.isSafeInteger(sequence) && sequence > 0
      && record.owner.sequence === sequence && sameImportAccount(record.importAccount) && current(record)) {
      publish();
      return;
    }
    invalidate();
  }

  function listen(record, target, name, callback, options) {
    target.addEventListener(name, callback, options);
    record.listeners.push(function () { target.removeEventListener(name, callback, options); });
  }

  function element(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(doc, label, attr) {
    var node = element(doc, 'button', '', label);
    node.type = 'button';
    node.setAttribute(attr, '');
    return node;
  }

  function reportOptions() {
    return typeof w.patientReportGetPdfChoiceOptions === 'function' ? w.patientReportGetPdfChoiceOptions() : [];
  }

  function homeIcon(doc, className, drawing) {
    var badge = element(doc, 'span', className);
    badge.setAttribute('aria-hidden', 'true');
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    var path = doc.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', drawing);
    svg.appendChild(path);
    badge.appendChild(svg);
    return badge;
  }

  function homeAction(doc, label, hint, attr) {
    var action = button(doc, '', attr);
    action.className = 'vilda-patient-documents-home-action';
    var words = element(doc, 'span');
    words.append(element(doc, 'strong', '', label), element(doc, 'small', '', hint));
    var mark = homeIcon(doc, 'vilda-patient-documents-home-mark', 'M6 18 18 6M7 6h11v11');
    action.append(words, mark);
    return action;
  }

  function homeGroup(doc, title, description, drawing, actions) {
    var group = element(doc, 'section', 'vilda-patient-documents-home-group');
    var heading = element(doc, 'div', 'vilda-patient-documents-home-heading');
    var badge = homeIcon(doc, 'vilda-patient-documents-home-icon', drawing);
    heading.append(badge, element(doc, 'h3', '', title));
    var buttons = element(doc, 'div', 'vilda-patient-documents-home-actions');
    buttons.append.apply(buttons, actions);
    group.append(heading, element(doc, 'p', 'vilda-patient-documents-home-description', description), buttons);
    return group;
  }

  function homeVisitLabel() {
    var iso = w.VildaDobAge?.readMeasuredAtISO?.();
    return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)
      ? 'Bieżąca wizyta · ' + iso.split('-').reverse().join('.') : 'Bieżąca wizyta';
  }

  function showHomeCenter(record, ui) {
    var doc = record.doc, dialog = record.dialog, options = record.options;
    var center = element(doc, 'div', 'vilda-patient-documents-home-center');
    var context = element(doc, 'div', 'vilda-patient-documents-home-context');
    var patientName = ['firstName', 'lastName'].map(function (id) {
      return d.getElementById(id)?.value.trim();
    }).filter(Boolean).join(' ');
    context.append(element(doc, 'strong', '', patientName || 'Bieżący pomiar'), element(doc, 'span', '', homeVisitLabel()));
    var grid = element(doc, 'div', 'vilda-patient-documents-home-groups');
    function launch(action) {
      return function () {
        if (!current(record) || record.closed || busy) return;
        close(record, false);
        if (!current(record)) return;
        try {
          Promise.resolve(action()).then(function (opened) {
            if (opened === false && current(record)) focusOpener(record);
          }).catch(function () { if (current(record)) focusOpener(record); });
        } catch (_) { if (current(record)) focusOpener(record); }
      };
    }
    function action(label, hint, attr, allowed, run) {
      var control = homeAction(doc, label, hint, attr);
      control.disabled = !allowed;
      listen(record, control, 'click', function () {
        if (!control.disabled && !record.closed && current(record) && !busy) run();
      });
      return control;
    }
    var growth = w.VildaHomeGrowth, patient = w.VildaHomePatient, diet = w.VildaHomeDiet;
    var hasCharts = typeof growth?.openCharts === 'function' && (growth.canOpenCharts?.() ?? true);
    var patientOwner = patient?.captureOwner?.();
    var patientReady = !!(record.owner.id && typeof patient?.open === 'function' && patientOwner?.());
    var summaryButton = d.getElementById('metabolicSummaryBtn');
    var dietButton = d.getElementById('vhomeDietExpand');
    function openRecord(section, classicSection) {
      const gabinet = w.__VILDA_HOME_GABINET_PREVIEW__ === true && w.VildaHomeGabinet;
      if (gabinet) return gabinet.openPatient(record.owner.id, {intent: 'browse', section, isCurrent: () => current(record)});
      return patient.open(classicSection);
    }
    function openCharts(mode) {
      return launch(function () {
        return growth.openCharts({ mode: mode, opener: options.opener, onBack: function () {
          return current(record) ? open(options) : false;
        } });
      });
    }
    var chart = action('Generuj siatki', 'OLAF / OLA i Palczewska', 'data-patient-documents-charts', hasCharts,
      openCharts('pdf'));
    chart.classList.add('vilda-patient-documents-home-primary');
    grid.appendChild(homeGroup(doc, 'Siatki centylowe', 'Gotowe siatki PDF oraz narzędzia do opracowania wykresu.',
      'M5 3h10l4 4v14H5zM15 3v5h4M8 17l3-4 3 2 3-5', [chart,
        action('Kreator siatek', 'Adnotacje i elementy wykresu', 'data-patient-documents-creator', hasCharts, openCharts('creator')),
        action('Siatki do publikacji', 'Palczewska · wersja czarno-biała', 'data-patient-documents-publication', hasCharts, openCharts('publication'))]));
    grid.appendChild(homeGroup(doc, 'Raporty i podsumowania', 'Podsumowanie wizyty i szczegółowa dokumentacja wyników.',
      'M5 3h10l4 4v14H5zM15 3v5h4M8 11h8M8 15h8M8 18h5', [
        action('Kopiuj podsumowanie', 'Bieżące wyniki do dokumentacji', 'data-patient-documents-summary', summaryButton && !summaryButton.hidden && !summaryButton.disabled,
          launch(function () { if (!summaryButton.hidden && !summaryButton.disabled) summaryButton.click(); })),
        action('Raport wzrastania', 'Analiza i historia pomiarów', 'data-patient-documents-growth',
          ui.reportOptions.some(function (item) { return item.value === 'growth'; }), function () { ui.runPackage(['growth']); }),
        action('Historia badań', 'Wyniki, daty i zapisane zakresy', 'data-patient-documents-labs', patientReady,
          launch(function () { return openRecord('lab', 'labs'); }))]));
    grid.appendChild(homeGroup(doc, 'Zalecenia i opieka', 'Uzgodnione postępowanie oraz informacje dla pacjenta.',
      'M8 4H5v17h14V4h-3M8 3h8v4H8zM8 13h8M12 9v8', [
        action('Zalecenia dietetyczne', 'Założenia i raport dla pacjenta', 'data-patient-documents-diet',
          typeof diet?.open === 'function' && dietButton && !dietButton.disabled && !d.getElementById('vhomeDietCard')?.hidden,
          launch(function () { return diet.open('report'); })),
        action('Plan opieki', 'Etapy, działania i ustalenia', 'data-patient-documents-care', patientReady,
          launch(function () { return openRecord('care', 'care'); })),
        action('Notatka z wizyty', 'Utwórz wpis w dokumentacji', 'data-patient-documents-note',
          !!record.owner.id && typeof w.VildaHomePatientNoteHost?.open === 'function', launch(function () {
            return w.VildaHomePatientNoteHost.open({ patientId: record.owner.id,
              isCurrent: function () { return current(record); }, opener: options.opener,
              openPlan: function (destination) { if (current(record)) patient?.open?.('care', destination); } }) || false;
          }))]));
    var extras = element(doc, 'div', 'vilda-patient-documents-home-extras');
    var packageButton = action('Raporty PDF i pakiet', 'Jeden lub kilka dokumentów', 'data-patient-documents-package', true,
      function () { select('package', packageBack); });
    var descriptionButton = action('Kopiuj opis pacjenta', 'Opis z kartoteki i dokumentacji', 'data-patient-documents-description', true,
      function () { select('description', descriptionBack); });
    extras.append(packageButton, descriptionButton);
    center.append(context, element(doc, 'p', 'vilda-patient-documents-home-intro', 'Wybierz dokument lub przejdź do powiązanej części dokumentacji.'),
      grid, extras, element(doc, 'p', 'vilda-patient-documents-home-footnote', 'Dokumenty korzystają z danych pacjenta, pomiarów i historii zapisanych w aplikacji.'));
    var packageBack = button(doc, 'Wróć do Dokumentów', 'data-patient-documents-package-back');
    var descriptionBack = button(doc, 'Wróć do Dokumentów', 'data-patient-documents-description-back');
    ui.pdf.prepend(packageBack);
    if (ui.description.text) {
      var preview = element(doc, 'textarea', 'vilda-patient-documents-home-preview');
      preview.readOnly = true;
      preview.value = ui.description.text;
      preview.setAttribute('aria-label', 'Opis pacjenta do skopiowania');
      ui.narrative.insertBefore(preview, ui.copy);
    }
    ui.narrative.prepend(descriptionBack);
    ui.body.prepend(center);
    function select(view, focus) {
      center.hidden = view !== 'center';
      ui.pdf.hidden = ui.footer.hidden = view !== 'package';
      ui.narrative.hidden = view !== 'description';
      ui.status.textContent = '';
      ui.title.textContent = view === 'package' ? 'Raporty PDF' : view === 'description' ? 'Opis pacjenta' : 'Dokumenty pacjenta';
      ui.body.scrollTop = 0;
      if (focus) focus.focus({ preventScroll: true });
    }
    listen(record, packageBack, 'click', function () { select('center', packageButton); });
    listen(record, descriptionBack, 'click', function () { select('center', descriptionButton); });
    select('center');
    dialog.dataset.patientDocumentsHome = '';
  }

  function show(record) {
    var doc = record.doc;
    var dialog = element(doc, 'dialog', 'vilda-patient-documents');
    dialog.id = 'patientDocumentsDialog';
    dialog.setAttribute('aria-labelledby', 'patientDocumentsTitle');
    dialog.setAttribute('aria-modal', 'true');
    record.dialog = dialog;
    var header = element(doc, 'div', 'vilda-patient-documents-header');
    var heading = element(doc, 'div');
    if (!record.home) heading.appendChild(element(doc, 'p', 'vilda-patient-documents-eyebrow', 'DOKUMENTACJA'));
    var title = element(doc, 'h2', '', 'Dokumenty pacjenta');
    title.id = 'patientDocumentsTitle';
    heading.appendChild(title);
    if (!record.home) {
      var name = ['surname', 'name'].map(function (id) { var input = d.getElementById(id); return input && input.value.trim(); }).filter(Boolean).join(' ');
      heading.appendChild(element(doc, 'p', '', name || 'Bieżący pomiar'));
    }
    var closeButton = button(doc, '×', 'data-patient-documents-close');
    closeButton.setAttribute('aria-label', 'Zamknij dokumenty pacjenta');
    header.append(heading, closeButton);
    dialog.appendChild(header);

    var body = element(doc, 'div', 'vilda-patient-documents-body');
    var narrative = element(doc, 'section', 'vilda-patient-documents-narrative');
    narrative.appendChild(element(doc, 'h3', '', 'Opis do dokumentacji'));
    narrative.appendChild(element(doc, 'p', '', 'Skopiuj opis pacjenta do dokumentacji medycznej.'));
    var copy = button(doc, 'Kopiuj opis pacjenta', 'data-patient-documents-copy');
    var description = w.VildaPatientNarrativeUI && w.VildaPatientNarrativeUI.describeCurrent();
    copy.disabled = !(description && description.text);
    var copyReason = element(doc, 'p', 'vilda-patient-documents-note', description && description.reason || (!description ? 'Moduł opisu pacjenta nie został załadowany.' : ''));
    copyReason.id = 'patientDocumentsCopyReason';
    copyReason.setAttribute('data-patient-documents-copy-reason', '');
    copyReason.hidden = !copy.disabled;
    copy.setAttribute('aria-describedby', copyReason.id);
    narrative.append(copy, copyReason);
    body.appendChild(narrative);

    if (!record.home && w.VildaHomeGrowth && typeof w.VildaHomeGrowth.openCharts === 'function') {
      var charts = element(doc, 'section', 'vilda-patient-documents-narrative');
      charts.appendChild(element(doc, 'h3', '', 'Siatki centylowe'));
      var openCharts = button(doc, 'Generuj siatki', 'data-patient-documents-charts');
      listen(record, openCharts, 'click', function () {
        if (!current(record)) return;
        close(record, false); w.VildaHomeGrowth.openCharts();
      });
      charts.appendChild(openCharts); body.appendChild(charts);
    }

    var pdf = element(doc, 'section', 'vilda-patient-documents-pdf');
    var pdfTitle = element(doc, 'h3', '', 'Raporty PDF');
    pdfTitle.id = 'patientDocumentsPdfTitle';
    pdf.appendChild(pdfTitle);
    pdf.appendChild(element(doc, 'p', '', 'Wybierz dokumenty, które chcesz przygotować dla pacjenta.'));
    var choices = element(doc, 'div', 'vilda-patient-documents-choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-labelledby', pdfTitle.id);
    var options = reportOptions();
    reportLabels.forEach(function (entry) {
      var option = options.find(function (item) { return item.value === entry[0]; });
      var label = element(doc, 'label', 'vilda-patient-documents-choice');
      var input = element(doc, 'input');
      input.type = 'checkbox';
      input.name = 'patientReportPdfChoice';
      input.value = entry[0];
      input.disabled = !option;
      input.checked = !!(option && option.checkedByDefault);
      var content = element(doc, 'span');
      content.appendChild(element(doc, 'strong', '', option ? option.title : entry[1]));
      content.appendChild(element(doc, 'small', '', option ? option.description : 'Brak danych do przygotowania tego raportu.'));
      label.classList.toggle('is-unavailable', !option);
      label.append(input, content);
      choices.appendChild(label);
    });
    pdf.appendChild(choices);
    var packageNote = element(doc, 'p', 'vilda-patient-documents-note');
    pdf.appendChild(packageNote);
    body.appendChild(pdf);
    var status = element(doc, 'p', 'vilda-patient-documents-status');
    status.setAttribute('data-patient-documents-status', '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    body.appendChild(status);
    dialog.appendChild(body);
    var footer = element(doc, 'div', 'vilda-patient-documents-footer');
    var count = element(doc, 'span');
    var generate = button(doc, 'Generuj PDF', 'data-patient-documents-generate');
    footer.append(count, generate);
    dialog.appendChild(footer);
    function selected() {
      return Array.from(choices.querySelectorAll('input:checked:not(:disabled)')).map(function (input) { return input.value; });
    }
    function updateSelection() {
      var values = selected();
      choices.querySelectorAll('label').forEach(function (label) { label.classList.toggle('is-selected', label.querySelector('input').checked); });
      count.textContent = 'Wybrano: ' + values.length;
      generate.disabled = !values.length || busy;
      packageNote.textContent = values.includes('growth') && values.length > 1
        ? 'Wybrane raporty trafią do pakietu PDF. Raport wzrastania powstanie jako osobny PDF z zaznaczalnym tekstem.'
        : 'Wybrane części zostaną połączone w jeden plik PDF.';
    }
    updateSelection();
    listen(record, choices, 'change', updateSelection);
    listen(record, closeButton, 'click', function () { close(record); });
    listen(record, dialog, 'cancel', function (event) { event.preventDefault(); close(record); });
    listen(record, dialog, 'close', function () { close(record); });
    listen(record, dialog, 'click', function (event) {
      if (event.target !== dialog) return;
      var rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(record);
    });
    listen(record, dialog, 'keydown', function (event) {
      if (event.key !== 'Tab') return;
      var nodes = Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"], textarea:not(:disabled)'));
      if (record.home) nodes = nodes.filter(function (node) { return node.getClientRects().length > 0; });
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) return;
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    listen(record, copy, 'click', function () {
      if (!current(record) || busy) { if (!current(record)) close(record, false); return; }
      busy = true;
      copy.disabled = true;
      generate.disabled = true;
      publish();
      // Calling immediately retains the trusted click for the native Clipboard API.
      var copying;
      try { copying = w.VildaPatientNarrativeUI.copyCurrent({ clipboardHost: dialog, isCurrent: function () { return current(record); } }); }
      catch (error) { copying = Promise.reject(error); }
      Promise.resolve(copying).then(function (result) {
        if (current(record) && !record.closed) status.textContent = result && result.ok ? 'Opis pacjenta skopiowano do schowka.'
          : result && result.reason === 'clipboard' ? 'Nie udało się skopiować opisu — przeglądarka odmówiła dostępu do schowka.'
          : result && result.reason || 'Nie udało się skopiować opisu.';
      }).catch(function () {
        if (current(record) && !record.closed) status.textContent = 'Nie udało się skopiować opisu — spróbuj ponownie.';
      }).finally(function () {
        busy = false;
        copy.disabled = false;
        updateSelection();
        publish();
      });
    });
    async function runPackage(selectedValues, trigger) {
      if (!current(record) || busy) { if (!current(record)) close(record, false); return; }
      if (!selectedValues.length) return;
      busy = true;
      copy.disabled = true;
      choices.querySelectorAll('input').forEach(function (input) { input.disabled = true; });
      publish();
      status.textContent = 'Przygotowywanie PDF…';
      // Native generators may open their own range chooser/share UI in the
      // source frame; release this top-layer dialog before starting that flow.
      close(record);
      try {
        // Existing collectors, layout, document order and delivery remain native.
        await w.generatePatientSelectedPdfPackage(trigger, selectedValues, { isCurrent: function () { return current(record); } });
        if (current(record) && !record.closed) close(record);
      } finally {
        busy = false;
        publish();
      }
    }
    listen(record, generate, 'click', function () { runPackage(selected(), generate); });
    if (record.home) showHomeCenter(record, { body: body, title: title, footer: footer, narrative: narrative, pdf: pdf,
      copy: copy, status: status, reportOptions: options, description: description || {},
      runPackage: function (values) { runPackage(values, generate); } });
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (name) {
      listen(record, dialog, name, function (event) {
        if (!event.isTrusted || !current(record)) return;
        [w, doc.defaultView].forEach(function (view) {
          var auth = view && view.VildaAuthUI;
          if (auth && typeof auth.recordActivity === 'function') auth.recordActivity();
        });
      }, { passive: true, capture: true });
    });
    ['hashchange', 'popstate'].forEach(function (name) {
      listen(record, doc.defaultView, name, function () { if (!current(record)) invalidate(); });
    });
    if (!current(record)) return;
    doc.body.appendChild(dialog);
    [doc.documentElement, doc.body].forEach(function (node) {
      record.scroll.push({ element: node, locked: node.classList.contains('vilda-patient-documents-scroll-lock') });
      node.classList.add('vilda-patient-documents-scroll-lock');
    });
    active = record;
    dialog.showModal();
    closeButton.focus({ preventScroll: true });
    return true;
  }

  function open(options) {
    options = options || {};
    if (active && current(active)) { active.dialog.focus(); return Promise.resolve(true); }
    if (pending) return pending;
    if (!handlesPage() || !professional() || !owner() || busy) return Promise.resolve(false);
    var doc = options.hostDocument || d;
    // Legacy open calls also use the full shell viewport, not the clipped iframe.
    try { if (!options.hostDocument && w.parent !== w && w.parent.VildaShell) doc = w.parent.document; } catch (_) { /* standalone */ }
    var home = w.__VILDA_HOME_WORKSPACE_PREVIEW__ === true && d.documentElement.classList.contains('vilda-home-workspace')
      && !/(?:^|\/)docpro\.html$/.test(w.location.pathname);
    var record = { options: options, owner: owner(), importAccount: captureImportAccount(), home: home, revision: revision, doc: doc, dialog: null, listeners: [], scroll: [], closed: false };
    listen(record, doc, 'vilda:patient-documents-owner-change', invalidate);
    pendingRecord = record;
    busy = true;
    publish();
    pending = Promise.resolve().then(async function () {
      try {
        var loader = w.VildaPatientReportLoader;
        if (loader && typeof loader.ensure === 'function') await loader.ensure();
        if (!current(record)) return false;
        if (typeof w.updateProfessionalSummaryCard === 'function') w.updateProfessionalSummaryCard();
        if (!current(record) || !summary || !summary.shouldShow || !sameOwner(summaryOwner, record.owner)) {
          if (current(record) && w.VildaDymek && typeof w.VildaDymek.pokaz === 'function') {
            w.VildaDymek.pokaz('Uzupełnij dane, aby przygotować dokumenty pacjenta.', { czas: 3200 });
          }
          return false;
        }
        busy = false;
        return !!show(record);
      } catch (error) {
        close(record, false);
        if (current(record)) {
          var toast = w.VildaDymek;
          if (toast && typeof toast.pokaz === 'function') toast.pokaz('Nie udało się przygotować dokumentów. Spróbuj ponownie.', { czas: 3200 });
        }
        if (typeof w.vildaLogAppWarn === 'function') w.vildaLogAppWarn('patient-documents', 'Nie udało się otworzyć dokumentów pacjenta', error);
        return false;
      } finally {
        busy = false;
        pending = null;
        if (pendingRecord === record) pendingRecord = null;
        if (active !== record) close(record, false);
        publish();
      }
    });
    return pending;
  }

  d.addEventListener('vilda:json-imported', importCompleted);
  ['vilda:patient-loaded', 'vilda:user-state-cleared', 'vilda:state-restored',
    'vilda:persist-restored', 'vilda:main-session-restored', 'vilda:zrodlo-pacjenta-zmienione'].forEach(function (name) {
    d.addEventListener(name, invalidate);
  });
  d.addEventListener('input', function (event) {
    if (event.target && event.target.closest && event.target.closest('#calcForm')) invalidate();
  });
  d.addEventListener('vilda:professional-summary-updated', publish);
  d.addEventListener('vilda:intake-restore-readiness', refreshSummaryAfterIntake);
  d.addEventListener('vildaResultsModeChanged', function () {
    if (active && !current(active)) invalidate(); else publish();
  });
  ['vilda:auth-hidden', 'vilda:auth-state-settled', 'vilda:auth-boot-settled'].forEach(function (name) {
    d.addEventListener(name, function () { if (active && !current(active)) invalidate(); else publish(); });
  });
  w.addEventListener('pagehide', invalidate);
  w.addEventListener('vilda:user-state-cleared', invalidate);
  w.addEventListener('storage', function (event) {
    if (!event.key || ['vildaCurrentPatientId', 'vildaLoadChoiceV1', 'vilda:sharedLoadSeq'].includes(event.key)) invalidate();
  });
  try {
    if (w.frameElement && typeof w.MutationObserver === 'function') {
      new w.MutationObserver(function () {
        if (active && !current(active)) invalidate(); else publish();
      }).observe(w.frameElement, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
    }
  } catch (_) { /* standalone */ }
  w.VildaPatientDocuments = Object.freeze({ handlesPage: handlesPage, getState: getState, getReadinessPhase: function () { return readiness().phase; }, open: open,
    close: function () { close(active); }, setSummaryState: setSummaryState });
  publish();
})(window);
