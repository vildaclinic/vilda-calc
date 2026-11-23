/* DocPro presentation follows the explicitly opened encounter in the shell.
 * This adapter changes only control availability: no values, events, clinical
 * calculations, session buffers or patient records are written here.
 */
(function (w) {
  'use strict';
  const d = w.document;
  if (!d || w.__VILDA_HOME_GABINET_PREVIEW__ !== true || w.VildaDocproVisitGuard ||
      !/(?:^|\/)docpro\.html$/.test(w.location.pathname)) return;

  const fields = '.main-content input, .main-content select, .main-content textarea, ' +
    '#ghZWierszaPanel input, #ghZWierszaPanel select';
  // These are display/account/PDF choices, not edits to the patient's visit.
  const displayIds = new Set(['isDoctor', 'pwzNumber', 'pulseOnce', 'ghTherapyViewMode']);
  const actions = [
    '#dobClear', '#restoreStateBtn', '#advAddMeasurementBtn', '#advClearBtn',
    '#basicGrowthAddMeasurementBtn', '#basicGrowthClearBtn', '#intakeAddRow',
    '#resetSgaBirth', '#computeSgaBirth', '#btnZscorePalczewska', '#btnZscoreOlaf', '#computeZscoreBatch',
    '#obesityPrefillBtn', '#btnGhStart', '#btnGhContinue', '#btnGhEnd',
    '#btnGhRetro', '#btnGhRetroAdd', '#ghDamagedRemoveBtn', '#ghZWierszaZapisz',
    '#tzAdd90', '#tzAdd180', '#tzAddManual', '.gh-uszkodzone-napraw',
    '.edit-gh-pt-btn', '.delete-gh-pt-btn', '.obm-edit', '.obm-del', '.obm-msg-btn', '.bpm-del',
    '.remove-measure', '.remove-intake-row', '.remove-row', '.add-row',
    '[data-cel-wlasny-choice]', '[data-puberty-stage]', '#obesityDoseHints button[data-dawka]',
    '#therPenNote button[data-gh-dawka]', '#snackList button.icon', '#mealList button.icon',
    'button[onclick*="obesityAddTherapyPoint"]', 'button[onclick*="bisphosAddTherapyPoint"]',
    '#ghDeleteOverlay button:last-child'
  ].join(',');
  const owned = new Map(), watched = new WeakSet();
  let observer = null, queued = false, applying = false, dirty = true, paintedMode = null;
  let readOnly = false;

  function embeddedShell() {
    try {
      const frame = w.frameElement;
      if (!frame?.classList.contains('app-pane') || w.parent === w) return {embedded: false, shell: null};
      return {embedded: true, shell: w.parent.VildaShell || null};
    } catch (_) { return {embedded: true, shell: null}; }
  }
  function state() {
    // Independent DocPro remains an independent calculator, including when no
    // patient has been selected. Only the opted-in app shell owns this gate.
    const context = embeddedShell(), shell = context.shell;
    if (!context.embedded) return {readOnly: false, mode: 'standalone'};
    if (!shell) return {readOnly: true, mode: 'preparing'};
    try {
      const api = w.VildaDataImportExport, auth = w.VildaAuthUI;
      if (d.readyState === 'loading' || !api || !auth?.isBootReady?.() ||
          api.isMainSessionRestorePending() || w.__vildaPersistRestoring || w.__vildaLustroWpis ||
          Number(w.__vildaPersistClearUntil || 0) > Date.now() || w.VildaPersistence?.isClearInProgress?.() ||
          w.VildaPanelPacjent?.nieaktualny?.() ||
          w.VildaDobAge?.restorePending?.() || !w.VildaDocproStatePersistence?.isReady?.())
        return {readOnly: true, mode: 'preparing'};
      const patientId = w.sessionStorage.getItem('vildaCurrentPatientId');
      if (!patientId) return w.VildaPanelPacjent?.wlasciciel?.()
        ? {readOnly: true, mode: 'preparing'} : {readOnly: false, mode: 'calculator'};
      const writer = shell.captureHomeVisitWriter?.(w);
      return writer?.isCurrent() === true
        ? {readOnly: false, mode: 'edit'} : {readOnly: true, mode: 'browse'};
    } catch (_) { return {readOnly: true, mode: 'preparing'}; }
  }
  function isField(control) {
    if (!control?.matches?.(fields) || displayIds.has(control.id) ||
        control.name === 'palPdfLayout' ||
        control.closest('dialog, #vilda-auth-ui-root, [data-patient-report-pdf-dialog]')) return false;
    return !['hidden', 'button', 'submit', 'reset'].includes(String(control.type).toLowerCase());
  }
  function isAction(control) {
    return !!control?.matches?.(actions) && !!control.closest('.main-content, #ghDeleteOverlay, #ghZWierszaPanel');
  }
  function property(control) {
    if (!isField(control)) return 'disabled';
    return control.tagName === 'TEXTAREA' || control.tagName === 'INPUT' &&
      !['checkbox', 'radio', 'file', 'range', 'color'].includes(String(control.type).toLowerCase()) ? 'readOnly' : 'disabled';
  }
  function readNativeChanges(records) {
    // Observe native policies while our lock is active. In particular, a DOB,
    // identity or GH controller can add/remove its own lock during restoration.
    // Our writes happen with this observer disconnected and cannot become the
    // baseline that is restored when the encounter becomes editable.
    if (records?.length) dirty = true;
    for (const record of records || []) {
      const item = owned.get(record.target);
      if (item && record.type === 'attributes' &&
          record.attributeName === (item.property === 'readOnly' ? 'readonly' : 'disabled'))
        item.native = !!record.target[item.property];
    }
  }
  function observe() {
    if (observer && d.documentElement) observer.observe(d.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['readonly', 'disabled']
    });
  }
  function release(control, item) {
    if (item.guardOnly !== true) control[item.property] = item.native;
    if (item.aria === null) control.removeAttribute(item.ariaName);
    else control.setAttribute(item.ariaName, item.aria);
    control.removeAttribute('data-docpro-visit-readonly');
    owned.delete(control);
  }
  function bindVault() {
    const vault = w.VildaVault;
    if (!vault || watched.has(vault)) return;
    watched.add(vault);
    vault.onLock?.(refresh);
    vault.onUnlock?.(refresh);
  }
  function refresh() {
    if (applying) return;
    bindVault();
    readNativeChanges(observer?.takeRecords());
    const next = state();
    // Invocation still validates the current native writer. Repainting every
    // field on each key/click is unnecessary when no native control changed.
    if (!dirty && paintedMode === next.mode && readOnly === next.readOnly) return;
    readOnly = next.readOnly;
    applying = true;
    observer?.disconnect();
    try {
      const candidates = new Set(Array.from(d.querySelectorAll(fields + ',' + actions))
        .filter(control => isField(control) || isAction(control)));
      for (const [control, item] of owned) if (!readOnly || !candidates.has(control)) release(control, item);
      if (readOnly) for (const control of candidates) {
        let item = owned.get(control);
        if (!item) {
          const key = property(control), ariaName = key === 'readOnly' ? 'aria-readonly' : 'aria-disabled';
          item = {property: key, native: !!control[key], ariaName, aria: control.getAttribute(ariaName),
            // The accepted native loader activates Restore programmatically.
            // Keep that path; trusted pointer/keyboard activation is guarded below.
            guardOnly: control.id === 'restoreStateBtn'};
          owned.set(control, item);
        }
        if (!item.guardOnly && control[item.property] !== true) control[item.property] = true;
        if (control.getAttribute(item.ariaName) !== 'true') control.setAttribute(item.ariaName, 'true');
        control.setAttribute('data-docpro-visit-readonly', '');
      }
      d.documentElement.dataset.docproVisitMode = next.mode;
      paintedMode = next.mode;
      dirty = false;
    } finally { applying = false; observe(); }
  }
  function schedule(records) {
    readNativeChanges(records);
    if (queued) return;
    queued = true;
    w.queueMicrotask(() => { queued = false; refresh(); });
  }
  function preventEdit(event) {
    // Native restore/calculation producers use synthetic events to present the
    // saved record; those events are not a clinician editing its fields.
    if (!event.isTrusted) return;
    const target = event.target?.closest?.('input, select, textarea, button, [role="button"]');
    if (!target || !isField(target) && !isAction(target)) return;
    refresh(); // Recheck the real owner at invocation, not just the last paint.
    if (!readOnly) return;
    if (event.type === 'keydown') {
      if (['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      if ((event.ctrlKey || event.metaKey) && !['v', 'x', 'z', 'y'].includes(event.key.toLowerCase())) return;
      if (isField(target) && property(target) === 'readOnly' &&
          ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    }
    if (event.type === 'click' && isField(target) && property(target) === 'readOnly') return;
    if (event.type === 'pointerdown' && isField(target) && property(target) === 'readOnly') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  ['beforeinput', 'input', 'change', 'paste', 'cut', 'drop', 'keydown', 'pointerdown', 'click'].forEach(type =>
    d.addEventListener(type, preventEdit, true));
  ['DOMContentLoaded', 'vilda:auth-loaded', 'vilda:auth-boot-settled', 'vilda:session-changed',
    'vilda:patient-loaded', 'vilda:user-state-cleared', 'vilda:persist-restored', 'vilda:main-session-restored',
    'vilda:state-restored', 'vilda:docpro-state-ready', 'vilda:dob-restored', 'vilda:home-encounter-changed']
    .forEach(type => d.addEventListener(type, refresh));
  w.addEventListener('pageshow', refresh);
  w.addEventListener('storage', event => {
    if (event.key === 'vildaCurrentPatientId' || event.key === null) refresh();
  });
  w.VildaDocproVisitGuard = Object.freeze({refresh, isReadOnly: () => state().readOnly});
  if (typeof w.MutationObserver === 'function') observer = new w.MutationObserver(schedule);
  refresh();
})(window);
