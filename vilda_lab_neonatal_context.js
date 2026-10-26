/* Derived neonatal age shared by the main form and LH/FSH. No birth date leaves
 * VildaDobAge, and its saved-visit anchor remains authoritative. A separate cache
 * in this tab survives main-form flushes without editing shared patient data. */
(function (w) {
  'use strict';
  var KEY = 'vildaLabNeonatalAgeV1';
  // Keep the existing weeks editor unchanged. The LH/FSH consumer can also
  // reuse known calendar days across the 2–5 month reference window.
  var CALENDAR_MONTH_LIMIT = 6;
  var INFANT_LH_CALENDAR_MONTH_LIMIT = 12;
  var pending = null;
  var boundVault = null;

  function integer(value) {
    if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
    var n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  function text(value) { return value == null ? '' : String(value).trim(); }
  function stored(key) {
    try { return w.sessionStorage ? text(w.sessionStorage.getItem(key)) : ''; }
    catch (_) { return ''; }
  }
  function identity() {
    try { if (w.sessionStorage) return stored('vildaCurrentPatientId'); } catch (_) { /* no storage */ }
    return text(w._vildaCurrentPatientId);
  }
  function mode() { return stored('vildaLoadChoiceV1') + ':' + stored('vildaDobAgeZapisV1'); }
  function day() {
    var now = new Date();
    return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
  }
  function field(id) {
    return w.document && w.document.getElementById ? w.document.getElementById(id) : null;
  }
  function values() {
    var out = {};
    ['age', 'ageMonths', 'weight', 'height'].forEach(function (id) {
      var el = field(id); out[id] = el ? text(el.value) : '';
    });
    return out;
  }
  function sameForm(a, b) {
    return ['age', 'ageMonths', 'weight', 'height'].every(function (key) {
      return text(a[key]) === text(b[key]);
    });
  }
  function interval(lower, upper, source) { return { lower: lower, upper: upper, source: source }; }
  function readForm(options) {
    var api = w.VildaDobAge, form = values();
    if (!field('dobInput') || !field('age') || !api || integer(form.age) !== 0) return null;
    var months = integer(form.ageMonths);
    if (months == null) months = 0;
    var includeInfantLhTail = options && options.includeInfantLhTail === true;
    if (months >= (includeInfantLhTail ? INFANT_LH_CALENDAR_MONTH_LIMIT : CALENDAR_MONTH_LIMIT)) return null;
    var exact = typeof api.readExactAge === 'function' ? api.readExactAge() : null;
    var result, liveDay = null;
    if (exact && integer(exact.days) != null && exact.totalMonths === months) {
      result = interval(Math.max(0, exact.days - 1), exact.days, 'main-calendar-dates');
      if (!(api.showsSavedMeasurement && api.showsSavedMeasurement())) liveDay = day();
    } else {
      if (months >= CALENDAR_MONTH_LIMIT || months >= api.WEEKS_MONTH_LIMIT) return null;
      // An invalid birth date must not lend precision to leftover weeks.
      var dob = field('dobInput');
      if (dob && text(dob.value) && !(api.readISO && api.readISO())) return null;
      var weeks = typeof api.readWeeks === 'function' ? api.readWeeks() : null;
      if (integer(weeks) == null) return null;
      result = interval(weeks * 7, weeks * 7 + 6, 'main-completed-weeks');
    }
    var record = { version: 1, identityKey: identity(), mode: mode(), form: form,
      liveDay: liveDay, postnatalDays: result };
    if (months >= api.WEEKS_MONTH_LIMIT) record.minipubertyOnly = true;
    if (months >= CALENDAR_MONTH_LIMIT) record.infantLhTailOnly = true;
    return record;
  }
  function currentPanel() {
    try {
      if (w.VildaPanelPacjent && w.VildaPanelPacjent.nieaktualny && w.VildaPanelPacjent.nieaktualny()) return false;
      if (typeof w._vildaCurrentPatientId !== 'undefined' && text(w._vildaCurrentPatientId) !== identity()) return false;
      return true;
    } catch (_) { return false; }
  }
  function publish() {
    var adapter = w.VildaPersistence;
    if (!field('dobInput') || !currentPanel() || !adapter || !adapter.writeJSON) return false;
    if (w.__vildaPersistRestoring || w.__vildaLustroWpis || adapter.isRestoring && adapter.isRestoring()) return false;
    if (adapter.isClearInProgress && adapter.isClearInProgress()) return false;
    if (identity() && (!w.VildaVault || !w.VildaVault.isUnlocked || !w.VildaVault.isUnlocked())) { clear(); return false; }
    // The extended calendar cache is opt-in at read time. Existing clinical
    // consumers retain their six-month limit and the completed-weeks contract.
    var next = readForm({ includeInfantLhTail: true });
    if (JSON.stringify(readCache()) === JSON.stringify(next)) return false;
    // Cache may precede the ordinary shared-form writer. The reader verifies
    // their agreement; publishing never writes to sharedUserData or its timestamp.
    return next ? adapter.writeJSON('session', KEY, next) : clear();
  }
  function readCache() {
    try {
      return w.VildaPersistence && w.VildaPersistence.readJSON
        ? w.VildaPersistence.readJSON('session', KEY, null) : null;
    } catch (_) { return null; }
  }
  function clear() {
    try {
      return w.VildaPersistence && w.VildaPersistence.removeKey
        ? w.VildaPersistence.removeKey('session', KEY) : false;
    } catch (_) { return false; }
  }
  function read(shared, patientId, source, options) {
    shared = shared && typeof shared === 'object' ? shared : {};
    if (text(patientId) && (!source || source.patientId !== text(patientId) || source.status !== 'ready')) return null;
    var saved = readCache(), postnatal = null, gestational = null;
    var calendarMonths = saved && saved.form ? integer(saved.form.ageMonths) : null;
    var infantTail = saved && (saved.infantLhTailOnly === true ||
      calendarMonths != null && calendarMonths >= CALENDAR_MONTH_LIMIT);
    var infantTailAllowed = !infantTail || saved.infantLhTailOnly === true &&
      integer(saved.form && saved.form.age) === 0 && calendarMonths >= CALENDAR_MONTH_LIMIT &&
      calendarMonths < INFANT_LH_CALENDAR_MONTH_LIMIT && options && options.includeInfantLhTail === true;
    if (saved && saved.version === 1 && saved.identityKey === text(patientId)
      && saved.mode === mode() && sameForm(saved.form || {}, shared)
      && infantTailAllowed
      && (!saved.minipubertyOnly || options && options.includeMinipuberty === true)
      && (!saved.liveDay || saved.liveDay === day())) {
      var p = saved.postnatalDays;
      if (p && integer(p.lower) != null && integer(p.upper) != null && p.lower <= p.upper
        && (!infantTail || p.source === 'main-calendar-dates')
        && ['main-calendar-dates', 'main-completed-weeks'].indexOf(p.source) >= 0) {
        postnatal = interval(p.lower, p.upper, p.source);
      }
    }
    if (source && source.patientId === text(patientId) && source.status === 'ready'
      && source.neonatalAge && source.neonatalAge.gestationalDays) {
      var g = source.neonatalAge.gestationalDays;
      gestational = interval(g.lower, g.upper, g.source);
    }
    return postnatal || gestational ? { postnatalDays: postnatal, gestationalDays: gestational } : null;
  }
  function schedule() {
    if (pending != null || typeof w.setTimeout !== 'function') return;
    pending = w.setTimeout(function () { pending = null; publish(); }, 0);
  }
  function bindVault() {
    var vault = w.VildaVault;
    if (!vault || vault === boundVault || !vault.onLock || !vault.onUnlock) return;
    boundVault = vault;
    vault.onLock(function () { if (w.VildaVault === vault) clear(); });
    // A new same-tab page also unlocks its vault from the existing session.
    // Keep the cache across that navigation; an actual lock already removed it.
    vault.onUnlock(function () { if (w.VildaVault === vault) schedule(); });
  }
  function mount() {
    if (!field('dobInput') || !w.document || !w.document.addEventListener) return;
    ['input', 'change'].forEach(function (event) {
      w.document.addEventListener(event, function (ev) {
        if (ev && ev.target && ['dobInput', 'age', 'ageMonths', 'ageWeeks', 'weight', 'height'].indexOf(ev.target.id) >= 0) schedule();
      });
    });
    ['vilda:patient-loaded', 'vilda:state-restored', 'vilda:persist-restored', 'vilda:zrodlo-pacjenta-zmienione'].forEach(function (event) {
      w.document.addEventListener(event, schedule);
    });
    if (w.addEventListener) w.addEventListener('focus', schedule);
    schedule();
  }
  w.VildaLabNeonatalContext = { VERSION: '1', read: read, readForm: readForm, readCache: readCache, publish: publish, clear: clear };
  bindVault();
  if (w.addEventListener) {
    w.addEventListener('vilda:user-state-cleared', clear);
    w.addEventListener('storage', function (ev) {
      if (ev && (ev.key == null || ev.key === 'vildaCurrentPatientId')) {
        var cached = readCache();
        if (cached && cached.identityKey !== identity()) clear();
      }
    });
  }
  if (w.document && w.document.addEventListener) {
    w.document.addEventListener('vilda:auth-loaded', bindVault);
    if (w.document.readyState === 'loading') w.document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
}(typeof window !== 'undefined' ? window : globalThis));
