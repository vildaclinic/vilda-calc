/* Export-only preview bootstrap. Never loaded by the production documents.
 * Uses native account, patient, visit and calculation APIs with fictional data.
 * This intentionally public demo password protects no real account or data.
 */
(function (window) {
  'use strict';
  if (window.location.hostname === 'vildaclinic.github.io' || /(?:^|\.)wagaiwzrost\.pl$/i.test(window.location.hostname)) return;
  const document = window.document;
  const ACCOUNT_KEY = 'vilda-home-preview-fictional-account-v1';
  const PASSWORD = 'FictionalOnly#VildaPreview2026!';
  const ACCOUNT_LABEL = 'Podgląd — wyłącznie fikcyjni pacjenci';
  const ACCOUNT_GUIDANCE = 'Podgląd nie może użyć tego konta. Otwórz adres podglądu w nowym oknie prywatnym przeglądarki. Nie zakładaj konta w aplikacji — konto demonstracyjne uruchomi się automatycznie. Nie usuwaj dotychczasowego konta ani jego danych.';
  Object.defineProperty(window, '__VILDA_HOME_WORKSPACE_PREVIEW__', { value: true, writable: false });
  Object.defineProperty(window, '__VILDA_HOME_GABINET_PREVIEW__', { value: true, writable: false });
  Object.defineProperty(window, 'VILDA_SYNC_WORKER_URL', { value: 'https://vilda-preview-disabled.invalid', writable: false });
  // This export script is the first executable in <head>. A direct link to a
  // module enters its normal shell before the form or an editor can exist.
  // A Start URL remains a supported standalone entry.
  if (document.readyState === 'loading' && !nativeAppPane() && typeof window.history?.replaceState === 'function') {
    const routes = { 'docpro.html': 'docpro', 'terminarz.html': 'terminarz', 'notatki.html': 'notatki',
      'przelicznik-jednostek.html': 'lab', 'kalkulator-klirens.html': 'klirens', 'homa-ir.html': 'homa',
      'steroidy.html': 'steroidy', 'cukrzyca.html': 'cukrzyca', 'materialy-edukacyjne.html': 'edu', 'ustawienia.html': 'ustawienia' };
    const route = routes[window.location.pathname.split('/').pop()];
    if (typeof route === 'string') {
      const target = new URL(window.location.href);
      target.searchParams.delete('embedded');
      const shell = new URL('app.html#/' + route, target);
      const state = { shellView: route };
      if (target.search || target.hash) state.homePreviewPaneTarget = target.pathname + target.search + target.hash;
      window.history.replaceState(state, '', shell.href);
      window.location.reload();
      return;
    }
  }
  const state = { status: 'starting', phase: 'account', fictional: true, doctorAccess: false, error: null };
  window.VildaHomePreview = Object.freeze({ getState: () => ({ ...state }) });
  try {
    window.localStorage.setItem('analyticsConsent', 'denied');
    window.localStorage.setItem('vilda-sync-enabled-v1', '0');
    window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  } catch (_) { /* Normal native storage error is surfaced by the bootstrap. */ }

  function ownedFictionalAccount() {
    const vault = window.VildaVault;
    const account = vault?.getCurrentUser();
    let marker;
    try { marker = JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) || 'null'); } catch (_) { return false; }
    return Boolean(vault?.isUnlocked() && account && marker && account.userId === marker.userId && account.label === ACCOUNT_LABEL);
  }
  let presentedDoctorAccess = false;
  function refreshAccessPresentation() {
    const active = Boolean(ownedFictionalAccount() && window.VildaProAccess?.hasAccess());
    state.doctorAccess = active;
    // app.html does not load VildaProUi. Mirror the verified native access there
    // too, otherwise its initial inactive class outlives the restored account.
    const classes = document.documentElement?.classList;
    if (classes && (active || presentedDoctorAccess)) {
      classes.toggle('vilda-pro-active', active);
      classes.toggle('vilda-pro-inactive', !active);
    }
    presentedDoctorAccess = active;
    for (const id of ['vildaHomePreviewBadge', 'vildaHomePreviewDrawerBadge']) {
      const badge = document.getElementById?.(id);
      if (badge) badge.textContent = active ? 'Podgląd lekarski aktywny · fikcyjne dane' : 'Podgląd · fikcyjne dane';
    }
    const status = document.getElementById?.('vildaHomePreviewAccessStatus');
    if (status) status.textContent = active ? 'Funkcje lekarskie są aktywne w podglądzie.'
      : state.status === 'error' ? 'Nie można potwierdzić konta demonstracyjnego.' : 'Przygotowywanie dostępu do funkcji lekarskich…';
  }
  let applyingFictionalPlan = false;
  function enableFictionalPlan(notifyAgain = false) {
    if (applyingFictionalPlan) return;
    const access = window.VildaProAccess;
    if (!access || !ownedFictionalAccount()) { refreshAccessPresentation(); return; }
    applyingFictionalPlan = true;
    try {
      const hadAccess = access.hasAccess();
      access.__setTokenModeForTest(false);
      if (!hadAccess || !access.hasAccess() || notifyAgain === true) access.setPlan('pro', '2099-12-31T23:59:59.000Z');
      window.VildaProUi?.refresh?.();
      refreshAccessPresentation();
    } finally { applyingFictionalPlan = false; }
  }
  let boundVault = null;
  function bindFictionalPlan() {
    const vault = window.VildaVault;
    if (vault && vault !== boundVault && typeof vault.onUnlock === 'function') {
      boundVault = vault;
      vault.onUnlock(enableFictionalPlan);
      if (typeof vault.onLock === 'function') vault.onLock(refreshAccessPresentation);
    }
    enableFictionalPlan();
  }
  // Embedded documents finish parsing before native async session restoration.
  // Native vault unlock does not emit vilda:session-changed, so DCL alone misses
  // these frames. Subscribe once and honor the real auth finalizer as well.
  document.addEventListener('vilda:auth-boot-settled', bindFictionalPlan);
  document.addEventListener('vilda:auth-loaded', bindFictionalPlan);
  document.addEventListener('vilda:session-changed', bindFictionalPlan);
  document.addEventListener('vildaProAccessChanged', enableFictionalPlan);
  let accessRefreshQueued = false;
  document.addEventListener('vilda:pro-gate-active', () => {
    if (accessRefreshQueued || !ownedFictionalAccount()) return;
    accessRefreshQueued = true;
    // Native gate listeners can switch result mode off later in this same
    // event. Reconcile after they finish, using the native plan notification.
    Promise.resolve().then(() => { accessRefreshQueued = false; enableFictionalPlan(true); });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindFictionalPlan, { once: true });
  else bindFictionalPlan();

  function nativeAppPane() {
    try {
      const frame = window.frameElement;
      return Boolean(frame?.classList.contains('app-pane') && frame.contentWindow === window
        && window.parent !== window && window.parent.location.origin === window.location.origin
        && window.parent.__VILDA_HOME_WORKSPACE_PREVIEW__ === true
        && /\/app\.html$/.test(window.parent.location.pathname));
    } catch (_) { return false; }
  }
  // Sites can itself be hosted inside a cross-origin preview frame. Only the
  // application's own same-origin app-pane delegates account setup to a parent.
  if (nativeAppPane()) return;

  function waitForAuthReady(requireAccess = false) {
    const available = () => Boolean(window.VildaVault && window.VildaAuthUI?.isBootReady()
      && (!requireAccess || ownedFictionalAccount() && window.VildaProAccess?.hasAccess()));
    if (available()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const events = ['vilda:auth-boot-settled', 'vilda:auth-loaded', 'vildaProAccessChanged', 'DOMContentLoaded'];
      const finish = error => {
        window.clearTimeout(timeout);
        for (const type of events) document.removeEventListener(type, check);
        if (error) reject(error); else resolve();
      };
      const check = () => { if (available()) finish(); };
      const timeout = window.setTimeout(() => finish(new Error('Nie ukończono uruchamiania konta podglądu.')), 45000);
      for (const type of events) document.addEventListener(type, check);
      check();
    });
  }

  function homeEntry() {
    if (/(?:\/|\/index\.html)$/.test(window.location.pathname)) return true;
    return /\/app\.html$/.test(window.location.pathname) && /^(?:|#\/?|#\/start)$/.test(window.location.hash || '');
  }

  function showBadge() {
    function place(id, host) {
      let badge = document.getElementById(id);
      if (!badge) {
        badge = document.createElement('a'); badge.id = id; badge.className = 'vilda-home-preview-badge';
        badge.href = 'subskrypcja.html'; badge.setAttribute('aria-label', 'Sprawdź dostęp demonstracyjny');
      }
      if (badge.parentNode !== host) host.append(badge);
    }
    const sidebarSlot = 'aside.sidebar-v2 .chrome-menu-scroll';
    const drawerSlot = '[data-vilda-chrome-drawer-body] .chrome-menu-scroll';
    function mount() {
      const sidebar = document.querySelector(sidebarSlot);
      const drawer = document.querySelector(drawerSlot);
      place('vildaHomePreviewBadge', sidebar || document.body);
      if (drawer) place('vildaHomePreviewDrawerBadge', drawer);
      refreshAccessPresentation();
      return Boolean(sidebar && drawer);
    }
    // Both menus are built once by native chrome. On a cold start it may
    // still be mounting them when the export finishes preparing its account.
    if (!mount() && window.MutationObserver && /\/app\.html$/.test(window.location.pathname)) {
      const observer = new window.MutationObserver(() => {
        if (document.querySelector(sidebarSlot) && document.querySelector(drawerSlot)) {
          observer.disconnect();
          mount();
        }
      });
      observer.observe(document.body, {childList: true, subtree: true});
    }
  }

  function waitFor(read, label, timeout = 45000) {
    const deadline = Date.now() + timeout;
    return new Promise((resolve, reject) => {
      const poll = () => {
        try { const result = read(); if (result) { resolve(result); return; } } catch (_) { /* The shell may replace its frame during native auth startup. */ }
        if (Date.now() > deadline) { reject(new Error(label)); return; }
        window.setTimeout(poll, 80);
      };
      poll();
    });
  }

  function ownerWindow() {
    if (/\/app\.html$/.test(window.location.pathname)) return document.querySelector('iframe.app-pane[title="Start"]')?.contentWindow || null;
    return document.getElementById('userSection') ? window : null;
  }

  function ready(owner) {
    return owner?.VildaVault?.isUnlocked() && owner.VildaAuthUI?.isBootReady()
      && owner.VildaPersistRuntime?.getSnapshot().initialized
      && typeof owner.applyLoadedData === 'function' && typeof owner.collectUserData === 'function'
      && !owner.__vildaPersistRestoring && !owner.__vildaLustroWpis && !owner.__vildaSuspendIntakeUserReset
      && !owner.VildaDataImportExport?.isMainSessionRestorePending()
      && !owner.VildaDataImportExport?.isMainSessionAutosavePaused()
      && !owner.VildaPersistence?.isAutosaveSuppressed() && !owner.VildaDobAge?.restorePending();
  }

  function bootScreen() {
    const screen = document.createElement('div');
    screen.id = 'vildaHomePreviewBoot';
    // Native locked-account CSS hides body children with !important. Only this
    // explanatory screen is visible; the vault and clinical UI remain locked.
    screen.style.setProperty('visibility', 'visible', 'important');
    screen.setAttribute('role', 'status');
    const panel = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = 'Podgląd nowej strony głównej';
    const message = document.createElement('p'); message.textContent = 'Przygotowuję konto demonstracyjne. Dane podglądu pozostają w tej przeglądarce.';
    panel.append(title, message); screen.append(panel); document.body.append(screen);
    return { screen, panel, message };
  }

  function fictionalPayload() {
    return {
      version: 1, name: 'Przykładowy Antoni',
      user: { lastName: 'Przykładowy', firstName: 'Antoni', sex: 'M', age: 13, ageMonths: 0,
        height: 158, weight: 46, dobISO: '2013-11-03', measuredAtISO: '2026-11-03' },
      advanced: { name: 'Przykładowy Antoni', motherHeight: 165, fatherHeight: 180,
        data: { name: 'Przykładowy Antoni', sex: 'M', currentAgeMonths: 156, currentHeight: 158, currentWeight: 46,
          motherHeight: 165, fatherHeight: 180, measurements: [
            { ageMonths: 108, height: 135, weight: 29.9 },
            { ageMonths: 120, height: 141, weight: 33 },
            { ageMonths: 144, height: 153, weight: 40 },
          ] } },
      zscore: { resultsMode: true, dataSource: 'OLAF' },
    };
  }

  // Five independently authored encounters in a second, fictional chart.
  // Technical snapshots are written by the native vault just as for a visit.
  const HISTORY_PATIENT_ID = '4b89c835-57b9-4933-b083-00bc694ef103';
  const HISTORY_VISITS = [
    { day: '2023-03-12', years: 9, months: 0, height: 132, weight: 27.5 },
    { day: '2024-03-12', years: 10, months: 0, height: 137.5, weight: 30.4 },
    { day: '2025-03-12', years: 11, months: 0, height: 143, weight: 34.2 },
    { day: '2025-09-12', years: 11, months: 6,
      note: { title: 'Konsultacja telefoniczna', body: 'Omówiono z rodzicem dotychczasowy przebieg wzrastania i ustalono termin kolejnego pomiaru.' } },
    { day: '2026-10-12', years: 12, months: 7, height: 154, weight: 41.8,
      bp: { systolic: 108, diastolic: 68, heartRate: 76 } },
  ];
  function historyExamplePayload(row) {
    const patientName = 'Demonstracyjna Klara';
    const user = { lastName: 'Demonstracyjna', firstName: 'Klara', sex: 'F', dobISO: '2014-03-12',
      age: row.years, ageMonths: row.months };
    if (row.height != null) Object.assign(user, { height: row.height, weight: row.weight, measuredAtISO: row.day });
    const visitId = '1aaf33bb-eb8e-453b-8bb5-0000' + row.day.replaceAll('-', '');
    return { version: 1, name: patientName, user, ...(row.bp ? { bp: row.bp } : {}), zscore: { resultsMode: true, dataSource: 'OLAF' },
      visit: { version: 1, origin: 'explicit', visitId, patientId: HISTORY_PATIENT_ID,
        clinicalDateISO: row.day, createdAtISO: row.day + 'T10:00:00.000Z' } };
  }

  async function ensureHistoryExample(owner, userId, isCurrent) {
    const vault = owner.VildaVault, storage = window.localStorage;
    // No clinical data or patient identifiers are kept outside the encrypted vault.
    const key = 'vilda-home-preview-visit-sample-v1:' + userId;
    const installation = storage.getItem(key);
    if (installation === 'done') return;
    const session = vault.captureSyncOperationSession();
    function check() {
      vault.assertSyncOperationSession(session);
      if (!isCurrent() || !ownedFictionalAccount() || ownerWindow() !== owner) throw new Error('Konto podglądu zmieniło się podczas uruchamiania.');
    }
    check();
    const saved = await vault.getPatient(HISTORY_PATIENT_ID);
    check();
    if ((saved && installation !== 'installing') || owner.sessionStorage.getItem('vildaCurrentPatientId') === HISTORY_PATIENT_ID) {
      storage.setItem(key, 'done');
      return;
    }
    const examples = HISTORY_VISITS.map(historyExamplePayload);
    const snapshots = saved?.snapshots || [], present = new Set();
    for (const snapshot of snapshots) {
      const payload = snapshot.payload, expected = examples.find(item => item.visit.visitId === payload?.visit?.visitId);
      // An existing chart, a correction, or a working copy belongs to its user.
      // Resume only an untouched prefix of records created by this bootstrap.
      if (!expected || present.has(expected.visit.visitId) || snapshot.rev !== 0
        || payload.name !== expected.name || payload.visit.clinicalDateISO !== expected.visit.clinicalDateISO) {
        storage.setItem(key, 'done');
        return;
      }
      present.add(expected.visit.visitId);
    }
    if ((saved && !snapshots.length) || examples.slice(0, present.size).some(example => !present.has(example.visit.visitId))) {
      storage.setItem(key, 'done');
      return;
    }
    storage.setItem(key, 'installing');
    for (const example of examples.slice(present.size)) {
      check();
      try { await vault.savePatient(example, { patientId: HISTORY_PATIENT_ID, dedup: false }); }
      catch (error) {
        check();
        if (error?.code !== 'PATIENT_DELETED') throw error;
        storage.setItem(key, 'done');
        return;
      }
    }
    const visitWithNote = HISTORY_VISITS.find(row => row.note);
    const noteId = '46038ef5-7f3d-402a-b36c-99ea032436e2';
    check();
    if (!await vault.getPatientNote(noteId, { strict: true })) {
      check();
      const visit = historyExamplePayload(visitWithNote).visit;
      await vault.savePatientNote({ ...visitWithNote.note, id: noteId, patientId: HISTORY_PATIENT_ID, category: 'observation',
        visitContext: { version: 1, visitId: visit.visitId, clinicalDateISO: visit.clinicalDateISO } });
    }
    check();
    storage.setItem(key, 'done');
  }

  async function ensureAccount() {
    await waitForAuthReady();
    const vault = window.VildaVault;
    let marker = JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) || 'null');
    const accounts = await vault.listUsers();
    if (!marker) {
      // A foreign account is never adopted, unlocked, deleted or inspected.
      if (accounts.length || vault.isUnlocked()) throw new Error(ACCOUNT_GUIDANCE);
      const created = await vault.createUser(PASSWORD, { label: ACCOUNT_LABEL, deferServerContact: true });
      marker = { userId: created.userId };
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(marker));
      prepareFictionalPreferences();
      window.location.reload();
      return null;
    }
    const account = accounts.find(item => item.userId === marker.userId);
    if (!account || account.label !== ACCOUNT_LABEL) throw new Error(ACCOUNT_GUIDANCE);
    if (vault.isUnlocked() && vault.getCurrentUser()?.userId !== marker.userId) throw new Error(ACCOUNT_GUIDANCE);
    if (!vault.isUnlocked()) {
      await vault.unlockUser(marker.userId, PASSWORD);
      // Upgrade only this verified fictional account's old bootstrap marker.
      // Patient selection now comes from the encrypted vault, never this key.
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ userId: marker.userId }));
      prepareFictionalPreferences();
      window.location.reload();
      return null;
    }
    if (Object.keys(marker).some(key => key !== 'userId')) {
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ userId: marker.userId }));
    }
    prepareFictionalPreferences();
    return { userId: marker.userId };
  }

  function prepareFictionalPreferences() {
    if (!ownedFictionalAccount()) throw new Error(ACCOUNT_GUIDANCE);
    if (window.localStorage.getItem('pwzNumber') === null) window.localStorage.setItem('pwzNumber', '0000000');
  }

  function offerExample(owner, patientId, userId) {
    const target = owner.document;
    if (target.getElementById('vildaHomePreviewExample')) return;
    const anchor = target.querySelector('.vhome-visit-heading') || target.getElementById('calcForm');
    if (!anchor) throw new Error('Nie można przygotować wejścia do przykładowego pacjenta.');
    const panel = target.createElement('section'); panel.id = 'vildaHomePreviewExample';
    panel.setAttribute('aria-label', 'Przykładowy pacjent');
    const copy = target.createElement('div');
    const title = target.createElement('strong'); title.textContent = 'Przykładowy pacjent';
    const description = target.createElement('p');
    description.textContent = 'Aby zobaczyć gotowe wyniki, otwórz kartę przykładu, wybierz „Wczytaj tego pacjenta”, a następnie odtworzenie zapisanej wizyty. Możesz też wypełnić formularz samodzielnie.';
    const status = target.createElement('p'); status.setAttribute('role', 'status');
    const button = target.createElement('button'); button.type = 'button'; button.id = 'vildaHomePreviewOpenExample';
    button.textContent = 'Otwórz kartę przykładu';
    button.addEventListener('click', async () => {
      // The example is optional. Never drive native load/restore buttons or
      // confirm unsaved changes behind the startup screen. Native patient-card
      // authority and guards own the eventual load after a real user choice.
      if (!ownedFictionalAccount() || ownerWindow() !== owner || !ready(owner)
        || owner.VildaVault.getCurrentUser()?.userId !== userId || !owner.VildaProAccess?.hasAccess()) {
        status.textContent = 'Poczekaj na zakończenie bieżącej operacji i odblokowanie konta podglądu.';
        return;
      }
      button.disabled = true; status.textContent = '';
      try {
        await owner.VildaAuthUI.showPatientCard(patientId, payload => { if (payload) owner.applyLoadedData(payload); }, null);
      } catch (_) {
        status.textContent = 'Nie można otworzyć karty przykładu. Spróbuj ponownie. Formularz pozostaje dostępny.';
      } finally { button.disabled = false; }
    });
    copy.append(title, description, status); panel.append(copy, button); anchor.before(panel);
  }

  async function start() {
    state.status = 'starting';
    const boot = bootScreen();
    try {
      const task = () => ensureAccount();
      const marker = window.navigator.locks?.request
        ? await window.navigator.locks.request('vilda-home-preview-bootstrap', task) : await task();
      if (!marker) return;
      enableFictionalPlan();
      // A standalone subscription, settings or clinical document needs the
      // same owned-account bootstrap, but never a forced patient selection.
      if (!homeEntry()) {
        if (!ownedFictionalAccount()) throw new Error('Nie można potwierdzić fikcyjnego konta podglądu.');
        await waitForAuthReady(true);
        state.status = 'ready'; state.phase = 'ready'; showBadge(); boot.screen.remove(); return;
      }
      state.phase = 'form'; boot.message.textContent = 'Konto demonstracyjne jest gotowe. Uruchamiam formularz i funkcje lekarskie.';
      const owner = await waitFor(() => { const target = ownerWindow(); return ready(target) && target; }, 'Nie ukończono uruchamiania formularza.');
      await waitFor(() => owner.VildaProAccess?.hasAccess() && ready(owner), 'Nie można uruchomić widoku lekarskiego.');
      // Native auth and vault restoration can finish before the deferred
      // Gabinet script executes. Its declaration identifies the landing page.
      const gabinetPage = owner.__VILDA_HOME_GABINET_PREVIEW__ === true && Boolean(
        owner.document.querySelector('script[src*="vilda_home_gabinet.js"]') || owner.VildaHomeGabinet);
      state.phase = 'example'; boot.message.textContent = 'Przygotowuję kartę fikcyjnego pacjenta. Twoja bieżąca sesja formularza pozostaje zachowana.';
      const seed = async () => {
        const current = JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) || 'null');
        if (!current || current.userId !== marker.userId) throw new Error('Konto podglądu zmieniło się podczas uruchamiania.');
        const vault = owner.VildaVault;
        const isCurrent = () => {
          const account = vault.getCurrentUser();
          return account?.userId === marker.userId && account.label === ACCOUNT_LABEL;
        };
        if (!isCurrent()) throw new Error('Konto podglądu zmieniło się podczas uruchamiania.');
        // The first fictional patient remains the example after renaming or
        // editing it. A strict native read cannot mistake a read error for an
        // empty vault and create a duplicate. The lock covers read and seed.
        const patients = await vault.listPatients({ strict: true, isCurrent });
        if (!isCurrent()) throw new Error('Konto podglądu zmieniło się podczas uruchamiania.');
        patients.sort((left, right) => String(left.createdAtISO || '').localeCompare(String(right.createdAtISO || ''))
          || left.patientId.localeCompare(right.patientId));
        const example = patients[0] || await vault.savePatient(fictionalPayload(), { dedup: false });
        if (gabinetPage) await ensureHistoryExample(owner, marker.userId, isCurrent);
        return example.patientId;
      };
      const patientId = window.navigator.locks?.request
        ? await window.navigator.locks.request('vilda-home-preview-bootstrap', seed) : await seed();
      if (ownerWindow() !== owner || !ownedFictionalAccount()) throw new Error('Widok podglądu zmienił się podczas uruchamiania. Odśwież stronę.');
      owner.VildaHomeWorkspace?.start?.();
      if (gabinetPage) {
        const gabinet = await waitFor(() => owner.VildaHomeGabinet, 'Nie ukończono uruchamiania Gabinetu.');
        if (ownerWindow() !== owner || !ownedFictionalAccount()) throw new Error('Widok podglądu zmienił się podczas uruchamiania. Odśwież stronę.');
        await gabinet.refreshStart();
      }
      else offerExample(owner, patientId, marker.userId);
      state.status = 'ready'; state.phase = 'ready'; showBadge(); boot.screen.remove();
    } catch (error) {
      state.status = 'error'; state.error = String(error?.message || 'Nie można przygotować podglądu.');
      refreshAccessPresentation();
      boot.message.textContent = state.error;
      const retry = document.createElement('button'); retry.textContent = 'Spróbuj ponownie';
      retry.addEventListener('click', () => window.location.reload()); boot.panel.append(retry);
    }
  }
  let started = false;
  function startWhenRelevant() {
    if (started) return;
    const hasAuth = window.VildaVault && window.VildaAuthUI;
    const declaresAuth = document.querySelector?.('script[src*="vilda_auth_ui.js"]');
    if (!homeEntry() && !hasAuth && !declaresAuth) {
      // Information/legal pages can remain readable without loading any vault.
      // If their native menu later loads auth, its real event starts bootstrap.
      state.status = 'ready'; state.phase = 'ready'; showBadge(); return;
    }
    started = true; start();
  }
  document.addEventListener('vilda:auth-loaded', startWhenRelevant);
  document.addEventListener('vilda:auth-boot-settled', startWhenRelevant);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWhenRelevant, { once: true });
  else startWhenRelevant();
})(window);
