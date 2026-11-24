/* The opt-in workspace arranges the original clinical tools. The selected
 * patient, encounter data, and editor lifetimes belong to the native actors. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_GABINET_PREVIEW__ !== true || w.VildaHomeGabinet) return;
  const d = w.document;
  let root, main, header, entryHeader, landing, overview, analysis, picker, historyHost, historyView;
  let account = null, screen = 'start', target = null, section = 'antro';
  let sequence = 0, selecting = false, frame = 0, pendingNote = null, pendingOfficeRecord = null;
  let rapid = null, rapidHeader, entryView = 'launch';
  let registration = null, registrationHost;
  let displayedVisit = null;
  const labels = {overview: 'Przegląd', analysis: 'Analiza'};
  const entryTrails = {
    start: [null,'Ekran startowy'], office: ['Ekran startowy'],
    registration: ['Ekran startowy','Dodaj pacjenta'], rapid: ['Ekran startowy','Szybka ścieżka'],
    history: ['Karta pacjenta','Historia wizyt']
  };
  const paths = {
    home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    overview: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/>',
    analysis: '<path d="M3 3v17h18M6 15l4-5 4 2 6-7"/>',
    history: '<path d="M3 11a9 9 0 1 1 2 7M2 4v7h7m3-4v5l4 2"/>',
    calendar: '<path d="M8 3v4m8-4v4M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
    lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/>',
    edit: '<path d="m14 6 4 4M4 20l4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/>',
    start: '<path d="M12 5v14M5 12h14"/>', save: '<path d="m4 12 5 5L20 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>', down: '<path d="m6 9 6 6 6-6"/>'
  };
  function icon(key) {
    return '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65">' + paths[key] + '</svg>';
  }
  function field(id) { return d.getElementById(id)?.value?.trim() || ''; }
  function access() {
    const vault = w.VildaVault;
    return vault?.isUnlocked() && w.VildaAuthUI?.isBootReady() && w.VildaProAccess?.hasAccess() ? vault.getCurrentUser()?.userId || null : null;
  }
  function selected() {
    try { return w.sessionStorage.getItem('vildaCurrentPatientId'); } catch (_) { return null; }
  }
  function owns(id) {
    return !!id && !!account && account === access() && selected() === id && !w.VildaPanelPacjent?.nieaktualny() &&
      w.VildaPanelPacjent?.wlasciciel() === id && !w.__vildaPersistRestoring &&
      !w.VildaDataImportExport?.isMainSessionRestorePending();
  }
  function capturePatientScreen(id) {
    if (!owns(id)) return () => false;
    const ticket = sequence;
    return () => !!root && !!account && account === access() && sequence === ticket &&
      screen !== 'start' && target === id && selected() === id &&
      (!w.frameElement?.classList.contains('app-pane') || w.parent.VildaShell?.getCurrentRoute() === 'start');
  }
  function showMessage(text) { root.querySelector('.vhome-gabinet-message').textContent = text; }
  function patientPresentation() {
    return target && owns(target) ? w.VildaHomePatient?.getPatientPresentation?.(target) : null;
  }
  function patientName() {
    return patientPresentation()?.displayName || [field('firstName'), field('lastName')].filter(Boolean).join(' ') || field('name') || 'Pacjent';
  }
  function setVisitMenu(open, restoreFocus = false) {
    const toggle = header.querySelector('[data-visit-actions]');
    if (toggle.getAttribute('aria-expanded') === String(open)) return;
    if (restoreFocus) toggle.focus({preventScroll: true});
    const menu = header.querySelector('#gbVisitActions');
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (open) menu.querySelector('button:not([hidden]):enabled')?.focus({preventScroll: true});
  }
  function visitMeasurementsReadOnly() {
    if (isRapidIntake()) return !!rapid.receipt || rapid.busy;
    // Documents can use the selected patient after the patient screen has closed.
    const id = target || selected();
    if (!id) return false;
    if (!owns(id)) return true;
    const mode = w.VildaHomeEncounter.state(id).mode;
    return mode !== 'new' && mode !== 'edit';
  }
  function headerState() {
    const status = w.VildaHomeEncounter.state(target);
    const shell = w.parent?.VildaShell, route = shell?.peekPatientReturnRoute?.();
    const parentLabel = shell?.routes?.[route]?.title || 'Gabinet';
    const breadcrumb = header.querySelector('[data-start]');
    breadcrumb.querySelector('span').textContent = parentLabel;
    breadcrumb.setAttribute('aria-label', 'Wróć do: ' + parentLabel);
    const draft = status.mode === 'new' || status.mode === 'edit';
    const identity = patientPresentation();
    const birth = identity ? identity.dobISO : w.VildaDobAge?.readISO(), day = draft && status.date ? new Date(status.date + 'T12:00:00') : new Date();
    const age = birth && w.VildaDobAge.ageFromDobISO(birth, day);
    const years = field('age'), months = field('ageMonths');
    const ageText = age ? w.VildaDobAge.describeAge(age) : years || months ? w.VildaDobAge.describeAge({years: Number(years), ageMonths: Number(months)}) + (identity ? ' w zapisie' : '') : '';
    header.querySelector('h1').textContent = patientName();
    header.querySelector('.gb-identity-meta').textContent = [ageText, birth && 'ur. ' + birth.split('-').reverse().join('.')].filter(Boolean).join(' · ');
    const stateLabel = draft ? (status.mode === 'edit' ? 'Edycja wizyty' : 'Nowa wizyta') :
      status.visitId ? 'Ostatnia wizyta' : 'Karta pacjenta';
    const context = header.querySelector('.gb-visit-context');
    const readOnly = !draft && !!status.visitId;
    context.hidden = !draft && !readOnly;
    const contextLabel = context.querySelector('[data-state-label]');
    contextLabel.textContent = readOnly ? '' : stateLabel;
    contextLabel.hidden = readOnly;
    context.querySelector('.gb-readonly-badge').hidden = !readOnly;
    const date = status.dateCertain && status.date ? status.date : '';
    const formatted = date.split('-').reverse().join('.');
    const time = context.querySelector('time');
    if (date) time.dateTime = date; else time.removeAttribute('datetime');
    time.textContent = formatted || 'Data nieustalona';
    const formLabel = analysis.querySelector('.vhome-card-heading > span');
    if (formLabel) formLabel.textContent = stateLabel;
    const button = header.querySelector('[data-home-encounter]');
    const action = draft ? 'save' : 'start';
    const actionLabel = status.mode === 'edit' ? 'Zapisz zmiany' : draft ? 'Zapisz wizytę' : 'Nowa wizyta';
    const caption = button.querySelector('[data-action-caption]');
    if (caption.textContent !== actionLabel) {
      button.dataset.homeEncounter = action;
      caption.innerHTML = icon(action) + '<span>' + actionLabel + '</span>';
    }
    const busy = !!status.busy || selecting;
    button.disabled = busy;
    const edit = header.querySelector('[data-edit-visit]');
    const canEdit = readOnly && !!status.snapshotId;
    if (displayedVisit && (displayedVisit.patientId !== target || displayedVisit.visitId !== status.visitId ||
      displayedVisit.snapshotId !== status.snapshotId || displayedVisit.revision !== status.revision || !canEdit)) setVisitMenu(false, true);
    displayedVisit = canEdit ? {patientId: target, visitId: status.visitId, snapshotId: status.snapshotId, revision: status.revision} : null;
    edit.hidden = !canEdit;
    edit.querySelector('span').textContent = formatted ? 'Edytuj wizytę z ' + formatted : 'Edytuj wizytę';
    header.querySelector('[data-trash-visit]').hidden = status.mode !== 'edit' || !status.snapshotId;
    header.querySelector('[data-visit-actions]').disabled = busy;
    if (busy) setVisitMenu(false);
    header.querySelectorAll('[role="tab"]').forEach(tab => {
      const active = screen === tab.dataset.screen;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }
  function destroyPicker() {
    picker?.destroy();
    picker = null;
  }
  function detach(force) {
    return !w.VildaHomePatient?.isInlineOpen?.() || w.VildaHomePatient.closeInline(force) !== false;
  }
  function dismissHistory() {
    if (!historyView) return;
    const previous = historyView;
    historyView = null;
    previous.destroy();
    historyHost.hidden = true;
  }
  function openVisitHistory(id, options) {
    if (!root || !owns(id) || target !== id || screen === 'start' || !options.isCurrent()) return false;
    if (historyView) return true;
    const focus = d.activeElement?.closest('[role="menuitem"]') ? overview.querySelector('.vhome-b1-menu-toggle') :
      header.querySelector('[data-visit-actions]');
    const scroll = w.scrollY;
    function back(restore = true) {
      dismissHistory();
      render();
      if (restore && owns(id)) {
        w.scrollTo(0, scroll);
        focus?.focus({preventScroll: true});
      }
      return true;
    }
    historyHost.hidden = false;
    const inPatientScreen = capturePatientScreen(id);
    const view = w.VildaHomeVisitHistory.mount(historyHost, {
      ...options, patientId: id, isCurrent: () => inPatientScreen() && owns(id) && options.isCurrent(),
      backLabel: screen === 'analysis' ? 'Wróć do analizy' : 'Wróć do przeglądu',
      onBack: back,
      onEdit(row, isActionCurrent, modalOwner) {
        if (!historyView || !inPatientScreen() || !owns(id) || typeof isActionCurrent !== 'function' || !isActionCurrent()) return false;
        const editing = historyView;
        // Keep the history visible while the clinician decides about a draft.
        // The native form must be available when the verified revision loads.
        return options.onEdit(row, () => historyView === editing && inPatientScreen() && owns(id) && isActionCurrent() && back(), modalOwner);
      },
      onStart(isActionCurrent, modalOwner) {
        if (!historyView || !inPatientScreen() || !owns(id) || typeof isActionCurrent !== 'function' || !isActionCurrent()) return false;
        const starting = historyView;
        return options.onStart(() => historyView === starting && inPatientScreen() && owns(id) && isActionCurrent() && back(), modalOwner);
      },
      onOpenRecord(key) {
        if (owns(id)) { back(false); showOverview(key); }
      }
    });
    historyView = {destroy: view.destroy, back};
    render();
    w.scrollTo(0, 0);
    return true;
  }
  function renderEntryTrail(view) {
    const labels = entryTrails[view];
    entryHeader.hidden = !labels;
    if (!labels || entryHeader.dataset.screen === view) return;
    entryHeader.dataset.screen = view;
    const [parent, current = ''] = labels;
    const button = entryHeader.querySelector('button');
    button.hidden = !parent;
    if (parent) button.querySelector('span').textContent = parent;
    entryHeader.querySelector('[data-entry-separator]').hidden = !parent || !current;
    const caption = entryHeader.querySelector('[aria-current="page"]');
    caption.hidden = !current;
    caption.textContent = current;
  }
  function setScreen(value) {
    const fields = d.getElementById('vhomeVisitFields');
    if (fields) fields.disabled = visitMeasurementsReadOnly();
    analysis.setAttribute('aria-labelledby', value === 'rapid' ? 'gbRapidTitle' : 'vhomeGabinetAnalysisTab');
    const view = value === 'start' && entryView === 'office' ? 'office' : value;
    if (view) main.dataset.vhomeScreen = view;
    else delete main.dataset.vhomeScreen;
    renderEntryTrail(view);
    const pane = w.frameElement;
    if (pane?.classList.contains('app-pane')) {
      pane.toggleAttribute('data-vhome-workspace', Boolean(value));
      const directory = view === 'registration' ? 'registration' : view === 'start' ? '' : null;
      if (directory === null) pane.removeAttribute('data-vhome-directory');
      else if (pane.getAttribute('data-vhome-directory') !== directory) pane.setAttribute('data-vhome-directory', directory);
    }
  }
  function render() {
    if (!root) return;
    const nextAccount = access();
    if (account !== nextAccount) {
      sequence++; selecting = false; pendingNote = pendingOfficeRecord = null; dismissHistory(); detach(true); clearRegistration(true); destroyPicker(); clearRapidUI(); entryView = 'launch';
      target = null; screen = 'start'; section = 'antro'; account = nextAccount;
      header.querySelector('h1').textContent = '';
      header.querySelector('.gb-identity-meta').textContent = '';
      header.querySelector('.gb-visit-context').hidden = true;
      displayedVisit = null;
      setVisitMenu(false);
      showMessage('');
    }
    if (!account) {
      root.hidden = header.hidden = true;
      setScreen(null);
      return;
    }
    if (target && !selecting && selected() !== target) {
      dismissHistory(); detach(true); target = null; screen = 'start';
    }
    root.hidden = false;
    if (registration) {
      setScreen('registration');
      header.hidden = overview.hidden = landing.hidden = rapidHeader.hidden = true;
      registrationHost.hidden = false;
      return;
    }
    if (isRapidIntake() && selected()) { clearRapidUI(); screen = 'start'; }
    if (isRapidIntake()) {
      installRapid(); setScreen('rapid');
      main.toggleAttribute('data-rapid-saved', !!rapid.receipt);
      main.toggleAttribute('data-rapid-sex-pending', !field('sex'));
      header.hidden = overview.hidden = landing.hidden = true; rapidHeader.hidden = false;
      if (picker) destroyPicker();
      return;
    }
    rapidHeader.hidden = true;
    if (!target || screen === 'start') {
      setScreen('start');
      header.hidden = overview.hidden = true; landing.hidden = false;
      if (!picker) picker = w.VildaHomeGabinetStart.mount(landing, {onSelect:selectPatient,
        initialView:entryView, onViewChange: view => {
          entryView = view;
          if (['start','office'].includes(main.dataset.vhomeScreen)) setScreen('start');
        },
        onAll:openOfficeList, onRapid:enterRapid, onNewPatient:showRegistration});
      return;
    }
    if (!owns(target)) {
      dismissHistory(); setScreen('loading');
      header.hidden = overview.hidden = landing.hidden = true;
      detach(true);
      return;
    }
    if (historyView) {
      // The native chart uses host.hidden to invalidate its owner during a
      // read. Cover the overview visually while retaining its live editor.
      setScreen('history'); header.hidden = landing.hidden = true;
      return;
    }
    setScreen(screen);
    if (picker) destroyPicker();
    header.hidden = false; landing.hidden = true; overview.hidden = screen !== 'overview';
    headerState();
    if (screen === 'overview' && !w.VildaHomePatient.isInlineOpen()) {
      w.VildaHomePatient.openInline(overview, {
        activeTab: section,
        onClose: closePatientCard,
        onAnalysis: () => { if (showAnalysis()) w.VildaHomeGrowth?.open('analysis'); }
      });
    }
    if (screen === 'overview' && pendingNote && pendingNote.patientId === target &&
        w.VildaHomePatient.focusInlineNote(pendingNote.id)) pendingNote = null;
    if (screen === 'overview' && pendingOfficeRecord?.patientId === target && pendingOfficeRecord.section === section) {
      const {id} = pendingOfficeRecord;
      const focused = section === 'care' ? w.VildaHomePatient.focusInlineCarePlan(id) : w.VildaHomePatient.focusInlineReminder(id);
      if (focused) pendingOfficeRecord = null;
    }
  }
  function schedule() {
    if (!frame) frame = w.requestAnimationFrame(() => { frame = 0; render(); });
  }
  function showStart(view = 'launch') {
    if (!account || !leaveRapidIntake() || !detach(false)) return false;
    clearRegistration();
    entryView = view === 'office' ? 'office' : 'launch';
    if (picker) picker.showView(entryView);
    dismissHistory();
    sequence++; selecting = false; pendingNote = pendingOfficeRecord = null; target = null; section = 'antro'; screen = 'start';
    showMessage(''); render();
    return true;
  }
  function clearRegistration(quiet = false) {
    const item = registration;
    if (!item) return;
    registration = null;
    registrationHost.hidden = true;
    item.dispose?.();
    item.releaseHistory?.(quiet);
  }
  function closeRegistration(launch = false) {
    const item = registration;
    if (!item) return;
    clearRegistration();
    render();
    if (launch) picker?.showView('launch', true);
    else if (item.opener?.getClientRects().length) item.opener.focus({preventScroll:true});
    else if (entryView === 'office') picker?.focusSearch();
    picker?.refresh();
  }
  function showRegistration() {
    if (!account || account !== access() || !picker || registration) return false;
    const opener = d.activeElement?.shadowRoot?.activeElement || d.activeElement;
    const item = registration = {opener};
    const embedded = w.frameElement?.classList.contains('app-pane');
    const shell = embedded && w.parent.VildaShell;
    const current = () => registration === item && account === access() && (!embedded || shell?.getCurrentRoute() === 'start');
    render();
    w.scrollTo(0, 0);
    item.dispose = w.VildaAuthUI.showGabinetNewPatient({
      host: registrationHost.querySelector('[data-registration-form]'), isCurrent: current,
      onPatient(id) { clearRegistration(); render(); openPatient(id); },
      onReturn() { closeRegistration(); }
    });
    if (!item.dispose) { closeRegistration(); return false; }

    function shellBack() {
      if (!current()) return;
      if (item.dispose.closeDuplicate()) shell.ensureAuthHistory(w, shellBack, d);
      else closeRegistration();
    }
    if (shell?.ensureAuthHistory(w, shellBack, d)) {
      item.releaseHistory = quiet => shell.releaseAuthHistory(w, {quiet});
    } else {
      const handle = w.VildaHomeDialogHistory.create({isOpen:current, requestClose() {
        if (item.dispose.closeDuplicate()) return false;
        closeRegistration();
        return true;
      }});
      handle.enter();
      item.releaseHistory = () => handle.release();
    }
    return true;
  }
  function closePatientCard() {
    if (!showStart('office')) return false;
    const shell = w.parent?.VildaShell;
    if (shell?.peekPatientReturnRoute?.()) shell.returnFromPatientCard();
    return true;
  }
  function showAnalysis() {
    if (!owns(target) || !detach(false)) return false;
    pendingNote = pendingOfficeRecord = null; dismissHistory(); screen = 'analysis'; showMessage(''); render(); w.VildaHomeWorkspace.refresh();
    return true;
  }
  let labEntry = null;
  function prepareLabEntry() {
    if (screen === 'start' || !owns(target)) return null;
    if (labEntry) return labEntry;
    const id = target, encounter = w.VildaHomeEncounter.state(id);
    if (encounter.mode !== 'new' || encounter.snapshotId) return null;
    const binding = w.VildaHomeEncounter.captureBinding(id);
    async function record() {
      try {
        if (binding && await binding.ensureRecorded() && binding.isCurrent()) return true;
      } catch (_) { /* Keep the active editor while the snapshot is unconfirmed. */ }
      if (target === id && owns(id)) showMessage('Nie udało się zapisać wizyty przed przejściem do Jednostek lab. Spróbuj ponownie.');
      return false;
    }
    labEntry = record().finally(() => { labEntry = null; });
    return labEntry;
  }
  function showOverview(key, focusNoteId) {
    const id = selected();
    if (!owns(id) || !leaveRapidIntake()) return false;
    dismissHistory();
    if (key && target === id && screen === 'overview' && w.VildaHomePatient.isInlineOpen()) {
      if (!w.VildaHomePatient.selectInline(key)) return false;
      section = key; pendingNote = focusNoteId ? {patientId: id, id: focusNoteId} : null; render();
      return true;
    }
    if (key || target !== id) section = key || 'antro';
    pendingNote = focusNoteId ? {patientId: id, id: focusNoteId} : null;
    target = id; screen = 'overview'; showMessage(''); render();
    return true;
  }
  async function selectPatient(id, mode, context) {
    const section = context?.section;
    const opened = await openPatient(id, {intent: mode === 'start' ? 'new' : 'browse', section});
    const recordId = section === 'care' ? context.planId : section === 'reminders' ? context.noteId : null;
    if (opened && recordId && target === id && owns(id)) {
      pendingOfficeRecord = {patientId:id, section, id:recordId};
      render();
    }
    return opened;
  }
  function openOfficeList(section, context = {}) {
    if (!account || account !== access() || main.dataset.vhomeScreen !== 'office') return false;
    if (section === 'reminders') return w.VildaAuthUI.maybeShowReminders({force:true, noteId:context.noteId});
    if (section === 'care') return w.VildaAuthUI.showCarePlans({planId:context.planId});
    return false;
  }
  async function openPatient(id, options = {}) {
    const intent = options.intent || 'browse', key = options.section || 'antro';
    const isCurrent = options.isCurrent || (() => true);
    if (!id || selecting || !account || !['browse','new'].includes(intent) || !isCurrent()) return false;
    if (!leaveRapidIntake()) return false;
    pendingOfficeRecord = null;
    clearRegistration();
    const same = owns(id);
    const encounter = w.VildaHomeEncounter.state(id);
    // A restored tab has no authority to present a historical form as the
    // latest visit. A normal directory pick reads the latest record again.
    const load = !same || encounter.mode === 'browse' || options.restoreLatest === true;
    if (load && !detach(false)) return false;
    const generation = ++sequence, vault = w.VildaVault, session = vault.captureSyncOperationSession();
    const current = () => generation === sequence && isCurrent() && account === access();
    selecting = true; showMessage('');
    try {
      if (load) {
        const loaded = await w.VildaHomeEncounter.load(id, intent === 'new' ? 'new' : 'restore', null, current, options.onApply);
        if (!loaded) return false;
      }
      vault.assertSyncOperationSession(session);
      if (!current() || !owns(id)) return false;
      if (!showOverview(key === 'visits' ? 'antro' : key, options.focusNoteId)) return false;
      if (key === 'visits') return w.VildaHomeEncounter.history(id, patientName());
      return true;
    } catch (_) {
      if (current()) showMessage('Nie udało się otworzyć wizyty. Spróbuj ponownie.');
      return false;
    } finally {
      if (generation === sequence) { selecting = false; schedule(); }
    }
  }
  function isRapidIntake() { return screen === 'rapid' && !!rapid; }
  function hasRapidDraft() { return isRapidIntake() && !rapid.receipt && rapid.dirty; }
  function currentRapid(item) {
    if (!item || rapid !== item || screen !== 'rapid' || selected() || account !== access() ||
        w.VildaPanelPacjent?.nieaktualny() || w.frameElement?.classList.contains('app-pane') && w.parent.VildaShell?.getCurrentRoute() !== 'start') return false;
    try { w.VildaVault.assertSyncOperationSession(item.session); return true; } catch (_) { return false; }
  }
  function clearRapidUI() {
    if (rapid) for (const id of ['firstName','lastName','age','ageMonths','height','weight']) d.getElementById(id)?.setCustomValidity('');
    for (const id of ['firstName','lastName']) d.getElementById(id)?.removeAttribute('aria-required');
    rapid = null;
    const dialog = d.getElementById('gbRapidMatches');
    if (dialog.open) dialog.close();
    dialog.replaceChildren();
    main.removeAttribute('data-rapid-saved');
    main.removeAttribute('data-rapid-sex-pending');
    analysis.inert = false;
    rapidHeader.hidden = true;
    const receipt = analysis.querySelector('[data-rapid-receipt]');
    if (receipt) {
      receipt.hidden = true;
      for (const node of receipt.querySelectorAll('h3,p,dd')) node.textContent = '';
    }
  }
  function leaveRapidIntake() {
    if (!isRapidIntake()) return true;
    if (rapid.busy || hasRapidDraft() && !w.confirm('Opuścić Szybką ścieżkę i odrzucić niezapisane dane pacjenta?')) return false;
    // An external patient selection already owns the form; never clear that record.
    if (currentRapid(rapid) && !w.VildaDataImportExport.clearAllData()) return false;
    clearRapidUI(); screen = 'start';
    schedule();
    return true;
  }
  function setValue(id, value) {
    const input = d.getElementById(id);
    input.value = String(value);
    input.dispatchEvent(new w.Event('input', {bubbles:true}));
    input.dispatchEvent(new w.Event('change', {bubbles:true}));
  }
  function resetRapidForm(session) {
    if (!w.VildaDataImportExport.clearAllData() || selected() || w.VildaPanelPacjent?.nieaktualny()) return false;
    clearRapidUI(); w.VildaVault.assertSyncOperationSession(session);
    const visit = w.VildaVisitContext.beginNew({});
    rapid = {visit, session, busy:false, dirty:false, receipt:null, choice:null};
    screen = 'rapid'; target = null; pendingNote = null; dismissHistory();
    for (const id of ['firstName','lastName']) d.getElementById(id).setAttribute('aria-required', 'true');
    setValue('sex', '');
    w.VildaPolaTozsamosci?.odswiez?.();
    render();
    w.VildaHomeWorkspace.refresh();
    d.dispatchEvent(new w.CustomEvent('vilda:home-encounter-changed'));
    w.scrollTo(0, 0); d.getElementById('firstName').focus({preventScroll:true});
    return true;
  }
  async function enterRapid() {
    if (!account || selecting || !detach(false)) return false;
    const session = w.VildaVault.captureSyncOperationSession(), generation = ++sequence;
    const allowed = () => generation === sequence && account === access() && screen === 'start' &&
      (!w.frameElement?.classList.contains('app-pane') || w.parent.VildaShell?.getCurrentRoute() === 'start');
    // Switching from a chart or a parked draft follows the usual unsaved-work decision.
    if (selected() || w.VildaDataImportExport.anyDataEntered()) {
      const proceed = await new Promise(resolve => {
        w.VildaUnsavedGuard.run({reason:'load', onProceed:() => resolve(true), onCancel:() => resolve(false)});
      });
      if (!proceed || !allowed()) return false;
    }
    w.VildaVault.assertSyncOperationSession(session);
    return allowed() && resetRapidForm(session);
  }
  function validateRapid() {
    const required = {firstName:'Wpisz imię pacjenta.', lastName:'Wpisz nazwisko pacjenta.',
      age:'Wpisz wiek pacjenta.', weight:'Wpisz masę ciała pacjenta.', height:'Wpisz wzrost pacjenta.'};
    for (const id of ['firstName','lastName','age','ageMonths','weight','height']) {
      const input = d.getElementById(id);
      input.setCustomValidity(required[id] && !field(id) ? required[id] : '');
      if (!input.reportValidity()) { input.focus(); return false; }
    }
    return true;
  }
  function rapidAction(text, action, primary = false) {
    const button = d.createElement('button');
    button.type = 'button'; button.textContent = text; button.className = primary ? 'gb-rapid-button gb-rapid-primary' : 'gb-rapid-button';
    button.onclick = action;
    return button;
  }
  function chooseRapid(item, candidates) {
    const dialog = d.getElementById('gbRapidMatches');
    dialog.innerHTML = '<h2 id="gbRapidMatchTitle">Pacjent o tym samym imieniu i nazwisku</h2><p>Wybierz kartotekę, do której chcesz dodać wizytę, lub utwórz osobną.</p><div class="gb-match-list"></div><div class="gb-match-actions"></div>';
    const choose = choice => {
      dialog.close();
      if (currentRapid(item)) { item.choice = choice; saveRapid(); }
    };
    for (const candidate of candidates) {
      const option = rapidAction(candidate.name, () => choose({patientId:candidate.patientId}));
      const detail = d.createElement('small');
      detail.textContent = [candidate.dobISO && 'ur. ' + candidate.dobISO.split('-').reverse().join('.'),
        Number.isFinite(candidate.age) && w.VildaDobAge.describeAge({years:candidate.age, ageMonths:candidate.ageMonths || 0}),
        {F:'płeć żeńska',M:'płeć męska'}[candidate.sex], candidate.shortId && 'ID ' + candidate.shortId].filter(Boolean).join(' · ');
      option.append(detail); dialog.querySelector('.gb-match-list').append(option);
    }
    const cancel = rapidAction('Anuluj', () => dialog.close());
    dialog.querySelector('.gb-match-actions').append(cancel, rapidAction('Utwórz osobną kartotekę', () => choose({newPatient:true})));
    dialog.showModal(); cancel.focus();
  }
  async function saveRapid() {
    const item = rapid;
    if (!currentRapid(item) || item.busy || item.receipt ||
        Array.from(d.querySelectorAll('dialog[open], .vug-backdrop, .vilda-auth-patients, .vilda-auth-screen'))
          .some(element => element.getClientRects().length) ||
        !validateRapid()) return false;
    if (analysis.contains(d.activeElement)) d.activeElement.blur();
    const choice = item.choice;
    item.busy = true; analysis.inert = true; showMessage('');
    let result;
    try {
      result = await w.VildaRapidPatientSave.save({session:item.session,visit:item.visit,choice,isCurrent:() => currentRapid(item)});
      if (!currentRapid(item)) return false;
    } catch (error) {
      if (currentRapid(item)) showMessage(error?.message || 'Nie udało się zapisać pacjenta. Spróbuj ponownie.');
      return false;
    } finally {
      item.busy = false;
      if (rapid === item) analysis.inert = false;
    }
    if (result.status === 'choose') { item.choice = null; chooseRapid(item, result.candidates); return false; }
    if (result.status === 'mismatch') {
      const candidate = result.candidate;
      if (candidate.dobISO && Number.isFinite(candidate.age)) {
        setValue('age', candidate.age); setValue('ageMonths', candidate.ageMonths || 0);
      }
      if (candidate.sex) setValue('sex', candidate.sex);
      item.choice = {patientId:candidate.patientId,confirmMismatch:true};
      showMessage('Wczytano dane dostępne w kartotece. Sprawdź wyniki i ponownie wybierz „Zapisz pacjenta”.');
      analysis.querySelector('[data-rapid-save]').focus();
      return false;
    }
    if (result.status !== 'saved' || !result.patientId || !result.snapshotId) {
      showMessage('Nie udało się potwierdzić zapisu wizyty. Spróbuj ponownie.');
      return false;
    }
    item.receipt = result;
    const receipt = analysis.querySelector('[data-rapid-receipt]');
    receipt.querySelector('h3').textContent = patientName();
    receipt.querySelector('p').textContent = choice?.patientId ? 'Dodano wizytę do wybranej kartoteki.' : 'Utworzono kartotekę i zapisano pierwszą wizytę.';
    receipt.querySelector('[data-rapid-weight]').textContent = field('weight').replace('.', ',') + ' kg';
    receipt.querySelector('[data-rapid-height]').textContent = field('height').replace('.', ',') + ' cm';
    receipt.hidden = false;
    render(); d.dispatchEvent(new w.CustomEvent('vilda:home-encounter-changed'));
    w.scrollTo(0,0); receipt.querySelector('[data-rapid-next]').focus({preventScroll:true});
    return true;
  }
  function installRapid() {
    const content = analysis.querySelector('.vhome-form-content');
    if (!content || content.querySelector('[data-rapid-save]')) return;
    const save = rapidAction('Zapisz pacjenta', saveRapid, true);
    save.dataset.rapidSave = ''; content.append(save);
    const receipt = d.createElement('section');
    receipt.dataset.rapidReceipt = ''; receipt.hidden = true;
    receipt.innerHTML = '<h2>Zapisano wizytę</h2><h3></h3><p></p><dl><div><dt>Masa ciała</dt><dd data-rapid-weight></dd></div><div><dt>Wzrost</dt><dd data-rapid-height></dd></div></dl><div class="gb-receipt-actions"></div>';
    const next = rapidAction('Następny pacjent', () => {
      if (!currentRapid(rapid) || !rapid.receipt) return;
      showMessage(''); resetRapidForm(rapid.session);
    }, true);
    next.dataset.rapidNext = '';
    const open = rapidAction('Otwórz kartę pacjenta', async () => {
      if (!currentRapid(rapid) || !rapid.receipt) return;
      const id = rapid.receipt.patientId;
      if (!leaveRapidIntake()) return;
      if (!await openPatient(id)) { showMessage('Wizyta została zapisana. Otwórz kartotekę, wybierając pacjenta w Gabinecie.'); }
    });
    receipt.querySelector('.gb-receipt-actions').append(next,open);
    content.after(receipt);
  }
  function install() {
    analysis = d.getElementById('calcForm')?.closest('.container');
    if (root || !analysis || !w.VildaHomeGabinetStart || !w.VildaHomeEncounter) return;
    main = analysis.parentElement;
    analysis.id ||= 'vhomeGabinetAnalysis';
    root = d.createElement('div'); root.id = 'vhomeGabinet'; root.hidden = true;
    const workspaceHeader = d.createElement('div'); workspaceHeader.id = 'gbWorkspaceHeader';
    entryHeader = d.createElement('div');
    entryHeader.id = 'gbEntryHeader'; entryHeader.className = 'gb-header-top'; entryHeader.hidden = true;
    entryHeader.innerHTML = '<nav class="gb-breadcrumb" aria-label="Ścieżka nawigacji">' +
      '<button type="button">' + icon('home') + '<span></span></button>' +
      '<span data-entry-separator>' + icon('chevron') + '</span><span aria-current="page"></span></nav>';
    entryHeader.querySelector('button').onclick = () => {
      if (main.dataset.vhomeScreen === 'history') return historyView?.back();
      if (registration) return closeRegistration(true);
      return showStart();
    };
    root.innerHTML = '<div id="vhomeGabinetStart"></div><div id="vhomeGabinetHeader" hidden>' +
      '<div class="gb-header-top"><nav class="gb-breadcrumb" aria-label="Ścieżka nawigacji"><button type="button" data-start>' + icon('home') +
      '<span>Gabinet</span></button>' + icon('chevron') + '<span aria-current="page">Karta pacjenta</span></nav></div>' +
      '<div class="gb-person-line"><div class="gb-identity"><h1></h1><div class="gb-identity-meta"></div>' +
      '<div class="gb-visit-context" hidden><span class="gb-visit-source">' + icon('calendar') +
      '<span data-state-label></span> <time></time></span><span class="gb-readonly-badge" hidden>' + icon('lock') + '<span>Dane wizyty · tylko odczyt</span></span></div></div>' +
      '<div class="gb-card-actions" role="group" aria-label="Działania wizyty"><div class="gb-visit-actions">' +
      '<button type="button" data-visit-actions aria-expanded="false" aria-controls="gbVisitActions">Opcje ' + icon('down') + '</button>' +
      '<div id="gbVisitActions" role="group" aria-label="Opcje wizyty" hidden>' +
      '<button type="button" data-edit-visit hidden>' + icon('edit') + '<span>Edytuj wizytę</span></button>' +
      '<button type="button" data-history>' + icon('history') + '<span>Historia wizyt</span></button>' +
      '<button type="button" data-trash-visit hidden>' + icon('trash') + '<span>Przenieś wizytę do kosza</span></button></div></div>' +
      '<button type="button" class="gb-primary" data-home-encounter><span class="gb-action-copy" data-action-caption></span>' +
      '<span class="gb-action-copy gb-action-reserve" aria-hidden="true" data-longest="Zapisz zmiany"></span></button></div></div>' +
      '<div class="gb-patient-nav"><div class="gb-patient-tabs" role="tablist" aria-label="Karta pacjenta"></div></div></div>' +
      '<div id="gbRapidHeader" hidden><h1 id="gbRapidTitle">Analiza</h1></div>' +
      '<section id="vhomeGabinetRegistration" hidden aria-labelledby="gbRegistrationTitle"><div class="gb-registration-heading">' +
      '<h1 id="gbRegistrationTitle">Dodaj pacjenta</h1></div><div data-registration-form></div></section>' +
      '<dialog id="gbRapidMatches" aria-labelledby="gbRapidMatchTitle"></dialog><div class="vhome-gabinet-message" role="status"></div><div id="vhomePatientOverview" hidden></div><section id="vhomeVisitHistory" hidden aria-label="Historia wizyt"></section>';
    header = root.querySelector('#vhomeGabinetHeader');
    workspaceHeader.append(entryHeader, header);
    analysis.before(workspaceHeader, root);
    landing = d.getElementById('vhomeGabinetStart'); overview = d.getElementById('vhomePatientOverview');
    historyHost = d.getElementById('vhomeVisitHistory');
    rapidHeader = d.getElementById('gbRapidHeader');
    registrationHost = d.getElementById('vhomeGabinetRegistration');
    installRapid();
    d.addEventListener('vilda:home-workspace-ready', installRapid);
    const onRapidEdit = event => {
      if (!isRapidIntake() || rapid.receipt || rapid.busy) return;
      const input = event.target;
      if (input.id === 'sex') main.toggleAttribute('data-rapid-sex-pending', !field('sex'));
      if (!event.isTrusted) return;
      if (analysis.contains(input) || input.closest?.('.vhome-detail-dialog')) {
        if (!rapid.dirty) {
          rapid.dirty = true; d.dispatchEvent(new w.CustomEvent('vilda:home-encounter-changed'));
        }
        if (['firstName','lastName','age','ageMonths','sex','dobInput'].includes(input.id)) rapid.choice = null;
        if (analysis.contains(input) && input.validity?.customError) input.setCustomValidity('');
      }
    };
    for (const name of ['input','change']) d.addEventListener(name, onRapidEdit);
    analysis.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing && !event.repeat && isRapidIntake() && !rapid.receipt &&
          event.target.closest('#vhomeVisitFields') && event.target.matches('input')) {
        event.preventDefault(); saveRapid();
      }
    });
    if (w.frameElement?.classList.contains('app-pane')) {
      const decorRail = w.parent.matchMedia('(min-width: 1400px)');
      const syncHeaderWidth = () => header.toggleAttribute('data-decor-rail', decorRail.matches);
      syncHeaderWidth();
      decorRail.addEventListener('change', syncHeaderWidth);
      w.addEventListener('pagehide', event => {
        if (!event.persisted) decorRail.removeEventListener('change', syncHeaderWidth);
      });
    }
    header.querySelector('[data-start]').onclick = closePatientCard;
    header.querySelector('[data-history]').onclick = () => {
      setVisitMenu(false, true);
      if (owns(target)) w.VildaHomeEncounter.history(target, patientName());
    };
    header.querySelector('[data-edit-visit]').onclick = async () => {
      const expected = displayedVisit, id = target;
      setVisitMenu(false, true);
      if (!expected || expected.patientId !== id) return;
      const inPatientScreen = capturePatientScreen(id);
      const current = () => inPatientScreen() && !historyView && !selecting;
      let cancelled = false;
      const opened = await w.VildaHomeEncounter.editDisplayedVisit(id, expected, current, () => { cancelled = true; });
      if (!current() || !owns(id)) return;
      if (opened && showAnalysis()) header.querySelector('#vhomeGabinetAnalysisTab').focus({preventScroll: true});
      else if (!opened && !cancelled) showMessage('Nie otwarto wizyty do edycji. Sprawdź aktualny zapis w Historii wizyt.');
    };
    const visitActions = header.querySelector('.gb-visit-actions'), toggle = visitActions.querySelector('[data-visit-actions]');
    toggle.onclick = () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      setVisitMenu(open, !open);
    };
    visitActions.onkeydown = event => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        event.preventDefault(); event.stopPropagation(); setVisitMenu(false, true);
      }
    };
    d.addEventListener('pointerdown', event => { if (!visitActions.contains(event.target)) setVisitMenu(false); });
    visitActions.onfocusout = event => { if (!visitActions.contains(event.relatedTarget)) setVisitMenu(false); };
    header.querySelector('[data-trash-visit]').onclick = async () => {
      const id = target, capture = owns(id) && w.VildaHomeEncounter.captureVisitTrash(id);
      setVisitMenu(false, true);
      if (!capture) return;
      const current = () => target === id && !header.hidden && owns(id) && capture.isCurrent();
      const confirmed = await w.VildaHomeVisitHistory.confirmRemoval(capture, current, toggle);
      if (!confirmed || !current()) return;
      try {
        if (await capture.moveToTrash()) return;
      } catch (_) { /* Preserve the edit and let the clinician reopen the current revision. */ }
      if (target === id && owns(id)) showMessage('Nie przeniesiono wizyty do kosza. Otwórz ponownie wizytę i sprawdź jej aktualny zapis.');
    };
    header.querySelector('[data-home-encounter]').onclick = async event => {
      if (!owns(target)) return;
      const id = target, button = event.currentTarget;
      button.disabled = true;
      try { await w.VildaHomeEncounter[button.dataset.homeEncounter](id); }
      catch (_) { if (owns(id)) showMessage('Nie udało się zatwierdzić operacji wizyty.'); }
      finally { schedule(); }
    };
    for (const [key, label] of Object.entries(labels)) {
      const panel = key === 'overview' ? overview : analysis;
      const tab = d.createElement('button'); tab.type = 'button'; tab.setAttribute('role','tab');
      tab.id = key === 'overview' ? 'vhomeGabinetOverviewTab' : 'vhomeGabinetAnalysisTab';
      tab.dataset.screen = key; tab.innerHTML = icon(key) + label;
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
      tab.onclick = () => key === 'analysis' ? showAnalysis() : showOverview();
      header.querySelector('[role="tablist"]').appendChild(tab);
    }
    header.querySelector('[role="tablist"]').onkeydown = event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'analysis' : screen === 'analysis' ? 'overview' : 'analysis';
      const button = header.querySelector('[data-screen="' + next + '"]');
      button.click(); header.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
    };
    render();
  }
  d.addEventListener('vilda:patient-loaded', event => {
    if (!account || selecting || !root || registration) return;
    const id = event.detail?.patientId || selected();
    if (!id) return;
    if (isRapidIntake()) clearRapidUI();
    if (id !== target || screen === 'start') {
      dismissHistory(); detach(true); pendingNote = null; target = id; screen = 'overview'; section = 'antro';
    }
    schedule();
  });
  d.addEventListener('vilda:auth-hidden', () => clearRegistration(true));
  ['vilda:auth-boot-settled','vilda:auth-hidden','vilda:session-changed','vilda:auth-loaded','vildaProAccessChanged',
    'vilda:main-session-restored','vilda:initial-main-session-restore-settled','vilda:intake-restore-readiness','vilda:data-applied','vilda:home-patient-inline-ready',
    'vilda:home-encounter-changed','vilda:user-state-cleared','vilda:patient-profile-presentation-ready'].forEach(name => d.addEventListener(name, schedule));
  w.addEventListener('vilda:user-state-cleared', schedule);
  w.addEventListener('pageshow', schedule);
  w.addEventListener('pagehide', () => { dismissHistory(); clearRegistration(true); if (main) setScreen(null); sequence++; selecting = false; detach(true); if (picker) destroyPicker(); });
  w.VildaHomeGabinet = Object.freeze({
    isRapidIntake, hasRapidDraft, leaveRapidIntake, saveRapid,
    capturePatientScreen,
    showStart, showAnalysis, selectPatient, openPatient, prepareLabEntry, visitMeasurementsReadOnly, openVisitHistory, openOverview: (key = 'antro') => showOverview(key),
    openReminders: () => screen !== 'start' && showOverview('reminders'),
    captureVisitBinding: patientId => screen !== 'start' && target === patientId && owns(patientId)
      ? w.VildaHomeEncounter.captureBinding(patientId) : null,
    captureDocumentationBinding(patientId, options = {}) {
      if (screen === 'start' || target !== patientId) return null;
      const ticket = sequence;
      return w.VildaHomeEncounter.captureDocumentationBinding(patientId, {...options,
        isCurrent: () => sequence === ticket && screen !== 'start' && target === patientId && owns(patientId) &&
          (!options.isCurrent || options.isCurrent())});
    },
    refreshStart: () => { install(); render(); return picker?.refresh(); }
  });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})(typeof window !== 'undefined' ? window : null);
