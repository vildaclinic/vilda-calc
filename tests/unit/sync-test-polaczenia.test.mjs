// P-SYNC-TEST-POLACZENIA — „Test połączenia z synchronizacją” (vilda_sync_connection_test.js) i historia połączeń na
// żywo (VildaRealtime.getHistory() w vilda_realtime.js). Prawdziwe pliki produkcyjne w sztucznym oknie
// (loadBrowserScript); sieć, gniazdo i serwer to atrapy, zegar wirtualny. Dane wyłącznie FIKCYJNE, bez sieci.
//
// Co pilnuje:
//   M1 klasyfikacja próbki GET /v1/health (ok, sieć, limit czasu, HTTP, zła treść) i podsumowanie pięciu próbek.
//   M2 analiza historii: regularne zerwania po 60 s, „disconnect” (blokada sejfu) nie jest zerwaniem, nieudane otwarcia.
//   M3 werdykt: serwer nieosiągalny → error z radą dla IT; regularne zerwania → warn „zapora/proxy”; wszystko działa → ok.
//   M4 run(): żywe gniazdo, serwer odrzuca wszystko (TypeError), limit czasu, brak internetu, synchronizacja wyłączona,
//      gniazdo otwarte bez pong (czeka i zgłasza open-no-pong).
//   M5 raport dla IT: zawiera host i werdykt, nie zawiera ID konta ani tokenu.
//   R1 prawdziwy vilda_realtime.js: każde gniazdo ma wpis historii (otwarcie, zamknięcie, kod, liczba pong); serwer
//      zamykający po 60 s daje regularne zerwania widoczne w analizie; disconnect() znaczy wpis „disconnect”;
//      najwyżej 30 wpisów; dotychczasowe pola info() bez zmian.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const T0 = Date.parse('2026-11-16T08:00:00.000Z');
const SLOT = 'f'.repeat(64);
const TOKEN = 'FIKCYJNY-TOKEN-TESTU';

function modul() {
  return loadBrowserScript('vilda_sync_connection_test.js', {}).VildaSyncConnectionTest;
}

const odpOk = (ms = 0) => async () => {
  if (ms) await new Promise((r) => setTimeout(r, ms));
  return { status: 200, json: async () => ({ status: 'ok', version: '37', api: 37 }) };
};

