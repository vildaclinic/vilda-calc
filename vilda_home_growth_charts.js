/* A single opt-in entry for the original chart generators and point annotations.
 * No PDF renderer, chart eligibility, reference or persisted schema is replaced. */
(function (w) {
  'use strict';
  if (w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true) return;
  var d = w.document, active = null, sequence = 0, cachedDialog = null;
  var draftChanges = new WeakMap(), watchedVaults = new WeakSet();
  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function byId(id) { return d.getElementById(id); }
  function annotations() {
    return [{ check: byId('advCurrentArrowEnable'), comment: byId('advCurrentArrowComment'), label: 'Bieżący pomiar' }]
      .concat(Array.from(byId('advMeasurements').querySelectorAll('.measure-row')).map(function (row) {
        var age = row.querySelector('.adv-age-years').value, months = row.querySelector('.adv-age-months').value;
        return { check: row.querySelector('.adv-arrow-enable'), comment: row.querySelector('.adv-arrow-comment'),
          label: (age || '—') + ' lat ' + (months || '0') + ' mies. · ' + (row.querySelector('.adv-height').value || '—') + ' cm' };
      })).filter(function (item) { return item.check && item.comment; });
  }
  function values(record) { return JSON.stringify([record.points.map(function (p) { return [p.checked, p.text]; }), record.publication, record.layout]); }
  function current(record) {
    try { return record === active && record.options.valid() && JSON.stringify(record.options.snapshot()) === record.fingerprint
      && record.originalPublication === byId('publicationChartsToggle').checked
      && record.originalLayout === d.querySelector('input[name="palPdfLayout"]:checked')?.value
      && record.points.every(function (point) { return point.node.check.isConnected && point.node.comment.isConnected
        && point.node.check.checked === point.originalChecked && point.node.comment.value === point.originalText; }); } catch (_) { return false; }
  }
  function dirty(record) { return values(record) !== record.initial; }
  function close(force, fromHistory) {
    var record = active; if (!record) return true;
    if (!force && dirty(record) && !w.confirm('Odrzucić niezastosowane ustawienia i komentarze siatek?')) return false;
    active = null; w.clearInterval(record.timer); record.dialog.close(); record.dialog.querySelector('.vhome-dialog-body').replaceChildren();
    if (!fromHistory && w.history.state?.vildaHomeDialog === record.historyToken) w.history.back();
    record.options.opener?.focus({ preventScroll: true }); return true;
  }
  function available(node) { return !!(node && !node.disabled && !node.hidden && node.style.display !== 'none'); }
  function refresh(record) {
    var changed = dirty(record), dialog = record.dialog;
    dialog.querySelector('.vhome-dialog-apply').disabled = !changed;
    dialog.querySelector('[data-chart-status]').textContent = changed ? 'Zastosuj zmiany przed generowaniem siatek.' : 'Siatki i kreatory korzystają z bieżących danych pacjenta.';
    dialog.querySelectorAll('[data-chart-native]').forEach(function (button) { button.disabled = changed || !available(byId(button.dataset.chartNative)); });
  }
  function apply(record) {
    if (!current(record)) { close(true); return; }
    if (!dirty(record)) return;
    close(true);
    if (!record.options.valid()) return;
    function notify(node, value, checked) {
      if (!record.options.valid()) return false;
      var property = checked ? 'checked' : 'value';
      if (node[property] !== value) {
        node[property] = value;
        node.dispatchEvent(new w.Event(node.type === 'text' ? 'input' : 'change', { bubbles: true }));
      }
      return record.options.valid();
    }
    // A native publication change refreshes layout controls from its preference.
    // Commit each original control together with its event, in native order.
    if (!notify(byId('publicationChartsToggle'), record.publication, true)) return;
    var layout = d.querySelector('input[name="palPdfLayout"][value="' + record.layout + '"]');
    if (layout && !notify(layout, true, true)) return;
    for (var point of record.points) {
      if (!notify(point.node.check, point.checked, true) || !notify(point.node.comment, point.text, false)) return;
    }
    if (!record.options.valid()) return;
    w.calculateGrowthAdvanced();
    if (!record.options.valid()) return;
    if (typeof w.vildaPersistFlushNow === 'function') w.vildaPersistFlushNow({ force: true });
    if (record.options.valid()) w.VildaDataImportExport.saveMainSessionNow();
  }
  function open(options) {
    if (active || d.querySelector('dialog[open]') || !options.valid()) return false;
    var base = options.snapshot(); if (!base) return false;
    if (w.VildaVault?.onLock && !watchedVaults.has(w.VildaVault)) {
      watchedVaults.add(w.VildaVault); w.VildaVault.onLock(function () { close(true); });
    }
    var publication = byId('publicationChartsToggle'), layout = d.querySelector('input[name="palPdfLayout"]:checked')?.value || 'portrait';
    var record = { options: options, fingerprint: JSON.stringify(base), publication: publication.checked, originalPublication: publication.checked,
      layout: layout, originalLayout: layout, points: annotations().map(function (point) { return { node: point, checked: point.check.checked, text: point.comment.value, originalChecked: point.check.checked, originalText: point.comment.value }; }),
      historyToken: 'growth-charts-' + Date.now() + '-' + (++sequence) };
    var dialog = cachedDialog || w.VildaHomeWorkspace.createDialog({ id: 'vhomeGrowthChartsDialog', titleId: 'vhomeGrowthChartsTitle', title: 'Generuj siatki',
      applyLabel: 'Zastosuj ustawienia', onApply: function () { if (active) apply(active); }, onClose: function () { close(false); } }); cachedDialog = dialog; record.dialog = dialog;
    var body = dialog.querySelector('.vhome-dialog-body');
    body.appendChild(el('p', 'vhome-dialog-context', [byId('firstName').value, byId('lastName').value].filter(Boolean).join(' ') || 'Bieżący pomiar'));
    var source = d.querySelector('input[name="dataSource"]:checked')?.value;
    body.appendChild(el('p', 'vhome-growth-field-note', 'Źródło siatek: ' + source + '. Wybór źródła w formularzu głównym.'));
    var grid = el('div', 'vhome-charts-actions');
    [['Siatki centylowe PDF', [['generateCentileChart', 'Generuj siatki OLAF / WHO'], ['generatePalCentileChart', 'Generuj siatki Palczewskiej']]],
      ['Kreator siatek', [['openChartCreatorBtn', 'Otwórz kreator siatek']]],
      ['Siatki do publikacji', [['openPublicationCreatorBtn', 'Otwórz kreator adnotacji']]]].forEach(function (group) {
      var section = el('section', 'vhome-a2-panel'); section.appendChild(el('h3', '', group[0]));
      group[1].forEach(function (entry) {
        var button = el('button', 'vhome-growth-secondary', entry[1]); button.type = 'button'; button.dataset.chartNative = entry[0];
        button.addEventListener('click', function () {
          if (!current(record) || dirty(record)) { if (!current(record)) close(true); return; }
          var native = byId(entry[0]); if (!available(native)) return;
          close(true); if (options.valid()) native.click();
        }); section.appendChild(button);
      }); grid.appendChild(section);
    }); body.appendChild(grid);
    if (source === 'PALCZEWSKA') {
      var settings = el('section', 'vhome-growth-section'); settings.appendChild(el('h3', '', 'Ustawienia siatek Palczewskiej'));
      var label = el('label', 'vhome-charts-select', 'Układ PDF'), select = el('select');
      [['portrait', '2 strony A4 · pion'], ['landscape', '1 strona A4 · poziom']].forEach(function (entry) { var choice = el('option', '', entry[1]); choice.value = entry[0]; select.appendChild(choice); });
      select.value = record.layout; select.disabled = record.publication; select.setAttribute('aria-label', 'Układ PDF'); label.appendChild(select); settings.appendChild(label);
      draftChanges.set(select, function () { record.layout = select.value; refresh(record); });
      var pubLabel = el('label', 'vhome-charts-check'), pub = el('input'); pub.type = 'checkbox'; pub.checked = record.publication; pub.disabled = publication.disabled;
      pubLabel.append(pub, d.createTextNode('Siatki do publikacji')); settings.appendChild(pubLabel);
      var publicationNote = el('p', 'vhome-growth-field-note', 'Siatki do publikacji są zawsze w układzie pionowym. Wybrany układ PDF pozostaje ustawieniem zwykłych siatek.');
      publicationNote.hidden = !record.publication; settings.appendChild(publicationNote);
      var points = el('div', 'vhome-charts-points');
      record.points.forEach(function (point) {
        var line = el('div', 'vhome-charts-point'), label = el('label', 'vhome-charts-check'), check = el('input'), comment = el('input');
        check.type = 'checkbox'; check.checked = point.checked; label.append(check, d.createTextNode('Komentarz ze strzałką · ' + point.node.label));
        comment.type = 'text'; comment.value = point.text; comment.placeholder = 'Komentarz do punktu'; comment.setAttribute('aria-label', 'Komentarz · ' + point.node.label);
        comment.hidden = !point.checked; draftChanges.set(check, function () { point.checked = check.checked; comment.hidden = !point.checked; refresh(record); });
        draftChanges.set(comment, function () { point.text = comment.value; refresh(record); }); line.append(label, comment); points.appendChild(line);
      }); points.hidden = !record.publication;
      draftChanges.set(pub, function () { record.publication = pub.checked; points.hidden = publicationNote.hidden = !record.publication; select.disabled = record.publication; refresh(record); }); settings.appendChild(points); body.appendChild(settings);
    }
    var status = el('p', 'vhome-growth-draft-status'); status.dataset.chartStatus = ''; status.setAttribute('role', 'status'); body.appendChild(status);
    record.initial = values(record); active = record; refresh(record);
    w.VildaHomeWorkspace.fitDialog(dialog); dialog.setAttribute('aria-modal', 'true'); dialog.showModal();
    w.history[options.replaceHistory ? 'replaceState' : 'pushState'](Object.assign({}, w.history.state, { vildaHomeDialog: record.historyToken }), '', w.location.href);
    record.timer = w.setInterval(function () { if (!current(record)) close(true); }, 250);
    dialog.querySelector('.vhome-dialog-close').focus({ preventScroll: true }); return true;
  }
  // Draft events do not reach canonical autosave or calculation listeners.
  ['input', 'change'].forEach(function (name) {
    w.addEventListener(name, function (event) {
      if (!active || !active.dialog.contains(event.target)) return;
      event.stopImmediatePropagation();
      if (!current(active)) { close(true); return; }
      var change = draftChanges.get(event.target); if (change) change();
    }, true);
  });
  w.addEventListener('popstate', function () {
    if (active && w.history.state?.vildaHomeDialog !== active.historyToken && !close(false, true))
      w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: active.historyToken }), '', w.location.href);
  });
  w.VildaHomeGrowthCharts = Object.freeze({ open: open });
})(typeof window !== 'undefined' ? window : globalThis);
