/* Pakiety badań laboratoryjnych w przeliczniku jednostek (LAB-PAKIETY PR1, decyzje właściciela 2026-11-12).
 *
 * Pakiet to nazwana lista badań z katalogu przelicznika (LabUnitsData), wpisywanych razem z jednego wydruku:
 * wartości i jednostki trafiają zbiorczo do Badań w karcie pacjenta. MVP: pakiet „Tarczyca” (TSH, fT4, fT3).
 * Pakiet jest trybem pracy strony „Jednostki lab.” („Pojedyncze badanie | Pakiet badań”), dostępnym wyłącznie
 * dla zalogowanego użytkownika z wybranym pacjentem.
 *
 * Plik ma trzy rozdzielone części (jeden plik, bo budżet instalacji PWA liczy żądania — sw-precache-stron):
 *   1. DANE  (VildaLabPackagesData) — które badania tworzą pakiet. Bez norm, jednostek i współczynników:
 *      te zostają w lab_units_data.js (AGENTS.md § 3: normy zawsze jako dane).
 *   2. MODEL (VildaLabPackages) — czyste funkcje. Model niczego nie liczy po swojemu: wiersz ocenia
 *      LabUnitConverter.evaluate dla tego samego pacjenta co pojedyncze badanie, zakres dobiera
 *      LabUnitConverter.selectRange, a zapisywany zrzut normy buduje VildaLabRangeSnapshot.create — tak samo
 *      jak captureLabRange w przelicznik-jednostek.html. Notatka wyniku ma dokładnie postać zapisu „Przypnij
 *      do wizyty” (lab_pin_result.js): ten sam tytuł, treść, kategoria „wynik-badania” i pola labResult, więc
 *      zakładka „Badania”, historia i wykresy czytają wynik z pakietu jak każdy inny.
 *   3. WIDOK (VildaLabPackagesUI) — karta pakietu na stronie. Ocena na ekranie pochodzi ze zrzutu, który
 *      zapisze się z wynikiem; pacjenta do norm podaje strona (VildaLabConverterRuntime.getPackagePatient —
 *      dane z karty, bez lokalnych nadpisań przelicznika). Zapis: jedna notatka na wypełnione pole, po kolei,
 *      z jedną datą pobrania i jednym komentarzem. Wartości wpisane dla jednego pacjenta nie przechodzą na
 *      innego: zmiana pacjenta, wylogowanie i „Wyczyść” opróżniają pola. Bez logowania i bez pacjenta karta
 *      pokazuje tylko wyjaśnienie i przycisk, bez pól. Geometria paska oceny stoi w atrybutach SVG, kolory
 *      w klasach (sekcja „Pakiet badań” w inline_przelicznik_jednostek_00.css); skrypt nie ustawia stylów.
 *
 * Jednostki wybrane ostatnio na tym urządzeniu pamięta preferencja labPackageSettings (VildaPersistence,
 * klasa local-persistent): to wygoda formularza, nie dane pacjenta.
 *
 * Opis: docs/clinical/ALGORITHMS.md, „LAB-PAKIETY PR1”.
 */
