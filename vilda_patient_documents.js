/* Patient documents: a presentation adapter for the native narrative/PDF APIs.
 * No clinical data is persisted here. A request belongs to one form and patient.
 */
(function (w) {
  'use strict';
  var d = w.document;
  if (!d || w.VildaPatientDocuments) return;
  var summary = null, summaryOwner = null, revision = 0;
  var pending = null, active = null, busy = false, lastState = '';
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

  function getState() {
    var reason = '';
    if (!handlesPage()) reason = 'Dokumenty pacjenta są dostępne na stronie głównej i DocPro.';
    else if (!professional()) reason = 'Dokumenty pacjenta są dostępne w trybie PRO lub DocPro.';
    else if (!owner()) reason = 'Poczekaj na wczytanie danych pacjenta.';
    else if (!summary && !(w.VildaPatientReportLoader && typeof w.VildaPatientReportLoader.ensure === 'function')) reason = 'Przygotowywanie dokumentów pacjenta…';
    else if (summary && (!sameOwner(summaryOwner, owner()) || !summary.shouldShow)) reason = 'Uzupełnij dane, aby przygotować dokumenty pacjenta.';
    return { disabled: !!reason || busy, reason: busy ? 'Przygotowywanie dokumentów pacjenta…' : reason, busy: busy };
  }

  function publish() {
    var state = getState(), signature = JSON.stringify(state);
    if (signature === lastState) return;
    lastState = signature;
    d.dispatchEvent(new w.CustomEvent('vilda:patient-documents-state', { detail: state }));
  }

  function setSummaryState(value) {
    summary = { shouldShow: !!(value && value.shouldShow && (value.isDocPro || value.proMode)) };
    summaryOwner = owner(true);
    publish();
  }

  function current(record) {
    try {
      return record.revision === revision && professional() && sameOwner(record.owner, owner())
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

  function show(record) {
    var doc = record.doc;
    var dialog = element(doc, 'dialog', 'vilda-patient-documents');
    dialog.id = 'patientDocumentsDialog';
    dialog.setAttribute('aria-labelledby', 'patientDocumentsTitle');
    dialog.setAttribute('aria-modal', 'true');
    record.dialog = dialog;
    var header = element(doc, 'div', 'vilda-patient-documents-header');
    var heading = element(doc, 'div');
    heading.appendChild(element(doc, 'p', 'vilda-patient-documents-eyebrow', 'DOKUMENTACJA'));
    var title = element(doc, 'h2', '', 'Dokumenty pacjenta');
    title.id = 'patientDocumentsTitle';
    heading.appendChild(title);
    var name = ['surname', 'name'].map(function (id) { var input = d.getElementById(id); return input && input.value.trim(); }).filter(Boolean).join(' ');
    heading.appendChild(element(doc, 'p', '', name || 'Bieżący pomiar'));
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
      var nodes = Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
      var first = nodes[0], last = nodes[nodes.length - 1];
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
    listen(record, generate, 'click', async function () {
      if (!current(record) || busy) { if (!current(record)) close(record, false); return; }
      var selectedValues = selected();
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
        await w.generatePatientSelectedPdfPackage(generate, selectedValues, { isCurrent: function () { return current(record); } });
        if (current(record) && !record.closed) close(record);
      } finally {
        busy = false;
        publish();
      }
    });
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
    var record = { options: options, owner: owner(), revision: revision, doc: doc, dialog: null, listeners: [], scroll: [], closed: false };
    listen(record, doc, 'vilda:patient-documents-owner-change', invalidate);
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
        if (active !== record) close(record, false);
        publish();
      }
    });
    return pending;
  }

  ['vilda:patient-loaded', 'vilda:json-imported', 'vilda:user-state-cleared', 'vilda:state-restored',
    'vilda:persist-restored', 'vilda:main-session-restored', 'vilda:zrodlo-pacjenta-zmienione'].forEach(function (name) {
    d.addEventListener(name, invalidate);
  });
  d.addEventListener('input', function (event) {
    if (event.target && event.target.closest && event.target.closest('#calcForm')) invalidate();
  });
  d.addEventListener('vilda:professional-summary-updated', publish);
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
  w.VildaPatientDocuments = Object.freeze({ handlesPage: handlesPage, getState: getState, open: open,
    close: function () { close(active); }, setSummaryState: setSummaryState });
  publish();
})(window);
