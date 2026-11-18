/* Read-only patient documentation projection. Native Vault and model APIs
 * own records, saved laboratory assessments and care-plan routing. Returned
 * strings are untrusted plaintext and must be rendered with textContent.
 */
(function (root) {
  'use strict';
  if (!root) return;

  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function text(value) { return typeof value === 'string' ? value : ''; }
  function failure(code) { var error = new Error(code); error.code = code; return error; }
  function localDay() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }
  function descendingDate(left, right) {
    return left === right ? 0 : !left ? 1 : !right ? -1 : left > right ? -1 : 1;
  }
  function ownedList(value, patientId) {
    if (!Array.isArray(value)) throw failure('HOME_PATIENT_LIST_INVALID');
    if (value.some(function (item) { return !record(item) || item.patientId !== patientId; })) throw failure('HOME_PATIENT_RECORD_OWNER_MISMATCH');
    return value;
  }
  function list(value) {
    if (!Array.isArray(value)) throw failure('HOME_PATIENT_LIST_INVALID');
    return value;
  }
  function identity(patient) {
    var snapshots = Array.isArray(patient.snapshots) ? patient.snapshots : [];
    // Vault orders snapshots with its native comparator; never sort/relabel visits.
    var snapshot = snapshots.length ? snapshots[0] : null;
    var payload = snapshot && record(snapshot.payload) ? snapshot.payload : null;
    var header = record(patient.header) ? patient.header : null;
    return {
      patientId: patient.patientId,
      name: payload && text(payload.name) || header && text(header.name) || '',
      header: header,
      user: payload && record(payload.user) ? payload.user : null,
      visit: payload && record(payload.visit) ? payload.visit : null,
      snapshotId: snapshot && snapshot.snapshotId || null,
      savedAtISO: snapshot && snapshot.savedAtISO || null,
      updatedAtISO: snapshot && snapshot.updatedAtISO || null,
      hasSnapshotPayload: !!payload
    };
  }
  function noteDate(note) {
    // Same general/clinical distinction and date precedence as native Notes.
    return note.linkedAgeMonths == null && !note.clinicalDateISO
      ? text(note.updatedAtISO) : text(note.clinicalDateISO) || text(note.updatedAtISO);
  }
  function noteProjection(notes, plans, patientId, care, labHistory) {
    if (!care || typeof care.projectPatientNotes !== 'function' || typeof care.resolveNoteDestination !== 'function') throw failure('HOME_PATIENT_NOTES_MODEL_UNAVAILABLE');
    if (!labHistory || typeof labHistory.isResultNote !== 'function' || typeof labHistory.isClcrResultNote !== 'function') throw failure('HOME_PATIENT_LAB_MODEL_UNAVAILABLE');
    var projected = care.projectPatientNotes(notes, patientId, { plans: plans });
    if (!Array.isArray(projected)) throw failure('HOME_PATIENT_NOTES_PROJECTION_INVALID');
    return projected.filter(function (note) { return note && note.patientId === patientId && !note.ghPointId
      && !Object.prototype.hasOwnProperty.call(note, 'treatmentContext')
      && !labHistory.isResultNote(note) && !labHistory.isClcrResultNote(note); })
      .map(function (note) {
        return {
          id: note.id,
          patientId: note.patientId,
          title: text(note.title),
          body: text(note.body),
          category: note.category,
          scope: note.linkedAgeMonths == null && !note.clinicalDateISO ? 'general' : 'clinical',
          linkedAgeMonths: note.linkedAgeMonths,
          clinicalDateISO: note.clinicalDateISO,
          updatedAtISO: note.updatedAtISO,
          dateISO: noteDate(note),
          destination: care.resolveNoteDestination(notes, note, patientId, { plans: plans }),
          source: note
        };
      }).sort(function (left, right) { return descendingDate(left.dateISO, right.dateISO); });
  }
  function careProjection(plans, patientId, model, todayISO) {
    if (!model || typeof model.decodeCarePlanRecord !== 'function' || typeof model.projectCarePlan !== 'function') throw failure('HOME_PATIENT_CARE_MODEL_UNAVAILABLE');
    return plans.map(function (source) {
      var hasContext = Object.prototype.hasOwnProperty.call(source, 'careContext');
      var view = hasContext ? model.projectCarePlan(model.decodeCarePlanRecord(source), { todayLocalDateISO: todayISO }) : null;
      // V1 listCarePlans returns CareMvpView, not the original care-plan note.
      // Do not fabricate careContext to force it through the V2 decoder.
      var legacy = !hasContext && !source.stages && !source.stageOrder && !source.formatVersion && !source.rawContext
        && Array.isArray(source.steps) && Array.isArray(source.log) && ['active', 'closed'].indexOf(source.status) !== -1;
      var kind = view ? view.kind : legacy ? 'legacy' : 'unsupported';
      var context = view && ['v1', 'v2'].indexOf(view.kind) !== -1 ? view.rawContext : legacy ? source : null;
      return {
        id: source.id,
        patientId: patientId,
        title: text(source.title),
        updatedAtISO: source.updatedAtISO,
        createdAtISO: source.createdAtISO,
        kind: kind,
        // Stored status only; no derived badge, due-date guess or capability.
        status: context && ['active', 'closed'].indexOf(context.status) !== -1 ? context.status : null,
        goal: context ? text(context.goal) : '',
        source: source,
        view: view,
        destination: { activeTab: 'care', carePlanId: source.id }
      };
    }).sort(function (left, right) { return descendingDate(text(left.updatedAtISO), text(right.updatedAtISO)); });
  }
  function compactLabRows(view, presentation, options, patientId) {
    var rows = [];
    function addSeries(series) {
      (Array.isArray(series.entries) ? series.entries : []).forEach(function (entry) {
        rows.push({
          patientId: patientId,
          noteId: entry.noteId,
          seriesKey: series.key,
          label: series.label,
          dateISO: entry.dateISO,
          dateSource: entry.dateSource,
          entry: entry,
          // Keeps recorded limits, conditional/invalidated states and warnings.
          presentation: presentation.describe(entry, options),
          destination: { activeTab: 'lab', labFocusNoteId: entry.noteId }
        });
      });
    }
    view.panels.forEach(function (panel) { panel.series.forEach(addSeries); });
    if (view.clcr) {
      if (typeof presentation.clcrSeries !== 'function') throw failure('HOME_PATIENT_CLCR_PRESENTATION_UNAVAILABLE');
      presentation.clcrSeries(view.clcr).forEach(addSeries);
    }
    var priority = { badanie: 0, kontrola: 1 };
    // Native table date semantics: dated rows first; sample/control before entry
    // dates on the same day. Original entry ordering is retained on ties.
    rows.sort(function (left, right) {
      var byDate = descendingDate(left.dateISO, right.dateISO);
      var leftPriority = Object.prototype.hasOwnProperty.call(priority, left.dateSource) ? priority[left.dateSource] : 2;
      var rightPriority = Object.prototype.hasOwnProperty.call(priority, right.dateSource) ? priority[right.dateSource] : 2;
      return byDate || leftPriority - rightPriority;
    });
    return rows.slice(0, 3);
  }

  async function read(options) {
    options = options || {};
    var vault = options.vault, patientId = options.patientId, current = options.isCurrent;
    if (!vault || typeof patientId !== 'string' || !patientId || typeof current !== 'function') throw failure('HOME_PATIENT_READ_ARGUMENTS_INVALID');
    var owner = typeof vault.getCurrentUser === 'function' ? vault.getCurrentUser() : null;
    var ownerId = owner && owner.userId || null;
    function assertCurrent() {
      var user = typeof vault.getCurrentUser === 'function' ? vault.getCurrentUser() : null;
      if (!current() || typeof vault.isUnlocked !== 'function' || !vault.isUnlocked()
        || ownerId && (!user || user.userId !== ownerId)
        || root.VildaVault && root.VildaVault !== vault) throw failure('HOME_PATIENT_STALE');
    }
    async function guardedRead(method, argument, validate) {
      assertCurrent();
      if (typeof vault[method] !== 'function') throw failure('HOME_PATIENT_READER_UNAVAILABLE');
      var value;
      try { value = await vault[method](argument); }
      catch (error) { assertCurrent(); throw error; }
      assertCurrent();
      return validate ? validate(value) : value;
    }
    assertCurrent();
    var operations = ['getPatient', 'listPatientNotesForPatient', 'listPatientLabSeries', 'listPatientTreatmentPeriods', 'listCarePlans'];
    var results = await Promise.allSettled([
      guardedRead(operations[0], patientId, function (value) {
        if (value !== null && (!record(value) || value.patientId !== patientId)) throw failure('HOME_PATIENT_RECORD_OWNER_MISMATCH');
        return value;
      }),
      guardedRead(operations[1], patientId, function (value) { return ownedList(value, patientId); }),
      guardedRead(operations[2], patientId, list),
      guardedRead(operations[3], patientId, list),
      guardedRead(operations[4], { patientId: patientId }, function (value) { return ownedList(value, patientId); })
    ]);
    assertCurrent();
    var errors = [], sources = {};
    results.forEach(function (result, index) {
      sources[operations[index]] = result.status === 'fulfilled' ? 'ready' : 'error';
      if (result.status !== 'fulfilled') errors.push({ area: 'source', operation: operations[index], code: 'HOME_PATIENT_READ_FAILED' });
    });
    var output = {
      patientId: patientId, sources: sources,
      patient: results[0].status === 'fulfilled' ? results[0].value : null,
      identity: null, currentNotes: null, generalNotes: null, clinicalNotes: null, latestNote: null,
      labView: null, latestLabRows: null, careRecords: null, latestPlanSummary: null,
      treatmentSummary: null,
      counts: { notes: null, labResults: null, carePlans: null },
      areas: { patient: sources.getPatient, notes: 'unavailable', labs: 'unavailable', care: 'unavailable' },
      errors: errors
    };
    if (!output.patient) {
      if (sources.getPatient === 'ready') { output.areas.patient = 'missing'; errors.push({ area: 'patient', code: 'HOME_PATIENT_NOT_FOUND' }); }
      assertCurrent();
      return output;
    }
    output.identity = identity(output.patient);
    var notesReady = sources.listPatientNotesForPatient === 'ready', plansReady = sources.listCarePlans === 'ready';
    var notes = notesReady ? results[1].value : null, plans = plansReady ? results[4].value : null;
    if (notesReady && typeof root.VildaPatientTreatmentModel?.project === 'function') {
      try {
        var treatments = root.VildaPatientTreatmentModel.project(notes, { patientId: patientId });
        var activeEpisodes = treatments.episodes.filter(function (entry) { return entry.context.status === 'active'; });
        output.treatmentSummary = { status: 'ready', activeCount: activeEpisodes.length,
          activeLabels: activeEpisodes.map(function (entry) { return entry.context.title; }), unsupportedCount: treatments.unsupported.length };
      } catch (_) { errors.push({ area: 'treatment', code: 'HOME_PATIENT_TREATMENT_PROJECTION_FAILED' }); }
    }
    var history = root.VildaLabHistory, presentation = root.VildaLabResultPresentation, trend = root.__vildaLabTrend;
    if (notesReady && plansReady) {
      try {
        output.currentNotes = noteProjection(notes, plans, patientId, root.VildaCarePlans, history);
        output.generalNotes = output.currentNotes.filter(function (note) { return note.scope === 'general'; });
        output.clinicalNotes = output.currentNotes.filter(function (note) { return note.scope === 'clinical'; });
        output.latestNote = output.currentNotes[0] || null;
        output.counts.notes = output.currentNotes.length;
        output.areas.notes = 'ready';
      } catch (error) { errors.push({ area: 'notes', code: error.code || 'HOME_PATIENT_NOTES_PROJECTION_FAILED' }); output.areas.notes = 'error'; }
    }
    if (plansReady) {
      try {
        output.careRecords = careProjection(plans, patientId, root.VildaCarePlanModel, localDay());
        output.latestPlanSummary = output.careRecords[0] || null;
        output.counts.carePlans = output.careRecords.length;
        output.areas.care = 'ready';
      } catch (error) { errors.push({ area: 'care', code: error.code || 'HOME_PATIENT_CARE_PROJECTION_FAILED' }); output.areas.care = 'error'; }
    }
    if (notesReady && sources.listPatientLabSeries === 'ready' && sources.listPatientTreatmentPeriods === 'ready') {
      try {
        if (!history || typeof history.buildHistoryView !== 'function' || !presentation || typeof presentation.describe !== 'function') throw failure('HOME_PATIENT_LAB_MODEL_UNAVAILABLE');
        if (!root.LabUnitConverter || typeof root.LabUnitConverter.find !== 'function') throw failure('HOME_PATIENT_LAB_CONVERTER_UNAVAILABLE');
        if (!root.VildaLabRangeSnapshot || !root.VildaLabSnapshot || !root.VildaLabAssessmentUI || !trend || typeof trend.parseNorm !== 'function') throw failure('HOME_PATIENT_LAB_PRESENTATION_UNAVAILABLE');
        var hasClcr = notes.some(function (note) { return note.category === 'wynik-klirens'; });
        if (hasClcr && (!root.ClcrSavedResults || typeof root.ClcrSavedResults.projectPatientNotes !== 'function')) throw failure('HOME_PATIENT_CLCR_READER_UNAVAILABLE');
        var notesById = Object.create(null);
        notes.forEach(function (note) { if (note.id) notesById[note.id] = note; });
        var labOptions = {
          notesById: notesById, treatment: results[3].value, converter: root.LabUnitConverter,
          parseNorm: trend.parseNorm, nowISO: localDay(), patientId: patientId,
          rangeSnapshot: root.VildaLabRangeSnapshot, clcrSavedResults: root.ClcrSavedResults || null
        };
        var view = history.buildHistoryView(results[2].value, labOptions);
        var compact = compactLabRows(view, presentation, {
          converter: root.LabUnitConverter, parseNorm: trend.parseNorm, snapshot: root.VildaLabSnapshot,
          rangeSnapshot: root.VildaLabRangeSnapshot, assessmentUI: root.VildaLabAssessmentUI
        }, patientId);
        output.labView = view;
        output.latestLabRows = compact;
        output.counts.labResults = view.summary.missingNotes > 0 ? null : view.summary.results;
        // A split-time Vault read is explicitly partial, not an empty history.
        output.areas.labs = view.summary.missingNotes > 0 ? 'partial' : 'ready';
        if (view.summary.missingNotes > 0) errors.push({ area: 'labs', code: 'HOME_PATIENT_LAB_READ_CHANGED' });
      } catch (error) { errors.push({ area: 'labs', code: error.code || 'HOME_PATIENT_LAB_PROJECTION_FAILED' }); output.areas.labs = 'error'; }
    }
    assertCurrent();
    return output;
  }
  root.VildaHomePatientData = Object.freeze({ read: read });
})(typeof window !== 'undefined' ? window : null);