describe('model testu połączenia', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
  afterEach(() => { vi.useRealTimers(); });

  it('M1 klasyfikuje próbki i podsumowuje', () => {
    const M = modul();
    expect(M.classifyHealthSample({ status: 200, body: { status: 'ok', api: 37 }, ms: 120 })).toMatchObject({ ok: true, kind: 'ok', api: '37' });
    expect(M.classifyHealthSample({ error: new TypeError('Failed to fetch'), ms: 30 })).toMatchObject({ ok: false, kind: 'network' });
    const limit = new Error('x'); limit.name = 'AbortError';
    expect(M.classifyHealthSample({ error: limit, ms: 8000 })).toMatchObject({ ok: false, kind: 'timeout' });
    expect(M.classifyHealthSample({ status: 403, body: null, ms: 40 })).toMatchObject({ ok: false, kind: 'http', status: 403 });
    expect(M.classifyHealthSample({ status: 200, body: null, ms: 40 })).toMatchObject({ ok: false, kind: 'format' });

    const ok = { ok: true, kind: 'ok', ms: 100 };
    expect(M.summarizeHealth([ok, ok, { ...ok, ms: 300 }, ok, ok])).toMatchObject({ level: 'ok', okCount: 5, medianMs: 100, maxMs: 300 });
    expect(M.summarizeHealth([ok, ok, { ok: false, kind: 'network' }, ok, ok])).toMatchObject({ level: 'warn', okCount: 4, failKinds: { network: 1 } });
    expect(M.summarizeHealth(Array(5).fill({ ok: false, kind: 'timeout' }))).toMatchObject({ level: 'error', okCount: 0 });
    expect(M.summarizeHealth(Array(5).fill({ ...ok, ms: 2500 })).level).toBe('warn');
  });

  it('M2 analizuje historię połączeń na żywo', () => {
    const M = modul();
    const wpis = (start, zycie, code, pongs = 2) => ({ startedAt: start, openedAt: start + 100, closedAt: start + 100 + zycie, code, pongs });
    const hist = { since: T0, entries: [
      wpis(T0, 60_000, 1006), wpis(T0 + 70_000, 61_000, 1006), wpis(T0 + 140_000, 59_500, 1006), wpis(T0 + 210_000, 60_200, 1006),
      { startedAt: T0 + 280_000, openedAt: null, closedAt: T0 + 281_000, code: 1006, pongs: 0 },
      { startedAt: T0 + 290_000, openedAt: T0 + 290_100, closedAt: T0 + 295_000, code: 'disconnect', pongs: 0 },
      { startedAt: T0 + 300_000, openedAt: T0 + 300_100, closedAt: null, code: null, pongs: 1 },
    ] };
    const a = M.analyzeHistory(hist, T0 + 320_000);
    expect(a).toMatchObject({ attempts: 7, drops: 4, neverOpened: 1, regular: true, opened: 5 });
    expect(a.regularLifeMs).toBeGreaterThanOrEqual(59_500);
    expect(a.regularLifeMs).toBeLessThanOrEqual(61_000);
    expect(a.codes).toEqual({ 1006: 5 });
    expect(a.current).toMatchObject({ pongs: 1, ageMs: 19_900 });

    const nieregularne = M.analyzeHistory({ since: T0, entries: [wpis(T0, 5_000, 1006), wpis(T0, 600_000, 1006), wpis(T0, 90_000, 1006)] }, T0 + 1e6);
    expect(nieregularne.regular).toBe(false);
    expect(M.analyzeHistory(null, T0)).toMatchObject({ attempts: 0, drops: 0, regular: false });
  });

  it('M3 werdykt i rady', () => {
    const M = modul();
    const host = 'vilda-sync.maciej-4b9.workers.dev';
    const zero = M.analyzeHistory(null, T0);
    const blad = M.verdict({ host, online: true, health: M.summarizeHealth(Array(5).fill({ ok: false, kind: 'network' })), ws: { kind: 'skipped' }, history: zero });
    expect(blad.level).toBe('error');
    expect(blad.title).toMatch(/nieosiągalny/);
    expect(blad.advice.join(' ')).toContain(host);

    const okH = M.summarizeHealth(Array(5).fill({ ok: true, kind: 'ok', ms: 90 }));
    const regularne = M.analyzeHistory({ since: T0, entries: [0, 1, 2, 3].map((i) => ({ startedAt: T0 + i * 70_000, openedAt: T0 + i * 70_000, closedAt: T0 + i * 70_000 + 60_000, code: 1006, pongs: 2 })) }, T0 + 300_000);
    const warn = M.verdict({ host, online: true, health: okH, ws: { kind: 'live', pongAgeMs: 3000 }, history: regularne });
    expect(warn.level).toBe('warn');
    expect(warn.text).toMatch(/po ok\. 1 min/);
    expect(warn.text).toMatch(/co ok\. 20 s/);
    expect(warn.advice.join(' ')).toMatch(/zapora lub serwer proxy/);

    expect(M.verdict({ host, online: true, health: okH, ws: { kind: 'live', pongAgeMs: 1000 }, history: zero }).level).toBe('ok');
    expect(M.verdict({ host, online: false }).level).toBe('error');
    expect(M.verdict({ host, online: true, health: okH, ws: { kind: 'not-connected', waitedMs: 35_000 }, history: zero }).level).toBe('warn');
  });

  it('M4 run(): przebiegi z atrapami', async () => {
    const M = modul();
    const realtime = (o = {}) => ({
      info: () => ({ status: o.status || 'open', opens: 1, lastError: null, supported: true }),
      isLive: o.isLive || (() => true),
      getLastPongAt: () => Date.now() - 4000,
      getHistory: () => ({ since: T0, entries: [] }),
      connect: o.connect || (() => {}),
    });

    // Wszystko działa.
    const fetch = vi.fn(odpOk(50));
    let p = M.run({ fetch, realtime: realtime(), syncActive: true });
    await vi.runAllTimersAsync();
    let r = await p;
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch.mock.calls[0][0]).toMatch(/^https:\/\/vilda-sync\.maciej-4b9\.workers\.dev\/v1\/health\?t=\d+$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit' });
    expect(fetch.mock.calls[0][1].headers).toBeUndefined();
    expect(r.health).toMatchObject({ level: 'ok', okCount: 5, medianMs: 50 });
    expect(r.ws).toMatchObject({ kind: 'live', pongAgeMs: 4000 });
    expect(r.verdict.level).toBe('ok');

    // Zapora: każde żądanie kończy się TypeError.
    p = M.run({ fetch: async () => { throw new TypeError('Failed to fetch'); }, realtime: realtime(), syncActive: true });
    await vi.runAllTimersAsync();
    r = await p;
    expect(r.health).toMatchObject({ level: 'error', failKinds: { network: 5 } });
    expect(r.verdict.level).toBe('error');

    // Limit czasu: serwer milczy.
    p = M.run({ fetch: () => new Promise(() => {}), realtime: realtime(), syncActive: true, timeoutMs: 1000, samples: 2 });
    await vi.runAllTimersAsync();
    r = await p;
    expect(r.health.failKinds).toEqual({ timeout: 2 });

    // Brak internetu: żadnych żądań.
    const nic = vi.fn();
    r = await M.run({ fetch: nic, online: false, realtime: realtime(), syncActive: true });
    expect(nic).not.toHaveBeenCalled();
    expect(r.verdict.title).toBe('Brak internetu');

    // Synchronizacja wyłączona: serwer sprawdzony, gniazdo pominięte.
    p = M.run({ fetch: odpOk(), realtime: realtime(), syncActive: false, samples: 1 });
    await vi.runAllTimersAsync();
    r = await p;
    expect(r.ws.kind).toBe('skipped');
    expect(r.verdict.level).toBe('ok');

    // Gniazdo otwarte, ale pong nie przychodzi: czeka do limitu i zgłasza open-no-pong.
    p = M.run({ fetch: odpOk(), realtime: realtime({ isLive: () => false }), syncActive: true, samples: 1, wsWaitMs: 5000 });
    await vi.runAllTimersAsync();
    r = await p;
    expect(r.ws.kind).toBe('open-no-pong');
    expect(r.ws.waitedMs).toBeGreaterThanOrEqual(5000);
    expect(r.verdict.level).toBe('warn');

    // Gniazdo zamknięte: prosi o połączenie i zgłasza nawiązanie w trakcie testu.
    let polaczone = false;
    const connect = vi.fn(() => { setTimeout(() => { polaczone = true; }, 1200); });
    p = M.run({ fetch: odpOk(), realtime: realtime({ status: 'closed', isLive: () => polaczone, connect }), syncActive: true, samples: 1 });
    await vi.runAllTimersAsync();
    r = await p;
    expect(connect).toHaveBeenCalledTimes(1);
    expect(r.ws.kind).toBe('became-live');
  });

  it('M5 raport dla IT bez ID konta i tokenu', async () => {
    const M = modul();
    const p = M.run({ fetch: odpOk(), syncActive: true, samples: 2, realtime: {
      info: () => ({ status: 'open', supported: true, slotId: SLOT, authToken: TOKEN }),
      isLive: () => true, getLastPongAt: () => Date.now(),
      getHistory: () => ({ since: T0 - 600_000, entries: [{ startedAt: T0 - 500_000, openedAt: T0 - 499_000, closedAt: T0 - 439_000, code: 1006, pongs: 2 }] }),
    } });
    await vi.runAllTimersAsync();
    const r = await p;
    const tekst = M.buildReport(r, { time: '16.11.2026, 09:00:00', origin: 'https://vildaclinic.github.io', userAgent: 'FikcyjnaPrzegladarka/1.0' });
    expect(tekst).toContain('vilda-sync.maciej-4b9.workers.dev');
    expect(tekst).toContain(r.verdict.title);
    expect(tekst).toContain('1006 — zerwane bez pożegnania');
    expect(tekst).toContain('- 1 min, 1006');
    expect(tekst).not.toContain(SLOT);
    expect(tekst).not.toContain(TOKEN);
  });
});

