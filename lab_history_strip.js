/* Pasek „Poprzednie wyniki pacjenta” w przeliczniku jednostek (LAB-HISTORIA PR3).
 *
 * Tylko do odczytu (decyzja 6.6): bez pól, bez daty i bez zapisu. Pokazuje zapisane wyniki wybranego
 * badania pacjenta karty (serie z VildaVault.listPatientLabSeries i notatki „wynik-badania”, a od 1.1.0
 * także IGF-1 z notatek leczenia GH z dopiskiem źródła — decyzje 6.24–6.25); widok liczy
 * model PR1 (VildaLabHistory.buildHistoryView) w jednostce formularza. Dawne wyniki nie są oceniane
 * dzisiejszymi normami ani danymi pacjenta z formularza: strzałka ↑/↓ stoi przy wartości tylko wtedy,
 * gdy wpis ma zapisaną normę w swojej jednostce; wykres ma przy punktach same wartości (decyzja 6.22).
 * Bieżący wynik z formularza stoi osobno (chip i pas „teraz”), bez daty i bez linii łączącej. Gdy ten wynik
 * jest już w karcie (od 1.4.0, LAB-HISTORIA 6.38: stan liczy moduł przypięcia, VildaLabPinResult.pinned()),
 * pasek nie rysuje go drugi raz: bez chipu i pasa „teraz”, a chip tej notatki ma tło fioletu, punkt — obwódkę.
 * Od 1.5.0 (LAB-HISTORIA 6.39, makieta właściciela „wariant A”) pasek pokazuje tylko nagłówek, chipy i wykres:
 * bez podpisu z liczbą wyników, panelu szczegółów, linii różnicy, przycisku „Ukryj wykres”, objaśnień i stopki.
 * Szczegóły wpisu (norma, zakres zapisany z wynikiem, komentarz) są w podpowiedzi chipu i w karcie („Badania w karcie →”).
 * Pasek nie zasila punktu pacjenta na wykresie hormonów (PATIENT_POINT.md).
 * Projekt: docs/LAB_HISTORIA_WYNIKOW_PLAN.md, 3.3 (decyzje 6.6–6.10, 6.21, 6.22, 6.38, 6.39);
 * opis: docs/clinical/ALGORITHMS.md, „LAB-HISTORIA PR3”.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.VildaLabHistoryStrip = api;
    api.start();
  }
})(typeof window !== 'undefined' ? window : null, function (win) {
  'use strict';
  var NBSP = ' ';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var PATIENT_KEY = 'vildaCurrentPatientId';
  // Sygnał sejfu o zmianie notatki w innej ramce albo karcie przeglądarki (bez identyfikatora notatki).
  var NOTE_PING_KEY = 'vilda-note-changed-ping-v1';
  var STRIP_ID = 'labHistoryStrip';
  var CHART_ID = 'labHistoryStripChart';
  var MAX_CHIPS = 5;
  var REFRESH_DELAY_MS = 150;
  // Wynik bez liczby porównywalnej z serią (jak w zakładce „Badania”).
  var KIND_NOTE = {
    'other-unit': 'jednostka nierozpoznana albo brak jednostki — wynik jak zapisano, bez porównania',
    text: 'wynik tekstowy — jak zapisano, bez porównania',
    censored: 'wynik poza zakresem oznaczalności — bez punktu na wykresie'
  };
  var DATE_SOURCE = { termin: 'termin zlecenia', wpis: 'data wpisu', kontrola: 'data kontroli GH' };
  var DATE_PREFIX = { termin: 'termin ', wpis: 'wpis ', kontrola: 'kontrola ' };
  // IGF-1 z notatki leczenia GH (decyzje 6.24–6.25, model VildaLabHistory 1.1.0).
  var GH_SOURCE = 'z notatki leczenia GH';
  // LAB-HISTORIA 6.38: zapisany wynik, który jest teraz w formularzu (podpowiedź chipu; bez znacznika w treści, 6.39).
  var PINNED_TITLE = 'wynik z formularza — już w karcie';
  var FLAG_LABEL = { '↑': 'powyżej normy z wpisu', '↓': 'poniżej normy z wpisu' };

  function own(value, key) { return value != null && Object.prototype.hasOwnProperty.call(value, key); }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function finite(value) { return typeof value === 'number' && isFinite(value); }
  // Polska odmiana: 1 wynik, 2–4 wyniki, 5+ wyników (12–14 wyników).
  function plural(n, forms) {
    if (n === 1) return forms[0];
    var tens = n % 100, ones = n % 10;
    return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? forms[1] : forms[2];
  }
  function localISO(date) {
    var pad = function (v) { return (v < 10 ? '0' : '') + v; };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function shortLabel(label) { return String(label || '').split('(')[0].trim() || String(label || ''); }
  function normalizeUnit(unit) { return String(unit == null ? '' : unit).trim().replace(/\s+/g, ' ').replace(/µ/g, 'μ'); }
  // Wartość bez jednostki, gdy tę samą jednostkę niesie nagłówek paska.
  function bareValue(entry, unit) {
    var shown = entry.display || entry.raw || '—';
    if (!unit) return shown;
    var suffixes = [NBSP + unit, ' ' + unit];
    for (var i = 0; i < suffixes.length; i++) {
      if (shown.length > suffixes[i].length && shown.slice(-suffixes[i].length) === suffixes[i]) return shown.slice(0, -suffixes[i].length);
    }
    return shown;
  }
  // Komentarz wpisu bez linii dopisanych przez aplikację („= …” przypięcia, „Norma: …” szablonu edytora).
  function commentText(body) {
    return String(body || '').split(/\r?\n/).map(function (line) { return line.trim(); })
      .filter(function (line) { return line && !/^=\s/.test(line) && !/^Norma:\s/i.test(line); }).join(' · ');
  }

  // ── Geometria wykresu: czysta funkcja (bez DOM), testowana osobno ─────────────────────────────

  // Krok osi Y z ciągu 1–2–2,5–5 × 10^k: najmniejszy, przy którym oś ma najwyżej cztery przedziały.
  function niceStep(max) {
    var exponent = Math.floor(Math.log(max) / Math.LN10);
    var mantissas = [1, 2, 2.5, 5];
    for (var e = exponent - 1; e <= exponent + 1; e++) {
      for (var i = 0; i < mantissas.length; i++) {
        var step = mantissas[i] * Math.pow(10, e);
        if (Math.ceil(max / step - 1e-9) <= 4) return step;
      }
    }
    return Math.pow(10, exponent + 1);
  }
  function round12(value) { return Number(value.toPrecision(12)); }

  // Etykiety dat jako prostokąty: ostatnia zawsze; pierwsza, gdy nie zachodzi na ostatnią; pośrednie, gdy
  // nie zachodzą na sąsiednie wybrane. Skrajne wyrównane do brzegu, jeśli wyśrodkowane wyszłyby poza oś.
  // Na wąskim wykresie (telefon) najwyżej trzy: środkowa tylko ze środkiem ≥ 56 od obu skrajnych.
  function dateLabels(xs, options) {
    var n = xs.length, last = n - 1, w = options.labelWidth, space = options.narrow ? 6 : 12;
    if (!n) return [];
    function anchorFor(i) {
      if (n > 1 && i === 0 && xs[i] - options.leftLimit < w / 2 + 6) return 'start';
      if (n > 1 && i === last && options.rightLimit - xs[i] < w / 2 + 6) return 'end';
      return 'middle';
    }
    function box(i) {
      var anchor = anchorFor(i), from = anchor === 'start' ? xs[i] : anchor === 'end' ? xs[i] - w : xs[i] - w / 2;
      return { index: i, anchor: anchor, from: from, to: from + w };
    }
    function apart(a, b) { return a.to + space <= b.from || b.to + space <= a.from; }
    var tail = box(last);
    if (n === 1) return [tail];
    var chosen = [];
    var head = box(0);
    if (apart(head, tail)) chosen.push(head);
    if (options.narrow) {
      var middle = (xs[0] + xs[last]) / 2, best = -1;
      for (var i = 1; i < last; i++) {
        if (best === -1 || Math.abs(xs[i] - middle) < Math.abs(xs[best] - middle)) best = i;
      }
      if (best > 0 && chosen.length) {
        var centre = box(best);
        if (xs[best] - xs[0] >= 56 && xs[last] - xs[best] >= 56 && apart(centre, head) && apart(centre, tail)) chosen.push(centre);
      }
    } else {
      for (var k = 1; k < last; k++) {
        var candidate = box(k), previous = chosen[chosen.length - 1];
        if ((!previous || apart(previous, candidate)) && apart(candidate, tail)) chosen.push(candidate);
      }
    }
    chosen.push(tail);
    return chosen;
  }

  /**
   * Układ wykresu w jednostkach viewBox. Szerokość viewBox = szerokość karty (180–660), więc podpisy
   * mają stałą wielkość na każdym ekranie (na 320 px karta przelicznika ma ok. 200 px na wykres). Oś Y od zera (jak Nl), punkty po dacie badania,
   * bieżący wynik w osobnym pasie po prawej (bez daty, bez linii łączącej).
   * @param {Array} points [{noteId, dateISO, v, conv}] w jednostce wyświetlania
   * @param {number|null} current wartość bieżąca w tej samej jednostce albo null
   * @param {number} hostWidth szerokość kontenera w px (0 = nieznana → 660)
   */
  function chartLayout(points, current, hostWidth) {
    var width = hostWidth > 0 ? Math.max(180, Math.min(660, Math.round(hostWidth))) : 660;
    var narrow = width < 420;
    var height = 200, top = 14, axisY = 160, plotH = axisY - top;
    var left = narrow ? 32 : 50, pad = narrow ? 8 : 20;
    var hasNow = finite(current);
    var laneW = narrow ? 44 : 80;
    var laneX = width - pad - laneW;
    var sepX = laneX - (narrow ? 6 : 8);
    var plotLeft = left + (narrow ? 8 : 14);
    var plotRight = hasNow ? sepX - (narrow ? 14 : 32) : width - pad - (narrow ? 10 : 24);
    var max = 0;
    points.forEach(function (point) { if (point.v > max) max = point.v; });
    if (hasNow && current > max) max = current;
    if (!(max > 0)) max = 1;
    var step = niceStep(max), intervals = Math.max(1, Math.ceil(max / step - 1e-9));
    var yMax = Math.max(round12(intervals * step), max * 1.15);
    var y = function (value) { return top + (1 - value / yMax) * plotH; };
    var ticks = [];
    for (var i = 0; i <= intervals; i++) ticks.push({ value: round12(i * step), y: y(i * step) });
    var times = points.map(function (point) { return Date.parse(point.dateISO); });
    var t0 = Math.min.apply(null, times), t1 = Math.max.apply(null, times);
    var laid = points.map(function (point, index) {
      var x = !(t1 > t0) ? (plotLeft + plotRight) / 2 : plotLeft + (times[index] - t0) / (t1 - t0) * (plotRight - plotLeft);
      return { noteId: point.noteId, dateISO: point.dateISO, v: point.v, conv: !!point.conv, x: x, y: y(point.v) };
    });
    var right = width - pad;
    return {
      width: width, height: height, narrow: narrow, top: top, axisY: axisY, left: left, right: right,
      plotLeft: plotLeft, plotRight: plotRight, ticks: ticks, yMax: yMax, points: laid,
      dateLabels: dateLabels(laid.map(function (point) { return point.x; }), {
        // Szerokość daty „DD.MM.RR” z zapasem na szerszy krój zastępczy (bez Inter); ostatecznie rozstrzyga pomiar (pruneOverlaps).
        narrow: narrow, labelWidth: narrow ? 54 : 60, leftLimit: left, rightLimit: hasNow ? sepX : right
      }),
      now: hasNow ? { laneX: laneX, laneW: laneW, sepX: sepX, x: laneX + laneW / 2, y: y(current), v: current } : null
    };
  }

  // Etykiety wartości od najnowszej: punkt dostaje podpis, gdy nie zachodzi na podpis już postawiony.
  // Krótki skrót treści (FNV-1a z długością) do porównania odczytów; null, gdy treści nie da się zserializować.
  function digestOf(value) {
    var json;
    try { json = JSON.stringify(value); } catch (_) { return null; }
    if (typeof json !== 'string') return null;
    var hash = 0x811c9dc5;
    for (var i = 0; i < json.length; i++) { hash ^= json.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
    return json.length + ':' + hash.toString(36);
  }

  function valueLabelIndexes(laid, widthOf) {
    var placed = [], out = [];
    for (var i = laid.length - 1; i >= 0; i--) {
      var box = { x: laid[i].x, y: laid[i].y - 10, w: widthOf(i) };
      var clash = placed.some(function (other) { return Math.abs(other.x - box.x) < (other.w + box.w) / 2 + 4 && Math.abs(other.y - box.y) < 13; });
      if (!clash) { placed.push(box); out.push(i); }
    }
    return out.reverse();
  }

  // ── Pasek ──────────────────────────────────────────────────────────────────────────────────────

  function create(w) {
    var doc = w.document;
    var state = {
      timer: 0, readGen: 0, noteGen: 0, cache: null, signature: '', selected: null, expanded: false,
      subscribedVault: null, lockVault: null, lastWidth: 0, pid: null
    };
    var strip = null;

    function el(id) { return doc.getElementById(id); }
    function node(tag, className, content) {
      var element = doc.createElement(tag);
      if (className) element.className = className;
      if (content != null && content !== '') element.textContent = String(content);
      return element;
    }
    function add(parent, tag, className, content) { return parent.appendChild(node(tag, className, content)); }
    function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    function svgNode(parent, tag, attributes, className, content) {
      var element = doc.createElementNS(SVG_NS, tag);
      Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, String(attributes[key])); });
      if (className) element.setAttribute('class', className);
      if (content != null) element.textContent = String(content);
      return parent.appendChild(element);
    }
    function converter() { return w.LabUnitConverter || null; }
    function model() { return w.VildaLabHistory || null; }
    function formatNumber(value, precision) {
      var conv = converter();
      if (conv && typeof conv.formatNumber === 'function') {
        try { return conv.formatNumber(value, precision || 3); } catch (_) { /* zapas niżej */ }
      }
      return String(value).replace('.', ',');
    }
    function formatDate(iso) {
      var m = model();
      return m && typeof m.formatDate === 'function' ? m.formatDate(iso) : String(iso || '');
    }

    // ── Kontekst z formularza i sesji ──
    function patientId() {
      if (w._vildaCurrentPatientId) return String(w._vildaCurrentPatientId);
      try { return w.sessionStorage && w.sessionStorage.getItem(PATIENT_KEY) || null; } catch (_) { return null; }
    }
    function sessionPatient() {
      try { var session = w.VildaSession; return session && typeof session.getPatient === 'function' ? session.getPatient() : null; } catch (_) { return null; }
    }
    function unlockedVault() {
      var vault = w.VildaVault;
      try { return vault && typeof vault.isUnlocked === 'function' && vault.isUnlocked() && typeof vault.listPatientLabSeries === 'function' ? vault : null; } catch (_) { return null; }
    }
    // Badanie z czytelnego skryptu strony (decyzja 6.16); zapas: etykieta pola jak w lab_pin_result.js.
    function substanceId() {
      try {
        var runtime = w.VildaLabConverterRuntime;
        if (runtime && typeof runtime.getSubstanceId === 'function') return runtime.getSubstanceId() || null;
      } catch (_) { /* zapas niżej */ }
      var field = el('labSubstance'), conv = converter();
      var label = field ? String(field.value || '').trim() : '';
      if (!label || !conv || typeof conv.list !== 'function') return null;
      try {
        var list = conv.list() || [];
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].label === label) return list[i].id || null;
      } catch (_) { /* brak dopasowania */ }
      return null;
    }
    function formUnit() {
      var field = el('labUnit');
      return field ? String(field.value || '').trim() : '';
    }
    // Bieżący wynik: wartość z pola tylko wtedy, gdy przelicznik pokazuje wynik (sekcja niepusta).
    function currentResult(testKey, unit) {
      var field = el('labValue'), section = el('labResultSection');
      var raw = field ? String(field.value || '').trim() : '';
      if (!raw || !unit || !section || section.classList.contains('is-empty')) return null;
      var conv = converter(), value = NaN;
      if (conv && typeof conv.parseNumber === 'function') { try { value = conv.parseNumber(raw); } catch (_) { value = NaN; } }
      return { testKey: testKey, value: raw, valueNum: finite(value) && value >= 0 ? value : null, unit: unit };
    }
    function readContext() {
      var pid = patientId(), vault = unlockedVault(), testKey = substanceId();
      if (!pid || !vault || !testKey || !sessionPatient() || !model()) return null;
      var unit = formUnit();
      return { pid: pid, vault: vault, testKey: testKey, unit: unit, current: currentResult(testKey, unit) };
    }

    // ── Cykl odczytu ──
    function schedule() {
      if (state.timer) w.clearTimeout(state.timer);
      state.timer = w.setTimeout(function () { state.timer = 0; run(); }, REFRESH_DELAY_MS);
    }
    function forget() {
      state.readGen += 1;
      state.cache = null;
      state.selected = null;
      state.expanded = false;
      state.pid = null;
      hide();
    }
    function hide() {
      state.signature = '';
      if (!strip) return;
      strip.classList.remove('is-on');
      clear(strip);
    }
    function watchVault(vault) {
      if (state.subscribedVault !== vault && typeof vault.onPatientNoteChanged === 'function') {
        state.subscribedVault = vault;
        // Sejf nie ma wypisania z nasłuchu: jeden nasłuch na instancję sejfu, zdarzenia innych instancji pomijane.
        vault.onPatientNoteChanged(function (event) {
          if (w.VildaVault !== vault) return;
          if (event && event.patientId && event.patientId !== state.pid) return;
          state.noteGen += 1;
          schedule();
        });
      }
      if (state.lockVault !== vault && typeof vault.onLock === 'function') {
        state.lockVault = vault;
        vault.onLock(function () { if (w.VildaVault === vault) forget(); });
      }
    }
    // „Już w karcie” (LAB-HISTORIA 6.38): wynik formularza jest zapisaną notatką tej serii. Regułę ma jedną moduł
    // przypięcia (VildaLabPinResult.pinned(): ostatnie przypięcie z tej strony albo notatka z datą, którą zaproponuje
    // okno przypięcia). Pasek sprawdza tylko, że stan dotyczy tego pacjenta, badania, tekstu wartości i jednostki
    // formularza oraz że notatka jest wpisem serii; bez modułu przypięcia pasek pokazuje chip „teraz”.
    function pinnedFor(ctx, series) {
      var api = w.VildaLabPinResult, pinned;
      try { pinned = api && typeof api.pinned === 'function' ? api.pinned() : null; } catch (_) { pinned = null; }
      var current = ctx.current;
      if (!pinned || !current || !pinned.noteId || String(pinned.patientId) !== String(ctx.pid) || pinned.testKey !== ctx.testKey) return null;
      if (text(pinned.raw) !== text(current.value) || normalizeUnit(pinned.unit) !== normalizeUnit(current.unit)) return null;
      for (var i = 0; i < series.entries.length; i++) {
        var entry = series.entries[i];
        if (entry.noteId === pinned.noteId) return { noteId: pinned.noteId, dateISO: pinned.dateISO || entry.dateISO || null, entry: entry };
      }
      return null;
    }

    function run() {
      var ctx = readContext();
      if (!ctx) { hide(); return; }
      watchVault(ctx.vault);
      if (state.pid !== ctx.pid) {
        // Inny pacjent: nic z poprzedniego nie zostaje na ekranie ani w pamięci.
        state.cache = null; state.selected = null; state.expanded = false;
        state.pid = ctx.pid;
        hide();
      }
      var cache = state.cache;
      if (cache && cache.pid === ctx.pid && cache.vault === ctx.vault && cache.noteGen === state.noteGen) { draw(ctx, cache); return; }
      var gen = ++state.readGen, noteGen = state.noteGen, vault = ctx.vault, pid = ctx.pid;
      Promise.resolve().then(function () {
        return Promise.all([
          vault.listPatientLabSeries(pid),
          vault.listPatientNotesForPatient(pid),
          typeof vault.getPatient === 'function' ? vault.getPatient(pid) : null
        ]);
      }).then(function (results) {
        if (gen !== state.readGen) return;
        // Tożsamość po odczycie: ten sam pacjent i ten sam odblokowany sejf; inaczej odczyt od nowa.
        var now = readContext();
        if (!now || now.pid !== pid || now.vault !== vault) { schedule(); return; }
        // Rekord pacjenta w tym samym sejfie (3.3); nazwisko stoi w wierszu przypięcia nad paskiem (6.39).
        if (!results[2]) { hide(); return; }
        var notesById = {};
        (Array.isArray(results[1]) ? results[1] : []).forEach(function (note) { if (note && note.id) notesById[note.id] = note; });
        state.cache = { pid: pid, vault: vault, noteGen: noteGen, series: results[0], notesById: notesById,
          digest: digestOf([results[0], results[1]]) };
        draw(now, state.cache);
      }).catch(function () {
        if (gen === state.readGen) hide();
      });
    }

    function seriesView(ctx, cache) {
      var m = model(), trend = w.__vildaLabTrend;
      var unitBy = {};
      if (ctx.unit) unitBy[ctx.testKey] = ctx.unit;
      var view = m.buildHistoryView(cache.series, {
        converter: converter(), notesById: cache.notesById, treatment: [], unitBy: unitBy,
        current: ctx.current, parseNorm: trend && typeof trend.parseNorm === 'function' ? trend.parseNorm : null,
        nowISO: localISO(new Date()), rangeSnapshot: w.VildaLabRangeSnapshot || null
      });
      for (var i = 0; i < view.panels.length; i++) {
        for (var k = 0; k < view.panels[i].series.length; k++) {
          if (view.panels[i].series[k].key === ctx.testKey) return { series: view.panels[i].series[k], preview: view.preview };
        }
      }
      return null;
    }

    function mount() {
      if (strip && strip.parentNode) return strip;
      var anchor = el('labPinRow') || el('labResultSection');
      if (!anchor || !anchor.parentNode) return null;
      strip = strip || node('section', 'lab-strip');
      strip.id = STRIP_ID;
      // Za wierszem przypięcia (decyzja 6.8); wiersz wstawiony później staje tuż za sekcją wyniku, czyli przed paskiem.
      anchor.parentNode.insertBefore(strip, anchor.nextSibling);
      return strip;
    }
    function hostWidth() {
      return strip && strip.clientWidth > 0 ? strip.clientWidth - 28 : 0;
    }

    function draw(ctx, cache) {
      var found;
      try { found = seriesView(ctx, cache); } catch (_) { found = null; }
      if (!found || !found.series.entries.length || !mount()) { hide(); return; }
      // Szerokość mierzona przy widocznym pasku (ukryty ma szerokość 0).
      strip.classList.add('is-on');
      var width = chartLayout([], null, hostWidth()).width;
      var pinned = pinnedFor(ctx, found.series);
      // Treść odczytu (skrót serii i notatek), nie numer odczytu: ponowny odczyt tych samych danych (sygnał sejfu,
      // zmiana stanu przypięcia, powrót fokusu) nie przebudowuje paska.
      var signature = JSON.stringify([ctx.pid, cache.digest == null ? 'n' + cache.noteGen : cache.digest, ctx.testKey, ctx.unit, ctx.current, state.selected,
        state.expanded, width, pinned && pinned.noteId, pinned && pinned.dateISO, !!(w.__vildaLabTrend && w.__vildaLabTrend.parseNorm)]);
      if (signature === state.signature && strip.classList.contains('is-on')) return;
      state.signature = signature;
      state.lastWidth = width;
      var focusKey = focusedKey();
      render(found.series, found.preview, pinned);
      restoreFocus(focusKey);
    }
    function focusedKey() {
      var active = doc.activeElement;
      return active && strip && typeof strip.contains === 'function' && strip.contains(active) && active.getAttribute
        ? active.getAttribute('data-focus') : null;
    }
    function restoreFocus(key) {
      if (!key || !strip) return;
      var target = strip.querySelector('[data-focus="' + key + '"]');
      if (target && typeof target.focus === 'function') target.focus();
    }

    // LAB-HISTORIA 6.39: nagłówek w jednej linii z odnośnikiem do karty, chipy i wykres — nic więcej.
    function render(series, preview, pinned) {
      clear(strip);
      var unit = series.unit;
      var label = shortLabel(series.label);
      strip.setAttribute('aria-label', 'Poprzednie wyniki pacjenta: ' + label);
      strip.classList.add('is-on');

      var head = add(strip, 'div', 'lab-strip-head');
      add(head, 'p', 'lab-strip-title', 'Poprzednie wyniki pacjenta · ' + label + (unit ? ' · w ' + unit : ''));
      var link = add(head, 'button', 'lab-strip-link', 'Badania w karcie →');
      link.type = 'button';
      link.setAttribute('data-focus', 'card');
      link.addEventListener('click', openCard);

      keepSelection(series);
      drawChips(series, preview, pinned);
      drawChart(series, preview, pinned);
    }

    // Zaznaczenie chipu łączy chip z punktem wykresu (bez panelu szczegółów, 6.39); wpis spoza serii — bez zaznaczenia.
    function keepSelection(series) {
      if (!state.selected) return;
      for (var i = 0; i < series.entries.length; i++) if (series.entries[i].noteId === state.selected) return;
      state.selected = null;
    }
    function select(noteId) {
      state.selected = state.selected === noteId ? null : noteId;
      run();
    }

    function drawChips(series, preview, pinned) {
      var row = add(strip, 'div', 'lab-strip-chips');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Zapisane wyniki');
      var entries = series.entries;
      var overflow = Math.max(0, entries.length - MAX_CHIPS);
      var pinAt = pinned ? entries.indexOf(pinned.entry) : -1;
      var pinnedHidden = pinAt >= 0 && pinAt < overflow;
      var shown = entries.slice(state.expanded ? 0 : overflow);
      // Przypięty wynik widoczny także wtedy, gdy jego data jest wśród wcześniejszych (schowanych). Schowane starsze
      // od niego mają przycisk przed nim, schowane późniejsze — zaraz za nim, więc daty w wierszu idą po kolei.
      var before = state.expanded ? 0 : overflow, after = 0;
      if (!state.expanded && pinnedHidden) { shown.unshift(pinned.entry); before = pinAt; after = overflow - pinAt - 1; }
      var more = function (count) {
        var button = add(row, 'button', 'lab-strip-chip lab-strip-more',
          state.expanded ? 'zwiń wcześniejsze' : '+' + count + ' ' + plural(count, ['wcześniejszy', 'wcześniejsze', 'wcześniejszych']));
        button.type = 'button';
        button.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
        button.setAttribute('data-focus', 'more');
        button.addEventListener('click', function () { state.expanded = !state.expanded; run(); });
      };
      // Rozwinięte: „zwiń” tylko wtedy, gdy zwinięcie coś schowa.
      if (state.expanded ? overflow - (pinnedHidden ? 1 : 0) > 0 : before > 0) more(before);
      shown.forEach(function (entry) {
        var isPinned = !!pinned && entry === pinned.entry;
        var chip = add(row, 'button', isPinned ? 'lab-strip-chip is-pinned' : 'lab-strip-chip');
        chip.type = 'button';
        chip.setAttribute('aria-pressed', state.selected === entry.noteId ? 'true' : 'false');
        chip.setAttribute('data-note-id', entry.noteId || '');
        chip.setAttribute('data-focus', 'chip:' + (entry.noteId || ''));
        chip.setAttribute('title', [chipTitle(entry), isPinned ? PINNED_TITLE : ''].filter(Boolean).join(' · '));
        // Przypięty chip ma tę samą treść co pozostałe (data i wartość); wyróżnia go tylko tło (6.39).
        add(chip, 'span', 'lab-strip-chip-d', entry.dateISO ? (DATE_PREFIX[entry.dateSource] || '') + formatDate(entry.dateISO) : 'bez daty');
        var value = add(chip, 'span', 'lab-strip-chip-v', bareValue(entry, series.unit));
        if (entry.flag) flag(value, entry.flag);
        chip.addEventListener('click', function () { select(entry.noteId); });
        if (isPinned && after > 0) more(after);
      });
      // Wynik formularza, który jest już w karcie, nie ma osobnego chipu „teraz” (LAB-HISTORIA 6.38). Czy jest
      // w karcie, mówi wiersz przypięcia nad paskiem (6.39); podpowiedź tego nie powtarza, bo pasek bez stanu
      // przypięcia (np. bez modułu przypięcia) nie wie tego na pewno.
      if (!pinned && preview && (preview.value != null || preview.raw)) {
        add(row, 'span', 'lab-strip-sep').setAttribute('aria-hidden', 'true');
        var now = add(row, 'div', 'lab-strip-chip lab-strip-now');
        now.setAttribute('title', 'bieżący wynik z formularza, bez daty');
        add(now, 'span', 'lab-strip-chip-d', 'teraz');
        add(now, 'span', 'lab-strip-chip-v', preview.value != null ? bareValue(preview, series.unit) : preview.raw);
      }
      widenLoneChips(row);
    }
    // Telefon (siatka dwóch kolumn): „+N”, przypięty chip i „teraz” zajmują cały rząd, więc chip, który zostałby
    // sam w rzędzie przed nimi albo na końcu, też go wypełnia (klasa działa tylko w siatce, @media w arkuszu).
    function widenLoneChips(row) {
      var run = [];
      var flush = function () { if (run.length % 2) run[run.length - 1].classList.add('is-wide'); run = []; };
      for (var i = 0; i < row.children.length; i++) {
        var item = row.children[i], cls = item.classList;
        if (cls.contains('lab-strip-sep')) continue;
        if (cls.contains('lab-strip-more') || cls.contains('lab-strip-now') || cls.contains('is-pinned')) flush();
        else run.push(item);
      }
      flush();
    }
    function flag(parent, glyph) {
      var mark = add(parent, 'span', 'lab-strip-flag', glyph);
      mark.setAttribute('role', 'img');
      mark.setAttribute('aria-label', FLAG_LABEL[glyph] || glyph);
    }
    // Wartość w jednostce zapisu, bez zaokrąglenia.
    function recorded(entry) {
      return finite(entry.recordedValue) ? String(entry.recordedValue).replace('.', ',') + (entry.recordedUnit ? NBSP + entry.recordedUnit : '') : entry.raw;
    }
    // Podpowiedź chipu (6.39, zamiast panelu szczegółów): źródło daty, GH, opis wyniku bez porównania, zapis w jednostce
    // zapisu, norma wpisu, zakres zapisany z wynikiem, zapisana ocena (cytat tytułu) i komentarz. Bez wieku wizyty,
    // uwagi o metodzie przy normie i pełnego widoku oceny — te są w karcie.
    function chipTitle(entry) {
      var parts = [];
      if (entry.dateSource !== 'badanie' && DATE_SOURCE[entry.dateSource]) parts.push(DATE_SOURCE[entry.dateSource] + ' (brak daty badania)');
      if (entry.source === 'gh-note') parts.push(GH_SOURCE + ' (pole „IGF-1 (wynik z kontroli)”), bez normy i bez oceny');
      if (KIND_NOTE[entry.kind]) parts.push(KIND_NOTE[entry.kind]);
      if (entry.raw) parts.push('zapisano: ' + recorded(entry));
      if (entry.norm) parts.push('norma z wpisu: ' + entry.norm);
      var status = entry.status;
      // Decyzja 6.3: zakres zapisany z wynikiem przy przypięciu, nie dzisiejsza norma; 6.30: zakres ogólny u dziecka.
      if (status && (status.kind === 'range' || status.kind === 'range-general')) {
        parts.push([status.text + (status.bounds ? ' ' + status.bounds : ''), status.population, status.subject]
          .concat(status.sources || []).filter(Boolean).join(' · '));
      } else if (status && status.kind === 'recorded') {
        // Ocena zapisana z wynikiem cytowana dosłownie (ostrzeżenie kliniczne ma pierwszeństwo, decyzja 6.20).
        parts.push('ocena zapisana z wynikiem: „' + status.text + '”');
      } else if (status && (status.kind === 'invalidated' || status.kind === 'unavailable' || status.kind === 'range-invalidated' || status.kind === 'range-unavailable')) {
        parts.push(status.text + (status.detail && status.detail.length ? ' (' + status.detail.join(', ') + ')' : ''));
      }
      var comment = commentText(entry.comment);
      if (comment) parts.push('komentarz: ' + comment);
      return parts.join(' · ');
    }

    function drawChart(series, preview, pinned) {
      var points = series.chart && series.chart.points || [];
      if (!points.length) return;
      // Wykres zawsze widoczny, bez przycisku zwijania i bez objaśnienia pod nim (6.39).
      var box = add(strip, 'div', 'lab-strip-chart');
      box.id = CHART_ID;
      // Wynik formularza, który jest już w karcie, to punkt jego notatki — bez pasa „teraz” (LAB-HISTORIA 6.38).
      var current = !pinned && preview && preview.value != null && preview.unit === series.unit ? preview.value : null;
      drawSvg(box, series, chartLayout(points, current, state.lastWidth), preview, pinned ? pinned.noteId : null);
    }

    function drawSvg(box, series, layout, preview, pinnedId) {
      var entryById = {};
      series.entries.forEach(function (entry) { if (entry.noteId) entryById[entry.noteId] = entry; });
      var valueText = function (point) {
        var entry = entryById[point.noteId];
        return entry ? bareValue(entry, series.unit) : formatNumber(point.v);
      };
      var svg = svgNode(box, 'svg', { viewBox: '0 0 ' + layout.width + ' ' + layout.height, role: 'img' }, 'lab-strip-svg' + (layout.narrow ? ' is-narrow' : ''));
      var described = layout.points.map(function (point) { return formatDate(point.dateISO) + ' ' + valueText(point); });
      if (layout.now) described.push('bieżący, niezapisany wynik ' + bareValue(preview, series.unit) + ' w osobnym pasie bez daty');
      var pinnedPoint = null;
      layout.points.forEach(function (point) { if (pinnedId && point.noteId === pinnedId) pinnedPoint = point; });
      if (pinnedPoint) described.push('wynik z formularza ' + formatDate(pinnedPoint.dateISO) + ' jest już w karcie');
      svg.setAttribute('aria-label', 'Poprzednie wyniki pacjenta, ' + shortLabel(series.label) + (series.unit ? ' w ' + series.unit : '') + ', bez pasma norm: ' + described.join('; '));
      layout.ticks.forEach(function (tick) {
        svgNode(svg, 'line', { x1: layout.left, y1: tick.y, x2: layout.right, y2: tick.y }, 'lab-strip-grid');
        svgNode(svg, 'text', { x: layout.left - 6, y: tick.y + 3.5, 'text-anchor': 'end' }, 'lab-strip-tick', formatNumber(tick.value));
      });
      // Jednostka tylko w nagłówku paska („· w mIU/L”), bez pionowego podpisu przy osi (6.39).
      svgNode(svg, 'line', { x1: layout.left, y1: layout.axisY, x2: layout.right, y2: layout.axisY }, 'lab-strip-axis');
      layout.points.forEach(function (point) {
        svgNode(svg, 'line', { x1: point.x, y1: point.y, x2: point.x, y2: layout.axisY }, 'lab-strip-drop');
      });
      if (layout.points.length > 1) {
        svgNode(svg, 'polyline', { points: layout.points.map(function (point) { return point.x + ',' + point.y; }).join(' ') }, 'lab-strip-line');
      }
      layout.points.forEach(function (point) {
        var group = svgNode(svg, 'g', { 'data-note-id': point.noteId || '' }, 'lab-strip-pt' + (state.selected === point.noteId ? ' is-selected' : '')
          + (point === pinnedPoint ? ' is-pinned' : ''));
        if (state.selected === point.noteId) svgNode(group, 'circle', { cx: point.x, cy: point.y, r: 10 }, 'lab-strip-halo');
        if (point === pinnedPoint) svgNode(group, 'circle', { cx: point.x, cy: point.y, r: 9 }, 'lab-strip-pin-ring');
        svgNode(group, 'circle', { cx: point.x, cy: point.y, r: 5 }, 'lab-strip-dot' + (point.conv ? ' is-conv' : ''));
        svgNode(group, 'circle', { cx: point.x, cy: point.y, r: 12 }, 'lab-strip-hit');
        var entry = entryById[point.noteId];
        svgNode(group, 'title', null, null, formatDate(point.dateISO) + ' · ' + valueText(point) + (entry && entry.converted ? ' · zapisano: ' + recorded(entry) : ''));
        if (point.noteId) group.addEventListener('click', function () { select(point.noteId); });
      });
      var charWidth = layout.narrow ? 6.8 : 7.0, rightEdge = layout.now ? layout.now.sepX : layout.right;
      var widthOf = function (i) { return valueText(layout.points[i]).length * charWidth; };
      var valueNodes = [];
      valueLabelIndexes(layout.points, widthOf).forEach(function (i) {
        var point = layout.points[i], half = widthOf(i) / 2, x = point.x, anchor = 'middle';
        // Przy brzegu osi podpis wyrównany do punktu, żeby nie wchodził na podziałkę ani na pas „teraz”.
        if (x - half < layout.left) { anchor = 'start'; x -= 4; } else if (x + half > rightEdge) { anchor = 'end'; x += 4; }
        valueNodes.unshift(svgNode(svg, 'text', { x: x, y: point.y - (point === pinnedPoint ? 14 : 10), 'text-anchor': anchor }, 'lab-strip-val', valueText(point)));
      });
      // Przypięty punkt wyróżnia sama obwódka, bez podpisu pod datą (6.39).
      var axisNodes = [];
      if (layout.now) {
        var now = layout.now;
        svgNode(svg, 'line', { x1: now.sepX, y1: layout.top, x2: now.sepX, y2: layout.axisY }, 'lab-strip-sepline');
        svgNode(svg, 'rect', { x: now.laneX, y: layout.top, width: now.laneW, height: layout.axisY - layout.top }, 'lab-strip-lane');
        svgNode(svg, 'line', { x1: now.x, y1: now.y + 7, x2: now.x, y2: layout.axisY }, 'lab-strip-drop');
        svgNode(svg, 'circle', { cx: now.x, cy: now.y, r: 7 }, 'lab-strip-now-dot');
        valueNodes.unshift(svgNode(svg, 'text', { x: now.x, y: now.y - 14, 'text-anchor': 'middle' }, 'lab-strip-val', bareValue(preview, series.unit)));
        axisNodes.push(svgNode(svg, 'text', { x: now.x, y: layout.axisY + 18, 'text-anchor': 'middle' }, 'lab-strip-now-label', 'teraz'));
        svgNode(svg, 'text', { x: now.x, y: layout.axisY + 31, 'text-anchor': 'middle' }, 'lab-strip-now-sub', 'bez daty');
      }
      // Kolejność ważności: ostatnia data, pierwsza, pośrednie (od najnowszej).
      var dates = layout.dateLabels.map(function (label) {
        var point = layout.points[label.index];
        return { index: label.index, node: svgNode(svg, 'text', { x: point.x, y: layout.axisY + 18, 'text-anchor': label.anchor }, 'lab-strip-date', formatDate(point.dateISO)) };
      });
      var lastIndex = layout.points.length - 1;
      dates.sort(function (a, b) {
        var rank = function (d) { return d.index === lastIndex ? 0 : d.index === 0 ? 1 : 2; };
        return rank(a) - rank(b) || b.index - a.index;
      });
      pruneOverlaps(axisNodes.concat(dates.map(function (d) { return d.node; })));
      pruneOverlaps(valueNodes);
    }

    // Oszacowanie szerokości podpisów zależy od kroju; po narysowaniu mierzymy prawdziwe prostokąty
    // i usuwamy podpis, który mimo to nachodzi na ważniejszy (kolejność listy = ważność).
    function pruneOverlaps(nodes) {
      var kept = [];
      nodes.forEach(function (node) {
        if (!node || typeof node.getBBox !== 'function') return;
        var box;
        try { box = node.getBBox(); } catch (_) { return; }
        if (!box || !(box.width > 0)) return;
        var clash = kept.some(function (other) {
          return box.x < other.x + other.width + 4 && other.x < box.x + box.width + 4
            && box.y < other.y + other.height && other.y < box.y + box.height;
        });
        if (clash) node.parentNode.removeChild(node);
        else kept.push(box);
      });
    }

    // ── Karta pacjenta na zakładce „Badania” (decyzja 6.15) ──
    function openCard() {
      var pid = patientId();
      // Identyfikator z sessionStorage, nigdy z adresu; inny pacjent niż na pasku = najpierw odświeżenie.
      if (!pid || pid !== state.pid) { schedule(); return; }
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

    function bind() {
      ['labSubstance', 'labValue', 'labUnit', 'labUnitTarget'].forEach(function (id) {
        var field = el(id);
        if (field) { field.addEventListener('input', schedule); field.addEventListener('change', schedule); }
      });
      var big = el('labResultBig');
      if (big && typeof w.MutationObserver === 'function') new w.MutationObserver(schedule).observe(big, { childList: true, characterData: true, subtree: true });
      ['vilda:session-changed', 'vilda:auth-loaded', 'vilda:patient-loaded', 'vilda:lab-substance-changed'].forEach(function (type) {
        doc.addEventListener(type, schedule);
      });
      // Notatki zmienione w innej ramce albo karcie przeglądarki: sejf daje tam tylko sygnał bez notatki (onPatientNoteChanged
      // działa w ramce zapisu), więc seria czytana od nowa — tak jak w module przypięcia, żeby przycisk i pasek mówiły to samo.
      var staleNotes = function () { state.noteGen += 1; schedule(); };
      doc.addEventListener('vilda:lab-pin-state-changed', staleNotes);
      doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'visible') staleNotes(); });
      try {
        if (typeof w.BroadcastChannel === 'function') new w.BroadcastChannel('vilda-notes').addEventListener('message', function (event) {
          if (!event || !event.data || event.data.type === 'note-changed') staleNotes();
        });
      } catch (_) { /* bez kanału: zostaje focus i storage */ }
      if (typeof w.addEventListener === 'function') {
        w.addEventListener('vilda:user-state-cleared', forget);
        w.addEventListener('storage', function (event) {
          if (event && event.key === NOTE_PING_KEY) staleNotes();
          else if (!event || event.key == null || event.key === PATIENT_KEY) schedule();
        });
        w.addEventListener('focus', staleNotes);
        w.addEventListener('resize', function () {
          if (strip && strip.classList.contains('is-on') && chartLayout([], null, hostWidth()).width !== state.lastWidth) schedule();
        });
      }
      schedule();
      // Jak wiersz przypięcia: druga próba po załadowaniu stosu konta przez most sesji.
      w.setTimeout(schedule, 1200);
    }

    return { bind: bind, refresh: run, state: function () { return state; } };
  }

  var instance = null;
  return Object.freeze({
    version: '1.5.0',
    start: function () {
      if (instance || !win || !win.document) return instance;
      instance = create(win);
      var doc = win.document;
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', instance.bind);
      else instance.bind();
      return instance;
    },
    // Tylko do testów: natychmiastowy przebieg bez opóźnienia.
    refresh: function () { if (instance) instance.refresh(); },
    _internal: Object.freeze({ chartLayout: chartLayout, dateLabels: dateLabels, niceStep: niceStep, valueLabelIndexes: valueLabelIndexes, plural: plural })
  });
});
