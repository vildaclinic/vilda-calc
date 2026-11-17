/* Opt-in dietary workspace. Draft controls have no canonical IDs/names or
 * native delegated actions. Apply uses the original controls and actors;
 * recommendations, qualification, BMI forecasts and documents remain native. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomeDiet) return;
  var d = w.document, card, dialog, draft, started = false, frame = 0, sequence = 0, loading = null, output = null, readinessTimer;
  var fields = ['palFactor', 'dietLevel', 'reduceToggle', 'stabilizationToggle', 'growthEndedFlag', 'customGoalKg',
    'nutritionNormsFlag', 'vitDSuppFlag', 'hydrationFlag', 'journeyFlag', 'peerMassFlag', 'alcoholFlag'];
  var flags = [['growthEndedFlag', 'Wzrastanie zakończone'], ['nutritionNormsFlag', 'Normy żywieniowe'],
    ['vitDSuppFlag', 'Witamina D'], ['hydrationFlag', 'Picie płynów'], ['journeyFlag', 'Czas do normy masy'],
    ['peerMassFlag', 'Masa rówieśnika'], ['alcoholFlag', 'Alkohol']];
  var valueChanges = new WeakMap();
  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function byId(id) { return d.getElementById(id); }
  function value(id) { var n = byId(id); return n ? n.type === 'checkbox' ? n.checked : n.value : null; }
  function setText(n, text) { if (n && n.textContent !== text) n.textContent = text; }
  function patientId() { try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; } catch (_) { return null; } }
  function canEdit() {
    try {
      return !!(w.VildaVault?.isUnlocked() && w.VildaAuthUI?.isBootReady() && w.VildaProAccess?.hasAccess()
        && !w.__vildaPersistRestoring && !w.__vildaLustroWpis && !w.VildaDataImportExport.isMainSessionRestorePending()
        && !w.VildaPersistence?.isAutosaveSuppressed() && !w.VildaPersistence?.isClearInProgress?.()
        && !(Number(w.__vildaPersistClearUntil || 0) > Date.now()) && !w.VildaPanelPacjent?.nieaktualny());
    } catch (_) { return false; }
  }
  function owner() {
    if (!canEdit()) return null;
    var measured = w.VildaDobAge?.readMeasuredAtISO();
    return { account: w.VildaVault.getCurrentUser().userId, patient: patientId(),
      load: w.VildaDataImportExport.getApplyLoadedDataSequence(),
      basics: ['firstName', 'lastName', 'sex', 'dobInput', 'age', 'ageMonths', 'ageWeeks', 'height', 'weight'].map(value),
      visit: w.VildaVisitContext ? w.VildaVisitContext.capture({ user: { measuredAtISO: measured } }, { patientId: patientId(), readOnly: true }) : null };
  }
  function goal() { return byId('customGoalWrap')?.querySelector('[data-cel-wlasny-choice][aria-pressed="true"]')?.getAttribute('data-cel-wlasny-choice') || 'maintain'; }
  function journeyState() { return w.VildaBmiJourney?.getSnapshot()?.state || null; }
  function configured() {
    try { return w.VildaPersistence?.readPreferenceJSON('CARD_VISIBILITY', {})?.dietRecommendationsBtn !== false; }
    catch (_) { return true; }
  }
  function snapshot() {
    var who = owner(); if (!who) return null;
    var inputs = Array.from(d.querySelectorAll('#calcForm input[id], #calcForm select[id], #planCard input[id], #planCard select[id], #advancedGrowthSection input[id], #advancedGrowthSection select[id], #whrCard input[id], #whtrCard input[id]'));
    return { owner: who, fields: fields.map(function (id) { return [id, value(id)]; }), goal: goal(),
      source: d.querySelector('input[name="dataSource"]:checked')?.value,
      population: [w.VildaDsSource?.getState()?.status || null, w.VildaDsSource?.populacja() || null],
      inputs: inputs.sort(function (a, b) { return a.id.localeCompare(b.id); }).map(function (n) { return [n.id, n.type === 'checkbox' || n.type === 'radio' ? n.checked : n.value]; }),
      fieldState: fields.map(function (id) { var n = byId(id); return n ? [id, n.disabled, n.dataset.manual || '', n.options ? Array.from(n.options).map(function (o) { return [o.value, o.disabled, o.hidden]; }) : null] : [id]; }),
      history: Array.from(d.querySelectorAll('#advMeasurements .measure-row')).map(function (row) {
        return Array.from(row.querySelectorAll('input')).map(function (n) { return [n.className, n.type === 'checkbox' ? n.checked : n.value]; });
      }), journey: journeyState(), intake: [w.intakeHistory || null, w.intakeEstimatedKcalPerDay ?? null],
      norms: typeof w.nutritionNormsGetUiState === 'function' ? w.nutritionNormsGetUiState() : null,
      manual: [w.__vildaPlanPalTouched === true, w.__vildaDietLevelTouched === true, w.__vildaDietStrategyTouched === true, w.__vildaDietGoalChoice ?? null],
      configured: configured(), birth: w.vildaBirthData || null, gh: w.ghTherapyPoints || null, obesity: w.obesityTherapyPoints || null };
  }
  function ownerValid(item) {
    try { if (!item || item.vault !== w.VildaVault) return false; item.vault.assertSyncOperationSession(item.token); return JSON.stringify(owner()) === item.ownerKey; }
    catch (_) { return false; }
  }
  function stillOwned() { return !!(draft && ownerValid(draft) && (draft.applying || JSON.stringify(snapshot()) === draft.fingerprint)); }
  function dirty() { return !!(draft && JSON.stringify([draft.values, draft.goal, draft.moves]) !== draft.initial); }
  function sourceVisible(n) { return !!(n && !n.hidden && w.getComputedStyle(n).display !== 'none'); }
  function withinVisible(n, stop) {
    for (var node = n; node && node !== stop; node = node.parentElement) if (!sourceVisible(node)) return false;
    return !!n;
  }
  function available() { return configured() && canEdit() && sourceVisible(byId('metabolicSummarySection')) && sourceVisible(byId('dietRecommendationsBtn')) && !byId('dietRecommendationsBtn').disabled; }
  function hasRoad() { return sourceVisible(byId('toNormCard')) && !!byId('bmiJourneyMount'); }
  function outputValid() { return !!(output && output.fingerprint === JSON.stringify(snapshot()) && output.ownerKey === JSON.stringify(owner())); }
  function button(text, fn, cls) { var n = el('button', cls || 'vhome-diet-action', text); n.type = 'button'; n.addEventListener('click', fn); return n; }
  function section(title, cls, host) { var n = el('section', 'vhome-diet-section ' + (cls || '')); n.appendChild(el('h3', '', title)); host.appendChild(n); return n; }
  function note(text) { return el('p', 'vhome-diet-note', text); }
  function change(control, read) { valueChanges.set(control, read); }
  function field(id, text, host) {
    var original = byId(id); if (!original) return null;
    var label = el('label', 'vhome-diet-field', text), control = original.cloneNode(true);
    Array.from(control.attributes).forEach(function (a) { if (!['type', 'min', 'max', 'step', 'inputmode', 'autocomplete'].includes(a.name)) control.removeAttribute(a.name); });
    control.removeAttribute('id'); control.removeAttribute('name'); control.setAttribute('aria-label', text);
    control.dataset.homeDietField = id; control.disabled = original.disabled;
    if (control.tagName === 'SELECT') {
      control.replaceChildren(); Array.from(original.options).forEach(function (o) { var option = el('option', '', o.textContent); option.value = o.value; option.disabled = o.disabled; option.hidden = o.hidden; control.appendChild(option); });
    }
    control.value = draft.values[id]; change(control, function () { draft.values[id] = control.value; });
    label.appendChild(control); host.appendChild(label); return control;
  }
  function choice(name, text, entries, selected, host, applyChoice) {
    var label = el('label', 'vhome-diet-field', text), control = el('select'); control.dataset.homeDietField = name; control.setAttribute('aria-label', text);
    entries.forEach(function (entry) { var option = el('option', '', entry.text); option.value = entry.value; option.disabled = entry.disabled; control.appendChild(option); });
    control.value = selected; label.appendChild(control); host.appendChild(label); change(control, function () { applyChoice(control.value); }); return control;
  }
  function resultCopy(source) {
    var copy = source.cloneNode(true), nodes = [copy].concat(Array.from(copy.querySelectorAll('*'))), ids = new Map();
    nodes.forEach(function (n) { if (n.id) { var id = 'vhomeDietCopy-' + (++sequence); ids.set(n.id, id); n.id = id; }
      Array.from(n.attributes).forEach(function (a) { if (/^on/i.test(a.name) || /^data-/.test(a.name) || a.name === 'name' || a.name === 'form') n.removeAttribute(a.name); });
    });
    nodes.forEach(function (n) { ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby'].forEach(function (attr) { if (n.hasAttribute(attr)) n.setAttribute(attr, n.getAttribute(attr).split(' ').map(function (id) { return ids.get(id) || id; }).join(' ')); }); });
    return copy;
  }
  function readonlyCopy(source, cls) {
    var copy = resultCopy(source); copy.classList.add(cls);
    copy.querySelectorAll('button,input,select,textarea').forEach(function (n) { n.disabled = true; n.removeAttribute('tabindex'); }); return copy;
  }
  function renderEnergy() {
    var host = byId('vhomeDietEnergy'), full = byId('vhomeDietReportBody'), report = byId('vhomeDietReportPreview');
    if (!host || !full || !report) return; host.replaceChildren(); full.replaceChildren(); report.hidden = dirty() || !outputValid();
    if (dirty()) host.appendChild(note('Zastosuj zmienione założenia, aby przeliczyć zalecenia.'));
    else if (outputValid()) {
      host.appendChild(note('Zalecenia dla bieżących danych są gotowe. Pełna treść znajduje się poniżej.'));
      host.appendChild(button('Podgląd zaleceń ↗', function () { report.scrollIntoView({ block: 'start' }); }));
      full.appendChild(readonlyCopy(byId('dietEnergyResult'), 'vhome-diet-native-energy'));
    }
    else host.appendChild(note('Wygeneruj zalecenia dla bieżących danych pacjenta.'));
  }
  function renderRoad() {
    var host = byId('vhomeDietRoadResult'); if (!host) return; host.replaceChildren();
    if (dirty()) { host.appendChild(note('Zastosuj zmienione założenia, aby zobaczyć aktualny plan.')); return; }
    var native = byId('toNormInfo'); if (!native || !hasRoad()) { host.appendChild(note('Dla bieżących danych moduł nie udostępnia Drogi do normy BMI.')); return; }
    var copy = readonlyCopy(native, 'vhome-diet-native-road');
    // PAL and diet are edited once, in the assumptions above. All original
    // numerical results, qualifiers, warnings and native details stay present.
    copy.querySelectorAll('.bmi-journey-seg').forEach(function (n) { if (n.previousElementSibling?.classList.contains('bmi-journey-lbl')) n.previousElementSibling.remove(); n.remove(); });
    copy.querySelectorAll('.bmi-journey-chips').forEach(function (n) { if (n.previousElementSibling?.classList.contains('bmi-journey-lbl')) n.previousElementSibling.remove(); n.remove(); });
    host.appendChild(copy);
  }
  function refreshFooter() {
    if (!draft || !dialog?.open) return;
    var changed = dirty(), valid = stillOwned(), apply = dialog.querySelector('.vhome-dialog-apply');
    apply.disabled = !valid || !changed;
    setText(byId('vhomeDietDraftStatus'), changed ? 'Masz niezastosowane założenia. Wyniki i dokumenty będą dostępne po ich zastosowaniu.' : 'Założenia bieżącej wizyty.');
    dialog.querySelectorAll('[data-home-diet-action]').forEach(function (n) {
      var kind = n.dataset.homeDietAction, selector = kind === 'copy' ? '[data-diet-copy-result="energy"]' : '[data-diet-report-direct="classic"]';
      var native = kind === 'generate' ? byId('generateEnergyDietBtn') : byId('dietRecommendationsContent').querySelector(selector);
      n.disabled = !valid || changed || !available() || !native || native.disabled || kind !== 'generate' && !outputValid()
        || kind === 'pdf' && !w.VildaDietRecommendations?.hasPdfAvailable();
    });
    renderEnergy(); renderRoad();
  }
  function render() {
    var body = dialog.querySelector('.vhome-dialog-body'); body.replaceChildren(); valueChanges = new WeakMap();
    body.appendChild(el('p', 'vhome-dialog-context', [value('firstName'), value('lastName')].filter(Boolean).join(' ') || 'Bieżący pomiar'));
    var grid = el('div', 'vhome-diet-grid'); body.appendChild(grid);
    var assumptions = section('Założenia zaleceń', 'vhome-diet-assumptions', grid), controls = el('div', 'vhome-diet-fields'); assumptions.appendChild(controls);
    var strategies = Array.from(byId('dietRecommendationsContent').querySelectorAll('[data-diet-strategy-choice]'));
    if (strategies.length && withinVisible(strategies[0], byId('dietRecommendationsContent'))) choice('strategy', 'Strategia', strategies.map(function (n) {
      return { value: n.getAttribute('data-diet-strategy-choice'), text: n.textContent, disabled: n.disabled };
    }), draft.values.stabilizationToggle ? 'stabilization' : 'reduction', controls, function (v) { draft.values.reduceToggle = v === 'reduction'; draft.values.stabilizationToggle = v === 'stabilization'; });
    if (sourceVisible(byId('planCard')) || hasRoad()) field('palFactor', 'Poziom aktywności · PAL', controls);
    var nativeDiets = Array.from(byId('bmiJourneyMount')?.querySelectorAll('[data-journey="diet"]') || []);
    var dietAvailable = hasRoad() ? nativeDiets.some(function (n) { return !n.disabled; })
      : sourceVisible(byId('planCard')) && withinVisible(byId('dietLevel'), byId('planCard')) && sourceVisible(byId('dietChoiceWrap'));
    if (dietAvailable) {
      if (hasRoad()) choice('dietLevel', 'Wariant diety', nativeDiets.map(function (n) {
        return { value: n.getAttribute('data-key'), text: n.textContent, disabled: n.disabled };
      }), draft.values.dietLevel, controls, function (v) { draft.values.dietLevel = v; });
      else if (byId('dietLevel').options.length) field('dietLevel', 'Wariant diety', controls);
    }
    if (sourceVisible(byId('customGoalWrap'))) {
      var goals = Array.from(byId('customGoalWrap').querySelectorAll('[data-cel-wlasny-choice]'));
      var goalField;
      function showGoal() { if (goalField) { goalField.parentElement.hidden = draft.goal !== 'custom'; goalField.disabled = byId('customGoalKg').disabled || draft.goal !== 'custom'; } }
      choice('goal', 'Cel', goals.map(function (n) { return { value: n.getAttribute('data-cel-wlasny-choice'), text: n.textContent, disabled: n.disabled }; }), draft.goal, controls, function (v) { draft.goal = v; showGoal(); });
      goalField = field('customGoalKg', 'Masa docelowa · kg', controls); showGoal();
    }
    if (!controls.children.length) assumptions.appendChild(note('Założenia są dobierane przez moduł do bieżących danych pacjenta.'));
    var nativeHint = byId('bmiJourneyMount')?.querySelector('.bmi-journey-pal-note'); if (nativeHint) assumptions.appendChild(note(nativeHint.textContent));
    var planWarning = byId('planWarning');
    if (sourceVisible(byId('planCard')) && sourceVisible(planWarning) && planWarning.textContent.trim()) assumptions.appendChild(readonlyCopy(planWarning, 'vhome-diet-native-warning'));
    var energy = section('Zalecenia energetyczne', 'vhome-diet-energy', grid), energyResult = el('div'); energyResult.id = 'vhomeDietEnergy'; energy.appendChild(energyResult);
    var generate = button('Generuj i skopiuj zalecenia', function () { action('generate'); }); generate.dataset.homeDietAction = 'generate'; energy.appendChild(generate);
    var options = section('Elementy dokumentu', 'vhome-diet-options', grid);
    flags.forEach(function (entry) {
      var original = byId(entry[0]); if (!original || !withinVisible(original, byId('dietRecommendationsContent'))) return;
      var nativeLabel = original.closest('label')?.querySelector('span')?.textContent || entry[1];
      var label = el('label', 'vhome-diet-check'), check = el('input'); check.type = 'checkbox'; check.checked = !!draft.values[entry[0]]; check.disabled = original.disabled;
      check.dataset.homeDietField = entry[0]; check.setAttribute('aria-label', nativeLabel); change(check, function () { draft.values[entry[0]] = check.checked; }); label.append(check, el('span', '', nativeLabel)); options.appendChild(label);
    });
    var document = section('Dokument dla pacjenta', 'vhome-diet-document', grid), actions = el('div', 'vhome-diet-actions'); document.appendChild(actions);
    [['copy', 'Kopiuj zalecenia'], ['pdf', 'Raport PDF dla pacjenta']].forEach(function (entry) { var n = button(entry[1], function () { action(entry[0]); }); n.dataset.homeDietAction = entry[0]; actions.appendChild(n); });
    var report = section('Podgląd zaleceń', 'vhome-diet-native-result', grid); report.id = 'vhomeDietReportPreview'; report.hidden = true;
    var reportBody = el('div'); reportBody.id = 'vhomeDietReportBody'; report.appendChild(reportBody);
    if (hasRoad()) {
      var road = section('Droga do normy BMI', 'vhome-diet-road', grid), result = el('div'); result.id = 'vhomeDietRoadResult'; road.appendChild(result);
      var moves = Array.from(byId('bmiJourneyMount').querySelectorAll('[data-journey="move"]'));
      if (moves.length) { road.appendChild(el('h4', '', 'Ruch w planie')); var row = el('div', 'vhome-diet-fields'); road.appendChild(row);
        moves.forEach(function (original) { var key = original.getAttribute('data-key'), n = button(original.textContent, function () { draft.moves[key] = !draft.moves[key]; n.setAttribute('aria-pressed', String(draft.moves[key])); refreshFooter(); });
          n.dataset.homeDietJourney = 'move'; n.dataset.key = key; n.disabled = original.disabled; n.setAttribute('aria-pressed', String(!!draft.moves[key])); row.appendChild(n); });
      }
    }
    var nativePlan = byId('planResults');
    if (sourceVisible(byId('planCard')) && sourceVisible(nativePlan) && nativePlan.textContent.trim()) {
      var nativeDetails = el('details', 'vhome-diet-section vhome-diet-native-result');
      nativeDetails.append(el('summary', '', 'Pełny wynik modułu energetycznego'), readonlyCopy(nativePlan, 'vhome-diet-native-plan')); grid.appendChild(nativeDetails);
    }
    var status = el('p', 'vhome-diet-draft-status'); status.id = 'vhomeDietDraftStatus'; status.setAttribute('role', 'status'); body.appendChild(status);
  }
  function rebase() {
    var base = snapshot(); if (!base || !draft || !ownerValid(draft)) return false;
    draft.values = {}; fields.forEach(function (id) { draft.values[id] = value(id); }); draft.goal = goal();
    var selectedDiet = byId('bmiJourneyMount')?.querySelector('[data-journey="diet"][aria-pressed="true"]');
    if (selectedDiet) draft.values.dietLevel = selectedDiet.getAttribute('data-key');
    draft.baseValues = Object.assign({}, draft.values);
    draft.moves = Object.assign({}, journeyState()?.moves || {}); draft.fingerprint = JSON.stringify(base);
    draft.initial = JSON.stringify([draft.values, draft.goal, draft.moves]); return true;
  }
  function apply() {
    if (!stillOwned() || !dirty()) return;
    var invalid = Array.from(dialog.querySelectorAll('input,select')).find(function (n) { return !n.disabled && !n.checkValidity(); });
    if (invalid) { invalid.reportValidity(); return; }
    var item = draft, values = Object.assign({}, item.values), desiredGoal = item.goal, moves = Object.assign({}, item.moves), changed = fields.filter(function (id) { return item.baseValues[id] !== values[id]; });
    if (desiredGoal !== 'custom') changed = changed.filter(function (id) { return id !== 'customGoalKg'; });
    item.applying = true; output = null;
    function valid() { return draft === item && ownerValid(item); }
    try {
      if (goal() !== desiredGoal) {
        var goalButton = Array.from(byId('customGoalWrap').querySelectorAll('[data-cel-wlasny-choice]')).find(function (n) { return n.getAttribute('data-cel-wlasny-choice') === desiredGoal && !n.disabled; });
        if (!goalButton || !valid()) return; goalButton.click(); if (!valid()) return;
      }
      // Set the whole explicit draft before notifying native listeners. Never
      // resume an old draft after a synchronous owner/load/session change.
      changed.forEach(function (id) { var n = byId(id); if (!n || n.disabled || id === 'dietLevel' && hasRoad()) return; if (n.type === 'checkbox') n.checked = values[id]; else n.value = values[id]; });
      if (changed.includes('palFactor')) w.__vildaPlanPalTouched = true;
      if (changed.includes('reduceToggle') || changed.includes('stabilizationToggle')) w.__vildaDietStrategyTouched = true;
      for (var index = 0; index < changed.length && valid(); index += 1) {
        var native = byId(changed[index]); if (!native || native.disabled || changed[index] === 'dietLevel' && hasRoad()) continue;
        native.dispatchEvent(new w.Event('input', { bubbles: true })); if (!valid()) return;
        native.dispatchEvent(new w.Event('change', { bubbles: true }));
      }
      if (!valid()) return;
      if (typeof w.update === 'function') w.update(); if (!valid()) return;
      if (changed.includes('dietLevel')) {
        var selected = values.dietLevel, dietButton = Array.from(byId('bmiJourneyMount')?.querySelectorAll('[data-journey="diet"]') || []).find(function (n) { return n.getAttribute('data-key') === selected && !n.disabled; });
        if (dietButton) { dietButton.click(); if (!valid()) return; }
      }
      Object.keys(moves).forEach(function (key) {
        if (!valid()) return;
        var native = Array.from(byId('bmiJourneyMount')?.querySelectorAll('[data-journey="move"]') || []).find(function (n) { return n.getAttribute('data-key') === key; });
        if (native && !native.disabled && (native.getAttribute('aria-pressed') === 'true') !== !!moves[key]) native.click();
      });
      if (!valid()) return;
      if (typeof w.vildaPersistFlushNow === 'function') w.vildaPersistFlushNow({ force: true });
      if (!valid()) return;
      item.applying = false; if (!rebase()) return; render(); refreshFooter();
    } finally { if (draft === item) { item.applying = false; if (!ownerValid(item)) close(true); } }
  }
  function action(kind) {
    if (!stillOwned() || dirty() || !available() || kind !== 'generate' && !outputValid()) return;
    if (kind === 'generate') {
      var native = byId('generateEnergyDietBtn'); if (!native || native.disabled) return;
      native.click(); if (!stillOwned()) return;
      if (byId('dietEnergyResult')?.textContent.trim()) output = { ownerKey: JSON.stringify(owner()), fingerprint: JSON.stringify(snapshot()) };
      refreshFooter(); schedule(); return;
    }
    if (kind === 'pdf') {
      var item = draft, basis = item.fingerprint;
      // The native actor also owns the existing busy/disabled button state.
      var task = w.VildaDietRecommendations.generatePdfReport(dialog.querySelector('[data-home-diet-action="pdf"]'), 'classic', {
        isCurrent: function () { return draft === item && stillOwned() && !dirty() && item.fingerprint === basis && outputValid(); }
      });
      Promise.resolve(task).then(function () { if (draft === item) refreshFooter(); }, function () {
        if (draft !== item) return; refreshFooter(); setText(byId('vhomeDietDraftStatus'), 'Nie udało się przygotować dokumentu. Spróbuj ponownie.');
      });
      return;
    }
    var selector = '[data-diet-copy-result="energy"]';
    var control = byId('dietRecommendationsContent').querySelector(selector); if (control && !control.disabled) control.click();
  }
  function close(force, focus, fromHistory) {
    if (!dialog?.open) return true;
    if (!force && dirty() && !w.confirm('Odrzucić niezastosowane założenia zaleceń?')) return false;
    var old = draft; draft = null; if (old) w.clearInterval(old.timer);
    dialog.close(); dialog.removeAttribute('aria-modal'); dialog.querySelector('.vhome-dialog-body').replaceChildren();
    if (!fromHistory && old && w.history.state?.vildaHomeDialog === old.historyToken) w.history.back();
    if (focus || !force) byId('vhomeDietExpand').focus({ preventScroll: true }); return true;
  }
  function focusSection(mode) {
    var node = dialog.querySelector(mode === 'road' ? '.vhome-diet-road' : mode === 'report' ? '.vhome-diet-document' : '.vhome-diet-assumptions');
    if (node) { node.setAttribute('tabindex', '-1'); node.focus({ preventScroll: true }); if (mode !== 'energy') node.scrollIntoView({ block: 'nearest' }); }
  }
  async function open(mode) {
    if (dialog?.open) { if (stillOwned()) { focusSection(mode); return true; } close(true); return false; }
    if (!canEdit()) return false;
    var vault = w.VildaVault, token = vault.captureSyncOperationSession(), key = JSON.stringify(owner()), pending = { vault: vault, token: token, ownerKey: key };
    try { loading = loading || w.VildaPatientReportLoader.ensure(); await loading; } catch (_) { loading = null; setText(byId('vhomeDietNote'), 'Nie udało się otworzyć zaleceń. Spróbuj ponownie.'); return false; }
    if (!ownerValid(pending) || !available() || dialog?.open) return false;
    if (!dialog) dialog = w.VildaHomeWorkspace.createDialog({ id: 'vhomeDietDialog', titleId: 'vhomeDietTitle', title: 'Zalecenia dietetyczne', applyLabel: 'Zastosuj założenia', onApply: apply, onClose: function () { close(false); } });
    draft = { vault: vault, token: token, ownerKey: key, historyToken: 'diet-' + Date.now(), applying: false };
    if (!rebase()) { draft = null; return false; }
    render(); w.VildaHomeWorkspace.fitDialog(dialog); dialog.setAttribute('aria-modal', 'true'); dialog.showModal(); refreshFooter();
    w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: draft.historyToken }), '', w.location.href);
    draft.timer = w.setInterval(function () { if (!stillOwned()) close(true); }, 250); focusSection(mode); return true;
  }
  function refresh() {
    frame = 0; w.clearTimeout(readinessTimer); if (!started) return;
    var access = !!w.VildaProAccess?.hasAccess();
    card.hidden = !access || !configured();
    var ready = available(); card.querySelectorAll('button').forEach(function (n) { n.disabled = !ready; });
    setText(byId('vhomeDietNote'), ready ? 'Zalecenia dla pacjenta i rodziny, założenia i dokument po wizycie.' : 'Uzupełnij bieżące dane pacjenta, aby sprawdzić dostępne zalecenia.');
    var preview = byId('vhomeDietRoadPreview'); preview.hidden = !hasRoad();
    setText(byId('vhomeDietRoadSummary'), hasRoad() ? 'Strategia, PAL, dieta i ruch w jednym planie.' : '');
    var grid = byId('vhomeMainCards'), heading = byId('vhomeAnalysisHeading'); if (grid && heading) heading.hidden = grid.hidden = Array.from(grid.children).every(function (n) { return n.hidden; });
    if (output && !outputValid()) output = null;
    if (draft && !draft.applying && !stillOwned()) close(true);
    if (!card.hidden && !canEdit() && w.VildaVault?.isUnlocked()
      && (!w.VildaPanelPacjent || (w.VildaPanelPacjent.wlasciciel() || null) === patientId())) readinessTimer = w.setTimeout(schedule, 250);
  }
  function schedule() { if (!frame) frame = w.requestAnimationFrame(refresh); }
  function start() {
    if (started || !w.VildaHomeWorkspace || !byId('vhomeMainCards') || !byId('dietRecommendationsBtn')) return;
    started = true;
    // Retain each canonical node and its native visibility/listeners. Clipping
    // a separate owner leaves computed display/PDF gates and reposition intact.
    var nativeHost = el('div', 'vhome-diet-native'); nativeHost.inert = true; nativeHost.setAttribute('aria-hidden', 'true');
    byId('dietRecommendationsBtn').before(nativeHost); nativeHost.append(byId('dietRecommendationsBtn'), byId('dietRecommendationsContent'));
    ['planCard', 'toNormCard'].forEach(function (id) { var n = byId(id); if (n) { n.classList.add('vhome-diet-native'); n.inert = true; n.setAttribute('aria-hidden', 'true'); } });
    card = el('section', 'vhome-diet-card'); card.id = 'vhomeDietCard'; card.setAttribute('aria-labelledby', 'vhomeDietHeading');
    var header = el('div', 'vhome-diet-heading'), title = el('h2', '', 'Zalecenia dietetyczne'); title.id = 'vhomeDietHeading';
    var expand = button('', function () { open('energy'); }, 'vhome-diet-expand'); expand.id = 'vhomeDietExpand'; expand.setAttribute('aria-label', 'Powiększ zalecenia dietetyczne'); expand.setAttribute('aria-haspopup', 'dialog');
    var icon = byId('vhomeGrowthExpand')?.querySelector('svg'); if (icon) expand.appendChild(icon.cloneNode(true)); header.append(title, expand); card.appendChild(header);
    var content = el('div', 'vhome-diet-content'), info = note(''); info.id = 'vhomeDietNote'; content.appendChild(info);
    var links = el('div', 'vhome-diet-links'); [['energy', 'Zalecenia energetyczne'], ['report', 'Kopiowanie i raport PDF']].forEach(function (entry) {
      var n = button('', function () { open(entry[0]); }), arrow = el('span', '', '↗'); arrow.setAttribute('aria-hidden', 'true');
      n.append(el('strong', '', entry[1]), arrow); n.dataset.homeDietOpen = entry[0]; links.appendChild(n);
    }); content.appendChild(links);
    var road = el('div', 'vhome-diet-road-preview'); road.id = 'vhomeDietRoadPreview'; road.appendChild(el('h3', '', 'Droga do normy BMI'));
    var roadOpen = button('Otwórz ↗', function () { open('road'); }, 'vhome-diet-road-open'); roadOpen.dataset.homeDietOpen = 'road'; road.appendChild(roadOpen);
    var summary = el('p', 'vhome-diet-road-summary'); summary.id = 'vhomeDietRoadSummary'; road.appendChild(summary); content.appendChild(road); card.appendChild(content); byId('vhomeMainCards').appendChild(card);
    byId('dietRecommendationsBtn').addEventListener('click', function (event) { event.preventDefault(); event.stopImmediatePropagation(); open('energy'); }, true);
    ['input', 'change'].forEach(function (name) { w.addEventListener(name, function (event) {
      if (!dialog?.open || !dialog.contains(event.target)) return;
      event.stopImmediatePropagation(); if (!stillOwned()) { close(true); return; }
      var read = valueChanges.get(event.target); if (read) { read(); refreshFooter(); }
    }, true); });
    w.addEventListener('popstate', function () { if (!dialog?.open) return; if (w.history.state?.vildaHomeDialog !== draft.historyToken && !close(false, true, true)) w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: draft.historyToken }), '', w.location.href); });
    ['input', 'change', 'vilda:data-applied', 'vilda:user-state-cleared', 'vilda:session-changed', 'vilda:professional-summary-updated', 'vilda:state-restored', 'vilda:main-session-restored', 'vilda:initial-main-session-restore-settled', 'vilda:auth-boot-settled', 'vildaProAccessChanged', 'vildaResultsModeChanged'].forEach(function (name) { d.addEventListener(name, schedule); });
    var observer = new w.MutationObserver(schedule); observer.observe(byId('toNormInfo'), { childList: true, subtree: true });
    [byId('metabolicSummarySection'), byId('dietRecommendationsBtn'), byId('toNormCard')].forEach(function (n) { observer.observe(n, { attributes: true, attributeFilter: ['hidden', 'style'] }); });
    if (w.VildaVault?.onLock) w.VildaVault.onLock(function () { output = null; close(true); schedule(); });
    w.addEventListener('pageshow', schedule); refresh();
  }
  w.VildaHomeDiet = Object.freeze({ open: open, refresh: schedule });
  d.addEventListener('vilda:home-workspace-ready', start);
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(typeof window !== 'undefined' ? window : globalThis);
