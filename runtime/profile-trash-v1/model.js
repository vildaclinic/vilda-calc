/* Additive projection support for immutable legacy profile baselines.
 * Existing strict profile edits keep the original normalizer. A baseline is
 * the exact legacy subset, without correcting or inventing patient facts.
 */
(function (root) {
  'use strict';
  var base = root && root.VildaPatientProfileModel;
  if (!base || typeof base.normalize !== 'function' || typeof base.project !== 'function') {
    throw new Error('Brak bazowego modelu kartoteki pacjenta.');
  }
  var KIND = 'patient-profile-legacy-baseline';
  var LEGACY_ID = /^legacy:[0-9a-f]{64}$/;
  var own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };
  function fail() {
    var error = new Error('Nieprawidłowa historyczna podstawa kartoteki.');
    error.code = 'PATIENT_PROFILE_INVALID'; throw error;
  }
  function baseline(value) {
    var descriptor = value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value, 'kind');
    return !!descriptor && own(descriptor, 'value') && descriptor.value === KIND;
  }
  function exactSurface(value, depth) {
    depth = depth || 0;
    if (depth > 16) fail();
    if (value === null || typeof value !== 'object') return;
    if (Object.getOwnPropertySymbols(value).length) fail();
    var keys = Object.getOwnPropertyNames(value), array = Array.isArray(value);
    if (array && keys.length !== value.length + 1) fail();
    keys.forEach(function (key) {
      if (array && key === 'length') return;
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable) fail();
      exactSurface(descriptor.value, depth + 1);
    });
  }
  function normalize(context) {
    if (!baseline(context)) return base.normalize(context);
    exactSurface(context);
    var value = base.clone(context);
    if (Object.keys(value).some(function (key) {
      return ['schemaVersion', 'kind', 'parents', 'legacyRevisionId', 'data'].indexOf(key) < 0;
    }) || value.schemaVersion !== 1 || !Array.isArray(value.parents) || value.parents.length !== 0
      || typeof value.legacyRevisionId !== 'string' || !LEGACY_ID.test(value.legacyRevisionId)
      || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) fail();
    var data = base.clone(value.data), extracted = base.legacy(data, {});
    if (JSON.stringify(data) !== JSON.stringify(base.clone(extracted))) fail();
    return base.clone({ schemaVersion: 1, kind: KIND, parents: [], legacyRevisionId: value.legacyRevisionId, data: data });
  }
  function project(notes, options) {
    // Preserve the original API and every existing projection outcome when
    // this new record kind is absent.
    if (!(notes || []).some(function (note) {
      var descriptor = note && typeof note === 'object' && Object.getOwnPropertyDescriptor(note, 'profileContext');
      return !!descriptor && own(descriptor, 'value') && baseline(descriptor.value);
    })) return base.project(notes, options);
    options = options || {}; var patientId = options.patientId;
    var candidates = (notes || []).filter(base.isRevision), history = [], byId = new Map(), unsupported = false, incomplete = false;
    // The graph rules below match the existing profile model. Only context
    // normalization additionally accepts a faithful, parentless baseline.
    candidates.forEach(function (note) {
      var context;
      try {
        if (note.patientId !== patientId || !base.isRevisionId(note.id) || !own(note, 'profileContext')
          || note.category !== 'observation' || note.visitContext != null || note.dueDateISO != null
          || note.linkedAgeMonths != null || note.medication != null || note.labResult != null || note.careContext != null
          || note.treatmentContext != null || note.reminderContext != null || note.ghPointId != null
          || note.obesityPointId != null || note.seriesId != null) fail();
        context = normalize(note.profileContext);
        if (byId.has(note.id)) { if (JSON.stringify(byId.get(note.id).context) !== JSON.stringify(context)) fail(); return; }
        var entry = { revisionId: note.id, id: note.id, parents: context.parents.slice(),
          createdAtISO: note.createdAtISO || null, data: base.clone(context.data), context: context };
        byId.set(note.id, entry); history.push(entry);
      } catch (_) { unsupported = true; }
    });
    if (!candidates.length) return base.project(notes, options);
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
    return { status: status, data: status === 'ready' ? base.clone(byId.get(heads[0]).data) : null,
      revisionId: status === 'ready' ? heads[0] : null, history: history.map(function (entry) { var value = base.clone(entry); delete value.context; return value; }),
      heads: heads, editable: status === 'ready' };
  }
  root.VildaPatientProfileModel = Object.freeze(Object.assign({}, base, { normalize: normalize, project: project }));
})(typeof window !== 'undefined' ? window : globalThis);
