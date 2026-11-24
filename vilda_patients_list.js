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
  function measureOf(value) {
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
    const startAge = start ? therapyAge(start) : null, startHeight = start ? measureOf(start.height) : null;
    if (!start || startAge === null || startHeight === null) { result.reason = 'no-start'; return result; }
    const range = annualWindow(tools.tempo);
    if (!range) { result.reason = 'no-engine'; return result; }
    const measured = (point) => ({ ageMonths: therapyAge(point), height: measureOf(point.height), point });
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
    rows(data.ghTherapyPoints).forEach((point) => { if (point) keep(therapyAge(point), measureOf(point.height)); });
    rows(data.obesityTherapyPoints).forEach((point) => { if (point) keep(therapyAge(point), measureOf(point.height)); });
    [data.advanced && data.advanced.data && data.advanced.data.measurements, data.growthBasic && data.growthBasic.data && data.growthBasic.data.measurements]
      .forEach((list) => rows(list).forEach((row) => {
        if (!row) return;
        keep(finite(row.ageMonths) !== null ? row.ageMonths : finite(row.ageYears) !== null ? row.ageYears * 12 : null, measureOf(row.height));
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
  function formatDelta(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const places = typeof digits === 'number' ? digits : 2;
    const text = Math.abs(value).toFixed(places).replace('.', ',');
    return (Number(Math.abs(value).toFixed(places)) === 0 ? '' : value > 0 ? '+' : '−') + text;
  }
  /* P-BAZA-STATYSTYKI, etap 3 (decyzja właściciela 2026-11-24): leczenie otyłości.
   * Model nie zna reguł leczenia: cykle dzieli VildaCykleLeczenia.podziel, tygodnie leczenia liczy
   * ObesityResponseCriteria.tygodnieOceny (z dat, a bez nich z wieku), BMI i BMI-SDS — VildaBmi,
   * granicę dziecko/dorosły — VildaBmi.dorosly. Punkty to wizyty z zapisu karty RAZEM z wpisami
   * między wizytami (dziennik leczenia), złożone przez VildaDziennikOtylosci — składa je widok.
   *
   * Definicje:
   *   - leczony = ma co najmniej jeden punkt leczenia otyłości (Włączenie, Kontynuacja, Zakończenie);
   *   - liczy się PIERWSZY cykl z punktem Włączenia; masa Włączenia jest punktem odniesienia;
   *   - „po 12 tyg.” = pomiar masy z okna 9–15 tyg. od Włączenia, najbliższy 12. tygodnia;
   *     „po 6 mies.” = pomiar z okna 20–32 tyg., najbliższy 26. tygodnia (okno ±25%, jak okno
   *     roczne tempa wzrastania);
   *   - zmiana masy % = (masa − masa Włączenia) / masa Włączenia × 100 (ujemna = ubytek) — ta sama
   *     wielkość, co `zmianaMasyPct` w P-POSTEPY; tempo w kg/mies. = zmiana w kg / (tygodnie / 4,348);
   *   - u dziecka (poniżej granicy dorosłości przy Włączeniu) dodatkowo zmiana BMI % i BMI-SDS:
   *     z najbliższego w tym samym oknie pomiaru, który ma BMI (masa ze wzrostem albo zapisane BMI).
   * Pacjent bez pomiaru w oknie nie wchodzi do średniej i jest wykazany z powodem. */
  const OBESITY_WINDOWS = [
    { key: 'w12', after: 'po 12 tyg.', target: 12, min: 9, max: 15 },
    { key: 'm6', after: 'po 6 mies.', target: 26, min: 20, max: 32 }
  ];
  const OBESITY_REASONS = ['no-start', 'no-control', 'too-early'];
  const WEEKS_PER_MONTH = 365.25 / 12 / 7;
  function obesityReason(key, range) {
    if (key === 'no-start') return 'brak Włączenia z masą';
    return key === 'no-control' ? 'brak pomiaru w ' + range.min + '–' + range.max + ' tyg.' : 'leczenie krótsze niż ' + range.min + ' tyg.';
  }
  /* Progi „redukcja o co najmniej X%” nie są wpisane w model: to szczeble wspólne WSZYSTKIM
   * drabinkom pasm aplikacji (VildaPostepyDoroslegoDane.ZESTAWY, P-POSTEPY) — dziś 5 i 10%. */
  function obesityThresholds(bands) {
    const sets = bands && bands.ZESTAWY && typeof bands.ZESTAWY === 'object'
      ? Object.keys(bands.ZESTAWY).map((key) => bands.ZESTAWY[key] && bands.ZESTAWY[key].progi).filter((list) => Array.isArray(list) && list.length) : [];
    if (!sets.length) return [];
    return sets[0].filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0 && sets.every((list) => list.indexOf(value) !== -1))
      .sort((x, y) => x - y);
  }
  function obesityPatient(payload, points, deps) {
    const data = payload && typeof payload === 'object' ? payload : {};
    const tools = deps || {};
    const raw = (Array.isArray(points) ? points : [])
      .filter((point) => point && (point.type === 'start' || point.type === 'continue' || point.type === 'end'));
    if (!raw.length) return null;
    const result = { drug: '', child: null, windows: {}, reasons: {} };
    OBESITY_WINDOWS.forEach((range) => { result.windows[range.key] = null; result.reasons[range.key] = null; });
    const stop = (reason) => { OBESITY_WINDOWS.forEach((range) => { result.reasons[range.key] = reason; }); return result; };
    const drugOf = (list) => {
      if (typeof tools.lek !== 'function') return '';
      for (const point of list) {
        const name = String(tools.lek(point) || '').trim();
        if (name) return name;
      }
      return '';
    };
    if (typeof tools.cykle !== 'function' || typeof tools.tygodnie !== 'function') { result.drug = drugOf(raw); return stop('no-engine'); }
    const split = tools.cykle(raw);
    const cycle = ((split && split.cykle) || []).find((item) => item && item.wlaczenie);
    const start = cycle ? cycle.wlaczenie : null;
    result.drug = drugOf(start ? [start].concat(cycle.punkty) : raw);
    const startWeight = start ? measureOf(start.weight) : null;
    if (!start || startWeight === null) return stop('no-start');
    const population = data.clinical && data.clinical.downSyndrome === true ? 'DS' : 'OGOLNA';
    const startAge = therapyAge(start);
    if (typeof tools.dorosly === 'function' && startAge !== null) result.child = !tools.dorosly(startAge, population);
    // BMI punktu jak w Karcie pacjenta: z masy i wzrostu, a bez nich z zapisanego BMI.
    const bmiOf = (point) => {
      const weight = measureOf(point.weight), height = measureOf(point.height);
      if (weight !== null && height !== null && typeof tools.bmi === 'function') {
        const value = tools.bmi({ masaKg: weight, wzrostCm: height });
        if (finite(value) !== null && value > 0) return value;
      }
      return finite(point.bmi) !== null && point.bmi > 0 ? point.bmi : null;
    };
    const later = cycle.punkty.slice(cycle.punkty.indexOf(start) + 1).map((point) => (
      { point, weeks: finite(tools.tygodnie(start, point)), weight: measureOf(point.weight), bmi: bmiOf(point) }
    )).filter((item) => item.weeks !== null && item.weeks > 0);
    const weighed = later.filter((item) => item.weight !== null), withBmi = later.filter((item) => item.bmi !== null);
    const startBmi = result.child === true ? bmiOf(start) : null;
    const sex = sexKey(data.user && data.user.sex);
    const source = data.zscore && /^(OLAF|WHO|PALCZEWSKA)$/i.test(String(data.zscore.dataSource || '')) ? String(data.zscore.dataSource).toUpperCase() : tools.defaultSource || null;
    const sdsAt = (point, bmi) => {
      const age = therapyAge(point);
      if (!sex || age === null || typeof tools.bmiSds !== 'function') return null;
      return finite(tools.bmiSds({ bmi, plec: sex, wiekMies: age, zrodlo: source, populacja: population }));
    };
    const startSds = startBmi !== null ? sdsAt(start, startBmi) : null;
    OBESITY_WINDOWS.forEach((range) => {
      const picked = annualPick(weighed, (item) => item.weeks, range);
      if (!picked) { result.reasons[range.key] = weighed.some((item) => item.weeks >= range.min) ? 'no-control' : 'too-early'; return; }
      const change = picked.weight - startWeight;
      const entry = { weeks: picked.weeks, pct: change / startWeight * 100, kg: change, kgPerMonth: change / (picked.weeks / WEEKS_PER_MONTH), bmiPct: null, bmiSds: null };
      const measured = startBmi !== null ? annualPick(withBmi, (item) => item.weeks, range) : null;
      if (measured) {
        entry.bmiPct = (measured.bmi - startBmi) / startBmi * 100;
        const after = startSds !== null ? sdsAt(measured.point, measured.bmi) : null;
        if (after !== null) entry.bmiSds = after - startSds;
      }
      result.windows[range.key] = entry;
    });
    return result;
  }
  function obesityCohort(entries, options) {
    const list = (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.ob);
    const thresholds = ((options && options.thresholds) || []).filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
    const windowOf = (items, range) => {
      const at = (entry) => entry.ob.windows[range.key];
      const have = items.filter((entry) => at(entry));
      const pct = have.map((entry) => at(entry).pct);
      const kids = have.filter((entry) => entry.ob.child === true && at(entry).bmiPct !== null);
      const scored = kids.filter((entry) => at(entry).bmiSds !== null);
      return {
        n: have.length, mean: mean(pct), median: median(pct), ids: have.map((entry) => entry.id),
        kgPerMonth: mean(have.map((entry) => at(entry).kgPerMonth)),
        gained: have.filter((entry) => at(entry).pct > 0).map((entry) => entry.id),
        // „Co najmniej próg”: z zapasem na zaokrąglenie dzielenia (−5% zapisane jako −4,999…).
        thresholds: thresholds.map((threshold) => {
          const reached = have.filter((entry) => at(entry).pct <= -threshold + 1e-9);
          return { threshold, n: reached.length, ids: reached.map((entry) => entry.id) };
        }),
        bmi: { n: kids.length, mean: mean(kids.map((entry) => at(entry).bmiPct)), sdsN: scored.length, sds: mean(scored.map((entry) => at(entry).bmiSds)) },
        people: have.map((entry) => ({ id: entry.id, pct: at(entry).pct })).sort((x, y) => y.pct - x.pct)
      };
    };
    const windows = {}, missing = {};
    OBESITY_WINDOWS.forEach((range) => {
      windows[range.key] = windowOf(list, range);
      missing[range.key] = {};
      OBESITY_REASONS.forEach((key) => { missing[range.key][key] = list.filter((entry) => entry.ob.reasons[range.key] === key).map((entry) => entry.id); });
    });
    const drugs = new Map();
    list.forEach((entry) => {
      const key = entry.ob.drug || 'bez leku';
      if (!drugs.has(key)) drugs.set(key, []);
      drugs.get(key).push(entry);
    });
    return {
      treated: list.length, ids: list.map((entry) => entry.id),
      children: list.filter((entry) => entry.ob.child === true).length, adults: list.filter((entry) => entry.ob.child === false).length,
      windows, missing,
      drugs: Array.from(drugs.entries()).map(([drug, items]) => {
        const parts = {};
        OBESITY_WINDOWS.forEach((range) => { const part = windowOf(items, range); parts[range.key] = { n: part.n, mean: part.mean }; });
        return { drug, treated: items.length, ids: items.map((entry) => entry.id), windows: parts,
          small: OBESITY_WINDOWS.some((range) => parts[range.key].n > 0 && parts[range.key].n < SMALL_GROUP) };
      }).sort((x, y) => y.treated - x.treated || x.drug.localeCompare(y.drug, 'pl'))
    };
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
  const FALL_HEIGHT = 132, FALL_PAD = 8;
  const CARD_READERS = 4;   // liczba kart czytanych naraz przy liczeniu statystyk (pomiar: 4 naraz ≈ 2× szybciej niż po kolei, więcej nie pomaga)

  /* ── P-BAZA-SZYBKIE (decyzja właściciela 2026-11-24): liczenie z kart przyrostowo ─────────────
   * Wynik każdej karty zostaje w pamięci widoku do końca sesji; kolejne liczenie czyta tylko karty
   * nowe i zmienione. Karta jest „ta sama”, gdy nie zmieniła się chwila jej zapisu (lastSavedAtISO)
   * ANI znacznik wpisów między wizytami — dopisanie takiego wpisu nie zmienia chwili zapisu karty,
   * więc sama chwila zapisu nie wystarcza. Wynik nieodczytanej karty nie jest pamiętany. */
  function journalIndex(notes, isEntry) {
    const byPatient = new Map();
    (Array.isArray(notes) ? notes : []).forEach((note) => {
      if (!note || typeof note.patientId !== 'string' || (typeof isEntry === 'function' && !isEntry(note))) return;
      if (!byPatient.has(note.patientId)) byPatient.set(note.patientId, []);
      byPatient.get(note.patientId).push(note);
    });
    return {
      of: (patientId) => byPatient.get(patientId) || [],
      // Znacznik: identyfikatory i chwile zmiany wpisów pacjenta — zmienia się po dopisaniu, poprawce i usunięciu wpisu.
      mark: (patientId) => (byPatient.get(patientId) || []).map((note) => String(note.id) + '@' + (note.updatedAtISO || note.createdAtISO || '')).sort().join('|')
    };
  }
  function cardsPlan(base, cached, markOf) {
    const kept = {}, stale = [];
    (Array.isArray(base) ? base : []).forEach((record) => {
      const hit = cached && cached[record.patientId];
      if (hit && hit.read === true && hit.stamp === (record.lastSavedAtISO || '') && hit.journal === markOf(record.patientId)) kept[record.patientId] = hit;
      else stale.push(record);
    });
    return { kept, stale };
  }
  function cardsResult(base, items) {
    const missing = {}; CARD_ITEMS.forEach(([key]) => { missing[key] = []; });
    const treated = [], obese = [], details = [];
    let failed = 0, partial = 0;
    (Array.isArray(base) ? base : []).forEach((record) => {
      const id = record.patientId, item = items && items[id];
      if (!item || item.read !== true) { failed += 1; details.push({ id, card: null, gh: null, ob: null }); return; }
      CARD_ITEMS.forEach(([key]) => { if (!item.card[key]) missing[key].push(id); });
      if (item.gh) treated.push({ id, gh: item.gh });
      if (item.ob) { obese.push({ id, ob: item.ob }); if (item.partial) partial += 1; }
      details.push({ id, card: item.card, gh: item.gh, ob: item.ob });
    });
    return { total: details.length, failed, missing, details, treated, obese, partial };
  }
  /* ── P-ROZPOZNANIA, rata 2 (decyzja właściciela 2026-11-24): statystyki według rozpoznania ─────
   * Rozpoznania to notatki kategorii „treatment” z kontekstem leczenia (kind „diagnosis”) — te same,
   * które wpisuje Karta pacjenta (docs/PATIENT_TREATMENT.md). Jeden odczyt notatek tej kategorii daje
   * rozpoznania całej bazy (diagnosisIndex). Liczenie (diagnosisCohort) niczego nie wnioskuje z BMI,
   * leku ani programu — zlicza to, co wpisał lekarz:
   *   - grupą jest kod ICD-10 po ujednoliceniu zapisu (bez kropki, spacji i znaczków †/*, wielkie litery):
   *     „e660”, „E66.0” i „E66.0†” to ten sam kod; kody o tych samych trzech pierwszych znakach (litera
   *     i dwie cyfry) tworzą kategorię z podkodami;
   *   - rozpoznanie bez kodu grupuje się po nazwie (bez wielkości liter, polskich znaków i zbędnych spacji);
   *   - pacjent liczy się w grupie raz, a z kilkoma rozpoznaniami jest w każdej ze swoich grup, więc liczby
   *     grup nie sumują się do liczby pacjentów;
   *   - pacjent jest wśród „aktywnych” grupy, gdy ma w niej choć jedno aktywne rozpoznanie; wśród
   *     „zamkniętych” — gdy ma w niej wyłącznie zamknięte. */
  const DIAGNOSIS_CATEGORY = 'treatment';
  const DIAGNOSIS_NOTE = 'Liczone są rozpoznania aktywne. Pacjent z kilkoma rozpoznaniami jest w każdym z nich, więc liczby nie sumują się do liczby pacjentów.';
  function diagnosisFold(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁ]/g, 'l').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function diagnosisCodeKey(value) { return String(value || '').replace(/[.\s†*+]/g, '').toUpperCase(); }
  function diagnosisLabel(code, name) { return code && name ? code + ' — ' + name : code || name || ''; }
  function diagnosisIndex(notes, decode) {
    const byPatient = new Map();
    (Array.isArray(notes) ? notes : []).forEach((note) => {
      if (!note || typeof note.patientId !== 'string' || typeof decode !== 'function') return;
      let decoded;
      try { decoded = decode(note); } catch { decoded = null; }
      const context = decoded && decoded.kind === 'diagnosis' ? decoded.context : null;
      if (!context) return;
      if (!byPatient.has(note.patientId)) byPatient.set(note.patientId, []);
      byPatient.get(note.patientId).push({ id: String(note.id), name: String(context.name || '').trim(), code: String(context.code || '').trim(),
        active: context.status === 'active', dateISO: context.dateISO || '', stamp: note.updatedAtISO || note.createdAtISO || '' });
    });
    return {
      of: (patientId) => byPatient.get(patientId) || [],
      // Znacznik całości: zmienia się po dodaniu, poprawce i usunięciu któregokolwiek rozpoznania.
      mark: Array.from(byPatient.keys()).sort().map((id) => id + ':' + byPatient.get(id).map((item) => item.id + '@' + item.stamp).sort().join(',')).join('|')
    };
  }
  function diagnosisCohort(base, index, options) {
    const lookup = options && typeof options.lookup === 'function' ? options.lookup : () => null;
    const records = Array.isArray(base) ? base : [];
    const collator = (left, right) => left.localeCompare(right, 'pl');
    const groups = new Map(), none = [], onlyClosed = [], withActive = [];
    let activeRecords = 0, closedRecords = 0;
    const bucket = (map, key) => {
      if (!map.has(key)) map.set(key, { key, active: new Set(), any: new Set(), codes: new Map(), names: new Map(), items: new Map(), category: null });
      return map.get(key);
    };
    const tally = (map, value) => { if (value) map.set(value, (map.get(value) || 0) + 1); };
    const place = (target, patientId, item) => {
      target.any.add(patientId);
      if (item.active) target.active.add(patientId);
      tally(target.codes, item.code); tally(target.names, item.name);
    };
    records.forEach((record) => {
      const list = index && typeof index.of === 'function' ? index.of(record.patientId) : [];
      if (!list.length) { none.push(record.patientId); return; }
      if (list.some((item) => item.active)) withActive.push(record.patientId); else onlyClosed.push(record.patientId);
      list.forEach((item) => {
        if (item.active) activeRecords += 1; else closedRecords += 1;
        const key = diagnosisCodeKey(item.code);
        if (!key) { place(bucket(groups, 'n:' + diagnosisFold(item.name)), record.patientId, item); return; }
        const category = /^[A-Z][0-9]{2}/.test(key) ? key.slice(0, 3) : key;
        const group = bucket(groups, 'c:' + category);
        group.category = category;
        place(group, record.patientId, item);
        place(bucket(group.items, key), record.patientId, item);
      });
    });
    // Najczęstszy zapis (przy remisie pierwszy alfabetycznie) — żeby etykieta nie zależała od kolejności kart.
    const top = (map) => Array.from(map.entries()).sort((x, y) => y[1] - x[1] || collator(x[0], y[0])).map((entry) => entry[0])[0] || '';
    const found = (code) => { try { return code ? lookup(code) || null : null; } catch { return null; } };
    const figures = (target) => {
      const ids = Array.from(target.active), closedIds = Array.from(target.any).filter((id) => !target.active.has(id));
      return { n: ids.length, ids, closed: closedIds.length, closedIds, allIds: Array.from(target.any) };
    };
    const order = (left, right) => right.n - left.n || right.closed - left.closed || collator(left.label, right.label);
    const coded = (target) => {
      const code = top(target.codes), entry = found(code), name = entry && entry.name ? entry.name : top(target.names);
      return Object.assign({ key: 'c:' + target.key, code, name, label: diagnosisLabel(code, name), items: [] }, figures(target));
    };
    const result = Array.from(groups.values()).map((group) => {
      if (!group.category) {
        const name = top(group.names);
        return Object.assign({ key: group.key, code: '', name, label: name, items: [] }, figures(group));
      }
      const items = Array.from(group.items.values()).map(coded).sort(order);
      if (items.length === 1) return Object.assign({}, items[0], { key: group.key });
      // Nazwa kategorii: z katalogu (sam kod kategorii albo kategoria nadrzędna podkodu), a bez katalogu — z rozpoznania o tym kodzie.
      const own = found(group.category), viaChild = items.map((item) => found(item.code)).find((entry) => entry && entry.parentName && diagnosisCodeKey(entry.parentCode) === group.category);
      const bare = items.find((item) => diagnosisCodeKey(item.code) === group.category);
      const name = own && own.name ? own.name : viaChild ? viaChild.parentName : bare ? bare.name : '';
      return Object.assign({ key: group.key, code: group.category, name, label: diagnosisLabel(group.category, name), items }, figures(group));
    }).sort(order);
    return {
      total: records.length, withActive: withActive.length, activeIds: withActive,
      onlyClosed: { n: onlyClosed.length, ids: onlyClosed }, none: { n: none.length, ids: none },
      records: { active: activeRecords, closed: closedRecords }, groups: result
    };
  }
  /* ── P-BAZA-GRUPY (makieta statystyk; decyzja właściciela 2026-11-24: „praca nad grupami pacjentów z makiety”) ──
   * Zakres statystyk z filtrów: tylko pacjenci z zapisem w ostatnich 12 miesiącach, pacjenci wybranej listy,
   * jedna płeć, jeden przedział wieku — oraz rozpoznanie wybrane w sekcji „Rozpoznania” (rata 2). Filtry łączą się
   * spójnikiem „i”: pacjent jest w zakresie, gdy spełnia wszystkie wybrane. Model jest czysty i niczego nie liczy
   * inaczej niż demographics: ta sama reguła „zapisu w ostatnich 12 mies.”, ten sam wiek na dziś z pełnej daty
   * urodzenia i te same przedziały; pacjent bez daty urodzenia nie wchodzi do żadnego przedziału wieku, a pacjent
   * bez płci — do żadnej płci. Liczą się wyłącznie pacjenci z bazy. */
  const SCOPE_SEX = { M: 'chłopcy', F: 'dziewczęta' };
  const SCOPE_RECENT = 'z zapisem w ostatnich 12 mies.';
  function scopeFilters(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      recent: source.recent === true,
      listId: typeof source.listId === 'string' && source.listId ? source.listId : null,
      listName: typeof source.listName === 'string' ? source.listName : '',
      sex: source.sex === 'M' || source.sex === 'F' ? source.sex : null,
      band: AGE_BANDS.some((band) => band.key === source.band) ? source.band : null
    };
  }
  function scopeActive(filters) { return Boolean(filters && (filters.recent || filters.listId || filters.sex || filters.band)); }
  // Klucz pamięci wyniku dla zakresu; dx — grupa rozpoznania ({ key }) albo null.
  function scopeKey(filters, dx) {
    const f = scopeFilters(filters);
    return [f.recent ? 'r' : '', f.listId ? 'l:' + f.listId : '', f.sex ? 's:' + f.sex : '', f.band ? 'b:' + f.band : '', dx && dx.key ? 'd:' + dx.key : ''].filter(Boolean).join('|');
  }
  // Opis zakresu dla banera, nagłówka raportu i nazwy grupy — w kolejności filtrów na ekranie, rozpoznanie na końcu.
  function scopeLabel(filters, dx) {
    const f = scopeFilters(filters), band = AGE_BANDS.find((item) => item.key === f.band);
    return [f.recent ? SCOPE_RECENT : '', f.listId ? 'lista „' + (f.listName || 'bez nazwy') + '”' : '', f.sex ? SCOPE_SEX[f.sex] : '',
      band ? band.label : '', dx && dx.label ? String(dx.label) : ''].filter(Boolean).join(' · ');
  }
  /* Identyfikatory pacjentów z bazy, którzy spełniają wszystkie filtry. options: now, ageMonths (jak w demographics),
   * listIds — członkowie wybranej listy (tablica albo Set), ids — pacjenci grupy rozpoznania. Wybrana lista bez
   * wczytanych członków daje null: zakresu nie da się jeszcze policzyć (to nie jest „zero pacjentów”). */
  function scopeMembers(patientRecords, filters, options) {
    const settings = options || {}, f = scopeFilters(filters);
    const now = settings.now instanceof Date ? settings.now : new Date();
    const ageOf = typeof settings.ageMonths === 'function' ? settings.ageMonths : (dobISO) => monthsFromDob(dobISO, now);
    const asSet = (value) => value instanceof Set ? value : Array.isArray(value) ? new Set(value) : null;
    const listIds = asSet(settings.listIds), groupIds = asSet(settings.ids);
    if (f.listId && !listIds) return null;
    const yearAgo = new Date(now.getTime()); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const band = AGE_BANDS.find((item) => item.key === f.band) || null;
    return (Array.isArray(patientRecords) ? patientRecords : []).filter((record) => {
      if (!record || record.__ext) return false;
      if (groupIds && !groupIds.has(record.patientId)) return false;
      if (f.listId && !listIds.has(record.patientId)) return false;
      const header = record.header || {};
      if (f.sex && sexKey(header.sex) !== f.sex) return false;
      if (f.recent) {
        const saved = record.lastSavedAtISO ? new Date(record.lastSavedAtISO).getTime() : NaN;
        if (!Number.isFinite(saved) || saved < yearAgo.getTime()) return false;
      }
      if (band) {
        const computed = header.dobISO ? ageOf(header.dobISO) : null;
        if (typeof computed !== 'number' || !Number.isFinite(computed) || computed < 0) return false;
        const years = Math.floor(computed / 12);
        if (years < band.from || (band.to !== null && years > band.to)) return false;
      }
      return true;
    }).map((record) => record.patientId);
  }
  /* ── P-BAZA-STATYSTYKI, etap 4 (decyzja właściciela 2026-11-24): raport PDF i plik dla Excela ──
   * Jeden model raportu (statsReport) z tych samych obiektów, które rysuje ekran: demographics,
   * ghCohort, obesityCohort i kompletność kart. Z niego powstają OBA pliki — dokument pdfmake
   * (statsDocument) i arkusze (statsWorkbook → xlsxParts) — więc liczby w plikach i na ekranie
   * nie mogą się rozjechać. Pliki nie zawierają nazwisk, dat urodzenia ani identyfikatorów:
   * raport to liczby zbiorcze, a arkusz „Pacjenci” ma jeden wiersz na pacjenta bez danych
   * osobowych, w kolejności wieku (nie nazwiska). Model niczego nie liczy od nowa. */
  const REPORT_TITLE = 'Statystyki Bazy pacjentów';
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function percentText(value) {
    return formatDelta(value, 1) + (typeof value === 'number' && Number.isFinite(value) ? '%' : '');
  }
  function ghNote() {
    return '1. rok: od punktu Włączenia do kontroli po 9–15 mies. (najbliższej 12 mies.), w pierwszym kursie leczenia. Kolejne lata liczą się tak samo od poprzedniej kontroli. Pacjent bez takiej pary nie wchodzi do średniej. Przy grupie mniejszej niż ' + SMALL_GROUP + ' osób średnia jest niestabilna.';
  }
  function obesityNote(journalFailed) {
    return 'Zmiana masy od punktu Włączenia w pierwszym cyklu leczenia do pomiaru najbliższego '
      + OBESITY_WINDOWS.map((period) => period.target + '. tygodnia (okno ' + period.min + '–' + period.max + ' tyg.)').join(' i ')
      + '; liczą się wizyty i wpisy między wizytami. U dzieci masa rośnie ze wzrostem, dlatego osobno pokazana jest zmiana BMI. Pacjent bez pomiaru w oknie nie wchodzi do średniej. Przy grupie mniejszej niż ' + SMALL_GROUP + ' osób średnia jest niestabilna.'
      + (journalFailed ? ' U ' + journalFailed + (journalFailed === 1 ? ' pacjenta' : ' pacjentów') + ' nie udało się odczytać wpisów między wizytami — policzono z zapisu wizyty.' : '');
  }
  function footNote(total) {
    return 'Statystyki opisowe ' + total + (total === 1 ? ' pacjenta' : ' pacjentów')
      + ' z bazy, bez osób spoza bazy. Policzone na tym urządzeniu; nic nie jest wysyłane. Nie są badaniem naukowym ani podstawą decyzji klinicznych.';
  }
  // Odsetki z progiem, BMI dzieci i wykres pacjentów pokazują dłuższe okno, a gdy nikt go nie ma — krótsze.
  function obesityMainWindow(cohort) {
    return OBESITY_WINDOWS.slice().reverse().find((item) => cohort.windows[item.key].n) || OBESITY_WINDOWS[OBESITY_WINDOWS.length - 1];
  }
  // Skala wykresu „każdy pacjent”: od zera albo przyrostu (góra) do największej redukcji (dół), linie co 5 albo 10%.
  function fallScale(values) {
    const high = Math.max(0, Math.ceil(Math.max.apply(null, values) / 5) * 5);
    const low = Math.min(-10, Math.floor(Math.min.apply(null, values) / 5) * 5);
    return { high, low, step: high - low > 30 ? 10 : 5 };
  }
  function two(value) { return String(value).padStart(2, '0'); }
  function stampText(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
    return two(date.getDate()) + '.' + two(date.getMonth() + 1) + '.' + date.getFullYear() + ', ' + two(date.getHours()) + ':' + two(date.getMinutes());
  }
  function reportFileName(date, extension, group) {
    const day = date instanceof Date && Number.isFinite(date.getTime()) ? date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate()) : '';
    // Raport grupy ma własną nazwę — tego samego dnia nie nadpisuje raportu całej bazy.
    return ['statystyki-bazy-pacjentow', group ? 'grupa' : '', day].filter(Boolean).join('-') + '.' + extension;
  }
  function statsReport(input) {
    const source = input || {};
    const model = source.model, cards = source.cards || null;
    const stamp = source.stamp instanceof Date && Number.isFinite(source.stamp.getTime()) ? source.stamp : null;
    const scope = typeof source.scope === 'string' ? source.scope.trim() : '';
    const num = (value, digits) => finite(value) === null ? null : Number(value.toFixed(digits === undefined ? 2 : digits));
    const col = (title, kind, extra) => Object.assign({ title, kind: kind || 'text' }, extra || {});
    const rate = (title) => col(title, 'num', { digits: 1 });
    const change = (title, digits) => col(title, 'num', { digits: digits === undefined ? 1 : digits, signed: true });
    const sections = [];

    // 1. Pacjenci — z nagłówków kart.
    const patientFacts = [
      { label: scope ? 'Pacjenci w grupie' : 'Pacjenci w bazie', value: model.total, unit: '', text: String(model.total), note: model.recent + ' z zapisem w ostatnich 12 mies.' },
      { label: 'Średni wiek', value: model.withAge ? num(model.meanMonths / 12, 1) : null, unit: model.withAge ? 'lata' : '', text: model.withAge ? formatAge(model.meanMonths) : '—',
        note: model.withAge ? 'mediana ' + formatAge(model.medianMonths) + ' · od ' + formatAge(model.minMonths) + ' do ' + formatAge(model.maxMonths) : 'brak dat urodzenia' }
    ];
    [['M', 'Chłopcy'], ['F', 'Dziewczęta']].forEach(([key, label]) => {
      const average = model.meanMonthsBySex[key];
      patientFacts.push({ label, value: model.sex[key], unit: '', text: String(model.sex[key]),
        note: percent(model.sex[key], model.total) + '%' + (average === null ? '' : ' · średni wiek ' + formatAge(average)) });
    });
    sections.push({
      key: 'patients', title: 'Pacjenci', hint: '', facts: patientFacts, chart: null,
      tables: [{
        key: 'age', title: 'Wiek i płeć',
        columns: [col('Przedział wieku'), col('Chłopcy', 'int'), col('Dziewczęta', 'int'), col('Płeć nieznana', 'int'), col('Razem', 'int'), col('', 'bar')],
        rows: model.bands.map((band) => [band.label, band.M, band.F, band.unknown, band.total,
          [{ value: band.M, color: 'boys' }, { value: band.F, color: 'girls' }, { value: band.unknown, color: 'unknown' }]]),
        barMax: Math.max.apply(null, model.bands.map((band) => band.total).concat([1])),
        note: 'Słupki: niebieski — chłopcy, pomarańczowy — dziewczęta, szary — płeć nieznana.'
      }],
      notes: ['Wiek na dziś, liczony z daty urodzenia.' + (model.missingDob.length ? ' Bez daty urodzenia: ' + model.missingDob.length + ' (poza wiekiem).' : '')]
    });

    // 1a. Rozpoznania (P-ROZPOZNANIA, rata 2) — z notatek rozpoznań, w tym samym zakresie co reszta raportu.
    const dx = source.diagnoses && Array.isArray(source.diagnoses.groups) ? source.diagnoses : null;
    if (dx) {
      const dxSection = { key: 'diagnoses', title: 'Rozpoznania', hint: '', facts: [], tables: [], notes: [], chart: null };
      if (!dx.groups.length) dxSection.notes.push((scope ? 'W tej grupie' : 'W bazie') + ' nie ma rozpoznań.');
      else {
        dxSection.hint = 'z aktywnym rozpoznaniem: ' + dx.withActive + ' z ' + dx.total;
        dxSection.facts.push(
          { label: 'Pacjenci z aktywnym rozpoznaniem', value: dx.withActive, unit: '', text: String(dx.withActive), note: percent(dx.withActive, dx.total) + '% pacjentów' },
          { label: 'Bez rozpoznania', value: dx.none.n, unit: '', text: String(dx.none.n), note: dx.onlyClosed.n ? 'tylko zamknięte: ' + dx.onlyClosed.n : '' },
          { label: 'Rozpoznania aktywne', value: dx.records.active, unit: '', text: String(dx.records.active), note: 'zamknięte: ' + dx.records.closed });
        const dxRows = [];
        dx.groups.forEach((group) => {
          dxRows.push([group.code, group.items.length ? (group.name ? group.name + ' — razem' : 'razem') : group.name, group.n, percent(group.n, dx.total), group.closed, [{ value: group.n, color: 'teal' }]]);
          group.items.forEach((item) => dxRows.push([item.code, item.name, item.n, percent(item.n, dx.total), item.closed, [{ value: item.n, color: 'teal' }]]));
        });
        dxSection.tables.push({
          key: 'diagnoses', title: 'Pacjenci według rozpoznania',
          columns: [col('Kod ICD-10'), col('Rozpoznanie', 'text', { wide: true }), col('Pacjenci', 'int'), col('Odsetek (%)', 'int'), col('Tylko zamknięte', 'int'), col('', 'bar')],
          rows: dxRows, barMax: Math.max.apply(null, dx.groups.map((group) => group.n).concat([1]))
        });
        dxSection.notes.push(DIAGNOSIS_NOTE + ' Odsetek liczony od wszystkich pacjentów ' + (scope ? 'grupy' : 'bazy') + '. Kod i nazwę rozpoznania wpisuje lekarz.');
      }
      sections.push(dxSection);
    }

    if (cards) {
      // 2. Leczenie hormonem wzrostu.
      const gh = cards.gh, ghSection = { key: 'gh', title: 'Leczenie hormonem wzrostu', hint: '', facts: [], tables: [], notes: [], chart: null };
      if (!gh || !gh.treated) ghSection.notes.push('W bazie nie ma pacjentów z punktami leczenia hormonem wzrostu.');
      else {
        ghSection.hint = 'leczonych: ' + gh.treated + ' · ' + gh.programs.map((item) => item.program + ' ' + item.treated).join(' · ');
        ghSection.facts.push({ label: 'Leczonych', value: gh.treated, unit: '', text: String(gh.treated), note: '', only: 'sheet' });
        if (!gh.engineReady) ghSection.notes.push('Tempa nie policzono, bo na stronie, z której liczono, nie wczytał się moduł tempa wzrastania.');
        else {
          ghSection.facts.push(
            { label: 'Tempo w 1. roku leczenia', value: num(gh.first.mean), unit: 'cm/rok', text: gh.first.n ? formatVelocity(gh.first.mean) + ' cm/rok' : '—',
              note: gh.first.n ? 'mediana ' + formatVelocity(gh.first.median) + ' · n = ' + gh.first.n : 'żaden pacjent nie ma kontroli po 9–15 mies.' },
            { label: 'Przed leczeniem → 1. rok', value: null, unit: '', only: 'pdf',
              text: gh.paired.n ? formatVelocity(gh.paired.before) + ' → ' + formatVelocity(gh.paired.first) + ' cm/rok' : '—',
              note: gh.paired.n ? 'n = ' + gh.paired.n + ' z pomiarem 9–15 mies. przed Włączeniem' : 'brak pomiarów 9–15 mies. przed Włączeniem' },
            { label: 'Tempo przed leczeniem (pary)', value: num(gh.paired.before), unit: 'cm/rok', text: '', note: 'n = ' + gh.paired.n, only: 'sheet' },
            { label: 'Tempo w 1. roku (pary)', value: num(gh.paired.first), unit: 'cm/rok', text: '', note: 'n = ' + gh.paired.n, only: 'sheet' },
            { label: 'Zmiana hSDS w 1. roku', value: num(gh.deltaSds.mean, 3), unit: gh.deltaSds.n ? 'SD' : '', text: formatDelta(gh.deltaSds.mean),
              note: gh.deltaSds.n ? 'mediana ' + formatDelta(gh.deltaSds.median) + ' · n = ' + gh.deltaSds.n
                : gh.sdsReady ? 'brak pary hSDS (płeć, wiek lub siatka)' : 'siatki wzrostu nie były wczytane na stronie, z której liczono' }
          );
          ghSection.tables.push({
            key: 'gh-programs', title: 'Wg programu',
            columns: [col('Program'), col('Leczonych', 'int'), col('Z tempem (n)', 'int'), rate('1. rok (cm/rok)'), col('Pary (n)', 'int'), rate('Przed leczeniem'), rate('1. rok — pary'), col('Uwaga')],
            rows: gh.programs.map((item) => [item.program, item.treated, item.n, num(item.mean), item.paired.n,
              item.paired.n ? num(item.paired.before) : null, item.paired.n ? num(item.paired.first) : null, item.small ? 'mała grupa' : ''])
          });
          if (gh.years.length) {
            ghSection.tables.push({
              key: 'gh-years', title: 'Kolejne lata leczenia',
              columns: [col('Rok leczenia'), rate('Średnie tempo (cm/rok)'), col('n', 'int'), col('', 'bar')],
              rows: gh.years.map((item) => [item.year + '. rok', num(item.mean), item.n, [{ value: item.mean, color: 'teal' }]]),
              barMax: Math.max.apply(null, gh.years.map((item) => item.mean).concat([1]))
            });
          }
          const without = GH_REASONS.filter(([key]) => (gh.missing[key] || []).length);
          if (without.length) {
            ghSection.tables.push({ key: 'gh-missing', title: 'Bez tempa w 1. roku', columns: [col('Powód'), col('Pacjentów', 'int')],
              rows: without.map(([key, label]) => [label, gh.missing[key].length]) });
          }
          ghSection.notes.push(ghNote());
        }
      }
      sections.push(ghSection);

      // 3. Leczenie otyłości.
      const ob = cards.obesity, obSection = { key: 'obesity', title: 'Leczenie otyłości', hint: '', facts: [], tables: [], notes: [], chart: null };
      if (!ob || !ob.treated) obSection.notes.push('W bazie nie ma pacjentów z punktami leczenia otyłości.');
      else {
        obSection.hint = 'leczonych: ' + ob.treated + ' · ' + ob.drugs.map((item) => item.drug + ' ' + item.treated).join(' · ');
        obSection.facts.push({ label: 'Leczonych', value: ob.treated, unit: '', text: String(ob.treated), note: 'dzieci: ' + ob.children + ' · dorośli: ' + ob.adults, only: 'sheet' });
        if (!ob.engineReady) obSection.notes.push('Zmiany masy nie policzono, bo na stronie, z której liczono, nie wczytał się moduł cykli leczenia.');
        else {
          OBESITY_WINDOWS.forEach((range) => {
            const part = ob.windows[range.key];
            obSection.facts.push({ label: 'Zmiana masy ' + range.after, value: num(part.mean), unit: part.n ? '%' : '', text: percentText(part.mean),
              note: part.n ? 'mediana ' + percentText(part.median) + ' · n = ' + part.n + ' · ' + formatDelta(part.kgPerMonth, 1) + ' kg/mies.'
                : 'żaden pacjent nie ma pomiaru w ' + range.min + '–' + range.max + ' tyg.' });
          });
          const range = obesityMainWindow(ob), main = ob.windows[range.key];
          if (main.thresholds.length) {
            const first = main.thresholds[0], rest = main.thresholds.slice(1);
            obSection.facts.push({ label: 'Redukcja o ≥ ' + first.threshold + '% ' + range.after, value: main.n ? first.n : null, unit: main.n ? 'z ' + main.n : '',
              text: main.n ? first.n + ' z ' + main.n : '—',
              note: main.n ? percent(first.n, main.n) + '%' + rest.map((item) => ' · o ≥ ' + item.threshold + '%: ' + item.n + ' (' + percent(item.n, main.n) + '%)').join('') : 'brak pomiarów w oknie' });
          }
          const kids = main.bmi;
          obSection.facts.push({ label: 'Dzieci: zmiana BMI ' + range.after, value: num(kids.mean), unit: kids.n ? '%' : '', text: percentText(kids.mean),
            note: kids.n ? 'n = ' + kids.n + (kids.sdsN ? ' · BMI-SDS ' + formatDelta(kids.sds, 2) + (kids.sdsN < kids.n ? ' (n = ' + kids.sdsN + ')' : '')
              : ob.sdsReady ? ' · BMI-SDS: brak płci, wieku lub siatki' : ' · BMI-SDS: siatki nie były wczytane')
              : ob.children ? 'brak pomiaru ze wzrostem w oknie' : 'brak leczonych dzieci' });
          const thresholds = main.thresholds.map((item) => item.threshold);
          obSection.tables.push({
            key: 'ob-windows', title: 'Zmiana masy ciała',
            columns: [col('Okno'), change('Średnia (%)'), change('Mediana (%)'), col('n', 'int'), change('Tempo (kg/mies.)')]
              .concat(thresholds.map((threshold) => col('Redukcja o ≥ ' + threshold + '% (n)', 'int')), [col('Przyrost masy (n)', 'int')]),
            rows: OBESITY_WINDOWS.map((period) => {
              const part = ob.windows[period.key];
              return [period.after, num(part.mean), num(part.median), part.n, num(part.kgPerMonth)]
                .concat(part.thresholds.map((item) => part.n ? item.n : null), [part.n ? part.gained.length : null]);
            })
          });
          if (ob.children) {
            obSection.tables.push({
              key: 'ob-bmi', title: 'Dzieci: zmiana BMI',
              columns: [col('Okno'), change('Zmiana BMI (%)'), col('n', 'int'), change('Zmiana BMI-SDS', 2), col('n (BMI-SDS)', 'int')],
              rows: OBESITY_WINDOWS.map((period) => {
                const bmi = ob.windows[period.key].bmi;
                return [period.after, num(bmi.mean), bmi.n, num(bmi.sds, 3), bmi.sdsN];
              })
            });
          }
          obSection.tables.push({
            key: 'ob-drugs', title: 'Wg leku (zmiana masy)',
            columns: [col('Lek'), col('Leczonych', 'int')].concat(
              OBESITY_WINDOWS.reduce((list, period) => list.concat([change(period.after.charAt(0).toUpperCase() + period.after.slice(1) + ' (%)'), col('n', 'int')]), []), [col('Uwaga')]),
            rows: ob.drugs.map((item) => [item.drug, item.treated].concat(
              OBESITY_WINDOWS.reduce((list, period) => list.concat([num(item.windows[period.key].mean), item.windows[period.key].n]), []), [item.small ? 'mała grupa' : '']))
          });
          const missingRows = [];
          OBESITY_WINDOWS.forEach((period) => OBESITY_REASONS.forEach((key) => {
            const count = (ob.missing[period.key][key] || []).length;
            if (count) missingRows.push([period.after, obesityReason(key, period), count]);
          }));
          if (missingRows.length) obSection.tables.push({ key: 'ob-missing', title: 'Bez wyniku', columns: [col('Okno'), col('Powód'), col('Pacjentów', 'int')], rows: missingRows });
          if (main.n) obSection.chart = { kind: 'fall', title: 'Każdy pacjent ' + range.after, values: main.people.map((person) => num(person.pct)) };
          obSection.notes.push(obesityNote(ob.journalFailed));
        }
      }
      sections.push(obSection);
    }

    // 4. Kompletność danych.
    const dataRows = [
      ['Data urodzenia', model.total - model.missingDob.length, model.total],
      ['Płeć', model.total - model.missingSex.length, model.total]
    ];
    if (cards) {
      const read = cards.total - cards.failed;
      CARD_ITEMS.forEach(([key, label]) => dataRows.push([label, read - (cards.missing[key] || []).length, read]));
    }
    sections.push({
      key: 'data', title: 'Kompletność danych', hint: '', facts: [], chart: null,
      tables: [{ key: 'data', title: 'Ile kart ma dane', columns: [col('Dane'), col('Mają', 'int'), col('Razem', 'int'), col('Odsetek (%)', 'int')],
        rows: dataRows.map((row) => row.concat([percent(row[1], row[2])])) }],
      notes: cards ? (cards.failed ? ['Nie udało się odczytać kart: ' + cards.failed + '.'] : []) : ['Leczenie i kompletność kart nie były liczone.']
    });

    // Arkusz „Pacjenci”: jeden wiersz na pacjenta, bez nazwiska, daty urodzenia i identyfikatora.
    let people = null;
    if (cards && Array.isArray(cards.details)) {
      const ageOf = typeof source.ageMonths === 'function' ? source.ageMonths : () => null;
      const byId = new Map(cards.details.map((item) => [item.id, item]));
      const ghReasons = new Map(GH_REASONS.concat([['no-engine', 'moduł tempa niewczytany']]));
      const dxOf = typeof source.diagnosesOf === 'function' ? source.diagnosesOf : null;
      const columns = [col('Lp.', 'int'), col('Płeć'), col('Wiek (lata)', 'num', { digits: 1 }), col('Przedział wieku')]
        .concat(dxOf ? [col('Rozpoznania aktywne'), col('Rozpoznania zamknięte')] : [], CARD_ITEMS.map(([, label]) => col(label)), [
          col('GH: program'), rate('GH: tempo przed leczeniem (cm/rok)'), rate('GH: tempo 1. rok (cm/rok)'), rate('GH: tempo 2. rok'), rate('GH: tempo 3. rok'), rate('GH: tempo 4. rok'),
          change('GH: zmiana hSDS w 1. roku', 2), col('GH: uwaga'), col('Otyłość: lek'), col('Otyłość: grupa')],
        OBESITY_WINDOWS.reduce((list, period) => list.concat([
          col('Otyłość ' + period.after + ': tydzień pomiaru', 'int'), change('Otyłość ' + period.after + ': zmiana masy (%)'), change('Otyłość ' + period.after + ': tempo (kg/mies.)'),
          change('Otyłość ' + period.after + ': zmiana BMI (%)'), change('Otyłość ' + period.after + ': zmiana BMI-SDS', 2), col('Otyłość ' + period.after + ': uwaga')]), []));
      const rows = (Array.isArray(source.patients) ? source.patients : []).filter((record) => record && !record.__ext).map((record) => {
        const header = record.header || {}, sex = sexKey(header.sex);
        const computed = header.dobISO ? ageOf(header.dobISO) : null;
        const months = typeof computed === 'number' && Number.isFinite(computed) && computed >= 0 ? computed : null;
        const band = months === null ? null : AGE_BANDS.find((item) => Math.floor(months / 12) >= item.from && (item.to === null || Math.floor(months / 12) <= item.to));
        const detail = byId.get(record.patientId) || null, card = detail && detail.card, gh = detail && detail.gh, ob = detail && detail.ob;
        // Rozpoznania pacjenta: kod, a bez kodu — nazwa; w kolejności alfabetycznej, bez powtórzeń.
        const dxList = (active) => Array.from(new Set((dxOf ? dxOf(record.patientId) || [] : []).filter((item) => item.active === active)
          .map((item) => item.code || item.name).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'pl')).join('; ');
        const cells = [sex === 'M' ? 'M' : sex === 'F' ? 'K' : '', months === null ? null : num(months / 12, 1), band ? band.label : '']
          .concat(dxOf ? [dxList(true), dxList(false)] : [], CARD_ITEMS.map(([key]) => card ? (card[key] ? 'tak' : 'nie') : ''), [
            gh ? gh.program || 'bez programu' : '', gh ? num(gh.before) : null,
            gh && gh.years.length > 0 ? num(gh.years[0]) : null, gh && gh.years.length > 1 ? num(gh.years[1]) : null,
            gh && gh.years.length > 2 ? num(gh.years[2]) : null, gh && gh.years.length > 3 ? num(gh.years[3]) : null,
            gh ? num(gh.deltaSds, 3) : null, gh && gh.reason ? ghReasons.get(gh.reason) || '' : '',
            ob ? ob.drug || 'bez leku' : '', ob ? (ob.child === true ? 'dziecko' : ob.child === false ? 'dorosły' : '') : ''],
          OBESITY_WINDOWS.reduce((list, period) => {
            const part = ob && ob.windows[period.key], reason = ob && ob.reasons[period.key];
            return list.concat([part ? part.weeks : null, part ? num(part.pct) : null, part ? num(part.kgPerMonth) : null, part ? num(part.bmiPct) : null, part ? num(part.bmiSds, 3) : null,
              reason ? (reason === 'no-engine' ? 'moduł cykli niewczytany' : obesityReason(reason, period)) : '']);
          }, []));
        return { months, sex: sex || 'Z', cells };
      }).sort((x, y) => (x.months === null ? Infinity : x.months) - (y.months === null ? Infinity : y.months) || x.sex.localeCompare(y.sex));
      people = { columns, rows: rows.map((row, index) => [index + 1].concat(row.cells)) };
    }
    return { title: REPORT_TITLE, scope, stamp, total: model.total, counted: Boolean(cards), sections, closing: footNote(model.total), people };
  }
  /* Arkusze: „Podsumowanie” (te same sekcje, co raport) i „Pacjenci”. Wiersz to { bold, cells };
   * liczba zostaje liczbą (Excel policzy z niej dalej), brak wartości — pustą komórką. */
  const PRIVACY_NOTE = 'Plik nie zawiera nazwisk, dat urodzenia ani identyfikatorów pacjentów.';
  function statsWorkbook(report) {
    const rows = [];
    const push = (cells, bold) => rows.push({ bold: Boolean(bold), cells: cells || [] });
    push([report.title], true);
    push(['Stan na', stampText(report.stamp)]);
    if (report.scope) push(['Grupa pacjentów', report.scope]);
    push([report.scope ? 'Pacjentów w grupie' : 'Pacjentów w bazie', report.total]);
    report.sections.forEach((section) => {
      push([]);
      push([section.title], true);
      section.facts.filter((fact) => fact.only !== 'pdf').forEach((fact) => {
        push([fact.label, fact.value === null || fact.value === undefined ? (fact.text && fact.text !== '—' ? fact.text : '') : fact.value, fact.unit || '', fact.note || '']);
      });
      section.tables.forEach((table) => {
        const visible = table.columns.map((column, index) => column.kind === 'bar' ? -1 : index).filter((index) => index !== -1);
        push([]);
        push([table.title], true);
        push(visible.map((index) => table.columns[index].title), true);
        table.rows.forEach((row) => push(visible.map((index) => row[index] === undefined ? null : row[index])));
      });
      if (section.notes.length) push([]);
      section.notes.forEach((note) => push([note]));
    });
    push([]);
    push([report.closing]);
    push([PRIVACY_NOTE]);
    const sheets = [{ name: 'Podsumowanie', freeze: false, widths: [46, 16, 16, 18, 16, 18, 18, 18, 18], rows }];
    if (report.people) {
      sheets.push({
        name: 'Pacjenci', freeze: true,
        widths: report.people.columns.map((column) => column.kind === 'text' ? 24 : column.kind === 'int' && column.title === 'Lp.' ? 6 : 18),
        rows: [{ bold: true, cells: report.people.columns.map((column) => column.title) }].concat(report.people.rows.map((cells) => ({ bold: false, cells })))
      });
    }
    return sheets;
  }
  /* Plik .xlsx to archiwum ZIP z kilkoma dokumentami XML (Office Open XML). Tu powstają same
   * dokumenty — { ścieżka: treść } — a archiwum składa widok lokalną biblioteką JSZip.
   * Teksty idą jako inlineStr (bez tablicy wspólnych napisów), styl 1 to pogrubienie. */
  function xmlText(value) {
    // XML 1.0 dopuszcza tabulator, nową linię, CR i znaki od spacji; pozostałe znaki sterujące i samotne surogaty odpadają.
    let clean = '';
    for (const char of String(value)) {
      const code = char.codePointAt(0);
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xD7FF) || (code >= 0xE000 && code <= 0xFFFD) || code >= 0x10000) clean += char;
    }
    return clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function columnName(index) {
    let name = '';
    for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCharCode(65 + (rest - 1) % 26) + name;
    return name;
  }
  function xlsxParts(sheets) {
    const list = Array.isArray(sheets) ? sheets : [];
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const pack = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const types = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
    const used = new Set();
    const names = list.map((sheet, index) => {
      // Nazwa arkusza: do 31 znaków, bez [ ] : * ? / \ i bez powtórzeń.
      let name = String(sheet.name || '').replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim() || 'Arkusz ' + (index + 1);
      while (used.has(name.toLowerCase())) name = name.slice(0, 28) + ' ' + (index + 1);
      used.add(name.toLowerCase());
      return name;
    });
    const parts = {}, sheetXml = [];
    list.forEach((sheet, index) => {
      const rows = (sheet.rows || []).map((row, r) => {
        const cells = (row.cells || []).map((value, c) => {
          if (value === null || value === undefined || value === '') return '';
          const ref = ' r="' + columnName(c) + (r + 1) + '"' + (row.bold ? ' s="1"' : '');
          if (typeof value === 'number') return Number.isFinite(value) ? '<c' + ref + '><v>' + String(value) + '</v></c>' : '';
          return '<c' + ref + ' t="inlineStr"><is><t xml:space="preserve">' + xmlText(value) + '</t></is></c>';
        }).join('');
        return '<row r="' + (r + 1) + '">' + cells + '</row>';
      }).join('');
      const widths = Array.isArray(sheet.widths) ? sheet.widths : [];
      sheetXml.push(head + '<worksheet xmlns="' + main + '">'
        + '<sheetViews><sheetView workbookViewId="0"' + (index === 0 ? ' tabSelected="1"' : '') + '>'
        + (sheet.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews>'
        + (widths.length ? '<cols>' + widths.map((width, c) => '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + width + '" customWidth="1"/>').join('') + '</cols>' : '')
        + '<sheetData>' + rows + '</sheetData></worksheet>');
    });
    // Kolejność części jak w plikach zapisywanych przez arkusze kalkulacyjne: najpierw opis pakietu, na końcu arkusze.
    parts['[Content_Types].xml'] = head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="' + types + 'sheet.main+xml"/>'
      + list.map((sheet, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="' + types + 'worksheet+xml"/>').join('')
      + '<Override PartName="/xl/styles.xml" ContentType="' + types + 'styles+xml"/></Types>';
    parts['_rels/.rels'] = head + '<Relationships xmlns="' + pack + '"><Relationship Id="rId1" Type="' + office + '/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    parts['xl/workbook.xml'] = head + '<workbook xmlns="' + main + '" xmlns:r="' + office + '"><bookViews><workbookView/></bookViews><sheets>'
      + names.map((name, index) => '<sheet name="' + xmlText(name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join('') + '</sheets></workbook>';
    parts['xl/_rels/workbook.xml.rels'] = head + '<Relationships xmlns="' + pack + '">'
      + list.map((sheet, index) => '<Relationship Id="rId' + (index + 1) + '" Type="' + office + '/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join('')
      + '<Relationship Id="rId' + (list.length + 1) + '" Type="' + office + '/styles" Target="styles.xml"/></Relationships>';
    parts['xl/styles.xml'] = head + '<styleSheet xmlns="' + main + '">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
    sheetXml.forEach((xml, index) => { parts['xl/worksheets/sheet' + (index + 1) + '.xml'] = xml; });
    return parts;
  }
  /* Dokument pdfmake (A4, czcionka Roboto z polskimi znakami — te same pliki, co wydruk postępów
   * dorosłego). Strzałek w tej czcionce nie ma, więc zastępuje je „»”, jak w tamtym wydruku.
   * Wykresy to SVG z samych kształtów; liczby stoją w tekście i w tabelach. */
  const PDF_COLORS = { teal: '#00838d', ink: '#0f2b33', muted: '#5a6b72', line: '#d7e9ec', soft: '#f3f9fa', boys: '#2a78d6', girls: '#eb6834', unknown: '#8aa0a6' };
  const PDF_WIDTH = 515, PDF_BAR = 110;
  function pdfText(value) { return String(value === null || value === undefined ? '' : value).replace(/[→➡›]/g, '»'); }
  function reportCell(value, column) {
    if (value === null || value === undefined || value === '') return column.kind === 'text' ? '' : '—';
    if (column.kind === 'num' && typeof value === 'number') return column.signed ? formatDelta(value, column.digits) : value.toFixed(column.digits).replace('.', ',');
    return String(value);
  }
  function barSvg(segments, max) {
    let x = 0;
    const rects = (Array.isArray(segments) ? segments : []).map((segment) => {
      const width = max > 0 && segment.value > 0 ? Math.min(segment.value / max, 1) * PDF_BAR : 0;
      if (!width) return '';
      const rect = '<rect x="' + x.toFixed(1) + '" y="1" width="' + width.toFixed(1) + '" height="7" fill="' + (PDF_COLORS[segment.color] || PDF_COLORS.teal) + '"/>';
      x += width;
      return rect;
    }).join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + PDF_BAR + '" height="9" viewBox="0 0 ' + PDF_BAR + ' 9">' + rects + '</svg>';
  }
  function fallSvg(values) {
    const height = 96, pad = 5, scale = fallScale(values);
    const y = (value) => pad + (scale.high - value) / (scale.high - scale.low) * (height - 2 * pad);
    const rule = (value, color, width) => '<line x1="0" x2="' + PDF_WIDTH + '" y1="' + y(value).toFixed(1) + '" y2="' + y(value).toFixed(1) + '" stroke="' + color + '" stroke-width="' + width + '"/>';
    let shapes = '';
    for (let tick = scale.high; tick >= scale.low; tick -= scale.step) if (tick !== 0) shapes += rule(tick, PDF_COLORS.line, 0.6);
    const slot = PDF_WIDTH / Math.max(values.length, 16);
    values.forEach((value, index) => {
      shapes += '<rect x="' + (index * slot + slot * 0.14).toFixed(1) + '" y="' + Math.min(y(0), y(value)).toFixed(1) + '" width="' + (slot * 0.72).toFixed(1)
        + '" height="' + Math.max(Math.abs(y(value) - y(0)), 0.6).toFixed(1) + '" fill="' + (value > 0 ? PDF_COLORS.girls : PDF_COLORS.teal) + '"/>';
    });
    shapes += rule(0, PDF_COLORS.muted, 0.8);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + PDF_WIDTH + '" height="' + height + '" viewBox="0 0 ' + PDF_WIDTH + ' ' + height + '">' + shapes + '</svg>';
  }
  function statsDocument(report) {
    const C = PDF_COLORS, content = [];
    const small = (text, extra) => Object.assign({ text: pdfText(text), fontSize: 8.5, color: C.muted }, extra || {});
    content.push({ columns: [
      { width: '*', stack: [{ text: pdfText(report.title), fontSize: 16, bold: true, color: C.teal },
        small(report.scope ? 'Grupa pacjentów: ' + report.scope + ' · ' + report.total + (report.total === 1 ? ' pacjent' : ' pacjentów')
          : 'Zestawienie opisowe · ' + report.total + (report.total === 1 ? ' pacjent' : ' pacjentów') + ' z bazy', { fontSize: 9.5 })] },
      { width: 'auto', stack: [{ text: pdfText(report.stamp ? 'Stan na ' + stampText(report.stamp) : ''), alignment: 'right' }, small('bez danych osobowych', { alignment: 'right' })] }
    ] });
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: PDF_WIDTH, y2: 0, lineWidth: 1.2, lineColor: C.teal }], margin: [0, 6, 0, 2] });
    const tiles = (facts) => ({
      table: { widths: facts.map(() => '*'), body: [facts.map((fact) => ({
        stack: [{ text: pdfText(fact.label).toUpperCase(), fontSize: 7, bold: true, color: C.muted, characterSpacing: 0.3 },
          { text: pdfText(fact.text), fontSize: 15, bold: true, margin: [0, 2, 0, 1] }, small(fact.note, { fontSize: 8 })],
        fillColor: C.soft
      }))] },
      layout: {
        hLineWidth: () => 0, vLineWidth: (index, node) => index === 0 || index === node.table.widths.length ? 0 : 5, vLineColor: () => '#ffffff',
        paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 7, paddingBottom: () => 7
      },
      margin: [0, 2, 0, 0]
    });
    const table = (item) => {
      const align = (column) => column.kind === 'text' || column.kind === 'bar' ? 'left' : 'right';
      // Elastyczna jest pierwsza kolumna, chyba że tabela wskazuje inną (wide) — np. długą nazwę rozpoznania obok krótkiego kodu.
      const wide = item.columns.some((column) => column.wide);
      const body = [item.columns.map((column) => ({ text: pdfText(column.title), bold: true, fontSize: 8, color: C.muted, alignment: align(column) }))];
      item.rows.forEach((row) => body.push(item.columns.map((column, index) => column.kind === 'bar'
        ? { svg: barSvg(row[index], item.barMax), width: PDF_BAR, margin: [0, 2, 0, 0] }
        : { text: pdfText(reportCell(row[index], column)), alignment: align(column) })));
      const stack = [{ text: pdfText(item.title), bold: true, fontSize: 10, margin: [0, 9, 0, 2] },
        { table: { headerRows: 1, widths: item.columns.map((column, index) => column.kind === 'bar' ? PDF_BAR : (wide ? column.wide : index === 0) ? '*' : 'auto'), body }, layout: 'lightHorizontalLines', fontSize: 9 }];
      if (item.note) stack.push(small(item.note, { fontSize: 8, margin: [0, 3, 0, 0] }));
      return { stack, unbreakable: item.rows.length <= 12 };
    };
    report.sections.forEach((section) => {
      const head = [{ text: pdfText(section.title), fontSize: 12.5, bold: true, margin: [0, 13, 0, 1] }];
      if (section.hint) head.push(small(section.hint, { fontSize: 9, margin: [0, 0, 0, 3] }));
      const shown = section.facts.filter((fact) => fact.only !== 'sheet');
      if (shown.length) head.push(tiles(shown));
      // Nagłówek sekcji nie zostaje sam na dole strony: idzie razem z pierwszą (krótką) tabelą.
      const blocks = section.tables.map(table);
      if (blocks.length && blocks[0].unbreakable) head.push(blocks.shift());
      content.push({ stack: head, unbreakable: true });
      blocks.forEach((block) => content.push(block));
      if (section.chart && section.chart.kind === 'fall') {
        const scale = fallScale(section.chart.values);
        content.push({ unbreakable: true, stack: [
          { text: pdfText(section.chart.title), bold: true, fontSize: 10, margin: [0, 9, 0, 3] },
          { svg: fallSvg(section.chart.values), width: PDF_WIDTH },
          small('Jeden słupek to jeden pacjent, od najmniejszej do największej redukcji masy; pomarańczowy słupek to przyrost. Linie co ' + scale.step
            + '%: od ' + formatDelta(scale.high, 0) + '% (góra) do ' + formatDelta(scale.low, 0) + '% (dół), ciemna linia to 0%.', { fontSize: 8, margin: [0, 2, 0, 0] })
        ] });
      }
      section.notes.forEach((note) => content.push(small(note, { margin: [0, 5, 0, 0] })));
    });
    content.push(small(report.closing, { margin: [0, 14, 0, 0] }));
    return {
      pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [40, 40, 40, 44],
      defaultStyle: { font: 'Roboto', fontSize: 9.5, color: C.ink, lineHeight: 1.2 },
      info: { title: report.title },
      footer: (page, pages) => ({ text: 'Strona ' + page + ' z ' + pages, alignment: 'center', fontSize: 8, color: C.muted, margin: [0, 14, 0, 0] }),
      content
    };
  }
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
      cards: initial.cards && typeof initial.cards === 'object' ? initial.cards : null,
      cardCache: initial.cardCache && typeof initial.cardCache === 'object' ? initial.cardCache : null,
      // P-ROZPOZNANIA, rata 2: statystyki zawężone do grupy pacjentów z wybranym rozpoznaniem (tylko pamięć widoku).
      scope: initial.scope && Array.isArray(initial.scope.ids) ? { key: String(initial.scope.key || ''), label: String(initial.scope.label || ''), ids: initial.scope.ids.slice() } : null,
      // P-BAZA-GRUPY: filtry zakresu statystyk (lista pacjentów, płeć, wiek, zapis w ostatnich 12 mies.) — tylko pamięć widoku.
      filters: scopeFilters(initial.filters),
      // P-BAZA-GRUPY: pasek grupy — formularz „Zapisz jako listę” albo komunikat po zapisie lub po pliku grupy.
      groupTask: initial.group && initial.groupTask && ['form', 'note'].includes(initial.groupTask.mode) ? {
        mode: initial.groupTask.mode, name: String(initial.groupTask.name || ''), note: String(initial.groupTask.note || ''),
        failed: Boolean(initial.groupTask.failed), listId: typeof initial.groupTask.listId === 'string' && initial.groupTask.listId ? initial.groupTask.listId : null
      } : null
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
    let obHost = null;       // sekcja „Leczenie otyłości”
    let obHint = null;
    let exportBusy = null;   // 'pdf' albo 'xlsx' w trakcie przygotowania pliku
    let exportNote = '';     // ostatni komunikat o pliku (pasek „z kart”)
    let zipLoading = null;   // jedna obietnica wczytania lokalnej biblioteki JSZip
    let statsCounted = false; // liczenie ruszyło samo przy tym wejściu w „Statystyki”
    let dxHost = null;        // sekcja „Rozpoznania”
    let dxHint = null;
    const dxOpen = {};        // rozwinięte kategorie rozpoznań (klucz grupy)
    let scopeCache = null;    // wynik kart policzony dla bieżącego zakresu
    let scopeMemo = null;     // pacjenci bieżącego zakresu w obrębie jednego rysowania ({ ids } albo { pending })
    let filterMembers = null; // członkowie listy wybranej w filtrze: { id, ids: Set }
    let filterFailed = null;  // identyfikator listy, której członków nie udało się wczytać
    let filterNote = '';      // komunikat pod filtrami (np. wybrana lista już nie istnieje) — do zmiany filtrów
    let filterStamp = 0;      // numer kolejnego odczytu członków listy (część klucza pamięci zakresu)
    let catalogueLoading = null; // jedna obietnica wczytania katalogu ICD-10 (nazwy kategorii)
    let catalogueLookup = null;
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
    // Przełącznik widoku i „Dodaj pacjenta” stoją w jednej grupie: jedna linia i ta sama wysokość
    // (grupa rozciąga oba elementy do wyższego z nich). Na telefonie grupa znika z układu
    // (display: contents) i elementy układają się jak dotąd — przełącznik pod tytułem.
    const actions = el('div', 'pt-head-actions');
    actions.appendChild(viewSwitch); actions.appendChild(add);
    titleRow.appendChild(titles); titleRow.appendChild(actions); header.appendChild(titleRow);

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
    // P-BAZA-GRUPY: grupę ze statystyk można zapisać jako listę pacjentów i pobrać jej plik dla Excela.
    const groupSave = button('pt-secondary pt-group-save', 'Zapisz jako listę', () => openGroupSave());
    groupSave.setAttribute('aria-label', 'Zapisz grupę jako listę pacjentów');
    const groupExport = button('pt-secondary pt-group-export', 'Eksport do Excela', () => { if (state.group) exportFile('xlsx', state.group); });
    groupExport.setAttribute('aria-label', 'Eksport grupy do Excela');
    const groupBack = button('pt-secondary', '← Statystyki', () => { if (!busy) { state.group = null; state.groupTask = null; chooseView('stats'); } });
    const groupClear = button('pt-secondary', 'Pokaż wszystkich', () => { if (!busy) { state.group = null; state.groupTask = null; render(); scroll.scrollTop = 0; } });
    const groupForm = doc.createElement('form');
    groupForm.className = 'pt-group-form'; groupForm.noValidate = true;
    const groupField = el('label', 'pt-group-field');
    groupField.appendChild(el('span', null, 'Nazwa listy'));
    const groupInput = el('input');
    groupInput.type = 'text'; groupInput.maxLength = 80; groupInput.autocomplete = 'off';
    groupInput.addEventListener('input', () => { if (state.groupTask && state.groupTask.mode === 'form') state.groupTask.name = groupInput.value; });
    groupField.appendChild(groupInput);
    const groupConfirm = button('pt-primary pt-group-confirm', 'Zapisz listę');
    groupConfirm.type = 'submit';
    const groupCancel = button('pt-secondary', 'Anuluj', () => { if (!busy) { state.groupTask = null; syncControls(); if (!groupSave.hidden) groupSave.focus(); } });
    groupForm.appendChild(groupField); groupForm.appendChild(groupConfirm); groupForm.appendChild(groupCancel);
    groupForm.addEventListener('submit', (event) => { event.preventDefault(); saveGroupList(); });
    const groupNote = el('p', 'pt-group-note');
    groupNote.setAttribute('role', 'status'); groupNote.setAttribute('aria-live', 'polite');
    const groupOpen = button('pt-secondary pt-group-open', 'Otwórz listę', () => {
      if (busy || !state.groupTask || !state.groupTask.listId) return;
      const id = state.groupTask.listId;
      state.group = null; state.groupTask = null; chooseList(id);
    });
    // Komunikat i „Otwórz listę” mają własny wiersz pod przyciskami — obok nich ściskałyby opis grupy do wąskiej kolumny.
    const groupResult = el('div', 'pt-group-result');
    groupResult.appendChild(groupNote); groupResult.appendChild(groupOpen);
    [groupText, groupSave, groupExport, groupBack, groupClear, groupForm, groupResult].forEach((node) => groupBar.appendChild(node));
    root.appendChild(groupBar);
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
      const task = grouped ? state.groupTask : null, form = Boolean(task && (task.mode === 'form' || task.mode === 'saving'));
      const lock = busy || Boolean(exportBusy);
      // Po udanym zapisie przycisk znika — drugie kliknięcie założyłoby drugą taką samą listę.
      groupSave.hidden = !grouped || form || !mayUseLists() || Boolean(task && task.listId);
      groupExport.hidden = !grouped || form;
      groupForm.hidden = !form;
      if (form && doc.activeElement !== groupInput) groupInput.value = task.name || '';
      groupNote.hidden = !(task && task.note);
      groupNote.textContent = task && task.note || '';
      groupNote.classList.toggle('pt-group-note--error', Boolean(task && task.failed));
      groupNote.setAttribute('role', task && task.failed ? 'alert' : 'status');
      groupOpen.hidden = !(task && task.listId && mayUseLists());
      groupResult.hidden = groupNote.hidden && groupOpen.hidden;
      [groupSave, groupExport, groupBack, groupClear, groupConfirm, groupCancel, groupOpen, groupInput].forEach((node) => { node.disabled = lock; });
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
      state.sourceFilter = 'all'; state.group = null; state.groupTask = null; state.scope = null; state.filters = scopeFilters(null); scopeCache = null;
      memberCache = null; closeSort(); closePicker(false);
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
    // P-ROZPOZNANIA, rata 2: wybór rozpoznania zawęża CAŁE statystyki do pacjentów tej grupy; null — cała baza.
    function chooseScope(scope) {
      if (busy) return;
      state.scope = scope && Array.isArray(scope.ids) && scope.ids.length ? { key: String(scope.key || ''), label: String(scope.label || ''), ids: scope.ids.slice() } : null;
      scopeCache = null; exportNote = '';
      state.view = 'stats';
      render(); scroll.scrollTop = 0;
      const target = root.querySelector(state.scope ? '.pt-scope-clear' : '.pt-dx-row');
      if (target && !root.contains(doc.activeElement)) target.focus();
    }
    // P-BAZA-GRUPY: „Cała baza” zdejmuje rozpoznanie i wszystkie filtry naraz.
    function clearScope() {
      if (busy) return;
      state.scope = null; state.filters = scopeFilters(null);
      scopeCache = null; exportNote = ''; filterNote = ''; filterFailed = null;
      state.view = 'stats';
      render(); scroll.scrollTop = 0;
      const target = root.querySelector('.pt-filter-select');
      if (target && !root.contains(doc.activeElement)) target.focus();
    }
    // Zmiana jednego filtra; value '' — filtr wyłączony. Liczenie z kart się nie powtarza: zakres tylko wybiera z wyniku.
    function setFilter(key, value) {
      if (busy) return;
      const next = Object.assign({}, state.filters);
      if (key === 'recent') next.recent = value === 'recent';
      else if (key === 'list') {
        const entry = value && listCache ? listCache.find(({ list }) => list.id === value) : null;
        next.listId = value || null; next.listName = entry ? entry.list.name || '' : '';
      } else if (key === 'sex') next.sex = value || null;
      else if (key === 'band') next.band = value || null;
      state.filters = scopeFilters(next);
      scopeCache = null; exportNote = ''; filterNote = ''; filterFailed = null;
      render();
      const again = root.querySelector('.pt-filter-select[data-filter-key="' + key + '"]');
      if (again && !again.disabled) again.focus();
    }
    // Wybór słupka albo wiersza „brakuje” otwiera zwykłą listę zawężoną do tych pacjentów.
    function showGroup(label, ids) {
      if (busy || !ids || !ids.length) return;
      // Grupa otwarta z zawężonych statystyk niesie w nazwie także ich zakres — nazwa trafia do listy i do pliku grupy.
      const within = state.view === 'stats' && scopeOn() ? scopeLabelNow() : '';
      state.group = { label: within && within !== label ? within + ' · ' + label : label, ids: ids.slice() };
      state.groupTask = null;
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
      else if (state.view === 'stats' && scopeOn()) handler = () => clearScope();
      else if (state.view === 'stats') handler = () => chooseView('list');
      else if (state.group && ['all', 'base', 'ext'].includes(state.filter)) handler = () => { if (!busy) { state.group = null; state.groupTask = null; chooseView('stats'); } };
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
    // P-ROZPOZNANIA, rata 2: zakres statystyk. Bez zakresu — cała baza; z zakresem — pacjenci wybranej grupy,
    // którzy nadal są w bazie. Liczenie z kart i jego pamięć zawsze obejmują całą bazę; zakres tylko wybiera z wyniku.
    // P-BAZA-GRUPY: do rozpoznania doszły filtry (lista pacjentów, płeć, wiek, zapis w ostatnich 12 mies.); łączą się „i”.
    function scopeOn() { return Boolean(state.scope) || scopeActive(state.filters); }
    function scopeLabelNow() { return scopeLabel(state.filters, state.scope); }
    function scopeKeyNow() { return scopeKey(state.filters, state.scope) + (filterMembers && filterMembers.id === state.filters.listId ? '#' + filterMembers.stamp : ''); }
    // true — wybrana lista nie ma jeszcze wczytanych członków, więc zakresu nie da się policzyć.
    function scopePending() { return Boolean(state.filters.listId) && !(filterMembers && filterMembers.id === state.filters.listId); }
    function scopeIds() {
      if (!scopeOn()) return null;
      if (scopeMemo) return scopeMemo;
      const matched = scopeMembers(basePatients(), state.filters, {
        ageMonths: ageFromVault, ids: state.scope ? state.scope.ids : null,
        listIds: filterMembers && filterMembers.id === state.filters.listId ? filterMembers.ids : null
      });
      scopeMemo = new Set(matched || []);
      return scopeMemo;
    }
    function shownPatients() { const ids = scopeIds(); return ids ? patients.filter((patient) => ids.has(patient.patientId)) : patients; }
    function shownBase() { const ids = scopeIds(), base = basePatients(); return ids ? base.filter((patient) => ids.has(patient.patientId)) : base; }
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
    // Wynik kart dla bieżącego zakresu: te same funkcje (cardsResult, ghCohort, obesityCohort) na kartach grupy,
    // z pamięci wyników — bez ponownego czytania sejfu.
    function cardsFor(saved, base) {
      const result = cardsResult(base, state.cardCache && state.cardCache.items ? state.cardCache.items : {});
      return Object.assign({}, saved, {
        total: base.length, failed: result.failed, missing: result.missing, details: result.details,
        gh: Object.assign(ghCohort(result.treated), { sdsReady: saved.gh.sdsReady, engineReady: saved.gh.engineReady }),
        obesity: Object.assign(obesityCohort(result.obese, { thresholds: saved.thresholds || [] }),
          { sdsReady: saved.obesity.sdsReady, engineReady: saved.obesity.engineReady, journalFailed: result.partial })
      });
    }
    function shownCards() {
      const saved = savedCards();
      if (!saved || !scopeOn()) return saved;
      const key = scopeKeyNow();
      if (scopeCache && scopeCache.of === saved && scopeCache.key === key) return scopeCache.value;
      const value = cardsFor(saved, shownBase());
      scopeCache = { of: saved, key, value };
      return value;
    }
    // Rozpoznania w bieżącym zakresie; null — nie policzono, niedostępne albo nieudany odczyt.
    function shownDiagnoses(saved) {
      const dx = saved && saved.dx;
      if (!dx || dx.failed || !dx.index) return null;
      return diagnosisCohort(shownBase(), dx.index, { lookup: catalogueLookup });
    }
    // Nazwy kategorii (np. „E66 — Otyłość”) daje katalog ICD-10 — te same dwa pliki, których używa formularz rozpoznania.
    // Wczytuje się raz, dopiero gdy w bazie jest rozpoznanie z kodem; bez katalogu etykietą jest nazwa z rozpoznania.
    function ensureCatalogue() {
      if (catalogueLookup) return Promise.resolve(true);
      if (catalogueLoading) return catalogueLoading;
      const ready = () => {
        if (!catalogueLookup && win.VildaICD10Search && win.VildaICD10PLData) catalogueLookup = win.VildaICD10Search.create(win.VildaICD10PLData).lookup;
        return Boolean(catalogueLookup);
      };
      const load = (src, present) => new Promise((resolve, reject) => {
        if (present()) { resolve(); return; }
        const script = doc.createElement('script');
        script.src = src; script.async = false;
        script.onload = () => resolve();
        script.onerror = () => { script.remove(); reject(new Error('brak pliku ' + src)); };
        (doc.head || doc.body || doc.documentElement).appendChild(script);
      });
      catalogueLoading = load('vilda_icd10_pl_data.js?v=1', () => Boolean(win.VildaICD10PLData))
        .then(() => load('vilda_icd10_search.js?v=1', () => Boolean(win.VildaICD10Search)))
        .then(ready, () => false)
        .then((ok) => { catalogueLoading = null; return ok; });
      return catalogueLoading;
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
    function obesityDeps() {
      const cycles = win.VildaCykleLeczenia, criteria = win.ObesityResponseCriteria, engine = win.VildaBmi;
      const bmiSds = engine && typeof engine.policz === 'function' ? (input) => {
        const outcome = engine.policz(input);
        return outcome && typeof outcome.sds === 'number' && Number.isFinite(outcome.sds) ? outcome.sds : null;
      } : null;
      return {
        cykle: cycles && typeof cycles.podziel === 'function' ? cycles.podziel : null,
        lek: cycles && typeof cycles.nazwaLeku === 'function' ? cycles.nazwaLeku : null,
        tygodnie: criteria && typeof criteria.tygodnieOceny === 'function' ? (start, point) => {
          const outcome = criteria.tygodnieOceny(start, point);
          return outcome && typeof outcome.tygodnie === 'number' ? outcome.tygodnie : null;
        } : null,
        bmi: engine && typeof engine.bmi === 'function' ? engine.bmi : null,
        dorosly: engine && typeof engine.dorosly === 'function' ? engine.dorosly : null,
        bmiSds,
        defaultSource: typeof win.bmiSource === 'string' && win.bmiSource ? win.bmiSource.toUpperCase() : null,
        thresholds: obesityThresholds(win.VildaPostepyDoroslegoDane),
        // Siatki BMI ładuje tylko część stron; bez nich BMI-SDS milczy u każdego pacjenta.
        sdsReady: Boolean(bmiSds) && bmiSds({ bmi: 20, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'OGOLNA' }) !== null
      };
    }
    /* Punkty leczenia otyłości pacjenta: wizyty z zapisu karty razem z wpisami między wizytami
     * (dziennik leczenia w notatkach pacjenta). Składa je moduł dziennika — ta sama projekcja,
     * którą pokazuje Karta pacjenta. Bez modułu albo przy błędzie odczytu zostają punkty z zapisu. */
    async function obesityPoints(patientId, payload) {
      const saved = Array.isArray(payload.obesityTherapyPoints) ? payload.obesityTherapyPoints : [];
      const journal = win.VildaDziennikOtylosci;
      if (!journal || typeof journal.wczytaj !== 'function') return { points: saved, failed: false };
      const own = vault && typeof vault.listPatientNotesForPatient === 'function' && typeof vault.savePatientNoteOnce === 'function';
      try {
        const loaded = await journal.wczytaj(patientId, saved, own ? { vault } : undefined);
        return { points: loaded && Array.isArray(loaded.punkty) ? loaded.punkty : saved, failed: false };
      } catch {
        return { points: saved, failed: true };
      }
    }
    /* ── P-BAZA-STATYSTYKI, etap 4: raport PDF i plik dla Excela ───────────────────
     * Oba pliki powstają na tym urządzeniu z modelu statsReport. PDF składa pdfmake — te same
     * lokalne pliki i ta sama funkcja wczytania, co wydruk postępów dorosłego; plik .xlsx pakuje
     * lokalna biblioteka JSZip. Zapis: zwykłe pobranie, a na iPhonie w trybie aplikacji arkusz
     * udostępniania (tam pobranie nie działa) — ta sama reguła, co w wydruku postępów. */
    function ensureZip() {
      if (win.JSZip) return Promise.resolve(win.JSZip);
      if (zipLoading) return zipLoading;
      zipLoading = new Promise((resolve, reject) => {
        const script = doc.createElement('script');
        script.src = 'jszip.min.js?v=1'; script.async = true;
        script.setAttribute('data-vilda-jszip', 'statystyki');
        script.onload = () => { if (win.JSZip) resolve(win.JSZip); else reject(new Error('biblioteka plików nie wstała')); };
        script.onerror = () => reject(new Error('nie udało się wczytać biblioteki plików'));
        (doc.head || doc.body || doc.documentElement).appendChild(script);
      }).catch((error) => { zipLoading = null; throw error; });   // następne kliknięcie ma prawo spróbować jeszcze raz
      return zipLoading;
    }
    function saveFile(blob, name, type) {
      const print = win.VildaPostepyDoroslegoWydruk;
      const abilities = print && typeof print.mozliwosci === 'function' ? print.mozliwosci() : null;
      if (abilities && abilities.iosStandalone) {
        const nav = win.navigator, file = typeof win.File === 'function' ? new win.File([blob], name, { type }) : null;
        if (!file || !nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !nav.canShare({ files: [file] })) {
          return Promise.reject(new Error('ta przeglądarka nie pozwala zapisać pliku z aplikacji'));
        }
        // Zamknięcie arkusza udostępniania to nie awaria.
        return nav.share({ files: [file], title: name }).then(() => 'shared', (error) => {
          if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) return 'cancelled';
          throw error;
        });
      }
      const url = win.URL.createObjectURL(blob), link = doc.createElement('a');
      link.href = url; link.download = name;
      doc.body.appendChild(link);
      link.click();
      // Adres zwalniany po chwili — natychmiastowe zwolnienie potrafi przerwać pobieranie.
      win.setTimeout(() => { try { doc.body.removeChild(link); win.URL.revokeObjectURL(url); } catch { /* posprzątane */ } }, 4000);
      return Promise.resolve('saved');
    }
    async function pdfBlob(report) {
      const print = win.VildaPostepyDoroslegoWydruk;
      if (!print || typeof print.zapewnijPdfmake !== 'function') throw new Error('moduł PDF nie jest wczytany na tej stronie');
      const pdfMake = await print.zapewnijPdfmake();
      return new Promise((resolve, reject) => {
        try {
          pdfMake.createPdf(statsDocument(report)).getBlob((blob) => { if (blob) resolve(blob); else reject(new Error('nie udało się złożyć PDF')); });
        } catch (error) { reject(error); }
      });
    }
    async function sheetBlob(report) {
      const JSZip = await ensureZip();
      const archive = new JSZip(), parts = xlsxParts(statsWorkbook(report));
      Object.keys(parts).forEach((path) => archive.file(path, parts[path], { createFolders: false }));
      return archive.generateAsync({ type: 'blob', mimeType: XLSX_TYPE, compression: 'DEFLATE' });
    }
    /* group — grupa z paska na liście ({ label, ids }): plik powstaje dla niej, a komunikat trafia do paska grupy.
     * Bez group — bieżący zakres statystyk (cała baza albo zawężenie filtrami i rozpoznaniem). Ten sam model raportu. */
    async function exportFile(kind, group) {
      const saved = savedCards(), own = group && Array.isArray(group.ids) ? group : null;
      const tell = (note, failed) => {
        if (own) { if (state.group === own) state.groupTask = { mode: 'note', name: '', note, failed: Boolean(failed), listId: null }; }
        else exportNote = note;
      };
      if (own && !saved && !exportBusy && alive()) {
        tell('Plik grupy powstaje z policzonych statystyk. Wróć do Statystyk, poczekaj na policzenie kart i otwórz grupę ponownie.', true);
        syncControls(); return;
      }
      if (exportBusy || cardsBusy || !saved || !alive()) return;
      exportBusy = kind;
      tell(kind === 'pdf' ? 'Przygotowuję raport PDF…' : 'Przygotowuję plik dla Excela…');
      if (own) syncControls(); else fillBar();
      let message, failed = false;
      try {
        const stamp = new Date(saved.at), dx = saved.dx && saved.dx.index ? saved.dx.index : null;
        const ids = own ? new Set(own.ids) : null;
        const base = own ? basePatients().filter((patient) => ids.has(patient.patientId)) : shownBase();
        const shown = own ? cardsFor(saved, base) : shownCards();
        const label = own ? String(own.label || '') : scopeLabelNow(), narrowed = own ? true : scopeOn();
        const report = statsReport({ model: demographics(own ? base : shownPatients(), { ageMonths: ageFromVault }), cards: shown, patients: base, ageMonths: ageFromVault, stamp,
          scope: narrowed ? label : '', diagnoses: dx && !saved.dx.failed ? diagnosisCohort(base, dx, { lookup: catalogueLookup }) : null, diagnosesOf: dx ? dx.of : null });
        const name = reportFileName(stamp, kind, narrowed);
        const blob = kind === 'pdf' ? await pdfBlob(report) : await sheetBlob(report);
        const outcome = await saveFile(blob, name, kind === 'pdf' ? 'application/pdf' : XLSX_TYPE);
        message = outcome === 'cancelled' ? 'Udostępnianie przerwane.' : (outcome === 'shared' ? 'Udostępniono plik ' : 'Zapisano plik ') + name + '.'
          + (own && outcome !== 'cancelled' ? ' Plik nie zawiera nazwisk ani dat urodzenia.' : '');
      } catch (error) {
        message = 'Nie udało się przygotować pliku' + (error && error.message ? ': ' + error.message : '') + '.'; failed = true;
      }
      exportBusy = null; tell(message, failed);
      if (!alive()) return;
      if (own) {
        syncControls();
        if (!groupExport.hidden && (doc.activeElement === doc.body || !doc.activeElement)) groupExport.focus();
        return;
      }
      if (!cardsBar) return;
      fillBar();
      const again = cardsBar.querySelector('[data-export="' + kind + '"]');
      if (again && (doc.activeElement === doc.body || !doc.activeElement)) again.focus();
    }
    function fillBar() {
      if (!cardsBar) return;
      clear(cardsBar); cardsProgress = null;
      const base = basePatients(), saved = savedCards();
      if (cardsBusy && !saved) {
        const progress = el('span', 'pt-stat-progress');
        progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite');
        cardsBar.appendChild(progress);
        cardsProgress = { text: progress };
        updateCardsProgress();
      } else if (saved) {
        // W trakcie sprawdzania zmian poprzedni wynik zostaje na ekranie; przyciski czekają na koniec.
        const when = new Date(saved.at), locked = Boolean(cardsBusy);
        cardsBar.appendChild(el('span', null, 'Karty policzone' + (Number.isFinite(when.getTime()) ? ' o ' + timeFormatter.format(when) : '')
          + (saved.failed ? ' · nie udało się odczytać: ' + saved.failed : '') + '.'));
        const again = button('pt-secondary pt-stat-check', 'Policz ponownie', () => countCards(true));
        again.disabled = locked;
        cardsBar.appendChild(again);
        [['pdf', 'Raport PDF'], ['xlsx', 'Eksport do Excela']].forEach(([kind, label]) => {
          const save = button('pt-secondary pt-stat-export', label, () => exportFile(kind));
          save.setAttribute('data-export', kind);
          save.disabled = locked || Boolean(exportBusy);
          cardsBar.appendChild(save);
        });
        const status = el('p', 'pt-stat-export-status', exportNote || 'Raport i plik dla Excela zawierają liczby z tego ekranu, bez nazwisk i dat urodzenia.');
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        cardsBar.appendChild(status);
        if (locked) { cardsProgress = { text: status }; updateCardsProgress(); }
      } else {
        cardsBar.appendChild(el('span', null, 'Leczenie hormonem wzrostu, leczenie otyłości i kompletność kart liczą się z zapisów kart i wpisów między wizytami. Liczenie rusza samo po wejściu w Statystyki; po policzeniu można zapisać raport PDF i plik dla Excela.'));
        cardsBar.appendChild(button('pt-secondary pt-stat-check', 'Policz z kart (' + base.length + ')', () => countCards(true)));
      }
    }
    function fillCards() {
      if (!cardsBar) return;
      fillBar();
      const saved = shownCards();
      fillDiagnoses(saved);
      if (cardsHost) {
        clear(cardsHost);
        if (saved) CARD_ITEMS.forEach(([key, label]) => {
          const missing = saved.missing[key] || [];
          cardsHost.appendChild(meterRow(label, saved.total - saved.failed - missing.length, saved.total - saved.failed, missing, label + ' — brak'));
        });
      }
      if (ghHost) { clear(ghHost); renderGh(ghHost, saved ? saved.gh : null); }
      if (ghHint) {
        const cohort = saved ? saved.gh : null;
        ghHint.textContent = cohort && cohort.treated
          ? 'leczonych: ' + cohort.treated + ' · ' + cohort.programs.map((item) => item.program + ' ' + item.treated).join(' · ') : '';
      }
      if (obHost) { clear(obHost); renderObesity(obHost, saved ? saved.obesity : null); }
      if (obHint) {
        const cohort = saved ? saved.obesity : null;
        obHint.textContent = cohort && cohort.treated
          ? 'leczonych: ' + cohort.treated + ' · ' + cohort.drugs.map((item) => item.drug + ' ' + item.treated).join(' · ') : '';
      }
    }
    /* ── P-ROZPOZNANIA, rata 2: sekcja „Rozpoznania” ──────────────────────────────────────────────
     * Wiersz to rozpoznanie (kod — nazwa), słupek i liczba pacjentów z aktywnym rozpoznaniem. Wybór wiersza
     * zawęża całe statystyki do tej grupy pacjentów (chooseScope); kategoria z kilkoma podkodami rozwija się. */
    function fillDiagnoses(saved) {
      if (!dxHost) return;
      clear(dxHost);
      if (dxHint) dxHint.textContent = '';
      const card = dxHost.parentNode;
      if (card) card.hidden = Boolean(saved && saved.dx === null);
      if (!saved) {
        dxHost.appendChild(el('p', 'pt-stat-note', cardsBusy ? 'Trwa liczenie z kart…' : 'Pojawią się po policzeniu z kart.'));
        return;
      }
      if (!saved.dx) return;
      if (saved.dx.failed) {
        dxHost.appendChild(el('p', 'pt-stat-note', 'Nie udało się odczytać rozpoznań. Wybierz „Policz ponownie”.'));
        return;
      }
      const cohort = shownDiagnoses(saved);
      if (!cohort.groups.length) {
        dxHost.appendChild(el('p', 'pt-stat-note', (state.scope ? 'W tej grupie' : 'W bazie') + ' nie ma jeszcze rozpoznań. Rozpoznanie wpisuje się w Karcie pacjenta, w zakładce „Leczenie”.'));
        return;
      }
      if (dxHint) dxHint.textContent = 'z aktywnym rozpoznaniem: ' + cohort.withActive + ' z ' + cohort.total + ' (' + percent(cohort.withActive, cohort.total) + '%)';
      const most = Math.max.apply(null, cohort.groups.map((group) => group.n).concat([1]));
      const list = el('div', 'pt-dx-list');
      const row = (item, child) => {
        const describe = item.label + ': ' + peopleLabel(item.n) + ' z aktywnym rozpoznaniem (' + percent(item.n, cohort.total) + '%)' + (item.closed ? ', tylko zamknięte: ' + item.closed : '');
        // Grupa bez aktywnych rozpoznań (same zamknięte) też jest grupą pacjentów — statystyki liczą wtedy wszystkich z tym rozpoznaniem.
        const ids = item.n ? item.ids : item.closedIds;
        const node = button('pt-dx-row' + (child ? ' pt-dx-row--sub' : ''), null, () => chooseScope({ key: item.key, label: item.label, ids }));
        node.setAttribute('data-dx', item.key);
        node.setAttribute('aria-label', describe + '. Pokaż statystyki tej grupy');
        node.title = describe;
        const name = el('span', 'pt-dx-name');
        if (item.code) name.appendChild(el('span', 'pt-dx-code', item.code));
        name.appendChild(el('span', 'pt-dx-title', item.name || (item.code ? '' : item.label)));
        node.appendChild(name);
        node.appendChild(statBar('pt-dx-bar', [{ className: 'pt-stat-fill', width: item.n / most * 1000 }]));
        const figure = el('span', 'pt-dx-figure');
        figure.appendChild(el('span', 'pt-dx-n', String(item.n)));
        figure.appendChild(el('span', 'pt-dx-pct', percent(item.n, cohort.total) + '%'));
        node.appendChild(figure);
        if (item.closed) node.appendChild(el('span', 'pt-dx-closed', '+ ' + item.closed + ' zamkn.'));
        return node;
      };
      cohort.groups.forEach((group) => {
        const line = el('div', 'pt-dx-line');
        if (group.items.length) {
          const open = dxOpen[group.key] === true;
          const toggle = button('pt-dx-toggle', open ? '−' : '+', () => { dxOpen[group.key] = !open; fillDiagnoses(shownCards()); const again = dxHost && dxHost.querySelector('[data-dx-toggle="' + group.key + '"]'); if (again) again.focus(); });
          toggle.setAttribute('data-dx-toggle', group.key);
          toggle.setAttribute('aria-expanded', String(open));
          toggle.setAttribute('aria-label', (open ? 'Zwiń podkody: ' : 'Rozwiń podkody: ') + group.label);
          line.appendChild(toggle);
          line.appendChild(row(group, false));
          list.appendChild(line);
          if (open) group.items.forEach((item) => {
            const sub = el('div', 'pt-dx-line pt-dx-line--sub');
            sub.appendChild(row(item, true));
            list.appendChild(sub);
          });
        } else {
          line.appendChild(el('span', 'pt-dx-toggle pt-dx-toggle--none'));
          line.appendChild(row(group, false));
          list.appendChild(line);
        }
      });
      dxHost.appendChild(list);
      const foot = el('div', 'pt-dx-foot');
      if (cohort.none.n) {
        const none = button('pt-stat-missing', 'Bez rozpoznania: ' + cohort.none.n + ' ›', () => showGroup('Bez rozpoznania', cohort.none.ids));
        none.setAttribute('aria-label', 'Bez rozpoznania: ' + peopleLabel(cohort.none.n) + '. Pokaż listę');
        foot.appendChild(none);
      }
      if (cohort.onlyClosed.n) {
        const closed = button('pt-stat-missing', 'Tylko zamknięte: ' + cohort.onlyClosed.n + ' ›', () => showGroup('Tylko zamknięte rozpoznania', cohort.onlyClosed.ids));
        closed.setAttribute('aria-label', 'Tylko zamknięte rozpoznania: ' + peopleLabel(cohort.onlyClosed.n) + '. Pokaż listę');
        foot.appendChild(closed);
      }
      if (foot.firstChild) dxHost.appendChild(foot);
      dxHost.appendChild(el('p', 'pt-stat-note', DIAGNOSIS_NOTE + ' Wybierz rozpoznanie, aby zobaczyć statystyki tej grupy pacjentów.'));
      // Nazwy kategorii z katalogu doczytują się raz; po wczytaniu sekcja rysuje się ponownie z pełnymi etykietami.
      const coded = cohort.groups.some((group) => group.code);
      if (coded && !catalogueLookup) ensureCatalogue().then((ok) => { if (ok && alive() && state.view === 'stats' && dxHost) { scopeCache = null; fillDiagnoses(shownCards()); } });
    }
    function updateCardsProgress() {
      if (!cardsProgress || !cardsBusy) return;
      cardsProgress.text.textContent = cardsBusy.total ? 'Liczenie z kart… ' + cardsBusy.done + ' z ' + cardsBusy.total : 'Sprawdzam zmiany w kartach…';
    }
    /* ── P-BAZA-SZYBKIE: liczenie z kart ──────────────────────────────────────────
     * Rusza samo przy wejściu w „Statystyki” (decyzja właściciela 2026-11-24). Trzy rzeczy czynią je tanim:
     *   1. wpisy między wizytami czyta JEDEN odczyt notatek kategorii dziennika (dotąd przy każdym pacjencie
     *      wczytywały się notatki całego konta),
     *   2. z karty odszyfrowuje się tylko najnowsza wersja (dotąd wszystkie),
     *   3. czytane są tylko karty nowe i zmienione — wynik pozostałych czeka w pamięci widoku (cardsPlan).
     * „Policz ponownie” czyta wszystko od nowa. Starszy sejf bez tych odczytów liczy po staremu. */
    function readCard(patientId, session) {
      return typeof vault.getNewestSnapshot === 'function' ? vault.getNewestSnapshot(patientId, session) : vault.getLatestSnapshot(patientId);
    }
    async function readJournal(session) {
      const journal = win.VildaDziennikOtylosci;
      if (!journal || typeof journal.zloz !== 'function' || typeof journal.jestWpisem !== 'function' || !journal.KATEGORIA
        || typeof vault.listPatientNotesByCategory !== 'function') return null;
      return journalIndex(await vault.listPatientNotesByCategory(journal.KATEGORIA, session), journal.jestWpisem);
    }
    // P-ROZPOZNANIA, rata 2: rozpoznania całej bazy jednym odczytem notatek kategorii „treatment”.
    // null — sejf albo strona bez zapisu rozpoznań (sekcja się nie pokazuje).
    async function readDiagnoses(session) {
      const model = win.VildaPatientTreatmentModel;
      if (!model || typeof model.decode !== 'function' || typeof vault.listPatientNotesByCategory !== 'function') return null;
      return diagnosisIndex(await vault.listPatientNotesByCategory(DIAGNOSIS_CATEGORY, session), model.decode);
    }
    async function countCards(force) {
      if (cardsBusy || !alive() || state.view !== 'stats') return;
      const base = basePatients();
      const run = ++cardsRun, signature = cardsSignature(base);
      const session = { strict: true, isCurrent: () => alive() && run === cardsRun };
      const deps = ghDeps(), obDeps = obesityDeps();
      // Wynik karty zależy też od tego, co wczytała strona (silnik tempa, siatki, pasma) — inny zestaw to inna pamięć.
      const depsKey = [Boolean(annualWindow(deps.tempo)), Boolean(deps.kursy), deps.sdsReady, deps.defaultSource,
        Boolean(obDeps.cykle && obDeps.tygodnie), obDeps.sdsReady, obDeps.defaultSource, obDeps.thresholds.join('/')].join('|');
      const cached = force !== true && state.cardCache && state.cardCache.deps === depsKey ? state.cardCache.items : null;
      const before = force !== true ? savedCards() : null;
      exportNote = '';
      cardsBusy = { done: 0, total: 0 };
      if (before) fillBar(); else fillCards();
      let journal = null, journalBroken = false;
      try { journal = await readJournal(session); } catch { journalBroken = true; }
      if (run !== cardsRun) return;
      if (!alive()) { cardsBusy = null; return; }
      let dx;
      try { const index = await readDiagnoses(session); dx = index ? { index, mark: index.mark, failed: false } : null; }
      catch { dx = { index: null, mark: '!', failed: true }; }
      if (run !== cardsRun) return;
      if (!alive()) { cardsBusy = null; return; }
      const markOf = (patientId) => journalBroken ? '!' : journal ? journal.mark(patientId) : '';
      const plan = cardsPlan(base, cached, markOf), items = plan.kept;
      cardsBusy = { done: 0, total: plan.stale.length };
      updateCardsProgress();
      // Kilka kart naraz: odczyt z magazynu i odszyfrowanie czekają poza głównym wątkiem, więc równoległe kolejki
      // skracają liczenie; wynik nie zależy od kolejności (każda karta ma własny wpis).
      const queue = plan.stale.slice();
      const reader = async () => {
        while (queue.length) {
          if (run !== cardsRun || !alive()) return;
          const record = queue.shift();
          const entry = { stamp: record.lastSavedAtISO || '', journal: markOf(record.patientId), read: false, card: null, gh: null, ob: null, partial: false };
          try {
            const snapshot = await readCard(record.patientId, session);
            if (run !== cardsRun) return;
            if (snapshot && snapshot.payload) {
              const payload = snapshot.payload;
              let points = Array.isArray(payload.obesityTherapyPoints) ? payload.obesityTherapyPoints : [];
              if (journal) {
                const merged = win.VildaDziennikOtylosci.zloz(journal.of(record.patientId), points);
                if (merged && Array.isArray(merged.punkty)) points = merged.punkty;
              } else if (journalBroken) entry.partial = true;
              else {
                // Sejf albo dziennik bez szybkiego odczytu: wpisy pacjenta po staremu, osobnym odczytem.
                const therapy = await obesityPoints(record.patientId, payload);
                if (run !== cardsRun) return;
                points = therapy.points;
                if (therapy.failed) { entry.partial = true; entry.journal = '!'; }
              }
              entry.card = cardCompleteness(payload);
              entry.gh = ghPatient(payload, deps);
              entry.ob = obesityPatient(payload, points, obDeps);
              entry.read = true;
            }
          } catch {
            if (run !== cardsRun) return;
          }
          items[record.patientId] = entry;
          cardsBusy.done += 1; updateCardsProgress();
        }
      };
      await Promise.all(Array.from({ length: Math.min(CARD_READERS, queue.length) }, reader));
      if (run !== cardsRun) return;
      if (!alive()) { cardsBusy = null; return; }
      cardsBusy = null;
      if (!alive()) return;
      state.cardCache = { deps: depsKey, items };
      if (before && !plan.stale.length) {
        // Nic się nie zmieniło w kartach: zostaje ten sam wynik, nowa jest tylko chwila sprawdzenia.
        // Rozpoznania zmieniają się bez zapisu karty, więc ich sekcja ma własny znacznik.
        const sameDx = (before.dx ? before.dx.mark : '') === (dx ? dx.mark : '');
        state.cards = Object.assign({}, before, { at: new Date().toISOString(), dx });
        scopeCache = null;
        if (sameDx) fillBar(); else fillCards();
        return;
      }
      const result = cardsResult(base, items);
      scopeCache = null;
      state.cards = { signature, at: new Date().toISOString(), total: base.length, failed: result.failed, missing: result.missing, details: result.details,
        dx, thresholds: obDeps.thresholds,
        gh: Object.assign(ghCohort(result.treated), { sdsReady: deps.sdsReady, engineReady: Boolean(annualWindow(deps.tempo)) }),
        obesity: Object.assign(obesityCohort(result.obese, { thresholds: obDeps.thresholds }),
          { sdsReady: obDeps.sdsReady, engineReady: Boolean(obDeps.cykle && obDeps.tygodnie), journalFailed: result.partial }) };
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
      host.appendChild(el('p', 'pt-stat-note', ghNote()));
    }
    /* ── P-BAZA-STATYSTYKI, etap 3: leczenie otyłości ───────────────────────────── */
    // Skala wierszy „wg leku”: od zera (albo od przyrostu) w lewo do największej redukcji w prawo, w trzech równych krokach.
    function obesityScale(cohort) {
      const values = [];
      OBESITY_WINDOWS.forEach((range) => {
        values.push(cohort.windows[range.key].mean);
        cohort.drugs.forEach((item) => values.push(item.windows[range.key].mean));
      });
      const known = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).concat([0]);
      const high = Math.ceil(Math.max.apply(null, known) / 5) * 5;
      return { high, span: Math.max(15, Math.ceil((high - Math.min.apply(null, known)) / 15) * 15) };
    }
    /* Wykres „każdy pacjent”: jeden słupek to jeden pacjent, od najmniejszej do największej redukcji.
     * Słupki rysuje SVG rozciągnięty na szerokość (viewBox 0–1000), a podziałkę — drugi SVG w skali
     * 1:1 (jednostka = piksel), żeby liczby nie rozciągały się razem ze słupkami. */
    function fall(people) {
      const scale = fallScale(people.map((person) => person.pct)), high = scale.high, low = scale.low, step = scale.step;
      const y = (value) => Math.round((FALL_PAD + (high - value) / (high - low) * (FALL_HEIGHT - 2 * FALL_PAD)) * 10) / 10;
      const svg = (className, width, stretch) => {
        const node = doc.createElementNS(SVG_NS, 'svg');
        node.setAttribute('class', className); node.setAttribute('viewBox', '0 0 ' + width + ' ' + FALL_HEIGHT);
        if (stretch) node.setAttribute('preserveAspectRatio', 'none');
        node.setAttribute('aria-hidden', 'true'); node.setAttribute('focusable', 'false');
        return node;
      };
      const axis = svg('pt-ob-fall-axis', 46, false), plot = svg('pt-ob-fall-plot', 1000, true);
      const rule = (className, value) => {
        const line = doc.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', className);
        line.setAttribute('x1', '0'); line.setAttribute('x2', '1000');
        line.setAttribute('y1', String(y(value))); line.setAttribute('y2', String(y(value)));
        plot.appendChild(line);
      };
      for (let tick = high; tick >= low; tick -= step) {
        const label = doc.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'pt-ob-tick'); label.setAttribute('x', '40'); label.setAttribute('y', String(y(tick) + 4.5));
        label.textContent = formatDelta(tick, 0) + '%';
        axis.appendChild(label);
        if (tick !== 0) rule('pt-ob-grid', tick);
      }
      const slot = 1000 / Math.max(people.length, 16);
      people.forEach((person, index) => {
        const rect = doc.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('class', person.pct > 0 ? 'pt-ob-bar pt-ob-bar--gain' : 'pt-ob-bar');
        rect.setAttribute('x', String(Math.round((index * slot + slot * 0.14) * 10) / 10));
        rect.setAttribute('y', String(Math.min(y(0), y(person.pct))));
        rect.setAttribute('width', String(Math.round(slot * 0.72 * 10) / 10));
        rect.setAttribute('height', String(Math.max(Math.round(Math.abs(y(person.pct) - y(0)) * 10) / 10, 1)));
        plot.appendChild(rect);
      });
      rule('pt-ob-zero', 0);
      const wrap = el('div', 'pt-ob-fall');
      wrap.appendChild(axis); wrap.appendChild(plot);
      return wrap;
    }
    function renderObesity(host, cohort) {
      if (!cohort) {
        host.appendChild(el('p', 'pt-stat-note', cardsBusy ? 'Trwa liczenie z kart…' : 'Pojawi się po policzeniu z kart.'));
        return;
      }
      if (!cohort.treated) {
        host.appendChild(el('p', 'pt-stat-note', 'W bazie nie ma pacjentów z punktami leczenia otyłości.'));
        return;
      }
      if (!cohort.engineReady) {
        host.appendChild(el('p', 'pt-stat-note', 'Leczonych: ' + cohort.treated + '. Zmiany masy nie policzono, bo na tej stronie nie wczytał się moduł cykli leczenia. Odśwież aplikację i policz ponownie.'));
        return;
      }
      const people = (count) => count + (count === 1 ? ' pacjent' : ' pacjentów');
      const tiles = el('div', 'pt-stat-tiles pt-gh-tiles pt-ob-tiles');
      OBESITY_WINDOWS.forEach((range) => {
        const part = cohort.windows[range.key];
        const tile = statTile('Zmiana masy ' + range.after, percentText(part.mean), '',
          part.n ? 'mediana ' + percentText(part.median) + ' · n = ' + part.n + ' · ' + formatDelta(part.kgPerMonth, 1) + ' kg/mies.'
            : 'żaden pacjent nie ma pomiaru w ' + range.min + '–' + range.max + ' tyg.',
          part.n ? () => showGroup('Otyłość · masa ' + range.after, part.ids) : null);
        tile.setAttribute('data-window', range.key);
        if (part.n) tile.setAttribute('aria-label', 'Średnia zmiana masy ciała ' + range.after + ': ' + percentText(part.mean) + ', ' + people(part.n) + '. Pokaż listę');
        tiles.appendChild(tile);
      });
      const range = obesityMainWindow(cohort);
      const main = cohort.windows[range.key];
      if (main.thresholds.length) {
        const first = main.thresholds[0], rest = main.thresholds.slice(1);
        const label = 'Redukcja o ≥ ' + first.threshold + '% ' + range.after;
        const tile = statTile(label, main.n ? first.n + ' z ' + main.n : '—', '',
          main.n ? percent(first.n, main.n) + '%' + rest.map((item) => ' · o ≥ ' + item.threshold + '%: ' + item.n + ' (' + percent(item.n, main.n) + '%)').join('') : 'brak pomiarów w oknie',
          first.n ? () => showGroup('Otyłość · redukcja o ≥ ' + first.threshold + '% ' + range.after, first.ids) : null);
        tile.setAttribute('data-tile', 'threshold');
        if (first.n) tile.setAttribute('aria-label', label + ': ' + first.n + ' z ' + main.n + '. Pokaż listę');
        tiles.appendChild(tile);
      }
      const kids = main.bmi;
      const kidsTile = statTile('Dzieci: zmiana BMI ' + range.after, percentText(kids.mean), '',
        kids.n ? 'n = ' + kids.n + (kids.sdsN ? ' · BMI-SDS ' + formatDelta(kids.sds, 2) + (kids.sdsN < kids.n ? ' (n = ' + kids.sdsN + ')' : '')
          : cohort.sdsReady ? ' · BMI-SDS: brak płci, wieku lub siatki' : ' · BMI-SDS: otwórz Bazę ze strony Start')
          : cohort.children ? 'brak pomiaru ze wzrostem w oknie' : 'brak leczonych dzieci');
      kidsTile.setAttribute('data-tile', 'bmi');
      tiles.appendChild(kidsTile);
      host.appendChild(tiles);

      const scale = obesityScale(cohort);
      const position = (part) => part.n ? scale.high - part.mean : null;
      const drugHead = el('div', 'pt-stat-card-head');
      drugHead.appendChild(el('h4', null, 'Wg leku (zmiana masy, %)'));
      const legend = el('div', 'pt-stat-legend');
      [['before', OBESITY_WINDOWS[0].after], ['first', OBESITY_WINDOWS[1].after]].forEach(([key, text]) => {
        const item = el('span', 'pt-stat-legend-item');
        item.appendChild(el('span', 'pt-stat-swatch pt-gh-swatch--' + key));
        item.appendChild(el('span', null, text));
        legend.appendChild(item);
      });
      drugHead.appendChild(legend); host.appendChild(drugHead);
      const drugs = el('div', 'pt-stat-bands');
      cohort.drugs.forEach((item) => {
        const short = item.windows[OBESITY_WINDOWS[0].key], long = item.windows[OBESITY_WINDOWS[1].key];
        const figure = short.n && long.n ? formatDelta(short.mean, 1) + ' → ' + percentText(long.mean)
          : short.n ? percentText(short.mean) : long.n ? percentText(long.mean) : 'brak wyniku';
        const describe = item.drug + ': leczonych ' + item.treated + OBESITY_WINDOWS.map((period) => {
          const part = item.windows[period.key];
          return ', ' + period.after + ' ' + (part.n ? percentText(part.mean) + ' (n = ' + part.n + ')' : 'brak wyniku');
        }).join('');
        const row = button('pt-stat-band pt-gh-row pt-ob-row', null, () => showGroup('Otyłość · ' + item.drug, item.ids));
        row.setAttribute('data-drug', item.drug);
        row.setAttribute('aria-label', describe + '. Pokaż listę'); row.title = describe;
        const name = el('span', 'pt-gh-name');
        name.appendChild(el('b', null, item.drug));
        name.appendChild(el('span', 'pt-gh-n', 'leczonych ' + item.treated
          + OBESITY_WINDOWS.map((period) => ' · ' + period.after.replace('po ', '') + ': ' + item.windows[period.key].n).join('') + (item.small ? ' · mała grupa' : '')));
        row.appendChild(name);
        row.appendChild(dumbbell(position(short), position(long), scale.span));
        row.appendChild(el('span', 'pt-stat-band-total pt-gh-figure', figure));
        drugs.appendChild(row);
      });
      host.appendChild(drugs);
      const axis = el('div', 'pt-gh-scale pt-ob-scale');
      axis.setAttribute('aria-hidden', 'true');
      [0, 1, 2, 3].forEach((index) => axis.appendChild(el('span', null, formatDelta(scale.high - scale.span / 3 * index, 0) + (index === 3 ? '%' : ''))));
      host.appendChild(axis);

      if (main.n) {
        const fallHead = el('div', 'pt-stat-card-head');
        fallHead.appendChild(el('h4', null, 'Każdy pacjent ' + range.after));
        const fallLegend = el('div', 'pt-stat-legend');
        [['loss', 'ubytek masy'], ['gain', 'przyrost masy']].forEach(([key, text]) => {
          const item = el('span', 'pt-stat-legend-item');
          item.appendChild(el('span', 'pt-stat-swatch pt-ob-swatch--' + key));
          item.appendChild(el('span', null, text));
          fallLegend.appendChild(item);
        });
        fallHead.appendChild(fallLegend);
        host.appendChild(fallHead);
        host.appendChild(fall(main.people));
        const best = main.people[main.people.length - 1].pct;
        host.appendChild(el('p', 'pt-stat-note', 'Jeden słupek to jeden pacjent, od najmniejszej do największej redukcji masy.'
          + (best < 0 ? ' Największa redukcja: ' + percentText(best) + '.' : '')));
      }

      OBESITY_WINDOWS.forEach((period) => {
        const without = OBESITY_REASONS.filter((key) => cohort.missing[period.key][key].length);
        if (!without.length) return;
        const gaps = el('div', 'pt-gh-gaps pt-ob-gaps');
        gaps.setAttribute('data-window', period.key);
        gaps.appendChild(el('span', null, 'Bez wyniku ' + period.after + ':'));
        without.forEach((key) => {
          const ids = cohort.missing[period.key][key], label = obesityReason(key, period);
          const show = button('pt-stat-missing', label + ': ' + ids.length + ' ›', () => showGroup('Otyłość · ' + period.after + ' · ' + label, ids));
          show.setAttribute('data-reason', key);
          gaps.appendChild(show);
        });
        host.appendChild(gaps);
      });
      if (main.gained.length) {
        const gained = el('div', 'pt-gh-gaps pt-ob-gaps');
        gained.setAttribute('data-window', 'gained');
        gained.appendChild(el('span', null, 'Przyrost masy ' + range.after + ':'));
        const show = button('pt-stat-missing', 'pacjentów: ' + main.gained.length + ' ›', () => showGroup('Otyłość · przyrost masy ' + range.after, main.gained));
        show.setAttribute('data-reason', 'gained');
        gained.appendChild(show);
        host.appendChild(gained);
      }
      host.appendChild(el('p', 'pt-stat-note', obesityNote(cohort.journalFailed)));
    }
    /* P-BAZA-GRUPY: pasek filtrów zakresu nad statystykami. Zwykłe pola wyboru (klawiatura, czytnik ekranu i telefon
     * obsługują je same). Lista pacjentów jest tylko przy dostępie do list; jej pozycje dochodzą po odczycie katalogu. */
    function filterBar(sequence) {
      const bar = el('div', 'pt-filters'), base = basePatients();
      bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Zakres statystyk');
      function field(key, labelText, options, value) {
        const holder = el('label', 'pt-filter');
        holder.appendChild(el('span', 'pt-filter-label', labelText));
        const node = doc.createElement('select');
        node.className = 'pt-filter-select' + (value ? ' on' : '');
        node.setAttribute('data-filter-key', key);
        const fill = (rows) => {
          clear(node);
          rows.forEach(([id, text]) => { const option = doc.createElement('option'); option.value = id; option.textContent = text; node.appendChild(option); });
          node.value = value;
        };
        fill(options);
        node.disabled = busy;
        node.addEventListener('change', () => setFilter(key, node.value));
        holder.appendChild(node); bar.appendChild(holder);
        return fill;
      }
      const recent = scopeMembers(base, { recent: true }, { ageMonths: ageFromVault }).length;
      field('recent', 'Zakres', [['', 'cała baza (' + base.length + ')'], ['recent', SCOPE_RECENT + ' (' + recent + ')']], state.filters.recent ? 'recent' : '');
      if (mayUseLists()) {
        const chosen = state.filters.listId || '';
        const rows = (entries) => [['', 'wszystkie']].concat(entries.map(({ list }) => [list.id, list.name || '(bez nazwy)']));
        const known = chosen ? [{ list: { id: chosen, name: state.filters.listName || 'wybrana lista' } }] : [];
        const fill = field('list', 'Lista pacjentów', rows(listCache || known), chosen);
        if (!listCache) getCatalog().then((entries) => {
          if (!guardedRead(sequence) || !mayUseLists() || !bar.isConnected) return;
          fill(rows(!chosen || entries.some(({ list }) => list.id === chosen) ? entries : entries.concat(known)));
        }).catch(() => { /* pole zostaje z samym „wszystkie”; błąd odczytu list pokazuje zakładka „Listy” */ });
      }
      field('sex', 'Płeć', [['', 'wszyscy'], ['M', SCOPE_SEX.M], ['F', SCOPE_SEX.F]], state.filters.sex || '');
      field('band', 'Wiek', [['', 'wszystkie']].concat(AGE_BANDS.map((band) => [band.key, band.label])), state.filters.band || '');
      return bar;
    }
    // Członkowie listy wybranej w filtrze — ten sam odczyt, którego używa zakładka „Listy” (także listy automatyczne).
    function loadFilterMembers(sequence) {
      const id = state.filters.listId;
      loadMembers(id).then((result) => {
        if (!guardedRead(sequence) || state.filters.listId !== id) return;
        if (!result) {
          state.filters = scopeFilters(Object.assign({}, state.filters, { listId: null, listName: '' }));
          filterMembers = null; filterNote = 'Wybranej listy już nie ma. Statystyki pokazują zakres bez niej.';
        } else {
          filterStamp += 1;
          filterMembers = { id, ids: new Set(result.members.memberIds || []), stamp: filterStamp };
          state.filters.listName = result.list.name || '';
        }
        scopeCache = null; render();
      }).catch(() => { if (guardedRead(sequence) && state.filters.listId === id) { filterFailed = id; render(); } });
    }
    function renderStats(sequence) {
      cardsHost = null; cardsBar = null; ghHost = null; ghHint = null; obHost = null; obHint = null; cardsProgress = null; dxHost = null; dxHint = null;
      const base = basePatients();
      if (!base.length) {
        empty(scroll, 'Brak pacjentów w bazie', 'Statystyki pojawią się po dodaniu pierwszego pacjenta.', '+ Dodaj pacjenta', () => { if (opts.onAddPatient) opts.onAddPatient(); });
        return;
      }
      // Filtr listy bez dostępu do list przestaje zawężać.
      if (state.filters.listId && !mayUseLists()) {
        state.filters = scopeFilters(Object.assign({}, state.filters, { listId: null, listName: '' }));
        filterMembers = null; scopeMemo = null; scopeCache = null;
      }
      // Rozpoznanie, z którego zniknęli wszyscy pacjenci (usunięci, przeniesieni poza bazę), przestaje zawężać.
      if (state.scope) {
        const known = new Set(base.map((patient) => patient.patientId));
        if (!state.scope.ids.some((id) => known.has(id))) { state.scope = null; scopeCache = null; scopeMemo = null; }
      }
      const wrap = el('div', 'pt-stats');
      wrap.appendChild(filterBar(sequence));
      if (filterNote) {
        const note = el('p', 'pt-stat-note pt-filters-note', filterNote);
        note.setAttribute('role', 'status'); wrap.appendChild(note);
      }
      if (scopePending()) {
        if (filterFailed === state.filters.listId) empty(wrap, 'Nie udało się wczytać listy „' + (state.filters.listName || 'wybrana lista') + '”.', 'Spróbuj ponownie albo wybierz inny zakres.', 'Ponów', () => { filterFailed = null; render(); });
        else { wrap.appendChild(el('div', 'pt-loading', 'Wczytywanie listy…')); loadFilterMembers(sequence); }
        scroll.appendChild(wrap);
        return;
      }
      const model = demographics(shownPatients(), { ageMonths: ageFromVault });
      if (!model.total) {
        empty(wrap, 'Brak pacjentów w tym zakresie', 'Żaden pacjent z bazy nie spełnia wszystkich wybranych filtrów: ' + scopeLabelNow() + '.', 'Cała baza', () => clearScope());
        scroll.appendChild(wrap);
        return;
      }

      if (scopeOn()) {
        const label = scopeLabelNow(), members = shownBase().map((patient) => patient.patientId);
        const banner = el('div', 'pt-scope');
        banner.setAttribute('role', 'status');
        const text = el('div', 'pt-scope-text');
        text.appendChild(el('span', 'pt-scope-kicker', 'Statystyki grupy'));
        text.appendChild(el('strong', 'pt-scope-name', label));
        text.appendChild(el('span', 'pt-scope-count', peopleLabel(members.length) + (scopeActive(state.filters) ? ' w tym zakresie' : ' z tym rozpoznaniem')));
        banner.appendChild(text);
        const actions = el('div', 'pt-scope-actions');
        actions.appendChild(button('pt-secondary pt-scope-list', 'Pokaż listę', () => showGroup(label, members)));
        actions.appendChild(button('pt-secondary pt-scope-clear', 'Cała baza', () => clearScope()));
        banner.appendChild(actions);
        wrap.appendChild(banner);
      }

      const tiles = el('div', 'pt-stat-tiles');
      tiles.appendChild(statTile(scopeOn() ? 'Pacjenci w grupie' : 'Pacjenci w bazie', String(model.total), '', model.recent + ' z zapisem w ostatnich 12 mies.'));
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

      const dxCard = el('section', 'pt-stat-card pt-dx');
      const dxHead = el('div', 'pt-stat-card-head');
      dxHead.appendChild(el('h3', null, 'Rozpoznania'));
      dxHint = el('span', 'pt-stat-card-hint');
      dxHead.appendChild(dxHint);
      dxCard.appendChild(dxHead);
      dxHost = el('div', 'pt-dx-body');
      dxCard.appendChild(dxHost);
      wrap.appendChild(dxCard);

      const ghCard = el('section', 'pt-stat-card pt-gh');
      const ghHead = el('div', 'pt-stat-card-head');
      ghHead.appendChild(el('h3', null, 'Leczenie hormonem wzrostu'));
      ghHint = el('span', 'pt-stat-card-hint');
      ghHead.appendChild(ghHint);
      ghCard.appendChild(ghHead);
      ghHost = el('div', 'pt-gh-body');
      ghCard.appendChild(ghHost);
      wrap.appendChild(ghCard);

      const obCard = el('section', 'pt-stat-card pt-ob');
      const obHead = el('div', 'pt-stat-card-head');
      obHead.appendChild(el('h3', null, 'Leczenie otyłości'));
      obHint = el('span', 'pt-stat-card-hint');
      obHead.appendChild(obHint);
      obCard.appendChild(obHead);
      obHost = el('div', 'pt-gh-body pt-ob-body');
      obCard.appendChild(obHost);
      wrap.appendChild(obCard);

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

      wrap.appendChild(el('p', 'pt-stat-note pt-stat-note--foot', footNote(model.total)));
      scroll.appendChild(wrap);
      // Liczenie rusza samo, raz na wejście w „Statystyki” (decyzja właściciela 2026-11-24).
      if (!statsCounted) { statsCounted = true; countCards(false); }
    }

    function reader() {
      if (!listReader) listReader = typeof vault.createPatientListReader === 'function' ? vault.createPatientListReader({ isCurrent: alive }) : vault;
      return listReader;
    }
    function invalidateLists() {
      if (listReader && listReader !== vault && typeof listReader.dispose === 'function') listReader.dispose();
      listReader = null; listCache = null; catalogPromise = null; memberCache = null; memberPromises.clear();
      filterMembers = null; filterFailed = null; scopeMemo = null;
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
    /* P-BAZA-GRUPY: „Zapisz jako listę” — grupa ze statystyk staje się zwykłą listą ręczną. Jeden zapis w sejfie
     * (savePatientList z gotowym składem), ten sam, którego używa edytor list; lista synchronizuje się jak każda inna. */
    function openGroupSave() {
      if (busy || !state.group || !mayUseLists()) return;
      state.groupTask = { mode: 'form', name: state.group.label.slice(0, 80), note: '', failed: false, listId: null };
      syncControls();
      groupInput.value = state.groupTask.name;
      groupInput.focus(); groupInput.select();
    }
    async function saveGroupList() {
      const group = state.group, task = state.groupTask;
      if (busy || !alive() || !group || !task || task.mode !== 'form' || !mayUseLists()) return;
      const name = groupInput.value.trim(), ids = group.ids.filter((id) => byId.has(id));
      if (!name) {
        state.groupTask = { mode: 'form', name: '', note: 'Podaj nazwę listy.', failed: true, listId: null };
        syncControls(); groupInput.focus(); return;
      }
      if (!ids.length) {
        state.groupTask = { mode: 'note', name: '', note: 'W tej grupie nie ma już pacjentów z bazy.', failed: true, listId: null };
        syncControls(); return;
      }
      busy = true;
      state.groupTask = { mode: 'saving', name, note: 'Zapisuję listę…', failed: false, listId: null };
      syncControls();
      let next;
      try {
        const saved = await vault.savePatientList({ name, description: 'Grupa ze statystyk · ' + dateFormatter.format(new Date()), memberIds: ids });
        if (!saved || !saved.id) throw new Error('sejf nie potwierdził zapisu');
        next = { mode: 'note', name: '', note: 'Zapisano listę „' + (saved.name || name) + '” · ' + peopleLabel(ids.length) + '.', failed: false, listId: saved.id };
      } catch (error) {
        next = { mode: 'form', name, note: 'Nie udało się zapisać listy' + (error && error.message ? ': ' + error.message : '') + '.', failed: true, listId: null };
      }
      busy = false;
      if (!alive()) return;
      invalidateLists();
      if (state.group === group) state.groupTask = next;
      syncControls();
      const focus = next.listId ? groupOpen : next.mode === 'form' ? groupInput : groupSave;
      if (state.group === group && !focus.hidden && !focus.disabled) focus.focus();
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
      scopeMemo = null;
      syncControls();
      if (rowWindow) { rowWindow.destroy(); rowWindow = null; }
      clear(scroll);
      if (opts.loading) { count.textContent = ''; scroll.appendChild(el('div', 'pt-loading', 'Wczytywanie Bazy pacjentów…')); return; }
      if (state.view === 'stats') { count.textContent = ''; renderStats(sequence); restorePosition(); return; }
      ++cardsRun; cardsBusy = null; statsCounted = false; cardsHost = null; cardsBar = null; ghHost = null; ghHint = null; obHost = null; obHint = null; dxHost = null; dxHint = null; // liczenie z kart trwa tylko, dopóki widać statystyki
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
  win.VildaPatientsList = Object.freeze({ create, createLoading, demographics, cardCompleteness, formatAge, ghPatient, ghCohort, obesityPatient, obesityCohort, obesityThresholds,
    statsReport, statsWorkbook, statsDocument, xlsxParts, reportFileName,
    journalIndex, cardsPlan, cardsResult, diagnosisIndex, diagnosisCohort,
    scopeFilters, scopeActive, scopeKey, scopeLabel, scopeMembers });
})(typeof window !== 'undefined' ? window : null);
