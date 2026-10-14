/* P-POKWITANIE-KONTRAKT: opaque assessment carried by the active form/session.
 * No editor, clinical interpretation or date inference. A restored visit keeps
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

  function clear() {
    initialized = true;
    bootstrapSession = null;
    state = null;
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
      if (panel && typeof panel.nieaktualny === 'function' && panel.nieaktualny()) { clear(); return false; }
      if (state.patientId !== identity()) { clear(); return false; }
      if (state.vault && (state.vault !== w.VildaVault ||
          typeof state.vault.isUnlocked !== 'function' || !state.vault.isUnlocked())) {
        clear();
        return false;
      }
    } catch (_) { return false; }
    return true;
  }

  function load(payload, options) {
    var user = payload && payload.user;
    var has = owns(user, 'pubertyAssessment');
    initialized = true;
    bootstrapSession = null;
    // Missing is an explicit replacement of the former patient's carrier.
    state = {
      present: has,
      raw: has ? clone(user.pubertyAssessment) : null,
      mode: options && options.restore === true ? 'restored' : 'loaded',
      patientId: identity(),
      vault: ownerVault(identity()),
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
    if (event && event.isTrusted === true) {
      bootstrapConsumed = true;
      bootstrapSession = null;
    }
  }

  function capture() {
    if (!eligible()) return { present: false, raw: null, mode: null, patientId: null };
    return { present: state.present, raw: state.present ? clone(state.raw) : null,
      mode: state.mode, patientId: state.patientId };
  }

  function applyToUser(user) {
    if (!user || typeof user !== 'object') return;
    var value = capture();
    if (value.present) user.pubertyAssessment = value.raw;
    else delete user.pubertyAssessment;
  }

  // The existing DocPro/clearance session merge fills empty fields recursively.
  // Assessment JSON is atomic: neither null slots nor a missing whole key can
  // be repopulated from a previous session. Other merge behavior is unchanged.
  function mergeSession(target, previous, merge) {
    var user = target && target.user;
    var has = owns(user, 'pubertyAssessment');
    var raw = has ? clone(user.pubertyAssessment) : null;
    // Opaque current/future JSON must never be traversed by the generic merger.
    // Detach only the previous user container, leaving the stored session intact.
    var source = previous;
    if (previous && previous.user && typeof previous.user === 'object') {
      source = Object.assign(Object.create(null), previous);
      source.user = Object.assign(Object.create(null), previous.user);
      delete source.user.pubertyAssessment;
    }
    if (user && typeof user === 'object') delete user.pubertyAssessment;
    try {
      merge(target, source);
    } finally {
      if (target && target.user && typeof target.user === 'object') {
        if (has) target.user.pubertyAssessment = raw;
        else delete target.user.pubertyAssessment;
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
      state.patientId = id;
      state.vault = w.VildaVault || state.vault;
      state.pendingIdentity = false;
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

  w.VildaPubertyAssessmentState = Object.freeze({ VERSION: '1', load: load,
    capture: capture, applyToUser: applyToUser, clear: clear, mergeSession: mergeSession,
    restoreSessionIfUninitialized: restoreSessionIfUninitialized });
})(typeof window !== 'undefined' ? window : globalThis);
