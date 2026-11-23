/* Immutable patient-profile revisions. This module validates recorded facts;
 * it does not calculate age, SDS, diagnoses or clinical interpretations. */
(function (root) {
  'use strict';
  var own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };
  var PROFILE_ID = /^prf-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var LEGACY_ID = /^legacy:[0-9a-f]{64}$/;
  var PUBERTY = ['onsetAgeYears', 'menarcheAgeYears', 'heightAtMenarcheCm', 'boneAgeAtMenarcheYears',
    'gnrhaStatus', 'gnrhaStartAgeYears', 'gnrhaStopAgeYears', 'cdgpDeclared'];
  function fail(message) { var error = new Error(message || 'Nieprawidłowe dane kartoteki.'); error.code = 'PATIENT_PROFILE_INVALID'; throw error; }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function plain(value) {
    var prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    var constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    return Object.getPrototypeOf(prototype) === null && !!constructor && own(constructor, 'value')
      && typeof constructor.value === 'function' && Function.prototype.toString.call(constructor.value) === Function.prototype.toString.call(Object);
  }
  function clone(value, depth) {
    depth = depth || 0;
    if (depth > 16) fail();
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || !Array.isArray(value) && !plain(value)) fail();
    var output = Array.isArray(value) ? [] : {};
    Object.keys(value).sort().forEach(function (key) {
      if (['__proto__', 'prototype', 'constructor'].indexOf(key) >= 0) fail();
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value') || descriptor.value === undefined) fail();
      output[key] = clone(descriptor.value, depth + 1);
    });
    if (depth === 0 && JSON.stringify(output).length > 65536) fail('Dane kartoteki przekraczają dozwolony rozmiar.');
    return output;
  }
  function exact(value, keys) {
    if (!object(value) || Object.keys(value).some(function (key) { return keys.indexOf(key) < 0; })) fail();
  }
  function string(value, limit) { if (typeof value !== 'string' || value.length > limit) fail(); return value.trim(); }
  function numeric(value) { if (typeof value !== 'number' || !Number.isFinite(value)) fail(); return value; }
  function date(value) {
    value = string(value, 10);
    if (value === '') return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Nieprawidłowa data urodzenia.');
    var parsed = new Date(value + 'T12:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('Nieprawidłowa data urodzenia.');
    return value;
  }
  function normalizeData(input) {
    var data = clone(input), result = {};
    exact(data, ['user', 'guardian', 'advanced', 'perinatal', 'puberty', 'clinical']);
    exact(data.user, ['firstName', 'lastName', 'dobISO', 'sex']);
    var user = {};
    ['firstName', 'lastName'].forEach(function (key) { if (own(data.user, key)) user[key] = string(data.user[key], 80).replace(/\s+/g, ' '); });
    if (!user.firstName && !user.lastName) fail('Podaj nazwisko pacjenta.');
    if (own(data.user, 'dobISO')) user.dobISO = data.user.dobISO === null ? null : date(data.user.dobISO);
    if (own(data.user, 'sex')) {
      if (['M', 'F', 'K', '', null].indexOf(data.user.sex) < 0) fail('Nieprawidłowa płeć pacjenta.');
      user.sex = data.user.sex === 'K' ? 'F' : data.user.sex;
    }
    result.user = user;
    if (own(data, 'guardian')) {
      exact(data.guardian, ['name', 'relation', 'phone', 'email', 'note']);
      result.guardian = {};
      Object.keys(data.guardian).forEach(function (key) { result.guardian[key] = string(data.guardian[key], key === 'note' ? 2000 : key === 'phone' ? 40 : 120); });
    }
    if (own(data, 'advanced')) {
      exact(data.advanced, ['motherHeight', 'fatherHeight']); result.advanced = {};
      Object.keys(data.advanced).forEach(function (key) { result.advanced[key] = data.advanced[key] === null ? null : numeric(data.advanced[key]); });
    }
    // Preserve the complete recorded perinatal metadata. It contains legacy
    // SDS/source/catch-up records in addition to the visible birth inputs.
    if (own(data, 'perinatal')) { if (!object(data.perinatal)) fail(); result.perinatal = clone(data.perinatal); }
    if (own(data, 'puberty')) {
      exact(data.puberty, PUBERTY); result.puberty = {};
      Object.keys(data.puberty).forEach(function (key) {
        var value = data.puberty[key];
        if (value === null) result.puberty[key] = null;
        else if (key === 'gnrhaStatus') { if (['', 'brak', 'w-trakcie', 'zakonczone'].indexOf(value) < 0) fail(); result.puberty[key] = value; }
        else if (key === 'cdgpDeclared') { if (['', 'tak', 'nie'].indexOf(value) < 0) fail(); result.puberty[key] = value; }
        else result.puberty[key] = numeric(value);
      });
    }
    if (own(data, 'clinical')) {
      exact(data.clinical, ['downSyndrome']); result.clinical = {};
      if (own(data.clinical, 'downSyndrome')) { if (typeof data.clinical.downSyndrome !== 'boolean') fail(); result.clinical.downSyndrome = data.clinical.downSyndrome; }
    }
    return clone(result);
  }
  function normalize(context) {
    var value = clone(context);
    exact(value, ['schemaVersion', 'kind', 'parents', 'legacyRevisionId', 'data']);
    if (value.schemaVersion !== 1 || value.kind !== 'patient-profile' || !Array.isArray(value.parents) || value.parents.length > 128
      || value.parents.some(function (id) { return typeof id !== 'string' || !PROFILE_ID.test(id); }) || new Set(value.parents).size !== value.parents.length) fail();
    var parents = value.parents.slice().sort(), result = { schemaVersion: 1, kind: 'patient-profile', parents: parents, data: normalizeData(value.data) };
    if (!parents.length) { if (typeof value.legacyRevisionId !== 'string' || !LEGACY_ID.test(value.legacyRevisionId)) fail(); result.legacyRevisionId = value.legacyRevisionId; }
    else if (own(value, 'legacyRevisionId')) fail();
    return clone(result);
  }
  function pick(source, keys) {
    var result = {};
    if (object(source)) keys.forEach(function (key) { if (own(source, key) && source[key] !== undefined) result[key] = clone(source[key]); });
    return result;
  }
  function legacy(payload, header) {
    payload = object(payload) ? payload : {}; header = object(header) ? header : {};
    var user = pick(payload.user, ['firstName', 'lastName', 'dobISO', 'sex']);
    ['firstName', 'lastName', 'dobISO', 'sex'].forEach(function (key) { if (!own(user, key) && own(header, key)) user[key] = clone(header[key]); });
    if (!user.firstName && !user.lastName) {
      var name = typeof payload.name === 'string' ? payload.name : typeof header.name === 'string' ? header.name : '';
      var parts = name.trim().split(/\s+/).filter(Boolean); user.lastName = parts.shift() || ''; user.firstName = parts.join(' ');
    }
    if (user.sex === 'K') user.sex = 'F';
    var result = { user: user };
    ['guardian', 'perinatal'].forEach(function (key) { if (object(payload[key])) result[key] = clone(payload[key]); });
    var advanced = pick(payload.advanced, ['motherHeight', 'fatherHeight']); if (Object.keys(advanced).length) result.advanced = advanced;
    var puberty = pick(payload.puberty, PUBERTY); if (Object.keys(puberty).length) result.puberty = puberty;
    var clinical = pick(payload.clinical, ['downSyndrome']); if (Object.keys(clinical).length) result.clinical = clinical;
    return clone(result);
  }
  function isRevision(note) { return !!note && (own(note, 'profileContext') || typeof note.id === 'string' && note.id.indexOf('prf-') === 0); }
  function project(notes, options) {
    options = options || {}; var patientId = options.patientId;
    var candidates = (notes || []).filter(isRevision), history = [], byId = new Map(), unsupported = false, incomplete = false;
    candidates.forEach(function (note) {
      var context;
      try {
        if (note.patientId !== patientId || !PROFILE_ID.test(note.id) || !own(note, 'profileContext')
          || note.category !== 'observation' || note.visitContext != null || note.dueDateISO != null
          || note.linkedAgeMonths != null || note.medication != null || note.labResult != null || note.careContext != null
          || note.treatmentContext != null || note.reminderContext != null || note.ghPointId != null
          || note.obesityPointId != null || note.seriesId != null) fail();
        context = normalize(note.profileContext);
        if (byId.has(note.id)) { if (JSON.stringify(byId.get(note.id).context) !== JSON.stringify(context)) fail(); return; }
        var entry = { revisionId: note.id, id: note.id, parents: context.parents.slice(),
          createdAtISO: note.createdAtISO || null, data: clone(context.data), context: context };
        byId.set(note.id, entry); history.push(entry);
      } catch (_) { unsupported = true; }
    });
    if (!candidates.length) return { status: 'legacy', data: clone(options.legacyData || {}), revisionId: options.legacyToken || null, history: [], heads: [], editable: true };
    var referenced = new Set();
    byId.forEach(function (entry) { entry.parents.forEach(function (id) { referenced.add(id); if (!byId.has(id)) incomplete = true; }); });
    var active = new Set(), visited = new Set();
    function visit(id) {
      if (active.has(id)) { incomplete = true; return; }
      if (visited.has(id) || !byId.has(id)) return;
      active.add(id); byId.get(id).parents.forEach(visit); active.delete(id); visited.add(id);
    }
    byId.forEach(function (_, id) { visit(id); });
    var heads = Array.from(byId.keys()).filter(function (id) { return !referenced.has(id); }).sort();
    history.sort(function (a, b) { return (a.createdAtISO || '').localeCompare(b.createdAtISO || '') || a.id.localeCompare(b.id); });
    var status = unsupported ? 'unsupported' : incomplete || !heads.length ? 'incomplete' : heads.length > 1 ? 'conflict' : 'ready';
    return { status: status, data: status === 'ready' ? clone(byId.get(heads[0]).data) : null,
      revisionId: status === 'ready' ? heads[0] : null, history: history.map(function (entry) { var value = clone(entry); delete value.context; return value; }),
      heads: heads, editable: status === 'ready' };
  }
  var api = Object.freeze({ normalizeData: normalizeData, normalize: normalize, legacy: legacy, project: project,
    clone: clone, isRevision: isRevision, isRevisionId: function (id) { return typeof id === 'string' && PROFILE_ID.test(id); } });
  root.VildaPatientProfileModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
