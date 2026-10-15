/* P-POKWITANIE-KONTRAKT: assessment carried by the active form/session.
 * Conscious edits replace one observation only. A restored visit keeps
 * its exact JSON even if the patient's latest baseline refreshes in the background.
 * The full main-session payload already links Start and DocPro; no new storage.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaPubertyAssessmentState) return;

  var state = null;
  var initialized = false;
  var boundVault = null;
  var bootstrapConsumed = false;
  var bootstrapSession = readBootstrapSession();
  var subscribers = [];
  var saveTimer = null;
  var visitSequence = 0;
  var activityRevision = 0;
  var notifiedContext = null;
  // These inputs can change the context used by another clinical card. Priority
  // follows the physician's latest form, without renewing a Tanner observation.
  var activityFields = ['sex', 'age', 'ageMonths', 'ageWeeks', 'dobInput', 'height', 'weight',
    'advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion',
    'pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyMenarcheHeight', 'pubertyMenarcheBoneAge',
    'pubertyGnrhaStatus', 'pubertyGnrhaStartAge', 'pubertyGnrhaStopAge', 'pubertyCdgp'];

  function bumpActivityRevision() {
    var host = w;
    try {
      if (w.top && w.top.document) host = w.top;
    } catch (_) { /* A standalone or cross-origin frame owns a local counter. */ }
    var shared = 0;
    try {
      var value = Number(host.__vildaPubertyAssessmentRevision);
      if (Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER) shared = value;
    } catch (_) { /* A closing window cannot block an explicit examination edit. */ }
    activityRevision = Math.max(Date.now(), activityRevision + 1, shared + 1);
    try { host.__vildaPubertyAssessmentRevision = activityRevision; }
    catch (_) { /* The local monotonic counter remains usable. */ }
  }

  function getActivityRevision() { return activityRevision; }

  function field(id) {
    return w.document && typeof w.document.getElementById === 'function'
      ? w.document.getElementById(id) : null;
  }

  function number(value) {
    if (value == null || String(value).trim() === '') return null;
    var parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function sex(value) {
    return value === 'F' || value === 'K' ? 'F' : value === 'M' ? 'M' : null;
  }

  function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) &&
      parsed.getUTCFullYear() === Number(value.slice(0, 4)) &&
      parsed.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
      parsed.getUTCDate() === Number(value.slice(8, 10));
  }

  function visitContext() {
    var years = number(field('age') && field('age').value);
    var months = number(field('ageMonths') && field('ageMonths').value);
    var date = null;
    try {
      var api = w.VildaDobAge;
      if (api && typeof api.readMeasuredAtISO === 'function') date = api.readMeasuredAtISO();
    } catch (_) { /* Missing examination date stays unknown. */ }
    return { sex: sex(field('sex') && field('sex').value),
      measuredAtISO: calendarDate(date) ? date : null,
      ageMonths: years === null && months === null ? null : (years || 0) * 12 + (months || 0) };
  }

  function payloadContext(payload) {
    var user = payload && payload.user || {};
    var years = number(user.age);
    var months = number(user.ageMonths);
    return { sex: sex(user.sex),
      measuredAtISO: calendarDate(user.measuredAtISO) ? user.measuredAtISO : null,
      ageMonths: years === null && months === null ? null : (years || 0) * 12 + (months || 0) };
  }

  function matchingReference(a, b) {
    return !!(a && b && a.sex === b.sex && a.measuredAtISO === b.measuredAtISO && a.ageMonths === b.ageMonths);
  }

  function readVisit(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.currentAxes) || !value.reference ||
        typeof value.visitId !== 'string' || !value.visitId.trim() ||
        value.currentAxes.some(function (axis) { return ['G', 'Th', 'P'].indexOf(axis) < 0; }) ||
        value.ownerPatientId !== null && typeof value.ownerPatientId !== 'string') return null;
    var reference = value.reference;
    if (reference.sex !== null && sex(reference.sex) !== reference.sex ||
        reference.ageMonths !== null && number(reference.ageMonths) !== reference.ageMonths ||
        reference.measuredAtISO !== null && !calendarDate(reference.measuredAtISO)) return null;
    return clone(value);
  }

  function newVisit(reference) {
    var id = w.crypto && typeof w.crypto.randomUUID === 'function' ? w.crypto.randomUUID() :
      'puberty-visit-' + Date.now() + '-' + (++visitSequence);
    return { version: 1, visitId: id, currentAxes: [], ownerPatientId: identity(), reference: clone(reference) };
  }

  function contextFingerprint() {
    return JSON.stringify([visitContext(), activityFields.map(function (id) {
      var input = field(id);
      return input ? [input.value == null ? '' : String(input.value), !!input.checked] : null;
    })]);
  }

  function notify(reason) {
    notifiedContext = contextFingerprint();
    subscribers.slice().forEach(function (listener) {
      try { listener(reason); } catch (_) { /* One consumer cannot block the edit. */ }
    });
    try {
      if (w.document && typeof w.document.dispatchEvent === 'function' && typeof w.CustomEvent === 'function') {
        w.document.dispatchEvent(new w.CustomEvent('vilda:puberty-assessment-changed', {
          detail: { reason: reason, patientId: state ? state.patientId : null }
        }));
      }
    } catch (_) { /* Direct subscribers remain available without CustomEvent. */ }
  }

  function cancelSave() {
    if (saveTimer !== null && typeof w.clearTimeout === 'function') w.clearTimeout(saveTimer);
    saveTimer = null;
  }

  function readBootstrapSession() {
    try {
      var persistence = w.VildaPersistence;
      var session = persistence && typeof persistence.readMainSession === 'function'
        ? persistence.readMainSession() : null;
      return session && typeof session === 'object' ? JSON.stringify(session) : null;
    } catch (_) { return null; }
  }

  function owns(value, key) {
    return !!(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key));
  }

  function clone(value) {
    return w.VildaPubertyAssessment.clone(value);
  }

  function identity() {
    try {
      if (w.sessionStorage && typeof w.sessionStorage.getItem === 'function') {
        return w.sessionStorage.getItem('vildaCurrentPatientId') || null;
      }
    } catch (_) { /* fallback for unavailable session storage */ }
    return typeof w._vildaCurrentPatientId === 'string' ? w._vildaCurrentPatientId || null : null;
  }

  function clear(explicit) {
    cancelSave();
    if (explicit !== false) bumpActivityRevision();
    initialized = true;
    bootstrapSession = null;
    state = null;
    notify('clear');
  }

  function bindVault() {
    var vault = w.VildaVault;
    if (!vault || vault === boundVault || typeof vault.onLock !== 'function') return;
    boundVault = vault;
    vault.onLock(function () { if (w.VildaVault === vault) clear(); });
  }

  function ownerVault(patientId) {
    var vault = w.VildaVault;
    if (!vault) return null;
    if (patientId) return vault;
    // An anonymous JSON import does not belong to the locked account whose
    // scripts happen to be loaded on the same page.
    try { return typeof vault.isUnlocked === 'function' && vault.isUnlocked() ? vault : null; }
    catch (_) { return null; }
  }

  function eligible() {
    if (!state) return false;
    bindVault();
    try {
      var panel = w.VildaPanelPacjent;
      if (panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()) { clear(false); return false; }
      if (state.patientId !== identity()) {
        // A patient-loaded listener can finish assigning storage AFTER another
        // consumer reads this carrier in that very same dispatch. Do not expose
        // it under the previous ID, and do not destroy the authorized handoff.
        if (state.identityHandoff && state.identityHandoff.previousId === identity() &&
            state.identityHandoff.targetId === state.patientId) return false;
        clear(false);
        return false;
      }
      if (state.vault && (state.vault !== w.VildaVault ||
          typeof state.vault.isUnlocked !== 'function' || !state.vault.isUnlocked())) {
        clear(false);
        return false;
      }
    } catch (_) { return false; }
    return true;
  }

  function load(payload, options) {
    cancelSave();
    bumpActivityRevision();
    var user = payload && payload.user;
    var has = owns(user, 'pubertyAssessment');
    var hasVisit = owns(user, 'pubertyAssessmentVisit');
    var visit = hasVisit ? readVisit(user.pubertyAssessmentVisit) : null;
    if (visit && (visit.ownerPatientId !== identity() || !matchingReference(visit.reference, payloadContext(payload)))) visit = null;
    var reading = w.VildaPubertyAssessment.readUser(user);
    // A normal load begins a new measurement. Session/visit restoration keeps
    // only a marker bound to the same owner and the payload's visit reference.
    // Unsupported assessment JSON remains opaque even in a new measurement.
    if (!(options && options.restore === true) && reading.status === 'ready') {
      visit = newVisit(visitContext());
      hasVisit = true;
    }
    initialized = true;
    bootstrapSession = null;
    // Missing is an explicit replacement of the former patient's carrier.
    state = {
      present: has,
      raw: has ? clone(user.pubertyAssessment) : null,
      legacy: owns(user, 'tannerStage') ? clone(user.tannerStage) : null,
      visitPresent: hasVisit,
      visitRaw: hasVisit ? clone(visit || user.pubertyAssessmentVisit) : null,
      visit: visit,
      mode: options && options.restore === true ? 'restored' : 'loaded',
      patientId: identity(),
      vault: ownerVault(identity()),
      identityHandoff: null,
      pendingIdentity: !(options && options.restore === true)
    };
    bindVault();
    // Existing patient loaders synchronously call applyLoadedData and then emit
    // patient-loaded. A plain JSON import may have no identity event; it must
    // not leave an adoption permission open for a later, unrelated patient.
    var loaded = state;
    Promise.resolve().then(function () {
      if (state === loaded) state.pendingIdentity = false;
    });
    notify('load');
  }

  // A cold guest page may have had some fields restored by sharedUserData before
  // the full-session restore is attempted. That existing path leaves all other
  // form fields alone. Recover only this hidden assessment from the unchanged
  // same-tab startup session, once and before user interaction. Available fields
  // can veto conflicts; they are not proof of identity and no name is required.
  function restoreSessionIfUninitialized(payload) {
    if (bootstrapConsumed) return false;
    bootstrapConsumed = true;
    var expectedSession = bootstrapSession;
    bootstrapSession = null;
    if (initialized || identity() !== null || !expectedSession) return false;
    try {
      var persistence = w.VildaPersistence;
      var currentSession = persistence && typeof persistence.readMainSession === 'function'
        ? persistence.readMainSession() : null;
      if (JSON.stringify(payload) !== expectedSession || JSON.stringify(currentSession) !== expectedSession) return false;
      var panel = w.VildaPanelPacjent;
      if (panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()) return false;
    } catch (_) { return false; }
    var user = payload && payload.user || {};
    function text(value) { return String(value == null ? '' : value).trim(); }
    function name(value) { return text(value).toLowerCase().replace(/\s+/g, ' '); }
    function field(id) {
      var element = w.document && w.document.getElementById(id);
      return element ? text(element.value) : '';
    }
    var expected = name([user.lastName, user.firstName].filter(function (part) {
      return typeof part === 'string' && part.trim();
    }).join(' ') || payload && payload.name);
    var names = ['name', 'advName', 'basicGrowthName', 'fullName'].map(field).filter(Boolean);
    if (names.some(function (value) { return !expected || name(value) !== expected; })) return false;
    var dob = field('dobInput');
    if (dob) {
      var dobApi = w.VildaDobAge;
      var parsed = dobApi && typeof dobApi.parseDobInput === 'function' ? dobApi.parseDobInput(dob) : null;
      if (!parsed || parsed.status !== 'ok' || user.dobISO && parsed.iso !== user.dobISO) return false;
    }
    function sex(value) {
      var normalized = text(value).toUpperCase();
      return normalized === 'F' || normalized === 'K' ? 'F' : normalized === 'M' ? 'M' : normalized;
    }
    var currentSex = sex(field('sex'));
    var savedSex = sex(user.sex);
    if (currentSex && savedSex && currentSex !== savedSex) return false;
    // A DOB-derived age can legitimately advance since the saved draft. Other
    // entered measurements must not contradict the unchanged startup session.
    var measures = user.dobISO ? ['height', 'weight'] : ['age', 'ageMonths', 'height', 'weight'];
    if (measures.some(function (key) {
      var actual = field(key);
      if (!actual) return false;
      var value = Number(actual.replace(',', '.'));
      var recorded = user[key];
      return !Number.isFinite(value) || recorded == null || recorded === '' || value !== Number(recorded);
    })) return false;
    load(payload, { restore: true });
    return true;
  }

  function blockBootstrapAfterInput(event) {
    var contextField = event && event.target && activityFields.indexOf(event.target.id) >= 0;
    if (event && event.isTrusted === true) {
      bootstrapConsumed = true;
      bootstrapSession = null;
      if (contextField) bumpActivityRevision();
    }
    if (event && event.isTrusted === true && event.target && event.target.id === 'sex' && !editBlocked()) {
      if (invalidateIncompatibleAxes(sex(event.target.value))) scheduleSave();
    }
    // Restore and the delayed form refresh re-emit the same input/change events.
    // Notify once for their actual context change, not once per replayed field.
    // Trusted intent still selects this form even when its value is unchanged.
    if (contextField && (event.isTrusted === true || contextFingerprint() !== notifiedContext)) {
      notify('visit-change');
    }
  }

  function capture() {
    if (!eligible()) return { present: false, raw: null, mode: null, patientId: null, activityRevision: activityRevision };
    return { present: state.present, raw: state.present ? clone(state.raw) : null,
      mode: state.mode, patientId: state.patientId,
      visitPresent: state.visitPresent, visitRaw: state.visitPresent ? clone(state.visitRaw) : null,
      activityRevision: activityRevision };
  }

  function read() {
    var value = capture();
    var user = {};
    if (value.present) user.pubertyAssessment = value.raw;
    else if (state && eligible()) user.tannerStage = state.legacy;
    else if (!initialized && field('tannerStage')) user.tannerStage = field('tannerStage').value;
    var result = w.VildaPubertyAssessment.readUser(user);
    result.mode = value.mode;
    result.patientId = value.patientId;
    result.visit = state && eligible() && state.visit ? clone(state.visit) : null;
    result.visitContext = visitContext();
    return result;
  }

  function editBlocked() {
    try {
      var persistence = w.VildaPersistence;
      var panel = w.VildaPanelPacjent;
      return !!(w.__vildaPersistRestoring || w.__vildaLustroWpis ||
        Number(w.__vildaPersistClearUntil || 0) > Date.now() ||
        persistence && typeof persistence.isClearInProgress === 'function' && persistence.isClearInProgress() ||
        panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny() ||
        identity() && w.VildaVault && typeof w.VildaVault.isUnlocked === 'function' && !w.VildaVault.isUnlocked());
    } catch (_) { return true; }
  }

  // An explicit edit belongs to this carrier, not to a DOM mirror. During a
  // restore pause the collector already sees it; the ordinary session write is
  // retried after the pause. A load/clear/owner change invalidates this callback.
  function scheduleSave() {
    cancelSave();
    var edited = state;
    function save() {
      saveTimer = null;
      if (state !== edited || !eligible() || editBlocked()) return;
      var remaining = Math.max(0, Number(w.__vildaPersistPauseUntil || 0) - Date.now());
      if (remaining > 0) {
        if (typeof w.setTimeout === 'function') saveTimer = w.setTimeout(save, remaining + 10);
        return;
      }
      var importer = w.VildaDataImportExport;
      if (importer && typeof importer.saveMainSessionNow === 'function') importer.saveMainSessionNow();
    }
    if (typeof w.setTimeout === 'function') saveTimer = w.setTimeout(save, 300);
  }

  function editObservation(axis, stage, options) {
    if (['G', 'Th', 'P'].indexOf(axis) < 0 || stage !== null &&
        !(typeof stage === 'number' && Number.isInteger(stage) && stage >= 1 && stage <= 5)) {
      return { ok: false, reason: 'invalid-observation' };
    }
    if (editBlocked()) return { ok: false, reason: 'blocked' };
    if (state && !eligible()) return { ok: false, reason: 'owner-changed' };
    var current = read();
    if (current.status !== 'ready' && current.status !== 'absent') return { ok: false, reason: current.status };
    var context = Object.assign(visitContext(), options || {});
    var sourceSex = sex(context.sex);
    if (axis === 'G' && sourceSex !== 'M' || axis === 'Th' && sourceSex !== 'F') {
      return { ok: false, reason: 'sex-mismatch' };
    }
    var raw = current.status === 'ready' ? clone(state.raw) :
      { version: 1, sex: sourceSex, observations: { G: null, Th: null, P: null } };
    if (raw.sex !== sourceSex) {
      ['G', 'Th', 'P'].forEach(function (key) {
        var observation = raw.observations[key];
        if (observation && !owns(observation, 'sex')) observation.sex = raw.sex == null ? null : raw.sex;
      });
      raw.sex = sourceSex;
    }
    raw.observations[axis] = stage === null ? null : {
      stage: stage,
      sex: sourceSex,
      observedAtISO: owns(context, 'observedAtISO') ? context.observedAtISO : context.measuredAtISO,
      ageMonths: context.ageMonths,
      source: owns(context, 'source') ? context.source : 'clinician-entry'
    };
    if (w.VildaPubertyAssessment.readUser({ pubertyAssessment: raw }).status !== 'ready') {
      return { ok: false, reason: 'invalid-context' };
    }
    if (!state) load({ user: {} }, { restore: true });
    state.present = true;
    state.raw = raw;
    var reference = { sex: sourceSex, measuredAtISO: context.measuredAtISO, ageMonths: context.ageMonths };
    if (!state.visit) state.visit = newVisit(reference);
    else state.visit.reference = reference;
    state.visit.currentAxes = state.visit.currentAxes.filter(function (key) {
      var observation = raw.observations[key];
      return observation && (owns(observation, 'sex') ? observation.sex : raw.sex) === sourceSex;
    });
    if (stage !== null && state.visit.currentAxes.indexOf(axis) < 0) state.visit.currentAxes.push(axis);
    if (stage === null) state.visit.currentAxes = state.visit.currentAxes.filter(function (key) { return key !== axis; });
    state.visitPresent = true;
    state.visitRaw = clone(state.visit);
    state.mode = 'edited';
    state.pendingIdentity = false;
    bumpActivityRevision();
    try { w.hasUserModifiedAfterLoad = true; } catch (_) { /* Optional existing flag. */ }
    try {
      if (typeof w.updateSaveBtnVisibility === 'function') w.updateSaveBtnVisibility();
    } catch (_) { /* Persistence does not depend on the sidebar button. */ }
    notify('edit');
    scheduleSave();
    return { ok: true };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    subscribers.push(listener);
    return function () { subscribers = subscribers.filter(function (item) { return item !== listener; }); };
  }

  function invalidateIncompatibleAxes(currentSex) {
    if (!state || !eligible() || !state.visit || !state.raw || !state.raw.observations) return false;
    var before = state.visit.currentAxes;
    var filtered = before.filter(function (axis) {
      var observation = state.raw.observations[axis];
      var sourceSex = observation && (owns(observation, 'sex') ? observation.sex : state.raw.sex);
      return observation && sourceSex === currentSex &&
        (axis !== 'G' || currentSex === 'M') && (axis !== 'Th' || currentSex === 'F');
    });
    if (before.length === filtered.length) return false;
    state.visit.currentAxes = filtered;
    state.visitRaw = clone(state.visit);
    return true;
  }

  function applyToUser(user) {
    if (!user || typeof user !== 'object') return;
    if (state && eligible() && state.visit) {
      // A sex change revokes current membership permanently. Merely changing
      // back later cannot renew an examination; its historical JSON stays intact.
      invalidateIncompatibleAxes(sex(user.sex));
      // The importer may finish clearing/recalculating fields after load().
      // Anchor transport to the final collected visit without redating an axis.
      state.visit.reference = payloadContext({ user: user });
      state.visitRaw = clone(state.visit);
    }
    var value = capture();
    if (value.present) user.pubertyAssessment = value.raw;
    else delete user.pubertyAssessment;
    if (value.visitPresent) user.pubertyAssessmentVisit = value.visitRaw;
    else delete user.pubertyAssessmentVisit;
  }

  // The existing DocPro/clearance session merge fills empty fields recursively.
  // Assessment JSON is atomic: neither null slots nor a missing whole key can
  // be repopulated from a previous session. Other merge behavior is unchanged.
  function mergeSession(target, previous, merge) {
    var user = target && target.user;
    var has = owns(user, 'pubertyAssessment');
    var raw = has ? clone(user.pubertyAssessment) : null;
    var hasVisit = owns(user, 'pubertyAssessmentVisit');
    var rawVisit = hasVisit ? clone(user.pubertyAssessmentVisit) : null;
    // Opaque current/future JSON must never be traversed by the generic merger.
    // Detach only the previous user container, leaving the stored session intact.
    var source = previous;
    if (previous && previous.user && typeof previous.user === 'object') {
      source = Object.assign(Object.create(null), previous);
      source.user = Object.assign(Object.create(null), previous.user);
      delete source.user.pubertyAssessment;
      delete source.user.pubertyAssessmentVisit;
    }
    if (user && typeof user === 'object') {
      delete user.pubertyAssessment;
      delete user.pubertyAssessmentVisit;
    }
    try {
      merge(target, source);
    } finally {
      if (target && target.user && typeof target.user === 'object') {
        if (has) target.user.pubertyAssessment = raw;
        else delete target.user.pubertyAssessment;
        if (hasVisit) target.user.pubertyAssessmentVisit = rawVisit;
        else delete target.user.pubertyAssessmentVisit;
      }
    }
    return target;
  }

  function patientLoaded(event) {
    var detail = event && event.detail || {};
    var id = typeof detail.patientId === 'string' && detail.patientId ? detail.patientId : null;
    if (!id) return;
    if (!state) { clear(); return; }
    // applyLoadedData precedes the public identity event in existing callers.
    // That event completes the same explicit load; passive provider/baseline
    // refreshes never call load() and cannot replace this assessment.
    var ownSave = w.__vildaOstatniWlasnyZapis;
    if (state.pendingIdentity || detail.source === 'save' && state.patientId === null &&
        ownSave && ownSave.patientId === id) {
      var previousId = identity();
      state.patientId = id;
      if (state.visit) {
        state.visit.ownerPatientId = id;
        state.visitRaw = clone(state.visit);
      }
      state.vault = w.VildaVault || state.vault;
      state.pendingIdentity = false;
      if (previousId !== id) {
        var completing = state;
        state.identityHandoff = { previousId: previousId, targetId: id };
        Promise.resolve().then(function () {
          if (state !== completing) return;
          state.identityHandoff = null;
          if (!eligible()) return;
          notify('identity');
          scheduleSave();
        });
      }
    } else if (id !== state.patientId) {
      clear();
    }
  }

  try {
    if (w.document && typeof w.document.addEventListener === 'function') {
      w.document.addEventListener('input', blockBootstrapAfterInput, true);
      w.document.addEventListener('change', blockBootstrapAfterInput, true);
      w.document.addEventListener('vilda:patient-loaded', patientLoaded);
      w.document.addEventListener('vilda:user-state-cleared', clear);
      w.document.addEventListener('vilda:auth-loaded', bindVault);
    }
    if (typeof w.addEventListener === 'function') w.addEventListener('vilda:user-state-cleared', clear);
  } catch (_) { /* explicit collector/restore hooks still operate */ }
  bindVault();

  w.VildaPubertyAssessmentState = Object.freeze({ VERSION: '2', load: load,
    capture: capture, applyToUser: applyToUser, clear: clear, mergeSession: mergeSession,
    read: read, subscribe: subscribe, editObservation: editObservation, visitContext: visitContext,
    getActivityRevision: getActivityRevision,
    restoreSessionIfUninitialized: restoreSessionIfUninitialized });
})(typeof window !== 'undefined' ? window : globalThis);
