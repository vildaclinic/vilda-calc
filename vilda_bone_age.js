/* Wiek kostny należy do badania, nie do każdego kolejnego pomiaru wzrostu.
 * current oznacza badanie bieżącej wizyty; last jest wcześniejszym wynikiem
 * dostępnym dla obliczeń. Ich wiek oznaczenia nie zmienia się przy zapisie.
 * Dawne scalare zachowujemy jako legacy, bez zgadywania daty badania.
 */
(function (w) {
  'use strict';

  var state = null;
  var fieldSnapshot = '';
  var applying = false;
  var sequence = 0;

  function number(value) {
    if (value == null || String(value).trim() === '') return null;
    var n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function years(value) {
    var n = number(value);
    return n !== null && n > 0 && n <= 20 ? n : null;
  }

  function age(value) {
    var n = number(value);
    return n !== null && n >= 0 ? Math.round(n) : null;
  }

  function field(id) {
    return w.document && w.document.getElementById ? w.document.getElementById(id) : null;
  }

  function currentAge() {
    var y = field('age');
    var m = field('ageMonths');
    var a = number(y && y.value);
    var b = number(m && m.value);
    if (a === null && b === null) return null;
    try {
      if (typeof w.getAgeDecimal === 'function') {
        var exact = number(w.getAgeDecimal());
        if (exact !== null && exact >= 0) return age(exact * 12);
      }
    } catch (_) { /* Fields remain available without the age adapter. */ }
    return age((a || 0) * 12 + (b || 0));
  }

  function payloadAge(payload) {
    var user = payload && payload.user || {};
    var y = number(user.age);
    var m = number(user.ageMonths);
    return y === null && m === null ? null : age((y || 0) * 12 + (m || 0));
  }

  function observation(value) {
    if (!value || typeof value !== 'object') return null;
    var ba = years(value.years);
    if (ba === null) return null;
    var out = {
      years: ba,
      atAgeMonths: age(value.atAgeMonths),
      dateISO: typeof value.dateISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.dateISO) ? value.dateISO : null,
      source: value.source === 'legacy' ? 'legacy' : value.source === 'history' ? 'history' : 'measured'
    };
    if (typeof value.id === 'string' && value.id) out.id = value.id;
    return out;
  }

  function normaliseContext(value) {
    if (!value || value.version !== 1) return null;
    return { version: 1, current: observation(value.current), last: observation(value.last) };
  }

  function contextFrom(data) {
    if (!data || typeof data !== 'object') return null;
    return normaliseContext(data.boneAgeContext)
      || normaliseContext(data.data && data.data.boneAgeContext);
  }

  function empty() {
    return { version: 1, current: null, last: null };
  }

  function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }

  function historyLast(payload) {
    var advanced = payload && payload.advanced || {};
    var rows = advanced.data && Array.isArray(advanced.data.measurements) ? advanced.data.measurements : [];
    var basic = payload && payload.growthBasic;
    if (basic && basic.data && Array.isArray(basic.data.measurements)) rows = rows.concat(basic.data.measurements);
    var last = null;
    rows.forEach(function (row) {
      if (!row) return;
      var ba = years(row.boneAgeYears);
      var at = age(row.ageMonths);
      if (ba !== null && at !== null && (!last || at > last.atAgeMonths)) {
        last = observation({ years: ba, atAgeMonths: at, dateISO: row.dateISO, source: 'history' });
      }
    });
    (Array.isArray(payload && payload.ghTherapyPoints) ? payload.ghTherapyPoints : []).forEach(function (point) {
      if (!point) return;
      var ba = years(point.boneAge);
      var y = number(point.ageYears);
      var m = number(point.ageMonths);
      var at = y === null && m === null ? null : age((y || 0) * 12 + (m || 0));
      if (ba !== null && at !== null && (!last || at > last.atAgeMonths)) {
        last = observation({ years: ba, atAgeMonths: at, dateISO: point.dateISO, source: 'history' });
      }
    });
    return last;
  }

  function readPayload(payload) {
    var advanced = payload && payload.advanced || {};
    var known = contextFrom(advanced);
    if (known) return known;
    var ba = years(advanced.boneAgeYears);
    if (ba === null && advanced.data) {
      var months = number(advanced.data.boneAgeMonths);
      ba = months === null ? null : years(months / 12);
    }
    // Legacy age anchors compatibility with the old visit/chart, not freshness.
    return {
      version: 1,
      current: ba === null ? null : observation({ years: ba, atAgeMonths: payloadAge(payload), source: 'legacy' }),
      last: historyLast(payload)
    };
  }

  function persist() {
    if (!state) return;
    w.vildaBoneAgeContext = clone(state);
    if (w.advancedGrowthData && typeof w.advancedGrowthData === 'object') {
      w.advancedGrowthData.boneAgeContext = clone(state);
    }
  }

  function writeField() {
    var input = field('advBoneAge');
    var value = state && state.current ? String(state.current.years) : '';
    applying = true;
    if (input) input.value = value;
    fieldSnapshot = value;
    applying = false;
  }

  function ensure() {
    if (state) return;
    state = normaliseContext(w.vildaBoneAgeContext) || contextFrom(w.advancedGrowthData);
    var input = field('advBoneAge');
    if (!state) {
      state = empty();
      // Restored old sessions have no proof of when this field was measured.
      var ba = years(input && input.value);
      if (ba !== null) state.current = observation({ years: ba, atAgeMonths: currentAge(), source: 'legacy' });
    }
    fieldSnapshot = input ? String(input.value || '') : state.current ? String(state.current.years) : '';
  }

  function newObservation(ba) {
    var id;
    if (w.crypto && typeof w.crypto.randomUUID === 'function') id = w.crypto.randomUUID();
    else id = 'bone-age-' + Date.now() + '-' + (++sequence);
    return observation({ years: ba, atAgeMonths: currentAge(), source: 'measured', id: id });
  }

  function sync() {
    ensure();
    if (applying || w.__vildaPersistRestoring) return;
    var input = field('advBoneAge');
    var value = input ? String(input.value || '') : fieldSnapshot;
    if (input && value !== fieldSnapshot) {
      var ba = years(value);
      if (ba === null) state.current = null;
      else if (!state.current || state.current.years !== ba) state.current = newObservation(ba);
      fieldSnapshot = value;
    }
    var at = currentAge();
    if (state.current && state.current.atAgeMonths === null && state.current.source === 'measured' && at !== null) {
      state.current.atAgeMonths = at;
    }
    if (state.current && at !== null && state.current.atAgeMonths !== null && at !== state.current.atAgeMonths) {
      state.last = clone(state.current);
      state.current = null;
      writeField();
    }
    persist();
  }

  function formatAge(months) {
    var n = age(months);
    return n === null ? '' : Math.floor(n / 12) + ' lat ' + (n % 12) + ' mies.';
  }

  function updateInfo() {
    var info = field('advBoneAgeLastInfo');
    if (!info || !state) return;
    var last = state.last;
    info.hidden = !last;
    if (!last) { info.textContent = ''; return; }
    var text = 'Ostatni znany wiek kostny: ' + String(last.years).replace('.', ',') + ' lat';
    if (last.source !== 'legacy' && last.atAgeMonths !== null) {
      text += ', oznaczony przy wieku ' + formatAge(last.atAgeMonths);
      var at = currentAge();
      if (at !== null && at >= last.atAgeMonths) text += ' (' + (at - last.atAgeMonths) + ' mies. temu)';
    } else text += ' (czas oznaczenia nieznany)';
    info.textContent = text + '. Wynik pozostaje dostępny dla obliczeń.';
  }

  function capture() {
    sync();
    updateInfo();
    return clone(state);
  }

  function load(payload, options) {
    var next = readPayload(payload);
    if (!(options && options.restore === true)) next = { version: 1, current: null, last: clone(next.current || next.last) };
    state = next;
    writeField();
    persist();
    updateInfo();
    return clone(state);
  }

  function restoreContext(value) {
    var next = normaliseContext(value);
    if (!next) return false;
    state = next;
    writeField();
    persist();
    updateInfo();
    return true;
  }

  function clear() {
    state = empty();
    writeField();
    persist();
    updateInfo();
  }

  function effective() {
    var value = capture();
    return clone(value.current || value.last);
  }

  function currentYearsFor(advanced, atAgeMonths) {
    var ctx = contextFrom(advanced);
    if (!ctx) return years(advanced && advanced.boneAgeYears);
    var at = age(atAgeMonths);
    return ctx.current && at !== null && ctx.current.atAgeMonths === at ? ctx.current.years : null;
  }

  function chartBoneAgeMonths(data, atAgeMonths) {
    var ctx = contextFrom(data);
    if (!ctx) return number(data && data.boneAgeMonths);
    var ba = currentYearsFor({ boneAgeContext: ctx }, atAgeMonths);
    return ba === null ? null : Math.round(ba * 12);
  }

  function normContextFor(data) {
    var ctx = contextFrom(data);
    var result = ctx && (ctx.current || ctx.last);
    if (result) return {
      baMonths: Math.round(result.years * 12),
      atAgeMonths: result.source === 'legacy' ? null : result.atAgeMonths
    };
    if (ctx) return null;
    var ba = number(data && data.boneAgeMonths);
    if (ba === null) {
      var y = years(data && data.boneAgeYears);
      if (y !== null) ba = Math.round(y * 12);
    }
    // atAgeMonths supplied by the caller is not proof of the legacy study age.
    return ba === null ? null : { baMonths: ba, atAgeMonths: null };
  }

  function normContext() {
    return normContextFor({ boneAgeContext: capture() }, currentAge());
  }

  function applyToAdvanced(advanced, atAgeMonths) {
    if (!advanced || typeof advanced !== 'object') return advanced;
    var ctx = capture();
    advanced.boneAgeContext = ctx;
    advanced.boneAgeYears = currentYearsFor(advanced, atAgeMonths);
    if (advanced.data && typeof advanced.data === 'object') {
      advanced.data.boneAgeContext = clone(ctx);
      var known = ctx.current || ctx.last;
      advanced.data.boneAgeMonths = known ? Math.round(known.years * 12) : null;
    }
    return advanced;
  }

  function onInput(event) {
    var target = event && event.target;
    if (!target || ['advBoneAge', 'age', 'ageMonths'].indexOf(target.id) < 0) return;
    if (target.id === 'advBoneAge' && !applying && !w.__vildaPersistRestoring) {
      ensure();
      var ba = years(target.value);
      if (ba === null) state.current = null;
      else if (!state.current || state.current.years !== ba || (state.current.source === 'legacy' && event.isTrusted !== false)) {
        state.current = newObservation(ba);
      }
      fieldSnapshot = String(target.value || '');
    }
    capture();
  }

  function boot() {
    if (!w.document || !w.document.addEventListener) return;
    w.document.addEventListener('input', onInput, true);
    w.document.addEventListener('change', onInput, true);
    w.document.addEventListener('vilda:patient-choice', function () { capture(); });
    if (w.addEventListener) w.addEventListener('vilda:user-state-cleared', clear);
    // Persistence restores globals/fields after scripts boot; defer hydration to
    // the first real calculation or edit instead of treating restored input as new.
  }

  w.VildaBoneAge = {
    VERSION: '1',
    readPayload: readPayload,
    normaliseContext: normaliseContext,
    load: load,
    restoreContext: restoreContext,
    capture: capture,
    effective: effective,
    currentAge: currentAge,
    currentYearsFor: currentYearsFor,
    chartBoneAgeMonths: chartBoneAgeMonths,
    normContextFor: normContextFor,
    normContext: normContext,
    applyToAdvanced: applyToAdvanced,
    clear: clear
  };
  boot();
}(typeof window !== 'undefined' ? window : globalThis));
