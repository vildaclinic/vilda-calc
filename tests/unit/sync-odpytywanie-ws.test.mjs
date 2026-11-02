// E2-PR1b (P-SYNC-ODPYTYWANIE-WS) — odpytywanie tła świadome połączenia na żywo i odstęp ponownego łączenia WebSocket.
// Prawdziwe vilda_realtime.js i vilda_sync_integration.js w jednym sztucznym oknie (loadBrowserScript, ten sam realm),
// zegar wirtualny (vi.useFakeTimers), gniazdo i serwer to atrapy; VildaSync to atrapa z isPagedActive (prawdziwe
// isPagedActive na prawdziwym vilda_sync.js: tests/unit/sync-dziennik-drenaz.test.mjs D49). Dane wyłącznie FIKCYJNE,
// bez sieci.
//
// Co pilnuje (plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.3 pkt 1, wiersz 4 tabeli „Podział etapu 2”; decyzja 1 z 2026-10-29):
//   Realtime: R1 isLive dopiero po pong; info() z lastPongAt i live. R2 serwer milknie → po zamknięciu (brak pong 10 s)
//     isLive false, getLastPongAt null. R2b pong starszy niż 45 s przy otwartym gnieździe → false (44 s → true). R2c
//     gniazdo w stanie CLOSING ze świeżym pong → false. R3 disconnect zeruje żywotność. R10 info() zachowuje dotychczasowe
//     pola.
//   Odstęp ponownego łączenia („Komputer prywatny”): R4 10, 20, 40, 80, 160, 300, 300 s (sufit); R5 rozrzut 0,8–1,2 z dolną
//     granicą 10 s, przy suficie 240–360 s; R5b pierwsza próba równomiernie 10–12 s (wartość poniżej 10 s odbita w górę);
//     R6 serwer „przyjmij i zamknij” bez pętli (otwarcie nie zeruje odstępu); R7 po pong krok wraca do 10 s; R8 online
//     łączy od razu; R8b fokus i powrót do karty przy zamkniętym gnieździe łączą od razu i zerują krok; R9 „Komputer w
//     pracy” i „Zaloguj jednorazowo” (każdy sygnał trybu osobno, także wyjątek odczytu trybu) — odstęp jak dziś (2, 4, 8,
//     16, 30 s); R9b te same tryby przy serwerze „przyjmij i zamknij” — jak dziś (otwarcie zeruje odstęp).
//   Integracja: I1 żywe gniazdo + pobieranie stronami → pobranie z zegara co 60 s; I1b to samo przy tyknięciach spóźnionych
//     o kilka ms (jak w przeglądarce) — co 60 s, nie na przemian 60 i 70 s; I2 bez pobierania stronami (flaga '0',
//     tryb w pracy / jednorazowy, kursor 0 bez wyniku health, starszy vilda_sync.js) → jak dziś, co ~20 s; I2b bez
//     WebSocket → jak dziś; I3 gniazdo bez pong → jak dziś; I4 utrata żywotności (zamknięcie) → najbliższe tyknięcie
//     pobiera; I4b pong starszy niż 45 s przy otwartym gnieździe → powrót do ~20 s; I5 ramka changed pobiera od razu; I6
//     starszy vilda_realtime.js bez isLive → jak dziś; I6b isPagedActive albo isLive rzuca → jak dziś; I7 WIPE_GUARD →
//     pobranie po 800 ms (reguła 60 s tylko dla zegara); I8 bez podwójnych pobrań (ramka changed w chwili tyknięcia,
//     pobrania nigdy naraz, zegar ≥ 60 s); I10 fokus pobiera od razu; I11 budżet na slot (3, 4 i 8 kontekstów; maksimum
//     żądań w oknie 60 s).
//
// Czerwone na bazie (pliki produktu z origin/audyt 9e431afd, sprawdzone w kopii): wpisane w ALGORITHMS
// P-SYNC-ODPYTYWANIE-WS (liczby z przebiegu).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const T0 = Date.parse('2026-11-02T10:00:00.000Z');
const sek = (t) => Math.round((t - T0) / 100) / 10;
function magazyn(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

// Serwer: 'pong' (przyjmuje, odpowiada na ping), 'cisza' (przyjmuje, nie odpowiada), 'zamyka' (przyjmuje i od razu zamyka),
// 'odrzuca' (nieudany handshake, np. 429: error + close 1006). Tryb serwera można zmieniać w trakcie (o.st.serwer = ...).
// tryb: 'prywatny' | 'chmurowy' | 'jednorazowy' (VildaVault.isEphemeralMode) | 'jednorazowy-sesja' (klucz
// vilda-ephemeral-session-v1) | 'jednorazowy-persistence' (VildaPersistence.isEphemeralMode) | 'tryb-rzuca'.
function okno({ tryb = 'prywatny', serwer = 'pong', integracja = true, stronami = true, ws = true, pull = null, log = null, nr = 0, opoznienie = null } = {}) {
  const st = { serwer, wLocie: 0, maksWLocie: 0 };
  const zdarz = (typ) => { if (log) log.push({ t: Date.now(), typ, nr }); };
  const listeners = new Map(), docListeners = new Map();
  const reg = (h, n) => (fn) => { (h[n] ||= []).push(fn); };
  const h = {};
  const gniazda = [];
  class Gniazdo {
    constructor(url, protocols) {
      this.url = url; this.protocols = protocols; this.readyState = 0; this.wyslane = []; this.at = Date.now(); gniazda.push(this);
      zdarz('socket');
      setTimeout(() => {
        if (st.serwer === 'odrzuca') { this.readyState = 3; this.onerror?.(); this.onclose?.({ code: 1006 }); return; }
        this.readyState = 1; this.onopen?.();
        if (st.serwer === 'zamyka') setTimeout(() => { if (this.readyState !== 3) { this.readyState = 3; this.onclose?.({ code: 1000 }); } }, 5);
      }, 50);
    }
    send(m) {
      this.wyslane.push(m);
      if (JSON.parse(m).type === 'ping' && st.serwer === 'pong') {
        setTimeout(() => { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify({ type: 'pong', ts: Date.now() }) }); }, 30);
      }
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; setTimeout(() => this.onclose?.({ code: 1006 }), 1); }
  }
  const vault = {
    isUnlocked: () => true,
    isCloudOnlyMode: () => tryb === 'chmurowy',
    isEphemeralMode: () => { if (tryb === 'tryb-rzuca') throw new Error('fikcyjny błąd trybu'); return tryb === 'jednorazowy'; },
    getCurrentUser: () => ({ userId: 'fikcyjny-uzytkownik' }),
    getSyncMaterial: vi.fn(async () => ({ slotId: 'f'.repeat(64), authToken: 'FIKCYJNY-TOKEN' })),
  };
  for (const n of ['onUnlock', 'onLock', 'onPatientSaved', 'onPatientDeleted', 'onNoteChanged', 'onPatientNoteChanged',
    'onPreferenceChanged', 'onPasskeyChanged', 'onCredentialChanged', 'onPatientListChanged']) vault[n] = reg(h, n);
  const syncPull = vi.fn(async () => {
    // Jedno pobranie = GET /status (kubełek KV 40/min) + GET /changes (licznik DO 120/min), jak Bpw_pull bez zaległości.
    zdarz('status'); zdarz('changes');
    st.wLocie += 1; st.maksWLocie = Math.max(st.maksWLocie, st.wLocie);
    try { return pull ? await pull() : { action: 'up-to-date' }; } finally { st.wLocie -= 1; }
  });
  const sync = { syncPull, syncPush: vi.fn(async () => ({})), syncFull: vi.fn(async () => ({})),
    onSyncStart: reg(h, 's'), onSyncComplete: reg(h, 'c'), onSyncError: reg(h, 'e'), isPagedActive: vi.fn(() => stronami) };
  if (stronami === null) delete sync.isPagedActive; // starszy vilda_sync.js bez isPagedActive
  const document = { hidden: false, readyState: 'complete', documentElement: { classList: { contains: () => false } },
    addEventListener: (n, fn) => { (docListeners.get(n) || docListeners.set(n, []).get(n)).push(fn); }, removeEventListener() {}, dispatchEvent: () => true };
  const sesja = { 'vilda-probe-done-v1': '1' };
  if (tryb === 'jednorazowy-sesja') sesja['vilda-ephemeral-session-v1'] = '1';
  const win = { document, localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), sessionStorage: magazyn(sesja),
    navigator: { onLine: true }, setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a),
    // opoznienie: tyknięcie setInterval spóźnione o kolejne ms z listy, bez dryfu (harmonogram jak w przeglądarce).
    setInterval: (fn, ms) => { let k = 0; return setInterval(() => { const d = opoznienie ? opoznienie[k++ % opoznienie.length] : 0; if (d) setTimeout(fn, d); else fn(); }, ms); },
    clearInterval: (...a) => clearInterval(...a),
    addEventListener: (n, fn) => { (listeners.get(n) || listeners.set(n, []).get(n)).push(fn); }, removeEventListener() {},
    frames: [], location: { origin: 'https://fikcyjny.test' }, VildaVault: vault, VildaSync: sync };
  if (ws) win.WebSocket = Gniazdo;
  if (tryb === 'jednorazowy-persistence') win.VildaPersistence = { isEphemeralMode: () => true };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  if (integracja) loadBrowserScript('vilda_sync_integration.js', win);
  else win.VildaSyncIntegration = { isSyncEnabled: () => true, pullNow: vi.fn(), applyDelta: vi.fn() };
  loadBrowserScript('vilda_realtime.js', win);
  return { win, sync, vault, gniazda, h, st, listeners, docListeners, rt: win.VildaRealtime,
    proby: () => gniazda.map((g) => sek(g.at)), pobrania: () => syncPull.mock.calls.length };
}
// Chwile kolejnych wywołań syncPull (s od T0), zapisywane przez szpiega na atrapie.
function zapisujCzasy(o) {
  const t = [];
  const orig = o.sync.syncPull.getMockImplementation();
  o.sync.syncPull.mockImplementation((...a) => { t.push(sek(Date.now())); return orig(...a); });
  return t;
}
const odstepy = (p) => p.slice(1).map((t, k) => Math.round(t - p[k]));
// Kontrole „jak dziś” mają przechodzić także na bazie (vilda_realtime.js bez isLive): wtedy 'brak-api'.
const zywosc = (o) => (typeof o.rt.isLive === 'function' ? o.rt.isLive() : 'brak-api');

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('E2-PR1b realtime: żywotność gniazda (lastPongAt)', () => {
  it('R1: isLive dopiero po pong; info() podaje lastPongAt i live', async () => {
    const o = okno({ integracja: false });
    await vi.advanceTimersByTimeAsync(1300); // start 1,2 s + handshake
    expect(o.rt.status()).toBe('open');
    expect(o.rt.isLive(), 'otwarte, ale bez pong').toBe(false);
    expect(o.rt.getLastPongAt()).toBeNull();
    expect(o.rt.info()).toMatchObject({ status: 'open', live: false, lastPongAt: null });
    await vi.advanceTimersByTimeAsync(25_100); // ping bicia serca po 25 s, pong po 30 ms
    expect(o.rt.isLive()).toBe(true);
    expect(o.rt.getLastPongAt()).toBeGreaterThan(T0);
    expect(o.rt.info()).toMatchObject({ status: 'open', live: true, lastPongAt: o.rt.getLastPongAt() });
  });

  it('R2: serwer przestaje odpowiadać — pong sprzed 25 s jeszcze żywy, po zamknięciu (brak pong 10 s) isLive = false', async () => {
    const o = okno({ integracja: false });
    await vi.advanceTimersByTimeAsync(26_500);
    expect(o.rt.isLive()).toBe(true);
    o.st.serwer = 'cisza';
    await vi.advanceTimersByTimeAsync(25_000); // ping w 51 s bez odpowiedzi, pong sprzed 25 s
    expect(o.rt.isLive(), 'pong sprzed 25 s').toBe(true);
    await vi.advanceTimersByTimeAsync(11_000); // limit pong 10 s → zamknięcie
    expect(o.rt.status()).not.toBe('open');
    expect(o.rt.isLive()).toBe(false);
    expect(o.rt.getLastPongAt()).toBeNull();
  });

  it('R2b: pong starszy niż 45 s przy wciąż otwartym gnieździe (zegary uśpione, np. karta w tle) — isLive = false; 44 s — true', async () => {
    const o = okno({ integracja: false });
    await vi.advanceTimersByTimeAsync(26_500);
    expect(o.rt.isLive()).toBe(true);
    const pong = o.rt.getLastPongAt();
    vi.setSystemTime(pong + 44_999); // bez uruchamiania zegarów
    expect(o.rt.isLive(), '44,999 s').toBe(true);
    vi.setSystemTime(pong + 45_000);
    expect(o.rt.status()).toBe('open');
    expect(o.rt.isLive(), '45 s').toBe(false);
    expect(o.rt.info().live).toBe(false);
  });

  it('R2c: gniazdo w stanie CLOSING (readyState 2, onclose jeszcze nie przyszło) ze świeżym pong — isLive = false', async () => {
    const o = okno({ integracja: false });
    await vi.advanceTimersByTimeAsync(26_500);
    expect(o.rt.isLive()).toBe(true);
    o.gniazda.at(-1).readyState = 2; // zamykanie rozpoczęte (np. ramka close serwera), zdarzenie close jeszcze nie przyszło
    expect(o.rt.status(), 'stan modułu jeszcze open').toBe('open');
    expect(o.rt.isLive()).toBe(false);
    expect(o.rt.info().live).toBe(false);
  });

  it('R3: disconnect (blokada sejfu) zeruje żywotność', async () => {
    const o = okno({ integracja: false });
    await vi.advanceTimersByTimeAsync(26_500);
    expect(o.rt.isLive()).toBe(true);
    o.rt.disconnect();
    expect(o.rt.isLive()).toBe(false);
    expect(o.rt.getLastPongAt()).toBeNull();
  });

  it('R3b: nowe gniazdo nie dziedziczy pong poprzedniego (zerowanie przy zamknięciu)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const o = okno({ integracja: false });
    await vi.advanceTimersByTimeAsync(26_500);
    expect(o.rt.isLive()).toBe(true);
    o.gniazda.at(-1).close();
    await vi.advanceTimersByTimeAsync(12_000); // ponowna próba po 10 s, otwarcie po 50 ms, bez pong
    expect(o.rt.status()).toBe('open');
    expect(o.gniazda).toHaveLength(2);
    expect(o.rt.isLive(), 'nowe gniazdo bez własnego pong').toBe(false);
  });

  it('R10: info() zachowuje dotychczasowe pola (linia „połączono” w Ustawieniach)', async () => {
    const o = okno({ integracja: false });
    await vi.advanceTimersByTimeAsync(1300);
    expect(Object.keys(o.rt.info()).sort()).toEqual(['lastChangeAt', 'lastError', 'lastPongAt', 'leader', 'live', 'opens', 'status', 'supported']);
    expect(o.rt.info()).toMatchObject({ status: 'open', opens: 1, lastChangeAt: 0, lastError: null, supported: true, leader: true });
  });
});

