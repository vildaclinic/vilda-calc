/*
 * Vilda Vault v2.0.0 — multi-user
 *
 * Etap 8R-3a: zaszyfrowany lokalny magazyn pacjentów z obsługą wielu
 * niezależnych kont na jednym urządzeniu. Każdy użytkownik dostaje:
 *   - własną bazę IndexedDB (vilda_user_<userId>) z własnym master key,
 *   - własną sól PBKDF2 i własny zaszyfrowany master,
 *   - własny klucz odzyskiwania,
 *   - własną historię pacjentów i snapshotów (etap 3+).
 *
 * Cała tożsamość użytkowników żyje w osobnej małej bazie vilda_registry —
 * trzyma tylko nazwy/labele i daty (bez danych medycznych), żeby ekran
 * logowania mógł pokazać listę kont. Pełna izolacja kryptograficzna:
 * znajomość hasła użytkownika A nie pozwala na odszyfrowanie danych B.
 *
 * API kontraktowe:
 *   listUsers()                    — lista zarejestrowanych użytkowników
 *   createUser(password, options)  — tworzy nowe konto i automatycznie loguje
 *   unlockUser(userId, password)
 *   unlockUserWithRecoveryKey(userId, recoveryKey)
 *   lock(reason)                   — wylogowuje bieżącego użytkownika
 *   removeUser(userId, password)   — kasuje dane użytkownika (per-user DB)
 *   changePassword(oldPw, newPw)   — dla bieżącego użytkownika
 *   resetPasswordWhileUnlocked()   — po unlock przez recovery key
 *   regenerateRecoveryKey()        — dla bieżącego użytkownika
 *   getCurrentUser() / getStatus()
 *   startIdleTimer / stopIdleTimer / resetIdleTimer
 *   onUnlock / onLock              — eventy
 *
 * Storage adapter: w przeglądarce moduł sam tworzy IndexedDB-owy adapter.
 * W testach Node można podstawić własny adapter przez setStorageAdapter().
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaVault && global.VildaVault.__vildaVault) {
    return;
  }

  const VERSION = '2.6.0';
  const STEP = '8R-8a';
  const SCHEMA_VERSION = 2;
  const META_ID = 'singleton';
  const REGISTRY_DB_NAME = 'vilda_registry';
  const REGISTRY_DB_VERSION = 1;
  const USER_DB_PREFIX = 'vilda_user_';
  // v2: dodany store 'tombstones' (znaczniki usunięcia pacjenta do synchronizacji).
  // Migracja w onupgradeneeded jest addytywna — istniejące store'y (meta/patients/
  // snapshots) i ich dane pozostają nietknięte.
  const USER_DB_VERSION = 2;
  const STORE_REGISTRY_USERS = 'users';
  const STORE_META = 'meta';
  const STORE_PATIENTS = 'patients';
  const STORE_SNAPSHOTS = 'snapshots';
  const STORE_TOMBSTONES = 'tombstones';
  // GC znaczników usunięcia: po tym czasie tombstone jest przycinany (drobny, ale nie
  // może rosnąć w nieskończoność). 90 dni to bezpieczne okno — urządzenie offline
  // dłużej niż to przy ponownej synchronizacji to skrajny przypadek.
  const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  const DEFAULT_IDLE_LOCK_MS = 20 * 60 * 1000;
  const MIN_PASSWORD_LENGTH = 8;
  const DEFAULT_LABEL = 'Użytkownik';
  const SESSION_STORAGE_KEY = 'vilda-vault-session-v2';
  const EPHEMERAL_MARKER_KEY = 'vilda-ephemeral-session-v1';
  // Klucz utrwalania efemerycznego adaptera vaultu (pacjenci/snapshoty/meta) w
  // sessionStorage. Prefiks `veph:` → czyszczony przy wylogowaniu razem z resztą
  // danych efemerycznych (VildaPersistence.purgeEphemeralData) i znika z kartą.
  // Dzięki niemu dane pacjentów przeżywają nawigację między podstronami.
  const EPHEMERAL_ADAPTER_KEY = 'veph:vault:adapter-v1';
  // Rate-limit logowania per user (chroni przed brute-force gdy ktoś ma fizyczny
  // dostęp do urządzenia). Po N błędnych próbach kolejne unlocki dla tego usera
  // są blokowane na ttlMs, niezależnie czy hasło/recovery key są poprawne.
  // Dane throttle są persystowane w localStorage, dzięki czemu blokada działa
  // między zakładkami — otwarcie nowej karty nie resetuje licznika prób.
  const LOGIN_THROTTLE_MAX_ATTEMPTS = 5;
  const LOGIN_THROTTLE_WINDOW_MS = 30 * 1000;
  const THROTTLE_STORAGE_KEY = 'vilda-lth-v1'; // cross-tab persistent login throttle

  // ============ ZALEŻNOŚĆ: VildaCrypto ============
  function getCrypto() {
    const C = global.VildaCrypto;
    if (!C || !C.__vildaCrypto) {
      throw new Error('VildaCrypto niedostępny (załaduj vilda_crypto.js przed vilda_vault.js).');
    }
    return C;
  }

  // ============ STAN MODUŁU (w pamięci) ============
  let storageAdapter = null;
  let masterKey = null;             // CryptoKey (AES-GCM) gdy unlocked
  let masterKeyBytes = null;        // Uint8Array gdy unlocked, null gdy locked
  let currentUserId = null;
  let currentUserLabel = null;
  let lockReason = null;
  let idleTimer = null;
  let idleTimeoutMs = DEFAULT_IDLE_LOCK_MS;
  const onLockListeners = [];
  const onUnlockListeners = [];

  // ============ POMOCNICZE ============
  function generateUserId() {
    if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') {
      throw new Error('Brak getRandomValues do generowania userId.');
    }
    const buf = new Uint8Array(16);
    global.crypto.getRandomValues(buf);
    let hex = '';
    for (let i = 0; i < buf.length; i += 1) {
      const h = buf[i].toString(16);
      hex += (h.length === 1 ? '0' : '') + h;
    }
    return hex;
  }

  function zeroBytes(arr) {
    if (!arr) return;
    for (let i = 0; i < arr.length; i += 1) arr[i] = 0;
  }

  // trigger rozróżnia źródło odblokowania:
  //   'restore' — tryRestoreSession (nawigacja między podstronami / auto-przywrócenie
  //               sesji przy starcie) → dane bieżącej sesji są nienaruszone,
  //   'login'   — prawdziwe interaktywne logowanie (hasło, passkey, recovery, QR,
  //               nowe konto, odtworzenie backupu) → nowa sesja, należy zacząć od czysta.
  function notifyUnlock(trigger) {
    const payload = { userId: currentUserId, label: currentUserLabel, trigger: trigger || 'login' };
    onUnlockListeners.forEach(function (fn) {
      try { fn(payload); } catch (_) { /* listener errors swallowed */ }
    });
  }

  function notifyLock(reason) {
    onLockListeners.forEach(function (fn) {
      try { fn(reason); } catch (_) { /* listener errors swallowed */ }
    });
  }

  // ============ RATE LIMIT LOGIN ============
  // Dane throttle żyją w localStorage (nie w pamięci), dzięki czemu blokada
  // po N nieudanych próbach utrzymuje się gdy atakujący otworzy nową kartę
  // lub przeładuje stronę. localStorage jest wspólne między zakładkami tego
  // samego origin. Dane throttle nie są wrażliwe — zawierają tylko timestamps
  // i flagę blockedUntil, bez żadnych danych medycznych.

  function loadThrottleStore() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(THROTTLE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (_) { return {}; }
  }

  function saveThrottleStore(store) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(THROTTLE_STORAGE_KEY, JSON.stringify(store));
      }
    } catch (_) {}
  }

  function checkLoginThrottle(userId) {
    const now = Date.now();
    const store = loadThrottleStore();
    const entry = store[userId];
    if (!entry) return;
    // wyczyść stare wpisy starsze niż okno
    entry.failedAttempts = (entry.failedAttempts || []).filter(function (t) { return now - t < LOGIN_THROTTLE_WINDOW_MS; });
    if (entry.blockedUntil > now) {
      const remainingMs = entry.blockedUntil - now;
      const remainingSec = Math.ceil(remainingMs / 1000);
      const e = new Error('Za dużo błędnych prób logowania. Spróbuj ponownie za ' + remainingSec + ' sekund.');
      e.code = 'LOGIN_THROTTLED';
      e.remainingMs = remainingMs;
      throw e;
    }
    // zapisz wyczyszczone stare wpisy z powrotem
    store[userId] = entry;
    saveThrottleStore(store);
  }

  function recordLoginFailure(userId) {
    const now = Date.now();
    const store = loadThrottleStore();
    if (!store[userId]) store[userId] = { failedAttempts: [], blockedUntil: 0 };
    const entry = store[userId];
    entry.failedAttempts = (entry.failedAttempts || []).filter(function (t) { return now - t < LOGIN_THROTTLE_WINDOW_MS; });
    entry.failedAttempts.push(now);
    if (entry.failedAttempts.length >= LOGIN_THROTTLE_MAX_ATTEMPTS) {
      entry.blockedUntil = now + LOGIN_THROTTLE_WINDOW_MS;
      entry.failedAttempts = []; // reset licznika po nałożeniu blokady
    }
    store[userId] = entry;
    saveThrottleStore(store);
  }

  function recordLoginSuccess(userId) {
    const store = loadThrottleStore();
    if (store[userId]) {
      delete store[userId]; // czyste konto po pomyślnym logowaniu
      saveThrottleStore(store);
    }
  }

  function getLoginThrottleStatus(userId) {
    const now = Date.now();
    const store = loadThrottleStore();
    const entry = store[userId] || null;
    if (!entry) return { failedCount: 0, blockedUntil: 0, remainingMs: 0 };
    const recent = (entry.failedAttempts || []).filter(function (t) { return now - t < LOGIN_THROTTLE_WINDOW_MS; });
    return {
      failedCount: recent.length,
      blockedUntil: entry.blockedUntil || 0,
      remainingMs: Math.max(0, (entry.blockedUntil || 0) - now)
    };
  }

  // ============ ADAPTER — IndexedDB ============
  function createIndexedDbAdapter() {
    function reqToPromise(req) {
      return new Promise(function (resolve, reject) {
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }

    function openRegistry() {
      return new Promise(function (resolve, reject) {
        const req = global.indexedDB.open(REGISTRY_DB_NAME, REGISTRY_DB_VERSION);
        req.onupgradeneeded = function (e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_REGISTRY_USERS)) {
            db.createObjectStore(STORE_REGISTRY_USERS, { keyPath: 'userId' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }

    // Cache otwartych połączeń per-user — zapobiega blokowaniu deleteDatabase()
    const userDbConnections = new Map();

    function openUser(userId) {
      if (userDbConnections.has(userId)) {
        return Promise.resolve(userDbConnections.get(userId));
      }
      const dbName = USER_DB_PREFIX + userId;
      return new Promise(function (resolve, reject) {
        const req = global.indexedDB.open(dbName, USER_DB_VERSION);
        req.onupgradeneeded = function (e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_PATIENTS)) {
            db.createObjectStore(STORE_PATIENTS, { keyPath: 'patientId' });
          }
          if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
            const s = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'snapshotId' });
            s.createIndex('byPatient', 'patientId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_TOMBSTONES)) {
            db.createObjectStore(STORE_TOMBSTONES, { keyPath: 'patientId' });
          }
        };
        req.onsuccess = function () {
          userDbConnections.set(userId, req.result);
          resolve(req.result);
        };
        req.onerror = function () { reject(req.error); };
      });
    }

    return {
      async listRegistry() {
        const db = await openRegistry();
        const store = db.transaction(STORE_REGISTRY_USERS, 'readonly').objectStore(STORE_REGISTRY_USERS);
        return reqToPromise(store.getAll());
      },
      async getRegistryEntry(userId) {
        const db = await openRegistry();
        const store = db.transaction(STORE_REGISTRY_USERS, 'readonly').objectStore(STORE_REGISTRY_USERS);
        return reqToPromise(store.get(userId));
      },
      async putRegistryEntry(record) {
        const db = await openRegistry();
        const store = db.transaction(STORE_REGISTRY_USERS, 'readwrite').objectStore(STORE_REGISTRY_USERS);
        await reqToPromise(store.put(record));
        return record;
      },
      async updateRegistryEntry(userId, partial) {
        const db = await openRegistry();
        const tx = db.transaction(STORE_REGISTRY_USERS, 'readwrite');
        const store = tx.objectStore(STORE_REGISTRY_USERS);
        const existing = await reqToPromise(store.get(userId));
        if (!existing) return null;
        const merged = Object.assign({}, existing, partial);
        await reqToPromise(store.put(merged));
        return merged;
      },
      async removeRegistryEntry(userId) {
        const db = await openRegistry();
        const store = db.transaction(STORE_REGISTRY_USERS, 'readwrite').objectStore(STORE_REGISTRY_USERS);
        await reqToPromise(store.delete(userId));
        return true;
      },
      async getUserMeta(userId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_META, 'readonly').objectStore(STORE_META);
        return reqToPromise(store.get(META_ID));
      },
      async putUserMeta(userId, record) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_META, 'readwrite').objectStore(STORE_META);
        const merged = Object.assign({}, record, { id: META_ID, userId: userId });
        await reqToPromise(store.put(merged));
        return merged;
      },
      async deleteUserDatabase(userId) {
        // Zamknij cached połączenie zanim poprosimy o usunięcie bazy —
        // dzięki temu deleteDatabase() nie dostanie onblocked i od razu usuwa.
        if (userDbConnections.has(userId)) {
          userDbConnections.get(userId).close();
          userDbConnections.delete(userId);
        }
        const dbName = USER_DB_PREFIX + userId;
        return new Promise(function (resolve, reject) {
          const req = global.indexedDB.deleteDatabase(dbName);
          req.onsuccess = function () { resolve(true); };
          req.onerror = function () { reject(req.error); };
          req.onblocked = function () { /* nie powinno wystąpić po close() */ };
        });
      },
      // --- pacjenci i snapshoty per-user ---
      async listPatientsForUser(userId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENTS, 'readonly').objectStore(STORE_PATIENTS);
        return reqToPromise(store.getAll());
      },
      async getPatientForUser(userId, patientId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENTS, 'readonly').objectStore(STORE_PATIENTS);
        return reqToPromise(store.get(patientId));
      },
      async putPatientForUser(userId, record) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENTS, 'readwrite').objectStore(STORE_PATIENTS);
        await reqToPromise(store.put(record));
        return record;
      },
      async removePatientForUser(userId, patientId) {
        const db = await openUser(userId);
        const tx = db.transaction([STORE_PATIENTS, STORE_SNAPSHOTS], 'readwrite');
        await reqToPromise(tx.objectStore(STORE_PATIENTS).delete(patientId));
        // skasuj wszystkie snapshoty po byPatient indexie
        return new Promise(function (resolve, reject) {
          const idx = tx.objectStore(STORE_SNAPSHOTS).index('byPatient');
          const req = idx.openCursor(IDBKeyRange.only(patientId));
          req.onsuccess = function (e) {
            const cursor = e.target.result;
            if (cursor) { cursor.delete(); cursor.continue(); }
            else resolve(true);
          };
          req.onerror = function () { reject(req.error); };
        });
      },
      async listSnapshotsForUser(userId, patientId) {
        const db = await openUser(userId);
        const idx = db.transaction(STORE_SNAPSHOTS, 'readonly').objectStore(STORE_SNAPSHOTS).index('byPatient');
        return reqToPromise(idx.getAll(IDBKeyRange.only(patientId)));
      },
      async putSnapshotForUser(userId, record) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_SNAPSHOTS, 'readwrite').objectStore(STORE_SNAPSHOTS);
        await reqToPromise(store.put(record));
        return record;
      },
      async removeSnapshotForUser(userId, snapshotId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_SNAPSHOTS, 'readwrite').objectStore(STORE_SNAPSHOTS);
        await reqToPromise(store.delete(snapshotId));
        return true;
      },
      // --- tombstones (znaczniki usunięcia pacjenta do synchronizacji) ---
      async listTombstonesForUser(userId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_TOMBSTONES, 'readonly').objectStore(STORE_TOMBSTONES);
        return reqToPromise(store.getAll());
      },
      async putTombstoneForUser(userId, record) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_TOMBSTONES, 'readwrite').objectStore(STORE_TOMBSTONES);
        const rec = { patientId: record.patientId, deletedAtISO: record.deletedAtISO };
        await reqToPromise(store.put(rec));
        return rec;
      },
      async removeTombstoneForUser(userId, patientId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_TOMBSTONES, 'readwrite').objectStore(STORE_TOMBSTONES);
        await reqToPromise(store.delete(patientId));
        return true;
      }
    };
  }

  // ============ ADAPTER — fallback / testy ============
  // options.persistKey (opcjonalne): klucz w sessionStorage, pod którym adapter
  // utrwala swój stan. Używane w trybie efemerycznym (klucz z prefiksem `veph:`),
  // żeby dane pacjentów PRZEŻYŁY nawigację między podstronami (każda podstrona to
  // pełne przeładowanie — bez tego Mapy startują puste). Stan to szyfrogramy
  // (payloady pacjentów są już zaszyfrowane master keyem), a klucz `veph:` jest
  // czyszczony przy wylogowaniu (VildaPersistence.purgeEphemeralData) i znika z
  // zamknięciem karty. Bez persistKey adapter jest czysto pamięciowy (testy, fallback).
  function createInMemoryAdapter(options) {
    const persistKey = (options && typeof options.persistKey === 'string') ? options.persistKey : null;
    const registry = new Map();
    const userDbs = new Map();

    function ensureUserDb(userId) {
      if (!userDbs.has(userId)) {
        userDbs.set(userId, { meta: null, patients: new Map(), snapshots: new Map(), tombstones: new Map() });
      }
      const db = userDbs.get(userId);
      if (!db.tombstones) db.tombstones = new Map(); // dla wpisów zhydratowanych ze starego stanu
      return db;
    }

    function persistNow() {
      if (!persistKey) return;
      try {
        if (typeof global.sessionStorage === 'undefined' || !global.sessionStorage) return;
        const state = {
          registry: Array.from(registry.entries()),
          userDbs: Array.from(userDbs.entries()).map(function (kv) {
            const db = kv[1];
            return [kv[0], {
              meta: db.meta || null,
              patients: Array.from(db.patients.entries()),
              snapshots: Array.from(db.snapshots.entries()),
              tombstones: Array.from((db.tombstones || new Map()).entries())
            }];
          })
        };
        global.sessionStorage.setItem(persistKey, JSON.stringify(state));
      } catch (_) { void _; }
    }

    // Hydratacja z poprzedniej podstrony tej samej sesji efemerycznej.
    if (persistKey) {
      try {
        if (typeof global.sessionStorage !== 'undefined' && global.sessionStorage) {
          const raw = global.sessionStorage.getItem(persistKey);
          if (raw) {
            const state = JSON.parse(raw);
            (state.registry || []).forEach(function (kv) { registry.set(kv[0], kv[1]); });
            (state.userDbs || []).forEach(function (kv) {
              const d = kv[1] || {};
              userDbs.set(kv[0], {
                meta: d.meta || null,
                patients: new Map(d.patients || []),
                snapshots: new Map(d.snapshots || []),
                tombstones: new Map(d.tombstones || [])
              });
            });
          }
        }
      } catch (_) { void _; }
    }

    return {
      async listRegistry() {
        return Array.from(registry.values()).map(function (r) { return Object.assign({}, r); });
      },
      async getRegistryEntry(userId) {
        return registry.has(userId) ? Object.assign({}, registry.get(userId)) : undefined;
      },
      async putRegistryEntry(record) {
        registry.set(record.userId, Object.assign({}, record));
        persistNow();
        return record;
      },
      async updateRegistryEntry(userId, partial) {
        if (!registry.has(userId)) return null;
        const merged = Object.assign({}, registry.get(userId), partial);
        registry.set(userId, merged);
        persistNow();
        return merged;
      },
      async removeRegistryEntry(userId) {
        registry.delete(userId);
        persistNow();
        return true;
      },
      async getUserMeta(userId) {
        if (!userDbs.has(userId)) return null;
        return userDbs.get(userId).meta;
      },
      async putUserMeta(userId, record) {
        const db = ensureUserDb(userId);
        db.meta = Object.assign({}, record, { id: META_ID, userId: userId });
        persistNow();
        return db.meta;
      },
      async deleteUserDatabase(userId) {
        userDbs.delete(userId);
        persistNow();
        return true;
      },
      // --- pacjenci i snapshoty per-user ---
      async listPatientsForUser(userId) {
        if (!userDbs.has(userId)) return [];
        return Array.from(userDbs.get(userId).patients.values()).map(function (r) { return Object.assign({}, r); });
      },
      async getPatientForUser(userId, patientId) {
        if (!userDbs.has(userId)) return undefined;
        const p = userDbs.get(userId).patients.get(patientId);
        return p ? Object.assign({}, p) : undefined;
      },
      async putPatientForUser(userId, record) {
        const db = ensureUserDb(userId);
        db.patients.set(record.patientId, Object.assign({}, record));
        persistNow();
        return record;
      },
      async removePatientForUser(userId, patientId) {
        if (!userDbs.has(userId)) return true;
        const db = userDbs.get(userId);
        db.patients.delete(patientId);
        // skasuj wszystkie snapshoty pacjenta
        Array.from(db.snapshots.entries()).forEach(function (kv) {
          if (kv[1].patientId === patientId) db.snapshots.delete(kv[0]);
        });
        persistNow();
        return true;
      },
      async listSnapshotsForUser(userId, patientId) {
        if (!userDbs.has(userId)) return [];
        return Array.from(userDbs.get(userId).snapshots.values())
          .filter(function (s) { return s.patientId === patientId; })
          .map(function (s) { return Object.assign({}, s); });
      },
      async putSnapshotForUser(userId, record) {
        const db = ensureUserDb(userId);
        db.snapshots.set(record.snapshotId, Object.assign({}, record));
        persistNow();
        return record;
      },
      async removeSnapshotForUser(userId, snapshotId) {
        if (!userDbs.has(userId)) return true;
        userDbs.get(userId).snapshots.delete(snapshotId);
        persistNow();
        return true;
      },
      // --- tombstones (znaczniki usunięcia pacjenta do synchronizacji) ---
      async listTombstonesForUser(userId) {
        if (!userDbs.has(userId)) return [];
        const tomb = userDbs.get(userId).tombstones;
        if (!tomb) return [];
        return Array.from(tomb.values()).map(function (r) { return Object.assign({}, r); });
      },
      async putTombstoneForUser(userId, record) {
        const db = ensureUserDb(userId);
        const rec = { patientId: record.patientId, deletedAtISO: record.deletedAtISO };
        db.tombstones.set(rec.patientId, rec);
        persistNow();
        return rec;
      },
      async removeTombstoneForUser(userId, patientId) {
        if (!userDbs.has(userId)) return true;
        const tomb = userDbs.get(userId).tombstones;
        if (tomb) tomb.delete(patientId);
        persistNow();
        return true;
      },
      _peek: function () {
        return {
          registry: Array.from(registry.values()).map(function (r) { return Object.assign({}, r); }),
          userDbs: Array.from(userDbs.entries()).map(function (kv) { return [kv[0], { meta: kv[1].meta, patientCount: kv[1].patients.size, snapshotCount: kv[1].snapshots.size }]; })
        };
      }
    };
  }

  function getAdapter() {
    if (storageAdapter) return storageAdapter;
    if (global.indexedDB && typeof global.indexedDB.open === 'function') {
      storageAdapter = createIndexedDbAdapter();
    } else {
      storageAdapter = createInMemoryAdapter();
    }
    return storageAdapter;
  }

  function setStorageAdapter(adapter) {
    storageAdapter = adapter || null;
  }

  // ── Tryb efemeryczny (współdzielony komputer) ─────────────────────────────
  // Przełącza vault na adapter PAMIĘCIOWY (meta użytkownika + migawki pacjentów
  // NIE trafiają do IndexedDB) i koordynuje warstwę aplikacji (VildaPersistence),
  // która kieruje sharedUserData/sesje/preferencje do shimu pamięciowego.
  // Skutek: po zakończeniu sesji na współdzielonym komputerze nie zostaje nic
  // trwałego. Klucz sesji w sessionStorage (ciągłość między podstronami) jest
  // świadomym wyjątkiem — z krótkim TTL i czyszczeniem na pagehide (dalsze kroki).
  // UWAGA: wywołać PRZED jakąkolwiek operacją vaultu w danej sesji.
  let _ephemeralMode = false;
  function setEphemeralMode(on) {
    _ephemeralMode = !!on;
    if (_ephemeralMode) {
      // Adapter utrwalany do sessionStorage (veph:) — pacjenci przeżywają nawigację.
      setStorageAdapter(createInMemoryAdapter({ persistKey: EPHEMERAL_ADAPTER_KEY }));
      // Marker w REALNYM sessionStorage (nie przez VildaPersistence) — przeżywa
      // nawigację między podstronami, dzięki czemu tryRestoreSession na świeżej
      // podstronie wie, że ma wejść w tryb efemeryczny PRZED odtworzeniem (bez zapisu
      // na dysk). Ginie po zamknięciu karty (sessionStorage), więc po sesji nic nie zostaje.
      try { if (global.sessionStorage) global.sessionStorage.setItem(EPHEMERAL_MARKER_KEY, '1'); } catch (_) {}
    } else {
      // Wyjście z trybu efemerycznego: zresetuj adapter, by getAdapter() ponownie
      // utworzył IndexedDB (inaczej kolejne normalne logowanie pisałoby do RAM).
      setStorageAdapter(null);
      try { if (global.sessionStorage) global.sessionStorage.removeItem(EPHEMERAL_MARKER_KEY); } catch (_) {}
    }
    try {
      if (global.VildaPersistence && typeof global.VildaPersistence.setEphemeralMode === 'function') {
        global.VildaPersistence.setEphemeralMode(_ephemeralMode);
      }
    } catch (_) {}
    return _ephemeralMode;
  }
  function isEphemeralMode() { return _ephemeralMode; }

  // ============ PERSYSTENCJA SESJI (sessionStorage) ============
  // Po zalogowaniu kopia master key bytes ląduje w sessionStorage konkretnej karty
  // przeglądarki. Dzięki temu nawigacja między podstronami (index → docpro →
  // klirens) NIE wymaga ponownego logowania. sessionStorage żyje tylko w obrębie
  // jednej karty i znika po jej zamknięciu — sesja jest izolowana między
  // kartami i automatycznie krótkotrwała.
  //
  // Model zagrożeń: sessionStorage dostępne jest wyłącznie dla JS działającego
  // w tej samej karcie i na tym samym origin (same-origin policy). keyB64 to
  // bajty klucza głównego w base64 — wystarczają do odszyfrowania danych z
  // IndexedDB, więc ochrona sessionStorage jest ważna. Kluczowe zabezpieczenia:
  //   1. expiresAtISO — sesja wygasa po czasie idle-lock (domyślnie 20 min);
  //      token jest odświeżany przy każdej udanej nawigacji między stronami.
  //   2. clearPersistedSession() wywoływane przez lock() (ręczny, idle, removal).
  //   3. Izolacja między kartami — sessionStorage nie jest współdzielone.
  // Uwaga: wrapping key nie może być przechowywany wyłącznie w pamięci JS bo
  // każda nawigacja tworzy nowy kontekst JS — persystencja sesji wymaga
  // obecności keyB64 w sessionStorage.
  function persistSession() {
    try {
      if (!global.sessionStorage || !masterKeyBytes || !currentUserId) return;
      const C = getCrypto();
      const blob = {
        v: 2,
        userId: currentUserId,
        label: currentUserLabel,
        keyB64: C.bytesToBase64(masterKeyBytes),
        savedAtISO: new Date().toISOString(),
        expiresAtISO: new Date(Date.now() + idleTimeoutMs).toISOString()
      };
      global.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(blob));
    } catch (_) { /* sessionStorage może być niedostępne (privacy mode) — ignorujemy */ }
  }

  function clearPersistedSession() {
    try {
      if (global.sessionStorage) global.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {}
  }

  async function tryRestoreSession() {
    try {
      if (!global.sessionStorage || isUnlocked()) return false;
      const raw = global.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return false;
      const blob = JSON.parse(raw);
      if (!blob || blob.v !== 2 || typeof blob.userId !== 'string' || typeof blob.keyB64 !== 'string') {
        clearPersistedSession();
        return false;
      }
      // Odrzuć sesję, której TTL upłynął (ustawiany przy zapisie na savedAt + idleTimeout).
      // Chroni to przed odtworzeniem sesji ze starego snapshotu sessionStorage
      // (np. gdy przeglądarka przywraca karty po restarcie).
      if (blob.expiresAtISO && new Date(blob.expiresAtISO).getTime() < Date.now()) {
        clearPersistedSession();
        return false;
      }
      // ── Sesja EFEMERYCZNA (współdzielony komputer) ─────────────────────────────
      // Marker w sessionStorage oznacza, że ta sesja jest efemeryczna. MUSIMY wejść
      // w tryb efemeryczny ZANIM dotkniemy adaptera (in-memory + uszczelnienie warstwy
      // aplikacji), inaczej odtworzenie pisałoby na dysk. W tym trybie NIE ma lokalnej
      // meta użytkownika (nigdy jej nie persystujemy) — pomijamy więc wymóg meta.
      let ephemeral = false;
      try { ephemeral = !!(global.sessionStorage && global.sessionStorage.getItem(EPHEMERAL_MARKER_KEY)); } catch (_) {}
      if (ephemeral) setEphemeralMode(true);

      // sprawdź, czy user nadal istnieje (mógł zostać usunięty w innej karcie)
      const meta = await getAdapter().getUserMeta(blob.userId);
      if (!meta && !ephemeral) {
        clearPersistedSession();
        return false;
      }
      const C = getCrypto();
      const masterBytes = C.base64ToBytes(blob.keyB64);
      masterKey = await C.importMasterKeyFromBytes(masterBytes);
      masterKeyBytes = new Uint8Array(masterBytes);
      currentUserId = blob.userId;
      currentUserLabel = blob.label || (await getAdapter().getRegistryEntry(blob.userId) || {}).label || DEFAULT_LABEL;
      lockReason = null;
      // Odśwież TTL sesji — każda nawigacja przesuwa expiresAtISO do przodu,
      // więc aktywny użytkownik nie zostanie wylogowany podczas pracy.
      persistSession();
      notifyUnlock('restore');
      return true;
    } catch (_) {
      clearPersistedSession();
      return false;
    }
  }

  // ============ STATUS / LISTA UŻYTKOWNIKÓW ============
  async function listUsers() {
    const list = await getAdapter().listRegistry();
    list.sort(function (a, b) {
      const aTime = a.lastLoginAtISO || a.createdAtISO || '';
      const bTime = b.lastLoginAtISO || b.createdAtISO || '';
      if (bTime > aTime) return 1;
      if (bTime < aTime) return -1;
      return 0;
    });
    return list;
  }

  function isUnlocked() {
    return masterKey !== null;
  }

  function getCurrentUser() {
    if (!isUnlocked()) return null;
    return { userId: currentUserId, label: currentUserLabel };
  }

  async function getStatus() {
    const users = await listUsers();
    let state = 'no-users';
    if (users.length > 0) state = isUnlocked() ? 'unlocked' : 'locked';
    return {
      state: state,
      userCount: users.length,
      currentUser: isUnlocked() ? { userId: currentUserId, label: currentUserLabel } : null,
      lockReason: lockReason,
      idleTimeoutMs: idleTimeoutMs
    };
  }

  // ============ TWORZENIE UŻYTKOWNIKA ============
  async function createUser(password, options) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error('Hasło musi mieć co najmniej ' + MIN_PASSWORD_LENGTH + ' znaków.');
    }
    const C = getCrypto();
    const opts = (options && typeof options === 'object') ? options : {};
    const iter = (typeof opts.iterations === 'number' && opts.iterations > 0) ? opts.iterations : C.KDF_ITERATIONS;
    let label = (typeof opts.label === 'string' && opts.label.trim().length) ? opts.label.trim() : '';
    if (!label) {
      const existing = await listUsers();
      label = DEFAULT_LABEL + ' ' + (existing.length + 1);
    }

    const userId = generateUserId();
    const passwordSalt = C.generateSalt();
    const recoverySalt = C.generateSalt();
    const recoveryKey = (typeof opts.recoveryKey === 'string' && C.isValidRecoveryKeyShape(opts.recoveryKey))
      ? C.normalizeRecoveryKey(opts.recoveryKey)
      : C.generateRecoveryKey();
    const masterBytes = C.generateMasterKeyBytes();

    const passwordWrappingKey = await C.deriveKey(password, passwordSalt, iter);
    const recoveryWrappingKey = await C.deriveKeyFromRecoveryKey(recoveryKey, recoverySalt, iter);
    const encryptedByPassword = await C.encryptBytes(passwordWrappingKey, masterBytes);
    const encryptedByRecovery = await C.encryptBytes(recoveryWrappingKey, masterBytes);

    const nowISO = new Date().toISOString();
    const meta = {
      schemaVersion: SCHEMA_VERSION,
      createdAtISO: nowISO,
      kdfName: C.KDF_NAME,
      kdfHash: C.KDF_HASH,
      kdfIterations: iter,
      passwordSalt: C.bytesToBase64(passwordSalt),
      recoverySalt: C.bytesToBase64(recoverySalt),
      encryptedMasterByPassword: {
        iv: C.bytesToBase64(encryptedByPassword.iv),
        data: C.bytesToBase64(encryptedByPassword.data)
      },
      encryptedMasterByRecovery: {
        iv: C.bytesToBase64(encryptedByRecovery.iv),
        data: C.bytesToBase64(encryptedByRecovery.data)
      }
    };

    await getAdapter().putUserMeta(userId, meta);
    await getAdapter().putRegistryEntry({
      userId: userId,
      label: label,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO
    });

    masterKey = await C.importMasterKeyFromBytes(masterBytes);
    masterKeyBytes = new Uint8Array(masterBytes);
    currentUserId = userId;
    currentUserLabel = label;
    lockReason = null;
    zeroBytes(masterBytes);
    persistSession();
    notifyUnlock();

    return {
      userId: userId,
      label: label,
      recoveryKey: recoveryKey,
      iterations: iter
    };
  }

  // ============ UNLOCK ============
  async function adoptMasterBytes(rawBytes, userId, label) {
    const C = getCrypto();
    masterKey = await C.importMasterKeyFromBytes(rawBytes);
    masterKeyBytes = new Uint8Array(rawBytes);
    currentUserId = userId;
    currentUserLabel = label;
    lockReason = null;
    zeroBytes(rawBytes);
    persistSession();
    notifyUnlock();
  }

  async function unlockUser(userId, password) {
    const C = getCrypto();
    if (typeof userId !== 'string' || !userId.length) {
      throw new Error('Nieprawidłowy userId.');
    }
    checkLoginThrottle(userId);
    const meta = await getAdapter().getUserMeta(userId);
    if (!meta) {
      throw new Error('Użytkownik nie istnieje.');
    }
    const wrappingKey = await C.deriveKey(password, meta.passwordSalt, meta.kdfIterations);
    let masterBytes;
    try {
      masterBytes = await C.decryptBytes(
        wrappingKey,
        meta.encryptedMasterByPassword.iv,
        meta.encryptedMasterByPassword.data
      );
    } catch (_) {
      recordLoginFailure(userId);
      throw new Error('Nieprawidłowe hasło. Sprawdź, czy Caps Lock nie jest włączony.');
    }
    const entry = await getAdapter().getRegistryEntry(userId);
    const label = (entry && entry.label) || DEFAULT_LABEL;
    await adoptMasterBytes(masterBytes, userId, label);
    await getAdapter().updateRegistryEntry(userId, { lastLoginAtISO: new Date().toISOString() });
    recordLoginSuccess(userId);
    return { userId: userId, label: label };
  }

  async function unlockUserWithRecoveryKey(userId, recoveryKey) {
    const C = getCrypto();
    if (typeof userId !== 'string' || !userId.length) {
      throw new Error('Nieprawidłowy userId.');
    }
    if (!C.isValidRecoveryKeyShape(recoveryKey)) {
      throw new Error('Klucz odzyskiwania ma nieprawidłowy format. Powinien wyglądać jak: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX.');
    }
    checkLoginThrottle(userId);
    const meta = await getAdapter().getUserMeta(userId);
    if (!meta) {
      throw new Error('Użytkownik nie istnieje.');
    }
    const wrappingKey = await C.deriveKeyFromRecoveryKey(recoveryKey, meta.recoverySalt, meta.kdfIterations);
    let masterBytes;
    try {
      masterBytes = await C.decryptBytes(
        wrappingKey,
        meta.encryptedMasterByRecovery.iv,
        meta.encryptedMasterByRecovery.data
      );
    } catch (_) {
      recordLoginFailure(userId);
      throw new Error('Ten klucz odzyskiwania nie pasuje do wybranego konta.');
    }
    const entry = await getAdapter().getRegistryEntry(userId);
    const label = (entry && entry.label) || DEFAULT_LABEL;
    await adoptMasterBytes(masterBytes, userId, label);
    await getAdapter().updateRegistryEntry(userId, { lastLoginAtISO: new Date().toISOString() });
    recordLoginSuccess(userId);
    return { userId: userId, label: label };
  }

  // ============ LOCK ============
  function lock(reason) {
    zeroBytes(masterKeyBytes);
    masterKeyBytes = null;
    masterKey = null;
    currentUserId = null;
    currentUserLabel = null;
    lockReason = reason || 'manual';
    stopIdleTimer();
    clearPersistedSession();
    // Wyjście z trybu efemerycznego — usuwa marker, resetuje adapter do IndexedDB,
    // odznacza warstwę aplikacji. Po zablokowaniu nie zostaje nic z sesji efemerycznej.
    try { if (_ephemeralMode) setEphemeralMode(false); } catch (_) {}
    notifyLock(lockReason);
  }

  // ============ ZMIANA HASŁA / RESET / REGEN RECOVERY ============
  async function changePassword(oldPassword, newPassword) {
    if (!isUnlocked()) {
      throw new Error('Zaloguj się, aby zmienić hasło.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error('Nowe hasło musi mieć co najmniej ' + MIN_PASSWORD_LENGTH + ' znaków.');
    }
    const C = getCrypto();
    const meta = await getAdapter().getUserMeta(currentUserId);
    const oldKey = await C.deriveKey(oldPassword, meta.passwordSalt, meta.kdfIterations);
    let recovered;
    try {
      recovered = await C.decryptBytes(
        oldKey,
        meta.encryptedMasterByPassword.iv,
        meta.encryptedMasterByPassword.data
      );
    } catch (_) {
      throw new Error('Podane stare hasło jest nieprawidłowe.');
    }
    const newSalt = C.generateSalt();
    const newWrappingKey = await C.deriveKey(newPassword, newSalt, meta.kdfIterations);
    const newEnc = await C.encryptBytes(newWrappingKey, recovered);
    const updated = Object.assign({}, meta, {
      passwordSalt: C.bytesToBase64(newSalt),
      encryptedMasterByPassword: {
        iv: C.bytesToBase64(newEnc.iv),
        data: C.bytesToBase64(newEnc.data)
      }
    });
    await getAdapter().putUserMeta(currentUserId, updated);
    zeroBytes(recovered);
    return true;
  }

  async function resetPasswordWhileUnlocked(newPassword) {
    if (!isUnlocked() || !masterKeyBytes) {
      throw new Error('Zaloguj się przez klucz odzyskiwania przed resetem hasła.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error('Nowe hasło musi mieć co najmniej ' + MIN_PASSWORD_LENGTH + ' znaków.');
    }
    const C = getCrypto();
    const meta = await getAdapter().getUserMeta(currentUserId);
    const newSalt = C.generateSalt();
    const newWrappingKey = await C.deriveKey(newPassword, newSalt, meta.kdfIterations);
    const newEnc = await C.encryptBytes(newWrappingKey, masterKeyBytes);
    const updated = Object.assign({}, meta, {
      passwordSalt: C.bytesToBase64(newSalt),
      encryptedMasterByPassword: {
        iv: C.bytesToBase64(newEnc.iv),
        data: C.bytesToBase64(newEnc.data)
      }
    });
    await getAdapter().putUserMeta(currentUserId, updated);
    return true;
  }

  async function regenerateRecoveryKey() {
    if (!isUnlocked() || !masterKeyBytes) {
      throw new Error('Zaloguj się przed regeneracją klucza odzyskiwania.');
    }
    const C = getCrypto();
    const meta = await getAdapter().getUserMeta(currentUserId);
    const newRecoveryKey = C.generateRecoveryKey();
    const newRecoverySalt = C.generateSalt();
    const newWrappingKey = await C.deriveKeyFromRecoveryKey(newRecoveryKey, newRecoverySalt, meta.kdfIterations);
    const newEnc = await C.encryptBytes(newWrappingKey, masterKeyBytes);
    const updated = Object.assign({}, meta, {
      recoverySalt: C.bytesToBase64(newRecoverySalt),
      encryptedMasterByRecovery: {
        iv: C.bytesToBase64(newEnc.iv),
        data: C.bytesToBase64(newEnc.data)
      }
    });
    await getAdapter().putUserMeta(currentUserId, updated);
    return { recoveryKey: newRecoveryKey };
  }

  // ============ USUWANIE UŻYTKOWNIKA ============
  async function removeUser(userId, password) {
    if (typeof userId !== 'string' || !userId.length) {
      throw new Error('Nieprawidłowy userId.');
    }
    const C = getCrypto();
    const meta = await getAdapter().getUserMeta(userId);
    if (!meta) {
      // brak meta — sprawdźmy rejestr
      const entry = await getAdapter().getRegistryEntry(userId);
      if (entry) await getAdapter().removeRegistryEntry(userId);
      return true;
    }
    // wymagamy hasła do potwierdzenia kasacji (chyba że to bieżący zalogowany user)
    const isCurrentAndUnlocked = (currentUserId === userId && isUnlocked());
    if (!isCurrentAndUnlocked) {
      const wrappingKey = await C.deriveKey(password, meta.passwordSalt, meta.kdfIterations);
      try {
        await C.decryptBytes(
          wrappingKey,
          meta.encryptedMasterByPassword.iv,
          meta.encryptedMasterByPassword.data
        );
      } catch (_) {
        throw new Error('Nieprawidłowe hasło. Konto nie zostało usunięte.');
      }
    }

    // Najpierw usuń dane z IndexedDB, a dopiero potem wywołaj lock().
    // Gdybyśmy wywołali lock() wcześniej, listener onLock odpaliłby showStartupScreen()
    // → listUsers() jeszcze PRZED fizycznym usunięciem wpisu z rejestru — użytkownik
    // zobaczyłby usunięte konto na ekranie „Kto się loguje?".
    await getAdapter().deleteUserDatabase(userId);
    await getAdapter().removeRegistryEntry(userId);
    if (currentUserId === userId) {
      lock('user-removed');
    }
    return true;
  }

  // ============ CRUD PACJENTÓW (wymagają zalogowanego użytkownika) ============
  function generateUuid() {
    if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') {
      throw new Error('Brak getRandomValues do generowania uuid.');
    }
    const buf = new Uint8Array(16);
    global.crypto.getRandomValues(buf);
    // RFC4122-ish: ustaw wersję 4 + variant 10
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    let hex = '';
    for (let i = 0; i < buf.length; i += 1) {
      const h = buf[i].toString(16);
      hex += (h.length === 1 ? '0' : '') + h;
    }
    return hex.substring(0, 8) + '-' + hex.substring(8, 12) + '-' + hex.substring(12, 16) + '-' + hex.substring(16, 20) + '-' + hex.substring(20, 32);
  }

  async function encryptPayloadForCurrentUser(value) {
    const C = getCrypto();
    if (!isUnlocked()) throw new Error('Zaloguj się przed zapisem pacjenta.');
    const json = JSON.stringify(value);
    const enc = await C.encryptString(masterKey, json);
    return { iv: enc.iv, data: enc.data };
  }

  async function decryptPayloadForCurrentUser(iv, data) {
    const C = getCrypto();
    if (!isUnlocked()) throw new Error('Zaloguj się przed odczytem pacjenta.');
    const text = await C.decryptString(masterKey, iv, data);
    return JSON.parse(text);
  }

  function extractHeaderFromPayload(payload) {
    // Wyciągamy minimalny nagłówek z surowego payloadu collectUserData()
    const name = (payload && typeof payload.name === 'string' && payload.name.trim()) ? payload.name.trim() : null;
    const age = payload && payload.user && payload.user.age != null ? payload.user.age : null;
    const ageMonths = payload && payload.user && payload.user.ageMonths != null ? payload.user.ageMonths : null;
    const sex = payload && payload.user && payload.user.sex ? payload.user.sex : null;
    const timestampISO = payload && payload.timestampISO ? payload.timestampISO : new Date().toISOString();
    return { name: name, age: age, ageMonths: ageMonths, sex: sex, timestampISO: timestampISO };
  }

  function pickPatientIdFromPayload(payload) {
    // Wspieramy istniejące pliki: jeśli payload przyniósł patientId (z importu), używamy.
    if (payload && typeof payload.patientId === 'string' && payload.patientId.length) {
      return payload.patientId;
    }
    return null;
  }

  function findPatientByHeader(patientsList, header) {
    // Heurystyka deduplikacji „ten sam pacjent”: identyczne imię i identyczna data
    // urodzenia/wiek. W razie niejednoznaczności tworzymy nowego — UI doda
    // konfirmację „to ten sam pacjent?” w późniejszym etapie.
    if (!header.name) return null;
    const candidates = patientsList.filter(function (p) {
      return p && p.headerPlain && (p.headerPlain.name || '').toLowerCase() === header.name.toLowerCase();
    });
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    // Doprecyzowanie po wieku
    const exact = candidates.find(function (p) {
      return p.headerPlain.age === header.age && p.headerPlain.ageMonths === header.ageMonths && p.headerPlain.sex === header.sex;
    });
    return exact || candidates[0];
  }

  async function listPatients() {
    if (!isUnlocked()) throw new Error('Zaloguj się, by wyświetlić pacjentów.');
    const records = await getAdapter().listPatientsForUser(currentUserId);
    // każdy rekord ma headerCipher (iv, data); deszyfrujemy nagłówki, żeby UI mogło
    // pokazać imię + datę bez ładowania pełnych snapshotów.
    const out = [];
    for (let i = 0; i < records.length; i += 1) {
      const rec = records[i];
      let header = null;
      try {
        header = await decryptPayloadForCurrentUser(rec.headerCipher.iv, rec.headerCipher.data);
      } catch (_) {
        header = { name: '(błąd odczytu)', timestampISO: rec.lastSavedAtISO || '' };
      }
      out.push({
        patientId: rec.patientId,
        header: header,
        snapshotCount: rec.snapshotCount || 0,
        createdAtISO: rec.createdAtISO,
        lastSavedAtISO: rec.lastSavedAtISO
      });
    }
    out.sort(function (a, b) {
      const aT = a.lastSavedAtISO || a.createdAtISO || '';
      const bT = b.lastSavedAtISO || b.createdAtISO || '';
      if (bT > aT) return 1;
      if (bT < aT) return -1;
      return 0;
    });
    return out;
  }

  async function savePatient(payload, options) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by zapisać pacjenta.');
    if (!payload || typeof payload !== 'object') throw new Error('savePatient: brak payloadu.');
    const opts = (options && typeof options === 'object') ? options : {};
    const header = extractHeaderFromPayload(payload);
    if (!header.name) throw new Error('savePatient: brak imienia pacjenta w payloadzie.');

    // wybór patientId: explicit z opcji > z payloadu > dedup po nagłówku > nowy uuid
    const allPatientsRaw = await getAdapter().listPatientsForUser(currentUserId);
    // uzupełniamy headerPlain do dedupu (deszyfrujemy nagłówki kandydatów)
    const allPatients = [];
    for (let i = 0; i < allPatientsRaw.length; i += 1) {
      const r = allPatientsRaw[i];
      let plain = null;
      try { plain = await decryptPayloadForCurrentUser(r.headerCipher.iv, r.headerCipher.data); }
      catch (_) { plain = null; }
      allPatients.push(Object.assign({}, r, { headerPlain: plain }));
    }

    let patientId = (typeof opts.patientId === 'string' && opts.patientId) ? opts.patientId : pickPatientIdFromPayload(payload);
    let isNew = false;
    if (!patientId) {
      const dedup = findPatientByHeader(allPatients, header);
      if (dedup && opts.dedup !== false) patientId = dedup.patientId;
    }
    if (!patientId) {
      patientId = generateUuid();
      isNew = true;
    } else if (!allPatients.some(function (p) { return p.patientId === patientId; })) {
      isNew = true;
    }

    const nowISO = new Date().toISOString();
    const headerCipher = await encryptPayloadForCurrentUser(header);
    const payloadCipher = await encryptPayloadForCurrentUser(payload);
    const snapshotId = generateUuid();

    const snapshotRec = {
      snapshotId: snapshotId,
      patientId: patientId,
      savedAtISO: nowISO,
      payloadCipher: payloadCipher
    };
    await getAdapter().putSnapshotForUser(currentUserId, snapshotRec);

    const existing = isNew ? null : await getAdapter().getPatientForUser(currentUserId, patientId);
    const snapshotCount = (existing && existing.snapshotCount ? existing.snapshotCount : 0) + 1;
    const patientRec = {
      patientId: patientId,
      headerCipher: headerCipher,
      createdAtISO: existing && existing.createdAtISO ? existing.createdAtISO : nowISO,
      lastSavedAtISO: nowISO,
      snapshotCount: snapshotCount
    };
    await getAdapter().putPatientForUser(currentUserId, patientRec);

    // Zapis = pacjent jest ŻYWY → zdejmij ewentualny tombstone (resurrect przez edycję).
    // lastSavedAtISO (= teraz) jest nowsze niż deletedAtISO, więc znacznik przedawniony.
    // Feature-detect: starsze adaptery testowe mogą nie mieć metody.
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.removeTombstoneForUser === 'function') {
        await _adp.removeTombstoneForUser(currentUserId, patientId);
      }
    } catch (_) { /* nie blokuj zapisu pacjenta */ }

    const result = {
      patientId: patientId,
      snapshotId: snapshotId,
      isNew: isNew,
      snapshotCount: snapshotCount,
      header: header,
      savedAtISO: nowISO,
      shortHash: shortHashOfPatientId(patientId)
    };
    notifyPatientSaved(result);
    return result;
  }

  async function getPatient(patientId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by pobrać pacjenta.');
    const rec = await getAdapter().getPatientForUser(currentUserId, patientId);
    if (!rec) return null;
    const header = await decryptPayloadForCurrentUser(rec.headerCipher.iv, rec.headerCipher.data);
    const snapshotsRaw = await getAdapter().listSnapshotsForUser(currentUserId, patientId);
    const snapshots = [];
    for (let i = 0; i < snapshotsRaw.length; i += 1) {
      const s = snapshotsRaw[i];
      let payload = null;
      try { payload = await decryptPayloadForCurrentUser(s.payloadCipher.iv, s.payloadCipher.data); }
      catch (_) { payload = null; }
      snapshots.push({ snapshotId: s.snapshotId, savedAtISO: s.savedAtISO, payload: payload });
    }
    snapshots.sort(function (a, b) {
      if (a.savedAtISO > b.savedAtISO) return -1;
      if (a.savedAtISO < b.savedAtISO) return 1;
      return 0;
    });
    return {
      patientId: rec.patientId,
      header: header,
      snapshots: snapshots,
      createdAtISO: rec.createdAtISO,
      lastSavedAtISO: rec.lastSavedAtISO,
      snapshotCount: rec.snapshotCount || snapshots.length
    };
  }

  async function getLatestSnapshot(patientId) {
    const patient = await getPatient(patientId);
    if (!patient || !patient.snapshots.length) return null;
    return patient.snapshots[0]; // już posortowane malejąco po dacie
  }

  async function removePatient(patientId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by usunąć pacjenta.');
    await getAdapter().removePatientForUser(currentUserId, patientId);
    // Zapisz tombstone, by usunięcie rozeszło się na inne urządzenia (synchronizacja).
    // Dane pacjenta są już skasowane lokalnie; znacznik niesie samą informację „usunięty".
    // Feature-detect: starsze adaptery testowe mogą nie mieć metody.
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.putTombstoneForUser === 'function') {
        await _adp.putTombstoneForUser(currentUserId, { patientId: patientId, deletedAtISO: new Date().toISOString() });
      }
    } catch (_) { /* nie blokuj usunięcia */ }

    // Powiadom subskrybentów (VildaSyncIntegration) — w trybie NORMALNYM wypchną tombstone.
    notifyPatientDeleted({ patientId: patientId });

    // Tryb EFEMERYCZNY: automatyczny push integracji jest wyłączony (sync nie jest
    // „enabled" na współdzielonym komputerze), więc usunięcie wypychamy tu jednorazowo,
    // żeby tombstone dotarł do innych urządzeń. Best-effort, w tle, nie blokuje UI.
    try {
      if (_ephemeralMode && global.VildaSync && typeof global.VildaSync.syncPush === 'function') {
        Promise.resolve(global.VildaSync.syncPush()).catch(function () {});
      }
    } catch (_) { void _; }

    return true;
  }

  async function getCurrentUserStats() {
    if (!isUnlocked()) return { patientCount: 0, snapshotCount: 0 };
    const patients = await getAdapter().listPatientsForUser(currentUserId);
    let snaps = 0;
    patients.forEach(function (p) { snaps += (p.snapshotCount || 0); });
    return { patientCount: patients.length, snapshotCount: snaps };
  }

  // ============ EKSPORT PACJENTA DO KOPERTY .vilda ============
  // Buduje self-contained envelope JSON z całą historią pacjenta zaszyfrowaną
  // master keyem aktualnego usera. wrappedMasterKey w pliku pozwala odbiorcy
  // odszyfrować dane tym samym hasłem co w aktualnym koncie. Plik jest
  // przenośny — można go zaimportować na innym urządzeniu (etap 5+).
  async function exportPatientEnvelope(patientId) {
    if (!isUnlocked()) throw new Error('Zaloguj się przed eksportem pacjenta.');
    const C = getCrypto();
    const meta = await getAdapter().getUserMeta(currentUserId);
    if (!meta) throw new Error('Brak meta użytkownika.');
    const patientRec = await getAdapter().getPatientForUser(currentUserId, patientId);
    if (!patientRec) throw new Error('Pacjent nie istnieje.');
    const snapshotsRaw = await getAdapter().listSnapshotsForUser(currentUserId, patientId);

    const headerPlain = await decryptPayloadForCurrentUser(patientRec.headerCipher.iv, patientRec.headerCipher.data);
    const snapshots = [];
    for (let i = 0; i < snapshotsRaw.length; i += 1) {
      const s = snapshotsRaw[i];
      const payload = await decryptPayloadForCurrentUser(s.payloadCipher.iv, s.payloadCipher.data);
      snapshots.push({
        snapshotId: s.snapshotId,
        savedAtISO: s.savedAtISO,
        payload: payload
      });
    }
    snapshots.sort(function (a, b) {
      if (a.savedAtISO > b.savedAtISO) return 1;
      if (a.savedAtISO < b.savedAtISO) return -1;
      return 0;
    });

    const headerEnc = await encryptPayloadForCurrentUser(headerPlain);
    const fullPayload = {
      patientId: patientId,
      createdAtISO: patientRec.createdAtISO,
      lastSavedAtISO: patientRec.lastSavedAtISO,
      snapshotCount: patientRec.snapshotCount,
      snapshots: snapshots,
      exportedAtISO: new Date().toISOString()
    };
    const payloadEnc = await encryptPayloadForCurrentUser(fullPayload);

    const envelope = C.buildEnvelope({
      kind: 'patient',
      salt: meta.passwordSalt,
      iterations: meta.kdfIterations,
      header: headerEnc,
      payload: payloadEnc,
      wrappedMasterKey: meta.encryptedMasterByPassword,
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        sourceVaultUserId: currentUserId,
        patientId: patientId,
        exportedAtISO: fullPayload.exportedAtISO
      }
    });
    return envelope;
  }

  // ============ HASH PATIENT ID -> KRÓTKI HEX (DO NAZWY PLIKU) ============
  function shortHashOfPatientId(patientId) {
    if (typeof patientId !== 'string' || !patientId.length) return '00000000';
    let h = 0;
    for (let i = 0; i < patientId.length; i += 1) {
      h = ((h << 5) - h + patientId.charCodeAt(i)) | 0;
    }
    const u = (h >>> 0).toString(16);
    return ('00000000' + u).slice(-8);
  }

  // ============ IMPORT KOPERTY .vilda Z DYSKU ============
  // Plik .vilda jest self-contained: ma wrappedMasterKey + header + payload.
  // Dwa scenariusze:
  //   1) Plik pochodzi z TEGO samego konta (ten sam master) — header deszyfruje
  //      się bieżącym master keyem, hasło nie jest potrzebne.
  //   2) Plik pochodzi ze starego konta (np. przed wyczyszczeniem przeglądarki)
  //      — header NIE deszyfruje się bieżącym master keyem; wtedy potrzebne
  //      jest hasło, którym plik został wygenerowany; aplikacja unwrap'uje
  //      master key z koperty i nim deszyfruje header/payload.
  // Po pomyślnej deszyfracji dane są reszyfrowane bieżącym master keyem
  // i zapisane w aktualnym koncie usera (merge po patientId).

  function parseEnvelopeFromInput(input) {
    const C = getCrypto();
    if (!input) throw new Error('Brak pliku do importu.');
    if (typeof input === 'string') return C.parseEnvelope(input);
    return C.parseEnvelope(input);
  }

  async function tryDecryptHeaderWithKey(envelope, key) {
    const C = getCrypto();
    return C.decryptJson(key, envelope.header.iv, envelope.header.data);
  }

  // Zwraca minimalne info o pliku do listy preview w UI: imię, data ostatniego
  // zapisu, liczba snapshotów (z metadata jeśli jest), czy potrzebne hasło.
  // NIE odszyfrowuje payload-u, tylko nagłówek.
  async function previewPatientEnvelope(input, password) {
    if (!isUnlocked()) throw new Error('Zaloguj się przed podglądem pliku.');
    const C = getCrypto();
    const envelope = parseEnvelopeFromInput(input);
    if (envelope.kind !== 'patient') {
      throw new Error('Plik nie zawiera pacjenta (kind=' + envelope.kind + ').');
    }
    let header = null;
    let needsPassword = false;
    let methodUsed = null;
    try {
      header = await tryDecryptHeaderWithKey(envelope, masterKey);
      methodUsed = 'currentMaster';
    } catch (_) {
      needsPassword = true;
    }
    if (!header) {
      if (typeof password !== 'string' || !password.length) {
        return {
          needsPassword: true,
          header: null,
          metadata: envelope.metadata || null
        };
      }
      if (!envelope.wrappedMasterKey) {
        throw new Error('Plik nie zawiera danych potrzebnych do otwarcia innym hasłem.');
      }
      let recovered;
      try {
        recovered = await C.unwrapMasterFromEnvelope(envelope, password);
      } catch (_) {
        throw new Error('Nieprawidłowe hasło dla tego pliku.');
      }
      header = await tryDecryptHeaderWithKey(envelope, recovered);
      methodUsed = 'password';
    }
    return {
      needsPassword: needsPassword && methodUsed === 'password' ? false : (needsPassword && !header),
      header: header,
      metadata: envelope.metadata || null,
      patientId: (envelope.metadata && envelope.metadata.patientId) || null,
      methodUsed: methodUsed
    };
  }

  // Pełny import: deszyfracja + merge w aktualnym koncie.
  async function importPatientFromEnvelope(input, password) {
    if (!isUnlocked()) throw new Error('Zaloguj się przed importem.');
    const C = getCrypto();
    const envelope = parseEnvelopeFromInput(input);
    if (envelope.kind !== 'patient') {
      throw new Error('Plik nie zawiera pacjenta (kind=' + envelope.kind + ').');
    }

    // 1) Wybierz klucz, który odszyfrowuje plik.
    let sourceKey = null;
    try {
      await tryDecryptHeaderWithKey(envelope, masterKey);
      sourceKey = masterKey;
    } catch (_) {
      if (typeof password !== 'string' || !password.length) {
        const e = new Error('Ten plik był zaszyfrowany innym hasłem. Wpisz hasło ze starego konta.');
        e.code = 'NEEDS_PASSWORD';
        throw e;
      }
      if (!envelope.wrappedMasterKey) {
        throw new Error('Plik nie zawiera danych potrzebnych do otwarcia innym hasłem.');
      }
      try {
        sourceKey = await C.unwrapMasterFromEnvelope(envelope, password);
      } catch (_) {
        const e = new Error('Nieprawidłowe hasło dla tego pliku.');
        e.code = 'BAD_PASSWORD';
        throw e;
      }
    }

    // 2) Deszyfruj header i payload kluczem źródłowym.
    const header = await C.decryptJson(sourceKey, envelope.header.iv, envelope.header.data);
    const fullPayload = await C.decryptJson(sourceKey, envelope.payload.iv, envelope.payload.data);

    // 3) Wybierz patientId (z metadata, z payloadu albo wygeneruj nowy).
    let patientId = (envelope.metadata && envelope.metadata.patientId)
      || (fullPayload && fullPayload.patientId)
      || null;

    // 4) Sprawdź czy taki pacjent istnieje w aktualnym koncie.
    let existingPatient = null;
    if (patientId) {
      existingPatient = await getAdapter().getPatientForUser(currentUserId, patientId);
    }

    // 5) Próba dedup po imieniu+wieku jeśli patientId nie pasował.
    if (!existingPatient && header && header.name) {
      const myPatients = await getAdapter().listPatientsForUser(currentUserId);
      for (let i = 0; i < myPatients.length; i += 1) {
        try {
          const myHeader = await decryptPayloadForCurrentUser(myPatients[i].headerCipher.iv, myPatients[i].headerCipher.data);
          if (myHeader && myHeader.name
            && myHeader.name.toLowerCase() === header.name.toLowerCase()
            && myHeader.age === header.age) {
            existingPatient = myPatients[i];
            patientId = existingPatient.patientId;
            break;
          }
        } catch (_) { /* pomijamy uszkodzone */ }
      }
    }

    if (!patientId) patientId = generateUuid();
    const isNew = !existingPatient;

    // 6) Lista istniejących snapshotId żeby uniknąć duplikatów.
    const existingSnapshots = isNew ? [] : await getAdapter().listSnapshotsForUser(currentUserId, patientId);
    const existingIds = new Set();
    existingSnapshots.forEach(function (s) { existingIds.add(s.snapshotId); });

    // 7) Re-szyfracja każdego snapshotu kluczem aktualnego konta i zapis.
    const sourceSnapshots = Array.isArray(fullPayload && fullPayload.snapshots) ? fullPayload.snapshots : [];
    let addedSnapshots = 0;
    let skippedSnapshots = 0;
    const reEncryptedSnapshots = [];
    for (let i = 0; i < sourceSnapshots.length; i += 1) {
      const s = sourceSnapshots[i];
      if (!s || !s.snapshotId) { skippedSnapshots += 1; continue; }
      if (existingIds.has(s.snapshotId)) { skippedSnapshots += 1; continue; }
      const reEnc = await encryptPayloadForCurrentUser(s.payload || {});
      reEncryptedSnapshots.push({
        snapshotId: s.snapshotId,
        patientId: patientId,
        savedAtISO: s.savedAtISO || new Date().toISOString(),
        payloadCipher: reEnc
      });
      addedSnapshots += 1;
    }
    for (let i = 0; i < reEncryptedSnapshots.length; i += 1) {
      await getAdapter().putSnapshotForUser(currentUserId, reEncryptedSnapshots[i]);
    }

    // 8) Header zapisz/odśwież zaszyfrowany aktualnym master keyem.
    const reEncryptedHeader = await encryptPayloadForCurrentUser(header || {});
    const allSnapshotsCount = existingSnapshots.length + addedSnapshots;
    const lastSavedISO = (function () {
      let latest = (existingPatient && existingPatient.lastSavedAtISO) || '';
      reEncryptedSnapshots.forEach(function (s) { if (s.savedAtISO > latest) latest = s.savedAtISO; });
      return latest || new Date().toISOString();
    })();
    const createdISO = (existingPatient && existingPatient.createdAtISO)
      || (fullPayload && fullPayload.createdAtISO)
      || new Date().toISOString();

    await getAdapter().putPatientForUser(currentUserId, {
      patientId: patientId,
      headerCipher: reEncryptedHeader,
      createdAtISO: createdISO,
      lastSavedAtISO: lastSavedISO,
      snapshotCount: allSnapshotsCount
    });

    return {
      patientId: patientId,
      isNew: isNew,
      addedSnapshots: addedSnapshots,
      skippedSnapshots: skippedSnapshots,
      totalSnapshots: allSnapshotsCount,
      headerName: (header && header.name) || null
    };
  }

  // ============ EKSPORT CAŁEGO VAULTU (backup) ============
  // Pełna kopia konta: wszyscy pacjenci + KDF + obie warstwy unwrappingu
  // (hasło i klucz odzyskiwania). Restore z takiego pliku tworzy IDENTYCZNE
  // konto na innym urządzeniu — ten sam master key, te same uprawnienia, te
  // same dane. W przeciwieństwie do per-pacjent eksportu (gdzie po imporcie
  // dane są re-szyfrowane nowym master keyem nowego konta).
  async function exportVaultBackup() {
    if (!isUnlocked()) throw new Error('Zaloguj się przed eksportem kopii konta.');
    const C = getCrypto();
    const meta = await getAdapter().getUserMeta(currentUserId);
    if (!meta) throw new Error('Brak meta użytkownika.');

    const patientsRaw = await getAdapter().listPatientsForUser(currentUserId);
    const fullPatients = [];
    for (let i = 0; i < patientsRaw.length; i += 1) {
      const p = patientsRaw[i];
      const headerPlain = await decryptPayloadForCurrentUser(p.headerCipher.iv, p.headerCipher.data);
      const snapshotsRaw = await getAdapter().listSnapshotsForUser(currentUserId, p.patientId);
      const snapshots = [];
      for (let j = 0; j < snapshotsRaw.length; j += 1) {
        const s = snapshotsRaw[j];
        const payload = await decryptPayloadForCurrentUser(s.payloadCipher.iv, s.payloadCipher.data);
        snapshots.push({
          snapshotId: s.snapshotId,
          savedAtISO: s.savedAtISO,
          payload: payload
        });
      }
      snapshots.sort(function (a, b) {
        if (a.savedAtISO > b.savedAtISO) return 1;
        if (a.savedAtISO < b.savedAtISO) return -1;
        return 0;
      });
      fullPatients.push({
        patientId: p.patientId,
        header: headerPlain,
        snapshots: snapshots,
        createdAtISO: p.createdAtISO,
        lastSavedAtISO: p.lastSavedAtISO,
        snapshotCount: p.snapshotCount
      });
    }

    const nowISO = new Date().toISOString();
    let totalSnapshots = 0;
    fullPatients.forEach(function (p) { totalSnapshots += p.snapshots.length; });

    const headerEnc = await encryptPayloadForCurrentUser({
      label: currentUserLabel,
      sourceVaultUserId: currentUserId,
      exportedAtISO: nowISO
    });
    const payloadEnc = await encryptPayloadForCurrentUser({
      patients: fullPatients,
      schemaVersion: SCHEMA_VERSION,
      sourceVaultUserId: currentUserId,
      exportedAtISO: nowISO
    });

    const envelope = C.buildEnvelope({
      kind: 'vault-backup',
      salt: meta.passwordSalt,
      iterations: meta.kdfIterations,
      header: headerEnc,
      payload: payloadEnc,
      wrappedMasterKey: meta.encryptedMasterByPassword,
      wrappedMasterByRecovery: meta.encryptedMasterByRecovery,
      recoverySalt: meta.recoverySalt,
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        sourceVaultUserId: currentUserId,
        label: currentUserLabel,
        patientCount: fullPatients.length,
        snapshotCount: totalSnapshots,
        exportedAtISO: nowISO
      }
    });
    return envelope;
  }

  // ============ RESTORE PEŁNEGO VAULTU ============
  // Przyjmuje envelope kind=vault-backup + hasło LUB recovery key. Tworzy
  // NOWE konto z identycznym master keyem co w backupie (czyli identyczna
  // tożsamość kryptograficzna jak źródłowe konto). Po restore aplikacja jest
  // automatycznie odblokowana na nowym koncie.
  async function restoreVaultBackup(input, password, options) {
    const C = getCrypto();
    const opts = options || {};
    let envelope;
    try {
      envelope = (typeof input === 'string') ? C.parseEnvelope(input) : C.parseEnvelope(input);
    } catch (e) {
      throw new Error('Wybrany plik nie wygląda na kopię z tej aplikacji.');
    }
    if (envelope.kind !== 'vault-backup') {
      if (envelope.kind === 'patient') {
        const e = new Error('Wybrany plik to kopia POJEDYNCZEGO pacjenta, a nie całego konta. Aby odtworzyć konto, wybierz plik z nazwą „wagaiwzrost_konto_<imię>_<data>.wiw". Jeśli masz tylko pliki pacjentów, skonfiguruj nowe konto i zaimportuj je przez „Importuj kopie pacjentów".');
        e.code = 'WRONG_KIND_PATIENT';
        throw e;
      }
      const e = new Error('Wybrany plik nie jest kopią konta (typ pliku: ' + envelope.kind + ').');
      e.code = 'WRONG_KIND';
      throw e;
    }
    if (!envelope.wrappedMasterKey) {
      throw new Error('Ten plik kopii jest niekompletny — brakuje danych potrzebnych do odtworzenia konta.');
    }

    // Odzyskaj master key — przez hasło lub recovery key
    let sourceMasterKey;
    let sourceMasterBytes;
    const useRecovery = !!opts.useRecoveryKey;
    if (useRecovery) {
      if (!envelope.wrappedMasterByRecovery || !envelope.recoverySalt) {
        throw new Error('Ten plik kopii nie obsługuje odtwarzania kluczem odzyskiwania.');
      }
      try {
        sourceMasterKey = await C.unwrapMasterFromEnvelopeRecovery(envelope, password);
      } catch (_) {
        const e = new Error('Ten klucz odzyskiwania nie pasuje do tej kopii konta.');
        e.code = 'BAD_RECOVERY_KEY';
        throw e;
      }
    } else {
      try {
        sourceMasterKey = await C.unwrapMasterFromEnvelope(envelope, password);
      } catch (_) {
        const e = new Error('Nieprawidłowe hasło dla tej kopii konta.');
        e.code = 'BAD_PASSWORD';
        throw e;
      }
    }

    // Master key z backupu — wyciągamy bajty raz dla późniejszego użycia
    // (potrzebujemy jako Uint8Array, żeby ustawić masterKeyBytes po setup).
    // Trick: deszyfrujemy wrappedMasterKey ręcznie, żeby uzyskać same bajty.
    const wrapKey = useRecovery
      ? await C.deriveKeyFromRecoveryKey(password, envelope.recoverySalt, envelope.kdf.iterations)
      : await C.deriveKey(password, envelope.kdf.salt, envelope.kdf.iterations);
    const wrapped = useRecovery ? envelope.wrappedMasterByRecovery : envelope.wrappedMasterKey;
    sourceMasterBytes = await C.decryptBytes(wrapKey, wrapped.iv, wrapped.data);

    // Deszyfruj header i payload kluczem master z backupu
    const headerPlain = await C.decryptJson(sourceMasterKey, envelope.header.iv, envelope.header.data);
    const fullPayload = await C.decryptJson(sourceMasterKey, envelope.payload.iv, envelope.payload.data);

    // Stwórz nowe konto z TYM SAMYM master keyem co w backupie. Nie używamy
    // createUser() — tam generowany byłby nowy losowy master key. Robimy
    // ręczny setup wpisując wszystkie pola z koperty.
    const newUserId = generateUserId();
    const label = (typeof opts.label === 'string' && opts.label.trim().length)
      ? opts.label.trim()
      : (headerPlain.label || (envelope.metadata && envelope.metadata.label) || 'Konto z kopii');
    const nowISO = new Date().toISOString();

    const newMeta = {
      schemaVersion: SCHEMA_VERSION,
      createdAtISO: nowISO,
      kdfName: envelope.kdf.name,
      kdfHash: envelope.kdf.hash,
      kdfIterations: envelope.kdf.iterations,
      passwordSalt: envelope.kdf.salt,
      recoverySalt: envelope.recoverySalt || null,
      encryptedMasterByPassword: {
        iv: envelope.wrappedMasterKey.iv,
        data: envelope.wrappedMasterKey.data
      },
      encryptedMasterByRecovery: envelope.wrappedMasterByRecovery
        ? { iv: envelope.wrappedMasterByRecovery.iv, data: envelope.wrappedMasterByRecovery.data }
        : null
    };
    // Jeśli backup nie miał wrappedMasterByRecovery — wygeneruj nowy klucz
    // odzyskiwania i wpisz; user może go odebrać z return value.
    let newRecoveryKey = null;
    if (!newMeta.encryptedMasterByRecovery || !newMeta.recoverySalt) {
      const C2 = getCrypto();
      newRecoveryKey = C2.generateRecoveryKey();
      const newRecoverySalt = C2.generateSalt();
      const newRecoveryWrapKey = await C2.deriveKeyFromRecoveryKey(newRecoveryKey, newRecoverySalt, envelope.kdf.iterations);
      const newRecoveryEnc = await C2.encryptBytes(newRecoveryWrapKey, sourceMasterBytes);
      newMeta.recoverySalt = C2.bytesToBase64(newRecoverySalt);
      newMeta.encryptedMasterByRecovery = {
        iv: C2.bytesToBase64(newRecoveryEnc.iv),
        data: C2.bytesToBase64(newRecoveryEnc.data)
      };
    }

    await getAdapter().putUserMeta(newUserId, newMeta);
    await getAdapter().putRegistryEntry({
      userId: newUserId,
      label: label,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO
    });

    // Wykonaj „unlock" tego konta w pamięci, żebyśmy mogli wpisać pacjentów
    // używając encryptPayloadForCurrentUser (to ten sam master key, więc
    // funkcyjnie wszystko działa).
    masterKey = sourceMasterKey;
    masterKeyBytes = new Uint8Array(sourceMasterBytes);
    currentUserId = newUserId;
    currentUserLabel = label;
    lockReason = null;
    zeroBytes(sourceMasterBytes);
    persistSession();
    notifyUnlock();

    // Wpisz pacjentów do nowego konta. Dane zostaną zaszyfrowane
    // bieżącym master keyem (= ten sam co w backupie).
    const sourcePatients = Array.isArray(fullPayload.patients) ? fullPayload.patients : [];
    let importedPatients = 0;
    let importedSnapshots = 0;
    for (let i = 0; i < sourcePatients.length; i += 1) {
      const p = sourcePatients[i];
      if (!p || !p.patientId || !p.header) continue;
      const headerCipher = await encryptPayloadForCurrentUser(p.header);
      const snapshotsArr = Array.isArray(p.snapshots) ? p.snapshots : [];
      for (let j = 0; j < snapshotsArr.length; j += 1) {
        const s = snapshotsArr[j];
        if (!s || !s.snapshotId) continue;
        const payloadCipher = await encryptPayloadForCurrentUser(s.payload || {});
        await getAdapter().putSnapshotForUser(newUserId, {
          snapshotId: s.snapshotId,
          patientId: p.patientId,
          savedAtISO: s.savedAtISO || nowISO,
          payloadCipher: payloadCipher
        });
        importedSnapshots += 1;
      }
      await getAdapter().putPatientForUser(newUserId, {
        patientId: p.patientId,
        headerCipher: headerCipher,
        createdAtISO: p.createdAtISO || nowISO,
        lastSavedAtISO: p.lastSavedAtISO || nowISO,
        snapshotCount: snapshotsArr.length
      });
      importedPatients += 1;
    }

    return {
      userId: newUserId,
      label: label,
      patientCount: importedPatients,
      snapshotCount: importedSnapshots,
      newRecoveryKey: newRecoveryKey
    };
  }

  // ============ SCALANIE VAULT-BACKUP Z BIEŻĄCYM KONTEM ============

  /**
   * Podgląd scalania bez zapisu do bazy.
   * Zwraca plan operacji: które pacjenty zostaną scalone (mają wspólne patientId),
   * które dodane (nowe), ile snapshotów zostanie dorzuconych.
   *
   * @param {string} input    - zawartość pliku .wiw (vault-backup)
   * @param {string} password - hasło do tej kopii konta
   * @returns {Promise<{
   *   backupLabel: string,
   *   backupExportedAtISO: string|null,
   *   mergePatients: Array<{patientId, name, currentSnapshotCount, backupSnapshotCount, newSnapshotCount}>,
   *   addPatients:   Array<{patientId, name, snapshotCount}>,
   *   totalNewSnapshots: number
   * }>}
   */
  async function previewVaultBackupMerge(input, password) {
    if (!isUnlocked()) throw new Error('Zaloguj się przed podglądem scalania.');
    const C = getCrypto();

    const envelope = parseEnvelopeFromInput(input);
    if (envelope.kind !== 'vault-backup') {
      throw new Error('Wybrany plik to nie kopia całego konta (kind=' + envelope.kind + ').');
    }

    let sourceMasterKey;
    try {
      sourceMasterKey = await C.unwrapMasterFromEnvelope(envelope, password);
    } catch (_) {
      const e = new Error('Nieprawidłowe hasło dla tej kopii konta.');
      e.code = 'BAD_PASSWORD';
      throw e;
    }

    const headerPlain  = await C.decryptJson(sourceMasterKey, envelope.header.iv,  envelope.header.data);
    const fullPayload  = await C.decryptJson(sourceMasterKey, envelope.payload.iv, envelope.payload.data);
    const sourcePatients = Array.isArray(fullPayload.patients) ? fullPayload.patients : [];

    // Załaduj bieżące patientId-s jednym zapytaniem
    const currentPatientsRaw = await getAdapter().listPatientsForUser(currentUserId);
    const currentPatientIds  = new Set(currentPatientsRaw.map(function (p) { return p.patientId; }));

    const mergePatients = [];
    const addPatients   = [];

    for (let i = 0; i < sourcePatients.length; i++) {
      const sp = sourcePatients[i];
      if (!sp || !sp.patientId) continue;
      const backupSnapshots = Array.isArray(sp.snapshots) ? sp.snapshots : [];
      const name = (sp.header && sp.header.name) || '(brak nazwy)';

      if (currentPatientIds.has(sp.patientId)) {
        // Ten sam pacjent — oblicz ile snapshotów z backupu jest nowych
        const currentSnaps   = await getAdapter().listSnapshotsForUser(currentUserId, sp.patientId);
        const currentSnapIds = new Set(currentSnaps.map(function (s) { return s.snapshotId; }));
        const newSnapCount   = backupSnapshots.filter(function (s) { return !currentSnapIds.has(s.snapshotId); }).length;

        mergePatients.push({
          patientId:            sp.patientId,
          name:                 name,
          currentSnapshotCount: currentSnaps.length,
          backupSnapshotCount:  backupSnapshots.length,
          newSnapshotCount:     newSnapCount
        });
      } else {
        // Nowy pacjent — zostanie dodany w całości
        addPatients.push({
          patientId:     sp.patientId,
          name:          name,
          snapshotCount: backupSnapshots.length
        });
      }
    }

    const totalNewSnapshots =
      addPatients.reduce(function (s, p) { return s + p.snapshotCount; }, 0) +
      mergePatients.reduce(function (s, p) { return s + p.newSnapshotCount; }, 0);

    return {
      backupLabel:         headerPlain.label || (envelope.metadata && envelope.metadata.label) || 'Konto z kopii',
      backupExportedAtISO: headerPlain.exportedAtISO || (envelope.metadata && envelope.metadata.exportedAtISO) || null,
      mergePatients:       mergePatients,
      addPatients:         addPatients,
      totalNewSnapshots:   totalNewSnapshots
    };
  }

  /**
   * Scala vault-backup z bieżącym kontem.
   *
   * Reguły scalania (bezpieczne — nie niszczy istniejących danych):
   *   • snapshotId już istnieje → pomijany (nigdy nie nadpisywany)
   *   • patientId już istnieje → dorzucane tylko brakujące snapshoty
   *   • patientId nie istnieje → pacjent dodawany z pełną historią
   *   • snapshotCount i lastSavedAtISO aktualizowane po faktycznej liczbie wpisów
   *
   * @param {string} input    - zawartość pliku .wiw (vault-backup)
   * @param {string} password - hasło do tej kopii konta
   * @returns {Promise<{mergedPatientCount, addedPatientCount, addedSnapshotCount, skippedSnapshotCount}>}
   */
  async function mergeVaultBackup(input, password) {
    if (!isUnlocked()) throw new Error('Zaloguj się przed scalaniem.');
    const C = getCrypto();

    const envelope = parseEnvelopeFromInput(input);
    if (envelope.kind !== 'vault-backup') {
      throw new Error('Wybrany plik to nie kopia całego konta.');
    }

    let sourceMasterKey;
    try {
      sourceMasterKey = await C.unwrapMasterFromEnvelope(envelope, password);
    } catch (_) {
      const e = new Error('Nieprawidłowe hasło dla tej kopii konta.');
      e.code = 'BAD_PASSWORD';
      throw e;
    }

    const fullPayload    = await C.decryptJson(sourceMasterKey, envelope.payload.iv, envelope.payload.data);
    const sourcePatients = Array.isArray(fullPayload.patients) ? fullPayload.patients : [];

    const currentPatientsRaw = await getAdapter().listPatientsForUser(currentUserId);
    const currentPatientIds  = new Set(currentPatientsRaw.map(function (p) { return p.patientId; }));

    const nowISO = new Date().toISOString();
    let mergedPatientCount   = 0;
    let addedPatientCount    = 0;
    let addedSnapshotCount   = 0;
    let skippedSnapshotCount = 0;

    for (let i = 0; i < sourcePatients.length; i++) {
      const sp = sourcePatients[i];
      if (!sp || !sp.patientId || !sp.header) continue;

      const backupSnapshots = Array.isArray(sp.snapshots) ? sp.snapshots : [];
      const headerCipher    = await encryptPayloadForCurrentUser(sp.header);

      if (currentPatientIds.has(sp.patientId)) {
        // ── SCALANIE: pacjent istnieje — dorzuć brakujące snapshoty ──────────
        const currentSnaps   = await getAdapter().listSnapshotsForUser(currentUserId, sp.patientId);
        const currentSnapIds = new Set(currentSnaps.map(function (s) { return s.snapshotId; }));

        let addedForThisPatient = 0;
        for (let j = 0; j < backupSnapshots.length; j++) {
          const s = backupSnapshots[j];
          if (!s || !s.snapshotId) continue;
          if (currentSnapIds.has(s.snapshotId)) {
            skippedSnapshotCount++;
            continue; // duplikat — nie nadpisujemy
          }
          const payloadCipher = await encryptPayloadForCurrentUser(s.payload || {});
          await getAdapter().putSnapshotForUser(currentUserId, {
            snapshotId:    s.snapshotId,
            patientId:     sp.patientId,
            savedAtISO:    s.savedAtISO || nowISO,
            payloadCipher: payloadCipher
          });
          addedForThisPatient++;
          addedSnapshotCount++;
        }

        // Zaktualizuj patient record tylko gdy coś się zmieniło
        if (addedForThisPatient > 0) {
          const existingRec      = await getAdapter().getPatientForUser(currentUserId, sp.patientId);
          const prevCount        = (existingRec && existingRec.snapshotCount) || currentSnaps.length;
          const newSnapshotCount = prevCount + addedForThisPatient;
          // lastSavedAtISO = maksimum z obu źródeł
          const existingLast     = (existingRec && existingRec.lastSavedAtISO) || '';
          const backupLast       = sp.lastSavedAtISO || '';
          const newLastSavedAtISO = existingLast > backupLast ? existingLast : backupLast;

          await getAdapter().putPatientForUser(currentUserId, Object.assign({}, existingRec || {}, {
            patientId:       sp.patientId,
            headerCipher:    headerCipher,
            snapshotCount:   newSnapshotCount,
            lastSavedAtISO:  newLastSavedAtISO || nowISO
          }));
        }
        mergedPatientCount++;

      } else {
        // ── DODAWANIE: nowy pacjent — cała historia ───────────────────────────
        for (let j = 0; j < backupSnapshots.length; j++) {
          const s = backupSnapshots[j];
          if (!s || !s.snapshotId) continue;
          const payloadCipher = await encryptPayloadForCurrentUser(s.payload || {});
          await getAdapter().putSnapshotForUser(currentUserId, {
            snapshotId:    s.snapshotId,
            patientId:     sp.patientId,
            savedAtISO:    s.savedAtISO || nowISO,
            payloadCipher: payloadCipher
          });
          addedSnapshotCount++;
        }
        await getAdapter().putPatientForUser(currentUserId, {
          patientId:      sp.patientId,
          headerCipher:   headerCipher,
          createdAtISO:   sp.createdAtISO   || nowISO,
          lastSavedAtISO: sp.lastSavedAtISO || nowISO,
          snapshotCount:  backupSnapshots.length
        });
        addedPatientCount++;
      }
    }

    return {
      mergedPatientCount:   mergedPatientCount,
      addedPatientCount:    addedPatientCount,
      addedSnapshotCount:   addedSnapshotCount,
      skippedSnapshotCount: skippedSnapshotCount
    };
  }

  // ============ SYNC — API dla vilda_sync.js ============
  //
  // Trzy funkcje tworzące most między vault a modułem synchronizacji:
  //
  //   getSyncMaterial()          — materiał kryptograficzny pochodny od masterKey
  //   exportSyncPayload()        — surowy (odszyfrowany) eksport danych vaultu
  //   mergeSyncPayload(rawData)  — scala surowe dane bez wymagania hasła
  //
  // Żadna z tych funkcji nie ujawnia masterKeyBytes na zewnątrz vaultu.
  // syncEncKey (zwracany przez getSyncMaterial) to non-extractable CryptoKey —
  // przeglądarka blokuje jego eksport do bajtów.

  /**
   * Wyprowadza materiał synchronizacji z bieżącego masterKey.
   * Wywołuje VildaCrypto.deriveSyncMaterial() wewnętrznie — masterKeyBytes
   * nigdy nie opuszcza vaultu.
   *
   * @returns {Promise<{ slotId: string, authToken: string, authTokenHash: string, syncEncKey: CryptoKey }>}
   */
  async function getSyncMaterial() {
    if (!isUnlocked() || !masterKeyBytes) {
      throw new Error('VildaVault.getSyncMaterial: vault nie jest odblokowany.');
    }
    const C = getCrypto();
    return C.deriveSyncMaterial(masterKeyBytes);
  }

  /**
   * Eksportuje surowe (odszyfrowane) dane vaultu jako JS object.
   * Używane przez vilda_sync.js do budowania bloba sync (który potem szyfruje AES-GCM).
   *
   * NIGDY nie wysyłaj wyniku tej funkcji bezpośrednio na serwer —
   * zawiera odszyfrowane dane pacjentów. Zawsze szyfruj przez vilda_sync.js.
   *
   * @returns {Promise<object>}
   */
  async function exportSyncPayload() {
    if (!isUnlocked()) {
      throw new Error('VildaVault.exportSyncPayload: vault nie jest odblokowany.');
    }

    const patientsRaw = await getAdapter().listPatientsForUser(currentUserId);
    const fullPatients = [];

    for (let i = 0; i < patientsRaw.length; i += 1) {
      const p = patientsRaw[i];
      const headerPlain = await decryptPayloadForCurrentUser(p.headerCipher.iv, p.headerCipher.data);
      const snapshotsRaw = await getAdapter().listSnapshotsForUser(currentUserId, p.patientId);
      const snapshots = [];

      for (let j = 0; j < snapshotsRaw.length; j += 1) {
        const s = snapshotsRaw[j];
        const payload = await decryptPayloadForCurrentUser(s.payloadCipher.iv, s.payloadCipher.data);
        snapshots.push({
          snapshotId: s.snapshotId,
          savedAtISO: s.savedAtISO,
          payload:    payload
        });
      }

      snapshots.sort(function (a, b) {
        if (a.savedAtISO > b.savedAtISO) return 1;
        if (a.savedAtISO < b.savedAtISO) return -1;
        return 0;
      });

      fullPatients.push({
        patientId:      p.patientId,
        header:         headerPlain,
        snapshots:      snapshots,
        createdAtISO:   p.createdAtISO,
        lastSavedAtISO: p.lastSavedAtISO,
        snapshotCount:  p.snapshotCount
      });
    }

    // Tombstones (znaczniki usunięcia) — przenoszone w blobie, żeby usunięcie pacjenta
    // propagowało się między urządzeniami. Pole addytywne: starszy klient ignoruje je,
    // nowszy czytający stary blob przyjmie []. Dlatego NIE bumpujemy współdzielonego
    // SCHEMA_VERSION (to wersja schematu meta, nie payloadu sync). Feature-detect na
    // wypadek adaptera bez metody (zwraca []).
    let tombstones = [];
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.listTombstonesForUser === 'function') {
        tombstones = await _adp.listTombstonesForUser(currentUserId);
        // GC: przytnij znaczniki starsze niż TTL (lokalnie i w payloadzie).
        if (typeof _adp.removeTombstoneForUser === 'function' && tombstones.length) {
          const cutoffISO = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
          const kept = [];
          for (let t = 0; t < tombstones.length; t++) {
            const ts = tombstones[t];
            if (ts && ts.deletedAtISO && ts.deletedAtISO < cutoffISO) {
              await _adp.removeTombstoneForUser(currentUserId, ts.patientId);
            } else {
              kept.push(ts);
            }
          }
          tombstones = kept;
        }
      }
    } catch (_) { tombstones = []; }

    return {
      schemaVersion:  SCHEMA_VERSION,
      userId:         currentUserId,
      label:          currentUserLabel,
      exportedAtISO:  new Date().toISOString(),
      patients:       fullPatients,
      tombstones:     Array.isArray(tombstones) ? tombstones : []
    };
  }

  /**
   * Scala dane sync z bieżącym kontem.
   * Przyjmuje surowy obiekt (taki jaki zwraca exportSyncPayload),
   * już odszyfrowany przez vilda_sync.js — bez potrzeby hasła.
   *
   * Reguły scalania (bezpieczne — nie niszczy istniejących danych):
   *   • snapshotId już istnieje → pomijany
   *   • patientId już istnieje → dorzucane tylko brakujące snapshoty
   *   • patientId nie istnieje → pacjent dodawany z pełną historią
   *
   * @param {object} rawData  — wynik exportSyncPayload() z innego urządzenia
   * @returns {Promise<{ mergedPatientCount, addedPatientCount, addedSnapshotCount, skippedSnapshotCount }>}
   */
  async function mergeSyncPayload(rawData) {
    if (!isUnlocked()) {
      throw new Error('VildaVault.mergeSyncPayload: vault nie jest odblokowany.');
    }
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('VildaVault.mergeSyncPayload: nieprawidłowy format danych.');
    }

    const sourcePatients = Array.isArray(rawData.patients) ? rawData.patients : [];
    const currentPatientsRaw = await getAdapter().listPatientsForUser(currentUserId);
    const currentPatientIds  = new Set(currentPatientsRaw.map(function (p) { return p.patientId; }));

    const nowISO = new Date().toISOString();
    let mergedPatientCount   = 0;
    let addedPatientCount    = 0;
    let addedSnapshotCount   = 0;
    let skippedSnapshotCount = 0;
    let deletedPatientCount  = 0;

    // ── Tombstones (znaczniki usunięcia) — reguła „nowszy wygrywa" (LWW) ─────────
    // Pacjent jest USUNIĘTY, gdy najnowszy znacznik (lokalny ∪ przychodzący) jest
    // nie starszy niż najnowsza edycja (lokalna ∪ przychodząca). Edycja nowsza niż
    // usunięcie „przywraca" pacjenta. Feature-detect: starsze adaptery bez tombstone
    // pomijają całą logikę (zachowanie addytywne jak dawniej).
    const _adp = getAdapter();
    const _tombSupported = _adp
      && typeof _adp.listTombstonesForUser === 'function'
      && typeof _adp.putTombstoneForUser === 'function'
      && typeof _adp.removeTombstoneForUser === 'function';
    const incomingTombArr = Array.isArray(rawData.tombstones) ? rawData.tombstones : [];
    const localTombArr = _tombSupported ? (await _adp.listTombstonesForUser(currentUserId)) : [];

    const deleteAt = Object.create(null);
    function _noteDelete(id, iso) {
      if (!id || !iso) return;
      if (!deleteAt[id] || iso > deleteAt[id]) deleteAt[id] = iso;
    }
    incomingTombArr.forEach(function (t) { if (t) _noteDelete(t.patientId, t.deletedAtISO); });
    localTombArr.forEach(function (t) { if (t) _noteDelete(t.patientId, t.deletedAtISO); });

    const editAt = Object.create(null);
    function _noteEdit(id, iso) {
      if (!id || !iso) return;
      if (!editAt[id] || iso > editAt[id]) editAt[id] = iso;
    }
    currentPatientsRaw.forEach(function (p) { if (p) _noteEdit(p.patientId, p.lastSavedAtISO); });
    sourcePatients.forEach(function (p) { if (p) _noteEdit(p.patientId, p.lastSavedAtISO); });

    const deletedIds = new Set();
    Object.keys(deleteAt).forEach(function (id) {
      const ed = editAt[id] || null;
      if (!ed || deleteAt[id] >= ed) deletedIds.add(id);
    });

    for (let i = 0; i < sourcePatients.length; i++) {
      const sp = sourcePatients[i];
      if (!sp || !sp.patientId || !sp.header) continue;
      if (deletedIds.has(sp.patientId)) continue; // usunięty (nowszy znacznik) — nie dodawaj

      const backupSnapshots = Array.isArray(sp.snapshots) ? sp.snapshots : [];
      const headerCipher    = await encryptPayloadForCurrentUser(sp.header);

      if (currentPatientIds.has(sp.patientId)) {
        // ── SCALANIE: pacjent istnieje — dorzuć brakujące snapshoty ──────────
        const currentSnaps   = await getAdapter().listSnapshotsForUser(currentUserId, sp.patientId);
        const currentSnapIds = new Set(currentSnaps.map(function (s) { return s.snapshotId; }));

        let addedForThisPatient = 0;
        for (let j = 0; j < backupSnapshots.length; j++) {
          const s = backupSnapshots[j];
          if (!s || !s.snapshotId) continue;
          if (currentSnapIds.has(s.snapshotId)) {
            skippedSnapshotCount++;
            continue;
          }
          const payloadCipher = await encryptPayloadForCurrentUser(s.payload || {});
          await getAdapter().putSnapshotForUser(currentUserId, {
            snapshotId:    s.snapshotId,
            patientId:     sp.patientId,
            savedAtISO:    s.savedAtISO || nowISO,
            payloadCipher: payloadCipher
          });
          addedForThisPatient++;
          addedSnapshotCount++;
        }

        if (addedForThisPatient > 0) {
          const existingRec       = await getAdapter().getPatientForUser(currentUserId, sp.patientId);
          const prevCount         = (existingRec && existingRec.snapshotCount) || currentSnaps.length;
          const newSnapshotCount  = prevCount + addedForThisPatient;
          const existingLast      = (existingRec && existingRec.lastSavedAtISO) || '';
          const backupLast        = sp.lastSavedAtISO || '';
          const newLastSavedAtISO = existingLast > backupLast ? existingLast : backupLast;
          await getAdapter().putPatientForUser(currentUserId, Object.assign({}, existingRec || {}, {
            patientId:      sp.patientId,
            headerCipher:   headerCipher,
            snapshotCount:  newSnapshotCount,
            lastSavedAtISO: newLastSavedAtISO || nowISO
          }));
        }
        mergedPatientCount++;

      } else {
        // ── DODAWANIE: nowy pacjent — cała historia ───────────────────────────
        for (let j = 0; j < backupSnapshots.length; j++) {
          const s = backupSnapshots[j];
          if (!s || !s.snapshotId) continue;
          const payloadCipher = await encryptPayloadForCurrentUser(s.payload || {});
          await getAdapter().putSnapshotForUser(currentUserId, {
            snapshotId:    s.snapshotId,
            patientId:     sp.patientId,
            savedAtISO:    s.savedAtISO || nowISO,
            payloadCipher: payloadCipher
          });
          addedSnapshotCount++;
        }
        await getAdapter().putPatientForUser(currentUserId, {
          patientId:      sp.patientId,
          headerCipher:   headerCipher,
          createdAtISO:   sp.createdAtISO   || nowISO,
          lastSavedAtISO: sp.lastSavedAtISO || nowISO,
          snapshotCount:  backupSnapshots.length
        });
        addedPatientCount++;
      }
    }

    // ── Zastosuj tombstones po scaleniu ─────────────────────────────────────────
    if (_tombSupported) {
      // Usunięci (nowszy znacznik): skasuj dane lokalne (jeśli są) + utrwal znacznik,
      // by usunięcie propagowało się dalej (ten device też je wypchnie).
      const _deletedList = Array.from(deletedIds);
      for (let d = 0; d < _deletedList.length; d++) {
        const id = _deletedList[d];
        if (currentPatientIds.has(id)) {
          await getAdapter().removePatientForUser(currentUserId, id);
          deletedPatientCount++;
        }
        await getAdapter().putTombstoneForUser(currentUserId, { patientId: id, deletedAtISO: deleteAt[id] });
      }
      // Przedawnione znaczniki lokalne (pacjent ożył nowszą edycją) — zdejmij.
      for (let k = 0; k < localTombArr.length; k++) {
        const lt = localTombArr[k];
        if (lt && lt.patientId && !deletedIds.has(lt.patientId)) {
          await getAdapter().removeTombstoneForUser(currentUserId, lt.patientId);
        }
      }
    }

    return {
      mergedPatientCount,
      addedPatientCount,
      addedSnapshotCount,
      skippedSnapshotCount,
      deletedPatientCount
    };
  }

  // ============ IMPORT STAREGO PŁASKIEGO JSON-a (legacy) ============
  // Pliki sprzed wprowadzenia szyfrowania (collectUserData() bezpośrednio
  // do download blob jako .json). Format: płaski obiekt z polami name, user,
  // timestampISO, etc. Brak wrappedMasterKey, brak format/kind. Po prostu
  // dane pacjenta. Wywołujemy savePatient — vault szyfruje aktualnym master
  // keyem i wpisuje jako nowy snapshot pacjenta.
  function looksLikeLegacyPayload(obj) {
    return obj
      && typeof obj === 'object'
      && !obj.format
      && !obj.kind
      && typeof obj.name === 'string' && obj.name.trim().length > 0
      && obj.user && typeof obj.user === 'object';
  }

  async function importLegacyJsonPatient(input, options) {
    if (!isUnlocked()) throw new Error('Zaloguj się przed importem.');
    let payload;
    if (typeof input === 'string') {
      try { payload = JSON.parse(input); }
      catch (_) {
        const e = new Error('Nieprawidłowy plik JSON.');
        e.code = 'BAD_JSON';
        throw e;
      }
    } else {
      payload = input;
    }
    if (!looksLikeLegacyPayload(payload)) {
      const e = new Error('Plik nie wygląda na zapis pacjenta z aplikacji wagaiwzrost.pl.');
      e.code = 'NOT_LEGACY_PAYLOAD';
      throw e;
    }
    // savePatient sam zrobi dedup po imieniu+wieku (jeśli pacjent już istnieje
    // — doda kolejny snapshot do tego samego patientId). Normalizujemy wynik
    // do tego samego kształtu co importPatientFromEnvelope, żeby UI mogło
    // używać jednego pola headerName niezależnie od ścieżki.
    const result = await savePatient(payload, options || {});
    return {
      patientId: result.patientId,
      snapshotId: result.snapshotId,
      isNew: result.isNew,
      addedSnapshots: 1,
      skippedSnapshots: 0,
      totalSnapshots: result.snapshotCount,
      snapshotCount: result.snapshotCount,
      headerName: (result.header && result.header.name) || null,
      header: result.header,
      savedAtISO: result.savedAtISO,
      shortHash: result.shortHash
    };
  }

  // ============ EVENT onPatientSaved ============
  // Subskrybenci są informowani po pomyślnym savePatient(). Używane przez
  // VildaFileExport do automatycznego zapisu pliku .vilda na dysku.
  const onPatientSavedListeners = [];
  function onPatientSaved(fn) {
    if (typeof fn === 'function') onPatientSavedListeners.push(fn);
  }
  function notifyPatientSaved(payload) {
    onPatientSavedListeners.forEach(function (fn) {
      try { fn(payload); } catch (_) { /* listener errors swallowed */ }
    });
  }

  // ============ EVENT onPatientDeleted ============
  // Informuje po usunięciu pacjenta (zapisaniu tombstone). VildaSyncIntegration
  // używa tego, by od razu wypchnąć stan (tombstone) do innych urządzeń w trybie
  // normalnym — bez czekania na kolejny zapis/sync.
  const onPatientDeletedListeners = [];
  function onPatientDeleted(fn) {
    if (typeof fn === 'function') onPatientDeletedListeners.push(fn);
  }
  function notifyPatientDeleted(info) {
    onPatientDeletedListeners.forEach(function (fn) {
      try { fn(info); } catch (_) { /* listener errors swallowed */ }
    });
  }

  // ============ AUTO-LOCK PO BEZCZYNNOŚCI ============
  function startIdleTimer(ms) {
    if (typeof ms === 'number' && ms > 0) idleTimeoutMs = ms;
    stopIdleTimer();
    if (typeof global.setTimeout !== 'function') return;
    idleTimer = global.setTimeout(function () {
      lock('idle');
    }, idleTimeoutMs);
  }

  function stopIdleTimer() {
    if (idleTimer != null && typeof global.clearTimeout === 'function') {
      global.clearTimeout(idleTimer);
    }
    idleTimer = null;
  }

  function resetIdleTimer() {
    if (!isUnlocked()) return;
    startIdleTimer(idleTimeoutMs);
  }

  // ============ EVENTY ============
  function onUnlock(fn) {
    if (typeof fn === 'function') onUnlockListeners.push(fn);
  }

  function onLock(fn) {
    if (typeof fn === 'function') onLockListeners.push(fn);
  }

  // ============ WEBAUTHN PASSKEYS ============

  /**
   * Czy urządzenie i przeglądarka obsługują WebAuthn PRF?
   * Deleguje do VildaCrypto.isPrfSupported().
   */
  async function isPrfSupported() {
    const C = getCrypto();
    return C.isPrfSupported();
  }

  /**
   * Rejestruje nowy passkey dla zalogowanego użytkownika.
   * Wymaga odblokowanego vaultu (masterKeyBytes w pamięci).
   *
   * @param {string} [deviceLabel] - etykieta urządzenia; jeśli pominięta, generowana automatycznie
   * @returns {Promise<{ credentialId: string, deviceLabel: string }>}
   */
  async function registerPasskey(deviceLabel) {
    const C = getCrypto();
    if (!isUnlocked() || !masterKeyBytes) {
      throw new Error('Zaloguj się przed rejestracją biometrii.');
    }
    const userId = currentUserId;
    const rpId = window.location.hostname || 'localhost';
    const label = deviceLabel || C.generateDeviceLabel();

    // 1. Rejestracja passkey + odbiór PRF secret
    const { credentialId, prfSecretBytes } = await C.createPasskeyAndGetPrfSecret(
      userId, rpId, currentUserLabel
    );

    // 2. Klucz wrappujący z PRF secret (HKDF-SHA256)
    const wrappingKey = await C.deriveKeyFromPrfSecret(prfSecretBytes);

    // 3. Zaszyfruj master key tym kluczem
    const encryptedMasterByPasskey = await C.encryptBytes(wrappingKey, masterKeyBytes);

    // 4. Dopisz passkey do meta-rekordu
    const meta = await getAdapter().getUserMeta(userId);
    const passkeys = Array.isArray(meta.passkeys) ? meta.passkeys : [];
    passkeys.push({
      credentialId:             credentialId,
      deviceLabel:              label,
      createdAtISO:             new Date().toISOString(),
      encryptedMasterByPasskey: encryptedMasterByPasskey
    });
    await getAdapter().putUserMeta(userId, { ...meta, passkeys });

    return { credentialId, deviceLabel: label };
  }

  /**
   * Rejestruje passkey ROAMING + wgrywa kopertę do escrow na serwerze.
   * Dzięki temu można później zalogować się tym passkey z telefonu na DOWOLNYM
   * (współdzielonym) komputerze w trybie efemerycznym — komputer pobierze kopertę
   * z serwera i odszyfruje master key sekretem PRF (bez śladu lokalnie).
   * Wywoływać na ZAUFANYM urządzeniu, przy odblokowanym vaultcie.
   *
   * @param {string} [deviceLabel]
   * @returns {Promise<{ credentialId, deviceLabel, escrowed: true }>}
   */
  // Inicjały z etykiety konta — max 2 znaki, wielkimi literami (locale PL).
  // Używane TYLKO do wyświetlenia na współdzielonym komputerze w trybie efemerycznym:
  // niesiemy w kopercie wyłącznie inicjały (zaszyfrowane), nigdy pełnego imienia.
  function computeInitials(label) {
    if (typeof label !== 'string') return '';
    const words = label.trim().split(/\s+/).filter(Boolean);
    let ini = '';
    for (let i = 0; i < words.length && ini.length < 2; i++) {
      const ch = words[i].charAt(0);
      if (/\p{L}/u.test(ch)) ini += ch;
    }
    try { return ini.toLocaleUpperCase('pl-PL'); } catch (_) { return ini.toUpperCase(); }
  }

  async function registerPasskeyForRoaming(deviceLabel) {
    const C = getCrypto();
    if (!isUnlocked() || !masterKeyBytes) {
      throw new Error('Zaloguj się przed rejestracją biometrii.');
    }
    const userId = currentUserId;
    const rpId = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'localhost';
    const label = deviceLabel || C.generateDeviceLabel();

    // 1. Passkey roaming (bez wymuszania platform) + klucz publiczny.
    const { credentialId, publicKeyRawB64u, prfInputB64u } =
      await C.createRoamingPasskeyAndGetPrfSecret(userId, rpId, currentUserLabel);

    // 2. Sekret PRF pobierz przez get() (NIE z create) — PRF z create bywa niespójny
    //    z PRF z get() na części authenticatorów, co powodowało „nie udało się
    //    odszyfrować koperty" przy logowaniu. get() przy rejestracji i przy logowaniu
    //    daje TEN SAM sekret → spójne szyfrowanie/odszyfrowanie.
    const { prfSecretBytes } = await C.getPasskeyPrfSecret(credentialId, rpId);
    const wrappingKey = await C.deriveKeyFromPrfSecret(prfSecretBytes);
    const encryptedMasterByPasskey = await C.encryptBytes(wrappingKey, masterKeyBytes);

    // Inicjały (opcja C) — szyfrujemy TYM SAMYM kluczem co master key. Serwer trzyma
    // tylko szyfrogram; pełna nazwa nigdy nie opuszcza tego urządzenia. Na współdzielonym
    // komputerze pokażemy wyłącznie inicjały (mniejsza ekspozycja niż pełne nazwisko).
    const initials = computeInitials(currentUserLabel);
    let encryptedInitials = null;
    if (initials) {
      encryptedInitials = await C.encryptBytes(wrappingKey, new TextEncoder().encode(initials));
    }

    // 3. Zapis lokalny (jak registerPasskey) — passkey użyteczny też na tym urządzeniu.
    const meta = await getAdapter().getUserMeta(userId);
    const passkeys = Array.isArray(meta.passkeys) ? meta.passkeys : [];
    passkeys.push({
      credentialId:             credentialId,
      deviceLabel:              label,
      createdAtISO:             new Date().toISOString(),
      encryptedMasterByPasskey: encryptedMasterByPasskey,
      encryptedInitials:        encryptedInitials,
      publicKeyB64u:            publicKeyRawB64u,
      // wrapVersion 2 = klucz wrappujący wyprowadzony z PRF z get() (spójny z logowaniem).
      // Brak pola / 1 = starsza koperta sprzed poprawki create→get (potencjalnie create-PRF).
      wrapVersion:              2,
      roaming:                  true
    });
    await getAdapter().putUserMeta(userId, { ...meta, passkeys });

    // 4. Upload koperty do escrow — Bearer authToken (dowód posiadania master key).
    let sync;
    try {
      sync = await getSyncMaterial();
    } catch (e) {
      const err = new Error('Biometria zapisana lokalnie, ale brak materiału sync do escrow.');
      err.code = 'ESCROW_NO_SYNC';
      throw err;
    }
    const workerUrl = ((typeof window !== 'undefined' && window.VILDA_SYNC_WORKER_URL)
      || 'https://vilda-sync.maciej-4b9.workers.dev').replace(/\/$/, '');
    const escrowBody = {
      encryptedMasterByPasskey: {
        iv:   C.bytesToBase64url(encryptedMasterByPasskey.iv),
        data: C.bytesToBase64url(encryptedMasterByPasskey.data)
      },
      prfSalt:       prfInputB64u,
      hkdfInfo:      'wagaiwzrost.pl:wrapping-key:v1',
      wrapVersion:   2,
      publicKeyB64u: publicKeyRawB64u
    };
    if (encryptedInitials) {
      escrowBody.encryptedInitials = {
        iv:   C.bytesToBase64url(encryptedInitials.iv),
        data: C.bytesToBase64url(encryptedInitials.data)
      };
    }
    let resp;
    try {
      resp = await fetch(
        workerUrl + '/v1/slots/' + sync.slotId + '/passkey/' + encodeURIComponent(credentialId),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sync.authToken },
          body: JSON.stringify(escrowBody)
        }
      );
    } catch (e) {
      const err = new Error('Biometria zapisana lokalnie, ale nie udało się wysłać danych do chmury (brak sieci).');
      err.code = 'ESCROW_UPLOAD_FAILED';
      throw err;
    }
    if (!resp.ok) {
      const err = new Error('Serwer odrzucił zapis koperty biometrii (' + resp.status + ').');
      err.code = 'ESCROW_UPLOAD_REJECTED';
      throw err;
    }

    return { credentialId, deviceLabel: label, escrowed: true };
  }

  /**
   * Odblokowuje vault przez passkey — bez hasła.
   * Jeśli credentialId pominięty, przeglądarka wyświetli listę passkey dla danego rpId.
   *
   * @param {string}      userId       - użytkownik do odblokowania
   * @param {string|null} [credentialId] - konkretny passkey lub null (przeglądarka wybiera)
   */
  // signal — opcjonalny AbortSignal przekazywany z vilda_auth_ui.js przez AbortController.
  // Pozwala przerwać oczekujące żądanie WebAuthn gdy użytkownik zmienia ekran w auth UI.
  async function unlockWithPasskey(userId, credentialId, signal) {
    const C = getCrypto();
    if (typeof userId !== 'string' || !userId.length) {
      throw new Error('Nieprawidłowy userId.');
    }
    const meta = await getAdapter().getUserMeta(userId);
    if (!meta || !Array.isArray(meta.passkeys) || !meta.passkeys.length) {
      throw new Error('Ten użytkownik nie ma zarejestrowanej biometrii.');
    }

    const rpId = window.location.hostname || 'localhost';

    // 1. Uwierzytelnienie — przeglądarka weryfikuje biometrię i zwraca PRF secret
    const { credentialId: returnedId, prfSecretBytes } = await C.getPasskeyPrfSecret(
      credentialId || null, rpId, signal || null
    );

    // Guard: jeśli abort nastąpił w trakcie lub tuż po weryfikacji biometrycznej
    // (race condition: credentials.get() zdążył się rozwiązać zanim sygnał abort
    // dotarł do przeglądarki), nie kontynuujemy — adoptMasterBytes() wywołałoby
    // notifyUnlock() po tym jak lock() już się wykonał, zostawiając vault w stanie
    // sprzecznym (odblokowany po wylogowaniu).
    if (signal && signal.aborted) {
      const abortErr = new Error('AbortError: passkey authentication aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    // 2. Znajdź pasujący wpis w meta.passkeys
    const entry = meta.passkeys.find(p => p.credentialId === returnedId);
    if (!entry) {
      throw new Error('Nieznany credentialId — biometria nie jest zarejestrowana dla tego konta.');
    }

    // 3. Wyprowaź klucz wrappujący i odszyfruj master key
    const wrappingKey = await C.deriveKeyFromPrfSecret(prfSecretBytes);
    let masterBytes;
    try {
      masterBytes = await C.decryptBytes(
        wrappingKey,
        entry.encryptedMasterByPasskey.iv,
        entry.encryptedMasterByPasskey.data
      );
    } catch (_) {
      const wv = (entry && typeof entry.wrapVersion === 'number') ? entry.wrapVersion : 1;
      const err = new Error('Nie udało się odblokować konta biometrią.');
      err.code = 'PASSKEY_DECRYPT_FAILED';
      err.wrapVersion = wv;
      err.diagnostic = (wv >= 2) ? 'envelope-current-prf-mismatch' : 'envelope-legacy-create-prf';
      throw err;
    }

    // 4. Załaduj vault — identycznie jak przy logowaniu hasłem
    const regEntry = await getAdapter().getRegistryEntry(userId);
    const label = (regEntry && regEntry.label) || 'Użytkownik';
    await adoptMasterBytes(masterBytes, userId, label);
    await getAdapter().updateRegistryEntry(userId, { lastLoginAtISO: new Date().toISOString() });
  }

  // Pobranie danych z chmury do RAM po zalogowaniu efemerycznym. Odporny na brak
  // VildaSync (np. lekka strona bez modułu) i offline — błąd nie blokuje sesji
  // (użytkownik dostanie pusty RAM zamiast wywalonego logowania).
  async function ephemeralSyncPull() {
    try {
      if (global.VildaSync && typeof global.VildaSync.syncPull === 'function') {
        await global.VildaSync.syncPull();
      }
    } catch (_) { void _; }
  }

  /**
   * Logowanie passkey EFEMERYCZNE — na współdzielonym komputerze, bez śladu lokalnie.
   * Przepływ:
   *   1. setEphemeralMode(true) — adapter in-memory + uszczelnienie warstwy aplikacji.
   *   2. POST /v1/passkey/challenge → challenge.
   *   3. Asercja WebAuthn (PRF) z tym challenge (telefon przez hybrid).
   *   4. POST /v1/passkey/:credentialId/unlock (asercja) → koperta.
   *   5. PRF secret → klucz wrappujący → odszyfruj koperta → masterKeyBytes.
   *   6. adoptMasterBytes → vault odblokowany w RAM (sessionStorage tylko klucz sesji).
   *
   * @param {{ credentialId?: string, signal?: AbortSignal }} [options]
   * @returns {Promise<{ ok: true, ephemeral: true, credentialId, userId }>}
   */
  async function unlockWithPasskeyEphemeral(options) {
    const C = getCrypto();
    const opts = (options && typeof options === 'object') ? options : {};

    // 0. Wymagane wsparcie PRF — inaczej sygnalizuj fallback (QR efemeryczny).
    let prfOk = false;
    try { prfOk = await C.isPrfSupported(); } catch (_) { prfOk = false; }
    if (!prfOk) {
      const err = new Error('Ta przeglądarka nie obsługuje logowania biometrycznego. Użyj logowania QR.');
      err.code = 'EPH_PRF_UNSUPPORTED';
      throw err;
    }

    // 1. Świeży start NOWEJ sesji: usuń resztki veph: po poprzedniej sesji (np. po
    //    awarii bez wylogowania) ZANIM utworzymy adapter — inaczej zhydratowałby
    //    cudze/stare dane. Restore na nawigacji NIE woła purge, więc dane między
    //    podstronami przetrwają (adapter hydratuje świeży stan tej sesji).
    try { if (global.VildaPersistence && global.VildaPersistence.purgeEphemeralData) global.VildaPersistence.purgeEphemeralData(); } catch (_) { void _; }
    // Tryb efemeryczny — adapter in-memory utrwalany do veph:, nic trwałego na dysk.
    setEphemeralMode(true);

    const rpId = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'localhost';
    const workerUrl = ((typeof window !== 'undefined' && window.VILDA_SYNC_WORKER_URL)
      || 'https://vilda-sync.maciej-4b9.workers.dev').replace(/\/$/, '');

    // 2. Challenge z serwera (anti-replay).
    let challengeB64u;
    try {
      const chResp = await fetch(workerUrl + '/v1/passkey/challenge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      });
      if (!chResp.ok) throw new Error('challenge http ' + chResp.status);
      challengeB64u = (await chResp.json()).challenge;
    } catch (e) {
      const err = new Error('Nie udało się nawiązać połączenia z serwerem. Sprawdź internet.');
      err.code = 'EPH_CHALLENGE_FAILED';
      throw err;
    }
    const challengeBytes = C.base64urlToBytes(challengeB64u);

    // 3. Asercja WebAuthn (PRF) z challenge serwera (telefon przez hybrid).
    const asrt = await C.getPasskeyAssertionAndPrf(opts.credentialId || null, rpId, challengeBytes, opts.signal || null);
    if (opts.signal && opts.signal.aborted) {
      const a = new Error('AbortError: passkey authentication aborted'); a.name = 'AbortError'; throw a;
    }

    // 4. Pobierz kopertę (bramka asercją po stronie serwera).
    let koperta;
    try {
      const unlockResp = await fetch(
        workerUrl + '/v1/passkey/' + encodeURIComponent(asrt.credentialId) + '/unlock',
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientDataJSON: asrt.clientDataJSONB64u,
            authenticatorData: asrt.authenticatorDataB64u,
            signature: asrt.signatureB64u
          })
        }
      );
      if (unlockResp.status === 404) {
        const e = new Error('Ten passkey nie jest skonfigurowany do logowania na obcym komputerze.');
        e.code = 'EPH_NO_ENVELOPE'; throw e;
      }
      if (!unlockResp.ok) {
        const e = new Error('Serwer odrzucił logowanie biometryczne (' + unlockResp.status + ').');
        e.code = 'EPH_UNLOCK_REJECTED'; throw e;
      }
      koperta = await unlockResp.json();
    } catch (e) {
      if (e && e.code) throw e;
      const err = new Error('Błąd sieci przy pobieraniu danych logowania.');
      err.code = 'EPH_UNLOCK_NETWORK'; throw err;
    }

    // 5. Odszyfruj master key sekretem PRF.
    const wrappingKey = await C.deriveKeyFromPrfSecret(asrt.prfSecretBytes);
    let masterBytes;
    try {
      const ivBytes = C.base64urlToBytes(koperta.encryptedMasterByPasskey.iv);
      const dataBytes = C.base64urlToBytes(koperta.encryptedMasterByPasskey.data);
      masterBytes = await C.decryptBytes(wrappingKey, ivBytes, dataBytes);
    } catch (e) {
      // Diagnostyka: rozróżnij DWIE przyczyny tego samego objawu.
      //  - wrapVersion < 2 (lub brak): koperta starsza, sprzed poprawki create→get —
      //    mogła zostać owinięta sekretem PRF z create(); rozwiązanie = re-rejestracja.
      //  - wrapVersion >= 2: koperta aktualna (owinięta PRF z get()), więc skoro sekret
      //    PRF z logowania nie pasuje, to niespójność samego authenticatora — typowo
      //    passkey Apple użyty LOKALNIE na Macu daje inny PRF niż przez telefon (hybrid).
      const wv = (koperta && typeof koperta.wrapVersion === 'number') ? koperta.wrapVersion : 1;
      const err = new Error('Nie udało się odszyfrować danych tym passkey.');
      err.code = 'EPH_DECRYPT_FAILED';
      err.wrapVersion = wv;
      err.diagnostic = (wv >= 2) ? 'envelope-current-prf-mismatch' : 'envelope-legacy-create-prf';
      try {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(
            '[Vilda passkey] EPH_DECRYPT_FAILED: wrapVersion=' + wv +
            ' diagnostic=' + err.diagnostic +
            (wv >= 2
              ? ' → koperta AKTUALNA (PRF z get()); sekret PRF z logowania nie pasuje. Prawdopodobna niespójność authenticatora (np. Apple Passwords lokalnie vs telefon). Zaloguj się przez „Użyj telefonu".'
              : ' → koperta STARSZA (sprzed poprawki create→get). Zarejestruj passkey ponownie na zaufanym urządzeniu, potem zaloguj się jeszcze raz.')
          );
        }
      } catch (_) { void _; }
      throw err;
    }

    // 5b. Inicjały (opcja C) — odszyfruj TYM SAMYM kluczem. Na współdzielonym ekranie
    //     pokazujemy tylko inicjały zamiast pełnego nazwiska. Fallback: neutralna etykieta.
    let ephLabel = 'Konto (passkey)';
    try {
      if (koperta.encryptedInitials && koperta.encryptedInitials.iv && koperta.encryptedInitials.data) {
        const iniBytes = await C.decryptBytes(
          wrappingKey,
          C.base64urlToBytes(koperta.encryptedInitials.iv),
          C.base64urlToBytes(koperta.encryptedInitials.data)
        );
        const ini = new TextDecoder().decode(iniBytes).trim();
        if (ini) ephLabel = ini;
      }
    } catch (_) { void _; /* brak/uszkodzone inicjały → etykieta neutralna */ }

    // 6. Adopcja do RAM — bez zapisu meta na dysk (adapter in-memory).
    const userId = 'eph:' + asrt.credentialId.slice(0, 32);
    await adoptMasterBytes(masterBytes, userId, ephLabel);

    // 7. Pobierz dane pacjentów z chmury do RAM. W trybie efemerycznym nic nie ma
    //    lokalnie, a normalny pull po onUnlock jest bramkowany isSyncEnabled (na
    //    współdzielonym komputerze sync nigdy nie był włączony) — więc pull MUSIMY
    //    wymusić tutaj. syncPull działa z samego master key (getSyncMaterial), a
    //    mergeSyncPayload scala tylko pacjentów (nie nadpisuje etykiety/inicjałów).
    await ephemeralSyncPull();

    return { ok: true, ephemeral: true, credentialId: asrt.credentialId, userId: userId };
  }

  /**
   * Fallback QR EFEMERYCZNY — gdy passkey/PRF niedostępne. Adoptuje master key
   * przekazany przez QR-ECDH do vaultu w RAM (bez tworzenia lokalnego konta,
   * w przeciwieństwie do completeQRLogin).
   *
   * @param {string} privateKeyB64u   - klucz prywatny ECDH komputera (z initiateQRLogin)
   * @param {object} encryptedPayload - z pollQRLoginStatus
   * @returns {Promise<{ ok: true, ephemeral: true, userId }>}
   */
  async function completeQRLoginEphemeral(privateKeyB64u, encryptedPayload, accountLabel) {
    const C = getCrypto();
    // Świeży start nowej sesji QR — purge PRZED utworzeniem adaptera (restore nie woła).
    try { if (global.VildaPersistence && global.VildaPersistence.purgeEphemeralData) global.VildaPersistence.purgeEphemeralData(); } catch (_) { void _; }
    setEphemeralMode(true);
    let privateKey;
    try { privateKey = await C.importECDHPrivateKey(privateKeyB64u); }
    catch (e) { const err = new Error('completeQRLoginEphemeral: błąd klucza prywatnego.'); err.code = 'EPH_QR_KEY'; throw err; }
    let masterBytes;
    try { masterBytes = await C.decryptFromTransfer(privateKey, encryptedPayload); }
    catch (e) { const err = new Error('completeQRLoginEphemeral: błąd deszyfrowania transferu.'); err.code = 'EPH_QR_DECRYPT'; throw err; }
    const userId = 'eph-qr:' + Date.now().toString(36);
    // Inicjały z nazwy konta przekazanej w transferze (opcja C — parytet z passkey).
    // Wyświetlamy tylko inicjały, nie pełną nazwę. Fallback: neutralna etykieta.
    const ini = computeInitials(accountLabel);
    const ephLabel = ini ? ini : 'Konto (QR)';
    await adoptMasterBytes(masterBytes, userId, ephLabel);
    // Pobierz dane pacjentów z chmury do RAM (jak w passkey — pull wymuszony).
    await ephemeralSyncPull();
    return { ok: true, ephemeral: true, userId: userId };
  }

  /**
   * Zwraca tablicę zarejestrowanych passkeys dla danego użytkownika.
   * Nie wymaga odblokowanego vaultu.
   *
   * @param {string} userId
   * @returns {Promise<Array<{ credentialId: string, deviceLabel: string, createdAtISO: string }>>}
   */
  async function listPasskeys(userId) {
    const meta = await getAdapter().getUserMeta(userId);
    if (!meta || !Array.isArray(meta.passkeys)) return [];
    return meta.passkeys.map(p => ({
      credentialId: p.credentialId,
      deviceLabel:  p.deviceLabel,
      createdAtISO: p.createdAtISO
    }));
  }

  /**
   * Usuwa passkey z meta-rekordu (nie usuwa go z urządzenia — Web API tego nie umożliwia).
   *
   * @param {string} userId
   * @param {string} credentialId
   */
  async function removePasskey(userId, credentialId) {
    const meta = await getAdapter().getUserMeta(userId);
    if (!meta || !Array.isArray(meta.passkeys)) return;
    const filtered = meta.passkeys.filter(p => p.credentialId !== credentialId);
    await getAdapter().putUserMeta(userId, { ...meta, passkeys: filtered });
  }

  // ============ EKSPORT API ============
  // ============ KOD SYNCHRONIZACJI ============

  /**
   * Generuje przenośny kod synchronizacji zabezpieczony hasłem.
   * Kod pozwala odtworzyć konto na nowym urządzeniu bez pliku .wiw —
   * wystarczy kod + hasło które użytkownik już zna.
   *
   * Wymaga odblokowanego vault i weryfikuje hasło przed eksportem.
   *
   * @param {string} password  — aktualne hasło użytkownika (do weryfikacji + szyfrowania kodu)
   * @returns {Promise<string>} — kod synchronizacji (~140 znaków)
   */
  async function exportSyncCode(password) {
    if (!isUnlocked()) throw new Error('VildaVault.exportSyncCode: vault nie jest odblokowany.');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error('VildaVault.exportSyncCode: nieprawidłowe hasło.');
    }
    const C = getCrypto();
    // Weryfikacja hasła: próbujemy odszyfrować encryptedMasterByPassword
    const meta = await getAdapter().getUserMeta(currentUserId);
    if (!meta) throw new Error('VildaVault.exportSyncCode: brak metadanych użytkownika.');
    const wrappingKey = await C.deriveKey(password, meta.passwordSalt, meta.kdfIterations);
    try {
      await C.decryptBytes(wrappingKey, meta.encryptedMasterByPassword.iv, meta.encryptedMasterByPassword.data);
    } catch (_) {
      throw new Error('VildaVault.exportSyncCode: nieprawidłowe hasło.');
    }
    return C.encryptSyncCode(masterKeyBytes, password);
  }

  /**
   * Odtwarza konto na nowym urządzeniu z kodu synchronizacji + hasła.
   * Tworzy nowy wpis użytkownika w lokalnym IndexedDB z tym samym masterKey —
   * co oznacza ten sam slotId i dostęp do danych na serwerze.
   *
   * Vault musi być zablokowany przed wywołaniem.
   *
   * @param {string} syncCode   — kod "vsc1.salt.iv.cipher"
   * @param {string} password   — hasło którym zaszyfrowano kod
   * @param {object} [options]  — { label?: string }
   * @returns {Promise<{ userId: string, label: string, recoveryKey: string }>}
   */
  async function importSyncCode(syncCode, password, options) {
    if (isUnlocked()) {
      throw new Error('VildaVault.importSyncCode: wyloguj się przed odtwarzaniem kodu synchronizacji.');
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error('VildaVault.importSyncCode: hasło musi mieć minimum ' + MIN_PASSWORD_LENGTH + ' znaków.');
    }
    const C = getCrypto();
    const opts = (options && typeof options === 'object') ? options : {};

    // Odszyfruj masterKeyBytes z kodu synchronizacji
    let masterBytes;
    try {
      masterBytes = await C.decryptSyncCode(syncCode, password);
    } catch (e) {
      throw new Error('VildaVault.importSyncCode: ' + (e.message || 'nieprawidłowy kod lub hasło.'));
    }

    // Utwórz nowy wpis użytkownika na tym urządzeniu z odtworzonym masterKey.
    // Nowy userId jest celowy — zachowujemy izolację między urządzeniami w IndexedDB.
    // Ważny jest masterKey (a przez HKDF — slotId na serwerze), nie lokalny userId.
    const userId = generateUserId();
    const iter = C.KDF_ITERATIONS;
    const passwordSalt = C.generateSalt();
    const recoverySalt = C.generateSalt();
    const recoveryKey  = C.generateRecoveryKey();

    const passwordWrappingKey = await C.deriveKey(password, passwordSalt, iter);
    const recoveryWrappingKey = await C.deriveKeyFromRecoveryKey(recoveryKey, recoverySalt, iter);
    const encryptedByPassword = await C.encryptBytes(passwordWrappingKey, masterBytes);
    const encryptedByRecovery = await C.encryptBytes(recoveryWrappingKey, masterBytes);

    let label = (typeof opts.label === 'string' && opts.label.trim().length) ? opts.label.trim() : '';
    if (!label) {
      const existing = await listUsers();
      label = DEFAULT_LABEL + (existing.length > 0 ? ' ' + (existing.length + 1) : '');
    }

    const nowISO = new Date().toISOString();
    const meta = {
      schemaVersion: SCHEMA_VERSION,
      createdAtISO: nowISO,
      kdfName: C.KDF_NAME,
      kdfHash: C.KDF_HASH,
      kdfIterations: iter,
      passwordSalt: C.bytesToBase64(passwordSalt),
      recoverySalt:  C.bytesToBase64(recoverySalt),
      encryptedMasterByPassword: {
        iv:   C.bytesToBase64(encryptedByPassword.iv),
        data: C.bytesToBase64(encryptedByPassword.data)
      },
      encryptedMasterByRecovery: {
        iv:   C.bytesToBase64(encryptedByRecovery.iv),
        data: C.bytesToBase64(encryptedByRecovery.data)
      },
      restoredFromSyncCode: true
    };

    await getAdapter().putUserMeta(userId, meta);
    await getAdapter().putRegistryEntry({
      userId: userId,
      label: label,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO
    });

    await adoptMasterBytes(masterBytes, userId, label);
    return { userId: userId, label: label, recoveryKey: recoveryKey };
  }

  // ============ QR TRANSFER — LOGOWANIE KODEM QR ============
  //
  // Trzy funkcje obsługujące efemeryczny transfer masterKey między urządzeniami:
  //
  //   initiateQRLogin()               — komputer (nowe urządzenie)
  //   approveQRLogin(token, password) — telefon (zalogowane urządzenie)
  //   completeQRLogin(privateKeyB64u, payload, options) — komputer (finalizacja)
  //
  // Żadna z funkcji nie ujawnia masterKeyBytes poza vaultem.
  // Klucz prywatny ECDH jest serializowany do sessionStorage przez auth_ui —
  // vault zwraca go w formie base64url by UI mogło go zapamiętać.

  var DEFAULT_WORKER_URL_QR = 'https://vilda-sync.maciej-4b9.workers.dev';

  function getWorkerUrlQR() {
    var w = typeof window !== 'undefined' && window.VILDA_SYNC_WORKER_URL;
    return (w || DEFAULT_WORKER_URL_QR).replace(/\/$/, '');
  }

  async function fetchTransfer(path, opts) {
    var url = getWorkerUrlQR() + path;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      return await fetch(url, Object.assign({ signal: controller.signal }, opts));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Inicjuje sesję QR login po stronie komputera (nowego urządzenia).
   * Generuje parę kluczy ECDH, rejestruje token na serwerze.
   * Vault NIE musi być odblokowany — to wywołanie jest przed logowaniem.
   *
   * @returns {Promise<{
   *   qrData:          string,   // "vsc1-qr:{transferToken}" — treść QR kodu
   *   transferToken:   string,   // 43-char base64url — do pollingu
   *   privateKeyB64u:  string,   // PKCS#8 base64url — do zapamiętania w sessionStorage
   *   expiresIn:       number    // sekundy do wygaśnięcia (120)
   * }>}
   */
  async function initiateQRLogin() {
    const C = getCrypto();
    if (!C || typeof C.generateECDHKeypair !== 'function') {
      throw new Error('VildaVault.initiateQRLogin: VildaCrypto nie obsługuje ECDH.');
    }

    // 1. Generuj parę kluczy ECDH P-256
    const { privateKey, publicKeyB64u } = await C.generateECDHKeypair();

    // 2. Zarejestruj token na serwerze
    let resp;
    try {
      resp = await fetchTransfer('/v1/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecdhPublicKeyB64u: publicKeyB64u })
      });
    } catch (e) {
      throw new Error('VildaVault.initiateQRLogin: błąd sieci — ' + (e.message || e));
    }

    if (!resp.ok) {
      const err = await resp.json().catch(function () { return {}; });
      throw new Error('VildaVault.initiateQRLogin: serwer ' + resp.status +
        ' — ' + (err && err.error && err.error.message || 'nieznany błąd'));
    }

    const data = await resp.json();
    const transferToken = data.transferToken;

    // 3. Serializuj klucz prywatny do sessionStorage (przez auth_ui)
    const privateKeyB64u = await C.exportECDHPrivateKey(privateKey);

    return {
      qrData:        'vsc1-qr:' + transferToken,
      transferToken: transferToken,
      privateKeyB64u: privateKeyB64u,
      expiresIn:     data.expiresIn || 120
    };
  }

  /**
   * Odpytuje serwer o status sesji QR.
   * Wywołuje co 1s auth_ui — zwraca null gdy nadal oczekuje, payload gdy ready.
   *
   * @param {string} transferToken
   * @returns {Promise<null | { ephemeralPublicKeyB64u, iv, ciphertext }>}
   */
  async function pollQRLoginStatus(transferToken) {
    let resp;
    try {
      resp = await fetchTransfer('/v1/transfer/' + transferToken, { method: 'GET' });
    } catch (e) {
      return null; // sieć — cicho ignorujemy, spróbujemy za 1s
    }
    if (!resp.ok) return null;
    const data = await resp.json().catch(function () { return null; });
    if (!data) return null;
    if (data.status === 'ready' && data.encryptedPayload) {
      return { encryptedPayload: data.encryptedPayload, label: data.accountLabel || null };
    }
    return null;
  }

  /**
   * Finalizuje QR login po stronie komputera.
   * Odszyfrowuje masterKeyBytes i tworzy nowe lokalne konto.
   * Vault musi być ZABLOKOWANY.
   *
   * @param {string} privateKeyB64u   — z sessionStorage (wynik initiateQRLogin)
   * @param {object} encryptedPayload — { ephemeralPublicKeyB64u, iv, ciphertext }
   * @param {object} [options]        — { label?: string }
   * @returns {Promise<{ userId: string, label: string, recoveryKey: string }>}
   */
  async function completeQRLogin(privateKeyB64u, encryptedPayload, options) {
    if (isUnlocked()) {
      throw new Error('VildaVault.completeQRLogin: vault musi być zablokowany przed importem QR.');
    }
    const C = getCrypto();

    // 1. Odtwórz klucz prywatny z PKCS#8
    let privateKey;
    try {
      privateKey = await C.importECDHPrivateKey(privateKeyB64u);
    } catch (e) {
      throw new Error('VildaVault.completeQRLogin: błąd odczytu klucza prywatnego — ' + (e.message || e));
    }

    // 2. Odszyfruj masterKeyBytes
    let masterBytes;
    try {
      masterBytes = await C.decryptFromTransfer(privateKey, encryptedPayload);
    } catch (e) {
      throw new Error('VildaVault.completeQRLogin: błąd deszyfrowania — ' + (e.message || e));
    }

    // 3. Utwórz nowe lokalne konto z odtworzonym masterKey
    //    (identyczna logika jak importSyncCode — nowy userId, ten sam masterKey → ten sam slotId)
    const opts = (options && typeof options === 'object') ? options : {};
    const userId = generateUserId();
    const iter = C.KDF_ITERATIONS;
    const passwordSalt = C.generateSalt();
    const recoverySalt = C.generateSalt();
    const recoveryKey  = C.generateRecoveryKey();

    // Konto z QR wymaga ustawienia hasła — generujemy tymczasowe silne hasło
    // które użytkownik będzie musiał zmienić po zalogowaniu.
    // ALTERNATYWNIE: auth_ui pyta o nowe hasło przed completeQRLogin.
    // Używamy importSyncCode-style: vault loguje się bez hasła przez adoptMasterBytes.
    // Hasło = 'qr-imported' — placeholder. Użytkownik zmieni je w ustawieniach.
    // Lepsze podejście: auth_ui prosi o nowe hasło PRZED wywołaniem completeQRLogin.
    // Przekazujemy je jako options.newPassword.
    const password = (typeof opts.newPassword === 'string' && opts.newPassword.length >= MIN_PASSWORD_LENGTH)
      ? opts.newPassword
      : null;

    let encryptedByPassword = null;
    let passwordWrappingKey = null;
    if (password) {
      passwordWrappingKey  = await C.deriveKey(password, passwordSalt, iter);
      encryptedByPassword  = await C.encryptBytes(passwordWrappingKey, masterBytes);
    } else {
      // Brak hasła: szyfrujemy masterKey kluczem z losowego hasła (nie do odtworzenia hasłem)
      // Użytkownik MUSI ustawić hasło po zalogowaniu przez resetPasswordWhileUnlocked().
      const randomPw = C.bytesToBase64url(C.generateSalt());
      passwordWrappingKey  = await C.deriveKey(randomPw, passwordSalt, iter);
      encryptedByPassword  = await C.encryptBytes(passwordWrappingKey, masterBytes);
    }

    const recoveryWrappingKey = await C.deriveKeyFromRecoveryKey(recoveryKey, recoverySalt, iter);
    const encryptedByRecovery = await C.encryptBytes(recoveryWrappingKey, masterBytes);

    let label = (typeof opts.label === 'string' && opts.label.trim().length) ? opts.label.trim() : '';
    if (!label) {
      const existing = await listUsers();
      label = DEFAULT_LABEL + (existing.length > 0 ? ' ' + (existing.length + 1) : '');
    }

    const nowISO = new Date().toISOString();
    const meta = {
      schemaVersion: SCHEMA_VERSION,
      createdAtISO: nowISO,
      kdfName: C.KDF_NAME,
      kdfHash: C.KDF_HASH,
      kdfIterations: iter,
      passwordSalt: C.bytesToBase64(passwordSalt),
      recoverySalt:  C.bytesToBase64(recoverySalt),
      encryptedMasterByPassword: {
        iv:   C.bytesToBase64(encryptedByPassword.iv),
        data: C.bytesToBase64(encryptedByPassword.data)
      },
      encryptedMasterByRecovery: {
        iv:   C.bytesToBase64(encryptedByRecovery.iv),
        data: C.bytesToBase64(encryptedByRecovery.data)
      },
      restoredFromQR: true,
      needsPasswordReset: !password
    };

    await getAdapter().putUserMeta(userId, meta);
    await getAdapter().putRegistryEntry({
      userId: userId,
      label: label,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO
    });

    await adoptMasterBytes(masterBytes, userId, label);
    return { userId: userId, label: label, recoveryKey: recoveryKey, needsPasswordReset: !password };
  }

  /**
   * Zatwierdza QR login z poziomu zalogowanego urządzenia (telefon).
   * Szyfruje masterKeyBytes kluczem publicznym komputera i wysyła na serwer.
   * Vault MUSI być odblokowany.
   *
   * @param {string} transferToken  — zeskanowany z QR (po "vsc1-qr:" prefix)
   * @param {string} password       — hasło użytkownika (weryfikacja)
   * @returns {Promise<{ ok: true }>}
   */
  async function approveQRLogin(transferToken, password) {
    if (!isUnlocked() || !masterKeyBytes) {
      throw new Error('VildaVault.approveQRLogin: vault musi być odblokowany.');
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error('VildaVault.approveQRLogin: nieprawidłowe hasło.');
    }

    const C = getCrypto();

    // 1. Weryfikuj hasło (re-derive i sprawdź encryptedMasterByPassword)
    const meta = await getAdapter().getUserMeta(currentUserId);
    if (!meta) throw new Error('VildaVault.approveQRLogin: brak metadanych użytkownika.');
    const wrappingKey = await C.deriveKey(password, meta.passwordSalt, meta.kdfIterations);
    try {
      await C.decryptBytes(wrappingKey, meta.encryptedMasterByPassword.iv, meta.encryptedMasterByPassword.data);
    } catch (_) {
      const e = new Error('VildaVault.approveQRLogin: nieprawidłowe hasło.');
      e.code = 'BAD_PASSWORD';
      throw e;
    }

    // 2. Pobierz klucz publiczny komputera z serwera
    let resp;
    try {
      resp = await fetchTransfer('/v1/transfer/' + transferToken, { method: 'GET' });
    } catch (e) {
      throw new Error('VildaVault.approveQRLogin: błąd sieci — ' + (e.message || e));
    }

    if (resp.status === 404) {
      throw new Error('VildaVault.approveQRLogin: kod QR wygasł lub jest nieprawidłowy.');
    }
    if (!resp.ok) {
      throw new Error('VildaVault.approveQRLogin: błąd serwera ' + resp.status);
    }

    const data = await resp.json();

    if (data.status === 'ready') {
      throw new Error('VildaVault.approveQRLogin: ten kod QR został już wykorzystany.');
    }

    const peerPublicKeyB64u = data.ecdhPublicKeyB64u;
    if (!peerPublicKeyB64u) {
      throw new Error('VildaVault.approveQRLogin: serwer nie zwrócił klucza publicznego.');
    }

    // 3. Zaszyfruj masterKeyBytes kluczem publicznym komputera (ECIES)
    let payload;
    try {
      payload = await C.encryptForTransfer(masterKeyBytes, peerPublicKeyB64u);
    } catch (e) {
      throw new Error('VildaVault.approveQRLogin: błąd szyfrowania — ' + (e.message || e));
    }

    // 4. Wyślij zaszyfrowany payload na serwer
    let putResp;
    try {
      putResp = await fetchTransfer('/v1/transfer/' + transferToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, payload, { accountLabel: currentUserLabel || null }))
      });
    } catch (e) {
      throw new Error('VildaVault.approveQRLogin: błąd sieci przy wysyłaniu — ' + (e.message || e));
    }

    if (putResp.status === 409) {
      throw new Error('VildaVault.approveQRLogin: ten kod QR został już wykorzystany.');
    }
    if (!putResp.ok) {
      const errBody = await putResp.json().catch(function () { return {}; });
      throw new Error('VildaVault.approveQRLogin: serwer ' + putResp.status +
        ' — ' + (errBody && errBody.error && errBody.error.message || 'nieznany błąd'));
    }

    return { ok: true };
  }

  const api = {
    __vildaVault: true,
    VERSION: VERSION,
    STEP: STEP,
    SCHEMA_VERSION: SCHEMA_VERSION,
    REGISTRY_DB_NAME: REGISTRY_DB_NAME,
    USER_DB_PREFIX: USER_DB_PREFIX,
    DEFAULT_IDLE_LOCK_MS: DEFAULT_IDLE_LOCK_MS,
    MIN_PASSWORD_LENGTH: MIN_PASSWORD_LENGTH,
    setStorageAdapter: setStorageAdapter,
    createInMemoryAdapter: createInMemoryAdapter,
    listUsers: listUsers,
    isUnlocked: isUnlocked,
    getCurrentUser: getCurrentUser,
    getStatus: getStatus,
    getLoginThrottleStatus: getLoginThrottleStatus,
    tryRestoreSession: tryRestoreSession,
    createUser: createUser,
    unlockUser: unlockUser,
    unlockUserWithRecoveryKey: unlockUserWithRecoveryKey,
    lock: lock,
    changePassword: changePassword,
    resetPasswordWhileUnlocked: resetPasswordWhileUnlocked,
    regenerateRecoveryKey: regenerateRecoveryKey,
    removeUser: removeUser,
    listPatients: listPatients,
    savePatient: savePatient,
    getPatient: getPatient,
    getLatestSnapshot: getLatestSnapshot,
    removePatient: removePatient,
    getCurrentUserStats: getCurrentUserStats,
    exportPatientEnvelope: exportPatientEnvelope,
    previewPatientEnvelope: previewPatientEnvelope,
    importPatientFromEnvelope: importPatientFromEnvelope,
    exportVaultBackup: exportVaultBackup,
    restoreVaultBackup: restoreVaultBackup,
    importLegacyJsonPatient: importLegacyJsonPatient,
    looksLikeLegacyPayload: looksLikeLegacyPayload,
    shortHashOfPatientId: shortHashOfPatientId,
    onPatientSaved: onPatientSaved,
    onPatientDeleted: onPatientDeleted,
    startIdleTimer: startIdleTimer,
    stopIdleTimer: stopIdleTimer,
    resetIdleTimer: resetIdleTimer,
    onUnlock: onUnlock,
    onLock: onLock,
    // Scalanie vault-backup (z pliku .wiw + hasłem)
    previewVaultBackupMerge: previewVaultBackupMerge,
    mergeVaultBackup: mergeVaultBackup,
    // Kod synchronizacji (cross-device bez .wiw)
    exportSyncCode:    exportSyncCode,
    importSyncCode:    importSyncCode,
    // API Sync — używane przez vilda_sync.js
    getSyncMaterial:   getSyncMaterial,
    exportSyncPayload: exportSyncPayload,
    mergeSyncPayload:  mergeSyncPayload,
    // WebAuthn passkeys
    isPrfSupported: isPrfSupported,
    registerPasskey: registerPasskey,
    registerPasskeyForRoaming: registerPasskeyForRoaming,
    unlockWithPasskey: unlockWithPasskey,
    unlockWithPasskeyEphemeral: unlockWithPasskeyEphemeral,
    completeQRLoginEphemeral: completeQRLoginEphemeral,
    listPasskeys: listPasskeys,
    removePasskey: removePasskey,
    // QR Transfer — logowanie kodem QR
    initiateQRLogin:   initiateQRLogin,
    pollQRLoginStatus: pollQRLoginStatus,
    completeQRLogin:   completeQRLogin,
    approveQRLogin:    approveQRLogin,
    // Tryb efemeryczny (współdzielony komputer) — nic trwałego lokalnie
    setEphemeralMode:  setEphemeralMode,
    isEphemeralMode:   isEphemeralMode,
    setStorageAdapter: setStorageAdapter
  };

  global.VildaVault = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
