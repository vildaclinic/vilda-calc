/* Plany opieki — patient-owned plans and parallel steps.
 * Rendering only. All writes go through the guarded encrypted vault API.
 */
(function (win) {
  'use strict';
  if (!win || !win.document) return;
  var serial = 0, vaultObservers = new WeakMap(), templateCorePromise = null, templateUiPromise = null;
  function templateAsset(path, ready, stylesheet) {
    if (ready && ready()) return Promise.resolve();
    var doc = win.document;
    if (stylesheet && doc.querySelectorAll) {
      var existing = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).find(function (link) { return link.getAttribute('href') === path; });
      if (existing && (existing.sheet || existing.getAttribute('data-vct-loaded') === 'true')) return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var element = doc.createElement(stylesheet ? 'link' : 'script');
      if (stylesheet) { element.rel = 'stylesheet'; element.href = path; }
      else { element.src = path; element.async = false; }
      element.onload = function () {
        if (ready && !ready()) { element.remove(); reject(new Error('Nie udało się wczytać biblioteki szablonów. Odśwież aplikację.')); return; }
        element.setAttribute('data-vct-loaded', 'true'); resolve();
      };
      element.onerror = function () { element.remove(); reject(new Error('Nie udało się wczytać biblioteki szablonów. Spróbuj ponownie.')); };
      (doc.head || doc.body || doc.documentElement).appendChild(element);
    });
  }
  function ensureTemplateLibrary(options) {
    if (!templateCorePromise) templateCorePromise = templateAsset('vilda_care_template_model.js?v=3', function () { return !!win.VildaCareTemplateModel; })
      .then(function () { return templateAsset('vilda_care_template_store.js?v=2', function () { return !!win.VildaCareTemplateStore; }); })
      .catch(function (error) { templateCorePromise = null; throw error; });
    if (options && options.ui === false) return templateCorePromise;
    if (!templateUiPromise) templateUiPromise = templateCorePromise
      .then(function () {
        // A live vault session may still hold the earlier model instance. Do
        // not replace that reader underneath its encrypted library context.
        if (win.VildaCareTemplateModel.CONTENT_VERSION !== 2) throw new Error('Aby używać importu i eksportu szablonów, odśwież aplikację. Zaktualizuj ją także na pozostałych urządzeniach.');
      })
      .then(function () { return templateAsset('vilda_care_template_transfer.js?v=1', function () { return !!win.VildaCareTemplateTransfer; }); })
      .then(function () { return Promise.all([
      templateAsset('vilda_care_templates.css?v=4', null, true),
      templateAsset('vilda_care_templates.js?v=6', function () { return !!win.VildaCareTemplates; })
    ]); }).catch(function (error) { templateUiPromise = null; throw error; });
    return templateUiPromise;
  }
  async function openTemplates(options) {
    options = options || {}; var vault = options.vault || win.VildaVault, owner = vault && vault.getCurrentUser && vault.getCurrentUser(), ownerId = owner && owner.userId, valid = true;
    function current() { var user = vault && vault.getCurrentUser && vault.getCurrentUser(); return valid && vault && vault.isUnlocked() && ownerId && user && user.userId === ownerId && (!options.isCurrent || options.isCurrent()); }
    if (!current()) return null;
    var stop = observeVault(vault, function () {}, function () { valid = false; });
    try { await ensureTemplateLibrary(); if (!current()) return null; return win.VildaCareTemplates.open(Object.assign({}, options, { vault: vault })); }
    finally { stop(); }
  }
  // Legacy vault hooks do not return unsubscribe functions. Subscribe once per
  // vault and keep only live views in this module-owned registry.
  function observeVault(vault, change, lock) {
    if (!vault) return function () {};
    var listeners = vaultObservers.get(vault);
    if (!listeners) {
      listeners = new Set(); vaultObservers.set(vault, listeners);
      var changed = function () { Array.from(listeners).forEach(function (listener) { listener.change(); }); };
      ['onPatientNoteChanged', 'onPatientSaved', 'onPatientDeleted'].forEach(function (key) { if (typeof vault[key] === 'function') vault[key](changed); });
      if (typeof vault.onLock === 'function') vault.onLock(function () { Array.from(listeners).forEach(function (listener) { listener.lock(); }); });
    }
    var listener = { change: change, lock: lock }; listeners.add(listener);
    return function () { listeners.delete(listener); };
  }
  var KINDS = ['Badanie', 'Kontrola', 'Konsultacja', 'Hospitalizacja', 'Dokumentacja', 'Skierowanie', 'Kontakt', 'Inny krok', 'Oczekujący wynik'];
  function today() {
    var value = new Date();
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }
  function day(value) { return typeof value === 'string' ? value.slice(0, 10) : ''; }
  function date(value) { var valueDay = day(value); return /^\d{4}-\d{2}-\d{2}$/.test(valueDay) ? valueDay.split('-').reverse().join('.') : 'Bez terminu'; }
  function daysLate(value) {
    var valueDay = day(value);
    return valueDay ? Math.max(0, Math.round((Date.parse(today() + 'T12:00:00Z') - Date.parse(valueDay + 'T12:00:00Z')) / 86400000)) : 0;
  }
  function operationId() {
    if (win.crypto && typeof win.crypto.randomUUID === 'function') return win.crypto.randomUUID();
    var bytes = new Uint8Array(16); win.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  }
  function searchKey(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLocaleLowerCase('pl'); }
  function patientName(record) {
    var header = record && record.header || {};
    return header.name || [header.lastName, header.firstName].filter(Boolean).join(' ') || record && record.name || 'Pacjent';
  }
  var stagedViewCache = new WeakMap();
  function staged(plan) { return !!(plan && plan.careContext && plan.careContext.version === 2); }
  function stagedView(plan) {
    if (!staged(plan) || !win.VildaCarePlanModel) return null;
    var dayNow = today(), cached = stagedViewCache.get(plan);
    if (cached && cached.rev === plan.rev && cached.context === plan.careContext && cached.day === dayNow) return cached.view;
    var model = win.VildaCarePlanModel, view = model.projectCarePlan(model.decodeCarePlanRecord(plan), { todayLocalDateISO: dayNow });
    // This cache is for display only. The guarded writer re-reads and validates
    // the full record, session and revision before accepting any operation.
    stagedViewCache.set(plan, { rev: plan.rev, context: plan.careContext, day: dayNow, view: view }); return view;
  }
  function stagedSteps(plan) { var view = stagedView(plan); return view && Array.isArray(view.stages) ? view.stages.flatMap(function (stage) { return stage.steps; }) : []; }
  function steps(plan) { return staged(plan) ? Array.isArray(plan.careContext.steps) ? plan.careContext.steps : [] : Array.isArray(plan && plan.steps) ? plan.steps : []; }
  function openSteps(plan) { return staged(plan) ? stagedSteps(plan).filter(function (step) { return step.progress !== 'resolved' && step.progress !== 'omitted'; }) : steps(plan).filter(function (step) { return step.state !== 'done' && step.state !== 'cancelled'; }); }
  function doneSteps(plan) { return staged(plan) ? stagedSteps(plan).filter(function (step) { return step.progress === 'resolved' || step.progress === 'omitted'; }) : steps(plan).filter(function (step) { return step.state === 'done'; }); }
  function closed(plan) { return staged(plan) ? plan.careContext.status === 'closed' : plan && plan.status === 'closed'; }
  function recordId(value) { return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(value); }
  function readablePlan(note, patientId) {
    var context = note && note.careContext;
    return !!(note && note.patientId === patientId && recordId(note.id) && note.category === 'care-plan'
      && typeof note.title === 'string' && note.title.trim() && context && context.version === 1 && context.role === 'plan'
      && Array.isArray(context.steps) && Array.isArray(context.log));
  }
  function nullableDate(value) {
    if (value === null) return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number), parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return parsed.getUTCFullYear() === parts[0] && parsed.getUTCMonth() === parts[1] - 1 && parsed.getUTCDate() === parts[2];
  }
  function nullableTime(value) { return value === null || typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
  function nullableInstant(value) { return value === null || typeof value === 'string' && nullableDate(value.slice(0, 10)) && isFinite(Date.parse(value)); }
  function reviewValue(key, value, stepId) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (key === 'metadata') return typeof value.title === 'string' && !!value.title.trim() && typeof value.goal === 'string';
    if (key === 'status') return ['active', 'closed'].includes(value.status) && nullableInstant(value.closedAtISO) && typeof value.closeReason === 'string' && typeof value.closeText === 'string';
    if (key === 'decision') return typeof value.needsDecision === 'boolean' && nullableDate(value.decisionDueDateISO);
    return key === 'step' && recordId(stepId) && value.id === stepId && typeof value.title === 'string' && !!value.title.trim()
      && typeof value.kind === 'string' && typeof value.description === 'string' && ['pending', 'waiting', 'done', 'cancelled'].includes(value.state)
      && ['reminderDateISO', 'eventDateISO', 'completedDateISO'].every(function (field) { return nullableDate(value[field]); })
      && ['reminderTime', 'eventTime'].every(function (field) { return nullableTime(value[field]); })
      && ['reminderNoteId', 'calendarNoteId', 'resultNoteId'].every(function (field) { return value[field] === null || recordId(value[field]); })
      && (value.completionSource === undefined || ['calendar', 'performance', 'result'].includes(value.completionSource));
  }
  function reviewComponents(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.components)) return [];
    return snapshot.components.filter(function (component) {
      return component && ['metadata', 'status', 'decision', 'step'].includes(component.key) && typeof component.projected === 'boolean'
        && reviewValue(component.key, component.current, component.stepId) && Array.isArray(component.variants) && !!component.variants.length
        && component.variants.every(function (variant) { return variant && recordId(variant.id) && typeof variant.selected === 'boolean' && reviewValue(component.key, variant.value, component.stepId); });
    });
  }
  function readableReview(snapshot) {
    var components = reviewComponents(snapshot);
    return components.length > 0 && components.length === snapshot.components.length;
  }
  function reviewStateSnapshot(value) {
    if (Array.isArray(value)) return value.map(reviewStateSnapshot);
    if (value && typeof value === 'object') {
      var sorted = Object.create(null);
      Object.keys(value).sort().forEach(function (key) { sorted[key] = reviewStateSnapshot(value[key]); });
      return sorted;
    }
    return value;
  }
  // This is a display projection only. Old clients need the complete plaintext
  // copies and document links in log; none of them may be removed from storage.
  function removedNotes(plan) { return new Set(Array.isArray(plan.removedNoteIds) && plan.removedNoteIds.every(recordId) ? plan.removedNoteIds : []); }
  function historyProjection(plan, reviewIds, noteEntries) {
    var result = { clinical: [], archived: [], currentFallbacks: [] }, entries = Array.isArray(plan.log) ? plan.log : [], resolved = new Set();
    var removed = removedNotes(plan), archivedRemoved = new Set();
    entries.forEach(function (entry) {
      var resolution = entry && entry.resolution;
      if (resolution && recordId(resolution.resolvedBy) && readableReview(resolution)) resolved.add(resolution.resolvedBy);
    });
    entries.forEach(function (entry) {
      if (!entry || typeof entry !== 'object') { result.clinical.push(entry); return; }
      if (removed.has(entry.noteId)) {
        var original = noteEntries && noteEntries.find(function (item) { return item.removed && item.noteId === entry.noteId && item.dateISO === entry.dateISO && item.text === entry.text; });
        if (original && !archivedRemoved.has(entry.noteId)) { result.archived.push({ entry: entry, includeText: true, removed: true, retainedNote: original.retainedNote }); archivedRemoved.add(entry.noteId); }
        return;
      }
      var fallback = recordId(entry.reviewFallbackFor);
      var automatic = entry.syncOrigin === 'summary' || entry.syncOrigin === 'alternative' || fallback;
      var acknowledgment = entry.resolution && recordId(entry.resolution.resolvedBy)
        && reviewIds && reviewIds.has(entry.resolution.resolvedBy)
        && !entry.noteId && !entry.resultNoteId && !entry.calendarDetach;
      // Alternative plaintext has no component/operation identity. A readable
      // current snapshot alone cannot prove it covers every older value.
      if (plan.syncNeedsReview && (entry.syncOrigin === 'alternative' || fallback && !resolved.has(entry.reviewFallbackFor))) result.currentFallbacks.push(entry);
      else if (automatic || acknowledgment) result.archived.push({ entry: entry, includeText: true });
      else result.clinical.push(entry);
      if (!automatic && !acknowledgment && entry.resolution && reviewComponents(entry.resolution).length) result.archived.push({ entry: entry, includeText: false });
    });
    return result;
  }
  function historyCount(count) {
    return count + ' ' + (count === 1 ? 'wpis' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'wpisy' : 'wpisów');
  }
  function currentSyncReview(note) {
    if (!note.careContext.syncNeedsReview || !win.VildaVault || typeof win.VildaVault.getCarePlanSyncReview !== 'function') return null;
    try { return win.VildaVault.getCarePlanSyncReview(note.careContext, note.title); } catch { return null; }
  }
  function calendarRelations(context, title, vault) {
    if (!vault || typeof vault.getCarePlanCalendarRelations !== 'function') return null;
    try {
      var value = vault.getCarePlanCalendarRelations(context, title);
      if (!value || value.version !== 1 || !Array.isArray(value.stepIds) || !value.stepIds.every(recordId)
        || !Array.isArray(value.historicalNoteIds) || !value.historicalNoteIds.every(recordId)
        || !['current', 'historical', 'detached'].every(function (key) { return Array.isArray(value[key]) && value[key].every(function (entry) { return entry && recordId(entry.noteId) && recordId(entry.stepId); }); })) return { known: false };
      var result = { known: true, stepIds: new Set(value.stepIds), historicalNoteIds: new Set(value.historicalNoteIds) };
      ['current', 'historical', 'detached'].forEach(function (key) { result[key] = new Set(value[key].map(function (entry) { return entry.noteId + ':' + entry.stepId; })); });
      return result;
    } catch { return { known: false }; }
  }
  function calendarRelation(relations, noteId, stepId) {
    if (!relations || !relations.known || !recordId(noteId) || !recordId(stepId)) return 'unknown';
    var key = noteId + ':' + stepId;
    if (relations.current.has(key)) return 'current';
    if (relations.detached.has(key)) return 'detached';
    if (relations.historical.has(key) || relations.stepIds.has(stepId) && relations.historicalNoteIds.has(noteId)) return 'historical';
    return 'unknown';
  }
  function patientPlans(notes, patientId, options) {
    var plans = new Map();
    (Array.isArray(notes) ? notes : []).forEach(function (note) {
      if (!readablePlan(note, patientId)) return;
      var reviews = reviewComponents(currentSyncReview(note));
      note.careContext.log.forEach(function (entry) { reviewComponents(entry && entry.resolution).forEach(function (component) { reviews.push(component); }); });
      plans.set(note.id, { context: note.careContext, reviews: reviews, calendarRelations: calendarRelations(note.careContext, note.title, win.VildaVault) });
    });
    // Native stage plans live outside the legacy patient-notes collection.
    // Accept only complete reader-valid records supplied by the caller's fresh
    // protected list read. This is routing metadata, never write authority.
    (options && Array.isArray(options.plans) ? options.plans : []).forEach(function (plan) {
      if (!plan || plan.patientId !== patientId || !recordId(plan.id) || plan.category !== 'care-plan' || !staged(plan)) return;
      var view = stagedView(plan); if (!view || view.kind !== 'v2') return;
      plans.set(plan.id, { context: plan.careContext, record: plan, staged: true });
    });
    return plans;
  }
  function stagedNoteReferences(plan, note) {
    var link = note.careContext && note.careContext.version === 2 ? note.careContext : null;
    if (link && link.role === 'plan') return plan.record.id === note.id;
    if (link && (link.planId !== plan.record.id || !['note', 'result', 'decision', 'calendar'].includes(link.role))) return false;
    var versions = [plan.record].concat((Array.isArray(plan.record.nativeConflicts) ? plan.record.nativeConflicts : []).map(function (state) { return state && state.record; }));
    return versions.some(function (record) {
      if (!record || record.id !== plan.record.id || record.patientId !== plan.record.patientId || !staged(record)) return false;
      var view = stagedView(record); if (!view || view.kind !== 'v2') return false;
      var context = record.careContext;
      function placement(stepId, stageId) {
        if (!link) return true;
        return (link.stepId || null) === (stepId || null) && (link.stageId || null) === (stageId || null);
      }
      function stepPlacement(stepId) { var step = context.steps.find(function (entry) { return entry.id === stepId; }); return !!step && placement(step.id, step.stageId); }
      return context.facts.some(function (fact) { return fact.evidence.noteId === note.id && stepPlacement(fact.stepId); })
        || context.associations.some(function (association) { return association.noteId === note.id && stepPlacement(association.stepId); })
        || context.log.some(function (entry) { return entry && Array.isArray(entry.documentIds) && entry.documentIds.includes(note.id) && placement(entry.stepId, entry.stageId); });
    });
  }
  function planReferences(plan, note) {
    var context = plan.context;
    var link = note.careContext;
    if (link.role === 'decision') return note.id === 'care-decision-' + link.planId;
    if (link.role === 'note') return context.log.some(function (entry) { return entry && (entry.noteId === note.id || entry.resultNoteId === note.id); });
    if (link.role === 'calendar' && plan.calendarRelations !== null) {
      var relation = calendarRelation(plan.calendarRelations, note.id, link.stepId);
      return relation === 'current' || relation === 'historical';
    }
    var field = { step: 'reminderNoteId', calendar: 'calendarNoteId', result: 'resultNoteId' }[link.role];
    return context.steps.some(function (step) { return step && step[field] === note.id && (!link.stepId || step.id === link.stepId); })
      || link.role === 'result' && context.log.some(function (entry) { return entry && (entry.noteId === note.id || entry.resultNoteId === note.id); })
      || link.role === 'calendar' && recordId(link.stepId) && context.steps.some(function (step) { return step && step.id === link.stepId; })
        && context.log.some(function (entry) { return entry && entry.noteId === note.id; })
      || plan.reviews.some(function (component) {
        return component.key === 'step' && (!link.stepId || component.stepId === link.stepId)
          && [component.current].concat(component.variants.map(function (variant) { return variant.value; })).some(function (value) { return value[field] === note.id; });
      });
  }
  function destination(plans, note, patientId) {
    var ordinary = { kind: 'notes', noteId: note && note.id || null }, context = note && note.careContext;
    if (note && note.patientId === patientId && recordId(note.id)) {
      var related = Array.from(plans.values()).filter(function (plan) { return plan.staged && stagedNoteReferences(plan, note); })
        .sort(function (left, right) { return left.record.id.localeCompare(right.record.id); });
      if (related.length) {
        var parent = related.find(function (plan) { return context && context.planId === plan.record.id; }) || related[0];
        return { kind: 'care', planId: parent.record.id, noteId: context && context.role === 'plan' && context.version === 2 ? null : note.id,
          role: context && context.version === 2 ? context.role : 'document', formatVersion: 2, readOnly: true,
          relatedPlans: related.map(function (plan) { return { planId: plan.record.id, title: plan.record.title }; }) };
      }
      if (context && context.version === 2) return Object.assign(ordinary, { formatVersion: 2, readOnly: true, unavailable: true });
    }
    if (!note || note.patientId !== patientId || !recordId(note.id) || !context || context.version !== 1) return ordinary;
    if (context.role === 'plan') return plans.has(note.id) && !plans.get(note.id).staged ? { kind: 'care', planId: note.id, noteId: null, role: 'plan' } : ordinary;
    if (!['step', 'decision', 'calendar', 'result', 'note'].includes(context.role) || !recordId(context.planId) || !plans.has(context.planId) || plans.get(context.planId).staged) return ordinary;
    if (!planReferences(plans.get(context.planId), note)) return ordinary;
    return { kind: context.role === 'calendar' ? 'calendar' : 'care', planId: context.planId,
      noteId: ['step', 'decision'].includes(context.role) ? null : note.id, role: context.role };
  }
  // A projection of the patient-card Notes tab only. Other views and sync keep
  // the complete original records. Orphaned/future metadata must remain readable.
  function projectPatientNotes(notes, patientId, options) {
    var source = Array.isArray(notes) ? notes : [], plans = patientPlans(source, patientId, options);
    return source.filter(function (note) { var target = destination(plans, note, patientId); return target.kind === 'notes' || target.formatVersion === 2; });
  }
  function resolveNoteDestination(notes, note, patientId, options) { return destination(patientPlans(notes, patientId, options), note, patientId); }
  function dueStep(plan) {
    if (staged(plan)) {
      var view = stagedView(plan), active = view && view.stages && view.stages.find(function (stage) { return stage.controlState === 'active'; });
      return active && active.steps.filter(function (step) { return !['resolved', 'omitted'].includes(step.progress); }).map(function (step) { return Object.assign({}, step, { reminderDateISO: step.reminderSchedule && step.reminderSchedule.dateISO }); }).sort(function (a, b) { return String(a.reminderDateISO || '9999').localeCompare(String(b.reminderDateISO || '9999')); })[0];
    }
    return openSteps(plan).slice().sort(function (a, b) { return String(a.reminderDateISO || '9999').localeCompare(String(b.reminderDateISO || '9999')); })[0];
  }
  function planState(plan) {
    if (staged(plan)) {
      var view = stagedView(plan), action = view && view.nextAction;
      if (!view || view.kind !== 'v2' || action && ['resolveConflict', 'reviewChangedStage'].includes(action.type)) return ['decision', 'Do przeglądu'];
      if (closed(plan)) return ['done', 'Zamknięty'];
      if (action && action.type === 'reviewStage') return ['decision', 'Etap do przeglądu'];
      if (action && action.type === 'decidePlan') return ['decision', 'Do ustalenia'];
      if (action && action.type === 'startStage') return ['planned', 'Etap do uruchomienia'];
      if (view.attentionItems.some(function (entry) { return entry.type === 'work'; })) return ['current', 'Do działania'];
      if (view.stages.some(function (stage) { return stage.controlState === 'active' && stage.steps.some(function (step) { return step.progress === 'waiting'; }); })) return ['waiting', 'Oczekuję na wynik'];
      return ['planned', 'Zaplanowany'];
    }
    if (plan.syncNeedsReview) return ['decision', 'Do przeglądu'];
    if (closed(plan)) return ['done', 'Zamknięty'];
    if (plan.needsDecision || !openSteps(plan).length) return ['decision', 'Do ustalenia'];
    if (openSteps(plan).some(function (step) { return step.state === 'pending' && step.reminderDateISO && day(step.reminderDateISO) <= today(); })) return ['current', 'Do działania'];
    if (openSteps(plan).some(function (step) { return step.state === 'waiting'; })) return ['waiting', 'Oczekuję na wynik'];
    return ['planned', 'Zaplanowany'];
  }
  function reviewExplanation(plan) {
    return plan.syncLineageUnknown
      ? 'Nie można potwierdzić, czy wszystkie zmiany pochodzą z tej samej historii planu. Zachowano dostępne kroki i ustalenia.'
      : 'Wykryto równoległe zmiany tego planu na kilku urządzeniach. Zachowano kroki i ustalenia z obu wersji.';
  }
  function mount(host, options) {
    options = options || {};
    var remindersLayout = options.remindersLayout === true;
    if (!host || !host.ownerDocument) throw new Error('Brak miejsca na widok planów opieki.');
    var doc = host.ownerDocument, vault = options.vault || win.VildaVault, destroyed = false, sequence = 0, refreshTimer = null;
    var account = vault && vault.getCurrentUser && vault.getCurrentUser(), accountId = account && account.userId;
    var state = { plans: [], patients: [], names: new Map(), selected: options.planId || null, filter: 'all', query: '', loading: false, busy: false, editing: false, detail: typeof options.detail === 'boolean' ? options.detail : !!(options.full && options.planId), stale: false, loaded: false, stagedCapability: null };
    var editor = null, unsubscribe = [], selectedOrigin = null, lifecycleObserver = null, templateView = null, templateReturn = null;
    var syncVersionState = new Map();
    var record = null, recordNoteId = null, recordStepId = null, recordError = null, recordRemoved = false, recordSequence = 0, selectionSequence = 0, recordOrigin = null, initialRecord = options.noteId || null;
    var omissionSnapshot = null, omissionSequence = 0, historySnapshot = null, historySequence = 0, archivePlanId = null, archiveOrigin = null;
    var noteEntriesSnapshot = null, noteEntriesSequence = 0, noteRemovalSequence = 0;
    function current() { var user = vault && vault.getCurrentUser && vault.getCurrentUser(); return !destroyed && host.isConnected && vault && vault.isUnlocked() && user && user.userId === accountId && (!options.isCurrent || options.isCurrent()); }
    function node(tag, className, text) { var element = doc.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; }
    function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    function button(text, className, action) { var element = node('button', className, text); element.type = 'button'; if (action) element.addEventListener('click', action); return element; }
    function name(plan) { return state.names.get(plan.patientId) || plan.patientName || 'Pacjent'; }
    function activePlan() { return state.plans.find(function (plan) { return plan.id === state.selected; }); }
    function busy(working, editing) { state.busy = working; if (editing !== undefined) state.editing = editing; root.setAttribute('aria-busy', String(working)); if (options.onBusy) options.onBusy(state.busy, state.editing); }
    function errorBox(error, target) {
      var box = node('div', 'vcp-error'); box.setAttribute('role', 'alert');
      box.appendChild(node('p', '', error && error.message || 'Nie udało się odczytać planów. Spróbuj ponownie.')); target.appendChild(box); return box;
    }
    function notify(message) { feedback.textContent = message; feedback.hidden = !message; }
    function badge(label, kind) { return node('span', 'vcp-status' + (kind ? ' vcp-status-' + kind : ''), label); }
    function planBadge(plan) { var value = planState(plan); return badge(value[1], value[0]); }
    function dateBadge(value) {
      var count = daysLate(value);
      if (count) return badge(count + (count === 1 ? ' dzień' : ' dni') + ' po terminie', count <= 3 ? 'near' : count <= 14 ? 'medium' : 'late');
      return badge(day(value) === today() ? 'Na dziś' : 'Zaplanowane', day(value) === today() ? 'near' : 'planned');
    }
    var root = node('section', 'vcp ' + (options.full ? 'vcp-full' : 'vcp-inline'));
    if (remindersLayout) root.classList.add('vcp-reminders-layout');
    root.setAttribute('aria-label', 'Plany opieki'); root.classList.toggle('vcp-show-detail', state.detail);
    var tools = node('div', 'vcp-tools');
    var createButton = button('+ Nowy plan', 'vcp-text vcp-create', create); createButton.setAttribute('aria-label', 'Nowy plan');
    if (options.showCreateButton !== false) { tools.appendChild(createButton); tools.appendChild(button('Moje szablony', 'vcp-text', function () { openTemplateLibrary(); })); root.appendChild(tools); }
    var feedback = node('div', 'vcp-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true; root.appendChild(feedback);
    var layout = node('div', 'vcp-layout'), left = node('section', 'vcp-list-pane'), fixed = node('div', 'vcp-list-fixed');
    var search = node('input', 'vcp-search'); search.type = 'search'; search.placeholder = 'Szukaj pacjenta lub planu…'; search.setAttribute('aria-label', 'Szukaj pacjenta lub planu');
    search.addEventListener('input', function () { state.query = search.value; renderList(); }); fixed.appendChild(search);
    var filters = node('nav', 'vcp-filters'); filters.setAttribute('aria-label', 'Filtry planów opieki'); fixed.appendChild(filters); left.appendChild(fixed);
    var list = node('div', 'vcp-list'); list.setAttribute('aria-label', 'Lista planów opieki'); left.appendChild(list); layout.appendChild(left);
    var templateEntry = null, templateButton = null, filterReset = null, clearFiltersButton = null;
    if (remindersLayout) {
      list.tabIndex = -1;
      templateEntry = node('div', 'vcp-template-entry');
      templateButton = button('Moje szablony', 'vcp-text vcp-template-button', function () {
        if (!current() || state.editing || state.busy) return;
        if (typeof options.openTemplates === 'function') options.openTemplates(); else openTemplateLibrary();
      });
      templateEntry.appendChild(templateButton);
      filterReset = node('div', 'vcp-filter-reset');
      clearFiltersButton = button('Wyczyść filtry', 'vcp-text vcp-clear-filters', function () {
        if (!current() || state.editing || state.busy) return;
        state.query = ''; search.value = ''; state.filter = 'all'; render();
        list.focus({ preventScroll: true });
      });
      filterReset.appendChild(clearFiltersButton);
    }
    var detail = node('section', 'vcp-detail'); detail.setAttribute('aria-label', 'Szczegóły planu'); if (options.full) layout.appendChild(detail); root.appendChild(layout);
    if (remindersLayout) root.appendChild(feedback);
    host.appendChild(root);
    var filterLabels = [['all', 'Otwarte'], ['needs', 'Do działania'], ['waiting', 'Oczekuję'], ['closed', 'Zamknięte']];
    function matchFilter(plan, key) {
      if (staged(plan)) {
        var view = stagedView(plan), action = view && view.nextAction;
        if (key === 'closed') return closed(plan);
        if (closed(plan)) return false;
        if (key === 'needs') return !!(action && action.type !== 'startStage') || !!(view && view.attentionItems.some(function (entry) { return entry.type === 'work'; }));
        if (key === 'waiting') return !!(view && view.stages && view.stages.some(function (stage) { return stage.controlState === 'active' && stage.steps.some(function (step) { return step.progress === 'waiting'; }); }));
        return true;
      }
      if (key === 'closed') return closed(plan);
      if (key === 'needs' && plan.syncNeedsReview) return true;
      if (closed(plan)) return false;
      if (key === 'needs') return plan.needsDecision || !openSteps(plan).length || openSteps(plan).some(function (step) { return step.state === 'pending' && step.reminderDateISO && day(step.reminderDateISO) <= today(); });
      if (key === 'waiting') return openSteps(plan).some(function (step) { return step.state === 'waiting'; });
      return true;
    }
    function visible() {
      var query = searchKey(state.query.trim());
      return state.plans.filter(function (plan) { return matchFilter(plan, state.filter) && (!query || searchKey(name(plan) + ' ' + plan.title + ' ' + steps(plan).map(function (step) { return step.title; }).join(' ')).includes(query)); });
    }
    function renderFilters() {
      clear(filters); filterLabels.forEach(function (entry) {
        var item = button('', state.filter === entry[0] ? 'is-active' : '', function () { if (state.editing || state.busy) return; state.filter = entry[0]; render(); });
        item.appendChild(node('span', '', entry[1])); var count = state.plans.filter(function (plan) { return matchFilter(plan, entry[0]); }).length;
        item.appendChild(node('span', 'vcp-count', String(count))); item.setAttribute('aria-label', entry[1] + ', liczba planów: ' + count); item.setAttribute('aria-pressed', String(state.filter === entry[0])); item.disabled = state.editing || state.busy; filters.appendChild(item);
      });
    }
    function renderList() {
      var scroll = list.scrollTop, restoreTemplateFocus = templateButton && doc.activeElement === templateButton; clear(list);
      if (templateEntry) {
        templateButton.disabled = state.editing || state.busy;
        list.appendChild(templateEntry);
        if (restoreTemplateFocus && !templateButton.disabled) templateButton.focus({ preventScroll: true });
      }
      if (filterReset && (state.query.trim() || state.filter !== 'all')) {
        clearFiltersButton.disabled = state.editing || state.busy;
        list.appendChild(filterReset);
      }
      if (state.loading && !state.loaded) { var loading = node('p', 'vcp-empty', 'Wczytywanie planów…'); loading.setAttribute('role', 'status'); list.appendChild(loading); return; }
      var plans = visible();
      if (!state.selected || !state.plans.some(function (plan) { return plan.id === state.selected; })) { resetRecord(); archivePlanId = null; archiveOrigin = null; state.selected = plans[0] && plans[0].id || null; }
      plans.forEach(function (plan) {
        var row = button('', 'vcp-row' + (state.selected === plan.id ? ' is-selected' : ''), function () { select(plan.id); }); row.dataset.planId = plan.id;
        row.appendChild(node('span', 'vcp-patient', name(plan))); row.appendChild(node('span', 'vcp-row-title', plan.title));
        var next = dueStep(plan), due = plan.needsDecision ? plan.decisionDueDateISO : next && next.reminderDateISO;
        var meta = node('span', 'vcp-row-meta'); meta.appendChild(node('span', 'vcp-date', date(closed(plan) ? staged(plan) ? plan.careContext.closedAtISO : plan.closedAtISO : due)));
        meta.appendChild(plan.syncNeedsReview || closed(plan) ? planBadge(plan) : due && day(due) <= today() ? dateBadge(due) : planBadge(plan)); row.appendChild(meta);
        var stageView = stagedView(plan), stageAction = stageView && stageView.nextAction;
        var nextText = staged(plan) ? closed(plan) ? 'Zamknięto: ' + (plan.careContext.closeReason || '') : stageAction && stageAction.type === 'startStage' ? 'Uruchom etap: ' + (stageView.stages.find(function (stage) { return stage.id === stageAction.stageId; }) || {}).title : stageAction && stageAction.type === 'reviewStage' ? 'Potwierdź przegląd zakończonego etapu' : stageAction && ['resolveConflict', 'reviewChangedStage'].includes(stageAction.type) ? 'Plan wymaga sprawdzenia zachowanych danych' : next ? next.title : 'Dalsze postępowanie do ustalenia' : plan.syncNeedsReview ? (closed(plan) ? 'Plan zamknięty · ' : '') + 'Sprawdź zachowane kroki i ustalenia po synchronizacji' : closed(plan) ? 'Zamknięto: ' + (plan.closeReason || '') : plan.needsDecision || !next ? 'Dalsze postępowanie do ustalenia' : next.title;
        row.appendChild(node('span', 'vcp-row-next', nextText));
        row.appendChild(node('span', 'vcp-row-progress', doneSteps(plan).length + ' z ' + steps(plan).length + (staged(plan) ? ' kroków rozstrzygniętych' : ' kroków zakończonych')));
        row.setAttribute('aria-current', String(state.selected === plan.id)); row.disabled = state.editing || state.busy; list.appendChild(row);
      });
      if (!plans.length) list.appendChild(node('p', 'vcp-empty', state.plans.length ? 'Brak planów w tym widoku. Zmień filtr lub wyszukiwanie.' : 'Nie masz jeszcze planów opieki. Dodaj pierwszy plan dla pacjenta.'));
      list.scrollTop = scroll;
    }
    function render() { if (!current()) return; createButton.disabled = state.busy || state.editing; search.disabled = state.busy || state.editing; renderFilters(); renderList(); if (!state.editing) renderDetail(); }
    async function select(planId, noteId) {
      var selection = ++selectionSequence; initialRecord = null;
      if (!state.loaded && current()) await refresh();
      if (!state.loaded || selection !== selectionSequence) return;
      if (!current() || state.editing || state.busy) return;
      if (!options.full && options.requestExpand) { options.requestExpand(planId, false, noteId || null); return; }
      if (templateReturn && templateReturn.planId !== planId) templateReturn = null;
      resetRecord(); archivePlanId = null; archiveOrigin = null;
      selectedOrigin = { scrollTop: list.scrollTop, query: state.query, filter: state.filter, id: planId };
      state.selected = planId; if (closed(activePlan())) state.filter = 'closed'; state.detail = true; root.classList.add('vcp-show-detail'); render(); detail.scrollTop = 0;
      var back = detail.querySelector('.vcp-back'); if (back && mobile()) back.focus({ preventScroll: true });
      await Promise.all([loadOmissions(activePlan()), loadHistoryClassification(activePlan()), loadNoteEntries(activePlan())]);
      if (selection !== selectionSequence || !current() || state.selected !== planId) return;
      if (noteId) await openRecord(noteId);
    }
    function mobile() { return win.document.documentElement.classList.contains('vilda-phone') || !!(win.matchMedia && win.matchMedia('(max-width:700px)').matches); }
    function back() {
      if (state.editing || state.busy) return;
      if (templateReturn && templateReturn.planId === state.selected) { openTemplateLibrary(null, { navigationContext: templateReturn.context }); return; }
      state.detail = false; root.classList.remove('vcp-show-detail');
      if (options.onReturnToReminders && options.onReturnToReminders() === true) return;
      if (selectedOrigin) { state.filter = selectedOrigin.filter; state.query = selectedOrigin.query; search.value = state.query; } render();
      if (selectedOrigin) list.scrollTop = selectedOrigin.scrollTop;
      var row = Array.from(list.querySelectorAll('[data-plan-id]')).find(function (item) { return item.dataset.planId === state.selected; }); if (row) row.focus({ preventScroll: true });
    }
    function openPatient(plan, noteId) { if (!state.editing && !state.busy && options.openPatient) options.openPatient(plan.patientId, noteId || null); }
    function resetRecord() { recordSequence += 1; record = null; recordNoteId = null; recordStepId = null; recordError = null; recordRemoved = false; recordOrigin = null; }
    function omissionFor(plan, step) {
      return omissionSnapshot && omissionSnapshot.planId === plan.id && omissionSnapshot.rev === plan.rev
        && omissionSnapshot.omissions && Object.prototype.hasOwnProperty.call(omissionSnapshot.omissions, step.id) && omissionSnapshot.omissions[step.id] || null;
    }
    function confirmedOmission(value) {
      return !!(value && value.protected === true && value.confirmed === true && value.reasonAvailable === true
        && recordId(value.noteId) && typeof value.reason === 'string' && value.reason.trim()
        && typeof value.dateISO === 'string' && nullableDate(value.dateISO));
    }
    async function loadOmissions(plan) {
      var ticket = ++omissionSequence; omissionSnapshot = null;
      if (staged(plan)) return;
      if (!plan || !current() || typeof vault.getCarePlanStepOmissions !== 'function' || !steps(plan).some(function (step) { return step.state === 'cancelled'; })) return;
      try {
        var value = await vault.getCarePlanStepOmissions(plan.id);
        if (!current() || ticket !== omissionSequence || state.selected !== plan.id || !activePlan() || activePlan().rev !== plan.rev) return;
        if (value && value.planId === plan.id && value.rev === plan.rev && value.omissions && typeof value.omissions === 'object' && !Array.isArray(value.omissions)) omissionSnapshot = value;
      } catch { /* A missing proof keeps the neutral cancelled label. */ }
      if (current() && ticket === omissionSequence && !state.editing && !state.busy) renderDetail();
    }
    function historyLogKey(plan) { return JSON.stringify(reviewStateSnapshot(plan && plan.log)); }
    function noteEntriesFor(plan) {
      return noteEntriesSnapshot && noteEntriesSnapshot.planId === plan.id && noteEntriesSnapshot.patientId === plan.patientId
        && noteEntriesSnapshot.rev === plan.rev && noteEntriesSnapshot.logKey === historyLogKey(plan) ? noteEntriesSnapshot.entries : null;
    }
    async function readNoteEntries(plan) {
      if (typeof vault.getCarePlanNoteEntries !== 'function' || !win.crypto || !win.crypto.subtle) return null;
      var logKey = historyLogKey(plan);
      var result = await Promise.all([vault.getCarePlanNoteEntries(plan.id), win.crypto.subtle.digest('SHA-256', new TextEncoder().encode(logKey))]);
      if (!current()) return null;
      var value = result[0], digest = Array.from(new Uint8Array(result[1])).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
      if (!value || value.planId !== plan.id || value.patientId !== plan.patientId || !Number.isSafeInteger(value.rev) || value.rev < 0
        || typeof value.logDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.logDigest) || !Array.isArray(value.entries)
        || !Array.isArray(value.removedNoteIds) || !value.removedNoteIds.every(recordId)) return null;
      var ids = new Set(), removed = new Set(value.removedNoteIds);
      if (!value.entries.every(function (entry) {
        if (!entry || !recordId(entry.noteId) || ids.has(entry.noteId) || typeof entry.removable !== 'boolean' || typeof entry.removed !== 'boolean'
          || entry.removed !== removed.has(entry.noteId) || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 20000
          || typeof entry.dateISO !== 'string' || !nullableDate(entry.dateISO)
          || entry.removable && (entry.removed || !Number.isSafeInteger(entry.linkedRev) || entry.linkedRev < 0 || typeof entry.readToken !== 'string' || !/^[a-f0-9]{64}$/.test(entry.readToken))) return false;
        ids.add(entry.noteId); return true;
      })) return null;
      return { planId: value.planId, patientId: value.patientId, rev: value.rev, logKey: logKey, matches: value.rev === plan.rev && value.logDigest === digest,
        removedNoteIds: value.removedNoteIds.slice(), entries: value.entries.map(function (entry) {
          var copied = Object.assign({}, entry), retained = entry.retainedNote;
          copied.retainedNote = entry.removed && retained && retained.id === entry.noteId && retained.patientId === plan.patientId
            && typeof retained.title === 'string' && typeof retained.body === 'string' ? Object.assign({}, retained) : null;
          return copied;
        }) };
    }
    async function loadNoteEntries(plan) {
      var ticket = ++noteEntriesSequence, selection = selectionSequence; noteEntriesSnapshot = null;
      if (staged(plan)) return;
      if (!plan || !current() || typeof vault.getCarePlanNoteEntries !== 'function') return;
      var logKey = historyLogKey(plan);
      try {
        var snapshot = await readNoteEntries(plan);
        if (!current() || ticket !== noteEntriesSequence || selection !== selectionSequence || state.selected !== plan.id
          || !activePlan() || activePlan().rev !== plan.rev || historyLogKey(activePlan()) !== logKey) return;
        if (snapshot && snapshot.matches) noteEntriesSnapshot = snapshot;
      } catch { /* An unavailable proof never grants a removal control. */ }
      if (current() && ticket === noteEntriesSequence && selection === selectionSequence && !state.editing && !state.busy) renderDetail();
    }
    function removableNote(plan, entry) {
      var entries = noteEntriesFor(plan);
      return !plan.syncNeedsReview && entries && entries.find(function (item) { return item.removable && !item.removed && item.noteId === entry.noteId && item.text === entry.text && item.dateISO === entry.dateISO; });
    }
    function historyReviewIds(plan) {
      return historySnapshot && historySnapshot.planId === plan.id && historySnapshot.patientId === plan.patientId
        && historySnapshot.rev === plan.rev && historySnapshot.logKey === historyLogKey(plan) ? historySnapshot.reviewIds : null;
    }
    async function loadHistoryClassification(plan) {
      var ticket = ++historySequence, selection = selectionSequence;
      if (staged(plan)) return;
      if (!plan || !current() || historyReviewIds(plan)) return;
      historySnapshot = null;
      if (typeof vault.getPatientNote !== 'function' || !Number.isSafeInteger(plan.rev)
        || !(Array.isArray(plan.log) ? plan.log : []).some(function (entry) { return entry && entry.resolution && recordId(entry.resolution.resolvedBy) && !entry.noteId && !entry.resultNoteId && !entry.calendarDetach; })) return;
      var logKey = historyLogKey(plan);
      try {
        var original = await vault.getPatientNote(plan.id);
        if (!current() || ticket !== historySequence || selection !== selectionSequence || state.selected !== plan.id
          || !activePlan() || activePlan().rev !== plan.rev || historyLogKey(activePlan()) !== logKey) return;
        if (!readablePlan(original, plan.patientId) || original.id !== plan.id || original.rev !== plan.rev || original.title !== plan.title
          || JSON.stringify(reviewStateSnapshot(original.careContext.log)) !== logKey) return;
        var lineage = original.careContext.causality;
        if (!lineage || lineage.version !== 1 || !Array.isArray(lineage.nodes)) return;
        var nodeIds = new Set(), reviewIds = new Set();
        if (!lineage.nodes.every(function (entry) {
          if (!entry || !recordId(entry.id) || nodeIds.has(entry.id) || !Array.isArray(entry.parents) || !entry.parents.every(recordId)
            || entry.review !== undefined && typeof entry.review !== 'boolean') return false;
          nodeIds.add(entry.id); if (entry.review === true) reviewIds.add(entry.id); return true;
        }) || !lineage.nodes.every(function (entry) { return entry.parents.every(function (id) { return nodeIds.has(id) && id !== entry.id; }); })) return;
        historySnapshot = { planId: plan.id, patientId: plan.patientId, rev: plan.rev, logKey: logKey, reviewIds: reviewIds };
      } catch { /* An uncertain read keeps the original entry in the clinical history. */ }
      if (current() && ticket === historySequence && selection === selectionSequence && !state.editing && !state.busy) renderDetail();
    }
    function referencedResultStep(plan, noteId) {
      var match = steps(plan).find(function (step) { return step.resultNoteId === noteId; });
      if (match) return match.id;
      var reviews = reviewComponents(plan.syncReview);
      (Array.isArray(plan.log) ? plan.log : []).forEach(function (entry) { reviewComponents(entry && entry.resolution).forEach(function (component) { reviews.push(component); }); });
      var component = reviews.find(function (entry) { return entry.key === 'step' && [entry.current].concat(entry.variants.map(function (variant) { return variant.value; })).some(function (value) { return value.resultNoteId === noteId; }); });
      return component && component.stepId || null;
    }
    function returnToPlan() {
      var origin = recordOrigin; resetRecord();
      if (origin && !origin.archive) { archivePlanId = null; archiveOrigin = null; }
      renderDetail();
      if (origin) {
        detail.scrollTop = origin.scrollTop;
        var candidates = Array.from(detail.querySelectorAll('[data-record-id]'));
        var button = candidates[origin.linkIndex];
        if (!button || button.dataset.recordId !== origin.id) button = candidates.find(function (entry) { return entry.dataset.recordId === origin.id; });
        if (button) button.focus({ preventScroll: true });
      }
    }
    async function openRecord(noteId, refreshing, stepId, source) {
      var plan = activePlan();
      if (!current() || state.editing || state.busy || !plan || !recordId(noteId)) return;
      if (!options.full && options.requestExpand) { options.requestExpand(plan.id, false, noteId); return; }
      if (!refreshing) recordOrigin = { scrollTop: detail.scrollTop, id: noteId, archive: archivePlanId === plan.id,
        linkIndex: source ? Array.from(detail.querySelectorAll('[data-record-id]')).indexOf(source) : -1 };
      var ticket = ++recordSequence, planId = plan.id, patientId = plan.patientId;
      recordStepId = stepId || referencedResultStep(plan, noteId);
      recordNoteId = noteId; record = null; recordError = null; recordRemoved = removedNotes(plan).has(noteId); renderDetail();
      if (!refreshing) detail.scrollTop = 0;
      if (recordRemoved) return;
      try {
        if (staged(plan)) {
          var freshPlan = await vault.getCarePlan(planId);
          if (!current() || ticket !== recordSequence || state.selected !== planId || recordNoteId !== noteId) return;
          var retainedPlans = freshPlan && freshPlan.patientId === patientId && freshPlan.id === planId && staged(freshPlan)
            ? [freshPlan].concat((freshPlan.nativeConflicts || []).map(function (version) { return version && version.record; })) : [];
          var referenced = false, capturedRevisions = [];
          retainedPlans.forEach(function (version) {
            if (!version || version.id !== planId || version.patientId !== patientId || !staged(version)) return;
            var projected = stagedView(version), context = version.careContext;
            if (!projected || projected.kind !== 'v2') return;
            context.facts.forEach(function (fact) { if (fact.evidence.noteId === noteId) { referenced = true; capturedRevisions.push(fact.evidence.sourceRecordRevAtCapture); } });
            context.associations.forEach(function (association) { if (association.noteId === noteId) { referenced = true; capturedRevisions.push(association.sourceRecordRevAtCapture); } });
            if (context.log.some(function (entry) { return entry.documentIds.includes(noteId); })) referenced = true;
          });
          if (!referenced) throw new Error('Ten dokument nie jest już powiązany z planem. Wróć do planu i odśwież widok.');
          var stagedOriginal = await vault.getPatientNote(noteId);
          if (!current() || ticket !== recordSequence || state.selected !== planId || recordNoteId !== noteId) return;
          if (!stagedOriginal || stagedOriginal.id !== noteId || stagedOriginal.patientId !== patientId) throw new Error('Dokument jest niedostępny. Sprawdź dokumentację pacjenta.');
          if (capturedRevisions.some(function (revision) { return revision !== stagedOriginal.rev; }))
            throw new Error('Dokument został zmieniony po powiązaniu z planem. Plan zachowuje odwołanie do wcześniejszej wersji, ale nie przechowuje jej treści. Bieżąca treść nie jest wyświetlana jako potwierdzenie tamtego wpisu. Sprawdź aktualną dokumentację w Karcie pacjenta.');
          record = stagedOriginal; renderDetail();
          if (!refreshing) { var stagedHeading = detail.querySelector('.vcp-record h2'); if (stagedHeading) stagedHeading.focus({ preventScroll: true }); }
          return;
        }
        if (noteId.indexOf('care-note-') === 0 && typeof vault.getCarePlanNoteEntries === 'function') {
          var noteState = await readNoteEntries(plan);
          if (!current() || ticket !== recordSequence || state.selected !== planId || recordNoteId !== noteId) return;
          if (noteState && noteState.removedNoteIds.indexOf(noteId) >= 0) { recordRemoved = true; renderDetail(); return; }
          if (!noteState || !noteState.matches) throw new Error('Nie można potwierdzić aktualnego stanu wpisu. Wróć do planu i odśwież widok.');
        }
        var scopedResult = recordStepId && typeof vault.getCarePlanResultReference === 'function';
        var reference = scopedResult ? await vault.getCarePlanResultReference({ planId: planId, stepId: recordStepId, noteId: noteId }) : null;
        var original = scopedResult ? reference && reference.note : await vault.getPatientNote(noteId);
        if (!current() || ticket !== recordSequence || state.selected !== planId || recordNoteId !== noteId) return;
        var context = original && original.careContext;
        if (!original || original.id !== noteId || original.patientId !== patientId || scopedResult && !['current', 'review', 'history'].includes(reference.relation)
          || !scopedResult && (!context || context.version !== 1 || context.planId !== planId || !['result', 'note', 'calendar'].includes(context.role))) throw new Error('Ten wpis jest niedostępny lub nie należy już do tego planu. Sprawdź dokumentację pacjenta.');
        if (!scopedResult && context.role === 'calendar' && typeof vault.getCarePlanCalendarRelations === 'function') {
          var parent = await vault.getPatientNote(planId);
          if (!current() || ticket !== recordSequence || state.selected !== planId || recordNoteId !== noteId) return;
          if (!parent || parent.id !== planId || !readablePlan(parent, patientId)) throw new Error('Ten wpis jest niedostępny lub nie należy już do tego planu. Sprawdź dokumentację pacjenta.');
          var relation = calendarRelation(calendarRelations(parent.careContext, parent.title, vault), original.id, context.stepId);
          if (relation !== 'current' && relation !== 'historical') throw new Error('Ten wpis jest niedostępny lub nie należy już do tego planu. Sprawdź dokumentację pacjenta.');
        }
        record = original; renderDetail();
        if (!refreshing) { var heading = detail.querySelector('.vcp-record h2'); if (heading) heading.focus({ preventScroll: true }); }
      } catch (error) {
        if (!current() || ticket !== recordSequence || state.selected !== planId || recordNoteId !== noteId) return;
        recordError = error; renderDetail();
      }
    }
    function recordLink(label, noteId, stepId) {
      var item = button(label, 'vcp-text', function () { openRecord(noteId, false, stepId, item); }); item.dataset.recordId = noteId; return item;
    }
    function reviewField(parent, label, value) {
      var field = node('p', 'vcp-sync-field'); field.appendChild(node('span', 'vcp-sync-field-label', label + ': '));
      field.appendChild(node('span', '', value)); parent.appendChild(field); return field;
    }
    function reviewDate(value, time) { return date(value) + (time ? ' · ' + time : ''); }
    function reviewInstant(value) {
      if (!value) return 'Brak daty zamknięcia';
      if (!nullableInstant(value)) return 'Brak prawidłowej daty zamknięcia';
      var parsed = new Date(value), pad = function (part) { return String(part).padStart(2, '0'); };
      return pad(parsed.getDate()) + '.' + pad(parsed.getMonth() + 1) + '.' + parsed.getFullYear() + ' · '
        + pad(parsed.getHours()) + ':' + pad(parsed.getMinutes()) + ':' + pad(parsed.getSeconds()) + ' (czas urządzenia)';
    }
    function reviewDocument(parent, label, noteId, empty, action, stepId) {
      var field = reviewField(parent, label, noteId ? '' : empty); if (noteId) field.appendChild(recordLink(action, noteId, stepId));
    }
    function reviewVersion(parent, component, value, label) {
      var version = node('article', 'vcp-sync-version'); version.appendChild(node('h5', 'vcp-sync-version-title', label));
      if (component.key === 'metadata') {
        reviewField(version, 'Nazwa planu', value.title); reviewField(version, 'Cel i ustalenia', value.goal || 'Brak wpisanego celu i ustaleń');
      } else if (component.key === 'status') {
        reviewField(version, 'Status planu', value.status === 'closed' ? 'Zamknięty' : 'Otwarty');
        reviewField(version, 'Zamknięcie', reviewInstant(value.closedAtISO));
        reviewField(version, 'Powód zamknięcia', value.closeReason || 'Brak wpisanego powodu');
        reviewField(version, 'Ustalenia przy zamknięciu', value.closeText || 'Brak wpisanych ustaleń');
      } else if (component.key === 'decision') {
        reviewField(version, 'Dalsze postępowanie do ustalenia', value.needsDecision ? 'Tak' : 'Nie');
        reviewField(version, 'Przypomnienie o decyzji', date(value.decisionDueDateISO));
      } else {
        var labels = { pending: 'Do wykonania', waiting: 'Oczekuję na wynik', done: 'Zakończony', cancelled: 'Niewykonany' };
        var sources = { calendar: 'Status wydarzenia w Terminarzu', performance: 'Zapis wykonania', result: 'Zapis otrzymanego wyniku' };
        var completionSource = value.resultNoteId ? 'result' : value.completionSource;
        reviewField(version, 'Krok', value.title); reviewField(version, 'Rodzaj kroku', value.kind);
        reviewField(version, 'Stan kroku', labels[value.state]);
        reviewField(version, 'Opis i ustalenia', value.description || 'Brak opisu');
        reviewField(version, value.state === 'waiting' ? 'Sprawdź dostępność wyniku' : 'Przypomnienie', reviewDate(value.reminderDateISO, value.reminderTime));
        reviewField(version, 'Termin wydarzenia', reviewDate(value.eventDateISO, value.eventTime));
        reviewField(version, 'Data zakończenia', value.completedDateISO ? date(value.completedDateISO) : 'Brak daty zakończenia');
        reviewField(version, 'Rodzaj zakończenia', sources[completionSource] || (value.state === 'done' ? 'Nie zapisano źródła zakończenia' : value.state === 'cancelled' ? 'Zakończono bez wykonania' : 'Krok niezakończony'));
        reviewField(version, 'Przypomnienie kroku', value.reminderNoteId ? 'Powiązane z planem' : 'Brak powiązanego przypomnienia');
        reviewDocument(version, 'Wynik', value.resultNoteId, 'Brak powiązanego wyniku', 'Otwórz wynik', component.stepId);
        reviewDocument(version, 'Wydarzenie w Terminarzu', value.calendarNoteId, 'Brak powiązanego wydarzenia', 'Otwórz termin');
      }
      parent.appendChild(version);
    }
    function renderSyncVersions(parent, snapshot, archived, planId) {
      var components = reviewComponents(snapshot); if (!components.length) return;
      var identity = archived && recordId(snapshot.resolvedBy) ? snapshot.resolvedBy : JSON.stringify(reviewStateSnapshot(snapshot));
      var stateKey = planId + (archived ? ':archived:' : ':current:') + identity;
      var versions = node('details', 'vcp-sync-versions'); versions.open = syncVersionState.has(stateKey) ? syncVersionState.get(stateKey) : !archived;
      versions.vcpFocusKey = stateKey;
      versions.addEventListener('toggle', function () {
        if (!current()) return;
        syncVersionState.delete(stateKey); syncVersionState.set(stateKey, versions.open);
        if (syncVersionState.size > 128) syncVersionState.delete(syncVersionState.keys().next().value);
      });
      versions.appendChild(node('summary', '', 'Zachowane wersje zmian'));
      if (archived) versions.appendChild(node('p', 'vcp-help', 'Wartości zachowane przed zapisaniem zmian. Późniejsze zmiany są widoczne w bieżącym planie.'));
      components.forEach(function (component) {
        var group = node('section', 'vcp-sync-component'); group.dataset.reviewKey = component.key;
        var headings = { metadata: 'Nazwa i cel planu', status: 'Status planu', decision: 'Dalsze postępowanie' };
        group.appendChild(node('h4', 'vcp-sync-component-heading', headings[component.key] || 'Krok: ' + component.current.title));
        var currentLabel = archived ? 'Stan planu przed zapisaniem zmian' : 'Bieżący stan planu';
        var displayed = new Map();
        function displayKey(value) {
          var copy = Object.assign({}, value); delete copy.updatedBy; delete copy.metadataUpdatedBy;
          return JSON.stringify(reviewStateSnapshot(copy));
        }
        component.variants.forEach(function (variant) {
          var key = displayKey(variant.value), entry = displayed.get(key);
          if (!entry) { entry = { value: variant.value, selected: false }; displayed.set(key, entry); }
          entry.selected = entry.selected || variant.selected;
        });
        var showCurrent = component.projected || !component.variants.some(function (variant) { return variant.selected; });
        var sameCurrent = displayed.get(displayKey(component.current));
        if (showCurrent && sameCurrent) { sameCurrent.selected = true; showCurrent = false; }
        if (showCurrent) reviewVersion(group, component, component.current, currentLabel);
        Array.from(displayed.values()).forEach(function (variant, index) { reviewVersion(group, component, variant.value, variant.selected ? currentLabel : 'Zachowana wersja ' + (index + 1)); });
        versions.appendChild(group);
      }); parent.appendChild(versions);
    }
    function historyEntry(parent, entry, includeText, includeVersions, planId, removed, retainedNote) {
      entry = entry || {};
      var item = node('div', 'vcp-timeline-entry'); item.appendChild(node('time', '', date(entry.dateISO || entry.date || entry.atISO)));
      if (removed) item.appendChild(node('strong', 'vcp-removed-note-label', 'Usunięte ustalenie'));
      if (includeText) item.appendChild(node('p', '', entry.text || 'Zaktualizowano plan.'));
      if (includeVersions) renderSyncVersions(item, entry.resolution, true, planId);
      if (includeText && !removed && (entry.noteId || entry.resultNoteId)) item.appendChild(recordLink('Otwórz wpis', entry.noteId || entry.resultNoteId));
      var plan = activePlan();
      if (includeText && !includeVersions && !removed && plan && plan.id === planId && removableNote(plan, entry)) {
        var remove = button('Usuń wpis', 'vcp-text vcp-remove-note', function () { removePlanNote(plan, entry); }); remove.dataset.removeNoteId = entry.noteId; item.appendChild(remove);
      }
      if (removed && retainedNote) {
        var retained = node('section', 'vcp-retained-note'); retained.appendChild(node('h3', '', 'Wersja zachowana po usunięciu'));
        if (retainedNote.title) retained.appendChild(node('p', 'vcp-help', retainedNote.title)); originalContent(retained, retainedNote); item.appendChild(retained);
      }
      parent.appendChild(item);
    }
    function openHistoryArchive(plan) {
      if (!current() || state.editing || state.busy || state.selected !== plan.id) return;
      archiveOrigin = { planId: plan.id, scrollTop: detail.scrollTop }; archivePlanId = plan.id; resetRecord(); renderDetail(); detail.scrollTop = 0;
      var heading = detail.querySelector('.vcp-history-archive h2'); if (heading) heading.focus({ preventScroll: true });
    }
    function returnFromHistoryArchive() {
      if (!current() || state.editing || state.busy) return;
      var origin = archiveOrigin; archivePlanId = null; archiveOrigin = null; renderDetail();
      if (origin && state.selected === origin.planId) detail.scrollTop = origin.scrollTop;
      var menu = detail.querySelector('.vcp-menu summary'); if (menu) menu.focus({ preventScroll: true });
    }
    function renderHistoryArchive(plan) {
      var noteEntries = noteEntriesFor(plan), entries = historyProjection(plan, historyReviewIds(plan), noteEntries).archived;
      var archive = node('section', 'vcp-history-archive'); archive.setAttribute('aria-label', 'Wcześniejsze wersje planu');
      archive.appendChild(button('← Wróć do planu', 'vcp-back vcp-text', returnFromHistoryArchive));
      archive.appendChild(node('p', 'vcp-patient', name(plan))); archive.appendChild(node('p', 'vcp-record-plan', plan.title));
      var heading = node('h2', 'vcp-title', 'Wcześniejsze wersje planu'); heading.tabIndex = -1; archive.appendChild(heading);
      if (plan.syncNeedsReview) archive.appendChild(planBadge(plan));
      var content = node('div', 'vcp-timeline');
      entries.slice().reverse().forEach(function (item) { historyEntry(content, item.entry, item.includeText, true, plan.id, item.removed, item.retainedNote); });
      if (removedNotes(plan).size && !noteEntries) {
        var unavailable = node('div', 'vcp-notice', 'Nie udało się odczytać wcześniejszych ustaleń.');
        unavailable.appendChild(button('Spróbuj ponownie', 'vcp-text', function () { loadNoteEntries(plan); })); content.appendChild(unavailable);
      }
      if (!entries.length && !removedNotes(plan).size) content.appendChild(node('p', 'vcp-empty', 'Brak wcześniejszych wersji planu.'));
      archive.appendChild(content); detail.appendChild(archive);
    }
    function originalContent(parent, original) {
      if (original.dueDateISO) parent.appendChild(node('p', 'vcp-step-meta', 'Termin wydarzenia: ' + date(original.dueDateISO) + (original.dueTime ? ' · ' + original.dueTime : '')));
      if (original.clinicalDateISO) parent.appendChild(node('p', 'vcp-step-meta', 'Data badania / ustalenia: ' + date(original.clinicalDateISO)));
      if (original.labResult) {
        var lab = original.labResult, value = typeof lab.valueNum === 'number' && isFinite(lab.valueNum) ? String(lab.valueNum) : lab.value;
        var result = node('div', 'vcp-record-lab');
        if (lab.test) result.appendChild(node('p', '', 'Badanie: ' + lab.test));
        if (value) result.appendChild(node('p', '', 'Zapisany wynik: ' + value + (lab.unit ? ' ' + lab.unit : '')));
        if (lab.norm) result.appendChild(node('p', '', 'Zapisana norma: ' + lab.norm)); parent.appendChild(result);
      }
      parent.appendChild(node('div', 'vcp-record-body', original.body || 'Brak dodatkowej treści.'));
    }
    function renderRecord(plan) {
      var section = node('section', 'vcp-record'); section.dataset.noteId = recordNoteId; section.setAttribute('aria-label', 'Wpis planu opieki');
      section.appendChild(button(recordOrigin && recordOrigin.archive ? '← Wróć do wcześniejszych wersji' : '← Wróć do planu', 'vcp-back vcp-text', returnToPlan));
      section.appendChild(node('p', 'vcp-patient', name(plan))); section.appendChild(node('p', 'vcp-record-plan', plan.title));
      if (recordRemoved) {
        section.appendChild(node('h2', 'vcp-title', 'Ustalenie usunięte'));
        section.appendChild(node('p', '', 'Ten wpis został usunięty z przebiegu planu. Wcześniejszy zapis pozostaje w historii zmian dostępnej w Opcjach planu.'));
      } else if (recordError) {
        var error = errorBox(recordError, section); error.appendChild(button('Spróbuj ponownie', 'vcp-text', function () { openRecord(recordNoteId, true); }));
        if (options.openPatient) error.appendChild(button('Otwórz Kartę pacjenta ↗', 'vcp-text', function () { openPatient(plan); }));
      } else if (!record) { var loading = node('p', 'vcp-empty', 'Wczytywanie wpisu…'); loading.setAttribute('role', 'status'); section.appendChild(loading); }
      else {
        var heading = node('h2', 'vcp-title', record.title || 'Wpis planu opieki'); heading.tabIndex = -1; section.appendChild(heading);
        originalContent(section, record);
        if (record.careContext && record.careContext.role === 'result') section.appendChild(node('p', 'vcp-help', staged(plan) ? 'Dokument jest również dostępny w dokumentacji pacjenta.' : 'Wynik jest również dostępny w Badaniach Karty pacjenta.'));
        if (options.openRecordDetails && !staged(plan)) section.appendChild(button('Szczegóły wpisu', 'vcp-text', async function () {
          if (!current() || !record) return;
          var noteId = recordNoteId, ticket = recordSequence;
          function isCurrentRecord() { return current() && !state.editing && !state.busy && ticket === recordSequence && recordNoteId === noteId && state.selected === plan.id; }
          try { await options.openRecordDetails(record, function () { if (isCurrentRecord()) openRecord(noteId, true); }, isCurrentRecord); }
          catch (error) { if (isCurrentRecord()) { recordError = error; renderDetail(); } }
        }));
      }
      detail.appendChild(section);
    }
    function archiveFocusOrigin() {
      var archive = detail.querySelector('.vcp-history-archive'), focused = doc.activeElement;
      if (!archive || !focused) return null;
      if (focused === archive.querySelector('h2')) return { element: focused, kind: 'heading' };
      if (focused === archive.querySelector('.vcp-back')) return { element: focused, kind: 'back' };
      var links = Array.from(archive.querySelectorAll('[data-record-id]'));
      if (links.indexOf(focused) >= 0) return { element: focused, kind: 'document', id: focused.dataset.recordId, label: focused.textContent,
        index: links.filter(function (link) { return link.dataset.recordId === focused.dataset.recordId && link.textContent === focused.textContent; }).indexOf(focused) };
      var disclosure = Array.from(archive.querySelectorAll('.vcp-sync-versions')).find(function (item) { return item.querySelector('summary') === focused; });
      return disclosure ? { element: focused, kind: 'disclosure', key: disclosure.vcpFocusKey } : null;
    }
    function restoreArchiveFocus(origin) {
      if (!origin || doc.activeElement && doc.activeElement !== origin.element && doc.activeElement !== doc.body && doc.activeElement !== doc.documentElement) return;
      var archive = detail.querySelector('.vcp-history-archive'); if (!archive) return;
      var target = origin.kind === 'heading' ? archive.querySelector('h2') : origin.kind === 'back' ? archive.querySelector('.vcp-back') : null;
      if (origin.kind === 'document') target = Array.from(archive.querySelectorAll('[data-record-id]')).filter(function (link) {
        return link.dataset.recordId === origin.id && link.textContent === origin.label;
      })[origin.index];
      if (origin.kind === 'disclosure') {
        var disclosure = Array.from(archive.querySelectorAll('.vcp-sync-versions')).find(function (item) { return item.vcpFocusKey === origin.key; });
        target = disclosure && disclosure.querySelector('summary');
      }
      if (target) target.focus({ preventScroll: true });
    }
    function renderDetail() {
      var scroll = detail.scrollTop, menuOpen = !!detail.querySelector('.vcp-menu[open]'), archiveFocus = archiveFocusOrigin(); clear(detail);
      var selected = activePlan();
      if (recordNoteId && selected) { renderRecord(selected); detail.scrollTop = scroll; return; }
      if (selected && archivePlanId === selected.id) { renderHistoryArchive(selected); detail.scrollTop = scroll; restoreArchiveFocus(archiveFocus); return; }
      var parentBack = button('← Lista planów', 'vcp-back vcp-text', back);
      parentBack.setAttribute('data-vcp-parent-back', 'true'); detail.appendChild(parentBack); refreshNavigation();
      var plan = activePlan(); if (!plan) { detail.appendChild(node('p', 'vcp-empty', 'Wybierz plan z listy albo dodaj nowy plan opieki.')); return; }
      if (staged(plan)) { renderStagedPlan(plan); detail.scrollTop = scroll; return; }
      var projectedHistory = historyProjection(plan, historyReviewIds(plan), noteEntriesFor(plan));
      var top = node('div', 'vcp-detail-top'), patient = node('div', '');
      patient.appendChild(options.openPatient ? button(name(plan) + ' ↗', 'vcp-patient-link', function () { openPatient(plan); }) : node('h3', 'vcp-patient', name(plan)));
      patient.appendChild(node('p', 'vcp-detail-date', 'Plan od ' + date(plan.createdAtISO))); top.appendChild(patient);
      var menu = node('details', 'vcp-menu'); menu.open = menuOpen; var summary = node('summary', '', '⋯'); summary.setAttribute('aria-label', 'Opcje planu'); menu.appendChild(summary);
      var actions = node('div', 'vcp-menu-items'); actions.appendChild(button('Edytuj nazwę i cel', '', function () { menu.open = false; editPlan(plan); }));
      var copyTemplate = button('Zapisz układ jako szablon', '', function () { menu.open = false; openTemplateLibrary(plan.id); }); copyTemplate.disabled = !!plan.syncNeedsReview; if (copyTemplate.disabled) copyTemplate.title = 'Najpierw potwierdź przegląd zmian po synchronizacji.'; actions.appendChild(copyTemplate);
      if (!closed(plan)) actions.appendChild(button('Dołącz istniejący termin', '', function () { menu.open = false; linkEvent(plan); }));
      actions.appendChild(button('Dodaj ustalenie', '', function () { menu.open = false; addNote(plan); }));
      if (projectedHistory.archived.length || removedNotes(plan).size) actions.appendChild(button('Wcześniejsze wersje planu', '', function () { menu.open = false; openHistoryArchive(plan); }));
      var finish = button(closed(plan) ? 'Wznów plan' : 'Zamknij plan', '', function () { menu.open = false; if (closed(plan)) reopen(plan); else closePlan(plan); });
      finish.disabled = !closed(plan) && !!plan.syncNeedsReview; if (finish.disabled) finish.title = 'Najpierw potwierdź przegląd zmian po synchronizacji.'; actions.appendChild(finish); menu.appendChild(actions); top.appendChild(menu); detail.appendChild(top);
      detail.appendChild(node('h2', 'vcp-title', plan.title)); if (plan.goal) detail.appendChild(node('p', 'vcp-goal', plan.goal));
      var strip = node('div', 'vcp-plan-strip'); strip.appendChild(planBadge(plan)); strip.appendChild(node('span', '', doneSteps(plan).length + ' z ' + steps(plan).length + ' kroków zakończonych'));
      var overdue = openSteps(plan).filter(function (step) { return daysLate(step.reminderDateISO) > 0; }).length;
      strip.appendChild(node('span', '', openSteps(plan).length + ' otwarte' + (overdue ? ' · ' + overdue + ' po terminie' : ''))); detail.appendChild(strip);
      if (plan.syncNeedsReview) {
        var review = node('section', 'vcp-sync-review'); review.setAttribute('aria-label', 'Przegląd zmian po synchronizacji');
        review.appendChild(node('strong', '', 'Plan wymaga przeglądu po synchronizacji'));
        review.appendChild(node('p', '', reviewExplanation(plan)));
        if (closed(plan)) review.appendChild(node('p', '', openSteps(plan).length ? 'Plan pozostaje zamknięty, ale zachowano w nim nierozstrzygnięte kroki. Są widoczne poniżej. Wznów plan albo potwierdź zakończenie tych kroków bez wykonania z uzasadnieniem.' : 'Plan pozostaje zamknięty. Potwierdzenie przeglądu nie wznowi jego realizacji.'));
        else review.appendChild(node('p', '', 'Sprawdź kroki i ustalenia oraz popraw ewentualne rozbieżności przed potwierdzeniem przeglądu.'));
        renderSyncVersions(review, plan.syncReview, false, plan.id);
        if (projectedHistory.currentFallbacks.length) {
          var fallbacks = node('section', 'vcp-review-fallbacks'); fallbacks.appendChild(node('h4', '', 'Dodatkowe zachowane zapisy'));
          if (!readableReview(plan.syncReview)) fallbacks.appendChild(node('p', '', 'Sprawdź poniższe zachowane zapisy przed potwierdzeniem przeglądu.'));
          projectedHistory.currentFallbacks.slice().reverse().forEach(function (entry) { historyEntry(fallbacks, entry, true, true, plan.id); });
          review.appendChild(fallbacks);
        }
        review.appendChild(button('Potwierdzam przegląd planu', 'vcp-outline', function () { acknowledgeMerge(plan); })); detail.appendChild(review);
      }
      if (closed(plan)) {
        var closure = node('div', 'vcp-closed'); closure.appendChild(node('strong', '', 'Plan zamknięty · ' + date(plan.closedAtISO)));
        closure.appendChild(node('p', '', [plan.closeReason, plan.closeText].filter(Boolean).join(' · '))); detail.appendChild(closure);
      } else if (plan.needsDecision || !openSteps(plan).length) {
        var decision = node('div', 'vcp-decision'); decision.appendChild(node('strong', '', 'Dalsze postępowanie do ustalenia'));
        decision.appendChild(node('p', '', 'Plan pozostaje otwarty. Dodaj kolejny krok lub zapisz powód zamknięcia.' + (plan.decisionDueDateISO ? ' Powrót do decyzji: ' + date(plan.decisionDueDateISO) + '.' : '')));
        var decisionActions = node('div', 'vcp-button-row'); decisionActions.appendChild(button('Ustal kolejny krok', 'vcp-outline', function () { stepForm(plan); })); var closeDecision = button('Zamknij plan', 'vcp-text', function () { closePlan(plan); }); closeDecision.disabled = !!plan.syncNeedsReview; if (closeDecision.disabled) closeDecision.title = 'Najpierw potwierdź przegląd zmian po synchronizacji.'; decisionActions.appendChild(closeDecision); decision.appendChild(decisionActions); detail.appendChild(decision);
      }
      var heading = node('div', 'vcp-section-heading'); heading.appendChild(node('h3', '', 'Kroki planu')); if (!closed(plan)) heading.appendChild(button('+ Dodaj krok', 'vcp-text', function () { stepForm(plan); })); detail.appendChild(heading);
      steps(plan).forEach(function (step, index) { detail.appendChild(stepNode(plan, step, index)); });
      var bottom = node('div', 'vcp-detail-bottom'); if (options.openPatient) bottom.appendChild(button('Otwórz w Karcie pacjenta ↗', 'vcp-outline', function () { openPatient(plan); }));
      bottom.appendChild(button('+ Zapisz ustalenie', 'vcp-text', function () { addNote(plan); })); detail.appendChild(bottom);
      var historyEntries = projectedHistory.clinical;
      var history = node('details', 'vcp-history'); history.open = true; history.appendChild(node('summary', '', 'Przebieg planu · ' + historyCount(historyEntries.length)));
      var timeline = node('div', 'vcp-timeline'); historyEntries.slice().reverse().forEach(function (entry) {
        historyEntry(timeline, entry, true, false, plan.id);
      }); history.appendChild(timeline); detail.appendChild(history); detail.scrollTop = scroll;
    }
    function stagedNativeConflict(plan) {
      return !!(plan && (plan.syncNeedsReview === true || Array.isArray(plan.nativeConflicts) && plan.nativeConflicts.length));
    }
    function stagedWritable(plan) {
      var view = stagedView(plan);
      return !!(current() && !stagedNativeConflict(plan) && state.stagedCapability && state.stagedCapability.available === true && typeof vault.mutateStagedCarePlan === 'function'
        && view && view.kind === 'v2' && (!view.nextAction || !['resolveConflict', 'reviewChangedStage'].includes(view.nextAction.type)));
    }
    function renderStagedNativeVersions(parent, plan) {
      if (!Array.isArray(plan.nativeConflicts) || !plan.nativeConflicts.length) {
        help(parent, 'Nie można wyświetlić wszystkich zachowanych wersji. Odśwież listę planów, aby ponowić odczyt.'); return;
      }
      var versions = [plan].concat(plan.nativeConflicts.map(function (state) { return state && state.record; }));
      var section = node('section', 'vcp-native-conflicts');
      section.setAttribute('aria-label', 'Zachowane wersje planu');
      section.appendChild(node('h3', '', 'Zachowane wersje · ' + versions.length));
      versions.forEach(function (version, index) {
        var retained = node('details', 'vcp-history vcp-native-conflict-version');
        var branch = index ? plan.nativeConflicts[index - 1] : null;
        var operations = branch && branch.operations, last = Array.isArray(operations) && operations[operations.length - 1];
        var stateKey = plan.id + ':native-conflict:' + (index ? last && last.id || index : 'primary');
        retained.open = syncVersionState.get(stateKey) === true;
        var samePlan = version && version.id === plan.id && version.patientId === plan.patientId && staged(version), rendered = false;
        retained.appendChild(node('summary', '', 'Wersja ' + (index + 1) + (samePlan && typeof version.title === 'string' ? ' · ' + version.title : '')));
        function renderVersion() {
          if (rendered || !retained.open) return;
          rendered = true;
          var content = node('section', 'vcp-native-conflict-content');
          if (!samePlan) help(content, 'Nie można bezpiecznie odczytać tej wersji. Odśwież aplikację; zachowany zapis pozostaje dostępny.');
          else renderStagedPlan(version, { target: content, readOnly: true });
          retained.appendChild(content);
        }
        retained.addEventListener('toggle', function () {
          if (!current()) return;
          syncVersionState.delete(stateKey); syncVersionState.set(stateKey, retained.open);
          if (syncVersionState.size > 128) syncVersionState.delete(syncVersionState.keys().next().value);
          renderVersion();
        });
        renderVersion(); section.appendChild(retained);
      });
      parent.appendChild(section);
    }
    function stagedOutcomeLabel(kind) { return { performance: 'Wykonanie', resultReceipt: 'Otrzymanie wyniku', decision: 'Decyzja' }[kind] || kind; }
    function renderStagedPlan(plan, presentation) {
      var target = presentation && presentation.target || detail, readOnly = !!(presentation && presentation.readOnly);
      var view = stagedView(plan), context = plan.careContext;
      var top = node('div', 'vcp-detail-top');
      top.appendChild(options.openPatient ? button(name(plan) + ' ↗', 'vcp-patient-link', function () { openPatient(plan); }) : node('h3', 'vcp-patient', name(plan))); target.appendChild(top);
      target.appendChild(node('h2', 'vcp-title', plan.title)); if (context.goal) target.appendChild(node('p', 'vcp-goal', context.goal));
      if (!view || view.kind !== 'v2') { notice(target, 'Nie można bezpiecznie odczytać wszystkich danych tego planu. Odśwież aplikację przed dalszą pracą.', true); return; }
      var writable = !readOnly && stagedWritable(plan), strip = node('div', 'vcp-plan-strip'); strip.appendChild(planBadge(plan)); strip.appendChild(node('span', '', doneSteps(plan).length + ' z ' + steps(plan).length + ' kroków rozstrzygniętych')); target.appendChild(strip);
      if (!readOnly && stagedNativeConflict(plan)) {
        notice(target, 'Konflikt synchronizacji. Ten plan jest dostępny tylko do odczytu. Przejrzyj zachowane wersje poniżej; zmiany planu są wstrzymane.', true);
        renderStagedNativeVersions(target, plan);
      } else if (!readOnly && !writable) notice(target, state.stagedCapability && !state.stagedCapability.available && state.stagedCapability.message || 'Zmiany tego planu są teraz niedostępne. Odśwież widok i sprawdź zachowane wpisy.', true);
      if (closed(plan)) {
        var closeEntry = context.log.filter(function (entry) { return entry.action === 'closePlan'; }).pop();
        notice(target, 'Plan zamknięty · ' + date(closeEntry && closeEntry.effectiveDateISO || context.closedAtISO) + '\n' + [context.closeReason, context.closeText].filter(Boolean).join('\n'));
      } else if (view.nextAction && view.nextAction.type === 'decidePlan') notice(target, 'Wszystkie etapy zostały przejrzane. Plan pozostaje otwarty do osobnej decyzji o jego zakończeniu.');
      view.stages.forEach(function (stage, index) {
        var section = node('section', 'vcp-stage'); section.dataset.stageId = stage.id;
        var head = node('div', 'vcp-section-heading'); head.appendChild(node('h3', '', (index + 1) + '. ' + stage.title));
        head.appendChild(badge({ planned: 'Zaplanowany', active: 'W realizacji', reviewed: 'Przejrzany' }[stage.controlState], stage.controlState === 'reviewed' ? 'done' : 'planned')); section.appendChild(head);
        var dates = [];
        if (stage.control.activation) dates.push('Uruchomiono: ' + date(stage.control.activation.effectiveDateISO));
        if (stage.control.review) dates.push('Przegląd: ' + date(stage.control.review.effectiveDateISO));
        if (dates.length) help(section, dates.join(' · '));
        if (writable && !closed(plan)) {
          if (view.nextAction && view.nextAction.type === 'startStage' && view.nextAction.stageId === stage.id) {
            help(section, 'Terminy przypomnień będą liczone od wybranej daty uruchomienia tego etapu.');
            section.appendChild(button(index === 0 ? 'Uruchom pierwszy etap' : 'Uruchom etap', 'vcp-primary', function () { stagedDateAction(plan, stage, 'activateStage'); }));
          }
          if (stage.readyForReview) section.appendChild(button('Potwierdź przegląd etapu', 'vcp-primary', function () { stagedDateAction(plan, stage, 'reviewStage'); }));
          if (stage.controlState === 'reviewed' && !view.stages.some(function (entry) { return entry.controlState === 'active'; }) && view.stages.slice(index + 1).every(function (entry) { return entry.controlState === 'planned'; })) section.appendChild(button('Wznów etap', 'vcp-outline', function () { stagedReasonAction(plan, 'reopenStage', stage); }));
        }
        stage.steps.forEach(function (step, stepIndex) {
          var item = node('article', 'vcp-step vcp-staged-step'); item.dataset.stepId = step.id;
          item.appendChild(node('span', 'vcp-step-marker', step.progress === 'resolved' ? '✓' : step.progress === 'omitted' ? '−' : String(stepIndex + 1)));
          var content = node('div', 'vcp-step-content'), title = node('div', 'vcp-step-top'); title.appendChild(node('h4', 'vcp-step-title', step.title));
          title.appendChild(badge({ pending: 'Do wykonania', waiting: 'Oczekuję na wynik', resolved: 'Rozstrzygnięty', omitted: 'Pominięty', review: 'Do przeglądu' }[step.progress], step.progress === 'resolved' ? 'done' : step.progress === 'waiting' ? 'waiting' : 'planned')); content.appendChild(title);
          help(content, 'Wymagane: ' + stagedOutcomeLabel(step.requiredOutcome).toLocaleLowerCase('pl'));
          if (step.instruction) content.appendChild(node('p', 'vcp-description', step.instruction));
          if (step.reminderSchedule) help(content, 'Przypomnienie: ' + date(step.reminderSchedule.dateISO) + (step.reminderSchedule.time ? ' · ' + step.reminderSchedule.time : ''));
          if (step.omission) help(content, 'Pominięto ' + date(step.omission.effectiveDateISO) + ' · ' + step.omission.reason);
          var facts = node('div', 'vcp-staged-facts');
          step.facts.forEach(function (fact) {
            var row = node('p', ''); row.appendChild(node('span', '', stagedOutcomeLabel(fact.kind) + ': ' + date(fact.effectiveDateISO) + ' · ')); row.appendChild(recordLink('Otwórz dokument', fact.evidence.noteId, step.id)); facts.appendChild(row);
          });
          step.associations.forEach(function (association) {
            var row = node('p', ''); row.appendChild(node('span', '', ({ result: 'Powiązany wynik', event: 'Powiązany termin', document: 'Powiązany dokument' }[association.kind]) + ' · ')); row.appendChild(recordLink('Otwórz wpis', association.noteId, step.id));
            if (association.kind === 'event' && options.openCalendar) row.appendChild(button('Otwórz w Terminarzu ↗', 'vcp-text', function () { options.openCalendar(association.noteId); })); facts.appendChild(row);
          }); content.appendChild(facts);
          var actions = node('div', 'vcp-step-actions'), eligibility = step.workflowEligibility;
          if (writable && !closed(plan) && eligibility.canRecordFact) {
            if (!step.omission && !step.facts.some(function (fact) { return fact.kind === step.requiredOutcome; })) actions.appendChild(button({ performance: 'Zapisz wykonanie', resultReceipt: 'Zapisz otrzymanie wyniku', decision: 'Zapisz decyzję' }[step.requiredOutcome], 'vcp-action', function () { stagedFact(plan, step, step.requiredOutcome); }));
            if (step.requiredOutcome === 'resultReceipt' && !step.omission && !step.facts.some(function (fact) { return fact.kind === 'performance'; })) actions.appendChild(button('Zapisz wykonanie', '', function () { stagedFact(plan, step, 'performance'); }));
            actions.appendChild(button('Powiąż dokument lub termin', 'vcp-subtle', function () { stagedAssociation(plan, step); }));
            if (eligibility.canOmit) actions.appendChild(button('Pomiń krok', 'vcp-subtle', function () { stagedReasonAction(plan, 'omitStep', step); }));
            if (step.omission) actions.appendChild(button('Wznów pominięty krok', 'vcp-subtle', function () { stagedReasonAction(plan, 'reopenStep', step); }));
            if (stage.controlState === 'active' && !['resolved', 'omitted'].includes(step.progress)) actions.appendChild(button('Zmień przypomnienie', 'vcp-subtle', function () { stagedReminder(plan, step); }));
          }
          content.appendChild(actions); item.appendChild(content); section.appendChild(item);
        }); target.appendChild(section);
      });
      var bottom = node('div', 'vcp-detail-bottom');
      if (options.openPatient) bottom.appendChild(button('Otwórz w Karcie pacjenta ↗', 'vcp-outline', function () { openPatient(plan); }));
      if (writable) bottom.appendChild(button(closed(plan) ? 'Wznów plan' : 'Zamknij plan', 'vcp-outline', function () { stagedReasonAction(plan, closed(plan) ? 'reopenPlan' : 'closePlan'); })); target.appendChild(bottom);
      var history = node('details', 'vcp-history'); history.appendChild(node('summary', '', 'Przebieg planu · ' + historyCount(context.log.length)));
      context.log.slice().reverse().forEach(function (entry) {
        var row = node('div', 'vcp-timeline-entry'); row.appendChild(node('time', '', date(entry.effectiveDateISO || entry.recordedLocalDateISO))); row.appendChild(node('p', '', entry.text));
        entry.documentIds.forEach(function (id) { row.appendChild(recordLink('Otwórz dokument', id, entry.stepId)); }); history.appendChild(row);
      }); target.appendChild(history);
    }
    function stepNode(plan, step, index) {
      var item = node('article', 'vcp-step'); item.dataset.stepId = step.id;
      var omission = step.state === 'cancelled' && omissionFor(plan, step), omitted = confirmedOmission(omission);
      item.appendChild(node('span', 'vcp-step-marker vcp-step-' + step.state, step.state === 'done' ? '✓' : step.state === 'waiting' ? '◷' : step.state === 'cancelled' ? '−' : String(index + 1)));
      var content = node('div', 'vcp-step-content'), top = node('div', 'vcp-step-top'); top.appendChild(node('h4', 'vcp-step-title', step.title));
      var labels = { pending: 'Do wykonania', waiting: 'Oczekuję na wynik', done: 'Zakończony', cancelled: 'Niewykonany' }; top.appendChild(badge(omitted ? 'Pominięty' : labels[step.state] || 'Do wykonania', step.state === 'waiting' ? 'waiting' : step.state === 'done' ? 'done' : 'planned')); content.appendChild(top);
      var meta = [];
      if (step.state === 'done') meta.push('Zakończono: ' + date(step.completedDateISO));
      else if (step.state === 'cancelled') meta.push(omitted ? 'Decyzja o pominięciu: ' + date(omission.dateISO) : 'Krok zakończony bez wykonania');
      else meta.push((step.state === 'waiting' ? 'Sprawdź wynik: ' : 'Przypomnij: ') + date(step.reminderDateISO));
      if (step.kind) meta.push(step.kind);
      if (step.eventDateISO) meta.push('Termin wydarzenia: ' + date(step.eventDateISO) + (step.eventTime ? ' · ' + step.eventTime : ''));
      content.appendChild(node('p', 'vcp-step-meta', meta.join(' · '))); if (step.description) content.appendChild(node('p', 'vcp-description', step.description));
      if (omitted) content.appendChild(node('p', 'vcp-description vcp-omission-reason', 'Powód pominięcia: ' + omission.reason));
      var actions = node('div', 'vcp-step-actions');
      if (!closed(plan) && step.state !== 'done' && step.state !== 'cancelled') {
        actions.appendChild(button(step.state === 'waiting' ? 'Wpisz wynik' : 'Zapisz wykonanie', 'vcp-action', function () { outcome(plan, step, step.state === 'waiting' ? 'result' : 'complete'); }));
        if (step.state !== 'waiting') actions.appendChild(button('Czekam na wynik', '', function () { outcome(plan, step, 'wait'); }));
        var link = button('Podepnij istniejący wynik', '', function () { linkResult(plan, step); });
        link.disabled = !!plan.syncNeedsReview; if (link.disabled) link.title = 'Najpierw potwierdź przegląd zmian po synchronizacji.';
        actions.appendChild(link);
        actions.appendChild(button('Edytuj', 'vcp-subtle', function () { stepForm(plan, step); }));
        var omit = button('Pomiń krok', 'vcp-subtle', function () { omitStep(plan, step); });
        omit.disabled = !!plan.syncNeedsReview; if (omit.disabled) omit.title = 'Najpierw potwierdź przegląd zmian po synchronizacji.';
        actions.appendChild(omit);
      }
      if (!closed(plan) && !plan.syncNeedsReview && step.state === 'cancelled' && omission && omission.protected === true) actions.appendChild(button(omitted ? 'Wznów pominięty krok' : 'Wznów krok', 'vcp-subtle', function () { restoreOmittedStep(plan, step, omitted); }));
      if (step.calendarNoteId && options.openCalendar) actions.appendChild(button('Otwórz termin ↗', '', function () { options.openCalendar(step.calendarNoteId); }));
      if (step.resultNoteId) actions.appendChild(recordLink('Otwórz wynik', step.resultNoteId, step.id));
      content.appendChild(actions); item.appendChild(content); return item;
    }
    async function refresh() {
      if (!current()) return;
      if (state.editing || state.busy) { state.stale = true; return; }
      if (typeof vault.listCarePlans !== 'function') { clear(list); errorBox(new Error('Odśwież aplikację, aby korzystać z planów opieki.'), list); return; }
      if (refreshTimer) { win.clearTimeout(refreshTimer); refreshTimer = null; }
      var ticket = ++sequence; state.loading = true; if (!state.loaded) render();
      try {
        var provider = typeof vault.getCarePlanApplicationProvider === 'function' ? vault.getCarePlanApplicationProvider() : null;
        var result = await Promise.all([vault.listCarePlans(options.patientId ? { patientId: options.patientId } : {}), vault.listPatients(), provider && typeof provider.getCapability === 'function' ? Promise.resolve().then(function () { return provider.getCapability(); }).catch(function () { return { available: false }; }) : null]);
        if (!current() || ticket !== sequence) return;
        var nextPlans = Array.isArray(result[0]) ? result[0] : [], nextPatients = Array.isArray(result[1]) ? result[1] : [];
        function snapshot(plans, patients) { return JSON.stringify([plans.slice().sort(function (a, b) { return a.id.localeCompare(b.id); }), patients.map(function (entry) { return [entry.patientId, patientName(entry)]; }).sort()]); }
        var changed = !state.loaded || snapshot(nextPlans, nextPatients) !== snapshot(state.plans, state.patients) || JSON.stringify(state.stagedCapability) !== JSON.stringify(result[2]);
        state.stagedCapability = result[2];
        state.plans = nextPlans; state.patients = nextPatients;
        if (!state.loaded && options.planId && closed(activePlan())) state.filter = 'closed';
        state.names.clear(); state.patients.forEach(function (patient) { state.names.set(patient.patientId, patientName(patient)); });
        state.loaded = true; state.stale = false;
      } catch (error) {
        if (current() && ticket === sequence) { state.loading = false; render(); clear(list); var retry = errorBox(error, list); retry.appendChild(button('Spróbuj ponownie', 'vcp-text', refresh)); }
        return;
      } finally { if (ticket === sequence) state.loading = false; }
      if (current() && ticket === sequence) {
        if (changed) render();
        await Promise.all([loadOmissions(activePlan()), loadHistoryClassification(activePlan()), loadNoteEntries(activePlan())]);
        if (!current() || ticket !== sequence) return;
        if (recordNoteId && activePlan()) await openRecord(recordNoteId, true, recordStepId);
        if (initialRecord) { var firstRecord = initialRecord; initialRecord = null; await openRecord(firstRecord); }
      }
    }
    function scheduleRefresh() { if (destroyed) return; if (state.editing || state.busy) { state.stale = true; return; } if (refreshTimer) win.clearTimeout(refreshTimer); refreshTimer = win.setTimeout(function () { refreshTimer = null; refresh(); }, 80); }
    function field(parent, label, type, value, required) {
      var wrap = node('label', 'vcp-field'), caption = node('span', '', label); wrap.appendChild(caption);
      var input = node(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input', ''); if (type !== 'textarea' && type !== 'select') input.type = type;
      input.value = value || ''; input.required = !!required; if (type === 'textarea') input.rows = 4; input.setAttribute('aria-label', label); wrap.appendChild(input); parent.appendChild(wrap); return input;
    }
    function selectField(parent, label, values, value) {
      var select = field(parent, label, 'select', '', false); values.forEach(function (entry) { var option = node('option', '', Array.isArray(entry) ? entry[1] : entry); option.value = Array.isArray(entry) ? entry[0] : entry; select.appendChild(option); }); select.value = value || (Array.isArray(values[0]) ? values[0][0] : values[0]); return select;
    }
    function help(parent, text) { parent.appendChild(node('p', 'vcp-help', text)); }
    function check(parent, label, checked, required) {
      var wrap = node('label', 'vcp-check'), input = node('input', ''); input.type = 'checkbox'; input.checked = !!checked; input.required = !!required; wrap.appendChild(input); wrap.appendChild(node('span', '', label)); parent.appendChild(wrap); return input;
    }
    function notice(parent, text, warning) { var box = node('div', 'vcp-notice' + (warning ? ' vcp-warning' : ''), text); parent.appendChild(box); }
    function bindRemindersDialogViewport(dialog) {
      var viewport = win.visualViewport, stopped = false;
      function fitDialog() {
        if (stopped) return;
        var height = viewport && viewport.height || win.innerHeight;
        dialog.style.setProperty('--vcp-dialog-viewport-height', height + 'px');
        dialog.style.setProperty('--vcp-dialog-viewport-top', (viewport && viewport.offsetTop || 0) + 'px');
        dialog.classList.toggle('vcp-dialog-short', height <= 500);
      }
      fitDialog();
      win.addEventListener('resize', fitDialog, { passive: true });
      if (viewport) { viewport.addEventListener('resize', fitDialog, { passive: true }); viewport.addEventListener('scroll', fitDialog, { passive: true }); }
      return function () {
        if (stopped) return; stopped = true;
        win.removeEventListener('resize', fitDialog);
        if (viewport) { viewport.removeEventListener('resize', fitDialog); viewport.removeEventListener('scroll', fitDialog); }
      };
    }
    function showEditor(title, plan, build, saveLabel, submit) {
      if (!current() || state.editing || state.busy) return null;
      var origin = doc.activeElement, dialog = node('dialog', 'vcp vcp-dialog'), form = node('form', 'vcp-form');
      if (remindersLayout) dialog.classList.add('vcp-reminders-dialog');
      var header = node('header', 'vcp-form-head'), titleWrap = node('div', '');
      titleWrap.appendChild(node('p', 'vcp-form-patient', plan ? name(plan) : 'Nowy plan opieki'));
      var heading = node('h2', '', title); heading.id = 'vcp-form-title-' + ++serial; titleWrap.appendChild(heading); header.appendChild(titleWrap);
      var closeButton = button('×', 'vcp-icon', cancel); closeButton.setAttribute('aria-label', 'Anuluj formularz planu'); header.appendChild(closeButton); form.appendChild(header);
      var body = node('div', 'vcp-form-body'), errors = node('div', 'vcp-form-errors'); body.appendChild(errors); form.appendChild(body);
      var footer = node('footer', 'vcp-form-actions'), cancelButton = button('Anuluj', 'vcp-outline', cancel), saveButton = node('button', 'vcp-primary', saveLabel); saveButton.type = 'submit'; footer.appendChild(cancelButton); footer.appendChild(saveButton); form.appendChild(footer); dialog.appendChild(form);
      var model = { dialog: dialog, form: form, body: body, errors: errors, save: saveButton, cancel: cancel, plan: plan, operationId: operationId() };
      editor = model; busy(false, true); doc.body.appendChild(dialog);
      function cancel() {
        if (state.busy) return;
        if (model.releaseViewport) { model.releaseViewport(); model.releaseViewport = null; }
        if (typeof model.onDialogClose === 'function') { model.onDialogClose(); model.onDialogClose = null; }
        if (dialog.open) dialog.close(); dialog.remove(); if (editor === model) editor = null; busy(false, false); render();
        if (origin && origin.isConnected && origin.focus) origin.focus({ preventScroll: true });
        if (state.stale) refresh();
      }
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); cancel(); });
      function setWorking(value) { busy(value, true); Array.from(form.querySelectorAll('button,input,select,textarea')).forEach(function (control) { control.disabled = value; }); if (!value && model.sync) model.sync(); }
      form.addEventListener('submit', async function (event) {
        event.preventDefault(); if (!current() || editor !== model || state.busy) return;
        clear(errors); if (model.validate && !model.validate()) return; if (!form.reportValidity()) return;
        var request;
        try { request = submit(model); } catch (error) { errorBox(error, errors); return; }
        if (!request) return;
        request.operationId = model.operationId;
        if (plan) { request.planId = plan.id; request.patientId = plan.patientId; request.baseRev = plan.rev; }
        setWorking(true);
        try {
          var result = await vault.mutateCarePlan(request);
          if (!current() || editor !== model) return;
          if (!result || !result.saved) throw new Error(result && (result.needsRefresh || result.reason === 'operation-outcome-expired') ? 'Nie można potwierdzić wyniku wcześniejszego zapisu. Zachowaj wpisaną treść, anuluj formularz i sprawdź aktualny plan przed ponownym zapisem.' : result && result.conflict ? 'Plan zmienił się w innej karcie lub na innym urządzeniu. Zachowaj wpisaną treść, anuluj formularz i otwórz go ponownie.' : result && result.reason === 'deleted' ? 'Ten plan lub jego wpis został usunięty. Anuluj formularz i odśwież listę.' : 'Nie udało się zapisać planu. Anuluj formularz i odśwież listę.');
          resetRecord();
          var savedPlan = result.plan; if (savedPlan) { state.plans = state.plans.filter(function (entry) { return entry.id !== savedPlan.id; }); state.plans.push(savedPlan); state.selected = savedPlan.id; }
          else if (result.planId) state.selected = result.planId;
          if (savedPlan && closed(savedPlan)) state.filter = 'closed'; else state.filter = 'all';
          state.query = ''; search.value = ''; state.detail = !!options.full; root.classList.toggle('vcp-show-detail', state.detail);
          state.stale = false; setWorking(false); cancel(); notify(request.action === 'removePlanNote' ? 'Usunięto wpis z przebiegu planu.' : request.action === 'result' ? 'Wynik zapisany w kartotece. Plan pozostaje otwarty.' : request.action === 'linkResult' ? 'Podpięto oryginalny wynik. Plan pozostaje otwarty.' : request.action === 'omitStep' ? 'Zapisano pominięcie kroku z uzasadnieniem. Plan pozostaje otwarty.' : request.restoreOmitted ? 'Wznowiono krok z zachowaniem dokumentacji i rezerwacji.' : request.action === 'close' ? 'Zapisano zamknięcie i powód zakończenia planu.' : request.action === 'acknowledgeMerge' ? 'Zapisano potwierdzenie przeglądu planu.' : 'Zapisano zmiany planu.');
          if (options.onChange) options.onChange(result); await refresh();
        } catch (error) { if (current() && editor === model) { setWorking(false); errorBox(error, errors); errors.scrollIntoView({ block: 'nearest' }); } }
      });
      build(model);
      if (remindersLayout) model.releaseViewport = bindRemindersDialogViewport(dialog);
      if (typeof options.onDialog === 'function') model.onDialogClose = options.onDialog(dialog);
      dialog.showModal(); body.scrollTop = 0;
      var first = body.querySelector('input:not([type=checkbox]):not([type=radio]),textarea,select'); if (first) first.focus({ preventScroll: true });
      return model;
    }
    function stagedEditor(title, plan, build, saveLabel, submit) {
      if (!current() || state.editing || state.busy || !stagedWritable(plan)) return null;
      var origin = doc.activeElement, dialog = node('dialog', 'vcp vcp-dialog vcp-staged-dialog'), form = node('form', 'vcp-form');
      if (remindersLayout) dialog.classList.add('vcp-reminders-dialog');
      var header = node('header', 'vcp-form-head'), titleWrap = node('div', ''); titleWrap.appendChild(node('p', 'vcp-form-patient', name(plan)));
      var heading = node('h2', '', title); heading.id = 'vcp-staged-title-' + ++serial; titleWrap.appendChild(heading); header.appendChild(titleWrap); dialog.setAttribute('aria-labelledby', heading.id);
      var closeButton = button('×', 'vcp-icon', cancel); closeButton.setAttribute('aria-label', 'Anuluj formularz planu'); header.appendChild(closeButton); form.appendChild(header);
      var body = node('div', 'vcp-form-body'), errors = node('div', 'vcp-form-errors'); body.appendChild(errors); form.appendChild(body);
      var footer = node('footer', 'vcp-form-actions'), cancelButton = button('Anuluj', 'vcp-outline', cancel), checkButton = button('Sprawdź zapis', 'vcp-outline', checkOutcome), saveButton = node('button', 'vcp-primary', saveLabel); saveButton.type = 'submit'; checkButton.hidden = true;
      footer.appendChild(cancelButton); footer.appendChild(checkButton); footer.appendChild(saveButton); form.appendChild(footer); dialog.appendChild(form);
      var model = { dialog: dialog, form: form, body: body, errors: errors, save: saveButton, cancel: cancel, plan: plan, pending: null, uncertain: false, submitted: false };
      editor = model; busy(false, true); doc.body.appendChild(dialog);
      function cancel() {
        if (state.busy) return;
        if (model.uncertain) { clear(errors); errorBox(new Error('Najpierw sprawdź wynik zapisu. Ponowienie użyje tej samej operacji i nie utworzy drugiego wpisu.'), errors); return; }
        if (model.releaseViewport) model.releaseViewport(); if (model.onDialogClose) model.onDialogClose();
        if (dialog.open) dialog.close(); dialog.remove(); if (editor === model) editor = null; busy(false, false); render();
        if (origin && origin.isConnected && origin.focus) origin.focus({ preventScroll: true }); if (state.stale) refresh();
      }
      function lockControls(working) {
        busy(working, true);
        Array.from(body.querySelectorAll('button,input,select,textarea')).forEach(function (control) { control.disabled = working || model.uncertain; });
        cancelButton.disabled = closeButton.disabled = working || model.uncertain; checkButton.disabled = working; checkButton.hidden = !model.uncertain;
        saveButton.disabled = working; saveButton.textContent = model.uncertain ? 'Ponów ten sam zapis' : saveLabel;
        if (!working && !model.uncertain && model.sync) model.sync();
      }
      function immutable(value) { if (value && typeof value === 'object') { Object.keys(value).forEach(function (key) { immutable(value[key]); }); Object.freeze(value); } return value; }
      function unknown(message) { model.uncertain = true; lockControls(false); clear(errors); errorBox(new Error(message || 'Nie udało się potwierdzić zapisu. Sprawdź jego wynik albo ponów tę samą operację.'), errors); }
      async function accept(result) {
        if (!result || result.saved !== true || result.planId !== plan.id || result.patientId !== plan.patientId) return false;
        var saved = result.plan || await vault.getCarePlan(plan.id);
        if (!current() || editor !== model) return true;
        if (!saved || saved.id !== plan.id || saved.patientId !== plan.patientId || !staged(saved)) throw new Error('Nie udało się potwierdzić zapisanego planu. Sprawdź wynik zapisu.');
        state.plans = state.plans.filter(function (entry) { return entry.id !== saved.id; }); state.plans.push(saved); state.selected = saved.id;
        state.filter = closed(saved) ? 'closed' : 'all'; model.uncertain = false; model.pending = null; state.stale = false; resetRecord(); lockControls(false); cancel();
        notify('Zapisano zmianę planu.'); if (options.onChange) options.onChange(result); await refresh(); return true;
      }
      async function checkOutcome() {
        if (!current() || editor !== model || state.busy || !model.pending || typeof vault.getStagedCarePlanOperation !== 'function') return;
        lockControls(true); clear(errors);
        try {
          var outcome = await vault.getStagedCarePlanOperation({ operationId: model.pending.operationId, planId: plan.id, patientId: plan.patientId });
          if (!current() || editor !== model) return;
          if (outcome && outcome.state === 'saved' && await accept(Object.assign({}, outcome, { saved: true }))) return;
          if (outcome && outcome.state === 'not-saved') { model.uncertain = false; model.pending = null; lockControls(false); errorBox(new Error('Potwierdzono brak zapisu. Możesz poprawić treść lub zapisać ponownie.'), errors); }
          else unknown();
        } catch (error) { if (current() && editor === model) unknown(error.message); }
      }
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); cancel(); });
      form.addEventListener('submit', async function (event) {
        event.preventDefault(); if (!current() || editor !== model || state.busy) return; clear(errors);
        if (!model.pending && (!form.reportValidity() || model.validate && !model.validate())) return;
        lockControls(true);
        try {
          if (!model.pending) {
            var request = await submit(model); if (!current() || editor !== model) return;
            if (!request) { lockControls(false); return; }
            model.pending = immutable(Object.assign({}, request, { operationId: operationId(), planId: plan.id, patientId: plan.patientId, expectedRevision: plan.rev }));
          }
          model.submitted = true;
          var result = await vault.mutateStagedCarePlan(model.pending);
          if (!current() || editor !== model) return;
          if (await accept(result)) return;
          if (!result || result.saved === true || result.outcome === 'unknown' || result.outcome === 'pending') unknown(result && result.message);
          else { model.pending = null; model.uncertain = false; model.submitted = false; lockControls(false); errorBox(new Error(result.message || (result.conflict ? 'Plan zmienił się od otwarcia formularza. Zachowaj treść, anuluj i otwórz aktualny plan.' : 'Nie zapisano zmiany. Sprawdź dane i spróbuj ponownie.')), errors); }
        } catch (error) {
          if (!current() || editor !== model) return;
          if (error && error.outcome === 'not-saved') { model.pending = null; model.uncertain = false; model.submitted = false; lockControls(false); errorBox(error, errors); }
          else if (model.pending && model.submitted) unknown(error.userMessage || error.message);
          else { lockControls(false); errorBox(error, errors); }
        }
      });
      build(model); if (remindersLayout) model.releaseViewport = bindRemindersDialogViewport(dialog); if (options.onDialog) model.onDialogClose = options.onDialog(dialog);
      dialog.showModal(); body.scrollTop = 0; var first = body.querySelector('input:not([type=checkbox]):not([type=radio]),textarea,select'); if (first) first.focus({ preventScroll: true }); return model;
    }
    function stagedDate(parent, label) { var input = field(parent, label, 'date', '', true); input.max = today(); return input; }
    function stagedDateValue(input) {
      if (!input.value || !nullableDate(input.value) || input.value < '1900-01-01' || input.value > today()) throw new Error('Podaj prawidłową datę, nie późniejszą niż dzisiaj.'); return input.value;
    }
    function stagedText(input, label, max) { var value = input.value.trim(); if (!value || value.length > (max || 20000)) throw new Error('Uzupełnij pole „' + label + '” (maksymalnie ' + (max || 20000) + ' znaków).'); return value; }
    function stagedDateAction(plan, stage, action) {
      var activation = action === 'activateStage';
      stagedEditor(activation ? 'Uruchom etap' : 'Przegląd etapu', plan, function (form) {
        notice(form.body, stage.title + (activation ? '\nWybierz faktyczną datę uruchomienia. Od niej zostaną wyznaczone terminy przypomnień.' : '\nSprawdź rozstrzygnięcia wszystkich kroków. Kolejny etap uruchomisz osobno.'));
        if (!activation) stage.steps.forEach(function (step) { help(form.body, step.title + ' · ' + (step.progress === 'omitted' ? 'Pominięty: ' + step.omission.reason : stagedOutcomeLabel(step.requiredOutcome) + ': ' + date(step.facts.find(function (fact) { return fact.kind === step.requiredOutcome; }).effectiveDateISO))); });
        form.date = stagedDate(form.body, activation ? 'Data uruchomienia etapu' : 'Data przeglądu etapu');
      }, activation ? 'Uruchom etap' : 'Potwierdź przegląd', function (form) { return { action: action, stageId: stage.id, effectiveDateISO: stagedDateValue(form.date) }; });
    }
    function stagedReasonAction(plan, action, target) {
      var titles = { omitStep: 'Pomiń krok', reopenStep: 'Wznów pominięty krok', reopenStage: 'Wznów etap', closePlan: 'Zamknij plan', reopenPlan: 'Wznów plan' };
      stagedEditor(titles[action], plan, function (form) {
        if (target) notice(form.body, target.title);
        form.reason = field(form.body, action === 'closePlan' ? 'Powód zakończenia planu' : 'Uzasadnienie', action === 'closePlan' ? 'text' : 'textarea', '', true); form.reason.maxLength = action === 'closePlan' ? 240 : 20000;
        if (action === 'closePlan') { form.text = field(form.body, 'Ustalenia przy zakończeniu', 'textarea', '', true); form.text.maxLength = 20000; }
        form.date = stagedDate(form.body, 'Data decyzji');
        var open = action === 'closePlan' && stagedView(plan).stages.some(function (stage) { return stage.controlState !== 'reviewed'; });
        if (open) form.confirm = check(form.body, 'Potwierdzam zakończenie planu z nieprzejrzanymi etapami lub nierozstrzygniętymi krokami', false, true);
      }, titles[action], function (form) {
        var request = { action: action, reason: stagedText(form.reason, 'Uzasadnienie', action === 'closePlan' ? 240 : 20000), effectiveDateISO: stagedDateValue(form.date), documentId: operationId() };
        if (action === 'closePlan') { if (form.confirm && !form.confirm.checked) throw new Error('Potwierdź zakończenie otwartych etapów.'); request.text = stagedText(form.text, 'Ustalenia przy zakończeniu'); request.confirmOpenWork = !!(form.confirm && form.confirm.checked); }
        if (target) request[action === 'reopenStage' ? 'stageId' : 'stepId'] = target.id; return request;
      });
    }
    function stagedReminder(plan, step) {
      stagedEditor('Przypomnienie kroku', plan, function (form) {
        notice(form.body, step.title); form.date = field(form.body, 'Data przypomnienia', 'date', step.reminderSchedule && step.reminderSchedule.dateISO, false); form.time = field(form.body, 'Godzina (opcjonalnie)', 'time', step.reminderSchedule && step.reminderSchedule.time, false); help(form.body, 'Pusta data usuwa przypomnienie tego kroku.');
      }, 'Zapisz przypomnienie', function (form) {
        if (form.date.value && !nullableDate(form.date.value) || form.time.value && (!form.date.value || !nullableTime(form.time.value))) throw new Error('Sprawdź datę i godzinę przypomnienia.');
        return { action: 'setReminder', stepId: step.id, dateISO: form.date.value || null, time: form.time.value || null };
      });
    }
    function stagedEvidencePicker(form, plan) {
      var box = node('section', 'vcp-staged-evidence'); form.body.appendChild(box);
      var searchInput = field(box, 'Szukaj dokumentu pacjenta', 'search', '', false), picker = selectField(box, 'Dokument pacjenta', [['', 'Wybierz dokument']], ''), preview = node('div', 'vcp-result-preview'); box.appendChild(preview);
      var selected = null, notes = [], ticket = 0, loading = true;
      function draw() {
        var previous = picker.value, query = searchKey(searchInput.value); clear(picker); var empty = node('option', '', loading ? 'Wczytywanie dokumentów…' : 'Wybierz dokument'); empty.value = ''; picker.appendChild(empty);
        notes.filter(function (note) { return !query || searchKey(note.title).includes(query); }).forEach(function (note) { var item = node('option', '', (note.title || 'Dokument pacjenta') + (note.clinicalDateISO ? ' · ' + date(note.clinicalDateISO) : '') + ' · ' + note.id); item.value = note.id; picker.appendChild(item); });
        picker.value = notes.some(function (note) { return note.id === previous && (!query || searchKey(note.title).includes(query)); }) ? previous : '';
        if (!picker.value) { selected = null; clear(preview); } picker.disabled = loading || state.busy || form.uncertain;
      }
      searchInput.addEventListener('input', draw);
      picker.addEventListener('change', async function () {
        if (!current() || editor !== form || state.busy) return;
        var id = picker.value, serial = ++ticket; selected = null; clear(preview); if (!id) return;
        try { var original = await vault.getPatientNote(id); if (!current() || editor !== form || serial !== ticket) return;
          if (!original || original.id !== id || original.patientId !== plan.patientId || !Number.isInteger(original.rev) || original.rev < 0 || original.category === 'care-plan') throw new Error('Dokument jest niedostępny. Wybierz go ponownie.');
          selected = original; preview.appendChild(node('h3', '', original.title || 'Dokument pacjenta')); originalContent(preview, original);
        } catch (error) { if (current() && editor === form && serial === ticket) errorBox(error, preview); }
      });
      Promise.resolve().then(function () { return vault.listPatientNotesForPatient(plan.patientId); }).then(function (result) {
        if (!current() || editor !== form) return; notes = (Array.isArray(result) ? result : []).filter(function (note) { return note.patientId === plan.patientId && recordId(note.id) && note.category !== 'care-plan' && !note.deleted; }); loading = false; draw();
      }).catch(function (error) { if (current() && editor === form) { loading = false; draw(); errorBox(error, preview); } }); draw();
      return { box: box, read: async function () {
        if (!selected || selected.id !== picker.value) throw new Error('Wybierz dokument i przeczytaj jego podgląd.');
        var original = await vault.getPatientNote(selected.id);
        if (!original || original.id !== selected.id || original.patientId !== plan.patientId || original.rev !== selected.rev) throw new Error('Dokument zmienił się. Wybierz go ponownie i sprawdź aktualną treść.');
        return { noteId: selected.id, sourceRecordRevAtCapture: selected.rev };
      } };
    }
    function stagedFact(plan, step, kind) {
      stagedEditor(stagedOutcomeLabel(kind), plan, function (form) {
        notice(form.body, step.title); form.date = stagedDate(form.body, { performance: 'Data wykonania', resultReceipt: 'Data otrzymania wyniku', decision: 'Data decyzji' }[kind]);
        form.mode = selectField(form.body, 'Dokumentacja', [['new', 'Nowy wpis'], ['existing', 'Istniejący dokument']], 'new');
        form.textBox = node('div', ''); form.text = field(form.textBox, 'Treść dokumentacji', 'textarea', '', true); form.text.maxLength = 20000; form.body.appendChild(form.textBox);
        form.evidence = stagedEvidencePicker(form, plan); form.evidence.box.hidden = true;
        form.confirm = check(form.body, 'Potwierdzam, że dokumentuje to ' + stagedOutcomeLabel(kind).toLocaleLowerCase('pl') + ' tego kroku', false, true);
        form.mode.addEventListener('change', function () { var existing = form.mode.value === 'existing'; form.textBox.hidden = existing; form.text.required = !existing; form.evidence.box.hidden = !existing; form.confirm.checked = false; });
      }, 'Zapisz potwierdzenie', async function (form) {
        if (!form.confirm.checked) throw new Error('Potwierdź rodzaj i znaczenie wpisu dla tego kroku.');
        var request = { action: 'recordFact', stepId: step.id, factId: operationId(), kind: kind, effectiveDateISO: stagedDateValue(form.date) };
        if (form.mode.value === 'existing') request.evidence = await form.evidence.read();
        else request.document = { id: operationId(), title: (stagedOutcomeLabel(kind) + ': ' + step.title).slice(0, 240), body: stagedText(form.text, 'Treść dokumentacji') }; return request;
      });
    }
    function stagedAssociation(plan, step) {
      stagedEditor('Powiąż dokument lub termin', plan, function (form) {
        notice(form.body, step.title + '\nPowiązanie pozwala odnaleźć dokument. Wykonanie, otrzymanie wyniku lub decyzję potwierdź osobnym wpisem.');
        form.kind = selectField(form.body, 'Rodzaj powiązania', [['document', 'Dokument'], ['result', 'Wynik'], ['event', 'Termin w Terminarzu']], 'document'); form.evidence = stagedEvidencePicker(form, plan);
        form.confirm = check(form.body, 'Potwierdzam powiązanie wybranego dokumentu z tym krokiem', false, true);
      }, 'Zapisz powiązanie', async function (form) {
        if (!form.confirm.checked) throw new Error('Potwierdź powiązanie dokumentu.');
        return { action: 'associate', stepId: step.id, associationId: operationId(), kind: form.kind.value, evidence: await form.evidence.read() };
      });
    }
    async function create() {
      if (!state.loaded && current()) await refresh();
      if (!state.loaded) return;
      if (!current() || state.editing || state.busy) return;
      if (!options.full && options.requestExpand) { options.requestExpand(null, true); return; }
      showEditor('Dodaj plan opieki', null, function (model) {
        var modes = node('nav', 'vcp-create-modes'); modes.setAttribute('aria-label', 'Sposób utworzenia planu');
        var emptyMode = button('Pusty plan', 'is-active'); emptyMode.setAttribute('aria-pressed', 'true'); modes.appendChild(emptyMode);
        var templateMode = button('Szablon', '', function () {
          function openLibrary() { var selectedPatient = model.patientId && model.patientId(); model.cancel(); openTemplateLibrary(null, { initialPatientId: selectedPatient || null }); }
          if (model.title.value.trim() || model.goal.value.trim()) {
            if (model.modeQuestion) return;
            var question = node('section', 'vcp-notice vcp-mode-question'); question.setAttribute('role', 'alert'); question.appendChild(node('p', '', 'Odrzucić wpisaną nazwę i ustalenia pustego planu, aby wybrać szablon?'));
            question.appendChild(button('Zostań', 'vcp-outline', function () { question.remove(); model.modeQuestion = null; templateMode.focus({ preventScroll: true }); }));
            question.appendChild(button('Odrzuć i wybierz szablon', 'vcp-primary', openLibrary)); model.modeQuestion = question; model.body.insertBefore(question, modes.nextSibling); question.scrollIntoView({ block: 'nearest' });
          } else openLibrary();
        }); templateMode.setAttribute('aria-pressed', 'false'); modes.appendChild(templateMode); model.body.appendChild(modes);
        var chosen = options.patientId ? state.patients.find(function (entry) { return entry.patientId === options.patientId; }) : null;
        var picker = node('section', 'vcp-picker'), patientSearch = field(picker, 'Szukaj pacjenta', 'search', '', false); patientSearch.placeholder = 'Nazwisko lub imię…'; patientSearch.autocomplete = 'off';
        var selection = node('div', 'vcp-selected-patient'), results = node('div', 'vcp-patient-results'), status = node('p', 'vcp-help'); status.setAttribute('role', 'status'); picker.appendChild(selection); picker.appendChild(status); picker.appendChild(results); model.body.appendChild(picker);
        function birthDate(record) {
          var value = record && record.header && record.header.dobISO;
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
          var parts = value.split('-').map(Number), parsed = new Date(value + 'T12:00:00Z');
          return !isNaN(parsed.getTime()) && parsed.getUTCFullYear() === parts[0] && parsed.getUTCMonth() + 1 === parts[1] && parsed.getUTCDate() === parts[2] ? value : '';
        }
        function patientIdentity(record) {
          var recordName = patientName(record), dob = birthDate(record), id = String(record.patientId || '');
          var peers = state.patients.filter(function (entry) { return searchKey(patientName(entry)) === searchKey(recordName); });
          var identity = dob ? 'ur. ' + date(dob) : 'Brak daty urodzenia';
          if (!dob || peers.some(function (entry) { return entry.patientId !== record.patientId && birthDate(entry) === dob; })) {
            var length = Math.min(8, id.length);
            while (length < id.length && peers.some(function (entry) { return entry.patientId !== record.patientId && String(entry.patientId || '').slice(0, length) === id.slice(0, length); })) length = Math.min(id.length, length + 4);
            identity += ' · ID wpisu: ' + id.slice(0, length);
          }
          return { text: identity, label: recordName + (peers.length > 1 ? ' · ' + identity : '') };
        }
        function patientSummary(record, target) {
          var identity = patientIdentity(record), summary = node('span', 'vcp-patient-summary'), details = node('span', 'vcp-help vcp-patient-identity', identity.text);
          details.id = 'vcp-patient-identity-' + ++serial;
          summary.appendChild(node('span', 'vcp-patient', patientName(record))); summary.appendChild(details); target.appendChild(summary);
          return { label: identity.label, descriptionId: details.id };
        }
        function renderPatients() {
          clear(selection); clear(results); patientSearch.parentElement.hidden = !!chosen; selection.hidden = !chosen;
          if (chosen) {
            patientSummary(chosen, selection);
            if (!options.patientId) selection.appendChild(button('Wyczyść wybór', 'vcp-text', function () { chosen = null; patientSearch.value = ''; renderPatients(); patientSearch.focus({ preventScroll: true }); }));
            status.textContent = 'Plan zostanie zapisany w Karcie wybranego pacjenta.';
          } else {
            var query = searchKey(patientSearch.value), matches = state.patients.filter(function (record) { return searchKey(patientName(record)).includes(query); });
            matches.slice(0, 20).forEach(function (record) {
              var item = button('', 'vcp-patient-option', function () { chosen = record; patientSearch.setCustomValidity(''); renderPatients(); });
              var identity = patientSummary(record, item); item.setAttribute('aria-label', identity.label); item.setAttribute('aria-describedby', identity.descriptionId);
              item.dataset.patientId = record.patientId; results.appendChild(item);
            });
            status.textContent = matches.length ? matches.length > 20 ? 'Pokazano 20 wyników. Wpisz więcej znaków, aby zawęzić listę.' : 'Wybierz pacjenta z listy.' : 'Brak pasujących pacjentów.';
          }
          model.save.disabled = !chosen || state.busy;
        }
        patientSearch.addEventListener('input', renderPatients); renderPatients();
        model.title = field(model.body, 'Nazwa planu', 'text', '', true); model.title.maxLength = 240;
        model.goal = field(model.body, 'Cel i ustalenia (opcjonalnie)', 'textarea', '', false); model.goal.maxLength = 20000;
        help(model.body, 'Po utworzeniu planu dodasz pierwszy krok albo dołączysz istniejący termin.');
        model.patientId = function () { return chosen && chosen.patientId; }; model.sync = renderPatients;
        model.validate = function () { if (chosen) return true; patientSearch.setCustomValidity('Wybierz pacjenta z listy.'); patientSearch.reportValidity(); return false; };
      }, 'Utwórz plan', function (model) { return { action: 'create', patientId: model.patientId(), title: model.title.value.trim(), goal: model.goal.value.trim() }; });
    }
    function stepFields(parent, value) {
      value = value || {}; var controls = {};
      controls.title = field(parent, 'Co jest do zrobienia?', 'text', value.title || '', true); controls.title.maxLength = 240;
      var pair = node('div', 'vcp-field-pair'); parent.appendChild(pair);
      controls.kind = selectField(pair, 'Rodzaj', KINDS, value.kind || 'Badanie'); controls.state = selectField(pair, 'Stan', [['pending', 'Do wykonania'], ['waiting', 'Oczekuję na wynik']], value.state || 'pending');
      controls.reminder = field(parent, 'Dzień przypomnienia / sprawdzenia', 'date', day(value.reminderDateISO), false);
      help(parent, 'Przyszły krok będzie w planie od razu, a w Do wykonania dopiero w swoim dniu. Termin możesz pozostawić pusty.');
      controls.calendar = check(parent, 'Mam ustalony termin wydarzenia', !!value.eventDateISO, false);
      controls.existingCalendarId = value.calendarNoteId || null;
      controls.detachRequested = false;
      var detachNotice = node('p', 'vcp-help', 'Termin zostanie odłączony od planu. Rezerwacja pozostanie w Terminarzu.'); detachNotice.setAttribute('role', 'status'); parent.appendChild(detachNotice);
      var eventFields = node('div', 'vcp-event-fields'); parent.appendChild(eventFields);
      controls.eventDate = field(eventFields, 'Termin wydarzenia', 'date', day(value.eventDateISO), true);
      controls.eventTime = field(eventFields, 'Godzina (opcjonalnie)', 'time', value.eventTime || '', false);
      if (value.calendarNoteId) help(parent, 'Zmiana dnia przypomnienia nie przesuwa terminu wydarzenia. Termin zmieniasz w osobnym polu.');
      controls.description = field(parent, 'Ustalenia (opcjonalnie)', 'textarea', value.description || '', false); controls.description.maxLength = 20000;
      controls.sync = function () { eventFields.hidden = !controls.calendar.checked; controls.eventDate.disabled = controls.eventTime.disabled = !controls.calendar.checked; detachNotice.hidden = !controls.detachRequested; };
      controls.calendar.addEventListener('change', function () { controls.detachRequested = !!controls.existingCalendarId && !controls.calendar.checked; controls.sync(); }); controls.sync(); return controls;
    }
    function stepValue(controls) {
      var value = { title: controls.title.value.trim(), kind: controls.kind.value, state: controls.state.value, reminderDateISO: controls.reminder.value || null, eventDateISO: controls.calendar.checked ? controls.eventDate.value : null, eventTime: controls.calendar.checked ? controls.eventTime.value || null : null, description: controls.description.value.trim() };
      if (controls.detachRequested) value.detachEvent = true;
      return value;
    }
    function stepForm(plan, step) {
      if (closed(plan)) return;
      showEditor(step ? 'Edytuj krok' : 'Dodaj krok do planu', plan, function (model) { notice(model.body, plan.title + '\nKroki mogą być realizowane równolegle. Każdy zachowuje własny termin i stan.'); model.fields = stepFields(model.body, step); model.sync = model.fields.sync; }, step ? 'Zapisz zmianę' : 'Dodaj krok', function (model) { return { action: step ? 'editStep' : 'addStep', stepId: step && step.id, step: stepValue(model.fields) }; });
    }
    function sixMonths() { var value = new Date(), dateNum = value.getDate(); value.setDate(1); value.setMonth(value.getMonth() + 6); var last = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate(); value.setDate(Math.min(dateNum, last)); return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0'); }
    function continuationFields(model, plan, step) {
      var otherOpen = openSteps(plan).some(function (entry) { return entry.id !== step.id; });
      var group = node('fieldset', 'vcp-continuation'); group.appendChild(node('legend', '', 'Co dalej w tym planie?')); var choices = node('div', 'vcp-radio-options'); group.appendChild(choices); model.body.appendChild(group);
      var selected = otherOpen ? 'existing' : 'later', radios = [];
      [['existing', 'Plan ma już dalsze kroki'], ['later', 'Ustalę później'], ['next', 'Dodaję kolejny krok']].forEach(function (entry) {
        if (entry[0] === 'existing' && !otherOpen) return;
        var label = node('label', ''), input = node('input', ''); input.type = 'radio'; input.name = 'continuation-' + serial; input.value = entry[0]; input.checked = selected === entry[0]; label.appendChild(input); label.appendChild(node('span', '', entry[1])); choices.appendChild(label); radios.push(input);
      });
      var later = node('div', 'vcp-later'); model.body.appendChild(later); var decisionDate = field(later, 'Kiedy wrócić do ustalenia dalszego postępowania?', 'date', today(), true); help(later, 'Plan pozostanie otwarty. W podanym dniu pojawi się sprawa do ustalenia.');
      var next = node('div', 'vcp-next-fields'); model.body.appendChild(next);
      var title = field(next, 'Kolejny krok', 'text', '', true); title.maxLength = 240;
      var due = field(next, 'Przypomnij w dniu', 'date', '', true);
      next.appendChild(button('Za 6 miesięcy', 'vcp-date-shortcut', function () { due.value = sixMonths(); }));
      var kind = selectField(next, 'Rodzaj kolejnego kroku', KINDS, 'Kontrola');
      var calendar = check(next, 'Mam ustalony termin — dodaj do Terminarza', false, false);
      var eventFields = node('div', 'vcp-next-calendar'); next.appendChild(eventFields);
      var eventDate = field(eventFields, 'Termin kolejnego wydarzenia', 'date', '', true), eventTime = field(eventFields, 'Godzina kolejnego wydarzenia (opcjonalnie)', 'time', '', false);
      function choice() { return radios.find(function (input) { return input.checked; }).value; }
      function sync() {
        var value = choice(); later.hidden = value !== 'later'; next.hidden = value !== 'next'; decisionDate.disabled = value !== 'later';
        Array.from(next.querySelectorAll('input,select,button')).forEach(function (input) { input.disabled = value !== 'next'; });
        eventFields.hidden = value !== 'next' || !calendar.checked; eventDate.disabled = eventTime.disabled = value !== 'next' || !calendar.checked;
      }
      radios.forEach(function (input) { input.addEventListener('change', sync); }); calendar.addEventListener('change', sync); sync(); model.sync = sync;
      return function () { var value = choice(); return { continuation: value, decisionDateISO: value === 'later' ? decisionDate.value : null, next: value === 'next' ? { title: title.value.trim(), kind: kind.value, state: 'pending', reminderDateISO: due.value, eventDateISO: calendar.checked ? eventDate.value : null, eventTime: calendar.checked ? eventTime.value || null : null, description: '' } : null }; };
    }
    function outcome(plan, step, action) {
      if (closed(plan)) return;
      var result = action === 'result', wait = action === 'wait';
      showEditor(result ? 'Wpisz wynik' : wait ? 'Zapisz wykonanie i oczekiwanie' : 'Zapisz wykonanie', plan, function (model) {
        notice(model.body, step.title + '\n' + (result ? 'Wynik będzie dostępny w planie i Badaniach Karty pacjenta. Zakończenie kroku pozostawi plan otwarty.' : wait ? 'Badanie zostanie zakończone. Dodamy osobny krok oczekiwania na wynik.' : 'Opis wykonania pozostanie w przebiegu planu.'));
        model.text = field(model.body, result ? 'Treść wyniku' : 'Co wykonano / jakie są ustalenia?', 'textarea', '', true); model.text.maxLength = 20000;
        model.date = field(model.body, result ? 'Data otrzymania wyniku' : 'Data wykonania', 'date', today(), true);
        model.date.max = today();
        if (wait) { model.check = field(model.body, 'Kiedy sprawdzić dostępność wyniku?', 'date', '', true); help(model.body, 'To dzień przypomnienia, odrębny od terminu badania.'); }
        else model.continuation = continuationFields(model, plan, step);
      }, result ? 'Zapisz wynik' : wait ? 'Zapisz i oczekuj' : 'Zapisz wykonanie', function (model) { return Object.assign({ action: action, stepId: step.id, text: model.text.value.trim(), dateISO: model.date.value, checkDateISO: wait ? model.check.value : null }, wait ? {} : model.continuation()); });
    }
    function actualDateValid(model, control, message) {
      if (control.value && nullableDate(control.value) && control.value >= '1900-01-01' && control.value <= today()) return true;
      errorBox(new Error(message), model.errors); control.focus({ preventScroll: true }); return false;
    }
    function omitStep(plan, step) {
      if (closed(plan) || plan.syncNeedsReview || step.state === 'done' || step.state === 'cancelled') return;
      showEditor('Pomiń krok', plan, function (model) {
        notice(model.body, step.title + '\nPominięcie zakończy oczekiwanie na ten krok. Dotychczasowe wykonanie, wyniki i rezerwacja w Terminarzu pozostaną zachowane.');
        model.text = field(model.body, 'Powód pominięcia', 'textarea', '', true); model.text.maxLength = 20000;
        model.date = field(model.body, 'Data decyzji', 'date', today(), true); model.date.min = '1900-01-01'; model.date.max = today();
        help(model.body, 'Uzasadnienie i data decyzji pozostaną w przebiegu planu. Plan pozostanie otwarty.');
        model.validate = function () {
          if (!model.text.value.trim() || model.text.value.length > 20000) { errorBox(new Error('Podaj powód pominięcia (do 20 000 znaków).'), model.errors); model.text.focus({ preventScroll: true }); return false; }
          return actualDateValid(model, model.date, 'Podaj prawidłową datę decyzji, nie późniejszą niż dzisiaj.');
        };
      }, 'Zapisz pominięcie', function (model) { return { action: 'omitStep', stepId: step.id, text: model.text.value.trim(), dateISO: model.date.value }; });
    }
    function restoreOmittedStep(plan, step, confirmed) {
      var omission = omissionFor(plan, step);
      if (closed(plan) || plan.syncNeedsReview || step.state !== 'cancelled' || !omission || omission.protected !== true) return;
      showEditor(confirmed ? 'Wznów pominięty krok' : 'Wznów krok', plan, function (model) {
        notice(model.body, step.title + '\nDotychczasowe wykonanie, wyniki i rezerwacja w Terminarzu pozostaną zachowane.');
        model.restoreState = selectField(model.body, 'Stan po wznowieniu', [['', 'Wybierz stan'], ['pending', 'Do wykonania'], ['waiting', 'Oczekuję na wynik']], ''); model.restoreState.required = true;
        model.text = field(model.body, 'Powód wznowienia kroku', 'textarea', '', true); model.text.maxLength = 20000;
        model.date = field(model.body, 'Data wznowienia kroku', 'date', today(), true); model.date.min = '1900-01-01'; model.date.max = today();
        help(model.body, 'Krok zachowa dotychczasowy termin przypomnienia. Po wznowieniu możesz go zmienić w edycji kroku.');
        model.validate = function () {
          if (!['pending', 'waiting'].includes(model.restoreState.value)) { errorBox(new Error('Wybierz stan kroku po wznowieniu.'), model.errors); model.restoreState.focus({ preventScroll: true }); return false; }
          if (!model.text.value.trim() || model.text.value.length > 20000) { errorBox(new Error('Podaj powód wznowienia kroku (do 20 000 znaków).'), model.errors); model.text.focus({ preventScroll: true }); return false; }
          return actualDateValid(model, model.date, 'Podaj prawidłową datę wznowienia, nie późniejszą niż dzisiaj.');
        };
      }, 'Wznów krok', function (model) { return { action: 'editStep', restoreOmitted: true, stepId: step.id, step: { state: model.restoreState.value }, text: model.text.value.trim(), dateISO: model.date.value }; });
    }
    function linkResult(plan, step) {
      if (closed(plan) || plan.syncNeedsReview || step.state === 'done' || step.state === 'cancelled') return;
      var model = showEditor('Podepnij istniejący wynik', plan, function (form) {
        notice(form.body, step.title + '\nPlan otrzyma odnośnik do oryginalnego wyniku w Badaniach. Treść i daty oryginału pozostaną zachowane.');
        form.search = field(form.body, 'Szukaj wyniku', 'search', '', false); form.search.placeholder = 'Nazwa lub rodzaj badania…';
        form.options = field(form.body, 'Wybierz wynik', 'select', '', true);
        form.status = node('p', 'vcp-help', 'Wczytywanie wyników…'); form.status.setAttribute('role', 'status'); form.body.appendChild(form.status);
        form.preview = node('section', 'vcp-result-preview'); form.preview.setAttribute('aria-label', 'Podgląd wybranego wyniku'); form.preview.setAttribute('role', 'region'); form.preview.hidden = true; form.body.appendChild(form.preview);
        form.date = field(form.body, 'Data otrzymania wyniku', 'date', '', true); form.date.min = '1900-01-01'; form.date.max = today();
        help(form.body, 'Wpisz dzień rzeczywistego otrzymania tego wyniku. Data badania widoczna w podglądzie pozostaje datą oryginału.');
        form.confirm = check(form.body, 'Potwierdzam, że to otrzymany wynik tego kroku', false, true);
        form.continuation = continuationFields(form, plan, step);
        var continuationSync = form.sync;
        form.notes = []; form.selected = null; form.loading = true; form.previewLoading = false; form.previewTicket = 0; form.listTicket = 0;
        form.sync = function () {
          continuationSync(); form.search.disabled = form.options.disabled = state.busy || form.loading || form.previewLoading;
          form.date.disabled = form.confirm.disabled = state.busy || !form.selected;
          form.save.disabled = state.busy || form.loading || form.previewLoading || !form.selected;
        };
        function resetSelection() { form.previewTicket += 1; form.selected = null; form.previewLoading = false; form.preview.hidden = true; clear(form.preview); form.preview.removeAttribute('data-note-id'); form.confirm.checked = false; form.date.value = ''; }
        form.render = function () {
          var query = searchKey(form.search.value), before = form.options.value;
          var choices = form.notes.filter(function (note) { return !query || searchKey((note.title || '') + ' ' + (note.labResult && note.labResult.test || '')).includes(query); });
          clear(form.options); var placeholder = node('option', '', 'Wybierz wynik pacjenta'); placeholder.value = ''; form.options.appendChild(placeholder);
          choices.forEach(function (note) {
            var title = note.title || 'Wynik pacjenta', clinicalDay = day(note.clinicalDateISO), label = title + (clinicalDay ? ' · badanie / ustalenie: ' + date(clinicalDay) : '');
            if (choices.some(function (other) { return other.id !== note.id && (other.title || 'Wynik pacjenta') === title && day(other.clinicalDateISO) === clinicalDay; })) label += ' · ID wpisu: ' + note.id;
            var option = node('option', '', label); option.value = note.id; form.options.appendChild(option);
          });
          form.options.value = choices.some(function (note) { return note.id === before; }) ? before : '';
          if (!form.options.value && (form.selected || form.previewLoading)) resetSelection();
          form.status.textContent = form.loading ? 'Wczytywanie wyników…' : choices.length ? 'Wybierz wynik i sprawdź jego oryginalną treść.' : 'Brak pasujących wyników do podpięcia.';
          form.sync();
        };
        form.search.addEventListener('input', form.render);
        form.options.addEventListener('change', async function () {
          if (!current() || editor !== form || state.busy) return;
          resetSelection(); clear(form.errors);
          var candidate = form.notes.find(function (note) { return note.id === form.options.value; });
          if (!candidate) { form.sync(); return; }
          var ticket = ++form.previewTicket; form.previewLoading = true; form.preview.hidden = false;
          form.preview.appendChild(node('p', 'vcp-help', 'Wczytywanie wyniku…')); form.sync();
          try {
            var original = await vault.getCarePlanResultCandidate({ planId: plan.id, stepId: step.id, noteId: candidate.id, linkedRev: candidate.rev, linkedUpdatedAtISO: candidate.updatedAtISO });
            if (!current() || editor !== form || ticket !== form.previewTicket) return;
            if (!original || original.id !== candidate.id || original.patientId !== plan.patientId) throw new Error('Ten wynik jest niedostępny. Odśwież listę i wybierz go ponownie.');
            form.selected = original; clear(form.preview); form.preview.dataset.noteId = original.id;
            form.preview.appendChild(node('h3', '', original.title || 'Wynik pacjenta')); originalContent(form.preview, original);
          } catch (error) {
            if (!current() || editor !== form || ticket !== form.previewTicket) return;
            form.preview.hidden = true; clear(form.preview); errorBox(error, form.errors);
          } finally { if (current() && editor === form && ticket === form.previewTicket) { form.previewLoading = false; form.sync(); } }
        });
        form.validate = function () {
          if (!form.selected || form.selected.id !== form.options.value) { errorBox(new Error('Wybierz wynik i sprawdź jego podgląd.'), form.errors); form.options.focus({ preventScroll: true }); return false; }
          if (!form.confirm.checked) { errorBox(new Error('Potwierdź, że wybrany dokument zawiera otrzymany wynik tego kroku.'), form.errors); form.confirm.focus({ preventScroll: true }); return false; }
          return actualDateValid(form, form.date, 'Podaj prawidłową datę otrzymania wyniku, nie późniejszą niż dzisiaj.');
        };
        form.reload = async function () {
          if (!current() || editor !== form || state.busy) return;
          var ticket = ++form.listTicket; resetSelection(); form.options.value = ''; form.loading = true; form.render(); clear(form.errors);
          try {
            if (typeof vault.listCarePlanResultCandidates !== 'function' || typeof vault.getCarePlanResultCandidate !== 'function') throw new Error('Odśwież aplikację, aby podpiąć istniejący wynik.');
            var notes = await vault.listCarePlanResultCandidates({ planId: plan.id, stepId: step.id });
            if (!current() || editor !== form || ticket !== form.listTicket) return;
            form.notes = (Array.isArray(notes) ? notes : []).filter(function (note) { return note && recordId(note.id) && note.patientId === plan.patientId; });
          } catch (error) { if (current() && editor === form && ticket === form.listTicket) { form.notes = []; errorBox(error, form.errors); } }
          finally { if (current() && editor === form && ticket === form.listTicket) { form.loading = false; form.render(); } }
        };
        form.body.appendChild(button('Odśwież listę wyników', 'vcp-text', form.reload)); form.sync();
      }, 'Podepnij wynik', function (form) { return Object.assign({ action: 'linkResult', stepId: step.id, noteId: form.selected.id, linkedRev: form.selected.rev, linkedUpdatedAtISO: form.selected.updatedAtISO, dateISO: form.date.value, confirmReceived: form.confirm.checked === true }, form.continuation()); });
      if (model) model.reload();
    }
    function editPlan(plan) {
      showEditor('Nazwa i cel planu', plan, function (model) { model.title = field(model.body, 'Nazwa planu', 'text', plan.title, true); model.title.maxLength = 240; model.goal = field(model.body, 'Cel i ustalenia (opcjonalnie)', 'textarea', plan.goal, false); model.goal.maxLength = 20000; }, 'Zapisz', function (model) { return { action: 'edit', title: model.title.value.trim(), goal: model.goal.value.trim() }; });
    }
    async function removePlanNote(plan, entry) {
      if (!current() || state.editing || state.busy || state.selected !== plan.id || !activePlan()
        || activePlan().rev !== plan.rev || historyLogKey(activePlan()) !== historyLogKey(plan) || !removableNote(plan, entry)) return;
      var ticket = ++noteRemovalSequence, selection = selectionSequence, logKey = historyLogKey(plan);
      busy(true, false); notify('Sprawdzanie aktualnego wpisu…');
      try {
        var snapshot = await readNoteEntries(plan);
        if (!current() || ticket !== noteRemovalSequence || selection !== selectionSequence || state.selected !== plan.id
          || !activePlan() || activePlan().rev !== plan.rev || historyLogKey(activePlan()) !== logKey) return;
        var target = snapshot && snapshot.matches && snapshot.entries.find(function (item) {
          return item.removable && !item.removed && item.noteId === entry.noteId && item.text === entry.text && item.dateISO === entry.dateISO;
        });
        if (!target || activePlan().syncNeedsReview) throw new Error('Wpis zmienił się lub nie można potwierdzić możliwości jego usunięcia. Odśwież plan i spróbuj ponownie.');
        busy(false, false); notify('');
        showEditor('Usuń wpis', plan, function (model) {
          notice(model.body, 'Wpis zniknie z przebiegu planu. Wcześniejszy zapis pozostanie w historii zmian dostępnej w Opcjach planu.');
          model.body.appendChild(node('p', 'vcp-help', 'Data ustalenia: ' + date(target.dateISO)));
          model.body.appendChild(node('div', 'vcp-note-removal-text', target.text));
        }, 'Usuń wpis', function () { return { action: 'removePlanNote', noteId: target.noteId, linkedRev: target.linkedRev, readToken: target.readToken }; });
      } catch (error) {
        if (current() && ticket === noteRemovalSequence) notify(error && error.message || 'Nie udało się odczytać wpisu. Spróbuj ponownie.');
      } finally {
        if (current() && ticket === noteRemovalSequence && !editor) { busy(false, false); render(); if (state.stale) refresh(); }
      }
    }
    function addNote(plan) {
      showEditor('Zapisz ustalenie', plan, function (model) { notice(model.body, 'Wpis będzie dostępny w przebiegu planu.'); model.text = field(model.body, 'Co ustalono?', 'textarea', '', true); model.text.maxLength = 20000; model.date = field(model.body, 'Data ustalenia', 'date', today(), true); model.date.max = today(); }, 'Zapisz ustalenie', function (model) { return { action: 'addNote', text: model.text.value.trim(), dateISO: model.date.value }; });
    }
    function closePlan(plan) {
      if (plan.syncNeedsReview) { notify('Najpierw sprawdź kroki i ustalenia oraz potwierdź przegląd planu po synchronizacji.'); return; }
      var open = openSteps(plan);
      showEditor('Zamknij plan', plan, function (model) {
        notice(model.body, open.length ? 'Pozostaje ' + open.length + ' otwartych kroków. Zamknięcie nie oznacza, że zostały wykonane.' : 'Wszystkie kroki zostały rozstrzygnięte. Zapisz, dlaczego kończysz ten plan.', !!open.length);
        model.reason = selectField(model.body, 'Powód zamknięcia', ['Cel planu osiągnięty', 'Opiekę przekazano innemu specjaliście', 'Odstąpiono od dalszej realizacji'], 'Cel planu osiągnięty');
        model.text = field(model.body, 'Ustalenia / komu przekazano opiekę?', 'textarea', '', true); model.text.maxLength = 20000;
        if (open.length) { model.cancelOpen = check(model.body, 'Kończę pozostałe kroki jako niewykonane', false, true); help(model.body, 'Powiązane terminy pozostają w Terminarzu. Ich zmianę lub odwołanie ustal osobno. Skierowanie nie oznacza wykonania konsultacji ani operacji.'); }
      }, 'Zamknij plan', function (model) { return { action: 'close', reason: model.reason.value, text: model.text.value.trim(), cancelOpen: !open.length || model.cancelOpen.checked }; });
    }
    function acknowledgeMerge(plan) {
      var resolveClosed = closed(plan) && openSteps(plan).length;
      showEditor('Przegląd planu po synchronizacji', plan, function (model) {
        notice(model.body, reviewExplanation(plan) + ' Wcześniejsze wersje pozostaną dostępne w Opcjach planu.', true);
        if (resolveClosed) {
          notice(model.body, 'W zamkniętym planie zachowano ' + openSteps(plan).length + ' nierozstrzygniętych kroków. Jeśli mają być kontynuowane, wznów plan i osobno potwierdź przegląd.');
          model.body.appendChild(button('Wznów plan', 'vcp-outline', function () { model.cancel(); reopen(plan); }));
          model.cancelOpen = check(model.body, 'Zachowuję zamknięcie i kończę pozostałe kroki jako niewykonane', false, true);
          model.text = field(model.body, 'Uzasadnienie zakończenia zachowanych kroków bez wykonania', 'textarea', '', true); model.text.maxLength = 20000;
          help(model.body, 'Powiązane terminy pozostają w Terminarzu. Ich zmianę lub odwołanie ustal osobno.');
        } else notice(model.body, closed(plan) ? 'Plan pozostanie zamknięty. Przegląd nie wznowi planu ani przypomnień jego kroków.' : 'Potwierdzenie ujednolici terminy i stany wpisów w Terminarzu oraz przypomnień zgodnie z wyświetlonym planem. Najpierw popraw ewentualne rozbieżności.');
      }, 'Potwierdzam przegląd planu', function (model) { return resolveClosed ? { action: 'acknowledgeMerge', cancelOpen: model.cancelOpen.checked, text: model.text.value.trim() } : { action: 'acknowledgeMerge' }; });
    }
    function reopen(plan) {
      showEditor('Wznów plan', plan, function (model) { notice(model.body, 'Historia wykonanych kroków zostanie zachowana. Po wznowieniu ustalisz kolejny krok.'); model.text = field(model.body, 'Powód wznowienia (opcjonalnie)', 'textarea', '', false); }, 'Wznów plan', function (model) { return { action: 'reopen', text: model.text.value.trim() }; });
    }
    function linkEvent(plan) {
      if (closed(plan)) return;
      var model = showEditor('Dołącz istniejący termin', plan, function (form) {
        notice(form.body, 'Dołączasz istniejący wpis pacjenta z Terminarza. Nie utworzymy drugiego wydarzenia.');
        form.search = field(form.body, 'Szukaj terminu', 'search', '', false); form.search.placeholder = 'Treść wydarzenia…';
        form.options = field(form.body, 'Wybierz termin', 'select', '', true);
        form.due = field(form.body, 'Dzień przypomnienia / sprawdzenia', 'date', '', false);
        help(form.body, 'Dzień przypomnienia może różnić się od terminu wydarzenia.'); form.status = node('p', 'vcp-help', 'Wczytywanie terminów…'); form.status.setAttribute('role', 'status'); form.body.appendChild(form.status); form.save.disabled = true; form.notes = [];
        form.render = function () {
          var query = searchKey(form.search.value), before = form.options.value; clear(form.options);
          var choices = form.notes.filter(function (note) { return !query || searchKey((note.title || '') + ' ' + (note.body || '')).includes(query); });
          choices.forEach(function (note) { var option = node('option', '', date(note.dueDateISO) + (note.dueTime ? ' · ' + note.dueTime : '') + ' · ' + (note.title || 'Wydarzenie')); option.value = note.id; form.options.appendChild(option); });
          if (choices.some(function (note) { return note.id === before; })) form.options.value = before;
          form.status.textContent = choices.length ? 'Wybierz istniejący termin tego pacjenta.' : 'Brak pasujących niepowiązanych terminów.'; form.save.disabled = !choices.length || state.busy;
        };
        form.search.addEventListener('input', form.render); form.sync = form.render;
      }, 'Dołącz termin', function (form) { return { action: 'linkEvent', noteId: form.options.value, reminderDateISO: form.due.value || null }; });
      if (!model) return;
      Promise.resolve(vault.listPatientNotesForPatient(plan.patientId)).then(function (notes) {
        if (!current() || editor !== model) return;
        var used = new Set(state.plans.flatMap(function (entry) { return steps(entry).map(function (step) { return step.calendarNoteId; }); }).filter(Boolean));
        model.notes = (notes || []).filter(function (note) { return note && note.dueDateISO && !note.completedAtISO && !note.noShowAtISO && !used.has(note.id) && !(note.careContext && (note.careContext.planId || ['plan', 'step', 'decision'].includes(note.careContext.role))); }).sort(function (a, b) { return String(a.dueDateISO).localeCompare(String(b.dueDateISO)); }); model.render();
      }).catch(function (error) { if (current() && editor === model) { clear(model.errors); errorBox(error, model.errors); model.status.textContent = 'Nie udało się wczytać terminów. Anuluj formularz i spróbuj ponownie.'; } });
    }
    async function openTemplateLibrary(sourcePlanId, settings) {
      if (!current() || state.editing || state.busy) return;
      settings = settings || {};
      busy(true, true);
      try {
        var application = typeof vault.getCarePlanApplicationProvider === 'function' ? vault.getCarePlanApplicationProvider() : null;
        var view = await openTemplates({ vault: vault, sourcePlanId: sourcePlanId || null, patientId: options.patientId || null,
          initialPatientId: settings.initialPatientId || null, navigationContext: settings.navigationContext || null, application: application, isCurrent: current, remindersLayout: remindersLayout,
          onDialog: options.onDialog,
          onBusy: function (working) { if (current()) busy(working, true); },
          onApplied: function (result, context) {
            Promise.resolve().then(async function () {
              if (!current() || !result || result.saved !== true || !result.planId || options.patientId && result.patientId !== options.patientId) return;
              var saved = result.plan || await vault.getCarePlan(result.planId);
              if (!current() || !saved || saved.id !== result.planId || saved.patientId !== result.patientId) return;
              templateReturn = { planId: saved.id, context: context && context.returnContext || null };
              state.plans = state.plans.filter(function (plan) { return plan.id !== saved.id; }); state.plans.push(saved);
              if (templateView) { var library = templateView; templateView = null; library.destroy(); }
              state.filter = closed(saved) ? 'closed' : 'all'; state.query = ''; search.value = ''; busy(false, false);
              // Preparing native storage in the library can change capability since this view mounted.
              await refresh(); if (current()) await select(saved.id);
              if (options.onChange) options.onChange(result);
            }).catch(function () { if (current()) notify('Plan został zapisany. Odśwież listę planów, aby go otworzyć.'); });
          },
          onClose: function () { templateView = null; if (current()) { busy(false, false); render(); if (state.stale) refresh(); } }
        });
        if (!current()) { if (view) view.destroy(); return; }
        templateView = view; if (!view) busy(false, false);
      } catch (error) { if (current()) { busy(false, false); notify(error && error.message || 'Nie udało się otworzyć szablonów.'); } }
    }
    function destroy() {
      if (destroyed) return; destroyed = true; sequence += 1; selectionSequence += 1; historySequence += 1; noteEntriesSequence += 1; noteRemovalSequence += 1; historySnapshot = null; noteEntriesSnapshot = null; archivePlanId = null; archiveOrigin = null; resetRecord(); syncVersionState.clear(); if (refreshTimer) win.clearTimeout(refreshTimer);
      if (templateView) { templateView.destroy(); templateView = null; }
      if (lifecycleObserver) lifecycleObserver.disconnect();
      if (editor) {
        if (editor.releaseViewport) editor.releaseViewport();
        if (typeof editor.onDialogClose === 'function') editor.onDialogClose();
        if (editor.dialog.open) editor.dialog.close(); editor.dialog.remove(); editor = null;
      }
      unsubscribe.forEach(function (fn) { try { if (typeof fn === 'function') fn(); } catch {} });
      doc.removeEventListener('vilda:sync-merged', scheduleRefresh); root.remove(); if (options.onBusy) options.onBusy(false, false);
    }
    function refreshNavigation() {
      if (!current()) return;
      var hasReturn = typeof options.hasReturn === 'function' && options.hasReturn() === true;
      var label = typeof options.backLabel === 'function' ? options.backLabel() : options.backLabel;
      Array.from(detail.querySelectorAll('[data-vcp-parent-back]')).forEach(function (item) {
        var fromTemplate = templateReturn && templateReturn.planId === state.selected;
        item.classList.toggle('vcp-parent-return', hasReturn || !!fromTemplate); item.textContent = fromTemplate ? '← Szablon' : label || '← Lista planów';
      });
    }
    unsubscribe.push(observeVault(vault, scheduleRefresh, destroy));
    doc.addEventListener('vilda:sync-merged', scheduleRefresh);
    if (typeof win.MutationObserver === 'function' && doc.body) {
      lifecycleObserver = new win.MutationObserver(function () { if (!current()) destroy(); });
      lifecycleObserver.observe(doc.body, { childList: true, subtree: true });
    }
    var controller = { refresh: refresh, refreshNavigation: refreshNavigation, destroy: destroy, create: create, select: select, openRecord: openRecord, openTemplates: openTemplateLibrary, isEditing: function () { return state.editing || state.busy; }, getSelected: function () { return state.selected; }, getContext: function () { return { planId: state.selected, noteId: recordNoteId, detail: state.detail }; } };
    refresh(); return controller;
  }
  win.VildaCarePlans = { mount: mount, projectPatientNotes: projectPatientNotes, resolveNoteDestination: resolveNoteDestination, ensureTemplateLibrary: ensureTemplateLibrary, openTemplates: openTemplates };
})(typeof window !== 'undefined' ? window : null);