describe('E2-PR1b realtime: odstęp ponownego łączenia w trybie „Komputer prywatny”', () => {
  it('R4: serwer odrzuca — pierwsza ponowna próba po 10 s, potem ×2 do sufitu 5 min (rozrzut 1,0)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const o = okno({ integracja: false, serwer: 'odrzuca' });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    const p = o.proby();
    expect(p[0], 'pierwsza próba jak dziś (1,2 s po starcie)').toBe(1.2);
    expect(odstepy(p)).toEqual([10, 20, 40, 80, 160, 300, 300, 300, 300]);
    expect(p.filter((t) => t <= 20 * 60).length, 'w 20 min (dziś 45)').toBeLessThanOrEqual(10);
  });

  it('R5: rozrzut 0,8–1,2 i dolna granica 10 s; przy suficie 240–360 s', async () => {
    const r = vi.spyOn(Math, 'random');
    r.mockReturnValue(0);
    let o = okno({ integracja: false, serwer: 'odrzuca' });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    let d = odstepy(o.proby());
    expect(d.slice(0, 3), 'najmniejszy rozrzut: 8 s odbite w górę → 12 s, potem 16, 32').toEqual([12, 16, 32]);
    expect(d.at(-1), 'sufit × 0,8').toBe(240);
    vi.clearAllTimers(); vi.setSystemTime(T0);
    r.mockReturnValue(0.999999);
    o = okno({ integracja: false, serwer: 'odrzuca' });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    d = odstepy(o.proby());
    expect(d.slice(0, 3), 'największy rozrzut ×1,2').toEqual([12, 24, 48]);
    expect(d.at(-1), 'sufit × 1,2').toBe(360);
    for (const x of d) { expect(x).toBeGreaterThanOrEqual(10); expect(x).toBeLessThanOrEqual(360); }
  });

  it('R5b: pierwsza ponowna próba rozłożona równomiernie na 10–12 s (wartość poniżej 10 s odbita w górę), nie połowa kart w 10,000 s', async () => {
    const r = vi.spyOn(Math, 'random');
    const pierwsze = [];
    for (const los of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.999999]) {
      vi.clearAllTimers(); vi.setSystemTime(T0);
      r.mockReturnValue(los);
      const o = okno({ integracja: false, serwer: 'odrzuca' });
      await vi.advanceTimersByTimeAsync(15_000);
      const p = o.gniazda.map((g) => g.at - T0);
      pierwsze.push(p[1] - p[0] - 50); // bez 50 ms nieudanego handshake atrapy
    }
    expect(pierwsze).toEqual([12000, 11500, 11000, 10500, 10000, 10500, 11000, 11500, 12000]);
  });

  it('R6: serwer przyjmuje i od razu zamyka — bez pętli co 2 s (otwarcie nie zeruje odstępu): ≤ 3 gniazda w minucie (dziś 29)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const o = okno({ integracja: false, serwer: 'zamyka' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(o.gniazda.length).toBeLessThanOrEqual(3);
    expect(odstepy(o.proby())).toEqual([10, 20]);
  });

  it('R7: po pierwszym pong krok wraca do 10 s', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const o = okno({ integracja: false, serwer: 'odrzuca' });
    await vi.advanceTimersByTimeAsync(80_000); // próby 1,2 / 11,2 / 31,3 / 71,3 → następna za 80 s
    o.st.serwer = 'pong';
    await vi.advanceTimersByTimeAsync(80_000 + 26_000); // próba ~151 s otwiera, pong ~177 s
    expect(o.rt.isLive()).toBe(true);
    const n = o.gniazda.length;
    o.st.serwer = 'odrzuca';
    o.gniazda.at(-1).close();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(o.gniazda.length, 'ponowna próba po 10 s, nie po 160 s').toBe(n + 1);
    await vi.advanceTimersByTimeAsync(20_500);
    expect(o.gniazda.length, 'potem znów rośnie: 20 s').toBe(n + 2);
  });

  it('R8: zdarzenie online łączy od razu i zeruje krok', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const o = okno({ integracja: false, serwer: 'odrzuca' });
    await vi.advanceTimersByTimeAsync(40_000); // krok już 40 s
    const n = o.gniazda.length;
    for (const fn of o.listeners.get('online')) fn();
    await vi.advanceTimersByTimeAsync(100);
    expect(o.gniazda.length).toBe(n + 1);
    await vi.advanceTimersByTimeAsync(10_500);
    expect(o.gniazda.length, 'po online krok od 10 s').toBe(n + 2);
    o.st.serwer = 'pong';
    for (const fn of o.listeners.get('online')) fn();
    await vi.advanceTimersByTimeAsync(1_700); // najmniejszy odstęp prób 1,5 s jak dziś
    expect(o.rt.status()).toBe('open');
  });

  it.each(['focus', 'visibilitychange'])('R8b: %s przy zamkniętym gnieździe łączy od razu i zeruje krok (następna próba po 10 s, nie po 80 s)', async (zd) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const o = okno({ integracja: false, serwer: 'odrzuca' });
    await vi.advanceTimersByTimeAsync(40_000); // próby 1,2 / 11,3 / 31,3; następna za 40 s, krok już 80 s
    const n = o.gniazda.length;
    const sluchacze = zd === 'focus' ? o.listeners.get('focus') : o.docListeners.get('visibilitychange');
    for (const fn of sluchacze) fn();
    await vi.advanceTimersByTimeAsync(100);
    expect(o.gniazda.length, 'próba od razu').toBe(n + 1);
    await vi.advanceTimersByTimeAsync(10_500);
    expect(o.gniazda.length, 'po fokusie krok od 10 s').toBe(n + 2);
  });

  it.each(['chmurowy', 'jednorazowy', 'jednorazowy-sesja', 'jednorazowy-persistence', 'tryb-rzuca'])(
    'R9: tryb %s — odstęp jak dziś (2, 4, 8, 16, 30, 30 s; otwarcie zeruje)', async (tryb) => {
      const o = okno({ integracja: false, serwer: 'odrzuca', tryb });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(odstepy(o.proby()).slice(0, 6)).toEqual([2, 4, 8, 16, 30, 30]);
    });

  it.each(['chmurowy', 'jednorazowy', 'jednorazowy-sesja', 'jednorazowy-persistence', 'tryb-rzuca'])(
    'R9b: tryb %s, serwer przyjmuje i zamyka — jak dziś: otwarcie zeruje odstęp (pętla co ~2 s)', async (tryb) => {
      const o = okno({ integracja: false, serwer: 'zamyka', tryb });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(o.gniazda.length, 'dziś 29 w minucie').toBeGreaterThanOrEqual(25);
    });
});