(function (root) {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  //  1. DANE — pakiety. slug: nazwa pakietu w adresie (?pakiet=tarczyca); id: stały klucz pakietu.
  //  Kolejność badań jest kolejnością pól formularza i zapisu.
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  var DATA = Object.freeze({
    version: '1.0.0',
    packages: Object.freeze([
      Object.freeze({ id: 'thyroid', slug: 'tarczyca', label: 'Tarczyca', analytes: Object.freeze(['tsh', 'ft4', 'ft3']) })
    ])
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  //  2. MODEL — ocena wierszy, zrzut normy, notatka wyniku, zapamiętane jednostki.
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  var MODEL = (function () {
    var SETTINGS_KEY = 'labPackageSettings';
    var CATEGORY = 'wynik-badania';
    var COMMENT_MAX = 300;
    var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    // Brzmienie oceny jak w wyniku pojedynczego badania (classifyResultState w przelicznik-jednostek.html).
    var STATES = {
      within: { state: 'is-normal', text: 'w zakresie normy' },
      below: { state: 'is-below', text: 'poniżej normy' },
      above: { state: 'is-above', text: 'powyżej normy' },
      far_below: { state: 'is-uwaga-low', text: 'znacznie poniżej normy' },
      far_above: { state: 'is-uwaga-high', text: 'znacznie powyżej normy' }
    };
    var GENERAL_TEXT = 'zakres ogólny — bez oceny dla dziecka';
    // Znacznik na pasku: dolna granica zakresu w 30%, górna w 70% szerokości (jak pasek wyniku w makiecie).
    var BAR_LOW = 0.3, BAR_HIGH = 0.7, BAR_MIN = 0.03, BAR_MAX = 0.97;

    function own(value, key) { return value != null && Object.prototype.hasOwnProperty.call(value, key); }
    function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function text(value) { return typeof value === 'string' ? value.trim() : ''; }
    function shortLabel(label) { return String(label || '').split('(')[0].trim() || String(label || ''); }

    function findPackage(data, key) {
      var wanted = text(String(key == null ? '' : key)).toLowerCase();
      var list = data && Array.isArray(data.packages) ? data.packages : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && (String(list[i].id).toLowerCase() === wanted || String(list[i].slug).toLowerCase() === wanted)) return list[i];
      }
      return null;
    }

    function unitOf(substance, symbol) {
      var units = substance && Array.isArray(substance.units) ? substance.units : [];
      for (var i = 0; i < units.length; i++) if (units[i] && units[i].symbol === symbol) return units[i];
      return null;
    }

    // Wiersze formularza: badania pakietu obecne w katalogu przelicznika, z jego jednostkami.
    function describeAnalytes(pkg, converter) {
      var rows = [];
      var ids = pkg && Array.isArray(pkg.analytes) ? pkg.analytes : [];
      ids.forEach(function (id) {
        var substance = converter && typeof converter.find === 'function' ? converter.find(id) : null;
        if (!substance || !Array.isArray(substance.units) || !substance.units.length) return;
        rows.push({
          id: substance.id, label: substance.label_pl, short: shortLabel(substance.label_pl),
          canonicalUnit: substance.canonical_si, precision: substance.precision || 3,
          units: substance.units.map(function (unit) { return { symbol: unit.symbol, label: unit.label || unit.symbol }; })
        });
      });
      return rows;
    }

    // Jednostka pola: zapamiętana, jeśli badanie ją ma; inaczej jednostka SI katalogu.
    function pickUnit(row, preferred) {
      var symbols = row && Array.isArray(row.units) ? row.units.map(function (unit) { return unit.symbol; }) : [];
      if (preferred && symbols.indexOf(preferred) !== -1) return preferred;
      if (row && symbols.indexOf(row.canonicalUnit) !== -1) return row.canonicalUnit;
      return symbols[0] || '';
    }

    // ── Ustawienia urządzenia: ostatnio wybrane jednostki ──
    function normalizeSettings(value) {
      var out = { schemaVersion: 1, units: {} };
      if (!record(value) || value.schemaVersion !== 1 || !record(value.units)) return out;
      Object.keys(value.units).forEach(function (key) {
        var unit = value.units[key];
        if (/^[a-z0-9_]{1,40}$/.test(key) && typeof unit === 'string' && unit && unit.length <= 40) out.units[key] = unit;
      });
      return out;
    }
    function registered(persistence) {
      var meta = persistence && persistence.MODULE_KEY_META && persistence.MODULE_KEY_META[SETTINGS_KEY];
      return !!(meta && meta.kind === 'preference' && meta.storage === 'local-persistent');
    }
    function readSettings(persistence) {
      if (!registered(persistence) || typeof persistence.readPreferenceJSON !== 'function') return normalizeSettings(null);
      try { return normalizeSettings(persistence.readPreferenceJSON(SETTINGS_KEY, null)); }
      catch (_) { return normalizeSettings(null); }
    }
    function rememberUnits(persistence, units) {
      if (!registered(persistence) || typeof persistence.writePreferenceJSON !== 'function') return false;
      var settings = readSettings(persistence);
      var next = normalizeSettings({ schemaVersion: 1, units: Object.assign({}, settings.units, record(units) ? units : {}) });
      try { return persistence.writePreferenceJSON(SETTINGS_KEY, next) === true; }
      catch (_) { return false; }
    }

    // Zrzut normy jak captureLabRange w przeliczniku: ten sam wybór zakresu, wiersz „when”, źródła i wersje.
    function captureRange(options, substance, evaluation, raw) {
      var converter = options.converter, snapshot = options.snapshot, patient = options.patient || {};
      if (!snapshot || typeof snapshot.create !== 'function' || typeof converter.selectRange !== 'function') return undefined;
      var range = converter.selectRange(substance, patient);
      if (!range) return undefined;
      var unitDef = unitOf(substance, evaluation.unit), row = null;
      (substance.reference_ranges_si || []).forEach(function (item) { if (range.id && item.id === range.id) row = item; });
      var data = options.data;
      var envelope = snapshot.normalize(snapshot.create({
        analyte: substance.id, evaluation: evaluation, range: range, when: row ? row.when : null, patient: patient,
        factorToSi: unitDef ? unitDef.factor_to_si : null,
        measurement: { raw: raw, sourceUnit: evaluation.unit },
        sources: (range.source_ids || []).map(function (id) {
          var source = typeof converter.findSource === 'function' && converter.findSource(id) || {};
          return { id: id, label: source.label_short || null, citation: source.full_cite || null, url: source.url || null };
        }),
        versions: { engine: 'LabUnitConverter ' + converter.version, data: 'LabUnitsData ' + (data && data.version || '') },
        // Koperta bez chwili zapisu nie przechodzi normalizacji — domyślnie teraz.
          capturedAtISO: options.capturedAtISO || new Date().toISOString()
      }));
      // Bez pomiaru w zrzucie (rozjazd wejścia, brak granic) wynik zapisuje się bez normy — jak przy przypięciu.
      return envelope && envelope.measurement ? envelope : undefined;
    }

    function markerPosition(value, low, high) {
      if (!finite(value) || !finite(low) || !finite(high) || !(high > low)) return null;
      var position = BAR_LOW + (value - low) / (high - low) * (BAR_HIGH - BAR_LOW);
      return Math.min(BAR_MAX, Math.max(BAR_MIN, position));
    }

    // Opis oceny dla formularza: tekst i kategoria pochodzą z tego samego zrzutu, który trafi do zapisu.
    function describeAssessment(row, options) {
      var converter = options.converter, snapshot = options.snapshot;
      var view = { state: '', text: 'brak zakresu referencyjnego w aplikacji', bounds: '', population: '', subject: '', sources: [], marker: null, general: false };
      if (!own(row, 'range') || !snapshot || typeof snapshot.describe !== 'function') return view;
      var format = function (n) { return converter.formatNumber(n, row.precision); };
      var info = snapshot.describe(row.range, { formatNumber: format });
      if (!info) return view;
      view.bounds = info.bounds;
      view.population = info.population;
      view.subject = info.subject;
      view.sources = info.sources;
      if (info.status === 'general') {
        view.general = true;
        view.text = GENERAL_TEXT;
        return view;
      }
      if (info.classification && STATES[info.classification]) {
        view.state = STATES[info.classification].state;
        view.text = STATES[info.classification].text;
        var display = row.range.display;
        view.marker = display ? markerPosition(row.valueNum, display.low, display.high) : null;
        return view;
      }
      view.text = 'bez oceny względem zakresu';
      return view;
    }

    /* Ocena jednego wiersza pakietu.
     * options: { converter, snapshot, data, analyteId, raw, unit, patient, capturedAtISO }
     * status: 'empty' (puste pole — wiersz pomijany), 'invalid' (error), 'ok'. */
    function evaluateRow(options) {
      options = options || {};
      var converter = options.converter, id = options.analyteId;
      var raw = text(options.raw);
      var row = { status: 'empty', analyteId: id, raw: raw, unit: options.unit || '' };
      if (!raw) return row;
      row.status = 'invalid';
      var substance = converter && typeof converter.find === 'function' ? converter.find(id) : null;
      if (!substance) { row.error = 'Badanie nie jest dostępne w przeliczniku.'; return row; }
      row.test = substance.label_pl;
      row.short = shortLabel(substance.label_pl);
      var evaluation = converter.evaluate(id, { value: raw, unit: options.unit, patient: options.patient || {} });
      if (!evaluation || evaluation.ok !== true) { row.error = evaluation && evaluation.error || 'Nie udało się ocenić wyniku.'; return row; }
      var unitDef = unitOf(substance, evaluation.unit), target = unitOf(substance, substance.canonical_si);
      var precision = substance.precision || 3;
      row.status = 'ok';
      row.unit = evaluation.unit;
      row.unitLabel = unitDef && unitDef.label || evaluation.unit;
      row.precision = precision;
      row.valueNum = evaluation.value;
      // Wynik w jednostce SI katalogu — jak domyślna jednostka docelowa pojedynczego badania.
      row.converted = converter.formatNumber(target && target.factor_to_si ? evaluation.siValue / target.factor_to_si : evaluation.siValue, precision)
        + ' ' + substance.canonical_si;
      row.shown = converter.formatNumber(evaluation.value, precision);
      var range = captureRange(options, substance, evaluation, raw);
      if (range !== undefined) {
        row.range = range;
        // Liczba jak w przeliczniku („1 000” = 1000) — to samo pole co przy przypięciu pojedynczego wyniku.
        row.valueNum = range.measurement.sourceValue;
      }
      row.view = describeAssessment(row, options);
      return row;
    }

    function evaluatePackage(options, inputs) {
      return (Array.isArray(inputs) ? inputs : []).map(function (input) {
        return evaluateRow(Object.assign({}, options, { analyteId: input.analyteId, raw: input.raw, unit: input.unit }));
      });
    }

    function validDate(dateISO, todayISO) {
      if (typeof dateISO !== 'string' || !ISO_DATE.test(dateISO)) return 'Podaj datę pobrania.';
      var parts = dateISO.split('-').map(Number), date = new Date(parts[0], parts[1] - 1, parts[2]);
      if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return 'Podaj prawidłową datę pobrania.';
      if (typeof todayISO === 'string' && ISO_DATE.test(todayISO) && dateISO > todayISO) return 'Data pobrania nie może być późniejsza niż dziś.';
      return '';
    }

    // Wiek wizyty w miesiącach z danych sesji — ta sama kotwica co przy przypięciu (lab_pin_result.js).
    function linkedAgeMonths(patient) {
      if (!patient) return null;
      var months = 0;
      if (patient.age != null && isFinite(patient.age)) months += parseInt(patient.age, 10) * 12;
      if (patient.ageMonths != null && isFinite(patient.ageMonths)) months += parseInt(patient.ageMonths, 10);
      return months > 0 ? months : null;
    }
    function formatVisitAge(months) {
      if (!months) return '';
      var years = Math.floor(months / 12), rest = months % 12;
      return years + ' l' + (rest ? ' ' + rest + ' m' : '');
    }
    function localISO(date) {
      var pad = function (value) { return (value < 10 ? '0' : '') + value; };
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }
    function formatDate(dateISO) {
      return typeof dateISO === 'string' && ISO_DATE.test(dateISO) ? dateISO.slice(8, 10) + '.' + dateISO.slice(5, 7) + '.' + dateISO.slice(0, 4) : '';
    }

    /* Notatka wyniku w postaci zapisu „Przypnij do wizyty”.
     * options: { row (status 'ok'), patientId, dateISO, comment, linkedAgeMonths, snapshot } */
    function buildNote(options) {
      var row = options.row;
      var comment = text(options.comment).slice(0, COMMENT_MAX);
      var entered = row.raw + ' ' + row.unitLabel;
      var lab = { test: row.test, value: entered + ' = ' + row.converted };
      lab.testKey = row.analyteId;
      if (row.valueNum != null) lab.valueNum = row.valueNum;
      lab.unit = row.unit;
      if (own(row, 'range') && options.snapshot && typeof options.snapshot.normalize === 'function') lab.range = options.snapshot.normalize(row.range);
      var note = {
        patientId: options.patientId,
        title: row.test + ': ' + entered,
        body: '= ' + row.converted + (comment ? '\n' + comment : ''),
        category: CATEGORY,
        clinicalDateISO: options.dateISO,
        labResult: lab
      };
      if (options.linkedAgeMonths) note.linkedAgeMonths = options.linkedAgeMonths;
      return note;
    }

    /* Plan zapisu pakietu: tylko wypełnione, poprawne wiersze; błąd w którymkolwiek wstrzymuje cały zapis.
     * Zwraca { ok, error, notes, rows }. */
    function planSave(options) {
      options = options || {};
      var rows = Array.isArray(options.rows) ? options.rows : [];
      var invalid = rows.filter(function (row) { return row.status === 'invalid'; });
      var filled = rows.filter(function (row) { return row.status === 'ok'; });
      if (!options.patientId) return { ok: false, error: 'Wybierz pacjenta, aby zapisać wyniki w jego karcie.', notes: [], rows: [] };
      if (invalid.length) {
        return { ok: false, error: 'Popraw wynik: ' + invalid.map(function (row) { return row.short || row.analyteId; }).join(', ') + '.', notes: [], rows: [] };
      }
      if (!filled.length) return { ok: false, error: 'Wpisz co najmniej jeden wynik.', notes: [], rows: [] };
      var dateError = validDate(options.dateISO, options.todayISO);
      if (dateError) return { ok: false, error: dateError, notes: [], rows: [] };
      return {
        ok: true, error: '', rows: filled,
        notes: filled.map(function (row) {
          return buildNote({ row: row, patientId: options.patientId, dateISO: options.dateISO, comment: options.comment,
            linkedAgeMonths: options.linkedAgeMonths, snapshot: options.snapshot });
        })
      };
    }

    // Polska odmiana: 1 wynik, 2–4 wyniki, 5+ wyników (12–14 wyników).
    function plural(n, forms) {
      if (n === 1) return forms[0];
      var tens = n % 100, ones = n % 10;
      return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? forms[1] : forms[2];
    }

    return Object.freeze({
      version: '1.0.0',
      SETTINGS_KEY: SETTINGS_KEY,
      CATEGORY: CATEGORY,
      COMMENT_MAX: COMMENT_MAX,
      findPackage: findPackage,
      describeAnalytes: describeAnalytes,
      pickUnit: pickUnit,
      normalizeSettings: normalizeSettings,
      readSettings: readSettings,
      rememberUnits: rememberUnits,
      evaluateRow: evaluateRow,
      evaluatePackage: evaluatePackage,
      validDate: validDate,
      linkedAgeMonths: linkedAgeMonths,
      formatVisitAge: formatVisitAge,
      localISO: localISO,
      formatDate: formatDate,
      buildNote: buildNote,
      planSave: planSave,
      plural: plural,
      shortLabel: shortLabel
    });
  })();

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  //  3. WIDOK — tryb pracy i karta pakietu na stronie „Jednostki lab.”.
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  var UI = (function (win) {
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var NBSP = '\u00a0';
    var PATIENT_KEY = 'vildaCurrentPatientId';
    var REFRESH_DELAY_MS = 120;
    var VAULT_WAIT_MS = 5000;
    var GATES = {
      locked: {
        title: 'Pakiety badań są dostępne po zalogowaniu',
        text: 'Pakiet zapisuje wyniki w karcie pacjenta, dlatego wymaga konta. Pojedyncze badanie przeliczysz i ocenisz jak dotąd, bez logowania.',
        action: 'Zaloguj się'
      },
      'no-patient': {
        title: 'Nie wybrano pacjenta',
        text: 'Pakiet zapisuje wyniki w karcie pacjenta i dobiera normy do jego wieku i płci. Wybierz pacjenta w Bazie pacjentów albo zapisz nowego na stronie głównej.',
        action: 'Wybierz pacjenta'
      },
      unavailable: {
        title: 'Pakiet badań jest chwilowo niedostępny',
        text: 'Nie udało się wczytać przelicznika — odśwież stronę.',
        action: ''
      }
    };
    var OTHER_DAY_NOTE = 'Normy dobrano do danych pacjenta widocznych teraz w przeliczniku. Badanie było w innym dniu — sprawdź, czy te przedziały pasują do wieku w dniu badania.';

    function create(w) {
      var doc = w.document;
      var state = { mode: 'single', pkg: null, rows: [], pid: null, gate: '', busy: false, built: false, formBuilt: false, done: null, error: '', remembered: false };
      var grid = null, card = null, singleBtn = null, packageBtn = null;
      var parts = { inputs: {}, units: {}, errors: {}, cards: {} };
      var timer = null;

      function model() { return MODEL; }
      function converter() { return w.LabUnitConverter || null; }
      function snapshot() { return w.VildaLabRangeSnapshot || null; }
      function byId(id) { return doc.getElementById(id); }
      function add(parent, tag, className, textContent) {
        var node = doc.createElement(tag);
        if (className) node.className = className;
        if (textContent != null) node.textContent = textContent;
        if (parent) parent.appendChild(node);
        return node;
      }
      function svg(parent, tag, attributes) {
        var node = doc.createElementNS(SVG_NS, tag);
        Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
        if (parent) parent.appendChild(node);
        return node;
      }
      function button(parent, className, label, onClick) {
        var node = add(parent, 'button', className, label);
        node.type = 'button';
        node.addEventListener('click', onClick);
        return node;
      }

      // ── Kontekst: konto, pacjent karty, pacjent do norm ──
      function patientId() {
        if (w._vildaCurrentPatientId) return String(w._vildaCurrentPatientId);
        try { return w.sessionStorage && w.sessionStorage.getItem(PATIENT_KEY) || null; } catch (_) { return null; }
      }
      function sessionPatient() {
        try { var session = w.VildaSession; return session && typeof session.getPatient === 'function' ? session.getPatient() : null; } catch (_) { return null; }
      }
      function loggedIn() {
        try { var session = w.VildaSession; return !!(session && typeof session.isLoggedIn === 'function' && session.isLoggedIn()); } catch (_) { return false; }
      }
      function packagePatient() {
        try {
          var runtime = w.VildaLabConverterRuntime;
          return runtime && typeof runtime.getPackagePatient === 'function' ? runtime.getPackagePatient() : null;
        } catch (_) { return null; }
      }
      function context() {
        var patient = sessionPatient();
        var name = patient && typeof patient.name === 'string' ? patient.name.trim() : '';
        var pid = patientId();
        var gate = !model() || !converter() || !snapshot() || !state.pkg || !state.rows.length ? 'unavailable'
          : !loggedIn() ? 'locked' : !(pid && name) ? 'no-patient' : '';
        return { gate: gate, pid: gate ? null : String(pid), name: name, sessionPatient: patient };
      }
      // Okno, w którym działa pasek aplikacji: ramka powłoki oddaje logowanie i listę pacjentów powłoce.
      function chromeWindow() {
        try {
          if (doc.documentElement.classList.contains('vilda-embedded') && w.parent && w.parent !== w && w.parent.document) return w.parent;
        } catch (_) { /* ramka z innego źródła */ }
        return w;
      }

      // ── Budowa karty ──
      function step(parent, number, label, hint) {
        var box = add(parent, 'div', 'lab-step lab-pkg-step');
        var num = add(box, 'div', 'lab-step-num', String(number));
        num.setAttribute('data-step', String(number));
        var body = add(box, 'div', 'lab-step-body');
        var title = add(body, 'div', 'lab-step-label', label);
        if (hint) add(title, 'span', 'lab-step-label-opt', hint);
        return { num: num, body: body };
      }
      function markStep(num, done, active) {
        num.classList.toggle('is-done', !!done);
        num.classList.toggle('is-active', !done && !!active);
        num.textContent = done ? '✓' : num.getAttribute('data-step');
      }

      function build() {
        if (state.built || !card) return;
        state.built = true;
        add(card, 'h1', 'lab-pkg-title', 'Pakiet badań');

        // Bramka: bez logowania albo bez pacjenta formularz nie powstaje (buildForm dopiero po jej przejściu).
        parts.gate = add(card, 'div', 'lab-pkg-gate');
        parts.gate.setAttribute('role', 'status');
        parts.gateTitle = add(parts.gate, 'strong', 'lab-pkg-gate-title');
        parts.gateText = add(parts.gate, 'p', 'lab-pkg-gate-text');
        parts.gateAction = button(parts.gate, 'lab-pkg-btn lab-pkg-btn-primary', '', gateAction);
        parts.gateAction.id = 'labPkgGateAction';
        parts.gateBack = button(parts.gate, 'lab-pkg-btn lab-pkg-btn-ghost', 'Wróć do pojedynczego badania', function () { setMode('single'); });
        parts.gateBack.id = 'labPkgGateBack';

        parts.body = add(card, 'div', 'lab-pkg-body');
        parts.body.hidden = true;
      }

      function buildForm() {
        if (state.formBuilt) return;
        state.formBuilt = true;
        var m = model();
        var form = add(parts.body, 'div', 'lab-pkg-form');

        var s1 = step(form, 1, 'Pakiet');
        parts.step1 = s1.num;
        var choice = add(s1.body, 'div', 'lab-pkg-choice');
        var chip = add(choice, 'span', 'lab-pkg-chip', state.pkg.label);
        chip.id = 'labPkgName';
        add(choice, 'span', 'lab-pkg-chip-list', state.rows.map(function (row) { return row.short; }).join(' · '));

        var s2 = step(form, 2, 'Wyniki z wydruku', '— puste pole jest pomijane');
        parts.step2 = s2.num;
        var table = add(s2.body, 'div', 'lab-pkg-rows');
        state.rows.forEach(function (row) {
          var line = add(table, 'div', 'lab-pkg-row');
          line.setAttribute('data-analyte', row.id);
          var label = add(line, 'label', 'lab-pkg-row-label', row.short);
          var input = add(line, 'input', 'lab-pkg-value');
          input.type = 'text';
          input.id = 'labPkgValue-' + row.id;
          input.setAttribute('inputmode', 'decimal');
          input.setAttribute('autocomplete', 'off');
          input.setAttribute('aria-describedby', 'labPkgError-' + row.id);
          label.setAttribute('for', input.id);
          var select = add(line, 'select', 'lab-pkg-unit');
          select.id = 'labPkgUnit-' + row.id;
          select.setAttribute('aria-label', 'Jednostka ' + row.short);
          row.units.forEach(function (unit) {
            // Sam symbol jednostki: mieści się na telefonie; zapis niesie pełną etykietę katalogu.
            var option = add(select, 'option', '', unit.symbol);
            option.value = unit.symbol;
          });
          var error = add(line, 'p', 'lab-pkg-row-error');
          error.id = 'labPkgError-' + row.id;
          error.hidden = true;
          input.addEventListener('input', edited);
          select.addEventListener('change', edited);
          parts.inputs[row.id] = input;
          parts.units[row.id] = select;
          parts.errors[row.id] = error;
        });
        parts.unitsHint = add(s2.body, 'p', 'lab-pkg-hint', 'Jednostki zapamiętane z poprzedniego wpisu na tym urządzeniu.');
        parts.unitsHint.hidden = true;

        var s3 = step(form, 3, 'Data pobrania i komentarz');
        parts.step3 = s3.num;
        var meta = add(s3.body, 'div', 'lab-pkg-meta');
        var dateField = add(meta, 'div', 'lab-pkg-field lab-pkg-field-date');
        var dateLabel = add(dateField, 'label', 'lab-pkg-field-label', 'Data pobrania');
        parts.date = add(dateField, 'input', 'lab-pkg-date');
        parts.date.type = 'date';
        parts.date.id = 'labPkgDate';
        dateLabel.setAttribute('for', parts.date.id);
        var commentField = add(meta, 'div', 'lab-pkg-field lab-pkg-field-comment');
        var commentLabel = add(commentField, 'label', 'lab-pkg-field-label', 'Komentarz do pakietu (opcjonalnie)');
        parts.comment = add(commentField, 'input', 'lab-pkg-comment');
        parts.comment.type = 'text';
        parts.comment.id = 'labPkgComment';
        parts.comment.maxLength = m.COMMENT_MAX;
        parts.comment.setAttribute('placeholder', 'np. kontrola po zmianie dawki');
        commentLabel.setAttribute('for', parts.comment.id);
        parts.dateNote = add(s3.body, 'p', 'lab-pkg-hint lab-pkg-date-note');
        parts.dateNote.id = 'labPkgDateNote';
        parts.dateNote.setAttribute('role', 'status');
        parts.dateNote.hidden = true;
        parts.date.addEventListener('input', edited);
        parts.date.addEventListener('change', edited);

        var s4 = step(form, 4, 'Pacjent', '— z karty, wpływa na normę');
        parts.step4 = s4.num;
        // Ten sam wygląd co kontekst pacjenta pojedynczego badania (klasy przelicznika).
        parts.patientBox = add(s4.body, 'div', 'lab-patient-context lab-pkg-patient');
        parts.patient = add(add(parts.patientBox, 'div', 'lab-patient-summary'), 'span', 'lab-patient-text');
        parts.patient.id = 'labPkgPatient';

        parts.clear = button(form, 'lab-pkg-btn lab-pkg-btn-ghost lab-pkg-clear', 'Wyczyść pakiet', function () { clearValues(true); refresh(); });
        parts.clear.id = 'labPkgClear';

        var results = add(parts.body, 'div', 'lab-pkg-results');
        var head = add(results, 'div', 'lab-pkg-results-head');
        add(head, 'div', 'lab-step-label', 'Ocena wyników');
        add(head, 'div', 'lab-pkg-hint', 'na żywo, dla danych pacjenta z karty');
        parts.cardsHost = add(results, 'div', 'lab-pkg-cards');
        parts.cardsHost.id = 'labPkgCards';
        state.rows.forEach(function (row) {
          var box = add(parts.cardsHost, 'div', 'lab-pkg-card');
          box.setAttribute('data-analyte', row.id);
          parts.cards[row.id] = box;
        });
        parts.sources = add(results, 'p', 'lab-pkg-hint lab-pkg-sources');
        parts.sources.id = 'labPkgSources';
        parts.sources.hidden = true;

        parts.save = add(results, 'div', 'lab-pkg-save');
        var info = add(parts.save, 'div', 'lab-pkg-save-info');
        parts.saveCtx = add(info, 'span', 'lab-pkg-save-ctx');
        parts.saveSub = add(info, 'span', 'lab-pkg-save-sub');
        parts.saveBtn = button(parts.save, 'lab-pkg-btn lab-pkg-btn-save', 'Zapisz wyniki do karty', save);
        parts.saveBtn.id = 'labPkgSave';
        parts.error = add(results, 'p', 'lab-pkg-error');
        parts.error.id = 'labPkgError';
        parts.error.setAttribute('role', 'alert');
        parts.error.hidden = true;

        parts.done = add(results, 'div', 'lab-pkg-done');
        parts.done.id = 'labPkgDone';
        parts.done.setAttribute('role', 'status');
        parts.done.hidden = true;
        parts.doneTitle = add(parts.done, 'strong', 'lab-pkg-done-title');
        parts.doneText = add(parts.done, 'span', 'lab-pkg-done-text');
        parts.doneOpen = button(parts.done, 'lab-pkg-btn lab-pkg-btn-ghost', 'Otwórz Badania', openCard);
        parts.doneOpen.id = 'labPkgOpenCard';

        applyUnits();
        resetDate();
      }

      function applyUnits() {
        var m = model(), settings = m.readSettings(w.VildaPersistence || null);
        state.remembered = false;
        state.rows.forEach(function (row) {
          var preferred = settings.units[row.id];
          var unit = m.pickUnit(row, preferred);
          parts.units[row.id].value = unit;
          if (preferred && unit === preferred && preferred !== row.canonicalUnit) state.remembered = true;
        });
        parts.unitsHint.hidden = !state.remembered;
      }
      function today() { return model().localISO(new Date()); }
      function resetDate() {
        parts.date.value = today();
        parts.date.max = today();
      }
      function setBusy(busy) {
        state.busy = busy;
        if (!state.formBuilt) return;
        state.rows.forEach(function (row) {
          parts.inputs[row.id].disabled = busy;
          parts.units[row.id].disabled = busy;
        });
        parts.date.disabled = busy;
        parts.comment.disabled = busy;
        parts.clear.disabled = busy;
      }
      function clearValues(keepDone) {
        if (!state.formBuilt) return;
        state.rows.forEach(function (row) { parts.inputs[row.id].value = ''; });
        parts.comment.value = '';
        resetDate();
        state.error = '';
        if (!keepDone) state.done = null;
      }

      // ── Ocena na żywo ──
      function inputs() {
        return state.rows.map(function (row) {
          return { analyteId: row.id, raw: parts.inputs[row.id].value, unit: parts.units[row.id].value };
        });
      }
      function evaluate(patient) {
        return model().evaluatePackage({
          converter: converter(), snapshot: snapshot(), data: w.LabUnitsData || null,
          patient: patient || {}, capturedAtISO: new Date().toISOString()
        }, inputs());
      }

      function drawBar(box, row, view) {
        if (view.marker == null) return;
        var chart = svg(box, 'svg', { 'class': 'lab-pkg-bar', role: 'img', focusable: 'false',
          'aria-label': row.short + ' ' + row.shown + ' ' + row.unit + ' ' + view.text + '; zakres ' + view.bounds });
        svg(chart, 'rect', { 'class': 'lab-pkg-bar-low', x: '0', y: '4', width: '30%', height: '8' });
        svg(chart, 'rect', { 'class': 'lab-pkg-bar-ok', x: '30%', y: '4', width: '40%', height: '8' });
        svg(chart, 'rect', { 'class': 'lab-pkg-bar-high', x: '70%', y: '4', width: '30%', height: '8' });
        svg(chart, 'circle', { 'class': 'lab-pkg-bar-marker ' + view.state, cx: (Math.round(view.marker * 1000) / 10) + '%', cy: '8', r: '6.5' });
      }

      function drawCard(row, definition) {
        var box = parts.cards[definition.id];
        box.textContent = '';
        box.className = 'lab-pkg-card' + (row.status === 'empty' ? ' is-empty' : row.status === 'invalid' ? ' is-invalid' : '');
        var head = add(box, 'div', 'lab-pkg-card-head');
        var main = add(head, 'div', 'lab-pkg-card-main');
        add(main, 'span', 'lab-pkg-card-name', definition.short);
        if (row.status === 'empty') {
          add(main, 'span', 'lab-pkg-card-empty', 'nie wpisano');
          return;
        }
        if (row.status === 'invalid') {
          add(main, 'span', 'lab-pkg-card-empty', row.error);
          return;
        }
        var view = row.view;
        add(main, 'span', 'lab-pkg-card-value' + (view.state ? ' ' + view.state : ''), row.shown);
        add(main, 'span', 'lab-pkg-card-unit', row.unit);
        add(head, 'span', 'lab-range-status' + (view.state ? ' ' + view.state : ' is-general'), view.text);
        if (row.unit !== definition.canonicalUnit) add(box, 'div', 'lab-pkg-card-converted', '= ' + row.converted);
        drawBar(box, row, view);
        if (view.bounds) {
          var norm = add(box, 'div', 'lab-pkg-card-norm');
          // Zakres ogólny u dziecka: nazwa populacji z danych mówi to sama („Zakres ogólny dorosły”).
          norm.appendChild(doc.createTextNode((view.general ? (view.population || 'Zakres ogólny') : 'Norma' + (view.population ? ' · ' + view.population : '')) + ': '));
          add(norm, 'strong', '', view.bounds);
        }
      }

      function drawSave(ctx, rows) {
        var m = model();
        var filled = rows.filter(function (row) { return row.status === 'ok'; }).length;
        var wrong = rows.filter(function (row) { return row.status === 'invalid'; }).map(function (row) { return row.short || row.analyteId; });
        var invalid = wrong.length > 0;
        // Wiek wizyty łamie się w całości, nie na pojedynczej literze.
        var visit = m.formatVisitAge(m.linkedAgeMonths(ctx.sessionPatient)).replace(/ /g, NBSP);
        parts.saveCtx.textContent = ctx.name + (visit ? ' · wizyta:' + NBSP + visit : '');
        // Błędne pole wstrzymuje cały zapis — wiersz mówi to zamiast liczby wyników.
        parts.saveSub.textContent = invalid
          ? 'popraw wynik: ' + wrong.join(', ') + ' — do tego czasu zapis jest wstrzymany'
          : filled
            ? filled + ' ' + m.plural(filled, ['wynik trafi', 'wyniki trafią', 'wyników trafi']) + ' do Badań w karcie pacjenta'
            : 'wpisz wyniki z wydruku — trafią do Badań w karcie pacjenta';
        parts.saveBtn.textContent = state.busy ? 'Zapisuję…'
          : filled ? 'Zapisz ' + filled + ' ' + m.plural(filled, ['wynik', 'wyniki', 'wyników']) + ' do karty' : 'Zapisz wyniki do karty';
        parts.saveBtn.disabled = state.busy || !filled || invalid;
      }

      function drawGate(gate) {
        var info = GATES[gate];
        parts.gate.hidden = !info;
        parts.body.hidden = !!info;
        if (!info) return;
        parts.gateTitle.textContent = info.title;
        parts.gateText.textContent = info.text;
        parts.gateAction.textContent = info.action;
        parts.gateAction.hidden = !info.action;
      }

      function refresh() {
        timer = null;
        if (!card || !grid) return;
        paintMode();
        if (state.mode !== 'package') return;
        build();
        var ctx = context();
        // Wyniki wpisane dla jednego pacjenta nie przechodzą na innego ani poza sesję.
        if (!ctx.gate) buildForm();
        if (ctx.pid !== state.pid) {
          if (state.pid !== null) clearValues(false);
          state.pid = ctx.pid;
          if (ctx.pid) applyUnits();
        }
        state.gate = ctx.gate;
        drawGate(ctx.gate);
        if (ctx.gate) return;

        var described = packagePatient();
        var description = described && described.description || null;
        var rows = evaluate(described && described.patient);
        var sources = [];
        rows.forEach(function (row, index) {
          var definition = state.rows[index];
          drawCard(row, definition);
          var error = parts.errors[definition.id];
          error.hidden = row.status !== 'invalid';
          error.textContent = row.status === 'invalid' ? row.error : '';
          parts.inputs[definition.id].setAttribute('aria-invalid', row.status === 'invalid' ? 'true' : 'false');
          if (row.status === 'ok' && row.view) row.view.sources.forEach(function (label) { if (sources.indexOf(label) === -1) sources.push(label); });
        });
        parts.sources.hidden = !sources.length;
        parts.sources.textContent = sources.length ? 'Źródła norm: ' + sources.join(' · ') : '';

        var missing = !description || description.missing;
        parts.patient.textContent = missing ? 'Brak wieku i płci w danych pacjenta — przyjęto normy dla dorosłych' : description.text;
        parts.patient.classList.toggle('is-missing', !!missing);
        parts.patientBox.classList.toggle('is-pediatric', !missing && !!described && described.patient.life_stage === 'pediatric');

        var m = model();
        var dateError = m.validDate(parts.date.value, today());
        var otherDay = !dateError && parts.date.value !== today();
        parts.dateNote.hidden = !dateError && !otherDay;
        parts.dateNote.textContent = dateError || (otherDay ? OTHER_DAY_NOTE : '');
        parts.dateNote.classList.toggle('is-error', !!dateError);

        var anyOk = rows.some(function (row) { return row.status === 'ok'; });
        var anyInvalid = rows.some(function (row) { return row.status === 'invalid'; });
        markStep(parts.step1, true, false);
        markStep(parts.step2, anyOk && !anyInvalid, true);
        markStep(parts.step3, anyOk && !dateError, false);
        markStep(parts.step4, anyOk && !missing, false);

        drawSave(ctx, rows);
        parts.error.hidden = !state.error;
        parts.error.textContent = state.error;
        parts.done.hidden = !state.done;
        if (state.done) {
          parts.doneTitle.textContent = state.done.title;
          parts.doneText.textContent = state.done.text;
        }
      }
      function schedule() {
        if (timer != null) w.clearTimeout(timer);
        timer = w.setTimeout(refresh, REFRESH_DELAY_MS);
      }
      function edited() {
        state.error = '';
        state.done = null;
        refresh();
      }

      // ── Zapis zbiorczy ──
      function fail(message) { var error = new Error(message); error.forUser = true; return error; }
      function waitForVault(timeout) {
        return new Promise(function (resolve) {
          var started = Date.now();
          (function poll() {
            var vault = w.VildaVault;
            if (vault && typeof vault.savePatientNote === 'function') { resolve(vault); return; }
            if (Date.now() - started > timeout) { resolve(null); return; }
            w.setTimeout(poll, 120);
          })();
        });
      }
      function toast(message) {
        try {
          var node = byId('labToast');
          if (!node) return;
          node.textContent = message;
          node.classList.add('is-visible');
          w.setTimeout(function () { node.classList.remove('is-visible'); }, 2400);
        } catch (_) { /* komunikat pomocniczy */ }
      }
      function save() {
        if (state.busy) return;
        var m = model(), ctx = context();
        if (ctx.gate) { refresh(); return; }
        var described = packagePatient();
        var rows = evaluate(described && described.patient);
        var plan = m.planSave({
          rows: rows, patientId: ctx.pid, dateISO: parts.date.value, todayISO: today(), comment: parts.comment.value,
          linkedAgeMonths: m.linkedAgeMonths(ctx.sessionPatient), snapshot: snapshot()
        });
        state.done = null;
        if (!plan.ok) { state.error = plan.error; refresh(); return; }
        state.error = '';
        setBusy(true);
        refresh();
        try { if (w.VildaSession && typeof w.VildaSession.ensureAuthLoaded === 'function') w.VildaSession.ensureAuthLoaded(); } catch (_) { /* zapis sprawdzi sejf */ }
        var saved = [];
        waitForVault(VAULT_WAIT_MS).then(function (vault) {
          if (!vault) throw fail('Moduł danych nie załadował się — odśwież stronę.');
          if (typeof vault.isUnlocked !== 'function' || !vault.isUnlocked()) throw fail('Zaloguj się, aby zapisać wyniki w karcie pacjenta.');
          return Promise.resolve().then(function () { return vault.getPatient(ctx.pid); }).catch(function () { return null; }).then(function (patient) {
            if (!patient) throw fail('Nie znalazłem pacjenta w bazie — wczytaj go ponownie z Bazy pacjentów.');
            if (patientId() !== ctx.pid) throw fail('W trakcie zapisu zmienił się pacjent — sprawdź wyniki i zapisz ponownie.');
            return plan.notes.reduce(function (chain, note, index) {
              return chain.then(function () { return vault.savePatientNote(note); }).then(function () { saved.push(plan.rows[index]); });
            }, Promise.resolve());
          });
        }).then(function () {
          var units = {};
          saved.forEach(function (row) { units[row.analyteId] = row.unit; });
          m.rememberUnits(w.VildaPersistence || null, units);
          var names = saved.map(function (row) { return row.short; }).join(', ');
          var count = saved.length;
          var date = m.formatDate(parts.date.value);
          clearValues(true);
          state.done = {
            title: 'Zapisano ' + count + ' ' + m.plural(count, ['wynik', 'wyniki', 'wyników']) + ' w karcie pacjenta',
            text: names + ' · pobranie ' + date
          };
          applyUnits();
          toast('✓ Zapisano w karcie: ' + names);
        }, function (error) {
          // Zapisane wiersze znikają z formularza, żeby ponowny zapis ich nie zdublował.
          saved.forEach(function (row) { parts.inputs[row.analyteId].value = ''; });
          var reason = error && error.forUser ? error.message : 'Nie udało się zapisać: ' + (error && error.message ? error.message : error);
          state.error = saved.length
            ? 'Zapisano: ' + saved.map(function (row) { return row.short; }).join(', ') + '. Pozostałe wyniki nie zostały zapisane. ' + reason
            : reason;
        }).then(function () {
          setBusy(false);
          refresh();
        });
      }

      // ── Wyjścia z karty: logowanie, lista pacjentów, zakładka „Badania” ──
      function gateAction() {
        var host = chromeWindow();
        if (state.gate === 'locked') {
          // Jak przycisk konta w pasku aplikacji: stos konta ładuje most sesji, ekran logowania otwiera VildaAuthUI.
          if (loggedIn()) { refresh(); return; }
          var session = host.VildaSession;
          var ready = session && typeof session.ensureAuthLoaded === 'function' ? session.ensureAuthLoaded() : null;
          Promise.resolve(ready).then(function () {
            var ui = host.VildaAuthUI;
            if (!ui) return;
            if (typeof ui.isGuestMode === 'function' && ui.isGuestMode() && typeof ui.exitGuestMode === 'function') { ui.exitGuestMode(); return; }
            if (typeof ui.showStartupScreen === 'function') ui.showStartupScreen();
          }).catch(function () { /* ekran logowania niedostępny */ });
          return;
        }
        if (state.gate === 'no-patient') {
          // Ta sama droga co pozycja „Baza pacjentów” w menu aplikacji (w powłoce otwiera listę na stronie Start).
          var entry;
          try { entry = host.document.getElementById('patientsListBtnSidebar'); } catch (_) { entry = null; }
          if (entry && typeof entry.click === 'function') entry.click();
        }
      }
      function openCard() {
        var pid = patientId();
        if (!pid || pid !== state.pid) { refresh(); return; }
        var shell = null;
        try { if (w.VildaShell && typeof w.VildaShell.openPatientCardInStart === 'function') shell = w.VildaShell; } catch (_) { shell = null; }
        try {
          if (!shell && w.parent && w.parent !== w && w.parent.VildaShell && typeof w.parent.VildaShell.openPatientCardInStart === 'function') shell = w.parent.VildaShell;
        } catch (_) { shell = null; }
        if (shell) { shell.openPatientCardInStart(pid, { activeTab: 'lab' }); return; }
        var session = w.VildaSession;
        var ready = session && typeof session.ensureAuthLoaded === 'function' ? session.ensureAuthLoaded() : null;
        Promise.resolve(ready).then(function () {
          var ui = w.VildaAuthUI;
          if (ui && typeof ui.showPatientCard === 'function') ui.showPatientCard(pid, null, null, { activeTab: 'lab' });
        }).catch(function () { /* karta niedostępna */ });
      }

      // ── Tryb pracy i adres ──
      function paintMode() {
        var on = state.mode === 'package';
        grid.classList.toggle('is-package', on);
        card.hidden = !on;
        singleBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
        packageBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        packageBtn.classList.toggle('is-locked', !loggedIn());
      }
      function setMode(mode, focus) {
        state.mode = mode === 'package' ? 'package' : 'single';
        refresh();
        if (focus && state.mode === 'package' && !state.gate && state.rows.length) {
          try { parts.inputs[state.rows[0].id].focus(); } catch (_) { /* fokus pomocniczy */ }
        }
      }
      // ?pakiet=<slug> otwiera pakiet (np. ze skrótu w zakładce „Badania”); ?badanie=<id> wraca do pojedynczego badania.
      function applyDeepLink(target) {
        var m = model(), wanted, single;
        try {
          var search = new URLSearchParams(target.search || '');
          var hash = new URLSearchParams(String(target.hash || '').replace(/^#/, ''));
          wanted = search.get('pakiet') || hash.get('pakiet');
          single = search.get('badanie') || hash.get('badanie');
        } catch (_) { wanted = null; single = null; }
        if (wanted && m && state.pkg && m.findPackage(DATA, wanted) === state.pkg) { setMode('package', true); return; }
        if (single && state.mode === 'package') setMode('single');
      }

      function bind() {
        grid = doc.querySelector('.lab-grid');
        card = byId('labPackageCard');
        singleBtn = byId('labModeSingle');
        packageBtn = byId('labModePackage');
        var m = model(), data = DATA;
        if (!grid || !card || !singleBtn || !packageBtn) return;
        state.pkg = m && data && Array.isArray(data.packages) ? data.packages[0] || null : null;
        state.rows = state.pkg && converter() ? m.describeAnalytes(state.pkg, converter()) : [];
        singleBtn.addEventListener('click', function () { setMode('single'); });
        packageBtn.addEventListener('click', function () { setMode('package', true); });
        ['vilda:session-changed', 'vilda:auth-loaded', 'vilda:patient-loaded', 'vilda:zrodlo-pacjenta-zmienione'].forEach(function (type) {
          doc.addEventListener(type, schedule);
        });
        w.addEventListener('vilda:user-state-cleared', function () { clearValues(false); schedule(); });
        w.addEventListener('storage', schedule);
        w.addEventListener('focus', schedule);
        w.addEventListener('vilda:shell-navigate-target', function (event) {
          var href = event && event.detail && event.detail.href;
          if (typeof href !== 'string') return;
          try {
            var target = new URL(href, w.location.href);
            if (target.origin === w.location.origin && target.pathname === w.location.pathname) applyDeepLink(target);
          } catch (_) { /* adres spoza strony */ }
        });
        var bar = byId('labModeBar');
        if (bar) bar.hidden = false;
        paintMode();
        applyDeepLink(w.location);
        // Jak wiersz przypięcia: druga próba po załadowaniu stosu konta przez most sesji.
        w.setTimeout(schedule, 1200);
      }

      return { bind: bind, refresh: refresh, setMode: setMode, state: function () { return state; } };
    }

    var instance = null;
    return Object.freeze({
      version: '1.0.0',
      start: function () {
        if (instance || !win || !win.document) return instance;
        instance = create(win);
        var doc = win.document;
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', instance.bind);
        else instance.bind();
        return instance;
      },
      // Tylko do testów: natychmiastowy przebieg bez opóźnienia.
      refresh: function () { if (instance) instance.refresh(); }
    });
  })(root);

  if (typeof module === 'object' && module.exports) module.exports = { data: DATA, model: MODEL, ui: UI };
  if (root) {
    root.VildaLabPackagesData = DATA;
    root.VildaLabPackages = MODEL;
    root.VildaLabPackagesUI = UI;
    UI.start();
  }
})(typeof window !== 'undefined' ? window : null);
