/**
 * vilda_pro_access.js — Zarządzanie stanem subskrypcji Vilda PRO.
 *
 * ─── Odpowiedzialność ────────────────────────────────────────────────────────
 *
 *   Jeden moduł, jedno źródło prawdy o tym czy użytkownik ma aktywny plan PRO.
 *   Nie zawiera żadnej logiki UI — to należy do vilda_pro_ui.js.
 *
 * ─── Kluczowa właściwość: hasAccess() jest SYNCHRONICZNY ────────────────────
 *
 *   hasAccess() odczytuje dane z localStorage bez żadnych await/Promise.
 *   Dzięki temu strony mogą sprawdzić stan PRO w inline <script> w <head>,
 *   ZANIM przeglądarka wyrenderuje <body> — zero migania elementów UI.
 *
 * ─── Przechowywanie stanu (per-user, od 8Q-10) ───────────────────────────────
 *
 *   localStorage klucz: 'vilda-pro-plan-v1:<userId>'
 *   Format: { plan, validUntil, activatedAt, userId, cachedAt }
 *
 *   Klucz zawiera userId — każdy użytkownik ma własny slot w localStorage.
 *   Dzięki temu wielu użytkowników na tym samym urządzeniu może mieć niezależne
 *   stany PRO bez wzajemnego nadpisywania. Poprzedni schemat (globalny klucz
 *   'vilda-pro-plan-v1' bez userId) powodował utratę PRO gdy drugi użytkownik
 *   aktywował trial — jego wpis nadpisywał wpis pierwszego.
 *
 *   Przy inicjalizacji moduł jednorazowo migruje stary globalny klucz
 *   'vilda-pro-plan-v1' (pre-8Q-10) na nowy per-user klucz.
 *
 *   hasAccess() odczytuje userId z sessionStorage['vilda-vault-session-v2']
 *   synchronicznie — to samo źródło co reszta aplikacji, dostępne w <head>
 *   zanim vault załaduje się asynchronicznie.
 *
 * ─── Zdarzenia ───────────────────────────────────────────────────────────────
 *
 *   Odpala:      'vildaProAccessChanged' (detail: { plan, validUntil })
 *
 * ─── API ─────────────────────────────────────────────────────────────────────
 *
 *   window.VildaProAccess = {
 *     hasAccess()                 — bool (synchroniczny)
 *     getSnapshot()               — { plan, validUntil, activatedAt } | null
 *     setPlan(plan, validUntil)   — zapisuje stan, odpala zdarzenie
 *     invalidateCache()           — kasuje wpis aktualnego użytkownika
 *   }
 */

