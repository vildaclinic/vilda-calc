/* Zakres referencyjny zapisany z wynikiem przy przypięciu (decyzja 6.3, LAB-HISTORIA).
 * Kopia zakresu, którego przelicznik użył w chwili przypięcia: granice w SI i w jednostce wyniku,
 * dla kogo go dobrano, źródła i wersje danych. Odczyt nie sięga do dzisiejszych norm, silnika,
 * DOM, zegara ani pamięci. Moduł nie wybiera zakresu i nie klasyfikuje wyniku: kategorię podaje
 * LabUnitConverter.evaluate w chwili przypięcia. Wzór: vilda_hormone_reference_snapshot.js (#677). */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaLabRangeSnapshot = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var own = function (value, key) { return value != null && Object.prototype.hasOwnProperty.call(value, key); };
  var record = function (value) { return value !== null && typeof value === 'object' && !Array.isArray(value); };
  var finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };
  var has = function (value, keys) { return record(value) && keys.every(function (key) { return own(value, key); }); };
  var kind = 'laboratory-reference-range';
  // Kategorie LabUnitConverter.evaluate dla zakresu z obiema granicami.
  var CLASSES = ['within', 'below', 'above', 'far_below', 'far_above'];
  var contextSchema = {
    sex: 'text', ageYears: 'number', lifeStage: 'text', tanner: 'number', cyclePhase: 'text',
    timeOfDay: 'text', testProtocol: 'text', method: 'text', localOverride: 'boolean'
  };
  var measurementSchema = { raw: 'text', sourceValue: 'number', sourceUnit: 'text', siValue: 'number', siUnit: 'text', factorToSi: 'number' };
  var whenSchema = {
    sex: 'text', life_stage: 'text', age_min: 'number', age_max: 'number', tanner: 'number',
    cycle_phase: 'text', time_of_day: 'text', test_protocol: 'text', method: 'text'
  };
  var sourceSchema = { id: 'text', label: 'text', citation: 'text', url: 'url' };
  var rangeSchema = {
    id: 'text', low: 'number', high: 'number', unit: 'text', context: 'text', when: whenSchema,
    matched: 'boolean', isDefault: 'boolean', noInterpretation: 'boolean', sourceIds: ['text'], sources: [sourceSchema]
  };
  var bindingSchema = { test: 'text', testKey: 'text', value: 'text', valueNum: 'number', unit: 'text', clinicalDateISO: 'text' };
  var schema = {
    schemaVersion: 'number', kind: 'text', analyte: 'text', status: 'text', reasonCodes: ['text'], capturedAtISO: 'text',
    context: contextSchema, measurement: measurementSchema, range: rangeSchema, classification: 'text',
    display: { unit: 'text', low: 'number', high: 'number' }, versions: { engine: 'text', data: 'text' }, binding: bindingSchema
  };
  function hasControlText(value) {
    for (var index = 0; index < value.length; index += 1) {
      var code = value.charCodeAt(index);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
    }
    return false;
  }
  // Rzutowanie na schemat: tylko znane pola, tylko wartości danych (bez akcesorów), teksty bez znaczników.
  function project(value, shape) {
    if (value === null) return null;
    if (shape === 'text' || shape === 'url') {
      if (typeof value !== 'string' || value.length > 4000 || /<\/?[A-Za-z][^>]*>/.test(value) || hasControlText(value)) throw new Error('invalid_text');
      if (shape === 'url' && value && !/^https?:\/\/[^\s]+$/i.test(value)) throw new Error('invalid_url');
      return value;
    }
    if (shape === 'number') { if (!finite(value)) throw new Error('invalid_number'); return value; }
    if (shape === 'boolean') { if (typeof value !== 'boolean') throw new Error('invalid_boolean'); return value; }
    if (Array.isArray(shape)) {
      if (!Array.isArray(value) || value.length > 32) throw new Error('invalid_array');
      return value.map(function (item) { if (item === null || Array.isArray(item)) throw new Error('invalid_array_item'); return project(item, shape[0]); });
    }
    if (!record(value)) throw new Error('invalid_object');
    var result = {};
    Object.keys(shape).forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return;
      if (!own(descriptor, 'value')) throw new Error('invalid_accessor');
      result[key] = project(descriptor.value, shape[key]);
    });
    return result;
  }
  function unavailable(reason) {
    return { schemaVersion: 1, kind: kind, analyte: null, status: 'unavailable', reasonCodes: [reason], capturedAtISO: null,
      context: null, measurement: null, range: null, classification: null, display: null, versions: null };
  }
  // Ta sama składnia liczby co LabUnitConverter.parseNumber: spacje i twarde spacje grupują cyfry,
  // przecinek dziesiętny. Wynik z operatorem („<0,1”) nie jest dokładną liczbą i nie dostaje zakresu.
  function parseRaw(raw) {
    if (typeof raw !== 'string') return null;
    var numeric = raw.trim().replace(/[\s\u00a0]/g, '').replace(',', '.');
    if (!numeric) return null;
    var value = Number(numeric);
    return finite(value) && value >= 0 ? value : null;
  }
  function close(left, right) {
    return finite(left) && finite(right) && Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * Number.EPSILON * 16;
  }
  function validContext(value) {
    if (!has(value, Object.keys(contextSchema))) return false;
    if (![null, 'F', 'M'].includes(value.sex) || ![null, 'adult', 'pediatric'].includes(value.lifeStage)) return false;
    if (value.ageYears !== null && value.ageYears < 0) return false;
    if (value.tanner !== null && (!Number.isInteger(value.tanner) || value.tanner < 1 || value.tanner > 5)) return false;
    return typeof value.localOverride === 'boolean';
  }
  function validMeasurement(value) {
    if (!has(value, Object.keys(measurementSchema)) || !value.raw || !value.sourceUnit || !value.siUnit) return false;
    var parsed = parseRaw(value.raw);
    return parsed !== null && value.sourceValue === parsed && value.factorToSi > 0 &&
      close(value.siValue, value.sourceValue * value.factorToSi) && (value.sourceUnit !== value.siUnit || value.factorToSi === 1);
  }
  function validRange(value, measurement, recorded) {
    if (!has(value, Object.keys(rangeSchema)) || !value.unit || value.unit !== measurement.siUnit || !value.context ||
        typeof value.matched !== 'boolean' || typeof value.isDefault !== 'boolean' || typeof value.noInterpretation !== 'boolean' ||
        !Array.isArray(value.sourceIds) || !Array.isArray(value.sources) || value.when !== null && !record(value.when)) return false;
    if (!recorded) return value.noInterpretation === true;
    return value.noInterpretation === false && finite(value.low) && finite(value.high) && value.low >= 0 && value.high >= value.low;
  }
  function validPayload(value) {
    var recorded = value.status === 'recorded' || value.classification !== null;
    if (value.capturedAtISO !== null && (typeof value.capturedAtISO !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.capturedAtISO) || !finite(Date.parse(value.capturedAtISO)))) return false;
    if (value.context === null || value.measurement === null || value.range === null || value.versions === null) {
      return !recorded && value.context === null && value.measurement === null && value.range === null && value.versions === null && value.display === null;
    }
    if (!value.analyte || !validContext(value.context) || !validMeasurement(value.measurement) || !has(value.versions, ['engine', 'data']) ||
        !value.versions.engine || !value.versions.data || !value.capturedAtISO || !validRange(value.range, value.measurement, recorded)) return false;
    if (!recorded) return value.display === null;
    if (!CLASSES.includes(value.classification) || !has(value.display, ['unit', 'low', 'high'])) return false;
    var display = value.display, factor = value.measurement.factorToSi;
    return display.unit === value.measurement.sourceUnit &&
      close(display.low, value.range.low / factor) && close(display.high, value.range.high / factor);
  }
  function normalize(envelope) {
    try {
      var clean = project(envelope, schema);
      if (!has(clean, Object.keys(schema).filter(function (key) { return key !== 'binding'; })) || clean.schemaVersion !== 1 ||
          clean.kind !== kind) return unavailable('unsupported_or_invalid_range_schema');
      if (!['recorded', 'unavailable', 'invalidated'].includes(clean.status) || !Array.isArray(clean.reasonCodes) ||
          clean.reasonCodes.some(function (code) { return !code || code.length > 120; }) || !validPayload(clean)) return unavailable('invalid_reference_range');
      if (clean.status === 'recorded' && clean.reasonCodes.length) return unavailable('invalid_reference_range');
      if (clean.status !== 'recorded' && !clean.reasonCodes.length) clean.reasonCodes.push('range_unavailable');
      if (own(clean, 'binding') && !has(clean.binding, Object.keys(bindingSchema))) return unavailable('invalid_range_binding');
      if (JSON.stringify(clean).length > 32000) return unavailable('invalid_reference_range');
      return clean;
    } catch (_) { return unavailable('invalid_reference_range'); }
  }
  function nullable(value) { return value === undefined ? null : value; }
  function textOrNull(value) { return typeof value === 'string' && value ? value : null; }
  function numberOrNull(value) { return finite(value) ? value : null; }
  function bindingFor(lab, dateISO) {
    var result = {};
    Object.keys(bindingSchema).forEach(function (key) {
      var value = key === 'clinicalDateISO' ? dateISO : lab && lab[key];
      result[key] = key === 'valueNum' ? finite(value) ? value : null : typeof value === 'string' ? value : null;
    });
    return result;
  }
  function whenFor(when) {
    if (!record(when)) return null;
    var result = {};
    Object.keys(whenSchema).forEach(function (key) {
      if (!own(when, key)) return;
      var value = when[key];
      result[key] = whenSchema[key] === 'number' ? numberOrNull(value) : value == null ? null : String(value);
    });
    return result;
  }
  // options: { analyte, evaluation (LabUnitConverter.evaluate), range (LabUnitConverter.selectRange),
  //   when (warunki wiersza danych o range.id), patient (kontekst użyty do obu wywołań), factorToSi (jednostka wyniku),
  //   measurement: { raw, sourceUnit }, sources: [{id, label, citation, url}], versions: { engine, data }, capturedAtISO, binding? }. Zakres i kategorię liczy przelicznik — tu tylko je kopiujemy
  //   i sprawdzamy, że oba wywołania opisują ten sam wynik i ten sam zakres.
  function create(options) {
    try {
      options = options || {};
      var evaluation = options.evaluation || {}, range = options.range, patient = options.patient || {}, input = options.measurement || {};
      if (!record(range)) return unavailable('range_not_selected');
      var parsed = parseRaw(input.raw);
      if (parsed === null || evaluation.ok !== true || !textOrNull(options.analyte) || evaluation.substanceId !== options.analyte ||
          evaluation.unit !== input.sourceUnit || evaluation.value !== parsed) return unavailable('range_input_mismatch');
      var recorded = range.no_interpretation !== true && finite(range.low) && finite(range.high) && CLASSES.includes(evaluation.status);
      if (!recorded && range.no_interpretation !== true) return unavailable('range_without_bounds');
      if (recorded && (evaluation.low !== range.low || evaluation.high !== range.high || (evaluation.context_pl || '') !== (range.context_pl || ''))) {
        return unavailable('range_evaluation_mismatch');
      }
      // Współczynnik jednostki wyniku z definicji substancji; przelicznik policzył nim wartość w SI.
      var factor = options.factorToSi;
      if (!(finite(factor) && factor > 0) || !close(evaluation.siValue, parsed * factor)) return unavailable('range_unit_mismatch');
      var context = {
        sex: patient.sex === 'F' || patient.sex === 'M' ? patient.sex : null,
        ageYears: numberOrNull(patient.age),
        lifeStage: patient.life_stage === 'adult' || patient.life_stage === 'pediatric' ? patient.life_stage : null,
        tanner: Number.isInteger(patient.tanner) ? patient.tanner : null,
        cyclePhase: textOrNull(patient.cycle_phase), timeOfDay: textOrNull(patient.time_of_day),
        testProtocol: textOrNull(patient.test_protocol), method: textOrNull(patient.method),
        localOverride: patient._has_override === true
      };
      var measurement = { raw: input.raw.trim(), sourceValue: parsed, sourceUnit: input.sourceUnit,
        siValue: evaluation.siValue, siUnit: evaluation.siUnit, factorToSi: factor };
      var sources = Array.isArray(options.sources) ? options.sources.map(function (source) {
        return { id: textOrNull(source && source.id), label: textOrNull(source && source.label),
          citation: textOrNull(source && source.citation), url: textOrNull(source && source.url) };
      }) : [];
      var saved = {
        id: textOrNull(range.id), low: recorded ? range.low : null, high: recorded ? range.high : null, unit: evaluation.siUnit,
        context: textOrNull(range.context_pl), when: whenFor(options.when), matched: range.matched === true,
        isDefault: range.is_default === true, noInterpretation: range.no_interpretation === true,
        sourceIds: Array.isArray(range.source_ids) ? range.source_ids.filter(function (id) { return typeof id === 'string' && id; }) : [],
        sources: sources
      };
      var envelope = { schemaVersion: 1, kind: kind, analyte: options.analyte, status: recorded ? 'recorded' : 'unavailable',
        reasonCodes: recorded ? [] : ['range_no_interpretation'], capturedAtISO: nullable(options.capturedAtISO),
        context: context, measurement: measurement, range: saved, classification: recorded ? evaluation.status : null,
        display: recorded ? { unit: input.sourceUnit, low: range.low / factor, high: range.high / factor } : null,
        versions: options.versions || { engine: null, data: null } };
      if (options.binding) envelope.binding = bindingFor(options.binding, options.binding.clinicalDateISO);
      return normalize(envelope);
    } catch (_) { return unavailable('range_capture_failed'); }
  }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function invalidate(envelope, reason) {
    envelope.status = 'invalidated';
    if (!envelope.reasonCodes.includes(reason)) envelope.reasonCodes.push(reason);
    return envelope;
  }
  function matchesLab(snapshot, lab) {
    var measurement = snapshot.measurement;
    if (!measurement || !record(lab) || typeof lab.testKey !== 'string' || lab.testKey !== snapshot.analyte) return false;
    if (lab.unit !== measurement.sourceUnit) return false;
    return finite(lab.valueNum) && lab.valueNum === measurement.sourceValue;
  }
  // Jak reconcile odniesienia AMH: zmiana wyniku, jednostki, badania albo daty po przypięciu unieważnia
  // zapisany zakres (zostaje w notatce do wglądu, bez oceny); zapis bez pola niesie poprzedni zakres dalej.
  function reconcile(previousLab, nextLab, previousDateISO, nextDateISO) {
    if (!record(nextLab)) return nextLab;
    var result = Object.assign({}, nextLab);
    var previousHas = own(previousLab, 'range'), nextHas = own(nextLab, 'range');
    if (!previousHas && !nextHas) return result;
    var old = previousHas ? normalize(previousLab.range) : null;
    var snapshot = normalize(nextHas ? nextLab.range : previousLab.range);
    var currentBinding = bindingFor(nextLab, nextDateISO);
    var changed = record(previousLab) && !same(bindingFor(previousLab, previousDateISO), currentBinding);
    var fresh = nextHas && (!old || snapshot.capturedAtISO !== old.capturedAtISO ||
      !same([snapshot.context, snapshot.measurement, snapshot.range, snapshot.versions], [old.context, old.measurement, old.range, old.versions]));
    if (snapshot.measurement) {
      if (old && old.status === 'invalidated' && !fresh) {
        old.reasonCodes.forEach(function (reason) { if (!snapshot.reasonCodes.includes(reason)) snapshot.reasonCodes.push(reason); });
        invalidate(snapshot, 'range_requires_recalculation');
      } else if (snapshot.status === 'invalidated') {
        // Już nieaktualny: kolejne zapisy i odczyty nie dopisują powodów, które wynikają z pierwszego.
      } else if (changed && !fresh) invalidate(snapshot, 'result_or_clinical_date_changed');
      else if (!matchesLab(snapshot, nextLab)) invalidate(snapshot, 'range_result_mismatch');
      else if (snapshot.binding && !same(snapshot.binding, currentBinding)) invalidate(snapshot, 'range_binding_mismatch');
      else snapshot.binding = currentBinding;
    }
    result.range = snapshot;
    return result;
  }
  function forSeries(lab, dateISO) {
    return own(lab, 'range') ? { range: reconcile(null, lab, null, dateISO).range } : {};
  }

  // Tekst dla okna przypięcia, zakładki „Badania” i paska w przeliczniku — jedno brzmienie w trzech miejscach.
  // Kategoria jest ta, którą przelicznik pokazał przy przypięciu; „w zakresie” nie znaczy „prawidłowo”.
  var LABELS = {
    within: { flag: null, text: 'w zapisanym zakresie' },
    below: { flag: '↓', text: 'poniżej zapisanego zakresu' },
    above: { flag: '↑', text: 'powyżej zapisanego zakresu' },
    far_below: { flag: '↓', text: 'znacznie poniżej zapisanego zakresu' },
    far_above: { flag: '↑', text: 'znacznie powyżej zapisanego zakresu' }
  };
  var INVALIDATION = {
    result_or_clinical_date_changed: 'zmieniono wynik lub datę badania',
    range_result_mismatch: 'zakres dotyczy innej wartości, jednostki lub badania',
    range_binding_mismatch: 'zakres nie odpowiada obecnym polom wyniku',
    range_requires_recalculation: 'zmieniono dane wyniku'
  };
  var ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  function plainNumber(value) { return String(Math.round(value * 1000) / 1000).replace('.', ','); }
  function subject(context, format) {
    if (!record(context)) return '';
    var parts = [], age = context.ageYears;
    if (context.sex) {
      var adult = finite(age) ? age >= 18 : context.lifeStage === 'adult' ? true : context.lifeStage === 'pediatric' ? false : null;
      parts.push(context.sex === 'F' ? (adult === null ? 'płeć żeńska' : adult ? 'kobieta' : 'dziewczynka')
        : (adult === null ? 'płeć męska' : adult ? 'mężczyzna' : 'chłopiec'));
    }
    if (finite(age)) {
      // Wiek z przelicznika w latach (z miesiącami jako ułamek), pokazany jak w karcie: „12 l 3 m”.
      var months = Math.round(age * 12);
      parts.push(Math.floor(months / 12) + ' l' + (months % 12 ? ' ' + (months % 12) + ' m' : ''));
    }
    else if (context.lifeStage === 'adult') parts.push('bez wieku w przeliczniku — przyjęto dorosłego');
    if (Number.isInteger(context.tanner)) parts.push('Tanner ' + ROMAN[context.tanner - 1]);
    var text = parts.join(', ');
    return text && context.localOverride ? text + ' (ustawione w przeliczniku)' : text;
  }
  // options.formatNumber: LabUnitConverter.formatNumber albo inna funkcja liczby → tekst (domyślnie przecinek dziesiętny).
  function describe(envelope, options) {
    if (!record(envelope)) return null;
    var format = options && typeof options.formatNumber === 'function' ? options.formatNumber : plainNumber;
    var range = envelope.range, display = envelope.display;
    var sources = record(range) && Array.isArray(range.sources)
      ? range.sources.map(function (source) { return source && (source.label || source.id); }).filter(Boolean) : [];
    var base = {
      status: envelope.status, classification: null, flag: null, text: '',
      bounds: display && finite(display.low) && finite(display.high) ? format(display.low) + '–' + format(display.high) + '\u00a0' + display.unit : '',
      population: record(range) && range.context || '', subject: subject(envelope.context, format), sources: sources, detail: []
    };
    if (envelope.status === 'recorded' && LABELS[envelope.classification]) {
      base.classification = envelope.classification;
      base.flag = LABELS[envelope.classification].flag;
      base.text = LABELS[envelope.classification].text;
      return base;
    }
    if (envelope.status === 'invalidated') {
      base.text = 'zakres nieaktualny';
      (envelope.reasonCodes || []).forEach(function (code) {
        if (own(INVALIDATION, code) && base.detail.indexOf(INVALIDATION[code]) === -1) base.detail.push(INVALIDATION[code]);
      });
      return base;
    }
    if (envelope.status === 'unavailable' && (envelope.reasonCodes || []).indexOf('range_no_interpretation') !== -1) {
      base.text = 'bez oceny względem zakresu w dniu przypięcia';
      return base;
    }
    return null;
  }
  return Object.freeze({ version: '1.0.0', create: create, normalize: normalize, reconcile: reconcile, forSeries: forSeries,
    unavailable: unavailable, describe: describe });
});
