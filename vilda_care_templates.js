/* Private reusable care-plan definitions. Patient use is a separate operation.
 * All persistence goes through the account-scoped, guarded vault library API.
 */
(function (win) {
  'use strict';
  if (!win || !win.document) return;
  var serial = 0, observers = new WeakMap();
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function id() { return win.crypto.randomUUID(); }
  function key(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/gi, 'l').toLocaleLowerCase('pl'); }
  function timestamp(value) { var parsed = new Date(value); return value && isFinite(parsed.getTime()) ? parsed.toLocaleString('pl-PL') : 'Brak daty zapisu'; }
  function counted(value, one, few, many) { var last = value % 10, hundred = value % 100; return value + ' ' + (value === 1 ? one : last >= 2 && last <= 4 && (hundred < 12 || hundred > 14) ? few : many); }
  function structureCount(stageCount, stepCount) { return counted(stageCount, 'etap', 'etapy', 'etapów') + ' · ' + counted(stepCount, 'krok', 'kroki', 'kroków'); }
  function observe(vault, change, lock) {
    var listeners = observers.get(vault);
    if (!listeners) {
      listeners = new Set(); observers.set(vault, listeners);
      if (typeof vault.onCarePlanTemplateChanged === 'function') vault.onCarePlanTemplateChanged(function () { Array.from(listeners).forEach(function (entry) { entry.change(); }); });
      if (typeof vault.onLock === 'function') vault.onLock(function () { Array.from(listeners).forEach(function (entry) { entry.lock(); }); });
    }
    var entry = { change: change, lock: lock }; listeners.add(entry);
    return function () { listeners.delete(entry); };
  }
  function mount(host, options) {
    options = options || {};
    if (!host || !host.ownerDocument) throw new Error('Brak miejsca na bibliotekę szablonów.');
    var doc = host.ownerDocument, vault = options.vault || win.VildaVault, model = win.VildaCareTemplateModel;
    var remindersLayout = options.remindersLayout === true;
    if (!model || !vault) throw new Error('Odśwież aplikację, aby otworzyć szablony.');
    var owner = vault.getCurrentUser && vault.getCurrentUser(), ownerId = owner && owner.userId;
    var destroyed = false, sequence = 0, timer = null, lifecycle = null, unsubscribe = [], fields = new Map(), objectURLs = new Set();
    var state = { view: 'library', items: [], loaded: false, catalogReadable: false, loading: false, query: '', archived: false, capability: null,
      busy: false, error: null, feedback: '', selected: null, revisions: [], draft: null, dirty: false, wizardStep: 1,
      stageId: null, stepId: null, templateId: null, baseToken: null, operationId: null, privacyRequired: false,
      reviewedText: null, stale: false, pending: null, uncertain: false, confirmation: null, issues: [], transfer: null, adaptationAuthor: '', adaptationChanges: '', adaptationVersion: '', limitedToLocal: false, syncInfo: '',
      applicationCapability: null, application: null };
    function current() { var user = vault.getCurrentUser && vault.getCurrentUser(); return !destroyed && host.isConnected && vault.isUnlocked() && user && user.userId === ownerId && (!options.isCurrent || options.isCurrent()); }
    function node(tag, className, text) { var element = doc.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; }
    function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    function button(text, className, fn, label) { var element = node('button', className, text); element.type = 'button'; if (label) element.setAttribute('aria-label', label); if (fn) element.addEventListener('click', function () { if (current() && !state.busy && !element.disabled) fn(); }); return element; }
    function busy(value) { state.busy = value; root.setAttribute('aria-busy', String(value)); if (options.onBusy) options.onBusy(value, true); }
    function canSave() { return !!(state.capability && state.capability.canSave === true); }
    function applicationService() { var service = options.application; return service && ['getCapability', 'listPatients', 'prepare', 'commit', 'getOutcome'].every(function (name) { return typeof service[name] === 'function'; }) ? service : null; }
    function canApply() { return !!(applicationService() && state.applicationCapability && state.applicationCapability.available === true); }
    function applicationUnavailable() {
      var capability = state.applicationCapability;
      // An older provider may still offer account-wide preparation. Applying a
      // template never starts that procedure; ask for the current application.
      if (capability && capability.canPrepare === true) return 'Nie można teraz utworzyć planu z szablonu. Odśwież aplikację i spróbuj ponownie.';
      return capability && capability.message || 'Nie można teraz utworzyć planu z szablonu. Odśwież bibliotekę, aby sprawdzić dostępność.';
    }
    function applicationAvailability(parent) {
      help(parent, applicationUnavailable());
    }
    function fail(error) { state.error = error && error.message || 'Nie udało się odczytać biblioteki. Spróbuj ponownie.'; }
    function heading(parent, text, level) { var element = node(level || 'h2', '', text); parent.appendChild(element); return element; }
    function help(parent, text) { parent.appendChild(node('p', 'vcp-help', text)); }
    function field(parent, label, type, value, update, fieldKey, markDirty) {
      var wrap = node('label', 'vcp-field'), input = node(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input', '');
      wrap.appendChild(node('span', '', label)); if (type !== 'textarea' && type !== 'select') input.type = type;
      input.value = value == null ? '' : String(value); input.setAttribute('aria-label', label);
      input.disabled = state.busy || state.uncertain; if (type === 'textarea') input.rows = 4;
      if (update) input.addEventListener(type === 'select' ? 'change' : 'input', function () { if (!current() || state.busy || state.uncertain) return; input.removeAttribute('aria-invalid'); update(input.value); if (markDirty !== false) touch(); });
      wrap.appendChild(input); parent.appendChild(wrap); if (fieldKey) fields.set(fieldKey, input); return input;
    }
    function select(parent, label, values, value, update, fieldKey, markDirty) {
      var input = field(parent, label, 'select', '', update, fieldKey, markDirty);
      values.forEach(function (entry) { var option = node('option', '', entry.label); option.value = entry.value; input.appendChild(option); }); input.value = value == null ? '' : value; return input;
    }
    function check(parent, label, checked, update) {
      var wrap = node('label', 'vcp-check'), input = node('input', ''); input.type = 'checkbox'; input.checked = !!checked;
      input.disabled = state.busy || state.uncertain; wrap.appendChild(input); wrap.appendChild(node('span', '', label)); parent.appendChild(wrap);
      input.addEventListener('change', function () { if (!current() || state.busy || state.uncertain) return; update(input.checked); }); return input;
    }
    function touch() { state.dirty = !state.baseline || !model.sameDefinition(state.baseline, state.draft); state.issues = []; state.feedback = ''; if (!state.pending && !state.blockedConflict) state.error = null; if (state.draft && state.reviewedText !== model.reviewTextKey(state.draft)) state.reviewedText = null; renderFeedback(); renderFooter(); }
    function stageById(value) { return state.draft && state.draft.stages.find(function (stage) { return stage.id === value; }); }
    function stepById(value) { return state.draft && state.draft.steps.find(function (step) { return step.id === value; }); }
    function orderedStages(definition) { return definition.stageOrder.map(function (value) { return definition.stages.find(function (stage) { return stage.id === value; }); }).filter(Boolean); }
    function stepsFor(definition, stage) { return stage.stepIds.map(function (value) { return definition.steps.find(function (step) { return step.id === value; }); }).filter(Boolean); }
    function outcomeLabel(value) { var entry = model.OUTCOMES.find(function (entry) { return entry.value === value; }); return entry ? entry.label : 'Wybierz sposób zakończenia'; }
    function kindLabel(value) { var entry = model.TASK_KINDS.find(function (entry) { return entry.value === value; }); return entry ? entry.label : 'Inny krok'; }
    function timing(rule) { return !rule || rule.kind === 'none' ? 'Bez terminu' : rule.amount === 0 ? 'W dniu uruchomienia etapu' : String(rule.amount) + ' ' + ({ day: 'dni', week: 'tygodni', month: 'miesięcy' }[rule.unit] || '') + ' po uruchomieniu etapu'; }
    function capabilityText() { return !state.capability ? '' : state.capability.message || (!canSave() ? 'Zapisywanie szablonów jest teraz niedostępne. Odśwież bibliotekę, aby ponowić sprawdzenie.' : state.syncInfo || (state.capability.persistence === 'private-local' && !state.capability.syncAvailable ? 'Biblioteka jest zapisywana na tym urządzeniu.' : '')); }
    var root = node('section', 'vcp vct' + (remindersLayout ? ' vct-reminders-layout' : '')); root.setAttribute('aria-label', 'Moje szablony');
    var header = node('header', 'vcp-form-head vct-header'), headerTitle = node('h2', '', 'Moje szablony'); headerTitle.tabIndex = -1; header.appendChild(headerTitle);
    var closeButton = button('×', 'vcp-icon', requestClose, 'Zamknij bibliotekę szablonów'); header.appendChild(closeButton); root.appendChild(header);
    var feedback = node('div', 'vcp-feedback vct-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true;
    var errors = node('div', 'vct-errors'), workspace = node('div', 'vct-workspace'), footer = node('footer', 'vct-footer'), feedbackSlot = null;
    if (remindersLayout) {
      feedbackSlot = node('div', 'vct-feedback-slot'); feedbackSlot.tabIndex = -1;
      feedbackSlot.appendChild(feedback); feedbackSlot.appendChild(errors);
    } else { root.appendChild(feedback); root.appendChild(errors); }
    root.appendChild(workspace); if (feedbackSlot) root.appendChild(feedbackSlot); root.appendChild(footer); host.appendChild(root);
    var importPicker = node('input', ''); importPicker.type = 'file'; importPicker.accept = '.vilda-template.json,application/json'; importPicker.hidden = true; importPicker.setAttribute('aria-label', 'Plik szablonu'); root.appendChild(importPicker);
    importPicker.addEventListener('change', function () { if (current() && importPicker.files && importPicker.files[0]) importTemplate(importPicker.files[0]); });
    function renderFeedback() {
      feedback.textContent = state.feedback; feedback.hidden = !state.feedback; clear(errors);
      if (state.error) { var error = node('div', 'vcp-error', state.error); error.setAttribute('role', 'alert'); errors.appendChild(error); }
      if (state.issues.length) { var issues = node('div', 'vcp-error', issueMessage(state.issues[0])); issues.setAttribute('role', 'alert'); errors.appendChild(issues); }
      if (feedbackSlot) feedbackSlot.tabIndex = state.feedback || state.error || state.issues.length ? 0 : -1;
    }
    function issueMessage(issue) {
      var path = String(issue.fieldPath || (issue.path || []).join('.'));
      if (/requiredOutcome/.test(path)) return 'Wybierz, co kończy zaznaczony krok.';
      if (/reminderRule/.test(path)) return 'Podaj całkowity odstęp od 0 do 1200 i jednostkę przypomnienia.';
      if (/labels/.test(path)) return 'Sprawdź etykiety: najwyżej ' + model.LIMITS.maxLabels + ', każda do ' + model.LIMITS.maxLabelUnits + ' znaków, bez powtórzeń.';
      if (/name|title/.test(path)) return 'Uzupełnij zaznaczoną nazwę (do ' + model.LIMITS.maxNameUnits + ' znaków).';
      return 'Sprawdź zaznaczone pole oraz liczbę etapów i kroków. Każdy etap wymaga co najmniej jednego kroku; zbyt dużego szablonu nie można zapisać.';
    }
    function focusIssue(issue) {
      var fieldPath = String(issue.fieldPath || (issue.path || []).join('.')), targetId = issue.stepId || issue.stageId || 'definition';
      var last = fieldPath.split(/[.[\]]/).filter(Boolean).pop();
      var input = fields.get(targetId + ':' + last) || fields.get(targetId + ':' + (/reminderRule/.test(fieldPath) ? 'amount' : 'title'));
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus({ preventScroll: true }); if (input.scrollIntoView) input.scrollIntoView({ block: 'nearest' }); }
    }
    function validate(section) {
      var result = model.validateDraft(state.draft, { section: section || 'all' }); state.issues = result.issues || []; state.error = null;
      if (result.valid) return true;
      var issue = state.issues[0]; state.wizardStep = issue && (issue.stageId || issue.stepId) ? 2 : 1;
      if (issue && issue.stepId) { state.stepId = issue.stepId; var step = stepById(issue.stepId); if (step) state.stageId = step.stageId; }
      else if (issue && issue.stageId) state.stageId = issue.stageId;
      render(); if (issue) focusIssue(issue); return false;
    }
    function render() {
      if (!current()) return;
      root.classList.toggle('vct-application-mode', state.view === 'application');
      root.classList.toggle('vct-transfer-mode', state.view === 'transfer');
      var focusedSearch = root.contains(doc.activeElement) && doc.activeElement.getAttribute('aria-label') === 'Szukaj własnego szablonu';
      var caret = focusedSearch && typeof doc.activeElement.selectionStart === 'number' ? doc.activeElement.selectionStart : null;
      fields.clear(); clear(workspace); clear(footer); closeButton.disabled = state.busy;
      renderFeedback();
      if (state.confirmation) renderConfirmation();
      else if (state.view === 'transfer') renderTransfer();
      else if (state.view === 'application') renderApplication();
      else if (state.view === 'wizard') renderWizard();
      else if (state.view === 'detail') renderDetail();
      else if (state.view === 'history') renderHistory();
      else if (state.view === 'resolve') renderResolve();
      else renderLibrary(); renderFooter();
      if (focusedSearch && state.view === 'library') { var search = workspace.querySelector('.vcp-search'); if (search) { search.focus({ preventScroll: true }); if (caret !== null && search.setSelectionRange) search.setSelectionRange(caret, caret); } }
    }
    function renderLibrary() {
      headerTitle.textContent = 'Moje szablony';
      var toolbar = node('div', 'vct-library-tools'), search = node('input', 'vcp-search'); search.type = 'search'; search.value = state.query; search.placeholder = 'Szukaj własnego szablonu…'; search.setAttribute('aria-label', 'Szukaj własnego szablonu');
      var filters = node('div', 'vcp-filters'); [['active', 'Aktywne'], ['archived', 'Usunięte']].forEach(function (entry) {
        var item = button(entry[1], (state.archived === (entry[0] === 'archived') ? 'is-active' : ''), function () { if (state.busy) return; state.archived = entry[0] === 'archived'; render(); }); item.setAttribute('aria-pressed', String(state.archived === (entry[0] === 'archived'))); filters.appendChild(item);
      }); toolbar.appendChild(search); toolbar.appendChild(filters);
      var create = button('+ Nowy szablon', 'vcp-primary', function () { abandonThen(function () { beginNew(); }); }, 'Nowy szablon'); create.disabled = state.busy || !canSave(); toolbar.appendChild(create);
      var importButton = button('Importuj szablon', 'vcp-outline', chooseImportFile); importButton.disabled = state.busy || !canSave() || !transferService(); toolbar.appendChild(importButton); workspace.appendChild(toolbar);
      var cards = node('div', 'vct-library-list'); workspace.appendChild(cards);
      function draw() {
        clear(cards); var query = key(state.query), items = state.items.filter(function (item) { return !['active', 'archived'].includes(item.status) || state.archived === (item.status === 'archived'); }).filter(function (item) { return !query || key((item.title || '') + ' ' + (item.labels || []).join(' ')).includes(query); });
        if (!state.loaded && state.loading) cards.appendChild(node('p', 'vcp-empty', 'Wczytywanie szablonów…'));
        else if (!items.length && !state.error && state.loaded && state.catalogReadable) cards.appendChild(node('p', 'vcp-empty', state.query ? 'Brak pasujących szablonów.' : state.limitedToLocal ? 'Brak szablonów zapisanych na tym urządzeniu.' : state.archived ? 'Nie ma usuniętych szablonów.' : 'Nie masz jeszcze własnych szablonów.'));
        items.forEach(function (item) {
          var row = node('article', 'vct-template-row'); row.dataset.templateId = item.templateId;
          var text = node('div', 'vct-template-copy'); heading(text, item.title || 'Szablon do przeglądu', 'h3');
          help(text, item.status === 'conflict' ? 'Wymaga przeglądu zmian' : !['active', 'archived'].includes(item.status) ? 'Nie można odczytać tej wersji szablonu.' : structureCount(item.stageCount, item.stepCount) + ' · Wersja ' + item.revisionNumber);
          if (item.syncState && item.syncState.pending) help(text, 'Oczekuje na synchronizację');
          var actions = node('div', 'vct-row-actions'); actions.appendChild(button(item.status === 'conflict' ? 'Przejrzyj zmiany' : 'Podgląd', 'vcp-outline', function () { readTemplate(item.templateId); }));
          if (item.status === 'active') { actions.insertBefore(applicationButton(item, false), actions.firstChild); var exportButton = button('Eksportuj szablon', 'vcp-text', function () { abandonThen(function () { beginExport(item.templateId); }); }, 'Eksportuj szablon: ' + (item.title || 'Szablon')); exportButton.disabled = state.busy || !transferService(); actions.appendChild(exportButton); }
          if (canChangeAvailability(item)) actions.appendChild(availabilityButton(item));
          row.appendChild(text); row.appendChild(actions); cards.appendChild(row);
        });
      }
      search.addEventListener('input', function () { state.query = search.value; draw(); }); draw();
      var capability = capabilityText(); if (capability) help(workspace, capability);
      if (state.loaded && !canApply() && state.items.some(function (item) { return item.status === 'active'; })) applicationAvailability(workspace);
    }
    function preview(parent, definition, editLinks) {
      if (!model.validateDefinition(definition).valid) { parent.appendChild(node('p', 'vcp-empty', 'Nie można odczytać tej definicji szablonu.')); return; }
      heading(parent, definition.name || 'Nowy szablon', 'h2'); if (definition.purpose) parent.appendChild(node('p', 'vcp-goal', definition.purpose));
      if (definition.labels.length) help(parent, definition.labels.join(' · '));
      if (definition.publication) renderPublication(parent, definition.publication);
      orderedStages(definition).forEach(function (stage, index) {
        var box = node('article', 'vct-stage-preview'); box.dataset.templateStageId = stage.id;
        var title = node('div', 'vct-preview-heading'); heading(title, (index + 1) + '. ' + stage.title, 'h3');
        if (editLinks) title.appendChild(button('Edytuj etap', 'vcp-text', function () { state.wizardStep = 2; state.stageId = stage.id; state.stepId = stage.stepIds[0] || null; render(); })); box.appendChild(title);
        stepsFor(definition, stage).forEach(function (step) {
          var row = node('div', 'vct-preview-step'); row.dataset.templateStepId = step.id; heading(row, step.title, 'h4');
          help(row, kindLabel(step.taskKind) + ' · ' + outcomeLabel(step.requiredOutcome) + ' · ' + timing(step.reminderRule));
          if (!step.includedByDefault) help(row, 'Domyślnie niewłączony'); if (step.instruction) row.appendChild(node('p', 'vcp-description', step.instruction)); box.appendChild(row);
        }); parent.appendChild(box);
      });
    }
    function renderDetail() {
      var selected = state.selected; headerTitle.textContent = 'Podgląd szablonu';
      workspace.appendChild(button('← Moje szablony', 'vcp-text', function () { state.view = 'library'; render(); }));
      if (!selected || !selected.definition) { workspace.appendChild(node('p', 'vcp-empty', 'Nie można odczytać tej wersji szablonu.')); return; }
      var content = node('div', 'vct-scroll-pane'); preview(content, selected.definition, false); workspace.appendChild(content);
      var actions = node('div', 'vct-detail-actions');
      if (!state.historical && selected.status === 'active') { actions.appendChild(applicationButton(selected, true)); var exportAction = button('Eksportuj szablon', 'vcp-outline', function () { abandonThen(function () { beginExport(selected.templateId); }); }); exportAction.disabled = !transferService(); actions.appendChild(exportAction); }
      if (!state.historical) { var edit = button('Edytuj', 'vcp-outline', function () { abandonThen(function () { beginEdit(selected); }); }); edit.disabled = !canSave() || selected.status !== 'active'; actions.appendChild(edit); }
      var duplicate = button('Utwórz kopię', 'vcp-outline', function () { abandonThen(function () { beginDuplicate(selected.definition); }); }); duplicate.disabled = !canSave(); actions.appendChild(duplicate);
      actions.appendChild(button('Wersje', 'vcp-text', function () { readRevisions(selected.templateId); }));
      if (!state.historical && canChangeAvailability(selected)) actions.appendChild(availabilityButton(selected));
      workspace.appendChild(actions);
      if (!state.historical && selected.status === 'active' && !canApply()) applicationAvailability(workspace);
    }
    function renderHistory() {
      headerTitle.textContent = 'Wersje szablonu'; workspace.appendChild(button('← Moje szablony', 'vcp-text', function () { state.view = 'library'; render(); }));
      var list = node('div', 'vct-library-list'); state.revisions.forEach(function (revision) {
        var row = node('article', 'vct-template-row'); row.appendChild(node('p', '', 'Wersja ' + revision.number + ' · zapisano ' + timestamp(revision.recordedAtISO)));
        row.appendChild(button('Podgląd wersji ' + revision.number, 'vcp-outline', function () { readTemplate(state.selected.templateId, revision.revisionId); })); list.appendChild(row);
      }); workspace.appendChild(list);
    }
    async function refresh() {
      if (!current() || state.busy) return;
      if (state.application || state.transfer) { state.stale = true; return; }
      if (state.confirmation) { state.stale = true; return; }
      var ticket = ++sequence; state.loading = true; state.catalogReadable = false; state.error = null; if (!state.loaded) render();
      try {
        var capability = await vault.getCarePlanTemplateCapability();
        if (!current() || ticket !== sequence) return;
        var syncError = null, local = capability && capability.persistence === 'private-local'; state.capability = capability;
        state.limitedToLocal = !!(local && !capability.syncAvailable); state.syncInfo = '';
        if (capability && (capability.reasonCode === 'CARE_TEMPLATE_READER_UPDATE_REQUIRED' || capability.persistence === 'unsupported')) throw new Error(capability.message || 'Odśwież aplikację, aby odczytać tę wersję biblioteki szablonów.');
        if (capability && capability.persistence === 'remote-ack' && !capability.syncAvailable) throw new Error('Nie można teraz odczytać zdalnej biblioteki. Odśwież aplikację i spróbuj ponownie.');
        if (capability && capability.syncAvailable) {
          try {
            if (!win.VildaSync || typeof win.VildaSync.syncTemplateLibrary !== 'function') throw new Error('Nie można teraz sprawdzić synchronizacji biblioteki. Odśwież aplikację.');
            var sync = await win.VildaSync.syncTemplateLibrary();
            if (sync && sync.state === 'disabled' && local) { state.limitedToLocal = true; state.syncInfo = 'Synchronizacja jest wyłączona. Widzisz bibliotekę tego urządzenia.'; }
            else if (!sync || sync.state === 'disabled') throw new Error('Nie można teraz odczytać zdalnej biblioteki. Spróbuj ponownie.');
            else if (sync.state === 'pending' || sync.pending) { if (local) { state.limitedToLocal = true; state.syncInfo = 'Synchronizacja oczekuje na potwierdzenie. Widzisz bibliotekę tego urządzenia.'; } else throw new Error('Synchronizacja biblioteki oczekuje na potwierdzenie. Spróbuj ponownie.'); }
          } catch (error) { syncError = error; if (local) { state.limitedToLocal = true; state.syncInfo = 'Widzisz bibliotekę tego urządzenia.'; } }
        }
        if (!current() || ticket !== sequence) return;
        if (syncError && !local) throw syncError;
        var service = applicationService();
        var values = await Promise.all([vault.getCarePlanTemplateCapability(), vault.listCarePlanTemplates({ archived: 'all' }), service ? Promise.resolve().then(function () { return service.getCapability(); }).catch(function () { return { available: false }; }) : null]);
        if (!current() || ticket !== sequence) return;
        state.capability = values[0]; state.applicationCapability = values[2]; if (!Array.isArray(values[1])) throw new Error('Nie można odczytać listy szablonów.'); state.items = values[1]; state.loaded = true; state.catalogReadable = !!(values[0] && values[0].readable === true && ['private-local', 'remote-ack'].includes(values[0].persistence)); state.stale = false; if (syncError) fail(syncError);
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { state.loading = false; if (state.view !== 'wizard') render(); else { renderFeedback(); renderFooter(); } } }
    }
    function navigationContext() {
      var pane = workspace.querySelector(state.view === 'library' ? '.vct-library-list' : '.vct-scroll-pane');
      var focused = doc.activeElement, focusTemplateId = focused && focused.getAttribute && focused.getAttribute('data-template-use');
      return { view: state.view === 'detail' ? 'detail' : 'library', query: state.query, archived: state.archived,
        templateId: state.selected && state.selected.templateId || null,
        revisionId: state.historical && state.selected ? state.selected.revisionId || null : null,
        scrollTop: pane ? pane.scrollTop : 0, focusTemplateId: focusTemplateId || null };
    }
    function restoreNavigationPosition(context) {
      if (!current()) return;
      var pane = workspace.querySelector(state.view === 'library' ? '.vct-library-list' : '.vct-scroll-pane');
      if (pane) pane.scrollTop = Math.max(0, Number(context && context.scrollTop) || 0);
      var target = context && context.focusTemplateId && Array.from(workspace.querySelectorAll('[data-template-use]')).find(function (item) { return item.getAttribute('data-template-use') === context.focusTemplateId; });
      (target || headerTitle).focus({ preventScroll: true });
    }
    async function restoreNavigation(context) {
      if (!current() || state.busy || state.application) return;
      context = context || {}; state.query = typeof context.query === 'string' ? context.query : ''; state.archived = context.archived === true;
      if (context.view === 'detail' && typeof context.templateId === 'string') await readTemplate(context.templateId, context.revisionId || null);
      else { state.view = 'library'; render(); }
      restoreNavigationPosition(context);
    }
    function applicationButton(template, detail) {
      var label = 'Użyj u pacjenta', item = button(label, 'vcp-primary vct-apply-button', function () {
        abandonThen(function () { beginApplication(template); });
      }, detail ? label : label + ': ' + (template.title || template.definition && template.definition.name || 'Szablon'));
      item.setAttribute('data-template-use', template.templateId); item.disabled = state.busy || !!state.pending || !canApply();
      if (!canApply()) item.title = applicationUnavailable(); return item;
    }
    function applicationCurrent(application, ticket) { return current() && state.application === application && (ticket === undefined || ticket === sequence); }
    function applicationName(patient) {
      var header = patient && patient.header || {};
      return header.name || [header.lastName, header.firstName].filter(Boolean).join(' ') || patient && patient.name || 'Pacjent';
    }
    function applicationIdentity(patient, patients) {
      var header = patient && patient.header || {}, birth = header.dobISO, parts = typeof birth === 'string' ? birth.split('-').map(Number) : [], parsed = new Date(birth + 'T12:00:00Z');
      var validBirth = /^\d{4}-\d{2}-\d{2}$/.test(birth || '') && !isNaN(parsed.getTime()) && parsed.getUTCFullYear() === parts[0] && parsed.getUTCMonth() + 1 === parts[1] && parsed.getUTCDate() === parts[2];
      var text = validBirth ? 'ur. ' + birth.split('-').reverse().join('.') : 'Brak daty urodzenia';
      if (!validBirth || patients.some(function (other) { return other.patientId !== patient.patientId && key(applicationName(other)) === key(applicationName(patient)) && (other.header || {}).dobISO === birth; })) text += ' · ID wpisu: ' + patient.patientId;
      return text;
    }
    async function beginApplication(template) {
      if (!current() || state.busy || state.pending || !canApply() || !template || template.status !== 'active' || template.readOnly) return;
      var service = applicationService(), back = navigationContext(), ticket = ++sequence;
      var application = { source: null, expectedRevisionId: template.headRevisionId, templateId: template.templateId, patients: [], patient: null,
        phase: 'patient', query: '', definition: null, token: null, selectedSteps: new Set(), dirty: false, pending: null, returnContext: back, scrollTop: 0 };
      state.draft = null; state.dirty = false; state.application = application; state.view = 'application'; state.error = null; state.feedback = ''; busy(true); render();
      try {
        var values = await Promise.all([service.getCapability(), vault.getCarePlanTemplate(template.templateId), service.listPatients()]);
        if (!applicationCurrent(application, ticket)) return;
        state.applicationCapability = values[0];
        if (!canApply()) throw new Error(applicationUnavailable());
        var source = values[1];
        if (!source || source.status !== 'active' || source.readOnly || !source.headRevisionId || source.headRevisionId !== application.expectedRevisionId) throw new Error('Szablon zmienił się lub wymaga przeglądu. Wróć do biblioteki i sprawdź jego bieżącą wersję.');
        var sourceValidation = model.validateDefinition(source.definition);
        if (!sourceValidation.valid) throw new Error(sourceValidation.issues.some(function (issue) { return issue.code === 'CARE_TEMPLATE_OUTCOME_REQUIRED'; }) ? 'Szablon nie określa, co kończy każdy krok. Wróć do jego podglądu, wybierz „Edytuj” i uzupełnij „Co kończy ten krok?”.' : 'Szablon wymaga uzupełnienia. Wróć do jego podglądu, wybierz „Edytuj” i sprawdź wszystkie kroki.');
        if (!Array.isArray(values[2])) throw new Error('Nie udało się odczytać listy pacjentów. Wróć do szablonu i spróbuj ponownie.');
        application.source = source; application.patients = values[2].filter(function (patient) { return patient && typeof patient.patientId === 'string' && patient.patientId; });
        if (options.patientId) {
          application.patient = application.patients.find(function (patient) { return patient.patientId === options.patientId; }) || null;
          if (!application.patient) throw new Error('Pacjent z otwartej Karty jest niedostępny. Wróć do Karty pacjenta i sprawdź jego dane.');
        } else if (options.initialPatientId) application.patient = application.patients.find(function (patient) { return patient.patientId === options.initialPatientId; }) || null;
      } catch (error) { if (applicationCurrent(application, ticket)) fail(error); }
      finally { if (applicationCurrent(application, ticket)) { busy(false); render(); headerTitle.focus({ preventScroll: true }); } }
      if (applicationCurrent(application, ticket) && application.source && application.patient && options.patientId && !state.error) await prepareApplication();
    }
    function applicationEdited(application) { if (!applicationCurrent(application) || application.pending) return false; application.dirty = true; state.error = null; renderFeedback(); renderFooter(); return true; }
    function applicationField(parent, label, type, value, update) {
      var application = state.application;
      var input = field(parent, label, type, value, function (value) { if (!applicationCurrent(application) || application.pending) return; update(value); applicationEdited(application); }, null, false);
      input.disabled = state.busy || !!application.pending; return input;
    }
    function applicationSelect(parent, label, values, value, update) {
      var input = applicationField(parent, label, 'select', '', update);
      values.forEach(function (entry) { var option = node('option', '', entry.label); option.value = entry.value; input.appendChild(option); }); input.value = value; return input;
    }
    function renderApplication() {
      var application = state.application; if (!application) return;
      headerTitle.textContent = 'Plan ze szablonu'; root.classList.add('vct-application-mode');
      var back = button('← Szablon', 'vcp-text', requestApplicationBack); back.disabled = state.busy || !!application.pending; workspace.appendChild(back);
      var pane = node('div', 'vct-scroll-pane vct-application-pane'); workspace.appendChild(pane);
      if (!application.source) { help(pane, state.busy ? 'Wczytywanie szablonu i pacjentów…' : 'Wróć do biblioteki, aby ponownie wybrać szablon.'); return; }
      heading(pane, application.source.definition.name);
      help(pane, 'Wersja ' + application.source.revisionNumber + ' · Powstanie niezależny plan pacjenta. Zmiany w tym planie nie zmienią szablonu.');
      if (application.phase === 'patient') { renderApplicationPatients(pane, application); return; }
      var identity = node('section', 'vct-application-patient'); heading(identity, applicationName(application.patient), 'h3'); help(identity, applicationIdentity(application.patient, application.patients)); pane.appendChild(identity);
      if (!options.patientId) { var changePatient = button('Zmień pacjenta', 'vcp-text', function () { if (!application.pending) { application.phase = 'patient'; render(); } }); changePatient.disabled = state.busy || !!application.pending; identity.appendChild(changePatient); }
      var draft = application.definition;
      applicationField(pane, 'Nazwa planu', 'text', draft.name, function (value) { draft.name = value; }).maxLength = model.LIMITS.maxNameUnits;
      applicationField(pane, 'Cel i ustalenia (opcjonalnie)', 'textarea', draft.purpose, function (value) { draft.purpose = value; }).maxLength = model.LIMITS.maxPurposeUnits;
      help(pane, 'Wybierz kroki do planu i dopasuj ich treść. Etap bez wybranych kroków nie zostanie dodany. Po zapisaniu planu samodzielnie uruchomisz pierwszy etap.');
      orderedStages(draft).forEach(function (stage) {
        var section = node('section', 'vct-stage-preview vct-application-stage'); section.dataset.templateStageId = stage.id;
        applicationField(section, 'Nazwa etapu', 'text', stage.title, function (value) { stage.title = value; }).maxLength = model.LIMITS.maxNameUnits;
        stepsFor(draft, stage).forEach(function (step) {
          var row = node('article', 'vct-preview-step vct-application-step'); row.dataset.templateStepId = step.id;
          var include = check(row, 'Dołącz krok: ' + step.title, application.selectedSteps.has(step.id), function (selected) {
            if (!applicationCurrent(application) || application.pending) return;
            if (selected) application.selectedSteps.add(step.id); else application.selectedSteps.delete(step.id);
            application.scrollTop = pane.scrollTop; applicationEdited(application); render();
          }); include.disabled = state.busy || !!application.pending;
          if (application.selectedSteps.has(step.id)) {
            applicationField(row, 'Nazwa kroku', 'text', step.title, function (value) { step.title = value; }).maxLength = model.LIMITS.maxNameUnits;
            applicationField(row, 'Instrukcja (opcjonalnie)', 'textarea', step.instruction, function (value) { step.instruction = value; }).maxLength = model.LIMITS.maxInstructionUnits;
            var outcome = applicationSelect(row, 'Co kończy ten krok?', [{ value: '', label: 'Wybierz sposób zakończenia' }].concat(model.OUTCOMES), step.requiredOutcome || '', function (value) { step.requiredOutcome = value || null; syncOutcome(); });
            var outcomeHelp = node('p', 'vcp-help vct-field-error', 'Wybierz, co kończy ten krok: wykonanie, otrzymanie wyniku albo zapisanie decyzji.'); row.appendChild(outcomeHelp);
            function syncOutcome() { var missing = !model.OUTCOMES.some(function (entry) { return entry.value === step.requiredOutcome; }); outcome.setAttribute('aria-invalid', String(missing)); outcomeHelp.hidden = !missing; } syncOutcome();
            applicationSelect(row, 'Przypomnienie', [{ value: 'none', label: 'Bez terminu' }, { value: 'stage-offset', label: 'Od uruchomienia etapu' }], step.reminderRule.kind, function (value) {
              step.reminderRule = value === 'none' ? { kind: 'none' } : { kind: 'stage-offset', amount: null, unit: 'day' }; application.scrollTop = pane.scrollTop; render();
            });
            if (step.reminderRule.kind === 'stage-offset') {
              var timingFields = node('div', 'vcp-field-pair'); row.appendChild(timingFields);
              var amount = applicationField(timingFields, 'Liczba jednostek czasu', 'number', step.reminderRule.amount, function (value) { step.reminderRule.amount = value.trim() === '' ? null : Number(value); }); amount.min = '0'; amount.max = '1200'; amount.step = '1';
              applicationSelect(timingFields, 'Jednostka czasu', [{ value: 'day', label: 'dni' }, { value: 'week', label: 'tygodni' }, { value: 'month', label: 'miesięcy' }], step.reminderRule.unit, function (value) { step.reminderRule.unit = value; });
            }
          }
          section.appendChild(row);
        }); pane.appendChild(section);
      });
      pane.scrollTop = application.scrollTop;
    }
    function renderApplicationPatients(pane, application) {
      heading(pane, 'Wybierz pacjenta', 'h3');
      var search = field(pane, 'Szukaj pacjenta', 'search', application.query, function (value) { application.query = value; draw(); }, null, false); search.placeholder = 'Nazwisko lub imię…'; search.autocomplete = 'off';
      var results = node('div', 'vcp-patient-results vct-application-patients'), status = node('p', 'vcp-help'); status.setAttribute('role', 'status'); pane.appendChild(status); pane.appendChild(results);
      function choose(patient) {
        if (state.busy || application.pending) return;
        function accept() {
          if (!applicationCurrent(application)) return;
          if (!application.patient || application.patient.patientId !== patient.patientId) { application.definition = null; application.token = null; application.selectedSteps.clear(); application.dirty = false; }
          application.patient = patient; state.error = null; draw(); renderFooter();
        }
        if (application.patient && application.patient.patientId !== patient.patientId && application.dirty) ask('Zmienić pacjenta?', 'Dopasowanie planu dla poprzednio wybranej osoby zostanie odrzucone.', function () { accept(); render(); });
        else accept();
      }
      function draw() {
        clear(results); var query = key(application.query), matches = application.patients.filter(function (patient) { return !query || key(applicationName(patient)).includes(query); });
        matches.slice(0, 20).forEach(function (patient) {
          var item = button('', 'vcp-patient-option', function () { choose(patient); }); item.dataset.patientId = patient.patientId; item.setAttribute('aria-pressed', String(application.patient && application.patient.patientId === patient.patientId));
          var identity = applicationIdentity(patient, application.patients); item.setAttribute('aria-label', applicationName(patient) + ' · ' + identity);
          item.appendChild(node('span', 'vcp-patient', applicationName(patient))); item.appendChild(node('span', 'vcp-help', identity)); item.disabled = state.busy || !!application.pending; results.appendChild(item);
        });
        status.textContent = application.patient ? 'Wybrany pacjent: ' + applicationName(application.patient) + ' · ' + applicationIdentity(application.patient, application.patients) : matches.length > 20 ? 'Pokazano 20 osób. Wpisz więcej znaków, aby zawęzić listę.' : matches.length ? 'Wybierz pacjenta z listy.' : 'Brak pasujących pacjentów.';
      }
      search.disabled = state.busy || !!application.pending; draw();
    }
    async function prepareApplication() {
      var application = state.application, service = applicationService();
      if (!application || !application.patient || !application.source || !service || state.busy || application.pending) return;
      if (application.definition && application.token) { application.phase = 'review'; render(); return; }
      var ticket = ++sequence; busy(true); state.error = null; render();
      try {
        var prepared = await service.prepare({ patientId: application.patient.patientId, templateId: application.templateId, revisionId: application.expectedRevisionId });
        if (!applicationCurrent(application, ticket)) return;
        if (!prepared || !prepared.token || !model.validateDefinition(prepared.definition).valid) throw new Error('Nie udało się przygotować planu. Wróć do szablonu i spróbuj ponownie.');
        application.token = prepared.token; application.definition = clone(prepared.definition); application.selectedSteps = new Set(application.definition.steps.filter(function (step) { return step.includedByDefault; }).map(function (step) { return step.id; })); application.phase = 'review';
      } catch (error) { if (applicationCurrent(application, ticket)) fail(error); }
      finally { if (applicationCurrent(application, ticket)) { busy(false); render(); headerTitle.focus({ preventScroll: true }); } }
    }
    function applicationDefinition(application) {
      var definition = clone(application.definition);
      definition.steps = definition.steps.filter(function (step) { return application.selectedSteps.has(step.id); });
      if (!definition.steps.length) { fail(new Error('Wybierz co najmniej jeden krok do planu.')); return null; }
      if (definition.steps.some(function (step) { return !model.OUTCOMES.some(function (entry) { return entry.value === step.requiredOutcome; }); })) { fail(new Error('W każdym wybranym kroku uzupełnij „Co kończy ten krok?”.')); return null; }
      definition.stages.forEach(function (stage) { stage.stepIds = stage.stepIds.filter(function (stepId) { return application.selectedSteps.has(stepId); }); });
      definition.stages = definition.stages.filter(function (stage) { return stage.stepIds.length; });
      definition.stageOrder = definition.stageOrder.filter(function (stageId) { return definition.stages.some(function (stage) { return stage.id === stageId; }); });
      var canonical = model.canonicalDefinition(definition);
      if (!canonical.ok) { fail(new Error('Sprawdź nazwy, instrukcje, kryteria zakończenia i przypomnienia wybranych kroków.')); return null; }
      return canonical.definition;
    }
    function freezeApplicationDefinition(value) {
      if (value && typeof value === 'object') { Object.keys(value).forEach(function (key) { freezeApplicationDefinition(value[key]); }); Object.freeze(value); }
      return value;
    }
    function applicationSaved(application, result) {
      if (!result || result.saved !== true || typeof result.planId !== 'string' || !result.planId || result.patientId !== application.patient.patientId) return false;
      application.pending = null; state.error = null; state.feedback = 'Utworzono plan pacjenta. Możesz uruchomić pierwszy etap.';
      var returnContext = clone(application.returnContext); state.application = null; root.classList.remove('vct-application-mode'); state.view = 'library'; busy(false); render();
      if (typeof options.onApplied === 'function') options.onApplied(result, { returnContext: returnContext }); return true;
    }
    async function commitApplication(retry) {
      var application = state.application, service = applicationService();
      if (!application || !service || state.busy || application.phase !== 'review') return;
      if (application.pending && !retry) return;
      if (!retry) {
        var definition = applicationDefinition(application); if (!definition) { renderFeedback(); return; }
        application.pending = Object.freeze({ operationId: id(), token: application.token, patientId: application.patient.patientId,
          templateId: application.templateId, revisionId: application.expectedRevisionId, definition: freezeApplicationDefinition(definition) });
      }
      var request = application.pending; if (!request) return;
      var ticket = ++sequence; busy(true); state.error = null; render();
      try {
        var result = await service.commit(request);
        if (!applicationCurrent(application, ticket)) return;
        if (applicationSaved(application, result)) return;
        if (result && result.saved === false && result.outcome !== 'unknown' && (result.conflict || result.reason)) {
          application.pending = null; fail(new Error(result.conflict ? 'Dane zmieniły się przed zapisem. Twoje dopasowanie pozostało w formularzu. Wróć do szablonu i sprawdź jego bieżącą wersję.' : 'Nie utworzono planu. Twoje dopasowanie pozostało w formularzu. Sprawdź dostępność pacjenta i spróbuj ponownie.'));
        } else fail(new Error('Nie można jeszcze potwierdzić utworzenia planu. Sprawdź wynik albo ponów tę samą próbę.'));
      } catch (error) {
        if (applicationCurrent(application, ticket)) {
          var message = error && typeof error.userMessage === 'string' ? error.userMessage + ' ' : '';
          if (error && error.outcome === 'not-saved') { application.pending = null; fail(new Error(message + 'Plan nie został utworzony. Zachowano wprowadzone dopasowanie.')); }
          else fail(new Error(message + 'Nie można jeszcze potwierdzić utworzenia planu. Sprawdź wynik zapisu. Zachowano tę samą próbę.'));
        }
      }
      finally { if (applicationCurrent(application, ticket)) { busy(false); render(); } }
    }
    async function checkApplicationOutcome() {
      var application = state.application, service = applicationService(); if (!application || !application.pending || !service || state.busy) return;
      var request = application.pending, ticket = ++sequence; busy(true); state.error = null; render();
      try {
        var outcome = await service.getOutcome({ operationId: request.operationId, token: request.token, patientId: request.patientId });
        if (!applicationCurrent(application, ticket) || application.pending !== request) return;
        if (outcome && outcome.state === 'saved' && applicationSaved(application, Object.assign({}, outcome, { saved: true }))) return;
        if (outcome && outcome.state === 'not-saved') { application.pending = null; state.feedback = 'Potwierdzono, że plan nie został utworzony. Możesz poprawić formularz i ponowić zapis.'; }
        else state.feedback = 'Wynik utworzenia planu nie jest jeszcze potwierdzony. Zachowano tę samą próbę zapisu.';
      } catch (error) { if (applicationCurrent(application, ticket)) fail(new Error((error && typeof error.userMessage === 'string' ? error.userMessage + ' ' : '') + 'Nie udało się sprawdzić wyniku. Zachowano tę samą próbę zapisu.')); }
      finally { if (applicationCurrent(application, ticket)) { busy(false); render(); } }
    }
    function requestApplicationBack() {
      var application = state.application; if (!application || state.busy || application.pending) return;
      function back() { var context = application.returnContext; state.application = null; state.error = null; state.feedback = ''; root.classList.remove('vct-application-mode'); restoreNavigation(context); }
      if (application.dirty) ask('Odrzucić dopasowanie planu?', 'Szablon pozostanie bez zmian. Wpisane dopasowanie dla pacjenta zostanie odrzucone.', back); else back();
    }
    async function readTemplate(templateId, revisionId) {
      if (!current() || state.busy) return; var ticket = ++sequence; busy(true); state.error = null;
      try {
        var selected = await vault.getCarePlanTemplate(templateId, revisionId ? { revisionId: revisionId } : {});
        if (!current() || ticket !== sequence) return;
        if (!selected) throw new Error('Ten szablon jest niedostępny. Odśwież bibliotekę.');
        state.selected = selected; state.historical = !!revisionId; state.view = selected.status === 'conflict' && !revisionId ? 'resolve' : 'detail'; state.resolveHead = ''; state.resolveArchive = '';
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { busy(false); render(); var title = workspace.querySelector('h2') || headerTitle; title.tabIndex = -1; title.focus({ preventScroll: true }); } }
    }
    function canChangeAvailability(template) { return !!(template && !template.readOnly && ['active', 'archived'].includes(template.status) && template.baseToken); }
    function availabilityButton(template) {
      var archived = template.status === 'archived', label = (archived ? 'Przywróć szablon: ' : 'Usuń szablon: ') + (template.title || template.definition && template.definition.name || 'Szablon');
      var action = button(archived ? 'Przywróć' : 'Usuń szablon', 'vcp-text', function () { requestAvailability(template.templateId, !archived, label); }, label);
      action.disabled = state.busy || !!state.pending || state.uncertain || !canSave(); return action;
    }
    async function requestAvailability(templateId, archived, returnFocusLabel) {
      if (!current() || state.busy || state.pending || state.uncertain || !canSave()) return;
      var ticket = ++sequence, selected = null; busy(true); state.error = null; state.feedback = ''; render();
      try {
        var value = await vault.getCarePlanTemplate(templateId, {});
        if (!current() || ticket !== sequence) return;
        if (!value || value.templateId !== templateId) throw new Error('Nie można potwierdzić bieżącej wersji tego szablonu. Odśwież bibliotekę.');
        if (!canChangeAvailability(value) || value.status !== (archived ? 'active' : 'archived')) {
          if (value) { state.selected = value; state.historical = false; state.view = value.status === 'conflict' ? 'resolve' : 'detail'; state.resolveHead = ''; state.resolveArchive = ''; }
          throw new Error('Szablon zmienił się lub jest niedostępny. Sprawdź jego bieżącą wersję.');
        }
        selected = value; if (state.view === 'detail') state.selected = value;
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) {
        busy(false); render();
        if (!selected) { var notice = errors.querySelector('[role="alert"]') || headerTitle; notice.tabIndex = -1; notice.focus({ preventScroll: true }); }
      } }
      if (!selected || !current() || ticket !== sequence || !canSave()) return;
      var title = selected.title || selected.definition && selected.definition.name || 'Szablon';
      ask((archived ? 'Usunąć szablon „' : 'Przywrócić szablon „') + title + '”?', archived ? 'Szablon trafi do Usuniętych, skąd możesz go przywrócić. Plany pacjentów utworzone z tego szablonu pozostaną bez zmian.' : 'Szablon wróci do aktywnej biblioteki wraz z zachowanymi wersjami.', function () {
        mutate('archive', { templateId: selected.templateId, baseToken: selected.baseToken, operationId: id(), archived: archived });
      }, { confirmLabel: archived ? 'Usuń szablon' : 'Przywróć', cancelLabel: 'Anuluj', returnFocusLabel: returnFocusLabel });
    }
    async function readRevisions(templateId) {
      if (!current() || state.busy) return; var ticket = ++sequence; busy(true); state.error = null;
      try { var revisions = await vault.listCarePlanTemplateRevisions(templateId); if (!current() || ticket !== sequence) return; if (!Array.isArray(revisions)) throw new Error('Nie można odczytać wersji szablonu.'); state.revisions = revisions; state.view = 'history'; }
      catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { busy(false); render(); headerTitle.focus({ preventScroll: true }); } }
    }
    function beginDraft(result, metadata) {
      if (!result || !result.ok || !result.definition) { state.issues = result && result.issues || []; fail(new Error('Nie można przygotować tego szablonu.')); render(); return; }
      state.draft = clone(result.definition); state.baseline = metadata.editing ? clone(result.definition) : null; state.templateId = metadata.templateId || id(); state.baseToken = metadata.baseToken || null;
      state.operationId = id(); state.wizardStep = metadata.editing ? 2 : 1; state.stageId = state.draft.stageOrder[0] || null;
      var stage = stageById(state.stageId); state.stepId = stage && stage.stepIds[0] || null;
      state.privacyRequired = !!metadata.privacy; state.reviewedText = null; state.pending = null; state.uncertain = false;
      state.blockedConflict = false; state.adaptationAuthor = ''; state.adaptationChanges = ''; state.adaptationVersion = ''; state.dirty = !!metadata.dirty; state.error = null; state.feedback = ''; state.issues = []; state.view = 'wizard'; render(); focusWizardStep();
    }
    function beginNew() { if (!current() || !canSave()) return; beginDraft(model.createDefinitionDraft({ stageId: id(), stepId: id() }), {}); }
    function beginEdit(selected) {
      if (!canSave() || selected.status !== 'active' || !selected.definition) return;
      if (!canAdapt(selected.definition)) { fail(new Error('Zasady udostępniania tego szablonu nie zezwalają na jego modyfikowanie.')); render(); return; }
      beginDraft({ ok: true, definition: selected.definition }, { templateId: selected.templateId, baseToken: selected.baseToken, editing: true });
    }
    function beginDuplicate(definition) {
      if (!canSave()) return;
      if (!canAdapt(definition)) { fail(new Error('Zasady udostępniania tego szablonu nie zezwalają na tworzenie zmienionej kopii.')); render(); return; }
      var stageIds = Object.create(null), stepIds = Object.create(null);
      definition.stages.forEach(function (stage) { stageIds[stage.id] = id(); }); definition.steps.forEach(function (step) { stepIds[step.id] = id(); });
      var result = model.duplicateDefinition(definition, { stageIds: stageIds, stepIds: stepIds });
      if (result.ok) result.definition.name = definition.name + ' — kopia'; beginDraft(result, { dirty: true });
    }
    async function copyFromPlan(planId) {
      if (!current() || state.busy) return; var ticket = ++sequence; busy(true); state.error = null;
      try {
        var source = await vault.getCarePlanTemplateDraftFromPlan(planId);
        if (!current() || ticket !== sequence) return;
        if (!source || !source.definition || source.requiresPrivacyReview !== true) throw new Error('Nie można przygotować układu tego planu.');
        busy(false); beginDraft({ ok: true, definition: source.definition }, { privacy: true, dirty: true });
      } catch (error) { if (current() && ticket === sequence) { busy(false); fail(error); render(); } }
    }
    function changeWizardStep(next) {
      if (state.busy || state.uncertain) return;
      if (next > 1 && !validate('name')) return;
      if (next > 2 && !validate('all')) return;
      state.wizardStep = next; state.issues = []; state.error = null; state.feedback = ''; render(); focusWizardStep();
    }
    function focusWizardStep() {
      var input = state.wizardStep === 1 ? fields.get('definition:name') : state.wizardStep === 2 ? fields.get(state.stageId + ':title') : workspace.querySelector('h2');
      if (input) { if (state.wizardStep === 3) input.tabIndex = -1; input.focus({ preventScroll: true }); }
    }
    function focusStep(stepId) {
      var card = Array.from(workspace.querySelectorAll('[data-template-step-id]')).find(function (entry) { return entry.dataset.templateStepId === stepId; });
      var toggle = card && card.querySelector('.vct-step-toggle'); if (toggle) toggle.focus({ preventScroll: true });
    }
    function renderWizard() {
      headerTitle.textContent = state.baseToken ? 'Edytuj szablon' : 'Nowy szablon';
      workspace.appendChild(button('← Moje szablony', 'vcp-text vct-breadcrumb', function () { state.view = 'library'; render(); }));
      var navigation = node('nav', 'vct-wizard-steps'); navigation.setAttribute('aria-label', 'Kroki kreatora szablonu');
      ['Nazwa', 'Etapy i kroki', 'Podgląd'].forEach(function (title, index) {
        var item = button((index + 1) + '. ' + title, state.wizardStep === index + 1 ? 'is-active' : '', function () { changeWizardStep(index + 1); }, title);
        item.disabled = state.busy || state.uncertain; item.setAttribute('aria-current', state.wizardStep === index + 1 ? 'step' : 'false'); navigation.appendChild(item);
      }); workspace.appendChild(navigation);
      if (state.wizardStep === 1) {
        var pane = node('div', 'vct-scroll-pane vct-name-pane');
        field(pane, 'Nazwa szablonu', 'text', state.draft.name, function (value) { state.draft.name = value; }, 'definition:name').maxLength = model.LIMITS.maxNameUnits;
        field(pane, 'Cel i opis ogólny (opcjonalnie)', 'textarea', state.draft.purpose, function (value) { state.draft.purpose = value; }, 'definition:purpose').maxLength = model.LIMITS.maxPurposeUnits;
        field(pane, 'Etykiety (opcjonalnie)', 'text', state.draft.labels.join(', '), function (value) { state.draft.labels = value.split(',').map(function (label) { return label.trim(); }).filter(Boolean); }, 'definition:labels');
        if (state.privacyRequired) help(pane, 'Sprawdź ogólne nazwy etapów i kroków. Przed zapisaniem potwierdzisz w Podglądzie usunięcie informacji dotyczących pacjenta.'); workspace.appendChild(pane);
      } else if (state.wizardStep === 2) renderStructure();
      else {
        var previewPane = node('div', 'vct-scroll-pane'); preview(previewPane, state.draft, true);
        if (needsAdaptation()) renderAdaptationFields(previewPane);
        if (state.privacyRequired) check(previewPane, 'Sprawdziłem nazwy i usunąłem informacje dotyczące pacjenta', state.reviewedText === model.reviewTextKey(state.draft), function (checked) { state.reviewedText = checked ? model.reviewTextKey(state.draft) : null; renderFooter(); });
        workspace.appendChild(previewPane);
      }
    }
    function move(array, value, delta) { var index = array.indexOf(value), next = index + delta; if (index < 0 || next < 0 || next >= array.length) return false; array.splice(index, 1); array.splice(next, 0, value); return true; }
    function structureChange(fn) { if (!current() || state.busy || state.uncertain) return; var before = JSON.stringify(state.draft); fn(); if (before === JSON.stringify(state.draft)) return; touch(); state.feedback = 'Zmieniono układ szkicu.'; render(); }
    function addStage() {
      structureChange(function () {
        if (state.draft.stages.length >= model.LIMITS.maxStages || state.draft.steps.length >= model.LIMITS.maxSteps) return;
        var result = model.createDefinitionDraft({ stageId: id(), stepId: id() }); if (!result.ok) return;
        var stage = result.definition.stages[0], step = result.definition.steps[0]; stage.title = 'Nowy etap';
        state.draft.stageOrder.push(stage.id); state.draft.stages.push(stage); state.draft.steps.push(step); state.stageId = stage.id; state.stepId = step.id;
      });
    }
    function addStep(stage) {
      structureChange(function () {
        if (stage.stepIds.length >= model.LIMITS.maxStepsPerStage || state.draft.steps.length >= model.LIMITS.maxSteps) return;
        var result = model.createDefinitionDraft({ stageId: stage.id, stepId: id() }); if (!result.ok) return;
        var step = result.definition.steps[0]; state.draft.steps.push(step); stage.stepIds.push(step.id); state.stepId = step.id;
      });
    }
    function renderStructure() {
      var layout = node('div', 'vct-editor-layout'), sidebar = node('nav', 'vct-stage-sidebar'); sidebar.setAttribute('aria-label', 'Etapy szablonu');
      orderedStages(state.draft).forEach(function (stage, index) {
        var item = button((index + 1) + '. ' + (stage.title || 'Etap bez nazwy'), state.stageId === stage.id ? 'is-active' : '', function () { state.stageId = stage.id; state.stepId = stage.stepIds[0] || null; render(); });
        item.setAttribute('aria-current', state.stageId === stage.id ? 'true' : 'false'); sidebar.appendChild(item);
      });
      var add = button('+ Dodaj etap', 'vcp-text', addStage, 'Dodaj etap'); add.disabled = state.busy || state.uncertain || state.draft.stages.length >= model.LIMITS.maxStages || state.draft.steps.length >= model.LIMITS.maxSteps; sidebar.appendChild(add); layout.appendChild(sidebar);
      var main = node('div', 'vct-editor-main'), mobile = node('div', 'vct-mobile-stage');
      select(mobile, 'Wybierz etap', orderedStages(state.draft).map(function (stage, index) { return { value: stage.id, label: (index + 1) + '. ' + (stage.title || 'Etap bez nazwy') }; }), state.stageId, function (value) { state.stageId = value; var stage = stageById(value); state.stepId = stage && stage.stepIds[0] || null; render(); }, null, false);
      var mobileAdd = button('+', 'vcp-outline', addStage, 'Dodaj etap'); mobileAdd.disabled = add.disabled; mobile.appendChild(mobileAdd); main.appendChild(mobile);
      var stage = stageById(state.stageId) || stageById(state.draft.stageOrder[0]); if (!stage) { layout.appendChild(main); workspace.appendChild(layout); return; } state.stageId = stage.id;
      var stageHeader = node('div', 'vct-stage-heading');
      field(stageHeader, 'Nazwa etapu', 'text', stage.title, function (value) { stage.title = value; }, stage.id + ':title').maxLength = model.LIMITS.maxNameUnits;
      var stageActions = node('div', 'vct-order-actions'); [-1, 1].forEach(function (delta) {
        var item = button(delta < 0 ? '↑' : '↓', '', function () { structureChange(function () { move(state.draft.stageOrder, stage.id, delta); }); }, delta < 0 ? 'Przesuń etap w górę' : 'Przesuń etap w dół');
        item.disabled = state.busy || state.uncertain || state.draft.stageOrder.indexOf(stage.id) + delta < 0 || state.draft.stageOrder.indexOf(stage.id) + delta >= state.draft.stageOrder.length; stageActions.appendChild(item);
      });
      var remove = button('×', '', function () { ask('Usunąć etap?', 'Usuniesz etap wraz z ' + stage.stepIds.length + ' krokami z tego szkicu.', function () { structureChange(function () { state.draft.steps = state.draft.steps.filter(function (step) { return step.stageId !== stage.id; }); state.draft.stages = state.draft.stages.filter(function (entry) { return entry.id !== stage.id; }); state.draft.stageOrder = state.draft.stageOrder.filter(function (value) { return value !== stage.id; }); state.stageId = state.draft.stageOrder[0]; state.stepId = stageById(state.stageId).stepIds[0] || null; }); }); }, 'Usuń etap');
      remove.disabled = state.busy || state.uncertain || state.draft.stages.length <= 1; stageActions.appendChild(remove); stageHeader.appendChild(stageActions); main.appendChild(stageHeader);
      help(main, 'Kroki w tym etapie mogą być realizowane równolegle.');
      stepsFor(state.draft, stage).forEach(function (step, index) { renderStep(main, stage, step, index); });
      var addTask = button('+ Dodaj krok', 'vcp-text', function () { addStep(stage); }, 'Dodaj krok'); addTask.disabled = state.busy || state.uncertain || stage.stepIds.length >= model.LIMITS.maxStepsPerStage || state.draft.steps.length >= model.LIMITS.maxSteps; main.appendChild(addTask);
      help(main, 'Etap uruchamiasz ręcznie. Zatwierdzenie etapu i uruchomienie kolejnego to osobne decyzje.'); layout.appendChild(main); workspace.appendChild(layout);
    }
    function renderStep(parent, stage, step, index) {
      var card = node('article', 'vct-step-card'); card.dataset.templateStepId = step.id;
      var top = node('div', 'vct-step-heading'), title = node('span', '', step.title || 'Nowy krok');
      var toggle = button('', 'vct-step-toggle', function () { state.stepId = state.stepId === step.id ? null : step.id; render(); focusStep(step.id); }); toggle.appendChild(title); toggle.setAttribute('aria-expanded', String(state.stepId === step.id)); top.appendChild(toggle);
      var actions = node('div', 'vct-order-actions'); [-1, 1].forEach(function (delta) {
        var item = button(delta < 0 ? '↑' : '↓', '', function () { structureChange(function () { move(stage.stepIds, step.id, delta); }); focusStep(step.id); }, delta < 0 ? 'Przesuń krok w górę' : 'Przesuń krok w dół'); item.disabled = state.busy || state.uncertain || index + delta < 0 || index + delta >= stage.stepIds.length; actions.appendChild(item);
      }); actions.appendChild(button('×', '', function () { ask('Usunąć krok?', step.title || 'Nowy krok', function () { structureChange(function () { stage.stepIds = stage.stepIds.filter(function (value) { return value !== step.id; }); state.draft.steps = state.draft.steps.filter(function (entry) { return entry.id !== step.id; }); state.stepId = stage.stepIds[0] || null; }); }); }, 'Usuń krok')); top.appendChild(actions); card.appendChild(top);
      if (state.stepId === step.id) {
        var body = node('div', 'vct-step-body'); field(body, 'Co jest do zrobienia?', 'text', step.title, function (value) { step.title = value; title.textContent = value || 'Nowy krok'; }, step.id + ':title').maxLength = model.LIMITS.maxNameUnits;
        var pair = node('div', 'vcp-field-pair'); body.appendChild(pair); select(pair, 'Rodzaj kroku', model.TASK_KINDS, step.taskKind, function (value) { step.taskKind = value; }, step.id + ':taskKind');
        select(pair, 'Co kończy ten krok?', [{ value: '', label: 'Wybierz sposób zakończenia' }].concat(model.OUTCOMES), step.requiredOutcome, function (value) { step.requiredOutcome = value || null; }, step.id + ':requiredOutcome');
        select(body, 'Początek liczenia przypomnienia', [{ value: 'none', label: 'Bez terminu' }, { value: 'stage-offset', label: 'Od uruchomienia etapu' }], step.reminderRule.kind, function (value) { step.reminderRule = value === 'none' ? { kind: 'none' } : { kind: 'stage-offset', amount: 0, unit: 'day' }; render(); }, step.id + ':kind');
        if (step.reminderRule.kind === 'stage-offset') {
          var timingFields = node('div', 'vcp-field-pair'); body.appendChild(timingFields);
          var amount = field(timingFields, 'Liczba jednostek czasu', 'number', step.reminderRule.amount, function (value) { step.reminderRule.amount = value.trim() === '' ? '' : Number(value); }, step.id + ':amount'); amount.min = '0'; amount.max = '1200'; amount.step = '1';
          select(timingFields, 'Jednostka czasu', [{ value: 'day', label: 'dni' }, { value: 'week', label: 'tygodni' }, { value: 'month', label: 'miesięcy' }], step.reminderRule.unit, function (value) { step.reminderRule.unit = value; }, step.id + ':unit');
        }
        var extra = node('details', 'vct-step-options'); extra.appendChild(node('summary', '', 'Więcej opcji kroku'));
        field(extra, 'Ogólna instrukcja (opcjonalnie)', 'textarea', step.instruction, function (value) { step.instruction = value; }, step.id + ':instruction').maxLength = model.LIMITS.maxInstructionUnits;
        check(extra, 'Domyślnie dołączaj do planu', step.includedByDefault, function (value) { step.includedByDefault = value; touch(); }); body.appendChild(extra); card.appendChild(body);
      } else help(card, kindLabel(step.taskKind) + ' · ' + outcomeLabel(step.requiredOutcome) + ' · ' + timing(step.reminderRule)); parent.appendChild(card);
    }
    function renderResolve() {
      headerTitle.textContent = 'Przegląd zmian szablonu';
      workspace.appendChild(button('← Moje szablony', 'vcp-text', function () { state.view = 'library'; render(); }));
      var selected = state.selected, conflicts = selected && selected.conflicts;
      if (!conflicts || !Array.isArray(conflicts.heads) || !conflicts.heads.length) { workspace.appendChild(node('p', 'vcp-empty', 'Nie można odczytać zachowanych zmian. Odśwież bibliotekę.')); return; }
      var pane = node('div', 'vct-scroll-pane'); help(pane, 'Zachowano równoległe zmiany. Wybierz treść szablonu oraz jego dostępność w bibliotece. Wszystkie wersje pozostaną w historii.');
      conflicts.heads.forEach(function (head, index) {
        var box = node('article', 'vct-conflict-version');
        var choose = button('Wybierz wersję ' + (index + 1), state.resolveHead === head.revisionId ? 'vcp-primary' : 'vcp-outline', function () { state.resolveHead = head.revisionId; render(); }); choose.disabled = state.busy || state.uncertain || !model.validateDefinition(head.definition).valid; choose.setAttribute('aria-pressed', String(state.resolveHead === head.revisionId)); box.appendChild(choose);
        if (head.definition) preview(box, head.definition, false); else help(box, 'Nie można odczytać treści tej wersji.'); pane.appendChild(box);
      });
      select(pane, 'Po przeglądzie szablon ma być', [{ value: '', label: 'Wybierz dostępność' }, { value: 'active', label: 'W aktywnej bibliotece' }, { value: 'archived', label: 'W Usuniętych' }], state.resolveArchive, function (value) { state.resolveArchive = value; }, null, false); workspace.appendChild(pane);
    }
    function ask(title, text, confirm, settings) {
      if (!current() || state.busy) return; state.confirmation = Object.assign({ title: title, text: text, confirm: confirm }, settings || {}); render();
      var titleNode = workspace.querySelector('h2'); if (titleNode) { titleNode.tabIndex = -1; titleNode.focus({ preventScroll: true }); }
    }
    function cancelConfirmation() {
      var label = state.confirmation && state.confirmation.returnFocusLabel; state.confirmation = null;
      if (label && state.stale) fail(new Error('Biblioteka zmieniła się w tle. Odśwież ją, aby zobaczyć bieżące dane.'));
      render();
      if (label) { var target = Array.from(workspace.querySelectorAll('button')).find(function (item) { return item.getAttribute('aria-label') === label; }); (target || headerTitle).focus({ preventScroll: true }); }
    }
    function renderConfirmation() {
      var pane = node('section', 'vct-confirmation'); heading(pane, state.confirmation.title); pane.appendChild(node('p', 'vcp-description', state.confirmation.text));
      pane.appendChild(button(state.confirmation.cancelLabel || 'Zostań', 'vcp-outline', cancelConfirmation));
      pane.appendChild(button(state.confirmation.confirmLabel || 'Potwierdź', 'vcp-primary', function () { var confirm = state.confirmation.confirm; state.confirmation = null; confirm(); })); workspace.appendChild(pane);
    }
    function abandonThen(fn) {
      if (state.pending) { fail(new Error('Najpierw sprawdź wynik wcześniejszego zapisu.')); render(); return; }
      if (state.draft && state.dirty) ask('Odrzucić niezapisane zmiany?', 'Nowy szkic zastąpi edytowany formularz. Możesz wrócić do niego bez utraty wpisanej treści.', fn);
      else fn();
    }
    function saved(result, pending) {
      state.pending = null; state.uncertain = false; state.blockedConflict = false; state.error = null; state.issues = [];
      state.feedback = result.unchanged ? 'Szablon pozostaje bez zmian.' : result.persistence === 'remote' ? 'Zapisano zmiany biblioteki.' : 'Zapisano zmiany na tym urządzeniu.';
      if (pending.kind === 'save') { state.draft = null; state.dirty = false; state.privacyRequired = false; state.reviewedText = null; }
      state.selected = result.template || null; state.historical = false;
      if (result.template) {
        var template = result.template, definition = template.definition, previous = state.items.find(function (item) { return item.templateId === template.templateId; });
        state.items = state.items.filter(function (item) { return item.templateId !== template.templateId; });
        state.items.push({ templateId: template.templateId, title: definition ? definition.name : previous && previous.title || 'Szablon do przeglądu',
          status: template.status, headRevisionId: template.headRevisionId, revisionNumber: template.revisionNumber, baseToken: template.baseToken,
          stageCount: definition ? definition.stages.length : 0, stepCount: definition ? definition.steps.length : 0, syncState: template.syncState }); state.loaded = true;
      }
      if (pending.transferMode === 'export-metadata' && state.transfer) {
        state.transfer.definition = clone(pending.request.definition); state.transfer.phase = 'review'; state.transfer.selected = result.template || state.transfer.selected; state.view = 'transfer'; state.feedback = 'Zapisano autorstwo i zasady udostępniania. Możesz pobrać plik szablonu.';
      } else {
        if (pending.transferMode === 'import') { state.transfer = null; state.query = ''; state.archived = false; state.feedback = 'Zaimportowano nowy, niezależny szablon.'; }
        state.view = result.template && result.template.status === 'conflict' ? 'resolve' : 'library';
      }
      if (pending.kind === 'archive') {
        state.archived = false;
        if (state.view === 'library') {
          var place = result.persistence === 'remote' ? '' : ' na tym urządzeniu';
          state.feedback = pending.request.archived ? 'Usunięto szablon z aktywnej biblioteki' + place + '. Możesz go przywrócić w Usuniętych.' : 'Przywrócono szablon do aktywnej biblioteki' + place + '.';
        }
      }
    }
    async function mutate(kind, request, retry) {
      if (!current() || state.busy || !canSave() && !retry) return;
      if (state.pending && !retry) { fail(new Error('Najpierw sprawdź wynik wcześniejszego zapisu.')); render(); return; }
      var pending = retry ? state.pending : { kind: kind, request: clone(request), transferMode: state.transfer && state.transfer.kind === 'import' ? 'import' : state.transfer && state.transfer.kind === 'export' ? 'export-metadata' : null }, ticket = ++sequence;
      if (!pending) return; state.pending = pending; state.error = null; busy(true); render();
      try {
        var result = await vault[pending.kind === 'save' ? 'saveCarePlanTemplateRevision' : pending.kind === 'archive' ? 'setCarePlanTemplateArchived' : 'resolveCarePlanTemplateConflict'](clone(pending.request));
        if (!current() || ticket !== sequence || state.pending !== pending) return;
        if (result && result.saved === true) { saved(result, pending); busy(false); render(); headerTitle.focus({ preventScroll: true }); await refresh(); }
        else if (result && (result.conflict || result.reason === 'conflict')) {
          state.pending = null; state.uncertain = false; state.blockedConflict = true; state.stale = true;
          if (pending.kind === 'archive') {
            state.selected = result.template || null; state.historical = false; state.view = result.template ? result.template.status === 'conflict' ? 'resolve' : 'detail' : 'library'; state.resolveHead = ''; state.resolveArchive = '';
            fail(new Error('Szablon zmienił się na innym urządzeniu. Sprawdź bieżącą wersję przed ponownym ' + (pending.request.archived ? 'usunięciem.' : 'przywróceniem.')));
          } else fail(new Error('Szablon zmienił się na innym urządzeniu. Twoje zmiany pozostały w formularzu. Sprawdź bieżącą wersję przed zapisaniem.'));
        } else { state.uncertain = true; fail(new Error(pending.kind === 'archive' ? 'Nie można jeszcze potwierdzić ' + (pending.request.archived ? 'usunięcia' : 'przywrócenia') + ' szablonu. Sprawdź wynik zapisu lub ponów tę samą próbę.' : 'Nie można jeszcze potwierdzić zapisu. Formularz został zachowany. Sprawdź wynik zapisu lub ponów tę samą próbę.')); }
      } catch (error) { if (current() && ticket === sequence && state.pending === pending) { state.uncertain = true; fail(error); } }
      finally { if (current() && ticket === sequence) { busy(false); render(); } }
    }
    async function checkOutcome() {
      if (!current() || state.busy || !state.pending) return; var pending = state.pending, ticket = ++sequence; busy(true); state.error = null; render();
      try {
        var outcome = await vault.getCarePlanTemplateOperation({ templateId: pending.request.templateId, operationId: pending.request.operationId });
        if (!current() || ticket !== sequence || state.pending !== pending) return;
        if (outcome && outcome.state === 'committed' && outcome.result && outcome.result.saved === true) { saved(outcome.result, pending); busy(false); render(); headerTitle.focus({ preventScroll: true }); await refresh(); }
        else state.feedback = outcome && outcome.state === 'pending' ? pending.kind === 'archive' ? 'Zmiana dostępności szablonu nadal oczekuje na potwierdzenie.' : 'Zapis nadal oczekuje na potwierdzenie. Formularz pozostaje zachowany.' : 'Wynik zapisu nie jest jeszcze potwierdzony. Możesz ponowić tę samą próbę.';
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { busy(false); render(); } }
    }
    function transferService() { return win.VildaCareTemplateTransfer || null; }
    function instructionKey(definition) {
      if (!definition) return '';
      try { return JSON.stringify(model.instructionContent(definition)); } catch (_) { return ''; }
    }
    function canAdapt(definition) { var publication = definition && definition.publication; return !publication || !publication.origin || publication.license.allowAdaptation === true; }
    function needsAdaptation() { return !!(state.draft && state.draft.publication && (!state.baseline || instructionKey(state.draft) !== instructionKey(state.baseline))); }
    function renderPublication(parent, publication) {
      var box = node('section', 'vct-publication'); heading(box, 'Autorstwo i zasady udostępniania', 'h3');
      help(box, 'Autor opracowania: ' + publication.authors.join(', '));
      if (publication.contributors.length) help(box, 'Autorzy zmian: ' + publication.contributors.join(', '));
      help(box, 'Wersja opracowania: ' + publication.version);
      if (publication.attribution && publication.attribution !== 'Autor opracowania: ' + publication.authors.join(', ')) box.appendChild(node('p', 'vcp-description', publication.attribution));
      publication.sources.forEach(function (source) { help(box, 'Źródło: ' + source.title + (source.version ? ' · ' + source.version : '') + (source.url ? ' · ' + source.url : '')); });
      help(box, publication.license.id === 'CC-BY-4.0' ? 'Licencja CC BY 4.0 — zezwala także na wykorzystanie komercyjne, z zachowaniem autorstwa i oznaczeniem zmian.' : 'Zasady określone przez autora:');
      if (publication.license.text) box.appendChild(node('p', 'vcp-description', publication.license.text));
      if (publication.license.url) help(box, publication.license.url);
      if (!publication.license.allowRedistribution) help(box, 'Autor nie zezwala na dalsze przekazywanie otrzymanej kopii.');
      if (!publication.license.allowAdaptation) help(box, 'Autor nie zezwala na modyfikowanie otrzymanej kopii.');
      if (publication.changes) box.appendChild(node('p', 'vcp-description', 'Opis zmian: ' + publication.changes));
      help(box, 'Autorstwo jest deklaracją zapisaną w szablonie; aplikacja nie potwierdza tożsamości autora.'); parent.appendChild(box);
    }
    function renderAdaptationFields(parent) {
      var box = node('section', 'vct-publication vct-adaptation'); heading(box, 'Informacje o zmianach', 'h3');
      help(box, 'Zachowamy pierwotnego autora, źródła i zasady udostępniania. Wskaż autora i zakres tej wersji opracowania.');
      field(box, 'Autor zmian', 'text', state.adaptationAuthor, function (value) { state.adaptationAuthor = value; }, null, false).maxLength = 200;
      field(box, 'Opis zmian', 'textarea', state.adaptationChanges, function (value) { state.adaptationChanges = value; }, null, false).maxLength = 1500;
      field(box, 'Wersja opracowania', 'text', state.adaptationVersion, function (value) { state.adaptationVersion = value; }, null, false).maxLength = 80;
      parent.appendChild(box);
    }
    function chooseImportFile() {
      abandonThen(function () { importPicker.value = ''; importPicker.click(); });
    }
    function transferField(parent, label, type, value, update, maximum) {
      var input = field(parent, label, type, value, function (value) { update(value); if (state.transfer) { state.transfer.rights = false; state.transfer.privacy = false; Array.from(workspace.querySelectorAll('.vcp-check')).forEach(function (label) { if (label.textContent === 'Mam prawo udostępnić ten szablon na wskazanych zasadach' || label.textContent === 'Sprawdziłem treść szablonu i nie zawiera ona danych pacjentów') { var box = label.querySelector('input'); if (box) box.checked = false; } }); } renderFooter(); }, null, false);
      if (maximum) input.maxLength = maximum; return input;
    }
    async function beginExport(templateId) {
      if (!current() || state.busy || state.pending || state.application || !transferService()) return;
      var back = navigationContext(), ticket = ++sequence; busy(true); state.error = null; state.feedback = ''; render();
      try {
        var selected = await vault.getCarePlanTemplate(templateId);
        if (!current() || ticket !== sequence) return;
        if (!selected || selected.status !== 'active' || selected.readOnly || !model.validateDefinition(selected.definition).valid) throw new Error('Nie można teraz wyeksportować tej wersji szablonu. Sprawdź jej podgląd.');
        state.transfer = { kind: 'export', selected: selected, definition: clone(selected.definition), returnContext: back,
          phase: selected.definition.publication ? 'review' : 'metadata', publicationId: id(), rights: false, privacy: false,
          author: '', version: '1.0', license: '', terms: '', redistribution: false, adaptation: false,
          sourceTitle: '', sourceURL: '', sourceVersion: '' };
        state.draft = null; state.dirty = false; state.view = 'transfer';
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { busy(false); render(); headerTitle.focus({ preventScroll: true }); } }
    }
    function renderTransfer() {
      var data = state.transfer; if (!data) return;
      headerTitle.textContent = data.kind === 'export' ? 'Eksport szablonu' : 'Import szablonu';
      var pane = node('div', 'vct-scroll-pane vct-transfer-pane'); workspace.appendChild(pane);
      if (data.phase === 'loading') { help(pane, 'Sprawdzanie pliku pojedynczego szablonu…'); return; }
      if (!data.definition) { help(pane, 'Wybierz plik pojedynczego szablonu w formacie .vilda-template.json.'); return; }
      if (data.kind === 'export' && data.phase === 'metadata') {
        heading(pane, 'Przed pierwszym eksportem');
        help(pane, 'Informacje o autorstwie i udostępnianiu zapiszemy razem z nową wersją tego szablonu. Nie zostaną nadane automatycznie.');
        transferField(pane, 'Autor opracowania', 'text', data.author, function (value) { data.author = value; }, 200);
        transferField(pane, 'Wersja opracowania', 'text', data.version, function (value) { data.version = value; }, 80);
        transferField(pane, 'Źródło medyczne (opcjonalnie)', 'text', data.sourceTitle, function (value) { data.sourceTitle = value; }, 240);
        transferField(pane, 'Adres źródła (opcjonalnie)', 'url', data.sourceURL, function (value) { data.sourceURL = value; }, 2048);
        transferField(pane, 'Wersja źródła (opcjonalnie)', 'text', data.sourceVersion, function (value) { data.sourceVersion = value; }, 240);
        select(pane, 'Zasady udostępniania', [{ value: '', label: 'Wybierz zasady' }, { value: 'CC-BY-4.0', label: 'CC BY 4.0' }, { value: 'custom', label: 'Własne zasady autora' }], data.license, function (value) { data.license = value; data.rights = false; data.privacy = false; render(); }, null, false);
        if (data.license === 'CC-BY-4.0') help(pane, 'CC BY 4.0 pozwala kopiować, zmieniać i wykorzystywać szablon także komercyjnie. Odbiorca zachowuje autorstwo, odnośnik do licencji i oznacza zmiany. Już udzielonej licencji nie można dowolnie cofnąć.');
        if (data.license === 'custom') {
          transferField(pane, 'Treść zasad udostępniania', 'textarea', data.terms, function (value) { data.terms = value; }, 12000);
          check(pane, 'Zezwalam na przekazywanie szablonu innym osobom', data.redistribution, function (value) { data.redistribution = value; data.rights = false; render(); });
          check(pane, 'Zezwalam na modyfikowanie szablonu', data.adaptation, function (value) { data.adaptation = value; data.rights = false; render(); });
        }
      }
      if (data.kind === 'import') {
        help(pane, 'Powstanie nowy szablon w Twojej bibliotece. Import nie zmieni istniejących szablonów ani planów pacjentów.');
        if (data.duplicates && data.duplicates.length) help(pane, 'Ten szablon lub jego inna wersja jest już w bibliotece: ' + data.duplicates.join(', ') + '. Niczego nie nadpiszemy.');
      } else help(pane, 'Plik zawiera jeden szablon. Nie zawiera historii biblioteki ani dokumentacji dołączonej do planów pacjentów. Sprawdź również informacje wpisane ręcznie w nazwach i instrukcjach.');
      preview(pane, data.definition, false);
      if (data.kind === 'export') {
        var denied = data.definition.publication && data.definition.publication.origin && !data.definition.publication.license.allowRedistribution;
        if (denied) help(pane, 'Nie można pobrać pliku: autor nie zezwala na dalsze przekazywanie tej kopii.');
        check(pane, 'Mam prawo udostępnić ten szablon na wskazanych zasadach', data.rights, function (value) { data.rights = value; renderFooter(); });
        check(pane, 'Sprawdziłem treść szablonu i nie zawiera ona danych pacjentów', data.privacy, function (value) { data.privacy = value; renderFooter(); });
      } else {
        check(pane, 'Zapoznałem się z autorstwem i zasadami udostępniania', data.rights, function (value) { data.rights = value; renderFooter(); });
        if (data.duplicates && data.duplicates.length) check(pane, 'Rozumiem, że zapiszę dodatkową kopię istniejącego szablonu', data.duplicateAccepted, function (value) { data.duplicateAccepted = value; renderFooter(); });
      }
    }
    async function closeTransfer() {
      if (state.busy || state.pending) return;
      var data = state.transfer; state.transfer = null; state.error = null; state.feedback = ''; state.view = 'library';
      if (state.stale) await refresh();
      render(); if (data) await restoreNavigation(data.returnContext);
    }
    function transferFailure(result) {
      var issue = result && result.issues && result.issues[0], code = [result && result.reason || '', issue && issue.code || ''].join(' ');
      if (/LIBRARY_UNSUPPORTED/.test(code)) return new Error('Pliki całej biblioteki nie są obsługiwane. Wybierz plik pojedynczego szablonu .vilda-template.json.');
      if (/VERSION|UPDATE_REQUIRED/.test(code)) return new Error('Ten plik używa nieobsługiwanej wersji szablonu. Odśwież aplikację i spróbuj ponownie.');
      if (/SIZE|LARGE|BYTES|FILE_LIMIT/.test(code)) return new Error('Plik szablonu przekracza obsługiwany rozmiar.');
      if (/REDISTRIBUTION/.test(code)) return new Error('Zasady udostępniania nie zezwalają na dalsze przekazywanie tej kopii.');
      if (/ADAPTATION/.test(code)) return new Error('Zasady udostępniania nie zezwalają na modyfikowanie tej kopii.');
      if (/MODIF|CONTRIBUT|CHANGES|CHANGE_ATTRIBUTION/.test(code)) return new Error('Wskaż autora i opis wprowadzonych zmian przed udostępnieniem szablonu.');
      return new Error('Nie można odczytać lub zapisać tego szablonu. Sprawdź treść, autora, źródła i zasady udostępniania. Pliki całej biblioteki nie są obsługiwane.');
    }
    async function importTemplate(file) {
      if (!current() || state.busy || state.pending || state.application || !canSave()) return;
      var service = transferService(); if (!service) { fail(new Error('Odśwież aplikację, aby importować pojedynczy szablon.')); render(); return; }
      if (state.draft && state.dirty) { ask('Odrzucić niezapisane zmiany?', 'Import nowego szablonu zastąpi edytowany szkic. Możesz pozostać przy edycji.', function () { state.draft = null; state.dirty = false; importTemplate(file); }); return; }
      var data = { kind: 'import', phase: 'loading', returnContext: navigationContext(), definition: null, rights: false, duplicateAccepted: false }, ticket = ++sequence;
      state.transfer = data; state.view = 'transfer'; state.error = null; state.feedback = ''; busy(true); render();
      try {
        if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > service.MAX_BYTES) throw new Error('Plik szablonu przekracza obsługiwany rozmiar lub jest pusty.');
        var text = await file.text();
        if (!current() || ticket !== sequence || state.transfer !== data) return;
        var parsed = await service.parse(text);
        if (!current() || ticket !== sequence || state.transfer !== data) return;
        if (!parsed || !parsed.ok) throw transferFailure(parsed);
        var stageIds = Object.create(null), stepIds = Object.create(null);
        parsed.definition.stages.forEach(function (stage) { stageIds[stage.id] = id(); }); parsed.definition.steps.forEach(function (step) { stepIds[step.id] = id(); });
        var prepared = await service.prepareImport(parsed.definition, { stageIds: stageIds, stepIds: stepIds });
        if (!current() || ticket !== sequence || state.transfer !== data) return;
        if (!prepared || !prepared.ok) throw transferFailure(prepared);
        var items = await vault.listCarePlanTemplates({ archived: 'all' });
        if (!current() || ticket !== sequence || state.transfer !== data) return;
        if (!Array.isArray(items)) throw new Error('Nie można sprawdzić istniejących szablonów. Spróbuj ponownie.');
        // The list DTO already contains verified definitions. Do not decrypt
        // every revision graph a second time merely to compare publications.
        var incoming = parsed.definition.publication;
        data.duplicates = items.filter(function (record) {
          var publication = record && record.definition && record.definition.publication;
          return publication && (publication.id === incoming.id || publication.origin && publication.origin.id === incoming.id || incoming.origin && incoming.origin.id === publication.id);
        }).map(function (record) { return record.definition.name; });
        data.definition = prepared.definition; data.phase = 'review'; data.templateId = id(); data.operationId = id();
        state.draft = null; state.dirty = false;
      } catch (error) { if (current() && ticket === sequence) { data.phase = 'error'; fail(error); } }
      finally { if (current() && ticket === sequence) { busy(false); render(); headerTitle.focus({ preventScroll: true }); } }
    }
    function commitImport() {
      var data = state.transfer;
      if (!current() || state.busy || state.pending || !data || data.kind !== 'import' || !data.definition || !data.rights || data.duplicates.length && !data.duplicateAccepted) return;
      mutate('save', { templateId: data.templateId, operationId: data.operationId, baseToken: null, definition: data.definition });
    }
    function saveExportMetadata() {
      var data = state.transfer;
      if (!current() || state.busy || state.pending || !data || data.kind !== 'export' || data.phase !== 'metadata' || !data.rights || !data.privacy || !canSave()) return;
      if (!data.author.trim() || !data.version.trim() || !['CC-BY-4.0', 'custom'].includes(data.license) || data.license === 'custom' && !data.terms.trim() || !data.sourceTitle.trim() && (data.sourceURL.trim() || data.sourceVersion.trim())) { fail(new Error('Uzupełnij autora, wersję opracowania i zasady udostępniania. Źródło z adresem lub wersją wymaga również nazwy.')); renderFeedback(); return; }
      var definition = clone(data.definition); definition.contentVersion = 2;
      definition.publication = { id: data.publicationId, version: data.version.trim(), authors: [data.author.trim()], contributors: [],
        sources: data.sourceTitle.trim() ? [{ title: data.sourceTitle.trim(), url: data.sourceURL.trim(), version: data.sourceVersion.trim() }] : [],
        license: { id: data.license, url: data.license === 'CC-BY-4.0' ? 'https://creativecommons.org/licenses/by/4.0/' : '', text: data.license === 'CC-BY-4.0' ? '' : data.terms.trim(), allowRedistribution: data.license === 'CC-BY-4.0' || data.redistribution, allowAdaptation: data.license === 'CC-BY-4.0' || data.adaptation },
        attribution: 'Autor opracowania: ' + data.author.trim(), changes: '', origin: null };
      var canonical = model.canonicalDefinition(definition);
      if (!canonical.ok) { fail(transferFailure(canonical)); renderFeedback(); return; }
      mutate('save', { templateId: data.selected.templateId, operationId: id(), baseToken: data.selected.baseToken, definition: canonical.definition });
    }
    async function exportTemplate() {
      var data = state.transfer, service = transferService();
      if (!current() || state.busy || state.pending || !data || data.kind !== 'export' || data.phase !== 'review' || !data.rights || !data.privacy || !service) return;
      var ticket = ++sequence; busy(true); state.error = null; render();
      try {
        var exported = await service.serialize(data.definition);
        if (!current() || ticket !== sequence || state.transfer !== data) return;
        if (!exported || !exported.ok) throw transferFailure(exported);
        if (!win.Blob || !win.URL || typeof win.URL.createObjectURL !== 'function') throw new Error('Ta przeglądarka nie może teraz pobrać pliku szablonu.');
        var url = win.URL.createObjectURL(new win.Blob([exported.text], { type: 'application/json' })), link = node('a', ''); objectURLs.add(url);
        link.href = url; link.download = exported.fileName; doc.body.appendChild(link); link.click(); link.remove();
        win.setTimeout(function () { win.URL.revokeObjectURL(url); objectURLs.delete(url); }, 0);
        state.feedback = 'Pobrano pojedynczy szablon. Plik możesz przekazać zgodnie z zapisanymi w nim zasadami.';
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { busy(false); render(); } }
    }
    function saveDraft() {
      if (!current() || state.busy || state.uncertain || state.blockedConflict || !canSave() || !validate('all')) return;
      if (state.privacyRequired && state.reviewedText !== model.reviewTextKey(state.draft)) { state.wizardStep = 3; fail(new Error('Sprawdź wszystkie nazwy i potwierdź usunięcie informacji dotyczących pacjenta.')); render(); return; }
      var definition = clone(state.draft);
      if (needsAdaptation()) {
        var author = state.adaptationAuthor.trim(), changes = state.adaptationChanges.trim(), version = state.adaptationVersion.trim();
        if (!canAdapt(definition) || !author || !changes || !version || version === definition.publication.version) { state.wizardStep = 3; fail(new Error('Wskaż autora zmian, opisz wprowadzone zmiany i nadaj nowe oznaczenie wersji opracowania.')); render(); return; }
        if (!definition.publication.contributors.includes(author)) definition.publication.contributors.push(author);
        definition.publication.changes = [definition.publication.changes, author + ': ' + changes].filter(Boolean).join('\n'); definition.publication.version = version;
      }
      var canonical = model.canonicalDefinition(definition);
      if (!canonical.ok) { state.issues = canonical.issues || []; render(); return; }
      mutate('save', { templateId: state.templateId, operationId: state.operationId, baseToken: state.baseToken, definition: canonical.definition });
    }
    function renderFooter() {
      if (!current()) return; clear(footer); if (state.confirmation) return;
      var status = node('p', 'vcp-help'); status.textContent = state.view === 'wizard' && state.draft ? structureCount(state.draft.stages.length, state.draft.steps.length) + (state.dirty ? ' · Zmiany niezapisane' : '') : capabilityText(); footer.appendChild(status);
      var actions = node('div', 'vct-footer-actions');
      if (state.application) {
        var application = state.application;
        status.textContent = application.phase === 'review' ? counted(application.selectedSteps.size, 'wybrany krok', 'wybrane kroki', 'wybranych kroków') : 'Wybierz osobę, dla której powstanie plan.';
        if (application.pending) {
          actions.appendChild(button('Sprawdź wynik', 'vcp-outline', checkApplicationOutcome));
          actions.appendChild(button('Ponów tę samą próbę', 'vcp-primary', function () { commitApplication(true); }));
        } else {
          actions.appendChild(button('Anuluj', 'vcp-outline', requestApplicationBack));
          var nextApplication = button(application.phase === 'patient' ? 'Dalej' : 'Utwórz plan', 'vcp-primary', function () { if (application.phase === 'patient') prepareApplication(); else commitApplication(false); });
          var missingOutcome = application.definition && application.definition.steps.some(function (step) { return application.selectedSteps.has(step.id) && !model.OUTCOMES.some(function (entry) { return entry.value === step.requiredOutcome; }); });
          nextApplication.disabled = state.busy || !canApply() || !application.patient || !application.source || application.phase === 'review' && (!application.selectedSteps.size || missingOutcome); actions.appendChild(nextApplication);
        }
      } else if (state.pending) {
        actions.appendChild(button('Sprawdź wynik zapisu', 'vcp-outline', checkOutcome)); actions.appendChild(button('Ponów zapis', 'vcp-primary', function () { mutate(null, null, true); }));
      } else if (state.view === 'transfer') {
        var data = state.transfer; status.textContent = data && data.kind === 'import' ? 'Import jednego szablonu' : 'Eksport jednego szablonu';
        actions.appendChild(button('Anuluj', 'vcp-outline', closeTransfer));
        if (data && data.definition && data.phase !== 'error') {
          var submit = button(data.kind === 'import' ? data.duplicates.length ? 'Zapisz dodatkową kopię' : 'Zapisz jako nowy szablon' : data.phase === 'metadata' ? 'Zapisz informacje o szablonie' : 'Pobierz szablon', 'vcp-primary', data.kind === 'import' ? commitImport : data.phase === 'metadata' ? saveExportMetadata : exportTemplate);
          var publication = data.definition.publication;
          submit.disabled = state.busy || !data.rights || data.kind === 'import' && (!canSave() || data.duplicates.length && !data.duplicateAccepted) || data.kind === 'export' && (!data.privacy || data.phase === 'metadata' && !canSave() || publication && publication.origin && !publication.license.allowRedistribution); actions.appendChild(submit);
        } else if (data && data.phase === 'error') actions.appendChild(button('Wybierz inny plik', 'vcp-primary', function () { closeTransfer(); chooseImportFile(); }));
      } else if (state.view === 'wizard') {
        if (state.blockedConflict) {
          actions.appendChild(button('Zobacz bieżącą wersję', 'vcp-outline', function () { readTemplate(state.templateId); }));
          actions.appendChild(button('Zapisz jako nowy szablon', 'vcp-outline', function () { var definition = clone(state.draft), privacy = state.privacyRequired; beginDuplicate(definition); state.privacyRequired = privacy; state.wizardStep = 1; render(); }));
        } else {
          if (state.wizardStep > 1) actions.appendChild(button('Wstecz', 'vcp-outline', function () { changeWizardStep(state.wizardStep - 1); }));
          var next = button(state.wizardStep < 3 ? 'Dalej' : state.baseToken ? 'Zapisz nową wersję' : 'Zapisz szablon', 'vcp-primary', function () { if (state.wizardStep < 3) changeWizardStep(state.wizardStep + 1); else saveDraft(); }); next.disabled = state.busy || !canSave(); actions.appendChild(next);
        }
      } else {
        if (state.draft) actions.appendChild(button('Wróć do edycji', 'vcp-outline', function () { state.view = 'wizard'; render(); }));
        if (state.view === 'resolve') { var resolve = button('Potwierdź wybrane zmiany', 'vcp-primary', function () {
          if (!state.resolveHead || !['active', 'archived'].includes(state.resolveArchive)) { fail(new Error('Wybierz wersję oraz dostępność szablonu po przeglądzie.')); renderFeedback(); return; }
          mutate('resolve', { templateId: state.selected.templateId, operationId: id(), baseToken: state.selected.baseToken, headRevisionId: state.resolveHead, archived: state.resolveArchive === 'archived' });
        }); resolve.disabled = state.busy || !canSave(); actions.appendChild(resolve); }
        actions.appendChild(button('Odśwież', 'vcp-text', refresh, 'Odśwież bibliotekę'));
      }
      Array.from(actions.querySelectorAll('button')).forEach(function (item) { if (state.busy) item.disabled = true; }); footer.appendChild(actions);
    }
    function requestClose() {
      if (state.busy) return;
      if (state.confirmation) { cancelConfirmation(); return; }
      var application = state.application;
      if (application && (application.pending || application.dirty)) ask('Zamknąć bibliotekę?', application.pending ? 'Nie potwierdzono jeszcze utworzenia planu. Możesz pozostać i sprawdzić wynik tej samej próby.' : 'Niezapisane dopasowanie planu pacjenta zostanie odrzucone. Szablon pozostanie bez zmian.', destroy);
      else if (state.draft && state.dirty || state.pending) ask('Zamknąć bibliotekę?', state.pending ? 'Nie potwierdzono jeszcze wyniku zapisu. Wpisana treść zostanie zamknięta; możesz najpierw sprawdzić wynik.' : 'Niezapisane zmiany w szkicu zostaną odrzucone.', destroy);
      else destroy();
    }
    function changed() { if (!current()) return; if (state.application || state.transfer || state.view === 'wizard' || state.confirmation || state.busy || state.pending) { state.stale = true; return; } if (timer) win.clearTimeout(timer); timer = win.setTimeout(function () { timer = null; refresh(); }, 80); }
    function destroy() {
      if (destroyed) return; destroyed = true; sequence += 1; if (timer) win.clearTimeout(timer); if (lifecycle) lifecycle.disconnect();
      unsubscribe.forEach(function (fn) { if (typeof fn === 'function') fn(); }); doc.removeEventListener('vilda:sync-merged', changed);
      objectURLs.forEach(function (url) { if (win.URL) win.URL.revokeObjectURL(url); }); objectURLs.clear();
      state.draft = null; state.pending = null; state.application = null; state.applicationCapability = null; state.transfer = null; state.items = []; state.selected = null; state.revisions = []; state.reviewedText = null; fields.clear(); root.remove();
      if (options.onBusy) options.onBusy(false, false); if (options.onClose) options.onClose();
    }
    unsubscribe.push(observe(vault, changed, destroy)); doc.addEventListener('vilda:sync-merged', changed);
    if (typeof win.MutationObserver === 'function') { lifecycle = new win.MutationObserver(function () { if (!current()) destroy(); }); lifecycle.observe(doc.body, { childList: true, subtree: true }); }
    var controller = { refresh: refresh, destroy: destroy, requestClose: requestClose, create: function () { abandonThen(beginNew); }, copyFromPlan: copyFromPlan, open: readTemplate, exportTemplate: beginExport, importTemplate: importTemplate,
      isEditing: function () { return !!state.draft || !!state.application || !!state.transfer || state.busy; }, getNavigationContext: navigationContext, restoreNavigationContext: restoreNavigation,
      getContext: function () { return { view: state.view, templateId: state.templateId, wizardStep: state.wizardStep }; } };
    if (options.onBusy) options.onBusy(false, true); render();
    Promise.resolve(refresh()).then(function () { if (!current()) return; if (options.sourcePlanId) return copyFromPlan(options.sourcePlanId); if (options.navigationContext) return restoreNavigation(options.navigationContext); }); return controller;
  }
  function open(options) {
    options = options || {}; var doc = win.document, origin = doc.activeElement, dialog = doc.createElement('dialog'); dialog.className = 'vcp vct-dialog';
    if (options.remindersLayout === true) dialog.classList.add('vct-reminders-dialog');
    dialog.setAttribute('aria-label', 'Moje szablony'); doc.body.appendChild(dialog);
    var cleanup = null, stopViewport = null, controller, closed = false;
    function closedDialog() { if (closed) return; closed = true; if (stopViewport) { stopViewport(); stopViewport = null; } var removePrivacy = cleanup; cleanup = null; if (removePrivacy) removePrivacy(); if (dialog.open) dialog.close(); dialog.remove(); if (origin && origin.isConnected && origin.focus) origin.focus({ preventScroll: true }); if (options.onClose) options.onClose(); }
    try {
      if (options.remindersLayout === true) {
        var viewport = win.visualViewport;
        function fitViewport() {
          if (closed || !dialog.isConnected) return;
          var height = viewport && viewport.height > 0 ? viewport.height : win.innerHeight;
          var compact = height < 500, gap = compact ? 4 : (win.innerWidth || 0) <= 700 ? 8 : 24;
          var top = (viewport && viewport.offsetTop > 0 ? viewport.offsetTop : 0) + gap;
          dialog.style.setProperty('--vct-reminders-top', top + 'px');
          dialog.style.setProperty('--vct-reminders-height', Math.max(1, Math.min(850, height - 2 * gap)) + 'px');
          dialog.classList.toggle('vct-reminders-compact', compact);
        }
        win.addEventListener('resize', fitViewport);
        if (viewport) { viewport.addEventListener('resize', fitViewport); viewport.addEventListener('scroll', fitViewport); }
        stopViewport = function () {
          win.removeEventListener('resize', fitViewport);
          if (viewport) { viewport.removeEventListener('resize', fitViewport); viewport.removeEventListener('scroll', fitViewport); }
        };
        fitViewport();
      }
      controller = mount(dialog, Object.assign({}, options, { onClose: closedDialog }));
      if (options.onDialog) cleanup = options.onDialog(dialog); dialog.addEventListener('cancel', function (event) { event.preventDefault(); controller.requestClose(); }); dialog.showModal();
      var first = dialog.querySelector('.vcp-search'); if (first) first.focus({ preventScroll: true }); return controller;
    } catch (error) { if (controller) controller.destroy(); else { closedDialog(); if (options.onBusy) options.onBusy(false, false); } throw error; }
  }
  win.VildaCareTemplates = Object.freeze({ mount: mount, open: open });
})(typeof window !== 'undefined' ? window : null);
