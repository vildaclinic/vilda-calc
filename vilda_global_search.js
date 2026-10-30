/* Global patient and matter search. Read-only, decrypted RAM index.
 * Dates and saved clinical text are transported as stored; no clinical values
 * are inferred, interpreted or written by this module.
 */
(function (win) {
  'use strict';
  if (!win || win.VildaGlobalSearch) return;
  var observers = new WeakMap();
  var categories = {
    followup: 'Kontrola', observation: 'Obserwacja', treatment: 'Leczenie',
    'wynik-badania': 'Badanie', lecture: 'Wykład', seminar: 'Seminarium',
    practical: 'Ćwiczenia', clinic: 'Poradnia', 'clinic-nfz': 'Poradnia NFZ',
    duty: 'Dyżur', 'activity-other': 'Zajęcie', absence: 'Nieobecność',
    procedura: 'Procedura', reservation: 'Rezerwacja', 'reminder-task': 'Do wykonania',
    'reminder-contact': 'Kontakt z pacjentem / rodzicem', 'reminder-exam': 'Organizacja badania', 'reminder-other': 'Inne przypomnienie'
  };
  function text(value) { return typeof value === 'string' ? value : typeof value === 'number' && isFinite(value) ? String(value) : ''; }
  function normalize(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLocaleLowerCase('pl').replace(/\s+/g, ' ').trim();
  }
  function day(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? value.slice(0, 10) : ''; }
  function today() { var now = new Date(); return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'); }
  function patientName(record) {
    var header = record && record.header || {};
    return text(header.name) || [text(header.lastName), text(header.firstName)].filter(Boolean).join(' ') || text(record && record.name) || 'Pacjent';
  }
  function error(code, message) { var value = new Error(message); value.code = code; return value; }
  // The vault's legacy hooks do not unsubscribe. A single hook set per vault
  // dispatches to live services, so opening/closing the panel retains no index.
  function observe(vault, listener) {
    var registry = observers.get(vault);
    if (!registry) {
      registry = new Set(); observers.set(vault, registry);
      [['onPatientSaved', 'data'], ['onPatientDeleted', 'data'], ['onPatientNoteChanged', 'data'], ['onUnlock', 'unlock'], ['onLock', 'lock']].forEach(function (entry) {
        if (typeof vault[entry[0]] === 'function') vault[entry[0]](function () { Array.from(registry).forEach(function (callback) { callback(entry[1]); }); });
      });
    }
    registry.add(listener);
    return function () { registry.delete(listener); };
  }
  function dateEntry(kind, value) { return day(value) ? { kind: kind, dateISO: value } : null; }
  function noteDetails(note) {
    var details = [], lab = note.labResult, medication = note.medication, igf = note.igf1;
    if (lab) details.push(['Badanie:', text(lab.test), text(lab.value), text(lab.valueNum), text(lab.unit), text(lab.norm)].filter(Boolean).join(' '));
    if (medication) details.push(['Leczenie:', text(medication.name), text(medication.dose), text(medication.doseNum), text(medication.doseUnit), text(medication.freq)].filter(Boolean).join(' '));
    if (igf) details.push(['IGF-1:', text(igf.value), text(igf.unit)].filter(Boolean).join(' '));
    return details.join('\n');
  }
  function noteStatus(note) {
    if (note.noShowAtISO) return ['no-show', 'Nie zgłosił się'];
    if (note.completedAtISO) return ['completed', 'Zakończone'];
    if (note.careContext && note.careContext.state === 'waiting' || note.category === 'wynik-badania' && note.dueDateISO) return ['waiting', 'Oczekuję na wynik'];
    return ['open', note.dueDateISO ? 'Do wykonania' : 'Otwarte'];
  }
  function planStatus(plan) {
    if (plan.status === 'closed') return ['completed', 'Zamknięty'];
    if (plan.needsDecision) return ['open', 'Do ustalenia'];
    if ((plan.steps || []).some(function (step) { return step.state === 'waiting'; })) return ['waiting', 'Oczekuję na wynik'];
    return ['open', 'Otwarty'];
  }
  function build(patients, external, notes, plans, vault) {
    var names = new Map(), externalIds = new Set((external || []).filter(Boolean).map(function (patient) { return patient.patientId; })), rows = [], keys = new Map();
    function add(row, extra) {
      // Keep the normalized index private, outside the rendering contract.
      keys.set(row.id, normalize([row.patientName, row.title, row.body, row.label, row.statusLabel, extra].filter(Boolean).join(' ')));
      rows.push(row);
    }
    (patients || []).concat(external || []).forEach(function (patient) {
      if (!patient || !patient.patientId || names.has(patient.patientId)) return;
      var name = patientName(patient), header = patient.header || {};
      if (header.external) externalIds.add(patient.patientId);
      names.set(patient.patientId, name);
      add({ id: 'patient:' + patient.patientId, kind: 'patient', label: externalIds.has(patient.patientId) ? 'Pacjent spoza bazy' : 'Pacjent',
        title: name, body: '', patientId: patient.patientId, patientName: name, status: '', statusLabel: '',
        dueDateISO: null, eventDateISO: null, reminderDateISO: null, clinicalDateISO: null,
        completedAtISO: null, noShowAtISO: null, isExternal: externalIds.has(patient.patientId), canOpenPatient: true, dates: [], source: patient },
      [header.firstName, header.lastName, header.dobISO].filter(Boolean).join(' '));
    });
    (notes || []).forEach(function (note) {
      if (!note || !note.id) return;
      var context = note.careContext, role = context && context.role;
      // Plan and reminder helpers are represented by the canonical plan. Real
      // appointments, result narratives and patient notes remain independent.
      if (['plan', 'step', 'decision'].indexOf(role) >= 0 || note.category === 'care-plan') return;
      var activity = note.patientId === vault.ACTIVITY_PATIENT_ID, legacyExternal = note.patientId === vault.EXTERNAL_PATIENT_ID;
      if (!activity && !legacyExternal && !names.has(note.patientId)) return;
      var name = names.get(note.patientId) || text(note.externalName) || (activity ? 'Zajęcie' : 'Pacjent spoza bazy');
      var kind = note.labResult || note.igf1 ? 'lab' : note.dueDateISO ? 'event' : 'note';
      var reminder = role !== 'calendar' && (note.reminderContext && note.reminderContext.kind === 'reminder' || /^reminder-/.test(note.category || ''));
      var label = kind === 'lab' ? 'Badanie' : kind === 'event' ? reminder ? 'Przypomnienie' : 'Wydarzenie' : 'Notatka';
      var status = noteStatus(note), detail = noteDetails(note), category = Object.prototype.hasOwnProperty.call(categories, note.category) ? categories[note.category] : text(note.category);
      var dates = [dateEntry(reminder ? 'reminder' : 'event', note.dueDateISO), dateEntry('clinical', note.clinicalDateISO)].filter(Boolean);
      add({ id: 'note:' + note.id, kind: kind, label: label, title: text(note.title) || category || label,
        body: [text(note.body), detail].filter(Boolean).join('\n\n'), patientId: note.patientId, patientName: name,
        noteId: note.id, planId: context && context.planId || null, dueDateISO: note.dueDateISO || null,
        eventDateISO: !reminder && note.dueDateISO || null, reminderDateISO: reminder && note.dueDateISO || null, clinicalDateISO: note.clinicalDateISO || null,
        completedAtISO: note.completedAtISO || null, noShowAtISO: note.noShowAtISO || null,
        status: status[0], statusLabel: status[1], categoryLabel: category, procedureType: text(note.procedureType),
        isActivity: activity, isExternal: legacyExternal || externalIds.has(note.patientId), isReminder: !!reminder,
        canOpenPatient: !activity && !legacyExternal, dates: dates, source: note },
      [category, text(note.procedureType), text(note.externalName)].filter(Boolean).join(' '));
    });
    (plans || []).forEach(function (plan) {
      if (!plan || !plan.id || !names.has(plan.patientId)) return;
      var status = planStatus(plan), steps = Array.isArray(plan.steps) ? plan.steps : [], dates = [];
      var stepText = steps.map(function (step) {
        var state = { pending: 'Do wykonania', waiting: 'Oczekuję na wynik', done: 'Zakończony', cancelled: 'Niewykonany' }[step.state] || '';
        dates.push(dateEntry('event', step.eventDateISO), dateEntry('reminder', step.reminderDateISO));
        return [text(step.title), text(step.kind), text(step.description), state].filter(Boolean).join(' · ');
      }).join('\n');
      dates.push(dateEntry('reminder', plan.decisionDueDateISO)); dates = dates.filter(Boolean);
      var firstEvent = steps.find(function (step) { return !!day(step.eventDateISO); });
      var firstReminder = steps.find(function (step) { return !!day(step.reminderDateISO); });
      var history = (Array.isArray(plan.log) ? plan.log : []).map(function (entry) { return text(entry.text); }).filter(Boolean).join('\n');
      add({ id: 'plan:' + plan.id, kind: 'plan', label: 'Plan opieki', title: text(plan.title) || 'Plan opieki',
        body: [text(plan.goal), stepText, history, text(plan.closeReason), text(plan.closeText)].filter(Boolean).join('\n\n'),
        patientId: plan.patientId, patientName: names.get(plan.patientId), planId: plan.id,
        dueDateISO: null, eventDateISO: firstEvent && firstEvent.eventDateISO || null,
        reminderDateISO: firstReminder && firstReminder.reminderDateISO || plan.decisionDueDateISO || null,
        clinicalDateISO: null, completedAtISO: plan.closedAtISO || null, noShowAtISO: null,
        status: status[0], statusLabel: status[1], isExternal: externalIds.has(plan.patientId), canOpenPatient: true, dates: dates, source: plan });
    });
    rows.sort(function (left, right) {
      if (left.kind === 'patient' && right.kind !== 'patient') return -1;
      if (right.kind === 'patient' && left.kind !== 'patient') return 1;
      return left.patientName.localeCompare(right.patientName, 'pl') || left.title.localeCompare(right.title, 'pl') || left.id.localeCompare(right.id);
    });
    return { rows: rows, keys: keys };
  }
  function create(options) {
    options = options || {};
    var vault = options.vault || win.VildaVault, doc = options.document || win.document;
    if (!vault) throw error('GLOBAL_SEARCH_UNAVAILABLE', 'Wyszukiwarka nie jest dostępna. Odśwież aplikację.');
    var account = vault.getCurrentUser && vault.getCurrentUser(), accountId = account && account.userId;
    var destroyed = false, generation = 0, cached = null, pending = null;
    function invalidate(reason) {
      if (destroyed) return;
      generation += 1; cached = null; pending = null;
      if (options.onInvalidate) { try { options.onInvalidate(reason || 'data'); } catch (_) {} }
    }
    function assertCurrent(stamp) {
      if (destroyed || stamp !== generation) throw error('STALE_GLOBAL_SEARCH', 'Dane wyszukiwania zmieniły się. Wyszukaj ponownie.');
      var current = vault.getCurrentUser && vault.getCurrentUser();
      if (!vault.isUnlocked || !vault.isUnlocked() || !current) throw error('GLOBAL_SEARCH_LOCKED', 'Odblokuj konto, aby wyszukać pacjentów i sprawy.');
      if (!accountId || current.userId !== accountId) {
        invalidate('session'); throw error('STALE_GLOBAL_SEARCH', 'Konto zmieniło się. Otwórz wyszukiwarkę ponownie.');
      }
    }
    async function load() {
      var stamp = generation; assertCurrent(stamp);
      if (cached) return cached.rows;
      if (pending) return pending;
      ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans'].forEach(function (method) {
        if (typeof vault[method] !== 'function') throw error('GLOBAL_SEARCH_UNAVAILABLE', 'Odśwież aplikację, aby korzystać z wyszukiwarki pacjentów i spraw.');
      });
      var request = (async function () {
        // Each source is decrypted once per index generation, never once per
        // keystroke. No getPatient()/snapshot payload is needed for a result.
        var sources = await Promise.all([vault.listPatients(), vault.listExternalPatients(), vault.listAllPatientNotes(), vault.listCarePlans()]);
        assertCurrent(stamp);
        var next = build(sources[0], sources[1], sources[2], sources[3], vault);
        assertCurrent(stamp); cached = next; return next.rows;
      })();
      pending = request;
      try { return await request; }
      finally { if (pending === request) pending = null; }
    }
    async function search(query, filters) {
      filters = filters || {}; var stamp = generation, rows = await load(); assertCurrent(stamp);
      var tokens = normalize(query).split(' ').filter(Boolean), reference = day(filters.today) || today();
      var keys = cached.keys;
      return rows.filter(function (row) {
        if (tokens.some(function (token) { return keys.get(row.id).indexOf(token) < 0; })) return false;
        if (filters.status && filters.status !== 'all') {
          if (filters.status === 'open' ? row.status !== 'open' && row.status !== 'waiting' : row.status !== filters.status) return false;
        }
        var dates = row.dates.map(function (entry) { return day(entry.dateISO); }).filter(Boolean);
        if (filters.time === 'undated') return !dates.length;
        if (filters.time === 'future') return dates.some(function (value) { return value > reference; });
        if (filters.time === 'past') return dates.some(function (value) { return value < reference; });
        if (filters.time === 'today') return dates.indexOf(reference) >= 0;
        return true;
      });
    }
    var unobserve = observe(vault, invalidate);
    function syncChanged() { invalidate('sync'); }
    if (doc && doc.addEventListener) doc.addEventListener('vilda:sync-merged', syncChanged);
    return {
      load: load, search: search, invalidate: invalidate,
      destroy: function () {
        if (destroyed) return; destroyed = true; generation += 1; cached = null; pending = null; unobserve();
        if (doc && doc.removeEventListener) doc.removeEventListener('vilda:sync-merged', syncChanged);
      }
    };
  }
  win.VildaGlobalSearch = { create: create, normalize: normalize };
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
