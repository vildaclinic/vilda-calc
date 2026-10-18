/* Historia wyników badań laboratoryjnych — model porównania bez DOM, magazynu i zegara.
 *
 * Wejście: serie z VildaVault.listPatientLabSeries, notatki pacjenta (listPatientNotesForPatient),
 * okresy leczenia (listPatientTreatmentPeriods) i wstrzyknięty LabUnitConverter. Model pokazuje
 * wyniki tak, jak je zapisano: nie liczy dawnych wyników dzisiejszymi normami ani danymi bieżącego
 * pacjenta, nie woła evaluate() ani silników ocen (LAB_INTERPRETATION_AGENT_GUIDE.md § 7).
 * Strzałka ↑/↓ powstaje wyłącznie z zapisu: z jednej, zakotwiczonej normy tekstowej wpisu
 * w jednostce wyniku (bez przeliczenia), z zamrożonej koperty oceny LH/FSH/inhibiny B albo (od 1.2.0,
 * decyzja 6.3) z zakresu referencyjnego zapisanego z wynikiem przy przypięciu (vilda_lab_range_snapshot.js):
 * kategoria taka, jaką przelicznik pokazał w chwili przypięcia, bez ponownego dobierania normy.
 * Od 1.1.0 (PR5a): alias serii po dokładnej nazwie badania z listy przelicznika (decyzja 6.14) i IGF-1
 * z notatek leczenia GH w serii IGF-1, z datą kontroli, gdy brak daty badania (decyzje 6.24–6.25).
 * Projekt: docs/LAB_HISTORIA_WYNIKOW_PLAN.md, 3.1; opis: docs/clinical/ALGORITHMS.md,
 * „LAB-HISTORIA — model porównania”.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaLabHistory = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var own = function (value, key) { return value != null && Object.prototype.hasOwnProperty.call(value, key); };
  var record = function (value) { return value !== null && typeof value === 'object' && !Array.isArray(value); };
  var finite = function (value) { return typeof value === 'number' && isFinite(value); };
  var text = function (value) { return typeof value === 'string' ? value.trim() : ''; };
  var NBSP = ' ';
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

  // Panele kliniczne jako dane (decyzja 6.5: progesteron w osi gonadalnej, prolaktyna w „Inne”).
  // Seria spoza paneli i seria bez klucza przelicznika trafia do „Inne”.
  var HISTORY_PANELS = Object.freeze([
    Object.freeze({ id: 'thyroid', label: 'Tarczyca', analytes: Object.freeze(['tsh', 'ft4', 'ft3', 't4_total', 't3_total', 'thyroglobulin']) }),
    Object.freeze({ id: 'gonadal', label: 'Oś gonadalna', analytes: Object.freeze(['lh', 'fsh', 'estradiol', 'progesterone', 'testosterone_total', 'testosterone_free', 'amh', 'inhibin_b', 'shbg']) }),
    Object.freeze({ id: 'somatotropic', label: 'Oś GH–IGF-1', analytes: Object.freeze(['igf1', 'igfbp3']) })
  ]);
  var OTHER_PANEL = Object.freeze({ id: 'other', label: 'Inne' });
  // Anality z kopertą oceny, która zapisuje metodę oznaczenia i materiał (vilda_lab_snapshot.js).
  var ENVELOPE_ANALYTES = ['lh', 'fsh', 'inhibin_b'];
  // Skróty zdań z VildaLabAssessmentUI (REASONS); pełne zdania pokazuje renderer oceny.
  var INVALIDATION_TEXT = {
    result_or_clinical_date_changed: 'zmieniono wynik lub datę badania',
    assessment_result_mismatch: 'ocena dotyczy innej wartości, jednostki lub analitu',
    assessment_sample_date_mismatch: 'data pobrania w ocenie nie odpowiada dacie badania',
    assessment_binding_mismatch: 'ocena nie odpowiada obecnym polom wyniku',
    assessment_requires_recalculation: 'zmieniono dane wyniku'
  };
  var CHART_KINDS = ['exact', 'legacy'];
  // Daty, które stawiają wynik na osi wykresu i w różnicy: data badania, a dla IGF-1 z notatki leczenia GH
  // także termin kontroli, która już się odbyła (decyzja 6.25; tak datuje IGF-1 wykres „Trend leczenia GH”).
  var SAMPLE_DATES = ['badanie', 'kontrola'];
  // IGF-1 z notatki leczenia GH (decyzja 6.24): pole „IGF-1 (wynik z kontroli)” edytora wpisu z dawką GH
  // zapisuje { value, unit: "ng/ml" } w note.igf1 (Ce() w vilda_vault.js). Edytor ma stałą jednostkę ng/ml.
  var GH_IGF1_SERIES = 'igf1';
  var GH_IGF1_UNIT = 'ng/ml';

  // Symbol jednostki po normalizacji: przycięty, spacje zwinięte, znak mikro U+00B5 → grecka mu U+03BC
  // (konwerter używa U+03BC, klawiatura daje U+00B5).
  function normalizeUnit(unit) {
    return String(unit == null ? '' : unit).replace(/µ/g, 'μ').replace(/\s+/g, ' ').trim();
  }
  // Klucz serii jak w sejfie (listPatientLabSeries: testKey albo skrót nazwy badania). Potrzebny
  // tylko dla wpisów tekstowych, których sejf nie umieszcza w seriach; zgodność z sejfem pilnuje
  // tests/unit/lab-history-vault.test.mjs.
  function seriesSlug(test) {
    var slug = String(test || '').split('(')[0].toLowerCase();
    try { slug = slug.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) { /* bez normalize: jak w sejfie */ }
    slug = slug.replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '');
    return slug.substring(0, 40) || null;
  }
  // Badanie z listy edytora karty ma etykietę konwertera, ale edytor zapisuje testKey tylko przy
  // wartości liczbowej (ft() w vilda_auth_ui.js). Wpis tekstowy z tej samej listy dostaje więc klucz
  // po dokładnej etykiecie, jak zrobiłby to edytor, a dopiero potem skrót nazwy jak w sejfie.
  function labelKey(test, labels) {
    var wanted = text(test);
    if (!wanted) return null;
    for (var i = 0; i < labels.length; i++) if (labels[i].label === wanted) return labels[i].id;
    return null;
  }
  // Kategoria notatki jak w karcie pacjenta (Yr w vilda_auth_ui.js): jawny klirens, potem lek, potem wynik.
  function noteCategory(note) {
    if (!record(note)) return null;
    if (note.category === 'wynik-klirens') return 'wynik-klirens';
    if (note.medication) return 'treatment';
    if (note.labResult) return 'wynik-badania';
    return note.category || null;
  }
  function sampleDated(entry) { return SAMPLE_DATES.indexOf(entry.dateSource) !== -1; }
  function isoDate(value) { return typeof value === 'string' && ISO_DATE.test(value) ? value.slice(0, 10) : null; }
  function formatDate(value) {
    var iso = isoDate(value);
    if (!iso) return '';
    var parts = iso.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0].slice(2);
  }
  function dayNumber(iso) {
    var parts = iso.split('-').map(Number);
    return Math.round(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 864e5);
  }
  function daysBetween(fromISO, toISO) {
    var from = isoDate(fromISO), to = isoDate(toISO);
    return from && to ? dayNumber(to) - dayNumber(from) : null;
  }

  // Liczby: zaokrąglenie do cyfr znaczących jak LabUnitConverter.formatNumber, żeby różnica
  // liczyła się z wartości, które lekarz widzi (15,4 − 15 = 0,4, nie 0,444).
  function roundSignificant(value, digits) {
    if (!finite(value) || value === 0) return value;
    var n = Math.max(1, digits | 0), scale = Math.pow(10, n - Math.ceil(Math.log10(Math.abs(value))));
    return Math.round(value * scale) / scale;
  }
  function formatNumber(converter, value, precision) {
    if (converter && typeof converter.formatNumber === 'function') {
      try { return converter.formatNumber(value, precision); } catch (_) { /* zapas niżej */ }
    }
    return String(roundSignificant(value, precision)).replace('.', ',');
  }
  function withUnit(number, unit) { return unit ? number + NBSP + unit : number; }

  function substance(converter, id) {
    if (!converter || !id || typeof converter.find !== 'function') return null;
    try { var found = converter.find(id); return record(found) && Array.isArray(found.units) ? found : null; } catch (_) { return null; }
  }
  function knownUnit(sub, unit) {
    var wanted = normalizeUnit(unit);
    if (!sub || !wanted) return null;
    for (var i = 0; i < sub.units.length; i++) {
      if (sub.units[i] && normalizeUnit(sub.units[i].symbol) === wanted) return sub.units[i].symbol;
    }
    return null;
  }
  // Tylko dla IGF-1 z notatki leczenia GH: edytor zapisuje „ng/ml”, konwerter zna „ng/mL”.
  function knownUnitIgnoreCase(sub, unit) {
    var wanted = normalizeUnit(unit).toLowerCase();
    if (!sub || !wanted) return null;
    for (var i = 0; i < sub.units.length; i++) {
      if (sub.units[i] && normalizeUnit(sub.units[i].symbol).toLowerCase() === wanted) return sub.units[i].symbol;
    }
    return null;
  }
  // Ten sam współczynnik co strona „Jednostki laboratoryjne”: convertAll({substanceId, value, fromUnit}).
  function convertValue(converter, id, value, fromSymbol, toSymbol) {
    if (fromSymbol === toSymbol) return value;
    if (!converter || typeof converter.convertAll !== 'function') return null;
    try {
      var result = converter.convertAll({ substanceId: id, value: value, fromUnit: fromSymbol });
      if (result && result.ok && Array.isArray(result.results)) {
        for (var i = 0; i < result.results.length; i++) {
          if (result.results[i] && result.results[i].unit === toSymbol && finite(result.results[i].value)) return result.results[i].value;
        }
      }
    } catch (_) { /* brak przeliczenia = jednostka nierozpoznana */ }
    return null;
  }

  function rawText(lab, fallbackRaw, fallbackUnit) {
    var raw = text(lab && lab.value) || text(fallbackRaw) || (lab && finite(lab.valueNum) ? String(lab.valueNum) : '');
    var unit = text(lab && lab.unit) || text(fallbackUnit);
    if (!raw) return '';
    // Starsze notatki zapisują w value całe równanie przeliczenia albo wartość z jednostką.
    if (!unit || raw.toLowerCase().indexOf(unit.toLowerCase()) !== -1 || /\s=\s/.test(raw)) return raw;
    return raw + ' ' + unit;
  }

  // Strzałka z normy tekstowej wpisu (3.1 c): tekst musi być jednym zakresem „lo–hi [jednostka]”,
  // a jednostka normy, jeśli podana, równa jednostce wyniku po normalizacji. Granice daje
  // wstrzyknięte parseNorm (Dl z vilda_auth_ui.js), żeby nie powielać jego wyrażenia.
  var SINGLE_RANGE = /^\s*\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?\s*(.*?)\s*$/;
  function normCheck(norm, value, unit, parseNorm) {
    var none = { accepted: false, flag: null };
    var shape = typeof norm === 'string' ? SINGLE_RANGE.exec(norm) : null;
    if (!shape || typeof parseNorm !== 'function' || !finite(value)) return none;
    if (shape[1] && normalizeUnit(shape[1]) !== normalizeUnit(unit)) return none;
    var range;
    try { range = parseNorm(norm); } catch (_) { range = null; }
    if (!range || !finite(range.lo) || !finite(range.hi)) return none;
    return { accepted: true, flag: value > range.hi ? '↑' : value < range.lo ? '↓' : null };
  }
  // Decyzja 6.3: zakres zapisany z wynikiem przy przypięciu. Kategoria i granice z zapisu (opis:
  // VildaLabRangeSnapshot.describe); nie zależy od jednostki wyświetlania, więc obowiązuje też dla
  // wyniku przeliczonego. Zakres nieaktualny albo bez interpretacji — bez strzałki, wyciszony; od 1.3.0 także zakres
  // ogólny (wiersz domyślny przelicznika) u dziecka (decyzja 6.30).
  function rangeHelper(options) {
    var helper = options && options.rangeSnapshot;
    if (!helper && typeof globalThis !== 'undefined') helper = globalThis.VildaLabRangeSnapshot;
    return helper && typeof helper.describe === 'function' ? helper : null;
  }
  function applyRange(entry, options, converter, precision) {
    var helper = rangeHelper(options), info;
    try {
      info = helper ? helper.describe(entry.range, { formatNumber: function (value) { return formatNumber(converter, value, precision); } }) : null;
    } catch (_) { info = null; }
    if (!info) return;
    var shared = { bounds: info.bounds, population: info.population, subject: info.subject, sources: info.sources };
    if (info.status === 'recorded') {
      entry.flag = info.flag;
      entry.status = Object.assign({ kind: 'range', tone: 'lab', flag: info.flag, classification: info.classification, text: info.text }, shared);
    } else if (info.status === 'general') {
      // Decyzja 6.30: zakres ogólny (wiersz domyślny) u dziecka — granice i populacja widoczne, bez strzałki i kategorii.
      entry.status = Object.assign({ kind: 'range-general', tone: 'muted', text: info.text }, shared);
    } else {
      entry.status = Object.assign({ kind: info.status === 'invalidated' ? 'range-invalidated' : 'range-unavailable', tone: 'muted',
        text: info.text, detail: info.detail }, shared);
    }
  }
  function recordedStatus(envelope) {
    var e = envelope.evaluation || {}, clinical = record(e.clinical) ? e.clinical : {}, summary = record(e.summary) ? e.summary : {};
    // Cytat dosłowny, bez syntezy kierunku. Ostrzeżenie kliniczne koperty ma pierwszeństwo,
    // żeby nie znikło pod tytułem porównania (K6); inaczej tytuł podsumowania oceny.
    var warning = clinical.status === 'warning' && text(clinical.title);
    var input = record(e.input) ? e.input : {}, puberty = record(input.puberty) ? input.puberty : {};
    return {
      kind: 'recorded', tone: warning ? 'warning' : 'lab', source: warning ? 'clinical' : 'summary',
      text: warning ? text(clinical.title) : text(summary.title) || 'Ocena zapisana',
      summaryStatus: text(summary.status) || null, clinicalStatus: text(clinical.status) || null,
      context: {
        sex: input.sex === 'F' || input.sex === 'M' ? input.sex : null,
        stage: text(puberty.kind) && finite(puberty.stage) ? text(puberty.kind) + puberty.stage : null,
        ageAtSample: record(e.ageAtSample) ? e.ageAtSample : null
      }
    };
  }
  function invalidStatus(envelope) {
    var codes = Array.isArray(envelope.reasonCodes) ? envelope.reasonCodes.slice() : [];
    if (envelope.status === 'invalidated') {
      var detail = [];
      codes.forEach(function (code) {
        if (own(INVALIDATION_TEXT, code) && detail.indexOf(INVALIDATION_TEXT[code]) === -1) detail.push(INVALIDATION_TEXT[code]);
      });
      return { kind: 'invalidated', tone: 'muted', text: 'wymaga ponownej oceny', detail: detail, reasonCodes: codes };
    }
    return { kind: 'unavailable', tone: 'muted', text: 'ocena niedostępna', detail: [], reasonCodes: codes };
  }

  // Wpis z punktu serii sejfu albo z notatki tekstowej. Wartość w jednostce wyświetlania
  // ustala drugi przebieg (resolveUnits), gdy znana jest jednostka serii.
  // Źródło daty: data badania; bez niej termin zlecenia (sejf bierze go, gdy już minął) albo data wpisu.
  // Tylko data badania (a dla IGF-1 z notatki GH termin odbytej kontroli) czyni wynik „ostatnim”
  // lub „poprzednim” i stawia go na osi wykresu.
  function baseEntry(point, note, lab) {
    var clinical = note ? isoDate(note.clinicalDateISO) : null, date = clinical || isoDate(point.dateISO) || null;
    var due = note ? isoDate(note.dueDateISO) : null;
    return {
      kind: null, noteId: point.noteId || (note && note.id) || null,
      dateISO: date, dateSource: clinical ? 'badanie' : due && due === date ? 'termin' : 'wpis',
      ageMonths: finite(point.ageMonths) ? point.ageMonths : null,
      recordedValue: null, recordedUnit: normalizeUnit(point.unit != null ? point.unit : lab && lab.unit),
      raw: '', value: null, exactValue: null, unit: '', converted: false, display: '',
      norm: text(lab && lab.norm) || text(point.norm) || null, normAccepted: false, flag: null, status: null,
      comment: note ? text(note.body) : '', legacy: false, delta: null, reason: null
    };
  }
  function entryFromPoint(point, note) {
    var lab = note && record(note.labResult) ? note.labResult : {};
    var entry = baseEntry(point, note, lab);
    if (own(point, 'assessment') && record(point.assessment)) {
      var envelope = point.assessment, m = envelope.evaluation && envelope.evaluation.measurement;
      entry.assessment = envelope;
      if (envelope.status === 'recorded') {
        entry.status = recordedStatus(envelope);
        if (finite(point.valueNum)) { entry.kind = 'exact'; entry.recordedValue = point.valueNum; }
        else if (m && m.status === 'valid' && m.isExact === false) entry.kind = 'censored';
        else { entry.kind = 'unavailable'; entry.reason = 'measurement_invalid'; }
        entry.raw = rawText(lab, m && m.raw, m && m.sourceUnit);
      } else {
        entry.status = invalidStatus(envelope);
        entry.kind = envelope.status === 'invalidated' ? 'invalidated' : 'unavailable';
        entry.raw = rawText(lab, m && m.raw, m && m.sourceUnit);
      }
    } else if (finite(point.valueNum)) {
      entry.kind = point.legacy ? 'legacy' : 'exact';
      entry.legacy = !!point.legacy;
      entry.recordedValue = point.valueNum;
      entry.raw = rawText(lab, String(point.valueNum).replace('.', ','), point.unit);
    } else return null;
    if (own(point, 'hormoneReference')) entry.hormoneReference = point.hormoneReference;
    if (own(point, 'range') && record(point.range)) entry.range = point.range;
    return entry;
  }
  // Ręczny wpis z wartością, której sejf nie umie odczytać jako liczby (np. „<0,02 IU/L”):
  // wiersz tekstowy bez punktu i bez zera (K13).
  function textEntry(note, nowISO) {
    var lab = note.labResult, due = isoDate(note.dueDateISO);
    // Jak Cr() w sejfie: termin zlecenia tylko wtedy, gdy już minął; bez „dziś” od wołającego — data wpisu.
    var date = isoDate(note.clinicalDateISO) || (due && nowISO && due <= nowISO ? due : isoDate(note.createdAtISO));
    var entry = baseEntry({ noteId: note.id, dateISO: date, unit: lab.unit }, note, lab);
    entry.kind = 'text';
    entry.raw = rawText(lab);
    entry.display = entry.raw;
    return entry;
  }
  function ghIgf1(note) {
    return noteCategory(note) === 'treatment' && record(note.igf1) && finite(note.igf1.value);
  }
  // IGF-1 z notatki leczenia GH: wartość jak zapisano, bez normy, oceny i strzałki; bez komentarza, bo treść
  // notatki opisuje dawkę, a nie wynik. Data: data badania, inaczej termin kontroli, który już minął
  // (bez niestawienia); inaczej data wpisu — wtedy wynik jest tylko w tabeli. Brak jednostki = ng/ml edytora.
  function ghEntry(note, nowISO) {
    var clinical = isoDate(note.clinicalDateISO), due = isoDate(note.dueDateISO);
    var control = !clinical && due && nowISO && due <= nowISO && !note.noShowAtISO ? due : null;
    var unit = text(note.igf1.unit) || GH_IGF1_UNIT;
    var entry = baseEntry({ noteId: note.id, dateISO: clinical || control || isoDate(note.createdAtISO), unit: unit, ageMonths: note.linkedAgeMonths }, note, null);
    entry.dateSource = clinical ? 'badanie' : control ? 'kontrola' : 'wpis';
    entry.kind = 'exact';
    entry.source = 'gh-note';
    entry.recordedValue = note.igf1.value;
    entry.raw = withUnit(String(note.igf1.value).replace('.', ','), entry.recordedUnit);
    entry.comment = '';
    return entry;
  }
  // Ten sam wynik zapisany i jako wynik badania IGF-1, i w notatce GH (ten sam dzień, wartość i jednostka): raz.
  function sameResult(a, b) {
    return a.dateISO === b.dateISO && a.recordedValue === b.recordedValue
      && normalizeUnit(a.recordedUnit).toLowerCase() === normalizeUnit(b.recordedUnit).toLowerCase();
  }

  function compareEntries(left, right) {
    if (left.dateISO === right.dateISO) return 0;
    if (!left.dateISO) return 1;
    if (!right.dateISO) return -1;
    return left.dateISO < right.dateISO ? -1 : 1;
  }
  function stableSort(list, compare) {
    return list.map(function (item, index) { return { item: item, index: index }; })
      .sort(function (a, b) { return compare(a.item, b.item) || a.index - b.index; })
      .map(function (wrapped) { return wrapped.item; });
  }

  // Jednostka wyświetlania: z formularza przelicznika (unitBy), inaczej jednostka ostatniego wyniku
  // liczbowego serii. Wynik w innej jednostce przelicza konwerter; czego nie umie — „jednostka
  // nierozpoznana”, wartość w oryginale, poza wykresem i różnicą (K9).
  function resolveUnits(series, entries, options) {
    var converter = options.converter, sub = series.sub, precision = sub && sub.precision || 3;
    var numeric = entries.filter(function (entry) { return entry.kind === 'exact' || entry.kind === 'legacy'; });
    // Seria spoza konwertera: wynik bez jednostki porównuje się z innymi tylko wtedy, gdy żaden wynik
    // serii nie ma jednostki; inaczej to „brak jednostki”, a nie nowa jednostka serii.
    var unitsPresent = numeric.some(function (entry) { return !!entry.recordedUnit; });
    numeric.forEach(function (entry) {
      entry.canonicalUnit = sub ? knownUnit(sub, entry.recordedUnit) || (entry.source === 'gh-note' ? knownUnitIgnoreCase(sub, entry.recordedUnit) : null)
        : unitsPresent ? entry.recordedUnit || null : '';
    });
    var requested = options.unitBy && own(options.unitBy, series.key) ? options.unitBy[series.key] : null;
    var display = requested != null ? (sub ? knownUnit(sub, requested) : normalizeUnit(requested)) : null;
    if (display == null) {
      for (var i = numeric.length - 1; i >= 0; i--) {
        if (numeric[i].canonicalUnit != null) { display = numeric[i].canonicalUnit; break; }
      }
    }
    numeric.forEach(function (entry) {
      var value = null;
      if (entry.canonicalUnit != null && display != null) {
        value = sub ? convertValue(converter, series.key, entry.recordedValue, entry.canonicalUnit, display)
          : entry.canonicalUnit === display ? entry.recordedValue : null;
      }
      if (value == null) {
        entry.kind = 'other-unit';
        entry.reason = entry.recordedUnit ? 'unit_unrecognized' : 'unit_missing';
        entry.display = entry.raw;
        return;
      }
      entry.exactValue = value;
      entry.value = roundSignificant(value, precision);
      entry.unit = display || '';
      entry.converted = entry.canonicalUnit !== display;
      entry.display = withUnit(formatNumber(converter, value, precision), entry.unit);
      if (!entry.assessment && !entry.converted) {
        var check = normCheck(entry.norm, entry.recordedValue, entry.recordedUnit, options.parseNorm);
        entry.normAccepted = check.accepted;
        entry.flag = check.flag;
        if (entry.flag) entry.status = { kind: 'norm', tone: 'lab', flag: entry.flag, norm: entry.norm, text: entry.flag === '↑' ? 'powyżej normy z wpisu' : 'poniżej normy z wpisu' };
      }
      // Norma wpisana ręcznie we wpisie (przyjęta przez model) ma pierwszeństwo, jak dotąd.
      if (!entry.assessment && !entry.normAccepted && entry.range) applyRange(entry, options, converter, precision);
    });
    entries.forEach(function (entry) {
      delete entry.canonicalUnit;
      if (!entry.display) entry.display = entry.raw || '—';
    });
    return display || '';
  }

  // Metoda i materiał z koperty oceny; null, gdy nieznane (brak metody, potwierdzenie „unknown”,
  // materiał nieznany lub „inny”). Nieznana metoda nie jest „tą samą metodą”.
  function methodOf(assessment) {
    var input = assessment && assessment.evaluation && assessment.evaluation.input;
    if (!record(input)) return null;
    var assay = record(input.assay) ? input.assay : {}, methodId = text(assay.methodId), specimen = text(input.specimen);
    if (!methodId || assay.confirmation === 'unknown' || !specimen || specimen === 'unknown' || specimen === 'other') return null;
    return { methodId: methodId, specimen: specimen };
  }
  function methodComparison(key, before, after) {
    if (ENVELOPE_ANALYTES.indexOf(key) === -1 || !before || !after) return 'unknown';
    return before.methodId === after.methodId && before.specimen === after.specimen ? 'same' : 'different';
  }
  // Różnica tylko między dwoma kolejnymi wynikami dokładnymi z datą badania, w jednostce
  // wyświetlania: liczba ze znakiem i dni; bez procentu, koloru, progu i oceny kierunku (6.10).
  function deltaBetween(previous, current, series, options) {
    if (!previous || !current) return null;
    if (previous.dateISO === current.dateISO) return { available: false, reason: 'same_day', text: '' };
    if (previous.kind !== 'exact' || current.kind !== 'exact') return { available: false, reason: 'not_comparable', text: '' };
    var method = methodComparison(series.key, methodOf(previous.assessment), methodOf(current.assessment));
    if (method === 'different') return { available: false, reason: 'method_mismatch', text: formatDelta({ available: false, reason: 'method_mismatch' }) };
    var precision = series.sub && series.sub.precision || 3;
    var value = roundSignificant(current.value - previous.value, precision);
    if (Math.abs(value) < 1e-12) value = 0;
    var delta = { available: true, value: value, unit: current.unit, days: daysBetween(previous.dateISO, current.dateISO), methodChecked: method === 'same', precision: precision };
    delta.text = formatDelta(delta, options.converter);
    return delta;
  }
  function formatDelta(delta, converter) {
    if (!delta) return '';
    if (!delta.available) return delta.reason === 'method_mismatch' ? '— · różne metody oznaczenia' : '';
    var sign = delta.value > 0 ? '+' : delta.value < 0 ? '−' : '';
    var out = withUnit(sign + formatNumber(converter, Math.abs(delta.value), delta.precision || 3), delta.unit || '');
    if (finite(delta.days)) out += ' · po ' + delta.days + ' ' + (delta.days === 1 ? 'dniu' : 'dniach');
    return out;
  }

  function chartFor(entries, unit) {
    var points = [], skippedByReason = {}, gaps = [];
    entries.forEach(function (entry) {
      var reason = CHART_KINDS.indexOf(entry.kind) === -1 ? entry.kind : !sampleDated(entry) ? 'no_sample_date' : null;
      if (reason) {
        skippedByReason[reason] = (skippedByReason[reason] || 0) + 1;
        // Wynik z datą badania poza wykresem (np. „<0,02”): renderer może zaznaczyć przerwę zamiast
        // prowadzić linię przez dzień, w którym wynik nie był liczbą.
        if (sampleDated(entry) && entry.dateISO) gaps.push({ dateISO: entry.dateISO, kind: entry.kind, noteId: entry.noteId });
        return;
      }
      // Kształt wyjścia yi() dla rendera Nl: oś daty badania (ageMonths: null), punkt przeliczony
      // bez normy (decyzja 6.2). Norma tylko wtedy, gdy model przyjął ją jako jeden zakres
      // w jednostce wyniku — inaczej mi() z luźnym Dl dałoby strzałkę, której model nie uznał.
      // v bez zaokrąglenia: mi() porówna z normą tę samą wartość, z której model liczył strzałkę.
      var point = { noteId: entry.noteId, dateISO: entry.dateISO, ageMonths: null, v: entry.exactValue, norm: entry.normAccepted ? entry.norm : null };
      if (entry.converted) point.conv = true;
      if (entry.assessment) point.assessment = entry.assessment;
      points.push(point);
    });
    var skipped = Object.keys(skippedByReason).reduce(function (sum, key) { return sum + skippedByReason[key]; }, 0);
    return { unit: unit, points: points, skipped: skipped, skippedByReason: skippedByReason, gaps: gaps };
  }

  function buildSeries(series, options) {
    // Chronologicznie przed wyborem jednostki: „ostatni wynik” to ostatni po dacie, nie w kolejności sejfu.
    var entries = stableSort(series.entries, compareEntries);
    var unit = resolveUnits(series, entries, options);
    var dated = entries.filter(sampleDated);
    for (var i = 1; i < dated.length; i++) dated[i].delta = deltaBetween(dated[i - 1], dated[i], series, options);
    var last = dated.length ? dated[dated.length - 1] : null;
    var computed = dated.filter(function (entry) { return entry.delta && entry.delta.available; });
    // Poprzedni wynik: ostatni z wcześniejszą datą badania (nie wynik z tego samego dnia co ostatni).
    var earlier = last ? dated.filter(function (entry) { return entry.dateISO < last.dateISO; }) : [];
    var view = {
      key: series.key, testKey: series.sub ? series.key : null, label: series.label, test: series.label, unit: unit,
      entries: entries, last: last, previous: earlier.length ? earlier[earlier.length - 1] : null,
      lastDateEntries: last ? dated.filter(function (entry) { return entry.dateISO === last.dateISO; }) : [],
      delta: last ? last.delta : null, chart: chartFor(entries, unit), pending: [],
      // Decyzja 6.14: wpisy z innej serii sejfu dołączone po dokładnej nazwie badania z listy przelicznika.
      mergedFrom: Object.keys(series.mergedFrom).map(function (key) { return series.mergedFrom[key]; }),
      // Stopka dla różnic bez potwierdzonej zgodności metody (K10).
      methodFootnote: computed.some(function (entry) { return !entry.delta.methodChecked; })
    };
    if (finite(options.nowDay) && last && last.dateISO) view.daysSinceLast = options.nowDay - dayNumber(last.dateISO);
    return view;
  }

  function pendingMatch(note, labels) {
    var lab = record(note.labResult) ? note.labResult : null;
    if (lab && text(lab.testKey)) return text(lab.testKey);
    var title = text(note.title);
    if (title.indexOf('Wynik: ') !== 0) return null;
    var wanted = title.slice('Wynik: '.length).trim();
    var matches = labels.filter(function (item) { return item.label === wanted; });
    return matches.length === 1 ? matches[0].id : null;
  }
  // Oczekujący wynik = zlecenie z Terminarza (termin albo liczba dni do kontroli), bez wartości,
  // niezakończone i bez niestawienia. Notatka „Badanie” bez wartości i bez terminu to opis, nie zlecenie.
  function isPending(note) {
    var lab = record(note.labResult) ? note.labResult : null;
    var ordered = !!isoDate(note.dueDateISO) || finite(note.recheckDays);
    return ordered && (!lab || !text(lab.value) && !finite(lab.valueNum)) && !note.completedAtISO && !note.noShowAtISO;
  }

  function previewView(current, seriesView, options) {
    if (!record(current)) return null;
    var key = text(current.testKey) || null, converter = options.converter, sub = substance(converter, key);
    var preview = { kind: 'preview', testKey: key, raw: rawText(current), value: null, unit: '', display: '', delta: null };
    var target = seriesView ? seriesView.unit : null;
    var from = sub ? knownUnit(sub, current.unit) : normalizeUnit(current.unit);
    if (finite(current.valueNum) && from != null) {
      var to = target || from, value = sub ? convertValue(converter, key, current.valueNum, from, to) : from === to ? current.valueNum : null;
      if (value != null) {
        var precision = sub && sub.precision || 3;
        preview.value = roundSignificant(value, precision);
        preview.unit = to;
        preview.display = withUnit(formatNumber(converter, value, precision), to);
        var last = seriesView && seriesView.last;
        // Bieżący wynik nie ma daty próbki (data pada w oknie przypięcia), więc bez liczby dni (K8).
        if (last && last.kind === 'exact' && last.unit === to) {
          var method = methodComparison(key, methodOf(last.assessment), methodOf(record(current.assessment) ? current.assessment : null));
          if (method === 'different') preview.delta = { available: false, reason: 'method_mismatch', text: formatDelta({ available: false, reason: 'method_mismatch' }) };
          else {
            var delta = { available: true, value: roundSignificant(preview.value - last.value, precision), unit: to, days: null, methodChecked: method === 'same', precision: precision };
            if (Math.abs(delta.value) < 1e-12) delta.value = 0;
            delta.text = formatDelta(delta, converter);
            preview.delta = delta;
          }
        }
      }
    }
    if (!preview.display) preview.display = preview.raw || '—';
    return preview;
  }

  /**
   * @param {Array} seriesList wynik VildaVault.listPatientLabSeries(patientId)
   * @param {Object} options {converter, notesById, treatment, categoryFilter, panels, unitBy,
   *   current, parseNorm, nowISO, ghIgf1, rangeSnapshot}; ghIgf1: false wyłącza IGF-1 z notatek leczenia GH.
   *   rangeSnapshot: VildaLabRangeSnapshot (domyślnie globalny); bez niego zapisany zakres nie daje oceny.
   *   nowISO rozstrzyga też, czy termin kontroli GH już minął (bez niego IGF-1 z GH ma datę wpisu).
   */
  function buildHistoryView(seriesList, options) {
    options = Object.assign({ categoryFilter: ['wynik-badania'], panels: HISTORY_PANELS }, options || {});
    // Bez notatek nie da się ustalić kategorii, daty badania ani komentarza — błąd wołającego, nie pusty widok.
    if (!record(options.notesById)) throw new TypeError('VildaLabHistory.buildHistoryView: wymagane notesById (listPatientNotesForPatient).');
    var converter = options.converter, notesById = options.notesById, missingNotes = 0;
    var filter = Array.isArray(options.categoryFilter) ? options.categoryFilter : ['wynik-badania'];
    var nowISO = isoDate(options.nowISO);
    var ctx = Object.assign({}, options, { nowDay: nowISO ? dayNumber(nowISO) : null });
    var accepted = function (note) { return !!note && filter.indexOf(noteCategory(note)) !== -1; };
    var byKey = {}, order = [], seen = {};
    function seriesFor(key, test) {
      if (!own(byKey, key)) {
        var sub = substance(converter, key);
        byKey[key] = { key: key, sub: sub, label: sub ? text(sub.label_pl) || key : text(test) || key, entries: [], mergedFrom: {} };
        order.push(key);
      }
      return byKey[key];
    }
    function noteMerge(series, fromKey, test) {
      if (!own(series.mergedFrom, fromKey)) series.mergedFrom[fromKey] = { key: fromKey, test: text(test), count: 0 };
      series.mergedFrom[fromKey].count++;
    }
    var labels = [];
    if (converter && typeof converter.list === 'function') {
      try { labels = (converter.list() || []).map(function (item) { return { id: item.id, label: text(item.label) }; }); } catch (_) { labels = []; }
    }
    // Decyzja 6.14: wpis bez klucza przelicznika (sejf dał mu skrót nazwy) z nazwą równą dokładnie etykiecie
    // badania z listy przelicznika dołącza przy odczycie do serii tego badania — tylko z jednostką, którą
    // przelicznik zna dla tego badania (inaczej zostaje w dawnej serii, żeby nie zniknął z wykresu).
    function aliasKey(key, note, entry) {
      if (substance(converter, key) || (entry.kind !== 'exact' && entry.kind !== 'legacy')) return null;
      var id = labelKey(note.labResult && note.labResult.test, labels), sub = id && id !== key ? substance(converter, id) : null;
      return sub && knownUnit(sub, entry.recordedUnit) ? id : null;
    }
    (Array.isArray(seriesList) ? seriesList : []).forEach(function (raw) {
      if (!record(raw) || !text(raw.testKey)) return;
      (Array.isArray(raw.points) ? raw.points : []).forEach(function (point) {
        if (!record(point)) return;
        var note = point.noteId && own(notesById, point.noteId) ? notesById[point.noteId] : null;
        if (point.noteId) seen[point.noteId] = true;
        // Punkt bez notatki (odczyt z innej chwili niż notatki) nie znika po cichu: liczy się w podsumowaniu.
        if (!note) { missingNotes++; return; }
        if (!accepted(note)) return;
        var entry = entryFromPoint(point, note);
        if (!entry) return;
        var key = text(raw.testKey), alias = aliasKey(key, note, entry);
        var series = seriesFor(alias || key, raw.test);
        if (alias) { entry.mergedFrom = key; noteMerge(series, key, note.labResult.test); }
        series.entries.push(entry);
      });
    });
    var pending = [], gh = [];
    Object.keys(notesById).forEach(function (id) {
      var note = notesById[id];
      if (!record(note)) return;
      if (options.ghIgf1 !== false && ghIgf1(note)) gh.push(ghEntry(Object.assign({ id: id }, note), nowISO));
      if (seen[note.id || id] || !accepted(note)) return;
      var lab = record(note.labResult) ? note.labResult : null;
      if (lab && text(lab.value) && !finite(lab.valueNum) && !own(lab, 'assessment')) {
        var byLabel = !text(lab.testKey) && labelKey(lab.test, labels), slug = seriesSlug(lab.test);
        var key = text(lab.testKey) || byLabel || slug;
        if (!key) return;
        var series = seriesFor(key, lab.test), entry = textEntry(Object.assign({ id: id }, note), nowISO);
        // Ten sam dobór klucza co od PR1; sejf trzymałby ten wpis pod skrótem nazwy.
        if (byLabel && slug && slug !== byLabel) { entry.mergedFrom = slug; noteMerge(series, slug, lab.test); }
        series.entries.push(entry);
        return;
      }
      if (isPending(note)) {
        pending.push({ kind: 'pending', noteId: note.id || id, title: text(note.title), dueDateISO: isoDate(note.dueDateISO), seriesKey: pendingMatch(note, labels) });
      }
    });
    var ghDuplicates = 0;
    gh.forEach(function (entry) {
      var series = seriesFor(GH_IGF1_SERIES, null);
      if (series.entries.some(function (other) { return other.source !== 'gh-note' && sameResult(other, entry); })) { ghDuplicates++; return; }
      series.entries.push(entry);
    });
    pending = stableSort(pending, function (a, b) { return a.dueDateISO === b.dueDateISO ? 0 : !a.dueDateISO ? 1 : !b.dueDateISO ? -1 : a.dueDateISO < b.dueDateISO ? -1 : 1; });

    var views = order.map(function (key) { return buildSeries(byKey[key], ctx); });
    var viewByKey = {};
    views.forEach(function (view) { viewByKey[view.key] = view; });
    pending.forEach(function (item) { if (item.seriesKey && own(viewByKey, item.seriesKey)) viewByKey[item.seriesKey].pending.push(item); });

    var treatmentRows = [];
    (Array.isArray(options.treatment) ? options.treatment : []).forEach(function (drug) {
      (record(drug) && Array.isArray(drug.events) ? drug.events : []).forEach(function (event) {
        if (!record(event) || !isoDate(event.dateISO)) return;
        treatmentRows.push({ dateISO: isoDate(event.dateISO), drugKey: drug.drugKey || null, drug: text(drug.drug) || drug.drugKey || '', action: event.action || null, dose: text(event.dose) || null, noteId: event.noteId || null });
      });
    });
    treatmentRows = stableSort(treatmentRows, function (a, b) { return a.dateISO === b.dateISO ? 0 : a.dateISO < b.dateISO ? 1 : -1; });

    var panels = (Array.isArray(options.panels) ? options.panels : HISTORY_PANELS).map(function (panel) {
      return { id: panel.id, label: panel.label, series: (panel.analytes || []).filter(function (id) { return own(viewByKey, id); }).map(function (id) { return viewByKey[id]; }) };
    });
    var placed = {};
    panels.forEach(function (panel) { panel.series.forEach(function (view) { placed[view.key] = true; }); });
    var others = views.filter(function (view) { return !placed[view.key]; })
      .sort(function (a, b) { return a.label.localeCompare(b.label, 'pl'); });
    panels.push({ id: OTHER_PANEL.id, label: OTHER_PANEL.label, series: others });
    panels = panels.filter(function (panel) { return panel.series.some(function (view) { return view.entries.length; }); });
    panels.forEach(function (panel) {
      panel.series = panel.series.filter(function (view) { return view.entries.length; });
      panel.rows = rowsFor(panel.series);
      panel.treatmentRows = treatmentRows;
    });

    var resultCount = 0, lastDateISO = null;
    views.forEach(function (view) {
      resultCount += view.entries.length;
      if (view.last && view.last.dateISO && (!lastDateISO || view.last.dateISO > lastDateISO)) lastDateISO = view.last.dateISO;
    });
    var currentKey = record(options.current) ? text(options.current.testKey) : '';
    return {
      summary: { results: resultCount, analytes: views.filter(function (view) { return view.entries.length; }).length, lastDateISO: lastDateISO, pending: pending.length, missingNotes: missingNotes },
      panels: panels, pending: pending, treatment: treatmentRows,
      ghIgf1: { shown: gh.length - ghDuplicates, duplicates: ghDuplicates },
      preview: previewView(options.current, currentKey && own(viewByKey, currentKey) ? viewByKey[currentKey] : null, ctx)
    };
  }

  // Tabela panelu: wiersze = daty malejąco (data badania lub kontroli GH przed datą wpisu tego samego dnia),
  // komórki = wpisy badań z tego dnia; dwa wyniki jednego badania tego dnia stoją razem.
  function rowsFor(seriesViews) {
    var rows = {}, keys = [];
    seriesViews.forEach(function (view) {
      view.entries.forEach(function (entry) {
        var rowKey = (entry.dateISO || '') + '|' + entry.dateSource;
        if (!own(rows, rowKey)) { rows[rowKey] = { dateISO: entry.dateISO, dateSource: entry.dateSource, cells: {} }; keys.push(rowKey); }
        (rows[rowKey].cells[view.key] = rows[rowKey].cells[view.key] || []).push(entry);
      });
    });
    return stableSort(keys.map(function (key) { return rows[key]; }), function (a, b) {
      if (a.dateISO !== b.dateISO) return !a.dateISO ? 1 : !b.dateISO ? -1 : a.dateISO < b.dateISO ? 1 : -1;
      var left = SAMPLE_DATES.indexOf(a.dateSource), right = SAMPLE_DATES.indexOf(b.dateSource);
      return (left === -1 ? SAMPLE_DATES.length : left) - (right === -1 ? SAMPLE_DATES.length : right);
    });
  }

  return Object.freeze({
    version: '1.3.0', HISTORY_PANELS: HISTORY_PANELS, buildHistoryView: buildHistoryView,
    formatDelta: formatDelta, formatDate: formatDate, normalizeUnit: normalizeUnit
  });
});
