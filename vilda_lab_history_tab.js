/* Zakładka „Badania” w karcie pacjenta — widok historii wyników badań (LAB-HISTORIA PR2).
 *
 * Moduł tylko rysuje: dane czyta z sejfu (serie, notatki, okresy leczenia), porównanie układa
 * model VildaLabHistory (vilda_lab_history.js). Zwarta tabela grupuje wyniki według daty.
 * VildaLabResultPresentation odczytuje zapisane normy i oceny, a VildaLabResultChart
 * rysuje historię z zakresami właściwymi dla poszczególnych zapisów. Bez dzisiejszych
 * norm i bez ponownej oceny (LAB_INTERPRETATION_AGENT_GUIDE.md § 7).
 *
 * window.VildaLabHistoryTab.render(host, patientId, options) → { refresh, destroy }
 *   options.openEditor({ note, template, anchor, onSaved })  edytor notatki karty (ga); po „Wpisz wynik”
 *     z zapisaną wartością zakładka zamyka zlecenie (vault.completePatientNote, decyzja 6.11) i daje „Cofnij”
 *   options.openReminders(list)                              arkusz przypomnień (Mr)
 *   options.onChanged()                                      zapis z zakładki zmienił notatki
 *   options.openClcrResult({patientId,noteId,record,vault,onChanged}) — szczegóły obliczenia, nigdy edytor lab
 *   options.focusNoteId                                      po pierwszym odczycie otwiera szczegóły tego wyniku
 *     (link do wyniku z Historii, wyszukiwarki, Przypomnień lub planu opieki; decyzja właściciela 2026-11-11)
 *   options.deleteNote({ note }) → Promise<boolean>         „Usuń wpis” w szczegółach wyniku: potwierdzenie
 *     i usunięcie robi karta (ta sama funkcja co „Usuń” w Notatkach); true = wpis usunięty
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
  // LAB-PAKIETY PR1: skrót do pakietu „Tarczyca” w przeliczniku (slug z danych w vilda_lab_packages.js).
  var PACKAGE_SHORTCUT = { href: 'przelicznik-jednostek.html?pakiet=tarczyca', label: 'Wpisz pakiet: Tarczyca →' };
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
      var trend = own(options, 'trend') ? options.trend : (win && win.__vildaLabTrend) || null;
      var storage = own(options, 'storage') ? options.storage : null;
      if (!storage) { try { storage = win && win.sessionStorage; } catch (_) { storage = null; } }
      var now = typeof options.now === 'function' ? options.now : function () { return new Date(); };
      var state = { gen: 0, destroyed: false, panel: 'all', joinLines: true, query: '', selected: null, view: null, data: null, timer: 0, retried: false, reminders: [], notice: null };
      var resultsHost = null;
      var viewButtons = [], joinLabel = null, joinInput = null;
      var initialPending = true;
      var pendingFocus = text(options.focusNoteId) || null;

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
          state.gen++; state.data = null; state.selected = null; state.query = '';
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
            script.setAttribute('src', new URL('clcr_record_resources.js?v=24', moduleURL || win.location.href).href);
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
          if (pendingFocus) focusRequested();
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
        return 'table';
      }
      function preserveViewport(update) {
        var positions = [], element = host;
        while (element) {
          if (typeof element.scrollTop === 'number') positions.push({ element: element, top: element.scrollTop, left: element.scrollLeft || 0 });
          element = element.parentNode;
        }
        var scrollX = win && (win.scrollX || win.pageXOffset) || 0;
        var scrollY = win && (win.scrollY || win.pageYOffset) || 0;
        var gen = state.gen;
        function restore() {
          if (!current(gen)) return;
          positions.forEach(function (position) {
            position.element.scrollTop = position.top;
            position.element.scrollLeft = position.left;
          });
          if (win && typeof win.scrollTo === 'function') win.scrollTo(scrollX, scrollY);
        }
        update();
        restore();
        // A real browser may apply scroll anchoring during its next layout.
        // The controls themselves stay connected, so their native focus stays too.
        if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(restore);
      }
      function syncViewControls() {
        var mode = viewMode();
        viewButtons.forEach(function (control) { control.setAttribute('aria-pressed', String(control.getAttribute('data-view') === mode)); });
        if (joinLabel) joinLabel.hidden = mode !== 'charts';
        if (joinInput) joinInput.checked = state.joinLines;
      }
      function setView(mode) {
        preserveViewport(function () {
          state.view = mode;
          try { if (storage) storage.setItem(VIEW_KEY + patientId, mode); } catch (_) { /* preferencja tylko na czas karty */ }
          syncViewControls();
          drawResults();
        });
      }

      function openNote(noteId) {
        if (!noteId || !vault || typeof vault.getPatientNote !== 'function') return;
        var gen = state.gen;
        Promise.resolve(vault.getPatientNote(noteId)).then(function (note) {
          if (note && current(gen) && !(typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) openEditor({ note: note });
        }).catch(function () { /* wpis zniknął — odświeżenie pokaże stan sejfu */ });
      }
      // „Usuń wpis” (decyzja właściciela 2026-11-11): wynik ma jedno miejsce pełnej treści, więc usuwa się go
      // w Badaniach, a nie w Notatkach. Potwierdzenie, kontrola dostępu do wpisu i samo usunięcie należą do karty
      // (options.deleteNote — ta sama funkcja co „Usuń” w Notatkach); zakładka czyta wpis świeżo z sejfu.
      function removeNote(noteId) {
        if (!noteId || !vault || typeof vault.getPatientNote !== 'function' || typeof options.deleteNote !== 'function') return;
        var gen = state.gen;
        Promise.resolve(vault.getPatientNote(noteId)).then(function (note) {
          if (!note || !current(gen) || (typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) return false;
          return options.deleteNote({ note: note });
        }).then(function (deleted) {
          if (deleted !== true || !instance.alive()) return;
          if (state.selected && state.selected.noteId === noteId) state.selected = null;
          schedule();
          if (typeof options.onChanged === 'function') options.onChanged();
        }).catch(function () { /* wpis zniknął albo karta odmówiła — odświeżenie pokaże stan sejfu */ });
      }
      // Wejście z linku do wyniku (Historia, wyszukiwarka, Przypomnienia, plan opieki): po pierwszym odczycie
      // zakładka otwiera szczegóły tego wyniku. Wpis, którego już nie ma, zostawia zwykły widok.
      function focusRequested() {
        var noteId = pendingFocus;
        pendingFocus = null;
        if (!noteId || !state.data) return;
        var found = null;
        state.data.view.panels.forEach(function (panel) { panel.series.forEach(function (series) {
          series.entries.forEach(function (entry) { if (!found && entry.noteId === noteId) found = { entry: entry, view: series }; });
        }); });
        if (found) selectResult(found.entry, found.view);
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

      // Pacjent wczytany do formularza (ten, któremu przelicznik przypina wyniki) — identyfikator z sesji.
      function isLoadedPatient() {
        var current;
        try { current = win && (win._vildaCurrentPatientId || (win.sessionStorage && win.sessionStorage.getItem('vildaCurrentPatientId'))); }
        catch (_) { current = null; }
        return !!current && String(current) === String(patientId);
      }

      var remindersButton = null;
      function paintReminders() {
        if (!remindersButton) return;
        remindersButton.hidden = !(state.reminders.length && typeof options.openReminders === 'function');
      }

      function draw() {
        if (!state.data) return;
        var view = state.data.view;
        clear(section);
        remindersButton = null; viewButtons = []; joinLabel = null; joinInput = null;
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
        if (view.panels.length || renal) drawResultControls();
        resultsHost = add(section, 'div', 'vilda-lab-hist-results');
        drawResults();
        drawFooter(view);
      }

      function matchesQuery(value) {
        function fold(input) {
          var result = String(input || '').toLowerCase().replace(/ł/g, 'l');
          try { return result.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) { return result; }
        }
        return fold(value).indexOf(fold(state.query).trim()) !== -1;
      }
      function clcrSeries() {
        var helper = win && win.VildaLabResultPresentation;
        return helper && typeof helper.clcrSeries === 'function' ? helper.clcrSeries(state.data.view.clcr) : null;
      }
      function drawResultControls() {
        var controls = add(section, 'div', 'vilda-lab-hist-result-controls');
        var legend = add(controls, 'div', 'vilda-lab-hist-legend');
        legend.setAttribute('aria-label', 'Kolory zapisanych zakresów');
        add(legend, 'span', 'tone-within', '● W zakresie');
        add(legend, 'span', 'tone-outside', '● Poza zakresem');
        joinLabel = add(controls, 'label', 'vilda-lab-hist-join');
        joinInput = add(joinLabel, 'input', 'vilda-lab-hist-join-input');
        joinInput.type = 'checkbox';
        joinInput.setAttribute('aria-label', 'Połącz punkty');
        add(joinLabel, 'span', '', 'Połącz punkty');
        joinInput.addEventListener('change', function () {
          state.joinLines = !!joinInput.checked;
          preserveViewport(drawResults);
        });
        syncViewControls();
      }
      function drawResults() {
        if (!resultsHost || !state.data) return;
        clear(resultsHost);
        var view = state.data.view;
        if (!view.panels.length && !(view.clcr && view.clcr.measurements.length)) return;
        var mode = viewMode();
        var panels = view.panels.filter(function (panel) { return state.panel === 'all' || state.panel === 'lab' || panel.id === state.panel; }).map(function (panel) {
          return Object.assign({}, panel, { series: panel.series.filter(function (series) { return matchesQuery(series.label); }) });
        }).filter(function (panel) { return panel.series.length; });
        var renal = [];
        if (view.clcr && view.clcr.measurements.length && (state.panel === 'all' || state.panel === 'renal')) {
          var projected = clcrSeries();
          if (projected === null) add(resultsHost, 'p', 'vilda-lab-hist-state', 'Widok zapisanych obliczeń jest niedostępny — odśwież stronę.');
          else renal = projected.filter(function (series) { return matchesQuery([series.label, series.method, series.basisLabel].filter(Boolean).join(' ')); });
        }
        if (!panels.length && !renal.length) {
          if (!resultsHost.firstChild) add(resultsHost, 'p', 'vilda-lab-hist-state', 'Brak wyników pasujących do wyszukiwania.');
          return;
        }
        var visible = panels.slice();
        if (renal.length) visible.push({ id: 'renal', label: 'Klirens', series: renal, rows: [], treatmentRows: [] });
        drawSelectedResult(resultsHost);
        if (mode === 'table') drawDateTable(resultsHost, visible);
        else {
          var grid = add(resultsHost, 'div', 'vilda-lab-hist-grid');
          visible.forEach(function (panel) { panel.series.forEach(function (series) { drawCard(grid, series); }); });
        }
        drawTreatment(resultsHost, panels);
      }

      function describeResult(entry) {
        var helper = win && win.VildaLabResultPresentation;
        if (!helper || typeof helper.describe !== 'function') return { norms: [], normText: '—', tone: 'neutral', symbol: '', warning: '', warningKind: '' };
        return helper.describe(entry, {
          converter: win && win.LabUnitConverter,
          parseNorm: trend && trend.parseNorm,
          snapshot: win && win.VildaLabSnapshot,
          rangeSnapshot: win && win.VildaLabRangeSnapshot,
          assessmentUI: win && win.VildaLabAssessmentUI
        });
      }

      function drawHeader(view) {
        var head = add(section, 'div', 'vilda-lab-hist-head');
        var titles = add(head, 'div', 'vilda-lab-hist-titles');
        add(titles, 'h2', 'vilda-lab-hist-heading', 'Wyniki badań');
        if (view.summary.missingNotes > 0) {
          add(titles, 'p', 'vilda-lab-hist-muted', count(view.summary.missingNotes, ['wynik zmienił', 'wyniki zmieniły', 'wyników zmieniło']) + ' się w trakcie odczytu — odśwież zakładkę.');
        }
        var actions = add(head, 'div', 'vilda-lab-hist-actions');
        if (typeof options.openEditor === 'function') {
          button(actions, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost vilda-lab-hist-add', '+ Dodaj wynik', function () {
            openEditor({ note: null, template: 'lab', anchor: 'date' });
          });
        }
        // LAB-PAKIETY PR1 (decyzja właściciela 2026-11-12): skrót do pakietu badań w przeliczniku. Pakiet
        // opisuje vilda_lab_packages.js; zakładka zna tylko adres i nazwę skrótu. Pakiet zapisuje
        // wyniki pacjentowi wczytanemu do formularza, więc skrót stoi tylko w jego karcie — z karty innej
        // osoby wyniki trafiłyby do niewłaściwego pacjenta.
        if (isLoadedPatient()) {
          var pack = add(actions, 'a', 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost vilda-lab-hist-package', PACKAGE_SHORTCUT.label);
          pack.setAttribute('href', PACKAGE_SHORTCUT.href);
          pack.addEventListener('click', function (event) { openConverter(event, PACKAGE_SHORTCUT.href); });
        }
        var link = add(actions, 'a', 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-primary vilda-lab-hist-check', 'Sprawdź nowy wynik →');
        link.setAttribute('href', 'przelicznik-jednostek.html');
        link.addEventListener('click', function (event) { openConverter(event); });
      }

      function drawToolbar(view) {
        var bar = add(section, 'div', 'vilda-lab-hist-toolbar');
        var searchBox = add(bar, 'div', 'vilda-lab-hist-search');
        var search = add(searchBox, 'input', 'vilda-lab-hist-search-input');
        search.type = 'search';
        search.placeholder = 'Szukaj badania…';
        search.value = state.query;
        search.setAttribute('aria-label', 'Szukaj badania');
        var reset = button(searchBox, 'vilda-lab-hist-search-clear', '×', function () {
          search.value = ''; state.query = ''; state.selected = null; reset.hidden = true; drawResults(); if (typeof search.focus === 'function') search.focus();
        });
        reset.setAttribute('aria-label', 'Wyczyść wyszukiwanie badań');
        reset.hidden = !state.query;
        search.addEventListener('input', function () { state.query = search.value; state.selected = null; reset.hidden = !state.query; drawResults(); });
        var selectWrap = add(bar, 'div', 'vilda-lab-hist-select-wrap');
        var filter = add(selectWrap, 'select', 'vilda-lab-hist-panel-select');
        filter.setAttribute('aria-label', 'Panel badań');
        var choices = [{ id: 'all', label: 'Wszystkie wyniki' }, { id: 'lab', label: 'Wyniki lab.' }];
        choices.forEach(function (choice) { var option = add(filter, 'option', '', choice.label); option.value = choice.id; });
        if (view.panels.length) {
          var labGroup = add(filter, 'optgroup', '');
          labGroup.setAttribute('label', 'Wyniki laboratoryjne');
          view.panels.forEach(function (panel) {
            var option = add(labGroup, 'option', '', panel.label);
            option.value = panel.id;
            choices.push({ id: panel.id });
          });
        }
        var renalOption = add(filter, 'option', '', 'Klirens');
        renalOption.value = 'renal';
        choices.push({ id: 'renal' });
        if (!choices.some(function (choice) { return choice.id === state.panel; })) state.panel = 'all';
        var arrow = add(selectWrap, 'span', 'vilda-lab-hist-select-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('fill', 'none');
        var chevron = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        chevron.setAttribute('d', 'M6 9l6 6 6-6'); chevron.setAttribute('stroke', 'currentColor'); chevron.setAttribute('stroke-width', '2');
        chevron.setAttribute('stroke-linecap', 'round'); chevron.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(chevron); arrow.appendChild(svg);
        filter.value = state.panel;
        filter.addEventListener('change', function () { state.panel = filter.value; state.selected = null; drawResults(); });
        var segment = add(bar, 'div', 'vilda-lab-hist-segment');
        segment.setAttribute('role', 'group');
        segment.setAttribute('aria-label', 'Widok wyników');
        var mode = viewMode();
        [['table', 'Tabela'], ['charts', 'Wykresy']].forEach(function (pair) {
          var option = button(segment, 'vilda-lab-hist-segment-btn', pair[1], function () { setView(pair[0]); });
          option.setAttribute('aria-pressed', String(mode === pair[0]));
          option.setAttribute('data-view', pair[0]);
          viewButtons.push(option);
        });
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
      function selectResult(entry, view) {
        if (entry.clcrRecord) { openClcrResult(entry.clcrRecord); return; }
        state.selected = { noteId: entry.noteId, key: view.key };
        drawResults();
        var details = resultsHost.querySelector('.vilda-lab-hist-result-details');
        if (details) {
          if (typeof details.focus === 'function') details.focus();
          if (typeof details.scrollIntoView === 'function') details.scrollIntoView({ block: 'nearest' });
        }
      }
      function closeResult() {
        var noteId = state.selected && state.selected.noteId;
        state.selected = null;
        drawResults();
        var buttons = resultsHost.querySelectorAll('button[data-note-id]');
        for (var i = 0; i < buttons.length; i++) {
          if (buttons[i].getAttribute('data-note-id') === noteId && typeof buttons[i].focus === 'function') { buttons[i].focus(); break; }
        }
      }
      function resultDate(entry) {
        var label = entry.dateISO ? formatDate(entry.dateISO) : 'Bez daty badania';
        return label + (entry.dateISO && entry.dateSource !== 'badanie' && DATE_SOURCE[entry.dateSource] ? ' · ' + DATE_SOURCE[entry.dateSource] : '');
      }
      section.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && state.selected) { event.preventDefault(); closeResult(); }
      });
      function drawNorms(parent, info, className) {
        if (!info.norms.length) add(parent, 'span', className, '—');
        else info.norms.forEach(function (norm) {
          add(parent, 'span', className, (info.norms.length > 1 && norm.label ? norm.label + ': ' : '') + norm.text);
        });
        if (info.warningKind === 'reference' && info.warning) add(parent, 'span', 'vilda-lab-hist-reference-note', info.warning);
      }
      function drawValue(parent, entry, view, info, className) {
        var line = add(parent, 'span', 'vilda-lab-hist-result-value');
        var shownUnit = entry.unit || (['censored', 'invalidated', 'unavailable'].indexOf(entry.kind) !== -1 ? entry.recordedUnit : '');
        var value = add(line, 'span', className + ' tone-' + info.tone, bareValue(entry, shownUnit));
        if (entry.converted) value.classList.add('is-converted');
        if (shownUnit) add(line, 'span', 'vilda-lab-hist-result-unit', shownUnit);
        if (info.symbol) add(line, 'span', 'vilda-lab-hist-flag tone-' + info.tone, info.symbol);
      }
      function drawResultNotice(parent, info) {
        if (!info.warning || ['clinical', 'invalidated', 'unavailable'].indexOf(info.warningKind) === -1) return;
        var notice = add(parent, 'span', 'vilda-lab-hist-result-notice', info.warning);
        notice.setAttribute('data-warning-kind', info.warningKind);
      }
      function seriesLabel(view) { return view.clcr ? String(view.label || view.test || '') : shortLabel(view.label); }
      function seriesContext(parent, view) {
        if (!view.clcr) return;
        var parts = [view.method, view.basisLabel].filter(function (part, index, values) { return part && values.indexOf(part) === index; });
        if (parts.length) add(parent, 'span', 'vilda-lab-hist-series-context', parts.join(' · '));
      }

      function drawSelectedResult(parent) {
        if (!state.selected) return;
        var found = null, view = null;
        state.data.view.panels.forEach(function (panel) { panel.series.forEach(function (series) {
          if (series.key !== state.selected.key) return;
          series.entries.forEach(function (entry) { if (entry.noteId === state.selected.noteId) { found = entry; view = series; } });
        }); });
        if (!found) { state.selected = null; return; }
        var info = describeResult(found);
        var box = add(parent, 'section', 'vilda-lab-hist-result-details');
        box.setAttribute('data-note-id', found.noteId || '');
        box.setAttribute('role', 'region');
        box.setAttribute('aria-label', 'Szczegóły wyniku ' + seriesLabel(view));
        box.setAttribute('tabindex', '-1');
        var top = add(box, 'div', 'vilda-lab-hist-details-head');
        add(top, 'h3', '', seriesLabel(view));
        var close = button(top, 'vilda-lab-hist-details-close', '×', closeResult);
        close.setAttribute('aria-label', 'Zamknij szczegóły wyniku');
        add(box, 'p', 'vilda-lab-hist-date', resultDate(found));
        drawValue(box, found, view, info, 'vilda-lab-hist-detail-value');
        var norms = add(box, 'div', 'vilda-lab-hist-detail-norms');
        add(norms, 'span', 'vilda-lab-hist-muted', 'Norma');
        drawNorms(norms, info, 'vilda-lab-hist-result-norm');
        drawResultNotice(box, info);
        if (found.converted) add(box, 'p', 'vilda-lab-hist-muted', 'Zapisano: ' + recorded(found));
        if (found.source === 'gh-note') add(box, 'p', 'vilda-lab-hist-muted', GH_SOURCE);
        if (KIND_NOTE[found.kind]) add(box, 'p', 'vilda-lab-hist-muted', KIND_NOTE[found.kind]);
        var comment = commentText(found.comment);
        if (comment) add(box, 'p', 'vilda-lab-hist-result-comment', comment);
        if (found.delta && found.delta.available) add(box, 'p', 'vilda-lab-hist-muted', 'Zmiana: ' + model.formatDelta(found.delta, win && win.LabUnitConverter));
        var canEdit = typeof options.openEditor === 'function' && !!found.noteId;
        // IGF-1 z notatki leczenia GH jest częścią notatki leczenia — tę usuwa się przy leczeniu, nie tutaj.
        var canDelete = typeof options.deleteNote === 'function' && !!found.noteId && found.source !== 'gh-note';
        if (canEdit || canDelete) {
          var actions = add(box, 'div', 'vilda-lab-hist-detail-actions');
          if (canEdit) button(actions, 'vilda-lab-hist-link vilda-lab-hist-edit-result', 'Edytuj wpis', function () { openNote(found.noteId); });
          if (canDelete) button(actions, 'vilda-lab-hist-link vilda-lab-hist-delete-result', 'Usuń wpis', function () { removeNote(found.noteId); });
        }
        if (view.entries.length > 1) {
          var history = add(box, 'details', 'vilda-lab-hist-result-history');
          add(history, 'summary', '', 'Pozostałe wyniki (' + (view.entries.length - 1) + ')');
          view.entries.slice().reverse().filter(function (entry) { return entry !== found; }).forEach(function (entry) {
            var row = button(history, 'vilda-lab-hist-history-entry', '', function () { selectResult(entry, view); });
            row.setAttribute('data-note-id', entry.noteId || '');
            add(row, 'span', '', resultDate(entry));
            var otherInfo = describeResult(entry);
            var content = add(row, 'span', 'vilda-lab-hist-result-numbers');
            drawValue(content, entry, view, otherInfo, 'vilda-lab-hist-cell-value');
            drawNorms(content, otherInfo, 'vilda-lab-hist-result-norm');
          });
        }
        if (found.status || found.assessment || found.norm) {
          var sources = add(box, 'details', 'vilda-lab-hist-result-sources');
          add(sources, 'summary', '', 'Szczegóły i źródła');
          statusLine(sources, found);
          if (found.norm && !found.normAccepted) add(sources, 'p', 'vilda-lab-hist-muted', 'Norma w oryginalnym wpisie: ' + found.norm);
          if (found.assessment && trend && typeof trend.assessments === 'function') {
            var drawn = false;
            var detailsGen = state.gen;
            sources.addEventListener('toggle', function () {
              if (!sources.open || drawn || !current(detailsGen) || !state.data || sources.isConnected === false
                  || (typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) return;
              drawn = true;
              var serie = rawSeries(view.key);
              if (!serie) return;
              var copy = Object.assign({}, serie, { points: (serie.points || []).filter(function (point) { return point.noteId === found.noteId; }) });
              try { trend.assessments(sources, copy, openNote); } catch (_) { add(sources, 'p', '', 'Pełna ocena jest dostępna w zapisanym wpisie.'); }
            });
          }
        }
      }

      function drawCard(grid, view) {
        var card = add(grid, 'article', 'vilda-lab-hist-card');
        card.setAttribute('data-series', view.key);
        card.setAttribute('data-source', view.clcr ? 'clcr' : 'lab');
        if (view.clcr) {
          card.setAttribute('data-parameter-key', view.parameterKey || '');
          card.setAttribute('data-method', view.method || '');
          card.setAttribute('data-basis', view.basis || '');
          card.setAttribute('data-source-formula-id', view.sourceFormulaId || '');
        }
        var head = add(card, 'div', 'vilda-lab-hist-card-head');
        var title = add(head, 'div', 'vilda-lab-hist-card-title');
        add(title, 'h3', 'vilda-lab-hist-card-name', seriesLabel(view));
        seriesContext(title, view);
        var shown = view.last || view.entries[view.entries.length - 1];
        if (shown) {
          var info = describeResult(shown);
          var latest = button(head, 'vilda-lab-hist-latest', '', function () { selectResult(shown, view); });
          latest.setAttribute('data-note-id', shown.noteId || '');
          latest.setAttribute('aria-label', 'Szczegóły wyniku ' + seriesLabel(view) + ' ' + shown.display);
          drawValue(latest, shown, view, info, 'vilda-lab-hist-value');
          add(latest, 'span', 'vilda-lab-hist-date', resultDate(shown));
          var norms = add(card, 'div', 'vilda-lab-hist-card-norms');
          add(norms, 'span', 'vilda-lab-hist-muted', 'Norma: ');
          drawNorms(norms, info, 'vilda-lab-hist-result-norm');
          drawResultNotice(card, info);
        }
        drawChart(add(card, 'div', 'vilda-lab-hist-card-chart'), view);
        if (view.testKey) {
          var href = 'przelicznik-jednostek.html?badanie=' + encodeURIComponent(view.testKey);
          var check = add(card, 'a', 'vilda-lab-hist-card-check', 'Nowy wynik ' + seriesLabel(view) + ' →');
          check.setAttribute('href', href);
          check.addEventListener('click', function (event) { openConverter(event, href); });
        }
      }
      function drawChart(box, view) {
        var host = add(box, 'div', 'vilda-lab-hist-chart');
        var renderer = win && win.VildaLabResultChart;
        if (!renderer || typeof renderer.render !== 'function') {
          add(host, 'p', 'vilda-lab-hist-muted', 'Wykres niedostępny — odśwież stronę.');
          return;
        }
        var chart = renderer.render(doc, view, {
          describe: describeResult,
          openNote: function (noteId) {
            var entry = view.entries.filter(function (item) { return item.noteId === noteId; })[0];
            if (entry) selectResult(entry, view);
          },
          formatNumber: formatNumber, formatDate: formatDate, joinLines: state.joinLines
        });
        if (chart) host.appendChild(chart);
        else {
          add(host, 'p', 'vilda-lab-hist-muted vilda-lab-hist-no-chart', 'Brak dokładnych wyników z datą do wykresu.');
          // A series without any plottable point still exposes every saved
          // observation, including censored/text values and missing dates.
          var records = add(host, 'div', 'vilda-lab-result-chart-records');
          view.entries.slice().sort(function (a, b) {
            if (!a.dateISO || !b.dateISO) return a.dateISO ? -1 : b.dateISO ? 1 : 0;
            return a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : 0;
          }).forEach(function (entry) {
            var when = resultDate(entry);
            var value = entry.display || entry.raw || '—';
            var link = button(records, 'vilda-lab-result-chart-record', '', function () { selectResult(entry, view); });
            link.setAttribute('data-note-id', entry.noteId || '');
            link.setAttribute('aria-label', seriesLabel(view) + ': ' + value + ' · ' + when + '. Otwórz wynik');
            add(link, 'span', 'vilda-lab-result-chart-record-value', value);
            var date = add(link, 'time', 'vilda-lab-result-chart-record-date', when);
            if (entry.dateISO) date.setAttribute('datetime', entry.dateISO);
          });
        }
        if (view.chart.skipped > 0) {
          var keys = Object.keys(SKIP_REASON).filter(function (key) { return own(view.chart.skippedByReason, key); });
          var reasons = keys.map(function (key) { return SKIP_REASON[key] + ': ' + view.chart.skippedByReason[key]; });
          add(box, 'p', 'vilda-lab-hist-foot', 'Poza wykresem: ' + view.chart.skipped + (reasons.length ? ' (' + reasons.join(' · ') + ')' : ''));
        }
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
        var box = add(group, 'details', 'vilda-lab-hist-treatment');
        add(box, 'summary', 'vilda-lab-hist-treatment-h', 'Leczenie w okresie wyników');
        var list = add(box, 'ul', '');
        rows.forEach(function (row) {
          var item = add(list, 'li', '');
          add(item, 'span', 'vilda-lab-hist-date', formatDate(row.dateISO));
          var label = row.noteId ? button(item, 'vilda-lab-hist-link', treatmentText(row), function () { openNote(row.noteId); })
            : add(item, 'span', '', treatmentText(row));
          label.setAttribute('data-note-id', row.noteId || '');
        });
      }

      function drawDateTable(parent, panels) {
        var headings = add(parent, 'div', 'vilda-lab-hist-table-head');
        add(headings, 'span', '', 'Badanie');
        add(headings, 'span', '', 'Wynik / Norma');
        var groups = {}, dates = [];
        panels.forEach(function (panel) { panel.series.forEach(function (view) {
          view.entries.forEach(function (entry) {
            var key = (entry.dateISO || '') + '|' + entry.dateSource;
            if (!groups[key]) { groups[key] = { dateISO: entry.dateISO, source: entry.dateSource, entries: [] }; dates.push(key); }
            groups[key].entries.push({ entry: entry, view: view });
          });
        }); });
        dates.sort(function (a, b) {
          var left = groups[a].dateISO, right = groups[b].dateISO;
          if (!left || !right) return left ? -1 : right ? 1 : 0;
          return left < right ? 1 : left > right ? -1 : 0;
        });
        dates.forEach(function (key) {
          var group = groups[key];
          var box = add(parent, 'section', 'vilda-lab-hist-date-group');
          box.setAttribute('data-date-iso', group.dateISO || '');
          var label = group.dateISO ? formatDate(group.dateISO) : 'Bez daty badania';
          if (group.source !== 'badanie' && DATE_SOURCE[group.source]) label += ' · ' + DATE_SOURCE[group.source];
          add(box, 'h3', 'vilda-lab-hist-date-heading', label);
          group.entries.forEach(function (item) {
            var entry = item.entry, view = item.view, info = describeResult(entry);
            var row = button(box, 'vilda-lab-hist-result-row vilda-lab-hist-cell', '', function () { selectResult(entry, view); });
            row.setAttribute('data-note-id', entry.noteId || '');
            row.setAttribute('data-series', view.key);
            row.setAttribute('data-source', view.clcr ? 'clcr' : 'lab');
            if (view.clcr) {
              row.setAttribute('data-parameter-key', view.parameterKey || '');
              row.setAttribute('data-method', view.method || '');
              row.setAttribute('data-basis', view.basis || '');
              row.setAttribute('data-source-formula-id', view.sourceFormulaId || '');
            }
            row.setAttribute('title', view.label + ' · ' + (entry.raw || entry.display) + (entry.converted ? ' · zapisano: ' + recorded(entry) : ''));
            var name = add(row, 'span', 'vilda-lab-hist-result-name', seriesLabel(view));
            seriesContext(name, view);
            if (entry.source === 'gh-note') add(name, 'span', 'vilda-lab-hist-source', 'GH');
            var numbers = add(row, 'span', 'vilda-lab-hist-result-numbers');
            drawValue(numbers, entry, view, info, 'vilda-lab-hist-cell-value');
            drawNorms(numbers, info, 'vilda-lab-hist-result-norm');
            drawResultNotice(numbers, info);
            var arrow = add(row, 'span', 'vilda-lab-hist-result-chevron', '›');
            arrow.setAttribute('aria-hidden', 'true');
          });
        });
      }

      function drawFooter(view) {
        var foot = add(section, 'details', 'vilda-lab-hist-footer');
        add(foot, 'summary', '', 'O zapisanych wynikach');
        add(foot, 'p', 'vilda-lab-hist-footer-main', 'Wyniki pokazane tak, jak je zapisano. Historia nie jest oceniana dzisiejszymi normami.');
        add(foot, 'p', 'vilda-lab-hist-muted', 'Kolor oznacza położenie względem zapisanego zakresu, nie rozpoznanie. Brak zakresu, porównania orientacyjne i nieaktualne oceny pozostają neutralne. Zakresy na wykresie dotyczą poszczególnych zapisów.');
        if (view && view.ghIgf1 && view.ghIgf1.shown > 0) add(foot, 'p', 'vilda-lab-hist-muted', 'IGF-1 z notatek leczenia GH: data badania, a gdy jej brak — termin odbytej kontroli; bez normy.');
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
          if (typeof doc.removeEventListener === 'function') doc.removeEventListener('vilda:clcr-results-changed', resultChanged);
          instances = instances.filter(function (other) { return other !== instance; });
          clear(host);
        }
      };
    }

    return Object.freeze({ version: '2.3.0', render: render, _internal: Object.freeze({ plural: plural, commentText: commentText, shortLabel: shortLabel, mergedNote: mergedNote }) });
  }

  return createApi();
});
