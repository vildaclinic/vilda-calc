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
  var INFANT_TT_CALENDAR_MONTH_LIMIT = 12;
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
  // Same calendar-anniversary/clamp convention as VildaLabPuberty.resolveAge.
  // Compute only derived ages at the main form; DOB is never cached/exported.
  function calendarAge(iso, pna) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var parts = iso.split('-').map(Number), birth = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    var birthday = new Date(birth);
    if (!Number.isFinite(birth) || birthday.getUTCFullYear() !== parts[0] ||
        birthday.getUTCMonth() !== parts[1] - 1 || birthday.getUTCDate() !== parts[2]) return null;
    function anniversary(months) {
      var year = parts[0] + Math.floor((parts[1] - 1 + months) / 12);
      var month = (parts[1] - 1 + months) % 12;
      var last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return Date.UTC(year, month, Math.min(parts[2], last));
    }
    function at(dayCount) {
      var time = birth + dayCount * 86400000, date = new Date(time);
      if (!Number.isFinite(time) || Number.isNaN(date.getTime())) return null;
      var months = (date.getUTCFullYear() - parts[0]) * 12 + date.getUTCMonth() - (parts[1] - 1);
      if (anniversary(months) > time) months -= 1;
      var start = anniversary(months), end = anniversary(months + 1);
      return (months + (time - start) / (end - start)) / 12;
    }
    var lower = at(pna.lower), upper = at(pna.upper);
    return Number.isFinite(lower) && Number.isFinite(upper) && upper >= lower
      ? { lowerYears: lower, upperYears: upper, upperInclusive: true,
        postnatalDays: interval(pna.lower, pna.upper, pna.source) } : null;
  }
  function readForm(options) {
    var api = w.VildaDobAge, form = values();
    if (!field('dobInput') || !field('age') || !api || integer(form.age) !== 0) return null;
    var months = integer(form.ageMonths);
    if (months == null) months = 0;
    var includeInfantLhTail = options && options.includeInfantLhTail === true;
    var includeInfantTtTail = options && options.includeInfantTtTail === true;
    var monthLimit = includeInfantLhTail ? INFANT_LH_CALENDAR_MONTH_LIMIT
      : includeInfantTtTail ? INFANT_TT_CALENDAR_MONTH_LIMIT : CALENDAR_MONTH_LIMIT;
    if (months >= monthLimit) return null;
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
    if (result.source === 'main-calendar-dates' && typeof api.readISO === 'function') {
      var calendar = calendarAge(api.readISO(), result);
      if (calendar) record.femaleTtCalendarAge = calendar;
    }
    if (months >= api.WEEKS_MONTH_LIMIT) record.minipubertyOnly = true;
    if (months >= CALENDAR_MONTH_LIMIT) {
      if (includeInfantLhTail) record.infantLhTailOnly = true;
      if (includeInfantTtTail) record.infantTtTailOnly = true;
    }
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
    var next = readForm({ includeInfantLhTail: true, includeInfantTtTail: true });
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
    var saved = readCache(), postnatal = null, gestational = null, calendar = null;
    var calendarMonths = saved && saved.form ? integer(saved.form.ageMonths) : null;
    var infantTail = saved && (saved.infantLhTailOnly === true || saved.infantTtTailOnly === true ||
      calendarMonths != null && calendarMonths >= CALENDAR_MONTH_LIMIT);
    var infantTailAllowed = !infantTail || integer(saved.form && saved.form.age) === 0 &&
      calendarMonths >= CALENDAR_MONTH_LIMIT && options &&
      (saved.infantLhTailOnly === true && calendarMonths < INFANT_LH_CALENDAR_MONTH_LIMIT && options.includeInfantLhTail === true ||
        saved.infantTtTailOnly === true && calendarMonths < INFANT_TT_CALENDAR_MONTH_LIMIT && options.includeInfantTtTail === true);
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
        var c = saved.femaleTtCalendarAge, cp = c && c.postnatalDays;
        if (options && options.includeFemaleTtCalendarAge === true && p.source === 'main-calendar-dates' &&
            c && Number.isFinite(c.lowerYears) && c.lowerYears >= 0 && Number.isFinite(c.upperYears) &&
            c.upperYears >= c.lowerYears && c.upperInclusive === true && cp && cp.source === p.source &&
            cp.lower === p.lower && cp.upper === p.upper) {
          // A same-document programmatic DOB edit can precede its input event.
          // Across pages the synchronous invalidation below protects the cache.
          var api = field('dobInput') && w.VildaDobAge, exact = api && typeof api.readExactAge === 'function' ? api.readExactAge() : null;
          var current = api && typeof api.readISO === 'function'
            ? exact && exact.days === p.upper ? calendarAge(api.readISO(), p) : null : c;
          if (current && current.lowerYears === c.lowerYears && current.upperYears === c.upperYears) {
            calendar = { lowerYears: c.lowerYears, upperYears: c.upperYears, upperInclusive: true,
              postnatalDays: interval(p.lower, p.upper, p.source) };
          }
        }
      }
    }
    if (source && source.patientId === text(patientId) && source.status === 'ready'
      && source.neonatalAge && source.neonatalAge.gestationalDays) {
      var g = source.neonatalAge.gestationalDays;
      gestational = interval(g.lower, g.upper, g.source);
    }
    var result = postnatal || gestational ? { postnatalDays: postnatal, gestationalDays: gestational } : null;
    if (result && calendar) result.femaleTtCalendarAge = calendar;
    return result;
  }
  function invalidateCalendar() {
    var adapter = w.VildaPersistence;
    if (!field('dobInput') || !adapter ||
        typeof w._vildaCurrentPatientId !== 'undefined' && text(w._vildaCurrentPatientId) !== identity()) return;
    var cached = readCache();
    if (cached && cached.identityKey === identity()) clear();
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
        if (ev && ev.target && ['dobInput', 'age', 'ageMonths', 'ageWeeks', 'weight', 'height'].indexOf(ev.target.id) >= 0) {
          if (ev.target.id === 'dobInput') invalidateCalendar();
          schedule();
        }
      }, true);
    });
    ['vilda:patient-loaded', 'vilda:state-restored', 'vilda:persist-restored', 'vilda:zrodlo-pacjenta-zmienione',
      'vilda:dob-restored', 'vilda:main-session-restored'].forEach(function (event) {
      w.document.addEventListener(event, function () { invalidateCalendar(); schedule(); });
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
