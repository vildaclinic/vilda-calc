/**
 * vilda_pro_access_regression_test.js — Test regresji per-user klucza PRO (8Q-10)
 *
 * Uruchamianie:  node vilda_pro_access_regression_test.js
 *
 * Co weryfikuje:
 *   T01 — API surface jest niezmienione (backward compat)
 *   T02 — setPlan() tworzy klucz per-user 'vilda-pro-plan-v1:<userId>'
 *   T03 — Klucz globalny 'vilda-pro-plan-v1' NIE jest tworzony
 *   T04 — Dwaj użytkownicy mają niezależne wpisy (core fix — root cause buga)
 *   T05 — setPlan() userB nie nadpisuje wpisu userA
 *   T06 — hasAccess() zwraca true tylko dla właściwego użytkownika sesji
 *   T07 — hasAccess() zwraca false gdy brak sesji
 *   T08 — hasAccess() zwraca false gdy plan wygasł
 *   T09 — getSnapshot() zwraca dane aktualnego użytkownika
 *   T10 — getSnapshot() zwraca null gdy brak sesji
 *   T11 — invalidateCache() usuwa tylko wpis aktualnego użytkownika
 *   T12 — Migracja: stary globalny klucz przenoszony na per-user klucz
 *   T13 — Migracja: stary klucz usuwany po migracji
 *   T14 — Migracja: nie nadpisuje istniejącego per-user wpisu
 *   T15 — Migracja: stary klucz bez userId — tylko usunięcie, bez zapisu
 *   T16 — setPlan() bez sesji (userId null) — brak zapisu do localStorage
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

const PASS   = '\x1b[32m✓\x1b[0m';
const FAIL   = '\x1b[31m✗\x1b[0m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

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

// ─── Mock środowiska przeglądarki ───────────────────────────────────────────

function makeMockStorage() {
  const store = {};
  return {
    getItem(k)    { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear()       { Object.keys(store).forEach(function(k) { delete store[k]; }); },
    _keys()       { return Object.keys(store); },
    _raw()        { return store; }
  };
}

function makeGlobal(opts) {
  opts = opts || {};
  const ls  = opts.localStorage  || makeMockStorage();
  const ss  = opts.sessionStorage || makeMockStorage();
  const g = {
    localStorage:  ls,
    sessionStorage: ss,
    document: { dispatchEvent: function() {} },
    CustomEvent: function(name, init) { this.type = name; this.detail = init && init.detail; },
    VildaVault: opts.vault || null,
    VildaProAccess: null   // resetowany przez każde loadModule()
  };
  return g;
}

// ─── Ładowanie modułu z custom globalem ─────────────────────────────────────

const MODULE_PATH = path.join(__dirname, 'vilda_pro_access.js');
const moduleSource = fs.readFileSync(MODULE_PATH, 'utf8');

function loadModule(mockGlobal) {
  // Reset guard żeby moduł mógł się zainicjalizować ponownie
  mockGlobal.VildaProAccess = null;
  // Przekazanie mocka jako `window` działa zarówno dla czytelnej, jak i
  // zminifikowanej postaci IIFE. Test nie zależy już od tekstu końcówki pliku.
  const fn = new Function('window', moduleSource);
  fn(mockGlobal);
  // Ten historyczny zestaw bada warstwę cache per-user, nie nowszy tryb
  // kryptograficznych tokenów uprawnień. Wymuszamy więc testowany tryb jawnie.
  if (mockGlobal.VildaProAccess && typeof mockGlobal.VildaProAccess.__setTokenModeForTest === 'function') {
    mockGlobal.VildaProAccess.__setTokenModeForTest(false);
  }
  return mockGlobal.VildaProAccess;
}

// ─── Stałe testowe ──────────────────────────────────────────────────────────

const USER_A        = 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B        = 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const KEY_PREFIX    = 'vilda-pro-plan-v1:';
const LEGACY_KEY    = 'vilda-pro-plan-v1';
const SESSION_KEY   = 'vilda-vault-session-v2';
const FUTURE_DATE   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST_DATE     = new Date(Date.now() -  1 * 24 * 60 * 60 * 1000).toISOString();

function setSession(g, userId) {
  if (userId) {
    g.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: userId, keyB64: 'mock' }));
  } else {
    g.sessionStorage.removeItem(SESSION_KEY);
  }
}

// ─── T01: API surface ────────────────────────────────────────────────────────

console.log('\n' + BOLD + 'T01 — API surface (backward compat)' + RESET);
(function () {
  const g = makeGlobal();
  const api = loadModule(g);
  assert('VildaProAccess jest dostępne na globalnym obiekcie',   !!api);
  assert('__vildaProAccess guard obecny',                         api && api.__vildaProAccess === true);
  assert('hasAccess jest funkcją',                                api && typeof api.hasAccess       === 'function');
  assert('getSnapshot jest funkcją',                              api && typeof api.getSnapshot     === 'function');
  assert('setPlan jest funkcją',                                  api && typeof api.setPlan         === 'function');
  assert('invalidateCache jest funkcją',                          api && typeof api.invalidateCache === 'function');
})();

// ─── T02: setPlan() tworzy klucz per-user ───────────────────────────────────

console.log('\n' + BOLD + 'T02 — setPlan() tworzy klucz per-user' + RESET);
(function () {
  const g = makeGlobal();
  setSession(g, USER_A);
  const api = loadModule(g);

  api.setPlan('pro', FUTURE_DATE);

  const perUserKey = KEY_PREFIX + USER_A;
  const raw = g.localStorage.getItem(perUserKey);
  assert('Klucz "' + perUserKey + '" istnieje', raw !== null);

  if (raw) {
    const entry = JSON.parse(raw);
    assert('plan === "pro"',                      entry.plan === 'pro');
    assert('validUntil zgodny z przekazanym',     entry.validUntil === FUTURE_DATE);
    assert('userId zapisany poprawnie',            entry.userId === USER_A);
    assert('cachedAt jest stringiem ISO',          typeof entry.cachedAt === 'string' && entry.cachedAt.includes('T'));
  }
})();

// ─── T03: Klucz globalny NIE jest tworzony ───────────────────────────────────

console.log('\n' + BOLD + 'T03 — Klucz globalny "vilda-pro-plan-v1" NIE jest tworzony' + RESET);
(function () {
  const g = makeGlobal();
  setSession(g, USER_A);
  const api = loadModule(g);

  api.setPlan('pro', FUTURE_DATE);

  assert('Stary globalny klucz nie istnieje w localStorage',
    g.localStorage.getItem(LEGACY_KEY) === null);
})();

// ─── T04: Dwaj użytkownicy mają niezależne wpisy ────────────────────────────

console.log('\n' + BOLD + 'T04 — Niezależne wpisy dla userA i userB (core fix)' + RESET);
(function () {
  const g = makeGlobal();

  // userA aktywuje PRO
  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE_DATE);

  // userB aktywuje PRO
  setSession(g, USER_B);
  api.setPlan('pro', FUTURE_DATE);

  const keyA = g.localStorage.getItem(KEY_PREFIX + USER_A);
  const keyB = g.localStorage.getItem(KEY_PREFIX + USER_B);

  assert('Wpis userA istnieje po aktywacji userB',  keyA !== null);
  assert('Wpis userB istnieje',                     keyB !== null);
  assert('Wpisy są różnymi obiektami',              keyA !== keyB);

  if (keyA) {
    const a = JSON.parse(keyA);
    assert('Wpis userA ma userId === USER_A',       a.userId === USER_A);
    assert('Wpis userA ma plan === "pro"',          a.plan   === 'pro');
  }
  if (keyB) {
    const b = JSON.parse(keyB);
    assert('Wpis userB ma userId === USER_B',       b.userId === USER_B);
    assert('Wpis userB ma plan === "pro"',          b.plan   === 'pro');
  }
})();

// ─── T05: setPlan() userB nie nadpisuje wpisu userA ─────────────────────────

console.log('\n' + BOLD + 'T05 — setPlan() userB nie nadpisuje wpisu userA' + RESET);
(function () {
  const g = makeGlobal();
  const VALID_A = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const VALID_B = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', VALID_A);

  setSession(g, USER_B);
  api.setPlan('pro', VALID_B);

  const rawA = g.localStorage.getItem(KEY_PREFIX + USER_A);
  assert('Wpis userA przetrwał aktywację userB', rawA !== null);
  if (rawA) {
    const a = JSON.parse(rawA);
    assert('validUntil userA niezmieniony', a.validUntil === VALID_A);
  }

  // Przywróć sesję userA — hasAccess() powinno dalej być true
  setSession(g, USER_A);
  assert('hasAccess() = true dla userA po aktywacji userB', api.hasAccess() === true);
})();

// ─── T06: hasAccess() zwraca true tylko dla właściwego użytkownika ───────────

console.log('\n' + BOLD + 'T06 — hasAccess() respektuje aktualną sesję' + RESET);
(function () {
  const g = makeGlobal();

  // Oba konta mają aktywne PRO
  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE_DATE);

  setSession(g, USER_B);
  api.setPlan('pro', FUTURE_DATE);

  setSession(g, USER_A);
  assert('hasAccess() = true gdy sesja = userA', api.hasAccess() === true);

  setSession(g, USER_B);
  assert('hasAccess() = true gdy sesja = userB', api.hasAccess() === true);
})();

// ─── T07: hasAccess() = false gdy brak sesji ────────────────────────────────

console.log('\n' + BOLD + 'T07 — hasAccess() = false gdy brak sesji' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE_DATE);

  // Wyczyść sesję
  setSession(g, null);
  assert('hasAccess() = false gdy brak sesji w sessionStorage', api.hasAccess() === false);
})();

// ─── T08: hasAccess() = false gdy plan wygasł ───────────────────────────────

console.log('\n' + BOLD + 'T08 — hasAccess() = false gdy plan wygasł' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', PAST_DATE);

  assert('hasAccess() = false gdy validUntil w przeszłości', api.hasAccess() === false);
})();

// ─── T09: getSnapshot() zwraca dane aktualnego użytkownika ──────────────────

console.log('\n' + BOLD + 'T09 — getSnapshot() zwraca dane aktualnego użytkownika' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE_DATE);

  setSession(g, USER_B);
  api.setPlan('pro', FUTURE_DATE);

  setSession(g, USER_A);
  const snap = api.getSnapshot();
  assert('getSnapshot() nie jest null dla userA',      snap !== null);
  assert('getSnapshot().userId === USER_A',             snap && snap.userId === USER_A);
  assert('getSnapshot().plan === "pro"',                snap && snap.plan   === 'pro');

  setSession(g, USER_B);
  const snapB = api.getSnapshot();
  assert('getSnapshot().userId === USER_B po zmianie sesji', snapB && snapB.userId === USER_B);
})();

// ─── T10: getSnapshot() = null gdy brak sesji ───────────────────────────────

console.log('\n' + BOLD + 'T10 — getSnapshot() = null gdy brak sesji' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE_DATE);

  setSession(g, null);
  assert('getSnapshot() = null gdy brak sesji', api.getSnapshot() === null);
})();

// ─── T11: invalidateCache() usuwa tylko wpis aktualnego użytkownika ─────────

console.log('\n' + BOLD + 'T11 — invalidateCache() celuje w aktualnego użytkownika' + RESET);
(function () {
  const g = makeGlobal();

  setSession(g, USER_A);
  const api = loadModule(g);
  api.setPlan('pro', FUTURE_DATE);

  setSession(g, USER_B);
  api.setPlan('pro', FUTURE_DATE);

  // invalidateCache jako userB
  api.invalidateCache();

  assert('Wpis userB usunięty',             g.localStorage.getItem(KEY_PREFIX + USER_B) === null);
  assert('Wpis userA nadal istnieje',       g.localStorage.getItem(KEY_PREFIX + USER_A) !== null);

  // Weryfikacja przez hasAccess()
  setSession(g, USER_A);
  assert('hasAccess() = true dla userA po invalidateCache userB', api.hasAccess() === true);
})();

// ─── T12: Migracja — stary klucz przenoszony na per-user ────────────────────

console.log('\n' + BOLD + 'T12 — Migracja starego globalnego klucza na per-user' + RESET);
(function () {
  const g = makeGlobal();

  // Zasymuluj stary wpis w globalnym kluczu
  const oldEntry = JSON.stringify({
    plan: 'pro', validUntil: FUTURE_DATE, activatedAt: FUTURE_DATE,
    userId: USER_A, cachedAt: new Date().toISOString()
  });
  g.localStorage.setItem(LEGACY_KEY, oldEntry);

  // Załaduj moduł — migracja powinna nastąpić przy inicjalizacji
  setSession(g, USER_A);
  loadModule(g);

  const migrated = g.localStorage.getItem(KEY_PREFIX + USER_A);
  assert('Stary wpis przeniesiony pod klucz per-user', migrated !== null);
  if (migrated) {
    const m = JSON.parse(migrated);
    assert('Zmigrowany plan === "pro"',        m.plan   === 'pro');
    assert('Zmigrowany userId === USER_A',     m.userId === USER_A);
  }
})();

// ─── T13: Migracja — stary klucz usuwany ───────────────────────────────────

console.log('\n' + BOLD + 'T13 — Migracja usuwa stary globalny klucz' + RESET);
(function () {
  const g = makeGlobal();

  const oldEntry = JSON.stringify({
    plan: 'pro', validUntil: FUTURE_DATE,
    userId: USER_A, cachedAt: new Date().toISOString()
  });
  g.localStorage.setItem(LEGACY_KEY, oldEntry);

  loadModule(g);

  assert('Stary globalny klucz usunięty po migracji',
    g.localStorage.getItem(LEGACY_KEY) === null);
})();

// ─── T14: Migracja nie nadpisuje istniejącego per-user wpisu ────────────────

console.log('\n' + BOLD + 'T14 — Migracja nie nadpisuje nowszego per-user wpisu' + RESET);
(function () {
  const g = makeGlobal();

  const NEWER_DATE = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const newerEntry = JSON.stringify({
    plan: 'pro', validUntil: NEWER_DATE,
    userId: USER_A, cachedAt: new Date().toISOString()
  });
  // Nowszy per-user wpis już istnieje
  g.localStorage.setItem(KEY_PREFIX + USER_A, newerEntry);

  const olderEntry = JSON.stringify({
    plan: 'pro', validUntil: FUTURE_DATE,
    userId: USER_A, cachedAt: new Date().toISOString()
  });
  // Stary globalny klucz ze starszą datą
  g.localStorage.setItem(LEGACY_KEY, olderEntry);

  loadModule(g);

  const surviving = g.localStorage.getItem(KEY_PREFIX + USER_A);
  if (surviving) {
    const s = JSON.parse(surviving);
    assert('Per-user wpis ma nowszą datę (nie nadpisany przez migrację)',
      s.validUntil === NEWER_DATE);
  } else {
    assert('Per-user wpis istnieje', false, 'klucz zniknął');
  }
})();

// ─── T15: Migracja — stary klucz bez userId — tylko usunięcie ───────────────

console.log('\n' + BOLD + 'T15 — Migracja: stary klucz bez userId — tylko usunięcie' + RESET);
(function () {
  const g = makeGlobal();

  // Stary wpis bez userId (defensywny przypadek)
  g.localStorage.setItem(LEGACY_KEY, JSON.stringify({
    plan: 'pro', validUntil: FUTURE_DATE
    // brak userId
  }));

  loadModule(g);

  assert('Stary klucz usunięty',                       g.localStorage.getItem(LEGACY_KEY) === null);
  // Nie powinien powstać żaden per-user wpis — brak userId = brak celu
  const keys = g.localStorage._keys().filter(function(k) { return k.startsWith(KEY_PREFIX); });
  assert('Żaden per-user klucz nie powstał',           keys.length === 0);
})();

// ─── T16: setPlan() bez sesji — brak zapisu ─────────────────────────────────

console.log('\n' + BOLD + 'T16 — setPlan() bez sesji (userId null) — brak zapisu' + RESET);
(function () {
  const g = makeGlobal();
  setSession(g, null);
  const api = loadModule(g);

  api.setPlan('pro', FUTURE_DATE);

  const keys = g.localStorage._keys().filter(function(k) {
    return k.startsWith(KEY_PREFIX) || k === LEGACY_KEY;
  });
  assert('Brak jakiegokolwiek wpisu PRO w localStorage gdy brak sesji', keys.length === 0);
  assert('hasAccess() = false po setPlan() bez sesji', api.hasAccess() === false);
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
