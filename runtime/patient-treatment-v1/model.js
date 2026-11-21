/* Readable source embedded in the native vault by the treatment transport builder.
 * Recorded diagnoses and treatment episodes only: no clinical interpretation,
 * drug selection, dose calculation or automatic diagnosis is performed here.
 */
(function (root) {
  'use strict';
  if (!root) return;

  var own = Object.prototype.hasOwnProperty;
  var diagnosisKeys = ['schemaVersion', 'kind', 'name', 'code', 'codingSystem', 'status', 'dateISO'];
  var therapyKeys = ['schemaVersion', 'kind', 'title', 'method', 'status', 'startDateISO', 'endDateISO',
    'diagnosisIds', 'medication', 'dose', 'notes', 'nextDateISO', 'followups'];
  var followupKeys = ['id', 'dateISO', 'kind', 'body', 'visitContext'];
  var methods = ['pharmacological', 'nonpharmacological', 'other'];
  var followupKinds = ['Kontrola', 'Ustalenia', 'Zmiana leczenia'];

  function invalid(field) {
    var error = new Error('Nieprawidłowe dane leczenia: ' + field + '.');
    error.code = 'TREATMENT_INVALID'; error.field = field;
    throw error;
  }
  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    // An ordinary object from the same-origin host document has another realm's
    // Object.prototype. Accept that prototype, but not an arbitrary inherited
    // record. Accessors are rejected separately, without invoking them.
    var constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    return Object.getPrototypeOf(prototype) === null && !!constructor && own.call(constructor, 'value')
      && typeof constructor.value === 'function'
      && Function.prototype.toString.call(constructor.value) === Function.prototype.toString.call(Object);
  }
  function fields(value, allowed, field) {
    if (!plain(value) || Object.getOwnPropertySymbols(value).length) invalid(field);
    var descriptors = Object.getOwnPropertyDescriptors(value);
    Object.keys(descriptors).forEach(function (key) {
      if (allowed.indexOf(key) < 0 || !own.call(descriptors[key], 'value')) invalid(field + '.' + key);
    });
    return descriptors;
  }
  function value(descriptors, key) { return own.call(descriptors, key) ? descriptors[key].value : undefined; }
  function controls(input) {
    for (var index = 0; index < input.length; index += 1) {
      var code = input.charCodeAt(index);
      if (code < 32 && code !== 9 && code !== 10) return true;
    }
    return false;
  }
  function string(input, limit, field, required) {
    if (input === undefined && !required) return '';
    if (typeof input !== 'string') invalid(field);
    var output = input.replace(/\r\n?/g, '\n').trim();
    if (output.length > limit || required && !output || controls(output)) invalid(field);
    return output;
  }
  function enumeration(input, options, field) {
    if (options.indexOf(input) < 0) invalid(field);
    return input;
  }
  function date(input, field, required) {
    if (input === undefined && !required || input === '' && !required) return '';
    if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) invalid(field);
    var year = Number(input.slice(0, 4)), month = Number(input.slice(5, 7)), day = Number(input.slice(8));
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) invalid(field);
    return input;
  }
  function id(input, field) {
    if (typeof input !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input)) invalid(field);
    return input;
  }
  function array(input, limit, field) {
    if (!Array.isArray(input) || input.length > limit || Object.getOwnPropertySymbols(input).length) invalid(field);
    var prototype = Object.getPrototypeOf(input), constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor');
    if (prototype !== Array.prototype && (!constructor || !own.call(constructor, 'value')
      || typeof constructor.value !== 'function'
      || Function.prototype.toString.call(constructor.value) !== Function.prototype.toString.call(Array))) invalid(field);
    var descriptors = Object.getOwnPropertyDescriptors(input), output = [];
    if (Object.keys(descriptors).length !== input.length + 1) invalid(field);
    for (var index = 0; index < input.length; index += 1) {
      var descriptor = descriptors[index];
      if (!descriptor || !own.call(descriptor, 'value')) invalid(field + '[' + index + ']');
      output.push(descriptor.value);
    }
    return output;
  }
  function ids(input) {
    if (input === undefined) return [];
    var seen = new Set();
    return array(input, 500, 'diagnosisIds').map(function (item, index) {
      var next = id(item, 'diagnosisIds[' + index + ']');
      if (seen.has(next)) invalid('diagnosisIds');
      seen.add(next); return next;
    });
  }
  function followups(input) {
    if (input === undefined) return [];
    var seen = new Set();
    return array(input, 500, 'followups').map(function (item, index) {
      var field = 'followups[' + index + ']', keys = fields(item, followupKeys, field);
      var next = { id: id(value(keys, 'id'), field + '.id'), dateISO: date(value(keys, 'dateISO'), field + '.dateISO', true),
        kind: enumeration(value(keys, 'kind'), followupKinds, field + '.kind'),
        body: string(value(keys, 'body'), 3000, field + '.body', true) };
      if (own.call(keys, 'visitContext')) {
        var origin = fields(value(keys, 'visitContext'), ['version', 'visitId', 'clinicalDateISO'], field + '.visitContext');
        var visitId = value(origin, 'visitId');
        if (value(origin, 'version') !== 1 || typeof visitId !== 'string'
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitId)) invalid(field + '.visitContext');
        next.visitContext = { version: 1, visitId: visitId, clinicalDateISO: date(value(origin, 'clinicalDateISO'), field + '.visitContext.clinicalDateISO', true) };
      }
      if (seen.has(next.id)) invalid(field + '.id');
      seen.add(next.id); return next;
    });
  }
  function normalize(context) {
    if (!plain(context)) invalid('treatmentContext');
    var schema = Object.getOwnPropertyDescriptor(context, 'schemaVersion');
    var kind = Object.getOwnPropertyDescriptor(context, 'kind');
    if (!schema || !own.call(schema, 'value') || schema.value !== 1) invalid('schemaVersion');
    if (!kind || !own.call(kind, 'value') || ['diagnosis', 'therapy'].indexOf(kind.value) < 0) invalid('kind');
    var keys = fields(context, kind.value === 'diagnosis' ? diagnosisKeys : therapyKeys, 'treatmentContext');
    var status = enumeration(value(keys, 'status'), ['active', 'closed'], 'status');
    if (kind.value === 'diagnosis') {
      var coding = value(keys, 'codingSystem');
      if (coding !== undefined && coding !== 'ICD-10') invalid('codingSystem');
      return { schemaVersion: 1, kind: 'diagnosis', name: string(value(keys, 'name'), 200, 'name', true),
        code: string(value(keys, 'code'), 24, 'code', false), codingSystem: 'ICD-10', status: status,
        dateISO: date(value(keys, 'dateISO'), 'dateISO', true) };
    }
    var output = { schemaVersion: 1, kind: 'therapy', title: string(value(keys, 'title'), 160, 'title', true),
      method: enumeration(value(keys, 'method'), methods, 'method'), status: status,
      startDateISO: date(value(keys, 'startDateISO'), 'startDateISO', false),
      endDateISO: date(value(keys, 'endDateISO'), 'endDateISO', false), diagnosisIds: ids(value(keys, 'diagnosisIds')),
      medication: string(value(keys, 'medication'), 160, 'medication', false),
      dose: string(value(keys, 'dose'), 120, 'dose', false), notes: string(value(keys, 'notes'), 3000, 'notes', false),
      nextDateISO: date(value(keys, 'nextDateISO'), 'nextDateISO', false), followups: followups(value(keys, 'followups')) };
    if (output.startDateISO && output.endDateISO && output.endDateISO < output.startDateISO) invalid('endDateISO');
    return output;
  }
  function copy(input, depth, budget) {
    if (depth > 40 || --budget.remaining < 0) invalid('record');
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return array(input, 20000, 'record').map(function (item) { return copy(item, depth + 1, budget); });
    if (!plain(input) || Object.getOwnPropertySymbols(input).length) invalid('record');
    var output = {}, descriptors = Object.getOwnPropertyDescriptors(input);
    Object.keys(descriptors).forEach(function (key) {
      if (!own.call(descriptors[key], 'value') || ['__proto__', 'prototype', 'constructor'].indexOf(key) >= 0) invalid('record');
      output[key] = copy(descriptors[key].value, depth + 1, budget);
    });
    return output;
  }
  function fieldValue(record, key) {
    var descriptor = record && Object.getOwnPropertyDescriptor(record, key);
    return descriptor && own.call(descriptor, 'value') ? descriptor.value : undefined;
  }
  function decode(note) {
    var descriptor = note && Object.getOwnPropertyDescriptor(note, 'treatmentContext');
    var result = { kind: 'none', noteId: fieldValue(note, 'id') || null, patientId: fieldValue(note, 'patientId') || null, context: null };
    if (!descriptor) return result;
    try {
      id(result.noteId, 'note.id'); id(result.patientId, 'note.patientId');
      if (!own.call(descriptor, 'value')) invalid('treatmentContext');
      result.context = normalize(descriptor.value); result.kind = result.context.kind;
    } catch (error) {
      result.kind = 'unsupported'; result.context = null;
      result.error = { code: 'TREATMENT_UNSUPPORTED', field: error.field || 'record' };
    }
    return result;
  }
  function effectiveDate(entry) {
    if (!entry.context) return entry.updatedAtISO || '';
    if (entry.context.kind === 'diagnosis') return entry.context.dateISO;
    var latest = entry.context.followups.reduce(function (dateISO, item) { return item.dateISO > dateISO ? item.dateISO : dateISO; }, '');
    return entry.context.startDateISO || latest || entry.updatedAtISO || '';
  }
  function compare(left, right) {
    var a = effectiveDate(left), b = effectiveDate(right);
    if (a !== b) return a > b ? -1 : 1;
    if (left.updatedAtISO !== right.updatedAtISO) return left.updatedAtISO > right.updatedAtISO ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  }
  function project(notes, options) {
    var patientId = id(options && options.patientId, 'patientId');
    if (!Array.isArray(notes)) invalid('notes');
    var result = { diagnoses: [], episodes: [], unsupported: [] };
    notes.forEach(function (note) {
      if (fieldValue(note, 'patientId') !== patientId) return;
      var decoded = decode(note);
      if (decoded.kind === 'none') return;
      var entry = { id: decoded.noteId, patientId: patientId,
        rev: Number.isSafeInteger(fieldValue(note, 'rev')) && fieldValue(note, 'rev') >= 0 ? fieldValue(note, 'rev') : 0,
        updatedAtISO: typeof fieldValue(note, 'updatedAtISO') === 'string' ? fieldValue(note, 'updatedAtISO') : '',
        baseNote: null, context: decoded.context };
      try { entry.baseNote = copy(note, 0, { remaining: 20000 }); }
      catch (_) { decoded.kind = 'unsupported'; entry.context = null; }
      if (decoded.kind === 'unsupported') {
        entry.error = decoded.error || { code: 'TREATMENT_UNSUPPORTED', field: 'record' };
        result.unsupported.push(entry);
      } else if (decoded.kind === 'diagnosis') result.diagnoses.push(entry);
      else result.episodes.push(entry);
    });
    result.diagnoses.sort(compare); result.episodes.sort(compare); result.unsupported.sort(compare);
    return result;
  }
  function describe(context) {
    var normalized = normalize(context), lines = [], title, clinicalDateISO;
    if (normalized.kind === 'diagnosis') {
      title = 'Rozpoznanie · ' + normalized.name;
      if (normalized.code) lines.push('ICD-10: ' + normalized.code);
      lines.push('Stan rozpoznania: ' + (normalized.status === 'active' ? 'aktywne' : 'zamknięte'));
      lines.push('Data rozpoznania: ' + normalized.dateISO); clinicalDateISO = normalized.dateISO;
    } else {
      title = 'Leczenie · ' + normalized.title;
      lines.push('Metoda: ' + { pharmacological: 'farmakoterapia', nonpharmacological: 'postępowanie niefarmakologiczne', other: 'inne' }[normalized.method]);
      lines.push('Stan leczenia: ' + (normalized.status === 'active' ? 'aktywne' : 'zakończone'));
      if (normalized.startDateISO) lines.push('Początek: ' + normalized.startDateISO);
      if (normalized.endDateISO) lines.push('Zakończenie: ' + normalized.endDateISO);
      if (normalized.method === 'pharmacological') {
        if (normalized.medication) lines.push('Zapisany preparat: ' + normalized.medication);
        if (normalized.dose) lines.push('Zapisana dawka: ' + normalized.dose);
      }
      if (normalized.nextDateISO) lines.push('Następna kontrola: ' + normalized.nextDateISO);
      if (normalized.notes) lines.push(normalized.notes);
      normalized.followups.slice().sort(function (left, right) { return left.dateISO > right.dateISO ? -1 : left.dateISO < right.dateISO ? 1 : left.id < right.id ? -1 : 1; })
        .forEach(function (item) { lines.push(item.dateISO + ' · ' + item.kind + '\n' + item.body); });
      clinicalDateISO = normalized.startDateISO || null;
    }
    return { title: title, body: lines.join('\n'), category: 'treatment', clinicalDateISO: clinicalDateISO };
  }
  root.VildaPatientTreatmentModel = Object.freeze({ normalize: normalize, decode: decode, project: project, describe: describe });
})(typeof window !== 'undefined' ? window : globalThis);
