/* Compact, read-only presentation of recorded laboratory results.
 * Bounds and categories come only from the entry or its immutable snapshots.
 * No reference selection, reassessment, patient context, clock or persistence.
 * eligible means bounds can share the displayed result axis; conditional
 * references remain neutral even when their numeric bounds are drawable.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaLabResultPresentation = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';
  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function unit(value) { return text(value).replace(/\u00b5/g, '\u03bc').replace(/\s+/g, ' '); }
  function tone(value) {
    return value === 'within' ? 'within' : ['below', 'far_below'].indexOf(value) !== -1 ? 'below'
      : ['above', 'far_above'].indexOf(value) !== -1 ? 'above' : 'neutral';
  }
  function number(value, converter) {
    if (converter && typeof converter.formatNumber === 'function') {
      try { return converter.formatNumber(value, 4); } catch (_) { /* plain saved number */ }
    }
    return String(value).replace('.', ',');
  }
  function limitsText(low, high, lowOperator, highOperator, shownUnit, converter) {
    var result;
    if (finite(low) && finite(high) && lowOperator === '>=' && highOperator === '<=') {
      result = number(low, converter) + '–' + number(high, converter);
    } else {
      var operators = { '>=': '≥', '<=': '≤', '>': '>', '<': '<' };
      var parts = [];
      if (finite(low)) parts.push((operators[lowOperator] || '≥') + number(low, converter));
      if (finite(high)) parts.push((operators[highOperator] || '≤') + number(high, converter));
      result = parts.join(' i ');
    }
    return result + (result && shownUnit ? '\u00a0' + shownUnit : '');
  }
  function convert(value, from, target, key, converter) {
    if (value === null) return null;
    if (!finite(value) || !unit(from) || !unit(target)) return undefined;
    if (unit(from) === unit(target)) return value;
    if (!key || !converter || typeof converter.find !== 'function' || typeof converter.convertAll !== 'function') return undefined;
    try {
      var substance = converter.find(key);
      if (!substance || !Array.isArray(substance.units)) return undefined;
      var source = substance.units.filter(function (item) { return item && unit(item.symbol) === unit(from); });
      var destination = substance.units.filter(function (item) { return item && unit(item.symbol) === unit(target); });
      if (source.length !== 1 || destination.length !== 1) return undefined;
      var result = converter.convertAll({ substanceId: key, value: value, fromUnit: source[0].symbol });
      if (!result || !result.ok || !Array.isArray(result.results)) return undefined;
      var matches = result.results.filter(function (item) { return item && unit(item.unit) === unit(target) && finite(item.value); });
      return matches.length === 1 ? matches[0].value : undefined;
    } catch (_) { return undefined; }
  }
  function norm(options, settings) {
    var low = settings.low, high = settings.high, converter = options.converter;
    if (low !== null && !finite(low) || high !== null && !finite(high) || low === null && high === null ||
        finite(low) && finite(high) && low > high) return null;
    var originalUnit = text(settings.unit), target = text(settings.target);
    var convertedLow = convert(low, originalUnit, target, settings.key, converter);
    var convertedHigh = convert(high, originalUnit, target, settings.key, converter);
    var eligible = convertedLow !== undefined && convertedHigh !== undefined;
    var shownLow = eligible ? convertedLow : low, shownHigh = eligible ? convertedHigh : high;
    var shownUnit = eligible ? target : originalUnit;
    return {
      text: limitsText(shownLow, shownHigh, settings.lowOperator || '>=', settings.highOperator || '<=', shownUnit, converter),
      low: eligible ? convertedLow : null, high: eligible ? convertedHigh : null, unit: shownUnit,
      label: text(settings.label), conditional: !!settings.conditional, eligible: eligible,
      tone: eligible && !settings.conditional ? tone(settings.tone) : 'neutral'
    };
  }
  function dependency(options, name, globalName) { return options[name] || root && root[globalName] || null; }
  function exactValue(entry) {
    if (['exact', 'legacy'].indexOf(entry.kind) === -1) return null;
    return finite(entry.exactValue) ? entry.exactValue : finite(entry.value) ? entry.value : null;
  }
  function rawComparison(evaluation, comparison) {
    if (comparison.key === 'prepubertal') {
      var reference = evaluation.prepubertalLh;
      return reference && Object.assign({}, reference.comparison, { range: reference.range });
    }
    var preview = evaluation.referencePreview;
    if (comparison.key === 'variant') {
      var variants = preview && Array.isArray(preview.variants) ? preview.variants : [];
      var matching = variants.filter(function (variant) { return variant.id === comparison.variantId; });
      return matching.length === 1 ? matching[0].comparison : null;
    }
    var key = { age: 'byAge', stage: 'byStage', local: 'local' }[comparison.key];
    if (!key) return null;
    var biochemical = evaluation.biochemical || {};
    var fromPreview = comparison.conditional && comparison.key !== 'local' && preview;
    return fromPreview ? preview[key] : biochemical[key];
  }
  function assessmentNorms(entry, options, result) {
    var snapshot = dependency(options, 'snapshot', 'VildaLabSnapshot');
    var assessmentUI = dependency(options, 'assessmentUI', 'VildaLabAssessmentUI');
    if (!snapshot || typeof snapshot.normalize !== 'function' || !assessmentUI || typeof assessmentUI.buildView !== 'function') return;
    var saved, view;
    try {
      saved = snapshot.normalize(entry.assessment);
      if (!saved || saved.status !== 'recorded') {
        result.warning = saved && saved.status === 'invalidated' ? 'Ocena nieaktualna' : 'Brak zapisanej oceny';
        result.warningKind = saved && saved.status === 'invalidated' ? 'invalidated' : 'unavailable';
        return;
      }
      view = assessmentUI.buildView(saved.evaluation);
    } catch (_) { return; }
    if (!view || !view.valid || !Array.isArray(view.comparisons)) return;
    var evaluation = saved.evaluation;
    // A numeric comparison can be within its recorded interval while the saved
    // clinical assessment warns, e.g. an early pubertal stage. Never turn that
    // combined record into a reassuring green result or green reference band.
    var clinicalWarning = view.clinical && view.clinical.status === 'warning';
    if (clinicalWarning) { result.warning = text(view.clinical.title) || 'Zapisana ocena wymaga uwagi'; result.warningKind = 'clinical'; }
    var candidates = view.comparisons.filter(function (comparison) { return comparison && comparison.status !== 'unavailable'; });
    var primary = candidates.filter(function (comparison) { return comparison.primary; });
    if (primary.length === 1) candidates = primary;
    candidates.forEach(function (comparison) {
      var raw = rawComparison(evaluation, comparison), range = raw && raw.range, bounds = range && range.bounds;
      if (!bounds) return;
      var low = bounds.lower && finite(bounds.lower.value) ? bounds.lower.value : null;
      var high = bounds.upper && finite(bounds.upper.value) ? bounds.upper.value : null;
      var conditional = comparison.conditional || !!bounds.censoredLower || comparison.key === 'prepubertal' || candidates.length > 1;
      var item = norm(options, { low: low, high: high, lowOperator: bounds.lower && bounds.lower.operator,
        highOperator: bounds.upper && bounds.upper.operator, unit: range.unit, target: result.unit,
        key: evaluation.analyte, label: comparison.shortTitle || comparison.title, conditional: conditional,
        tone: comparison.status });
      if (item) result.norms.push(item);
    });
    // A reported range is a separate saved input, never a reconstructed catalog
    // range. Keep it separate if source-reference alternatives are also present.
    var reported = evaluation.reportedRange;
    if (reported && reported.status !== 'unavailable' && (reported.lower || reported.upper)) {
      var item = norm(options, { low: reported.lower ? reported.lower.value : null,
        high: reported.upper ? reported.upper.value : null, lowOperator: reported.lower && reported.lower.operator,
        highOperator: reported.upper && reported.upper.operator, unit: reported.unit, target: result.unit,
        key: evaluation.analyte, label: 'Zakres z wpisu', tone: reported.status, conditional: result.norms.length > 0 });
      if (item) result.norms.push(item);
    }
    if (result.norms.length > 1) result.norms.forEach(function (item) { item.tone = 'neutral'; item.conditional = true; });
    if (clinicalWarning) result.norms.forEach(function (item) { item.tone = 'neutral'; });
  }
  function rangeNorm(entry, options, result) {
    var helper = dependency(options, 'rangeSnapshot', 'VildaLabRangeSnapshot');
    if (!helper || typeof helper.normalize !== 'function' || typeof helper.describe !== 'function') return;
    var saved, info;
    try { saved = helper.normalize(entry.range); info = helper.describe(saved); } catch (_) { return; }
    if (!saved || !info) return;
    if (info.status !== 'recorded' && info.status !== 'general') {
      result.warning = info.status === 'invalidated' ? 'Zakres nieaktualny' : '';
      result.warningKind = info.status === 'invalidated' ? 'invalidated' : '';
      return;
    }
    var display = saved.display;
    if (!display) return;
    var item = norm(options, { low: display.low, high: display.high, unit: display.unit, target: result.unit,
      key: saved.analyte, label: info.population, conditional: info.status === 'general', tone: info.classification });
    if (item) result.norms.push(item);
    if (info.status === 'general') { result.warning = 'Zakres ogólny'; result.warningKind = 'reference'; }
  }
  function manualNorm(entry, options, result) {
    if (!entry.normAccepted || entry.converted || typeof options.parseNorm !== 'function') return;
    var match = /^\s*\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?\s*(.*?)\s*$/.exec(text(entry.norm));
    if (!match || match[1] && unit(match[1]) !== unit(entry.recordedUnit || entry.unit)) return;
    var bounds;
    try { bounds = options.parseNorm(entry.norm); } catch (_) { return; }
    if (!bounds || !finite(bounds.lo) || !finite(bounds.hi)) return;
    var item = norm(options, { low: bounds.lo, high: bounds.hi, unit: entry.recordedUnit || entry.unit, target: result.unit,
      label: 'Zakres z wpisu', tone: entry.flag === '↑' ? 'above' : entry.flag === '↓' ? 'below' : 'within' });
    if (item) result.norms.push(item);
  }
  function describe(entry, options) {
    entry = record(entry) ? entry : {};
    if (record(entry.clcrRecord)) return describeClcr(entry.clcrRecord);
    options = options || {};
    var result = { value: exactValue(entry), unit: text(entry.unit || entry.recordedUnit), norms: [],
      tone: 'neutral', symbol: '', normText: '—', warning: '', warningKind: '' };
    if (record(entry.assessment)) assessmentNorms(entry, options, result);
    else if (entry.normAccepted) manualNorm(entry, options, result);
    else if (record(entry.range)) rangeNorm(entry, options, result);
    if (result.norms.length) {
      result.normText = result.norms.map(function (item) { return (result.norms.length > 1 && item.label ? item.label + ': ' : '') + item.text; }).join(' · ');
      if (result.value !== null && result.norms.length === 1) result.tone = result.norms[0].tone;
      if (!result.warning && result.norms.some(function (item) { return item.conditional; })) {
        result.warning = result.norms.length > 1 ? 'Różne zakresy odniesienia' : 'Odniesienie orientacyjne';
        result.warningKind = 'reference';
      }
    }
    if (result.value === null) result.norms.forEach(function (item) { item.tone = 'neutral'; });
    result.symbol = result.tone === 'above' ? '↑' : result.tone === 'below' ? '↓' : '';
    return result;
  }
  // ClcrSavedResults owns validation and decoding. This adapter receives its
  // projected records, not raw notes, and never parses a new norm or evaluates
  // a formula. In particular a criterion/sign/context warning is not a numeric
  // laboratory range and must not turn into a green band or an up/down arrow.
  function clcrValue(saved) {
    // The projection has already decoded the exact recorded number. A legacy
    // or unreadable assessment does not erase that number; it only stays neutral.
    return saved.status !== 'invalidated' && !text(saved.comparator) && ['exact', 'legacy'].indexOf(saved.kind) !== -1
      && finite(saved.valueNum) ? saved.valueNum : null;
  }
  function describeClcr(saved) {
    saved = record(saved) ? saved : {};
    var result = { value: clcrValue(saved), unit: text(saved.unit), norms: [], tone: 'neutral', symbol: '',
      normText: '—', warning: '', warningKind: '' };
    if (saved.status === 'invalidated' || saved.status === 'unavailable') {
      result.warning = saved.status === 'invalidated' ? 'Ocena nieaktualna po zmianie zapisu' : 'Zapisana ocena niedostępna';
      result.warningKind = saved.status;
      return result;
    }
    var reference = record(saved.reference) ? saved.reference : null;
    var criterion = reference && reference.kind === 'recorded-criterion';
    var bounds = reference && record(reference.bounds) ? reference.bounds : null;
    var normText = text(saved.norm) || text(reference && reference.text);
    var numericAssessment = ['within', 'above', 'below'].indexOf(saved.assessment) !== -1;
    var numericTone = tone(saved.assessment);
    var clinicalWarning = ['warning', 'danger'].indexOf(saved.tone) !== -1
      && (!numericAssessment || saved.assessment === 'within' || criterion);
    if (saved.status === 'recorded' && normText && !criterion) {
      var low = bounds && finite(bounds.low) ? bounds.low : null;
      var high = bounds && finite(bounds.high) ? bounds.high : null;
      var compatible = !text(reference && reference.unit) || unit(reference.unit) === unit(result.unit);
      var eligible = !!result.unit && compatible && (low !== null || high !== null) && !(low !== null && high !== null && low > high);
      // Text and all operators stay exactly as the record owner projected them.
      // Bounds are solely display coordinates in the record's native unit.
      // A saved direction remains authoritative even if its displayed norm is
      // approximate and therefore intentionally has no exact plot coordinates.
      var itemTone = result.value !== null && !!result.unit && compatible && numericAssessment && !clinicalWarning
        && (numericTone !== 'within' || saved.tone === 'success' || saved.tone === 'normal') ? numericTone : 'neutral';
      result.norms.push({ text: normText, low: eligible ? low : null, high: eligible ? high : null, unit: result.unit,
        label: '', conditional: !numericAssessment, eligible: eligible, tone: itemTone });
      result.normText = normText;
      result.tone = itemTone;
    }
    if (clinicalWarning) {
      result.warning = text(saved.interpretation) || text(saved.description) || 'Zapisana ocena wymaga uwagi';
      result.warningKind = 'clinical';
    } else if (criterion) {
      result.warning = 'Zapisane kryterium odniesienia' + (normText ? ': ' + normText : '');
      result.warningKind = 'reference';
    } else if (saved.status === 'recorded' && saved.sourceFormulaId === 'Ox_mgkg'
      && ['Ox_total24', 'clcr:Ox_total24'].indexOf(saved.parameterKey) !== -1
      && saved.assessment === 'unassessed' && saved.tone === 'neutral' && text(saved.interpretation)) {
      // The frozen Ox result already explains why its reference is limited.
      // Keep that explanation neutral; never infer it from today's patient.
      result.warning = text(saved.interpretation);
      result.warningKind = 'reference';
    }
    result.symbol = result.tone === 'above' ? '↑' : result.tone === 'below' ? '↓' : '';
    return result;
  }
  var numericToken = '[+−-]?(?:\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:[eE][+-]?\\d+)?';
  var numericDisplay = new RegExp('^(?:[<>≤≥]=?|≈)?\\s*' + numericToken + '(?:\\s*[–−-]\\s*' + numericToken + ')?$');
  function clcrDisplay(saved) {
    var shown = text(saved.displayValue) || text(saved.rawText)
      || (finite(saved.valueNum) ? Object.is(saved.valueNum, -0) ? '-0' : String(saved.valueNum) : '—');
    var suffix = text(saved.unit);
    if (suffix && (shown.slice(-suffix.length - 1) === ' ' + suffix || shown.slice(-suffix.length - 1) === '\u00a0' + suffix)) shown = shown.slice(0, -suffix.length - 1);
    return numericDisplay.test(shown) ? shown.replace(/\./g, ',') : shown;
  }
  function sampleDate(value) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
    if (!parts) return '';
    var date = new Date(value + 'T12:00:00Z');
    return finite(date.getTime()) && date.getUTCFullYear() === Number(parts[1]) && date.getUTCMonth() + 1 === Number(parts[2])
      && date.getUTCDate() === Number(parts[3]) ? value : '';
  }
  function clcrBasis(saved) {
    if (text(saved.basisLabel)) return text(saved.basisLabel);
    var basis = text(saved.basis);
    if (basis === 'oxalate-amount') return 'Ilość molowa szczawianów';
    if (basis === 'oxalate-ion') return 'Jon szczawianowy';
    if (basis === 'oxalic-acid') return 'Kwas szczawiowy bezwodny';
    if (basis === 'unknown' || basis === 'legacy-unknown') return 'Postać masowa niepodana w zapisie';
    if (basis === 'ion') return saved.sourceFormulaId === 'OxCr_spot' ? 'Jon szczawianowy'
      : saved.sourceFormulaId === 'CitCr_spot' ? 'Jon cytrynianowy' : 'Postać jonowa — zgodnie z zapisem';
    if (basis === 'acid') return saved.sourceFormulaId === 'OxCr_spot' ? 'Kwas szczawiowy bezwodny'
      : saved.sourceFormulaId === 'CitCr_spot' ? 'Kwas cytrynowy bezwodny' : 'Postać kwasowa — zgodnie z zapisem';
    return basis;
  }
  function clcrSeries(projection) {
    var groups = [], byKey = Object.create(null), seen = Object.create(null);
    var measurements = projection && Array.isArray(projection.measurements) ? projection.measurements : [];
    measurements.forEach(function (saved) {
      if (!record(saved) || !text(saved.noteId) || seen[saved.noteId]) return;
      seen[saved.noteId] = true;
      var reference = record(saved.reference) ? saved.reference : {};
      var key = 'clcr:' + (text(saved.seriesKey) || JSON.stringify([saved.parameterKey, saved.label, saved.method,
        saved.unit, saved.basis, reference.profileId, reference.profileVersion]));
      if (!byKey[key]) {
        var label = text(saved.displayLabel) || text(saved.label) || 'Zapisane obliczenie';
        byKey[key] = { key: key, testKey: null, label: label, test: label, unit: text(saved.unit),
          method: text(saved.method), basis: text(saved.basis), basisLabel: clcrBasis(saved),
          parameterKey: saved.parameterKey || null, sourceFormulaId: saved.sourceFormulaId || null,
          clcr: true, entries: [], pending: [], mergedFrom: [], methodFootnote: false };
        groups.push(byKey[key]);
      }
      var value = clcrValue(saved), display = clcrDisplay(saved), date = sampleDate(saved.dateISO);
      byKey[key].entries.push({ clcrRecord: saved, noteId: saved.noteId, dateISO: date || null,
        dateSource: date ? 'badanie' : 'unknown', kind: saved.status === 'invalidated' ? 'invalidated'
          : saved.status === 'unavailable' ? 'unavailable' : text(saved.comparator) || saved.kind === 'censored' ? 'censored'
            : !finite(saved.valueNum) || saved.kind === 'text' ? 'text' : saved.status === 'recorded' ? 'exact' : 'legacy',
        recordedValue: finite(saved.valueNum) ? saved.valueNum : null, recordedUnit: text(saved.unit),
        exactValue: value, value: value, unit: text(saved.unit), raw: display + (text(saved.unit) ? '\u00a0' + saved.unit : ''),
        display: display + (text(saved.unit) ? '\u00a0' + saved.unit : ''), converted: false, status: null,
        comment: text(saved.comment), delta: null });
    });
    groups.forEach(function (group) {
      // ES2019 stable sort preserves the projection's order for same-day entries.
      group.entries.sort(function (a, b) { return a.dateISO === b.dateISO ? 0 : !a.dateISO ? 1 : !b.dateISO ? -1 : a.dateISO < b.dateISO ? -1 : 1; });
      var dated = group.entries.filter(function (entry) { return !!entry.dateISO; });
      group.last = dated.length ? dated[dated.length - 1] : null;
      var earlier = group.last ? dated.filter(function (entry) { return entry.dateISO < group.last.dateISO; }) : [];
      group.previous = earlier.length ? earlier[earlier.length - 1] : null;
      group.lastDateEntries = group.last ? dated.filter(function (entry) { return entry.dateISO === group.last.dateISO; }) : [];
      group.chart = { unit: group.unit, points: [], gaps: [], skipped: 0, skippedByReason: {} };
      group.entries.forEach(function (entry) {
        var reason = entry.kind === 'invalidated' ? 'invalidated' : entry.kind === 'censored' ? 'censored'
          : entry.kind === 'text' ? 'text' : !finite(entry.exactValue) ? 'unavailable' : !entry.dateISO ? 'no_sample_date' : null;
        if (!reason && finite(entry.exactValue)) group.chart.points.push({ noteId: entry.noteId, dateISO: entry.dateISO, ageMonths: null, v: entry.exactValue, norm: null });
        else {
          reason = reason || 'text';
          group.chart.skipped++;
          group.chart.skippedByReason[reason] = (group.chart.skippedByReason[reason] || 0) + 1;
          if (entry.dateISO) group.chart.gaps.push({ dateISO: entry.dateISO, noteId: entry.noteId, kind: reason });
        }
      });
    });
    return groups;
  }
  return Object.freeze({ version: '1.1.0', describe: describe, describeClcr: describeClcr, clcrSeries: clcrSeries });
});
