/* Read-only visit selection. The vault supplies one current revision per visit,
 * already ordered by clinical day with a deterministic same-day order. */
(function (w) {
  'use strict';
  if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return;

  function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return null;
    const midnight = value + 'T00:00:00.000Z';
    const time = Date.parse(midnight);
    return Number.isFinite(time) && new Date(time).toISOString() === midnight ? value : null;
  }

  function clinicalDate(row) {
    return row && (row.origin === 'explicit' || row.dateSource === 'measuredAt') ? day(row.clinicalDateISO) : null;
  }

  function measurementDate(row) {
    if (!row || !w.VildaHomeComparisonClinical.hasMeasurements(row)) return null;
    return day(row.payload?.user?.measuredAtISO) || (row.dateSource === 'measuredAt' ? clinicalDate(row) : null);
  }

  function belongs(row, patientId) {
    const visit = row?.payload?.visit;
    return !!patientId && row?.patientId === patientId && !!row.visitId && !!row.snapshotId &&
      visit?.patientId === patientId && visit.visitId === row.visitId;
  }

  function latest(patientId, rows) {
    const own = rows.filter(row => belongs(row, patientId));
    // For an entirely undated legacy chart keep its existing read path. Its
    // technical timestamp is never presented as a confirmed consultation date.
    return own.find(row => clinicalDate(row)) || own[0] || null;
  }

  function select(patientId, rows, encounter, currentPayload, earlierVisitId = null) {
    const empty = {current: null, previous: null, reference: null, earlierMeasured: null,
      elapsedDays: null, hasCurrentMeasurements: false, hasReferenceMeasurements: false};
    if (!patientId || !Array.isArray(rows) || !encounter?.visitId) return empty;
    const own = rows.filter(row => belongs(row, patientId));
    const index = own.findIndex(row => row.visitId === encounter.visitId);
    const saved = own[index] || null;
    const exact = saved && saved.snapshotId === encounter.snapshotId && saved.rev === encounter.revision;
    let current;
    if (encounter.mode === 'browse') {
      if (!exact) return empty;
      current = saved;
    } else {
      if (encounter.mode !== 'edit' && encounter.mode !== 'new' ||
          (saved || encounter.snapshotId || encounter.mode === 'edit') && !exact) return empty;
      const visit = currentPayload?.visit;
      if (!visit || visit.patientId !== patientId || visit.visitId !== encounter.visitId) return empty;
      const payload = currentPayload.clinical ? currentPayload : {...currentPayload,
        clinical: {downSyndrome: encounter.sourceDownSyndrome === true}};
      if (!currentPayload.clinical && encounter.sourceDiagnosisCode) {
        w.VildaDsSource?.applyDiagnosisToVisit?.(payload, encounter.sourceDiagnosisCode);
      }
      current = {...saved, ...visit, clinicalDateISO: encounter.date, payload};
    }
    const clinical = w.VildaHomeComparisonClinical;
    const hasCurrentMeasurements = clinical.hasMeasurements(current);
    const currentDay = clinicalDate(current);
    // A provisional new visit may already have been recorded by a reminder.
    // In that case keep its position and exclude its own saved version.
    const earlier = currentDay ? own.slice(index + 1).filter(row => {
      const date = clinicalDate(row);
      return row.visitId !== current.visitId && date && date <= currentDay;
    }) : [];
    const previous = earlier[0] || null;
    const comparable = other => hasCurrentMeasurements ? clinical.sharesMeasurements(current, other) : clinical.hasMeasurements(other);
    const earlierMeasured = previous && !comparable(previous) ? earlier.slice(1).find(comparable) || null : null;
    const reference = earlierMeasured && earlierVisitId === earlierMeasured.visitId ? earlierMeasured : previous;
    const previousDay = clinicalDate(reference);
    const elapsedDays = currentDay && previousDay ? (Date.parse(currentDay) - Date.parse(previousDay)) / 86400000 : null;
    return {current, previous, reference, earlierMeasured, elapsedDays, hasCurrentMeasurements,
      hasReferenceMeasurements: !!reference && clinical.hasMeasurements(reference)};
  }

  w.VildaHomeVisitComparisonModel = Object.freeze({clinicalDate, measurementDate, latest, select});
})(window);
