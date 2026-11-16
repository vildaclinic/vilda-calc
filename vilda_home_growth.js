/* Opt-in home growth workspace. Existing controls, collectors and engines own
 * clinical facts and calculations. Draft input never reaches those controls.
 * Result views copy only the already-rendered native presentation; no new
 * thresholds, equations, method qualification or trajectory logic live here. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomeGrowth) return;
  var d = w.document, started = false, card, dialog, draft = null, renderFrame = 0, sequence = 0, readinessTimer;
  var rowKeys = new WeakMap(), inputChanges = new WeakMap(), inputInitials = new WeakMap(), historyTemplate;
  var fields = [
    ['advMotherHeight', 'Wzrost matki · cm'], ['advFatherHeight', 'Wzrost ojca · cm'],
    ['advBoneAge', 'Wiek kostny tej wizyty · lata'], ['advFamilyDelayedPuberty', 'Rodzinne opóźnienie dojrzewania', 'M'],
    ['advTesticularVolume', 'Objętość jąder · ml', 'M'], ['advGrowthExclusion', 'Czynniki wpływające na wzrastanie', 'M'],
    ['pubertyOnsetAge', 'Wiek początku pokwitania · lata'], ['pubertyMenarcheAge', 'Wiek menarche · lata', 'F'],
    ['pubertyMenarcheHeight', 'Wzrost przy menarche · cm', 'F'], ['pubertyMenarcheBoneAge', 'Wiek kostny przy menarche · lata', 'F'],
    ['pubertyCdgp', 'KOWD · ocena lekarza'], ['pubertyGnrhaStatus', 'Leczenie analogiem GnRH'],
    ['pubertyGnrhaStartAge', 'Wiek rozpoczęcia GnRHa · lata'], ['pubertyGnrhaStopAge', 'Wiek zakończenia GnRHa · lata']
  ];
  var historyFields = [
    ['.adv-age-years', 'Wiek · lata'], ['.adv-age-months', 'Wiek · mies.'],
    ['.adv-height', 'Wzrost · cm'], ['.adv-weight', 'Masa · kg'], ['.adv-bone-age', 'Wiek kostny · lata']
  ];
  var tabs = { analysis: 'Analiza', data: 'Dane i pomiary', methods: 'Prognozy' };
  function el(tag, cls, text) {
    var node = d.createElement(tag); if (cls) node.className = cls;
    if (text != null) node.textContent = text; return node;
  }
  function byId(id) { return d.getElementById(id); }
  function value(id) { var node = byId(id); return node ? node.value : ''; }
  function key(row) { if (!rowKeys.has(row)) rowKeys.set(row, 'row-' + (++sequence)); return rowKeys.get(row); }
  function patientId() { try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; } catch (_) { return null; } }
  function canEdit() {
    try {
      return !!(w.VildaVault && w.VildaVault.isUnlocked() && w.VildaAuthUI && w.VildaAuthUI.isBootReady()
        && w.VildaProAccess && w.VildaProAccess.hasAccess() && !w.__vildaPersistRestoring && !w.__vildaLustroWpis
        && !w.VildaDataImportExport.isMainSessionRestorePending()
        && !(w.VildaPersistence && (typeof w.VildaPersistence.isAutosaveSuppressed === 'function' && w.VildaPersistence.isAutosaveSuppressed()
          || typeof w.VildaPersistence.isClearInProgress === 'function' && w.VildaPersistence.isClearInProgress()))
        && !(Number(w.__vildaPersistClearUntil || 0) > Date.now())
        && !(w.VildaPanelPacjent && w.VildaPanelPacjent.nieaktualny()));
    } catch (_) { return false; }
  }
  function owner() {
    if (!canEdit()) return null;
    var measured = w.VildaDobAge ? w.VildaDobAge.readMeasuredAtISO() : null;
    return { account: w.VildaVault.getCurrentUser().userId, patient: patientId(),
      load: w.VildaDataImportExport.getApplyLoadedDataSequence(),
      basics: ['firstName', 'lastName', 'sex', 'age', 'ageMonths', 'ageWeeks', 'dobInput', 'height', 'weight'].map(value),
      visit: w.VildaVisitContext ? w.VildaVisitContext.capture({ user: { measuredAtISO: measured } },
        { patientId: patientId(), readOnly: true }) : null };
  }
  function rows() { return Array.from(byId('advMeasurements').querySelectorAll('.measure-row')); }
  function protectedRow(node) { return !!(node.getAttribute('data-gh-id') || node.getAttribute('data-gh-sync') === 'true'); }
  function rowValues(node) {
    return historyFields.map(function (entry) { return node.querySelector(entry[0]).value; });
  }
  function snapshot() {
    var scope = owner(); if (!scope) return null;
    return { owner: scope, fields: fields.map(function (entry) { return value(entry[0]); }),
      history: rows().map(function (node) { return { key: key(node), values: rowValues(node),
        attributes: Array.from(node.attributes).filter(function (a) { return /^data-(?:gh|intake|sync)/.test(a.name); })
          .map(function (a) { return [a.name, a.value]; }),
        arrow: [!!node.querySelector('.adv-arrow-enable')?.checked, node.querySelector('.adv-arrow-comment')?.value || ''] }; }),
      bone: w.VildaBoneAge ? w.VildaBoneAge.capture() : null,
      puberty: w.VildaPubertyAssessmentState ? w.VildaPubertyAssessmentState.readReadOnly().assessment : null,
      source: d.querySelector('input[name="dataSource"]:checked')?.value,
      birth: w.vildaBirthData || null, gh: w.ghTherapyPoints || null, obesity: w.obesityTherapyPoints || null };
  }
  function tokenValid(item) {
    try {
      if (item.vault !== w.VildaVault) return false;
      if (item.token != null) item.vault.assertSyncOperationSession(item.token);
      return JSON.stringify(owner()) === item.ownerKey;
    } catch (_) { return false; }
  }
  function stillOwned() {
    try { return !!(draft && tokenValid(draft) && JSON.stringify(snapshot()) === draft.fingerprint); }
    catch (_) { return false; }
  }
  function dirty() { return !!(draft && JSON.stringify([draft.values, draft.rows.map(function (r) { return [r.key, r.values]; })]) !== draft.initial); }
  function fresh() {
    return !!(w.VildaAdvancedGrowth && w.VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput());
  }
  function number(value) { return typeof value === 'number' && Number.isFinite(value); }
  function format(value) { return number(value) ? value.toLocaleString('pl-PL', { maximumFractionDigits: 1 }) : '—'; }
  function close(force, focus, fromHistory) {
    if (!dialog || !dialog.open) return true;
    if (!force && dirty() && !w.confirm('Odrzucić niezastosowane dane obliczeń wzrostowych?')) return false;
    var old = draft; draft = null;
    if (old) w.clearInterval(old.timer);
    dialog.close(); dialog.removeAttribute('aria-modal'); dialog.querySelector('.vhome-dialog-body').replaceChildren();
    if (!fromHistory && old && w.history.state?.vildaHomeDialog === old.historyToken) w.history.back();
    if (focus || !force) byId('vhomeGrowthExpand').focus({ preventScroll: true });
    return true;
  }
  // Cloning already-rendered native result nodes avoids a second calculation
  // path. Namespace IDs so the canonical renderer never selects a preview node.
  function resultCopy(node) {
    var copy = node.cloneNode(true), idMap = new Map(), nodes = [copy].concat(Array.from(copy.querySelectorAll('*')));
    nodes.forEach(function (item) {
      if (item.id) { var next = 'vhomeGrowthResult-' + (++sequence); idMap.set(item.id, next); item.id = next; }
    });
    nodes.forEach(function (item) {
      ['aria-controls', 'aria-labelledby', 'aria-describedby', 'for'].forEach(function (attr) {
        if (item.hasAttribute(attr)) item.setAttribute(attr, item.getAttribute(attr).split(' ').map(function (id) { return idMap.get(id) || id; }).join(' '));
      });
    });
    return copy;
  }
  function renderResults(tab) {
    var panel = byId('vhomeGrowthPanel-' + tab); if (!panel) return;
    panel.replaceChildren();
    if (dirty() || !fresh()) {
      panel.appendChild(el('p', 'vhome-growth-empty', dirty()
        ? 'Masz niezastosowane dane. Zastosuj je, aby zobaczyć aktualną analizę i prognozy.'
        : 'Uzupełnij bieżący pomiar i dane w zakładce „Dane i pomiary”, aby zobaczyć aktualne wyniki.'));
      return;
    }
    var native = byId('advResults');
    if (tab === 'methods') {
      panel.appendChild(el('h3', '', 'Prognozy wzrostu ostatecznego'));
      var methods = native.querySelector('.vgcc');
      if (methods) panel.appendChild(resultCopy(methods));
      else panel.appendChild(el('p', 'vhome-growth-empty', 'Brak wyliczonej prognozy dla bieżących danych.'));
    } else {
      panel.appendChild(el('h3', '', 'Analiza trajektorii'));
      var trajectory = native.querySelector('.adv-growth-result-block--trajectory');
      if (trajectory) {
        panel.appendChild(resultCopy(trajectory));
        if (w.VildaTrajectoryAnalysis) w.VildaTrajectoryAnalysis.wirePanelToggle(panel);
      } else panel.appendChild(el('p', 'vhome-growth-empty', 'Do analizy trajektorii potrzebne są wcześniejsze pomiary.'));
      var potential = el('section', 'vhome-growth-potential');
      potential.appendChild(el('h3', '', 'Tempo i potencjał rodzinny'));
      Array.from(native.children).forEach(function (node) {
        if (node.matches('.vgcc, .adv-growth-result-block--trajectory')) return;
        potential.appendChild(resultCopy(node));
      });
      var gcc = native.querySelector('.vgcc');
      if (gcc) ['.vgcc-mph', '.vgcc-stats', '.vgcc-target'].forEach(function (selector) {
        var item = gcc.querySelector(selector); if (item) potential.appendChild(resultCopy(item));
      });
      panel.appendChild(potential);
    }
  }
  function selectTab(tab, focus) {
    if (!draft || !tabs[tab]) return;
    draft.tab = tab;
    Object.keys(tabs).forEach(function (name) {
      var button = byId('vhomeGrowthTab-' + name);
      button.setAttribute('aria-selected', String(tab === name)); button.tabIndex = tab === name ? 0 : -1;
      byId('vhomeGrowthPanel-' + name).hidden = tab !== name;
    });
    if (tab !== 'data') renderResults(tab);
    if (focus) byId('vhomeGrowthTab-' + tab).focus({ preventScroll: true });
    dialog.querySelector('.vhome-dialog-body').scrollTop = 0;
    refreshFooter();
  }
  function refreshFooter() {
    if (!draft) return;
    var changed = dirty();
    dialog.querySelector('.vhome-dialog-apply').disabled = !changed;
    byId('vhomeGrowthDraftStatus').textContent = changed ? 'Masz niezastosowane dane.' : 'Wspólne pomiary · zmiany pozostają szkicem do zatwierdzenia.';
    dialog.querySelectorAll('[data-growth-document]').forEach(function (button) { button.disabled = changed || !fresh(); });
  }
  function inputCopy(original, labelText, container, initial, onChange, disabled) {
    var label = el('label', '', labelText), control = d.createElement(original.tagName.toLowerCase());
    ['type', 'min', 'max', 'step', 'inputmode', 'placeholder'].forEach(function (attr) {
      if (original.hasAttribute(attr)) control.setAttribute(attr, original.getAttribute(attr));
    });
    if (original.tagName === 'SELECT') Array.from(original.options).forEach(function (choice) {
      var option = el('option', '', choice.textContent); option.value = choice.value; option.disabled = choice.disabled; control.appendChild(option);
    });
    control.disabled = !!disabled; control.readOnly = false; control.value = initial;
    control.setAttribute('aria-label', labelText); control.setAttribute('autocomplete', 'off');
    inputChanges.set(control, onChange);
    inputInitials.set(control, initial);
    label.appendChild(control); container.appendChild(label); return label;
  }
  function dataField(entry, container) {
    if (entry[2] && entry[2] !== value('sex')) return;
    var original = byId(entry[0]); if (!original) return;
    var label = inputCopy(original, entry[1], container, draft.values[entry[0]], function (next) { draft.values[entry[0]] = next; });
    label.querySelector('input,select').setAttribute('data-growth-field', entry[0]);
    var note;
    if (entry[0] === 'advTesticularVolume') note = 'Pomiar dodatkowy u chłopców. Wspiera ocenę profilu opóźnionego dojrzewania KOWD/CDGP i interpretację prognoz wzrostu. Nie zastępuje oceny G Tannera ani rozpoznania lekarza.';
    if (entry[0] === 'advGrowthExclusion') note = 'Choroba przewlekła, zaburzenie endokrynologiczne, zespół genetyczny lub leczenie wpływające na wzrastanie. Informacja służy ocenie zakresu zastosowania metod.';
    if (entry[0] === 'pubertyCdgp') note = byId('pubertyCdgpNote').textContent;
    if (entry[0] === 'advBoneAge') note = byId('advBoneAgeLastInfo')?.textContent || 'Wpisz wynik badania odnoszący się do tej wizyty. Wcześniejszy wynik pozostaje w historii.';
    if (note) { var small = el('small', 'vhome-growth-field-note', note); small.id = 'vhomeGrowthNote-' + entry[0]; label.appendChild(small); label.querySelector('input,select').setAttribute('aria-describedby', small.id); }
  }
  function section(title, parent) { var node = el('section', 'vhome-growth-section'); node.appendChild(el('h3', '', title)); parent.appendChild(node); return node; }
  function renderRows() {
    var host = byId('vhomeGrowthRows'); host.replaceChildren();
    draft.rows.forEach(function (row) {
      var node = el('div', 'vhome-growth-history-row'); node.dataset.growthRow = row.key;
      historyFields.forEach(function (entry, index) {
        var original = row.node ? row.node.querySelector(entry[0]) : draft.template.querySelector(entry[0]);
        var label = inputCopy(original, entry[1], node, row.values[index], function (next) { row.values[index] = next; }, row.protected);
        var control = label.querySelector('input'); control.setAttribute('data-growth-history-field', String(index));
        // Rebuilding after Add/Remove must not make an edited value its own
        // baseline and accidentally bypass the native input constraints.
        inputInitials.set(control, row.node ? original.value : index === 1 ? '0' : '');
      });
      if (row.protected) node.appendChild(el('p', 'vhome-growth-field-note', 'Punkt terapii GH · edycja w monitorze leczenia.'));
      var remove = el('button', 'vhome-growth-remove', 'Usuń pomiar'); remove.type = 'button'; remove.disabled = row.protected;
      remove.addEventListener('click', function () { draft.rows = draft.rows.filter(function (item) { return item !== row; }); renderRows(); refreshFooter(); });
      node.appendChild(remove); host.appendChild(node);
    });
    byId('vhomeGrowthRowsEmpty').hidden = draft.rows.length > 0;
  }
  function renderData(panel) {
    var family = section('Dane rodzinne i wiek kostny', panel), familyGrid = el('div', 'vhome-growth-fields'); family.appendChild(familyGrid);
    fields.slice(0, 4).forEach(function (entry) { dataField(entry, familyGrid); });
    var conditions = section('Warunki interpretacji', panel), conditionGrid = el('div', 'vhome-growth-fields'); conditions.appendChild(conditionGrid);
    fields.slice(4, 6).forEach(function (entry) { dataField(entry, conditionGrid); });
    var puberty = section('Początek dojrzewania i wywiad', panel), pubertyGrid = el('div', 'vhome-growth-fields'); puberty.appendChild(pubertyGrid);
    fields.slice(6).forEach(function (entry) { dataField(entry, pubertyGrid); });
    var history = section('Historyczne pomiary', panel);
    history.appendChild(el('p', 'vhome-growth-field-note', 'Bieżący pomiar pozostaje w formularzu głównym. Punkty terapii GH są edytowane w monitorze leczenia.'));
    var list = el('div', ''); list.id = 'vhomeGrowthRows'; history.appendChild(list);
    var empty = el('p', 'vhome-growth-empty', 'Brak wcześniejszych pomiarów.'); empty.id = 'vhomeGrowthRowsEmpty'; history.appendChild(empty);
    var add = el('button', 'vhome-growth-secondary', '+ Dodaj pomiar'); add.type = 'button'; add.dataset.growthAdd = '';
    add.addEventListener('click', function () {
      if (!stillOwned()) { close(true); return; }
      draft.rows.push({ key: 'new-' + (++sequence), node: null, values: ['', '0', '', '', ''], protected: false });
      renderRows(); refreshFooter(); list.lastElementChild.querySelector('input').focus();
    });
    history.appendChild(add); renderRows();
  }
  function apply() {
    if (!stillOwned()) { close(true); return; }
    if (!dirty()) return;
    var controls = Array.from(dialog.querySelectorAll('[data-growth-field], [data-growth-history-field]'));
    var invalid = controls.find(function (control) {
      return !control.disabled && control.value !== inputInitials.get(control) && !control.checkValidity();
    });
    if (invalid) { selectTab('data'); invalid.reportValidity(); return; }
    var item = draft, oldRows = rows(), notifications = [];
    var factsChanged = fields.some(function (entry) {
      return (entry[0] === 'advTesticularVolume' || entry[0].indexOf('puberty') === 0)
        && (!entry[2] || entry[2] === value('sex')) && value(entry[0]) !== item.values[entry[0]];
    });
    // Every retained native node keeps its unknown metadata, arrow annotations,
    // sync identity and listeners. Protected therapy rows cannot enter this edit.
    close(true, true);
    function valid() { return tokenValid(item); }
    if (!valid()) return;
    if (factsChanged && w.VildaPubertyAssessmentState) {
      var authorization = w.VildaPubertyAssessmentState.markFactsEdited();
      if (!authorization?.ok || !valid()) return;
    }
    for (var index = 0; index < item.rows.length; index += 1) {
      var row = item.rows[index];
      if (row.protected) continue;
      if (!row.node) {
        var previous = rows();
        byId('advAddMeasurementBtn').click();
        if (!valid()) return;
        row.node = rows().find(function (node) { return previous.indexOf(node) < 0; });
        if (!row.node) return;
      }
      historyFields.forEach(function (entry, i) {
        var original = row.node.querySelector(entry[0]);
        if (original.value !== row.values[i]) { original.value = row.values[i]; notifications.push(original); }
      });
    }
    fields.forEach(function (entry) {
      if (entry[2] && entry[2] !== value('sex')) return;
      var original = byId(entry[0]);
      if (original.value !== item.values[entry[0]]) { original.value = item.values[entry[0]]; notifications.push(original); }
    });
    for (var removed of oldRows) {
      if (!valid()) return;
      if (!protectedRow(removed) && !item.rows.some(function (row) { return row.node === removed; })) removed.querySelector('.remove-measure').click();
    }
    for (var control of notifications) {
      if (!valid()) return;
      control.dispatchEvent(new w.Event('input', { bubbles: true }));
      if (!valid()) return;
      control.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    if (!valid()) return;
    w.calculateGrowthAdvanced();
    if (!valid()) return;
    if (typeof w.vildaPersistFlushNow === 'function') w.vildaPersistFlushNow({ force: true });
    if (valid()) w.VildaDataImportExport.saveMainSessionNow();
    schedule();
  }
  function open(tab) {
    if (!started || !canEdit() || card.hidden) return false;
    if (dialog?.open) { selectTab(tabs[tab] ? tab : 'analysis', true); return true; }
    if (d.querySelector('dialog[open]')) return false;
    var base = snapshot(); if (!base) return false;
    if (!dialog) {
      dialog = w.VildaHomeWorkspace.createDialog({ id: 'vhomeGrowthDialog', titleId: 'vhomeGrowthTitle', title: 'Zaawansowane obliczenia wzrostowe',
        applyLabel: 'Zastosuj dane', onApply: apply, onClose: function () { close(false); } });
    }
    var vault = w.VildaVault, token = typeof vault.captureSyncOperationSession === 'function' ? vault.captureSyncOperationSession() : null;
    var values = {}; fields.forEach(function (entry) { values[entry[0]] = value(entry[0]); });
    var history = rows().map(function (node) { return { key: key(node), node: node, values: rowValues(node), protected: protectedRow(node) }; });
    draft = { values: values, rows: history, template: rows()[0] || historyTemplate, tab: 'data', vault: vault, token: token,
      fingerprint: JSON.stringify(base), ownerKey: JSON.stringify(base.owner),
      historyToken: 'growth-' + Date.now(), initial: JSON.stringify([values, history.map(function (r) { return [r.key, r.values]; })]) };
    var body = dialog.querySelector('.vhome-dialog-body');
    body.appendChild(el('p', 'vhome-dialog-context', [value('firstName'), value('lastName')].filter(Boolean).join(' ') || 'Bieżący pomiar'));
    var bar = el('div', 'vhome-growth-tabs'); bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Zaawansowane obliczenia wzrostowe');
    Object.keys(tabs).forEach(function (name) {
      var button = el('button', '', tabs[name]); button.type = 'button'; button.id = 'vhomeGrowthTab-' + name;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'vhomeGrowthPanel-' + name);
      button.addEventListener('click', function () { selectTab(name, true); });
      button.addEventListener('keydown', function (event) {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) < 0) return;
        event.preventDefault(); var names = Object.keys(tabs), index = names.indexOf(name);
        selectTab(event.key === 'Home' ? names[0] : event.key === 'End' ? names[2] : names[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3], true);
      }); bar.appendChild(button);
    }); body.appendChild(bar);
    Object.keys(tabs).forEach(function (name) {
      var panel = el('div', 'vhome-growth-panel'); panel.id = 'vhomeGrowthPanel-' + name;
      panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'vhomeGrowthTab-' + name); body.appendChild(panel);
    });
    renderData(byId('vhomeGrowthPanel-data'));
    var status = el('p', 'vhome-growth-draft-status'); status.id = 'vhomeGrowthDraftStatus'; status.setAttribute('role', 'status'); body.appendChild(status);
    var documents = el('div', 'vhome-growth-documents');
    [['Siatki centylowe', 'charts'], ['Raport wzrastania', 'report']].forEach(function (entry) {
      var button = el('button', 'vhome-growth-secondary', entry[0]); button.type = 'button'; button.dataset.growthDocument = entry[1];
      button.addEventListener('click', function () {
        if (!stillOwned() || dirty() || !fresh()) return;
        close(true, true);
        if (entry[1] === 'charts' && w.VildaPatientDocuments) w.VildaPatientDocuments.open({ opener: byId('vhomeGrowthExpand') });
        else if (entry[1] === 'report') w.generateAdvancedGrowthPdfReport();
      }); documents.appendChild(button);
    }); body.appendChild(documents);
    selectTab(tabs[tab] ? tab : 'analysis');
    w.VildaHomeWorkspace.fitDialog(dialog); dialog.setAttribute('aria-modal', 'true'); dialog.showModal();
    w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: draft.historyToken }), '', w.location.href);
    draft.timer = w.setInterval(function () { if (!stillOwned()) close(true); }, 250);
    byId('vhomeGrowthTab-' + draft.tab).focus({ preventScroll: true });
    return true;
  }
  function refreshReadiness() {
    w.clearTimeout(readinessTimer); readinessTimer = null;
    if (!started) return;
    var ready = canEdit();
    [byId('vhomeGrowthExpand')].concat(Array.from(card.querySelectorAll('[data-growth-open]'))).forEach(function (button) {
      if (button.disabled !== !ready) button.disabled = !ready;
    });
    // Restore/upgrade can release its final native guard after the last event.
    // Recheck only readiness, never calculations or persistence. Stop as soon
    // as ready, hidden, locked or owned by a different patient.
    var panel = w.VildaPanelPacjent;
    if (!ready && !card.hidden && w.VildaVault?.isUnlocked()
      && (!panel || typeof panel.wlasciciel !== 'function' || (panel.wlasciciel() || null) === patientId())) {
      var until = Number(w.__vildaPersistClearUntil || 0);
      readinessTimer = w.setTimeout(refreshReadiness, until > Date.now() ? until - Date.now() + 1 : 250);
    }
  }
  function renderCard() {
    renderFrame = 0; if (!started) return;
    if (!historyTemplate && rows()[0]) historyTemplate = rows()[0].cloneNode(true);
    var native = byId('advancedGrowthSection'); card.hidden = native.hidden || w.getComputedStyle(native).display === 'none';
    var grid = byId('vhomeMainCards'), heading = byId('vhomeAnalysisHeading');
    if (grid && heading) heading.hidden = grid.hidden = Array.from(grid.children).every(function (node) { return node.hidden; });
    var valid = fresh(), data = valid ? w.advancedGrowthData : null;
    [['velocity', data?.growthVelocity, 'cm/rok'], ['mph', data?.targetHeight, 'cm'],
      ['bone', data?.boneAgeMonths == null ? null : data.boneAgeMonths / 12, 'lat']].forEach(function (entry) {
      var strong = byId('vhomeGrowth-' + entry[0]), text = format(entry[1]) + (number(entry[1]) ? ' ' + entry[2] : '');
      if (strong.textContent !== text) {
        strong.replaceChildren(d.createTextNode(format(entry[1])));
        if (number(entry[1])) strong.appendChild(el('small', '', ' ' + entry[2]));
      }
    });
    refreshReadiness();
  }
  function schedule() { if (!renderFrame) renderFrame = w.requestAnimationFrame(renderCard); }
  function start() {
    if (started || !w.VildaHomeWorkspace || !byId('advancedGrowthSection') || !byId('advMeasurements')) return;
    started = true;
    historyTemplate = rows()[0]?.cloneNode(true);
    var native = byId('advancedGrowthSection'); native.classList.add('vhome-growth-native');
    native.inert = true; native.setAttribute('aria-hidden', 'true');
    // Keep the canonical volume node in its original hidden owner. Only the
    // advanced draft edits it; the pubertal observation dialog has no copy.
    card = el('section', 'vhome-growth-card'); card.id = 'vhomeGrowthCard'; card.setAttribute('aria-labelledby', 'vhomeGrowthHeading');
    var header = el('div', 'vhome-growth-heading'), heading = el('h2', '', 'Zaawansowane obliczenia wzrostowe'); heading.id = 'vhomeGrowthHeading';
    var expand = el('button', 'vhome-growth-expand');
    var expandIcon = byId('tannerToggleBtn').querySelector('svg');
    if (expandIcon) expand.appendChild(expandIcon.cloneNode(true)); expand.type = 'button'; expand.id = 'vhomeGrowthExpand';
    expand.setAttribute('aria-label', 'Powiększ zaawansowane obliczenia wzrostowe'); expand.setAttribute('aria-haspopup', 'dialog');
    expand.addEventListener('click', function () { open('analysis'); }); header.append(heading, expand); card.appendChild(header);
    var summary = el('div', 'vhome-growth-summary');
    [['velocity', 'Tempo wzrastania', 'Z historii pomiarów'], ['mph', 'Potencjał genetyczny · MPH', 'Z danych rodzinnych'],
      ['bone', 'Wiek kostny', 'Badanie tej wizyty']].forEach(function (entry) {
      var item = el('div', ''); item.appendChild(el('span', '', entry[1])); var strong = el('strong', '', '—'); strong.id = 'vhomeGrowth-' + entry[0];
      item.append(strong, el('small', '', entry[2])); summary.appendChild(item);
    }); card.appendChild(summary);
    var bottom = el('div', 'vhome-growth-bottom'); bottom.appendChild(el('p', '', 'Historia pomiarów i dane rodzinne w jednym oknie.'));
    var actions = el('div', 'vhome-growth-entry-actions');
    [['data', 'Pomiary i obliczenia ↗'], ['analysis', 'Analiza trajektorii ↗']].forEach(function (entry) {
      var button = el('button', 'vhome-growth-secondary', entry[1]); button.type = 'button'; button.dataset.growthOpen = entry[0];
      button.addEventListener('click', function () { open(entry[0]); }); actions.appendChild(button);
    }); bottom.appendChild(actions); card.appendChild(bottom);
    var label = el('div', 'vhome-analysis-heading'); label.id = 'vhomeAnalysisHeading';
    label.append(el('span', '', 'ANALIZA I DOKUMENTACJA'), el('span', '', 'Dane pacjenta w jednym miejscu'));
    var grid = el('div', 'vhome-main-cards'); grid.id = 'vhomeMainCards'; grid.appendChild(card); byId('calcForm').after(label, grid);
    // Capture before the legacy expanding listener, without replacing it in
    // the normal app. Existing callers can still use the public native ID.
    byId('toggleAdvancedGrowth').addEventListener('click', function (event) { event.preventDefault(); event.stopImmediatePropagation(); open('data'); }, true);
    new w.MutationObserver(schedule).observe(native, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    new w.MutationObserver(function () {
      schedule();
      if (draft && !stillOwned()) close(true);
      else if (draft && !dirty() && draft.tab !== 'data') renderResults(draft.tab);
    })
      .observe(byId('advResults'), { childList: true });
    ['input', 'change'].forEach(function (name) {
      w.addEventListener(name, function (event) {
        if (!dialog?.open || !dialog.contains(event.target)) return;
        event.stopImmediatePropagation();
        if (!stillOwned()) { close(true); return; }
        var change = inputChanges.get(event.target);
        if (change) { change(event.target.value); refreshFooter(); }
      }, true);
    });
    ['input', 'change', 'vilda:data-applied', 'vilda:professional-summary-updated', 'vilda:main-session-restored',
      'vilda:initial-main-session-restore-settled', 'vilda:state-restored', 'vilda:persist-restored',
      'vilda:session-changed', 'vilda:auth-boot-settled', 'vildaProAccessChanged'].forEach(function (name) { d.addEventListener(name, schedule); });
    // During a PWA upgrade the host can finish restoring after this document's
    // first render. Re-read the native readiness gates on the settled lifecycle.
    w.addEventListener('pageshow', schedule);
    ['vilda:user-state-cleared', 'vilda:patient-loaded', 'vilda:auth-loaded'].forEach(function (name) {
      d.addEventListener(name, function () { close(true); schedule(); });
    });
    w.addEventListener('vilda:user-state-cleared', function () { close(true); schedule(); });
    if (w.VildaVault?.onLock) w.VildaVault.onLock(function () { close(true); schedule(); });
    w.addEventListener('popstate', function () {
      if (!draft || !dialog.open || w.history.state?.vildaHomeDialog === draft.historyToken) return;
      if (!close(false, true, true)) w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: draft.historyToken }), '', w.location.href);
    });
    renderCard();
  }
  w.VildaHomeGrowth = Object.freeze({ open: open, refresh: schedule });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(typeof window !== 'undefined' ? window : globalThis);
