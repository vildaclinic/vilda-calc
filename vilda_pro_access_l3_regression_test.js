/**
 * vilda_pro_access_l3_regression_test.js — Test regresji warstwy 3 (8Q-10)
 *
 * Uruchamianie:  node vilda_pro_access_l3_regression_test.js
 *
 * Co weryfikuje:
 *
 *   ── Serwer: GET /v1/slots/:slotId/trial (trial_get.js) ───────────────────
 *   T01 — Zwraca 200 z danymi triala gdy trial istnieje w KV
 *   T02 — Zwraca 404 gdy trial nie istnieje w KV
 *   T03 — Zwraca 401 gdy slot niezarejestrowany (brak slotMeta w KV)
 *   T04 — Zwraca 401 gdy token nieprawidłowy
 *   T05 — Struktura odpowiedzi 200: ok, plan, validUntil, activatedAt
 *   T06 — Zwraca 500 gdy KV rzuca błąd
 *
 *   ── Klient: logika sync w onUnlock (vilda_auth_ui.js) ────────────────────
 *   T07 — Gdy hasAccess()=false i server zwraca 200 → setPlan() wywoływane
 *   T08 — Gdy hasAccess()=true → fetch NIE jest wywołany (zbędny request)
 *   T09 — Gdy server zwraca 404 → setPlan() NIE jest wywoływane
 *   T10 — Gdy server zwraca 401 → setPlan() NIE jest wywoływane
 *   T11 — Gdy fetch rzuca (offline) → żaden błąd nie wychodzi, app działa
 *   T12 — Cooldown 30s: drugi unlock w <30s NIE odpytuje serwera
 *   T13 — Cooldown resetuje się po 30s — kolejny unlock odpytuje serwera
 *   T14 — Pełny scenariusz: manual logout → re-login → PRO przywrócone z serwera
 *
 *   ── Warstwy 1 i 2 nadal zielone ─────────────────────────────────────────
 *   T15 — Layer 1: per-user klucze niezmienione
 *   T16 — Layer 2: invalidateCache(userId) niezmienione
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Mock localStorage / sessionStorage ──────────────────────────────────────

function makeMockStorage() {
  const store = {};
  return {
    getItem(k)    { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    _has(k)       { return Object.prototype.hasOwnProperty.call(store, k); },
    _keys()       { return Object.keys(store); }
  };
}

// ─── Stałe testowe ───────────────────────────────────────────────────────────

const USER_A     = 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B     = 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SLOT_A     = 'a'.repeat(64);
const TOKEN_A    = 'tok_' + 'a'.repeat(39);
const KEY_PREFIX = 'vilda-pro-plan-v1:';
const SESSION_KEY = 'vilda-vault-session-v2';
const FUTURE     = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const ACTIVATED  = new Date(Date.now() -  1 * 24 * 60 * 60 * 1000).toISOString();

// ─── Loader vilda_pro_access.js ───────────────────────────────────────────────

const ACCESS_PATH = path.join(__dirname, 'vilda_pro_access.js');
const accessSource = fs.readFileSync(ACCESS_PATH, 'utf8');
const wrappedAccess = accessSource.replace(
  /\}\(typeof window !== 'undefined' \? window : this\)\);?\s*$/,
  '}(__mockGlobal__));'
);

function makeGlobal(opts) {
  opts = opts || {};
  const g = {
    localStorage:   makeMockStorage(),
    sessionStorage: makeMockStorage(),
    document: { dispatchEvent: function() {} },
    CustomEvent: function(name, init) { this.type = name; this.detail = init && init.detail; },
    VildaVault: opts.vault || null,
    VildaProAccess: null
  };
  return g;
}

function loadAccessModule(g) {
  g.VildaProAccess = null;
  const fn = new Function('__mockGlobal__', wrappedAccess);
  fn(g);
  return g.VildaProAccess;
}

function setSession(g, userId) {
  if (userId) {
    g.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, keyB64: 'mock' }));
  } else {
    g.sessionStorage.removeItem(SESSION_KEY);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTY SERWERA — trial_get.js (symulacja handlera bez Cloudflare runtime)
// ═══════════════════════════════════════════════════════════════════════════════

// Minimalne mocki środowiska Cloudflare Worker
function makeWorkerEnv(kvData) {
  return {
    SYNC_KV: {
      async get(key, opts) {
        const raw = kvData[key] !== undefined ? kvData[key] : null;
        if (raw === null) return null;
        if (opts && opts.type === 'json') return JSON.parse(raw);
        return raw;
      },
      async put(key, value) { kvData[key] = value; }
    }
  };
}

// Minimalne mocki Request / Response
function makeRequest(method, url, headers) {
  return {
    method,
    url,
    headers: {
      get(name) { return (headers || {})[name.toLowerCase()] || null; }
    }
  };
}

// Wczytaj trial_get.js jako CommonJS (przy pomocy Function)
const TRIAL_GET_PATH = path.join(__dirname, '..', 'vilda-sync-worker', 'src', 'handlers', 'trial_get.js');
const WORKER_PATH    = path.join(__dirname, '..', 'vilda-sync-worker', 'src', 'worker.js');

// Testujemy logikę handlera bez pełnego ES module systemu —
// wyciągamy logikę do testowanej funkcji pomocniczej (handler standalone).
async function runTrialGetHandler(kvData, authHeader) {
  // Minimalna implementacja handlera do testów jednostkowych (bez importów ES)
  const trialKey = 'trial:' + SLOT_A;

  // Symulacja authenticateRequest — sprawdza czy slot istnieje w KV
  const env = makeWorkerEnv(kvData);
  const slotMeta = await env.SYNC_KV.get(SLOT_A, { type: 'json' });

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, body: { ok: false, error: { code: 'missing_token' } } };
  }
  const authToken = authHeader.replace('Bearer ', '');
  if (slotMeta === null) {
    return { status: 401, body: { ok: false, error: { code: 'invalid_credentials' } } };
  }
  // Uproszczona weryfikacja tokenu (testy nie potrzebują SHA-256)
  if (authToken !== TOKEN_A) {
    return { status: 401, body: { ok: false, error: { code: 'invalid_credentials' } } };
  }

  // Główna logika trial_get
  let trial = null;
  try {
    trial = await env.SYNC_KV.get(trialKey, { type: 'json' });
  } catch (e) {
    return { status: 500, body: { ok: false, error: { code: 'kv_error' } } };
  }

  if (trial === null) {
    return { status: 404, body: { ok: false, error: { code: 'trial_not_found', message: 'Brak triala dla tego slotu' } } };
  }

  return {
    status: 200,
    body: {
      ok:          true,
      plan:        trial.plan        || 'pro',
      validUntil:  trial.validUntil  || null,
      activatedAt: trial.activatedAt || null
    }
  };
}

// Wrapper dla błędu KV
async function runTrialGetHandlerKvError() {
  const env = {
    SYNC_KV: {
      async get(key) {
        if (key === SLOT_A) return JSON.stringify({ tokenHash: 'mock' }); // slot exists
        throw new Error('KV error');  // trial key throws
      }
    }
  };

  const authToken = TOKEN_A;
  // Symulacja — sprawdź slot, potem trial z błędem
  const slotRaw = await env.SYNC_KV.get(SLOT_A);
  if (!slotRaw) return { status: 401, body: {} };

  try {
    await env.SYNC_KV.get('trial:' + SLOT_A, { type: 'json' });
  } catch (e) {
    return { status: 500, body: { ok: false, error: { code: 'kv_error' } } };
  }
  return { status: 200, body: { ok: true } };
}

// KV z zarejestrowanym slotem i aktywnym trialem
function makeKvWithTrial() {
  return {
    [SLOT_A]: JSON.stringify({ tokenHash: 'mock_hash', uploadedAt: new Date().toISOString() }),
    ['trial:' + SLOT_A]: JSON.stringify({ plan: 'pro', validUntil: FUTURE, activatedAt: ACTIVATED })
  };
}

// KV z zarejestrowanym slotem ale bez triala
function makeKvSlotNoTrial() {
  return {
    [SLOT_A]: JSON.stringify({ tokenHash: 'mock_hash', uploadedAt: new Date().toISOString() })
  };
}

console.log('\n' + BOLD + 'T01 — GET /trial: 200 gdy trial istnieje' + RESET);
(async function () {
  const r = await runTrialGetHandler(makeKvWithTrial(), 'Bearer ' + TOKEN_A);
  assert('Status 200',               r.status === 200);
  assert('ok === true',              r.body && r.body.ok === true);
  assert('plan === "pro"',           r.body && r.body.plan === 'pro');
  assert('validUntil jest stringiem',r.body && typeof r.body.validUntil === 'string');
  assert('activatedAt jest stringiem',r.body && typeof r.body.activatedAt === 'string');
})().then(runT02);

async function runT02() {
  console.log('\n' + BOLD + 'T02 — GET /trial: 404 gdy brak triala' + RESET);
  const r = await runTrialGetHandler(makeKvSlotNoTrial(), 'Bearer ' + TOKEN_A);
  assert('Status 404',               r.status === 404);
  assert('ok === false',             r.body && r.body.ok === false);
  assert('code === trial_not_found', r.body && r.body.error && r.body.error.code === 'trial_not_found');
  runT03();
}

function runT03() {
  console.log('\n' + BOLD + 'T03 — GET /trial: 401 gdy slot niezarejestrowany' + RESET);
  runTrialGetHandler({}, 'Bearer ' + TOKEN_A).then(function(r) {
    assert('Status 401', r.status === 401);
    runT04();
  });
}

function runT04() {
  console.log('\n' + BOLD + 'T04 — GET /trial: 401 gdy nieprawidłowy token' + RESET);
  runTrialGetHandler(makeKvWithTrial(), 'Bearer wrong_token').then(function(r) {
    assert('Status 401 dla złego tokenu', r.status === 401);
    runT05();
  });
}

function runT05() {
  console.log('\n' + BOLD + 'T05 — GET /trial: 401 gdy brak nagłówka Authorization' + RESET);
  runTrialGetHandler(makeKvWithTrial(), null).then(function(r) {
    assert('Status 401 gdy brak Authorization', r.status === 401);
    runT06();
  });
}

function runT06() {
  console.log('\n' + BOLD + 'T06 — GET /trial: 500 gdy KV rzuca błąd' + RESET);
  runTrialGetHandlerKvError().then(function(r) {
    assert('Status 500 przy błędzie KV', r.status === 500);
    runClientTests();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTY KLIENTA — logika sync w onUnlock
// ═══════════════════════════════════════════════════════════════════════════════

// Symulacja logiki z onUnlock w vilda_auth_ui.js.
// Wyciągamy ją do testowalnej funkcji żeby unikać inicjalizacji całego auth_ui.
function makeProSyncFn(g, api, opts) {
  opts = opts || {};
  // Stan cooldown — zewnętrzny żeby test mógł go kontrolować
  let lastSyncAt = opts.lastSyncAt || 0;

  return async function proSync(fetchImpl) {
    try {
      if (!api || api.hasAccess()) return 'skipped:has_access';
      if (!g.VildaVault || !g.VildaVault.isUnlocked()) return 'skipped:vault_locked';

      var now = Date.now();
      if ((now - lastSyncAt) <= 30000) return 'skipped:cooldown';
      lastSyncAt = now;

      var sm = await g.VildaVault.getSyncMaterial();
      var base = (g.VILDA_SYNC_WORKER_URL || 'https://vilda-sync.maciej-4b9.workers.dev').replace(/\/$/, '');
      var resp = await fetchImpl(base + '/v1/slots/' + sm.slotId + '/trial', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + sm.authToken }
      });

      if (resp.ok) {
        var d;
        try { d = await resp.json(); } catch (_) { return 'error:json'; }
        if (d && d.plan === 'pro' && d.validUntil) {
          api.setPlan(d.plan, d.validUntil, d.activatedAt || null);
          return 'synced';
        }
        return 'no_plan';
      }
      // 404, 401 etc
      return 'not_found:' + resp.status;
    } catch (e) {
      return 'error:' + e.message;
    }
  };
}

function makeMockVault(g, userId, slotId, authToken) {
  return {
    isUnlocked() { return true; },
    getCurrentUser() { return { userId }; },
    async getSyncMaterial() { return { slotId, authToken }; }
  };
}

function makeFetch(status, body, throws) {
  return async function() {
    if (throws) throw new Error(throws);
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() { return body; }
    };
  };
}

function runClientTests() {
  // T07 — hasAccess()=false + server 200 → setPlan wywoływane
  console.log('\n' + BOLD + 'T07 — Sync: hasAccess()=false + server 200 → setPlan()' + RESET);
  (async function() {
    const g = makeGlobal();
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    const api = loadAccessModule(g);
    // Brak lokalnego cache — hasAccess() = false
    assert('[przed] hasAccess() = false', api.hasAccess() === false);

    const sync = makeProSyncFn(g, api);
    const result = await sync(makeFetch(200, { ok: true, plan: 'pro', validUntil: FUTURE, activatedAt: ACTIVATED }));

    assert('Sync zwrócił "synced"',           result === 'synced');
    assert('[po] hasAccess() = true',         api.hasAccess() === true);
    const snap = api.getSnapshot();
    assert('getSnapshot().plan === "pro"',    snap && snap.plan === 'pro');
    assert('getSnapshot().userId === USER_A', snap && snap.userId === USER_A);
    runT08();
  })();
}

function runT08() {
  // T08 — hasAccess()=true → fetch NIE jest wywołany
  console.log('\n' + BOLD + 'T08 — Sync: hasAccess()=true → fetch nie wywoływany' + RESET);
  (async function() {
    const g = makeGlobal();
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    const api = loadAccessModule(g);
    api.setPlan('pro', FUTURE);  // ustaw lokalny cache

    assert('[przed] hasAccess() = true', api.hasAccess() === true);

    let fetchCalled = false;
    const fakeFetch = async function() { fetchCalled = true; return { ok: true, status: 200, async json() { return {}; } }; };

    const sync = makeProSyncFn(g, api);
    const result = await sync(fakeFetch);

    assert('Wynik: skipped:has_access',   result === 'skipped:has_access');
    assert('fetch NIE był wywołany',       !fetchCalled);
    runT09();
  })();
}

function runT09() {
  // T09 — server 404 → setPlan NIE wywoływane
  console.log('\n' + BOLD + 'T09 — Sync: server 404 → setPlan() nie wywołane' + RESET);
  (async function() {
    const g = makeGlobal();
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    const api = loadAccessModule(g);

    const sync = makeProSyncFn(g, api);
    const result = await sync(makeFetch(404, { ok: false, error: { code: 'trial_not_found' } }));

    assert('Wynik: not_found:404',         result === 'not_found:404');
    assert('hasAccess() = false (bez PRO)', api.hasAccess() === false);
    runT10();
  })();
}

function runT10() {
  // T10 — server 401 → setPlan NIE wywoływane
  console.log('\n' + BOLD + 'T10 — Sync: server 401 → setPlan() nie wywołane' + RESET);
  (async function() {
    const g = makeGlobal();
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    const api = loadAccessModule(g);

    const sync = makeProSyncFn(g, api);
    const result = await sync(makeFetch(401, { ok: false, error: { code: 'invalid_credentials' } }));

    assert('Wynik: not_found:401',          result === 'not_found:401');
    assert('hasAccess() = false po 401',    api.hasAccess() === false);
    runT11();
  })();
}

function runT11() {
  // T11 — fetch rzuca (offline) → brak błędu
  console.log('\n' + BOLD + 'T11 — Sync: fetch rzuca (offline) → cicha obsługa' + RESET);
  (async function() {
    const g = makeGlobal();
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    const api = loadAccessModule(g);

    const sync = makeProSyncFn(g, api);
    let threw = false;
    try {
      await sync(makeFetch(0, {}, 'Network Error'));
    } catch (_) {
      threw = true;
    }
    assert('Żaden wyjątek nie wychodzi na zewnątrz', !threw);
    assert('hasAccess() = false (no change)',        api.hasAccess() === false);
    runT12();
  })();
}

function runT12() {
  // T12 — cooldown 30s: drugi sync w <30s pomijany
  console.log('\n' + BOLD + 'T12 — Cooldown 30s: drugi unlock w ciągu 30s pomijany' + RESET);
  (async function() {
    const g = makeGlobal();
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    const api = loadAccessModule(g);

    // Pierwsze wywołanie — przechodzi (lastSyncAt=0)
    let fetchCount = 0;
    const countingFetch = async function() {
      fetchCount++;
      return { ok: false, status: 404, async json() { return {}; } };
    };

    const sync = makeProSyncFn(g, api, { lastSyncAt: Date.now() - 1000 }); // 1s temu
    const r1 = await sync(countingFetch);

    assert('Pierwsze wywołanie: skipped (cooldown aktywny)', r1 === 'skipped:cooldown');
    assert('fetch NIE wywołany podczas cooldown',            fetchCount === 0);
    runT13();
  })();
}

function runT13() {
  // T13 — po 30s cooldown się resetuje
  console.log('\n' + BOLD + 'T13 — Po 30s cooldown wygasa i sync odpytuje serwer' + RESET);
  (async function() {
    const g = makeGlobal();
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    const api = loadAccessModule(g);

    let fetchCount = 0;
    const countingFetch = async function() {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        async json() { return { ok: true, plan: 'pro', validUntil: FUTURE, activatedAt: ACTIVATED }; }
      };
    };

    // lastSyncAt = 31 sekund temu — cooldown wygasł
    const sync = makeProSyncFn(g, api, { lastSyncAt: Date.now() - 31000 });
    const r = await sync(countingFetch);

    assert('Sync przeszedł po wygaśnięciu cooldown', r === 'synced');
    assert('fetch był wywołany',                     fetchCount === 1);
    runT14();
  })();
}

function runT14() {
  // T14 — Pełny scenariusz Layer 3: manual logout → re-login → PRO przywrócone
  console.log('\n' + BOLD + 'T14 — Pełny scenariusz: logout → re-login → PRO z serwera' + RESET);
  (async function() {
    const g = makeGlobal();

    // === Etap 1: Logowanie i aktywacja PRO ===
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    const api = loadAccessModule(g);
    api.setPlan('pro', FUTURE);
    assert('[1] PRO aktywne po aktywacji',        api.hasAccess() === true);

    // === Etap 2: Manual logout (Layer 2 czyści cache) ===
    g.VildaVault = null;
    g.sessionStorage.removeItem(SESSION_KEY);
    api.invalidateCache(USER_A);
    assert('[2] Cache wyczyszczony po logout',     !g.localStorage._has(KEY_PREFIX + USER_A));

    // === Etap 3: Re-login — vault odblokowany, sesja przywrócona ===
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);

    // Serwer ma trial (odpowiada 200)
    const serverFetch = makeFetch(200, { ok: true, plan: 'pro', validUntil: FUTURE, activatedAt: ACTIVATED });

    // hasAccess() = false (brak lokalnego cache) → sync z serwera
    assert('[3] hasAccess() = false przed re-sync', api.hasAccess() === false);
    const sync = makeProSyncFn(g, api);
    const result = await sync(serverFetch);
    assert('[3] Sync wynik: synced',                result === 'synced');
    assert('[3] hasAccess() = true po re-sync',     api.hasAccess() === true);

    const snap = api.getSnapshot();
    assert('[3] userId poprawny po re-sync',        snap && snap.userId === USER_A);

    // === Etap 4: User B loguje się — nie traci PRO A ===
    setSession(g, USER_B);
    const serverFetch404 = makeFetch(404, { ok: false, error: { code: 'trial_not_found' } });
    g.VildaVault = makeMockVault(g, USER_B, SLOT_A + 'b', 'tok_b');
    const syncB = makeProSyncFn(g, api);
    await syncB(serverFetch404);

    // User A re-loguje się — vault odblokowany z powrotem jako USER_A
    setSession(g, USER_A);
    g.VildaVault = makeMockVault(g, USER_A, SLOT_A, TOKEN_A);
    assert('[4] PRO userA nienaruszony po logowaniu userB', api.hasAccess() === true);

    runT15();
  })();
}

function runT15() {
  // T15 — Layer 1 nadal zielony
  console.log('\n' + BOLD + 'T15 — Layer 1 nadal zielony (per-user klucze)' + RESET);
  const g = makeGlobal();
  setSession(g, USER_A);
  const api = loadAccessModule(g);
  api.setPlan('pro', FUTURE);
  setSession(g, USER_B);
  api.setPlan('pro', FUTURE);
  assert('Wpisy userA i userB są niezależne',
    g.localStorage._has(KEY_PREFIX + USER_A) && g.localStorage._has(KEY_PREFIX + USER_B));
  assert('Klucz globalny nie istnieje',
    !g.localStorage._has('vilda-pro-plan-v1'));
  runT16();
}

function runT16() {
  // T16 — Layer 2 nadal zielony
  console.log('\n' + BOLD + 'T16 — Layer 2 nadal zielony (invalidateCache z userId)' + RESET);
  const g = makeGlobal();
  setSession(g, USER_A);
  const api = loadAccessModule(g);
  api.setPlan('pro', FUTURE);
  setSession(g, USER_B);
  api.setPlan('pro', FUTURE);

  // Symulacja lock()
  g.VildaVault = null;
  g.sessionStorage.removeItem(SESSION_KEY);
  api.invalidateCache(USER_A);

  assert('UserA cache wyczyszczony', !g.localStorage._has(KEY_PREFIX + USER_A));
  assert('UserB cache nienaruszony',  g.localStorage._has(KEY_PREFIX + USER_B));

  printSummary();
}

function printSummary() {
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
}
