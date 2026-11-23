/* Explicit visit actions of the preview. Patient data always go through the native
 * accepted-load and save boundaries. Visiting a history card only previews it. */
(function (w, d) {
  'use strict';
  if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return;
  let working = null, loading = null, saving = null, recording = null, choiceRequest = null, trashChange = null;
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
  function isIdentityOnly(patientId) {
    if (loading && loading.patientId === patientId && typeof loading.identityOnly === 'boolean') {
      return loading.identityOnly && current(loading);
    }
    return working?.identityOnly === true && active(patientId);
  }
  function state(patientId) {
    const item = active(patientId) ? working : {};
    return {mode: item.mode || 'browse', visitId: item.visitId || null, snapshotId: item.snapshotId || null,
      date: item.date || null, dateCertain: item.dateCertain === true, revision: item.revision ?? null,
      sourceSnapshotId: item.sourceSnapshotId || null, sourceMeasurementDate: item.sourceMeasurementDate || null,
      sourceDownSyndrome: item.sourceDownSyndrome === true,
      busy: !!(loading || saving || trashChange),
      requiresLatest: !item.mode && selected() === patientId && w.sessionStorage.getItem(historicalFlag) === '1'};
  }

  function guardLeave(modalOwner) {
    const guard = w.VildaUnsavedGuard;
    if (!guard || typeof guard.run !== 'function') return Promise.resolve(false);
    if (d.querySelector('.vug-backdrop, .vug[role="dialog"]')) return Promise.resolve(false);
    return new Promise(resolve => {
      guard.run({reason: 'load', modalOwner, onProceed: () => resolve(true), onCancel: () => resolve(false)});
    });
  }

  // The native loader supplies an operation-bound presentation and the original
  // form actions. A pick from another native tool can only open the saved data.
  function consumeChoice(detail, newVisit, restore, isCurrent, abandon) {
    let request = choiceRequest;
    if (request) {
      if (request.detail !== detail) return false;
    } else {
      if (loading || saving || trashChange || detail?.source !== 'pick' || selected() !== detail.patientId) return false;
      const scope = owner(detail.patientId);
      if (!scope || !isCurrent()) return false;
      request = {scope, choice: 'restore', deadline: Date.now() + 12000,
        valid: () => !choiceRequest && !loading && !saving && !trashChange,
        finish(ok) {
          if (ok && current(scope) && selected() === scope.patientId) {
            w.sessionStorage.removeItem(historicalFlag);
            notify();
          }
        }};
    }
    const run = () => {
      if (!request.valid() || !current(request.scope) || !isCurrent() || Date.now() > request.deadline) {
        abandon(); request.finish(false); return;
      }
      if (w.VildaDobAge?.restorePending() || Number(w.__vildaLoadInFlightUntil) > Date.now()) {
        w.setTimeout(run, 25); return;
      }
      try {
        const ok = (request.choice === 'new' ? newVisit : restore)() === true;
        if (!ok) abandon();
        request.finish(ok);
      } catch (_) { abandon(); request.finish(false); }
    };
    w.setTimeout(run, 0);
    return true;
  }

  function load(patientId, choice = 'restore', snapshot, isCurrent, onApply) {
    return loadVisit(patientId, choice, snapshot, null, isCurrent, {onApply});
  }
  // The vault retains the identity of a patient whose last visit is in the
  // bin. Its storage marker is never a visit or part of a new clinical record.
  async function identityRow(scope) {
    const row = await scope.vault.getLatestSnapshot(scope.patientId);
    if (!row?.snapshotId || row.payload?._visitPatientIdentityOnly !== true || row.payload.visit != null) return null;
    const payload = {...row.payload};
    delete payload._visitPatientIdentityOnly;
    return {...row, patientId: scope.patientId, payload};
  }
  function profileDraft(payload, data) {
    const user = {...payload.user};
    for (const key of ['firstName', 'lastName', 'dobISO', 'sex']) {
      if (Object.hasOwn(data.user, key)) user[key] = data.user[key];
      else delete user[key];
    }
    const name = [user.lastName, user.firstName].filter(Boolean).join(' ');
    const advanced = {...payload.advanced};
    if (Object.hasOwn(advanced, 'name')) advanced.name = name;
    for (const key of ['motherHeight', 'fatherHeight']) {
      if (Object.hasOwn(data.advanced || {}, key)) advanced[key] = data.advanced[key];
      else delete advanced[key];
    }
    // The native New action still archives the previous measurement at its
    // originally recorded age. Only the new draft uses the chart's identity.
    const next = {...payload, name, user, advanced,
      clinical: {...payload.clinical, downSyndrome: data.clinical?.downSyndrome === true}};
    if (payload.growthBasic && Object.hasOwn(payload.growthBasic, 'name')) {
      next.growthBasic = {...payload.growthBasic, name};
    }
    for (const key of ['guardian', 'perinatal', 'puberty']) {
      if (Object.hasOwn(data, key)) next[key] = data[key];
      else delete next[key];
    }
    // Use the chart's birth inputs. Its predecessor's SGA result belongs to
    // that visit and will only be loaded when the visit itself is opened.
    delete next.birth;
    if (next.perinatal) {
      next.perinatal = {...next.perinatal};
      for (const key of ['birthWeightSds', 'birthLengthSds', 'sdsSourceLabel', 'sdsSourceError', 'lengthSdsAvailable', 'catchUp']) {
        delete next.perinatal[key];
      }
    }
    return next;
  }
  async function loadVisit(patientId, choice, snapshot, afterOwnSave, isCurrent = () => true, transition) {
    if (!patientId || loading || saving || (trashChange && transition?.trashChange !== trashChange) ||
        !isCurrent() || !['new','restore','edit'].includes(choice)) return false;
    const scope = owner(patientId), api = w.VildaDataImportExport;
    if (!scope || !api || !w.VildaVisitContext) return false;
    const token = api.captureAcceptedPatientLoad({patientId});
    if (!token) return false;
    const allowed = () => isCurrent() && current(scope) && loading === scope && api.isAcceptedPatientLoadCurrent(token);
    loading = scope; notify();
    try {
      if (!(afterOwnSave ? afterOwnSave() : await guardLeave(transition?.modalOwner))) {
        transition?.onCancel?.();
        return false;
      }
      if (!allowed()) return false;
      const rows = await scope.vault.getPatientVisits(patientId);
      if (!allowed() || afterOwnSave && !afterOwnSave()) return false;
      const model = w.VildaHomeVisitComparisonModel;
      const identityOnly = rows.length === 0 && !snapshot && choice !== 'edit';
      let row = identityOnly ? await identityRow(scope) : model.latest(patientId, rows);
      if (!allowed() || afterOwnSave && !afterOwnSave()) return false;
      if (choice === 'edit' || snapshot) {
        if (!snapshot) return false;
        row = rows.find(item => item.patientId === patientId && item.snapshotId === snapshot.snapshotId &&
          item.visitId === snapshot.visitId && item.rev === snapshot.rev);
      }
      if (!row || (!identityOnly && (row.payload?.visit?.patientId !== patientId || row.payload.visit.visitId !== row.visitId))) return false;
      let payload = row.payload;
      if (choice === 'new') {
        const record = await scope.vault.getPatient(patientId);
        if (!allowed() || afterOwnSave && !afterOwnSave()) return false;
        const profile = record?.profile;
        if (!profile?.data?.user || !['legacy', 'ready'].includes(profile.status)) {
          const message = profile?.status === 'conflict'
            ? 'Kartoteka ma rozbieżne wersje. Sprawdź dane pacjenta przed rozpoczęciem wizyty.'
            : 'Nie można wczytać danych kartoteki. Otwórz ponownie kartę pacjenta.';
          w.VildaDymek?.pokaz(message, {ton: 'info'});
          return false;
        }
        payload = profileDraft(payload, profile.data);
      }
      if (transition?.beforeApply) {
        if (!transition.beforeApply()) {
          transition.onCancel?.();
          return false;
        }
        if (!allowed()) return false;
      }
      let finish;
      const done = new Promise(resolve => { finish = resolve; });
      const request = {choice, scope, finish, deadline: Date.now() + 12000,
        valid: () => isCurrent() && choiceRequest === request && loading === scope};
      choiceRequest = request;
      const timeout = w.setTimeout(() => finish(false), 12000);
      let chosen = false;
      try {
        const applied = api.runAcceptedPatientLoad(token, payload, {
          apply(value) {
            // Applying this record can dismiss the native surface that requested
            // it. Retire that surface check only at the accepted-load boundary.
            transition?.onApply?.();
            if (!allowed()) throw new Error('Zmienił się kontekst otwieranej wizyty.');
            scope.identityOnly = identityOnly && choice === 'restore';
            return w.applyLoadedData(value);
          },
          publish(authority) {
            request.detail = Object.assign({patientId, savedAtISO: row.savedAtISO, name: payload.name,
              snapshotCount: rows.reduce((count, item) => count + item.revisionCount, 0), source: 'pick'}, authority);
            working = null;
            d.dispatchEvent(new w.CustomEvent('vilda:patient-loaded', {detail: request.detail}));
          }
        });
        if (!applied) return false;
        chosen = await done;
      } finally { w.clearTimeout(timeout); if (choiceRequest === request) choiceRequest = null; }
      if (!chosen || !isCurrent() || !current(scope) || selected() !== patientId) return false;
      const visit = w.VildaVisitContext.capture(null, {patientId,readOnly:true});
      const empty = identityOnly && choice === 'restore';
      if (empty ? !!visit : !visit || (choice === 'new' ? visit.visitId === row.visitId : visit.visitId !== row.visitId)) return false;
      if (snapshot) w.sessionStorage.setItem(historicalFlag, '1');
      else w.sessionStorage.removeItem(historicalFlag);
      working = Object.assign(scope, {mode: choice === 'new' ? 'new' : (snapshot ? 'edit' : 'browse'),
        visitId: visit?.visitId || null, date: choice === 'new' ? visit.clinicalDateISO : row.clinicalDateISO || null,
        snapshotId: choice === 'new' || empty ? null : row.snapshotId,
        patientName: [payload.user?.firstName, payload.user?.lastName].filter(Boolean).join(' ') || payload.name || '',
        savedAtISO: row.savedAtISO || null,
        dateCertain: choice === 'new' || !!model.clinicalDate(row),
        sourceSnapshotId: identityOnly ? null : row.snapshotId, sourceMeasurementDate: model.measurementDate(row),
        sourceDownSyndrome: payload.clinical?.downSyndrome === true,
        revision: choice === 'new' || empty ? null : row.rev || 0});
      return true;
    } catch (_) { return false; }
    finally { if (loading === scope) loading = null; notify(); }
  }
  function start(patientId, isCurrent, transition) {
    return loadVisit(patientId, 'new', null, null, isCurrent, transition);
  }

  function canSave(patientId) {
    if (trashChange || !active(patientId) || working.mode === 'browse') return false;
    const visit = w.VildaVisitContext.capture(null, {patientId, readOnly: true});
    return !!visit && visit.patientId === patientId && visit.visitId === working.visitId;
  }

  // Native validation still rejects malformed, negative or zero values. Only
  // an intentionally empty control is optional on a known visit of this owner.
  function optionalField(payload, id, formDocument = d) {
    if (!['height','weight'].includes(id) || !payload || !payload.visit ||
        !active(payload.visit.patientId) || working.mode === 'browse' || payload.visit.visitId !== working.visitId) return false;
    const field = formDocument.getElementById(id);
    return !!field && String(field.value).trim() === '' && !(field.validity && field.validity.badInput);
  }
  function revisionTarget(payload) {
    if (trashChange) throw new Error('Poczekaj na zakończenie zmiany w koszu wizyt.');
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
  const blockedDocumentation = Object.freeze({
    blocked: true,
    message: 'Nie można teraz potwierdzić otwartej wizyty. Otwórz formularz ponownie.',
    isCurrent: () => false,
    ensureRecorded: () => Promise.resolve(false)
  });
  function captureBinding(patientId, options = {}) {
    if (!active(patientId) || working.mode === 'browse' || loading || saving || trashChange) return null;
    const scope = working, visitId = scope.visitId, date = scope.date;
    if (!date) return null;
    const writer = options.sourceWindow && w.parent?.VildaShell?.captureHomeVisitWriter(options.sourceWindow);
    if (options.sourceWindow && (!writer || writer.home !== w)) return null;
    const isCurrent = () => canSave(patientId) && working === scope && scope.visitId === visitId &&
      scope.date === date && (!writer || writer.isCurrent()) && (!options.isCurrent || options.isCurrent());
    if (!isCurrent()) return null;
    return Object.freeze({
      visitContext: Object.freeze({version: 1, visitId, clinicalDateISO: date}), isCurrent,
      ensureRecorded: async () => isCurrent() && await ensureRecorded(patientId, visitId, writer) && isCurrent()
    });
  }
  function captureDocumentationBinding(patientId, options) {
    if (!patientId || selected() !== patientId) return null;
    const item = state(patientId);
    if (item.mode === 'browse' && !item.requiresLatest && !item.busy) return null;
    return captureBinding(patientId, options) || blockedDocumentation;
  }
  function verified(scope, receipt) {
    return active(scope.patientId) && working === scope && receipt && receipt.saved === true &&
      receipt.referenceVerified === true && receipt.patientId === scope.patientId && !!receipt.snapshotId &&
      receipt.snapshotId === scope.snapshotId;
  }
  async function ensureRecorded(patientId, visitId, writer) {
    if (!active(patientId) || working.mode === 'browse' || working.visitId !== visitId || loading || saving || trashChange) return false;
    const scope = working;
    const canRecord = () => active(patientId) && working === scope && (!writer || writer.isCurrent());
    if (!canRecord()) return false;
    if (recording) return recording.scope === scope && await recording.promise && canRecord();
    if (scope.snapshotId) {
      const rows = await scope.vault.getPatientVisits(patientId);
      return canRecord() && rows.some(row => row.visitId === visitId &&
        row.snapshotId === scope.snapshotId && (scope.mode !== 'edit' || row.rev === scope.revision));
    }
    // A patient-level artifact may commit independently of the main form. Save
    // its encounter first, in the native encrypted store, only on submission.
    const source = writer ? writer.win : w;
    const submitted = source.VildaSaveStatusIndicator.getCurrentDecision();
    const promise = Promise.resolve().then(() => canRecord() && source.VildaDataImportExport.saveUserDataWithReceipt({})).then(receipt => {
      if (!canRecord() || !verified(scope, receipt)) return false;
      scope.artifactReceipt = receipt;
      scope.artifactSubmission = submitted.scope;
      return true;
    }).catch(() => false);
    const operation = {scope, promise};
    recording = operation;
    try { return await promise; }
    finally { if (recording === operation) recording = null; }
  }
  async function save(patientId, sourceWindow) {
    if (!canSave(patientId) || loading || saving) return false;
    // Only the shell can attest the current DocPro pane, its native save API,
    // its visit and both unlocked accounts. Never accept a caller's receipt.
    const shell = w.parent?.VildaShell;
    const writer = sourceWindow && shell?.captureHomeVisitWriter(sourceWindow);
    if (sourceWindow && (!writer || writer.home !== w || !writer.isCurrent())) return false;
    const source = writer ? writer.win : w, sourceDocument = source.document;
    const scope = working;
    const currentWriter = () => active(patientId) && working === scope && (!writer || writer.isCurrent());
    function changed() {
      notify();
      if (writer && source.document === sourceDocument) sourceDocument.dispatchEvent(new source.CustomEvent('vilda:home-encounter-changed'));
    }
    saving = scope; changed();
    try {
      if (recording && (recording.scope !== scope || !await recording.promise)) return false;
      if (!currentWriter()) return false;
      // A keyboard save leaves the edited native input focused. Commit its
      // pending change before taking the submission and accepted-load receipts:
      // disabling that field during the subsequent restore would otherwise send
      // a trusted change belonging to the old form to the new load.
      const focused = sourceDocument.activeElement;
      if (focused?.matches('input, select, textarea') && sourceDocument.getElementById('calcForm')?.contains(focused)) focused.blur();
      if (!currentWriter()) return false;
      const status = source.VildaSaveStatusIndicator;
      let result = scope.artifactReceipt, submitted = scope.artifactSubmission;
      const decision = status.getCurrentDecision();
      // An independently saved artifact can complete a consultation without
      // another version. A different pane must submit its own live form.
      if (writer || !verified(scope, result) || !status.isSubmittedFormCurrent(submitted) && !(decision.ready && decision.state === 'saved')) {
        submitted = decision.scope;
        result = await source.VildaDataImportExport.saveUserDataWithReceipt({});
      }
      if (!verified(scope, result) || !currentWriter()) return false;
      if (scope.mode === 'new') { scope.artifactReceipt = result; scope.artifactSubmission = submitted; }
      const unchanged = () => currentWriter() && verified(scope, result) && status.isSubmittedFormCurrent(submitted);
      // Do not lock a form that received another edit while the vault was saving.
      // Its next submission updates the same committed snapshot.
      for (let turn = 0; turn < 20 && !unchanged() && currentWriter(); turn++) {
        await new Promise(resolve => { w.setTimeout(resolve, 50); });
      }
      if (!unchanged()) return true;
      if (scope.mode === 'new') {
        const model = w.VildaHomeVisitComparisonModel;
        const rows = await scope.vault.getPatientVisits(patientId);
        if (!unchanged()) return true;
        const latest = model.latest(patientId, rows);
        if (latest?.snapshotId === scope.snapshotId && latest.visitId === scope.visitId && latest.rev === scope.revision) {
          Object.assign(scope, {mode: 'browse', date: latest.clinicalDateISO, dateCertain: !!model.clinicalDate(latest),
            sourceSnapshotId: latest.snapshotId, sourceMeasurementDate: model.measurementDate(latest),
            sourceDownSyndrome: latest.payload.clinical?.downSyndrome === true});
          return true;
        }
      }
      saving = null;
      if (writer) await writer.showSavedHistory(result, submitted);
      else await loadVisit(patientId, 'restore', null, unchanged);
      return true;
    } finally { if (saving === scope) saving = null; changed(); }
  }
  // Confirmation belongs to this exact consultation, revision and open chart.
  // A later patient or revision must obtain a new confirmation.
  function captureVisitTrash(patientId) {
    if (!active(patientId) || working.mode !== 'edit' || !working.snapshotId) return null;
    const scope = working;
    const screen = w.VildaHomeGabinet.capturePatientScreen(patientId);
    const {visitId, snapshotId, revision, patientName, savedAtISO, date, dateCertain} = scope;
    const isCurrent = () => screen() && active(patientId) && working === scope && scope.mode === 'edit' &&
      scope.visitId === visitId && scope.snapshotId === snapshotId && scope.revision === revision;
    if (!isCurrent()) return null;
    return Object.freeze({patientId, visitId, snapshotId, revision, patientName, savedAtISO, date, dateCertain, isCurrent,
      moveToTrash() {
        return changeVisitTrash(scope, visitId, isCurrent, screen, 'move', valid =>
          scope.vault.moveVisitToTrash(patientId, visitId, {snapshotId, revision, isCurrent: valid}));
      }});
  }

  async function restoreTrashedVisit(patientId, group, stillOpen) {
    const scope = owner(patientId);
    if (!scope || group?.patientId !== patientId || !group.visitId || !group.trashId || typeof stillOpen !== 'function') return false;
    const {visitId, trashId} = group;
    const prior = working;
    const screen = w.VildaHomeGabinet.capturePatientScreen(patientId);
    const isCurrent = () => screen() && current(scope) && working === prior && stillOpen();
    if (loading || saving || recording || trashChange || !isCurrent() || !await guardLeave()) return false;
    return changeVisitTrash(scope, visitId, isCurrent, screen, 'restore', valid =>
      scope.vault.restoreTrashedVisit(patientId, visitId, {trashId, isCurrent: valid}));
  }

  async function changeVisitTrash(scope, visitId, isCurrent, screen, action, commit) {
    if (loading || saving || recording || trashChange || !isCurrent()) return false;
    // Keep any independently edited note or plan open until it is saved or cancelled.
    if (w.VildaHomePatient?.isInlineOpen() && !w.VildaHomePatient.closeInline(false)) {
      throw new Error('Najpierw zapisz lub zamknij otwarty formularz w Karcie pacjenta.');
    }
    if (!isCurrent()) return false;
    const operation = {}, patientId = scope.patientId;
    const prior = working;
    trashChange = operation; notify();
    try {
      const receipt = await commit(() => trashChange === operation && isCurrent());
      if (receipt?.patientId !== patientId || receipt.visitId !== visitId || !receipt.trashId) {
        throw new Error('Nie udało się potwierdzić zmiany w koszu wizyt.');
      }
      // The committed operation remains successful if its patient or account
      // has since left the screen. Never reselect a patient in that case.
      if (!current(scope) || selected() !== patientId || working !== prior) return true;
      working = null;
      w.sessionStorage.setItem(historicalFlag, '1');
      const samePatient = () => trashChange === operation && current(scope) && selected() === patientId;
      const canRefresh = () => samePatient() && screen();
      const loaded = await loadVisit(patientId, 'restore', null, canRefresh, canRefresh, {trashChange: operation});
      if (!samePatient()) return true;
      if (loaded) {
        if (screen()) w.VildaHomeGabinet.openOverview('antro');
      } else if (!working) {
        // The encrypted change is complete. Drop the obsolete form and its
        // session copy rather than leave the deleted patient data on screen.
        const report = screen();
        w.VildaDataImportExport.clearAllData();
        if (report) {
          w.VildaHomeGabinet.showStart();
          w.alert((action === 'move' ? 'Wizyta jest w koszu.' : 'Wizyta została przywrócona.') +
            ' Wybierz pacjenta ponownie, aby wczytać aktualne dane.');
        }
      }
      return true;
    } finally {
      if (trashChange === operation) trashChange = null;
      notify();
    }
  }
  function history(patientId, patientName, initialVisitId = null) {
    const scope = owner(patientId);
    if (!scope || selected() !== patientId || !w.VildaHomeGabinet?.openVisitHistory) return false;
    if (initialVisitId && (!active(patientId) || working.mode !== 'browse' ||
        working.visitId !== initialVisitId || !working.snapshotId || loading || saving)) return false;
    const isCurrent = () => current(scope) && selected() === patientId;
    const options = {
      patientName, initialVisitId, isCurrent,
      async onEdit(row, beforeApply, modalOwner) {
        let declined = false;
        const ok = await loadVisit(patientId, 'edit', row, null, isCurrent, {beforeApply, modalOwner, onCancel: () => { declined = true; }});
        if (!ok && !declined && isCurrent()) w.alert('Nie otwarto wizyty do edycji. Otwórz ponownie historię i wybierz aktualny zapis.');
        return ok;
      },
      async onStart(beforeApply, modalOwner) {
        let declined = false;
        const ok = await start(patientId, isCurrent, {beforeApply, modalOwner, onCancel: () => { declined = true; }});
        if (!ok && !declined && isCurrent()) w.alert('Nie rozpoczęto nowej wizyty. Otwórz ponownie historię i spróbuj ponownie.');
        return ok;
      }
    };
    return w.VildaHomeGabinet.openVisitHistory(patientId, options);
  }
  d.addEventListener('vilda:patient-loaded', event => {
    const detail = event.detail;
    if (!detail || detail.source !== 'save' && (!choiceRequest || detail !== choiceRequest.detail)) {
      working = null; notify();
    }
  });
  d.addEventListener('vilda:user-state-cleared', () => { working = null; notify(); });
  w.VildaHomeEncounter = Object.freeze({load, start, state, save, canSave, history, guardLeave, consumeChoice, optionalField, revisionTarget, saved, captureBinding, captureDocumentationBinding, ensureRecorded,
    captureVisitTrash, restoreTrashedVisit, isIdentityOnly, profileDraft});
})(window, document);

/* A blank rapid intake belongs to the open account and carries its own visit
 * UUID. The native encrypted patient store is written only on explicit Save. */
(function (w, d) {
  'use strict';
  if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return;
  const drafts = new WeakMap();
  function sexCode(value) { return value === 'K' ? 'F' : ['F', 'M'].includes(value) ? value : ''; }
  function read(visit) {
    const form = w.VildaDataImportExport;
    if (!form.getSaveReadiness().ready) throw new Error('Poczekaj na zakończenie wczytywania formularza.');
    const payload = form.captureCurrentUserDataReadOnly();
    if (payload.patientId || payload.visit?.patientId || payload.visit && payload.visit.visitId !== visit.visitId || payload.user?.dobISO) {
      throw new Error('Otwórz pustą Szybką ścieżkę, aby zapisać nową wizytę.');
    }
    const user = payload.user;
    if (!user?.firstName?.trim() || !user.lastName?.trim()) throw new Error('Wpisz imię i nazwisko pacjenta.');
    if (!Number.isInteger(user.age) || user.age < 0 || user.age > 130 ||
        !Number.isInteger(user.ageMonths ?? 0) || (user.ageMonths ?? 0) < 0 || (user.ageMonths ?? 0) > 11 ||
        !Number.isFinite(user.height) || user.height <= 0 || !Number.isFinite(user.weight) || user.weight <= 0) {
      throw new Error('Sprawdź wiek, masę ciała i wzrost pacjenta.');
    }
    user.firstName = user.firstName.trim(); user.lastName = user.lastName.trim();
    user.sex = sexCode(d.getElementById('sex')?.value);
    user.measuredAtISO = visit.clinicalDateISO;
    payload.name = [user.lastName, user.firstName].join(' ');
    payload.visit = {...visit};
    return payload;
  }
  function matches(vault, rows, payload) {
    const key = vault.normalizePatientName, user = payload.user;
    return rows.filter(({header: h}) => h && !h.external && (h.firstName && h.lastName
      ? key(h.firstName) === key(user.firstName) && key(h.lastName) === key(user.lastName)
      : key(h.name) === key(payload.name))).map(({patientId, header, lastSavedAtISO}) => {
      const dobISO = header.dobISO || '', known = dobISO && vault.calcAgeFromDOB(dobISO, payload.visit.clinicalDateISO);
      const sex = sexCode(header.sex), age = known ? known.years : header.age ?? null;
      const ageMonths = known ? known.ageMonths : header.ageMonths ?? null;
      const mismatch = Boolean((sex && user.sex !== sex) || (known && (age !== user.age ||
        (age < 18 || user.ageMonths > 0) && ageMonths !== (user.ageMonths || 0))));
      return {patientId, name: header.name, dobISO, age, ageMonths, sex, mismatch,
        shortId: vault.shortHashOfPatientId(patientId), lastSavedAtISO};
    });
  }
  function retainPatientFacts(payload, previous) {
    if (previous.guardian) payload.guardian = previous.guardian;
    if (previous.clinical) payload.clinical = previous.clinical;
    for (const key of ['perinatal', 'puberty']) {
      if (!payload[key] && previous[key]) payload[key] = previous[key];
    }
    for (const key of ['ghTherapyPoints', 'obesityTherapyPoints', 'bisphosTherapyPoints']) {
      if (!payload[key]?.length && previous[key]?.length) payload[key] = previous[key];
    }
    for (const field of ['motherHeight', 'fatherHeight']) {
      if (payload.advanced && !payload.advanced[field] && previous.advanced?.[field]) {
        payload.advanced[field] = previous.advanced[field];
      }
    }
    // Archive the previous visit's current measurement using the same clinical
    // rules as the native new-visit action, including bone age and GH markers.
    w.VildaDataImportExport._ensureCurrentMeasurementInHistory(previous);
    const bone = w.VildaBoneAge, known = bone.readPayload(previous), enteredBone = bone.readPayload(payload);
    if (payload.advanced && (known.current || known.last)) {
      const context = {version:1, current:enteredBone.current, last:enteredBone.last || known.current || known.last};
      payload.advanced.boneAgeContext = context;
      payload.advanced.boneAgeYears = bone.currentYearsFor(payload.advanced, payload.user.age * 12 + (payload.user.ageMonths || 0));
      if (!payload.advanced.data) payload.advanced.data = {};
      payload.advanced.data.boneAgeContext = context;
      payload.advanced.data.boneAgeMonths = Math.round((context.current || context.last).years * 12);
    }
    for (const key of ['advanced', 'growthBasic']) {
      const prior = previous[key]?.data?.measurements;
      if (!prior?.length) continue;
      const section = payload[key] || (payload[key] = {}), data = section.data || (section.data = {});
      const entered = Array.isArray(data.measurements) ? data.measurements : [];
      const age = row => Number.isFinite(row.ageMonths) ? row.ageMonths : Math.round(row.ageYears * 12);
      const same = (a, b) => age(a) === age(b) && a.height === b.height && a.weight === b.weight;
      data.measurements = entered.concat(prior.filter(row => !entered.some(item => same(item, row))));
    }
  }
  async function persist(options, state, vault, assertCurrent) {
    const {visit, choice} = options;
    assertCurrent();
    const payload = read(visit);
    // Resolve identity from a complete decrypted directory. A failed read must
    // never masquerade as zero matching people and create a duplicate.
    const rows = await vault.listPatientDirectory({isCurrent: () => { assertCurrent(); return true; }});
    assertCurrent();
    const candidates = matches(vault, rows, payload);
    const candidate = choice?.patientId && candidates.find(row => row.patientId === choice.patientId);
    if (choice?.patientId && !candidate || candidates.length && !candidate && !choice?.newPatient) return {status:'choose', candidates};
    if (candidate?.mismatch) return {status:'mismatch', candidate};
    const rapidVisit = {assertCurrent, explicitNew: choice?.newPatient === true};
    const saveOptions = {rapidVisit, dedup:false, forceNew:!candidate};
    if (candidate) {
      // The latest write guards this patient record; the latest clinical visit
      // supplies its longitudinal facts even when an older visit was saved later.
      const [latest, visits, record] = await Promise.all([vault.getLatestSnapshot(candidate.patientId),
        vault.getPatientVisits(candidate.patientId), vault.getPatient(candidate.patientId)]);
      assertCurrent();
      if (!latest?.payload || !latest.snapshotId) throw new Error('Kartoteka zmieniła się. Wybierz pacjenta ponownie.');
      const profile = record?.profile;
      if (!profile?.data?.user || !['legacy', 'ready'].includes(profile.status)) {
        throw new Error('Sprawdź aktualne dane kartoteki przed zapisaniem wizyty.');
      }
      const source = w.VildaHomeVisitComparisonModel.latest(candidate.patientId, visits);
      if (visits.length && !source) throw new Error('Nie udało się wskazać aktualnej wizyty pacjenta.');
      const previous = w.VildaHomeEncounter.profileDraft(source?.payload || latest.payload, profile.data);
      const updated = matches(vault, [{patientId:candidate.patientId,
        header:{...previous.user, name:previous.name, external:record.header?.external}}], payload)[0];
      if (!updated || candidate.dobISO !== updated.dobISO || candidate.sex !== updated.sex) return {status:'choose', candidates};
      if (candidate.dobISO) payload.user.dobISO = candidate.dobISO;
      if (candidate.sex) payload.user.sex = candidate.sex;
      retainPatientFacts(payload, previous);
      if (source) {
        rapidVisit.source = {snapshotId:source.snapshotId, revision:source.rev || 0, updatedAtISO:source.updatedAtISO};
      }
      // Default anti-clobber uses the technical head. The clinical source above
      // already supplies growth history and previous bone age for this new visit.
      saveOptions.skipAdvancedAntiClobber = true;
      Object.assign(rapidVisit, {patientId:candidate.patientId,snapshotId:latest.snapshotId,revision:latest.rev || 0});
      saveOptions.patientId = candidate.patientId;
    }
    assertCurrent();
    const result = await vault.savePatient(payload, saveOptions);
    assertCurrent();
    state.receipt = {status:'saved',patientId:result.patientId,snapshotId:result.snapshotId};
    return state.receipt;
  }
  function save(options) {
    const vault = w.VildaVault, visit = options?.visit;
    const assertCurrent = () => {
      vault.assertSyncOperationSession(options.session);
      if (!vault.isUnlocked() || !options.isCurrent() || w.sessionStorage.getItem('vildaCurrentPatientId') ||
        !visit || visit.origin !== 'explicit' || visit.patientId || !visit.visitId) throw new Error('Szybka ścieżka nie jest już aktywna.');
    };
    assertCurrent();
    const state = drafts.get(visit) || {};
    drafts.set(visit, state);
    if (state.receipt) return Promise.resolve(state.receipt);
    if (!state.pending) state.pending = persist(options, state, vault, assertCurrent).finally(() => { state.pending = null; });
    return state.pending;
  }
  w.VildaRapidPatientSave = Object.freeze({save});
})(window, document);
