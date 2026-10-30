/* Zakładka „Badania” w karcie pacjenta — widok historii wyników badań (LAB-HISTORIA PR2).
 *
 * Moduł tylko rysuje: dane czyta z sejfu (serie, notatki, okresy leczenia), porównanie układa
 * model VildaLabHistory (vilda_lab_history.js), a wykres rysuje istniejący renderer trendu karty
 * (Nl z vilda_auth_ui.js, eksport window.__vildaLabTrend). Wyniki są pokazane tak, jak je zapisano:
 * bez dzisiejszych norm, bez pasma norm i bez ponownej oceny (LAB_INTERPRETATION_AGENT_GUIDE.md § 7).
 * Strzałka ↑/↓ i pigułka oceny pochodzą wyłącznie z modelu (zapisana norma wpisu albo koperta oceny).
 *
 * window.VildaLabHistoryTab.render(host, patientId, options) → { refresh, destroy }
 *   options.openEditor({ note, template, anchor, onSaved })  edytor notatki karty (ga); po „Wpisz wynik”
 *     z zapisaną wartością zakładka zamyka zlecenie (vault.completePatientNote, decyzja 6.11) i daje „Cofnij”
 *   options.openReminders(list)                              arkusz przypomnień (Mr)
 *   options.onChanged()                                      zapis z zakładki zmienił notatki
 *   options.openClcrResult({patientId,noteId,record,vault,onChanged}) — szczegóły obliczenia, nigdy edytor lab
 *   options.vault, options.model, options.trend, options.storage, options.now — do testów
 *
 * Projekt: docs/LAB_HISTORIA_WYNIKOW_PLAN.md, 3.2; opis: docs/clinical/ALGORITHMS.md, „LAB-HISTORIA”.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (root) root.VildaLabHistoryTab = api;
})(typeof window !== 'undefined' ? window : null, function (win) {
  'use strict';
  var NBSP = '\u00a0';
  var VIEW_KEY = 'vilda-lab-hist-view-';
  var CONVERTER_WAIT_MS = 5000;
  var REFRESH_DELAY_MS = 150;
  var ENVELOPE_ANALYTES = ['lh', 'fsh', 'inhibin_b'];
  var SKIP_REASON = {
    censored: 'wynik z „<” lub „>”',
    invalidated: 'ocena do ponowienia',
    unavailable: 'ocena niedostępna',
    text: 'wynik tekstowy',
    'other-unit': 'inna lub nierozpoznana jednostka',
    no_sample_date: 'brak daty badania'
  };
  // Wynik bez liczby porównywalnej z serią: wartość jak zapisano, bez różnicy i bez punktu na wykresie.
  var KIND_NOTE = {
    'other-unit': 'jednostka nierozpoznana albo brak jednostki — wynik jak zapisano, bez porównania',
    text: 'wynik tekstowy — jak zapisano, bez porównania',
    censored: 'wynik poza zakresem oznaczalności — bez punktu na wykresie i bez różnicy'
  };
  var TREATMENT_ACTION = { start: 'włączono', change: 'zmiana dawki', stop: 'zakończono' };
  var DATE_SOURCE = { termin: 'termin zlecenia', wpis: 'data wpisu', kontrola: 'data kontroli GH' };
  // Daty, które model stawia na osi (decyzja 6.25): data badania, a dla IGF-1 z notatki GH termin odbytej kontroli.
  var SAMPLE_DATES = ['badanie', 'kontrola'];
  var GH_SOURCE = 'z notatki leczenia GH';
  var resourceBootstrap = null;
  var moduleURL = win && win.document && win.document.currentScript && win.document.currentScript.src;

  function own(value, key) { return value != null && Object.prototype.hasOwnProperty.call(value, key); }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function finite(value) { return typeof value === 'number' && isFinite(value); }

  // Polska odmiana: 1 wynik, 2–4 wyniki, 5+ wyników (12–14 wyników).
  function plural(n, forms) {
    if (n === 1) return forms[0];
    var tens = n % 100, ones = n % 10;
    return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? forms[1] : forms[2];
  }
  function count(n, forms) { return n + ' ' + plural(n, forms); }
  // Dopisek dla wpisów dołączonych po nazwie badania (decyzja 6.14): ile i pod jaką nazwą je zapisano.
  function mergedNote(mergedFrom) {
    var total = 0, names = [];
    (mergedFrom || []).forEach(function (item) {
      total += item.count || 0;
      var name = item.test ? '„' + item.test + '”' : '';
      if (name && names.indexOf(name) === -1) names.push(name);
    });
    if (!total) return '';
    return 'W tym ' + count(total, ['wpis dopasowany', 'wpisy dopasowane', 'wpisów dopasowanych']) + ' po nazwie badania'
      + (names.length ? ' ' + names.join(', ') : '') + '.';
  }
  function localISO(date) {
    var pad = function (v) { return (v < 10 ? '0' : '') + v; };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function shortLabel(label) { return String(label || '').split('(')[0].trim() || String(label || ''); }
  // Wartość bez jednostki, gdy tę samą jednostkę niesie nagłówek kolumny albo karty.
  function bareValue(entry, unit) {
    var shown = entry.display || entry.raw || '—';
    if (!unit) return shown;
    var suffixes = [NBSP + unit, ' ' + unit];
    for (var i = 0; i < suffixes.length; i++) {
      if (shown.length > suffixes[i].length && shown.slice(-suffixes[i].length) === suffixes[i]) return shown.slice(0, -suffixes[i].length);
    }
    return shown;
  }
  // Komentarz wpisu bez linii, które dopisuje sama aplikacja: „= 15,4 pmol/L” (przypięcie z przelicznika)
  // i „Norma: …” (szablon edytora). Norma wpisu jest widoczna w statusie i w szczegółach komórki.
  function commentText(body) {
    return String(body || '').split(/\r?\n/).map(function (line) { return line.trim(); })
      .filter(function (line) { return line && !/^=\s/.test(line) && !/^Norma:\s/i.test(line); }).join(' · ');
  }

  function createApi() {
    var instances = [];
    var subscribed = [];

    function subscribe(vault) {
      if (!vault || subscribed.indexOf(vault) !== -1) return;
      subscribed.push(vault);
      // Sejf nie ma wypisania z nasłuchu, więc jeden nasłuch na sejf rozdziela zdarzenia żywym zakładkom.
      if (typeof vault.onPatientNoteChanged === 'function') vault.onPatientNoteChanged(function (event) {
        instances = instances.filter(function (instance) { return instance.alive(); });
        instances.forEach(function (instance) { if (instance.vault === vault) instance.noteChanged(event); });
      });
      if (typeof vault.onLock === 'function') vault.onLock(function () {
        instances = instances.filter(function (instance) { return instance.alive(); });
        instances.forEach(function (instance) { if (instance.vault === vault) instance.locked(); });
      });
    }

    function render(host, patientId, options) {
      options = options || {};
      var doc = host.ownerDocument || (win && win.document);
      var vault = options.vault || (win && win.VildaVault) || null;
      var model = options.model || (win && win.VildaLabHistory) || null;
      var savedResults = options.clcrSavedResults || (win && win.ClcrSavedResults) || null;
      var savedView = options.clcrSavedResultsView || (win && win.ClcrSavedResultsView) || null;
      var trend = own(options, 'trend') ? options.trend : (win && win.__vildaLabTrend) || null;
      var storage = own(options, 'storage') ? options.storage : null;
      if (!storage) { try { storage = win && win.sessionStorage; } catch (_) { storage = null; } }
      var now = typeof options.now === 'function' ? options.now : function () { return new Date(); };
      var state = { gen: 0, destroyed: false, panel: 'all', view: null, data: null, timer: 0, retried: false, reminders: [], notice: null };
      var renalView = null;
      var initialPending = true;

      function node(tag, className, content) {
        var element = doc.createElement(tag);
        if (className) element.className = className;
        if (content != null && content !== '') element.textContent = String(content);
        return element;
      }
      function add(parent, tag, className, content) { return parent.appendChild(node(tag, className, content)); }
      function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
      function button(parent, className, label, onClick) {
        var element = add(parent, 'button', className, label);
        element.type = 'button';
        element.addEventListener('click', onClick);
        return element;
      }
      function formatNumber(value, precision) {
        var converter = win && win.LabUnitConverter;
        if (converter && typeof converter.formatNumber === 'function') {
          try { return converter.formatNumber(value, precision || 3); } catch (_) { /* zapas niżej */ }
        }
        return String(value).replace('.', ',');
      }
      function formatDate(iso) { return model && typeof model.formatDate === 'function' ? model.formatDate(iso) : String(iso || ''); }
      function formatAge(months) {
        if (!finite(months) || !trend || typeof trend.formatAge !== 'function') return '';
        try { return trend.formatAge(months); } catch (_) { return ''; }
      }
      // Wartość w jednostce zapisu, bez zaokrąglenia (wpis z przelicznika ma w polu wartości całe równanie).
      function recorded(entry) {
        return finite(entry.recordedValue) ? String(entry.recordedValue).replace('.', ',') + (entry.recordedUnit ? NBSP + entry.recordedUnit : '') : entry.raw;
      }
      function deltaNumber(delta) {
        var sign = delta.value > 0 ? '+' : delta.value < 0 ? '−' : '';
        return sign + formatNumber(Math.abs(delta.value), delta.precision);
      }

      var section = node('section', 'vilda-lab-hist');
      section.setAttribute('aria-label', 'Wyniki badań');
      section.setAttribute('aria-busy', 'true');
      clear(host);
      host.appendChild(section);

      var instance = {
        vault: vault,
        alive: function () { return !state.destroyed && host.isConnected !== false; },
        noteChanged: function (event) {
          if (event && event.patientId && event.patientId !== patientId) return;
          schedule();
        },
        locked: function () {
          state.gen++; state.data = null;
          if (renalView) { renalView.destroy(); renalView = null; }
          message('vilda-lab-hist-locked', 'Sejf jest zablokowany. Odblokuj go, aby zobaczyć wyniki badań.');
        }
      };
      instances = instances.filter(function (other) { return other.alive(); });
      instances.push(instance);
      subscribe(vault);
      // Zdarzenie nie przenosi pomiarów; po zapisie/usunięciu ponownie czytamy
      // właściwego pacjenta. Między ramkami tę samą rolę ma istniejący ping sejfu.
      function resultChanged(event) { if (instance.alive()) instance.noteChanged(event && event.detail); }
      doc.addEventListener('vilda:clcr-results-changed', resultChanged);

      function schedule() {
        if (state.destroyed) return;
        if (state.timer && win) win.clearTimeout(state.timer);
        state.timer = win ? win.setTimeout(function () { state.timer = 0; load(); }, REFRESH_DELAY_MS) : 0;
        if (!win) load();
      }
      function current(gen) { return gen === state.gen && instance.alive(); }

      function ensureRecordResources(editor) {
        // Jawne wstrzyknięcie zależności i lekki DOM testowy nie potrzebują sieci.
        if (editor && typeof options.openClcrResult === 'function') return Promise.resolve();
        if (!editor && (options.clcrSavedResults || options.clcrSavedResultsView)) return Promise.resolve();
        if (!win || !win.location || !doc.head) return Promise.resolve();
        function ready() {
          var resources = win.ClcrRecordResources;
          if (!resources || typeof resources[editor ? 'ensureEditor' : 'ensureReader'] !== 'function') throw new Error('Moduł zapisanych obliczeń jest niedostępny.');
          return resources[editor ? 'ensureEditor' : 'ensureReader']();
        }
        if (win.ClcrRecordResources) return Promise.resolve().then(ready);
        if (!resourceBootstrap) {
          resourceBootstrap = new Promise(function (resolve, reject) {
            var script = doc.createElement('script'), finished = false, timer;
            function finish(error) {
              if (finished) return; finished = true;
              if (timer) win.clearTimeout(timer);
              if (error) { if (script.parentNode) script.parentNode.removeChild(script); reject(error); }
              else resolve();
            }
            script.addEventListener('load', function () { finish(win.ClcrRecordResources ? null : new Error('Moduł zapisanych obliczeń jest niedostępny.')); });
            script.addEventListener('error', function () { finish(new Error('Nie udało się wczytać zapisanych obliczeń.')); });
            script.setAttribute('src', new URL('clcr_record_resources.js?v=10', moduleURL || win.location.href).href);
            timer = win.setTimeout(function () { finish(new Error('Upłynął czas wczytywania zapisanych obliczeń.')); }, 15000);
            doc.head.appendChild(script);
          });
          resourceBootstrap.catch(function () { resourceBootstrap = null; });
        }
        return resourceBootstrap.then(ready);
      }

      function waitForConverter() {
        if (win && win.LabUnitConverter && typeof win.LabUnitConverter.find === 'function') return Promise.resolve(true);
        if (!trend || typeof trend.loadConverter !== 'function') return Promise.resolve(false);
        return new Promise(function (resolve) {
          var settled = false;
          var finish = function (ok) { if (!settled) { settled = true; resolve(!!ok); } };
          var timer = win ? win.setTimeout(function () { finish(false); }, CONVERTER_WAIT_MS) : 0;
          try {
            trend.loadConverter(function (ok) { if (timer && win) win.clearTimeout(timer); finish(ok); });
          } catch (_) { finish(false); }
        });
      }

      function message(className, content, retry) {
        clear(section);
        var box = add(section, 'div', 'vilda-lab-hist-state ' + className);
        add(box, 'p', '', content);
        if (retry) button(box, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost', 'Spróbuj ponownie', function () { load(); });
        section.setAttribute('aria-busy', 'false');
        section.classList.add('vilda-lab-hist-ready');
      }

      function load() {
        if (state.destroyed || host.isConnected === false) return Promise.resolve();
        initialPending = false;
        var gen = ++state.gen;
        section.setAttribute('aria-busy', 'true');
        if (!state.data) {
          clear(section);
          add(section, 'p', 'vilda-lab-hist-state vilda-lab-hist-loading', 'Wczytywanie wyników badań…');
        }
        if (!vault || typeof vault.listPatientLabSeries !== 'function' || !model || typeof model.buildHistoryView !== 'function') {
          message('vilda-lab-hist-error', 'Historia wyników nie jest dostępna — odśwież stronę.');
          return Promise.resolve();
        }
        if (typeof vault.isUnlocked === 'function' && !vault.isUnlocked()) {
          message('vilda-lab-hist-locked', 'Sejf jest zablokowany. Odblokuj go, aby zobaczyć wyniki badań.');
          return Promise.resolve();
        }
        var reads = Promise.resolve().then(function () {
          return Promise.all([
            vault.listPatientLabSeries(patientId),
            vault.listPatientNotesForPatient(patientId),
            typeof vault.listPatientTreatmentPeriods === 'function'
              ? Promise.resolve(vault.listPatientTreatmentPeriods(patientId)).catch(function () { return []; }) : [],
            waitForConverter()
          ]);
        }).then(function (results) {
          if (!current(gen)) return results;
          // Nie obciążamy zwykłej historii dodatkowymi modułami, dopóki pacjent
          // nie ma zapisanych obliczeń. Kolejne zdarzenie sejfu ponowi tę bramkę.
          var hasSavedCalculations = (Array.isArray(results[1]) ? results[1] : []).some(function (note) { return note && note.category === 'wynik-klirens'; });
          return (hasSavedCalculations ? ensureRecordResources(false) : Promise.resolve()).then(function () {
            savedResults = options.clcrSavedResults || (win && win.ClcrSavedResults) || savedResults;
            savedView = options.clcrSavedResultsView || (win && win.ClcrSavedResultsView) || savedView;
            return results;
          });
        });
        return reads.then(function (results) {
          if (!current(gen)) return null;
          if (typeof vault.isUnlocked === 'function' && !vault.isUnlocked()) { instance.locked(); return null; }
          var notesById = {};
          (Array.isArray(results[1]) ? results[1] : []).forEach(function (note) { if (note && note.id) notesById[note.id] = note; });
          var view = model.buildHistoryView(results[0], {
            converter: win && win.LabUnitConverter || null,
            notesById: notesById,
            treatment: Array.isArray(results[2]) ? results[2] : [],
            parseNorm: trend && typeof trend.parseNorm === 'function' ? trend.parseNorm : null,
            nowISO: localISO(now()),
            rangeSnapshot: win && win.VildaLabRangeSnapshot || null,
            clcrSavedResults: savedResults,
            patientId: patientId
          });
          // Punkt bez notatki = odczyt serii i notatek z dwóch różnych chwil (zapis w międzyczasie). Jedno ponowienie.
          if (view.summary.missingNotes > 0 && !state.retried) { state.retried = true; schedule(); }
          state.data = { view: view, series: Array.isArray(results[0]) ? results[0] : [] };
          draw();
          if (view.pending.length && typeof vault.listPatientNotesDueByDate === 'function') {
            return Promise.resolve(vault.listPatientNotesDueByDate()).then(function (list) {
              if (!current(gen)) return;
              state.reminders = Array.isArray(list) ? list : [];
              paintReminders();
            }, function () { /* bez listy przycisk zostaje ukryty */ });
          }
          return null;
        }).then(function () {
          if (!current(gen)) return;
          section.setAttribute('aria-busy', 'false');
          section.classList.add('vilda-lab-hist-ready');
        }, function () {
          if (!current(gen)) return;
          state.data = null;
          message('vilda-lab-hist-error', 'Nie udało się wczytać wyników badań.', true);
        });
      }

      function viewMode() {
        if (state.view) return state.view;
        var saved = null;
        try { saved = storage && storage.getItem(VIEW_KEY + patientId); } catch (_) { /* bez pamięci sesji: widok domyślny */ }
        if (saved === 'charts' || saved === 'table') return saved;
        // Nowy wykres Klirensu mieści krótką serię na telefonie i zawsze ma pod
        // sobą wszystkie pomiary. Dawna reguła zwykłych badań pozostaje niżej.
        if (state.data && !state.data.view.panels.length && state.data.view.clcr && state.data.view.clcr.measurements.length) return 'charts';
        // Decyzja 6.17: na telefonie domyślnie tabela (wykres 660 px skalowany do 288 px ma nieczytelne etykiety).
        var narrow = false;
        try { narrow = !!(win && win.matchMedia && win.matchMedia('(max-width: 480px)').matches); } catch (_) { /* bez matchMedia: szeroki ekran */ }
        return narrow ? 'table' : 'charts';
      }
      function setView(mode) {
        state.view = mode;
        try { if (storage) storage.setItem(VIEW_KEY + patientId, mode); } catch (_) { /* preferencja tylko na czas karty */ }
        draw();
      }

      function openNote(noteId) {
        if (!noteId || !vault || typeof vault.getPatientNote !== 'function') return;
        Promise.resolve(vault.getPatientNote(noteId)).then(function (note) {
          if (note) openEditor({ note: note });
        }).catch(function () { /* wpis zniknął — odświeżenie pokaże stan sejfu */ });
      }
      function openEditor(request, afterSave) {
        if (typeof options.openEditor !== 'function') return;
        options.openEditor(Object.assign({}, request, {
          onSaved: function () {
            var refresh = function () {
              schedule();
              if (typeof options.onChanged === 'function') options.onChanged();
            };
            // Bez dodatkowego kroku — jak dotąd od razu; po „Wpisz wynik” dopiero po zamknięciu zlecenia.
            var done = typeof afterSave === 'function' ? afterSave() : null;
            if (done && typeof done.then === 'function') done.then(refresh, refresh);
            else refresh();
          }
        }));
      }
      // „Wpisz wynik” przy zleceniu: edytor z szablonem wyniku i datą badania (K7). Zlecenie dopasowane do badania
      // dostaje nazwę badania z listy przelicznika, żeby edytor zapisał klucz serii.
      function enterResult(item) {
        if (!vault || typeof vault.getPatientNote !== 'function') return;
        Promise.resolve(vault.getPatientNote(item.noteId)).then(function (note) {
          if (!note) return;
          var copy = Object.assign({}, note);
          var label = converterLabel(item.seriesKey);
          if (label && !(note.labResult && text(note.labResult.test))) copy.labResult = Object.assign({}, note.labResult || {}, { test: label });
          openEditor({ note: copy, template: 'lab', anchor: 'date' }, function () { return completeAfterResult(item.noteId, item.title || note.title); });
        }).catch(function () { /* wpis zniknął */ });
      }
      // Decyzja 6.11 (PR5b): zlecenie, w którym „Wpisz wynik” zapisał wartość, zamyka się jak „Wykonano”
      // w Przypomnieniach (completePatientNote). Nie przekłada go na kolejny termin („kontrola co N dni”):
      // następny wynik nadpisałby ten w tej samej notatce. Bez wartości, po niestawieniu albo już wykonane — bez zmian.
      function hasValue(note) {
        var lab = note && note.labResult;
        return !!lab && typeof lab === 'object' && (text(lab.value) !== '' || finite(lab.valueNum));
      }
      // Nazwa zlecenia sprzed edycji: szablon wyniku zmienia tytuł notatki na „Badanie: wartość”.
      function completeAfterResult(noteId, title) {
        if (typeof vault.completePatientNote !== 'function') return null;
        return Promise.resolve(vault.getPatientNote(noteId)).then(function (note) {
          if (!note || !hasValue(note) || note.completedAtISO || note.noShowAtISO) return;
          return Promise.resolve(vault.completePatientNote(noteId)).then(function () {
            return vault.getPatientNote(noteId);
          }).then(function (saved) {
            // Znacznik tego zamknięcia: „Cofnij” działa tylko, dopóki zlecenie jest w tym samym stanie.
            state.notice = { kind: 'completed', noteId: noteId, title: text(title), completedAtISO: saved && saved.completedAtISO || null };
          });
        }).catch(function () {
          state.notice = { kind: 'error', noteId: noteId };
        });
      }
      // uncompletePatientNote czyści też niestawienie, więc nie cofa stanu nadanego później (inna karta,
      // synchronizacja): tylko to zamknięcie, które zrobiła zakładka, i tylko gdy nikt go nie zmienił.
      function undoComplete(notice) {
        if (!vault || typeof vault.uncompletePatientNote !== 'function') return;
        var base = { noteId: notice.noteId, title: notice.title };
        Promise.resolve(vault.getPatientNote(notice.noteId)).then(function (note) {
          if (!note || !notice.completedAtISO || note.completedAtISO !== notice.completedAtISO || note.noShowAtISO) {
            state.notice = Object.assign({ kind: 'undo-stale' }, base);
            return;
          }
          return Promise.resolve(vault.uncompletePatientNote(notice.noteId)).then(function () {
            state.notice = Object.assign({ kind: 'undone' }, base);
          });
        }).catch(function () {
          state.notice = Object.assign({ kind: 'undo-error' }, base);
        }).then(function () {
          schedule();
          if (typeof options.onChanged === 'function') options.onChanged();
        });
      }
      function drawNotice() {
        var notice = state.notice;
        if (!notice) return;
        var box = add(section, 'div', 'vilda-lab-hist-notice is-' + notice.kind);
        box.setAttribute('role', 'status');
        box.setAttribute('data-note-id', notice.noteId || '');
        var name = notice.title ? ' „' + notice.title + '”' : '';
        var message = {
          completed: 'Wynik zapisany — zlecenie' + name + ' oznaczone jako wykonane w Przypomnieniach.',
          error: 'Wynik zapisany, ale nie udało się oznaczyć zlecenia jako wykonanego — zrób to w Przypomnieniach.',
          undone: 'Cofnięto — zlecenie' + name + ' znów jest w Przypomnieniach.',
          'undo-error': 'Nie udało się cofnąć oznaczenia — zrób to w Przypomnieniach.',
          'undo-stale': 'Nie cofnięto: zlecenie' + name + ' zmieniło się w międzyczasie — sprawdź je w Przypomnieniach.',
          'clcr-resource-error': notice.text
        }[notice.kind];
        add(box, 'span', 'vilda-lab-hist-notice-text', message);
        if (notice.kind === 'completed' && typeof vault.uncompletePatientNote === 'function') {
          button(box, 'vilda-lab-hist-link vilda-lab-hist-notice-undo', 'Cofnij', function () { undoComplete(notice); });
        }
        if (notice.kind === 'clcr-resource-error' && notice.record) button(box, 'vilda-lab-hist-link', 'Spróbuj ponownie', function () { state.notice = null; draw(); openClcrResult(notice.record); });
      }
      function converterLabel(id) {
        var converter = win && win.LabUnitConverter;
        if (!id || !converter || typeof converter.list !== 'function') return '';
        try {
          var list = converter.list() || [];
          for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return text(list[i].label);
        } catch (_) { return ''; }
        return '';
      }
      // W powłoce przelicznik otwiera jej trasa „lab” (z adresem, gdy odnośnik niesie badanie);
      // poza powłoką działa zwykły odnośnik.
      function openConverter(event, href) {
        var shell = null;
        try {
          var embedded = doc.documentElement.classList.contains('vilda-embedded');
          shell = embedded && win.parent && win.parent !== win ? win.parent.VildaShell : null;
        } catch (_) { /* ramka z innego źródła: zwykły odnośnik */ }
        if (shell && typeof shell.navigate === 'function') {
          if (event) event.preventDefault();
          if (href) shell.navigate('lab', true, href);
          else shell.navigate('lab', true);
        }
      }

      var remindersButton = null;
      function paintReminders() {
        if (!remindersButton) return;
        remindersButton.hidden = !(state.reminders.length && typeof options.openReminders === 'function');
      }

      function draw() {
        if (!state.data) return;
        var view = state.data.view;
        if (renalView) { renalView.destroy(); renalView = null; }
        clear(section);
        remindersButton = null;
        drawHeader(view);
        drawNotice();
        var renal = view.clcr && view.clcr.measurements.length;
        if (!view.panels.length && !view.pending.length && !renal) {
          var empty = add(section, 'div', 'vilda-lab-hist-state vilda-lab-hist-empty');
          add(empty, 'p', '', 'Brak zapisanych wyników badań.');
          add(empty, 'p', 'vilda-lab-hist-muted', 'Wynik dodasz przyciskiem „+ Dodaj wynik” albo przypniesz w przeliczniku jednostek.');
          drawFooter(view);
          return;
        }
        if (view.panels.length || renal) drawToolbar(view);
        if (view.pending.length) drawPending(view);
        var mode = viewMode();
        var panels = view.panels.filter(function (panel) { return state.panel === 'all' || panel.id === state.panel; });
        panels.forEach(function (panel) {
          var group = add(section, 'section', 'vilda-lab-hist-panel');
          group.setAttribute('data-panel', panel.id);
          add(group, 'h3', 'vilda-lab-hist-panel-h', panel.label);
          if (mode === 'table') drawTable(group, panel);
          else drawCharts(group, panel);
        });
        if (renal && (state.panel === 'all' || state.panel === 'renal')) drawClcr(view.clcr, mode);
        // W widoku wykresów leczenie raz, pod wszystkimi panelami; tabela wplata je w swoje wiersze.
        if (mode !== 'table') drawTreatment(section, panels);
        drawFooter(view);
      }

      function drawHeader(view) {
        var head = add(section, 'div', 'vilda-lab-hist-head');
        var titles = add(head, 'div', 'vilda-lab-hist-titles');
        add(titles, 'p', 'vilda-patient-section-h', 'Wyniki badań');
        var parts = [count(view.summary.results, ['wynik', 'wyniki', 'wyników']), count(view.summary.analytes, ['badanie', 'badania', 'badań'])];
        if (view.summary.lastDateISO) parts.push('ostatnie badanie ' + formatDate(view.summary.lastDateISO));
        add(titles, 'p', 'vilda-lab-hist-summary', parts.join(' · '));
        if (view.summary.missingNotes > 0) {
          add(titles, 'p', 'vilda-lab-hist-muted', count(view.summary.missingNotes, ['wynik zmienił', 'wyniki zmieniły', 'wyników zmieniło']) + ' się w trakcie odczytu — odśwież zakładkę.');
        }
        var actions = add(head, 'div', 'vilda-lab-hist-actions');
        if (typeof options.openEditor === 'function') {
          button(actions, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost vilda-lab-hist-add', '+ Dodaj wynik', function () {
            openEditor({ note: null, template: 'lab', anchor: 'date' });
          });
        }
        var link = add(actions, 'a', 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-primary vilda-lab-hist-check', 'Sprawdź nowy wynik →');
        link.setAttribute('href', 'przelicznik-jednostek.html');
        link.addEventListener('click', function (event) { openConverter(event); });
      }

      function drawToolbar(view) {
        var bar = add(section, 'div', 'vilda-lab-hist-toolbar');
        var chips = add(bar, 'div', 'vilda-lab-hist-chips');
        chips.setAttribute('role', 'group');
        chips.setAttribute('aria-label', 'Panel badań');
        var choices = [{ id: 'all', label: 'Wszystkie · ' + view.summary.analytes }].concat(view.panels.map(function (panel) {
          return { id: panel.id, label: panel.label + ' · ' + panel.series.length };
        }));
        if (view.clcr && view.clcr.measurements.length) choices.push({ id: 'renal', label: 'Nerki i mocz · ' + view.clcr.series.length });
        if (!choices.some(function (choice) { return choice.id === state.panel; })) state.panel = 'all';
        choices.forEach(function (choice) {
          var chip = button(chips, 'vilda-lab-hist-chip', choice.label, function () { state.panel = choice.id; draw(); });
          chip.setAttribute('aria-pressed', String(state.panel === choice.id));
          chip.setAttribute('data-panel', choice.id);
        });
        var segment = add(bar, 'div', 'vilda-lab-hist-segment');
        segment.setAttribute('role', 'group');
        segment.setAttribute('aria-label', 'Widok wyników');
        var mode = viewMode();
        [['charts', 'Wykresy'], ['table', 'Tabela']].forEach(function (pair) {
          var option = button(segment, 'vilda-lab-hist-segment-btn', pair[1], function () { setView(pair[0]); });
          option.setAttribute('aria-pressed', String(mode === pair[0]));
          option.setAttribute('data-view', pair[0]);
        });
      }

      function drawClcr(projection, mode) {
        var group = add(section, 'section', 'vilda-lab-hist-panel');
        group.setAttribute('data-panel', 'renal');
        add(group, 'h3', 'vilda-lab-hist-panel-h', 'Nerki i mocz');
        var host = add(group, 'div');
        if (!savedView || typeof savedView.render !== 'function') {
          add(host, 'p', 'vilda-lab-hist-state', 'Widok zapisanych obliczeń jest niedostępny — odśwież stronę.');
          return;
        }
        renalView = savedView.render(host, { projection: projection, view: mode, onSelect: openClcrResult });
      }

      function openClcrResult(record) {
        if (!instance.alive() || (record.patientId && record.patientId !== patientId) || (typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) return;
        var gen = state.gen;
        function open() {
          if (!current(gen) || (typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) return;
          var details = win && win.ClcrResultDetails;
          var callback = typeof options.openClcrResult === 'function' ? options.openClcrResult
            : details && typeof details.open === 'function' ? details.open.bind(details) : null;
          if (!callback) throw new Error('Szczegóły zapisanych obliczeń są niedostępne.');
          if (state.notice && state.notice.kind === 'clcr-resource-error') { state.notice = null; draw(); }
          return callback({ patientId: patientId, noteId: record.noteId, record: record, vault: vault, onChanged: function () {
            if (!instance.alive()) return;
            schedule();
            if (typeof options.onChanged === 'function') options.onChanged();
          } });
        }
        // Wstrzyknięty callback pozostaje synchroniczny; produkcyjna ścieżka
        // dociąga silniki dopiero przy otwieraniu szczegółów/edycji.
        if (typeof options.openClcrResult === 'function') { open(); return; }
        ensureRecordResources(true).then(open).catch(function (error) {
          if (!current(gen)) return;
          state.notice = { kind: 'clcr-resource-error', record: record, text: error && error.message || 'Nie udało się otworzyć szczegółów obliczenia.' };
          draw();
        });
      }

      function drawPending(view) {
        var box = add(section, 'div', 'vilda-lab-hist-pending');
        var top = add(box, 'div', 'vilda-lab-hist-pending-top');
        add(top, 'p', 'vilda-patient-section-h', 'Oczekujące wyniki (' + view.pending.length + ')');
        remindersButton = button(top, 'vilda-lab-hist-link', 'Przypomnienia →', function () {
          if (typeof options.openReminders === 'function') options.openReminders(state.reminders);
        });
        paintReminders();
        view.pending.forEach(function (item) {
          var row = add(box, 'div', 'vilda-lab-hist-pending-row');
          row.setAttribute('data-note-id', item.noteId || '');
          add(row, 'span', 'vilda-lab-hist-tag', 'oczekuje na wynik');
          var label = add(row, 'span', 'vilda-lab-hist-pending-title', item.title || 'Zlecone badanie');
          if (item.dueDateISO) add(label, 'span', 'vilda-lab-hist-muted', ' · termin ' + formatDate(item.dueDateISO));
          if (typeof options.openEditor === 'function') {
            button(row, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost', 'Wpisz wynik', function () { enterResult(item); });
          }
        });
      }

      function statusLine(parent, entry) {
        var status = entry && entry.status;
        if (!status) return;
        var pill = add(parent, 'p', 'vilda-lab-hist-status is-' + status.kind + ' tone-' + status.tone);
        if (status.kind === 'recorded') {
          add(pill, 'span', 'vilda-lab-hist-status-text', '„' + status.text + '”');
          var context = assessmentContext(entry);
          if (context) add(pill, 'span', 'vilda-lab-hist-status-context', 'oceniono jako: ' + context);
        } else if (status.kind === 'norm') {
          add(pill, 'span', 'vilda-lab-hist-status-text', status.text + ' · ' + status.norm);
        } else if (status.kind === 'range' || status.kind === 'range-general') {
          // Decyzja 6.3: zakres zapisany z wynikiem przy przypięciu — kategoria, granice, dla kogo i źródło.
          // Decyzja 6.30: zakres ogólny u dziecka — te same granice i kontekst, bez strzałki i kategorii (wyciszony).
          add(pill, 'span', 'vilda-lab-hist-status-text', (status.flag ? status.flag + ' ' : '') + status.text + (status.bounds ? ' · ' + status.bounds : ''));
          var where = rangeContext(status);
          if (where) add(pill, 'span', 'vilda-lab-hist-status-context', where);
        } else {
          add(pill, 'span', 'vilda-lab-hist-status-text', status.text + (status.detail && status.detail.length ? ' · ' + status.detail.join(', ') : ''));
          if (status.kind === 'range-unavailable' && status.population) add(pill, 'span', 'vilda-lab-hist-status-context', status.population);
        }
      }
      function rangeContext(status) {
        return [status.population, status.subject].concat(status.sources || []).filter(Boolean).join(' · ');
      }
      // Kontekst zapisanej oceny dosłownie z koperty: płeć, wiek w dniu pobrania, stadium (3.1 a).
      function assessmentContext(entry) {
        var context = entry.status.context || {};
        var input = entry.assessment && entry.assessment.evaluation && entry.assessment.evaluation.input || {};
        var age = ageAtSample(context.ageAtSample, input);
        var parts = [];
        if (context.sex) {
          var adult = age && age.years >= 18;
          parts.push(context.sex === 'F' ? (age ? (adult ? 'kobieta' : 'dziewczynka') : 'płeć żeńska') : (age ? (adult ? 'mężczyzna' : 'chłopiec') : 'płeć męska'));
        }
        if (age) parts.push(age.years + ' l' + (age.months != null ? ' ' + age.months + ' m' : '') + ' w dniu pobrania');
        if (context.stage) parts.push(context.stage);
        return parts.join(' · ');
      }

      // Wiek z koperty: podany w latach i miesiącach albo — gdy ocena liczyła wiek z dat — pełne miesiące
      // kalendarzowe między zapisaną datą urodzenia a datą pobrania.
      function ageAtSample(sample, input) {
        if (!sample || sample.status !== 'known' || !input) return null;
        var given = input.age;
        if (given && typeof given === 'object' && finite(given.years)) {
          return { years: given.years, months: finite(given.months) && given.precision !== 'year' ? given.months : null };
        }
        var birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input.birthDateISO || ''));
        var taken = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input.sampleDateISO || ''));
        if (sample.source !== 'dates' || !birth || !taken) return null;
        var months = (taken[1] - birth[1]) * 12 + (taken[2] - birth[2]) - (Number(taken[3]) < Number(birth[3]) ? 1 : 0);
        return months >= 0 ? { years: Math.floor(months / 12), months: months % 12 } : null;
      }
      function rawSeries(key) {
        for (var i = 0; i < state.data.series.length; i++) {
          var serie = state.data.series[i];
          if (serie && serie.testKey === key) return serie;
        }
        return null;
      }
      function assessmentsBlock(parent, views) {
        if (!trend || typeof trend.assessments !== 'function') return;
        var series = views.filter(function (view) { return ENVELOPE_ANALYTES.indexOf(view.key) !== -1; })
          .map(function (view) { return rawSeries(view.key); })
          .filter(function (serie) { return serie && (serie.points || []).some(function (point) { return own(point, 'assessment'); }); });
        if (!series.length) return;
        var total = series.reduce(function (sum, serie) {
          return sum + serie.points.filter(function (point) { return own(point, 'assessment'); }).length;
        }, 0);
        // Zawsze rozwinięte, jak dawniej w „Historii”: ostrzeżenia kliniczne zapisanej oceny nie mogą czekać za kliknięciem.
        var box = add(parent, 'div', 'vilda-lab-hist-assess');
        add(box, 'p', 'vilda-lab-hist-assess-h', 'Zapisane oceny (' + total + ')');
        series.forEach(function (serie) {
          try { trend.assessments(box, serie, openNote); } catch (_) { /* renderer oceny pokazuje własny stan błędu */ }
        });
        add(box, 'p', 'vilda-lab-hist-muted', 'Tytuł oceny cytowany dosłownie z zapisu, bez ponownego liczenia.');
      }

      function drawCharts(group, panel) {
        var grid = add(group, 'div', 'vilda-lab-hist-grid');
        panel.series.forEach(function (view) { drawCard(grid, view); });
        if (panel.series.some(function (view) { return view.methodFootnote; })) {
          add(group, 'p', 'vilda-lab-hist-muted', 'Różnica liczona z wartości zapisanych; metoda oznaczenia mogła się różnić.');
        }
      }

      // Karta badania: informacje po lewej, wykres po prawej; na wąskim ekranie wykres pod informacjami.
      // Wykres Nl ma układ 660 × 240, więc w kolumnie węższej niż ok. 420 px jego podpisy stają się nieczytelne.
      function drawCard(grid, view) {
        var card = add(grid, 'article', 'vilda-lab-hist-card');
        card.setAttribute('data-series', view.key);
        var info = add(card, 'div', 'vilda-lab-hist-card-info');
        var head = add(info, 'p', 'vilda-lab-hist-card-h');
        add(head, 'span', 'vilda-lab-hist-card-name', shortLabel(view.label));
        add(head, 'span', 'vilda-lab-hist-muted', (view.unit ? ' ' + view.unit : '') + ' · ×' + view.entries.length);
        var shown = view.last || view.entries[view.entries.length - 1];
        if (shown) {
          var line = add(info, 'p', 'vilda-lab-hist-last');
          var value = add(line, 'button', 'vilda-lab-hist-value', bareValue(shown, view.unit));
          value.type = 'button';
          value.setAttribute('data-note-id', shown.noteId || '');
          value.setAttribute('title', 'Otwórz wpis' + (shown.converted ? ' · zapisano: ' + recorded(shown) : ''));
          value.addEventListener('click', function () { openNote(shown.noteId); });
          if (shown.flag) add(line, 'span', 'vilda-lab-hist-flag', shown.flag);
          var when = shown.dateISO ? formatDate(shown.dateISO) : 'bez daty';
          if (shown.dateSource !== 'badanie' && DATE_SOURCE[shown.dateSource]) when += ' (' + DATE_SOURCE[shown.dateSource] + ')';
          var visit = formatAge(shown.ageMonths);
          add(line, 'span', 'vilda-lab-hist-date', when + (visit ? ' · wizyta ' + visit : ''));
          if (shown.source === 'gh-note') add(info, 'p', 'vilda-lab-hist-muted vilda-lab-hist-source', GH_SOURCE);
          if (shown.converted) add(info, 'p', 'vilda-lab-hist-muted', 'przeliczono z ' + recorded(shown));
          if (KIND_NOTE[shown.kind]) add(info, 'p', 'vilda-lab-hist-muted', KIND_NOTE[shown.kind]);
          if (view.lastDateEntries.length > 1) {
            add(info, 'p', 'vilda-lab-hist-muted', 'Tego dnia także: ' + view.lastDateEntries.filter(function (entry) { return entry !== shown; })
              .map(function (entry) { return entry.display; }).join(', '));
          }
          statusLine(info, shown);
        }
        if (view.previous) {
          var previous = view.previous;
          var parts = ['poprzednio ' + previous.display + ' (' + formatDate(previous.dateISO) + (previous.source === 'gh-note' ? ', ' + GH_SOURCE : '') + ')'];
          var delta = view.delta;
          if (delta && delta.available) parts.push('różnica ' + model.formatDelta(delta, win && win.LabUnitConverter));
          else if (delta && delta.reason === 'method_mismatch') parts.push('różne metody oznaczenia — bez różnicy');
          add(info, 'p', 'vilda-lab-hist-prev', parts.join(' · '));
        }
        view.pending.forEach(function (item) {
          add(info, 'p', 'vilda-lab-hist-muted', 'oczekuje na wynik' + (item.dueDateISO ? ' · termin ' + formatDate(item.dueDateISO) : ''));
        });
        var merged = mergedNote(view.mergedFrom);
        if (merged) add(info, 'p', 'vilda-lab-hist-muted vilda-lab-hist-merged', merged);
        // Decyzja 6.23: przelicznik od razu z tym badaniem (tylko badanie znane przelicznikowi);
        // przycisk w nagłówku zakładki zostaje bez badania.
        if (view.testKey) {
          var href = 'przelicznik-jednostek.html?badanie=' + encodeURIComponent(view.testKey);
          var check = add(info, 'a', 'vilda-lab-hist-card-check', 'Nowy wynik ' + shortLabel(view.label) + ' w przeliczniku →');
          check.setAttribute('href', href);
          check.addEventListener('click', function (event) { openConverter(event, href); });
        }
        drawChart(add(card, 'div', 'vilda-lab-hist-card-chart'), view);
        var comments = view.entries.slice().reverse().map(function (entry) {
          return { entry: entry, comment: commentText(entry.comment) };
        }).filter(function (item) { return item.comment; });
        var envelope = ENVELOPE_ANALYTES.indexOf(view.key) !== -1;
        if (!comments.length && !envelope) return;
        var extra = add(card, 'div', 'vilda-lab-hist-card-extra');
        if (comments.length) {
          var box = add(extra, 'details', 'vilda-lab-hist-comments');
          add(box, 'summary', '', 'Komentarze (' + comments.length + ')');
          var list = add(box, 'ul', '');
          comments.forEach(function (item) {
            add(list, 'li', '', (item.entry.dateISO ? formatDate(item.entry.dateISO) + ' — ' : '') + item.comment);
          });
        }
        if (envelope) assessmentsBlock(extra, [view]);
        if (!extra.firstChild) card.removeChild(extra);
      }

      function drawChart(box, view) {
        var host = add(box, 'div', 'vilda-lab-hist-chart');
        var chart = view.chart;
        if (!trend || typeof trend.render !== 'function') {
          add(host, 'p', 'vilda-lab-hist-muted', 'Wykres niedostępny — odśwież stronę.');
        } else {
          var svg = null;
          // Bez pasma norm i bez dzisiejszej oceny punktów: funkcja norm zwraca null, pasmo wyłączone.
          // Punkty bez normy wpisu (decyzja 6.22): przy punkcie sama wartość, bez strzałki i bez czerwieni
          // wyróżnienia z Nl; strzałka wg zapisu zostaje przy wartości obok wykresu i w tabeli.
          try { svg = trend.render({ test: view.label, testKey: view.key }, withoutPointFlags(chart), openNote, function () { return null; }, false); } catch (_) { /* jak brak wykresu */ }
          if (svg) {
            host.appendChild(svg);
          } else {
            add(host, 'p', 'vilda-lab-hist-muted vilda-lab-hist-no-chart', 'Za mało dokładnych wyników do wykresu.');
          }
        }
        if (chart.skipped > 0) {
          // Stała kolejność powodów (jak w SKIP_REASON), niezależna od chronologii wpisów.
          var keys = Object.keys(SKIP_REASON).filter(function (key) { return own(chart.skippedByReason, key); })
            .concat(Object.keys(chart.skippedByReason).filter(function (key) { return !own(SKIP_REASON, key); }));
          var reasons = keys.map(function (key) { return (SKIP_REASON[key] || key) + ': ' + chart.skippedByReason[key]; });
          add(box, 'p', 'vilda-lab-hist-foot', 'Poza wykresem: ' + chart.skipped + ' (' + reasons.join(' · ') + ')');
        }
      }
      // Kopia danych wykresu z punktami bez normy: model widoku (tabela, ostatni wynik) zostaje nietknięty.
      function withoutPointFlags(chart) {
        return Object.assign({}, chart, { points: chart.points.map(function (point) { return Object.assign({}, point, { norm: null }); }) });
      }

      // Zdarzenia leczenia od pierwszego wyniku (z datą) pokazanych paneli wzwyż; wcześniejsze nie dotyczą tej historii.
      function treatmentFor(panels) {
        var first = null;
        panels.forEach(function (panel) {
          panel.rows.forEach(function (row) { if (row.dateISO && (!first || row.dateISO < first)) first = row.dateISO; });
        });
        if (!first || !panels.length) return [];
        return (panels[0].treatmentRows || []).filter(function (row) { return row.dateISO >= first; });
      }
      function treatmentText(row) {
        return [row.drug, TREATMENT_ACTION[row.action] || '', row.dose || ''].filter(Boolean).join(' · ');
      }
      function drawTreatment(group, panels) {
        var rows = treatmentFor(panels);
        if (!rows.length) return;
        var box = add(group, 'div', 'vilda-lab-hist-treatment');
        add(box, 'p', 'vilda-lab-hist-treatment-h', 'Leczenie w okresie wyników');
        var list = add(box, 'ul', '');
        rows.forEach(function (row) {
          var item = add(list, 'li', '');
          add(item, 'span', 'vilda-lab-hist-date', formatDate(row.dateISO));
          var label = row.noteId ? button(item, 'vilda-lab-hist-link', treatmentText(row), function () { openNote(row.noteId); })
            : add(item, 'span', '', treatmentText(row));
          label.setAttribute('data-note-id', row.noteId || '');
        });
      }

      function drawTable(group, panel) {
        add(group, 'p', 'vilda-lab-hist-muted', 'Najnowsze u góry. Pod wartością różnica względem wcześniejszego wyniku tego badania z datą badania. Kliknięcie wartości otwiera wpis.');
        var scroll = add(group, 'div', 'vilda-lab-hist-table-scroll');
        var table = add(scroll, 'table', 'vilda-lab-hist-table');
        var headRow = add(add(table, 'thead', ''), 'tr', '');
        add(headRow, 'th', 'vilda-lab-hist-th-date', 'Data badania').setAttribute('scope', 'col');
        panel.series.forEach(function (view) {
          var th = add(headRow, 'th', '', shortLabel(view.label));
          th.setAttribute('scope', 'col');
          if (view.unit) add(th, 'span', 'vilda-lab-hist-th-unit', view.unit);
        });
        add(headRow, 'th', 'vilda-lab-hist-th-comment', 'Komentarz').setAttribute('scope', 'col');
        var body = add(table, 'tbody', '');
        var treatment = treatmentFor([panel]).slice();
        var marks = { converted: false, other: false, assessed: false, gh: false, range: false };
        var columns = panel.series.length + 2;
        panel.rows.forEach(function (row) {
          // Wiersz leczenia stoi nad wierszem wyników z tą samą lub wcześniejszą datą (tabela malejąco).
          while (treatment.length && row.dateISO && treatment[0].dateISO >= row.dateISO) treatmentRow(body, treatment.shift(), columns);
          var tr = add(body, 'tr', SAMPLE_DATES.indexOf(row.dateSource) !== -1 ? '' : 'is-undated');
          var dateCell = add(tr, 'th', 'vilda-lab-hist-td-date', row.dateISO ? formatDate(row.dateISO) : 'bez daty');
          dateCell.setAttribute('scope', 'row');
          if (row.dateSource !== 'badanie' && DATE_SOURCE[row.dateSource]) add(dateCell, 'span', 'vilda-lab-hist-muted', DATE_SOURCE[row.dateSource]);
          var comments = [];
          panel.series.forEach(function (view) {
            var td = add(tr, 'td', 'vilda-lab-hist-td-value');
            var entries = row.cells[view.key] || [];
            if (!entries.length) { add(td, 'span', 'vilda-lab-hist-muted', '—'); return; }
            entries.forEach(function (entry) {
              tableCell(td, entry, view, marks);
              var comment = commentText(entry.comment);
              if (comment && comments.indexOf(comment) === -1) comments.push(comment);
            });
          });
          add(tr, 'td', 'vilda-lab-hist-td-comment', comments.join(' · '));
        });
        treatment.forEach(function (row) { treatmentRow(body, row, columns); });
        var legend = [];
        if (marks.converted) legend.push('wartość podkreślona kropkami — przeliczona z innej jednostki (zapis we wpisie)');
        if (marks.other) legend.push('* — jednostka nierozpoznana albo brak jednostki; wartość jak zapisano, bez różnicy i bez wykresu');
        if (marks.assessed) legend.push('○ — zapisana ocena (szczegóły niżej, w „Zapisane oceny”)');
        if (marks.range) legend.push('↑/↓ — poza zakresem zapisanym z wynikiem przy przypięciu albo poza normą wpisaną we wpisie; zakres i źródło w podpowiedzi');
        if (marks.gh) legend.push('GH — IGF-1 z notatki leczenia GH (pole „IGF-1 (wynik z kontroli)”); bez daty badania data to termin odbytej kontroli');
        if (legend.length) add(group, 'p', 'vilda-lab-hist-foot', legend.join(' · '));
        if (panel.id === 'gonadal') assessmentsBlock(group, panel.series);
      }
      function tableCell(td, entry, view, marks) {
        var cell = add(td, 'button', 'vilda-lab-hist-cell');
        cell.type = 'button';
        cell.setAttribute('data-note-id', entry.noteId || '');
        cell.addEventListener('click', function () { openNote(entry.noteId); });
        var details = [shortLabel(view.label), entry.dateISO ? formatDate(entry.dateISO) : 'bez daty', 'zapisano: ' + (entry.converted ? recorded(entry) : entry.raw || entry.display)];
        if (entry.source === 'gh-note') details.push(GH_SOURCE);
        if (entry.norm) details.push('norma z wpisu: ' + entry.norm);
        if (entry.status && (entry.status.kind === 'range' || entry.status.kind === 'range-general')) {
          var where = rangeContext(entry.status);
          details.push((entry.status.flag ? entry.status.flag + ' ' : '') + entry.status.text + (entry.status.bounds ? ' ' + entry.status.bounds : '') + (where ? ' (' + where + ')' : ''));
          if (entry.status.flag) marks.range = true;
        } else if (entry.status) details.push(entry.status.text);
        cell.setAttribute('title', details.join(' · '));
        var value = add(cell, 'span', 'vilda-lab-hist-cell-value', entry.kind === 'other-unit' || entry.kind === 'text' ? (entry.raw || entry.display) + '*' : bareValue(entry, view.unit));
        if (entry.converted) { value.classList.add('is-converted'); marks.converted = true; }
        if (entry.kind === 'other-unit' || entry.kind === 'text') marks.other = true;
        if (entry.kind === 'invalidated' || entry.kind === 'unavailable') value.classList.add('is-muted');
        if (entry.flag) add(cell, 'span', 'vilda-lab-hist-flag', ' ' + entry.flag);
        if (entry.status && entry.status.kind === 'recorded') { add(cell, 'span', 'vilda-lab-hist-mark', ' ○'); marks.assessed = true; }
        if (entry.source === 'gh-note') { add(cell, 'span', 'vilda-lab-hist-mark vilda-lab-hist-mark-gh', ' GH'); marks.gh = true; }
        if (entry.delta && entry.delta.available) add(cell, 'span', 'vilda-lab-hist-cell-delta', deltaNumber(entry.delta));
        else if (entry.delta && entry.delta.reason === 'method_mismatch') add(cell, 'span', 'vilda-lab-hist-cell-delta', 'różne metody');
      }
      function treatmentRow(body, row, columns) {
        var tr = add(body, 'tr', 'vilda-lab-hist-tr-treatment');
        var th = add(tr, 'th', 'vilda-lab-hist-td-date', formatDate(row.dateISO));
        th.setAttribute('scope', 'row');
        var td = add(tr, 'td', '');
        td.setAttribute('colspan', String(columns - 1));
        if (row.noteId) button(td, 'vilda-lab-hist-link', treatmentText(row), function () { openNote(row.noteId); }).setAttribute('data-note-id', row.noteId);
        else add(td, 'span', '', treatmentText(row));
      }

      function drawFooter(view) {
        var foot = add(section, 'div', 'vilda-lab-hist-footer');
        add(foot, 'p', 'vilda-lab-hist-footer-main', 'Wyniki pokazane tak, jak je zapisano. Historia nie jest oceniana dzisiejszymi normami.');
        var renal = view && view.clcr && view.clcr.measurements.length;
        if (!renal || view.panels.length) add(foot, 'p', 'vilda-lab-hist-muted', (renal ? 'Pozostałe badania laboratoryjne: ' : '') + 'Strzałka ↑/↓ tylko przy wpisie z zakresem zapisanym z wynikiem przy przypięciu, z normą wpisaną we wpisie albo z zapisaną oceną; norma wpisana we wpisie nie dotyczy wyniku przeliczonego z innej jednostki. Wpisy bez zapisanego zakresu są bez oceny. Zakres ogólny przelicznika u dziecka (brak zakresu dla wieku) — bez strzałki. Wykresy bez pasma norm. Różnica: liczba i dni między dwoma dokładnymi wynikami z datą badania, bez procentu i koloru.');
        if (renal) add(foot, 'p', 'vilda-lab-hist-muted', 'Obliczenia Klirensu: norma i ocena zachowane z dnia zapisu. Pasmo oznacza wyłącznie wspólną zapisaną normę.');
        // Decyzje 6.24–6.25: skąd IGF-1 bez daty badania ma datę na wykresie.
        if (view && view.ghIgf1 && view.ghIgf1.shown > 0) {
          add(foot, 'p', 'vilda-lab-hist-muted', 'IGF-1 z notatek leczenia GH: data badania, a gdy jej brak — termin odbytej kontroli (tak jak na wykresie „Trend leczenia GH”); bez normy i bez strzałki.');
        }
      }

      // showPatientCard(activeTab: 'lab') builds this host off DOM, then mounts
      // the complete card synchronously. Start after that stack, keeping the
      // detached guard for later refreshes. No observer or polling outlives a
      // card that is destroyed/replaced before its first mount.
      Promise.resolve().then(function () { if (initialPending) return load(); return null; });
      return {
        refresh: function () { return load(); },
        destroy: function () {
          state.destroyed = true;
          state.gen++;
          if (state.timer && win) win.clearTimeout(state.timer);
          if (renalView) { renalView.destroy(); renalView = null; }
          if (typeof doc.removeEventListener === 'function') doc.removeEventListener('vilda:clcr-results-changed', resultChanged);
          instances = instances.filter(function (other) { return other !== instance; });
          clear(host);
        }
      };
    }

    return Object.freeze({ version: '1.6.0', render: render, _internal: Object.freeze({ plural: plural, commentText: commentText, shortLabel: shortLabel, mergedNote: mergedNote }) });
  }

  return createApi();
});
