import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NOWE-URZADZENIE, etap 2 (decyzja właściciela 2026-10-12, makieta zaakceptowana 2026-10-13). Na „Komputerze
// prywatnym” pierwsze pobranie danych z chmury rusza samo, z oknem postępu (vilda_nowe_urzadzenie.js). Tu części
// bez DOM, na prawdziwym kodzie:
//  - vilda_sync.js czyta blob strumieniem i zgłasza postęp (vilda:sync-download-progress), a brak kolejnej porcji
//    przez 30 s przerywa pobieranie błędem TIMEOUT — dotąd limit czasu kończył się z nagłówkami odpowiedzi i samo
//    ciało bloba mogło wisieć bez końca (przy oknie, które blokuje aplikację, to nie do przyjęcia);
//  - „not-registered” niesie kod HTTP, żeby pierwsze pobranie odróżniło brak slotu (404) od błędu serwera;
//  - vilda_sync_integration.js oddaje start po odblokowaniu modułowi, gdy ten go przejmuje (przeładowanie w trakcie
//    pierwszego pobrania), a pullForNewDevice pobiera pod flagą integracji, bez równoległego pobrania w tle.
// Okno (DOM) sprawdzają testy e2e nowe-urzadzenie-pobieranie*.spec.mjs. Serwer i sejf to atrapy; dane fikcyjne.

const SLOT = 'e'.repeat(64);
const DATA = '2026-10-11T08:00:00.000Z';
const POSTEP = 'vilda:sync-download-progress';

function magazyn(seed) {
  const m = Object.assign(Object.create(null), seed || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function odroczona() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function zaszyfruj(klucz, obiekt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const szyfr = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, new TextEncoder().encode(JSON.stringify(obiekt))));
  const wynik = new Uint8Array(12 + szyfr.length);
  wynik.set(iv, 0);
  wynik.set(szyfr, 12);
  return wynik;
}

/**
 * Odpowiedź z ciałem czytanym porcjami (body.getReader). `zawiesPo` — po tylu porcjach read() już nie wraca
 * (zerwane połączenie bez zamknięcia). Bez strumienia: tylko arrayBuffer(), jak w starszych przeglądarkach.
 */
function odpowiedzBloba(bajty, { porcja = 1000, naglowki = {}, zawiesPo = null, strumien = true } = {}) {
  const stan = { anulowano: false, odczyty: 0 };
  const odp = {
    status: 200,
    ok: true,
    headers: { get: (k) => naglowki[String(k).toLowerCase()] ?? null },
    json: async () => ({}),
    arrayBuffer: async () => bajty.buffer.slice(bajty.byteOffset, bajty.byteOffset + bajty.byteLength),
    body: null,
  };
  if (strumien) {
    let offset = 0;
    odp.body = {
      getReader: () => ({
        read: () => {
          stan.odczyty += 1;
          if (zawiesPo !== null && stan.odczyty > zawiesPo) return new Promise(() => {});
          if (offset >= bajty.length) return Promise.resolve({ done: true, value: undefined });
          const value = bajty.slice(offset, offset + porcja);
          offset += porcja;
          return Promise.resolve({ done: false, value });
        },
        cancel: () => { stan.anulowano = true; return Promise.resolve(); },
      }),
    };
  }
  return { odp, stan };
}

const json = (status, cialo = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => cialo,
  headers: { get: () => null },
});

