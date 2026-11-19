/* Zakładka „Badania” w karcie pacjenta — widok historii wyników badań (LAB-HISTORIA PR2).
 *
 * Moduł tylko rysuje: dane czyta z sejfu (serie, notatki, okresy leczenia), porównanie układa
 * model VildaLabHistory (vilda_lab_history.js). Zwarta tabela grupuje wyniki według daty.
 * VildaLabResultPresentation odczytuje zapisane normy i oceny, a VildaLabResultChart
 * rysuje historię z zakresami właściwymi dla poszczególnych zapisów. Bez dzisiejszych
 * norm i bez ponownej oceny (LAB_INTERPRETATION_AGENT_GUIDE.md § 7).
 *
 * window.VildaLabHistoryTab.render(host, patientId, options) → { refresh, destroy }
 *   options.openEditor({ note, template, anchor, onSaved })  edytor notatki karty (ga): edycja zapisanego wyniku.
 *     Nowego wyniku zakładka nie wpisuje ręcznie — także przy oczekującym wyniku (P-OCZEKUJACE-WYNIKI, decyzje
 *     właściciela 2026-11-15): „Wpisz wynik →” otwiera Jednostki lab. z tym wpisem (?oczekujacy=<id>; wynik
 *     dostaje ocenę, a wpis zamyka okno przypięcia — VildaLabPendingResult w lab_pin_result.js), „Opisz wynik” zapisuje wynik
 *     opisowy operacją sejfu saveReminderOutcome (ta sama co „Dodaj wynik do kartoteki” w Przypomnieniach).
 *   options.loadPatient({ href })                            wczytanie pacjenta tej karty do formularza drogą
 *     karty („Wczytaj tego pacjenta”: strażnik niezapisanych zmian, wybór „Nowy pomiar” / „Odtwórz zapisany
 *     stan”), a po nim przejście do przelicznika pod href (bez href: sam przelicznik). Bez tej opcji zakładka
 *     pacjenta niewczytanego pokazuje tylko podpowiedź (P-BADANIA-WEJSCIE, decyzja właściciela 2026-11-15).
 *   options.openReminders(list)                              arkusz przypomnień (Mr)
 *   options.onChanged()                                      zapis z zakładki zmienił notatki
 *   options.openClcrResult({patientId,noteId,record,vault,onChanged}) — szczegóły obliczenia, nigdy edytor lab
 *   options.focusNoteId                                      po pierwszym odczycie otwiera szczegóły tego wyniku
 *     (link do wyniku z Historii, wyszukiwarki, Przypomnień lub planu opieki; decyzja właściciela 2026-11-11);
 *     od 2.7.0 także wyniku Klirensu — otwiera szczegóły obliczenia (P-KLIRENS-NOTATKI, decyzja 2026-11-15:
 *     wynik Klirensu nie ma już karty w Notatkach)
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
  // P-BADANIA-WEJSCIE (decyzja właściciela 2026-11-15): wyniki dodaje się tylko w Jednostkach lab., pacjentowi
  // wczytanemu do formularza — tam aplikacja zna wizytę (nową albo odtworzoną), wiek i ocenę pokwitania.
  // Karta pacjenta niewczytanego najpierw go wczytuje; nigdy nie przenosi do przelicznika „na ślepo”.
  var ENTRY = {
    href: 'przelicznik-jednostek.html',
    loaded: 'Dodaj wyniki →',
    load: 'Wczytaj pacjenta i dodaj wyniki →',
    hint: 'Wyniki dodasz w Jednostkach lab. po wczytaniu tego pacjenta z Bazy pacjentów.',
    emptyLoaded: 'Wyniki dodasz w Jednostkach lab. — pojedynczo albo pakietem badań.',
    emptyLoad: 'Wyniki dodasz w Jednostkach lab. po wczytaniu tego pacjenta.'
  };
  // P-OCZEKUJACE-WYNIKI (decyzje właściciela 2026-11-15): przy każdym oczekującym wyniku dwie akcje. Nazwa wpisu
  // jest wpisana odręcznie, więc zakładka nie rozstrzyga, czy wynik będzie liczbowy, czy opisowy.
  var PENDING = {
    param: 'oczekujacy',
    enter: 'Wpisz wynik →',
    load: 'Wczytaj pacjenta i wpisz wynik →',
    describe: 'Opisz wynik',
    help: '„Wpisz wynik →” otwiera Jednostki lab. z tym oczekującym wynikiem: wynik liczbowy dostaje ocenę, a wpis znika z oczekujących po przypięciu. „Opisz wynik” służy do wyniku opisowego, np. biopsji albo USG.',
    helpDescribeOnly: '„Opisz wynik” zapisuje wynik opisowy, np. biopsji albo USG. Wynik liczbowy wpiszesz w Jednostkach lab. po wczytaniu tego pacjenta z Bazy pacjentów.'
  };
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
    function ensureRecordResources(options, doc, editor) {
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
          script.setAttribute('src', new URL('clcr_record_resources.js?v=31', moduleURL || win.location.href).href);
          timer = win.setTimeout(function () { finish(new Error('Upłynął czas wczytywania zapisanych obliczeń.')); }, 15000);
          doc.head.appendChild(script);
        });
        resourceBootstrap.catch(function () { resourceBootstrap = null; });
      }
      return resourceBootstrap.then(ready);
    }

    function waitForConverter(trend) {
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

    // Read-only shared bootstrap for the home documentation preview. Resource
    // lists and their loader remain the SAME native actors used by this tab.
    async function ensureReaderDependencies(settings) {
      settings = settings || {};
      var doc = win && win.document;
      function check() {
        if (settings.isCurrent && settings.isCurrent() !== true) throw new Error('HOME_PATIENT_STALE');
      }
      check();
      if (!doc) throw new Error('LAB_READER_UNAVAILABLE');
      var ok = await waitForConverter(win.__vildaLabTrend);
      check();
      if (!ok || !win.LabUnitConverter) throw new Error('LAB_CONVERTER_UNAVAILABLE');
      if (settings.includeClcr === true) {
        await ensureRecordResources({}, doc, false);
        check();
      }
      return true;
    }

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
      var viewportReserve = 0, viewportRevision = 0;
      var labDetails = null, clcrDetails = null, detailsObserver = null, detailsRequest = 0;
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
        alive: function () { return !state.destroyed && host.isConnected !== false && (!options.isCurrent || options.isCurrent() === true); },
        noteChanged: function (event) {
          if (event && event.patientId && event.patientId !== patientId) return;
          schedule();
        },
        locked: function () {
          closeAllDetails(false);
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

      function message(className, content, retry) {
        resetViewportReserve();
        clear(section);
        var box = add(section, 'div', 'vilda-lab-hist-state ' + className);
        add(box, 'p', '', content);
        if (retry) button(box, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost', 'Spróbuj ponownie', function () { load(); });
        section.setAttribute('aria-busy', 'false');
        section.classList.add('vilda-lab-hist-ready');
      }

      function load() {
        if (state.destroyed || host.isConnected === false) return Promise.resolve();
        resetViewportReserve();
        initialPending = false;
        closeLabDetails(false);
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
            waitForConverter(trend)
          ]);
        }).then(function (results) {
          if (!current(gen)) return results;
          // Nie obciążamy zwykłej historii dodatkowymi modułami, dopóki pacjent
          // nie ma zapisanych obliczeń. Kolejne zdarzenie sejfu ponowi tę bramkę.
          var hasSavedCalculations = (Array.isArray(results[1]) ? results[1] : []).some(function (note) { return note && note.category === 'wynik-klirens'; });
          return (hasSavedCalculations ? ensureRecordResources(options, doc, false) : Promise.resolve()).then(function () {
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
      function setViewportReserve(pixels) {
        var value = Math.max(0, Math.ceil(pixels || 0));
        if (value === viewportReserve) return;
        viewportReserve = value;
        if (!section.style || typeof section.style.setProperty !== 'function') return;
        if (value) section.style.setProperty('--vilda-lab-hist-scroll-reserve', value + 'px');
        else section.style.removeProperty('--vilda-lab-hist-scroll-reserve');
      }
      function resetViewportReserve() {
        viewportRevision++;
        setViewportReserve(0);
      }
      function preserveViewport(update) {
        var positions = [], element = host;
        while (element) {
          if (typeof element.scrollTop === 'number') positions.push({ element: element, top: element.scrollTop, left: element.scrollLeft || 0 });
          element = element.parentNode;
        }
        var scrollX = win && (win.scrollX || win.pageXOffset) || 0;
        var scrollY = win && (win.scrollY || win.pageYOffset) || 0;
        var gen = state.gen, revision;
        function restore() {
          if (!current(gen) || revision !== viewportRevision) return;
          // A shorter view can clamp a scroll container before restoration.
          // Reserve only that missing range, after the footer, rather than
          // stretching every short list away from its explanatory disclosure.
          var missing = 0;
          positions.forEach(function (position) {
            var owner = position.element;
            if (position.top > 0 && typeof owner.scrollHeight === 'number' && owner.clientHeight > 0) {
              missing = Math.max(missing, position.top - Math.max(0, owner.scrollHeight - owner.clientHeight));
            }
          });
          if (missing > 0) setViewportReserve(viewportReserve + missing);
          positions.forEach(function (position) {
            position.element.scrollTop = position.top;
            position.element.scrollLeft = position.left;
          });
          if (win && typeof win.scrollTo === 'function') win.scrollTo(scrollX, scrollY);
        }
        update();
        revision = viewportRevision;
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
          if (note && (!note.patientId || note.patientId === patientId) && current(gen) && !(typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) openEditor({ note: note });
        }).catch(function () { /* wpis zniknął — odświeżenie pokaże stan sejfu */ });
      }
      // „Usuń wpis” (decyzja właściciela 2026-11-11): wynik ma jedno miejsce pełnej treści, więc usuwa się go
      // w Badaniach, a nie w Notatkach. Potwierdzenie, kontrola dostępu do wpisu i samo usunięcie należą do karty
      // (options.deleteNote — ta sama funkcja co „Usuń” w Notatkach); zakładka czyta wpis świeżo z sejfu.
      function removeNote(noteId, onCancelled) {
        if (!noteId || !vault || typeof vault.getPatientNote !== 'function' || typeof options.deleteNote !== 'function') return;
        var gen = state.gen;
        Promise.resolve(vault.getPatientNote(noteId)).then(function (note) {
          if (!note || (note.patientId && note.patientId !== patientId) || !current(gen) || (typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) return false;
          return options.deleteNote({ note: note });
        }).then(function (deleted) {
          if (deleted !== true || !instance.alive()) { if (deleted !== true && typeof onCancelled === 'function' && instance.alive()) onCancelled(); return; }
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
        // P-KLIRENS-NOTATKI: link do wyniku Klirensu (Historia, wyszukiwarka) otwiera szczegóły tego obliczenia.
        if (!found && state.data.view.clcr) {
          (clcrSeries() || []).forEach(function (series) {
            series.entries.forEach(function (entry) { if (!found && entry.noteId === noteId) found = { entry: entry, view: series }; });
          });
        }
        if (found) selectResult(found.entry, found.view);
      }
      function openEditor(request) {
        if (typeof options.openEditor !== 'function') return;
        options.openEditor(Object.assign({}, request, {
          onSaved: function () {
            schedule();
            if (typeof options.onChanged === 'function') options.onChanged();
          }
        }));
      }
      // „Wpisz wynik →” przy oczekującym wyniku: Jednostki lab. z tym wpisem. Wpis dopasowany do badania z listy
      // przelicznika (testKey albo dokładna nazwa po „Wynik: ”) otwiera od razu to badanie.
      function pendingHref(item) {
        return ENTRY.href + '?' + PENDING.param + '=' + encodeURIComponent(item.noteId)
          + (item.seriesKey ? '&badanie=' + encodeURIComponent(item.seriesKey) : '');
      }
      // „Opisz wynik”: wynik opisowy (biopsja, USG) — bez pól wartości i jednostki, bo wynik liczbowy ma przejść
      // przez Jednostki lab. i dostać ocenę. Zapis robi sejf jedną operacją (saveReminderOutcome, action „result”),
      // tą samą co „Dodaj wynik do kartoteki” w Przypomnieniach: opis trafia do karty jako wynik opisowy, a wpis
      // zostaje oznaczony jako wykonany. Nie wymaga wczytania pacjenta do formularza.
      var describeDialog = null;
      function canDescribe() {
        return !!vault && typeof vault.saveReminderOutcome === 'function' && typeof vault.getPatientNote === 'function';
      }
      function closeDescribe(restoreFocus) {
        var previous = describeDialog;
        describeDialog = null;
        if (!previous) return;
        previous.shell.destroy({ restoreFocus: restoreFocus !== false });
        if (previous.releasePresentation) previous.releasePresentation();
        if (previous.host.parentNode) previous.host.parentNode.removeChild(previous.host);
      }
      function operationId() {
        var random = '';
        try {
          var bytes = new Uint8Array(12);
          win.crypto.getRandomValues(bytes);
          for (var i = 0; i < bytes.length; i++) random += ('0' + bytes[i].toString(16)).slice(-2);
        } catch (_) { random = Math.random().toString(36).slice(2) + Date.now().toString(36); }
        return 'bad-opis-' + random;
      }
      // Nazwa badania dla wyniku opisowego: z wpisu, a przy tytule „Wynik: …” (Terminarz po procedurze) bez prefiksu.
      function pendingTestName(note) {
        var named = text(note.labResult && note.labResult.test);
        if (named) return named;
        var title = text(note.title);
        return title.indexOf('Wynik: ') === 0 ? title.slice('Wynik: '.length).trim() : title;
      }
      function stillPending(note) {
        if (!note || (note.patientId && note.patientId !== patientId)) return false;
        if (model && typeof model.pendingItem === 'function') return !!model.pendingItem(note, win && win.LabUnitConverter || null);
        return !note.completedAtISO && !note.noShowAtISO;
      }
      function describePending(item, anchor) {
        if (!canDescribe() || detailsHidden()) return;
        var helper = win && win.VildaResultDetailsDialog;
        if (!helper || typeof helper.attach !== 'function') {
          state.notice = { kind: 'details-resource-error', text: 'Nie udało się otworzyć okna opisu wyniku. Odśwież stronę.' }; draw(); return;
        }
        closeAllDetails(false);
        var overlay = node('div', 'vilda-result-details-host');
        var dialog = add(overlay, 'dialog', 'vilda-lab-hist');
        dialog.setAttribute('id', 'labPendingDescribeDialog');
        dialog.setAttribute('aria-labelledby', 'labPendingDescribeTitle');
        var layout = add(dialog, 'div', 'vilda-result-details-layout vilda-lab-hist-describe');
        var heading = add(layout, 'header', 'vilda-result-details-heading');
        var titles = add(heading, 'div', 'vilda-result-details-titles');
        add(titles, 'p', 'vilda-lab-hist-muted', 'Oczekujący wynik');
        var title = add(titles, 'h2', '', 'Opisz wynik'); title.setAttribute('id', 'labPendingDescribeTitle');
        var close = button(heading, 'vilda-lab-hist-details-close', '×', function () { closeDescribe(true); });
        close.setAttribute('aria-label', 'Zamknij okno opisu wyniku');
        var body = add(layout, 'div', 'vilda-result-details-body vilda-lab-hist-describe-body');
        var context = add(body, 'p', 'vilda-lab-hist-describe-context', item.title || 'Zlecone badanie');
        if (item.dueDateISO) add(context, 'span', 'vilda-lab-hist-muted', ' · termin ' + formatDate(item.dueDateISO));
        var areaLabel = add(body, 'label', 'vilda-lab-hist-describe-label', 'Opis otrzymanego wyniku');
        var area = add(body, 'textarea', 'vilda-lab-hist-describe-text');
        area.setAttribute('id', 'labPendingDescribeText'); areaLabel.setAttribute('for', 'labPendingDescribeText');
        area.setAttribute('rows', '5'); area.setAttribute('maxlength', '20000');
        area.setAttribute('placeholder', 'Wpisz treść otrzymanego wyniku lub najważniejsze ustalenia…');
        var dateLabel = add(body, 'label', 'vilda-lab-hist-describe-label', 'Data otrzymania wyniku');
        var date = add(body, 'input', 'vilda-lab-hist-describe-date');
        date.setAttribute('id', 'labPendingDescribeDate'); dateLabel.setAttribute('for', 'labPendingDescribeDate');
        date.type = 'date'; date.value = localISO(now()); date.setAttribute('max', localISO(now()));
        add(body, 'p', 'vilda-lab-hist-muted vilda-lab-hist-describe-help', 'Opis zostanie zapisany w karcie pacjenta jako wynik opisowy, a oczekujący wynik zostanie oznaczony jako wykonany. Aplikacja nie ocenia opisu i nie rysuje go na wykresach. Data otrzymania nie jest datą pobrania badania.');
        var error = add(body, 'p', 'vilda-lab-hist-describe-error');
        error.setAttribute('role', 'alert'); error.hidden = true;
        var actions = add(layout, 'footer', 'vilda-result-details-actions vilda-lab-hist-detail-actions');
        var cancel = button(actions, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost', 'Anuluj', function () { closeDescribe(true); });
        var save = button(actions, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-primary vilda-lab-hist-describe-save', 'Zapisz opis', submit);
        doc.body.appendChild(overlay);
        var presentationCleanup = typeof options.onDialog === 'function' ? options.onDialog(dialog) : null;
        function releasePresentation() { var cleanup = presentationCleanup; presentationCleanup = null; if (typeof cleanup === 'function') cleanup(); }
        var shell = helper.attach(dialog, { context: section, onClose: function () {
          releasePresentation();
          if (describeDialog && describeDialog.host === overlay) describeDialog = null;
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        } });
        var busy = false, op = operationId(), signature = null;
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); if (!busy) closeDescribe(true); });
        describeDialog = { host: overlay, dialog: dialog, shell: shell, releasePresentation: releasePresentation };
        function fail(message) { error.textContent = message; error.hidden = !message; }
        function setBusy(value) {
          busy = value;
          [area, date, cancel, save, close].forEach(function (control) { control.disabled = value; });
          save.textContent = value ? 'Zapisuję…' : 'Zapisz opis';
        }
        function userError(message) { var problem = new Error(message); problem.forUser = true; return problem; }
        function submit() {
          if (busy || typeof options.isCurrent === 'function' && !instance.alive()) return;
          var value = text(area.value), day = date.value;
          if (!value) { fail('Wpisz opis otrzymanego wyniku.'); if (typeof area.focus === 'function') area.focus(); return; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) { fail('Podaj datę otrzymania wyniku.'); return; }
          fail('');
          setBusy(true);
          var opened = describeDialog;
          Promise.resolve(vault.getPatientNote(item.noteId)).then(function (note) {
            if (typeof options.isCurrent === 'function' && (!instance.alive() || describeDialog !== opened)) return null;
            if (!stillPending(note)) throw userError('Ten oczekujący wynik zmienił się albo został już zamknięty. Zamknij okno i sprawdź go w Przypomnieniach.');
            // E3-PR0b2a: chwila zapisu obok rev - sejf porównuje ją z wersją pod blokadą notatki.
            // E3-PR0b2b: i sama wersja (baseNote) - ta sama widoczna wersja z nową chwilą zapisu nie jest konfliktem.
            var request = { id: note.id, patientId: note.patientId, baseRev: note.rev || 0, baseUpdatedAtISO: note.updatedAtISO || null, action: 'result', dateISO: day, text: value, baseNote: note };
            var name = pendingTestName(note);
            if (name) request.test = name;
            // Ponowienie tej samej prośby (np. po błędzie sieci) niesie ten sam identyfikator operacji.
            var sig = JSON.stringify(request);
            if (signature && signature !== sig) op = operationId();
            signature = sig;
            request.operationId = op;
            if (typeof options.isCurrent === 'function' && (!instance.alive() || describeDialog !== opened)) return null;
            return vault.saveReminderOutcome(request);
          }).then(function (result) {
            if (typeof options.isCurrent === 'function' && (!instance.alive() || describeDialog !== opened)) return;
            if (!result || result.saved !== true) {
              throw userError(result && (result.reason === 'conflict' || result.reason === 'already-closed')
                ? 'Ten wpis zmienił się w innej karcie lub na innym urządzeniu. Zachowaj wpisany opis i sprawdź wpis w Przypomnieniach.'
                : 'Nie zapisano opisu. Wpis mógł zostać usunięty.');
            }
            if (describeDialog === opened) closeDescribe(true);
            if (!instance.alive()) return;
            state.notice = { kind: 'described', noteId: item.noteId, title: text(item.title) };
            schedule();
            if (typeof options.onChanged === 'function') options.onChanged();
          }).catch(function (problem) {
            if (describeDialog !== opened || typeof options.isCurrent === 'function' && !instance.alive()) return;
            setBusy(false);
            fail(problem && problem.forUser ? problem.message : 'Nie udało się zapisać opisu: ' + (problem && problem.message ? problem.message : problem));
          });
        }
        watchDetails();
        shell.show(anchor || doc.activeElement);
        if (typeof area.focus === 'function') area.focus({ preventScroll: true });
      }
      function drawNotice() {
        var notice = state.notice;
        if (!notice) return;
        var box = add(section, 'div', 'vilda-lab-hist-notice is-' + notice.kind);
        box.setAttribute('role', 'status');
        box.setAttribute('data-note-id', notice.noteId || '');
        var name = notice.title ? ' „' + notice.title + '”' : '';
        var message = {
          described: 'Opis zapisany — oczekujący wynik' + name + ' oznaczony jako wykonany.',
          'clcr-resource-error': notice.text,
          'details-resource-error': notice.text
        }[notice.kind];
        add(box, 'span', 'vilda-lab-hist-notice-text', message);
        if (notice.kind === 'clcr-resource-error' && notice.record) button(box, 'vilda-lab-hist-link', 'Spróbuj ponownie', function () { state.notice = null; draw(); openClcrResult(notice.record); });
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
      function canLoad() { return typeof options.loadPatient === 'function'; }
      // Przejście do przelicznika. Pacjent tej karty wczytany do formularza: od razu (jak dotąd). Inny albo
      // żaden: wczytanie drogą karty, a przelicznik otwiera się po nim. Stan sprawdzany także przy kliknięciu
      // (poza powłoką; w jej ramce odnośniki <a> obsługuje vilda_chrome.js, dlatego akcje pacjenta
      // niewczytanego są przyciskami).
      function goConverter(event, href) {
        if (isLoadedPatient()) { openConverter(event, href); return; }
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (canLoad()) options.loadPatient({ href: href || null });
      }

      var remindersButton = null;
      function paintReminders() {
        if (!remindersButton) return;
        remindersButton.hidden = !(state.reminders.length && typeof options.openReminders === 'function');
      }

      function draw() {
        if (!state.data) return;
        resetViewportReserve();
        var view = state.data.view;
        clear(section);
        remindersButton = null; viewButtons = []; joinLabel = null; joinInput = null;
        drawHeader(view);
        drawNotice();
        var renal = view.clcr && view.clcr.measurements.length;
        if (!view.panels.length && !view.pending.length && !renal) {
          var empty = add(section, 'div', 'vilda-lab-hist-state vilda-lab-hist-empty');
          add(empty, 'p', '', 'Brak zapisanych wyników badań.');
          add(empty, 'p', 'vilda-lab-hist-muted', isLoadedPatient() ? ENTRY.emptyLoaded : canLoad() ? ENTRY.emptyLoad : ENTRY.hint);
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
        resetViewportReserve();
        if (!resultsHost || !state.data) return;
        if (win && win.VildaLabResultChart) {
          if (win.VildaLabResultChart.hidePreview) win.VildaLabResultChart.hidePreview(doc);
          if (win.VildaLabResultChart.clearSelection) win.VildaLabResultChart.clearSelection(doc);
        }
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
        var loaded = isLoadedPatient();
        // LAB-PAKIETY PR1 (decyzja właściciela 2026-11-12): skrót do pakietu badań w przeliczniku. Pakiet
        // opisuje vilda_lab_packages.js; zakładka zna tylko adres i nazwę skrótu. Pakiet zapisuje
        // wyniki pacjentowi wczytanemu do formularza, więc skrót stoi tylko w jego karcie — z karty innej
        // osoby wyniki trafiłyby do niewłaściwego pacjenta.
        if (loaded) {
          var pack = add(actions, 'a', 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost vilda-lab-hist-package', PACKAGE_SHORTCUT.label);
          pack.setAttribute('href', PACKAGE_SHORTCUT.href);
          pack.addEventListener('click', function (event) { goConverter(event, PACKAGE_SHORTCUT.href); });
        }
        // P-BADANIA-WEJSCIE: jedna akcja dodania wyników. Ręcznego „+ Dodaj wynik” (wpis bez oceny) już nie ma.
        if (loaded) {
          var link = add(actions, 'a', 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-primary vilda-lab-hist-check', ENTRY.loaded);
          link.setAttribute('href', ENTRY.href);
          link.addEventListener('click', function (event) { goConverter(event); });
        } else if (canLoad()) {
          button(actions, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-primary vilda-lab-hist-check vilda-lab-hist-load', ENTRY.load, function (event) { goConverter(event); });
        } else {
          add(actions, 'p', 'vilda-lab-hist-muted vilda-lab-hist-entry-hint', ENTRY.hint);
        }
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

      function openClcrResult(record, anchor) {
        closeLabDetails(false);
        var request = ++detailsRequest;
        if (!instance.alive() || (record.patientId && record.patientId !== patientId) || (typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) return;
        var gen = state.gen;
        function open() {
          if (!current(gen) || request !== detailsRequest || detailsHidden() || (typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) return;
          var details = win && win.ClcrResultDetails;
          var callback = typeof options.openClcrResult === 'function' ? options.openClcrResult
            : details && typeof details.open === 'function' ? details.open.bind(details) : null;
          if (!callback) throw new Error('Szczegóły zapisanych obliczeń są niedostępne.');
          if (state.notice && state.notice.kind === 'clcr-resource-error') { state.notice = null; draw(); }
          watchDetails();
          return Promise.resolve(callback({ patientId: patientId, noteId: record.noteId, record: record, vault: vault, anchor: anchor, context: section, onDialog: options.onDialog, isCurrent: function () { return instance.alive() && !detailsHidden(); }, onChanged: function () {
            if (!instance.alive()) return;
            schedule();
            if (typeof options.onChanged === 'function') options.onChanged();
          } })).then(function (controller) {
            if (!current(gen) || request !== detailsRequest || detailsHidden()) { if (controller && controller.destroy) controller.destroy({ restoreFocus: false }); return; }
            clcrDetails = controller || null;
          });
        }
        // Wstrzyknięty callback pozostaje synchroniczny; produkcyjna ścieżka
        // dociąga silniki dopiero przy otwieraniu szczegółów/edycji.
        if (typeof options.openClcrResult === 'function') { open(); return; }
        ensureRecordResources(options, doc, true).then(open).catch(function (error) {
          if (!current(gen) || request !== detailsRequest || detailsHidden()) return;
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
        // P-OCZEKUJACE-WYNIKI: dwie akcje przy każdym wpisie. Ta sama reguła wejścia do przelicznika co w nagłówku
        // (P-BADANIA-WEJSCIE): pacjent wczytany — odnośnik; niewczytany — przycisk, który najpierw go wczytuje;
        // bez drogi wczytania zostaje sam opis. Ręcznego wpisu wartości bez oceny już tu nie ma.
        var loaded = isLoadedPatient(), enter = loaded || canLoad(), describe = canDescribe();
        view.pending.forEach(function (item) {
          var row = add(box, 'div', 'vilda-lab-hist-pending-row');
          row.setAttribute('data-note-id', item.noteId || '');
          add(row, 'span', 'vilda-lab-hist-tag', 'oczekuje na wynik');
          var label = add(row, 'span', 'vilda-lab-hist-pending-title', item.title || 'Zlecone badanie');
          if (item.dueDateISO) add(label, 'span', 'vilda-lab-hist-muted', ' · termin ' + formatDate(item.dueDateISO));
          if (!enter && !describe) return;
          var actions = add(row, 'span', 'vilda-lab-hist-pending-actions');
          var href = pendingHref(item);
          if (loaded) {
            var link = add(actions, 'a', 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost vilda-lab-hist-pending-enter', PENDING.enter);
            link.setAttribute('href', href);
            link.addEventListener('click', function (event) { goConverter(event, href); });
          } else if (canLoad()) {
            button(actions, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost vilda-lab-hist-pending-enter vilda-lab-hist-pending-load', PENDING.load,
              function (event) { goConverter(event, href); });
          }
          if (describe) {
            button(actions, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost vilda-lab-hist-pending-describe', PENDING.describe,
              function (event) { describePending(item, event && event.currentTarget); });
          }
        });
        if (enter) add(box, 'p', 'vilda-lab-hist-muted vilda-lab-hist-pending-help', PENDING.help);
        else if (describe) add(box, 'p', 'vilda-lab-hist-muted vilda-lab-hist-pending-help', PENDING.helpDescribeOnly);
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
      // Full details live outside the chart flow. Selecting a touch point is
      // handled by the renderer and only changes a stable header action target.
      function detailsHidden() {
        if (!instance.alive() || section.isConnected === false || (typeof vault.isUnlocked === 'function' && !vault.isUnlocked())) return true;
        for (var element = section; element && element.nodeType !== 9; element = element.parentNode) {
          if (element.hidden || element.inert || (element.getAttribute && element.getAttribute('aria-hidden') === 'true')
              || (element.classList && element.classList.contains('vb22-private-content'))) return true;
          if (win && typeof win.getComputedStyle === 'function' && element.nodeType === 1) {
            var style = win.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || (style.filter && style.filter.indexOf('blur(') !== -1)) return true;
          }
        }
        return false;
      }
      function watchDetails() {
        if (detailsObserver || !win || typeof win.MutationObserver !== 'function') return;
        detailsObserver = new win.MutationObserver(function () { if (detailsHidden()) closeAllDetails(false); });
        detailsObserver.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true,
          attributeFilter: ['hidden', 'inert', 'aria-hidden', 'class', 'style'] });
      }
      function closeLabDetails(restoreFocus) {
        var previous = labDetails;
        labDetails = null; state.selected = null;
        if (previous) { previous.shell.destroy({ restoreFocus: restoreFocus !== false }); if (previous.releasePresentation) previous.releasePresentation(); if (previous.host.parentNode) previous.host.parentNode.removeChild(previous.host); }
      }
      function closeAllDetails(restoreFocus) {
        detailsRequest++;
        if (detailsObserver) { detailsObserver.disconnect(); detailsObserver = null; }
        closeDescribe(restoreFocus);
        closeLabDetails(restoreFocus);
        if (clcrDetails && clcrDetails.destroy) clcrDetails.destroy({ restoreFocus: restoreFocus !== false });
        clcrDetails = null;
        if (win && win.ClcrResultDetails && typeof win.ClcrResultDetails.close === 'function') win.ClcrResultDetails.close({ patientId: patientId, restoreFocus: restoreFocus !== false });
        if (win && win.VildaLabResultChart) {
          if (win.VildaLabResultChart.hidePreview) win.VildaLabResultChart.hidePreview(doc);
          if (win.VildaLabResultChart.clearSelection) win.VildaLabResultChart.clearSelection(doc);
        }
      }
      function ensureLabDetails() {
        if (labDetails) return labDetails;
        var helper = win && win.VildaResultDetailsDialog;
        if (!helper || typeof helper.attach !== 'function') {
          state.notice = { kind: 'details-resource-error', text: 'Nie udało się wczytać szczegółów wyniku. Odśwież stronę.' }; draw(); return null;
        }
        var overlay = node('div', 'vilda-result-details-host');
        var dialog = add(overlay, 'dialog', 'vilda-lab-hist');
        dialog.setAttribute('id', 'labResultDetailsDialog');
        dialog.setAttribute('aria-labelledby', 'labResultDetailsTitle');
        var layout = add(dialog, 'div', 'vilda-result-details-layout vilda-lab-hist-result-details');
        var heading = add(layout, 'header', 'vilda-result-details-heading');
        var titles = add(heading, 'div', 'vilda-result-details-titles');
        var kicker = add(titles, 'p', 'vilda-lab-hist-muted', 'Wyniki lab.');
        var title = add(titles, 'h2', '', 'Szczegóły wyniku'); title.setAttribute('id', 'labResultDetailsTitle');
        var close = button(heading, 'vilda-lab-hist-details-close', '×', closeResult);
        close.setAttribute('aria-label', 'Zamknij szczegóły wyniku');
        var body = add(layout, 'div', 'vilda-result-details-body');
        var actions = add(layout, 'footer', 'vilda-result-details-actions vilda-lab-hist-detail-actions');
        doc.body.appendChild(overlay);
        var presentationCleanup = typeof options.onDialog === 'function' ? options.onDialog(dialog) : null;
        function releasePresentation() { var cleanup = presentationCleanup; presentationCleanup = null; if (typeof cleanup === 'function') cleanup(); }
        var shell = helper.attach(dialog, { context: section, onClose: function () {
          releasePresentation();
          if (labDetails && labDetails.host === overlay) { labDetails = null; state.selected = null; }
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        } });
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeResult(); });
        labDetails = { host: overlay, dialog: dialog, shell: shell, body: body, actions: actions, layout: layout, title: title, kicker: kicker, close: close, anchor: null, releasePresentation: releasePresentation };
        return labDetails;
      }
      function selectResult(entry, view, anchor) {
        if (!entry || detailsHidden()) return;
        if (entry.clcrRecord) { openClcrResult(entry.clcrRecord, anchor); return; }
        var modal = ensureLabDetails();
        if (!modal) return;
        detailsRequest++;
        if (clcrDetails && clcrDetails.destroy) clcrDetails.destroy({ restoreFocus: false });
        clcrDetails = null;
        if (win && win.ClcrResultDetails && typeof win.ClcrResultDetails.close === 'function') win.ClcrResultDetails.close({ patientId: patientId, restoreFocus: false });
        state.selected = { noteId: entry.noteId, key: view.key };
        modal.title.textContent = seriesLabel(view); modal.kicker.textContent = 'Wyniki lab.';
        clear(modal.body); clear(modal.actions); modal.actions.hidden = false; drawSelectedResult(modal.body);
        if (!state.selected) { closeLabDetails(false); return; }
        if (win && win.VildaLabResultChart && win.VildaLabResultChart.hidePreview) win.VildaLabResultChart.hidePreview(doc);
        watchDetails();
        if (!modal.dialog.open) { modal.anchor = anchor || doc.activeElement; modal.shell.show(modal.anchor); }
        else if (typeof modal.close.focus === 'function') modal.close.focus({ preventScroll: true });
      }
      function openResultGroup(entries, view, anchor) {
        if (!entries || !entries.length || detailsHidden()) return;
        if (entries.length === 1) { selectResult(entries[0], view, anchor); return; }
        var modal = ensureLabDetails();
        if (!modal) return;
        detailsRequest++;
        if (clcrDetails && clcrDetails.destroy) clcrDetails.destroy({ restoreFocus: false });
        clcrDetails = null; state.selected = null;
        if (win && win.ClcrResultDetails && typeof win.ClcrResultDetails.close === 'function') win.ClcrResultDetails.close({ patientId: patientId, restoreFocus: false });
        modal.title.textContent = 'Wybierz zapis'; modal.kicker.textContent = seriesLabel(view);
        clear(modal.body); clear(modal.actions); modal.actions.hidden = true;
        var chooser = add(modal.body, 'div', 'vilda-lab-result-chart-chooser');
        chooser.setAttribute('role', 'group'); chooser.setAttribute('aria-label', 'Wybierz wynik z tego punktu');
        add(chooser, 'p', 'vilda-lab-result-chart-chooser-title', 'Wyniki z ' + resultDate(entries[0]));
        entries.forEach(function (entry) {
          var choice = button(chooser, 'vilda-lab-result-chart-choice', '', function () {
            if (entry.clcrRecord) { var from = modal.anchor; closeLabDetails(false); openClcrResult(entry.clcrRecord, from); }
            else selectResult(entry, view, modal.anchor);
          });
          choice.setAttribute('data-note-id', entry.noteId || '');
          var info = describeResult(entry); choice.setAttribute('data-tone', info.tone);
          add(choice, 'span', '', resultDate(entry));
          drawValue(choice, entry, view, info, 'vilda-lab-hist-cell-value');
          drawNorms(choice, info, 'vilda-lab-hist-result-norm');
          drawResultNotice(choice, info);
          var comment = commentText(entry.comment); if (comment) add(choice, 'span', 'vilda-lab-hist-muted', comment);
        });
        modal.anchor = anchor || doc.activeElement;
        if (win && win.VildaLabResultChart && win.VildaLabResultChart.hidePreview) win.VildaLabResultChart.hidePreview(doc);
        watchDetails(); modal.shell.show(modal.anchor);
      }
      function closeResult() { closeLabDetails(true); }
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
        var box = parent;
        var region = labDetails.layout;
        region.setAttribute('data-note-id', found.noteId || '');
        region.setAttribute('role', 'region');
        region.setAttribute('aria-label', 'Szczegóły wyniku ' + seriesLabel(view));
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
          var actions = labDetails.actions;
          if (canEdit) button(actions, 'vilda-lab-hist-link vilda-lab-hist-edit-result', 'Edytuj wpis', function () {
            closeLabDetails(false); openNote(found.noteId);
          });
          if (canDelete) button(actions, 'vilda-lab-hist-link vilda-lab-hist-delete-result', 'Usuń wpis', function () {
            var from = labDetails && labDetails.anchor; closeLabDetails(false);
            removeNote(found.noteId, function () { if (instance.alive()) selectResult(found, view, from); });
          });
        }
        button(labDetails.actions, 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost', 'Zamknij', closeResult);
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
        var selectedEntries = shown ? [shown] : [];
        var detailsButton = button(head, 'vilda-lab-hist-chart-details', 'Szczegóły →', function () { openResultGroup(selectedEntries, view, detailsButton); });
        detailsButton.disabled = !shown;
        if (shown) detailsButton.setAttribute('data-note-id', shown.noteId || '');
        detailsButton.setAttribute('aria-label', 'Szczegóły wyniku ' + seriesLabel(view));
        function pointSelected(entries) {
          selectedEntries = entries;
          detailsButton.disabled = !entries.length;
          detailsButton.setAttribute('data-note-id', entries[0] && entries[0].noteId || '');
          detailsButton.setAttribute('data-count', entries.length > 1 ? String(entries.length) : '');
          detailsButton.setAttribute('aria-label', 'Szczegóły ' + (entries.length > 1 ? entries.length + ' zapisów: ' : 'wyniku ') + seriesLabel(view));
        }
        if (shown) {
          var info = describeResult(shown);
          var latest = button(card, 'vilda-lab-hist-latest', '', function () { selectResult(shown, view, latest); });
          latest.setAttribute('data-note-id', shown.noteId || '');
          latest.setAttribute('aria-label', 'Szczegóły wyniku ' + seriesLabel(view) + ' ' + shown.display);
          drawValue(latest, shown, view, info, 'vilda-lab-hist-value');
          add(latest, 'span', 'vilda-lab-hist-date', resultDate(shown));
          var norms = add(card, 'div', 'vilda-lab-hist-card-norms');
          add(norms, 'span', 'vilda-lab-hist-muted', 'Norma: ');
          drawNorms(norms, info, 'vilda-lab-hist-result-norm');
          drawResultNotice(card, info);
        }
        drawChart(add(card, 'div', 'vilda-lab-hist-card-chart'), view, pointSelected);
        // P-BADANIA-WEJSCIE: ta sama reguła co w nagłówku. Pacjent wczytany: odnośnik do przelicznika z badaniem
        // (jak dotąd). Niewczytany: przycisk, który najpierw go wczytuje i mówi to w nazwie; bez drogi wczytania
        // akcji nie ma. Przycisk, nie <a>: w ramce powłoki kliknięcie odnośnika do strony aplikacji przechwytuje
        // vilda_chrome.js (faza capture) i od razu przełącza trasę — wczytanie by się nie odbyło.
        var cardLoaded = isLoadedPatient();
        if (view.testKey && (cardLoaded || canLoad())) {
          var href = 'przelicznik-jednostek.html?badanie=' + encodeURIComponent(view.testKey);
          if (cardLoaded) {
            var check = add(card, 'a', 'vilda-lab-hist-card-check', 'Nowy wynik ' + seriesLabel(view) + ' →');
            check.setAttribute('href', href);
            check.addEventListener('click', function (event) { goConverter(event, href); });
          } else {
            button(card, 'vilda-lab-hist-link vilda-lab-hist-card-check vilda-lab-hist-card-load', 'Wczytaj i dodaj ' + seriesLabel(view) + ' →',
              function (event) { goConverter(event, href); });
          }
        }
      }
      function drawChart(box, view, pointSelected) {
        var host = add(box, 'div', 'vilda-lab-hist-chart');
        var renderer = win && win.VildaLabResultChart;
        if (!renderer || typeof renderer.render !== 'function') {
          add(host, 'p', 'vilda-lab-hist-muted', 'Wykres niedostępny — odśwież stronę.');
          return;
        }
        var chart = renderer.render(doc, view, {
          describe: describeResult,
          selectEntries: pointSelected,
          openEntries: function (entries, anchor) { openResultGroup(entries, view, anchor); },
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
            var link = button(records, 'vilda-lab-result-chart-record', '', function () { selectResult(entry, view, link); });
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
            var row = button(box, 'vilda-lab-hist-result-row vilda-lab-hist-cell', '', function () { selectResult(entry, view, row); });
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
          closeAllDetails(false);
          resetViewportReserve();
          state.destroyed = true;
          state.gen++;
          if (state.timer && win) win.clearTimeout(state.timer);
          if (typeof doc.removeEventListener === 'function') doc.removeEventListener('vilda:clcr-results-changed', resultChanged);
          instances = instances.filter(function (other) { return other !== instance; });
          clear(host);
        }
      };
    }

    return Object.freeze({ version: '2.7.0', render: render, ensureReaderDependencies: ensureReaderDependencies, _internal: Object.freeze({ plural: plural, commentText: commentText, shortLabel: shortLabel, mergedNote: mergedNote }) });
  }

  return createApi();
});
