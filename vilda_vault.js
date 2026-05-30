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
  // v3: dodane store'y 'notes' + 'noteTombstones' (moduł Notatki — N1). Biblioteka
  //     szablonów lekarza (opisy badań, zalecenia). Per-user, E2EE (treść w noteCipher).
  // Migracja w onupgradeneeded jest addytywna — istniejące store'y (meta/patients/
  // snapshots/tombstones) i ich dane pozostają nietknięte.
  const USER_DB_VERSION = 4;
  const STORE_REGISTRY_USERS = 'users';
  const STORE_META = 'meta';
  const STORE_PATIENTS = 'patients';

  // ============ STORAGE MODE (cloud-only mode) ============
  // Każde konto ma w registry pole `storageMode`. Wartości:
  //   'local'      — domyślnie. Per-user IndexedDB zapisuje się na dysku
  //                  (snapshoty pacjentów, sharedUserData, preferencje modułów).
  //   'cloud-only' — per-user dane trzymane TYLKO w pamięci sesji. Registry
  //                  (meta konta, encrypted master key, passkey credentials)
  //                  pozostaje na dysku — user może się zalogować hasłem ponownie
  //                  z tego komputera. Dane pacjentów pochodzą wyłącznie z chmury
  //                  (force-pull przy unlock). Wymaga aktywnej synchronizacji PRO.
  //                  Use case: lekarz na komputerze w pokoju badań — szybki re-login
  //                  hasłem, zero kopii pacjentów na dysku.
  // Backward-compat: rekordy bez tego pola = 'local' (legacy konta utworzone przed
  // wprowadzeniem flagi).
  const STORAGE_MODE_LOCAL = 'local';
  const STORAGE_MODE_CLOUD_ONLY = 'cloud-only';
  const STORAGE_MODE_VALUES = [STORAGE_MODE_LOCAL, STORAGE_MODE_CLOUD_ONLY];
  function normalizeStorageMode(value) {
    if (typeof value !== 'string') return STORAGE_MODE_LOCAL;
    return STORAGE_MODE_VALUES.indexOf(value) >= 0 ? value : STORAGE_MODE_LOCAL;
  }
  const STORE_SNAPSHOTS = 'snapshots';
  const STORE_TOMBSTONES = 'tombstones';
  // Moduł Notatki (N1) — biblioteka szablonów lekarza. Per-user, treść szyfrowana
  // master keyem (noteCipher). noteTombstones niosą tylko {id, deletedAtISO} (bez treści).
  const STORE_NOTES = 'notes';
  const STORE_NOTE_TOMBSTONES = 'noteTombstones';
  // Moduł Pacjenci — Notatki kliniczne (P1) — notatki PRZYPISANE do konkretnego
  // pacjenta (różnie od STORE_NOTES który jest biblioteką szablonów). Kategorie:
  // followup (z dueDateISO — przypomnienia), observation, treatment, wynik-badania.
  // Treść szyfrowana master keyem (bodyCipher), tombstones jak dla notes.
  // W cloud-only mode routowane do MEMORY (jak pacjenci) — nigdy nie lądują na dysku.
  const STORE_PATIENT_NOTES = 'patientNotes';
  const STORE_PATIENT_NOTE_TOMBSTONES = 'patientNoteTombstones';
  // GC znaczników usunięcia: po tym czasie tombstone jest przycinany (drobny, ale nie
  // może rosnąć w nieskończoność). 90 dni to bezpieczne okno — urządzenie offline
  // dłużej niż to przy ponownej synchronizacji to skrajny przypadek.
  const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  const DEFAULT_IDLE_LOCK_MS = 20 * 60 * 1000;
  // Cloud-only: krótszy domyślny timeout (scenariusz: współdzielony komputer w
  // gabinecie szpitalnym — szybkie auto-locki minimalizują ryzyko, że ktoś inny
  // dorwie się do otwartej sesji). User może dostosować w Ustawieniach.
  const CLOUD_ONLY_IDLE_LOCK_MS = 10 * 60 * 1000;
  // ============ POLITYKA SIŁY HASŁA (Krok 16) ============
  // Min. 12 znaków + co najmniej 3 z 4 typów znaków (małe/duże/cyfry/special)
  // + blacklist 100 najpopularniejszych haseł. NIST SP 800-63B + adaptacja PL.
  // Starsze konta z hasłem niespełniającym tej polityki dostaną flagę
  // needsPasswordReset przy logowaniu (forced password reset flow).
  const MIN_PASSWORD_LENGTH = 12;
  const PASSWORD_REQUIRED_VARIETY_TYPES = 3;  // z 4 (małe/duże/cyfry/special)
  const COMMON_PASSWORDS = new Set([
    // Top globalne (z list breach data)
    '123456', '123456789', '12345', '12345678', '111111', '1234567', '1234567890',
    'qwerty', 'qwerty123', 'qwertyuiop', 'qwerty1234', '1q2w3e4r5t', '1qaz2wsx',
    'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd',
    'admin', 'admin123', 'admin1234', 'administrator',
    'iloveyou', 'iloveyou1', 'letmein', 'welcome', 'welcome1', 'monkey', 'monkey123',
    'dragon', 'dragon123', 'master', 'master123', 'shadow', 'football', 'baseball',
    'superman', 'batman', 'michael', 'jennifer', 'sunshine', 'princess', 'starwars',
    'computer', 'internet', 'whatever', 'zaq12wsx', 'asdfghjkl', 'qazwsxedc',
    '000000', '0000000', '00000000', '000000000', '0000000000',
    '987654321', '111111111', '123123123', '121212121', '101010101', '11111111',
    'abcdefgh', 'abc12345', 'aaaaaaaa', 'aaaaaaaaa',
    // PL — popularne polskie hasła medycznej/personalnej apki
    'polska', 'polska123', 'polska1234', 'polonia123', 'warszawa', 'warszawa1',
    'krakow123', 'gdansk123', 'polska1989',
    'kowalski', 'kowalska', 'nowak', 'nowak123', 'anna1234', 'krystyna',
    'magda1234', 'andrzej', 'andrzej123', 'lekarz', 'lekarz123', 'doktor',
    'doktor123', 'gabinet', 'gabinet123', 'pacjent', 'pacjent123', 'medycyna',
    'medycyna1', 'medyczne1', 'szpital', 'szpital123', 'chirurg',
    'pediatra', 'pediatra1',
    // App-specific (gdyby user był „kreatywny")
    'vilda', 'vilda123', 'vilda1234', 'vildaapp', 'wagaiwzrost', 'wagaiwzrost1',
    // Wzorce na klawiaturze
    'asdfasdf', 'qweqweqwe', 'zxczxczxc', '!@#$%^&*()', 'qweasdzxc12',
    // Daty
    '20002000', '20102010', '20202020', '01011990', '11111990', '01012000',
    // Inne klasyki
    'changeme', 'changeme1', 'login123', 'pass1234', 'pass12345', 'temp1234',
    // „Mocne wyglądające" ale popularne (przeszłyby variety check — to są
    // klasyczne wzorce z leakowanych baz, np. RockYou, HaveIBeenPwned)
    'p@ssw0rd1234', 'p@ssword1234', 'welcome123!@', 'qwerty123!@#',
    'admin12345!', 'admin1234!@', 'monkey1234!@', 'dragon1234!@'
  ]);

  /**
   * Sprawdza czy hasło spełnia politykę siły. Używane przez wszystkie miejsca
   * tworzące/zmieniające hasło: createUser, changePassword, importSyncCode,
   * completeQRLogin, unlockWithPasskeyAndPersist, resetPasswordWhileUnlocked.
   * Dodatkowo unlockUser sprawdza po sukcesie i zwraca needsPasswordReset.
   *
   * @param {string} pw
   * @returns {{ ok: true } | { ok: false, code: string, message: string, hint?: string }}
   */
  function validatePasswordStrength(pw) {
    if (typeof pw !== 'string') {
      return { ok: false, code: 'INVALID', message: 'Hasło musi być tekstem.' };
    }
    if (pw.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        code: 'TOO_SHORT',
        message: 'Hasło musi mieć minimum ' + MIN_PASSWORD_LENGTH + ' znaków.',
        hint: pw.length > 0 ? 'Brakuje ' + (MIN_PASSWORD_LENGTH - pw.length) + ' znaków.' : null
      };
    }
    // Variety check — 3 z 4 typów
    let types = 0;
    const missing = [];
    if (/[a-z]/.test(pw)) types++; else missing.push('małe litery');
    if (/[A-Z]/.test(pw)) types++; else missing.push('wielkie litery');
    if (/[0-9]/.test(pw)) types++; else missing.push('cyfry');
    if (/[^a-zA-Z0-9]/.test(pw)) types++; else missing.push('znaki specjalne');
    if (types < PASSWORD_REQUIRED_VARIETY_TYPES) {
      return {
        ok: false,
        code: 'NO_VARIETY',
        message: 'Hasło musi zawierać co najmniej ' + PASSWORD_REQUIRED_VARIETY_TYPES + ' z 4 typów znaków: małe litery, wielkie litery, cyfry, znaki specjalne.',
        hint: 'Aktualnie ' + types + ' z 4. Dodaj: ' + missing.slice(0, PASSWORD_REQUIRED_VARIETY_TYPES - types).join(' lub ') + '.'
      };
    }
    // Blacklist — case-insensitive
    if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
      return {
        ok: false,
        code: 'BLACKLISTED',
        message: 'To hasło jest zbyt popularne — łatwe do odgadnięcia. Wymyśl coś unikalnego.',
        hint: 'Spróbuj 4 losowych słów połączonych myślnikami, np. „kawa-Drzewo-7-szpital!"'
      };
    }
    return { ok: true };
  }

  // Private helper — rzuca Error z czytelnym komunikatem gdy hasło nie spełnia
  // polityki. Używane przez funkcje TWORZĄCE/ZMIENIAJĄCE hasło. NIE używane
  // przy weryfikacji istniejącego hasła (login, exportSyncCode, approveQRLogin),
  // żeby starsze konta z legacy 8-char hasłami mogły się zalogować i dopiero
  // wtedy zostały zmuszone do zmiany hasła (forced password reset flow).
  function assertStrongPassword(password, contextLabel) {
    const ctx = contextLabel || 'Hasło';
    if (typeof password !== 'string') {
      throw new Error(ctx + ' musi być tekstem.');
    }
    const r = validatePasswordStrength(password);
    if (!r.ok) {
      const err = new Error(ctx + ': ' + r.message + (r.hint ? ' ' + r.hint : ''));
      err.code = r.code;
      err.passwordPolicy = r;
      throw err;
    }
  }

  // ============ GENERATOR SILNEGO HASŁA (Substep 16.3) ============
  // Pool polskich słów (krótkie, łatwe do zapamiętania). Generator składa
  // hasło typu „kawa-Drzewo-7-szpital!" — 3 słowa rozdzielone myślnikami,
  // jedno z wielką literą, dodatkowa cyfra i znak specjalny. ZAWSZE spełnia
  // policy (length, variety, blacklist). Re-generuje jeśli losowo trafi
  // na słabszy wzorzec.
  const GEN_WORD_POOL = [
    'kawa','drzewo','szpital','okno','dom','rower','gora','jablko','laptop','pomidor',
    'klatka','ksiazka','strona','wiosna','noc','dzien','las','pole','klucz','lampa',
    'stol','krzeslo','telefon','obraz','plot','rzeka','morze','chmura','sloce','ksiezyc',
    'gwiazda','ogien','woda','ziemia','wiatr','sniec','deszcz','tecza','most','wieza',
    'pociag','samolot','statek','rower','konj','pies','kotek','ptak','ryba','motyl',
    'kwiat','liscie','trawa','grzyb','jagoda','wisnia','sliwka','gruszka','marchew','cebula',
    'salata','pomelo','banan','ananas','melon','arbuz','agrest','malina','porzeczka','truskawka'
  ];
  const GEN_SPECIAL_CHARS = ['!', '?', '@', '#', '$', '*', '+', '&'];

  // Cryptographically random integer in [0, max). Używa Web Crypto getRandomValues.
  function _randInt(maxExclusive) {
    if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') {
      // Fallback dla starych przeglądarek/Node bez webcrypto — Math.random
      // wystarczy dla generatora hasła (nie używamy do crypto secrets).
      return Math.floor(Math.random() * maxExclusive);
    }
    // Rejection sampling — unika modulo bias.
    const buf = new Uint32Array(1);
    const limit = Math.floor(0xFFFFFFFF / maxExclusive) * maxExclusive;
    do { global.crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % maxExclusive;
  }
  function _pick(arr) { return arr[_randInt(arr.length)]; }
  function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /**
   * Generuje hasło typu „kawa-Drzewo-7-szpital!" — gwarantowanie zgodne
   * z policy (12+ chars, 3+ typy, nie w blacklist). Maksymalnie 10 prób
   * regeneracji (statystycznie wystarczy 1; re-gen tylko jeśli losowo
   * trafimy na coś w blacklist).
   * @returns {string}
   */
  function generateStrongPassword() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const w1 = _pick(GEN_WORD_POOL);
      const w2 = _capitalize(_pick(GEN_WORD_POOL));
      const w3 = _pick(GEN_WORD_POOL);
      const digit = _randInt(10);
      const special = _pick(GEN_SPECIAL_CHARS);
      const candidate = w1 + '-' + w2 + '-' + digit + '-' + w3 + special;
      if (validatePasswordStrength(candidate).ok) return candidate;
    }
    // Fallback — gdyby wszystkie 10 prób były w blacklist (mało prawdopodobne).
    // Rozszerz pierwszy człon o kolejne słowo dla pewności variety + length.
    return _pick(GEN_WORD_POOL) + '-' + _capitalize(_pick(GEN_WORD_POOL))
      + '-' + _randInt(100) + '-' + _pick(GEN_WORD_POOL) + _pick(GEN_SPECIAL_CHARS);
  }
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
  // SIS = Sync Identity Secret (Opcja B, pęczek DEK/SIS). Rotowalny sekret
  // tożsamości synchronizacji, NIEZALEŻNY od materiału szyfrowania danych
  // (którym pozostaje masterKeyBytes = DEK). Dla istniejących kont migracja
  // ustawia SIS = kopia mastera, więc slotId/authToken/syncEncKey pozostają
  // bit-w-bit identyczne (zgodność wsteczna — patrz establishSis()).
  let sisBytes = null;              // Uint8Array gdy unlocked, null gdy locked
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
          // v3 — Notatki (N1). Addytywnie; istniejące store'y nietknięte.
          if (!db.objectStoreNames.contains(STORE_NOTES)) {
            db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_NOTE_TOMBSTONES)) {
            db.createObjectStore(STORE_NOTE_TOMBSTONES, { keyPath: 'id' });
          }
          // v4 — Notatki kliniczne pacjenta (P1). Addytywnie; istniejące
          // store'y nietknięte. Index byPatient pozwala szybko wyciągnąć
          // wszystkie notatki konkretnego pacjenta bez pełnego scanu.
          if (!db.objectStoreNames.contains(STORE_PATIENT_NOTES)) {
            const pn = db.createObjectStore(STORE_PATIENT_NOTES, { keyPath: 'id' });
            pn.createIndex('byPatient', 'patientId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_PATIENT_NOTE_TOMBSTONES)) {
            db.createObjectStore(STORE_PATIENT_NOTE_TOMBSTONES, { keyPath: 'id' });
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
      },
      // --- notatki (moduł Notatki — N1) ---
      async listNotesForUser(userId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_NOTES, 'readonly').objectStore(STORE_NOTES);
        return reqToPromise(store.getAll());
      },
      async getNoteForUser(userId, noteId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_NOTES, 'readonly').objectStore(STORE_NOTES);
        return reqToPromise(store.get(noteId));
      },
      async putNoteForUser(userId, record) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_NOTES, 'readwrite').objectStore(STORE_NOTES);
        await reqToPromise(store.put(record));
        return record;
      },
      async removeNoteForUser(userId, noteId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_NOTES, 'readwrite').objectStore(STORE_NOTES);
        await reqToPromise(store.delete(noteId));
        return true;
      },
      async listNoteTombstonesForUser(userId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_NOTE_TOMBSTONES, 'readonly').objectStore(STORE_NOTE_TOMBSTONES);
        return reqToPromise(store.getAll());
      },
      async putNoteTombstoneForUser(userId, record) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_NOTE_TOMBSTONES, 'readwrite').objectStore(STORE_NOTE_TOMBSTONES);
        const rec = { id: record.id, deletedAtISO: record.deletedAtISO };
        await reqToPromise(store.put(rec));
        return rec;
      },
      async removeNoteTombstoneForUser(userId, noteId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_NOTE_TOMBSTONES, 'readwrite').objectStore(STORE_NOTE_TOMBSTONES);
        await reqToPromise(store.delete(noteId));
        return true;
      },
      // --- notatki kliniczne pacjenta (moduł Pacjenci — P1) ---
      async listPatientNotesForUser(userId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENT_NOTES, 'readonly').objectStore(STORE_PATIENT_NOTES);
        return reqToPromise(store.getAll());
      },
      async getPatientNoteForUser(userId, noteId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENT_NOTES, 'readonly').objectStore(STORE_PATIENT_NOTES);
        return reqToPromise(store.get(noteId));
      },
      async putPatientNoteForUser(userId, record) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENT_NOTES, 'readwrite').objectStore(STORE_PATIENT_NOTES);
        await reqToPromise(store.put(record));
        return record;
      },
      async removePatientNoteForUser(userId, noteId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENT_NOTES, 'readwrite').objectStore(STORE_PATIENT_NOTES);
        await reqToPromise(store.delete(noteId));
        return true;
      },
      async listPatientNoteTombstonesForUser(userId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENT_NOTE_TOMBSTONES, 'readonly').objectStore(STORE_PATIENT_NOTE_TOMBSTONES);
        return reqToPromise(store.getAll());
      },
      async putPatientNoteTombstoneForUser(userId, record) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENT_NOTE_TOMBSTONES, 'readwrite').objectStore(STORE_PATIENT_NOTE_TOMBSTONES);
        const rec = { id: record.id, deletedAtISO: record.deletedAtISO };
        await reqToPromise(store.put(rec));
        return rec;
      },
      async removePatientNoteTombstoneForUser(userId, noteId) {
        const db = await openUser(userId);
        const store = db.transaction(STORE_PATIENT_NOTE_TOMBSTONES, 'readwrite').objectStore(STORE_PATIENT_NOTE_TOMBSTONES);
        await reqToPromise(store.delete(noteId));
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
        userDbs.set(userId, { meta: null, patients: new Map(), snapshots: new Map(), tombstones: new Map(), notes: new Map(), noteTombstones: new Map(), patientNotes: new Map(), patientNoteTombstones: new Map() });
      }
      const db = userDbs.get(userId);
      if (!db.tombstones) db.tombstones = new Map(); // dla wpisów zhydratowanych ze starego stanu
      if (!db.notes) db.notes = new Map();           // Notatki (N1) — wpisy ze starego stanu
      if (!db.noteTombstones) db.noteTombstones = new Map();
      if (!db.patientNotes) db.patientNotes = new Map(); // Notatki kliniczne pacjenta (P1) — ze starego stanu
      if (!db.patientNoteTombstones) db.patientNoteTombstones = new Map();
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
              tombstones: Array.from((db.tombstones || new Map()).entries()),
              notes: Array.from((db.notes || new Map()).entries()),
              noteTombstones: Array.from((db.noteTombstones || new Map()).entries()),
              // P1-fix: patientNotes + patientNoteTombstones MUSZĄ być persistowane
              // do sessionStorage w cloud-only/ephemeral — inaczej znikają po F5.
              patientNotes: Array.from((db.patientNotes || new Map()).entries()),
              patientNoteTombstones: Array.from((db.patientNoteTombstones || new Map()).entries())
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
                tombstones: new Map(d.tombstones || []),
                notes: new Map(d.notes || []),
                noteTombstones: new Map(d.noteTombstones || []),
                // P1-fix: hydratacja patientNotes z sessionStorage.
                patientNotes: new Map(d.patientNotes || []),
                patientNoteTombstones: new Map(d.patientNoteTombstones || [])
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
      // --- notatki (moduł Notatki — N1) ---
      async listNotesForUser(userId) {
        if (!userDbs.has(userId)) return [];
        const db = userDbs.get(userId);
        if (!db.notes) return [];
        return Array.from(db.notes.values()).map(function (r) { return Object.assign({}, r); });
      },
      async getNoteForUser(userId, noteId) {
        if (!userDbs.has(userId)) return undefined;
        const db = userDbs.get(userId);
        if (!db.notes) return undefined;
        const n = db.notes.get(noteId);
        return n ? Object.assign({}, n) : undefined;
      },
      async putNoteForUser(userId, record) {
        const db = ensureUserDb(userId);
        db.notes.set(record.id, Object.assign({}, record));
        persistNow();
        return record;
      },
      async removeNoteForUser(userId, noteId) {
        if (!userDbs.has(userId)) return true;
        const db = userDbs.get(userId);
        if (db.notes) db.notes.delete(noteId);
        persistNow();
        return true;
      },
      async listNoteTombstonesForUser(userId) {
        if (!userDbs.has(userId)) return [];
        const db = userDbs.get(userId);
        if (!db.noteTombstones) return [];
        return Array.from(db.noteTombstones.values()).map(function (r) { return Object.assign({}, r); });
      },
      async putNoteTombstoneForUser(userId, record) {
        const db = ensureUserDb(userId);
        const rec = { id: record.id, deletedAtISO: record.deletedAtISO };
        db.noteTombstones.set(rec.id, rec);
        persistNow();
        return rec;
      },
      async removeNoteTombstoneForUser(userId, noteId) {
        if (!userDbs.has(userId)) return true;
        const db = userDbs.get(userId);
        if (db.noteTombstones) db.noteTombstones.delete(noteId);
        persistNow();
        return true;
      },
      // --- notatki kliniczne pacjenta (moduł Pacjenci — P1) ---
      async listPatientNotesForUser(userId) {
        if (!userDbs.has(userId)) return [];
        const db = userDbs.get(userId);
        if (!db.patientNotes) return [];
        return Array.from(db.patientNotes.values()).map(function (r) { return Object.assign({}, r); });
      },
      async getPatientNoteForUser(userId, noteId) {
        if (!userDbs.has(userId)) return undefined;
        const db = userDbs.get(userId);
        if (!db.patientNotes) return undefined;
        const n = db.patientNotes.get(noteId);
        return n ? Object.assign({}, n) : undefined;
      },
      async putPatientNoteForUser(userId, record) {
        const db = ensureUserDb(userId);
        db.patientNotes.set(record.id, Object.assign({}, record));
        persistNow();
        return record;
      },
      async removePatientNoteForUser(userId, noteId) {
        if (!userDbs.has(userId)) return true;
        const db = userDbs.get(userId);
        if (db.patientNotes) db.patientNotes.delete(noteId);
        persistNow();
        return true;
      },
      async listPatientNoteTombstonesForUser(userId) {
        if (!userDbs.has(userId)) return [];
        const db = userDbs.get(userId);
        if (!db.patientNoteTombstones) return [];
        return Array.from(db.patientNoteTombstones.values()).map(function (r) { return Object.assign({}, r); });
      },
      async putPatientNoteTombstoneForUser(userId, record) {
        const db = ensureUserDb(userId);
        const rec = { id: record.id, deletedAtISO: record.deletedAtISO };
        db.patientNoteTombstones.set(rec.id, rec);
        persistNow();
        return rec;
      },
      async removePatientNoteTombstoneForUser(userId, noteId) {
        if (!userDbs.has(userId)) return true;
        const db = userDbs.get(userId);
        if (db.patientNoteTombstones) db.patientNoteTombstones.delete(noteId);
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

  // ── Hybrid adapter: rejestr+meta na dysk, per-user w pamięci ─────────────
  // Używany w trybie cloud-only: konto pamiętane lokalnie (encrypted master key
  // w IDB → możliwy ponowny login hasłem), ale dane pacjentów (snapshoty,
  // tombstones) trzymane TYLKO w pamięci sesji (z persystencją do sessionStorage
  // pod `veph:` → przeżywa nawigację między podstronami, ginie z kartą).
  // Per-user dane pochodzą z chmury — force-pull przy unlock napełnia pamięć.
  function createHybridAdapter(realAdapter, memoryAdapter) {
    return {
      // ── Registry: trwały (IDB) — żeby user mógł zalogować się hasłem ponownie
      listRegistry:        function () { return realAdapter.listRegistry(); },
      getRegistryEntry:    function (uid) { return realAdapter.getRegistryEntry(uid); },
      putRegistryEntry:    function (rec) { return realAdapter.putRegistryEntry(rec); },
      updateRegistryEntry: function (uid, p) { return realAdapter.updateRegistryEntry(uid, p); },
      removeRegistryEntry: function (uid) { return realAdapter.removeRegistryEntry(uid); },
      // ── User meta: trwały (IDB) — zawiera encrypted master key wymagany do password unlock
      getUserMeta:         function (uid) { return realAdapter.getUserMeta(uid); },
      putUserMeta:         function (uid, rec) { return realAdapter.putUserMeta(uid, rec); },
      deleteUserDatabase:  function (uid) { return realAdapter.deleteUserDatabase(uid); },
      // ── Per-user dane: pamięć + sessionStorage (veph:) — chmura jest źródłem prawdy
      listPatientsForUser:    function (uid) { return memoryAdapter.listPatientsForUser(uid); },
      getPatientForUser:      function (uid, pid) { return memoryAdapter.getPatientForUser(uid, pid); },
      putPatientForUser:      function (uid, rec) { return memoryAdapter.putPatientForUser(uid, rec); },
      removePatientForUser:   function (uid, pid) { return memoryAdapter.removePatientForUser(uid, pid); },
      listSnapshotsForUser:   function (uid, pid) { return memoryAdapter.listSnapshotsForUser(uid, pid); },
      putSnapshotForUser:     function (uid, rec) { return memoryAdapter.putSnapshotForUser(uid, rec); },
      removeSnapshotForUser:  function (uid, sid) { return memoryAdapter.removeSnapshotForUser(uid, sid); },
      listTombstonesForUser:  function (uid) { return memoryAdapter.listTombstonesForUser(uid); },
      putTombstoneForUser:    function (uid, rec) { return memoryAdapter.putTombstoneForUser(uid, rec); },
      removeTombstoneForUser: function (uid, pid) { return memoryAdapter.removeTombstoneForUser(uid, pid); },
      // ── Notatki (N8): per-user → dysk (real). Notatki to dane KONTA lekarza
      // (biblioteka szablonów), nie dane pacjentów. W trybie cloud-only zachowują
      // się tak samo jak userPreferences w userMeta — szyfrowane master keyem,
      // cache'owane lokalnie w IndexedDB, dostępne offline i natychmiast po
      // ponownym logowaniu. INVARIANT cloud-only pozostaje nienaruszony dla
      // DANYCH PACJENTÓW (patients/snapshots/tombstones pacjentów dalej idą do
      // memoryAdapter — nigdy na dysk).
      listNotesForUser:          function (uid) { return realAdapter.listNotesForUser(uid); },
      getNoteForUser:            function (uid, nid) { return realAdapter.getNoteForUser(uid, nid); },
      putNoteForUser:            function (uid, rec) { return realAdapter.putNoteForUser(uid, rec); },
      removeNoteForUser:         function (uid, nid) { return realAdapter.removeNoteForUser(uid, nid); },
      listNoteTombstonesForUser: function (uid) { return realAdapter.listNoteTombstonesForUser(uid); },
      putNoteTombstoneForUser:   function (uid, rec) { return realAdapter.putNoteTombstoneForUser(uid, rec); },
      removeNoteTombstoneForUser:function (uid, nid) { return realAdapter.removeNoteTombstoneForUser(uid, nid); },
      // ── Notatki kliniczne pacjenta (P1): per-user → pamięć (jak pacjenci).
      // KLUCZOWE dla cloud-only — to są dane PACJENTÓW (kliniczne adnotacje
      // lekarza powiązane z konkretnym pacjentem), nie biblioteka szablonów konta.
      // Inwariant prywatności: jak patientsForUser, snapshotsForUser i tombstones
      // pacjentów — wszystko TYLKO w pamięci, NIGDY na dysku w cloud-only mode.
      listPatientNotesForUser:          function (uid) { return memoryAdapter.listPatientNotesForUser(uid); },
      getPatientNoteForUser:            function (uid, nid) { return memoryAdapter.getPatientNoteForUser(uid, nid); },
      putPatientNoteForUser:            function (uid, rec) { return memoryAdapter.putPatientNoteForUser(uid, rec); },
      removePatientNoteForUser:         function (uid, nid) { return memoryAdapter.removePatientNoteForUser(uid, nid); },
      listPatientNoteTombstonesForUser: function (uid) { return memoryAdapter.listPatientNoteTombstonesForUser(uid); },
      putPatientNoteTombstoneForUser:   function (uid, rec) { return memoryAdapter.putPatientNoteTombstoneForUser(uid, rec); },
      removePatientNoteTombstoneForUser:function (uid, nid) { return memoryAdapter.removePatientNoteTombstoneForUser(uid, nid); },
      // Debug / introspekcja
      _peek: function () {
        return { mode: 'hybrid', realPeek: realAdapter._peek && realAdapter._peek(), memoryPeek: memoryAdapter._peek && memoryAdapter._peek() };
      },
      __vildaHybridAdapter: true
    };
  }

  // ── Cloud-only mode lifecycle ────────────────────────────────────────────
  // Stała persistKey dla in-memory adaptera per-user — analogicznie do
  // EPHEMERAL_ADAPTER_KEY w trybie efemerycznym, ale rozróżniona, bo
  // współistnieje z trwałym registry.
  const CLOUD_ONLY_ADAPTER_KEY = 'veph:cloud-only:per-user-v1';
  // Marker w sessionStorage — przeżywa nawigację między podstronami i sygnalizuje
  // VildaPersistence (autodetect na innej podstronie) że jesteśmy w trybie cloud-only.
  // Bez tego markera persistencja na lekkich podstronach pisałaby do localStorage
  // zanim vault zdąży zainicjalizować swój storageMode (race condition).
  const CLOUD_ONLY_MARKER_KEY = 'vilda-cloud-only-session-v1';
  let _cloudOnlyAdapterActive = false;
  // Stan registry-adaptera SPRZED założenia hybrydy — żeby przy lock przywrócić
  // dokładnie ten sam adapter (a nie pozwolić getAdapter() utworzyć nowy).
  let _cloudOnlySavedRealAdapter = null;

  function applyCloudOnlyAdapterIfNeeded() {
    // Niezależne od ephemeral mode — gdy oba aktywne, ephemeral wygrywa (wszystko
    // w pamięci, bez trwałości). Cloud-only włącza się tylko gdy ephemeral OFF.
    if (_ephemeralMode) return false;
    if (_currentStorageModeCache !== STORAGE_MODE_CLOUD_ONLY) {
      // Konto nie cloud-only — upewnij się że hybrid jest wyłączony
      if (_cloudOnlyAdapterActive) tearDownCloudOnlyAdapter();
      return false;
    }
    if (_cloudOnlyAdapterActive) return true; // już aktywny
    // Zapamiętaj realny adapter (lub utwórz domyślny jeśli storageAdapter pusty)
    const real = storageAdapter || getAdapter();
    _cloudOnlySavedRealAdapter = real;
    const memory = createInMemoryAdapter({ persistKey: CLOUD_ONLY_ADAPTER_KEY });
    setStorageAdapter(createHybridAdapter(real, memory));
    _cloudOnlyAdapterActive = true;
    // Marker dla persistencji — analogicznie do EPHEMERAL_MARKER_KEY. Pozwala
    // VildaPersistence wykryć tryb cloud-only na każdej kolejnej podstronie
    // zanim vault zostanie zainicjalizowany.
    try { if (global.sessionStorage) global.sessionStorage.setItem(CLOUD_ONLY_MARKER_KEY, '1'); } catch (_) {}
    // Skoordynuj VildaPersistence — sharedUserData, sesje modułów i preferencje
    // mają iść do sessionStorage (veph:), nie localStorage. To realizuje D2:
    // "preferencje modułów → chmura via sharedUserData sync" (sync wciąga z chmury,
    // RAM trzyma w trakcie sesji, nic nie zostaje na dysku).
    try {
      if (global.VildaPersistence && typeof global.VildaPersistence.setCloudOnlyMode === 'function') {
        global.VildaPersistence.setCloudOnlyMode(true);
      }
    } catch (_) {}
    return true;
  }

  function tearDownCloudOnlyAdapter() {
    if (!_cloudOnlyAdapterActive) return;
    // Przywróć IDB adapter sprzed założenia hybrydy. Jeśli go nie mamy
    // (niespodziewany stan), kasujemy storageAdapter — getAdapter() utworzy nowy.
    if (_cloudOnlySavedRealAdapter) setStorageAdapter(_cloudOnlySavedRealAdapter);
    else setStorageAdapter(null);
    _cloudOnlySavedRealAdapter = null;
    _cloudOnlyAdapterActive = false;
    // Skoordynuj VildaPersistence — wyłącz tryb cloud-only i wymuś purge veph:*
    // (jeśli ephemeral też nieaktywny). Bez tego sharedUserData następnego usera
    // w tej samej karcie byłby zhydratowany ze starego stanu cloud-only.
    try {
      if (global.VildaPersistence && typeof global.VildaPersistence.setCloudOnlyMode === 'function') {
        global.VildaPersistence.setCloudOnlyMode(false);
      }
    } catch (_) {}
    // Marker + adapter persistKey w sessionStorage — wyczyść jawnie, żeby nowa
    // sesja na tej karcie zaczynała czysto.
    try {
      if (global.sessionStorage) {
        global.sessionStorage.removeItem(CLOUD_ONLY_ADAPTER_KEY);
        global.sessionStorage.removeItem(CLOUD_ONLY_MARKER_KEY);
      }
    } catch (_) {}
  }
  function isCloudOnlyAdapterActive() { return _cloudOnlyAdapterActive; }

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

  // ============ SIS (Sync Identity Secret) — Opcja B, pęczek DEK/SIS ============
  // Ustanawia `sisBytes` po odblokowaniu. Trzy ścieżki:
  //   • meta ma poprawne `encryptedSisByMaster` → odszyfruj masterKeyem (SIS już istnieje),
  //   • meta BEZ tego pola (stare konto) lub pole uszkodzone → MIGRACJA: SIS = kopia
  //     mastera, zapakuj masterKeyem i zapisz w meta (slotId/authToken/syncEncKey
  //     pozostają IDENTYCZNE, bo deriveSyncMaterialFromBundle({dek:master,sis:master})
  //     == deriveSyncMaterial(master) — udowodnione w key_bundle_crypto_smoke),
  //   • brak meta / tryb efemeryczny → SIS = kopia mastera tylko w pamięci, bez zapisu.
  // Best-effort: jakikolwiek błąd zostawia sisBytes=null, a getSyncMaterial i tak
  // użyje masterKeyBytes jako SIS (zachowanie identyczne ze stanem sprzed migracji).
  async function establishSis(opts) {
    const ephemeral = !!(opts && opts.ephemeral) || _ephemeralMode;
    if (!masterKey || !masterKeyBytes) { sisBytes = null; return; }
    try {
      const C = getCrypto();
      // Tryb efemeryczny lub brak userId → nie dotykamy adaptera, SIS = master w pamięci.
      if (ephemeral || !currentUserId) {
        sisBytes = new Uint8Array(masterKeyBytes);
        return;
      }
      const meta = await getAdapter().getUserMeta(currentUserId);
      if (!meta) {
        // Brak meta (np. konto efemeryczne bez persystencji) — SIS = master, bez zapisu.
        sisBytes = new Uint8Array(masterKeyBytes);
        return;
      }
      const field = meta.encryptedSisByMaster;
      if (field && typeof field.iv === 'string' && typeof field.data === 'string') {
        try {
          const dec = await C.decryptBytes(masterKey, field.iv, field.data);
          const arr = new Uint8Array(dec);
          if (arr.length === masterKeyBytes.length) {
            sisBytes = arr;
            return;
          }
          // Zła długość → traktuj jak uszkodzone, migruj ponownie.
        } catch (_) { /* uszkodzone pole → migracja poniżej */ }
      }
      // MIGRACJA: SIS = kopia mastera (zgodność wsteczna), zapakuj masterKeyem, zapisz.
      const fresh = new Uint8Array(masterKeyBytes);
      const wrapped = await C.encryptBytes(masterKey, fresh);
      meta.encryptedSisByMaster = {
        iv: C.bytesToBase64(wrapped.iv),
        data: C.bytesToBase64(wrapped.data)
      };
      if (typeof meta.bundleSchemaVersion !== 'number') meta.bundleSchemaVersion = 1;
      await getAdapter().putUserMeta(currentUserId, meta);
      sisBytes = fresh;
    } catch (_) {
      // Best-effort: zostaw sisBytes=null; getSyncMaterial użyje mastera jako SIS.
      sisBytes = null;
    }
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
      // Przywróć storageMode z registry — cache jest w RAM, więc po nawigacji
      // między podstronami resetuje się do 'local'. Bez tego refreshCloudOnlyBadge
      // i isCloudOnlyMode() zwracają false na każdej nowej stronie. To MUSI być
      // PRZED establishSis (operacje per-user) i PRZED notifyUnlock (żeby
      // listenery onUnlock widziały prawidłowy storageMode od razu).
      try { _currentStorageModeCache = await getStorageMode(blob.userId); }
      catch (_) { _currentStorageModeCache = STORAGE_MODE_LOCAL; }
      // Cloud-only: w nowym kontekście strony adapter hybrid jest nieaktywny,
      // mimo że sessionStorage marker może istnieć. Wymuś re-założenie adaptera.
      // Idempotent — gdy mode='local', nic nie robi.
      applyCloudOnlyAdapterIfNeeded();
      await establishSis({ ephemeral: ephemeral });
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
    assertStrongPassword(password, 'Hasło');
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

    // storageMode — patrz blok STORAGE MODE u góry pliku. Pobrane z options
    // (kreator konta przekazuje wybór usera). Domyślnie 'local'.
    const storageMode = normalizeStorageMode(opts.storageMode);
    await getAdapter().putUserMeta(userId, meta);
    await getAdapter().putRegistryEntry({
      userId: userId,
      label: label,
      storageMode: storageMode,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO,
      // passkeyCount: liczba zarejestrowanych passkeys (Touch ID/Face ID/Windows Hello).
      // Updatowany przez _syncPasskeyCount() w registerPasskey/registerPasskeyForRoaming/removePasskey.
      // Używany przez user-picker w UI do pokazania badge'a „🔐 Touch ID" przy kontach z biometrią.
      // Nie wpływa na flow auth — to tylko hint widoczności dla usera.
      passkeyCount: 0
    });

    masterKey = await C.importMasterKeyFromBytes(masterBytes);
    masterKeyBytes = new Uint8Array(masterBytes);
    currentUserId = userId;
    currentUserLabel = label;
    lockReason = null;
    // createUser nie idzie przez adoptMasterBytes (ma własną ścieżkę), więc cache
    // storageMode trzeba ustawić ręcznie — wartość znana z registry właśnie zapisanego.
    _currentStorageModeCache = storageMode;
    // Cloud-only: zakładamy hybrid adapter przed establishSis() — analogicznie do
    // adoptMasterBytes. Registry+meta już zapisane do IDB (linie wyżej, przed cache),
    // od tej pory operacje per-user idą do pamięci.
    applyCloudOnlyAdapterIfNeeded();
    zeroBytes(masterBytes);
    await establishSis();
    persistSession();
    notifyUnlock();

    return {
      userId: userId,
      label: label,
      recoveryKey: recoveryKey,
      iterations: iter,
      storageMode: storageMode
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
    // Cache storageMode aktualnego usera — używane przez synchroniczne gorące
    // ścieżki (file-export guard, sync routing). Defensywny fallback do 'local'.
    try { _currentStorageModeCache = await getStorageMode(userId); }
    catch (_) { _currentStorageModeCache = STORAGE_MODE_LOCAL; }
    // Cloud-only: zakładamy hybrid adapter (registry+meta → IDB, per-user → memory)
    // PRZED establishSis(), żeby SIS i kolejne operacje per-user szły do pamięci.
    applyCloudOnlyAdapterIfNeeded();
    await establishSis();
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
    // Krok 16.4 — flagowanie słabych haseł.
    // Sprawdzamy czy hasło którym właśnie się zalogowano spełnia AKTUALNĄ politykę
    // (12+ chars, 3+ typy, no blacklist). Stare konta z 8-char hasłami otrzymują
    // needsPasswordReset:true → auth_ui wymusi zmianę hasła przed wejściem.
    const policy = validatePasswordStrength(password);
    return {
      userId: userId,
      label: label,
      needsPasswordReset: !policy.ok,
      passwordPolicy: policy.ok ? null : policy
    };
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
    if (sisBytes) { zeroBytes(sisBytes); sisBytes = null; }
    masterKey = null;
    currentUserId = null;
    currentUserLabel = null;
    lockReason = reason || 'manual';
    // Reset cache storageMode — sync gettery zwracają 'local' gdy brak sesji.
    _currentStorageModeCache = STORAGE_MODE_LOCAL;
    stopIdleTimer();
    clearPersistedSession();
    // Wyjście z trybu efemerycznego — usuwa marker, resetuje adapter do IndexedDB,
    // odznacza warstwę aplikacji. Po zablokowaniu nie zostaje nic z sesji efemerycznej.
    try { if (_ephemeralMode) setEphemeralMode(false); } catch (_) {}
    // Wyjście z trybu cloud-only — przywróć oryginalny IDB adapter i wyczyść
    // veph:cloud-only:* w sessionStorage (pacjenci w pamięci znikają z RAM-u).
    try { tearDownCloudOnlyAdapter(); } catch (_) {}
    notifyLock(lockReason);
  }

  // ============ ZMIANA HASŁA / RESET / REGEN RECOVERY ============
  async function changePassword(oldPassword, newPassword) {
    if (!isUnlocked()) {
      throw new Error('Zaloguj się, aby zmienić hasło.');
    }
    assertStrongPassword(newPassword, 'Nowe hasło');
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
    assertStrongPassword(newPassword, 'Nowe hasło');
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

  // ============ ROTACJA TOŻSAMOŚCI SYNCHRONIZACJI (Opcja B, Faza 4) ============
  /**
   * Rotuje tożsamość synchronizacji ("wyloguj wszystkie urządzenia" — część
   * LOKALNA). Generuje NOWY SIS i regeneruje klucz odzyskiwania. DEK (= master,
   * materiał szyfrowania danych) pozostaje BEZ ZMIAN, więc:
   *   • dane lokalne i blob na serwerze NIE wymagają ponownego szyfrowania
   *     (syncEncKey wyprowadzany z DEK jest stały),
   *   • zmienia się slotId/authToken (z nowego SIS) → po skasowaniu starego slotu
   *     przez koordynatora (VildaSync) inne urządzenia tracą dostęp do sync.
   *
   * Regeneracja klucza odzyskiwania to decyzja produktowa: rewokacja unieważnia
   * także stary klucz odzyskiwania. Hasło pozostaje BEZ ZMIAN (user loguje się dalej
   * tym samym hasłem). Wymaga hasła jako bramki. NIE dotyka serwera.
   *
   * @param {string} password
   * @returns {Promise<{ recoveryKey: string }>}  — NOWY klucz odzyskiwania
   */
  async function rotateSyncIdentity(password) {
    if (!isUnlocked() || !masterKeyBytes || !masterKey) {
      throw new Error('VildaVault.rotateSyncIdentity: vault nie jest odblokowany.');
    }
    const C = getCrypto();
    const meta = await getAdapter().getUserMeta(currentUserId);
    if (!meta) throw new Error('VildaVault.rotateSyncIdentity: brak metadanych użytkownika.');
    // Bramka bezpieczeństwa: weryfikacja hasła.
    const pwKey = await C.deriveKey(password, meta.passwordSalt, meta.kdfIterations);
    try {
      await C.decryptBytes(pwKey, meta.encryptedMasterByPassword.iv, meta.encryptedMasterByPassword.data);
    } catch (_) {
      throw new Error('VildaVault.rotateSyncIdentity: nieprawidłowe hasło.');
    }

    // Nowy SIS, opakowany masterKeyem (jak w establishSis).
    const newSis = C.generateMasterKeyBytes();
    const wrappedSis = await C.encryptBytes(masterKey, newSis);

    // Nowy klucz odzyskiwania (unieważnia stary).
    const newRecoveryKey = C.generateRecoveryKey();
    const newRecoverySalt = C.generateSalt();
    const recWrappingKey = await C.deriveKeyFromRecoveryKey(newRecoveryKey, newRecoverySalt, meta.kdfIterations);
    const newRecEnc = await C.encryptBytes(recWrappingKey, masterKeyBytes);

    const updated = Object.assign({}, meta, {
      encryptedSisByMaster: {
        iv: C.bytesToBase64(wrappedSis.iv),
        data: C.bytesToBase64(wrappedSis.data)
      },
      bundleSchemaVersion: 1,
      recoverySalt: C.bytesToBase64(newRecoverySalt),
      encryptedMasterByRecovery: {
        iv: C.bytesToBase64(newRecEnc.iv),
        data: C.bytesToBase64(newRecEnc.data)
      }
    });
    await getAdapter().putUserMeta(currentUserId, updated);

    // Przełącz SIS w pamięci (zeruj stary).
    if (sisBytes) zeroBytes(sisBytes);
    sisBytes = newSis;

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

  // ============ MODUŁ NOTATKI (N1) — biblioteka szablonów lekarza ============
  // Per-user kolekcja notatek (opisy badań, zalecenia, wywiad, własne). Treść
  // szyfrowana master keyem (noteCipher). Metadane (id, timestamps) plaintext —
  // potrzebne do LWW merge w sync (N2). W cloud-only notatki są routowane do
  // pamięci (hybrid adapter) → nic na dysku, chmura jest źródłem prawdy.
  //
  // Rekord na dysku/w pamięci:
  //   { id, noteCipher: {iv, data}, createdAtISO, updatedAtISO }
  // Odszyfrowana treść (w noteCipher):
  //   { title, category, body, pinned, order }
  const NOTE_CATEGORIES = ['badanie', 'zalecenia', 'wywiad', 'wlasne'];
  const NOTE_CATEGORY_DEFAULT = 'wlasne';

  function normalizeNoteCategory(value) {
    if (typeof value !== 'string') return NOTE_CATEGORY_DEFAULT;
    const v = value.trim();
    return NOTE_CATEGORIES.indexOf(v) >= 0 ? v : NOTE_CATEGORY_DEFAULT;
  }

  // Sanityzacja tekstu notatki — czysty tekst bez znaków psujących wklejanie
  // do zewnętrznych systemów (P1, gabinet.gov.pl). Usuwamy/normalizujemy:
  //   • twarde spacje (NBSP U+00A0, NNBSP U+202F) → zwykła spacja
  //   • inne spacje unicode (U+2000-U+200A, U+205F, U+3000) → zwykła spacja
  //   • zero-width chars (U+200B-U+200D, U+2060, U+FEFF BOM) → usuń
  //   • CRLF/CR → LF (jednolite końce linii)
  //   • znaki kontrolne C0 oprócz \n i \t → usuń
  function sanitizeNoteText(str) {
    if (typeof str !== 'string') return '';
    var s = str;
    s = s.replace(/\r\n?/g, '\n');                          // CRLF/CR → LF
    s = s.replace(/[\u00A0\u202F]/g, ' ');                   // NBSP / NNBSP → spacja
    s = s.replace(/[\u2000-\u200A\u205F\u3000]/g, ' ');    // pozostałe spacje unicode
    s = s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');     // zero-width / BOM
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // C0 oprócz \t \n
    return s;
  }

  async function _decryptNoteRecord(rec) {
    let content = { title: '', category: NOTE_CATEGORY_DEFAULT, body: '', pinned: false, order: 0 };
    try {
      const dec = await decryptPayloadForCurrentUser(rec.noteCipher.iv, rec.noteCipher.data);
      if (dec && typeof dec === 'object') content = dec;
    } catch (_) {
      content = { title: '(błąd odczytu)', category: NOTE_CATEGORY_DEFAULT, body: '', pinned: false, order: 0 };
    }
    return {
      id: rec.id,
      title: typeof content.title === 'string' ? content.title : '',
      category: normalizeNoteCategory(content.category),
      body: typeof content.body === 'string' ? content.body : '',
      pinned: content.pinned === true,
      order: Number.isFinite(content.order) ? content.order : 0,
      createdAtISO: rec.createdAtISO || null,
      updatedAtISO: rec.updatedAtISO || null
    };
  }

  async function listNotes() {
    if (!isUnlocked()) throw new Error('Zaloguj się, by wyświetlić notatki.');
    const records = await getAdapter().listNotesForUser(currentUserId);
    const out = [];
    for (let i = 0; i < records.length; i += 1) {
      out.push(await _decryptNoteRecord(records[i]));
    }
    // Sortowanie: przypięte na górze, potem malejąco po updatedAtISO; remis → order.
    out.sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aT = a.updatedAtISO || a.createdAtISO || '';
      const bT = b.updatedAtISO || b.createdAtISO || '';
      if (bT > aT) return 1;
      if (bT < aT) return -1;
      return (a.order || 0) - (b.order || 0);
    });
    return out;
  }

  async function getNote(noteId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by pobrać notatkę.');
    const rec = await getAdapter().getNoteForUser(currentUserId, noteId);
    if (!rec) return null;
    return _decryptNoteRecord(rec);
  }

  // saveNote(payload, options)
  //   payload: { id?, title, category, body, pinned?, order? }
  //   options: { } (rezerwa na przyszłość)
  // Zwraca: { id, isNew, updatedAtISO }
  async function saveNote(payload, options) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by zapisać notatkę.');
    if (!payload || typeof payload !== 'object') throw new Error('saveNote: brak payloadu.');
    void options;

    const title = sanitizeNoteText(typeof payload.title === 'string' ? payload.title : '').trim();
    const body = sanitizeNoteText(typeof payload.body === 'string' ? payload.body : '');
    if (!title && !body) throw new Error('saveNote: notatka musi mieć tytuł lub treść.');

    const category = normalizeNoteCategory(payload.category);
    const pinned = payload.pinned === true;
    const order = Number.isFinite(payload.order) ? payload.order : 0;

    let noteId = (typeof payload.id === 'string' && payload.id) ? payload.id : null;
    let isNew = false;
    let createdAtISO = null;
    if (noteId) {
      const existing = await getAdapter().getNoteForUser(currentUserId, noteId);
      if (existing) createdAtISO = existing.createdAtISO || null;
      else isNew = true;
    } else {
      noteId = generateUuid();
      isNew = true;
    }

    const nowISO = new Date().toISOString();
    if (!createdAtISO) createdAtISO = nowISO;

    const content = { title: title, category: category, body: body, pinned: pinned, order: order };
    const noteCipher = await encryptPayloadForCurrentUser(content);
    const rec = {
      id: noteId,
      noteCipher: noteCipher,
      createdAtISO: createdAtISO,
      updatedAtISO: nowISO
    };
    await getAdapter().putNoteForUser(currentUserId, rec);

    // Zapis = notatka jest ŻYWA → zdejmij ewentualny tombstone (resurrect przez edycję).
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.removeNoteTombstoneForUser === 'function') {
        await _adp.removeNoteTombstoneForUser(currentUserId, noteId);
      }
    } catch (_) { /* nie blokuj zapisu */ }

    const result = { id: noteId, isNew: isNew, updatedAtISO: nowISO };
    notifyNoteChanged({ id: noteId, action: 'save' });
    return result;
  }

  async function removeNote(noteId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by usunąć notatkę.');
    if (typeof noteId !== 'string' || !noteId) throw new Error('removeNote: brak id.');
    await getAdapter().removeNoteForUser(currentUserId, noteId);
    // Tombstone, by usunięcie rozeszło się na inne urządzenia (sync — N2).
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.putNoteTombstoneForUser === 'function') {
        await _adp.putNoteTombstoneForUser(currentUserId, { id: noteId, deletedAtISO: new Date().toISOString() });
      }
    } catch (_) { /* nie blokuj usunięcia */ }

    notifyNoteChanged({ id: noteId, action: 'delete' });

    // Tryb EFEMERYCZNY: push jednorazowy (jak przy removePatient), best-effort.
    try {
      if (_ephemeralMode && global.VildaSync && typeof global.VildaSync.syncPush === 'function') {
        Promise.resolve(global.VildaSync.syncPush()).catch(function () {});
      }
    } catch (_) { void _; }

    return true;
  }

  // ============ NOTATKI KLINICZNE PACJENTA (P1) ============
  // Notatki PRZYPISANE do konkretnego pacjenta (różnie od STORE_NOTES, który
  // jest biblioteką szablonów konta lekarza). Cztery kategorie:
  //   • followup       — przypomnienie z dueDateISO (np. "za 6 mc redukcja Euthyroxu")
  //   • observation    — obserwacja kliniczna bez deadline
  //   • treatment      — adnotacja leczenia (preparat, dawka, plan)
  //   • wynik-badania  — wynik labu / obrazówki / konsultacji
  //
  // dueDateISO jest opcjonalne dla wszystkich (followup zwykle ma, reszta sporadycznie).
  // Treść (title + body) szyfrowana master keyem (bodyCipher). Metadanych w plain:
  // patientId (niezbędne do listowania per-pacjent), category, dueDateISO, timestampy.
  //
  // Cloud-only: routowane do MEMORY (jak pacjenci). Inwariant: dane wrażliwe
  // pacjenta NIGDY na dysku w cloud-only — także te w postaci notatek lekarza.

  const PATIENT_NOTE_CATEGORIES = ['followup', 'observation', 'treatment', 'wynik-badania'];
  const PATIENT_NOTE_CATEGORY_DEFAULT = 'observation';

  function normalizePatientNoteCategory(value) {
    if (typeof value !== 'string') return PATIENT_NOTE_CATEGORY_DEFAULT;
    const v = value.trim();
    return PATIENT_NOTE_CATEGORIES.indexOf(v) >= 0 ? v : PATIENT_NOTE_CATEGORY_DEFAULT;
  }

  // Walidacja dueDateISO — opcjonalnie. Akceptuje YYYY-MM-DD (date) lub pełen ISO.
  // Zwraca normalized ISO (UTC midnight dla date-only) lub null gdy invalid/empty.
  function normalizeDueDateISO(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return null;
    const t = value.trim();
    if (!t) return null;
    // YYYY-MM-DD → UTC midnight ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      const d = new Date(t + 'T00:00:00.000Z');
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    // Pełny ISO — sprawdź poprawność
    const d2 = new Date(t);
    if (isNaN(d2.getTime())) return null;
    return d2.toISOString();
  }

  // R1: completedAtISO — moment oznaczenia notatki jako "Wykonane". Null = pending.
  // Akceptuje pełen ISO. NIE konwertuje YYYY-MM-DD (to znacznik czasu, nie data).
  function normalizeCompletedAtISO(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return null;
    const t = value.trim();
    if (!t) return null;
    const d = new Date(t);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // B1.0: linkedAgeMonths — opcjonalna kotwica notatki do wieku pacjenta w chwili
  // wizyty (jeśli notatka powstała razem z wpisem pomiaru). Wartość: liczba > 0
  // (wiek w pełnych miesiącach) lub null (notatka "wolna" — bez powiązania z pomiarem).
  // Akceptujemy number i string (parsowany), zwracamy zaokrąglony int lub null.
  // Zakres: 0 < value <= 1200 (do 100 lat — defensywnie).
  function normalizeLinkedAgeMonths(value) {
    if (value == null || value === '') return null;
    var n = (typeof value === 'number') ? value : Number(value);
    if (!isFinite(n)) return null;
    n = Math.round(n);
    if (n <= 0) return null;
    if (n > 1200) return null;
    return n;
  }

  async function _decryptPatientNoteRecord(rec) {
    let content = { title: '', body: '' };
    try {
      const dec = await decryptPayloadForCurrentUser(rec.bodyCipher.iv, rec.bodyCipher.data);
      if (dec && typeof dec === 'object') content = dec;
    } catch (_) {
      content = { title: '(błąd odczytu)', body: '' };
    }
    return {
      id: rec.id,
      patientId: rec.patientId,
      title: typeof content.title === 'string' ? content.title : '',
      body: typeof content.body === 'string' ? content.body : '',
      category: normalizePatientNoteCategory(rec.category),
      dueDateISO: rec.dueDateISO || null,
      // R1: completedAtISO — null gdy pending (notatka wciąż w reminderach).
      completedAtISO: rec.completedAtISO || null,
      // B1.0: linkedAgeMonths — wiek pacjenta przy wizycie (jeśli notatka powstała
      // razem z wpisem pomiaru) lub null (notatka "wolna").
      linkedAgeMonths: normalizeLinkedAgeMonths(rec.linkedAgeMonths),
      createdAtISO: rec.createdAtISO || null,
      updatedAtISO: rec.updatedAtISO || null
    };
  }

  /**
   * Zapisuje notatkę kliniczną przypisaną do pacjenta.
   * @param {object} payload — { id?, patientId, title, body, category, dueDateISO? }
   * @param {object} [options] — rezerwa na przyszłość
   * @returns {Promise<{id, isNew, updatedAtISO}>}
   */
  async function savePatientNote(payload, options) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by zapisać notatkę pacjenta.');
    if (!payload || typeof payload !== 'object') throw new Error('savePatientNote: brak payloadu.');
    void options;

    if (typeof payload.patientId !== 'string' || !payload.patientId.length) {
      throw new Error('savePatientNote: brak patientId.');
    }

    const title = sanitizeNoteText(typeof payload.title === 'string' ? payload.title : '').trim();
    const body = sanitizeNoteText(typeof payload.body === 'string' ? payload.body : '');
    if (!title && !body) throw new Error('savePatientNote: notatka musi mieć tytuł lub treść.');

    const category = normalizePatientNoteCategory(payload.category);
    const dueDateISO = normalizeDueDateISO(payload.dueDateISO);

    let noteId = (typeof payload.id === 'string' && payload.id) ? payload.id : null;
    let isNew = false;
    let createdAtISO = null;
    // R1: zachowaj existing.completedAtISO jeśli payload nie podał własnego.
    // Edytor notatki (showPatientNoteEditor) NIE wysyła completedAtISO → zachowanie
    // status "Wykonane" przeżywa zwykłą edycję treści. Tylko explicit complete/uncomplete
    // wywołują savePatientNote z completedAtISO !== undefined.
    let existingCompletedAtISO = null;
    // B1.0: analogicznie zachowaj existing.linkedAgeMonths gdy payload nie podał
    // własnego — czysta edycja treści nie powinna zrywać kotwicy do wizyty.
    let existingLinkedAgeMonths = null;
    if (noteId) {
      const existing = await getAdapter().getPatientNoteForUser(currentUserId, noteId);
      if (existing) {
        createdAtISO = existing.createdAtISO || null;
        existingCompletedAtISO = existing.completedAtISO || null;
        existingLinkedAgeMonths = normalizeLinkedAgeMonths(existing.linkedAgeMonths);
      } else {
        isNew = true;
      }
    } else {
      noteId = generateUuid();
      isNew = true;
    }

    const nowISO = new Date().toISOString();
    if (!createdAtISO) createdAtISO = nowISO;

    // R1: completedAtISO resolution:
    //   undefined → zachowaj existing (lub null gdy isNew)
    //   null/''   → wyczyść (uncomplete)
    //   string    → ustaw (complete) — normalizujemy do pełnego ISO
    let completedAtISO;
    if (!Object.prototype.hasOwnProperty.call(payload, 'completedAtISO')) {
      completedAtISO = existingCompletedAtISO;
    } else {
      completedAtISO = normalizeCompletedAtISO(payload.completedAtISO);
    }

    // B1.0: linkedAgeMonths resolution — analogicznie do completedAtISO:
    //   undefined → zachowaj existing (czysta edycja treści przeżywa kotwicę)
    //   null/''/0 → wyczyść kotwicę (notatka staje się "wolna")
    //   number    → ustaw (kotwicz do wieku)
    let linkedAgeMonths;
    if (!Object.prototype.hasOwnProperty.call(payload, 'linkedAgeMonths')) {
      linkedAgeMonths = existingLinkedAgeMonths;
    } else {
      linkedAgeMonths = normalizeLinkedAgeMonths(payload.linkedAgeMonths);
    }

    const content = { title: title, body: body };
    const bodyCipher = await encryptPayloadForCurrentUser(content);
    const rec = {
      id: noteId,
      patientId: payload.patientId,
      bodyCipher: bodyCipher,
      category: category,
      dueDateISO: dueDateISO,
      completedAtISO: completedAtISO,
      // B1.0: plain-text meta (jak dueDateISO) — żeby timeline filter / sortowanie
      // po wieku mogło działać bez deszyfrowania bodyCipher.
      linkedAgeMonths: linkedAgeMonths,
      createdAtISO: createdAtISO,
      updatedAtISO: nowISO
    };
    await getAdapter().putPatientNoteForUser(currentUserId, rec);

    // Zapis = notatka żyje → zdejmij ewentualny tombstone (resurrect przez edycję).
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.removePatientNoteTombstoneForUser === 'function') {
        await _adp.removePatientNoteTombstoneForUser(currentUserId, noteId);
      }
    } catch (_) { /* nie blokuj zapisu */ }

    const result = { id: noteId, isNew: isNew, updatedAtISO: nowISO };
    notifyPatientNoteChanged({ id: noteId, patientId: payload.patientId, action: 'save' });

    // Tryb EFEMERYCZNY: best-effort push (jak removeNote).
    try {
      if (_ephemeralMode && global.VildaSync && typeof global.VildaSync.syncPush === 'function') {
        Promise.resolve(global.VildaSync.syncPush()).catch(function () {});
      }
    } catch (_) { void _; }

    return result;
  }

  async function getPatientNote(noteId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by pobrać notatkę pacjenta.');
    const rec = await getAdapter().getPatientNoteForUser(currentUserId, noteId);
    if (!rec) return null;
    return _decryptPatientNoteRecord(rec);
  }

  /**
   * Lista notatek konkretnego pacjenta — posortowane:
   *   1) followup z najbliższym dueDateISO na górze (overdue też tu — najwyżej)
   *   2) pozostałe sortowane malejąco po updatedAtISO
   */
  async function listPatientNotesForPatient(patientId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by wyświetlić notatki pacjenta.');
    if (typeof patientId !== 'string' || !patientId.length) {
      throw new Error('listPatientNotesForPatient: brak patientId.');
    }
    const records = await getAdapter().listPatientNotesForUser(currentUserId);
    const filtered = records.filter(function (r) { return r && r.patientId === patientId; });
    const out = [];
    for (let i = 0; i < filtered.length; i += 1) {
      out.push(await _decryptPatientNoteRecord(filtered[i]));
    }
    out.sort(_compareForListing);
    return out;
  }

  /**
   * Wszystkie notatki użytkownika (cross-patient) — dla globalnego dashboardu
   * przypomnień. Każda notatka zachowuje patientId + (po stronie UI dołożymy
   * label pacjenta z osobnego listPatients).
   */
  async function listAllPatientNotes() {
    if (!isUnlocked()) throw new Error('Zaloguj się, by wyświetlić notatki pacjentów.');
    const records = await getAdapter().listPatientNotesForUser(currentUserId);
    const out = [];
    for (let i = 0; i < records.length; i += 1) {
      out.push(await _decryptPatientNoteRecord(records[i]));
    }
    out.sort(_compareForListing);
    return out;
  }

  // Wspólne sortowanie dla obu list:
  //   • notatki z dueDateISO (active reminders) — najpierw, rosnąco wg dueDate
  //   • notatki bez dueDateISO — niżej, malejąco wg updatedAtISO
  function _compareForListing(a, b) {
    const aDue = a.dueDateISO || '';
    const bDue = b.dueDateISO || '';
    if (aDue && bDue) {
      if (aDue < bDue) return -1;
      if (aDue > bDue) return 1;
    } else if (aDue && !bDue) {
      return -1;
    } else if (!aDue && bDue) {
      return 1;
    }
    // Tiebreaker / no-due section: malejąco po updatedAtISO
    const aU = a.updatedAtISO || a.createdAtISO || '';
    const bU = b.updatedAtISO || b.createdAtISO || '';
    if (bU > aU) return 1;
    if (bU < aU) return -1;
    return 0;
  }

  // ============ R1 — REMINDER SYSTEM HELPERS ============
  // Trzy convenience wrappers nad savePatientNote dla akcji reminder modal'a.
  // Każdy aktualizuje updatedAtISO → LWW sync propaguje zmianę cross-device.

  /**
   * Oznacz notatkę jako wykonaną. Notatka pozostaje w karcie pacjenta (jako
   * greyed-out z badge "✓ wykonano DD.MM"), ale znika z reminderów.
   * Odwracalne — patrz uncompletePatientNote.
   */
  async function completePatientNote(noteId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by oznaczyć notatkę.');
    if (typeof noteId !== 'string' || !noteId) throw new Error('completePatientNote: brak id.');
    const existing = await getPatientNote(noteId);
    if (!existing) throw new Error('completePatientNote: notatka nie istnieje.');
    return savePatientNote({
      id: existing.id,
      patientId: existing.patientId,
      title: existing.title,
      body: existing.body,
      category: existing.category,
      dueDateISO: existing.dueDateISO,
      completedAtISO: new Date().toISOString(),
      // B1.0: zachowaj kotwicę do wizyty przy oznaczaniu jako wykonane.
      linkedAgeMonths: existing.linkedAgeMonths
    });
  }

  /**
   * Cofnij oznaczenie "wykonane" — notatka wraca do reminderów.
   */
  async function uncompletePatientNote(noteId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by cofnąć oznaczenie.');
    if (typeof noteId !== 'string' || !noteId) throw new Error('uncompletePatientNote: brak id.');
    const existing = await getPatientNote(noteId);
    if (!existing) throw new Error('uncompletePatientNote: notatka nie istnieje.');
    return savePatientNote({
      id: existing.id,
      patientId: existing.patientId,
      title: existing.title,
      body: existing.body,
      category: existing.category,
      dueDateISO: existing.dueDateISO,
      completedAtISO: null,
      // B1.0: zachowaj kotwicę do wizyty przy cofaniu wykonania.
      linkedAgeMonths: existing.linkedAgeMonths
    });
  }

  /**
   * Przełóż termin przypomnienia notatki na nową datę. Akceptuje YYYY-MM-DD
   * lub pełen ISO (przez normalizeDueDateISO).
   */
  async function snoozePatientNote(noteId, newDueDateISO) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by przełożyć przypomnienie.');
    if (typeof noteId !== 'string' || !noteId) throw new Error('snoozePatientNote: brak id.');
    const newDue = normalizeDueDateISO(newDueDateISO);
    if (!newDue) throw new Error('snoozePatientNote: nieprawidłowa data.');
    const existing = await getPatientNote(noteId);
    if (!existing) throw new Error('snoozePatientNote: notatka nie istnieje.');
    return savePatientNote({
      id: existing.id,
      patientId: existing.patientId,
      title: existing.title,
      body: existing.body,
      category: existing.category,
      dueDateISO: newDue,
      // Przełożenie reseterruje "Wykonane" (gdyby przypadkowo zostało zaznaczone).
      completedAtISO: null,
      // B1.0: zachowaj kotwicę do wizyty przy przekładaniu przypomnienia.
      linkedAgeMonths: existing.linkedAgeMonths
    });
  }

  /**
   * R1 — query dla reminder modal'a. Zwraca pacjentów z aktywnymi notatkami
   * (dueDateISO <= referenceISO && completedAtISO == null), pogrupowane.
   *
   * @param {string} [referenceISO] — domyślnie KONIEC dzisiejszego dnia w STREFIE LOKALNEJ
   *   (żeby YYYY-MM-DD == today był uznany za "due dzisiaj" niezależnie od UTC offset).
   *
   * @returns {Promise<Array<{
   *   patientId: string,
   *   patientName: string,
   *   notes: Array<DecryptedPatientNote>  // sorted: oldest dueDate first (overdue → today)
   * }>>}
   *   Lista posortowana: pacjent z najstarszą notatką (najbardziej overdue) na górze.
   *   Tylko pacjenci, którzy mają ≥1 pending due note. Pacjenci usunięci (tombstone)
   *   nie są zwracani — kaskadowo notatki też powinny być usunięte przy delete patient,
   *   ale defensywnie filtrujemy: jeśli getPatient zwróci null → pomiń notatki.
   */
  async function listPatientNotesDueByDate(referenceISO) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by sprawdzić przypomnienia.');

    // Domyślny reference: koniec dzisiejszego dnia w lokalnej strefie czasowej.
    // Dlaczego "koniec dnia": jeśli dueDateISO = "2026-05-30T00:00:00.000Z" (UTC midnight)
    // a user jest w PL (UTC+2), to "dzisiaj 30.05.2026" oznacza zakres
    // [30.05 00:00 PL, 30.05 23:59:59 PL] = [29.05 22:00 UTC, 30.05 21:59 UTC].
    // Notatka z dueDateISO = 30.05 00:00 UTC jest WEWNĄTRZ tego zakresu → dziś.
    let cutoffISO;
    if (referenceISO && typeof referenceISO === 'string') {
      cutoffISO = referenceISO;
    } else {
      const now = new Date();
      const endOfLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      cutoffISO = endOfLocalDay.toISOString();
    }

    const allNotes = await listAllPatientNotes();
    // Filter: tylko notatki z dueDate, nie wykonane, dueDate <= cutoff.
    const pending = allNotes.filter(function (n) {
      if (!n || !n.dueDateISO) return false;
      if (n.completedAtISO) return false;
      return n.dueDateISO <= cutoffISO;
    });

    if (!pending.length) return [];

    // Group by patientId.
    const grouped = new Map();
    for (let i = 0; i < pending.length; i += 1) {
      const note = pending[i];
      if (!grouped.has(note.patientId)) grouped.set(note.patientId, []);
      grouped.get(note.patientId).push(note);
    }

    // Resolve patient names + filter out usunieci pacjenci.
    const out = [];
    const patientIds = Array.from(grouped.keys());
    for (let j = 0; j < patientIds.length; j += 1) {
      const pid = patientIds[j];
      let patientName = '(pacjent usunięty)';
      let patientExists = true;
      try {
        const patient = await getPatient(pid);
        if (patient && patient.header && typeof patient.header.name === 'string') {
          patientName = patient.header.name;
        } else if (!patient) {
          patientExists = false;
        }
      } catch (_) {
        patientExists = false;
      }
      if (!patientExists) continue;
      const notes = grouped.get(pid);
      notes.sort(function (a, b) {
        const aD = a.dueDateISO || '';
        const bD = b.dueDateISO || '';
        if (aD < bD) return -1;
        if (aD > bD) return 1;
        return 0;
      });
      out.push({ patientId: pid, patientName: patientName, notes: notes });
    }

    // Sort: pacjent z NAJSTARSZĄ pending notatką pierwszy (najbardziej overdue).
    out.sort(function (a, b) {
      const aD = (a.notes[0] && a.notes[0].dueDateISO) || '';
      const bD = (b.notes[0] && b.notes[0].dueDateISO) || '';
      if (aD < bD) return -1;
      if (aD > bD) return 1;
      return 0;
    });

    return out;
  }

  // ============ B1.1 — HISTORIA POMIARÓW PER SNAPSHOT (helper) ============
  /**
   * Wyciąga historyczne wiersze pomiarowe z payloadu pojedynczego snapshotu.
   *
   * KONTEKST: pacjent w jednym snapshocie ma DWIE warstwy danych:
   *   1) payload.user.* — AKTUALNY stan formularza (jeden zestaw height/weight/age)
   *   2) payload.advanced.data.measurements[] / payload.growthBasic.data.measurements[]
   *      — HISTORYCZNE wiersze pomiarów wpisywane do modułów wzrostowych
   *      (każdy wiersz ma {ageYears, ageMonths, height, weight, [boneAgeYears]}
   *      — bez daty kalendarzowej, kotwicą jest WIEK pacjenta przy pomiarze).
   *
   * Ten helper zwraca warstwę 2 — historyczne wiersze. Aktualny stan (warstwa 1)
   * obsługuje wywołujący jako fallback gdy tablica historyczna jest pusta.
   *
   * ŹRÓDŁO: preferuje advanced (kompletne — z boneAgeYears używane w prognozach),
   * fallback do growthBasic (lżejsze — tylko age/height/weight).
   *
   * NORMALIZACJA: każdy wiersz → {ageMonths, ageYears, height, weight, sex, boneAgeYears?}.
   * Wiersze bez height I bez weight są wycinane (puste — brak pomiaru wzrostu/wagi).
   * Sortowanie ASC po ageMonths.
   *
   * Pure function — bez side effects, bez vault state. Testowalne w izolacji.
   *
   * @param {object} snapshot — rekord snapshotu z polem .payload (po deszyfrowaniu)
   * @returns {Array<{ageMonths:number, ageYears:number, height:?number, weight:?number, sex:?string, boneAgeYears?:number}>}
   */
  function _extractMeasurementHistory(snapshot) {
    if (!snapshot || !snapshot.payload || typeof snapshot.payload !== 'object') return [];
    var p = snapshot.payload;
    var sex = (p.user && typeof p.user.sex === 'string' && p.user.sex) ? p.user.sex : null;

    // Wybór źródła: advanced → growthBasic → brak.
    var sourceRows = null;
    var sourceName = null;
    if (p.advanced && p.advanced.data && Array.isArray(p.advanced.data.measurements)
        && p.advanced.data.measurements.length > 0) {
      sourceRows = p.advanced.data.measurements;
      sourceName = 'advanced';
    } else if (p.growthBasic && p.growthBasic.data && Array.isArray(p.growthBasic.data.measurements)
        && p.growthBasic.data.measurements.length > 0) {
      sourceRows = p.growthBasic.data.measurements;
      sourceName = 'growthBasic';
    } else {
      return [];
    }
    void sourceName; // diagnostyka (przyszłe użycie, jeśli będzie potrzeba)

    var out = [];
    for (var i = 0; i < sourceRows.length; i += 1) {
      var row = sourceRows[i];
      if (!row || typeof row !== 'object') continue;

      // ageMonths preferowane; ageYears jako fallback.
      var ageMonths = null;
      if (typeof row.ageMonths === 'number' && isFinite(row.ageMonths)) {
        ageMonths = Math.round(row.ageMonths);
      } else if (typeof row.ageYears === 'number' && isFinite(row.ageYears)) {
        ageMonths = Math.round(row.ageYears * 12);
      }
      if (ageMonths == null || ageMonths < 0) continue;

      var height = (typeof row.height === 'number' && isFinite(row.height) && row.height > 0) ? row.height : null;
      var weight = (typeof row.weight === 'number' && isFinite(row.weight) && row.weight > 0) ? row.weight : null;
      // Wiersz bez ŻADNEGO pomiaru → wycinamy (puste).
      if (height == null && weight == null) continue;

      var entry = {
        ageMonths: ageMonths,
        ageYears: ageMonths / 12,
        height: height,
        weight: weight,
        sex: sex
      };
      // boneAgeYears — tylko advanced ma to pole; growthBasic nie zbiera.
      if (typeof row.boneAgeYears === 'number' && isFinite(row.boneAgeYears) && row.boneAgeYears > 0) {
        entry.boneAgeYears = row.boneAgeYears;
      }
      out.push(entry);
    }

    out.sort(function (a, b) { return a.ageMonths - b.ageMonths; });
    return out;
  }

  // ============ P5 — TIMELINE PACJENTA (agregator wydarzeń) ============
  /**
   * Zwraca chronologiczną listę wszystkich wydarzeń pacjenta posortowaną malejąco
   * po dateISO (najnowsze pierwsze). Każde wydarzenie ma:
   *   - type: 'measurement' | 'note' | 'observation' | 'lab' | 'medication' | 'gh-therapy'
   *   - dateISO: timestamp wydarzenia (do sortowania i grupowania w UI)
   *   - patientId
   *   - oraz pola specyficzne dla typu (snapshotId+payload dla pomiaru, noteId+body dla notatki, etc.)
   *
   * MVP P5 — typy zaimplementowane z PRAWDZIWYMI danymi:
   *   • measurement — ze snapshots pacjenta (height, weight, BMI, age)
   *   • note — z patientNotes (P1-P4: kategoria, title, body, dueDate, completedAt)
   *   • observation — automatycznie generowane (2 heurystyki: gap detection + growth slowdown)
   *
   * MVP P5 — typy FUTURE-PROOF (placeholdery, zwracają [] na razie):
   *   • lab — wyniki badań laboratoryjnych (IGF-1, TSH, FT4) — wymaga dedykowanego modułu
   *   • medication — leki (Euthyrox, inne) — wymaga dedykowanego modułu
   *   • gh-therapy — terapie GH (GH_THERAPY_POINTS to obecnie storage:'local' globalny,
   *     nie per-pacjent z timestampem; integracja wymaga reklasyfikacji storage)
   *
   * @param {string} patientId
   * @returns {Promise<Array<TimelineEvent>>}
   */
  async function listPatientTimelineEvents(patientId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by pobrać historię pacjenta.');
    if (typeof patientId !== 'string' || !patientId.length) {
      throw new Error('listPatientTimelineEvents: brak patientId.');
    }

    const events = [];

    // ── 1) Pomiary ze snapshots ──────────────────────────────────────────
    let patient = null;
    try { patient = await getPatient(patientId); }
    catch (_) { patient = null; }

    if (patient && Array.isArray(patient.snapshots)) {
      // B1.2: Eventy `measurement` budowane są z TABLICY HISTORYCZNEJ wpisanej do
      // modułów wzrostowych (advanced.data.measurements[] lub growthBasic.data.measurements[]),
      // a NIE 1:1 z snapshotów vaultu. Powód: snapshot = sesja zapisu (kilka kliknięć
      // „Zapisz" w jednej wizycie tworzy kilka snapshotów z TYM SAMYM aktualnym
      // stanem), a wiersz historyczny = jedna wizyta z konkretnym wiekiem dziecka.
      // Każdy wiersz historyczny ma {ageMonths, height, weight, ...} bez daty
      // kalendarzowej — kotwicą jest WIEK pacjenta. Dlatego eventy measurement
      // NIE MAJĄ dateISO ani snapshotId; mają ageMonths/ageYears jako swoją oś czasu.

      // Dedup globalny po (ageMonths, height, weight) — z preferencją do wartości
      // z NAJNOWSZEGO snapshotu (najświeższe poprawki tabeli wygrywają).
      var snapshotsSortedDesc = patient.snapshots.slice().sort(function (a, b) {
        var ai = (a && a.savedAtISO) || '';
        var bi = (b && b.savedAtISO) || '';
        if (ai > bi) return -1;
        if (ai < bi) return 1;
        return 0;
      });

      var dedupedByKey = new Map(); // key → first-seen row (z najnowszego snapshotu)
      for (var si = 0; si < snapshotsSortedDesc.length; si += 1) {
        var rows = _extractMeasurementHistory(snapshotsSortedDesc[si]);
        for (var ri = 0; ri < rows.length; ri += 1) {
          var r = rows[ri];
          var key = r.ageMonths + '|'
            + (r.height != null ? r.height.toFixed(2) : '_')
            + '|' + (r.weight != null ? r.weight.toFixed(2) : '_');
          if (!dedupedByKey.has(key)) dedupedByKey.set(key, r);
        }
      }

      // ── Fix B1.6: ZAWSZE dorzuć aktualny payload.user.* z najnowszego snapshotu ──
      // (NIE tylko gdy measurements puste — wcześniej była ta heurystyka, ale powodowała,
      // że pacjenci mający historyczne wiersze w tabeli Zaawansowane + osobno aktualny
      // pomiar w kreatorze widzieli tylko historyczne, bez bieżącej kontroli.)
      // Dedup po kluczu (ageMonths, h, w) eliminuje duplikat gdy aktualny pomiar
      // jest już w tabeli historycznej pod tym samym wiekiem.
      //
      // UWAGA — struktura wieku w payload.user (kreator):
      //   user.age       = pełne LATA (np. 16)
      //   user.ageMonths = DODATKOWE MIESIĄCE (np. 4) — NIE total
      //   total miesięcy = age * 12 + ageMonths
      // Bug rozwiązany: wcześniej brałem tylko user.ageMonths (4) → wyświetlało
      // się "4 mies." zamiast "16 lat 4 mies." dla Domagała Paulina (16 lat 4 mies.).
      if (snapshotsSortedDesc.length > 0) {
        var latestSnap = snapshotsSortedDesc[0];
        var p = (latestSnap && latestSnap.payload) || {};
        function _readUserField(key) {
          if (p && p.user && typeof p.user[key] === 'number' && isFinite(p.user[key])) return p.user[key];
          if (p && typeof p[key] === 'number' && isFinite(p[key])) return p[key];
          return null;
        }
        var fbHeight = _readUserField('height');
        var fbWeight = _readUserField('weight');

        // Złożenie wieku ze struktury kreatora (age=lata + ageMonths=dodatkowe miesiące).
        var fbAgeYears = _readUserField('age');
        var fbAgeExtraMonths = _readUserField('ageMonths');
        var fbAgeMonths = null;
        if (fbAgeYears != null) {
          // Standard kreatora: lata + opcjonalne dodatkowe miesiące.
          fbAgeMonths = Math.round(fbAgeYears * 12 + (fbAgeExtraMonths != null ? fbAgeExtraMonths : 0));
        } else if (fbAgeExtraMonths != null) {
          // Edge case (programmatic test): brak `age`, jest tylko `ageMonths` →
          // traktujemy go jako total miesięcy.
          fbAgeMonths = Math.round(fbAgeExtraMonths);
        }

        // Emit tylko gdy mamy WIEK + (height lub weight) — bez tego nie ma punktu.
        if (fbAgeMonths != null && fbAgeMonths >= 0 && (fbHeight != null || fbWeight != null)) {
          var fbSex = (p.user && p.user.sex) || p.sex || null;
          var fbHeightSafe = (fbHeight != null && fbHeight > 0) ? fbHeight : null;
          var fbWeightSafe = (fbWeight != null && fbWeight > 0) ? fbWeight : null;
          var fbKey = fbAgeMonths + '|'
            + (fbHeightSafe != null ? fbHeightSafe.toFixed(2) : '_')
            + '|' + (fbWeightSafe != null ? fbWeightSafe.toFixed(2) : '_');
          // Dedup: jeśli historyczna tablica zawiera identyczny wpis dla tego wieku +
          // tych samych wartości, nie dorzucamy duplikatu.
          if (!dedupedByKey.has(fbKey)) {
            dedupedByKey.set(fbKey, {
              ageMonths: fbAgeMonths,
              ageYears: fbAgeMonths / 12,
              height: fbHeightSafe,
              weight: fbWeightSafe,
              sex: fbSex
            });
          }
        }
      }

      // Rebuild measurements ASC po wieku (po dedup'ie + dorzuceniu aktualnego).
      var measurements = Array.from(dedupedByKey.values())
        .sort(function (a, b) { return a.ageMonths - b.ageMonths; });

      // Growth velocity: liczona z różnicy wieków poprzedniego pomiaru chronologicznie
      // po wieku (próg 0.25 roku = 3 miesiące). Wymaga rosnącego wzrostu.
      var GROWTH_VELOCITY_MIN_SPAN_YEARS = 0.25;
      for (var mi = 0; mi < measurements.length; mi += 1) {
        var curr = measurements[mi];
        var velocity = null;
        if (mi > 0 && curr.height != null) {
          // Znajdź poprzedni pomiar Z NIENULOWYM height (może być >1 wstecz).
          for (var pj = mi - 1; pj >= 0; pj -= 1) {
            var prev = measurements[pj];
            if (prev.height == null) continue;
            var spanYears = curr.ageYears - prev.ageYears;
            if (spanYears > GROWTH_VELOCITY_MIN_SPAN_YEARS && curr.height > prev.height) {
              velocity = Math.round(((curr.height - prev.height) / spanYears) * 10) / 10;
            }
            break;
          }
        }
        var bmi = null;
        if (curr.height != null && curr.weight != null && curr.height > 0) {
          bmi = Math.round((curr.weight / Math.pow(curr.height / 100, 2)) * 10) / 10;
        }
        events.push({
          type: 'measurement',
          patientId: patientId,
          ageMonths: curr.ageMonths,
          ageYears: curr.ageYears,
          height: curr.height,
          weight: curr.weight,
          bmi: bmi,
          sex: curr.sex,
          growthVelocity: velocity,
          boneAgeYears: (typeof curr.boneAgeYears === 'number') ? curr.boneAgeYears : null
          // NIE eksponujemy dateISO — measurement events kotwiczą się wiekiem.
          // NIE eksponujemy snapshotId — niezależnie ile snapshotów było, pomiar
          // jest jeden (deduplikacja powyżej).
        });
      }
    }

    // ── 2) Notatki kliniczne (P1-P4) ─────────────────────────────────────
    let notes = [];
    try { notes = await listPatientNotesForPatient(patientId); }
    catch (_) { notes = []; }

    for (let j = 0; j < notes.length; j += 1) {
      const note = notes[j];
      events.push({
        type: 'note',
        dateISO: note.createdAtISO || note.updatedAtISO || new Date().toISOString(),
        patientId: patientId,
        noteId: note.id,
        category: note.category,
        title: note.title,
        body: note.body,
        dueDateISO: note.dueDateISO,
        completedAtISO: note.completedAtISO,
        updatedAtISO: note.updatedAtISO,
        // B1.3: linkedAgeMonths — wiek pacjenta przy wizycie (jeśli notatka powstała
        // razem z wpisem pomiaru) lub null (notatka "wolna" — bez kotwicy do wieku).
        // UI w B1.6 użyje tego pola żeby renderować kotwiczone notatki nad pomiarem
        // o tym wieku, a wolne na samej górze osi czasu.
        linkedAgeMonths: (typeof note.linkedAgeMonths === 'number' && note.linkedAgeMonths > 0)
          ? note.linkedAgeMonths : null
      });
    }

    // ── 3) Auto-observations (proste heurystyki) ─────────────────────────
    // B1.4: observations są generowane z DEDUPOWANYCH measurement eventów po
    // wieku (kotwica = ageMonths), a nie ze snapshotów po dacie zapisu. Powód:
    // savedAtISO jest niemiarodajne (po imporcie zbiorczym wszystko ma tę samą
    // datę → gap detection sypał false negatives), natomiast wiek pacjenta jest
    // jednoznacznym wskaźnikiem przerwy między wizytami.
    var measurementEventsForObs = events.filter(function (e) { return e.type === 'measurement'; });
    if (measurementEventsForObs.length >= 2) {
      var obs = _generateObservations(measurementEventsForObs, patientId);
      for (let k = 0; k < obs.length; k += 1) events.push(obs[k]);
    }

    // ── 4) Future-proof typy — pusta tablica na MVP ─────────────────────
    // Te calle są placeholderami: UI w timeline pokaże filter dla nich,
    // ale wyniki są na razie puste. Gdy odpowiednie moduły zostaną dodane,
    // wystarczy zaimplementować listLabResults / listMedications /
    // listGHTherapyEvents poniżej i timeline automatycznie je włączy.
    // (Świadomie nie throw — żeby UI mogło bezpiecznie wyświetlać filtry.)

    // ── 5) Sortowanie B1.2: pomiary po WIEKU (DESC = najwyższy wiek na górze),
    //     notatki/observations po DACIE (DESC = najnowsze na górze).
    //     Dwa modele czasu — pomiary nie mają dateISO, kotwicą jest ageMonths;
    //     reszta ma dateISO (createdAtISO notatki, savedAtISO snapshotu observation).
    //     Strategia: rozdziel, posortuj osobno, połącz. UI w B1.6 zdecyduje
    //     o ostatecznym układzie wizualnym (zwykle: notatki wolne → kotwiczone
    //     pod pomiarami → puste sloty).
    var measurementEvents = [];
    var anchoredEvents = [];
    for (var ei = 0; ei < events.length; ei += 1) {
      if (events[ei].type === 'measurement') measurementEvents.push(events[ei]);
      else anchoredEvents.push(events[ei]);
    }
    measurementEvents.sort(function (a, b) { return b.ageMonths - a.ageMonths; }); // DESC
    anchoredEvents.sort(function (a, b) {
      var ai = a.dateISO || '';
      var bi = b.dateISO || '';
      if (ai > bi) return -1;
      if (ai < bi) return 1;
      return 0;
    });
    // Konkatenacja: notatki/observations pierwsze (najnowsze), potem pomiary po wieku.
    // UI w B1.6 zmieni układ na docelowy „wolne notatki → kotwiczone do pomiarów".
    return anchoredEvents.concat(measurementEvents);
  }

  /**
   * Generuje proste auto-observations z dedupowanych measurement events.
   * MVP — 2 heurystyki bazujące na WIEKU pacjenta:
   *   1) Gap detection: różnica ageMonths > 12 między kolejnymi pomiarami →
   *      observation z linkedAgeMonths = curr.ageMonths ("Pierwszy pomiar
   *      po X miesiącach przerwy między wiekiem Y a Z").
   *   2) Growth slowdown: prędkość wzrastania w ostatnim interwale (po wieku)
   *      <80% prędkości poprzedniego interwału → observation z
   *      linkedAgeMonths = ostatni.ageMonths.
   *
   * Wcześniej (P5) liczyło po savedAtISO snapshotów. Po B1.4 liczy po wieku —
   * stąd działa poprawnie nawet dla pacjentów importowanych zbiorczo (gdzie
   * wszystkie snapshoty mają tę samą datę zapisu, ale różne wieki wpisane do
   * tablicy historycznej).
   *
   * UWAGA — to są pomocnicze "alerty" wizualne, NIE diagnoza medyczna. UI dorzuca
   * disclaimer "Automatyczne wykrycie — zweryfikuj ręcznie".
   *
   * @param {Array<{ageMonths, ageYears, height, ...}>} measurements — dedupowane
   *        measurement events z listPatientTimelineEvents, SORTUJEMY ASC po wieku.
   * @param {string} patientId
   * @returns {Array<observation event>}
   */
  function _generateObservations(measurements, patientId) {
    const out = [];
    if (!Array.isArray(measurements) || measurements.length < 2) return out;

    // Sortujemy ASC po ageMonths (defensive — wywołujący może podawać DESC).
    var chronological = measurements.slice().sort(function (a, b) {
      return a.ageMonths - b.ageMonths;
    });
    var GAP_THRESHOLD_MONTHS = 12;

    // ── 1) Gap detection: różnica wieku > 12 mies. między kolejnymi pomiarami ──
    for (let i = 1; i < chronological.length; i += 1) {
      const prev = chronological[i - 1];
      const curr = chronological[i];
      if (!prev || !curr) continue;
      if (typeof prev.ageMonths !== 'number' || typeof curr.ageMonths !== 'number') continue;
      const diffMonths = curr.ageMonths - prev.ageMonths;
      if (diffMonths > GAP_THRESHOLD_MONTHS) {
        out.push({
          type: 'observation',
          patientId: patientId,
          observationType: 'measurement-gap',
          title: 'Przerwa w pomiarach',
          description: 'Pierwszy pomiar po ' + diffMonths + ' miesiącach przerwy (między wiekiem '
            + _formatAgeForObs(prev.ageMonths) + ' a ' + _formatAgeForObs(curr.ageMonths) + ').',
          autoGenerated: true,
          // B1.4: kotwica do wieku — observation pojawia się przy pomiarze, który
          // zakończył przerwę.
          linkedAgeMonths: curr.ageMonths,
          gapMonths: diffMonths
          // NIE używamy dateISO — observation kotwiczona po wieku, jak measurement.
        });
      }
    }

    // ── 2) Growth slowdown: 3 ostatnie pomiary chronologicznie po wieku ──
    // Liczymy 2 prędkości z różnic wieków, porównujemy. Wymaga rosnących wzrostów.
    if (chronological.length >= 3) {
      const recent = chronological.slice(-3); // [a, b, c] ASC po wieku
      const a = recent[0], b = recent[1], c = recent[2];
      const ha = (typeof a.height === 'number') ? a.height : null;
      const hb = (typeof b.height === 'number') ? b.height : null;
      const hc = (typeof c.height === 'number') ? c.height : null;
      if (ha != null && hb != null && hc != null) {
        const span1 = b.ageYears - a.ageYears;
        const span2 = c.ageYears - b.ageYears;
        // Próg 0.25 roku spójny z growth velocity w listPatientTimelineEvents.
        if (span1 > 0.25 && span2 > 0.25 && hb > ha) {
          const speed1 = (hb - ha) / span1; // cm/rok
          const speed2 = (hc - hb) / span2;
          if (speed1 > 1.0 && speed2 > 0 && speed2 < speed1 * 0.8) {
            const dropPercent = Math.round((1 - speed2 / speed1) * 100);
            out.push({
              type: 'observation',
              patientId: patientId,
              observationType: 'growth-slowdown',
              title: 'Spowolnienie wzrastania',
              description: 'Prędkość spadła o ' + dropPercent + '% (z ' + speed1.toFixed(1)
                + ' do ' + speed2.toFixed(1) + ' cm/r).',
              autoGenerated: true,
              speedBefore: Math.round(speed1 * 10) / 10,
              speedAfter: Math.round(speed2 * 10) / 10,
              // B1.4: kotwica do wieku — observation przy ostatnim pomiarze z trójki.
              linkedAgeMonths: c.ageMonths
            });
          }
        }
      }
    }

    return out;
  }

  // Helper: format wieku do opisów observations. Mini-version of UI _formatAge.
  function _formatAgeForObs(ageMonths) {
    if (typeof ageMonths !== 'number' || !isFinite(ageMonths) || ageMonths < 0) return '?';
    if (ageMonths < 12) return ageMonths + ' mies.';
    var years = Math.floor(ageMonths / 12);
    var months = ageMonths % 12;
    if (months === 0) return years + (years === 1 ? ' rok' : (years < 5 ? ' lata' : ' lat'));
    return years + ' lat ' + months + ' mies.';
  }

  async function removePatientNote(noteId) {
    if (!isUnlocked()) throw new Error('Zaloguj się, by usunąć notatkę pacjenta.');
    if (typeof noteId !== 'string' || !noteId) throw new Error('removePatientNote: brak id.');

    // Pobierz patientId PRZED usunięciem (do notifyPatientNoteChanged i sync).
    let patientIdForEvent = null;
    try {
      const existing = await getAdapter().getPatientNoteForUser(currentUserId, noteId);
      if (existing) patientIdForEvent = existing.patientId || null;
    } catch (_) { /* fallthrough */ }

    await getAdapter().removePatientNoteForUser(currentUserId, noteId);

    // Tombstone — by usunięcie rozeszło się na inne urządzenia (sync — P2 niżej).
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.putPatientNoteTombstoneForUser === 'function') {
        await _adp.putPatientNoteTombstoneForUser(currentUserId, {
          id: noteId,
          deletedAtISO: new Date().toISOString()
        });
      }
    } catch (_) { /* nie blokuj usunięcia */ }

    notifyPatientNoteChanged({ id: noteId, patientId: patientIdForEvent, action: 'delete' });

    // Tryb EFEMERYCZNY: best-effort push.
    try {
      if (_ephemeralMode && global.VildaSync && typeof global.VildaSync.syncPush === 'function') {
        Promise.resolve(global.VildaSync.syncPush()).catch(function () {});
      }
    } catch (_) { void _; }

    return true;
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
    await establishSis();
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
    // Pęczek DEK/SIS: DEK = masterKeyBytes (materiał danych), SIS = sisBytes
    // (rotowalna tożsamość sync). Dla kont przed migracją lub gdy SIS się nie
    // ustanowił, sis = master → wynik IDENTYCZNY z deriveSyncMaterial(master).
    return C.deriveSyncMaterialFromBundle({ dek: masterKeyBytes, sis: sisBytes || masterKeyBytes });
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

    // Substep D — passkey metadata sync cross-device.
    // Wyciągamy z meta TYLKO publiczne fields: credentialId (jest publiczny),
    // deviceLabel, createdAtISO, roaming. NIE szlemy: encryptedMasterByPasskey
    // (device-specific crypto material), encryptedInitials, publicKeyB64u, wrapVersion.
    // Inne urządzenia widzą metadata żeby pokazać w UI listę "wszystkie biometrie
    // dla tego konta", ale NIE mogą odblokować vault używając remote passkey
    // (brak crypto material). User może je tylko USUNĄĆ (tombstone propaguje się).
    let passkeyMetadata = [];
    let passkeyTombstones = [];
    try {
      const _userMeta = await getAdapter().getUserMeta(currentUserId);
      if (_userMeta && Array.isArray(_userMeta.passkeys)) {
        passkeyMetadata = _userMeta.passkeys.map(function (p) {
          return {
            credentialId: p.credentialId,
            deviceLabel:  p.deviceLabel,
            createdAtISO: p.createdAtISO,
            roaming:      p.roaming === true
          };
        });
      }
      if (_userMeta && Array.isArray(_userMeta.passkeyTombstones)) {
        // GC: przytnij stare tombstones przed wysłaniem (TTL jak dla patient tombstones).
        const cutoffISO = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
        passkeyTombstones = _userMeta.passkeyTombstones.filter(function (t) {
          return t && t.credentialId && t.deletedAtISO && t.deletedAtISO >= cutoffISO;
        });
      }
    } catch (_) { /* meta unavailable — wyślij puste */ }

    // Substep E3 — cloud-synced user preferences. Każdy wpis: {value, updatedAtISO}.
    // mergeSyncPayload na drugim device porówna timestamps i zastosuje LWW.
    let userPreferences = {};
    try {
      const _userMetaForPrefs = await getAdapter().getUserMeta(currentUserId);
      if (_userMetaForPrefs && typeof _userMetaForPrefs.userPreferences === 'object' && _userMetaForPrefs.userPreferences) {
        userPreferences = _userMetaForPrefs.userPreferences;
      }
    } catch (_) { void _; }

    // N2 — Notatki: eksport ODSZYFROWANYCH rekordów (jak pacjenci — header/payload).
    // Cały blob i tak jest szyfrowany przez vilda_sync.js sync materiałem przed
    // wysyłką. Każda notatka niesie updatedAtISO → mergeSyncPayload robi LWW per-rekord.
    // noteTombstones (id+deletedAtISO) propagują usunięcia. Pola addytywne — starszy
    // klient ignoruje, nowszy czytający stary blob przyjmuje [].
    let notes = [];
    let noteTombstones = [];
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.listNotesForUser === 'function') {
        const notesRaw = await _adp.listNotesForUser(currentUserId);
        for (let n = 0; n < notesRaw.length; n += 1) {
          const decoded = await _decryptNoteRecord(notesRaw[n]);
          notes.push(decoded);
        }
      }
      if (_adp && typeof _adp.listNoteTombstonesForUser === 'function') {
        noteTombstones = await _adp.listNoteTombstonesForUser(currentUserId);
        // GC: przytnij stare tombstones (TTL jak dla pacjentów).
        if (typeof _adp.removeNoteTombstoneForUser === 'function' && noteTombstones.length) {
          const cutoffISO = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
          const kept = [];
          for (let t = 0; t < noteTombstones.length; t += 1) {
            const ts = noteTombstones[t];
            if (ts && ts.deletedAtISO && ts.deletedAtISO < cutoffISO) {
              await _adp.removeNoteTombstoneForUser(currentUserId, ts.id);
            } else {
              kept.push(ts);
            }
          }
          noteTombstones = kept;
        }
      }
    } catch (_) { notes = []; noteTombstones = []; }

    // P2 — Notatki kliniczne pacjenta: eksport ODSZYFROWANYCH rekordów (jak biblioteka N2).
    // Cały blob sync jest szyfrowany sync materiałem przez vilda_sync.js przed wysyłką.
    // Każda notatka niesie updatedAtISO → mergeSyncPayload robi LWW per-rekord.
    // patientId jest plaintext metadata (potrzebny do filtrowania bez deszyfracji full payloadu).
    // patientNoteTombstones (id+deletedAtISO) propagują usunięcia. Pola addytywne —
    // starszy klient ignoruje, nowszy czytający stary blob przyjmuje [].
    let patientNotes = [];
    let patientNoteTombstones = [];
    try {
      const _adp = getAdapter();
      if (_adp && typeof _adp.listPatientNotesForUser === 'function') {
        const pnRaw = await _adp.listPatientNotesForUser(currentUserId);
        for (let n = 0; n < pnRaw.length; n += 1) {
          const decoded = await _decryptPatientNoteRecord(pnRaw[n]);
          patientNotes.push(decoded);
        }
      }
      if (_adp && typeof _adp.listPatientNoteTombstonesForUser === 'function') {
        patientNoteTombstones = await _adp.listPatientNoteTombstonesForUser(currentUserId);
        // GC: przytnij stare tombstones (TTL jak dla pacjentów / N2).
        if (typeof _adp.removePatientNoteTombstoneForUser === 'function' && patientNoteTombstones.length) {
          const cutoffISO = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
          const kept = [];
          for (let t = 0; t < patientNoteTombstones.length; t += 1) {
            const ts = patientNoteTombstones[t];
            if (ts && ts.deletedAtISO && ts.deletedAtISO < cutoffISO) {
              await _adp.removePatientNoteTombstoneForUser(currentUserId, ts.id);
            } else {
              kept.push(ts);
            }
          }
          patientNoteTombstones = kept;
        }
      }
    } catch (_) { patientNotes = []; patientNoteTombstones = []; }

    return {
      schemaVersion:           SCHEMA_VERSION,
      userId:                  currentUserId,
      label:                   currentUserLabel,
      exportedAtISO:           new Date().toISOString(),
      patients:                fullPatients,
      tombstones:              Array.isArray(tombstones) ? tombstones : [],
      // Substep D — additive fields, starsze klienty ignorują.
      passkeys:                passkeyMetadata,
      passkeyTombstones:       passkeyTombstones,
      // Substep E3 — cloud-synced user preferences.
      userPreferences:         userPreferences,
      // N2 — Notatki (biblioteka szablonów lekarza).
      notes:                   Array.isArray(notes) ? notes : [],
      noteTombstones:          Array.isArray(noteTombstones) ? noteTombstones : [],
      // P2 — Notatki kliniczne pacjenta (z dueDateISO dla followup).
      patientNotes:            Array.isArray(patientNotes) ? patientNotes : [],
      patientNoteTombstones:   Array.isArray(patientNoteTombstones) ? patientNoteTombstones : []
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

    // Substep D — merge passkey metadata + tombstones.
    // Strategia LWW (last-write-wins): tombstone z nowszym deletedAtISO bije
    // local passkey entry. Brak edycji "modyfikuje" passkey, więc nie ma konfliktu
    // analogicznego do patient editAt — passkeyTombstone zawsze wygrywa.
    //
    // Przyjmowane fields:
    //   • incoming passkeys: { credentialId, deviceLabel, createdAtISO, roaming }
    //   • incoming passkeyTombstones: { credentialId, deletedAtISO }
    //
    // Side effects na local meta.passkeys:
    //   • Tombstone z payloadu → usuń matching local entry (włącznie z crypto material!)
    //   • Remote passkey nie w local meta → dodaj BEZ encryptedMasterByPasskey
    //     (UI rozpozna "remote" gdy brak tego pola)
    //   • Local passkey który jest też remote → zostaw (z lokalnym crypto)
    let addedPasskeyCount   = 0;
    let removedPasskeyCount = 0;
    try {
      const incomingPasskeys = Array.isArray(rawData.passkeys) ? rawData.passkeys : [];
      const incomingPkTombs  = Array.isArray(rawData.passkeyTombstones) ? rawData.passkeyTombstones : [];

      const localMeta = await getAdapter().getUserMeta(currentUserId);
      if (localMeta) {
        let localPasskeys = Array.isArray(localMeta.passkeys) ? localMeta.passkeys.slice() : [];
        let localTombs = Array.isArray(localMeta.passkeyTombstones) ? localMeta.passkeyTombstones.slice() : [];

        // Merge tombstones — union, dedupe po credentialId, keep latest deletedAtISO.
        const tombByCredId = Object.create(null);
        localTombs.forEach(function (t) {
          if (t && t.credentialId) tombByCredId[t.credentialId] = t.deletedAtISO || '';
        });
        incomingPkTombs.forEach(function (t) {
          if (!t || !t.credentialId) return;
          const cur = tombByCredId[t.credentialId] || '';
          if (!cur || (t.deletedAtISO && t.deletedAtISO > cur)) {
            tombByCredId[t.credentialId] = t.deletedAtISO || '';
          }
        });
        // GC: przytnij stare tombstones (TTL).
        const cutoffISO = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
        const mergedTombs = [];
        Object.keys(tombByCredId).forEach(function (cid) {
          const iso = tombByCredId[cid];
          if (iso && iso >= cutoffISO) mergedTombs.push({ credentialId: cid, deletedAtISO: iso });
        });

        // Apply tombstones: usuń lokalne passkey które mają tombstone.
        const tombSet = new Set(mergedTombs.map(function (t) { return t.credentialId; }));
        const beforeRemove = localPasskeys.length;
        localPasskeys = localPasskeys.filter(function (p) { return !tombSet.has(p.credentialId); });
        removedPasskeyCount = beforeRemove - localPasskeys.length;

        // Add remote passkeys które nie są ani w local, ani tombstoned.
        const localCredIds = new Set(localPasskeys.map(function (p) { return p.credentialId; }));
        incomingPasskeys.forEach(function (rp) {
          if (!rp || !rp.credentialId) return;
          if (localCredIds.has(rp.credentialId)) return; // już mamy lokalny entry
          if (tombSet.has(rp.credentialId)) return;       // tombstoned
          // Dodaj jako remote entry — BEZ encryptedMasterByPasskey (nie mamy
          // crypto material). UI rozpozna remote po typeof !== 'object' || !p.encryptedMasterByPasskey.
          localPasskeys.push({
            credentialId: rp.credentialId,
            deviceLabel:  rp.deviceLabel || '(inne urządzenie)',
            createdAtISO: rp.createdAtISO || new Date().toISOString(),
            roaming:      rp.roaming === true
            // Brak encryptedMasterByPasskey — to znaczy "remote, tylko metadata".
          });
          addedPasskeyCount++;
        });

        // Zapisz updated meta gdy cokolwiek się zmieniło.
        if (addedPasskeyCount > 0 || removedPasskeyCount > 0 ||
            mergedTombs.length !== (Array.isArray(localMeta.passkeyTombstones) ? localMeta.passkeyTombstones.length : 0)) {
          await getAdapter().putUserMeta(currentUserId, Object.assign({}, localMeta, {
            passkeys:          localPasskeys,
            passkeyTombstones: mergedTombs
          }));
          // Sync passkeyCount w registry (D.1).
          await _syncPasskeyCount(currentUserId);
        }
      }
    } catch (_) { /* sync bez passkey merge — zachowanie wsteczne */ }

    // Substep E3 — merge userPreferences z LWW (last-write-wins po timestamp).
    // Dla każdej zdalnej preferencji nowszej od lokalnej:
    //   1) Update meta.userPreferences[key] = remote entry
    //   2) Apply do localStorage cache przez VildaPersistence.applyPreferenceFromCloud
    //      (zapisuje do real localStorage BEZ triggera onPreferenceWrite callback —
    //       zapobiega pętli push↔pull)
    let updatedPreferenceCount = 0;
    try {
      const incomingPrefs = (rawData && typeof rawData.userPreferences === 'object' && rawData.userPreferences) || {};
      const incomingKeys = Object.keys(incomingPrefs);
      if (incomingKeys.length > 0) {
        const localMetaForPrefs = await getAdapter().getUserMeta(currentUserId);
        if (localMetaForPrefs) {
          const localPrefs = (localMetaForPrefs.userPreferences && typeof localMetaForPrefs.userPreferences === 'object')
            ? Object.assign({}, localMetaForPrefs.userPreferences)
            : {};
          let metaChanged = false;
          for (let i = 0; i < incomingKeys.length; i++) {
            const k = incomingKeys[i];
            const remote = incomingPrefs[k];
            if (!remote || typeof remote !== 'object' || !remote.updatedAtISO) continue;
            const local = localPrefs[k];
            // LWW: zdalna wartość wygrywa gdy lokalnej nie ma LUB zdalna jest nowsza.
            if (!local || !local.updatedAtISO || remote.updatedAtISO > local.updatedAtISO) {
              localPrefs[k] = { value: String(remote.value), updatedAtISO: remote.updatedAtISO };
              metaChanged = true;
              updatedPreferenceCount++;
              // Apply do localStorage cache.
              try {
                if (global.VildaPersistence && typeof global.VildaPersistence.applyPreferenceFromCloud === 'function') {
                  global.VildaPersistence.applyPreferenceFromCloud(k, remote.value);
                }
              } catch (_) { void _; }
            }
          }
          if (metaChanged) {
            await getAdapter().putUserMeta(currentUserId, Object.assign({}, localMetaForPrefs, {
              userPreferences: localPrefs
            }));
          }
        }
      }
    } catch (_) { /* sync bez preference merge — zachowanie wsteczne */ }

    // ── N2 — merge Notatek (LWW per-rekord po updatedAtISO + tombstones) ────────
    // Analogicznie do pacjentów: notatka jest USUNIĘTA gdy najnowszy tombstone
    // (lokalny ∪ przychodzący) jest nie starszy niż najnowsza edycja (updatedAtISO).
    // Nowsza edycja niż usunięcie → resurrect. Dla żywych notatek: zdalna wygrywa
    // gdy jej updatedAtISO jest nowszy niż lokalny (lub lokalnej brak).
    let addedNoteCount = 0;
    let updatedNoteCount = 0;
    let deletedNoteCount = 0;
    try {
      const _na = getAdapter();
      const _notesSupported = _na
        && typeof _na.listNotesForUser === 'function'
        && typeof _na.putNoteForUser === 'function'
        && typeof _na.removeNoteForUser === 'function';
      if (_notesSupported) {
        const incomingNotes = Array.isArray(rawData.notes) ? rawData.notes : [];
        const incomingNoteTombs = Array.isArray(rawData.noteTombstones) ? rawData.noteTombstones : [];
        const localNotesRaw = await _na.listNotesForUser(currentUserId);
        const localNoteTombs = (typeof _na.listNoteTombstonesForUser === 'function')
          ? (await _na.listNoteTombstonesForUser(currentUserId)) : [];

        // updatedAtISO lokalnych notatek (plaintext na rekordzie — bez deszyfrowania).
        const localById = Object.create(null);
        localNotesRaw.forEach(function (r) { if (r && r.id) localById[r.id] = r; });

        const nDeleteAt = Object.create(null);
        function _nDel(id, iso) { if (!id || !iso) return; if (!nDeleteAt[id] || iso > nDeleteAt[id]) nDeleteAt[id] = iso; }
        incomingNoteTombs.forEach(function (t) { if (t) _nDel(t.id, t.deletedAtISO); });
        localNoteTombs.forEach(function (t) { if (t) _nDel(t.id, t.deletedAtISO); });

        const nEditAt = Object.create(null);
        function _nEdit(id, iso) { if (!id || !iso) return; if (!nEditAt[id] || iso > nEditAt[id]) nEditAt[id] = iso; }
        localNotesRaw.forEach(function (r) { if (r) _nEdit(r.id, r.updatedAtISO); });
        incomingNotes.forEach(function (n) { if (n) _nEdit(n.id, n.updatedAtISO); });

        const nDeletedIds = new Set();
        Object.keys(nDeleteAt).forEach(function (id) {
          const ed = nEditAt[id] || null;
          if (!ed || nDeleteAt[id] >= ed) nDeletedIds.add(id);
        });

        // Scal żywe notatki przychodzące.
        for (let i = 0; i < incomingNotes.length; i += 1) {
          const rn = incomingNotes[i];
          if (!rn || !rn.id || !rn.updatedAtISO) continue;
          if (nDeletedIds.has(rn.id)) continue; // usunięta nowszym tombstonem
          const local = localById[rn.id];
          const isNewer = !local || !local.updatedAtISO || rn.updatedAtISO > local.updatedAtISO;
          if (!isNewer) continue;
          // Sanityzacja defensywna (zdalny klient mógł być starszy bez sanityzacji).
          const content = {
            title: sanitizeNoteText(typeof rn.title === 'string' ? rn.title : ''),
            category: normalizeNoteCategory(rn.category),
            body: sanitizeNoteText(typeof rn.body === 'string' ? rn.body : ''),
            pinned: rn.pinned === true,
            order: Number.isFinite(rn.order) ? rn.order : 0
          };
          const noteCipher = await encryptPayloadForCurrentUser(content);
          await _na.putNoteForUser(currentUserId, {
            id: rn.id,
            noteCipher: noteCipher,
            createdAtISO: rn.createdAtISO || rn.updatedAtISO,
            updatedAtISO: rn.updatedAtISO
          });
          if (local) updatedNoteCount++; else addedNoteCount++;
        }

        // Zastosuj tombstones: usuń lokalne dane + utrwal znacznik (propagacja dalej).
        if (typeof _na.putNoteTombstoneForUser === 'function') {
          const _delList = Array.from(nDeletedIds);
          for (let d = 0; d < _delList.length; d += 1) {
            const id = _delList[d];
            if (localById[id]) {
              await _na.removeNoteForUser(currentUserId, id);
              deletedNoteCount++;
            }
            await _na.putNoteTombstoneForUser(currentUserId, { id: id, deletedAtISO: nDeleteAt[id] });
          }
          // Przedawnione tombstones lokalne (notatka ożyła nowszą edycją) — zdejmij.
          if (typeof _na.removeNoteTombstoneForUser === 'function') {
            for (let k = 0; k < localNoteTombs.length; k += 1) {
              const lt = localNoteTombs[k];
              if (lt && lt.id && !nDeletedIds.has(lt.id)) {
                await _na.removeNoteTombstoneForUser(currentUserId, lt.id);
              }
            }
          }
        }
      }
    } catch (_) { /* sync bez note merge — zachowanie wsteczne */ }

    // P2 — Notatki kliniczne pacjenta: LWW per-rekord, identyczna semantyka jak N2.
    // Różnice względem biblioteki notes:
    //   • patientId       — plaintext metadata (zachowujemy przy zapisie)
    //   • category        — plaintext metadata (poza encrypted content)
    //   • dueDateISO      — plaintext metadata (poza encrypted content)
    //   • linkedAgeMonths — plaintext metadata (B1.0 — kotwica do wieku wizyty)
    //   • encrypted content tylko { title, body }
    let addedPatientNoteCount = 0;
    let updatedPatientNoteCount = 0;
    let deletedPatientNoteCount = 0;
    try {
      const _pna = getAdapter();
      const _pnSupported = _pna
        && typeof _pna.listPatientNotesForUser === 'function'
        && typeof _pna.putPatientNoteForUser === 'function'
        && typeof _pna.removePatientNoteForUser === 'function';
      if (_pnSupported) {
        const incomingPn = Array.isArray(rawData.patientNotes) ? rawData.patientNotes : [];
        const incomingPnTombs = Array.isArray(rawData.patientNoteTombstones) ? rawData.patientNoteTombstones : [];
        const localPnRaw = await _pna.listPatientNotesForUser(currentUserId);
        const localPnTombs = (typeof _pna.listPatientNoteTombstonesForUser === 'function')
          ? (await _pna.listPatientNoteTombstonesForUser(currentUserId)) : [];

        // updatedAtISO lokalnych notatek (plaintext na rekordzie — bez deszyfrowania).
        const localPnById = Object.create(null);
        localPnRaw.forEach(function (r) { if (r && r.id) localPnById[r.id] = r; });

        const pnDeleteAt = Object.create(null);
        function _pnDel(id, iso) { if (!id || !iso) return; if (!pnDeleteAt[id] || iso > pnDeleteAt[id]) pnDeleteAt[id] = iso; }
        incomingPnTombs.forEach(function (t) { if (t) _pnDel(t.id, t.deletedAtISO); });
        localPnTombs.forEach(function (t) { if (t) _pnDel(t.id, t.deletedAtISO); });

        const pnEditAt = Object.create(null);
        function _pnEdit(id, iso) { if (!id || !iso) return; if (!pnEditAt[id] || iso > pnEditAt[id]) pnEditAt[id] = iso; }
        localPnRaw.forEach(function (r) { if (r) _pnEdit(r.id, r.updatedAtISO); });
        incomingPn.forEach(function (n) { if (n) _pnEdit(n.id, n.updatedAtISO); });

        const pnDeletedIds = new Set();
        Object.keys(pnDeleteAt).forEach(function (id) {
          const ed = pnEditAt[id] || null;
          if (!ed || pnDeleteAt[id] >= ed) pnDeletedIds.add(id);
        });

        // Scal żywe notatki przychodzące.
        for (let i = 0; i < incomingPn.length; i += 1) {
          const rpn = incomingPn[i];
          if (!rpn || !rpn.id || !rpn.updatedAtISO) continue;
          if (pnDeletedIds.has(rpn.id)) continue; // usunięta nowszym tombstonem
          if (typeof rpn.patientId !== 'string' || !rpn.patientId.length) continue; // bez pacjenta odrzucamy
          const local = localPnById[rpn.id];
          const isNewer = !local || !local.updatedAtISO || rpn.updatedAtISO > local.updatedAtISO;
          if (!isNewer) continue;
          // Sanityzacja defensywna + normalizacja kategorii/dueDate.
          const content = {
            title: sanitizeNoteText(typeof rpn.title === 'string' ? rpn.title : ''),
            body: sanitizeNoteText(typeof rpn.body === 'string' ? rpn.body : '')
          };
          const bodyCipher = await encryptPayloadForCurrentUser(content);
          await _pna.putPatientNoteForUser(currentUserId, {
            id: rpn.id,
            patientId: rpn.patientId,
            bodyCipher: bodyCipher,
            category: normalizePatientNoteCategory(rpn.category),
            dueDateISO: normalizeDueDateISO(rpn.dueDateISO),
            // B1.0: completedAtISO + linkedAgeMonths z payloadu sync (LWW
            // newer wins — poprzedni check isNewer już to gwarantuje).
            completedAtISO: normalizeCompletedAtISO(rpn.completedAtISO),
            linkedAgeMonths: normalizeLinkedAgeMonths(rpn.linkedAgeMonths),
            createdAtISO: rpn.createdAtISO || rpn.updatedAtISO,
            updatedAtISO: rpn.updatedAtISO
          });
          if (local) updatedPatientNoteCount++; else addedPatientNoteCount++;
        }

        // Zastosuj tombstones: usuń lokalne dane + utrwal znacznik (propagacja dalej).
        if (typeof _pna.putPatientNoteTombstoneForUser === 'function') {
          const _delList = Array.from(pnDeletedIds);
          for (let d = 0; d < _delList.length; d += 1) {
            const id = _delList[d];
            if (localPnById[id]) {
              await _pna.removePatientNoteForUser(currentUserId, id);
              deletedPatientNoteCount++;
            }
            await _pna.putPatientNoteTombstoneForUser(currentUserId, { id: id, deletedAtISO: pnDeleteAt[id] });
          }
          // Przedawnione tombstones lokalne (notatka ożyła nowszą edycją) — zdejmij.
          if (typeof _pna.removePatientNoteTombstoneForUser === 'function') {
            for (let k = 0; k < localPnTombs.length; k += 1) {
              const lt = localPnTombs[k];
              if (lt && lt.id && !pnDeletedIds.has(lt.id)) {
                await _pna.removePatientNoteTombstoneForUser(currentUserId, lt.id);
              }
            }
          }
        }
      }
    } catch (_) { /* sync bez patient note merge — zachowanie wsteczne */ }

    return {
      mergedPatientCount,
      addedPatientCount,
      addedSnapshotCount,
      skippedSnapshotCount,
      deletedPatientCount,
      // Substep D — informacja zwrotna o pasknigerge'u (do diagnostyki UI).
      addedPasskeyCount,
      removedPasskeyCount,
      // Substep E3 — informacja zwrotna o preference merge.
      updatedPreferenceCount,
      // N2 — informacja zwrotna o note merge.
      addedNoteCount,
      updatedNoteCount,
      deletedNoteCount,
      // P2 — informacja zwrotna o patient note merge.
      addedPatientNoteCount,
      updatedPatientNoteCount,
      deletedPatientNoteCount
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

  // ============ EVENT onNoteChanged (moduł Notatki — N1) ============
  // Informuje po zapisie/usunięciu notatki. N2 (sync) podłączy tu debounced push;
  // N4 (UI) użyje do odświeżania listy. payload: { id, action: 'save'|'delete' }.
  const onNoteChangedListeners = [];
  function onNoteChanged(fn) {
    if (typeof fn === 'function') onNoteChangedListeners.push(fn);
  }
  function notifyNoteChanged(info) {
    onNoteChangedListeners.forEach(function (fn) {
      try { fn(info); } catch (_) { /* listener errors swallowed */ }
    });
  }

  // ============ EVENT onPatientNoteChanged (moduł Pacjenci — P1) ============
  // Analogiczny do onNoteChanged, ale dla notatek klinicznych powiązanych z pacjentem.
  // Sync (P2) będzie nasłuchiwać na ten event i wysyłać debounced push do chmury.
  const onPatientNoteChangedListeners = [];
  function onPatientNoteChanged(fn) {
    if (typeof fn === 'function') onPatientNoteChangedListeners.push(fn);
  }
  function notifyPatientNoteChanged(info) {
    onPatientNoteChangedListeners.forEach(function (fn) {
      try { fn(info); } catch (_) { /* listener errors swallowed */ }
    });
  }

  // ============ EVENT onPreferenceChanged (Substep E2) ============
  // Informuje gdy preferencja oznaczona jako 'cloud-synced' zmienia się lokalnie.
  // VildaSyncIntegration będzie używać tego eventu do debounced syncPush (E3).
  // Bridge: VildaPersistence.onPreferenceWrite(callback) → notifyPreferenceChanged.
  // W E2 sam event istnieje, ale syncPush jeszcze nie jest wired — to przyjdzie w E3.
  const onPreferenceChangedListeners = [];
  function onPreferenceChanged(fn) {
    if (typeof fn === 'function') onPreferenceChangedListeners.push(fn);
  }
  function notifyPreferenceChanged(info) {
    onPreferenceChangedListeners.forEach(function (fn) {
      try { fn(info); } catch (_) { /* listener errors swallowed */ }
    });
  }

  // Substep E3 — async helper aktualizujący meta.userPreferences. Wołany przez
  // bridge przy każdej zmianie cloud-synced preferencji. meta.userPreferences ma
  // shape: { [key]: { value: string, updatedAtISO: string } } — LWW timestamp
  // pozwala mergeSyncPayload rozstrzygnąć konflikty między urządzeniami.
  // No-op gdy vault zablokowany (preference change przed loginem → ignorujemy,
  // bo nie wiemy któremu userowi przypisać).
  async function _updatePreferenceMeta(key, value) {
    try {
      if (!isUnlocked() || !currentUserId) return null;
      const meta = await getAdapter().getUserMeta(currentUserId);
      if (!meta) return null;
      const userPrefs = (meta && typeof meta.userPreferences === 'object' && meta.userPreferences) || {};
      const nowISO = new Date().toISOString();
      userPrefs[key] = { value: String(value), updatedAtISO: nowISO };
      await getAdapter().putUserMeta(currentUserId, { ...meta, userPreferences: userPrefs });
      return nowISO;
    } catch (_) {
      return null;
    }
  }

  // Bridge: rejestracja listenera w persistence adapter. Wywoływane lazy żeby
  // adapter był załadowany. Async kolejność: NAJPIERW update meta, POTEM notify
  // listeners — gwarantuje że syncPush (debounced w integration) zobaczy świeży
  // userPreferences z timestamp.
  (function _wirePersistenceBridge() {
    try {
      if (global.VildaPersistence && typeof global.VildaPersistence.onPreferenceWrite === 'function') {
        global.VildaPersistence.onPreferenceWrite(async function (info) {
          if (!info || !info.key) return;
          // 1) Update meta.userPreferences — wymagane PRZED notify, żeby
          // exportSyncPayload (w syncPush) widziało nową wartość.
          await _updatePreferenceMeta(info.key, info.value);
          // 2) Notify listeners (vilda_sync_integration triggeruje debounced syncPush).
          notifyPreferenceChanged(info);
        });
      }
    } catch (_) { void _; }
  })();

  // ============ EVENT onPasskeyChanged (Substep D) ============
  // Informuje po registerPasskey/removePasskey/registerPasskeyForRoaming, żeby
  // VildaSyncIntegration wypushowała stan (passkey metadata + tombstones) do
  // innych urządzeń. Bez tego eventu sync push nigdy nie był triggerowany po
  // operacjach passkey — co powodowało że Mac registrował passkey lokalnie,
  // ale iPhone w cloud-only nigdy nie dostawał update'u.
  const onPasskeyChangedListeners = [];
  function onPasskeyChanged(fn) {
    if (typeof fn === 'function') onPasskeyChangedListeners.push(fn);
  }
  function notifyPasskeyChanged(info) {
    onPasskeyChangedListeners.forEach(function (fn) {
      try { fn(info); } catch (_) { /* listener errors swallowed */ }
    });
    // Best-effort direct push dla scenariuszy gdzie integration nie jest aktywna
    // (np. ephemeral, brak sync_integration na podstronie). Cicho ignorujemy błąd.
    try {
      if (global.VildaSync && typeof global.VildaSync.syncPush === 'function') {
        Promise.resolve(global.VildaSync.syncPush()).catch(function () {});
      }
    } catch (_) { void _; }
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
   * Synchronizuje pole `passkeyCount` w registry z aktualną liczbą passkeys w meta.
   * Wołane po każdej operacji modyfikującej meta.passkeys (register/registerRoaming/remove).
   * Failure mode: log error i kontynuuj — passkey-flow nie powinno się sypać przez
   * niepowodzenie aktualizacji liczników widoczności w UI.
   *
   * @param {string} userId
   * @returns {Promise<number>} faktyczna liczba passkeys po sync (0 jeśli brak meta)
   */
  async function _syncPasskeyCount(userId) {
    try {
      const meta = await getAdapter().getUserMeta(userId);
      const count = (meta && Array.isArray(meta.passkeys)) ? meta.passkeys.length : 0;
      await getAdapter().updateRegistryEntry(userId, { passkeyCount: count });
      return count;
    } catch (e) {
      try { console.warn('[vault] _syncPasskeyCount failed for ' + userId + ':', e && e.message); } catch (_) {}
      return -1;
    }
  }


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

    // Substep B + N10.1: anti-duplicate. Pobierz istniejące credentialIds tego usera —
    // browser z excludeCredentials zapobiegnie podwójnej rejestracji na tym
    // samym authenticatorze (zwraca InvalidStateError).
    //
    // N10.1: Filtrujemy WYŁĄCZNIE local entries (z encryptedMasterByPasskey).
    // Remote (zsynchronizowane przez cloud sync metadata) NIE są tu istotne —
    // ich obecność w excludeCredentials prowadziłaby do fałszywego InvalidStateError
    // na drugim urządzeniu Apple (iPhone) bo iCloud Keychain sync sprawia że
    // Mac's credential jest WIDOCZNY w iPhone's Keychain. To wymaga osobnej
    // ścieżki: adoptSyncedPasskey (N10.2) zamiast nowej rejestracji.
    const existingMetaForExclude = await getAdapter().getUserMeta(userId);
    const allPasskeys = (existingMetaForExclude && Array.isArray(existingMetaForExclude.passkeys))
      ? existingMetaForExclude.passkeys
      : [];
    const localPasskeys = allPasskeys.filter(function (p) {
      // Lokalny = ma encryptedMasterByPasskey (potrafimy go odszyfrować PRF-em tego urządzenia).
      return p && p.encryptedMasterByPasskey && p.encryptedMasterByPasskey.iv;
    });
    const remotePasskeys = allPasskeys.filter(function (p) {
      return p && !p.encryptedMasterByPasskey;
    });
    // Jeśli WSZYSTKIE existing passkeys są remote-only (zsynchronizowane z innego
    // urządzenia), nowa rejestracja na tym urządzeniu jest semantycznie błędna —
    // userowi należy się ADOPCJA istniejącego credentiala, nie tworzenie duplikatu
    // (i tak byłoby blokowane przez Apple iCloud Keychain anti-syndication).
    if (localPasskeys.length === 0 && remotePasskeys.length > 0) {
      const err = new Error('Masz już biometrię dla tego konta zsynchronizowaną z innego urządzenia (przez iCloud Keychain). Aktywuj ją na tym urządzeniu zamiast rejestrować nową.');
      err.code = 'PASSKEY_NEEDS_ADOPTION';
      err.adoptableCredentialIds = remotePasskeys.map(function (p) { return p.credentialId; });
      throw err;
    }
    const existingCredIds = localPasskeys.map(function (p) { return p.credentialId; }).filter(Boolean);

    // 1. Rejestracja passkey + odbiór PRF secret z create.
    // deviceLabel (label) jest też przekazywane do crypto — staje się częścią
    // user.name w WebAuthn → widoczne jako "dr Maciej · MacBook" w Apple Passwords
    // / Google Password Manager. Bez tego, klucze z różnych urządzeń wyglądały
    // identycznie (po prostu "dr Maciej") i user nie wiedział który jest który.
    //
    // UWAGA (N9): PRF z create() jest niespójny z PRF z get() na części
    // authenticatorów — m.in. iCloud Keychain potrafi dawać różne wartości
    // na różnych urządzeniach Apple dla tego samego synced credentiala.
    // Skutek: klucz wrappujący wyprowadzony z create-PRF działa na urządzeniu
    // rejestracji, ale NIE działa cross-device (iPhone nie odszyfruje koperty
    // zrobionej na Macu). Dlatego prfSecretBytes z create() IGNORUJEMY —
    // używany jest tylko do potwierdzenia że PRF jest w ogóle wspierany.
    // Stabilny PRF pobierany jest niżej osobnym wywołaniem get().
    let credentialId;
    try {
      ({ credentialId } = await C.createPasskeyAndGetPrfSecret(
        userId, rpId, currentUserLabel, label, existingCredIds
      ));
    } catch (e) {
      // InvalidStateError — passkey już istnieje na tym authenticatorze (excludeCredentials hit).
      // Mapujemy na user-friendly komunikat z code, żeby UI w Ustawieniach mogło to ładnie
      // wyświetlić zamiast generycznego "failed to create passkey".
      if (e && e.name === 'InvalidStateError') {
        const err = new Error('Na tym urządzeniu jest już zarejestrowana biometria dla tego konta.');
        err.code = 'PASSKEY_ALREADY_EXISTS';
        throw err;
      }
      throw e;
    }

    // 2. Stabilny PRF z get() — TEN sam mechanizm co przy logowaniu (unlockWithPasskey),
    // dzięki czemu wrapping i unwrapping zawsze używają tego samego sekretu.
    // Wymaga drugiego promptu biometrycznego po create — to znana niedogodność,
    // ale jest niezbędna do cross-device unlock (Mac registracja → iPhone login).
    // Bez sygnału abort: registracja powinna dokończyć się w jednym przepływie.
    const { prfSecretBytes: stablePrfSecretBytes } = await C.getPasskeyPrfSecret(
      credentialId, rpId, null
    );

    // 3. Klucz wrappujący z STABILNEGO PRF secret (HKDF-SHA256)
    const wrappingKey = await C.deriveKeyFromPrfSecret(stablePrfSecretBytes);

    // 4. Zaszyfruj master key tym kluczem
    const encryptedMasterByPasskey = await C.encryptBytes(wrappingKey, masterKeyBytes);

    // 5. Dopisz passkey do meta-rekordu z wrapVersion: 2 (stabilny get-PRF wrapping)
    const meta = await getAdapter().getUserMeta(userId);
    const passkeys = Array.isArray(meta.passkeys) ? meta.passkeys : [];
    passkeys.push({
      credentialId:             credentialId,
      deviceLabel:              label,
      createdAtISO:             new Date().toISOString(),
      encryptedMasterByPasskey: encryptedMasterByPasskey,
      // wrapVersion 2 = klucz wrappujący wyprowadzony z PRF z get() (spójny
      // z logowaniem i cross-device przez iCloud Keychain). Brak pola / 1 =
      // starsza koperta sprzed N9 (potencjalnie create-PRF, fails cross-device).
      wrapVersion:              2
    });
    await getAdapter().putUserMeta(userId, { ...meta, passkeys });
    // D.1: aktualizuj passkeyCount w registry → user-picker pokaże badge "🔐 Touch ID".
    await _syncPasskeyCount(userId);
    // Substep D fix: trigger sync push tak żeby inne urządzenia dostały passkey metadata.
    notifyPasskeyChanged({ action: 'register', credentialId: credentialId });

    return { credentialId, deviceLabel: label };
  }

  /**
   * N10.2 — Adopcja zsynchronizowanego passkey na BIEŻĄCYM urządzeniu.
   *
   * Use case (Apple iCloud Keychain):
   *   1. Mac rejestruje Touch ID (registerPasskey) → meta.passkeys = [{M_CRED, encryptedMasterByPasskey}]
   *   2. Mac syncuje metadata do chmury → cloud przechowuje { credentialId, deviceLabel, ... }
   *      ale NIE encryptedMasterByPasskey (device-specific crypto material).
   *   3. iPhone pulluje meta z chmury → meta.passkeys = [{M_CRED, brak encryptedMasterByPasskey}]
   *   4. iPhone NIE może odblokować vault biometrią — brak crypto material lokalnie.
   *   5. iCloud Keychain syncuje sam credential (klucz prywatny) na iPhone'a, ale Apple
   *      PRF jest per-device-not-shared — Mac's encryptedMasterByPasskey jest nie do
   *      odszyfrowania z iPhone's get-PRF.
   *
   * adoptSyncedPasskey rozwiązuje to: user (zalogowany hasłem na iPhonie) potwierdza
   * adopcję → wywołujemy `getPasskeyPrfSecret(credentialId)` → iPhone's Face ID prompt →
   * dostajemy iPhone's stabilny get-PRF → wrappujemy masterKeyBytes tym PRF →
   * zapisujemy jako encryptedMasterByPasskey lokalnie w meta entry. Od teraz iPhone
   * może odblokowywać vault biometrią używając TEGO SAMEGO credentiala co Mac
   * (iCloud Keychain go widzi), ale ze SWOIM własnym wrappingiem.
   *
   * NIE syncujemy żadnej zmiany do chmury — encryptedMasterByPasskey JEST device-local.
   *
   * @param {string} credentialId  — base64url id passkey do adopcji
   * @returns {Promise<{credentialId, deviceLabel, adoptedOnDeviceISO}>}
   */
  async function adoptSyncedPasskey(credentialId) {
    const C = getCrypto();
    if (!isUnlocked() || !masterKeyBytes) {
      throw new Error('Zaloguj się hasłem przed aktywacją biometrii.');
    }
    if (typeof credentialId !== 'string' || !credentialId.length) {
      throw new Error('adoptSyncedPasskey: brak credentialId.');
    }
    const userId = currentUserId;
    const rpId = window.location.hostname || 'localhost';

    const meta = await getAdapter().getUserMeta(userId);
    if (!meta || !Array.isArray(meta.passkeys)) {
      throw new Error('Brak metadanych użytkownika.');
    }
    const idx = meta.passkeys.findIndex(function (p) {
      return p && p.credentialId === credentialId;
    });
    if (idx < 0) {
      const err = new Error('adoptSyncedPasskey: passkey o tym credentialId nie istnieje w meta.');
      err.code = 'PASSKEY_NOT_FOUND';
      throw err;
    }
    const entry = meta.passkeys[idx];
    if (entry.encryptedMasterByPasskey && entry.encryptedMasterByPasskey.iv) {
      const err = new Error('Ten klucz biometryczny jest już aktywny na tym urządzeniu.');
      err.code = 'PASSKEY_ALREADY_ADOPTED';
      throw err;
    }

    // Pobierz stabilny get-PRF z TEGO urządzenia (Face ID/Touch ID prompt pojawi się tu).
    // To ten sam mechanizm co unlockWithPasskey — gwarancja symetrii encrypt↔decrypt.
    let stablePrfSecretBytes;
    try {
      ({ prfSecretBytes: stablePrfSecretBytes } = await C.getPasskeyPrfSecret(
        credentialId, rpId, null
      ));
    } catch (e) {
      // Mapowanie błędów na user-friendly UI:
      if (e && e.name === 'NotAllowedError') {
        const err = new Error('Aktywacja biometrii nie powiodła się — autoryzacja została anulowana lub nie powiodła się.');
        err.code = 'ADOPT_NOT_ALLOWED';
        throw err;
      }
      throw e;
    }

    const wrappingKey = await C.deriveKeyFromPrfSecret(stablePrfSecretBytes);
    const encryptedMasterByPasskey = await C.encryptBytes(wrappingKey, masterKeyBytes);

    // Update entry IN PLACE — dodaj crypto material + oznacz że adopcja zaszła.
    // wrapVersion: 2 jest spójny z registerPasskey po N9 (stabilny get-PRF wrapping).
    const updatedPasskeys = meta.passkeys.slice();
    updatedPasskeys[idx] = Object.assign({}, entry, {
      encryptedMasterByPasskey: encryptedMasterByPasskey,
      wrapVersion: 2,
      adoptedOnDeviceISO: new Date().toISOString()
    });
    await getAdapter().putUserMeta(userId, Object.assign({}, meta, { passkeys: updatedPasskeys }));

    // _syncPasskeyCount NIE zmienia się (passkey count to liczba passkeyów w meta,
    // a my nie dodaliśmy nowego ani nie usunęliśmy — tylko zaktualizowaliśmy entry).
    // notifyPasskeyChanged NIE wołamy — adopcja jest device-local, nie zmienia
    // metadanych widocznych w chmurze.

    return {
      credentialId: credentialId,
      deviceLabel: entry.deviceLabel || '(klucz zsynchronizowany)',
      adoptedOnDeviceISO: updatedPasskeys[idx].adoptedOnDeviceISO
    };
  }

  /**
   * N10.2 — Lista passkey'ów które są zsynchronizowane z innego urządzenia
   * i NIE są jeszcze aktywne lokalnie (mogą być zaadoptowane).
   * Używane przez post-login prompt w UI.
   *
   * @returns {Promise<Array<{credentialId, deviceLabel, createdAtISO}>>}
   */
  async function listAdoptablePasskeys() {
    if (!isUnlocked()) return [];
    const meta = await getAdapter().getUserMeta(currentUserId);
    if (!meta || !Array.isArray(meta.passkeys)) return [];
    return meta.passkeys
      .filter(function (p) { return p && !p.encryptedMasterByPasskey; })
      .map(function (p) {
        return {
          credentialId: p.credentialId,
          deviceLabel:  p.deviceLabel || '(klucz zsynchronizowany)',
          createdAtISO: p.createdAtISO
        };
      });
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

    // Substep B: anti-duplicate dla roaming. Tak samo jak w registerPasskey,
    // listujemy istniejące credentialIds przed wywołaniem crypto.
    const existingMetaForRoamExclude = await getAdapter().getUserMeta(userId);
    const existingRoamCredIds = (existingMetaForRoamExclude && Array.isArray(existingMetaForRoamExclude.passkeys))
      ? existingMetaForRoamExclude.passkeys.map(function (p) { return p.credentialId; }).filter(Boolean)
      : [];

    // 1. Passkey roaming (bez wymuszania platform) + klucz publiczny.
    // deviceLabel jest też przekazywane do crypto — Substep A: user.name w WebAuthn
    // staje się "dr Maciej · iPhone" zamiast tylko "dr Maciej", co rozróżnia roaming
    // klucze (np. telefonowe) od platform keys (Mac Touch ID) w OS password manager.
    let credentialId, publicKeyRawB64u, prfInputB64u;
    try {
      ({ credentialId, publicKeyRawB64u, prfInputB64u } =
        await C.createRoamingPasskeyAndGetPrfSecret(userId, rpId, currentUserLabel, label, existingRoamCredIds));
    } catch (e) {
      if (e && e.name === 'InvalidStateError') {
        const err = new Error('Na tym urządzeniu jest już zarejestrowana biometria dla tego konta.');
        err.code = 'PASSKEY_ALREADY_EXISTS';
        throw err;
      }
      throw e;
    }

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
    // D.1: aktualizuj passkeyCount w registry → user-picker pokaże badge "🔐 Touch ID".
    await _syncPasskeyCount(userId);
    // Substep D fix: trigger sync push.
    notifyPasskeyChanged({ action: 'register-roaming', credentialId: credentialId });

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

    // N10.4: Detect remote-only entry (zsynchronizowany metadata, brak crypto material).
    // Bez tego catch'a niżej krasz na entry.encryptedMasterByPasskey.iv (TypeError),
    // który byłby zinterpretowany jako PASSKEY_DECRYPT_FAILED — mylące UX bo to nie
    // jest decryption mismatch tylko BRAK encryptedMasterByPasskey w meta.
    // PASSKEY_NOT_LOCAL kieruje UI do flow adopcji (N10.2 adoptSyncedPasskey).
    if (!entry.encryptedMasterByPasskey || !entry.encryptedMasterByPasskey.iv) {
      const err = new Error('Ten klucz biometryczny jest zsynchronizowany z innego urządzenia, ale nie został jeszcze aktywowany tutaj. Zaloguj się hasłem i aktywuj biometrię na tym urządzeniu.');
      err.code = 'PASSKEY_NOT_LOCAL';
      err.credentialId = returnedId;
      throw err;
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

  /**
   * D.3 — Odblokuj vault przez conditional mediation (autofill UI dla passkey).
   *
   * Różnica względem unlockWithPasskey:
   *   • caller NIE zna upfront userId — discovers go z userHandle w asercji
   *   • przeglądarka pokazuje passkey w autofill UI (lub OS-level prompt) zamiast modal
   *   • allowCredentials puste, mediation:'conditional'
   *
   * Flow:
   *   1. crypto.getConditionalPasskeyAssertion() — wisi do user-pick (lub abort)
   *   2. Dekoduj userHandleBytes → userId (string utf-8)
   *   3. Znajdź meta tego usera, znajdź pasujący wpis passkey
   *   4. Odszyfruj master key sekretem PRF
   *   5. adoptMasterBytes + update lastLoginAtISO (jak unlockWithPasskey)
   *
   * Zwraca null gdy:
   *   • conditional UI niewspierane (Chrome < 108, Safari < 16, itd.)
   *   • signal abortowany przed userem
   *   • user nie wybrał (zamknął autofill bez akcji)
   *
   * @param {AbortSignal} [signal]
   * @returns {Promise<{userId: string, label: string} | null>}
   */
  async function unlockWithPasskeyConditional(signal) {
    const C = getCrypto();
    const rpId = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'localhost';

    // 1. Czekaj na user pick z autofill UI (lub null gdy brak wsparcia / abort)
    const assertion = await C.getConditionalPasskeyAssertion(rpId, signal || null);
    if (!assertion) return null;

    // Guard: race condition jak w unlockWithPasskey — abort mógł nadejść między
    // resolve credentials.get() a kontynuacją kodu.
    if (signal && signal.aborted) {
      const err = new Error('AbortError: conditional passkey aborted');
      err.name = 'AbortError';
      throw err;
    }

    // 2. userHandle (= userId zapisany w create) → string
    let userId;
    try {
      userId = new TextDecoder().decode(assertion.userHandleBytes);
    } catch (_) {
      throw new Error('Conditional UI: nie udało się odkodować userHandle z asercji.');
    }
    if (!userId || typeof userId !== 'string') {
      throw new Error('Conditional UI: pusty lub niepoprawny userHandle w asercji.');
    }

    // 3. Pobierz meta i znajdź pasujący wpis passkey
    const meta = await getAdapter().getUserMeta(userId);
    if (!meta || !Array.isArray(meta.passkeys) || !meta.passkeys.length) {
      throw new Error('Konto wybrane przez autofill nie istnieje lub nie ma zarejestrowanej biometrii.');
    }
    const entry = meta.passkeys.find(p => p.credentialId === assertion.credentialId);
    if (!entry) {
      throw new Error('Wybrany passkey nie pasuje do żadnego wpisu w lokalnym koncie.');
    }

    // 4. Odszyfruj master key tym sekretem PRF
    const wrappingKey = await C.deriveKeyFromPrfSecret(assertion.prfSecretBytes);
    let masterBytes;
    try {
      masterBytes = await C.decryptBytes(
        wrappingKey,
        entry.encryptedMasterByPasskey.iv,
        entry.encryptedMasterByPasskey.data
      );
    } catch (_) {
      const wv = (entry && typeof entry.wrapVersion === 'number') ? entry.wrapVersion : 1;
      const err = new Error('Nie udało się odblokować konta biometrią (conditional UI).');
      err.code = 'PASSKEY_CONDITIONAL_DECRYPT_FAILED';
      err.wrapVersion = wv;
      throw err;
    }

    // 5. Adopcja master + update lastLoginAtISO (identycznie jak unlockWithPasskey)
    const regEntry = await getAdapter().getRegistryEntry(userId);
    const label = (regEntry && regEntry.label) || 'Użytkownik';
    await adoptMasterBytes(masterBytes, userId, label);
    await getAdapter().updateRegistryEntry(userId, { lastLoginAtISO: new Date().toISOString() });

    return { userId: userId, label: label };
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

  // Współdzielony helper: pobranie masterBytes przez passkey (telefon przez hybrid).
  // Steps 0–5b z unlockWithPasskeyEphemeral — bez ŻADNEGO side-effectu (nie woła
  // setEphemeralMode, nie tworzy adaptera, nie woła adoptMasterBytes). Używany przez:
  //   • unlockWithPasskeyEphemeral — wrapuje w setEphemeralMode + adopcja do RAM,
  //   • unlockWithPasskeyAndPersist — wrapuje w utworzenie wpisu registry + meta.
  async function _acquirePasskeyMasterBytes(options) {
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

    // 5b. Inicjały — odszyfruj tym samym kluczem. Pokazujemy tylko inicjały na
    //     współdzielonym ekranie. Fallback: neutralna etykieta.
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
    } catch (_) { void _; }

    return { masterBytes: masterBytes, credentialId: asrt.credentialId, ephLabel: ephLabel };
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
    // 1. Świeży start NOWEJ sesji: usuń resztki veph: po poprzedniej sesji ZANIM
    //    utworzymy adapter — inaczej zhydratowałby cudze/stare dane.
    try { if (global.VildaPersistence && global.VildaPersistence.purgeEphemeralData) global.VildaPersistence.purgeEphemeralData(); } catch (_) { void _; }
    // Tryb efemeryczny — adapter in-memory utrwalany do veph:, nic trwałego na dysk.
    setEphemeralMode(true);

    // 2–5. Pobierz masterBytes przez passkey (shared helper).
    const acq = await _acquirePasskeyMasterBytes(options);

    // 6. Adopcja do RAM — bez zapisu meta na dysk (adapter in-memory).
    const userId = 'eph:' + acq.credentialId.slice(0, 32);
    await adoptMasterBytes(acq.masterBytes, userId, acq.ephLabel);

    // 7. Pobierz dane pacjentów z chmury do RAM. W trybie efemerycznym nic nie ma
    //    lokalnie, a normalny pull po onUnlock jest bramkowany isSyncEnabled — więc
    //    musimy go wymusić tutaj.
    await ephemeralSyncPull();

    return { ok: true, ephemeral: true, credentialId: acq.credentialId, userId: userId };
  }

  /**
   * Logowanie passkey + utworzenie LOKALNEGO konta — telefon dostarcza biometrią
   * masterKey, na tym komputerze tworzy się nowy wpis registry + meta (jak przy
   * completeQRLogin), zabezpieczone hasłem przekazanym przez auth_ui. Pozwala na:
   *   • storageMode = 'local' — pełna instalacja konta (kopia pacjentów lokalnie),
   *   • storageMode = 'cloud-only' — konto persyst (hasło), pacjenci tylko w chmurze.
   *
   * @param {string} password — nowe hasło do zaszyfrowania mastera (min. MIN_PASSWORD_LENGTH).
   * @param {{ credentialId?: string, signal?: AbortSignal, storageMode?: string, label?: string }} [options]
   * @returns {Promise<{ userId, label, recoveryKey, storageMode }>}
   */
  async function unlockWithPasskeyAndPersist(password, options) {
    if (isUnlocked()) {
      throw new Error('VildaVault.unlockWithPasskeyAndPersist: vault musi być zablokowany.');
    }
    assertStrongPassword(password, 'Hasło');
    const C = getCrypto();
    const opts = (options && typeof options === 'object') ? options : {};

    // Pobierz masterBytes przez passkey (shared helper z _ephemeral).
    const acq = await _acquirePasskeyMasterBytes(opts);

    // Utwórz lokalne konto (analogicznie do completeQRLogin):
    const userId = generateUserId();
    const iter = C.KDF_ITERATIONS;
    const passwordSalt = C.generateSalt();
    const recoverySalt = C.generateSalt();
    const recoveryKey  = C.generateRecoveryKey();

    const passwordWrappingKey = await C.deriveKey(password, passwordSalt, iter);
    const encryptedByPassword = await C.encryptBytes(passwordWrappingKey, acq.masterBytes);
    const recoveryWrappingKey = await C.deriveKeyFromRecoveryKey(recoveryKey, recoverySalt, iter);
    const encryptedByRecovery = await C.encryptBytes(recoveryWrappingKey, acq.masterBytes);

    let label = (typeof opts.label === 'string' && opts.label.trim().length) ? opts.label.trim() : '';
    if (!label) label = acq.ephLabel || DEFAULT_LABEL;

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
      restoredFromPasskey: true,
      needsPasswordReset: false
    };

    const storageMode = normalizeStorageMode(opts.storageMode);

    await getAdapter().putUserMeta(userId, meta);
    await getAdapter().putRegistryEntry({
      userId: userId,
      label: label,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO,
      storageMode: storageMode
    });

    _currentStorageModeCache = storageMode;
    await adoptMasterBytes(acq.masterBytes, userId, label);
    return { userId: userId, label: label, recoveryKey: recoveryKey, storageMode: storageMode };
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
      createdAtISO: p.createdAtISO,
      // Substep D — dodatkowe pola żeby UI rozróżniało rodzaje passkey.
      // roaming: cross-device (telefon przez QR), nie platform.
      roaming:      p.roaming === true,
      // isRemote: brak encryptedMasterByPasskey = passkey z innego device
      // (przyszedł przez sync metadata, nie ma crypto material żeby tu odblokować).
      // PRZED tym fixem UI sprawdzał `!k.encryptedMasterByPasskey`, ale to pole
      // było stripowane TUTAJ → wszystko wyglądało jak remote (bug).
      isRemote:     !p.encryptedMasterByPasskey
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
    // Substep D — passkey tombstone do propagacji usunięcia cross-device.
    // Każde usunięcie zapisuje credentialId + deletedAtISO w meta.passkeyTombstones.
    // Sync wysyła tombstones, inne urządzenia stosują je przy importSyncPayload.
    // Dzięki temu: user usuwa passkey iPhone na Macu → iPhone przy następnym sync
    // też skasuje tę biometrię (włącznie z encryptedMasterByPasskey).
    const existingTombs = Array.isArray(meta.passkeyTombstones) ? meta.passkeyTombstones.slice() : [];
    // Dodaj nowy tombstone (jeśli jeszcze nie ma dla tego credentialId).
    if (!existingTombs.some(function (t) { return t && t.credentialId === credentialId; })) {
      existingTombs.push({ credentialId: credentialId, deletedAtISO: new Date().toISOString() });
    }
    await getAdapter().putUserMeta(userId, { ...meta, passkeys: filtered, passkeyTombstones: existingTombs });
    // D.1: aktualizuj passkeyCount w registry — decrement po usunięciu passkey.
    await _syncPasskeyCount(userId);
    // Substep D fix: trigger sync push tak żeby tombstone trafił do innych urządzeń.
    notifyPasskeyChanged({ action: 'remove', credentialId: credentialId });
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
    // Kod v2 niesie PĘCZEK {dek, sis}: DEK = master (materiał danych), SIS =
    // aktualna tożsamość synchronizacji. Dzięki temu po rotacji nowe urządzenie
    // odtworzy WŁAŚCIWY slotId (a nie nieaktualny, wyprowadzony z samego mastera).
    return C.encryptSyncCodeBundle({ dek: masterKeyBytes, sis: sisBytes || masterKeyBytes }, password);
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

    // Odszyfruj PĘCZEK {dek, sis} z kodu synchronizacji (obsługuje vsc1 i vsc2).
    // DEK = master (materiał danych). SIS = tożsamość synchronizacji — dla kodów
    // vsc1 (legacy) SIS == master, dla vsc2 może być rotowanym sekretem.
    let masterBytes;     // = DEK
    let importedSis;     // = SIS z kodu
    try {
      const bundle = await C.decryptSyncCodeBundle(syncCode, password);
      masterBytes = bundle.dek;
      importedSis = bundle.sis;
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

    // Utrwal SIS z kodu OPAKOWANY masterKeyem ZANIM zawołamy adoptMasterBytes.
    // adoptMasterBytes → establishSis() znajdzie to pole i przyjmie zaimportowany
    // SIS (zamiast migrować na świeży SIS=master). Dzięki temu po rotacji nowe
    // urządzenie odtwarza WŁAŚCIWY slotId niesiony przez kod vsc2.
    try {
      const importedMasterKey = await C.importMasterKeyFromBytes(masterBytes);
      const wrappedSis = await C.encryptBytes(importedMasterKey, importedSis);
      meta.encryptedSisByMaster = {
        iv:   C.bytesToBase64(wrappedSis.iv),
        data: C.bytesToBase64(wrappedSis.data)
      };
      meta.bundleSchemaVersion = 1;
    } catch (_) {
      // Best-effort: jeśli się nie uda, establishSis() zmigruje SIS=master przy
      // adoptMasterBytes — slotId będzie zgodny wstecznie (poprawny dla kodów vsc1).
    }

    await getAdapter().putUserMeta(userId, meta);
    await getAdapter().putRegistryEntry({
      userId: userId,
      label: label,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO
    });

    await adoptMasterBytes(masterBytes, userId, label);
    if (importedSis) zeroBytes(importedSis);
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
    // Gdy newPassword jest podane, walidujemy strict (silne hasło). Pusty/brak → null
    // (vault generuje randomowe hasło, user MUSI je zmienić po loginie).
    let password = null;
    if (typeof opts.newPassword === 'string' && opts.newPassword.length > 0) {
      assertStrongPassword(opts.newPassword, 'Nowe hasło');
      password = opts.newPassword;
    }

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

    // storageMode konta zakładanego z QR — domyślnie 'local' (zachowanie wsteczne).
    // 'cloud-only' = scenariusz „komputer w pracy": konto persyst (hasło/recovery),
    // ale per-user adapter idzie do memory; pacjenci tylko w chmurze.
    const storageMode = normalizeStorageMode(opts.storageMode);

    await getAdapter().putUserMeta(userId, meta);
    await getAdapter().putRegistryEntry({
      userId: userId,
      label: label,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO,
      storageMode: storageMode
    });

    // Cache storageMode PRZED adoptMasterBytes (analogicznie jak w createUser).
    // adoptMasterBytes znów go odczyta z registry, ale to defence-in-depth.
    _currentStorageModeCache = storageMode;
    await adoptMasterBytes(masterBytes, userId, label);
    return {
      userId: userId,
      label: label,
      recoveryKey: recoveryKey,
      needsPasswordReset: !password,
      storageMode: storageMode
    };
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

  // ============ STORAGE MODE — PUBLIC API ============
  // Odczyt/zapis flagi storageMode konta. Wykorzystywane przez:
  //   • kreator konta (createUser przyjmuje storageMode w options),
  //   • Ustawienia → Bezpieczeństwo (toggle „Tryb chmurowy"),
  //   • vault routing (per-user adapter in-memory dla cloud-only),
  //   • sync integration (force-pull przy unlock dla cloud-only),
  //   • file-export (guard auto-backup dla cloud-only).

  // Zwraca storageMode konta o danym userId. Default 'local' dla legacy rekordów.
  async function getStorageMode(userId) {
    if (typeof userId !== 'string' || !userId.length) return STORAGE_MODE_LOCAL;
    try {
      const entry = await getAdapter().getRegistryEntry(userId);
      return normalizeStorageMode(entry && entry.storageMode);
    } catch (_) { return STORAGE_MODE_LOCAL; }
  }

  // Zmienia storageMode konta (np. po przełączeniu toggle w Ustawieniach).
  // Wymaga: konto musi istnieć w registry. Mode normalizowany do legalnych wartości.
  // Nie czyści lokalnych danych ani nie wymusza ponownego pobrania z chmury —
  // to zadanie warstwy wyższej (UI Ustawień powinno: 1) wykonać export do chmury,
  // 2) wymazać per-user IDB, 3) wywołać setStorageMode, 4) zalecić re-login).
  async function setStorageMode(userId, mode) {
    if (typeof userId !== 'string' || !userId.length) {
      throw new Error('Nieprawidłowy userId.');
    }
    const normalized = normalizeStorageMode(mode);
    const entry = await getAdapter().getRegistryEntry(userId);
    if (!entry) throw new Error('Użytkownik nie istnieje.');
    await getAdapter().updateRegistryEntry(userId, { storageMode: normalized });
    // Jeśli zmieniamy mode aktualnie zalogowanego usera — odśwież cache.
    if (currentUserId === userId) _currentStorageModeCache = normalized;
    return { userId: userId, storageMode: normalized };
  }

  // Zwraca storageMode aktualnie zalogowanego użytkownika ('local' jeśli brak sesji).
  async function getCurrentStorageMode() {
    if (!currentUserId) return STORAGE_MODE_LOCAL;
    return getStorageMode(currentUserId);
  }

  // Synchroniczna wersja — używana przez gorące ścieżki (file-export auto-backup
  // guard, sync routing). Wymaga cached wartości — zapisanej przy unlocku.
  // Cache jest invalidowany przy lock() / setStorageMode().
  let _currentStorageModeCache = STORAGE_MODE_LOCAL;
  function getCurrentStorageModeSync() { return _currentStorageModeCache; }
  function isCloudOnlyMode() { return _currentStorageModeCache === STORAGE_MODE_CLOUD_ONLY; }

  const api = {
    __vildaVault: true,
    VERSION: VERSION,
    STEP: STEP,
    SCHEMA_VERSION: SCHEMA_VERSION,
    REGISTRY_DB_NAME: REGISTRY_DB_NAME,
    USER_DB_PREFIX: USER_DB_PREFIX,
    DEFAULT_IDLE_LOCK_MS: DEFAULT_IDLE_LOCK_MS,
    CLOUD_ONLY_IDLE_LOCK_MS: CLOUD_ONLY_IDLE_LOCK_MS,
    MIN_PASSWORD_LENGTH: MIN_PASSWORD_LENGTH,
    PASSWORD_REQUIRED_VARIETY_TYPES: PASSWORD_REQUIRED_VARIETY_TYPES,
    validatePasswordStrength: validatePasswordStrength,
    generateStrongPassword: generateStrongPassword,
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
    rotateSyncIdentity: rotateSyncIdentity,
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
    onPasskeyChanged: onPasskeyChanged,
    onPreferenceChanged: onPreferenceChanged,
    // Moduł Notatki (N1) — biblioteka szablonów lekarza.
    listNotes: listNotes,
    getNote: getNote,
    saveNote: saveNote,
    removeNote: removeNote,
    onNoteChanged: onNoteChanged,
    NOTE_CATEGORIES: NOTE_CATEGORIES,
    sanitizeNoteText: sanitizeNoteText,
    // Moduł Pacjenci — Notatki kliniczne pacjenta (P1).
    savePatientNote: savePatientNote,
    getPatientNote: getPatientNote,
    listPatientNotesForPatient: listPatientNotesForPatient,
    listAllPatientNotes: listAllPatientNotes,
    removePatientNote: removePatientNote,
    onPatientNoteChanged: onPatientNoteChanged,
    PATIENT_NOTE_CATEGORIES: PATIENT_NOTE_CATEGORIES,
    // R1 — Reminder system: akcje dla modal'a po-unlock + query "due today".
    completePatientNote: completePatientNote,
    uncompletePatientNote: uncompletePatientNote,
    snoozePatientNote: snoozePatientNote,
    listPatientNotesDueByDate: listPatientNotesDueByDate,
    // P5 — Timeline pacjenta: agregator wszystkich wydarzeń chronologicznie.
    listPatientTimelineEvents: listPatientTimelineEvents,
    // B1.1 — pure-function helper (internal/test): wyciąga historyczne wiersze
    // pomiarowe z payloadu pojedynczego snapshotu (advanced lub growthBasic).
    // Eksport głównie do testowania w izolacji; produkcyjnie konsument to
    // listPatientTimelineEvents (po B1.2 przepisaniu).
    _extractMeasurementHistory: _extractMeasurementHistory,
    // B1.4 — pure-function helper (internal/test): generuje observations
    // (gap detection, growth slowdown) z DEDUPOWANYCH measurement events po wieku.
    // Eksport głównie do testowania w izolacji; produkcyjnie konsument to
    // listPatientTimelineEvents.
    _generateObservations: _generateObservations,
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
    unlockWithPasskeyConditional: unlockWithPasskeyConditional,
    unlockWithPasskeyEphemeral: unlockWithPasskeyEphemeral,
    unlockWithPasskeyAndPersist: unlockWithPasskeyAndPersist,
    completeQRLoginEphemeral: completeQRLoginEphemeral,
    listPasskeys: listPasskeys,
    removePasskey: removePasskey,
    // N10: adopcja zsynchronizowanego passkey na bieżącym urządzeniu
    adoptSyncedPasskey: adoptSyncedPasskey,
    listAdoptablePasskeys: listAdoptablePasskeys,
    // QR Transfer — logowanie kodem QR
    initiateQRLogin:   initiateQRLogin,
    pollQRLoginStatus: pollQRLoginStatus,
    completeQRLogin:   completeQRLogin,
    approveQRLogin:    approveQRLogin,
    // Tryb efemeryczny (współdzielony komputer) — nic trwałego lokalnie
    setEphemeralMode:  setEphemeralMode,
    isEphemeralMode:   isEphemeralMode,
    setStorageAdapter: setStorageAdapter,
    // Storage mode per-konto (cloud-only): zachowuje tożsamość konta w registry,
    // ale dane pacjentów trzymane są tylko w pamięci sesji + chmurze. Patrz blok
    // „STORAGE MODE" u góry pliku.
    getStorageMode:            getStorageMode,
    setStorageMode:            setStorageMode,
    getCurrentStorageMode:     getCurrentStorageMode,
    getCurrentStorageModeSync: getCurrentStorageModeSync,
    isCloudOnlyMode:           isCloudOnlyMode,
    isCloudOnlyAdapterActive:  isCloudOnlyAdapterActive,
    STORAGE_MODE_LOCAL:        STORAGE_MODE_LOCAL,
    STORAGE_MODE_CLOUD_ONLY:   STORAGE_MODE_CLOUD_ONLY
  };

  global.VildaVault = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
