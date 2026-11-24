/* Patient-treatment document operations. Native note actors own encryption,
 * revisions, authority, synchronization and tombstones. This module stores no
 * clinical state outside those records and never changes a saved diagnosis
 * while completing an independent episode. Embedded by the vault delta. */
(function (root) {
  'use strict';
  function failure(code, message) { var error = new Error(message); error.code = code; return error; }
  function clone(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') throw failure('TREATMENT_INVALID', 'Nieprawidłowe dane leczenia.');
    var result = Array.isArray(value) ? [] : {};
    Object.keys(value).forEach(function (key) {
      if (['__proto__', 'prototype', 'constructor'].indexOf(key) >= 0) throw failure('TREATMENT_INVALID', 'Nieprawidłowe dane leczenia.');
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw failure('TREATMENT_INVALID', 'Nieprawidłowe dane leczenia.');
      if (descriptor.value !== undefined) result[key] = clone(descriptor.value);
    });
    return result;
  }
  function createScope(options) {
    options = options || {};
    var vault = options.vault, patientId = options.patientId, isCurrent = options.isCurrent;
    var model = root.VildaPatientTreatmentModel, disposed = false;
    if (!vault || !model || typeof patientId !== 'string' || !patientId || typeof isCurrent !== 'function'
      || typeof vault.captureSyncOperationSession !== 'function' || typeof vault.assertSyncOperationSession !== 'function') {
      throw failure('TREATMENT_UNAVAILABLE', 'Nie można otworzyć zapisu leczenia. Otwórz kartę ponownie.');
    }
    var user = vault.getCurrentUser(), userId = user && user.userId;
    if (!userId || !vault.isUnlocked() || root.VildaVault !== vault || isCurrent() !== true) throw failure('TREATMENT_STALE', 'Kontekst pacjenta się zmienił. Otwórz kartę ponownie.');
    var session = vault.captureSyncOperationSession();
    function check() {
      var current = vault.getCurrentUser();
      if (disposed || root.VildaVault !== vault || !vault.isUnlocked() || !current || current.userId !== userId || isCurrent() !== true) {
        throw failure('TREATMENT_STALE', 'Kontekst pacjenta się zmienił. Otwórz kartę ponownie.');
      }
      try { if (vault.assertSyncOperationSession(session) !== true) throw new Error('session'); }
      catch (_) { throw failure('TREATMENT_STALE', 'Sesja sejfu się zmieniła. Otwórz kartę ponownie.'); }
    }
    async function guarded(operation) {
      check();
      var result;
      try { result = await operation(); }
      catch (error) { check(); throw error; }
      check(); return result;
    }
    function context(kind, values, previous) {
      var next = Object.assign({}, previous ? clone(previous) : {}, clone(values || {}), { schemaVersion: 1, kind: kind });
      return model.normalize(next);
    }
    function captured(dto, kind) {
      var copy = clone(dto);
      if (!copy || copy.patientId !== patientId || typeof copy.id !== 'string' || !copy.id
        || !copy.baseNote || copy.baseNote.id !== copy.id || copy.baseNote.patientId !== patientId
        || !Number.isSafeInteger(copy.rev) || copy.rev < 0) throw failure('TREATMENT_INVALID', 'Otwórz właściwy zapis leczenia.');
      var decoded = model.decode(copy.baseNote);
      if (decoded.kind !== kind) throw failure('TREATMENT_UNSUPPORTED', 'Ten zapis ma nieobsługiwany format i pozostaje tylko do odczytu.');
      if (JSON.stringify(decoded.context) !== JSON.stringify(model.normalize(copy.context))) throw failure('TREATMENT_CONFLICT', 'Zapis formularza się zmienił. Otwórz go ponownie.');
      return copy;
    }
    async function read() {
      var patient = await guarded(function () { return vault.getPatient(patientId); });
      if (!patient || patient.patientId !== patientId) throw failure('TREATMENT_STALE', 'Karta pacjenta nie jest już dostępna.');
      var notes = await guarded(function () { return vault.listPatientNotesForPatient(patientId); });
      if (!Array.isArray(notes) || notes.some(function (note) { return !note || note.patientId !== patientId; })) throw failure('TREATMENT_UNAVAILABLE', 'Nie można potwierdzić właściciela zapisów leczenia.');
      return Object.assign({ patientId: patientId }, model.project(notes, { patientId: patientId }));
    }
    async function links(next, previous) {
      if (next.kind !== 'therapy') return;
      var projected = await read(), available = new Set(projected.diagnoses.map(function (item) { return item.id; }));
      var old = previous ? previous.diagnosisIds : [];
      if (next.diagnosisIds.some(function (id) { return !available.has(id) && old.indexOf(id) < 0; })) throw failure('TREATMENT_LINK_INVALID', 'Wybierz rozpoznanie zapisane w tej karcie pacjenta.');
      if (old.some(function (id) { return !available.has(id) && next.diagnosisIds.indexOf(id) < 0; })) throw failure('TREATMENT_CONFLICT', 'Powiązane rozpoznanie jest niedostępne. Zachowaj jego powiązanie lub odśwież kartę.');
    }
    function payload(id, next) {
      var readable = model.describe(next);
      return Object.assign({ id: id, patientId: patientId, title: readable.title, body: readable.body,
        category: readable.category, linkedAgeMonths: null, clinicalDateISO: readable.clinicalDateISO || null }, { treatmentContext: next });
    }
    function newId() {
      if (root.crypto && typeof root.crypto.randomUUID === 'function') return 'tmt-' + root.crypto.randomUUID();
      if (!root.crypto || typeof root.crypto.getRandomValues !== 'function') throw failure('TREATMENT_UNAVAILABLE', 'Brak bezpiecznego identyfikatora zapisu.');
      var bytes = new Uint8Array(16); root.crypto.getRandomValues(bytes);
      return 'tmt-' + Array.from(bytes).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    }
    async function reread(id, kind) {
      var note = await guarded(function () { return vault.getPatientNote(id); });
      if (!note || note.patientId !== patientId || model.decode(note).kind !== kind) throw failure('TREATMENT_CONFLICT', 'Nie można potwierdzić zapisanego leczenia. Odśwież kartę.');
      var projected = model.project([note], { patientId: patientId });
      return (kind === 'diagnosis' ? projected.diagnoses : projected.episodes)[0];
    }
    async function create(kind, values) {
      check(); var next = context(kind, values), id = newId();
      if (kind === 'therapy') await links(next, null); else await read();
      var result = await guarded(function () { return vault.savePatientNoteOnce(payload(id, next), { isCurrent: function () { check(); return true; } }); });
      if (!result || result.conflict || result.saved === false) throw failure('TREATMENT_CONFLICT', 'Nie zapisano leczenia. Odśwież kartę i sprawdź aktualny zapis.');
      return reread(id, kind);
    }
    async function update(kind, dto, values) {
      check(); var original = captured(dto, kind), next = context(kind, values, original.context);
      if (kind === 'therapy') await links(next, original.context); else await read();
      var request = Object.assign(payload(original.id, next), { baseRev: original.rev,
        baseUpdatedAtISO: original.updatedAtISO, baseNote: original.baseNote });
      var result = await guarded(function () { return vault.updateExistingPatientNote(request, { isCurrent: function () { check(); return true; } }); });
      if (!result || result.updated !== true) throw failure('TREATMENT_CONFLICT', 'Zapis zmienił się albo został usunięty. Odśwież kartę przed ponowną edycją.');
      return reread(original.id, kind);
    }
    async function followup(dto, id, values) {
      check(); var original = captured(dto, 'therapy'), next = clone(values || {}), entries = clone(original.context.followups);
      if (id) {
        var index = entries.findIndex(function (entry) { return entry.id === id; });
        if (index < 0) throw failure('TREATMENT_CONFLICT', 'Wpis kontroli nie jest już dostępny.');
        entries[index] = Object.assign({}, entries[index], next, { id: id });
      } else entries.push(Object.assign({}, next, { id: newId() }));
      return update('therapy', original, { followups: entries });
    }
    return Object.freeze({
      read: read,
      createDiagnosis: function (values) { return create('diagnosis', values); },
      updateDiagnosis: function (dto, values) { return update('diagnosis', dto, values); },
      createEpisode: function (values) { return create('therapy', values); },
      updateEpisode: function (dto, values) { return update('therapy', dto, values); },
      addFollowup: function (dto, values) { return followup(dto, null, values); },
      updateFollowup: function (dto, id, values) { return followup(dto, id, values); },
      dispose: function () { disposed = true; }
    });
  }
  root.VildaPatientTreatmentStore = Object.freeze({ createScope: createScope });
})(window);
