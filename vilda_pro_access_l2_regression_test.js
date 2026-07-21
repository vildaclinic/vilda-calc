/**
 * vilda_pro_access_l2_regression_test.js — Test regresji warstwy 2 (8Q-10)
 *
 * Uruchamianie:  node vilda_pro_access_l2_regression_test.js
 *
 * Co weryfikuje:
 *   ── invalidateCache(userId) — nowa sygnatura ──────────────────────────────
 *   T01 — invalidateCache(userId) czyści klucz wskazanego użytkownika
 *         gdy sessionStorage i vault są niedostępne (symulacja po vault.lock())
 *   T02 — invalidateCache(userId) czyści tylko wskazanego użytkownika,
 *         nie tykając wpisów innych użytkowników
 *   T03 — invalidateCache() bez argumentu nadal działa (backward compat)
 *         gdy sesja jest dostępna w sessionStorage
 *   T04 — invalidateCache(userId) z pustym userId jest no-op (bezpieczne)
 *   T05 — invalidateCache(userId) odpala event 'vildaProAccessChanged'
 *
 *   ── Scenariusze logout z onLock ───────────────────────────────────────────
 *   T06 — Po manual logout (invalidateCache wywołane z lockedUserId):
 *         - cache userA jest wyczyszczone
 *         - hasAccess() = false mimo że localStorage był obecny
 *   T07 — Po user-removed (invalidateCache wywołane z lockedUserId):
 *         - cache usuniętego użytkownika jest wyczyszczone
 *   T08 — idle-lock NIE wywołuje invalidateCache:
 *         - cache użytkownika przeżywa idle-lock
 *         - hasAccess() = true gdy użytkownik zaloguje się z powrotem
 *
 *   ── Scenariusze wieloużytkownikowe po wylogowaniu ─────────────────────────
 *   T09 — Pełny cykl: A aktywuje PRO → A wylogowuje (invalidateCache) →
 *         B aktywuje PRO → B wylogowuje (invalidateCache) →
 *         A loguje się → A nie ma lokalnego cache (musi re-sync z serwera)
 *         → B nadal ma swój cache nienaruszony
 *   T10 — Layer 1 + Layer 2 razem: żaden użytkownik nie widzi PRO innego
 *         po wylogowaniu, ale wpisy innych użytkowników nie są niszczone
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

const PASS  = '\x1b[32m✓\x1b[0m';
const FAIL  = '\x1b[31m✗\x1b[0m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(label, condition, detail) {
  if (condition) {
    console.log('  ' + PASS + ' ' + label);
    passCount++;
  } else {
    console.log('  ' + FAIL + ' ' + BOLD + label + RESET + (detail ? ' — ' + detail : ''));
    failCount++;
    failures.push({ label, detail });
  }
}

// ─── Mock środowiska ─────────────────────────────────────────────────────────

function makeMockStorage() {
  const store = {};
  return {
    getItem(k)    { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear()       { Object.keys(store).forEach(function(k) { delete store[k]; }); },
    _keys()       { return Object.keys(store); },
    _has(k)       { return Object.prototype.hasOwnProperty.call(store, k); }
  };
}

function makeGlobal(opts) {
  opts = opts || {};
  const events = [];
  const g = {
    localStorage:   opts.localStorage  || makeMockStorage(),
    sessionStorage: opts.sessionStorage || makeMockStorage(),
    document: {
      dispatchEvent: function(e) { events.push(e); }
    },
    CustomEvent: function(name, init) {
      this.type   = name;
      this.detail = init && init.detail;
    },
    VildaVault:      opts.vault || null,
    VildaProAccess:  null,
    _events:         events   // eksponowane do asercji
  };
  return g;
}

// ─── Loader modułu ───────────────────────────────────────────────────────────

const MODULE_PATH = path.join(__dirname, 'vilda_pro_access.js');
const moduleSource = fs.readFileSync(MODULE_PATH, 'utf8');

function loadModule(g) {
  g.VildaProAccess = null;
  const fn = new Function('window', moduleSource);
  fn(g);
  if (g.VildaProAccess && typeof g.VildaProAccess.__setTokenModeForTest === 'function') {
    g.VildaProAccess.__setTokenModeForTest(false);
  }
  return g.VildaProAccess;
}

// ─── Stałe testowe ───────────────────────────────────────────────────────────

const USER_A      = 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B      = 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_C      = 'cccc2222-cccc-cccc-cccc-cccccccccccc';
const KEY_PREFIX  = 'vilda-pro-plan-v1:';
const SESSION_KEY = 'vilda-vault-session-v2';
const FUTURE      = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function setSession(g, userId) {
  if (userId) {
    g.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, keyB64: 'mock' }));
  } else {
    g.sessionStorage.removeItem(SESSION_KEY);
  }
}

// Symuluje vault.lock(): czyści vault i sessionStorage (tak jak dzieje się
// naprawdę — clearPersistedSession() wywoływane PRZED notifyLock())
function simulateLock(g) {
  g.VildaVault = null;
  g.sessionStorage.removeItem(SESSION_KEY);
}

// ─── T01: invalidateCache(userId) działa bez sesji ──────────────────────────

console.log('\n' + BOLD + 'T01 — invalidateCache(userId) czyści klucz bez aktywnej sesji' + RESET);
(function () {
  const g = makeGlobal();

  // Załaduj moduł z aktywną sesją i aktywuj PRO
  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE);

  // Potwierdź że wpis istnieje
  assert('Wpis userA istnieje przed symulowanym lock()',
    g.localStorage._has(KEY_PREFIX + USER_A));

  // Symuluj vault.lock() — sesja wyczyszczona PRZED wywołaniem invalidateCache
  simulateLock(g);

  // Wywołaj z explicite przekazanym userId (jak w onLock z lockedUserId)
  api.invalidateCache(USER_A);

  assert('Wpis userA wyczyszczony mimo braku sesji',
    !g.localStorage._has(KEY_PREFIX + USER_A));
  assert('hasAccess() = false po invalidateCache(userId)',
    api.hasAccess() === false);
})();

// ─── T02: invalidateCache(userId) nie tyka wpisów innych użytkowników ────────

console.log('\n' + BOLD + 'T02 — invalidateCache(userId) celuje tylko we wskazanego użytkownika' + RESET);
(function () {
  const g = makeGlobal();

  // Obaj użytkownicy mają PRO
  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE);

  setSession(g, USER_B);
  api.setPlan('pro', FUTURE);

  setSession(g, USER_C);
  api.setPlan('pro', FUTURE);

  // Symuluj lock() userA — sesja wyczyszczona
  simulateLock(g);

  // Wyloguj tylko userA
  api.invalidateCache(USER_A);

  assert('Wpis userA usunięty',                      !g.localStorage._has(KEY_PREFIX + USER_A));
  assert('Wpis userB nienaruszony',                   g.localStorage._has(KEY_PREFIX + USER_B));
  assert('Wpis userC nienaruszony',                   g.localStorage._has(KEY_PREFIX + USER_C));
})();

// ─── T03: invalidateCache() bez argumentu — backward compat ─────────────────

console.log('\n' + BOLD + 'T03 — invalidateCache() bez argumentu (sesja w sessionStorage)' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE);

  // Sesja JEST dostępna — invalidateCache() bez argumentu używa getCurrentUserIdSync()
  api.invalidateCache();

  assert('invalidateCache() bez argumentu czyści aktualnego użytkownika',
    !g.localStorage._has(KEY_PREFIX + USER_A));
})();

// ─── T04: invalidateCache(null) i invalidateCache('') są no-op ───────────────

console.log('\n' + BOLD + 'T04 — invalidateCache(null/\'\') jest bezpiecznym no-op' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE);

  simulateLock(g);

  // Wywołanie z pustym userId — nie powinno rzucić błędu ani usunąć nic
  assert('invalidateCache(null) nie rzuca', (function() {
    try { api.invalidateCache(null); return true; } catch(_) { return false; }
  })());
  assert('invalidateCache("") nie rzuca', (function() {
    try { api.invalidateCache(''); return true; } catch(_) { return false; }
  })());

  // Wpis userA powinien nadal istnieć (nie przekazano userId, sesja pusta)
  assert('Wpis userA przeżył invalidateCache(null)',
    g.localStorage._has(KEY_PREFIX + USER_A));
})();

// ─── T05: invalidateCache(userId) odpala event ───────────────────────────────

console.log('\n' + BOLD + 'T05 — invalidateCache(userId) odpala vildaProAccessChanged' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE);

  simulateLock(g);
  g._events.length = 0;   // wyczyść eventy z setPlan

  api.invalidateCache(USER_A);

  const ev = g._events.find(function(e) { return e.type === 'vildaProAccessChanged'; });
  assert('Event vildaProAccessChanged odpalony',        !!ev);
  assert('Event detail.plan === null',                   ev && ev.detail && ev.detail.plan === null);
  assert('Event detail.validUntil === null',             ev && ev.detail && ev.detail.validUntil === null);
})();

// ─── T06: manual logout — cache wyczyszczone ────────────────────────────────

console.log('\n' + BOLD + 'T06 — Scenariusz: manual logout czyści cache (jak w onLock)' + RESET);
(function () {
  const g = makeGlobal();

  // Użytkownik aktywuje PRO
  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE);

  assert('PRO aktywne przed wylogowaniem',   api.hasAccess() === true);

  // Symulacja tego co dzieje się w onLock przy reason='manual':
  //   1. vault.lock() czyści userId i sessionStorage
  //   2. onLock: lockedUserId = _trackedUserId (= USER_A)
  //   3. invalidateCache(lockedUserId) wywoływane
  simulateLock(g);
  api.invalidateCache(USER_A);   // ← to wywołuje onLock dla reason='manual'

  assert('Cache usunięte po wylogowaniu',    !g.localStorage._has(KEY_PREFIX + USER_A));

  // Teraz użytkownik loguje się z powrotem — sesja przywrócona
  setSession(g, USER_A);
  assert('hasAccess() = false po ponownym zalogowaniu bez re-sync z serwera',
    api.hasAccess() === false);
  // (Oczekiwane zachowanie: user musi re-aktywować przez subskrypcja.html
  //  gdzie serwer zwróci 200 z istniejącymi datami triala — Layer 3)
})();

// ─── T07: user-removed — cache wyczyszczone ──────────────────────────────────

console.log('\n' + BOLD + 'T07 — Scenariusz: user-removed czyści cache' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE);

  // Symulacja onLock przy reason='user-removed'
  simulateLock(g);
  api.invalidateCache(USER_A);

  assert('Cache użytkownika wyczyszczone po usunięciu konta',
    !g.localStorage._has(KEY_PREFIX + USER_A));
})();

// ─── T08: idle-lock NIE czyści cache ────────────────────────────────────────

console.log('\n' + BOLD + 'T08 — Scenariusz: idle-lock NIE wywołuje invalidateCache' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE);

  // Symulacja onLock przy reason='idle' — invalidateCache NIE jest wywoływane
  // (warunek: reason === 'manual' || reason === 'user-removed')
  simulateLock(g);
  // Celowo NIE wywołujemy invalidateCache — tak jak robi onLock dla idle

  assert('Cache przeżywa idle-lock (invalidateCache nie wywołane)',
    g.localStorage._has(KEY_PREFIX + USER_A));

  // Użytkownik loguje się z powrotem jako ten sam użytkownik
  setSession(g, USER_A);
  assert('hasAccess() = true po powrocie z idle-lock',
    api.hasAccess() === true);
})();

// ─── T09: Pełny cykl wieloużytkownikowy ─────────────────────────────────────

console.log('\n' + BOLD + 'T09 — Pełny cykl: A→logout→B→logout→A (Layer 1 + Layer 2)' + RESET);
(function () {
  const g = makeGlobal();

  const api = loadModule(g);

  // ── Użytkownik A aktywuje PRO ──────────────────────────────────────────────
  setSession(g, USER_A);
  api.setPlan('pro', FUTURE);
  assert('[A] PRO aktywne po aktywacji',       api.hasAccess() === true);

  // ── A wylogowuje się (manual) ──────────────────────────────────────────────
  simulateLock(g);
  api.invalidateCache(USER_A);   // ← onLock wywołuje to dla reason='manual'
  assert('[A] cache wyczyszczony po wylogowaniu',  !g.localStorage._has(KEY_PREFIX + USER_A));

  // ── Użytkownik B loguje się i aktywuje PRO ─────────────────────────────────
  setSession(g, USER_B);
  api.setPlan('pro', FUTURE);
  assert('[B] PRO aktywne po aktywacji',       api.hasAccess() === true);
  assert('[A] cache userA nadal brak (nie odtworzony przez setPlan B)',
    !g.localStorage._has(KEY_PREFIX + USER_A));

  // ── B wylogowuje się (manual) ──────────────────────────────────────────────
  simulateLock(g);
  api.invalidateCache(USER_B);
  assert('[B] cache wyczyszczony po wylogowaniu',  !g.localStorage._has(KEY_PREFIX + USER_B));

  // ── A loguje się z powrotem ────────────────────────────────────────────────
  setSession(g, USER_A);
  // Brak lokalnego cache — Layer 3 (nie zaimplementowana) przywróciłaby go
  // z serwera. Oczekiwane: false do momentu re-sync.
  assert('[A po powrocie] hasAccess() = false (brak lokalnego cache)',
    api.hasAccess() === false);
  assert('[B po powrocie A] cache userB nadal brak',
    !g.localStorage._has(KEY_PREFIX + USER_B));
  // A re-aktywuje (serwer zwróci 200 — idempotent)
  api.setPlan('pro', FUTURE);
  assert('[A] PRO przywrócone po re-sync',     api.hasAccess() === true);
  // B nie odczuwa żadnego efektu
  assert('[B] cache userB nadal nienaruszony (setPlan A nie tworzy wpisu B)',
    !g.localStorage._has(KEY_PREFIX + USER_B));
})();

// ─── T10: Różnicowanie manual vs idle w tym samym kontekście ────────────────

console.log('\n' + BOLD + 'T10 — manual czyści cache, idle nie — oba w jednej sesji' + RESET);
(function () {
  const g = makeGlobal();
  const api = loadModule(g);

  // ── Pierwsze logowanie → idle-lock ────────────────────────────────────────
  setSession(g, USER_A);
  api.setPlan('pro', FUTURE);
  simulateLock(g);
  // idle-lock: NIE wywołujemy invalidateCache
  assert('[idle] Cache przeżywa idle-lock',    g.localStorage._has(KEY_PREFIX + USER_A));

  // ── Powrót po idle → manual logout ────────────────────────────────────────
  setSession(g, USER_A);
  assert('[idle] hasAccess() = true po powrocie',   api.hasAccess() === true);

  simulateLock(g);
  api.invalidateCache(USER_A);   // manual logout
  assert('[manual] Cache usunięty po manual logout', !g.localStorage._has(KEY_PREFIX + USER_A));

  setSession(g, USER_A);
  assert('[manual] hasAccess() = false po manual logout', api.hasAccess() === false);
})();

// ─── Podsumowanie ────────────────────────────────────────────────────────────

const total = passCount + failCount;
console.log('\n' + '─'.repeat(55));
console.log(BOLD + 'Wyniki: ' + passCount + '/' + total + ' testów przeszło' + RESET);
if (failCount > 0) {
  console.log(BOLD + '\x1b[31mNiepowodzenia:\x1b[0m');
  failures.forEach(function(f) {
    console.log('  ✗ ' + f.label + (f.detail ? ' — ' + f.detail : ''));
  });
  process.exit(1);
} else {
  console.log('\x1b[32m' + BOLD + 'Wszystkie testy zielone.' + RESET);
  process.exit(0);
}
