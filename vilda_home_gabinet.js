/* The opt-in workspace arranges the original clinical tools. The selected
 * patient, encounter data, and editor lifetimes belong to the native actors. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_GABINET_PREVIEW__ !== true || w.VildaHomeGabinet) return;
  const d = w.document;
  let root, main, header, landing, overview, analysis, picker;
  let account = null, screen = 'start', target = null, section = 'antro';
  let sequence = 0, selecting = false, frame = 0;
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
      sequence++; selecting = false; detach(true); destroyPicker();
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
      detach(true); target = null; screen = 'start';
    }
    root.hidden = false;
    if (!target || screen === 'start') {
      setScreen('start');
      header.hidden = overview.hidden = true; landing.hidden = false;
      if (!picker) picker = w.VildaHomeGabinetStart.mount(landing, {onSelect: selectPatient});
      return;
    }
    if (!owns(target)) {
      setScreen('loading');
      header.hidden = overview.hidden = landing.hidden = true;
      detach(true);
      return;
    }
    setScreen(screen);
    if (picker) destroyPicker();
    header.hidden = false; landing.hidden = true; overview.hidden = screen !== 'overview';
    headerState();
    if (screen === 'overview' && !w.VildaHomePatient.isInlineOpen()) {
      w.VildaHomePatient.openInline(overview, {
        activeTab: section,
        onClose: showStart,
        onAnalysis: () => { if (showAnalysis()) w.VildaHomeGrowth?.open('analysis'); }
      });
    }
  }
  function schedule() {
    if (!frame) frame = w.requestAnimationFrame(() => { frame = 0; render(); });
  }
  function showStart() {
    if (!account || !detach(false)) return false;
    sequence++; selecting = false; target = null; section = 'antro'; screen = 'start';
    showMessage(''); render();
    return true;
  }
  function showAnalysis() {
    if (!owns(target) || !detach(false)) return false;
    screen = 'analysis'; showMessage(''); render(); w.VildaHomeWorkspace.refresh();
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
  function showOverview(key) {
    const id = selected();
    if (!owns(id)) return false;
    if (key && target === id && screen === 'overview' && w.VildaHomePatient.isInlineOpen()) {
      if (!w.VildaHomePatient.selectInline(key)) return false;
      section = key;
      return true;
    }
    if (key || target !== id) section = key || 'antro';
    target = id; screen = 'overview'; showMessage(''); render();
    return true;
  }
  async function selectPatient(id, mode) {
    if (!id || selecting || !account || !detach(false)) return false;
    const generation = ++sequence, vault = w.VildaVault, session = vault.captureSyncOperationSession();
    selecting = true; showMessage('');
    try {
      if (!owns(id)) {
        const loaded = await w.VildaHomeEncounter.load(id, mode === 'start' ? 'new' : 'restore');
        vault.assertSyncOperationSession(session);
        if (loaded === false || generation !== sequence || !owns(id)) return false;
      } else if (mode === 'start' && w.VildaHomeEncounter.state(id).mode === 'browse') {
        const started = await w.VildaHomeEncounter.start(id);
        vault.assertSyncOperationSession(session);
        if (started === false || generation !== sequence || !owns(id)) return false;
      }
      return showOverview('antro');
    } catch (_) {
      if (generation === sequence) showMessage('Nie udało się otworzyć wizyty. Spróbuj ponownie.');
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
      'Gabinet</button>' + icon('chevron') + '<span>Karta pacjenta</span></nav><span class="gb-encounter-state" role="status" hidden><span></span> <time></time></span></div>' +
      '<div class="gb-person-line"><div class="gb-identity"><h1></h1><div class="gb-identity-meta"></div></div><div class="gb-card-actions"><button type="button" data-history>' +
      icon('history') + 'Historia wizyt</button><button type="button" class="gb-primary" data-home-encounter></button></div></div>' +
      '<div class="gb-patient-tabs" role="tablist" aria-label="Karta pacjenta"></div></div>' +
      '<div class="vhome-gabinet-message" role="status"></div><div id="vhomePatientOverview" hidden></div>';
    analysis.before(root);
    header = d.getElementById('vhomeGabinetHeader'); landing = d.getElementById('vhomeGabinetStart'); overview = d.getElementById('vhomePatientOverview');
    if (w.frameElement?.classList.contains('app-pane')) {
      const decorRail = w.parent.matchMedia('(min-width: 1400px)');
      const syncHeaderWidth = () => header.toggleAttribute('data-decor-rail', decorRail.matches);
      syncHeaderWidth();
      w.addEventListener('resize', syncHeaderWidth);
    }
    root.querySelector('[data-start]').onclick = showStart;
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
      detach(true); target = id; screen = 'overview'; section = 'antro';
    }
    schedule();
  });
  ['vilda:auth-boot-settled','vilda:auth-hidden','vilda:session-changed','vilda:auth-loaded','vildaProAccessChanged',
    'vilda:main-session-restored','vilda:initial-main-session-restore-settled','vilda:data-applied','vilda:home-patient-inline-ready',
    'vilda:home-encounter-changed','vilda:user-state-cleared'].forEach(name => d.addEventListener(name, schedule));
  w.addEventListener('vilda:user-state-cleared', schedule);
  w.addEventListener('pageshow', schedule);
  w.addEventListener('pagehide', () => { if (main) setScreen(null); sequence++; selecting = false; detach(true); if (picker) destroyPicker(); });
  w.VildaHomeGabinet = Object.freeze({
    showStart, showAnalysis, selectPatient, prepareLabEntry, openOverview: () => showOverview('antro'),
    openReminders: () => screen !== 'start' && showOverview('reminders'),
    captureVisitBinding: patientId => screen !== 'start' && target === patientId && owns(patientId)
      ? w.VildaHomeEncounter.captureBinding(patientId) : null,
    refreshStart: () => { install(); render(); picker?.refresh(); }
  });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})(typeof window !== 'undefined' ? window : null);
