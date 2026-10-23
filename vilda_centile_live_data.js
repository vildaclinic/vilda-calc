/* Read-only data boundary for the centile panel during an explicit new measurement.
 * Patient/operation tokens are RAM-only. This module never collects, saves or restores
 * a payload, changes a form field, or asks the calculator to recalculate.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLiveData) return;

  var d = w.document;
  var generation = 0;
  var token = null;
  var recordRequest = null;
  var timelineRequest = null;
  var historyRevision = 0;
  var listeners = new Set();
  var boundVault = null;
  var updateHookRegistered = false;

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

  function context() {
    try {
      var vault = w.VildaVault, panel = w.VildaPanelPacjent, dob = w.VildaDobAge;
      var id = patientId(), route = activeRoute(), age = activeAge();
      var api = w.VildaDataImportExport;
      var sequence = api && typeof api.getApplyLoadedDataSequence === 'function'
        ? api.getApplyLoadedDataSequence() : null;
      if (!id || !route || age === null || sessionValue('vildaLoadChoiceV1') !== 'new'
        || !Number.isSafeInteger(sequence) || sequence < 0
        || !vault || typeof vault.isUnlocked !== 'function' || !vault.isUnlocked()
        || typeof vault.getPatient !== 'function'
        || w.__vildaPersistRestoring === true || w.__vildaLustroWpis === true
        || Number(w.__vildaPersistClearUntil || 0) > Date.now()
        || dob && typeof dob.restorePending === 'function' && dob.restorePending()
        || panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()
        || panel && typeof panel.wlasciciel === 'function' && panel.wlasciciel() !== id) return null;
      return { patientId: id, route: route, applySequence: sequence };
    } catch (_) { return null; }
  }

  function sameContext(a, b) {
    return !!(a && b && a.patientId === b.patientId && a.route === b.route
      && a.applySequence === b.applySequence);
  }

  function isCurrent(snapshotOrToken) {
    var candidate = snapshotOrToken && (snapshotOrToken.patientToken || snapshotOrToken);
    return !!(candidate && candidate === token && candidate.generation === generation
      && sameContext(candidate, context()));
  }

  function notify(reason, identityChanged) {
    listeners.forEach(function (callback) {
      try { callback({ reason: reason, identityChanged: !!identityChanged }); }
      catch (_) { /* one view must not prevent another consumer from invalidating */ }
    });
  }

  function invalidate(reason, identityChanged, refreshHistory) {
    if (identityChanged) { generation += 1; token = null; }
    if (identityChanged || refreshHistory) {
      historyRevision += 1;
      recordRequest = null;
      timelineRequest = null;
    }
    notify(reason, identityChanged);
  }

  function bindVault() {
    var vault = w.VildaVault;
    if (!vault || vault === boundVault) return;
    boundVault = vault;
    if (typeof vault.onLock === 'function') vault.onLock(function () { invalidate('lock', true); });
    if (typeof vault.onUnlock === 'function') vault.onUnlock(function () { invalidate('unlock', true); });
    if (typeof vault.onPatientSaved === 'function') vault.onPatientSaved(function (event) {
      if (event && event.patientId === patientId()) invalidate('patient-saved', false, true);
    });
    if (typeof vault.onPatientDeleted === 'function') vault.onPatientDeleted(function (event) {
      if (event && event.patientId === patientId()) invalidate('patient-deleted', true);
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

  function currentToken() {
    bindVault();
    bindUpdateHook();
    var current = context();
    if (!current) return null;
    if (!sameContext(token, current) || token.generation !== generation) {
      token = Object.freeze({ patientId: current.patientId, route: current.route,
        applySequence: current.applySequence, generation: generation });
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

  function parentHeight(id, advanced, key) {
    var input = field(id);
    return positive(input ? input.value : advanced[key]);
  }

  function makeSnapshot(scope, record, growth, measurements) {
    var head = record.snapshots[0] && record.snapshots[0].payload || {};
    var advanced = Object.assign({}, copy(head.advanced && head.advanced.data) || {},
      copy(w.advancedGrowthData) || {}, copy(growth) || {});
    var age = activeAge(), dob = w.VildaDobAge;
    var exact = dob && typeof dob.readExactAge === 'function' ? dob.readExactAge() : null;
    var exactAge = exact && exact.totalMonths === age && Number.isFinite(exact.exactMonths)
      ? exact.exactMonths : null;
    var sourceInput = d && d.querySelector('input[name="dataSource"]:checked');
    var source = String(sourceInput && sourceInput.value || 'OLAF').toUpperCase();
    var population = typeof w.VildaPopulacjaPacjenta === 'function' ? w.VildaPopulacjaPacjenta() : 'OGOLNA';
    var sexInput = field('sex');
    var sex = String(sexInput && sexInput.value || advanced.sex || head.user && head.user.sex || 'M');
    var height = positive(field('height') && field('height').value);
    var weight = positive(field('weight') && field('weight').value);
    var parents = { motherHeight: parentHeight('advMotherHeight', advanced, 'motherHeight'),
      fatherHeight: parentHeight('advFatherHeight', advanced, 'fatherHeight') };
    Object.assign(advanced, { measurements: copy(measurements) || [], currentAgeMonths: age,
      currentHeight: height, currentWeight: weight, sex: sex,
      motherHeight: parents.motherHeight, fatherHeight: parents.fatherHeight });
    var effectiveSource = { height: null, weight: null };
    if (height !== null && typeof w.getCentilePercentileStatsForSource === 'function') {
      var stats = w.getCentilePercentileStatsForSource(height, sex, exactAge === null ? age : exactAge, 'HT', source,
        { population: population });
      if (stats && typeof stats.siatka === 'string') effectiveSource.height = stats.siatka;
    }
    var proToggle = field('resultsModeToggle');
    var professionalMode = typeof w.isGrowthResultsProfessionalMode === 'function'
      ? !!w.isGrowthResultsProfessionalMode() : !!(proToggle && proToggle.checked);
    var headerState = typeof w.getCentileChartHeaderNameState === 'function'
      ? w.getCentileChartHeaderNameState() : null;
    return freeze({ patientId: scope.patientId, patientToken: scope, sex: sex, ageMonths: age,
      exactAgeMonths: exactAge, currentHeight: height, currentWeight: weight,
      source: source, requestedSource: source, population: population, effectiveSourceByMetric: effectiveSource,
      measurements: copy(measurements) || [], advanced: advanced, parents: parents,
      chartCreatorData: copy(w.chartCreatorData) || {},
      professionalMode: professionalMode,
      standardChartStyle: !!w.forceStandardCentileChartStyle || !professionalMode,
      hasHeaderName: !!(headerState && headerState.name),
      eligibility: { savedPatient: true, choice: 'new', route: scope.route,
        activeDocument: true, under18: true },
      meta: { historySource: growth ? 'working' : 'vault',
        measuredAtISO: dob && typeof dob.readMeasuredAtISO === 'function' ? dob.readMeasuredAtISO() : null,
        savedMeasurement: !!(dob && typeof dob.showsSavedMeasurement === 'function' && dob.showsSavedMeasurement()) }
    });
  }

  async function getSnapshot() {
    var scope = currentToken();
    if (!scope) return null;
    var revision = historyRevision;
    var record = await readRecord(scope);
    if (!record || revision !== historyRevision || !isCurrent(scope)) return null;
    try {
      var growth = workingGrowth(), measurements = growth && growth.measurements;
      if (!growth) {
        measurements = await readTimeline(scope);
        if (measurements === null || revision !== historyRevision || !isCurrent(scope)) return null;
        // A form restoration may have supplied an explicit working history meanwhile.
        growth = workingGrowth();
        if (growth) measurements = growth.measurements;
      }
      var snapshot = makeSnapshot(scope, record, growth, measurements);
      return revision === historyRevision && isCurrent(scope) ? snapshot : null;
    } catch (_) { return null; }
  }

  function listen(target, event, callback) {
    if (target && typeof target.addEventListener === 'function') target.addEventListener(event, callback);
  }

  listen(d, 'input', function () { invalidate('input', false); });
  listen(d, 'change', function () { invalidate('change', false); });
  listen(d, 'click', function (event) {
    var target = event && event.target;
    if (target && typeof target.closest === 'function' && target.closest(
      '#advAddMeasurementBtn, #basicGrowthAddMeasurementBtn, #advMeasurements button, #basicGrowthMeasurements button')) {
      invalidate('history-edit', false);
    }
  });
  listen(d, 'vilda:patient-loaded', function (event) {
    invalidate('patient-loaded', !(event && event.detail && event.detail.source === 'save'), true);
  });
  ['vilda:state-restored', 'vilda:persist-restored', 'vilda:json-imported'].forEach(function (event) {
    listen(d, event, function () { invalidate(event, true); });
  });
  ['vilda:dob-restored', 'vilda:centile-creator-changed', 'vilda:zrodlo-pacjenta-zmienione'].forEach(function (event) {
    listen(d, event, function () { invalidate(event, false); });
  });
  ['vilda:auth-hidden', 'vilda:sync-status-changed'].forEach(function (event) {
    listen(d, event, function () { invalidate(event, false, true); });
  });
  function cleared() { invalidate('clear', true); }
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
    isCurrent: isCurrent,
    subscribe: function (callback) {
      if (typeof callback !== 'function') return function () {};
      listeners.add(callback);
      return function () { listeners.delete(callback); };
    }
  });
  bindVault();
  bindUpdateHook();
})(typeof window !== 'undefined' ? window : undefined);