/** Nowe urządzenie z prawdziwym vilda_sync.js: slotu nie zna, sejf to atrapa ze scalaniem i postępem pacjentów. */
function noweUrzadzenie({ klucz, status, blob }) {
  const zdarzenia = [];
  const scalone = [];
  const zapytania = [];
  vi.stubGlobal('fetch', async (url, init = {}) => {
    const sciezka = new URL(url).pathname.replace(SLOT, '<slot>');
    zapytania.push(`${init.method || 'GET'} ${sciezka}`);
    if (sciezka.endsWith('/status')) return status();
    if (sciezka.endsWith('/blob')) return blob();
    if (sciezka.endsWith('/changes')) return json(200, { deltas: [], headSeq: 0 });
    return json(404);
  });
  const sejf = {
    isUnlocked: () => true,
    isCloudOnlyMode: () => false,
    getCurrentUser: () => ({ userId: 'u-fikcyjny' }),
    getSyncMaterial: async () => ({ slotId: SLOT, authToken: 'FIKCYJNY-TOKEN', syncEncKey: klucz }),
    listPatients: async () => [],
    mergeSyncPayload: async (ladunek, opcje) => {
      const n = ladunek.patients.length;
      opcje.onProgress({ phase: 'patients-start', current: 0, total: n });
      for (let i = 0; i < n; i += 1) opcje.onProgress({ phase: 'patients', current: i + 1, total: n });
      opcje.onProgress({ phase: 'done', current: n, total: n });
      scalone.push(ladunek);
      return {};
    },
  };
  const win = {
    localStorage: magazyn(),
    sessionStorage: magazyn(),
    navigator: {},
    addEventListener() {},
    removeEventListener() {},
    document: {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: (e) => { zdarzenia.push({ type: e.type, detail: e.detail }); return true; },
      hidden: false,
    },
    VildaVault: sejf,
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync.js', win);
  return { sync: win.VildaSync, zdarzenia, scalone, zapytania };
}

const LADUNEK = {
  schemaVersion: 2,
  patients: [
    { patientId: 'FIKCYJNY-1', header: { name: 'Test Jeden' }, snapshots: [] },
    { patientId: 'FIKCYJNY-2', header: { name: 'Test Dwa' }, snapshots: [] },
  ],
  tombstones: [],
  exportedAtISO: DATA,
};

describe('vilda_sync.js: postęp pierwszego pobrania (strumień bloba)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('blob czytany porcjami: postęp od 0 do całości (Content-Length), potem odszyfrowanie i pacjenci; scalony ten sam ładunek', async () => {
    const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const bajty = await zaszyfruj(klucz, LADUNEK);
    const { odp } = odpowiedzBloba(bajty, { porcja: 50, naglowki: { 'content-length': String(bajty.length), etag: '"E1"' } });
    const u = noweUrzadzenie({ klucz, status: () => json(200, { etag: 'E1', size: 999_999, lastModified: DATA }), blob: () => odp });

    const wynik = await u.sync.syncPull();
    expect(wynik.action).toBe('merged');
    expect(u.scalone).toEqual([LADUNEK]);

    const pobieranie = u.zdarzenia.filter((e) => e.type === POSTEP).map((e) => e.detail);
    expect(pobieranie[0], 'start: 0 z rozmiaru odpowiedzi (Content-Length ma pierwszeństwo przed size z /status)')
      .toEqual({ phase: 'download', loaded: 0, total: bajty.length });
    expect(pobieranie.at(-2)).toEqual({ phase: 'download', loaded: bajty.length, total: bajty.length });
    expect(pobieranie.at(-1)).toEqual({ phase: 'decrypt' });
    // Kolejność faz: pobieranie → odszyfrowanie → pacjenci (zdarzenie scalania jak dotąd).
    const fazy = u.zdarzenia.map((e) => (e.type === POSTEP ? e.detail.phase : e.type === 'vilda:vault-merge-progress' ? e.detail.phase : null)).filter(Boolean);
    expect(fazy.indexOf('decrypt')).toBeGreaterThan(fazy.lastIndexOf('download'));
    expect(fazy.indexOf('patients-start')).toBeGreaterThan(fazy.indexOf('decrypt'));
    expect(fazy.at(-1)).toBe('done');
  });

  it('bez Content-Length: rozmiar z /status', async () => {
    const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const bajty = await zaszyfruj(klucz, LADUNEK);
    const { odp } = odpowiedzBloba(bajty, { porcja: 100 });
    const u = noweUrzadzenie({ klucz, status: () => json(200, { etag: 'E1', size: bajty.length, lastModified: DATA }), blob: () => odp });
    expect((await u.sync.syncPull()).action).toBe('merged');
    const pobieranie = u.zdarzenia.filter((e) => e.type === POSTEP && e.detail.phase === 'download').map((e) => e.detail);
    expect(pobieranie[0]).toEqual({ phase: 'download', loaded: 0, total: bajty.length });
    expect(pobieranie.at(-1)).toEqual({ phase: 'download', loaded: bajty.length, total: bajty.length });
  });

  it('przeglądarka bez strumieni: arrayBuffer() jak dotąd i jedno zdarzenie po pobraniu', async () => {
    const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const bajty = await zaszyfruj(klucz, LADUNEK);
    const { odp } = odpowiedzBloba(bajty, { strumien: false });
    const u = noweUrzadzenie({ klucz, status: () => json(200, { etag: 'E1', size: bajty.length, lastModified: DATA }), blob: () => odp });
    expect((await u.sync.syncPull()).action).toBe('merged');
    expect(u.scalone).toEqual([LADUNEK]);
    expect(u.zdarzenia.filter((e) => e.type === POSTEP).map((e) => e.detail)).toEqual([
      { phase: 'download', loaded: bajty.length, total: bajty.length },
      { phase: 'decrypt' },
    ]);
  });

  it('zerwane połączenie w trakcie ciała: po 30 s bez kolejnej porcji TIMEOUT z tym, ile pobrano; czytnik anulowany, nic nie scalone', async () => {
    const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const bajty = await zaszyfruj(klucz, LADUNEK);
    const { odp, stan } = odpowiedzBloba(bajty, { porcja: 40, zawiesPo: 2, naglowki: { 'content-length': String(bajty.length) } });
    const u = noweUrzadzenie({ klucz, status: () => json(200, { etag: 'E1', size: bajty.length, lastModified: DATA }), blob: () => odp });
    vi.useFakeTimers();
    const pobranie = u.sync.syncPull().then(() => null, (e) => e);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(stan.anulowano, 'po 29 s jeszcze czeka').toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    const blad = await pobranie;
    expect(blad).toBeInstanceOf(Error);
    expect(blad.code).toBe('TIMEOUT');
    expect(blad.loaded).toBe(80);
    expect(blad.total).toBe(bajty.length);
    expect(blad.message).toMatch(/brak postępu przez 30 s/);
    expect(stan.anulowano).toBe(true);
    expect(u.scalone).toEqual([]);
  });

  it('„not-registered” niesie kod HTTP /status: 404 (brak slotu) i błąd serwera są rozróżnialne', async () => {
    const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    for (const kod of [404, 503]) {
      const u = noweUrzadzenie({ klucz, status: () => json(kod), blob: () => json(404) });
      expect(await u.sync.syncPull()).toEqual({ action: 'not-registered', httpStatus: kod });
      expect(u.zapytania).toEqual(['GET /v1/slots/<slot>/status']);
      vi.unstubAllGlobals();
    }
  });
});

