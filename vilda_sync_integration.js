/**
 * vilda_sync_integration.js — Integracja VildaSync z VildaVault + DOM events.
 *
 * ─── Bindingi ─────────────────────────────────────────────────────────────────
 *
 *   VildaVault.onUnlock()       → VildaSync.syncFull()   (gdy sync włączony)
 *   VildaVault.onPatientSaved() → VildaSync.syncPush()   (debounced 5 s)
 *   VildaVault.onLock()         → anuluj oczekujący debounce
 *
 * ─── DOM events (document) ───────────────────────────────────────────────────
 *
 *   'vilda:sync-status-changed'
 *     detail.state  : 'syncing' | 'ok' | 'error' | 'idle'
 *     detail.result : wynik operacji (przy state='ok')
 *     detail.message: opis błędu  (przy state='error')
 *     detail.ts     : Date.now() (przy state='ok'/'error')
 *
 * ─── Konfiguracja ─────────────────────────────────────────────────────────────
 *
 *   localStorage.getItem('vilda-sync-enabled-v1') === 'true'
 *
 * ─── Zależności ───────────────────────────────────────────────────────────────
 *
 *   window.VildaVault — załadowany przed lub po tym module (polling / event)
 *   window.VildaSync  — załadowany przed lub po tym module (polling / event)
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaSyncIntegration && global.VildaSyncIntegration.__vildaSyncIntegration) {
    return; // już zainicjalizowany
  }

  // ─── Stałe ──────────────────────────────────────────────────────────────────

  var SYNC_ENABLED_KEY = 'vilda-sync-enabled-v1';
  var DEBOUNCE_MS      = 5000; // debounce push po zapisie pacjenta
  var UNLOCK_DELAY_MS  = 600;  // krótkie opóźnienie po onUnlock (vault init)

  // ─── Stan modułu ─────────────────────────────────────────────────────────────

  var vaultBound   = false;
  var syncBound    = false;
  var debounceTimer = null;

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function isSyncEnabled() {
    try {
      return !!(global.localStorage && global.localStorage.getItem(SYNC_ENABLED_KEY) === 'true');
    } catch (_) { return false; }
  }

  function setSyncEnabled(val) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(SYNC_ENABLED_KEY, val ? 'true' : 'false');
      }
    } catch (_) {}
    // powiadom UI o zmianie stanu włączenia
    dispatch({ state: val ? 'idle' : 'disabled' });
  }

  function dispatch(detail) {
    try {
      if (typeof global.document !== 'undefined') {
        global.document.dispatchEvent(
          new CustomEvent('vilda:sync-status-changed', { detail: detail, bubbles: false })
        );
      }
    } catch (_) {}
  }

  function getSync()  { return global.VildaSync  || null; }
  function getVault() { return global.VildaVault || null; }

  // ─── Binding: VildaSync → DOM events ─────────────────────────────────────────

  function bindSyncEvents() {
    var S = getSync();
    if (!S || syncBound) return;
    syncBound = true;

    if (typeof S.onSyncStart === 'function') {
      S.onSyncStart(function () {
        dispatch({ state: 'syncing' });
      });
    }
    if (typeof S.onSyncComplete === 'function') {
      S.onSyncComplete(function (result) {
        dispatch({ state: 'ok', result: result, ts: Date.now() });
      });
    }
    if (typeof S.onSyncError === 'function') {
      S.onSyncError(function (err) {
        dispatch({
          state: 'error',
          message: err && err.message ? err.message : String(err),
          ts: Date.now()
        });
      });
    }
  }

  // ─── Binding: VildaVault events → akcje sync ──────────────────────────────────

  function bindVaultEvents() {
    var V = getVault();
    if (!V || vaultBound) return;
    vaultBound = true;

    // onUnlock → syncFull() (z krótkim opóźnieniem żeby vault zdążył się w pełni zainicjować)
    if (typeof V.onUnlock === 'function') {
      V.onUnlock(function () {
        if (!isSyncEnabled()) return;
        var S = getSync();
        if (!S || typeof S.syncFull !== 'function') return;
        setTimeout(function () {
          S.syncFull().catch(function () {});
        }, UNLOCK_DELAY_MS);
      });
    }

    // onPatientSaved → debounced syncPush()
    if (typeof V.onPatientSaved === 'function') {
      V.onPatientSaved(function () {
        if (!isSyncEnabled()) return;
        var S = getSync();
        if (!S || typeof S.syncPush !== 'function') return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          S.syncPush().catch(function () {});
        }, DEBOUNCE_MS);
      });
    }

    // onLock → anuluj oczekujący debounce
    if (typeof V.onLock === 'function') {
      V.onLock(function () {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      });
    }
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  function init() {
    bindSyncEvents();
    bindVaultEvents();

    // Obsługa przypadku gdy vault/sync ładują się po tym module
    if (typeof global.document !== 'undefined') {
      global.document.addEventListener('vilda:auth-loaded', function () {
        bindVaultEvents();
        bindSyncEvents();
      });
    }

    // Safety-net: krótki polling (max 3 s) w razie gdy VildaSync i VildaVault
    // są ładowane asynchronicznie bez zdarzenia 'vilda:auth-loaded'
    var attempts = 0;
    var timer = setInterval(function () {
      bindVaultEvents();
      bindSyncEvents();
      if ((vaultBound && syncBound) || ++attempts >= 30) {
        clearInterval(timer);
      }
    }, 100);
  }

  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // ─── API publiczne ────────────────────────────────────────────────────────────

  global.VildaSyncIntegration = {
    __vildaSyncIntegration: true,
    isSyncEnabled:  isSyncEnabled,
    setSyncEnabled: setSyncEnabled
  };

})(typeof window !== 'undefined' ? window : null);