// ── Prawdziwy vilda_realtime.js ───────────────────────────────────────────────────────────────
function oknoRealtime({ zamknijPo = null } = {}) {
  const gniazda = [];
  const h = {};
  class Gniazdo {
    constructor(url, protocols) {
      this.url = url; this.protocols = protocols; this.readyState = 0; gniazda.push(this);
      setTimeout(() => {
        this.readyState = 1; this.onopen?.();
        if (zamknijPo) setTimeout(() => { if (this.readyState === 1) { this.readyState = 3; this.onclose?.({ code: 1006 }); } }, zamknijPo);
      }, 50);
    }
    send(m) {
      if (JSON.parse(m).type === 'ping') setTimeout(() => { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify({ type: 'pong' }) }); }, 20);
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; setTimeout(() => this.onclose?.({ code: 1005 }), 1); }
  }
  const w = {
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { onLine: true },
    WebSocket: Gniazdo,
    addEventListener: () => {},
    VildaVault: {
      isUnlocked: () => true, isCloudOnlyMode: () => false, isEphemeralMode: () => false,
      getSyncMaterial: async () => ({ slotId: SLOT, authToken: TOKEN }),
      onUnlock: (fn) => { h.unlock = fn; }, onLock: (fn) => { h.lock = fn; },
    },
    VildaSyncIntegration: { isSyncEnabled: () => true, pullNow: () => {} },
  };
  w.self = w; w.top = w;
  loadBrowserScript('vilda_realtime.js', w);
  return { w, gniazda, h };
}