/* Prawdziwy vilda_sync_integration.js z wirtualnym zegarem (wzór: nowe-urzadzenie-pytanie.test.mjs). */
function zaladujIntegracje({ localStorage, sessionStorage, sonda, syncPull, syncFull, modul } = {}) {
  const handlery = {};
  const rejestrator = (nazwa) => (fn) => { handlery[nazwa] = fn; };
  let odblokowany = false;
  const vault = {
    isUnlocked: () => odblokowany,
    isCloudOnlyMode: () => false,
    isEphemeralMode: () => false,
    canWarmStartCloudOnly: () => Promise.resolve(false),
    getCurrentUser: () => (odblokowany ? { userId: 'u-fikcyjny' } : null),
    onUnlock: rejestrator('unlock'),
    onLock: rejestrator('lock'),
    onNoteChanged: rejestrator('note'),
    onPatientSaved: rejestrator('patient'),
    onPatientDeleted: rejestrator('patientDeleted'),
    onPreferenceChanged: rejestrator('pref'),
    onPasskeyChanged: rejestrator('passkey'),
    onCredentialChanged: rejestrator('credential'),
    onPatientNoteChanged: rejestrator('patientNote'),
    onPatientListChanged: rejestrator('patientList'),
    getSyncMaterial: () => Promise.resolve({ slotId: SLOT, authToken: 'TOKEN' }),
  };
  const sync = {
    syncPush: vi.fn(() => Promise.resolve()),
    syncPull: syncPull || vi.fn(() => Promise.resolve({ action: 'up-to-date' })),
    syncFull: syncFull || vi.fn(() => Promise.resolve({})),
    probeNewDevice: sonda || vi.fn(() => Promise.resolve({ isNewDevice: false, lastModified: null })),
    onSyncStart: rejestrator('syncStart'),
    onSyncComplete: rejestrator('syncComplete'),
    onSyncError: rejestrator('syncError'),
  };
  const win = {
    localStorage: localStorage || magazyn(),
    sessionStorage: sessionStorage || magazyn(),
    navigator: {},
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    setInterval: (...a) => setInterval(...a),
    clearInterval: (...a) => clearInterval(...a),
    addEventListener() {},
    removeEventListener() {},
    document: {
      hidden: false,
      documentElement: { classList: { contains: () => false } },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    },
    VildaVault: vault,
    VildaSync: sync,
  };
  if (modul) win.VildaNoweUrzadzenie = modul;
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync_integration.js', win);
  const odblokuj = () => { odblokowany = true; handlery.unlock({ userId: 'u-fikcyjny', trigger: 'restore' }); };
  return { win, sync, odblokuj, api: win.VildaSyncIntegration };
}

