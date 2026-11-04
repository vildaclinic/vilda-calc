/* Patient-card SGA view. Renders a saved assessment; calculations stay in the birth module. */
(function (win) {
  'use strict';
  if (!win || win.VildaPatientSgaUI) return;

  let serial = 0;
  let active = null;
  const TONES = ['alert', 'ok', 'improve'];

  function tone(value) { return TONES.includes(value) ? value : 'improve'; }
  function text(value) { return value == null ? '' : String(value); }
  function element(doc, tag, className, value) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = text(value);
    return node;
  }
  function action(doc, className, label, callback) {
    const button = element(doc, 'button', className, label);
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }
  function visible(node) {
    if (!node || !node.isConnected) return false;
    for (let current = node; current && current.nodeType === 1; current = current.parentElement) {
      if (current.hidden || current.inert) return false;
      const style = win.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function close() { if (active) active.close(false); }

  function measurementTable(doc, metrics) {
    const table = element(doc, 'table', 'vilda-sga-results');
    const head = element(doc, 'thead');
    const headings = element(doc, 'tr');
    ['Pomiar', 'Wartość', 'SDS'].forEach(label => {
      const cell = element(doc, 'th', null, label);
      cell.scope = 'col'; headings.appendChild(cell);
    });
    head.appendChild(headings); table.appendChild(head);
    const body = element(doc, 'tbody');
    (metrics || []).forEach(metric => {
      const row = element(doc, 'tr'); row.setAttribute('data-sga-metric', text(metric.key));
      const label = element(doc, 'th', null, metric.label); label.scope = 'row'; row.appendChild(label);
      row.appendChild(element(doc, 'td', 'vilda-sga-measurement', metric.valueLabel));
      const result = element(doc, 'td', 'vilda-sga-sds vilda-sga-sds--' + tone(metric.tone));
      result.setAttribute('data-sga-sds', text(metric.key));
      const value = metric.sdsLabel || '—';
      result.appendChild(element(doc, 'span', 'vilda-sga-sds-value', value));
      if (metric.interpretation) {
        result.setAttribute('aria-label', (value === '—' ? '' : 'SDS ' + value + '. ') + text(metric.interpretation));
        if (value === '—') result.appendChild(element(doc, 'span', 'vilda-sga-unavailable', metric.interpretation));
        else result.title = text(metric.interpretation);
      }
      row.appendChild(result); body.appendChild(row);
    });
    table.appendChild(body);
    return table;
  }
  function appendNotes(doc, parent, notes) {
    const values = Array.isArray(notes) ? notes.filter(note => typeof note === 'string' && note.trim()) : [];
    if (!values.length) return;
    const list = element(doc, 'ul', 'vilda-sga-notes');
    values.forEach(note => list.appendChild(element(doc, 'li', null, note)));
    parent.appendChild(list);
  }
  function sourceSection(doc, source, multiple) {
    const section = element(doc, 'section', 'vilda-sga-source');
    section.setAttribute('data-sga-source', text(source.sourceKey));
    if (multiple) section.appendChild(element(doc, 'h3', 'vilda-sga-source-title', source.title));
    section.appendChild(measurementTable(doc, source.metrics));
    const reference = element(doc, 'div', 'vilda-sga-reference');
    reference.appendChild(element(doc, 'h3', null, 'Źródło norm'));
    reference.appendChild(element(doc, 'p', null, source.title));
    section.appendChild(reference);
    appendNotes(doc, section, source.notes);
    const details = element(doc, 'details', 'vilda-sga-source-details');
    details.appendChild(element(doc, 'summary', null, 'O ocenie i źródle norm'));
    details.appendChild(element(doc, 'p', null, 'Ocena SGA dotyczy masy i długości ciała. Obwód głowy jest dodatkowym pomiarem.'));
    const statuses = [];
    if (source.weightStatus) statuses.push('SGA według masy: ' + source.weightStatus);
    if (source.lengthStatus) statuses.push('SGA według długości: ' + source.lengthStatus);
    if (statuses.length) details.appendChild(element(doc, 'p', null, statuses.join('; ') + '.'));
    if (source.sourceLabel) details.appendChild(element(doc, 'p', null, source.sourceLabel));
    // Model references are fixed citations. Do not turn record text into arbitrary links.
    if (typeof source.referenceURL === 'string' && /^https:\/\/doi\.org\//.test(source.referenceURL)) {
      const link = element(doc, 'a', null, 'Publikacja źródłowa ↗');
      link.href = source.referenceURL; link.target = '_blank'; link.rel = 'noopener noreferrer';
      details.appendChild(link);
    }
    section.appendChild(details);
    return section;
  }
  function appendAssessmentDate(doc, parent, value) {
    if (typeof value !== 'string' || !value) return;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return;
    const formatted = date.toLocaleDateString('pl-PL') + ', godz. ' + date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    const time = element(doc, 'time', 'vilda-sga-assessed', 'Ocena z ' + formatted);
    time.dateTime = value; time.setAttribute('data-sga-assessed', ''); parent.appendChild(time);
  }
  function fillBody(doc, body, model) {
    const conclusion = element(doc, 'div', 'vilda-sga-conclusion vilda-sga-conclusion--' + tone(model.tone));
    if (model.hasAssessment) {
      conclusion.appendChild(element(doc, 'strong', null, 'SGA: ' + model.value));
      conclusion.appendChild(element(doc, 'p', null, model.subtitle));
    } else {
      conclusion.appendChild(element(doc, 'strong', null, 'Brak zapisanej oceny SDS'));
      conclusion.appendChild(element(doc, 'p', null, 'Są zapisane dane urodzeniowe, ale brakuje zapisanej oceny SDS. Oblicz SDS w DocPro i zapisz dane pacjenta.'));
    }
    body.appendChild(conclusion);
    const context = element(doc, 'dl', 'vilda-sga-birth-context');
    [['Płeć', model.sexLabel], ['Wiek ciążowy', model.gestationLabel]].forEach(([label, value]) => {
      const item = element(doc, 'div');
      item.appendChild(element(doc, 'dt', null, label)); item.appendChild(element(doc, 'dd', null, value)); context.appendChild(item);
    });
    body.appendChild(context);
    const sources = Array.isArray(model.sources) ? model.sources : [];
    if (model.hasAssessment && sources.length) sources.forEach(source => body.appendChild(sourceSection(doc, source, sources.length > 1)));
    else body.appendChild(measurementTable(doc, (model.measurements || []).map(metric => Object.assign({}, metric, {
      sdsLabel: '—', tone: 'improve', interpretation: 'Brak zapisanej oceny SDS'
    }))));
    appendNotes(doc, body, model.notes);
    if (model.hasAssessment) appendAssessmentDate(doc, body, model.computedAtISO);
  }

  function createTile(options) {
    const opts = options || {};
    const model = opts.model;
    if (!model || typeof model !== 'object') return null;
    const doc = win.document;
    const tile = element(doc, 'div', 'vilda-patient-stat vilda-patient-stat--' + tone(model.tone) + ' vilda-patient-sga-tile');
    tile.setAttribute('data-patient-sga-tile', ''); tile.setAttribute('role', 'button'); tile.tabIndex = 0;
    tile.setAttribute('aria-haspopup', 'dialog');
    tile.setAttribute('aria-label', 'SGA: ' + text(model.value) + '. ' + text(model.subtitle) + '. Otwórz szczegóły oceny');
    const label = element(doc, 'div', 'vilda-patient-stat-label', 'SGA');
    const arrow = element(doc, 'span', 'vilda-sga-tile-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true'); label.appendChild(arrow);
    tile.appendChild(label);
    tile.appendChild(element(doc, 'div', 'vilda-patient-stat-value', model.value));
    tile.appendChild(element(doc, 'div', 'vilda-patient-stat-sub', model.subtitle));

    function open() {
      if (!visible(tile) || (active && active.tile === tile)) return;
      close();
      const dialog = element(doc, 'dialog', 'vilda-patient-sga-dialog');
      if (typeof dialog.showModal !== 'function') return;
      const id = 'vilda-patient-sga-dialog-' + (++serial);
      dialog.id = id; dialog.setAttribute('data-patient-sga-dialog', '');
      dialog.setAttribute('aria-labelledby', id + '-title'); tile.setAttribute('aria-controls', id);
      const heading = element(doc, 'div', 'vilda-sga-dialog-head');
      const headings = element(doc, 'div');
      const title = element(doc, 'h2', null, 'SGA — dane urodzeniowe'); title.id = id + '-title'; headings.appendChild(title);
      if (opts.patientName) headings.appendChild(element(doc, 'p', null, opts.patientName));
      heading.appendChild(headings);
      const dismiss = action(doc, 'vilda-sga-close', '×', () => finish(true));
      dismiss.setAttribute('aria-label', 'Zamknij szczegóły SGA'); dismiss.setAttribute('data-sga-close', ''); heading.appendChild(dismiss);
      dialog.appendChild(heading);
      const body = element(doc, 'div', 'vilda-sga-dialog-body'); fillBody(doc, body, model); dialog.appendChild(body);
      const footer = element(doc, 'div', 'vilda-sga-dialog-footer');
      const back = action(doc, 'vilda-auth-btn vilda-auth-btn-primary vilda-sga-return', 'Wróć do Statusu', () => finish(true));
      back.setAttribute('data-sga-return', ''); footer.appendChild(back); dialog.appendChild(footer);

      let ended = false;
      let unregisterBack = null, unregisterLock = null, releaseScroll = null, observer = null;
      const savedScroll = typeof opts.captureScroll === 'function' ? opts.captureScroll() : null;
      // Native dialog focus can move the document even when its scrolling element
      // is not one of the overflowing ancestors of the patient-card tile.
      const savedWindowScroll = { left: win.scrollX, top: win.scrollY };
      const scrollHosts = [];
      // The shared lockScroll adapter locks the document. Applying overflow to
      // both html and body would collapse its scroll range to the viewport.
      for (let node = tile.parentElement; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
          scrollHosts.push({ node, top: node.scrollTop, left: node.scrollLeft, locked: node.classList.contains('vilda-sga-scroll-locked') });
        }
      }
      function restorePosition() {
        if (!visible(tile)) return;
        if (savedScroll && typeof opts.restoreScroll === 'function') opts.restoreScroll(savedScroll);
        scrollHosts.forEach(item => { if (item.node.isConnected) { item.node.scrollTop = item.top; item.node.scrollLeft = item.left; } });
        win.scrollTo({ left: savedWindowScroll.left, top: savedWindowScroll.top, behavior: 'instant' });
      }
      function finish(restoreFocus) {
        if (ended) return;
        ended = true;
        if (active && active.dialog === dialog) active = null;
        if (unregisterBack) unregisterBack();
        if (unregisterLock) unregisterLock();
        if (observer) observer.disconnect();
        win.removeEventListener('pagehide', onPageHide);
        doc.removeEventListener('vilda:user-state-cleared', onPageHide);
        win.removeEventListener('vilda:user-state-cleared', onPageHide);
        dialog.removeEventListener('close', onNativeClose);
        if (dialog.open) dialog.close();
        dialog.remove(); tile.removeAttribute('aria-controls');
        scrollHosts.forEach(item => { if (!item.locked) item.node.classList.remove('vilda-sga-scroll-locked'); });
        if (releaseScroll) releaseScroll();
        if (restoreFocus && visible(tile)) {
          restorePosition(); tile.focus({ preventScroll: true }); restorePosition();
          win.requestAnimationFrame(() => {
            if (!visible(tile) || active) return;
            restorePosition();
            if (typeof opts.afterClose === 'function') opts.afterClose();
          });
        }
      }
      function onNativeClose() { finish(true); }
      function onPageHide() { finish(false); }
      function preventOutsideScroll(event) { if (event.target === dialog) event.preventDefault(); }
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(true); });
      dialog.addEventListener('close', onNativeClose);
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) finish(true);
      });
      dialog.addEventListener('wheel', preventOutsideScroll, { passive: false });
      dialog.addEventListener('touchmove', preventOutsideScroll, { passive: false });
      doc.body.appendChild(dialog);
      active = { tile, dialog, close: finish };
      try {
        if (typeof opts.lockScroll === 'function') releaseScroll = opts.lockScroll(dialog);
        scrollHosts.forEach(item => item.node.classList.add('vilda-sga-scroll-locked'));
        dialog.showModal(); dismiss.focus({ preventScroll: true }); restorePosition();
        if (typeof opts.registerBack === 'function') unregisterBack = opts.registerBack(() => finish(true));
        if (typeof opts.registerLock === 'function') unregisterLock = opts.registerLock(() => finish(false));
        if (ended) return;
        win.addEventListener('pagehide', onPageHide);
        doc.addEventListener('vilda:user-state-cleared', onPageHide);
        win.addEventListener('vilda:user-state-cleared', onPageHide);
        if (typeof win.MutationObserver === 'function') {
          observer = new win.MutationObserver(() => { if (!visible(tile) || !dialog.isConnected) finish(false); });
          observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'inert'] });
        }
      } catch (error) {
        finish(false);
        if (typeof win.vildaLogAppWarn === 'function') win.vildaLogAppWarn('SGA', 'Nie udało się otworzyć szczegółów SGA.', error);
      }
    }
    tile.addEventListener('click', open);
    tile.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
    return tile;
  }
  win.VildaPatientSgaUI = Object.freeze({ createTile, close });
})(typeof window !== 'undefined' ? window : null);
