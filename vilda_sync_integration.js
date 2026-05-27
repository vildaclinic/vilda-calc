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

  var SYNC_ENABLED_KEY        = 'vilda-sync-enabled-v1';
  var DEBOUNCE_MS             = 5000; // debounce push po zapisie pacjenta
  var DELETE_DEBOUNCE_MS      = 800;  // krótszy debounce po usunięciu (propagacja „na żywo")
  var POLL_INTERVAL_MS        = 45000; // lekki polling syncPull — wyłapuje usunięcia z innych urządzeń
  var UNLOCK_DELAY_MS         = 600;  // krótkie opóźnienie po onUnlock (vault init)
  var NEW_DEVICE_SHOWN_KEY    = 'vilda-new-device-restore-shown-v1'; // sessionStorage flag

  // Kody błędów które blokują dalsze próby do czasu ponownego unlock
  var BLOCKING_ERROR_CODES = ['AUTH_FAILED', 'RATE_LIMITED', 'SLOT_AUTH_MISMATCH'];

  // ─── Stan modułu ─────────────────────────────────────────────────────────────

  var vaultBound    = false;
  var syncBound     = false;
  var debounceTimer = null;
  // Flaga: ustaw po błędzie blokującym, wyczyść przy onUnlock.
  // Zapobiega nieskończonej pętli: AUTH_FAILED → clear state → re-register → 409 → AUTH_FAILED...
  var syncBlockedUntilUnlock = false;
  // ─── Polling „na żywo" ───────────────────────────────────────────────────────
  var pollTimer        = null;
  var pollInProgress   = false;
  var visibilityBound  = false;

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

  // ─── Cloud-only force-pull: wymuszony sync przy unlock konta cloud-only ──
  // Per-user IDB konta cloud-only jest in-memory (pusty po unlock), więc bez
  // wymuszonego pull'a user zobaczy puste pole "Pacjenci". Zwraca Promise,
  // który resolve'uje się gdy syncPull się skończył, lub odrzuca z `code`:
  //   CLOUD_ONLY_NO_SYNC      — sync wyłączony (preferencja użytkownika)
  //   CLOUD_ONLY_NO_API       — brak modułu VildaSync lub metody syncPull
  //   CLOUD_ONLY_PULL_FAILED  — sieć / serwer / autoryzacja (szczegóły w error)
  function forcePullForCloudOnly() {
    return new Promise(function (resolve, reject) {
      if (!isSyncEnabled()) {
        const e = new Error('Tryb chmurowy wymaga włączonej synchronizacji. Włącz ją w Ustawieniach.');
        e.code = 'CLOUD_ONLY_NO_SYNC';
        reject(e);
        return;
      }
      const S = getSync();
      if (!S || typeof S.syncPull !== 'function') {
        const e = new Error('Moduł synchronizacji niedostępny.');
        e.code = 'CLOUD_ONLY_NO_API';
        reject(e);
        return;
      }
      // syncPull jest async — może rzucać błędem albo zwrócić result z błędem w środku.
      Promise.resolve()
        .then(function () { return S.syncPull(); })
        .then(function (result) { resolve(result); })
        .catch(function (err) {
          // Wrap w error z naszym kodem, zachowując oryginalny błąd jako cause.
          const wrapped = new Error((err && err.message) || 'Nie udało się pobrać danych z chmury.');
          wrapped.code = 'CLOUD_ONLY_PULL_FAILED';
          wrapped.cause = err;
          reject(wrapped);
        });
    });
  }
  function dispatchCloudOnlySync(phase, detail) {
    try {
      if (typeof global.document !== 'undefined') {
        global.document.dispatchEvent(new CustomEvent('vilda:cloud-only-sync-' + phase, {
          detail: detail || null, bubbles: false
        }));
      }
    } catch (_) {}
  }

  // ─── Polling „na żywo": okresowy syncPull, by usunięcia (i edycje) z innych ──
  // urządzeń pojawiały się na otwartej karcie bez czekania na ponowne logowanie.
  function isEphemeralActive() {
    var V = getVault();
    try { return !!(V && typeof V.isEphemeralMode === 'function' && V.isEphemeralMode()); }
    catch (_) { return false; }
  }
  function isTabHidden() {
    try { return typeof global.document !== 'undefined' && global.document.hidden === true; }
    catch (_) { return false; }
  }
  function shouldPoll() {
    var V = getVault();
    if (!V || typeof V.isUnlocked !== 'function' || !V.isUnlocked()) return false;
    if (syncBlockedUntilUnlock) return false;
    if (isTabHidden()) return false;
    // Pull ma sens tylko, gdy jest co synchronizować: sync włączony LUB sesja efemeryczna.
    return isSyncEnabled() || isEphemeralActive();
  }
  function pollOnce() {
    if (pollInProgress || !shouldPoll()) return;
    var S = getSync();
    if (!S || typeof S.syncPull !== 'function') return;
    pollInProgress = true;
    Promise.resolve(S.syncPull())
      .catch(function () {})
      .then(function () { pollInProgress = false; });
  }
  function startPolling() {
    if (pollTimer) return;
    try {
      pollTimer = global.setInterval(pollOnce, POLL_INTERVAL_MS);
    } catch (_) { pollTimer = null; }
  }
  function stopPolling() {
    if (pollTimer) { try { global.clearInterval(pollTimer); } catch (_) {} pollTimer = null; }
  }
  function bindVisibility() {
    if (visibilityBound) return;
    try {
      if (typeof global.document !== 'undefined' && typeof global.document.addEventListener === 'function') {
        global.document.addEventListener('visibilitychange', function () {
          if (isTabHidden()) { stopPolling(); }
          else {
            var V = getVault();
            if (V && typeof V.isUnlocked === 'function' && V.isUnlocked()) { startPolling(); pollOnce(); }
          }
        });
        visibilityBound = true;
      }
    } catch (_) { void _; }
  }

  // Wyciągnij kod błędu z obiektu emitowanego przez VildaSync.onSyncError
  // Format: { operation: 'push'|'pull', error: { message, code, ... } }
  function extractErrorCode(emitted) {
    if (!emitted) return null;
    // emitted to { operation, error }
    var err = emitted.error || emitted;
    return (err && err.code) ? err.code : null;
  }

  function extractErrorMessage(emitted) {
    if (!emitted) return 'Nieznany błąd synchronizacji';
    var err = emitted.error || emitted;
    return (err && err.message) ? err.message : String(err);
  }

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
        // Sukces: zresetuj flagę blokady (nie syncBlockedUntilUnlock, bo to reset przy unlock)
        dispatch({ state: 'ok', result: result, ts: Date.now() });
      });
    }
    if (typeof S.onSyncError === 'function') {
      S.onSyncError(function (emitted) {
        var code    = extractErrorCode(emitted);
        var message = extractErrorMessage(emitted);

        // Jeśli błąd jest blokujący — zablokuj kolejne próby do onUnlock
        if (code && BLOCKING_ERROR_CODES.indexOf(code) !== -1) {
          syncBlockedUntilUnlock = true;
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }

        dispatch({ state: 'error', message: message, code: code, ts: Date.now() });
      });
    }
  }

  // ─── Binding: VildaVault events → akcje sync ──────────────────────────────────

  function bindVaultEvents() {
    var V = getVault();
    if (!V || vaultBound) return;
    vaultBound = true;

    // onUnlock → (opcjonalnie: interstitial nowego urządzenia) → syncFull()
    // z krótkim opóźnieniem żeby vault zdążył się w pełni zainicjować.
    //
    // Specjalna ścieżka dla kont cloud-only: per-user IDB jest in-memory (pusty),
    // więc UI bez pacjentów dopóki sync nie ściągnie ich z chmury. Zamiast
    // niezablokowanego syncFull-w-tle, **wymuszamy** pull i dispatchujemy eventy
    // dla UI ('vilda:cloud-only-sync-pulling/complete/failed'), żeby aplikacja
    // mogła pokazać "Synchronizacja z chmurą…" i obsłużyć błąd (offline).
    if (typeof V.onUnlock === 'function') {
      V.onUnlock(function () {
        // Każdy nowy unlock resetuje flagę blokady
        syncBlockedUntilUnlock = false;

        // Polling „na żywo" — startuj po zalogowaniu, reaguj na ukrycie/pokazanie karty.
        bindVisibility();
        startPolling();

        var S = getSync();
        if (!S) return;

        // Cloud-only force-pull: wymagane przed pokazaniem listy pacjentów.
        // Pomijamy interstitial nowego urządzenia (cloud-only jest świadomą
        // sesją na obcym komputerze, nie nowym urządzeniem do "claim'owania").
        if (typeof V.isCloudOnlyMode === 'function' && V.isCloudOnlyMode()) {
          dispatchCloudOnlySync('pulling', null);
          forcePullForCloudOnly().then(function () {
            dispatchCloudOnlySync('complete', null);
          }).catch(function (err) {
            dispatchCloudOnlySync('failed', {
              code: (err && err.code) || 'CLOUD_ONLY_PULL_FAILED',
              message: (err && err.message) || 'Nie udało się pobrać danych z chmury.'
            });
          });
          return; // nie wykonuj klasycznego probeNewDevice / syncFull
        }

        setTimeout(function () {
          if (syncBlockedUntilUnlock) return;

          // Sprawdź czy już pokazaliśmy interstitial w tej sesji
          var alreadyShown = false;
          try {
            alreadyShown = !!(global.sessionStorage &&
              global.sessionStorage.getItem(NEW_DEVICE_SHOWN_KEY));
          } catch (_) {}

          if (alreadyShown) {
            // Interstitial już był pokazany — jeśli sync włączony, odpal normalny sync
            if (isSyncEnabled() && typeof S.syncFull === 'function') {
              S.syncFull().catch(function () {});
            }
            return;
          }

          // Probe działa ZAWSZE (niezależnie od isSyncEnabled) —
          // na nowym urządzeniu sync może być jeszcze wyłączony a slot już istnieć
          if (typeof S.probeNewDevice !== 'function') {
            // Brak metody — wróć do starego zachowania
            if (isSyncEnabled() && typeof S.syncFull === 'function') {
              S.syncFull().catch(function () {});
            }
            return;
          }

          S.probeNewDevice().then(function (result) {
            if (syncBlockedUntilUnlock) return;

            if (result && result.isNewDevice) {
              // Nowe urządzenie + slot na serwerze → pokaż interstitial
              // (niezależnie od tego czy sync był wcześniej włączony)
              try {
                if (global.sessionStorage) {
                  global.sessionStorage.setItem(NEW_DEVICE_SHOWN_KEY, '1');
                }
              } catch (_) {}

              try {
                if (typeof global.document !== 'undefined') {
                  global.document.dispatchEvent(new CustomEvent(
                    'vilda:new-device-restore-available',
                    {
                      detail: { lastModified: result.lastModified || null },
                      bubbles: false
                    }
                  ));
                }
              } catch (_) {}
              // NIE wywołujemy syncFull — użytkownik zdecyduje przez interstitial
            } else {
              // Slot nie istnieje lub urządzenie już zarejestrowane —
              // normalny sync tylko jeśli włączony
              if (isSyncEnabled() && !syncBlockedUntilUnlock && typeof S.syncFull === 'function') {
                S.syncFull().catch(function () {});
              }
            }
          }).catch(function () {
            // Probe nie powiodło się (offline?) — normalny sync jeśli włączony
            if (isSyncEnabled() && !syncBlockedUntilUnlock && typeof S.syncFull === 'function') {
              S.syncFull().catch(function () {});
            }
          });
        }, UNLOCK_DELAY_MS);
      });
    }

    // onPatientSaved → debounced syncPush()
    if (typeof V.onPatientSaved === 'function') {
      V.onPatientSaved(function () {
        if (!isSyncEnabled()) return;
        if (syncBlockedUntilUnlock) return; // nie próbuj gdy zablokowane po błędzie
        var S = getSync();
        if (!S || typeof S.syncPush !== 'function') return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          if (syncBlockedUntilUnlock) return;
          S.syncPush().catch(function () {});
        }, DEBOUNCE_MS);
      });
    }

    // onPatientDeleted → szybki syncPush (propagacja tombstone do innych urządzeń).
    // Krótszy debounce niż przy zapisie: usunięcie ma znikać „na żywo".
    if (typeof V.onPatientDeleted === 'function') {
      V.onPatientDeleted(function () {
        if (!isSyncEnabled()) return;
        if (syncBlockedUntilUnlock) return;
        var S = getSync();
        if (!S || typeof S.syncPush !== 'function') return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          if (syncBlockedUntilUnlock) return;
          S.syncPush().catch(function () {});
        }, DELETE_DEBOUNCE_MS);
      });
    }

    // onLock → anuluj oczekujący debounce
    if (typeof V.onLock === 'function') {
      V.onLock(function () {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        stopPolling(); // zatrzymaj polling po wylogowaniu
        // Nie resetujemy syncBlockedUntilUnlock przy lock — dopiero unlock jest "fresh start"
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
    setSyncEnabled: setSyncEnabled,
    // Cloud-only — wymuszony pull przy unlock; rzuca błędem z `code`
    // ('CLOUD_ONLY_NO_SYNC' | 'CLOUD_ONLY_NO_API' | 'CLOUD_ONLY_PULL_FAILED')
    // jeśli się nie powiedzie. Wystawione publicznie dla testów i dla UI
    // które chce ręcznie zaczać retry.
    forcePullForCloudOnly: forcePullForCloudOnly
  };

})(typeof window !== 'undefined' ? window : null);