describe('vilda_sync_integration.js: start po odblokowaniu oddany modułowi pierwszego pobrania', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('moduł przejmuje start (czeka pierwsze pobranie): integracja nie sonduje i nie pobiera', async () => {
    const modul = { przejmujeStart: vi.fn(() => true) };
    const s = zaladujIntegracje({ localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), modul });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(modul.przejmujeStart).toHaveBeenCalledTimes(1);
    expect(s.sync.probeNewDevice).not.toHaveBeenCalled();
    expect(s.sync.syncFull).not.toHaveBeenCalled();
    expect(s.api.isStartupSyncInProgress(), 'krok startu zamknięty').toBe(false);
  });

  it.each([
    ['moduł nie przejmuje', { przejmujeStart: () => false }],
    ['moduł rzuca wyjątek', { przejmujeStart: () => { throw new Error('fikcyjny błąd'); } }],
    ['brak modułu', undefined],
  ])('%s: start jak dotąd (sonda, potem syncFull przy włączonej synchronizacji)', async (_, modul) => {
    const sonda = vi.fn(() => Promise.resolve({ isNewDevice: false, lastModified: null }));
    const s = zaladujIntegracje({ localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), sonda, modul });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    expect(sonda).toHaveBeenCalledTimes(1);
    expect(s.sync.syncFull).toHaveBeenCalledTimes(1);
  });
});

describe('vilda_sync_integration.js: pullForNewDevice — bez równoległego pobrania w tle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('czeka na pobranie integracji już w toku, potem pobiera; w trakcie interwał tła nie rusza kolejnego', async () => {
    const tlo = odroczona();
    const nasze = odroczona();
    const syncPull = vi.fn()
      .mockImplementationOnce(() => tlo.promise)
      .mockImplementationOnce(() => nasze.promise)
      .mockImplementation(() => Promise.resolve({ action: 'up-to-date' }));
    const s = zaladujIntegracje({ localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), syncPull });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncPull, 'interwał tła (10 s) pobiera').toHaveBeenCalledTimes(1);

    let wynik = null;
    const pierwsze = s.api.pullForNewDevice().then((w) => { wynik = w; });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(syncPull, 'czeka, aż skończy się pobranie w tle').toHaveBeenCalledTimes(1);

    tlo.resolve({ action: 'merged' });
    await vi.advanceTimersByTimeAsync(300);
    expect(syncPull, 'po nim — własne pobranie').toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(25_000);
    expect(syncPull, 'w trakcie własnego pobrania interwał tła nie rusza kolejnego').toHaveBeenCalledTimes(2);

    nasze.resolve({ action: 'merged', etag: 'E1' });
    await pierwsze;
    expect(wynik).toEqual({ action: 'merged', etag: 'E1' });
  });

  it('błąd pobrania wraca do wołającego, a flaga integracji jest zdjęta (tło znów pobiera)', async () => {
    const blad = Object.assign(new Error('fikcyjny błąd'), { code: 'TIMEOUT' });
    const syncPull = vi.fn()
      .mockImplementationOnce(() => Promise.reject(blad))
      .mockImplementation(() => Promise.resolve({ action: 'up-to-date' }));
    const s = zaladujIntegracje({ localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }), syncPull });
    s.odblokuj();
    await vi.advanceTimersByTimeAsync(700);
    await expect(s.api.pullForNewDevice()).rejects.toBe(blad);
    // Interwał tła co 10 s, najwcześniej 12 s po ostatnim pobraniu — pierwsze takie tyknięcie to 20 s.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(syncPull.mock.calls.length, 'interwał tła znów pobiera').toBeGreaterThanOrEqual(2);
  });
});