describe('E2-PR1b integracja: odpytywanie 60 s przy żywym WebSocket', () => {
  it('I1: żywe gniazdo i pobieranie stronami — pobranie z zegara co 60 s (dziś 16 w 5 min)', async () => {
    const o = okno();
    const t = zapisujCzasy(o);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(o.rt.isLive()).toBe(true);
    // onopen woła pullNow (1,3 s), zegar co 10 s: ~20 s do pierwszego pong (≈26 s), potem co 60 s.
    expect(t).toEqual([1.3, 20, 80, 140, 200, 260]);
    expect(o.sync.isPagedActive).toHaveBeenCalled();
  });

  it('I1b: tyknięcia zegara spóźnione o 1–9 ms (jak w przeglądarce, bez dryfu) — dalej co 60 s, nie na przemian 60 i 70 s', async () => {
    const o = okno({ opoznienie: [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5] }); // 11 wartości: bez wspólnego okresu z 6 i 7 tyknięciami
    const t = zapisujCzasy(o);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(o.rt.isLive()).toBe(true);
    const d = odstepy(t.filter((x) => x > 30));
    expect(d.length).toBeGreaterThanOrEqual(25);
    expect(d.filter((x) => x !== 60), `odstępy pobrań z zegara: ${d}`).toEqual([]);
  });

  it.each([
    ['bez pobierania stronami (flaga "0", tryb w pracy / jednorazowy, kursor 0 bez wyniku health)', { stronami: false }],
    ['starszy vilda_sync.js bez isPagedActive', { stronami: null }],
  ])('I2: %s — jak dziś, co ~20 s (16 pobrań w 5 min)', async (_n, op) => {
    const o = okno(op);
    const t = zapisujCzasy(o);
    await vi.advanceTimersByTimeAsync(300_000);
    expect([true, 'brak-api']).toContain(zywosc(o));
    expect(o.pobrania()).toBe(16);
    expect(odstepy(t.slice(1)).every((x) => x === 20)).toBe(true);
  });

  it('I2b: bez WebSocket (przeglądarka bez obsługi) — jak dziś: tyknięcie co 10 s, pobranie co 20 s (15 w 5 min)', async () => {
    const o = okno({ ws: false });
    const t = zapisujCzasy(o);
    await vi.advanceTimersByTimeAsync(300_000);
    expect([false, 'brak-api']).toContain(zywosc(o));
    expect(t.slice(0, 3)).toEqual([10, 30, 50]);
    expect(o.pobrania()).toBe(15);
  });

  it('I3: gniazdo bez pong (serwer milczy) — jak dziś', async () => {
    const o = okno({ serwer: 'cisza' });
    await vi.advanceTimersByTimeAsync(300_000);
    expect([false, 'brak-api']).toContain(zywosc(o));
    expect(o.pobrania()).toBeGreaterThanOrEqual(15);
  });

  it('I4: utrata żywotności (gniazdo zamknięte) — najbliższe tyknięcie zegara pobiera, potem co ~20 s', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const o = okno();
    const t = zapisujCzasy(o);
    await vi.advanceTimersByTimeAsync(150_000); // pobrania 1,3 / 20 / 80 / 140
    expect(t).toEqual([1.3, 20, 80, 140]);
    o.st.serwer = 'odrzuca';
    o.gniazda.at(-1).close(); // 150 s
    await vi.advanceTimersByTimeAsync(50_000);
    expect(o.rt.isLive()).toBe(false);
    expect(t.slice(4), 'tyknięcie 160 s (≥ 12 s od 140 s) pobiera od razu, potem 180, 200').toEqual([160, 180, 200]);
  });

  it('I4b: pong starszy niż 45 s przy otwartym gnieździe — następne tyknięcie po 12 s od ostatniego pobrania pobiera', async () => {
    const o = okno();
    const t = zapisujCzasy(o);
    await vi.advanceTimersByTimeAsync(85_000); // pobrania 1,3 / 20 / 80; pong w ~76 s
    expect(t).toEqual([1.3, 20, 80]);
    o.st.serwer = 'cisza';
    // Zegar ścienny skacze o 46 s bez uruchamiania zegarów (np. uśpiony proces), potem zegary ruszają.
    vi.setSystemTime(Date.now() + 46_000);
    expect(o.rt.status()).toBe('open');
    expect(o.rt.isLive()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.length, 'tyknięcie przy pong > 45 s pobiera mimo < 60 s od poprzedniego').toBe(4);
  });

  it('I5: ramka changed pobiera od razu także przy żywym gnieździe', async () => {
    const o = okno();
    await vi.advanceTimersByTimeAsync(90_000);
    expect([true, 'brak-api']).toContain(zywosc(o));
    const n = o.pobrania();
    o.gniazda.at(-1).onmessage({ data: JSON.stringify({ type: 'changed' }) });
    await vi.advanceTimersByTimeAsync(1_600);
    expect(o.pobrania()).toBe(n + 1);
  });

  it('I6: starszy vilda_realtime.js bez isLive — jak dziś (16 w 5 min)', async () => {
    const o = okno();
    delete o.win.VildaRealtime.isLive;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(o.pobrania()).toBe(16);
  });

  it.each(['isPagedActive', 'isLive'])('I6b: %s rzuca — jak dziś (16 w 5 min)', async (co) => {
    const o = okno();
    const rzuca = () => { throw new Error('fikcyjny błąd'); };
    // isLive sprawdzane pierwsze: przy rzucającym isPagedActive gniazdo jest żywe (isLive prawda), przy rzucającym
    // isLive isPagedActive daje true (atrapa), więc w obu wariantach o wyniku decyduje sam wyjątek.
    if (co === 'isPagedActive') o.sync.isPagedActive.mockImplementation(rzuca);
    else o.win.VildaRealtime.isLive = rzuca;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(o.pobrania()).toBe(16);
  });

  it('I6c: isLive albo isPagedActive zwraca prawdziwą wartość, która nie jest true (obcy albo starszy plik) — jak dziś', async () => {
    const o = okno();
    o.sync.isPagedActive.mockReturnValue(1);
    await vi.advanceTimersByTimeAsync(150_000);
    const n = o.pobrania();
    o.sync.isPagedActive.mockReturnValue(true);
    o.win.VildaRealtime.isLive = () => 'tak';
    await vi.advanceTimersByTimeAsync(150_000);
    expect([n, o.pobrania()], 'co ~20 s w obu połowach').toEqual([8, 16]);
  });

  it('I7: WIPE_GUARD planuje pobranie po 800 ms także przy żywym gnieździe (reguła 60 s tylko dla tyknięć zegara)', async () => {
    const o = okno();
    await vi.advanceTimersByTimeAsync(90_000);
    o.gniazda.at(-1).onmessage({ data: JSON.stringify({ type: 'changed' }) }); // pobranie w 90 s
    await vi.advanceTimersByTimeAsync(15_000); // 105 s: od pobrania ≥ 12 s, < 60 s (tyknięcie 100 s pominięte)
    expect([true, 'brak-api']).toContain(zywosc(o)); // baza nie ma isLive: kontrola „jak dziś”
    const n = o.pobrania();
    for (const fn of o.h.e) fn({ operation: 'push', error: { code: 'WIPE_GUARD', message: 'fikcyjny' } });
    await vi.advanceTimersByTimeAsync(900);
    expect(o.pobrania()).toBe(n + 1);
  });

  it('I8: bez podwójnych pobrań — pobrania nigdy naraz, ramka changed w chwili tyknięcia daje jedno pobranie, zegar przy żywym gnieździe ≥ 60 s', async () => {
    const o = okno({ pull: () => new Promise((r) => { setTimeout(() => r({ action: 'up-to-date' }), 3_000); }) });
    const t = zapisujCzasy(o);
    await vi.advanceTimersByTimeAsync(140_000 - 1); // tuż przed tyknięciem 140 s
    const n = t.length;
    o.gniazda.at(-1).onmessage({ data: JSON.stringify({ type: 'changed' }) }); // pullNow w tej samej chwili co tyknięcie
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(t[n], 'pobranie z ramki').toBe(140);
    expect(t.filter((x) => x >= 139 && x < 150), 'tyknięcie 140 s nie dokłada drugiego').toHaveLength(1);
    expect(o.st.maksWLocie, 'syncPull nigdy dwa naraz').toBe(1);
    const zZegara = t.filter((x) => x > 30);
    expect(odstepy(zZegara).every((x) => x >= 60), `odstępy pobrań przy żywym gnieździe: ${odstepy(zZegara)}`).toBe(true);
  });

  it('I10: fokus przy żywym gnieździe pobiera od razu (bez reguły 60 s)', async () => {
    const o = okno();
    await vi.advanceTimersByTimeAsync(95_000); // na zmianie ostatnie pobranie 80 s, na bazie 80 s też (co 20 s)
    expect([true, 'brak-api']).toContain(zywosc(o));
    const n = o.pobrania();
    for (const fn of o.listeners.get('focus')) fn();
    await vi.advanceTimersByTimeAsync(100);
    expect(o.pobrania()).toBe(n + 1);
  });
});

