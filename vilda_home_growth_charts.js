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
  function ownerCurrent(record) {
    try { return record.options.valid() && JSON.stringify(record.options.snapshot()) === record.fingerprint
      && record.population === population(record.patient)
      && record.originalPublication === byId('publicationChartsToggle').checked
      && record.originalLayout === d.querySelector('input[name="palPdfLayout"]:checked')?.value
      && record.points.every(function (point) { return point.node.check.isConnected && point.node.comment.isConnected
        && point.node.check.checked === point.originalChecked && point.node.comment.value === point.originalText; }); } catch (_) { return false; }
  }
  function current(record) { return record === active && ownerCurrent(record); }
  function dirty(record) { return values(record) !== record.initial; }
  function close(force, fromHistory) {
    var record = active; if (!record) return true;
    if (!force && dirty(record) && !w.confirm('Odrzucić niezastosowane ustawienia i komentarze siatek?')) return false;
    active = null; w.clearInterval(record.timer); record.dialog.close(); record.dialog.querySelector('.vhome-dialog-body').replaceChildren();
    if (!fromHistory && w.history.state?.vildaHomeDialog === record.historyToken) w.history.back();
    record.options.opener?.focus({ preventScroll: true }); return true;
  }
  function available(node) { return !!(node && !node.disabled && !node.hidden && node.style.display !== 'none'); }
  function population(patient) {
    if (!patient || !w.VildaDsSource?.getState) return 'OGOLNA';
    var state = w.VildaDsSource.getState();
    return state.patientId === patient && state.status === 'ready' ? state.population : null;
  }
  var families = {
    olaf: { title: 'OLAF / OLA', source: 'OLAF' },
    palRegular: { title: 'Palczewska · 1–18 lat', source: 'PALCZEWSKA', range: 'EXTENDED_ONLY' },
    palInfant: { title: 'Palczewska · 0–3 lata', source: 'PALCZEWSKA', range: 'INFANT_ONLY' },
    who: { title: 'WHO', source: 'WHO' }
  };
  var presets = [
    ['olaf', 'OLAF / OLA', '3–18 lat', 'olaf', 'portrait'],
    ['pal-portrait', 'Palczewska · pion', '1–18 lat · 2 strony A4', 'palRegular', 'portrait'],
    ['pal-landscape', 'Palczewska · poziom', '1–18 lat · 1 strona A4', 'palRegular', 'landscape']
  ];
  function state(source) { return w.getCentileChartState?.(source); }
  function hasMeasurement() {
    return ['age', 'height', 'weight'].every(function (id) { return Number.isFinite(byId(id)?.valueAsNumber); });
  }
  function familyAvailable(key) {
    var family = families[key], native = family && state(family.source);
    if (!native?.supported) return false;
    if (key === 'palRegular') return native.palPlan.mode !== 'INFANT_ONLY';
    if (key === 'palInfant') return native.palPlan.mode === 'INFANT_ONLY' || native.palPlan.mode === 'CHOICE';
    return true;
  }
  function nativeId(mode) { return mode === 'creator' ? 'openChartCreatorBtn' : 'openPublicationCreatorBtn'; }
  function canLaunch(mode, record) {
    return hasMeasurement() && (mode !== 'publication' || record.population !== 'DS') && available(byId(nativeId(mode)));
  }
  function action(label, cls, click) {
    var button = el('button', cls, label); button.type = 'button';
    button.addEventListener('click', click); return button;
  }
  function showStage(record, stage) {
    if (!current(record)) { close(true); return; }
    record.stage = stage; render(record);
    record.dialog.querySelector('[data-chart-back]')?.focus({ preventScroll: true });
  }
  function launchNative(record, id) {
    if (!current(record)) { close(true); return false; }
    var node = byId(id);
    if (dirty(record) || !hasMeasurement() || !available(node)) return false;
    close(true);
    if (!ownerCurrent(record)) return false;
    node.click();
    return true;
  }
  function changeMode(record, mode) {
    if (!current(record)) { close(true); return; }
    if (canLaunch(mode, record)) { launchNative(record, nativeId(mode)); return; }
    showStage(record, mode);
  }
  function familyBlock(record) {
    if (!hasMeasurement()) return 'Uzupełnij wiek, masę i wzrost w formularzu wizyty.';
    if (!familyAvailable(record.family)) return 'Ta siatka nie obejmuje wieku pacjenta i dostępnych pomiarów.';
    if (families[record.family].source === 'PALCZEWSKA' && record.publication)
      return 'Zwykły PDF jest dostępny po wyłączeniu ustawienia „Siatki do publikacji”.';
    return '';
  }
  function generate(record) {
    if (!current(record)) { close(true); return; }
    if (dirty(record) || familyBlock(record)) return;
    var family = families[record.family], generator = family.source === 'PALCZEWSKA'
      ? w.generatePalczewskaCentileCharts : w.generateCentileChart;
    if (typeof generator !== 'function') return;
    close(true);
    var request = { source: family.source, range: family.range, layout: record.pdfLayout,
      isCurrent: function () { return ownerCurrent(record); } };
    Promise.resolve(generator(request)).catch(function () {
      if (ownerCurrent(record)) w.alert('Nie udało się wygenerować pliku PDF. Spróbuj ponownie.');
    });
  }
  function refresh(record) {
    var changed = dirty(record), dialog = record.dialog;
    var submit = dialog.querySelector('.vhome-dialog-apply');
    submit.hidden = record.stage === 'choose' || record.stage === 'creator' || record.stage === 'publication' && !record.settingsAvailable;
    submit.textContent = record.stage === 'pdf' ? 'Generuj PDF' : 'Zastosuj ustawienia';
    var message = record.stage === 'pdf' ? familyBlock(record) : '';
    submit.disabled = record.stage === 'pdf' ? changed || !!message : !changed;
    var status = dialog.querySelector('[data-chart-status]');
    var text = changed ? 'Zastosuj zmiany przed generowaniem siatek.' : message;
    status.hidden = !text; status.textContent = text;
    dialog.querySelectorAll('[data-chart-native]').forEach(function (button) {
      button.disabled = changed || !hasMeasurement() || !available(byId(button.dataset.chartNative));
    });
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
  function section(body, title) {
    var panel = el('section', 'vhome-charts-panel');
    panel.appendChild(el('h3', '', title)); body.appendChild(panel); return panel;
  }
  function tile(label, desc, click) {
    var button = action('', 'vhome-charts-tile', click);
    button.append(el('strong', '', label), el('span', '', desc)); return button;
  }
  function pick(record, family, layout) {
    record.family = family; record.pdfLayout = layout;
    showStage(record, 'pdf');
  }
  function renderChoice(record, body) {
    var pdf = section(body, 'Gotowe siatki PDF'), grid = el('div', 'vhome-charts-presets'), ready = hasMeasurement();
    if (record.population === 'DS') {
      var ds = tile('Zemel 2015', 'Siatki dla dzieci z zespołem Downa', function () { launchNative(record, 'generateDsCentileChart'); });
      ds.dataset.chartNative = 'generateDsCentileChart'; ds.disabled = !ready; grid.appendChild(ds);
    } else {
      presets.forEach(function (preset) {
        var button = tile(preset[1], preset[2], function () { pick(record, preset[3], preset[4]); });
        button.dataset.chartPreset = preset[0]; button.disabled = !ready || !familyAvailable(preset[3]);
        grid.appendChild(button);
      });
    }
    pdf.appendChild(grid);
    if (!ready) pdf.appendChild(el('p', 'vhome-growth-field-note', 'Uzupełnij wiek, masę i wzrost w formularzu wizyty.'));
    else if (record.population !== 'DS') {
      var extras = el('div', 'vhome-charts-extra');
      ['palInfant', 'who'].filter(familyAvailable).forEach(function (key) {
        extras.appendChild(action(families[key].title, 'vhome-growth-secondary', function () { pick(record, key, 'portrait'); }));
      });
      if (extras.childElementCount) pdf.appendChild(extras);
      if (!familyAvailable('olaf') && !familyAvailable('palRegular') && !extras.childElementCount)
        pdf.appendChild(el('p', 'vhome-growth-field-note', 'Brak dostępnych siatek dla wieku z bieżącego pomiaru.'));
    }
    var tools = section(body, 'Opracowanie siatek'), actions = el('div', 'vhome-charts-presets vhome-charts-tools');
    ['creator', 'publication'].filter(function (mode) { return mode !== 'publication' || record.population !== 'DS'; }).forEach(function (mode) {
      var item = mode === 'creator' ? ['Kreator siatek', 'Adnotacje i elementy wykresu'] : ['Siatki do publikacji', 'Palczewska · wersja czarno-biała'];
      var button = tile(item[0], item[1], function () { changeMode(record, mode); });
      button.dataset.chartMode = mode;
      if (canLaunch(mode, record)) button.dataset.chartNative = nativeId(mode);
      actions.appendChild(button);
    });
    tools.appendChild(actions);
    if (record.settingsAvailable) body.appendChild(action('Ustawienia publikacji i komentarze', 'vhome-charts-back', function () {
      showStage(record, 'publication');
    }));
  }
  function selectField(parent, name, choices, value, change) {
    var label = el('label', 'vhome-charts-select', name), select = el('select');
    choices.forEach(function (item) { var entry = el('option', '', item[1]); entry.value = item[0]; select.appendChild(entry); });
    select.value = value; select.setAttribute('aria-label', name); label.appendChild(select); parent.appendChild(label);
    draftChanges.set(select, function () { change(select.value); }); return select;
  }
  var layouts = [['portrait', '2 strony A4 · pion'], ['landscape', '1 strona A4 · poziom']];
  function renderPdf(record, body) {
    var panel = section(body, 'Ustawienia dokumentu'), fields = el('div', 'vhome-charts-fields');
    var choices = Object.keys(families).filter(familyAvailable).map(function (key) { return [key, families[key].title]; });
    selectField(fields, 'Rodzina siatek', choices, record.family, function (value) {
      record.family = value; render(record);
      record.dialog.querySelector('.vhome-charts-fields select')?.focus({ preventScroll: true });
    });
    if (record.family === 'palRegular') {
      selectField(fields, 'Układ PDF', layouts, record.pdfLayout, function (value) { record.pdfLayout = value; refresh(record); });
    }
    panel.appendChild(fields);
    if (record.family === 'palRegular' && state('PALCZEWSKA')?.palPlan.mode === 'BOTH_REQUIRED')
      panel.appendChild(el('p', 'vhome-growth-field-note', 'Historia pomiarów wymaga obu zakresów. Plik obejmie również siatkę 0–3 lata.'));
    if (families[record.family].source === 'PALCZEWSKA' && record.publication && record.settingsAvailable)
      panel.appendChild(action('Ustawienia publikacji', 'vhome-charts-back', function () { showStage(record, 'publication'); }));
  }
  function renderPublication(record, body) {
    var settings = section(body, 'Ustawienia siatek Palczewskiej'), publication = byId('publicationChartsToggle');
    if (!record.settingsAvailable) {
      settings.appendChild(el('p', 'vhome-growth-field-note', 'Siatki do publikacji są dostępne dla referencji Palczewskiej w zakresie 1–18 lat.'));
      return;
    }
    var select = selectField(settings, 'Układ PDF', layouts, record.layout, function (value) { record.layout = value; refresh(record); });
    select.disabled = record.publication;
    var pubLabel = el('label', 'vhome-charts-check'), pub = el('input');
    pub.type = 'checkbox'; pub.checked = record.publication; pub.disabled = publication.disabled;
    pubLabel.append(pub, d.createTextNode('Siatki do publikacji')); settings.appendChild(pubLabel);
    var publicationNote = el('p', 'vhome-growth-field-note', 'Siatki do publikacji mają układ pionowy.');
    publicationNote.hidden = !record.publication; settings.appendChild(publicationNote);
    var points = el('div', 'vhome-charts-points');
    record.points.forEach(function (point) {
      var line = el('div', 'vhome-charts-point'), label = el('label', 'vhome-charts-check'), check = el('input'), comment = el('input');
      check.type = 'checkbox'; check.checked = point.checked; label.append(check, d.createTextNode('Komentarz ze strzałką · ' + point.node.label));
      comment.type = 'text'; comment.value = point.text; comment.placeholder = 'Komentarz do punktu'; comment.setAttribute('aria-label', 'Komentarz · ' + point.node.label);
      comment.hidden = !point.checked; draftChanges.set(check, function () { point.checked = check.checked; comment.hidden = !point.checked; refresh(record); });
      draftChanges.set(comment, function () { point.text = comment.value; refresh(record); }); line.append(label, comment); points.appendChild(line);
    });
    points.hidden = !record.publication;
    draftChanges.set(pub, function () {
      record.publication = pub.checked; points.hidden = publicationNote.hidden = !record.publication;
      select.disabled = record.publication; refresh(record);
    });
    settings.appendChild(points);
    var tools = el('div', 'vhome-charts-extra');
    [['generatePalCentileChart', 'Generuj PDF z bieżącymi ustawieniami'], ['openPublicationCreatorBtn', 'Otwórz kreator adnotacji']].forEach(function (item) {
      var button = action(item[1], 'vhome-growth-secondary', function () { launchNative(record, item[0]); });
      button.dataset.chartNative = item[0]; tools.appendChild(button);
    });
    settings.appendChild(tools);
  }
  function render(record) {
    var body = record.dialog.querySelector('.vhome-dialog-body');
    body.replaceChildren();
    body.scrollTop = 0;
    if (record.stage !== 'choose' || record.options.onBack) {
      var back = action(record.stage === 'choose' ? '← Dokumenty pacjenta' : '← Wybór siatek', 'vhome-charts-back', function () {
        if (dirty(record) && !w.confirm('Odrzucić niezastosowane ustawienia i komentarze siatek?')) return;
        if (record.stage !== 'choose') {
          record.layout = record.originalLayout; record.publication = record.originalPublication;
          record.points.forEach(function (point) { point.checked = point.originalChecked; point.text = point.originalText; });
          showStage(record, 'choose'); return;
        }
        if (current(record) && close(true)) record.options.onBack();
      });
      back.dataset.chartBack = ''; body.appendChild(back);
    }
    var context = el('div', 'vhome-charts-context');
    context.append(el('strong', 'vhome-dialog-context', record.name), el('p', 'vhome-growth-field-note', 'Dane pochodzą z bieżącej wizyty i historii pomiarów.'));
    body.appendChild(context);
    if (record.stage === 'choose') renderChoice(record, body);
    else if (record.stage === 'pdf') renderPdf(record, body);
    else if (record.stage === 'publication') renderPublication(record, body);
    else section(body, 'Kreator siatek').appendChild(el('p', 'vhome-growth-field-note', 'Kreator jest dostępny, gdy wybrana w formularzu referencja obejmuje wiek pacjenta.'));
    var status = el('p', 'vhome-growth-draft-status');
    status.dataset.chartStatus = ''; status.setAttribute('role', 'status'); body.appendChild(status);
    refresh(record);
  }
  function open(options) {
    if (active || d.querySelector('dialog[open]') || !options.valid()) return false;
    var base = options.snapshot(); if (!base) return false;
    var patient = base.owner.patient, sourcePopulation = population(patient);
    if (!sourcePopulation) return false;
    var mode = options.mode === 'creator' || options.mode === 'publication' ? options.mode : 'choose';
    if (!options.replaceHistory && mode !== 'choose' && canLaunch(mode, { population: sourcePopulation }) && options.valid()) {
      byId(nativeId(mode)).click(); return true;
    }
    if (w.VildaVault?.onLock && !watchedVaults.has(w.VildaVault)) {
      watchedVaults.add(w.VildaVault); w.VildaVault.onLock(function () { close(true); });
    }
    var publication = byId('publicationChartsToggle'), layout = d.querySelector('input[name="palPdfLayout"]:checked')?.value || 'portrait';
    var record = { options: options, stage: mode, patient: patient, population: sourcePopulation, fingerprint: JSON.stringify(base),
      name: [byId('firstName').value, byId('lastName').value].filter(Boolean).join(' ') || 'Bieżący pomiar',
      publication: publication.checked, originalPublication: publication.checked, layout: layout, originalLayout: layout,
      settingsAvailable: sourcePopulation !== 'DS' && state()?.source === 'PALCZEWSKA',
      points: annotations().map(function (point) { return { node: point, checked: point.check.checked, text: point.comment.value, originalChecked: point.check.checked, originalText: point.comment.value }; }),
      historyToken: 'growth-charts-' + Date.now() + '-' + (++sequence) };
    var dialog = cachedDialog || w.VildaHomeWorkspace.createDialog({ id: 'vhomeGrowthChartsDialog', titleId: 'vhomeGrowthChartsTitle', title: 'Generuj siatki',
      applyLabel: 'Zastosuj ustawienia', onApply: function () {
        if (active?.stage === 'pdf') generate(active);
        else if (active?.stage === 'publication') apply(active);
      }, onClose: function () { close(false); } });
    cachedDialog = dialog; record.dialog = dialog; record.initial = values(record); active = record; render(record);
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
