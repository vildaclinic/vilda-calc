/* The opt-in workspace arranges the original clinical tools. The selected
 * patient, encounter data, and editor lifetimes belong to the native actors. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_GABINET_PREVIEW__ !== true || w.VildaHomeGabinet) return;
  const d = w.document;
  let root, main, header, landing, overview, analysis, picker, historyHost, historyView;
  let account = null, screen = 'start', target = null, section = 'antro';
  let sequence = 0, selecting = false, frame = 0, pendingNote = null;
  const labels = {overview: 'Przegląd', analysis: 'Analiza'};
  const paths = {
    home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    overview: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/>',
    analysis: '<path d="M3 3v17h18M6 15l4-5 4 2 6-7"/>',
    history: '<path d="M3 11a9 9 0 1 1 2 7M2 4v7h7m3-4v5l4 2"/>',
    start: '<path d="M12 5v14M5 12h14"/>', save: '<path d="m4 12 5 5L20 6"/>', chevron: '<path d="m9 5 7 7-7 7"/>'
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
  function showMessage(text) { root.querySelector('.vhome-gabinet-message').textContent = text; }
  function patientName() {
    return [field('firstName'), field('lastName')].filter(Boolean).join(' ') || field('name') || 'Pacjent';
  }
  function headerState() {
    const status = w.VildaHomeEncounter.state(target);
    const shell = w.parent?.VildaShell, route = shell?.peekPatientReturnRoute?.();
    const parentLabel = shell?.routes?.[route]?.title || 'Gabinet';
    const breadcrumb = header.querySelector('[data-start]');
    breadcrumb.querySelector('span').textContent = parentLabel;
    breadcrumb.setAttribute('aria-label', 'Wróć do: ' + parentLabel);
    const draft = status.mode === 'new' || status.mode === 'edit';
    const birth = w.VildaDobAge?.readISO(), day = draft && status.date ? new Date(status.date + 'T12:00:00') : new Date();
    const age = birth && w.VildaDobAge.ageFromDobISO(birth, day);
    const years = field('age'), months = field('ageMonths');
    const ageText = age ? w.VildaDobAge.describeAge(age) : years || months ? w.VildaDobAge.describeAge({years: Number(years), ageMonths: Number(months)}) : '';
    header.querySelector('h1').textContent = patientName();
    header.querySelector('.gb-identity-meta').textContent = [ageText, birth && 'ur. ' + birth.split('-').reverse().join('.')].filter(Boolean).join(' · ');
    const badge = header.querySelector('.gb-encounter-state');
    badge.hidden = !draft;
    if (draft) {
      badge.firstElementChild.textContent = status.mode === 'edit' ? 'Edycja wizyty' : 'Wizyta w toku';
      badge.lastElementChild.dateTime = status.date || '';
      badge.lastElementChild.textContent = (status.date || '').split('-').reverse().join('.');
    }
    const button = header.querySelector('[data-home-encounter]');
    const action = draft ? 'save' : 'start';
    if (button.dataset.homeEncounter !== action) {
      button.dataset.homeEncounter = action;
      button.innerHTML = icon(action) + (draft ? 'Zapisz wizytę' : 'Rozpocznij wizytę');
    }
    button.disabled = !!status.busy || selecting;
    header.querySelectorAll('[role="tab"]').forEach(tab => {
      const active = screen === tab.dataset.screen;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }
  function destroyPicker() {
    picker?.destroy();
    picker = null;
    landing.replaceChildren();
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
    const focus = d.activeElement?.closest('[role="menuitem"]')
      ? overview.querySelector('.vhome-b1-menu-toggle') : header.querySelector('[data-history]');
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
    historyView = w.VildaHomeVisitHistory.mount(historyHost, {
      ...options, patientId: id, isCurrent: () => owns(id) && target === id && options.isCurrent(),
      backLabel: screen === 'analysis' ? 'Wróć do analizy' : 'Wróć do przeglądu',
      onBack: back,
      onEdit(row) {
        if (!owns(id)) return false;
        const editing = historyView;
        // Keep the history visible while the clinician decides about a draft.
        // The native form must be available when the verified revision loads.
        return options.onEdit(row, () => historyView === editing && owns(id) && back());
      },
      onOpenRecord(key) {
        if (owns(id)) { back(false); showOverview(key); }
      }
    });
    render();
    w.scrollTo(0, 0);
    return true;
  }
  function setScreen(value) {
    if (value) main.dataset.vhomeScreen = value;
    else delete main.dataset.vhomeScreen;
    const pane = w.frameElement;
    if (pane?.classList.contains('app-pane')) pane.toggleAttribute('data-vhome-directory', value === 'start');
  }
  function render() {
    if (!root) return;
    const nextAccount = access();
    if (account !== nextAccount) {
      sequence++; selecting = false; pendingNote = null; dismissHistory(); detach(true); destroyPicker();
      target = null; screen = 'start'; section = 'antro'; account = nextAccount;
      header.querySelector('h1').textContent = '';
      header.querySelector('.gb-identity-meta').textContent = '';
      header.querySelector('.gb-encounter-state').hidden = true;
      showMessage('');
    }
    if (!account) {
      root.hidden = true;
      setScreen(null);
      return;
    }
    if (target && !selecting && selected() !== target) {
      dismissHistory(); detach(true); target = null; screen = 'start';
    }
    root.hidden = false;
    if (!target || screen === 'start') {
      setScreen('start');
      header.hidden = overview.hidden = true; landing.hidden = false;
      if (!picker) picker = w.VildaHomeGabinetStart.mount(landing, {onSelect: selectPatient});
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
  }
  function schedule() {
    if (!frame) frame = w.requestAnimationFrame(() => { frame = 0; render(); });
  }
  function showStart() {
    if (!account || !detach(false)) return false;
    dismissHistory();
    sequence++; selecting = false; pendingNote = null; target = null; section = 'antro'; screen = 'start';
    showMessage(''); render();
    return true;
  }
  function closePatientCard() {
    if (!showStart()) return false;
    const shell = w.parent?.VildaShell;
    if (shell?.peekPatientReturnRoute?.()) shell.returnFromPatientCard();
    return true;
  }
  function showAnalysis() {
    if (!owns(target) || !detach(false)) return false;
    pendingNote = null; dismissHistory(); screen = 'analysis'; showMessage(''); render(); w.VildaHomeWorkspace.refresh();
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
    if (!owns(id)) return false;
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
  function selectPatient(id, mode) {
    return openPatient(id, {intent: mode === 'start' ? 'new' : 'browse'});
  }
  async function openPatient(id, options = {}) {
    const intent = options.intent || 'browse', key = options.section || 'antro';
    const isCurrent = options.isCurrent || (() => true);
    if (!id || selecting || !account || !['browse','new'].includes(intent) || !isCurrent()) return false;
    const same = owns(id);
    const encounter = w.VildaHomeEncounter.state(id);
    // A restored tab has no authority to present a historical form as the
    // latest visit. A normal directory pick reads the latest record again.
    const load = !same || encounter.requiresLatest || options.restoreLatest === true || intent === 'new' && encounter.mode === 'browse';
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
  function install() {
    analysis = d.getElementById('calcForm')?.closest('.container');
    if (root || !analysis || !w.VildaHomeGabinetStart || !w.VildaHomeEncounter) return;
    main = analysis.parentElement;
    analysis.id ||= 'vhomeGabinetAnalysis';
    root = d.createElement('div'); root.id = 'vhomeGabinet'; root.hidden = true;
    root.innerHTML = '<div id="vhomeGabinetStart"></div><div id="vhomeGabinetHeader" hidden>' +
      '<div class="gb-header-top"><nav class="gb-breadcrumb" aria-label="Ścieżka nawigacji"><button type="button" data-start>' + icon('home') +
      '<span>Gabinet</span></button>' + icon('chevron') + '<span>Karta pacjenta</span></nav><span class="gb-encounter-state" role="status" hidden><span></span> <time></time></span></div>' +
      '<div class="gb-person-line"><div class="gb-identity"><h1></h1><div class="gb-identity-meta"></div></div><div class="gb-card-actions"><button type="button" data-history>' +
      icon('history') + 'Historia wizyt</button><button type="button" class="gb-primary" data-home-encounter></button></div></div>' +
      '<div class="gb-patient-tabs" role="tablist" aria-label="Karta pacjenta"></div></div>' +
      '<div class="vhome-gabinet-message" role="status"></div><div id="vhomePatientOverview" hidden></div><section id="vhomeVisitHistory" hidden aria-label="Historia wizyt"></section>';
    analysis.before(root);
    header = d.getElementById('vhomeGabinetHeader'); landing = d.getElementById('vhomeGabinetStart'); overview = d.getElementById('vhomePatientOverview');
    historyHost = d.getElementById('vhomeVisitHistory');
    if (w.frameElement?.classList.contains('app-pane')) {
      const decorRail = w.parent.matchMedia('(min-width: 1400px)');
      const syncHeaderWidth = () => header.toggleAttribute('data-decor-rail', decorRail.matches);
      syncHeaderWidth();
      w.addEventListener('resize', syncHeaderWidth);
    }
    root.querySelector('[data-start]').onclick = closePatientCard;
    root.querySelector('[data-history]').onclick = () => { if (owns(target)) w.VildaHomeEncounter.history(target, patientName()); };
    root.querySelector('[data-home-encounter]').onclick = async event => {
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
    if (!account || selecting || !root) return;
    const id = event.detail?.patientId || selected();
    if (!id) return;
    if (id !== target || screen === 'start') {
      dismissHistory(); detach(true); pendingNote = null; target = id; screen = 'overview'; section = 'antro';
    }
    schedule();
  });
  ['vilda:auth-boot-settled','vilda:auth-hidden','vilda:session-changed','vilda:auth-loaded','vildaProAccessChanged',
    'vilda:main-session-restored','vilda:initial-main-session-restore-settled','vilda:data-applied','vilda:home-patient-inline-ready',
    'vilda:home-encounter-changed','vilda:user-state-cleared'].forEach(name => d.addEventListener(name, schedule));
  w.addEventListener('vilda:user-state-cleared', schedule);
  w.addEventListener('pageshow', schedule);
  w.addEventListener('pagehide', () => { dismissHistory(); if (main) setScreen(null); sequence++; selecting = false; detach(true); if (picker) destroyPicker(); });
  w.VildaHomeGabinet = Object.freeze({
    showStart, showAnalysis, selectPatient, openPatient, prepareLabEntry, openVisitHistory, openOverview: (key = 'antro') => showOverview(key),
    openReminders: () => screen !== 'start' && showOverview('reminders'),
    captureVisitBinding: patientId => screen !== 'start' && target === patientId && owns(patientId)
      ? w.VildaHomeEncounter.captureBinding(patientId) : null,
    refreshStart: () => { install(); render(); return picker?.refresh(); }
  });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})(typeof window !== 'undefined' ? window : null);
