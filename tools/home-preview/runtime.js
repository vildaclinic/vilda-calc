/* Export-only preview bootstrap. Never loaded by the production documents.
 * Uses native account, patient, visit and calculation APIs with fictional data.
 * This intentionally public demo password protects no real account or data.
 */
(function (window) {
  'use strict';
  if (window.location.hostname === 'vildaclinic.github.io' || /(?:^|\.)wagaiwzrost\.pl$/i.test(window.location.hostname)) return;
  const document = window.document;
  const ACCOUNT_KEY = 'vilda-home-preview-fictional-account-v1';
  const VISIT_KEY = 'vilda-home-preview-opened-v1';
  const PASSWORD = 'FictionalOnly#VildaPreview2026!';
  const ACCOUNT_LABEL = 'Podgląd — wyłącznie fikcyjni pacjenci';
  const ACCOUNT_GUIDANCE = 'Podgląd nie może użyć tego konta. Otwórz adres podglądu w nowym oknie prywatnym przeglądarki. Nie zakładaj konta w aplikacji — konto demonstracyjne uruchomi się automatycznie. Nie usuwaj dotychczasowego konta ani jego danych.';
  Object.defineProperty(window, '__VILDA_HOME_WORKSPACE_PREVIEW__', { value: true, writable: false });
  Object.defineProperty(window, 'VILDA_SYNC_WORKER_URL', { value: 'https://vilda-preview-disabled.invalid', writable: false });
  const state = { status: 'starting', fictional: true, doctorAccess: false, error: null };
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
    const badge = document.getElementById?.('vildaHomePreviewBadge');
    if (badge) badge.textContent = active ? 'Podgląd lekarski aktywny · fikcyjne dane' : 'Podgląd · fikcyjne dane';
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
    if (!document.getElementById('vildaHomePreviewBadge')) {
      const badge = document.createElement('a'); badge.id = 'vildaHomePreviewBadge';
      badge.href = 'subskrypcja.html'; badge.setAttribute('aria-label', 'Sprawdź dostęp demonstracyjny');
      document.body.append(badge);
    }
    refreshAccessPresentation();
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

  async function selectPatient(owner, patientId) {
    owner.VildaAuthUI.showPatientCard(patientId, payload => { if (payload) owner.applyLoadedData(payload); }, null);
    const load = await waitFor(() => {
      if (!owner.VildaSaveStatusIndicator?.getCurrentDecision().ready) return null;
      return [...owner.document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Wczytaj tego pacjenta');
    }, 'Nie można otworzyć przykładowej wizyty.');
    load.click();
    const restore = await waitFor(() => !owner.VildaDobAge?.restorePending() && owner.document.getElementById('vildaLcmRestore'), 'Nie można wybrać przykładowej wizyty.');
    await new Promise(resolve => { owner.requestAnimationFrame(() => owner.requestAnimationFrame(resolve)); });
    restore.click();
    await waitFor(() => owner.sessionStorage.getItem('vildaCurrentPatientId') === patientId && ready(owner), 'Nie ukończono wczytywania przykładowej wizyty.');
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
        state.status = 'ready'; showBadge(); boot.screen.remove(); return;
      }
      let owner = await waitFor(() => { const target = ownerWindow(); return ready(target) && target; }, 'Nie ukończono uruchamiania formularza.');
      await waitFor(() => owner.VildaProAccess?.hasAccess() && ready(owner), 'Nie można uruchomić widoku lekarskiego.');
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
        if (patients.length) return patients[0].patientId;
        return (await vault.savePatient(fictionalPayload(), { dedup: false })).patientId;
      };
      const patientId = window.navigator.locks?.request
        ? await window.navigator.locks.request('vilda-home-preview-bootstrap', seed) : await seed();
      if (!window.sessionStorage.getItem(VISIT_KEY)) {
        if (!owner.VildaDataImportExport.hasMeaningfulMainSessionData()) await selectPatient(owner, patientId);
        window.sessionStorage.setItem(VISIT_KEY, '1');
      }
      owner = ownerWindow();
      owner?.VildaHomeWorkspace?.start?.();
      state.status = 'ready'; showBadge(); boot.screen.remove();
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
      state.status = 'ready'; showBadge(); return;
    }
    started = true; start();
  }
  document.addEventListener('vilda:auth-loaded', startWhenRelevant);
  document.addEventListener('vilda:auth-boot-settled', startWhenRelevant);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWhenRelevant, { once: true });
  else startWhenRelevant();
})(window);