describe('historia połączeń w vilda_realtime.js', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
  afterEach(() => { vi.useRealTimers(); });

  it('R1 serwer zrywa co 60 s: wpisy, regularność, disconnect, limit 30', async () => {
    const { w, gniazda } = oknoRealtime({ zamknijPo: 60_000 });
    const RT = w.VildaRealtime;
    expect(typeof RT.getHistory).toBe('function');
    expect(RT.getHistory()).toEqual({ since: T0, entries: [] });

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const hist = RT.getHistory();
    expect(gniazda.length).toBeGreaterThanOrEqual(3);
    expect(hist.entries.length).toBe(gniazda.length);
    const zamkniete = hist.entries.filter((e) => e.closedAt !== null);
    expect(zamkniete.length).toBeGreaterThanOrEqual(3);
    for (const e of zamkniete) {
      expect(e.openedAt - e.startedAt).toBe(50);
      expect(e.closedAt - e.openedAt).toBe(60_000);
      expect(e.code).toBe(1006);
      expect(e.pongs).toBe(2); // ping co 25 s → pong po 25 i 50 s
    }
    // Kopia: modyfikacja wyniku nie zmienia stanu modułu.
    hist.entries[0].code = 'zmienione';
    expect(RT.getHistory().entries[0].code).toBe(1006);

    const M = loadBrowserScript('vilda_sync_connection_test.js', w).VildaSyncConnectionTest;
    const a = M.analyzeHistory(RT.getHistory(), Date.now());
    expect(a.regular).toBe(true);
    expect(a.regularLifeMs).toBe(60_000);

    // Dotychczasowe pola info() bez zmian.
    expect(Object.keys(RT.info()).sort()).toEqual(['lastChangeAt', 'lastError', 'lastPongAt', 'leader', 'live', 'opens', 'status', 'supported']);

    // disconnect() (np. blokada sejfu) znaczy otwarty wpis jako „disconnect”, nie jako zerwanie.
    await vi.advanceTimersByTimeAsync(30_000);
    const przed = RT.getHistory().entries.at(-1);
    if (przed.closedAt === null) {
      RT.disconnect();
      expect(RT.getHistory().entries.at(-1).code).toBe('disconnect');
    }

    // Limit 30 wpisów.
    RT.connect();
    await vi.advanceTimersByTimeAsync(90 * 60_000);
    expect(RT.getHistory().entries.length).toBe(30);
  });

  it('R2 zdrowe połączenie: jeden otwarty wpis, licznik pong rośnie', async () => {
    const { w } = oknoRealtime();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const e = w.VildaRealtime.getHistory().entries;
    expect(e.length).toBe(1);
    expect(e[0]).toMatchObject({ closedAt: null, code: null });
    expect(e[0].pongs).toBe(Math.floor((10 * 60_000 - 1250) / 25_000));
  });
});