(function (global) {
  'use strict';

  if (!global) return;

  // Guard — nie inicjalizuj dwukrotnie
  if (global.VildaProAccess && global.VildaProAccess.__vildaProAccess) return;

  // ─── Stałe ──────────────────────────────────────────────────────────────────

  // Nowy schemat: per-user klucz 'vilda-pro-plan-v1:<userId>'
  var CACHE_KEY_PREFIX  = 'vilda-pro-plan-v1:';
  // Stary schemat (pre-8Q-10): globalny klucz bez userId — tylko do migracji
  var LEGACY_CACHE_KEY  = 'vilda-pro-plan-v1';
  // Klucz sesji vault w sessionStorage — źródło userId dla bootstrap <script>
  var SESSION_KEY       = 'vilda-vault-session-v2';

  // ─── Pomocnik: userId aktualnej sesji (synchroniczny) ───────────────────────

  /**
   * Zwraca userId aktualnie zalogowanego użytkownika synchronicznie.
   * Próbuje dwóch źródeł w kolejności priorytetów:
   *   1. VildaVault.getCurrentUser()  — gdy vault jest odblokowany
   *   2. sessionStorage[SESSION_KEY]  — gdy vault załadowany ale sesja async
   * Zwraca null gdy żadne źródło nie jest dostępne (gość, vault zablokowany,
   * nowa karta przed odtworzeniem sesji).
   */
  function getCurrentUserIdSync() {
    try {
      var vault = global.VildaVault;
      var cu = vault && typeof vault.getCurrentUser === 'function'
        ? vault.getCurrentUser()
        : null;
      if (cu && cu.userId) return cu.userId;
    } catch (_) {}
    try {
      var raw = global.sessionStorage && global.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && data.userId) return data.userId;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Zwraca pełny klucz localStorage dla danego userId.
   * Zwraca null gdy userId jest pusty — caller musi obsłużyć ten przypadek.
   */
  function cacheKeyForUser(userId) {
    if (!userId) return null;
    return CACHE_KEY_PREFIX + userId;
  }

  // ─── Jednorazowa migracja starego globalnego klucza (pre-8Q-10) ─────────────

  /**
   * Przenosi wpis z 'vilda-pro-plan-v1' na 'vilda-pro-plan-v1:<userId>'.
   * Wywołana raz przy inicjalizacji modułu.
   * Jeśli stary klucz nie istnieje — no-op.
   * Jeśli stary klucz istnieje i ma userId — kopiuje pod nowy klucz (o ile tam
   * jeszcze nic nie ma) i usuwa stary. Jeśli brak userId w starym wpisie —
   * usuwa tylko stary klucz (dane były bezużyteczne bez userId).
   */
  function migrateOldCache() {
    try {
      if (!global.localStorage) return;
      var raw = global.localStorage.getItem(LEGACY_CACHE_KEY);
      if (!raw) return;
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.userId) {
          var newKey = cacheKeyForUser(parsed.userId);
          // Kopiuj tylko jeśli nowy klucz jest jeszcze pusty — nie nadpisuj
          // nowszego per-user wpisu starym globalnym.
          if (newKey && !global.localStorage.getItem(newKey)) {
            global.localStorage.setItem(newKey, raw);
          }
        }
      } catch (_) {}
      // Zawsze usuń stary klucz — niezależnie od powodzenia migracji
      global.localStorage.removeItem(LEGACY_CACHE_KEY);
    } catch (_) {}
  }

  // ─── Odczyt / zapis localStorage ────────────────────────────────────────────

  /**
   * Odczytuje wpis PRO dla aktualnego użytkownika z localStorage.
   * Używa getCurrentUserIdSync() do wyznaczenia klucza — bezpieczne w <head>.
   * Zwraca null gdy brak użytkownika, brak wpisu lub błąd parsowania.
   */
  function readCache() {
    try {
      var userId = getCurrentUserIdSync();
      var key = cacheKeyForUser(userId);
      if (!key) return null;
      var raw = global.localStorage && global.localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  /**
   * Zapisuje wpis PRO pod kluczem per-user dla userId z data.userId.
   * Jeśli data.userId jest pusty — nie zapisuje (brak kontekstu konta).
   */
  function writeCache(data) {
    try {
      if (!global.localStorage) return;
      var key = cacheKeyForUser(data.userId);
      if (!key) return;   // brak userId — nie możemy zapisać per-user cache
      var entry = {
        plan:        data.plan        || null,
        validUntil:  data.validUntil  || null,
        activatedAt: data.activatedAt || null,
        userId:      data.userId,
        cachedAt:    new Date().toISOString()
      };
      global.localStorage.setItem(key, JSON.stringify(entry));
    } catch (_) {}
  }

  /**
   * Usuwa wpis PRO z localStorage.
   * @param {string} [userId] - jeśli podany, usuwa klucz tego użytkownika;
   *   jeśli pominięty, używa getCurrentUserIdSync() (vault odblokowany lub sesja w sessionStorage).
   *   Parametr jest wymagany gdy wywołanie następuje po vault.lock(), bo wtedy
   *   getCurrentUserIdSync() zwróciłby null (vault i sessionStorage już wyczyszczone).
   */
  function clearCache(userId) {
    try {
      if (!global.localStorage) return;
      var effectiveId = userId || getCurrentUserIdSync();
      var key = cacheKeyForUser(effectiveId);
      if (!key) return;
      global.localStorage.removeItem(key);
    } catch (_) {}
  }

  // ─── API publiczne ───────────────────────────────────────────────────────────

  /**
   * Sprawdza czy aktualny użytkownik ma aktywny plan PRO.
   * SYNCHRONICZNY — bezpieczny do wywołania w inline <script> w <head>.
   * Zwraca false gdy brak sesji, brak wpisu lub plan wygasł.
   * @returns {boolean}
   */
  function hasAccess() {
    var cache = readCache();
    if (!cache) return false;
    if (cache.plan !== 'pro') return false;
    if (!cache.validUntil) return false;
    try {
      return new Date(cache.validUntil).getTime() > Date.now();
    } catch (_) {
      return false;
    }
  }

  /**
   * Zwraca snapshot planu aktualnego użytkownika lub null jeśli brak danych.
   * @returns {{ plan: string, validUntil: string, activatedAt: string, cachedAt: string } | null}
   */
  function getSnapshot() {
    return readCache();
  }

  /**
   * Zapisuje plan PRO (po aktywacji triala lub odnowieniu subskrypcji).
   * Wywołać po otrzymaniu danych z endpointu /v1/slots/:slotId/trial.
   *
   * @param {string} plan          - 'pro' (lub 'free' żeby jawnie cofnąć)
   * @param {string} validUntil    - data ISO ważności planu
   * @param {string} [activatedAt] - data ISO aktywacji (opcjonalna)
   */
  function setPlan(plan, validUntil, activatedAt) {
    // Pobierz userId przez getCurrentUserIdSync() — ten sam mechanizm co readCache(),
    // co gwarantuje spójność: czytamy i piszemy zawsze pod tym samym kluczem.
    var userId = getCurrentUserIdSync();

    writeCache({
      plan:        plan,
      validUntil:  validUntil  || null,
      activatedAt: activatedAt || new Date().toISOString(),
      userId:      userId
    });

    // Powiadom resztę aplikacji (vilda_pro_ui.js nasłuchuje na to zdarzenie)
    try {
      if (global.document) {
        global.document.dispatchEvent(new CustomEvent('vildaProAccessChanged', {
          bubbles: false,
          detail: {
            plan:       plan,
            validUntil: validUntil || null
          }
        }));
      }
    } catch (_) {}
  }

  /**
   * Kasuje cache podanego (lub aktualnego) użytkownika.
   * Wywołać przy jawnym wylogowaniu lub usunięciu konta.
   *
   * @param {string} [userId] - UUID konta do wyczyszczenia.
   *   Wymagany gdy wywołanie następuje wewnątrz vault.onLock(), bo vault.lock()
   *   czyści currentUserId i sessionStorage PRZED wywołaniem listenerów onLock —
   *   getCurrentUserIdSync() zwróciłby wtedy null. Caller powinien przekazać
   *   userId przechwycony wcześniej (np. _trackedUserId z vilda_auth_ui.js).
   *   Gdy pominięty, używa getCurrentUserIdSync() — poprawne poza kontekstem onLock.
   *
   * Nie reaguje automatycznie na 'vilda:session-changed' (ten event odpala się
   * też przy starcie strony gdy vault jest zablokowany, co niszczyłoby cache).
   */
  function invalidateCache(userId) {
    clearCache(userId);
    // Powiadom UI żeby zaktualizowało klasy CSS
    try {
      if (global.document) {
        global.document.dispatchEvent(new CustomEvent('vildaProAccessChanged', {
          bubbles: false,
          detail: { plan: null, validUntil: null }
        }));
      }
    } catch (_) {}
  }

  // ─── Migracja starego schematu (pre-8Q-10) ───────────────────────────────────

  migrateOldCache();

  // ─── Eksport ─────────────────────────────────────────────────────────────────

  global.VildaProAccess = {
    __vildaProAccess: true,   // guard przed podwójną inicjalizacją
    hasAccess:        hasAccess,
    getSnapshot:      getSnapshot,
    setPlan:          setPlan,
    invalidateCache:  invalidateCache
  };

}(typeof window !== 'undefined' ? window : this));
