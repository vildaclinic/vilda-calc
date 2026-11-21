/* Explicit visit actions of the preview. Patient data always go through the native
 * accepted-load and save boundaries. Visiting a history card only previews it. */
(function (w, d) {
  'use strict';
  if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return;
  let working = null, loading = null, saving = null, recording = null, choiceRequest = null;
  // No patient or visit identifiers are written here. A tab restored during a
  // historical edit must reselect its canonical revision before it can write.
  const historicalFlag = 'vildaHomeHistoricalEdit';

  function selected() { return w.sessionStorage.getItem('vildaCurrentPatientId'); }
  function owner(patientId) {
    const vault = w.VildaVault;
    if (!patientId || !vault || !vault.isUnlocked()) return null;
    const user = vault.getCurrentUser();
    if (!user || !user.userId) return null;
    return {vault, patientId, userId: user.userId, token: vault.captureSyncOperationSession()};
  }
  function current(scope) {
    try {
      if (!scope || w.VildaVault !== scope.vault || !scope.vault.isUnlocked() ||
          scope.vault.getCurrentUser().userId !== scope.userId) return false;
      scope.vault.assertSyncOperationSession(scope.token);
      return true;
    } catch (_) { return false; }
  }
  function notify() { d.dispatchEvent(new w.CustomEvent('vilda:home-encounter-changed')); }
  function active(patientId) {
    return !!(working && working.patientId === patientId && selected() === patientId && current(working));
  }
  function state(patientId) {
    const item = active(patientId) ? working : {};
    return {mode: item.mode || 'browse', visitId: item.visitId || null, snapshotId: item.snapshotId || null,
      date: item.date || null, busy: !!(loading || saving)};
  }

  function guardLeave() {
    const guard = w.VildaUnsavedGuard;
    if (!guard || typeof guard.run !== 'function') return Promise.resolve(false);
    if (d.querySelector('.vug-backdrop, .vug[role="dialog"]')) return Promise.resolve(false);
    return new Promise(resolve => {
      guard.run({reason: 'load', onProceed: () => resolve(true), onCancel: () => resolve(false)});
    });
  }

  // Called only by the native chooser, with the very same event detail we published.
  // Let its accepted-load publication finish and DOB reconciliation settle before
  // applying the original New/Restore callback.
  function consumeChoice(detail, newVisit, restore, isCurrent, abandon) {
    const request = choiceRequest;
    if (!request || request.detail !== detail) return false;
    const run = () => {
      if (choiceRequest !== request || !current(request.scope) || !isCurrent() || Date.now() > request.deadline) {
        abandon(); request.finish(false); return;
      }
      if (w.VildaDobAge && w.VildaDobAge.restorePending()) { w.setTimeout(run, 25); return; }
      try {
        (request.choice === 'new' ? newVisit : restore)();
        request.finish(true);
      } catch (_) { abandon(); request.finish(false); }
    };
    w.setTimeout(run, 0);
    return true;
  }

  function load(patientId, choice = 'restore', snapshot) {
    return loadVisit(patientId, choice, snapshot, null);
  }
  async function loadVisit(patientId, choice, snapshot, afterOwnSave) {
    if (!patientId || loading || saving || !['new','restore','edit'].includes(choice)) return false;
    const scope = owner(patientId), api = w.VildaDataImportExport;
    if (!scope || !api || !w.VildaVisitContext) return false;
    const token = api.captureAcceptedPatientLoad({patientId});
    if (!token) return false;
    const allowed = () => current(scope) && loading === scope && api.isAcceptedPatientLoadCurrent(token);
    loading = scope; notify();
    try {
      if (!(afterOwnSave ? afterOwnSave() : await guardLeave()) || !allowed()) return false;
      const patient = await scope.vault.getPatient(patientId);
      if (!allowed() || afterOwnSave && !afterOwnSave() || !patient || !patient.snapshots || !patient.snapshots.length) return false;
      let row = patient.snapshots[0];
      if (choice === 'edit' || snapshot) {
        if (!snapshot) return false;
        const rows = await scope.vault.getPatientVisits(patientId);
        if (!allowed()) return false;
        row = rows.find(item => item.snapshotId === snapshot.snapshotId && item.visitId === snapshot.visitId && item.rev === snapshot.rev);
      }
      if (!row || !row.payload || !row.payload.visit) return false;
      let finish;
      const done = new Promise(resolve => { finish = resolve; });
      const request = {choice, scope, finish, deadline: Date.now() + 12000};
      choiceRequest = request;
      const timeout = w.setTimeout(() => finish(false), 12000);
      let chosen = false;
      try {
        const applied = api.runAcceptedPatientLoad(token, row.payload, {
          apply: value => w.applyLoadedData(value),
          publish(authority) {
            request.detail = Object.assign({patientId, savedAtISO: row.savedAtISO, name: row.payload.name,
              snapshotCount: patient.snapshots.length, source: 'pick'}, authority);
            working = null;
            d.dispatchEvent(new w.CustomEvent('vilda:patient-loaded', {detail: request.detail}));
          }
        });
        if (!applied) return false;
        chosen = await done;
      } finally { w.clearTimeout(timeout); if (choiceRequest === request) choiceRequest = null; }
      if (!chosen || !current(scope) || selected() !== patientId) return false;
      const visit = w.VildaVisitContext.capture(null, {patientId,readOnly:true});
      if (!visit || (choice === 'new' ? visit.visitId === row.payload.visit.visitId : visit.visitId !== row.payload.visit.visitId)) return false;
      if (snapshot) w.sessionStorage.setItem(historicalFlag, '1');
      else w.sessionStorage.removeItem(historicalFlag);
      working = Object.assign(scope, {mode: choice === 'new' ? 'new' : (snapshot ? 'edit' : 'browse'),
        visitId: visit.visitId, date: visit.clinicalDateISO, snapshotId: choice === 'new' ? null : row.snapshotId,
        revision: choice === 'new' ? null : row.rev || 0});
      return true;
    } catch (_) { return false; }
    finally { if (loading === scope) loading = null; notify(); }
  }
  function start(patientId) { return load(patientId, 'new'); }

  // Native validation still rejects malformed, negative or zero values. Only
  // an intentionally empty control is optional on a known visit of this owner.
  function optionalField(payload, id) {
    if (!['height','weight'].includes(id) || !payload || !payload.visit ||
        !active(payload.visit.patientId) || working.mode === 'browse' || payload.visit.visitId !== working.visitId) return false;
    const field = d.getElementById(id);
    return !!field && String(field.value).trim() === '' && !(field.validity && field.validity.badInput);
  }
  function revisionTarget(payload) {
    const historical = w.sessionStorage.getItem(historicalFlag) === '1';
    const scope = working;
    const provisional = !!(scope && scope.mode === 'new' && scope.artifactReceipt);
    if (!historical && !provisional) return null;
    if (!scope || !active(scope.patientId) || historical && scope.mode !== 'edit') {
      throw new Error('Otwórz ponownie wizytę z historii przed jej zapisaniem.');
    }
    if (!payload || !payload.visit || payload.visit.visitId !== scope.visitId || payload.visit.patientId !== scope.patientId) {
      throw new Error('Formularz nie odpowiada wybranej wizycie.');
    }
    // A snapshot created for an independently stored result is still the open
    // visit. Completing its form updates that exact revision under the vault lock.
    return {patientId: scope.patientId, visitId: scope.visitId, snapshotId: scope.snapshotId,
      revision: scope.revision, isCurrent: () => working === scope && active(scope.patientId) &&
        scope.mode === (historical ? 'edit' : 'new')};
  }
  function saved(patientId, snapshotId, visitId, revision) {
    if (!active(patientId) || !snapshotId || working.visitId !== visitId) return;
    working.snapshotId = snapshotId;
    // A new native save inserts a fresh snapshot at revision zero. Conditional
    // in-place corrections report the actual incremented revision in the receipt.
    working.revision = Number.isInteger(revision) ? revision : 0;
    notify();
  }
  function captureBinding(patientId) {
    if (!active(patientId) || working.mode === 'browse' || loading || saving) return null;
    const scope = working, visitId = scope.visitId, date = scope.date;
    const isCurrent = () => working === scope && working.mode !== 'browse' && active(patientId) &&
      working.visitId === visitId && working.date === date;
    return Object.freeze({
      visitContext: Object.freeze({version: 1, visitId, clinicalDateISO: date}), isCurrent,
      ensureRecorded: () => isCurrent() ? ensureRecorded(patientId, visitId) : Promise.resolve(false)
    });
  }
  function verified(scope, receipt) {
    return active(scope.patientId) && working === scope && receipt && receipt.saved === true &&
      receipt.referenceVerified === true && receipt.patientId === scope.patientId && !!receipt.snapshotId &&
      receipt.snapshotId === scope.snapshotId;
  }
  async function ensureRecorded(patientId, visitId) {
    if (!active(patientId) || working.mode === 'browse' || working.visitId !== visitId || loading || saving) return false;
    const scope = working;
    if (recording) return recording.scope === scope ? recording.promise : false;
    if (scope.snapshotId) {
      const rows = await scope.vault.getPatientVisits(patientId);
      return active(patientId) && working === scope && rows.some(row => row.visitId === visitId &&
        row.snapshotId === scope.snapshotId && (scope.mode !== 'edit' || row.rev === scope.revision));
    }
    // A patient-level artifact may commit independently of the main form. Save
    // its encounter first, in the native encrypted store, only on submission.
    const submitted = w.VildaSaveStatusIndicator.getCurrentDecision();
    const promise = Promise.resolve().then(() => w.VildaDataImportExport.saveUserDataWithReceipt({})).then(receipt => {
      if (!verified(scope, receipt)) return false;
      scope.artifactReceipt = receipt;
      scope.artifactSubmission = submitted.scope;
      return true;
    }).catch(() => false);
    const operation = {scope, promise};
    recording = operation;
    try { return await promise; }
    finally { if (recording === operation) recording = null; }
  }
  async function save(patientId) {
    if (!active(patientId) || working.mode === 'browse' || loading || saving) return false;
    const scope = working; saving = scope; notify();
    try {
      if (recording && (recording.scope !== scope || !await recording.promise)) return false;
      const status = w.VildaSaveStatusIndicator;
      let result = scope.artifactReceipt, submitted = scope.artifactSubmission;
      const decision = status.getCurrentDecision();
      // Completing a consultation whose sole item was just saved need not add
      // another technical version. Subsequent clinical edits still use Save.
      if (!verified(scope, result) || !status.isSubmittedFormCurrent(submitted) && !(decision.ready && decision.state === 'saved')) {
        submitted = decision.scope;
        result = await w.VildaDataImportExport.saveUserDataWithReceipt({});
      }
      if (!verified(scope, result)) return false;
      if (working.mode === 'edit') {
        // The disk correction is complete. Restore the latest clinical context
        // before presenting a neutral patient overview again.
        saving = null;
        const unchanged = () => verified(scope, result) && status.isSubmittedFormCurrent(submitted);
        // Allow native Save's own calculations to settle. A concurrent edit or
        // owner change cancels automatic navigation and retains the live form.
        for (let turn = 0; turn < 20 && !unchanged() && active(patientId); turn++) {
          await new Promise(resolve => { w.setTimeout(resolve, 50); });
        }
        if (unchanged()) await loadVisit(patientId, 'restore', null, unchanged);
      } else {
        working.mode = 'browse';
      }
      return true;
    } finally { saving = null; notify(); }
  }
  function history(patientId, patientName) {
    const scope = owner(patientId);
    if (!scope || !w.VildaVisitHistory) return false;
    return w.VildaVisitHistory.open(patientId, {patientName, isCurrent: () => current(scope) && selected() === patientId,
      onEdit: row => load(patientId, 'edit', row).then(ok => {
        if (!ok && current(scope) && selected() === patientId) w.alert('Nie otwarto wizyty do edycji.');
      })});
  }
  d.addEventListener('vilda:patient-loaded', event => {
    const detail = event.detail;
    if (!detail || detail.source !== 'save' && (!choiceRequest || detail !== choiceRequest.detail)) {
      working = null; notify();
    }
  });
  d.addEventListener('vilda:user-state-cleared', () => { working = null; notify(); });
  w.VildaHomeEncounter = Object.freeze({load, start, state, save, history, guardLeave, consumeChoice, optionalField, revisionTarget, saved, captureBinding, ensureRecorded});
})(window, document);