// Budżet na slot (worker v37a: kubełek KV 40/min — /status, /blob, handshake /socket; licznik DO 120/min — /changes). Każdy
// kontekst = jedno okno najwyższego poziomu (karta) z własnym zegarem i gniazdem; maksimum żądań w dowolnym oknie 60 s
// w stanie ustalonym (ostatnie 8 z 10 min). Bez pracy (bez PUT /blob i ramek changed): sam koszt odpytywania i gniazd.
function maks(log, typ, od) {
  const t = log.filter((z) => z.typ === typ && z.t >= od).map((z) => z.t).sort((a, b) => a - b);
  let m = 0;
  for (let i = 0, j = 0; i < t.length; i++) { while (t[i] - t[j] >= 60_000) j++; m = Math.max(m, i - j + 1); }
  return m;
}
async function budzet(n, serwer, stronami = true) {
  const log = [];
  for (let k = 0; k < n; k++) { okno({ serwer, stronami, log, nr: k }); await vi.advanceTimersByTimeAsync(2_700); }
  await vi.advanceTimersByTimeAsync(600_000);
  const od = Date.now() - 480_000;
  const status = maks(log, 'status', od), socket = maks(log, 'socket', od), changes = maks(log, 'changes', od);
  return { status, socket, kv: status + socket, changes };
}
describe('E2-PR1b budżet żądań na slot (atrapa, zegar wirtualny)', () => {
  it.each([
    // [konteksty, serwer, oczekiwane maksimum w oknie 60 s] — dziś (bez E2-PR1b, zmierzone na bazie): gniazdo żywe KV 3n i
    // DO 3n (3: 9, 4: 12, 8: 24); serwer odrzuca KV 5n = 3n /status + 2n /socket (15, 20, 40), DO 3n
    [3, 'pong', { status: 3, socket: 0, kv: 3, changes: 3 }],
    [4, 'pong', { status: 4, socket: 0, kv: 4, changes: 4 }],
    [8, 'pong', { status: 8, socket: 0, kv: 8, changes: 8 }],
    [3, 'odrzuca', { status: 9, socket: 3, kv: 12, changes: 9 }],
    [4, 'odrzuca', { status: 12, socket: 4, kv: 16, changes: 12 }],
    [8, 'odrzuca', { status: 24, socket: 8, kv: 32, changes: 24 }],
  ])('I11: %i kontekstów, serwer %s — maksimum żądań w oknie 60 s', async (n, serwer, oczek) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(await budzet(n, serwer)).toEqual(oczek);
  });

  it('I11b: kontrola — bez pobierania stronami (flaga "0") odpytywanie jak dziś: 4 konteksty, gniazdo żywe → 12 /status i 12 /changes na minutę', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(await budzet(4, 'pong', false)).toEqual({ status: 12, socket: 0, kv: 12, changes: 12 });
  });
});
