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
    if (!model || !vault) throw new Error('Odśwież aplikację, aby otworzyć szablony.');
    var owner = vault.getCurrentUser && vault.getCurrentUser(), ownerId = owner && owner.userId;
    var destroyed = false, sequence = 0, timer = null, lifecycle = null, unsubscribe = [], fields = new Map(), objectURLs = new Set();
    var state = { view: 'library', items: [], loaded: false, catalogReadable: false, loading: false, query: '', archived: false, capability: null,
      busy: false, error: null, feedback: '', selected: null, revisions: [], draft: null, dirty: false, wizardStep: 1,
      stageId: null, stepId: null, templateId: null, baseToken: null, operationId: null, privacyRequired: false,
      reviewedText: null, stale: false, pending: null, uncertain: false, confirmation: null, issues: [], importData: null, limitedToLocal: false, syncInfo: '' };
    function current() { var user = vault.getCurrentUser && vault.getCurrentUser(); return !destroyed && host.isConnected && vault.isUnlocked() && user && user.userId === ownerId && (!options.isCurrent || options.isCurrent()); }
    function node(tag, className, text) { var element = doc.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; }
    function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    function button(text, className, fn, label) { var element = node('button', className, text); element.type = 'button'; if (label) element.setAttribute('aria-label', label); if (fn) element.addEventListener('click', function () { if (current() && !state.busy && !element.disabled) fn(); }); return element; }
    function busy(value) { state.busy = value; root.setAttribute('aria-busy', String(value)); if (options.onBusy) options.onBusy(value, true); }
    function canSave() { return !!(state.capability && state.capability.canSave === true); }
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
    function capabilityText() { return !state.capability ? '' : !canSave() ? 'Zapisywanie szablonów jest teraz niedostępne. Odśwież bibliotekę, aby ponowić sprawdzenie.' : state.syncInfo || (state.capability.persistence === 'private-local' && !state.capability.syncAvailable ? 'Biblioteka jest zapisywana na tym urządzeniu.' : ''); }
    var root = node('section', 'vcp vct'); root.setAttribute('aria-label', 'Moje szablony');
    var header = node('header', 'vcp-form-head vct-header'), headerTitle = node('h2', '', 'Moje szablony'); headerTitle.tabIndex = -1; header.appendChild(headerTitle);
    var closeButton = button('×', 'vcp-icon', requestClose, 'Zamknij bibliotekę szablonów'); header.appendChild(closeButton); root.appendChild(header);
    var feedback = node('div', 'vcp-feedback vct-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true; root.appendChild(feedback);
    var errors = node('div', 'vct-errors'), workspace = node('div', 'vct-workspace'), footer = node('footer', 'vct-footer'); root.appendChild(errors); root.appendChild(workspace); root.appendChild(footer); host.appendChild(root);
    var importPicker = node('input', ''); importPicker.type = 'file'; importPicker.accept = '.vctlib,application/json,application/octet-stream'; importPicker.hidden = true; importPicker.setAttribute('aria-label', 'Plik biblioteki szablonów'); root.appendChild(importPicker);
    importPicker.addEventListener('change', function () { if (current() && importPicker.files && importPicker.files[0]) importLibrary(importPicker.files[0]); });
    function renderFeedback() {
      feedback.textContent = state.feedback; feedback.hidden = !state.feedback; clear(errors);
      if (state.error) { var error = node('div', 'vcp-error', state.error); error.setAttribute('role', 'alert'); errors.appendChild(error); }
      if (state.issues.length) { var issues = node('div', 'vcp-error', issueMessage(state.issues[0])); issues.setAttribute('role', 'alert'); errors.appendChild(issues); }
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
      var focusedSearch = root.contains(doc.activeElement) && doc.activeElement.getAttribute('aria-label') === 'Szukaj własnego szablonu';
      var caret = focusedSearch && typeof doc.activeElement.selectionStart === 'number' ? doc.activeElement.selectionStart : null;
      fields.clear(); clear(workspace); clear(footer); closeButton.disabled = state.busy;
      renderFeedback();
      if (state.confirmation) renderConfirmation();
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
      var filters = node('div', 'vcp-filters'); [['active', 'Aktywne'], ['archived', 'Archiwum']].forEach(function (entry) {
        var item = button(entry[1], (state.archived === (entry[0] === 'archived') ? 'is-active' : ''), function () { if (state.busy) return; state.archived = entry[0] === 'archived'; render(); }); item.setAttribute('aria-pressed', String(state.archived === (entry[0] === 'archived'))); filters.appendChild(item);
      }); toolbar.appendChild(search); toolbar.appendChild(filters);
      var create = button('+ Nowy szablon', 'vcp-primary', function () { abandonThen(function () { beginNew(); }); }, 'Nowy szablon'); create.disabled = state.busy || !canSave(); toolbar.appendChild(create); workspace.appendChild(toolbar);
      var cards = node('div', 'vct-library-list'); workspace.appendChild(cards);
      function draw() {
        clear(cards); var query = key(state.query), items = state.items.filter(function (item) { return !['active', 'archived'].includes(item.status) || state.archived === (item.status === 'archived'); }).filter(function (item) { return !query || key((item.title || '') + ' ' + (item.labels || []).join(' ')).includes(query); });
        if (!state.loaded && state.loading) cards.appendChild(node('p', 'vcp-empty', 'Wczytywanie szablonów…'));
        else if (!items.length && !state.error && state.loaded && state.catalogReadable) cards.appendChild(node('p', 'vcp-empty', state.query ? 'Brak pasujących szablonów.' : state.limitedToLocal ? 'Brak szablonów zapisanych na tym urządzeniu.' : state.archived ? 'Archiwum jest puste.' : 'Nie masz jeszcze własnych szablonów.'));
        items.forEach(function (item) {
          var row = node('article', 'vct-template-row'); row.dataset.templateId = item.templateId;
          var text = node('div', 'vct-template-copy'); heading(text, item.title || 'Szablon do przeglądu', 'h3');
          help(text, item.status === 'conflict' ? 'Wymaga przeglądu zmian' : !['active', 'archived'].includes(item.status) ? 'Nie można odczytać tej wersji szablonu.' : structureCount(item.stageCount, item.stepCount) + ' · Wersja ' + item.revisionNumber);
          if (item.syncState && item.syncState.pending) help(text, 'Oczekuje na synchronizację');
          var actions = node('div', 'vct-row-actions'); actions.appendChild(button(item.status === 'conflict' ? 'Przejrzyj zmiany' : 'Podgląd', 'vcp-outline', function () { readTemplate(item.templateId); })); row.appendChild(text); row.appendChild(actions); cards.appendChild(row);
        });
      }
      search.addEventListener('input', function () { state.query = search.value; draw(); }); draw();
      var capability = capabilityText(); if (capability) help(workspace, capability);
    }
    function preview(parent, definition, editLinks) {
      if (!model.validateDefinition(definition).valid) { parent.appendChild(node('p', 'vcp-empty', 'Nie można odczytać tej definicji szablonu.')); return; }
      heading(parent, definition.name || 'Nowy szablon', 'h2'); if (definition.purpose) parent.appendChild(node('p', 'vcp-goal', definition.purpose));
      if (definition.labels.length) help(parent, definition.labels.join(' · '));
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
      if (!state.historical) { var edit = button('Edytuj', 'vcp-outline', function () { abandonThen(function () { beginEdit(selected); }); }); edit.disabled = !canSave() || selected.status !== 'active'; actions.appendChild(edit); }
      var duplicate = button('Utwórz kopię', 'vcp-outline', function () { abandonThen(function () { beginDuplicate(selected.definition); }); }); duplicate.disabled = !canSave(); actions.appendChild(duplicate);
      actions.appendChild(button('Wersje', 'vcp-text', function () { readRevisions(selected.templateId); }));
      if (!state.historical) {
        var archived = selected.status === 'archived', archive = button(archived ? 'Przywróć do biblioteki' : 'Archiwizuj', 'vcp-text', function () { ask(archived ? 'Przywrócić szablon?' : 'Archiwizować szablon?', archived ? 'Szablon wróci do aktywnej biblioteki.' : 'Szablon pozostanie dostępny w archiwum wraz z jego wersjami. Dotychczasowe plany pacjentów pozostaną zachowane.', function () { mutate('archive', { templateId: selected.templateId, baseToken: selected.baseToken, operationId: id(), archived: !archived }); }); });
        archive.disabled = !canSave(); actions.appendChild(archive);
      }
      workspace.appendChild(actions);
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
      var ticket = ++sequence; state.loading = true; state.catalogReadable = false; state.error = null; if (!state.loaded) render();
      try {
        var capability = await vault.getCarePlanTemplateCapability();
        if (!current() || ticket !== sequence) return;
        var syncError = null, local = capability && capability.persistence === 'private-local'; state.capability = capability;
        state.limitedToLocal = !!(local && !capability.syncAvailable); state.syncInfo = '';
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
        var values = await Promise.all([vault.getCarePlanTemplateCapability(), vault.listCarePlanTemplates({ archived: 'all' })]);
        if (!current() || ticket !== sequence) return;
        state.capability = values[0]; if (!Array.isArray(values[1])) throw new Error('Nie można odczytać listy szablonów.'); state.items = values[1]; state.loaded = true; state.catalogReadable = !!(values[0] && values[0].readable === true && ['private-local', 'remote-ack'].includes(values[0].persistence)); state.stale = false; if (syncError) fail(syncError);
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { state.loading = false; if (state.view !== 'wizard') render(); else { renderFeedback(); renderFooter(); } } }
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
      state.blockedConflict = false; state.dirty = !!metadata.dirty; state.error = null; state.feedback = ''; state.issues = []; state.view = 'wizard'; render(); focusWizardStep();
    }
    function beginNew() { if (!current() || !canSave()) return; beginDraft(model.createDefinitionDraft({ stageId: id(), stepId: id() }), {}); }
    function beginEdit(selected) {
      if (!canSave() || selected.status !== 'active' || !selected.definition) return;
      beginDraft({ ok: true, definition: selected.definition }, { templateId: selected.templateId, baseToken: selected.baseToken, editing: true });
    }
    function beginDuplicate(definition) {
      if (!canSave()) return; var stageIds = Object.create(null), stepIds = Object.create(null);
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
      select(pane, 'Po przeglądzie szablon ma być', [{ value: '', label: 'Wybierz dostępność' }, { value: 'active', label: 'W aktywnej bibliotece' }, { value: 'archived', label: 'W archiwum' }], state.resolveArchive, function (value) { state.resolveArchive = value; }, null, false); workspace.appendChild(pane);
    }
    function ask(title, text, confirm) { if (!current() || state.busy) return; state.confirmation = { title: title, text: text, confirm: confirm }; render(); }
    function renderConfirmation() {
      var pane = node('section', 'vct-confirmation'); heading(pane, state.confirmation.title); pane.appendChild(node('p', 'vcp-description', state.confirmation.text));
      pane.appendChild(button('Zostań', 'vcp-outline', function () { state.confirmation = null; render(); }));
      pane.appendChild(button('Potwierdź', 'vcp-primary', function () { var confirm = state.confirmation.confirm; state.confirmation = null; confirm(); })); workspace.appendChild(pane);
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
      state.view = result.template && result.template.status === 'conflict' ? 'resolve' : 'library';
      if (pending.kind === 'archive') state.archived = pending.request.archived;
    }
    async function mutate(kind, request, retry) {
      if (!current() || state.busy || !canSave() && !retry) return;
      if (state.pending && !retry) { fail(new Error('Najpierw sprawdź wynik wcześniejszego zapisu.')); render(); return; }
      var pending = retry ? state.pending : { kind: kind, request: clone(request) }, ticket = ++sequence;
      if (!pending) return; state.pending = pending; state.error = null; busy(true); render();
      try {
        var result = await vault[pending.kind === 'save' ? 'saveCarePlanTemplateRevision' : pending.kind === 'archive' ? 'setCarePlanTemplateArchived' : 'resolveCarePlanTemplateConflict'](clone(pending.request));
        if (!current() || ticket !== sequence || state.pending !== pending) return;
        if (result && result.saved === true) { saved(result, pending); busy(false); render(); await refresh(); }
        else if (result && (result.conflict || result.reason === 'conflict')) {
          state.pending = null; state.uncertain = false; state.blockedConflict = true; state.stale = true;
          fail(new Error('Szablon zmienił się na innym urządzeniu. Twoje zmiany pozostały w formularzu. Sprawdź bieżącą wersję przed zapisaniem.'));
        } else { state.uncertain = true; fail(new Error('Nie można jeszcze potwierdzić zapisu. Formularz został zachowany. Sprawdź wynik zapisu lub ponów tę samą próbę.')); }
      } catch (error) { if (current() && ticket === sequence && state.pending === pending) { state.uncertain = true; fail(error); } }
      finally { if (current() && ticket === sequence) { busy(false); render(); } }
    }
    async function checkOutcome() {
      if (!current() || state.busy || !state.pending) return; var pending = state.pending, ticket = ++sequence; busy(true); state.error = null; render();
      try {
        var outcome = await vault.getCarePlanTemplateOperation({ templateId: pending.request.templateId, operationId: pending.request.operationId });
        if (!current() || ticket !== sequence || state.pending !== pending) return;
        if (outcome && outcome.state === 'committed' && outcome.result && outcome.result.saved === true) { saved(outcome.result, pending); busy(false); render(); await refresh(); }
        else state.feedback = outcome && outcome.state === 'pending' ? 'Zapis nadal oczekuje na potwierdzenie. Formularz pozostaje zachowany.' : 'Wynik zapisu nie jest jeszcze potwierdzony. Możesz ponowić tę samą próbę.';
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { busy(false); render(); } }
    }
    async function exportLibrary() {
      if (!current() || state.busy || state.pending) return; var ticket = ++sequence; busy(true); state.error = null; render();
      try {
        var text = await vault.exportCarePlanTemplateLibrary();
        if (!current() || ticket !== sequence) return;
        if (typeof text !== 'string' || !win.Blob || !win.URL || typeof win.URL.createObjectURL !== 'function') throw new Error('Nie udało się przygotować pliku biblioteki w tej przeglądarce.');
        var url = win.URL.createObjectURL(new win.Blob([text], { type: 'application/octet-stream' })), link = node('a', ''); objectURLs.add(url);
        link.href = url; link.download = 'biblioteka-szablonow.vctlib'; doc.body.appendChild(link); link.click(); link.remove();
        win.setTimeout(function () { win.URL.revokeObjectURL(url); objectURLs.delete(url); }, 0);
        state.feedback = 'Pobrano szyfrowaną bibliotekę. Do jej importu zachowaj to samo konto i klucz szyfrowania.';
      } catch (error) { if (current() && ticket === sequence) fail(error); }
      finally { if (current() && ticket === sequence) { busy(false); render(); } }
    }
    async function importLibrary(file) {
      if (!current() || state.busy || state.pending || !canSave()) return;
      if (file) state.importData = { file: file, text: null };
      var data = state.importData; if (!data) return; var ticket = ++sequence; busy(true); state.error = null;
      state.feedback = 'Wczytywanie kopii biblioteki…'; render();
      try {
        var limit = state.capability && state.capability.maxImportBytes;
        if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Odśwież aplikację, aby sprawdzić plik biblioteki.');
        if (typeof data.file.size !== 'number' || data.file.size > limit) throw new Error('Plik biblioteki przekracza obsługiwany rozmiar.');
        if (data.text === null) data.text = await data.file.text();
        if (!current() || ticket !== sequence || state.importData !== data) return;
        var result = await vault.importCarePlanTemplateLibrary(data.text);
        if (!current() || ticket !== sequence || state.importData !== data) return;
        if (!result || result.saved !== true) throw new Error('Nie można jeszcze potwierdzić całego importu. Wybrany plik i szkic pozostają zachowane; możesz ponowić import.');
        state.importData = null; state.feedback = result.persistence === 'remote' ? 'Zaimportowano bibliotekę.' : 'Zaimportowano bibliotekę na tym urządzeniu.';
        busy(false); render(); await refresh();
      } catch (error) { if (current() && ticket === sequence) { state.feedback = ''; fail(error); } }
      finally { if (current() && ticket === sequence) { busy(false); render(); } }
    }
    function saveDraft() {
      if (!current() || state.busy || state.uncertain || state.blockedConflict || !canSave() || !validate('all')) return;
      if (state.privacyRequired && state.reviewedText !== model.reviewTextKey(state.draft)) { state.wizardStep = 3; fail(new Error('Sprawdź wszystkie nazwy i potwierdź usunięcie informacji dotyczących pacjenta.')); render(); return; }
      var canonical = model.canonicalDefinition(state.draft);
      if (!canonical.ok) { state.issues = canonical.issues || []; render(); return; }
      mutate('save', { templateId: state.templateId, operationId: state.operationId, baseToken: state.baseToken, definition: canonical.definition });
    }
    function renderFooter() {
      if (!current()) return; clear(footer); if (state.confirmation) return;
      var status = node('p', 'vcp-help'); status.textContent = state.view === 'wizard' && state.draft ? structureCount(state.draft.stages.length, state.draft.steps.length) + (state.dirty ? ' · Zmiany niezapisane' : '') : capabilityText(); footer.appendChild(status);
      var actions = node('div', 'vct-footer-actions');
      if (state.pending) {
        actions.appendChild(button('Sprawdź wynik zapisu', 'vcp-outline', checkOutcome)); actions.appendChild(button('Ponów zapis', 'vcp-primary', function () { mutate(null, null, true); }));
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
        if (state.view === 'library') {
          var exportButton = button('Eksportuj', 'vcp-text', function () { ask('Kopia biblioteki', 'Plik wymaga tego samego konta i klucza szyfrowania. Zachowaj również pełny kod synchronizacji tego konta; nowy profil o tej samej nazwie nie wystarczy do odtworzenia biblioteki.', exportLibrary); }, 'Eksportuj bibliotekę'); exportButton.disabled = state.busy || !state.capability || state.capability.readable !== true; actions.appendChild(exportButton);
          var importButton = button('Importuj', 'vcp-text', function () { ask('Import biblioteki', 'Ta kopia wymaga tego samego konta i klucza szyfrowania. W razie odtwarzania przywróć pełny kod synchronizacji właściwego konta.', function () { importPicker.value = ''; importPicker.click(); render(); }); }, 'Importuj bibliotekę'); importButton.disabled = state.busy || !canSave(); actions.appendChild(importButton);
          if (state.importData) actions.appendChild(button('Ponów import', 'vcp-outline', function () { importLibrary(); }));
        }
        actions.appendChild(button('Odśwież', 'vcp-text', refresh, 'Odśwież bibliotekę'));
      }
      Array.from(actions.querySelectorAll('button')).forEach(function (item) { if (state.busy) item.disabled = true; }); footer.appendChild(actions);
    }
    function requestClose() {
      if (state.busy) return;
      if (state.confirmation) { state.confirmation = null; render(); return; }
      if (state.draft && state.dirty || state.pending) ask('Zamknąć bibliotekę?', state.pending ? 'Nie potwierdzono jeszcze wyniku zapisu. Wpisana treść zostanie zamknięta; możesz najpierw sprawdzić wynik.' : 'Niezapisane zmiany w szkicu zostaną odrzucone.', destroy);
      else destroy();
    }
    function changed() { if (!current()) return; if (state.view === 'wizard' || state.busy || state.pending) { state.stale = true; return; } if (timer) win.clearTimeout(timer); timer = win.setTimeout(function () { timer = null; refresh(); }, 80); }
    function destroy() {
      if (destroyed) return; destroyed = true; sequence += 1; if (timer) win.clearTimeout(timer); if (lifecycle) lifecycle.disconnect();
      unsubscribe.forEach(function (fn) { if (typeof fn === 'function') fn(); }); doc.removeEventListener('vilda:sync-merged', changed);
      objectURLs.forEach(function (url) { if (win.URL) win.URL.revokeObjectURL(url); }); objectURLs.clear();
      state.draft = null; state.pending = null; state.importData = null; state.items = []; state.selected = null; state.revisions = []; state.reviewedText = null; fields.clear(); root.remove();
      if (options.onBusy) options.onBusy(false, false); if (options.onClose) options.onClose();
    }
    unsubscribe.push(observe(vault, changed, destroy)); doc.addEventListener('vilda:sync-merged', changed);
    if (typeof win.MutationObserver === 'function') { lifecycle = new win.MutationObserver(function () { if (!current()) destroy(); }); lifecycle.observe(doc.body, { childList: true, subtree: true }); }
    var controller = { refresh: refresh, destroy: destroy, requestClose: requestClose, create: function () { abandonThen(beginNew); }, copyFromPlan: copyFromPlan, open: readTemplate, exportLibrary: exportLibrary, importLibrary: importLibrary,
      isEditing: function () { return !!state.draft || state.busy; }, getContext: function () { return { view: state.view, templateId: state.templateId, wizardStep: state.wizardStep }; } };
    if (options.onBusy) options.onBusy(false, true); render();
    Promise.resolve(refresh()).then(function () { if (current() && options.sourcePlanId) return copyFromPlan(options.sourcePlanId); }); return controller;
  }
  function open(options) {
    options = options || {}; var doc = win.document, origin = doc.activeElement, dialog = doc.createElement('dialog'); dialog.className = 'vcp vct-dialog';
    dialog.setAttribute('aria-label', 'Moje szablony'); doc.body.appendChild(dialog);
    var cleanup = null, controller, closed = false;
    function closedDialog() { if (closed) return; closed = true; var removePrivacy = cleanup; cleanup = null; if (removePrivacy) removePrivacy(); if (dialog.open) dialog.close(); dialog.remove(); if (origin && origin.isConnected && origin.focus) origin.focus({ preventScroll: true }); if (options.onClose) options.onClose(); }
    try {
      controller = mount(dialog, Object.assign({}, options, { onClose: closedDialog }));
      if (options.onDialog) cleanup = options.onDialog(dialog); dialog.addEventListener('cancel', function (event) { event.preventDefault(); controller.requestClose(); }); dialog.showModal();
      var first = dialog.querySelector('.vcp-search'); if (first) first.focus({ preventScroll: true }); return controller;
    } catch (error) { if (controller) controller.destroy(); else { closedDialog(); if (options.onBusy) options.onBusy(false, false); } throw error; }
  }
  win.VildaCareTemplates = Object.freeze({ mount: mount, open: open });
})(typeof window !== 'undefined' ? window : null);
