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
  Object.defineProperty(window, '__VILDA_HOME_WORKSPACE_PREVIEW__', { value: true, writable: false });
  Object.defineProperty(window, 'VILDA_SYNC_WORKER_URL', { value: 'https://vilda-preview-disabled.invalid', writable: false });
  const state = { status: 'starting', fictional: true, error: null };
  window.VildaHomePreview = Object.freeze({ getState: () => ({ ...state }) });
  try {
    window.localStorage.setItem('analyticsConsent', 'denied');
    window.localStorage.setItem('vilda-sync-enabled-v1', '0');
    window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    window.localStorage.setItem('pwzNumber', '0000000');
  } catch (_) { /* Normal native storage error is surfaced by the bootstrap. */ }

  function enableFictionalPlan() {
    const access = window.VildaProAccess;
    const vault = window.VildaVault;
    const account = vault?.getCurrentUser();
    let marker;
    try { marker = JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) || 'null'); } catch (_) { return; }
    if (!access || !vault?.isUnlocked() || !account || !marker || account.userId !== marker.userId || account.label !== ACCOUNT_LABEL) return;
    const hadAccess = access.hasAccess();
    access.__setTokenModeForTest(false);
    if (!hadAccess || !access.hasAccess()) access.setPlan('pro', '2099-12-31T23:59:59.000Z');
    window.VildaProUi?.refresh?.();
  }
  let boundVault = null;
  function bindFictionalPlan() {
    const vault = window.VildaVault;
    if (vault && vault !== boundVault && typeof vault.onUnlock === 'function') {
      boundVault = vault;
      vault.onUnlock(enableFictionalPlan);
    }
    enableFictionalPlan();
  }
  // Embedded documents finish parsing before native async session restoration.
  // Native vault unlock does not emit vilda:session-changed, so DCL alone misses
  // these frames. Subscribe once and honor the real auth finalizer as well.
  document.addEventListener('vilda:auth-boot-settled', bindFictionalPlan);
  document.addEventListener('vilda:auth-loaded', bindFictionalPlan);
  document.addEventListener('vilda:session-changed', bindFictionalPlan);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindFictionalPlan, { once: true });
  else bindFictionalPlan();

  if (window !== window.top) return;

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
    screen.setAttribute('role', 'status');
    const panel = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = 'Podgląd nowej strony głównej';
    const message = document.createElement('p'); message.textContent = 'Przygotowuję fikcyjnego pacjenta. Dane podglądu pozostają w tej przeglądarce.';
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
    await waitFor(() => window.VildaVault && window.VildaAuthUI?.isBootReady(), 'Nie ukończono uruchamiania konta podglądu.');
    const vault = window.VildaVault;
    let marker = JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) || 'null');
    const accounts = await vault.listUsers();
    if (!marker) {
      // A foreign account is never adopted, unlocked, deleted or inspected.
      if (accounts.length || vault.isUnlocked()) throw new Error('Ten adres zawiera inne konto. Otwórz podgląd w osobnym profilu przeglądarki.');
      const created = await vault.createUser(PASSWORD, { label: ACCOUNT_LABEL, deferServerContact: true });
      marker = { userId: created.userId };
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(marker));
      window.location.reload();
      return null;
    }
    const account = accounts.find(item => item.userId === marker.userId);
    if (!account || account.label !== ACCOUNT_LABEL) throw new Error('Nie można potwierdzić fikcyjnego konta podglądu.');
    if (vault.isUnlocked() && vault.getCurrentUser()?.userId !== marker.userId) throw new Error('Otwarte jest inne konto. Otwórz podgląd w osobnym profilu przeglądarki.');
    if (!vault.isUnlocked()) {
      await vault.unlockUser(marker.userId, PASSWORD);
      // Upgrade only this verified fictional account's old bootstrap marker.
      // Patient selection now comes from the encrypted vault, never this key.
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ userId: marker.userId }));
      window.location.reload();
      return null;
    }
    if (Object.keys(marker).some(key => key !== 'userId')) {
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ userId: marker.userId }));
    }
    return { userId: marker.userId };
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
    // Supporting standalone documents still get isolation and the fictional
    // plan, but only the main entry points create or load the demo patient.
    if (!/(?:\/|\/index\.html|\/app\.html)$/.test(window.location.pathname)) { state.status = 'ready'; return; }
    const boot = bootScreen();
    try {
      const task = () => ensureAccount();
      const marker = window.navigator.locks?.request
        ? await window.navigator.locks.request('vilda-home-preview-bootstrap', task) : await task();
      if (!marker) return;
      enableFictionalPlan();
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
      const badge = document.createElement('div'); badge.id = 'vildaHomePreviewBadge';
      badge.textContent = 'Podgląd · wyłącznie fikcyjne dane';
      document.body.append(badge);
      state.status = 'ready'; boot.screen.remove();
    } catch (error) {
      state.status = 'error'; state.error = String(error?.message || 'Nie można przygotować podglądu.');
      boot.message.textContent = state.error;
      const retry = document.createElement('button'); retry.textContent = 'Spróbuj ponownie';
      retry.addEventListener('click', () => window.location.reload()); boot.panel.append(retry);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(window);
