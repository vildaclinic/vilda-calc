/**
 * vilda_sync.js — Moduł synchronizacji danych między urządzeniami.
 *
 * ─── Architektura zero-knowledge ─────────────────────────────────────────────
 *
 *   Serwer (Cloudflare Worker) przechowuje wyłącznie zaszyfrowany blob.
 *   Nigdy nie ma dostępu do danych medycznych ani do klucza głównego.
 *
 *   Przepływ push:
 *     1. VildaVault.exportSyncPayload()    → surowe dane pacjentów (RAM tylko)
 *     2. JSON.stringify + TextEncoder      → Uint8Array
 *     3. AES-256-GCM(syncEncKey, iv, data) → zaszyfrowany blob
 *     4. fetch PUT /v1/slots/:slotId/blob  → serwer przechowuje opaque bytes
 *
 *   Przepływ pull:
 *     1. fetch GET /v1/slots/:slotId/blob  → zaszyfrowany blob
 *     2. AES-256-GCM decrypt(syncEncKey)   → surowe dane
 *     3. JSON.parse + TextDecoder          → JS object
 *     4. VildaVault.mergeSyncPayload()     → scalenie z IndexedDB
 *
 *   syncEncKey pochodzi z HKDF(masterKey, info='wagaiwzrost.pl:sync:blob-enc:v1').
 *   Jest non-extractable — przeglądarka blokuje eksport bajtów klucza.
 *
 * ─── Stan synchronizacji (localStorage) ─────────────────────────────────────
 *
 *   Klucz: 'vilda-sync-state-v1:<slotId>'
 *   Wartość: { registered: bool, localEtag: string|null, lastSyncAt: ISO|null }
 *
 *   slotId jest publicznym identyfikatorem (nie sekretem) — bezpieczne jako klucz LS.
 *   authToken nie jest nigdy przechowywany lokalnie — derywowany za każdym razem z masterKey.
 *
 * ─── Retry i obsługa błędów ───────────────────────────────────────────────────
 *
 *   429 Rate Limited   → czekaj Retry-After sekund, powtórz (max MAX_RETRY)
 *   412 Precondition   → syncPull() → merge → powtórz push (max MAX_RETRY)
 *   409 Conflict       → slot już istnieje → przejdź do upload
 *   401 Unauthorized   → wyczyść stan, rzuć AUTH_FAILED
 *   Sieć / timeout     → exponential backoff (1 s, 2 s, 4 s)
 *
 * ─── Zależności ──────────────────────────────────────────────────────────────
 *
 *   window.VildaVault  — musi być załadowany przed tym modułem
 *   window.VildaCrypto — ładowany przez VildaVault
 *
 * ─── Konfiguracja ────────────────────────────────────────────────────────────
 *
 *   window.VILDA_SYNC_WORKER_URL = 'https://vilda-sync.maciej-4b9.workers.dev'
 *   (opcjonalnie, przed załadowaniem tego pliku)
 */

