/* Baza pacjentów: presentation and temporary navigation state only.
 * Patient records, list rules and mutations remain in VildaVault/AuthUI.
 * The „Statystyki” view (P-BAZA-STATYSTYKI) only reads: patient headers for age and sex,
 * and — on request — the newest saved state of each card for data completeness.
 * This file is the readable browser source; it has no build step. */
(function (win) {
  'use strict';
  if (!win || win.VildaPatientsList) return;

  const SORTS = [
    ['recent-desc', 'Ostatnio zapisani'],
    ['name-asc', 'Alfabetycznie A–Z'],
    ['name-desc', 'Alfabetycznie Z–A']
  ];
  const SOURCE_LABELS = { all: 'Wszyscy', base: 'Z bazy', ext: 'Spoza bazy', lists: 'Listy' };
  const SVG = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
    note: '<path d="M5 3h10l4 4v14H5Z"/><path d="M14 3v5h5M8 12h8M8 16h8"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>'
  };

  /* P-BAZA-STATYSTYKI, etap 1 (decyzja właściciela 2026-11-23): statystyki opisowe bazy —
   * wiek, płeć i kompletność danych. Model jest czysty (bez DOM i bez sejfu), żeby dało się
   * go testować wprost. Zasady:
   *   - liczą się wyłącznie pacjenci z bazy; osoby „spoza bazy” nie mają kart;
   *   - wiek to wiek NA DZIŚ z pełnej daty urodzenia (ta sama zasada, co w wierszu listy:
   *     wiek z zapisu pomiaru ani sam rok urodzenia nie udają wieku bieżącego) — pacjent bez
   *     daty urodzenia nie wchodzi do średniej, mediany ani przedziałów i jest wykazany osobno;
   *   - przedziały wieku w pełnych latach: 0–2, 3–5, 6–9, 10–13, 14–17, 18+. */
  const AGE_BANDS = [
    { key: '0-2', from: 0, to: 2, label: '0–2 lata' },
    { key: '3-5', from: 3, to: 5, label: '3–5 lat' },
    { key: '6-9', from: 6, to: 9, label: '6–9 lat' },
    { key: '10-13', from: 10, to: 13, label: '10–13 lat' },
    { key: '14-17', from: 14, to: 17, label: '14–17 lat' },
    { key: '18+', from: 18, to: null, label: '18+ lat' }
  ];
  function sexKey(value) { return value === 'M' ? 'M' : value === 'F' || value === 'K' ? 'F' : null; }
  // Wiek w pełnych miesiącach na dobę lokalną — jak calcAgeFromDOB w sejfie (DOB-AGE-1).
  function monthsFromDob(dobISO, now) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dobISO || ''));
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
    if (now.getDate() < day) months -= 1;
    return months >= 0 ? months : null;
  }
  function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
  function median(values) {
    if (!values.length) return null;
    const ordered = values.slice().sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  }
  function demographics(patientRecords, options) {
    const settings = options || {};
    const now = settings.now instanceof Date ? settings.now : new Date();
    const ageOf = typeof settings.ageMonths === 'function' ? settings.ageMonths : (dobISO) => monthsFromDob(dobISO, now);
    const base = (Array.isArray(patientRecords) ? patientRecords : []).filter((record) => record && !record.__ext);
    const yearAgo = new Date(now.getTime()); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const bands = AGE_BANDS.map((band) => ({ key: band.key, label: band.label, M: 0, F: 0, unknown: 0, total: 0, ids: [] }));
    const ages = [], agesBySex = { M: [], F: [] };
    const sex = { M: 0, F: 0, unknown: 0 }, sexIds = { M: [], F: [] };
    const missingDob = [], missingSex = [];
    let recent = 0;
    base.forEach((record) => {
      const header = record.header || {};
      const key = sexKey(header.sex);
      if (key) { sex[key] += 1; sexIds[key].push(record.patientId); } else { sex.unknown += 1; missingSex.push(record.patientId); }
      const saved = record.lastSavedAtISO ? new Date(record.lastSavedAtISO).getTime() : NaN;
      if (Number.isFinite(saved) && saved >= yearAgo.getTime()) recent += 1;
      const computed = header.dobISO ? ageOf(header.dobISO) : null;
      const months = typeof computed === 'number' && Number.isFinite(computed) && computed >= 0 ? computed : null;
      if (months === null) { missingDob.push(record.patientId); return; }
      ages.push(months);
      if (key) agesBySex[key].push(months);
      const years = Math.floor(months / 12);
      const band = bands[AGE_BANDS.findIndex((item) => years >= item.from && (item.to === null || years <= item.to))];
      band[key || 'unknown'] += 1; band.total += 1; band.ids.push(record.patientId);
    });
    return {
      total: base.length, recent, withAge: ages.length,
      meanMonths: mean(ages), medianMonths: median(ages),
      minMonths: ages.length ? Math.min.apply(null, ages) : null,
      maxMonths: ages.length ? Math.max.apply(null, ages) : null,
      sex, sexIds, meanMonthsBySex: { M: mean(agesBySex.M), F: mean(agesBySex.F) },
      bands, missingDob, missingSex
    };
  }
  /* Kompletność jednej karty — z najnowszego zapisu (payload). Trzy pytania, od których zależy,
   * czy pacjent wejdzie do kolejnych statystyk: czy da się policzyć tempo wzrastania (co najmniej
   * dwa pomiary wzrostu w różnym wieku), czy jest wzrost obojga rodziców i czy jest masa urodzeniowa. */
  function positive(value) {
    if (value == null || String(value).trim() === '') return false;
    const parsed = Number(String(value).trim().replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0;
  }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
  function cardCompleteness(payload) {
    const data = payload && typeof payload === 'object' ? payload : {};
    const heights = new Set();
    // Wiersze historii niosą wiek łączny w miesiącach; punkty leczenia i formularz — lata + miesiące.
    const historyRow = (row) => {
      if (!row || !positive(row.height)) return;
      const months = finite(row.ageMonths) !== null ? row.ageMonths : finite(row.ageYears) !== null ? row.ageYears * 12 : null;
      if (months !== null) heights.add(Math.round(months));
    };
    const pointRow = (row) => {
      if (!row || !positive(row.height)) return;
      if (finite(row.ageYears) === null && finite(row.ageMonths) === null) return;
      heights.add(Math.round((finite(row.ageYears) || 0) * 12 + (finite(row.ageMonths) || 0)));
    };
    const list = (value) => Array.isArray(value) ? value : [];
    list(data.advanced && data.advanced.data && data.advanced.data.measurements).forEach(historyRow);
    list(data.growthBasic && data.growthBasic.data && data.growthBasic.data.measurements).forEach(historyRow);
    list(data.ghTherapyPoints).forEach(pointRow);
    list(data.obesityTherapyPoints).forEach(pointRow);
    const user = data.user || {};
    const formAge = (value) => value == null || String(value).trim() === '' ? null : finite(Number(value));
    pointRow({ height: user.height, ageYears: formAge(user.age), ageMonths: formAge(user.ageMonths) });
    const advanced = data.advanced || {}, birth = data.birth || {}, perinatal = data.perinatal || {};
    return {
      measurements: heights.size >= 2,
      parents: positive(advanced.motherHeight) && positive(advanced.fatherHeight),
      birthWeight: positive(birth.weight) || positive(perinatal.birthWeightG)
    };
  }
  /* P-BAZA-STATYSTYKI, etap 2 (decyzja właściciela 2026-11-24): leczenie hormonem wzrostu.
   * Model niczego nie liczy własnym wzorem: tempo daje silnik VildaTempoWzrastania (odcinek),
   * kursy leczenia — VildaTrajectoryAnalysis.ghKursy, hSDS — VildaSdsWzrostu. Zależności są
   * podawane z zewnątrz (deps), żeby model dało się sprawdzić na prawdziwych silnikach bez DOM.
   *
   * Definicje (te same pojęcia, co w reszcie aplikacji):
   *   - leczony = karta ma co najmniej jeden punkt leczenia GH (Włączenie, Kontynuacja, Zakończenie);
   *   - liczy się PIERWSZY kurs z punktem Włączenia (leczenie wznowione po Zakończeniu to osobny
   *     kurs i nie jest „pierwszym rokiem”);
   *   - odcinek roczny = dwa pomiary odległe o 9–15 mies., najbliżej 12 (okno roczne silnika tempa);
   *   - 1. rok leczenia: od Włączenia do takiej kontroli; kolejne lata — łańcuchem od poprzedniej;
   *   - tempo przed leczeniem: pomiar 9–15 mies. przed Włączeniem (najbliżej 12) → Włączenie;
   *   - zmiana hSDS w 1. roku: hSDS kontroli − hSDS Włączenia, na siatce zapisanej w karcie.
   * Pacjent bez pary w oknie nie wchodzi do średniej i jest wykazany z powodem. */
  function therapyAge(point) {
    if (!point || (finite(point.ageYears) === null && finite(point.ageMonths) === null)) return null;
    return Math.round((finite(point.ageYears) || 0) * 12 + (finite(point.ageMonths) || 0));
  }
  function heightOf(value) {
    if (!positive(value)) return null;
    return Number(String(value).trim().replace(/\s+/g, '').replace(',', '.'));
  }
  function annualWindow(tempo) {
    const limits = tempo && tempo.P;
    if (!limits || typeof tempo.odcinek !== 'function') return null;
    const min = finite(limits.ROCZNE_OKNO_MIN_M), max = finite(limits.ROCZNE_OKNO_MAX_M), target = finite(limits.ROCZNE_CEL_M);
    return min === null || max === null || target === null ? null : { min, max, target };
  }
  // Punkt z okna rocznego, najbliższy 12 mies.; przy równej odległości — bliższy w czasie.
  function annualPick(points, gapOf, range) {
    let best = null, distance = Infinity, bestGap = Infinity;
    points.forEach((point) => {
      const gap = gapOf(point);
      if (gap < range.min || gap > range.max) return;
      const away = Math.abs(gap - range.target);
      if (away < distance || (away === distance && gap < bestGap)) { best = point; distance = away; bestGap = gap; }
    });
    return best;
  }
  function ghPatient(payload, deps) {
    const data = payload && typeof payload === 'object' ? payload : {};
    const tools = deps || {};
    const raw = (Array.isArray(data.ghTherapyPoints) ? data.ghTherapyPoints : [])
      .filter((point) => point && (point.type === 'start' || point.type === 'continue' || point.type === 'end'));
    if (!raw.length) return null;
    const programOf = (points) => {
      const found = points.find((point) => point && String(point.program || '').trim());
      return found ? String(found.program).trim() : '';
    };
    const result = { program: '', firstYear: null, years: [], before: null, deltaSds: null, reason: null };
    let coursePoints = null, start = null;
    if (typeof tools.kursy === 'function') {
      const course = (tools.kursy(raw) || []).find((item) => item && item.wlaczenie);
      if (course) { coursePoints = course.punkty.slice(); start = course.wlaczenie; }
    } else {
      const ordered = raw.filter((point) => therapyAge(point) !== null).sort((x, y) => therapyAge(x) - therapyAge(y));
      const from = ordered.findIndex((point) => point.type === 'start');
      if (from !== -1) {
        const rest = ordered.slice(from), end = rest.findIndex((point) => point.type === 'end');
        coursePoints = end === -1 ? rest : rest.slice(0, end + 1); start = rest[0];
      }
    }
    result.program = start && String(start.program || '').trim() ? String(start.program).trim() : programOf(coursePoints || raw);
    const startAge = start ? therapyAge(start) : null, startHeight = start ? heightOf(start.height) : null;
    if (!start || startAge === null || startHeight === null) { result.reason = 'no-start'; return result; }
    const range = annualWindow(tools.tempo);
    if (!range) { result.reason = 'no-engine'; return result; }
    const measured = (point) => ({ ageMonths: therapyAge(point), height: heightOf(point.height), point });
    const later = coursePoints.map(measured).filter((item) => item.ageMonths !== null && item.height !== null && item.ageMonths > startAge)
      .sort((x, y) => x.ageMonths - y.ageMonths);
    const velocity = (from, to) => {
      const segment = tools.tempo.odcinek({ ageMonths: from.ageMonths, height: from.height }, { ageMonths: to.ageMonths, height: to.height });
      return segment && finite(segment.cmPerYear) !== null ? segment.cmPerYear : null;
    };
    let anchor = { ageMonths: startAge, height: startHeight }, first = null;
    for (;;) {
      const from = anchor;
      const next = annualPick(later, (item) => item.ageMonths - from.ageMonths, range);
      const value = next ? velocity(from, next) : null;
      if (value === null) break;
      result.years.push(value);
      if (!first) first = next;
      anchor = next;
    }
    result.firstYear = result.years.length ? result.years[0] : null;
    if (result.firstYear === null) result.reason = later.some((item) => item.ageMonths - startAge >= range.min) ? 'no-control' : 'too-early';

    // Pomiary sprzed Włączenia: wiersze historii (wiek łączny w miesiącach) i punkty leczenia (lata + miesiące).
    const earlier = new Map();
    const keep = (ageMonths, height) => {
      if (ageMonths === null || height === null || ageMonths >= startAge) return;
      earlier.set(Math.round(ageMonths), { ageMonths: Math.round(ageMonths), height });
    };
    const rows = (value) => Array.isArray(value) ? value : [];
    rows(data.ghTherapyPoints).forEach((point) => { if (point) keep(therapyAge(point), heightOf(point.height)); });
    rows(data.obesityTherapyPoints).forEach((point) => { if (point) keep(therapyAge(point), heightOf(point.height)); });
    [data.advanced && data.advanced.data && data.advanced.data.measurements, data.growthBasic && data.growthBasic.data && data.growthBasic.data.measurements]
      .forEach((list) => rows(list).forEach((row) => {
        if (!row) return;
        keep(finite(row.ageMonths) !== null ? row.ageMonths : finite(row.ageYears) !== null ? row.ageYears * 12 : null, heightOf(row.height));
      }));
    const prior = annualPick(Array.from(earlier.values()), (item) => startAge - item.ageMonths, range);
    if (prior) result.before = velocity(prior, { ageMonths: startAge, height: startHeight });

    const sex = sexKey(data.user && data.user.sex);
    if (first && sex && typeof tools.sds === 'function') {
      const source = data.zscore && /^(OLAF|WHO|PALCZEWSKA)$/i.test(String(data.zscore.dataSource || '')) ? String(data.zscore.dataSource).toUpperCase() : tools.defaultSource || null;
      const population = data.clinical && data.clinical.downSyndrome === true ? 'DS' : 'OGOLNA';
      const at = (item) => tools.sds({ wzrost: item.height, plec: sex, wiekMies: item.ageMonths, zrodlo: source, populacja: population });
      const before = at({ ageMonths: startAge, height: startHeight }), after = at(first);
      if (finite(before) !== null && finite(after) !== null) result.deltaSds = after - before;
    }
    return result;
  }
  const GH_REASONS = [
    ['no-start', 'brak Włączenia ze wzrostem'],
    ['no-control', 'brak kontroli po 9–15 mies.'],
    ['too-early', 'leczenie krótsze niż 9 mies.']
  ];
  const SMALL_GROUP = 5;
  function ghCohort(entries) {
    const list = (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.gh);
    const summary = (values) => ({ n: values.length, mean: mean(values), median: median(values) });
    const paired = (items) => {
      const both = items.filter((entry) => entry.gh.firstYear !== null && entry.gh.before !== null);
      return { n: both.length, before: mean(both.map((entry) => entry.gh.before)), first: mean(both.map((entry) => entry.gh.firstYear)) };
    };
    const withFirst = list.filter((entry) => entry.gh.firstYear !== null);
    const programs = new Map();
    list.forEach((entry) => {
      const key = entry.gh.program || 'bez programu';
      if (!programs.has(key)) programs.set(key, []);
      programs.get(key).push(entry);
    });
    const years = [];
    for (let index = 0; index < 4; index += 1) {
      const values = list.filter((entry) => entry.gh.years.length > index).map((entry) => entry.gh.years[index]);
      if (!values.length) break;
      years.push({ year: index + 1, n: values.length, mean: mean(values) });
    }
    const missing = {};
    GH_REASONS.forEach(([key]) => { missing[key] = list.filter((entry) => entry.gh.reason === key).map((entry) => entry.id); });
    const delta = list.filter((entry) => entry.gh.deltaSds !== null).map((entry) => entry.gh.deltaSds);
    return {
      treated: list.length, ids: list.map((entry) => entry.id),
      first: Object.assign(summary(withFirst.map((entry) => entry.gh.firstYear)), { ids: withFirst.map((entry) => entry.id) }),
      paired: paired(list), deltaSds: summary(delta), years, missing,
      programs: Array.from(programs.entries()).map(([program, items]) => {
        const done = items.filter((entry) => entry.gh.firstYear !== null);
        return { program, treated: items.length, ids: items.map((entry) => entry.id), n: done.length,
          mean: mean(done.map((entry) => entry.gh.firstYear)), paired: paired(items), small: done.length > 0 && done.length < SMALL_GROUP };
      }).sort((x, y) => y.treated - x.treated || x.program.localeCompare(y.program, 'pl'))
    };
  }
  function formatVelocity(value) { return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(1).replace('.', ','); }
  function formatDelta(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const text = Math.abs(value).toFixed(2).replace('.', ',');
    return (Number(Math.abs(value).toFixed(2)) === 0 ? '' : value > 0 ? '+' : '−') + text;
  }
  const CARD_ITEMS = [
    ['measurements', 'Co najmniej 2 pomiary wzrostu'],
    ['parents', 'Wzrost obojga rodziców'],
    ['birthWeight', 'Masa urodzeniowa']
  ];
  function formatAge(months) {
    if (months === null || months === undefined || !Number.isFinite(months)) return '—';
    if (months < 12) return Math.round(months) + ' mies.';
    return (months / 12).toFixed(1).replace('.', ',') + ' roku';
  }
  function percent(part, whole) { return whole ? Math.round(part / whole * 100) : 0; }
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function create(options) {
    const opts = options || {};
    const doc = win.document;
    const vault = opts.vault;
    const patients = Array.isArray(opts.patients) ? opts.patients.slice() : [];
    const byId = new Map(patients.map((patient) => [patient.patientId, patient]));
    const initial = opts.initialState || {};
    const normalize = opts.normalize || ((value) => String(value || '').toLocaleLowerCase('pl'));
    const state = {
      filter: ['all', 'base', 'ext', 'lists', 'dup'].includes(initial.filter) ? initial.filter : 'all',
      listId: initial.listId || null,
      query: initial.query || '',
      listQuery: initial.listQuery || '',
      sourceFilter: ['all', 'base', 'ext'].includes(initial.sourceFilter) ? initial.sourceFilter : 'all',
      sort: SORTS.some(([id]) => id === initial.sort) ? initial.sort : 'recent-desc',
      adding: Boolean(initial.adding),
      selected: Object.assign({}, initial.selected || {}),
      catalogScrollTop: Number(initial.catalogScrollTop) || 0,
      listScrollTop: Number(initial.listScrollTop) || 0,
      // P-BAZA-STATYSTYKI: widok „Statystyki”, grupa wybrana z wykresu i wynik sprawdzenia kart.
      view: initial.view === 'stats' ? 'stats' : 'list',
      group: initial.group && Array.isArray(initial.group.ids) ? { label: String(initial.group.label || ''), ids: initial.group.ids.slice() } : null,
      cards: initial.cards && typeof initial.cards === 'object' ? initial.cards : null
    };
    // Earlier versions used the same input for names of lists and patients.
    if (state.filter === 'lists' && !state.listId && !Object.prototype.hasOwnProperty.call(initial, 'listQuery')) {
      state.listQuery = state.query;
      state.query = '';
    }
    let destroyed = false;
    let mounted = false;
    let finalSnapshot = null;
    let readSequence = 0;
    let listCache = null;
    let catalogPromise = null;
    let memberCache = null;
    let listReader = null;
    const memberPromises = new Map();
    let busy = Boolean(opts.loading);
    let rowWindow = null;
    // P-BAZA-STATYSTYKI: sprawdzanie kart (odszyfrowanie najnowszego zapisu każdego pacjenta).
    let cardsRun = 0;        // żeton bieżącego przebiegu; zmiana żetonu przerywa pętlę
    let cardsBusy = null;    // { done, total } w trakcie przebiegu
    let cardsHost = null;    // wiersze kompletności kart w bieżącym renderze
    let cardsBar = null;     // pasek „z kart”: zachęta, postęp albo czas policzenia
    let ghHost = null;       // sekcja „Leczenie hormonem wzrostu”
    let ghHint = null;
    let cardsProgress = null;
    const timeFormatter = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
    const rowHeights = new Map(Array.isArray(initial.rowHeights) ? initial.rowHeights : []);
    let measuredWidth = Number(initial.measuredWidth) || 0;
    const dateFormatter = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let picker = null;
    let pickerBody = null;
    let pickerInput = null;
    let pickerReturnFocus = null;
    let unregisterBack = null;
    let observer = null;
    let editorObserver = null;
    let pendingRefresh = false;
    let restoreScroll = Number(initial.scrollTop) || 0;
    let restoreAnchor = initial.rowAnchor || null;
    let restoreRowFocus = initial.rowFocus || null;
    let focusTimer = null;
    const media = typeof win.matchMedia === 'function' ? win.matchMedia('(min-width: 992px)') : null;
    let desktop = media ? media.matches : (win.innerWidth || 1024) >= 992;

    function el(tag, className, text) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = String(text);
      return node;
    }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function icon(name) {
      const node = el('span', 'pt-icon');
      node.setAttribute('aria-hidden', 'true');
      node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + SVG[name] + '</svg>';
      return node;
    }
    function button(className, text, action) {
      const node = el('button', className, text);
      node.type = 'button';
      if (action) node.addEventListener('click', action);
      return node;
    }
    function textButton(className, text, action, iconName) {
      const node = button(className, null, action);
      if (iconName) node.appendChild(icon(iconName));
      node.appendChild(el('span', null, text));
      return node;
    }
    function alive() {
      if (destroyed || !mounted || !root.isConnected) return false;
      return typeof opts.isCurrent !== 'function' || opts.isCurrent();
    }
    function mayUseLists() { return typeof opts.hasListAccess === 'function' && Boolean(opts.hasListAccess()); }
    function guardedRead(sequence) { return alive() && sequence === readSequence; }
    function peopleLabel(count) {
      return count + ' ' + (count === 1 ? 'osoba' : count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14) ? 'osoby' : 'osób');
    }
    function isCatalog() { return state.filter === 'lists' && !state.listId; }
    function currentSearch() { return isCatalog() ? state.listQuery : state.query; }
    function describeList(list) {
      if (!list.rule) return 'Lista ręczna';
      const rule = typeof opts.describeRule === 'function' ? opts.describeRule(list.rule) : '';
      return 'Automatyczna' + (rule ? ' · ' + rule : '');
    }
    function sorted(rows, sort) {
      if (typeof opts.sortPatients === 'function') return opts.sortPatients(rows, sort || state.sort);
      return rows.slice().sort((a, b) => String(a.header && a.header.name || '').localeCompare(String(b.header && b.header.name || ''), 'pl'));
    }
    function matchesName(patient, query) {
      return !query || normalize(patient.header && patient.header.name || '').indexOf(normalize(query)) !== -1;
    }
    function sourceMatches(patient, source) {
      return source !== 'base' && source !== 'ext' || (source === 'ext') === Boolean(patient.__ext);
    }

    const root = el('div', 'vilda-auth-screen vilda-auth-patients vilda-patients2 vilda-patient-database');
    root.setAttribute('data-patient-database', 'list');
    const header = el('div', 'pt-head');
    const titleRow = el('div', 'pt-title-row');
    const titles = el('div', 'pt-titles');
    const home = textButton('pt-home', 'Wróć do strony głównej', () => { if ((!busy || opts.loading) && opts.onHome) opts.onHome(); }, 'back');
    const title = el('h2', 'vilda-auth-title', 'Baza pacjentów');
    const total = el('p', 'pt-total', peopleLabel(patients.length) + ' · ' + patients.filter((p) => !p.__ext).length + ' z bazy · ' + patients.filter((p) => p.__ext).length + ' spoza bazy');
    header.appendChild(home); titles.appendChild(title); titles.appendChild(total);
    const add = button('pt-add pt-primary', null, () => { if (!busy && opts.onAddPatient) opts.onAddPatient(); });
    add.setAttribute('aria-label', 'Dodaj pacjenta');
    add.appendChild(el('span', 'pt-plus', '+'));
    add.appendChild(el('span', 'pt-add-full', 'Dodaj pacjenta'));
    add.appendChild(el('span', 'pt-add-short', 'Dodaj'));
    const viewSwitch = el('div', 'pt-viewseg');
    viewSwitch.setAttribute('role', 'group'); viewSwitch.setAttribute('aria-label', 'Widok Bazy pacjentów');
    const viewNodes = {};
    [['list', 'Lista'], ['stats', 'Statystyki']].forEach(([key, label]) => {
      const node = button('', label, () => chooseView(key));
      node.setAttribute('data-view', key); node.setAttribute('aria-pressed', 'false');
      viewNodes[key] = node; viewSwitch.appendChild(node);
    });
    titleRow.appendChild(titles); titleRow.appendChild(viewSwitch); titleRow.appendChild(add); header.appendChild(titleRow);

    const toolbar = el('div', 'pt-toolbar');
    const searchBox = el('div', 'pt-search');
    searchBox.appendChild(icon('search'));
    const search = el('input');
    search.type = 'search'; search.autocomplete = 'off'; search.spellcheck = false;
    search.setAttribute('aria-label', 'Szukaj po imieniu i nazwisku');
    const clearSearch = textButton('pt-clear', '', () => {
      if (isCatalog()) state.listQuery = ''; else state.query = '';
      render(); search.focus();
    }, 'close');
    clearSearch.setAttribute('aria-label', 'Wyczyść wyszukiwanie');
    searchBox.appendChild(search); searchBox.appendChild(clearSearch); toolbar.appendChild(searchBox);
    const sourceTabs = el('div', 'pt-seg');
    sourceTabs.setAttribute('role', 'group'); sourceTabs.setAttribute('aria-label', 'Widok bazy');
    const tabNodes = {};
    ['all', 'base', 'ext', 'lists'].forEach((key) => {
      const tab = button('', SOURCE_LABELS[key], () => chooseTab(key));
      tab.setAttribute('data-filter', key);
      tab.setAttribute('aria-pressed', 'false');
      // Keep the accessible name stable for existing keyboard navigation.
      tab.setAttribute('aria-label', SOURCE_LABELS[key]);
      tab.appendChild(el('span', 'pt-tab-count'));
      tabNodes[key] = tab; sourceTabs.appendChild(tab);
    });
    toolbar.appendChild(sourceTabs);
    const listsTrigger = textButton('pt-lists-trigger pt-secondary', 'Listy', openPicker, 'note');
    listsTrigger.setAttribute('aria-haspopup', 'dialog'); toolbar.appendChild(listsTrigger);
    const sortWrap = el('div', 'pt-sortwrap');
    const sortButton = button('pt-sortpill pt-secondary');
    sortButton.setAttribute('aria-haspopup', 'menu'); sortButton.setAttribute('aria-expanded', 'false');
    const sortLabel = el('span', 'sl'); sortButton.appendChild(sortLabel); sortButton.appendChild(icon('down'));
    const sortMenu = el('div', 'pt-sortmenu'); sortMenu.setAttribute('role', 'menu'); sortMenu.hidden = true;
    SORTS.forEach(([id, label]) => {
      const item = button('pt-sortopt', label, () => {
        if (busy) return;
        state.sort = id;
        if (typeof opts.onSortChange === 'function') opts.onSortChange(id);
        closeSort(); render(); scroll.scrollTop = 0; sortButton.focus();
      });
      item.setAttribute('data-s', id); item.setAttribute('role', 'menuitemradio');
      sortMenu.appendChild(item);
    });
    sortButton.addEventListener('click', () => {
      sortMenu.hidden = !sortMenu.hidden;
      sortButton.setAttribute('aria-expanded', String(!sortMenu.hidden));
      if (!sortMenu.hidden && sortMenu.firstChild) sortMenu.firstChild.focus();
    });
    sortWrap.appendChild(sortButton); sortWrap.appendChild(sortMenu); toolbar.appendChild(sortWrap);
    const newList = button('pl-new pt-primary', '+ Nowa lista', () => editList(null)); toolbar.appendChild(newList);
    const count = el('div', 'pt-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    toolbar.appendChild(count); header.appendChild(toolbar); root.appendChild(header);
    const duplicates = el('div', 'pt-dupbar');
    const duplicateText = el('span', 'lt');
    const duplicateButton = button('pt-secondary', 'Przejrzyj', () => {
      if (busy) return;
      state.filter = state.filter === 'dup' ? 'all' : 'dup'; state.listId = null;
      render(); scroll.scrollTop = 0;
    });
    duplicates.appendChild(duplicateText); duplicates.appendChild(duplicateButton); root.appendChild(duplicates);
    const groupBar = el('div', 'pt-groupbar');
    const groupText = el('span', 'lt');
    const groupBack = button('pt-secondary', '← Statystyki', () => { if (!busy) { state.group = null; chooseView('stats'); } });
    const groupClear = button('pt-secondary', 'Pokaż wszystkich', () => { if (!busy) { state.group = null; render(); scroll.scrollTop = 0; } });
    groupBar.appendChild(groupText); groupBar.appendChild(groupBack); groupBar.appendChild(groupClear); root.appendChild(groupBar);
    if (opts.legacyNotice) root.appendChild(opts.legacyNotice);
    const scroll = el('div', 'pt-scroll'); root.appendChild(scroll);
    const footer = el('div', 'pt-list-footer');
    const footerCount = el('span');
    footer.appendChild(footerCount); footer.appendChild(el('span', null, 'Kliknięcie nazwiska otwiera kartę pacjenta ↗'));
    root.appendChild(footer);

    function closeSort() { sortMenu.hidden = true; sortButton.setAttribute('aria-expanded', 'false'); }
    function backgroundDownloadClick(event) {
      const target = event && event.target;
      // Automatic backups use a synthetic blob download; they do not represent
      // the user choosing another part of the interface.
      return Boolean(event && event.isTrusted === false && target && target.nodeType === 1
        && target.tagName === 'A' && target.hasAttribute('download')
        && (target.getAttribute('href') || '').startsWith('blob:'));
    }
    function outsideSort(event) {
      if (backgroundDownloadClick(event)) return;
      if (!sortWrap.contains(event.target)) closeSort();
    }
    function keyboardSort(event) {
      if (sortMenu.hidden) return;
      const items = Array.from(sortMenu.querySelectorAll('button'));
      const index = items.indexOf(doc.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); closeSort(); sortButton.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        if (items[next]) items[next].focus();
      }
    }
    function syncControls() {
      root.setAttribute('data-layout', desktop ? 'desktop' : 'compact');
      root.setAttribute('aria-busy', String(busy));
      const stats = state.view === 'stats';
      root.setAttribute('data-view', stats ? 'stats' : 'list');
      Object.keys(viewNodes).forEach((key) => {
        const active = state.view === key;
        viewNodes[key].classList.toggle('on', active);
        viewNodes[key].setAttribute('aria-pressed', String(active));
        viewNodes[key].disabled = busy;
      });
      viewSwitch.hidden = Boolean(opts.loading);
      toolbar.hidden = stats;
      const grouped = !stats && Boolean(state.group) && ['all', 'base', 'ext'].includes(state.filter);
      groupBar.hidden = !grouped;
      if (grouped) groupText.textContent = 'Grupa ze statystyk: ' + state.group.label + ' · ' + peopleLabel(state.group.ids.length);
      groupBack.disabled = busy; groupClear.disabled = busy;
      Object.keys(tabNodes).forEach((key) => {
        const active = state.filter === key;
        tabNodes[key].classList.toggle('on', active);
        tabNodes[key].setAttribute('aria-pressed', String(active));
        tabNodes[key].hidden = key === 'lists' && !desktop;
        tabNodes[key].disabled = busy;
      });
      const counts = { all: patients.length, base: patients.filter((p) => !p.__ext).length, ext: patients.filter((p) => p.__ext).length, lists: listCache ? listCache.length : null };
      Object.keys(tabNodes).forEach((key) => { tabNodes[key].querySelector('.pt-tab-count').textContent = counts[key] == null ? '' : String(counts[key]); });
      listsTrigger.hidden = desktop;
      listsTrigger.disabled = busy;
      newList.hidden = !(desktop && isCatalog() && mayUseLists());
      newList.disabled = busy;
      sortWrap.hidden = isCatalog() || state.filter === 'dup';
      sortButton.disabled = busy;
      sortLabel.textContent = SORTS.find(([id]) => id === state.sort)[1];
      Array.from(sortMenu.querySelectorAll('button')).forEach((node) => {
        const checked = node.getAttribute('data-s') === state.sort;
        node.classList.toggle('on', checked); node.setAttribute('aria-checked', String(checked));
      });
      search.value = currentSearch(); search.disabled = busy;
      const hint = isCatalog() ? 'Szukaj listy' : state.listId ? 'Szukaj pacjenta na liście' : 'Szukaj po imieniu i nazwisku';
      search.placeholder = isCatalog() ? 'Szukaj listy' : 'Imię lub nazwisko…'; search.setAttribute('aria-label', hint); clearSearch.hidden = !search.value; clearSearch.disabled = busy;
      home.disabled = busy && !opts.loading; add.disabled = busy;
      total.hidden = Boolean(opts.loading);
      refreshDuplicates();
      footer.hidden = Boolean(opts.loading) || stats || isCatalog() || state.filter === 'dup';
      syncBack();
    }
    function refreshDuplicates() {
      const number = Number(opts.duplicates && opts.duplicates.count) || 0;
      duplicates.hidden = !number || state.filter === 'lists' || state.view === 'stats';
      duplicateText.textContent = 'Podobne nazwiska · ' + number + (number === 1 ? ' grupa do sprawdzenia' : ' grup do sprawdzenia');
      duplicateButton.textContent = state.filter === 'dup' ? '← Wróć do bazy' : 'Przejrzyj';
      duplicateButton.disabled = busy;
    }
    function chooseTab(key) {
      if (busy) return;
      if (key === 'lists' && !desktop) { openPicker(); return; }
      state.filter = key; state.listId = null; state.adding = false; state.selected = {};
      state.sourceFilter = 'all'; state.group = null; memberCache = null; closeSort(); closePicker(false);
      render(); scroll.scrollTop = 0;
    }
    function chooseView(key) {
      if (busy || state.view === key) return;
      closeSort(); closePicker(false);
      state.view = key === 'stats' ? 'stats' : 'list';
      if (state.view === 'stats') { state.adding = false; state.selected = {}; }
      render(); scroll.scrollTop = 0;
      const node = viewNodes[state.view];
      if (node && !root.contains(doc.activeElement)) node.focus();
    }
    // Wybór słupka albo wiersza „brakuje” otwiera zwykłą listę zawężoną do tych pacjentów.
    function showGroup(label, ids) {
      if (busy || !ids || !ids.length) return;
      state.group = { label, ids: ids.slice() };
      state.view = 'list'; state.filter = 'base'; state.listId = null; state.query = '';
      state.adding = false; state.selected = {}; memberCache = null;
      render(); scroll.scrollTop = 0;
    }
    function savePosition() {
      if (isCatalog()) state.catalogScrollTop = scroll.scrollTop;
      else if (state.listId) state.listScrollTop = scroll.scrollTop;
    }
    function backToCatalog() {
      if (busy) return;
      savePosition(); state.listId = null; state.filter = 'lists'; state.adding = false; state.selected = {}; memberCache = null;
      restoreScroll = state.catalogScrollTop; restoreAnchor = null;
      if (desktop) render(); else openPicker();
    }
    function chooseList(id) {
      if (busy) return;
      savePosition(); closePicker(false);
      state.filter = 'lists'; state.listId = id; state.adding = false; state.selected = {}; state.sourceFilter = 'all'; memberCache = null;
      restoreScroll = 0; restoreAnchor = null; render();
    }
    function syncBack() {
      // Resizing or completing a read must not move this screen above the
      // existing rule editor in the shared Back stack.
      if (!destroyed && doc.querySelector('.vilda-pl-overlay')) return;
      if (unregisterBack) { unregisterBack(); unregisterBack = null; }
      if (destroyed || typeof opts.registerBack !== 'function') return;
      let handler = null;
      if (picker) handler = () => { closePicker(true); render(); };
      else if (state.view === 'stats') handler = () => chooseView('list');
      else if (state.group && ['all', 'base', 'ext'].includes(state.filter)) handler = () => { if (!busy) { state.group = null; chooseView('stats'); } };
      else if (state.adding) handler = () => { if (!busy) { state.adding = false; state.selected = {}; render(); } };
      else if (state.listId) handler = backToCatalog;
      else if (state.filter === 'lists' || state.filter === 'dup') handler = () => chooseTab('all');
      if (handler) unregisterBack = opts.registerBack(handler);
    }
    function empty(host, heading, message, actionText, action) {
      const box = el('div', 'pt-empty'); box.appendChild(el('h3', null, heading));
      if (message) box.appendChild(el('p', null, message));
      if (actionText) box.appendChild(button('pt-secondary', actionText, action));
      host.appendChild(box);
    }
    function denied(host) {
      empty(host, 'Listy pacjentów — funkcja PRO', 'Listy ręczne i automatyczne są częścią pakietu PRO. Dostęp można aktywować w Subskrypcji.');
    }
    function errorMessage(host, label, retry) {
      clear(host); empty(host, label, 'Spróbuj ponownie.', 'Ponów', retry);
    }
    function presentationFor(patient) {
      const supplied = typeof opts.describePatient === 'function' ? opts.describePatient(patient) || {} : {};
      if (Object.prototype.hasOwnProperty.call(supplied, 'birth')) return supplied;
      const data = patient.header || {};
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(data.dobISO || '') ? data.dobISO : '';
      const year = /^\d{4}$/.test(String(data.birthYear || '')) ? String(data.birthYear) : '';
      return Object.assign({}, supplied, {
        birth: iso ? iso.split('-').reverse().join('.') : year || '—',
        birthHint: iso ? '' : year ? 'tylko rok' : 'nie podano',
        age: '', sex: data.sex === 'F' || data.sex === 'K' ? 'Kobieta' : data.sex === 'M' ? 'Mężczyzna' : ''
      });
    }
    function savedDate(value) {
      if (!value) return '—';
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '—';
    }
    function patientRow(patient, list, members) {
      const data = patient.header || {};
      const name = data.name || '(bez nazwiska)';
      // A wrapper and a single primary button avoid nested interactive controls.
      const presentation = presentationFor(patient);
      const row = el('div', 'pt-row' + (presentation.duplicate === 'base' ? ' pt-row--dup' : presentation.duplicate === 'mixed' ? ' pt-row--softdup' : '')); row.setAttribute('data-patient-id', patient.patientId);
      const open = button('pt-row-open', null, () => {
        if (!busy && opts.onOpenPatient) opts.onOpenPatient(patient);
      });
      open.title = 'Otwórz: ' + name; open.setAttribute('aria-label', 'Otwórz kartę: ' + name);
      const info = el('span', 'pt-info'); const nameLine = el('span', 'pt-name');
      nameLine.appendChild(el('span', 'pt-person-name', name));
      if (patient.__ext) nameLine.appendChild(el('span', 'pt-badge', 'spoza bazy'));
      info.appendChild(nameLine);
      const metadata = el('span', 'pt-meta');
      if (presentation.birth && presentation.birth !== '—') {
        metadata.appendChild(el('span', 'pt-mobile-birth', (presentation.birthHint === 'tylko rok' ? 'rok ur. ' : 'ur. ') + presentation.birth));
      }
      [presentation.age, presentation.sex].filter(Boolean).forEach((value) => metadata.appendChild(el('span', 'pt-demographic', value)));
      info.appendChild(metadata);
      const birth = el('span', 'pt-birth', presentation.birth || '—');
      birth.setAttribute('aria-label', 'Data urodzenia: ' + (presentation.birth && presentation.birth !== '—' ? presentation.birth : 'nie podano'));
      if (presentation.birthHint) birth.appendChild(el('small', null, presentation.birthHint));
      if (presentation.duplicate) info.appendChild(el('span', 'pt-duplicate-hint', presentation.duplicate === 'base' ? 'Rozróżnij osoby datą urodzenia' : 'Możliwy duplikat — przejrzyj podobne nazwiska'));
      const date = el('span', 'pt-saved'); date.appendChild(el('small', null, 'Ostatni zapis'));
      const time = el('time', null, savedDate(patient.lastSavedAtISO));
      if (patient.lastSavedAtISO) time.setAttribute('datetime', String(patient.lastSavedAtISO));
      date.appendChild(time);
      open.appendChild(info); open.appendChild(birth); open.appendChild(date); open.appendChild(icon('arrow')); row.appendChild(open);
      if (state.adding) {
        const checkbox = el('input', 'pl-cb'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(state.selected[patient.patientId]);
        checkbox.setAttribute('aria-label', 'Dodaj do listy: ' + name);
        function changed() {
          state.selected[patient.patientId] = checkbox.checked;
          updateAddCount();
        }
        checkbox.addEventListener('change', changed);
        row.insertBefore(checkbox, open);
        // The primary action in selection mode is selection, never card navigation.
        const select = button('pt-row-open', null, () => { checkbox.checked = !checkbox.checked; changed(); });
        select.setAttribute('aria-label', 'Zaznacz do dodania: ' + name);
        while (open.firstChild) select.appendChild(open.firstChild);
        row.removeChild(open); row.appendChild(select);
      } else if (list) {
        const remove = button('pl-rm', 'Usuń z listy', () => removeMember(list, patient, members));
        remove.title = 'Zdejmij z tej listy'; remove.setAttribute('aria-label', 'Usuń z listy: ' + name); row.appendChild(remove);
      }
      return row;
    }
    function patientRows(host, rows, list, members) {
      const surface = el('div', 'pt-results');
      const columns = el('div', 'pt-columns');
      columns.setAttribute('aria-hidden', 'true');
      columns.appendChild(el('span', null, 'Imię i nazwisko'));
      columns.appendChild(el('span', null, 'Data urodzenia'));
      columns.appendChild(el('span', null, 'Ostatni zapis'));
      columns.appendChild(el('span'));
      // Extra selection/removal actions have their own width; omit headings in
      // that mode instead of aligning misleading labels over those actions.
      columns.hidden = Boolean(state.adding || list);
      surface.appendChild(columns);
      const body = el('div', 'pt-result-rows');
      body.setAttribute('role', 'list'); body.setAttribute('aria-label', 'Pacjenci');
      surface.appendChild(body); host.appendChild(surface);
      const makeRow = (patient, index) => {
        const node = patientRow(patient, list, members);
        node.setAttribute('role', 'listitem');
        node.setAttribute('aria-posinset', String(index + 1));
        node.setAttribute('aria-setsize', String(rows.length));
        return node;
      };
      if (rows.length <= 60) rows.forEach((patient, index) => body.appendChild(makeRow(patient, index)));
      else rowWindow = windowRows(body, rows, makeRow);
      footerCount.textContent = peopleLabel(rows.length) + (list ? ' na wybranej liście' : '');
    }
    // Only visible rows and a small overscan exist in the DOM. Unknown heights
    // are estimates, replaced by measured heights; keep the first visible person
    // anchored while the estimates settle (also for wrapping names on phones).
    function windowRows(body, rows, makeRow) {
      const width = Math.round(scroll.clientWidth);
      if (measuredWidth !== width) { rowHeights.clear(); measuredWidth = width; }
      const mode = (state.adding ? 'add:' : state.listId ? 'list:' : 'all:');
      const key = (index) => mode + rows[index].patientId;
      let offsets = [], current = new Map(), frame = null, stopped = false;
      let rangeKey = '', resizeObserver = null;
      function prefix() {
        offsets = [0];
        rows.forEach((patient, index) => offsets.push(offsets[index] + (rowHeights.get(key(index)) || 86)));
      }
      function origin() { return body.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop; }
      function indexAt(value) {
        let left = 0, right = rows.length;
        while (left < right) { const middle = (left + right) >>> 1; if (offsets[middle + 1] <= value) left = middle + 1; else right = middle; }
        return Math.min(rows.length - 1, left);
      }
      function anchor() {
        const position = scroll.scrollTop - origin();
        const index = indexAt(Math.max(0, position));
        return { patientId: rows[index].patientId, offset: position - offsets[index] };
      }
      function measure() {
        if (stopped || !body.isConnected) return;
        const top = origin(), index = indexAt(Math.max(0, scroll.scrollTop - top));
        const delta = scroll.scrollTop - top - offsets[index];
        let changed = false;
        current.forEach((node, item) => {
          const height = node.getBoundingClientRect().height;
          if (height > 0 && Math.abs((rowHeights.get(key(item)) || 86) - height) > .5) { rowHeights.set(key(item), height); changed = true; }
        });
        if (changed) { prefix(); draw(true); scroll.scrollTop = top + offsets[index] + delta; }
      }
      function schedule() {
        if (stopped || frame != null) return;
        frame = win.requestAnimationFrame(() => { frame = null; draw(); measure(); });
      }
      function draw(force, ensureIndex) {
        if (stopped) return;
        const top = Math.max(0, scroll.scrollTop - origin());
        const start = Math.max(0, indexAt(top) - 8);
        const end = Math.min(rows.length, indexAt(top + Math.max(scroll.clientHeight, 300)) + 9);
        const active = doc.activeElement;
        const focusedRow = active && active.closest ? active.closest('.pt-row') : null;
        const focusedIndex = focusedRow && body.contains(focusedRow) ? Number(focusedRow.dataset.virtualIndex) : -1;
        const indices = [];
        for (let index = start; index < end; index += 1) indices.push(index);
        for (const index of [focusedIndex, ensureIndex]) if (Number.isInteger(index) && index >= 0 && index < rows.length && !indices.includes(index)) indices.push(index);
        indices.sort((a, b) => a - b);
        const nextKey = indices.join(',');
        if (!force && nextKey === rangeKey) return;
        rangeKey = nextKey;
        const next = new Map(), fragment = doc.createDocumentFragment();
        let last = 0;
        function spacer(height) {
          if (height <= 0) return;
          // Runtime geometry: this measured gap preserves the full scroll length
          // of unmounted rows. Its variable pixel height cannot be a static class.
          const node = el('div', 'pt-row-spacer'); node.style.height = height + 'px'; node.setAttribute('aria-hidden', 'true'); fragment.appendChild(node);
        }
        indices.forEach((index) => {
          spacer(offsets[index] - offsets[last]);
          const node = current.get(index) || makeRow(rows[index], index);
          node.dataset.virtualIndex = String(index);
          next.set(index, node); fragment.appendChild(node); last = index + 1;
        });
        spacer(offsets[rows.length] - offsets[last]);
        if (resizeObserver) { current.forEach((node, index) => { if (!next.has(index)) resizeObserver.unobserve(node); }); }
        body.replaceChildren(fragment); current = next;
        if (resizeObserver) current.forEach((node) => resizeObserver.observe(node));
        if (active && body.contains(active) && doc.activeElement !== active) active.focus({ preventScroll: true });
      }
      function focusRow(index, control) {
        const target = Math.max(0, Math.min(rows.length - 1, index));
        scroll.scrollTop = origin() + offsets[target];
        draw(true, target); measure();
        const node = current.get(target);
        if (node) {
          const controls = node.querySelectorAll('button, input');
          const focus = controls[Math.min(control || 0, controls.length - 1)];
          if (focus) focus.focus({ preventScroll: true });
        }
        schedule();
      }
      function keyboard(event) {
        const row = event.target.closest && event.target.closest('.pt-row');
        if (!row || !body.contains(row)) return;
        const index = Number(row.dataset.virtualIndex), controls = Array.from(row.querySelectorAll('button, input'));
        const control = controls.indexOf(doc.activeElement);
        let next = null, nextControl = control;
        if (event.key === 'Tab') {
          if (!event.shiftKey && control === controls.length - 1 && index < rows.length - 1) { next = index + 1; nextControl = 0; }
          if (event.shiftKey && control === 0 && index > 0) { next = index - 1; nextControl = state.adding || state.listId ? 1 : 0; }
        } else if (event.key === 'ArrowDown') next = index + 1;
        else if (event.key === 'ArrowUp') next = index - 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = rows.length - 1;
        else if (event.key === 'PageDown') next = indexAt(offsets[index] + scroll.clientHeight);
        else if (event.key === 'PageUp') next = indexAt(Math.max(0, offsets[index] - scroll.clientHeight));
        if (next != null) { event.preventDefault(); focusRow(next, nextControl); }
      }
      prefix();
      if (typeof win.ResizeObserver === 'function') resizeObserver = new win.ResizeObserver(() => schedule());
      scroll.addEventListener('scroll', schedule, { passive: true });
      body.addEventListener('keydown', keyboard);
      draw(); schedule();
      return {
        anchor,
        focusPatient(value) {
          const index = value ? rows.findIndex((patient) => patient.patientId === value.patientId) : -1;
          if (index < 0) return;
          draw(true, index);
          const node = current.get(index), controls = node && node.querySelectorAll('button, input');
          const focus = controls && controls[Math.min(Number(value.control) || 0, controls.length - 1)];
          if (focus) focus.focus({ preventScroll: true });
        },
        restore(value) {
          const index = value ? rows.findIndex((patient) => patient.patientId === value.patientId) : -1;
          if (Number.isInteger(index) && index >= 0) { scroll.scrollTop = origin() + offsets[index] + (Number(value.offset) || 0); draw(true, index); measure(); }
          else { draw(); measure(); }
        },
        resize() {
          const nextWidth = Math.round(scroll.clientWidth), previous = anchor();
          if (measuredWidth !== nextWidth) {
            rowHeights.clear(); measuredWidth = nextWidth; prefix(); rangeKey = '';
            const index = rows.findIndex((patient) => patient.patientId === previous.patientId);
            scroll.scrollTop = origin() + offsets[index] + previous.offset;
          }
          schedule();
        },
        destroy() {
          stopped = true; if (frame != null) win.cancelAnimationFrame(frame);
          if (resizeObserver) resizeObserver.disconnect();
          scroll.removeEventListener('scroll', schedule); body.removeEventListener('keydown', keyboard);
        }
      };
    }
    function renderPatients() {
      const group = state.group ? new Set(state.group.ids) : null;
      const rows = sorted(patients.filter((patient) => (!group || group.has(patient.patientId)) && sourceMatches(patient, state.filter) && matchesName(patient, state.query)));
      count.textContent = 'Wyświetlono: ' + rows.length;
      if (!rows.length) {
        empty(scroll, patients.length ? 'Brak pasujących osób' : 'Baza jest jeszcze pusta', patients.length ? 'Zmień wyszukiwanie lub wybierz inny zakres.' : 'Dodaj pacjenta, aby rozpocząć pracę z bazą.', patients.length ? 'Wyczyść wyszukiwanie i filtry' : '+ Dodaj pacjenta', () => {
          if (patients.length) { state.query = ''; state.group = null; chooseTab('all'); }
          else if (opts.onAddPatient) opts.onAddPatient();
        });
      } else patientRows(scroll, rows);
      footerCount.textContent = peopleLabel(rows.length);
    }
    // ── P-BAZA-STATYSTYKI, etap 1 ───────────────────────────────────────────────
    function basePatients() { return patients.filter((patient) => !patient.__ext); }
    function ageFromVault(dobISO) {
      if (vault && typeof vault.calcAgeFromDOB === 'function') {
        const age = vault.calcAgeFromDOB(dobISO);
        return age && Number.isFinite(age.totalMonths) ? age.totalMonths : null;
      }
      return monthsFromDob(dobISO, new Date());
    }
    function cardsSignature(rows) { return rows.map((patient) => patient.patientId + '@' + (patient.lastSavedAtISO || '')).sort().join('|'); }
    /* Słupki rysuje SVG z atrybutami geometrii (szerokości w jednostkach viewBox 0–1000),
     * więc widok nie ustawia żadnego stylu wprost na elemencie (P-STYLE krok 5b). */
    function statBar(className, segments) {
      const svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'pt-stat-bar' + (className ? ' ' + className : ''));
      svg.setAttribute('viewBox', '0 0 1000 20'); svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      const drawn = segments.filter((segment) => segment.width > 0);
      let x = 0;
      drawn.forEach((segment, index) => {
        const rect = doc.createElementNS(SVG_NS, 'rect');
        // 5 jednostek przerwy między stykającymi się segmentami (ok. 2 px).
        const width = index < drawn.length - 1 ? Math.max(segment.width - 5, 1) : segment.width;
        rect.setAttribute('class', segment.className);
        rect.setAttribute('x', String(Math.round(x))); rect.setAttribute('y', '0');
        rect.setAttribute('width', String(Math.round(width))); rect.setAttribute('height', '20');
        svg.appendChild(rect); x += segment.width;
      });
      return svg;
    }
    function statTile(label, value, unit, sub, action) {
      const tile = action ? button('pt-stat-tile pt-stat-tile--link', null, action) : el('div', 'pt-stat-tile');
      tile.appendChild(el('span', 'pt-stat-label', label));
      const figure = el('span', 'pt-stat-value', value);
      if (unit) figure.appendChild(el('span', 'pt-stat-unit', ' ' + unit));
      tile.appendChild(figure);
      if (sub) tile.appendChild(el('span', 'pt-stat-sub', sub));
      return tile;
    }
    function ageParts(months) {
      const text = formatAge(months);
      const split = text.lastIndexOf(' ');
      return split === -1 ? [text, ''] : [text.slice(0, split), text.slice(split + 1)];
    }
    function meterRow(label, have, total, missingIds, missingLabel) {
      const row = el('div', 'pt-stat-meter');
      row.appendChild(el('span', 'pt-stat-meter-name', label));
      row.appendChild(statBar('pt-stat-bar--meter', [
        { className: 'pt-stat-fill', width: total ? have / total * 1000 : 0 }
      ]));
      row.appendChild(el('span', 'pt-stat-meter-figure', have + ' / ' + total));
      const missing = missingIds ? missingIds.length : 0;
      if (missing) {
        const show = button('pt-stat-missing', 'Brakuje: ' + missing + ' ›', () => showGroup(missingLabel, missingIds));
        show.setAttribute('aria-label', label + ': brakuje u ' + peopleLabel(missing) + '. Pokaż listę');
        row.appendChild(show);
      } else row.appendChild(el('span', 'pt-stat-missing pt-stat-missing--none', 'komplet'));
      return row;
    }
    /* Karty czyta jeden przebieg: z tego samego najnowszego zapisu liczy się kompletność danych
     * i leczenie GH. Pasek „z kart” (cardsBar) prowadzi przebieg; sekcje tylko pokazują wynik. */
    function savedCards() {
      return state.cards && state.cards.signature === cardsSignature(basePatients()) ? state.cards : null;
    }
    function ghDeps() {
      const tempo = win.VildaTempoWzrastania, trajectory = win.VildaTrajectoryAnalysis, engine = win.VildaSdsWzrostu;
      const sds = engine && typeof engine.policz === 'function' ? (input) => {
        const outcome = engine.policz(input);
        return outcome && typeof outcome.sds === 'number' && Number.isFinite(outcome.sds) ? outcome.sds : null;
      } : null;
      return {
        tempo, kursy: trajectory && typeof trajectory.ghKursy === 'function' ? trajectory.ghKursy : null, sds,
        defaultSource: typeof win.bmiSource === 'string' && win.bmiSource ? win.bmiSource.toUpperCase() : null,
        // Tablice siatek wzrostu ładuje tylko część stron; bez nich hSDS milczy u każdego pacjenta.
        sdsReady: Boolean(sds) && sds({ wzrost: 110, plec: 'M', wiekMies: 60, zrodlo: 'OLAF', populacja: 'OGOLNA' }) !== null
      };
    }
    function fillCards() {
      if (!cardsBar) return;
      clear(cardsBar); cardsProgress = null;
      const base = basePatients(), saved = savedCards();
      if (cardsBusy) {
        const progress = el('span', 'pt-stat-progress');
        progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite');
        cardsBar.appendChild(progress);
        cardsProgress = { text: progress };
        updateCardsProgress();
      } else if (saved) {
        const when = new Date(saved.at);
        cardsBar.appendChild(el('span', null, 'Karty policzone' + (Number.isFinite(when.getTime()) ? ' o ' + timeFormatter.format(when) : '')
          + (saved.failed ? ' · nie udało się odczytać: ' + saved.failed : '') + '.'));
        cardsBar.appendChild(button('pt-secondary pt-stat-check', 'Policz ponownie', checkCards));
      } else {
        cardsBar.appendChild(el('span', null, 'Leczenie hormonem wzrostu i kompletność kart liczą się z zapisów kart. Policzenie odszyfrowuje po kolei każdą kartę na tym urządzeniu i przy dużej bazie może chwilę potrwać.'));
        cardsBar.appendChild(button('pt-secondary pt-stat-check', 'Policz z kart (' + base.length + ')', checkCards));
      }
      if (cardsHost) {
        clear(cardsHost);
        if (saved && !cardsBusy) CARD_ITEMS.forEach(([key, label]) => {
          const missing = saved.missing[key] || [];
          cardsHost.appendChild(meterRow(label, saved.total - saved.failed - missing.length, saved.total - saved.failed, missing, label + ' — brak'));
        });
      }
      if (ghHost) { clear(ghHost); renderGh(ghHost, saved && !cardsBusy ? saved.gh : null); }
      if (ghHint) {
        const cohort = saved && !cardsBusy ? saved.gh : null;
        ghHint.textContent = cohort && cohort.treated
          ? 'leczonych: ' + cohort.treated + ' · ' + cohort.programs.map((item) => item.program + ' ' + item.treated).join(' · ') : '';
      }
    }
    function updateCardsProgress() {
      if (cardsProgress && cardsBusy) cardsProgress.text.textContent = 'Liczenie z kart… ' + cardsBusy.done + ' z ' + cardsBusy.total;
    }
    async function checkCards() {
      if (cardsBusy || !alive() || state.view !== 'stats') return;
      const base = basePatients();
      const run = ++cardsRun, signature = cardsSignature(base);
      const missing = {}; CARD_ITEMS.forEach(([key]) => { missing[key] = []; });
      const deps = ghDeps(), treated = [];
      let failed = 0;
      cardsBusy = { done: 0, total: base.length };
      fillCards();
      for (const record of base) {
        if (run !== cardsRun) return;
        if (!alive()) { cardsBusy = null; return; }
        try {
          const snapshot = await vault.getLatestSnapshot(record.patientId);
          if (run !== cardsRun) return;
          if (!snapshot || !snapshot.payload) failed += 1;
          else {
            const result = cardCompleteness(snapshot.payload);
            CARD_ITEMS.forEach(([key]) => { if (!result[key]) missing[key].push(record.patientId); });
            const gh = ghPatient(snapshot.payload, deps);
            if (gh) treated.push({ id: record.patientId, gh });
          }
        } catch {
          if (run !== cardsRun) return;
          failed += 1;
        }
        cardsBusy.done += 1; updateCardsProgress();
      }
      cardsBusy = null;
      if (!alive()) return;
      state.cards = { signature, at: new Date().toISOString(), total: base.length, failed, missing,
        gh: Object.assign(ghCohort(treated), { sdsReady: deps.sdsReady, engineReady: Boolean(annualWindow(deps.tempo)) }) };
      fillCards();
      const again = cardsBar && cardsBar.querySelector('.pt-stat-check');
      if (again && (doc.activeElement === doc.body || !doc.activeElement)) again.focus();
    }
    /* Hantla „przed → 1. rok” i pojedynczy punkt. SVG rozciąga się na szerokość wiersza
     * (viewBox 0–1000, bez zachowania proporcji), a linie mają grubość niezależną od skali
     * (vector-effect w arkuszu), więc kropka — krótka kreska z okrągłymi końcami — ma ten sam
     * rozmiar na telefonie i na komputerze. Pozycje są atrybutami, nie stylem. */
    function ghScale(cohort) {
      const values = [cohort.first.mean, cohort.paired.before].concat(cohort.programs.map((item) => item.mean),
        cohort.programs.map((item) => item.paired.before), cohort.programs.map((item) => item.paired.first), cohort.years.map((item) => item.mean))
        .filter((value) => typeof value === 'number' && Number.isFinite(value));
      return Math.max(6, Math.ceil(Math.max.apply(null, values.concat([0])) / 3) * 3);
    }
    function dumbbell(before, after, top) {
      const svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'pt-gh-plot'); svg.setAttribute('viewBox', '0 0 1000 24');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      const x = (value) => Math.round((20 + Math.max(0, Math.min(value, top)) / top * 960) * 10) / 10;
      const line = (className, from, to) => {
        const node = doc.createElementNS(SVG_NS, 'line');
        node.setAttribute('class', className);
        node.setAttribute('x1', String(from)); node.setAttribute('x2', String(to));
        node.setAttribute('y1', '12'); node.setAttribute('y2', '12');
        svg.appendChild(node);
      };
      const dot = (className, value) => {
        line('pt-gh-ring', x(value), x(value) + 0.01);
        line('pt-gh-dot ' + className, x(value), x(value) + 0.01);
      };
      line('pt-gh-axis', 20, 980);
      if (before !== null && after !== null) line('pt-gh-link', x(before), x(after));
      if (before !== null) dot('pt-gh-dot--before', before);
      if (after !== null) dot('pt-gh-dot--first', after);
      return svg;
    }
    function renderGh(host, cohort) {
      if (!cohort) {
        host.appendChild(el('p', 'pt-stat-note', cardsBusy ? 'Trwa liczenie z kart…' : 'Pojawi się po policzeniu z kart.'));
        return;
      }
      if (!cohort.treated) {
        host.appendChild(el('p', 'pt-stat-note', 'W bazie nie ma pacjentów z punktami leczenia hormonem wzrostu.'));
        return;
      }
      if (!cohort.engineReady) {
        host.appendChild(el('p', 'pt-stat-note', 'Leczonych: ' + cohort.treated + '. Tempa nie policzono, bo na tej stronie nie wczytał się moduł tempa wzrastania. Odśwież aplikację i policz ponownie.'));
        return;
      }
      const people = (count) => count + (count === 1 ? ' pacjent' : ' pacjentów');
      const tiles = el('div', 'pt-stat-tiles pt-gh-tiles');
      const firstTile = statTile('Tempo w 1. roku leczenia', formatVelocity(cohort.first.mean), cohort.first.n ? 'cm/rok' : '',
        cohort.first.n ? 'mediana ' + formatVelocity(cohort.first.median) + ' · n = ' + cohort.first.n : 'żaden pacjent nie ma kontroli po 9–15 mies.',
        cohort.first.n ? () => showGroup('GH · tempo w 1. roku', cohort.first.ids) : null);
      if (cohort.first.n) firstTile.setAttribute('aria-label', 'Średnie tempo wzrastania w 1. roku leczenia: ' + formatVelocity(cohort.first.mean) + ' cm/rok, ' + people(cohort.first.n) + '. Pokaż listę');
      tiles.appendChild(firstTile);
      tiles.appendChild(statTile('Przed leczeniem → 1. rok', cohort.paired.n ? formatVelocity(cohort.paired.before) + ' → ' + formatVelocity(cohort.paired.first) : '—',
        cohort.paired.n ? 'cm/rok' : '', cohort.paired.n ? 'n = ' + cohort.paired.n + ' z pomiarem 9–15 mies. przed Włączeniem' : 'brak pomiarów 9–15 mies. przed Włączeniem'));
      tiles.appendChild(statTile('Zmiana hSDS w 1. roku', formatDelta(cohort.deltaSds.mean), '',
        cohort.deltaSds.n ? 'mediana ' + formatDelta(cohort.deltaSds.median) + ' · n = ' + cohort.deltaSds.n
          : cohort.sdsReady ? 'brak pary hSDS (płeć, wiek lub siatka)' : 'siatki wzrostu nie są wczytane na tej stronie — otwórz Bazę ze strony Start'));
      host.appendChild(tiles);

      const top = ghScale(cohort);
      const programHead = el('div', 'pt-stat-card-head');
      programHead.appendChild(el('h4', null, 'Wg programu (cm/rok)'));
      const legend = el('div', 'pt-stat-legend');
      [['before', 'przed leczeniem'], ['first', '1. rok']].forEach(([key, text]) => {
        const item = el('span', 'pt-stat-legend-item');
        item.appendChild(el('span', 'pt-stat-swatch pt-gh-swatch--' + key));
        item.appendChild(el('span', null, text));
        legend.appendChild(item);
      });
      programHead.appendChild(legend); host.appendChild(programHead);
      const programs = el('div', 'pt-stat-bands');
      cohort.programs.forEach((item) => {
        const pairedHere = item.paired.n > 0;
        const figure = !item.n ? 'brak tempa' : pairedHere ? formatVelocity(item.paired.before) + ' → ' + formatVelocity(item.paired.first) : formatVelocity(item.mean);
        const describe = item.program + ': leczonych ' + item.treated + ', z tempem w 1. roku ' + item.n
          + (item.n ? ', średnio ' + formatVelocity(item.mean) + ' cm/rok' : '') + (pairedHere ? ', pary przed i po: ' + item.paired.n : '');
        const row = button('pt-stat-band pt-gh-row', null, () => showGroup('GH · ' + item.program, item.ids));
        row.setAttribute('data-program', item.program);
        row.setAttribute('aria-label', describe + '. Pokaż listę'); row.title = describe;
        const name = el('span', 'pt-gh-name');
        name.appendChild(el('b', null, item.program));
        name.appendChild(el('span', 'pt-gh-n', 'n = ' + item.n + ' z ' + item.treated + (item.small ? ' · mała grupa' : '')));
        row.appendChild(name);
        row.appendChild(dumbbell(pairedHere ? item.paired.before : null, item.n ? (pairedHere ? item.paired.first : item.mean) : null, top));
        row.appendChild(el('span', 'pt-stat-band-total pt-gh-figure', figure));
        programs.appendChild(row);
      });
      host.appendChild(programs);
      const axis = el('div', 'pt-gh-scale');
      axis.setAttribute('aria-hidden', 'true');
      [0, top / 3, top / 3 * 2, top].forEach((value) => axis.appendChild(el('span', null, String(Math.round(value)))));
      host.appendChild(axis);

      if (cohort.years.length > 1) {
        const yearsHead = el('div', 'pt-stat-card-head');
        yearsHead.appendChild(el('h4', null, 'Kolejne lata leczenia'));
        host.appendChild(yearsHead);
        const years = el('div', 'pt-stat-meters');
        cohort.years.forEach((item) => {
          const row = el('div', 'pt-stat-meter pt-gh-year');
          row.setAttribute('data-year', String(item.year));
          row.appendChild(el('span', 'pt-stat-meter-name', item.year + '. rok'));
          row.appendChild(statBar('pt-gh-yearbar', [{ className: 'pt-stat-fill', width: Math.min(item.mean, top) / top * 1000 }]));
          row.appendChild(el('span', 'pt-stat-meter-figure', formatVelocity(item.mean) + ' cm/rok'));
          row.appendChild(el('span', 'pt-stat-missing pt-stat-missing--none', 'n = ' + item.n));
          years.appendChild(row);
        });
        host.appendChild(years);
      }

      const without = GH_REASONS.filter(([key]) => (cohort.missing[key] || []).length);
      if (without.length) {
        const gaps = el('div', 'pt-gh-gaps');
        gaps.appendChild(el('span', null, 'Bez tempa w 1. roku:'));
        without.forEach(([key, label]) => {
          const ids = cohort.missing[key];
          const show = button('pt-stat-missing', label + ': ' + ids.length + ' ›', () => showGroup('GH · ' + label, ids));
          show.setAttribute('data-reason', key);
          gaps.appendChild(show);
        });
        host.appendChild(gaps);
      }
      host.appendChild(el('p', 'pt-stat-note', '1. rok: od punktu Włączenia do kontroli po 9–15 mies. (najbliższej 12 mies.), w pierwszym kursie leczenia. Kolejne lata liczą się tak samo od poprzedniej kontroli. Pacjent bez takiej pary nie wchodzi do średniej. Przy grupie mniejszej niż ' + SMALL_GROUP + ' osób średnia jest niestabilna.'));
    }
    function renderStats() {
      cardsHost = null; cardsBar = null; ghHost = null; ghHint = null; cardsProgress = null;
      const model = demographics(patients, { ageMonths: ageFromVault });
      if (!model.total) {
        empty(scroll, 'Brak pacjentów w bazie', 'Statystyki pojawią się po dodaniu pierwszego pacjenta.', '+ Dodaj pacjenta', () => { if (opts.onAddPatient) opts.onAddPatient(); });
        return;
      }
      const wrap = el('div', 'pt-stats');

      const tiles = el('div', 'pt-stat-tiles');
      tiles.appendChild(statTile('Pacjenci w bazie', String(model.total), '', model.recent + ' z zapisem w ostatnich 12 mies.'));
      if (model.withAge) {
        const meanAge = ageParts(model.meanMonths);
        tiles.appendChild(statTile('Średni wiek', meanAge[0], meanAge[1],
          'mediana ' + formatAge(model.medianMonths) + ' · od ' + formatAge(model.minMonths) + ' do ' + formatAge(model.maxMonths)));
      } else tiles.appendChild(statTile('Średni wiek', '—', '', 'brak dat urodzenia'));
      [['M', 'Chłopcy'], ['F', 'Dziewczęta']].forEach(([key, label]) => {
        const average = model.meanMonthsBySex[key];
        const sub = percent(model.sex[key], model.total) + '%' + (average === null ? '' : ' · średni wiek ' + formatAge(average));
        const tile = statTile(label, String(model.sex[key]), '', sub, model.sex[key] ? () => showGroup(label, model.sexIds[key]) : null);
        if (model.sex[key]) tile.setAttribute('aria-label', label + ': ' + model.sex[key] + ', ' + sub + '. Pokaż listę');
        tiles.appendChild(tile);
      });
      wrap.appendChild(tiles);

      const ageCard = el('section', 'pt-stat-card');
      const ageHead = el('div', 'pt-stat-card-head');
      ageHead.appendChild(el('h3', null, 'Wiek i płeć'));
      const legend = el('div', 'pt-stat-legend');
      [['m', 'Chłopcy ' + model.sex.M], ['f', 'Dziewczęta ' + model.sex.F]].concat(model.sex.unknown ? [['u', 'Płeć nieznana ' + model.sex.unknown]] : [])
        .forEach(([key, text]) => {
          const item = el('span', 'pt-stat-legend-item');
          item.appendChild(el('span', 'pt-stat-swatch pt-stat-swatch--' + key));
          item.appendChild(el('span', null, text));
          legend.appendChild(item);
        });
      ageHead.appendChild(legend); ageCard.appendChild(ageHead);
      const most = Math.max.apply(null, model.bands.map((band) => band.total).concat([1]));
      const bandList = el('div', 'pt-stat-bands');
      model.bands.forEach((band) => {
        const describe = band.label + ': ' + peopleLabel(band.total) + ' (chłopcy ' + band.M + ', dziewczęta ' + band.F + (band.unknown ? ', płeć nieznana ' + band.unknown : '') + ')';
        const row = band.total ? button('pt-stat-band', null, () => showGroup(band.label, band.ids)) : el('div', 'pt-stat-band pt-stat-band--empty');
        row.setAttribute('data-band', band.key);
        if (band.total) { row.setAttribute('aria-label', describe + '. Pokaż listę'); row.title = describe; }
        row.appendChild(el('span', 'pt-stat-band-name', band.label));
        row.appendChild(statBar('', [
          { className: 'pt-stat-seg--m', width: band.M / most * 1000 },
          { className: 'pt-stat-seg--f', width: band.F / most * 1000 },
          { className: 'pt-stat-seg--u', width: band.unknown / most * 1000 }
        ]));
        row.appendChild(el('span', 'pt-stat-band-total', String(band.total)));
        bandList.appendChild(row);
      });
      ageCard.appendChild(bandList);
      ageCard.appendChild(el('p', 'pt-stat-note', 'Wiek na dziś, liczony z daty urodzenia. Wybierz przedział, aby zobaczyć pacjentów.'
        + (model.missingDob.length ? ' Bez daty urodzenia: ' + model.missingDob.length + ' (poza wiekiem).' : '')));
      wrap.appendChild(ageCard);

      cardsBar = el('div', 'pt-stat-cards-foot pt-stat-cardsbar');
      wrap.appendChild(cardsBar);

      const ghCard = el('section', 'pt-stat-card pt-gh');
      const ghHead = el('div', 'pt-stat-card-head');
      ghHead.appendChild(el('h3', null, 'Leczenie hormonem wzrostu'));
      ghHint = el('span', 'pt-stat-card-hint');
      ghHead.appendChild(ghHint);
      ghCard.appendChild(ghHead);
      ghHost = el('div', 'pt-gh-body');
      ghCard.appendChild(ghHost);
      wrap.appendChild(ghCard);

      const dataCard = el('section', 'pt-stat-card');
      const dataHead = el('div', 'pt-stat-card-head');
      dataHead.appendChild(el('h3', null, 'Kompletność danych'));
      dataHead.appendChild(el('span', 'pt-stat-card-hint', 'im pełniejsze karty, tym więcej pacjentów wejdzie do kolejnych statystyk'));
      dataCard.appendChild(dataHead);
      const headerRows = el('div', 'pt-stat-meters');
      headerRows.appendChild(meterRow('Data urodzenia', model.total - model.missingDob.length, model.total, model.missingDob, 'Data urodzenia — brak'));
      headerRows.appendChild(meterRow('Płeć', model.total - model.missingSex.length, model.total, model.missingSex, 'Płeć — brak'));
      dataCard.appendChild(headerRows);
      cardsHost = el('div', 'pt-stat-meters pt-stat-cards');
      dataCard.appendChild(cardsHost);
      fillCards();
      wrap.appendChild(dataCard);

      wrap.appendChild(el('p', 'pt-stat-note pt-stat-note--foot', 'Statystyki opisowe ' + model.total + (model.total === 1 ? ' pacjenta' : ' pacjentów')
        + ' z bazy, bez osób spoza bazy. Policzone na tym urządzeniu; nic nie jest wysyłane. Nie są badaniem naukowym ani podstawą decyzji klinicznych.'));
      scroll.appendChild(wrap);
    }

    function reader() {
      if (!listReader) listReader = typeof vault.createPatientListReader === 'function' ? vault.createPatientListReader({ isCurrent: alive }) : vault;
      return listReader;
    }
    function invalidateLists() {
      if (listReader && listReader !== vault && typeof listReader.dispose === 'function') listReader.dispose();
      listReader = null; listCache = null; catalogPromise = null; memberCache = null; memberPromises.clear();
    }
    function getMembers(list) {
      const id = typeof list === 'string' ? list : list.id;
      if (!memberPromises.has(id)) {
        const source = reader();
        const promise = Promise.resolve().then(() => source.getPatientListMembers(list)).catch((error) => {
          if (memberPromises.get(id) === promise) memberPromises.delete(id);
          throw error;
        });
        memberPromises.set(id, promise);
      }
      return memberPromises.get(id);
    }
    function getCatalog() {
      if (listCache) return Promise.resolve(listCache);
      if (!catalogPromise) {
        const source = reader();
        const pending = Promise.resolve().then(() => source.listPatientLists()).then((lists) => {
          const rows = (lists || []).map((list) => ({ list, members: null }));
          if (catalogPromise === pending) {
            if (alive() && mayUseLists()) listCache = rows;
            catalogPromise = null;
          }
          return rows;
        }, (error) => { if (catalogPromise === pending) catalogPromise = null; throw error; });
        catalogPromise = pending;
      }
      return catalogPromise;
    }
    function countMembers(node, entry, sequence) {
      function currentCount() { return guardedRead(sequence) && mayUseLists() && node.isConnected && listCache && listCache.includes(entry); }
      function done(members) {
        if (!currentCount()) return;
        entry.members = members;
        node.textContent = peopleLabel(Number(members.count) || 0);
        node.removeAttribute('aria-label');
      }
      if (entry.members) { done(entry.members); return; }
      node.textContent = '…'; node.setAttribute('aria-label', 'Liczba osób: wczytywanie');
      getMembers(entry.list).then(done).catch(() => {
        if (!currentCount()) return;
        node.textContent = 'Nie wczytano'; node.setAttribute('aria-label', 'Nie udało się wczytać liczby osób');
        // Opening this list retains the existing error/retry flow. A failed
        // count never masquerades as a list with zero members.
      });
    }
    function catalogRows(host, entries, sequence) {
      const query = state.listQuery;
      const filtered = entries.filter(({ list }) => !query || normalize(list.name || '').indexOf(normalize(query)) !== -1);
      if (host === scroll) {
        count.textContent = 'Listy pacjentów: ' + entries.length + (query ? ' · pokazano ' + filtered.length : '');
      }
      if (!filtered.length) {
        empty(host, entries.length ? 'Brak pasujących list' : 'Nie masz jeszcze list', entries.length ? 'Zmień nazwę wpisaną w wyszukiwarkę.' : 'Utwórz listę ręczną lub automatyczną.', entries.length ? 'Wyczyść wyszukiwanie' : '+ Nowa lista', () => {
          if (entries.length) { state.listQuery = ''; if (pickerInput) pickerInput.value = ''; render(); }
          else editList(null);
        });
        return;
      }
      const grid = el('div', 'pl-grid');
      const counts = [];
      filtered.forEach((entry) => {
        const { list } = entry;
        const wrapper = el('div', 'pl-row');
        const tile = button('pl-tile', null, () => chooseList(list.id));
        tile.title = 'Otwórz listę: ' + list.name; tile.setAttribute('data-list-id', list.id);
        tile.appendChild(icon('note'));
        const text = el('span', 'pl-description'); text.appendChild(el('strong', 'pl-tnm', list.name || '(bez nazwy)'));
        text.appendChild(el('small', 'pl-tmt', describeList(list) + (list.description ? ' · ' + list.description : '')));
        tile.appendChild(text);
        const number = el('span', 'pl-num', '…'); tile.appendChild(number);
        counts.push({ node: number, entry }); tile.appendChild(icon('arrow'));
        wrapper.appendChild(tile);
        const edit = button('pl-edit', 'Edytuj', () => editList(list)); edit.setAttribute('aria-label', 'Edytuj listę: ' + list.name); wrapper.appendChild(edit);
        grid.appendChild(wrapper);
      });
      host.appendChild(grid);
      counts.forEach(({ node, entry }) => countMembers(node, entry, sequence));
    }
    function renderCatalog(host, sequence) {
      if (!mayUseLists()) { denied(host); if (host === scroll) count.textContent = 'Listy pacjentów'; return; }
      if (host === scroll) count.textContent = 'Ładowanie list…';
      host.appendChild(el('div', 'pt-loading', 'Ładowanie list…'));
      getCatalog().then((entries) => {
        if (!guardedRead(sequence) || !mayUseLists() || (host !== scroll && host !== pickerBody)) return;
        clear(host); catalogRows(host, entries, sequence); syncControls(); restorePosition();
      }).catch(() => { if (guardedRead(sequence)) errorMessage(host, 'Nie udało się wczytać list.', () => render()); });
    }
    function loadMembers(id) {
      if (memberCache && memberCache.list.id === id) return Promise.resolve(memberCache);
      return getCatalog().then((entries) => {
        const entry = entries.find(({ list }) => list.id === id);
        return entry ? getMembers(entry.list).then((members) => ({ list: entry.list, members })) : null;
      });
    }
    function selectedCount() { return Object.keys(state.selected).filter((id) => state.selected[id]).length; }
    function updateAddCount() {
      const save = scroll.querySelector('.pl-confirm-add');
      if (save) save.textContent = 'Dodaj (' + selectedCount() + ')';
    }
    function memberHeading(list, members) {
      const container = el('div', 'pl-bar');
      container.appendChild(textButton('pl-back', 'Wszystkie listy', backToCatalog, 'back'));
      const bar = el('div', 'pl-detail-heading');
      const text = el('div'); text.appendChild(el('h3', 'pl-list-title', list.name));
      text.appendChild(el('p', null, describeList(list) + ' · ' + peopleLabel(Number(members.count) || 0))); bar.appendChild(text);
      const actions = el('div', 'pl-actions');
      if (state.adding) {
        actions.appendChild(button('pl-confirm-add go pt-primary', 'Dodaj (' + selectedCount() + ')', () => addMembers(list)));
        actions.appendChild(button('gh pt-secondary', 'Anuluj', () => { if (!busy) { state.adding = false; state.selected = {}; render(); } }));
      } else {
        actions.appendChild(button('go pt-secondary', '+ Dodaj pacjentów', () => { state.adding = true; state.selected = {}; state.listScrollTop = scroll.scrollTop; render(); scroll.scrollTop = 0; }));
        actions.appendChild(button('pl-edit gh pt-secondary', 'Edytuj listę', () => editList(list)));
      }
      bar.appendChild(actions); container.appendChild(bar);
      if (state.sourceFilter !== 'all') {
        const removeFilter = textButton('pt-source-scope pt-secondary', SOURCE_LABELS[state.sourceFilter], () => { state.sourceFilter = 'all'; render(); }, 'close');
        removeFilter.setAttribute('aria-label', 'Usuń filtr rodzaju rekordu'); container.appendChild(removeFilter);
      }
      return container;
    }
    function renderMembers(sequence) {
      if (!mayUseLists()) { count.textContent = 'Listy pacjentów'; denied(scroll); return; }
      const id = state.listId;
      count.textContent = 'Ładowanie listy…'; scroll.appendChild(el('div', 'pt-loading', 'Ładowanie listy…'));
      loadMembers(id).then((result) => {
        if (!guardedRead(sequence) || state.listId !== id || !mayUseLists()) return;
        if (!result) {
          state.listId = null; state.adding = false; state.selected = {}; invalidateLists();
          if (desktop) render(); else { state.filter = 'all'; render(); openPicker(); }
          return;
        }
        memberCache = result;
        const { list, members } = result;
        clear(scroll); count.textContent = 'Lista: ' + list.name; scroll.appendChild(memberHeading(list, members));
        const ids = new Set(members.memberIds || []);
        const candidates = state.adding ? patients.filter((patient) => !ids.has(patient.patientId)) : (members.memberIds || []).map((memberId) => byId.get(memberId)).filter(Boolean);
        const rows = sorted(candidates.filter((patient) => sourceMatches(patient, state.sourceFilter) && matchesName(patient, state.query)), state.adding ? 'name-asc' : state.sort);
        if (state.adding) scroll.appendChild(el('div', 'pt-sec', 'Zaznacz pacjentów do dodania'));
        if (rows.length) patientRows(scroll, rows, state.adding ? null : list, members);
        else {
          const filtered = Boolean(state.query || state.sourceFilter !== 'all');
          empty(scroll, state.adding ? 'Brak pacjentów do dodania' : filtered ? 'Brak pasujących osób' : 'Lista jest pusta', filtered ? 'Zmień wyszukiwanie lub filtr rodzaju rekordu.' : list.rule ? 'Lista aktualizuje się według zapisanej reguły. Możesz edytować regułę lub dodać pacjentów ręcznie.' : 'Dodaj pacjentów przyciskiem „+ Dodaj pacjentów”.');
        }
        footerCount.textContent = peopleLabel(rows.length) + (state.adding ? ' do wyboru' : ' na wybranej liście');
        syncControls(); restorePosition();
      }).catch(() => { if (guardedRead(sequence)) errorMessage(scroll, 'Nie udało się wczytać listy.', () => { memberCache = null; render(); }); });
    }
    function listMutationFailure(error) {
      if (alive() && typeof win.alert === 'function') win.alert('Nie udało się zapisać zmiany listy: ' + (error && error.message || error));
    }
    async function addMembers(list) {
      if (busy || !alive() || !mayUseLists()) return;
      const ids = Object.keys(state.selected).filter((id) => state.selected[id]);
      if (!ids.length) { state.adding = false; render(); return; }
      busy = true; syncControls(); invalidateLists();
      try {
        for (const id of ids) {
          if (!alive() || !mayUseLists()) return;
          await vault.addPatientToList(list.id, id);
        }
        if (alive()) { state.adding = false; state.selected = {}; invalidateLists(); restoreScroll = state.listScrollTop; }
      } catch (error) { listMutationFailure(error); invalidateLists(); }
      finally { busy = false; if (alive()) render(); }
    }
    async function removeMember(list, patient, members) {
      if (busy || !alive() || !mayUseLists()) return;
      const viaRule = Boolean(members && members.viaRule && members.viaRule[patient.patientId]);
      const message = 'Zdjąć „' + (patient.header && patient.header.name || '') + '” z listy?' + (viaRule ? '\nLista automatyczna — zapiszemy wykluczenie, aby reguła nie dodała tej osoby ponownie.' : '');
      if (typeof win.confirm !== 'function' || !win.confirm(message)) return;
      busy = true; syncControls(); invalidateLists();
      try { await vault.removePatientFromList(list.id, patient.patientId); if (alive()) { invalidateLists(); } }
      catch (error) { listMutationFailure(error); }
      finally { busy = false; if (alive()) render(); }
    }
    function editList(list) {
      if (!alive() || busy || !mayUseLists() || typeof opts.onEditList !== 'function') return;
      const returnPicker = Boolean(picker);
      invalidateLists();
      closePicker(false, true);
      opts.onEditList(list, { onDone: (result) => {
        if (!alive()) return;
        invalidateLists();
        if (list && !result && state.listId === list.id) { state.listId = null; state.adding = false; state.selected = {}; }
        render();
        if (returnPicker && !desktop) openPicker();
      } });
      // The existing rule editor calls onDone only after save/delete. Observe its
      // removal as well so Cancel, Escape and Back return to the same picker.
      const editor = doc.querySelector('.vilda-pl-overlay');
      if (editorObserver) { editorObserver.disconnect(); editorObserver = null; }
      if (editor && editor.parentNode && typeof win.MutationObserver === 'function') {
        editorObserver = new win.MutationObserver(() => {
          if (editor.isConnected) return;
          editorObserver.disconnect(); editorObserver = null;
          if (alive() && !desktop && (returnPicker || isCatalog())) openPicker();
          else if (alive()) syncBack();
          flushDeferredRefresh();
        });
        editorObserver.observe(editor.parentNode, { childList: true });
      }
    }
    function render() {
      if (destroyed) return;
      const sequence = ++readSequence;
      syncControls();
      if (rowWindow) { rowWindow.destroy(); rowWindow = null; }
      clear(scroll);
      if (opts.loading) { count.textContent = ''; scroll.appendChild(el('div', 'pt-loading', 'Wczytywanie Bazy pacjentów…')); return; }
      if (state.view === 'stats') { count.textContent = ''; renderStats(); restorePosition(); return; }
      ++cardsRun; cardsBusy = null; cardsHost = null; cardsBar = null; ghHost = null; ghHint = null; // liczenie z kart trwa tylko, dopóki widać statystyki
      if (state.filter === 'dup') {
        count.textContent = 'Podobne nazwiska';
        if (opts.duplicates && typeof opts.duplicates.render === 'function') opts.duplicates.render(scroll);
      } else if (state.filter === 'lists' && state.listId) renderMembers(sequence);
      else if (isCatalog()) {
        if (desktop) renderCatalog(scroll, sequence);
        else { renderPatients(); if (mounted && !picker && !doc.querySelector('.vilda-pl-overlay')) openPicker(); }
      } else renderPatients();
      if (pickerBody) { clear(pickerBody); renderCatalog(pickerBody, sequence); }
      restorePosition();
    }
    function restorePosition() {
      if (restoreScroll == null || !mounted) return;
      const position = restoreScroll, savedAnchor = restoreAnchor, savedFocus = restoreRowFocus, sequence = readSequence;
      // A list read has not populated the scroll host yet.
      if (scroll.querySelector('.pt-loading')) return;
      restoreScroll = null; restoreAnchor = null; restoreRowFocus = null;
      const schedule = win.requestAnimationFrame || ((callback) => win.setTimeout(callback, 0));
      schedule(() => {
        // A newer query, list selection or refresh owns the scroll position.
        // An older frame must not reset a position chosen after that render.
        if (!guardedRead(sequence)) return;
        scroll.scrollTop = position;
        if (rowWindow) { rowWindow.restore(savedAnchor); rowWindow.focusPatient(savedFocus); }
        else if (savedFocus) {
          const node = Array.from(scroll.querySelectorAll('.pt-row')).find((row) => row.dataset.patientId === savedFocus.patientId);
          const controls = node && node.querySelectorAll('button, input');
          const focus = controls && controls[Math.min(Number(savedFocus.control) || 0, controls.length - 1)];
          if (focus) focus.focus({ preventScroll: true });
        }
      });
    }
    function closePicker(restoreFocus, keepDeferredRefresh) {
      if (!picker) return;
      const previous = pickerReturnFocus;
      if (picker.parentNode) picker.parentNode.removeChild(picker);
      picker = null; pickerBody = null; pickerInput = null; pickerReturnFocus = null;
      if (!desktop && isCatalog()) state.filter = 'all';
      syncBack();
      if (restoreFocus && previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
      if (!keepDeferredRefresh) flushDeferredRefresh();
    }
    function deferRefresh() {
      if (destroyed || (!picker && !editorObserver)) return false;
      pendingRefresh = true;
      return true;
    }
    function flushDeferredRefresh() {
      if (destroyed || !pendingRefresh || picker || doc.querySelector('.vilda-pl-overlay')) return;
      pendingRefresh = false;
      if (typeof opts.onDeferredRefresh === 'function') opts.onDeferredRefresh();
    }
    function pickerKeyboard(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(true); render(); return; }
      if (event.key !== 'Tab' || !picker) return;
      const focusable = Array.from(picker.querySelectorAll('button, input, select, [tabindex="0"]')).filter((node) => !node.disabled && !node.hidden);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) return;
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    function openPicker() {
      if (destroyed || busy || !mounted) return;
      if (desktop) { state.filter = 'lists'; state.listId = null; render(); return; }
      if (picker) return;
      pickerReturnFocus = doc.activeElement;
      const overlay = el('div', 'vilda-auth-overlay-sheet vilda-patients-list-picker');
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Listy');
      const sheet = el('section', 'pt-picker-sheet');
      const top = el('div', 'pt-picker-head'); top.appendChild(el('h2', null, 'Listy'));
      const close = textButton('pt-picker-close', '', () => { closePicker(true); render(); }, 'close'); close.setAttribute('aria-label', 'Zamknij listy'); top.appendChild(close); sheet.appendChild(top);
      pickerInput = el('input', 'pt-picker-search'); pickerInput.type = 'search'; pickerInput.placeholder = 'Szukaj listy'; pickerInput.setAttribute('aria-label', 'Szukaj listy'); pickerInput.value = state.listQuery;
      pickerInput.addEventListener('input', () => { state.listQuery = pickerInput.value; render(); }); sheet.appendChild(pickerInput);
      pickerBody = el('div', 'pt-picker-body'); sheet.appendChild(pickerBody);
      const actions = el('div', 'pt-picker-actions');
      actions.appendChild(button('pt-secondary', 'Cała baza', () => { closePicker(false); chooseTab('all'); }));
      if (mayUseLists()) actions.appendChild(button('pl-new pt-primary', '+ Nowa lista', () => editList(null)));
      sheet.appendChild(actions); overlay.appendChild(sheet); picker = overlay;
      overlay.addEventListener('click', (event) => { if (event.target === overlay) { closePicker(true); render(); } });
      overlay.addEventListener('keydown', pickerKeyboard);
      doc.body.appendChild(overlay); syncBack();
      const sequence = ++readSequence; renderCatalog(pickerBody, sequence);
      // Do not open the virtual keyboard merely to choose an existing list.
      close.focus();
    }
    function resize() {
      const next = media ? media.matches : (win.innerWidth || 1024) >= 992;
      if (destroyed || !mounted) return;
      if (desktop === next) { if (rowWindow) rowWindow.resize(); return; }
      savePosition();
      restoreScroll = scroll.scrollTop; restoreAnchor = rowWindow ? rowWindow.anchor() : null; restoreRowFocus = focusedPatient();
      desktop = next;
      if (desktop && picker) { closePicker(false); state.filter = 'lists'; state.listId = null; }
      render();
    }
    function proChanged() {
      if (!alive()) return;
      invalidateLists();
      render();
    }
    search.addEventListener('input', () => { if (isCatalog()) state.listQuery = search.value; else state.query = search.value; render(); scroll.scrollTop = 0; });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && search.value) { event.stopPropagation(); if (isCatalog()) state.listQuery = ''; else state.query = ''; render(); }
    });

    function focusedPatient() {
      const active = doc.activeElement, row = active && active.closest ? active.closest('.pt-row') : null;
      return row && scroll.contains(row) ? { patientId: row.dataset.patientId, control: Array.from(row.querySelectorAll('button, input')).indexOf(active) } : null;
    }
    function read() {
      if (finalSnapshot) return Object.assign({}, finalSnapshot, { selected: Object.assign({}, finalSnapshot.selected) });
      return Object.assign({}, state, {
        selected: Object.assign({}, state.selected),
        scrollTop: scroll.scrollTop,
        rowAnchor: rowWindow ? rowWindow.anchor() : null, rowFocus: focusedPatient(),
        rowHeights: Array.from(rowHeights.entries()), measuredWidth,
        focused: doc.activeElement === search,
        selectionStart: search.selectionStart,
        selectionEnd: search.selectionEnd
      });
    }
    function destroy() {
      if (destroyed) return;
      finalSnapshot = read(); destroyed = true; ++readSequence; ++cardsRun; cardsBusy = null; invalidateLists();
      closePicker(false); closeSort();
      if (rowWindow) { rowWindow.destroy(); rowWindow = null; }
      if (unregisterBack) { unregisterBack(); unregisterBack = null; }
      if (observer) observer.disconnect();
      if (editorObserver) editorObserver.disconnect();
      if (focusTimer != null) win.clearTimeout(focusTimer);
      win.removeEventListener('resize', resize);
      if (media && typeof media.removeEventListener === 'function') media.removeEventListener('change', resize);
      doc.removeEventListener('click', outsideSort);
      doc.removeEventListener('keydown', keyboardSort);
      doc.removeEventListener('vildaProAccessChanged', proChanged);
      win.removeEventListener('vildaProAccessChanged', proChanged);
    }
    function mount() {
      if (mounted || destroyed) return;
      mounted = true;
      win.addEventListener('resize', resize);
      if (media && typeof media.addEventListener === 'function') media.addEventListener('change', resize);
      doc.addEventListener('click', outsideSort);
      doc.addEventListener('keydown', keyboardSort);
      doc.addEventListener('vildaProAccessChanged', proChanged);
      win.addEventListener('vildaProAccessChanged', proChanged);
      if (typeof win.MutationObserver === 'function' && root.parentNode) {
        observer = new win.MutationObserver(() => { if (!root.isConnected) destroy(); });
        observer.observe(root.parentNode, { childList: true });
      }
      render();
      if (desktop && initial.focused !== false && !initial.rowFocus) focusTimer = win.setTimeout(() => {
        focusTimer = null;
        // The deferred restore only fills the gap after mounting. A busy page can
        // run it late: once focus is already in this view (the user has selected
        // the query, placed the caret or chosen a row), the caret saved by the
        // previous view must not replace that selection or take the focus away.
        if (!alive() || picker || root.contains(doc.activeElement)) return;
        search.focus();
        if (typeof search.setSelectionRange === 'function' && initial.selectionStart != null) {
          try { search.setSelectionRange(initial.selectionStart, initial.selectionEnd); } catch { /* search input differs across engines */ }
        }
      }, 60);
    }
    syncControls();
    return { root, read, destroy, mount, refreshDuplicates, deferRefresh };
  }
  function createLoading(options) { return create(Object.assign({}, options, { loading: true, patients: [], initialState: { focused: false } })); }
  win.VildaPatientsList = Object.freeze({ create, createLoading, demographics, cardCompleteness, formatAge, ghPatient, ghCohort });
})(typeof window !== 'undefined' ? window : null);
