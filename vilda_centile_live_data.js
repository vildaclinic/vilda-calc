/* Read-only data boundary for the dedicated new-measurement panel and summary chart tab.
 * Patient/operation tokens are RAM-only. This module never collects, saves or restores
 * a payload, changes a form field, or asks the calculator to recalculate.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLiveData) return;

  var d = w.document;
  var generation = 0;
  var token = null;
  var saveRefresh = null;
  var recordRequest = null;
  var timelineRequest = null;
  var historyRevision = 0;
  var listeners = new Set();
  var boundVault = null;
  var updateHookRegistered = false;
  var measurementEdit = null;
  var measurementCommit = null;
  var measurementRevision = 0;
  var lastSnapshot = null;
  var hadSelectedPatient = !!patientId();
  var draftAllowed = !hadSelectedPatient;
  var clearingPatientId = null;
  var terminalClear = false;
  var deletedPatientId = null;
  var startupSettled = !(d && typeof d.readyState === 'string' && w.VildaInit);
  var startupScheduled = false;

  function copy(value) {
    try { return value == null ? null : JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }

  function field(id) { return d && d.getElementById(id); }

  function number(value) {
    if (value == null || String(value).trim() === '') return null;
    var parsed = Number(String(value).trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function positive(value) {
    var parsed = number(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  }

  function sessionValue(key) {
    try { return w.sessionStorage ? w.sessionStorage.getItem(key) : null; }
    catch (_) { return null; }
  }

  function patientId() {
    // A readable session, including an absent ID after clear/lock, beats a frame's cache.
    try {
      if (w.sessionStorage) return w.sessionStorage.getItem('vildaCurrentPatientId') || null;
    } catch (_) { return null; }
    return typeof w._vildaCurrentPatientId === 'string' ? w._vildaCurrentPatientId || null : null;
  }

  function activeRoute() {
    var path = String(w.location && w.location.pathname || '');
    var route = /(?:^|\/)docpro\.html$/.test(path) ? 'docpro'
      : /(?:^|\/)index\.html$/.test(path) || path === '/' ? 'start' : null;
    if (!route) return null;
    try {
      var frame = w.frameElement;
      if (frame && (frame.hidden || frame.isConnected === false || frame.contentWindow !== w)) return null;
    } catch (_) { return null; }
    return route;
  }

  function activeAge() {
    var years = field('age'), months = field('ageMonths');
    var y = number(years && years.value), m = number(months && months.value);
    if (y === null && m === null || y !== null && y < 0 || m !== null && m < 0) return null;
    var result = typeof w.getCurrentCentileChartAgeMonths === 'function'
      ? w.getCurrentCentileChartAgeMonths() : Math.round((y || 0) * 12 + (m || 0));
    return Number.isFinite(result) && result >= 0 && result < 216 ? result : null;
  }

  function activePopulation() {
    return typeof w.VildaPopulacjaPacjenta === 'function' && w.VildaPopulacjaPacjenta() === 'DS' ? 'DS' : 'OGOLNA';
  }

  function populationState(id) {
    var source = w.VildaDsSource;
    if (!id || !source || typeof source.getState !== 'function') return null;
    var state = source.getState();
    if (!state || state.patientId !== id || state.status === 'idle' || state.status === 'pending') {
      return eligibility('pending', 'population');
    }
    return state.status === 'ready' ? null : eligibility('error', 'population-read');
  }

  function mainSessionRestorePending() {
    var api = w.VildaDataImportExport;
    return !!(api && typeof api.isMainSessionRestorePending === 'function'
      && api.isMainSessionRestorePending());
  }

  function observePatientIdentity(id) {
    if (!id) { clearingPatientId = null; return; }
    hadSelectedPatient = true;
    // clearUserState dispatches before the sidebar removes its patient ID.
    // Subscribers may inspect eligibility in that same event stack. Seeing the
    // outgoing ID must not revoke the explicit transition to a new draft.
    if (id !== clearingPatientId) { draftAllowed = false; terminalClear = false; }
  }

  function clearedDuringQuarantine() {
    // The persistence fence prevents late writers from reviving cleared data;
    // it does not mean that another chart is loading. Keep this explicit-clear
    // marker independently of the outgoing ID, which the sidebar removes later
    // in the clear event stack. Actual restoration/adoption keeps its own gates.
    return terminalClear && Number(w.__vildaPersistClearUntil || 0) > Date.now();
  }

  function requestedMode(options) { return options && options.mode === 'summary' ? 'summary' : 'dedicated'; }

  function appliedPayload() {
    var loaded = w.lastLoadedData;
    return loaded && loaded.user && typeof loaded.user === 'object' ? loaded : null;
  }

  function summaryKind(id) {
    if (!id) return 'draft';
    var choice = sessionValue('vildaLoadChoiceV1');
    return choice === 'new' ? 'new' : choice === 'restore' ? 'restore' : 'applied';
  }

  function context(allowPendingDob, mode) {
    try {
      var vault = w.VildaVault, panel = w.VildaPanelPacjent, dob = w.VildaDobAge;
      var id = patientId(), route = activeRoute(), age = activeAge(), population = activePopulation();
      var api = w.VildaDataImportExport;
      var sequence = api && typeof api.getApplyLoadedDataSequence === 'function'
        ? api.getApplyLoadedDataSequence() : null;
      var summary = mode === 'summary';
      if (populationState(id)) return null;
      if (summary) {
        var kind = summaryKind(id);
        if (!route || age === null || !Number.isSafeInteger(sequence) || sequence < 0
          || mainSessionRestorePending() || w.__vildaPersistRestoring === true || w.__vildaLustroWpis === true
          || Number(w.__vildaPersistClearUntil || 0) > Date.now()
          || !allowPendingDob && dob && typeof dob.restorePending === 'function' && dob.restorePending()
          || panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()
          || panel && typeof panel.wlasciciel === 'function' && (panel.wlasciciel() || null) !== id
          || id && (!vault || typeof vault.isUnlocked !== 'function' || !vault.isUnlocked())
          || id && id === deletedPatientId
          || !id && !draftAllowed
          || id && kind !== 'new' && !appliedPayload()) return null;
        return { patientId: id, route: route, applySequence: sequence, mode: 'summary', kind: kind,
          ownerKey: id || 'draft:' + generation, population: population };
      }
      if (!id || !route || age === null || sessionValue('vildaLoadChoiceV1') !== 'new'
        || !Number.isSafeInteger(sequence) || sequence < 0
        || !vault || typeof vault.isUnlocked !== 'function' || !vault.isUnlocked()
        || typeof vault.getPatient !== 'function'
        || mainSessionRestorePending()
        || w.__vildaPersistRestoring === true || w.__vildaLustroWpis === true
        || Number(w.__vildaPersistClearUntil || 0) > Date.now()
        || !allowPendingDob && dob && typeof dob.restorePending === 'function' && dob.restorePending()
        || panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()
        || panel && typeof panel.wlasciciel === 'function' && panel.wlasciciel() !== id) return null;
      return { patientId: id, route: route, applySequence: sequence, mode: 'dedicated', kind: 'new', ownerKey: id, population: population };
    } catch (_) { return null; }
  }

  // This is a presentation gate, not permission to reuse a patient's drawing.
  // isCurrent() below remains the stricter ownership check for every snapshot.
  function eligibility(status, reason) { return { status: status, reason: reason }; }

  function startupPending() {
    if (startupSettled) return false;
    var init = w.VildaInit;
    if (!init || typeof init.isInitialized !== 'function'
      || !init.isInitialized('app:main-session-restore-init')) return true;
    if (!startupScheduled && typeof w.requestAnimationFrame === 'function') {
      startupScheduled = true;
      // The registered restore itself runs two frames later. Its completion
      // flag/DOB gates are checked separately after this scheduling boundary.
      w.requestAnimationFrame(function () {
        w.requestAnimationFrame(function () {
          startupSettled = true;
          notify('startup-settled', false);
        });
      });
    }
    return true;
  }

  function getSummaryEligibility() {
    try {
      if (!activeRoute()) return eligibility('ineligible', 'inactive-document');
      var id = patientId(), dob = w.VildaDobAge;
      observePatientIdentity(id);
      if (clearedDuringQuarantine()) return eligibility('ineligible', 'cleared');
      if (startupPending()) return eligibility('pending', 'startup');
      var auth = w.VildaAuthUI;
      if (auth && typeof auth.isBootReady === 'function' && !auth.isBootReady()) {
        return eligibility('pending', 'authentication');
      }
      if (mainSessionRestorePending() || w.__vildaPersistRestoring === true || w.__vildaLustroWpis === true
        || Number(w.__vildaPersistClearUntil || 0) > Date.now()) return eligibility('pending', 'restoring');
      if (dob && typeof dob.restorePending === 'function' && dob.restorePending()) return eligibility('pending', 'dob');
      var vault = w.VildaVault, panel = w.VildaPanelPacjent;
      if (id && vault && typeof vault.isUnlocked === 'function' && !vault.isUnlocked()) return eligibility('ineligible', 'locked');
      if (id && id === deletedPatientId) return eligibility('ineligible', 'deleted');
      if (!id && !draftAllowed) return eligibility('ineligible', 'no-patient');
      if (panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()
        || panel && typeof panel.wlasciciel === 'function' && (panel.wlasciciel() || null) !== id) {
        return eligibility('pending', 'ownership');
      }
      if (id && (!vault || typeof vault.isUnlocked !== 'function'
        || summaryKind(id) === 'new' && typeof vault.getPatient !== 'function')) return eligibility('pending', 'dependencies');
      var api = w.VildaDataImportExport;
      var sequence = api && typeof api.getApplyLoadedDataSequence === 'function'
        ? api.getApplyLoadedDataSequence() : null;
      if (!Number.isSafeInteger(sequence) || sequence < 0) return eligibility('pending', 'apply-sequence');
      if (id && summaryKind(id) !== 'new' && !appliedPayload()) return eligibility('pending', 'applied-payload');
      if (activeAge() === null) return eligibility('ineligible', 'age');
      var population = populationState(id);
      if (population) return population;
      return eligibility('eligible', id ? 'saved-summary' : 'draft-summary');
    } catch (_) { return eligibility('error', 'context'); }
  }

  function getEligibility(options) {
    if (requestedMode(options) === 'summary') return getSummaryEligibility();
    try {
      if (!activeRoute()) return eligibility('ineligible', 'inactive-document');
      var id = patientId();
      observePatientIdentity(id);
      if (clearedDuringQuarantine()) return eligibility('ineligible', 'cleared');
      // An initial guest has never owned a chart. Guest form/DOB restoration
      // must not reserve a chart slot; this flag carries no patient data and
      // does not grant permission to retain a snapshot.
      if (!id && !hadSelectedPatient) return eligibility('ineligible', 'no-patient');
      var dob = w.VildaDobAge;
      var pendingSessionRestore = mainSessionRestorePending();
      var restoring = pendingSessionRestore || w.__vildaPersistRestoring === true || w.__vildaLustroWpis === true
        || Number(w.__vildaPersistClearUntil || 0) > Date.now();
      var pendingDob = dob && typeof dob.restorePending === 'function' && dob.restorePending();
      // Session restoration does not create a patient ID. A settled empty
      // identity therefore needs no chart slot, even before startup finishes.
      // During adoption, however, an empty ID may only be an intermediate state.
      if (!id && !restoring && !pendingDob) return eligibility('ineligible', 'no-patient');
      if (startupPending()) return eligibility('pending', 'startup');
      var auth = w.VildaAuthUI;
      if (auth && typeof auth.isBootReady === 'function' && !auth.isBootReady()) {
        return eligibility('pending', 'authentication');
      }
      // Auth can finish before its deferred main-session restoration resumes.
      // Shared persistence may already expose plausible fields here; they must
      // not become a chart until the complete saved session has been applied.
      if (pendingSessionRestore) return eligibility('pending', 'restoring');
      var vault = w.VildaVault, panel = w.VildaPanelPacjent;
      if (vault && typeof vault.isUnlocked === 'function' && !vault.isUnlocked()) {
        return eligibility('ineligible', 'locked');
      }
      if (restoring) return eligibility('pending', 'restoring');
      if (pendingDob) return eligibility('pending', 'dob');
      if (!id) return eligibility('ineligible', 'no-patient');
      if (sessionValue('vildaLoadChoiceV1') !== 'new') return eligibility('ineligible', 'measurement-mode');
      if (!vault || typeof vault.isUnlocked !== 'function' || typeof vault.getPatient !== 'function') {
        return eligibility('pending', 'dependencies');
      }
      if (panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()
        || panel && typeof panel.wlasciciel === 'function' && panel.wlasciciel() !== id) {
        return eligibility('pending', 'ownership');
      }
      var api = w.VildaDataImportExport;
      var sequence = api && typeof api.getApplyLoadedDataSequence === 'function'
        ? api.getApplyLoadedDataSequence() : null;
      if (!Number.isSafeInteger(sequence) || sequence < 0) return eligibility('pending', 'apply-sequence');
      if (activeAge() === null) return eligibility('ineligible', 'age');
      var population = populationState(id);
      if (population) return population;
      return eligibility('eligible', 'new-measurement');
    } catch (_) { return eligibility('error', 'context'); }
  }

  function sameOwnerContext(a, b) {
    return !!(a && b && a.patientId === b.patientId && a.route === b.route
      && a.applySequence === b.applySequence && a.mode === b.mode && a.kind === b.kind && a.ownerKey === b.ownerKey);
  }

  function sameContext(a, b) {
    return sameOwnerContext(a, b) && a.population === b.population;
  }

  function isCurrent(snapshotOrToken) {
    var candidate = snapshotOrToken && (snapshotOrToken.patientToken || snapshotOrToken);
    // A save acknowledgement re-adopts DOB asynchronously for the same visit.
    // The existing drawing still belongs to that visit, but new snapshots must
    // continue to wait for DOB. No other restore/ownership gate is relaxed.
    var pendingSave = saveRefresh && saveRefresh.token === candidate && saveRefresh.phase === 'pending';
    return !!(candidate && candidate === token && candidate.generation === generation
      && sameContext(candidate, context(!!pendingSave, candidate.mode)));
  }

  function ready(scope) { return isCurrent(scope) && sameContext(scope, context(false, scope.mode)); }

  function getRefreshState(snapshotOrToken) {
    var candidate = snapshotOrToken && (snapshotOrToken.patientToken || snapshotOrToken);
    return saveRefresh && saveRefresh.token === candidate && isCurrent(candidate) ? saveRefresh.phase : null;
  }

  function finishSaveRefresh(scope, revision, failed) {
    if (revision === historyRevision && ready(scope) && saveRefresh && saveRefresh.token === scope) {
      if (failed) saveRefresh.phase = 'error';
      else saveRefresh = null;
    }
  }

  function notify(reason, identityChanged) {
    listeners.forEach(function (callback) {
      try { callback({ reason: reason, identityChanged: !!identityChanged }); }
      catch (_) { /* one view must not prevent another consumer from invalidating */ }
    });
  }

  function invalidate(reason, identityChanged, refreshHistory) {
    if (identityChanged) {
      generation += 1; token = null; saveRefresh = null;
      measurementEdit = null; measurementCommit = null; lastSnapshot = null;
    }
    if (identityChanged || refreshHistory) {
      historyRevision += 1;
      recordRequest = null;
      timelineRequest = null;
    }
    // Blur precedes a click/change on source, history or another control. Until
    // the accepted state is rendered, keep it current with those later changes,
    // but never recapture a new draft typed in this or the next measurement field.
    if (!identityChanged && reason !== 'measurement-commit' && measurementCommit
      && !editing(token) && isCurrent(token)) captureMeasurementCommit(token);
    notify(reason, identityChanged);
  }

  function bindVault() {
    var vault = w.VildaVault;
    if (!vault || vault === boundVault) return;
    boundVault = vault;
    if (typeof vault.onLock === 'function') vault.onLock(function () { if (hadSelectedPatient) draftAllowed = false; invalidate('lock', true); });
    if (typeof vault.onUnlock === 'function') vault.onUnlock(function () { invalidate('unlock', true); });
    if (typeof vault.onPatientSaved === 'function') vault.onPatientSaved(function (event) {
      if (event && event.patientId === patientId()) invalidate('patient-saved', false, true);
    });
    if (typeof vault.onPatientDeleted === 'function') vault.onPatientDeleted(function (event) {
      if (event && event.patientId === patientId()) {
        deletedPatientId = event.patientId;
        invalidate('patient-deleted', true);
      }
    });
  }

  function bindUpdateHook() {
    if (updateHookRegistered) return;
    var hooks = w.VildaUpdateHooks;
    if (!hooks || typeof hooks.registerAfterUpdateHook !== 'function') return;
    // The registry runs after the existing update and its normal calculations.
    // Observing their result must never request a further update or a save.
    var registration = hooks.registerAfterUpdateHook('centile-live:data-after-update', function () {
      invalidate('after-update', false);
    }, { order: 90, group: 'centile-live' });
    updateHookRegistered = !!(registration && registration.ok);
  }

  function currentToken(options) {
    bindVault();
    bindUpdateHook();
    var current = context(false, options ? requestedMode(options) : token && token.mode);
    if (!current) return null;
    if (!sameContext(token, current) || token.generation !== generation) {
      // A reference-population change invalidates the old drawing immediately,
      // but a half-entered measurement is still a draft until blur/Enter.
      var continuedEdit = measurementEdit && measurementEdit.dirty && sameOwnerContext(token, current)
        && token.population !== current.population ? measurementEdit : null;
      saveRefresh = null;
      measurementEdit = null;
      measurementCommit = null;
      lastSnapshot = null;
      token = Object.freeze({ patientId: current.patientId, route: current.route,
        applySequence: current.applySequence, generation: generation, mode: current.mode, kind: current.kind, ownerKey: current.ownerKey,
        population: current.population });
      if (continuedEdit) measurementEdit = { scope: token, input: continuedEdit.input, dirty: true };
      recordRequest = null;
      timelineRequest = null;
    }
    return token;
  }

  function readRecord(scope) {
    if (!recordRequest) {
      var request = Promise.resolve().then(function () {
        return isCurrent(scope) ? w.VildaVault.getPatient(scope.patientId) : null;
      }).then(function (record) {
        return isCurrent(scope) && record && record.patientId === scope.patientId
          && Array.isArray(record.snapshots) && record.snapshots.length ? record : null;
      }).catch(function () { return null; }).then(function (record) {
        // A transient restore/mirror flag or a failed read must allow the next update to retry.
        if (record === null && recordRequest === request) recordRequest = null;
        return record;
      });
      recordRequest = request;
    }
    return recordRequest;
  }

  function workingGrowth() {
    var effective = typeof w.getEffectiveCentileGrowthDataState === 'function'
      ? w.getEffectiveCentileGrowthDataState() : null;
    if (effective && Array.isArray(effective.measurements)) return effective;
    // The existing generator returns null for an empty basic history. An explicitly
    // present [] still means deletion, and must never resurrect rows from the vault.
    if (w.advancedGrowthData && Array.isArray(w.advancedGrowthData.measurements)) return w.advancedGrowthData;
    if (w.basicGrowthData && Array.isArray(w.basicGrowthData.measurements)) return w.basicGrowthData;
    return null;
  }

  function readTimeline(scope) {
    if (!timelineRequest) {
      var request = Promise.resolve().then(function () {
        return isCurrent(scope) && typeof w.VildaVault.listPatientTimelineEvents === 'function'
          ? w.VildaVault.listPatientTimelineEvents(scope.patientId) : [];
      }).then(function (events) {
        return isCurrent(scope) && Array.isArray(events)
          ? events.filter(function (event) { return event && event.type === 'measurement'; }) : null;
      }).catch(function () { return null; }).then(function (events) {
        if (events === null && timelineRequest === request) timelineRequest = null;
        return events;
      });
      timelineRequest = request;
    }
    return timelineRequest;
  }

  function capturedField(id) {
    var input = field(id);
    return input ? { value: input.value } : null;
  }

  // Capture the accepted form state synchronously. A subsequent keystroke may
  // arrive before the debounced render or asynchronous record/timeline read.
  function captureSnapshotInput(scope) {
    var age = activeAge(), dob = w.VildaDobAge;
    var exact = dob && typeof dob.readExactAge === 'function' ? dob.readExactAge() : null;
    var exactAge = exact && exact.totalMonths === age && Number.isFinite(exact.exactMonths)
      ? exact.exactMonths : null;
    var sourceInput = d && d.querySelector('input[name="dataSource"]:checked');
    var requestedSource = String(sourceInput && sourceInput.value || 'OLAF').toUpperCase();
    var population = activePopulation();
    var source = population === 'DS' ? 'DS' : requestedSource;
    var sexInput = field('sex');
    var height = positive(field('height') && field('height').value);
    var weight = positive(field('weight') && field('weight').value);
    var proToggle = field('resultsModeToggle');
    var professionalMode = typeof w.isGrowthResultsProfessionalMode === 'function'
      ? !!w.isGrowthResultsProfessionalMode() : !!(proToggle && proToggle.checked);
    var loaded = scope && scope.mode === 'summary' && scope.kind !== 'new' ? appliedPayload() : null;
    var growth = copy(workingGrowth());
    // A restore belongs to the payload applied to this form, never the latest vault head.
    if (!growth && loaded) {
      var advancedHistory = loaded.advanced && loaded.advanced.data;
      var basicHistory = loaded.growthBasic && loaded.growthBasic.data;
      if (advancedHistory && Array.isArray(advancedHistory.measurements)) growth = copy(advancedHistory);
      else if (basicHistory && Array.isArray(basicHistory.measurements)) growth = copy(basicHistory);
    }
    var headerState = typeof w.getCentileChartHeaderNameState === 'function'
      ? w.getCentileChartHeaderNameState() : null;
    return { age: age, exactAge: exactAge, source: source, requestedSource: requestedSource, population: population,
      sex: sexInput && sexInput.value, height: height, weight: weight,
      mother: capturedField('advMotherHeight'), father: capturedField('advFatherHeight'),
      advanced: copy(w.advancedGrowthData) || {}, growth: growth,
      loaded: loaded ? { advanced: copy(loaded.advanced), user: { sex: loaded.user.sex } } : null,
      chartCreatorData: copy(w.chartCreatorData) || {}, professionalMode: professionalMode,
      standardChartStyle: !!w.forceStandardCentileChartStyle || !professionalMode,
      hasHeaderName: !!(headerState && headerState.name),
      measuredAtISO: dob && typeof dob.readMeasuredAtISO === 'function' ? dob.readMeasuredAtISO() : null,
      savedMeasurement: !!(dob && typeof dob.showsSavedMeasurement === 'function' && dob.showsSavedMeasurement()) };
  }

  function makeSnapshot(scope, record, input, measurements) {
    var head = record ? record.snapshots[0] && record.snapshots[0].payload || {} : input.loaded || {};
    var growth = input.growth;
    var advanced = Object.assign({}, copy(head.advanced && head.advanced.data) || {},
      copy(input.advanced) || {}, copy(growth) || {});
    var age = input.age, exactAge = input.exactAge, source = input.source, population = input.population;
    var sex = String(input.sex || advanced.sex || head.user && head.user.sex || 'M');
    var height = input.height, weight = input.weight;
    var parents = { motherHeight: positive(input.mother ? input.mother.value : advanced.motherHeight),
      fatherHeight: positive(input.father ? input.father.value : advanced.fatherHeight) };
    Object.assign(advanced, { measurements: copy(measurements) || [], currentAgeMonths: age,
      currentHeight: height, currentWeight: weight, sex: sex,
      motherHeight: parents.motherHeight, fatherHeight: parents.fatherHeight });
    var effectiveSource = { height: null, weight: null };
    if (typeof w.getCentilePercentileStatsForSource === 'function') {
      var statsAge = exactAge === null ? age : exactAge;
      if (population === 'DS' && typeof w.vildaWiekDoSiatek === 'function') statsAge = w.vildaWiekDoSiatek(statsAge, age, population);
      [['height', height, 'HT'], ['weight', weight, 'WT']].forEach(function (metric) {
        if (metric[1] === null) return;
        var stats = w.getCentilePercentileStatsForSource(metric[1], sex, statsAge, metric[2], source, { population: population });
        if (stats && typeof stats.siatka === 'string') effectiveSource[metric[0]] = stats.siatka;
      });
    }
    return freeze({ patientId: scope.patientId, patientToken: scope, sex: sex, ageMonths: age,
      exactAgeMonths: exactAge, currentHeight: height, currentWeight: weight,
      source: source, requestedSource: input.requestedSource, population: population, effectiveSourceByMetric: effectiveSource,
      measurements: copy(measurements) || [], advanced: advanced, parents: parents,
      chartCreatorData: copy(input.chartCreatorData) || {},
      professionalMode: input.professionalMode,
      standardChartStyle: input.standardChartStyle,
      hasHeaderName: input.hasHeaderName,
      eligibility: { savedPatient: !!scope.patientId, choice: scope.kind === 'new' ? 'new' : scope.kind === 'draft' ? null : 'restore', mode: scope.mode, route: scope.route,
        activeDocument: true, under18: true },
      meta: { historySource: growth ? 'working' : record ? 'vault' : 'applied',
        measuredAtISO: input.measuredAtISO, savedMeasurement: input.savedMeasurement }
    });
  }

  function editing(scope) {
    return !!(measurementEdit && measurementEdit.scope === scope && measurementEdit.dirty);
  }

  function heldSnapshot(scope) {
    return lastSnapshot && lastSnapshot.patientToken === scope ? lastSnapshot : null;
  }

  function snapshotResult(snapshot, reason) {
    return snapshot ? { status: 'ready', snapshot: snapshot } : eligibility('pending', reason);
  }

  function interruptedResult(scope, revision) {
    // A superseded response never decides whether the *next* visit owns the
    // slot. Its caller must retry against that newer context.
    if (scope !== token || scope.generation !== generation || revision !== historyRevision) {
      return eligibility('pending', 'superseded');
    }
    var state = getEligibility(scope);
    return state.status === 'eligible' ? eligibility('pending', 'context-changed') : state;
  }

  async function getResult(options) {
    var state = getEligibility(options);
    if (state.status !== 'eligible') return state;
    var scope = currentToken(options || { mode: 'dedicated' });
    if (!scope) return eligibility('pending', 'context-changed');
    var commit = measurementCommit;
    var acceptedRevision = measurementRevision;
    if (!commit && editing(scope)) return snapshotResult(heldSnapshot(scope), 'measurement-edit');
    var revision = historyRevision;
    var readsVault = scope.mode !== 'summary' || scope.kind === 'new';
    var record = readsVault ? await readRecord(scope) : null;
    if (revision !== historyRevision || !ready(scope)) return interruptedResult(scope, revision);
    if (acceptedRevision !== measurementRevision) return snapshotResult(heldSnapshot(scope), 'measurement-commit');
    if (!commit && editing(scope)) return snapshotResult(heldSnapshot(scope), 'measurement-edit');
    if (readsVault && !record) { finishSaveRefresh(scope, revision, true); return eligibility('error', 'patient-read'); }
    try {
      var input = commit ? commit.input : captureSnapshotInput(scope);
      var growth = input.growth, measurements = growth && growth.measurements;
      if (!growth && readsVault) {
        measurements = await readTimeline(scope);
        if (revision !== historyRevision || !ready(scope)) return interruptedResult(scope, revision);
        if (acceptedRevision !== measurementRevision) return snapshotResult(heldSnapshot(scope), 'measurement-commit');
        if (!commit && editing(scope)) return snapshotResult(heldSnapshot(scope), 'measurement-edit');
        if (measurements === null) { finishSaveRefresh(scope, revision, true); return eligibility('error', 'timeline-read'); }
        // A form restoration may have supplied an explicit working history meanwhile.
        if (!commit) input = captureSnapshotInput(scope);
        growth = input.growth;
        if (growth) measurements = growth.measurements;
      }
      // Historical restoration must not acquire measurements from a later visit.
      // Applied empty history is authoritative; one current measurement remains one point.
      if (!Array.isArray(measurements)) measurements = [];
      if (scope.mode === 'summary' && scope.kind === 'restore' && input.savedMeasurement) {
        measurements = measurements.filter(function (measurement) {
          var measuredAge = number(measurement && measurement.ageMonths);
          if (measuredAge === null) {
            var years = number(measurement && measurement.ageYears);
            measuredAge = years === null ? null : years * 12;
          }
          return measuredAge === null || measuredAge <= input.age;
        });
      }
      var snapshot = makeSnapshot(scope, record, input, measurements);
      if (revision !== historyRevision || !ready(scope)) return interruptedResult(scope, revision);
      if (acceptedRevision !== measurementRevision) return snapshotResult(heldSnapshot(scope), 'measurement-commit');
      lastSnapshot = snapshot;
      measurementCommit = null;
      finishSaveRefresh(scope, revision, false);
      return snapshotResult(snapshot);
    } catch (_) {
      if (revision !== historyRevision || !ready(scope)) return interruptedResult(scope, revision);
      finishSaveRefresh(scope, revision, true);
      return eligibility('error', 'snapshot');
    }
  }

  // Existing consumers still receive the original snapshot-or-null contract.
  async function getSnapshot(options) {
    var result = await getResult(options);
    return result.status === 'ready' ? result.snapshot : null;
  }

  function retry() {
    var source = w.VildaDsSource;
    if (source && typeof source.getState === 'function' && typeof source.retry === 'function') {
      var state = source.getState();
      if (state && state.patientId === patientId() && state.status === 'error') source.retry();
    }
    invalidate('retry', false, true);
  }

  function listen(target, event, callback, options) {
    if (target && typeof target.addEventListener === 'function') target.addEventListener(event, callback, options);
  }

  function measurementField(target) {
    return target && (target.id === 'height' || target.id === 'weight') && field(target.id) === target;
  }

  function beginMeasurementEdit(target) {
    if (!measurementField(target)) return;
    var scope = currentToken();
    if (!scope) return;
    if (measurementEdit && measurementEdit.scope === scope && measurementEdit.input === target) return;
    measurementEdit = { scope: scope, input: target, dirty: false };
  }

  function captureMeasurementCommit(scope) {
    try {
      measurementCommit = { scope: scope, input: captureSnapshotInput(scope) };
      measurementRevision += 1;
      return true;
    } catch (_) { return false; }
  }

  function commitMeasurementEdit(target, finished) {
    if (!measurementEdit || measurementEdit.input !== target) return false;
    var scope = measurementEdit.scope;
    if (!isCurrent(scope)) { measurementEdit = null; return false; }
    if (!captureMeasurementCommit(scope)) return false;
    if (finished) measurementEdit = null;
    else measurementEdit.dirty = false;
    invalidate('measurement-commit', false);
    return true;
  }

  listen(d, 'focusin', function (event) { beginMeasurementEdit(event && event.target); }, true);
  listen(d, 'input', function (event) {
    var target = event && event.target;
    if (measurementField(target) && d.activeElement === target) {
      beginMeasurementEdit(target);
      if (measurementEdit && measurementEdit.input === target) measurementEdit.dirty = true;
    }
    invalidate('input', false);
  }, true);
  function measurementBlur(event) { commitMeasurementEdit(event && event.target, true); }
  listen(d, 'blur', measurementBlur, true);
  listen(d, 'focusout', measurementBlur, true);
  listen(d, 'keydown', function (event) {
    if (!event || event.key !== 'Enter' || event.isComposing || event.keyCode === 229
      || !measurementField(event.target) || !measurementEdit || measurementEdit.input !== event.target
      || !isCurrent(measurementEdit.scope)) return;
    // Only the visible two-column preview owns Enter. Native mobile Done and
    // other calculator contexts keep their existing default keyboard behavior.
    if (d.documentElement && d.documentElement.classList.contains('vilda-centile-live-active')) event.preventDefault();
    if (!event.repeat) commitMeasurementEdit(event.target, false);
  }, true);
  listen(d, 'change', function () { invalidate('change', false); });
  listen(d, 'click', function (event) {
    var target = event && event.target;
    if (target && typeof target.closest === 'function' && target.closest(
      '#advAddMeasurementBtn, #basicGrowthAddMeasurementBtn, #advMeasurements button, #basicGrowthMeasurements button')) {
      invalidate('history-edit', false);
    }
  });
  listen(d, 'vilda:patient-loaded', function (event) {
    var detail = event && event.detail;
    // Earlier bubble listeners can synchronously publish a source change after
    // DOB has entered its pending state. Arm ownership retention in capture,
    // before those nested notifications reach the panel.
    if (detail && detail.source === 'save' && token && detail.patientId === token.patientId
      && detail.applySequence === token.applySequence && sameContext(token, context(true, token.mode))) {
      saveRefresh = { token: token, phase: 'pending' };
    }
  }, true);
  listen(d, 'vilda:patient-loaded', function (event) {
    if (event && event.detail && event.detail.patientId) {
      clearingPatientId = null;
      terminalClear = false;
      draftAllowed = false;
      if (event.detail.patientId !== deletedPatientId) deletedPatientId = null;
    }
    invalidate('patient-loaded', !(event && event.detail && event.detail.source === 'save'), true);
  });
  ['vilda:state-restored', 'vilda:persist-restored', 'vilda:main-session-restored', 'vilda:json-imported'].forEach(function (event) {
    listen(d, event, function () { invalidate(event, true); });
  });
  ['vilda:dob-restored', 'vilda:centile-creator-changed', 'vilda:zrodlo-pacjenta-zmienione'].forEach(function (event) {
    listen(d, event, function () { invalidate(event, false); });
  });
  listen(d, 'vilda:ds-source-state', function () { invalidate('ds-source-state', false); });
  ['vilda:auth-hidden', 'vilda:auth-state-settled', 'vilda:auth-boot-settled', 'vilda:sync-status-changed'].forEach(function (event) {
    listen(d, event, function () { invalidate(event, false, true); });
  });
  function cleared() {
    clearingPatientId = patientId();
    terminalClear = true;
    draftAllowed = true;
    deletedPatientId = null;
    invalidate('clear', true);
  }
  listen(d, 'vilda:user-state-cleared', cleared);
  listen(w, 'vilda:user-state-cleared', cleared);
  listen(w, 'pagehide', function () { invalidate('pagehide', true); });
  listen(w, 'pageshow', function () { invalidate('pageshow', false); });
  listen(w, 'storage', function (event) {
    if (!event || event.key == null || event.key === 'vildaCurrentPatientId'
      || event.key === 'vildaLoadChoiceV1' || event.key === 'vilda:sharedLoadSeq') invalidate('storage', true);
  });
  try {
    if (w.frameElement && typeof w.MutationObserver === 'function') {
      new w.MutationObserver(function () { invalidate('frame-visibility', true); })
        .observe(w.frameElement, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    }
  } catch (_) { /* standalone document */ }

  w.VildaCentileLiveData = Object.freeze({
    getSnapshot: getSnapshot,
    getEligibility: getEligibility,
    getResult: getResult,
    retry: retry,
    isCurrent: isCurrent,
    getRefreshState: getRefreshState,
    subscribe: function (callback) {
      if (typeof callback !== 'function') return function () {};
      listeners.add(callback);
      return function () { listeners.delete(callback); };
    }
  });
  bindVault();
  bindUpdateHook();
})(typeof window !== 'undefined' ? window : undefined);
