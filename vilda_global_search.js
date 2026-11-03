/* Global patient and matter search. Read-only, decrypted RAM index.
 * Saved calculations use the same frozen presentation model as Notes. No
 * clinical engine, current policy or patient write is used while searching.
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
  // Legacy vault hooks cannot unsubscribe. Keep one hook set per vault, but
  // retain external listeners only while at least one service uses the context.
  function observe(vault, doc, listener) {
    var registry = observers.get(vault);
    if (!registry) {
      registry = { listeners: new Set(), contexts: new Map(), documents: new Map(), recent: new Map() };
      observers.set(vault, registry);
      registry.emit = function (reason, envelope) {
        var key = '', signal = envelope && typeof envelope === 'object' ? envelope : null;
        if (signal && typeof signal.changeId === 'string' && signal.changeId && signal.changeId.length <= 160) key = 'id:' + signal.changeId;
        else if (signal && typeof signal.sender === 'string' && signal.sender && signal.sender.length <= 160 && typeof signal.ts === 'number' && isFinite(signal.ts) && (signal.action == null || typeof signal.action === 'string' && signal.action.length <= 80)) {
          key = 'legacy:' + signal.sender + ':' + signal.ts + ':' + text(signal.type) + ':' + text(signal.action);
        }
        if (key) {
          if (registry.recent.has(key)) return;
          registry.recent.set(key, true);
          if (registry.recent.size > 256) registry.recent.delete(registry.recent.keys().next().value);
        }
        if (reason === 'lock' || reason === 'unlock') registry.recent.clear();
        Array.from(registry.listeners).forEach(function (callback) { callback(reason); });
      };
      [['onPatientSaved', 'data'], ['onPatientDeleted', 'data'], ['onPatientNoteChanged', 'data'], ['onUnlock', 'unlock'], ['onLock', 'lock']].forEach(function (entry) {
        if (typeof vault[entry[0]] === 'function') vault[entry[0]](function (_, envelope) { registry.emit(entry[1], envelope); });
      });
    }
    var context = doc && doc.defaultView || win, contextEntry = registry.contexts.get(context), documentEntry = doc && registry.documents.get(doc);
    if (!contextEntry) {
      function changed(event) {
        var signal = event && event.data;
        if (signal && signal.type === 'note-changed') registry.emit('data', signal);
      }
      function storageChanged(event) {
        if (!event || event.key !== 'vilda-note-changed-ping-v1' || !event.newValue) return;
        try { changed({ data: JSON.parse(event.newValue) }); } catch (_) {}
      }
      var channel = null;
      try {
        if (typeof context.BroadcastChannel === 'function') {
          channel = new context.BroadcastChannel('vilda-notes');
          channel.addEventListener('message', changed);
        }
      } catch (_) { if (channel) { try { channel.close(); } catch (_) {} } channel = null; }
      if (typeof context.addEventListener === 'function') context.addEventListener('storage', storageChanged);
      contextEntry = { count: 0, channel: channel, changed: changed, storageChanged: storageChanged };
      registry.contexts.set(context, contextEntry);
    }
    contextEntry.count += 1;
    if (doc && typeof doc.addEventListener === 'function') {
      if (!documentEntry) {
        documentEntry = { count: 0, changed: function () { registry.emit('sync'); } };
        doc.addEventListener('vilda:sync-merged', documentEntry.changed);
        registry.documents.set(doc, documentEntry);
      }
      documentEntry.count += 1;
    }
    registry.listeners.add(listener);
    return function () {
      registry.listeners.delete(listener);
      if (--contextEntry.count === 0) {
        if (typeof context.removeEventListener === 'function') context.removeEventListener('storage', contextEntry.storageChanged);
        if (contextEntry.channel) { contextEntry.channel.removeEventListener('message', contextEntry.changed); contextEntry.channel.close(); }
        registry.contexts.delete(context);
      }
      if (documentEntry && --documentEntry.count === 0) {
        doc.removeEventListener('vilda:sync-merged', documentEntry.changed); registry.documents.delete(doc);
      }
      if (!registry.listeners.size) registry.recent.clear();
    };
  }
  function dateEntry(kind, value) { return day(value) ? { kind: kind, dateISO: value } : null; }
  function noteIndexDetails(note) {
    var details = [], lab = note.labResult, medication = note.medication, igf = note.igf1;
    if (lab) details.push(['Badanie:', text(lab.test), text(lab.value), text(lab.valueNum), text(lab.unit), text(lab.norm)].filter(Boolean).join(' '));
    if (medication) details.push(['Leczenie:', text(medication.name), text(medication.dose), text(medication.doseNum), text(medication.doseUnit), text(medication.freq)].filter(Boolean).join(' '));
    if (igf) details.push(['IGF-1:', text(igf.value), text(igf.unit)].filter(Boolean).join(' '));
    return details.join('\n');
  }
  function appendUnit(value, unit) {
    if (!value || !unit || normalize(value).indexOf(normalize(unit)) >= 0 || /\s=\s/.test(value)) return value;
    return value + ' ' + unit;
  }
  function frequencyInDose(dose, frequency) {
    frequency = frequency.trim();
    if (!frequency || normalize(dose).indexOf(normalize(frequency)) >= 0) return true;
    if (/^(?:dzień|dzien|doba|dobę|dobe|dziennie|dobowo|na dzień|na dzien)$/i.test(frequency)) return /\/(?:d|24\s*h|dobę|dobe)(?=$|\s|[).,])/i.test(dose);
    if (/^(?:tydzień|tydzien|tygodniowo|na tydzień|na tydzien)$/i.test(frequency)) return /\/tydz\.?\b/i.test(dose);
    if (/^(?:miesiąc|miesiac|miesięcznie|miesiecznie|na miesiąc|na miesiac)$/i.test(frequency)) return /\/mies\.?(?=$|\s|[).,])/i.test(dose);
    return false;
  }
  function noteBody(note, formatMedicationDose) {
    var body = text(note.body), content = normalize([text(note.title), body].join('\n')), details = [];
    function covered(value) {
      var needle = normalize(value), offset = -1, word = /[\p{L}\p{N}]/u;
      if (!needle) return false;
      while ((offset = content.indexOf(needle, offset + 1)) >= 0) {
        var before = content.charAt(offset - 1), after = content.charAt(offset + needle.length);
        if (word.test(needle.charAt(0)) && word.test(before) || word.test(needle.charAt(needle.length - 1)) && word.test(after)) continue;
        if (/^\d/.test(needle) && /[\d.,+\-−<>=≤≥][ \t]*$/.test(content.slice(0, offset))) continue;
        if (/\d$/.test(needle) && /^(?:[.,]\d|[ \t]+\d)/.test(content.slice(offset + needle.length))) continue;
        return true;
      }
      return false;
    }
    function append(label, values) { var parts = values.filter(function (value) { return !!value && !covered(value); }); if (parts.length) details.push(label + ' ' + parts.join(' ')); }
    var lab = note.labResult, medication = note.medication, igf = note.igf1;
    if (lab) {
      var formatter = win.VildaLabAssessmentUI, value = text(lab.value) || text(lab.raw) || text(lab.valueNum).replace('.', ',');
      var result = formatter && typeof formatter.formatResult === 'function' ? formatter.formatResult(lab) : appendUnit(value, text(lab.unit));
      append('Badanie:', [text(lab.test), result, text(lab.norm) ? 'Norma: ' + text(lab.norm) : '']);
    }
    if (medication) {
      var hasRecordedDose = /^\s*(?:Dawka|Nowa dawka)\s*:/im.test(body), dose = '';
      if (!hasRecordedDose) {
        dose = typeof formatMedicationDose === 'function' ? text(formatMedicationDose(note)) : '';
        if (!dose) dose = text(medication.dose) || appendUnit(text(medication.doseNum).replace('.', ','), text(medication.doseUnit));
        // A textual dose is already assembled by the note editor. Add frequency
        // only to the numeric fallback, without repeating a per-day/week unit.
        if (!text(medication.dose) && dose && !frequencyInDose(dose, text(medication.freq))) dose += ' ' + text(medication.freq);
      }
      append('Leczenie:', [text(medication.name), dose]);
    }
    if (igf) append('IGF-1:', [appendUnit(typeof igf.value === 'number' ? text(igf.value).replace('.', ',') : text(igf.value), text(igf.unit))]);
    return [body, details.join('\n')].filter(Boolean).join('\n\n');
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
  function build(patients, external, notes, plans, vault, presentation) {
    var names = new Map(), externalIds = new Set((external || []).filter(Boolean).map(function (patient) { return patient.patientId; })), rows = [], keys = new Map();
    // The vault derives these IDs from verified removal intents in the plan.
    // Keep the projection even when an older device sends the child note again
    // or the plan arrives before its separate note tombstone.
    var removedNotes = new Map();
    (plans || []).forEach(function (plan) {
      if (!plan || !plan.id || !plan.patientId || !Array.isArray(plan.removedNoteIds)) return;
      var ids = removedNotes.get(plan.patientId) || new Set();
      plan.removedNoteIds.forEach(function (id) { if (typeof id === 'string' && id) ids.add(id); });
      removedNotes.set(plan.patientId, ids);
    });
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
      if (removedNotes.has(note.patientId) && removedNotes.get(note.patientId).has(note.id)) return;
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
      var status = noteStatus(note), clinical = note.category === 'wynik-klirens';
      var body = clinical ? presentation.klirens.summary(note, { patientId: note.patientId }) : noteBody(note, presentation.formatMedicationDose);
      var category = Object.prototype.hasOwnProperty.call(categories, note.category) ? categories[note.category] : text(note.category);
      var dates = [dateEntry(reminder ? 'reminder' : 'event', note.dueDateISO), dateEntry('clinical', note.clinicalDateISO)].filter(Boolean);
      add({ id: 'note:' + note.id, kind: kind, label: label, title: text(note.title) || category || label,
        body: body, patientId: note.patientId, patientName: name,
        noteId: note.id, planId: context && context.planId || null, dueDateISO: note.dueDateISO || null,
        eventDateISO: !reminder && note.dueDateISO || null, reminderDateISO: reminder && note.dueDateISO || null, clinicalDateISO: note.clinicalDateISO || null,
        completedAtISO: note.completedAtISO || null, noShowAtISO: note.noShowAtISO || null,
        status: status[0], statusLabel: status[1], categoryLabel: category, procedureType: text(note.procedureType),
        isActivity: activity, isExternal: legacyExternal || externalIds.has(note.patientId), isReminder: !!reminder,
        canOpenPatient: !activity && !legacyExternal, dates: dates, source: note },
      [category, text(note.procedureType), text(note.externalName), clinical ? '' : [text(note.body), noteIndexDetails(note)].filter(Boolean).join('\n')].filter(Boolean).join(' '));
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
      var removed = new Set(Array.isArray(plan.removedNoteIds) ? plan.removedNoteIds : []);
      var history = (Array.isArray(plan.log) ? plan.log : []).filter(function (entry) { return entry && !removed.has(entry.noteId); }).map(function (entry) { return text(entry.text); }).filter(Boolean).join('\n');
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
    function assertCurrent(stamp, session) {
      if (destroyed || stamp !== generation) throw error('STALE_GLOBAL_SEARCH', 'Dane wyszukiwania zmieniły się. Wyszukaj ponownie.');
      var current = vault.getCurrentUser && vault.getCurrentUser();
      if (!vault.isUnlocked || !vault.isUnlocked() || !current) throw error('GLOBAL_SEARCH_LOCKED', 'Odblokuj konto, aby wyszukać pacjentów i sprawy.');
      if (!accountId || current.userId !== accountId) {
        invalidate('session'); throw error('STALE_GLOBAL_SEARCH', 'Konto zmieniło się. Otwórz wyszukiwarkę ponownie.');
      }
      if (session && typeof vault.assertSyncOperationSession === 'function') {
        try { vault.assertSyncOperationSession(session); } catch (_) {
          invalidate('session'); throw error('STALE_GLOBAL_SEARCH', 'Sesja zmieniła się. Otwórz wyszukiwarkę ponownie.');
        }
      }
    }
    async function load() {
      var stamp = generation; assertCurrent(stamp);
      if (cached) { assertCurrent(stamp, cached.session); return cached.rows; }
      if (pending) { var shared = await pending; assertCurrent(stamp, cached && cached.session); return shared; }
      ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans'].forEach(function (method) {
        if (typeof vault[method] !== 'function') throw error('GLOBAL_SEARCH_UNAVAILABLE', 'Odśwież aplikację, aby korzystać z wyszukiwarki pacjentów i spraw.');
      });
      var session = typeof vault.captureSyncOperationSession === 'function' ? vault.captureSyncOperationSession() : null;
      var readOptions = { strict: true, isCurrent: function () { try { assertCurrent(stamp, session); return true; } catch (_) { return false; } } };
      function source(read) { return Promise.resolve(read).then(function (value) { assertCurrent(stamp, session); return value; }); }
      var request = (async function () {
        // Read each public source once per generation. Strict reads prevent an
        // unreadable record from silently becoming a successful partial index.
        var sources;
        try {
          sources = await Promise.all([source(vault.listPatients(readOptions)), source(vault.listExternalPatients(readOptions)), source(vault.listAllPatientNotes(readOptions)), source(vault.listCarePlans(readOptions))]);
        } catch (cause) {
          assertCurrent(stamp, session);
          var failure = error('GLOBAL_SEARCH_READ_FAILED', 'Nie udało się wczytać pełnych wyników. Spróbuj ponownie.');
          failure.cause = cause; throw failure;
        }
        assertCurrent(stamp, session);
        var klirens = win.ClcrNotesView;
        if (sources[2].some(function (note) { return note && note.category === 'wynik-klirens'; })) {
          if (typeof options.prepareNotes === 'function') klirens = await options.prepareNotes();
          assertCurrent(stamp, session);
          if (!klirens || typeof klirens.summary !== 'function') throw error('GLOBAL_SEARCH_UNAVAILABLE', 'Nie można odczytać zapisanych wyników. Odśwież aplikację i spróbuj ponownie.');
        }
        var next = build(sources[0], sources[1], sources[2], sources[3], vault, { klirens: klirens, formatMedicationDose: options.formatMedicationDose });
        assertCurrent(stamp, session); next.session = session; cached = next; return next.rows;
      })();
      pending = request;
      try { var rows = await request; assertCurrent(stamp, session); return rows; }
      finally { if (pending === request) pending = null; }
    }
    async function search(query, filters) {
      filters = filters || {}; var stamp = generation, rows = await load(); assertCurrent(stamp, cached && cached.session);
      var tokens = normalize(query).split(' ').filter(Boolean), reference = day(filters.today) || today();
      var keys = cached.keys;
      var result = [];
      rows.forEach(function (row) {
        if (tokens.some(function (token) { return keys.get(row.id).indexOf(token) < 0; })) return;
        if (filters.status && filters.status !== 'all' && (filters.status === 'open' ? row.status !== 'open' && row.status !== 'waiting' : row.status !== filters.status)) return;
        var dates = row.dates.map(function (entry) { return { kind: entry.kind, dateISO: day(entry.dateISO) }; }).filter(function (entry) { return !!entry.dateISO; });
        if (filters.time === 'undated') { if (!dates.length) result.push(row); return; }
        if (filters.time === 'future' || filters.time === 'past' || filters.time === 'today') {
          var matching = dates.filter(function (entry) { return filters.time === 'future' ? entry.dateISO > reference : filters.time === 'past' ? entry.dateISO < reference : entry.dateISO === reference; });
          if (!matching.length) return;
          var order = { event: 0, clinical: 1, reminder: 2 };
          matching.sort(function (left, right) {
            var comparison = left.dateISO < right.dateISO ? -1 : left.dateISO > right.dateISO ? 1 : 0;
            return (filters.time === 'past' ? -comparison : comparison) || order[left.kind] - order[right.kind];
          });
          result.push(Object.assign({}, row, { matchedDate: matching[0] })); return;
        }
        result.push(row);
      });
      return result;
    }
    var unobserve = observe(vault, doc, invalidate);
    return {
      load: load, search: search, invalidate: invalidate,
      destroy: function () {
        if (destroyed) return; destroyed = true; generation += 1; cached = null; pending = null; unobserve();
      }
    };
  }
  win.VildaGlobalSearch = { create: create, normalize: normalize };
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