(function (global) {
  'use strict';

  // ─── Stałe ──────────────────────────────────────────────────────────────────

  var SYNC_STATE_KEY_PREFIX = 'vilda-sync-state-v1';
  var DEFAULT_WORKER_URL    = 'https://vilda-sync.maciej-4b9.workers.dev';
  var MAX_RETRY_ATTEMPTS    = 3;
  var FETCH_TIMEOUT_MS      = 30000;
  var BASE_BACKOFF_MS       = 1000;

  // ─── Listeners ──────────────────────────────────────────────────────────────

  var syncStartListeners    = [];
  var syncCompleteListeners = [];
  var syncErrorListeners    = [];

  // ─── Helpers: szyfrowanie / deszyfrowanie ────────────────────────────────────

  /**
   * Szyfruje Uint8Array przez AES-256-GCM.
   * Format wyjścia: [iv:12 bajtów | ciphertext+tag:n+16 bajtów]
   *
   * @param {ArrayBuffer|Uint8Array} plainData
   * @param {CryptoKey}             syncEncKey  — AES-256-GCM, usage=['encrypt']
   * @returns {Promise<ArrayBuffer>}
   */
  async function encryptBlob(plainData, syncEncKey) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      syncEncKey,
      plainData
    );
    var result = new Uint8Array(12 + cipherBuf.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(cipherBuf), 12);
    return result.buffer;
  }

  /**
   * Deszyfruje blob wygenerowany przez encryptBlob().
   * @param {ArrayBuffer} encryptedBuffer
   * @param {CryptoKey}   syncEncKey  — AES-256-GCM, usage=['decrypt']
   * @returns {Promise<ArrayBuffer>}
   */
  async function decryptBlob(encryptedBuffer, syncEncKey) {
    var bytes = new Uint8Array(encryptedBuffer);
    // Minimum: 12 (iv) + 16 (GCM auth tag) = 28 bajtów
    if (bytes.length < 28) {
      throw new Error('VildaSync: nieprawidłowy format bloba (za krótki: ' + bytes.length + ' bajtów).');
    }
    var iv         = bytes.slice(0, 12);
    var ciphertext = bytes.slice(12);
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      syncEncKey,
      ciphertext
    );
  }

  // ─── Helpers: stan sync ──────────────────────────────────────────────────────

  function syncStateKey(slotId) {
    return SYNC_STATE_KEY_PREFIX + ':' + slotId;
  }

  // D3 — Conditional routing stanu sync (cloud-only vs local).
  //
  // Po incydencie C1 (pusty patient list w cloud-only mimo 100+ w chmurze)
  // dokładny root cause został zidentyfikowany: ETag-match branch w syncPull
  // zwracał 'up-to-date' bez pobrania bloba, podczas gdy in-memory adapter
  // cloud-only był pusty po każdym unlock → UI widział pusto.
  //
  // Fix routing (warstwa 1):
  //   • cloud-only mode → state idzie do sessionStorage shim (`veph:`) przez
  //     VildaPersistence.getStorage('local'). State GINIE razem z sesją —
  //     każdy unlock zaczyna z registered=false, localEtag=null → branch
  //     "Scenariusz nowego urządzenia" (probe + adopt + full pull). Privacy
  //     invariant zachowany: stan sync nigdy nie trafia na dysk w cloud-only.
  //
  //   • local mode → state idzie do real localStorage przez
  //     VildaPersistence.getStorage('local-persistent'). ETag PRZEŻYWA restart
  //     sesji — następny unlock skipuje pobranie bloba jeśli ETag matched
  //     (oszczędność ~1s, użyteczne dla local users z dużymi vault'ami).
  //
  // Self-heal (warstwa 2) — patrz syncPull. Defense-in-depth: gdy adapter
  // jest pusty mimo registered+ETag (edge case'y, regresje), syncPull
  // resetuje localEtag i wymusza full pull.
  function syncStateStorage() {
    try {
      var V = global.VildaVault;
      var isCloudOnly = !!(V && typeof V.isCloudOnlyMode === 'function' && V.isCloudOnlyMode());
      var P = global.VildaPersistence;
      if (isCloudOnly) {
        // Cloud-only: shim 'local' → veph: w sessionStorage, ginie z sesją
        if (P && typeof P.getStorage === 'function') {
          var sCO = P.getStorage('local');
          if (sCO) return sCO;
        }
        // Fallback: bezpośrednio sessionStorage (bez VildaPersistence)
        return global.sessionStorage || null;
      }
      // Local mode: real localStorage, persistuje między sesjami
      if (P && typeof P.getStorage === 'function') {
        var sLocal = P.getStorage('local-persistent');
        if (sLocal) return sLocal;
      }
    } catch (_) {}
    return global.localStorage || null;
  }

  function loadSyncState(slotId) {
    try {
      var store = syncStateStorage();
      var raw = store && store.getItem(syncStateKey(slotId));
      if (!raw) return { registered: false, localEtag: null, lastSyncAt: null };
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object')
        ? parsed
        : { registered: false, localEtag: null, lastSyncAt: null };
    } catch (_) {
      return { registered: false, localEtag: null, lastSyncAt: null };
    }
  }

  function saveSyncState(slotId, state) {
    try {
      var store = syncStateStorage();
      if (store) {
        store.setItem(syncStateKey(slotId), JSON.stringify(state));
      }
    } catch (_) {}
  }

  function clearSyncStateForSlot(slotId) {
    try {
      var store = syncStateStorage();
      if (store) {
        store.removeItem(syncStateKey(slotId));
      }
    } catch (_) {}
  }

  // ─── Helpers: sieć ──────────────────────────────────────────────────────────

  function getWorkerUrl() {
    return (global.VILDA_SYNC_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/$/, '');
  }

  /**
   * fetch z limitem czasu.
   * Rzuca błąd z code='TIMEOUT' jeśli przekroczono FETCH_TIMEOUT_MS.
   */
  async function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timerId = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } catch (e) {
      if (e.name === 'AbortError') {
        var err = new Error('VildaSync: timeout żądania do serwera (' + FETCH_TIMEOUT_MS + ' ms).');
        err.code = 'TIMEOUT';
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timerId);
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Parsuje nagłówek Retry-After (w sekundach) z odpowiedzi 429.
   * Zwraca BASE_BACKOFF_MS jeśli nagłówek nieobecny lub nieparseowalny.
   */
  function parseRetryAfterMs(response) {
    var header = response.headers.get('Retry-After');
    if (!header) return BASE_BACKOFF_MS;
    var seconds = parseInt(header, 10);
    return (isFinite(seconds) && seconds > 0) ? seconds * 1000 : BASE_BACKOFF_MS;
  }

  /**
   * Parsuje ETag z nagłówka (usuwa opcjonalne cudzysłowy).
   * @param {string|null} rawEtag
   * @returns {string|null}
   */
  function parseETag(rawEtag) {
    if (!rawEtag) return null;
    return rawEtag.trim().replace(/^"(.*)"$/, '$1');
  }

  // ─── Helpers: błędy sync ────────────────────────────────────────────────────

  function syncError(message, code, extra) {
    var e = new Error(message);
    e.code = code || 'SYNC_ERROR';
    if (extra) { Object.assign(e, extra); }
    return e;
  }

  // ─── Walidacja vault ────────────────────────────────────────────────────────

  function requireUnlockedVault() {
    var vault = global.VildaVault;
    if (!vault || !vault.isUnlocked()) {
      throw syncError('VildaSync: vault nie jest odblokowany. Zaloguj się przed synchronizacją.', 'VAULT_LOCKED');
    }
    return vault;
  }

  // D3 self-heal helper: czy lokalny vault adapter jest pusty (0 pacjentów)?
  // Używany w syncPull do wymuszenia full pulla gdy state mówi "zsynchronizowany"
  // ale adapter w rzeczywistości nie ma danych (cloud-only po unlock, lub
  // wyczyszczony IDB w trybie local). Defensywny try/catch — gdy listPatients
  // rzuca, zwracamy false (nie modyfikujemy zachowania).
  async function isVaultAdapterEmpty() {
    try {
      var V = global.VildaVault;
      if (!V || typeof V.listPatients !== 'function') return false;
      var patients = await V.listPatients();
      return Array.isArray(patients) && patients.length === 0;
    } catch (_) {
      return false;
    }
  }

  // ─── Eventy ────────────────────────────────────────────────────────────────

  function emit(listeners, data) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](data); } catch (_) {}
    }
  }

  // ─── CORE: syncPush ─────────────────────────────────────────────────────────

  /**
   * Eksportuje vault i przesyła zaszyfrowany blob na serwer.
   *
   * Przy pierwszym wywołaniu: rejestruje slot (POST /register).
   * Przy kolejnych: aktualizuje blob (PUT /blob) z If-Match.
   *
   * Obsługuje konflikty (412): automatycznie pulluje, merguje i powtarza upload
   * (max MAX_RETRY_ATTEMPTS razy).
   *
   * @returns {Promise<{ action: 'registered'|'uploaded', etag: string }>}
   */
  async function syncPush() {
    var vault = requireUnlockedVault();
    emit(syncStartListeners, { operation: 'push' });

    var syncMat;
    try {
      syncMat = await vault.getSyncMaterial();
    } catch (e) {
      emit(syncErrorListeners, { operation: 'push', error: e });
      throw e;
    }

    var slotId        = syncMat.slotId;
    var authToken     = syncMat.authToken;
    var authTokenHash = syncMat.authTokenHash;
    var syncEncKey    = syncMat.syncEncKey;
    var workerUrl     = getWorkerUrl();
    var state         = loadSyncState(slotId);

    try {
      // Buduj zaszyfrowany blob z bieżącego stanu vaultu
      var rawData    = await vault.exportSyncPayload();
      var plainBytes = new TextEncoder().encode(JSON.stringify(rawData));
      var encBlob    = await encryptBlob(plainBytes, syncEncKey);

      for (var attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {

        // ── Przypadek 1: Slot niezarejestrowany — POST /register ────────────
        if (!state.registered) {
          var regResp = await fetchWithTimeout(
            workerUrl + '/v1/slots/' + slotId + '/register',
            {
              method:  'POST',
              headers: {
                'Content-Type':      'application/octet-stream',
                'X-Auth-Token-Hash': authTokenHash
              },
              body: encBlob
            }
          );

          if (regResp.status === 201) {
            var regData   = await regResp.json();
            state.registered = true;
            state.localEtag  = regData.etag;
            state.lastSyncAt = new Date().toISOString();
            saveSyncState(slotId, state);
            var result = { action: 'registered', etag: regData.etag };
            emit(syncCompleteListeners, { operation: 'push', result: result });
            return result;
          }

          if (regResp.status === 409) {
            // Slot już istnieje na serwerze.
            // Jeśli to NOWE URZĄDZENIE (state.registered był false = świeże localStorage),
            // najpierw pobierz dane serwera, żeby nie nadpisać ich lokalnym (pustym) vaultem.
            var isNewDevice = !state.registered;
            state.registered = true;
            saveSyncState(slotId, state);
            var stResp = await fetchWithTimeout(
              workerUrl + '/v1/slots/' + slotId + '/status',
              { method: 'GET', headers: { 'Authorization': 'Bearer ' + authToken } }
            );
            if (stResp.ok) {
              var stData      = await stResp.json();
              state.localEtag = stData.etag;
              saveSyncState(slotId, state);
            }

            if (isNewDevice) {
              // Nowe urządzenie: zamiast nadpisywać, pobierz i scal dane serwera
              try {
                var pullResp = await fetchWithTimeout(
                  workerUrl + '/v1/slots/' + slotId + '/blob',
                  { method: 'GET', headers: { 'Authorization': 'Bearer ' + authToken } }
                );
                if (pullResp.ok) {
                  var pullEncBuf = await pullResp.arrayBuffer();
                  var pullPlain  = await decryptBlob(pullEncBuf, syncEncKey);
                  var pullRaw    = JSON.parse(new TextDecoder().decode(pullPlain));
                  await vault.mergeSyncPayload(pullRaw);
                  // Przebuduj blob z połączonymi danymi
                  var mergedRaw   = await vault.exportSyncPayload();
                  var mergedPlain = new TextEncoder().encode(JSON.stringify(mergedRaw));
                  encBlob = await encryptBlob(mergedPlain, syncEncKey);
                }
              } catch (_) {
                // Jeśli pull się nie udał — kontynuuj z lokalnym stanem
              }
            }
            // Kontynuuj do upload poniżej (nie return)

          } else if (regResp.status === 429) {
            if (attempt < MAX_RETRY_ATTEMPTS) {
              await sleep(parseRetryAfterMs(regResp));
              continue;
            }
            throw syncError('VildaSync: zbyt wiele żądań rejestracji. Spróbuj za chwilę.', 'RATE_LIMITED');

          } else if (!regResp.ok) {
            var regBody = await regResp.json().catch(function () { return {}; });
            throw syncError(
              'VildaSync: błąd rejestracji slotu (' + regResp.status + '): ' +
              ((regBody.error && regBody.error.message) || ''),
              'REGISTER_FAILED',
              { httpStatus: regResp.status }
            );
          }
        }

        // ── Przypadek 2: Slot zarejestrowany — PUT /blob ────────────────────
        // Potrzebujemy aktualnego ETag dla If-Match
        if (!state.localEtag) {
          var fetchStResp = await fetchWithTimeout(
            workerUrl + '/v1/slots/' + slotId + '/status',
            { method: 'GET', headers: { 'Authorization': 'Bearer ' + authToken } }
          );
          if (fetchStResp.status === 401) {
            clearSyncStateForSlot(slotId);
            throw syncError('VildaSync: błąd uwierzytelnienia. Dane sync mogły zostać usunięte.', 'AUTH_FAILED');
          }
          if (fetchStResp.ok) {
            var fetchStData = await fetchStResp.json();
            state.localEtag = fetchStData.etag || null;
            saveSyncState(slotId, state);
          }
        }

        // Brak ETag = slot "identity-only" (zarejestrowany bez danych, np.
        // użytkownik najpierw odrzucił synchronizację, a włączył ją później).
        // Pierwszy upload na taki slot wykonujemy bezwarunkowo — bez nagłówka
        // If-Match. Worker rozpozna brak bloba i przyjmie go jako wpis
        // początkowy. Dla slotów z danymi If-Match nadal zapewnia optimistic
        // locking (ochrona przed cichym nadpisaniem zmian z innego urządzenia).
        var putHeaders = {
          'Content-Type':  'application/octet-stream',
          'Authorization': 'Bearer ' + authToken
        };
        if (state.localEtag) {
          putHeaders['If-Match'] = '"' + state.localEtag + '"';
        }

        var putResp = await fetchWithTimeout(
          workerUrl + '/v1/slots/' + slotId + '/blob',
          {
            method:  'PUT',
            headers: putHeaders,
            body: encBlob
          }
        );

        if (putResp.status === 200) {
          var putData      = await putResp.json();
          state.localEtag  = putData.etag;
          state.lastSyncAt = new Date().toISOString();
          saveSyncState(slotId, state);
          var uploadResult = { action: 'uploaded', etag: putData.etag };
          emit(syncCompleteListeners, { operation: 'push', result: uploadResult });
          return uploadResult;
        }

        if (putResp.status === 412) {
          // Konflikt — inne urządzenie nadpisało dane; pull → merge → retry
          if (attempt < MAX_RETRY_ATTEMPTS) {
            await syncPull();
            // Przebuduj blob po merge
            var freshRaw   = await vault.exportSyncPayload();
            var freshPlain = new TextEncoder().encode(JSON.stringify(freshRaw));
            encBlob        = await encryptBlob(freshPlain, syncEncKey);
            // Zaktualizuj ETag ze stanu (syncPull mógł go zmienić)
            state = loadSyncState(slotId);
            continue;
          }
          throw syncError(
            'VildaSync: konflikt danych po ' + MAX_RETRY_ATTEMPTS + ' próbach scalenia. ' +
            'Spróbuj ponownie za chwilę.',
            'CONFLICT'
          );
        }

        if (putResp.status === 429) {
          if (attempt < MAX_RETRY_ATTEMPTS) {
            await sleep(parseRetryAfterMs(putResp));
            continue;
          }
          throw syncError('VildaSync: zbyt wiele żądań uploadu. Spróbuj za chwilę.', 'RATE_LIMITED');
        }

        if (putResp.status === 401) {
          clearSyncStateForSlot(slotId);
          throw syncError('VildaSync: błąd uwierzytelnienia przy upload.', 'AUTH_FAILED');
        }

        var putBody = await putResp.json().catch(function () { return {}; });
        throw syncError(
          'VildaSync: upload nieudany (' + putResp.status + '): ' +
          ((putBody.error && putBody.error.message) || ''),
          'UPLOAD_FAILED',
          { httpStatus: putResp.status }
        );
      }

      throw syncError('VildaSync: przekroczono limit prób push.', 'MAX_RETRIES_EXCEEDED');

    } catch (e) {
      emit(syncErrorListeners, { operation: 'push', error: e });
      throw e;
    }
  }

  // ─── CORE: syncPull ─────────────────────────────────────────────────────────

  /**
   * Pobiera blob z serwera i scala z lokalnym vaultem.
   *
   * Używa warunkowego GET (If-None-Match) — jeśli ETag się nie zmienił,
   * serwer zwraca 304 i nie przesyła bloba (oszczędność transferu).
   *
   * @returns {Promise<{ action: 'not-registered'|'up-to-date'|'merged', etag?: string, mergeResult?: object }>}
   */
  async function syncPull() {
    var vault = requireUnlockedVault();
    emit(syncStartListeners, { operation: 'pull' });

    var syncMat;
    try {
      syncMat = await vault.getSyncMaterial();
    } catch (e) {
      emit(syncErrorListeners, { operation: 'pull', error: e });
      throw e;
    }

    var slotId     = syncMat.slotId;
    var authToken  = syncMat.authToken;
    var syncEncKey = syncMat.syncEncKey;
    var workerUrl  = getWorkerUrl();
    var state      = loadSyncState(slotId);

    try {
      // ── Scenariusz nowego urządzenia ────────────────────────────────────────
      // Gdy localnie niezarejestrowany, sprawdź czy slot istnieje na serwerze
      // (inny device mógł go zarejestrować z tym samym masterKey).
      if (!state.registered) {
        var probeResp = await fetchWithTimeout(
          workerUrl + '/v1/slots/' + slotId + '/status',
          { method: 'GET', headers: { 'Authorization': 'Bearer ' + authToken } }
        );
        if (!probeResp.ok) {
          // Slot nie istnieje lub token nie pasuje — naprawdę niezarejestrowane
          var notRegResult = { action: 'not-registered' };
          emit(syncCompleteListeners, { operation: 'pull', result: notRegResult });
          return notRegResult;
        }
        // Slot istnieje i token pasuje → adoptuj, wymuś pełne pobranie danych
        var probeJson = await probeResp.json();
        state.registered = true;
        state.localEtag  = null;
        saveSyncState(slotId, state);
        var statusData = probeJson;
      } else {
        // 1. Sprawdź metadane serwera (lekkie — bez pobierania bloba)
        var statusResp = await fetchWithTimeout(
          workerUrl + '/v1/slots/' + slotId + '/status',
          { method: 'GET', headers: { 'Authorization': 'Bearer ' + authToken } }
        );

        if (statusResp.status === 401) {
          // Slot usunięty lub auth nieważny
          clearSyncStateForSlot(slotId);
          throw syncError('VildaSync: błąd uwierzytelnienia przy pull. Slot mógł zostać usunięty.', 'AUTH_FAILED');
        }
        if (!statusResp.ok) {
          throw syncError(
            'VildaSync: błąd odczytu statusu (' + statusResp.status + ').',
            'STATUS_FAILED',
            { httpStatus: statusResp.status }
          );
        }

        var statusData = await statusResp.json();
      }

      // D3 self-heal (warstwa 2): zanim pominiemy pobranie bloba na podstawie
      // ETag-match, upewnij się że lokalny adapter MA dane. Edge case'y:
      //   - regresja routingu syncStateStorage (np. ETag wszedł do real localStorage
      //     mimo cloud-only mode)
      //   - user wyczyścił IDB ręcznie ale localStorage został
      //   - przyszłe zmiany w storageMode które rozspójniły stan
      // Gdy adapter pusty + state mówi że jest zsynchronizowany → wymuś full pull.
      if (state.localEtag && state.localEtag === statusData.etag) {
        var adapterEmpty = await isVaultAdapterEmpty();
        if (adapterEmpty) {
          // adapter pusty mimo localEtag — reset i pobierz blob
          state.localEtag = null;
          // (state nie zapisujemy jeszcze — saveSyncState wykona się po merge)
        } else {
          var upToDateResult = { action: 'up-to-date', etag: statusData.etag };
          emit(syncCompleteListeners, { operation: 'pull', result: upToDateResult });
          return upToDateResult;
        }
      }

      // 3. Pobierz blob z warunkowym GET (If-None-Match)
      var downloadHeaders = { 'Authorization': 'Bearer ' + authToken };
      if (state.localEtag) {
        downloadHeaders['If-None-Match'] = '"' + state.localEtag + '"';
      }

      var blobResp = await fetchWithTimeout(
        workerUrl + '/v1/slots/' + slotId + '/blob',
        { method: 'GET', headers: downloadHeaders }
      );

      if (blobResp.status === 304) {
        // Serwer potwierdza że mamy aktualną wersję
        var alreadyUpToDate = { action: 'up-to-date', etag: state.localEtag };
        emit(syncCompleteListeners, { operation: 'pull', result: alreadyUpToDate });
        return alreadyUpToDate;
      }
      if (blobResp.status === 401) {
        throw syncError('VildaSync: błąd uwierzytelnienia przy pobieraniu bloba.', 'AUTH_FAILED');
      }
      if (blobResp.status === 404) {
        // Slot istnieje w metadanych, ale nie ma jeszcze bloba danych w R2.
        // Dzieje się tak dla slotu "identity-only" — użytkownik włączył
        // synchronizację po fakcie i jeszcze nic nie wysłał na serwer.
        // To NIE jest błąd: nie ma po prostu czego pobierać. Kończymy pull
        // bez wyjątku, żeby syncFull() mógł przejść dalej do syncPush()
        // i wykonać pierwsze wysłanie danych.
        var noRemoteBlobResult = { action: 'no-remote-blob' };
        emit(syncCompleteListeners, { operation: 'pull', result: noRemoteBlobResult });
        return noRemoteBlobResult;
      }
      if (!blobResp.ok) {
        throw syncError(
          'VildaSync: błąd pobierania danych (' + blobResp.status + ').',
          'DOWNLOAD_FAILED',
          { httpStatus: blobResp.status }
        );
      }

      // 4. Odszyfruj blob
      var encBuf = await blobResp.arrayBuffer();
      var plainBuf;
      try {
        plainBuf = await decryptBlob(encBuf, syncEncKey);
      } catch (decErr) {
        throw syncError(
          'VildaSync: błąd odszyfrowania danych. Możliwa zmiana masterKey lub uszkodzenie danych.',
          'DECRYPT_FAILED'
        );
      }

      // 5. Parsuj JSON
      var rawData;
      try {
        rawData = JSON.parse(new TextDecoder().decode(plainBuf));
      } catch (_) {
        throw syncError('VildaSync: uszkodzone dane sync (nieprawidłowy format JSON).', 'PARSE_FAILED');
      }

      // 6. Scalaj z lokalnym vaultem
      // C3: progress callback — emituje event 'vilda:vault-merge-progress' co
      // iteracja pacjenta. Defensywny try/catch w środku callbacka (vault'owy
      // _emitProgress też ma try/catch — double-safe). Jeśli vault nie obsługuje
      // 2-go param (starsza wersja), Promise i tak działa, callback po prostu
      // nie wywołany.
      var mergeResult = await vault.mergeSyncPayload(rawData, {
        onProgress: function (info) {
          try {
            if (typeof global.document !== 'undefined' && global.document.dispatchEvent) {
              global.document.dispatchEvent(new CustomEvent('vilda:vault-merge-progress', {
                detail: info, bubbles: false
              }));
            }
          } catch (_) {}
        }
      });

      // 7. Zapisz nowy ETag
      var serverEtag  = parseETag(blobResp.headers.get('ETag')) || statusData.etag;
      state.localEtag  = serverEtag;
      state.lastSyncAt = new Date().toISOString();
      saveSyncState(slotId, state);

      var mergedResult = { action: 'merged', etag: serverEtag, mergeResult: mergeResult };
      emit(syncCompleteListeners, { operation: 'pull', result: mergedResult });
      return mergedResult;

    } catch (e) {
      emit(syncErrorListeners, { operation: 'pull', error: e });
      throw e;
    }
  }

  // ─── CORE: syncFull ─────────────────────────────────────────────────────────

  /**
   * Pełna synchronizacja: pull (pobierz i scal) → push (wyślij scalony stan).
   *
   * @returns {Promise<{ pull: object, push: object }>}
   */
  async function syncFull() {
    requireUnlockedVault();
    emit(syncStartListeners, { operation: 'full' });

    try {
      var pullResult = await syncPull();
      var pushResult = await syncPush();
      var fullResult = { pull: pullResult, push: pushResult };
      emit(syncCompleteListeners, { operation: 'full', result: fullResult });
      return fullResult;
    } catch (e) {
      emit(syncErrorListeners, { operation: 'full', error: e });
      throw e;
    }
  }

  // ─── Status / info ──────────────────────────────────────────────────────────

  /**
   * Sprawdza aktualny stan sync dla zalogowanego użytkownika.
   * Wymaga odblokowanego vaultu.
   *
   * @returns {Promise<{ registered: bool, localEtag: string|null, lastSyncAt: string|null }>}
   */
  async function getSyncStatus() {
    var vault   = requireUnlockedVault();
    var syncMat = await vault.getSyncMaterial();
    return loadSyncState(syncMat.slotId);
  }

  /**
   * Usuwa lokalny stan sync dla bieżącego użytkownika.
   * Użyteczne gdy chcemy "zresetować" sync (np. po zmianie masterKey).
   */
  async function clearSyncState() {
    var vault = requireUnlockedVault();
    var syncMat = await vault.getSyncMaterial();
    clearSyncStateForSlot(syncMat.slotId);
  }

  /**
   * Usuwa slot z serwera i czyści lokalny stan sync.
   * Wymaga odblokowanego vaultu.
   */
  async function deleteSyncSlot() {
    var vault   = requireUnlockedVault();
    var syncMat = await vault.getSyncMaterial();
    var slotId  = syncMat.slotId;
    var state   = loadSyncState(slotId);

    if (!state.registered) {
      return { action: 'not-registered' };
    }

    var resp = await fetchWithTimeout(
      getWorkerUrl() + '/v1/slots/' + slotId,
      {
        method:  'DELETE',
        headers: { 'Authorization': 'Bearer ' + syncMat.authToken }
      }
    );

    if (resp.status === 204 || resp.status === 401) {
      // 204 = usunięto; 401 = slot już nie istnieje
      clearSyncStateForSlot(slotId);
      return { action: 'deleted' };
    }

    throw syncError(
      'VildaSync: błąd usuwania slotu (' + resp.status + ').',
      'DELETE_FAILED',
      { httpStatus: resp.status }
    );
  }

  // ─── Wykrywanie nowego urządzenia ───────────────────────────────────────────

  /**
   * Sprawdza, czy bieżące urządzenie jest "nowe" (lokalnie niezarejestrowane)
   * i czy na serwerze istnieje slot dla tego konta.
   *
   * Używane przed syncFull() żeby zdecydować czy pokazać interstitial
   * "Znaleziono Twoje dane na serwerze".
   *
   * @returns {Promise<{ isNewDevice: boolean, lastModified: string|null }>}
   */
  async function probeNewDevice() {
    var vault;
    try { vault = requireUnlockedVault(); } catch (_) { return { isNewDevice: false, lastModified: null }; }
    var syncMat;
    try { syncMat = await vault.getSyncMaterial(); } catch (_) { return { isNewDevice: false, lastModified: null }; }
    var slotId = syncMat.slotId;
    var state  = loadSyncState(slotId);
    if (state.registered) {
      // Urządzenie już wcześniej rejestrowało się — nie jest nowe
      return { isNewDevice: false, lastModified: null };
    }
    try {
      var resp = await fetchWithTimeout(
        getWorkerUrl() + '/v1/slots/' + slotId + '/status',
        { method: 'GET', headers: { 'Authorization': 'Bearer ' + syncMat.authToken } }
      );
      if (!resp.ok) {
        // Brak slotu lub błąd auth — slot nie istnieje na serwerze
        return { isNewDevice: false, lastModified: null };
      }
      var data = await resp.json();
      return {
        isNewDevice:  true,
        lastModified: data.lastModified || data.updatedAt || null
      };
    } catch (_) {
      return { isNewDevice: false, lastModified: null };
    }
  }

  // ─── Rotacja tożsamości / rewokacja urządzeń (Faza 4) ────────────────────────

  /**
   * Zapełnia slot zaszyfrowanym blobem: POST /register; jeśli 409 (slot istnieje)
   * → PUT /blob (bez If-Match — rotacja celowo zastępuje zawartość). Używane do
   * zasilenia NOWEGO slotu istniejącym (już zaszyfrowanym) blobem przy rotacji.
   *
   * @returns {Promise<{ action:'registered'|'uploaded', etag:string|null }>}
   */
  async function uploadToSlot(slotId, authToken, authTokenHash, encBlob) {
    var workerUrl = getWorkerUrl();
    var regResp = await fetchWithTimeout(
      workerUrl + '/v1/slots/' + slotId + '/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Auth-Token-Hash': authTokenHash },
        body: encBlob
      }
    );
    if (regResp.status === 201) {
      var regData = await regResp.json().catch(function () { return {}; });
      return { action: 'registered', etag: regData.etag || null };
    }
    if (regResp.status === 409) {
      var putResp = await fetchWithTimeout(
        workerUrl + '/v1/slots/' + slotId + '/blob',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream', 'Authorization': 'Bearer ' + authToken },
          body: encBlob
        }
      );
      if (putResp.status === 200) {
        var putData = await putResp.json().catch(function () { return {}; });
        return { action: 'uploaded', etag: putData.etag || null };
      }
      throw syncError('VildaSync.uploadToSlot: błąd uploadu na istniejący slot (' + putResp.status + ').',
        'UPLOAD_FAILED', { httpStatus: putResp.status });
    }
    throw syncError('VildaSync.uploadToSlot: błąd rejestracji slotu (' + regResp.status + ').',
      'REGISTER_FAILED', { httpStatus: regResp.status });
  }

  /**
   * Kasuje slot na serwerze danym authTokenem. 204 = usunięto; 401/404 = slot już
   * nie istnieje (traktujemy jako sukces — idempotentne).
   *
   * @returns {Promise<{ action:'deleted'|'absent' }>}
   */
  async function deleteSlotWithMaterial(slotId, authToken) {
    var resp = await fetchWithTimeout(
      getWorkerUrl() + '/v1/slots/' + slotId,
      { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + authToken } }
    );
    if (resp.status === 204) return { action: 'deleted' };
    if (resp.status === 401 || resp.status === 404) return { action: 'absent' };
    throw syncError('VildaSync.deleteSlotWithMaterial: błąd kasacji slotu (' + resp.status + ').',
      'DELETE_FAILED', { httpStatus: resp.status });
  }

  /**
   * "Wyloguj wszystkie urządzenia": rotuje tożsamość synchronizacji i przenosi
   * dane na NOWY slot, kasując STARY.
   *
   * Kolejność (bezpieczna dla danych): najpierw ZAPEŁNIAMY nowy slot, dopiero
   * potem KASUJEMY stary — przerwanie w połowie nigdy nie gubi danych (najwyżej
   * zostaje osierocony stary slot, który następny push/rewokacja może skasować).
   *
   * Skutki:
   *   • inne urządzenia trzymają stary SIS → ich authToken przestaje pasować
   *     (stary slot skasowany) → tracą dostęp do synchronizacji,
   *   • stary klucz odzyskiwania zostaje unieważniony (vault.rotateSyncIdentity),
   *   • bieżące urządzenie otrzymuje NOWY klucz odzyskiwania (do pokazania userowi),
   *   • DEK = master niezmieniony → dane lokalne i blob przeżywają.
   *
   * UWAGA (model zagrożeń): w aplikacji E2E lokalnej nie da się zdalnie wymazać
   * IndexedDB innych urządzeń — one tracą jedynie dostęp do SYNCHRONIZACJI oraz
   * stary klucz odzyskiwania. Lokalna sesja innego urządzenia działa do idle-locka.
   *
   * @param {string} password
   * @returns {Promise<{ recoveryKey:string, oldSlotId:string, newSlotId:string, oldSlotRevoked:boolean }>}
   */
  async function revokeAllDevices(password) {
    var vault = requireUnlockedVault();
    if (typeof vault.rotateSyncIdentity !== 'function') {
      throw syncError('VildaSync.revokeAllDevices: vault nie wspiera rotacji tożsamości.', 'NOT_SUPPORTED');
    }
    emit(syncStartListeners, { operation: 'revoke' });
    try {
      // 1) Materiał STAREGO slotu (przed rotacją).
      var oldMat = await vault.getSyncMaterial();
      var oldSlotId = oldMat.slotId;
      var oldAuthToken = oldMat.authToken;

      // 2) Rotacja LOKALNA: nowy SIS + nowy klucz odzyskiwania (bramka hasłem).
      //    Rzuca przed jakimkolwiek dotknięciem serwera, jeśli hasło złe.
      var rot = await vault.rotateSyncIdentity(password);

      // 3) Materiał NOWEGO slotu (po rotacji). syncEncKey TEN SAM (z DEK).
      var newMat = await vault.getSyncMaterial();
      var newSlotId = newMat.slotId;

      // 4) Zbuduj zaszyfrowany blob z bieżących danych.
      var rawData = await vault.exportSyncPayload();
      var plainBytes = new TextEncoder().encode(JSON.stringify(rawData));
      var encBlob = await encryptBlob(plainBytes, newMat.syncEncKey);

      // 5) Zapełnij NOWY slot (dane bezpieczne ZANIM skasujemy stary).
      var upRes = await uploadToSlot(newSlotId, newMat.authToken, newMat.authTokenHash, encBlob);
      var newState = loadSyncState(newSlotId) || {};
      newState.registered = true;
      newState.localEtag = upRes.etag || null;
      newState.lastSyncAt = new Date().toISOString();
      saveSyncState(newSlotId, newState);

      // 6) Skasuj STARY slot (best-effort; idempotentne).
      var oldRevoked = false;
      try {
        var delRes = await deleteSlotWithMaterial(oldSlotId, oldAuthToken);
        oldRevoked = (delRes.action === 'deleted' || delRes.action === 'absent');
      } catch (_) {
        oldRevoked = false; // nowy slot już żyje; stary można skasować przy następnej rewokacji
      }
      clearSyncStateForSlot(oldSlotId);

      var result = {
        recoveryKey: rot.recoveryKey,
        oldSlotId: oldSlotId,
        newSlotId: newSlotId,
        oldSlotRevoked: oldRevoked
      };
      emit(syncCompleteListeners, { operation: 'revoke', result: result });
      return result;
    } catch (e) {
      emit(syncErrorListeners, { operation: 'revoke', error: e });
      throw e;
    }
  }

  // ─── Rejestracja listenerów ──────────────────────────────────────────────────

  function onSyncStart(cb)    { if (typeof cb === 'function') syncStartListeners.push(cb); }
  function onSyncComplete(cb) { if (typeof cb === 'function') syncCompleteListeners.push(cb); }
  function onSyncError(cb)    { if (typeof cb === 'function') syncErrorListeners.push(cb); }

  // ─── Publiczne API ───────────────────────────────────────────────────────────

  global.VildaSync = {
    /**
     * Wyślij zaszyfrowane dane na serwer (rejestruj lub aktualizuj).
     * @returns {Promise<{ action: 'registered'|'uploaded', etag: string }>}
     */
    syncPush:      syncPush,

    /**
     * Pobierz dane z serwera i scal z lokalnym vaultem.
     * @returns {Promise<{ action: 'not-registered'|'up-to-date'|'merged', ... }>}
     */
    syncPull:      syncPull,

    /**
     * Pełna synchronizacja: pull → push.
     * @returns {Promise<{ pull: object, push: object }>}
     */
    syncFull:      syncFull,

    /**
     * Sprawdź lokalny stan sync (registered, localEtag, lastSyncAt).
     * @returns {Promise<object>}
     */
    getSyncStatus: getSyncStatus,

    /**
     * Wyczyść lokalny stan sync (bez dotykania serwera).
     */
    clearSyncState: clearSyncState,

    /**
     * Usuń slot z serwera i wyczyść stan lokalny.
     * @returns {Promise<{ action: 'deleted'|'not-registered' }>}
     */
    deleteSyncSlot: deleteSyncSlot,

    /** Callback wywoływany na początku każdej operacji sync. */
    onSyncStart:    onSyncStart,

    /** Callback wywoływany po pomyślnej operacji sync. */
    onSyncComplete: onSyncComplete,

    /** Callback wywoływany przy błędzie sync. */
    onSyncError:    onSyncError,

    /**
     * Sprawdź czy to nowe urządzenie z danymi na serwerze.
     * @returns {Promise<{ isNewDevice: boolean, lastModified: string|null }>}
     */
    probeNewDevice: probeNewDevice,

    /**
     * "Wyloguj wszystkie urządzenia": rotacja tożsamości sync + przeniesienie
     * danych na nowy slot + kasacja starego + nowy klucz odzyskiwania.
     * @returns {Promise<{ recoveryKey, oldSlotId, newSlotId, oldSlotRevoked }>}
     */
    revokeAllDevices: revokeAllDevices,

    /** Zapełnia slot blobem (register-or-PUT). */
    uploadToSlot: uploadToSlot,

    /** Idempotentna kasacja slotu danym authTokenem. */
    deleteSlotWithMaterial: deleteSlotWithMaterial,

    // Hooki testowe (routing stanu sync — ephemeral-aware).
    _loadSyncState: loadSyncState,
    _saveSyncState: saveSyncState,
    _clearSyncStateForSlot: clearSyncStateForSlot
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
