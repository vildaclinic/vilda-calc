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
    if (clinicalWarning) result.warning = text(view.clinical.title) || 'Zapisana ocena wymaga uwagi';
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
      return;
    }
    var display = saved.display;
    if (!display) return;
    var item = norm(options, { low: display.low, high: display.high, unit: display.unit, target: result.unit,
      key: saved.analyte, label: info.population, conditional: info.status === 'general', tone: info.classification });
    if (item) result.norms.push(item);
    if (info.status === 'general') result.warning = 'Zakres ogólny';
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
    options = options || {};
    var result = { value: exactValue(entry), unit: text(entry.unit || entry.recordedUnit), norms: [],
      tone: 'neutral', symbol: '', normText: '—', warning: '' };
    if (record(entry.assessment)) assessmentNorms(entry, options, result);
    else if (entry.normAccepted) manualNorm(entry, options, result);
    else if (record(entry.range)) rangeNorm(entry, options, result);
    if (result.norms.length) {
      result.normText = result.norms.map(function (item) { return (result.norms.length > 1 && item.label ? item.label + ': ' : '') + item.text; }).join(' · ');
      if (result.value !== null && result.norms.length === 1) result.tone = result.norms[0].tone;
      if (!result.warning && result.norms.some(function (item) { return item.conditional; })) result.warning = result.norms.length > 1 ? 'Różne zakresy odniesienia' : 'Odniesienie orientacyjne';
    }
    if (result.value === null) result.norms.forEach(function (item) { item.tone = 'neutral'; });
    result.symbol = result.tone === 'above' ? '↑' : result.tone === 'below' ? '↓' : '';
    return result;
  }
  return Object.freeze({ version: '1.0.0', describe: describe });
});
