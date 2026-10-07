import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SYNC-MOST (decyzja właściciela 2026-10-07, most przed synchronizacją przyrostową).
// Pełna wysyłka sejfu właściciela (~21–24 MB JSON) nie mieściła się w 30 s na iPhonie (TIMEOUT)
// i nie przechodziła przez serwer z komputera („Failed to fetch”). Most w vilda_sync.js:
//  (1) bajty JSON ładunku od progu (4 MiB) są kompresowane gzipem PRZED szyfrowaniem;
//  (2) czytelnik po odszyfrowaniu rozpoznaje gzip po bajtach 1F 8B, a JSON (7B) czyta jak dotąd;
//  (3) żądanie z ciałem bloba ma limit czasu 30 s + 1 s na każde 100 kB, najwyżej 180 s.
// Format na drucie bez zmian: IV(12) || AES-GCM(syncEncKey).
//
// Testy wołają PRAWDZIWY vilda_sync.js (szyfrowanie, kompresja, odczyt, limit czasu); serwer
// synchronizacji i sejf to atrapy. Dane wyłącznie FIKCYJNE.

const SLOT = 'c'.repeat(64);
const SLOT_NOWY = 'd'.repeat(64);
const KLUCZ_STANU = (slot) => `vilda-sync-state-v1:${slot}`;
const PROG = 4 * 1024 * 1024;

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

/* Fikcyjny ładunek o zadanej długości JSON: pacjenci z powtarzalnym wywiadem (kompresuje się jak prawdziwy). */
function ladunek(docelowoBajtow, znacznik = 'A') {
  const pacjenci = [];
  let rozmiar = 0;
  for (let i = 0; rozmiar < docelowoBajtow; i += 1) {
    const p = {
      patientId: `FIKCYJNY-${znacznik}-${i}`,
      header: { name: `Test ${znacznik}${i}`, birthDate: '2015-01-01' },
      snapshots: [{ snapshotId: `S-${znacznik}-${i}`, savedAtISO: '2026-10-07T06:07:12.345Z', payload: {
        weight: 20 + (i % 30), height: 110 + (i % 40), advanced: { data: 'wynik-'.repeat(400) + i } } }],
    };
    rozmiar += JSON.stringify(p).length + 1;
    pacjenci.push(p);
  }
  return { schemaVersion: 2, patients: pacjenci, tombstones: [], exportedAtISO: '2026-10-07T06:35:00.000Z' };
}

/* Atrapa serwera: przechowuje ostatnie ciało PUT jako blob; GET oddaje blob z ETagiem. */
function atrapaSerwera(start) {
  const srv = { etag: 'E1', licznik: 1, blob: start || null, puty: [], rejestracje: [], putWisi: false, getWisi: false, gety: 0, kasowania: 0 };
  const odp = (status, cialo, naglowki = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => cialo,
    arrayBuffer: async () => cialo,
    headers: { get: (k) => naglowki[String(k).toLowerCase()] || null },
  });
  srv.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const m = u.pathname.match(/^\/v1\/slots\/([^/]+)\/?(.*)$/);
    const sciezka = m ? m[2] : '';
    const metoda = init.method || 'GET';
    const nagl = init.headers || {};
    if (sciezka === 'register' && metoda === 'POST') {
      srv.rejestracje.push({ slot: m[1], body: init.body });
      return odp(201, { etag: 'R1' });
    }
    if (sciezka === '' && metoda === 'DELETE') { srv.kasowania += 1; return odp(204, {}); }
    if (sciezka === 'status') return odp(200, { etag: srv.etag, size: srv.blob ? srv.blob.byteLength : 0 });
    if (sciezka === 'blob' && metoda === 'GET') {
      if (!srv.blob) return odp(404, {});
      if (nagl['If-None-Match'] === `"${srv.etag}"`) return odp(304, {});
      srv.gety += 1;
      if (srv.getWisi) {
        return new Promise((_, odrzuc) => {
          init.signal.addEventListener('abort', () => {
            const e = new Error('The operation was aborted.');
            e.name = 'AbortError';
            odrzuc(e);
          });
        });
      }
      return odp(200, srv.blob, { etag: `"${srv.etag}"` });
    }
    if (sciezka === 'blob' && metoda === 'PUT') {
      srv.puty.push({ body: init.body });
      if (srv.putWisi) {
        return new Promise((_, odrzuc) => {
          init.signal.addEventListener('abort', () => {
            const e = new Error('The operation was aborted.');
            e.name = 'AbortError';
            odrzuc(e);
          });
        });
      }
      srv.blob = init.body; srv.licznik += 1; srv.etag = `E${srv.licznik}`;
      return odp(200, { etag: srv.etag });
    }
    if (sciezka === 'changes') return odp(200, { deltas: [], headSeq: 0 });
    return odp(404, {});
  };
  return srv;
}

/* Urządzenie z prawdziwym vilda_sync.js; sejf to atrapa z podanym ładunkiem i wspólnym kluczem sync. */
function urzadzenie({ klucz, eksport, etag = 'E1', okno = {} }) {
  const scalone = [];
  const sejf = {
    isUnlocked: () => true,
    getCurrentUser: () => ({ userId: 'u-fikcyjny' }),
    isCloudOnlyMode: () => false,
    isEphemeralMode: () => false,
    onUnlock() {},
    onLock() {},
    slot: SLOT,
    getSyncMaterial: async () => ({ slotId: sejf.slot, authToken: 'TOKEN', authTokenHash: 'HASH', syncEncKey: klucz }),
    exportSyncPayload: async () => eksport(),
    listPatients: async () => (eksport().patients || []),
    mergeSyncPayload: async (p) => { scalone.push(p); return {}; },
    rotateSyncIdentity: async () => { sejf.slot = SLOT_NOWY; return { recoveryKey: 'FIKCYJNY-KLUCZ' }; },
  };
  const win = Object.assign({
    localStorage: magazyn({
      'vilda-sync-enabled-v1': 'true',
      [KLUCZ_STANU(SLOT)]: JSON.stringify({ registered: true, localEtag: etag, lastSyncAt: null }),
    }),
    sessionStorage: magazyn({ 'vilda-sync-pulled-v1': '1' }),
    navigator: {},
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, hidden: false },
    VildaVault: sejf,
  }, okno);
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync.js', win);
  return { sync: win.VildaSync, win, sejf, scalone };
}

async function kluczSync() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/* Odszyfrowuje blob z atrapy tym samym kluczem: IV(12) || AES-GCM. */
async function odszyfruj(blob, klucz) {
  const b = new Uint8Array(blob);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, klucz, b.slice(12)));
}
async function zaszyfruj(bajty, klucz) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, bajty));
  const out = new Uint8Array(12 + ct.length); out.set(iv, 0); out.set(ct, 12);
  return out.buffer;
}
async function gzip(bajty) {
  return new Uint8Array(await new Response(new Blob([bajty]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
async function gunzip(bajty) {
  return new Uint8Array(await new Response(new Blob([bajty]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
const json = (bajty) => JSON.parse(new TextDecoder().decode(bajty));
/* Czeka na PUT bez ruszania sztucznego zegara (vi.waitFor przy sztucznych timerach sam przesuwa czas). */
async function czekajNaPut(srv) {
  const koniec = performance.now() + 20000;
  while (srv.puty.length === 0 && performance.now() < koniec) await new Promise((r) => { setImmediate(r); });
  expect(srv.puty).toHaveLength(1);
}

afterAll(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('P-SYNC-MOST: gzip przed szyfrowaniem pełnej wysyłki', () => {
  it('ładunek od progu 4 MiB: PUT niesie gzip(JSON) pod AES-GCM, kilkukrotnie mniejszy; po rozpakowaniu ten sam JSON', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(PROG + 200 * 1024);
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });

    const wynik = await a.sync.syncPush();
    expect(wynik.action).toBe('uploaded');
    expect(srv.puty).toHaveLength(1);
    expect(wynik.bytes, 'rozmiar wysłanego bloba trafia do wyniku (dziennik sync.push.ok)').toBe(srv.puty[0].body.byteLength);
    const jawne = await odszyfruj(srv.puty[0].body, klucz);
    expect([jawne[0], jawne[1], jawne[2]], 'magic gzip 1F 8B 08').toEqual([0x1f, 0x8b, 0x08]);
    const surowe = new TextEncoder().encode(JSON.stringify(dane));
    expect(surowe.length).toBeGreaterThanOrEqual(PROG);
    expect(jawne.length * 4, 'ładunek mniejszy co najmniej 4×').toBeLessThan(surowe.length);
    expect(json(await gunzip(jawne))).toEqual(dane);
  });

  it('ładunek poniżej progu: bez kompresji, jak dotąd (JSON zaczyna się od „{”)', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(300 * 1024);
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });

    await a.sync.syncPush();
    const jawne = await odszyfruj(srv.puty[0].body, klucz);
    expect(jawne[0]).toBe(0x7b);
    expect(json(jawne)).toEqual(dane);
  });

  it('wyłącznik vilda-sync-gzip-v1=0 i brak CompressionStream: wysyłka bez kompresji także powyżej progu', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(PROG + 64 * 1024);

    const srv1 = atrapaSerwera();
    vi.stubGlobal('fetch', srv1.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });
    a.win.localStorage.setItem('vilda-sync-gzip-v1', '0');
    await a.sync.syncPush();
    expect((await odszyfruj(srv1.puty[0].body, klucz))[0], 'wyłącznik').toBe(0x7b);

    const srv2 = atrapaSerwera();
    vi.stubGlobal('fetch', srv2.fetch);
    vi.stubGlobal('CompressionStream', undefined);
    const b = urzadzenie({ klucz, eksport: () => dane });
    await b.sync.syncPush();
    const jawne = await odszyfruj(srv2.puty[0].body, klucz);
    expect(jawne[0], 'brak API').toBe(0x7b);
    expect(json(jawne)).toEqual(dane);
  });

  it('ucięty gzip z przeglądarki (Safari/iOS 16.4–16.5, błąd flush w WebKit): wysyłka jawna zamiast ucinka', async () => {
    // P-SYNC-MOST-STOPKA. Atrapa CompressionStream oddaje prawdziwy gzip bez ostatnich 20 bajtów — tak jak
    // WebKit przed poprawką z Safari 16.6, gdy ostatni blok ze stopką przekracza 16 KiB. Ucinek w chmurze
    // zablokowałby pobieranie na pozostałych urządzeniach (DECOMPRESS_FAILED), więc zapis go nie przyjmuje.
    const PrawdziwyCS = globalThis.CompressionStream;
    class UcietyCS {
      constructor(format) {
        const porcje = [];
        const ts = new TransformStream({
          transform(porcja) { porcje.push(porcja); },
          async flush(ster) {
            const gz = new Uint8Array(await new Response(new Blob(porcje).stream().pipeThrough(new PrawdziwyCS(format))).arrayBuffer());
            ster.enqueue(gz.slice(0, gz.length - 20));
          },
        });
        this.writable = ts.writable;
        this.readable = ts.readable;
      }
    }
    const klucz = await kluczSync();
    const dane = ladunek(PROG + 64 * 1024, 'U');
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    vi.stubGlobal('CompressionStream', UcietyCS);
    const a = urzadzenie({ klucz, eksport: () => dane });

    await a.sync.syncPush();
    const jawne = await odszyfruj(srv.puty[0].body, klucz);
    expect(jawne[0], 'ucinek odrzucony — wysyłka jawna').toBe(0x7b);
    expect(json(jawne)).toEqual(dane);
  });

  it('stopka gzip (ISIZE) zgodna z długością wejścia — kompletny gzip przyjęty', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(PROG + 64 * 1024, 'Z');
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });

    await a.sync.syncPush();
    const jawne = await odszyfruj(srv.puty[0].body, klucz);
    const surowe = new TextEncoder().encode(JSON.stringify(dane));
    const n = jawne.length;
    expect([jawne[0], jawne[1]]).toEqual([0x1f, 0x8b]);
    expect((jawne[n - 4] | jawne[n - 3] << 8 | jawne[n - 2] << 16 | jawne[n - 1] << 24) >>> 0).toBe(surowe.length >>> 0);
  });

  it('rotacja tożsamości (revokeAllDevices): rejestracja nowego slotu niesie gzip, gdy ładunek przekracza próg', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(PROG + 32 * 1024);
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });

    const wynik = await a.sync.revokeAllDevices('FIKCYJNE-HASLO');
    expect(wynik.newSlotId).toBe(SLOT_NOWY);
    expect(srv.rejestracje).toHaveLength(1);
    const jawne = await odszyfruj(srv.rejestracje[0].body, klucz);
    expect([jawne[0], jawne[1]]).toEqual([0x1f, 0x8b]);
    expect(json(await gunzip(jawne))).toEqual(dane);
  });
});

describe('P-SYNC-MOST: czytelnik po odszyfrowaniu', () => {
  it('urządzenie A wysyła gzip, urządzenie B pobiera i scala ten sam ładunek', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(PROG + 128 * 1024, 'B');
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });
    await a.sync.syncPush();
    const wChmurze = await odszyfruj(srv.blob, klucz);
    expect([wChmurze[0], wChmurze[1]], 'A wysłał gzip').toEqual([0x1f, 0x8b]);

    const b = urzadzenie({ klucz, eksport: () => ({ patients: [] }), etag: 'E0' });
    const wynik = await b.sync.syncPull();
    expect(wynik.action).toBe('merged');
    expect(b.scalone).toHaveLength(1);
    expect(b.scalone[0]).toEqual(dane);
  });

  it('stary format (JSON bez kompresji) czytany jak dotąd', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(100 * 1024, 'S');
    const srv = atrapaSerwera(await zaszyfruj(new TextEncoder().encode(JSON.stringify(dane)), klucz));
    vi.stubGlobal('fetch', srv.fetch);
    const b = urzadzenie({ klucz, eksport: () => ({ patients: [] }), etag: 'E0' });
    const wynik = await b.sync.syncPull();
    expect(wynik.action).toBe('merged');
    expect(b.scalone[0]).toEqual(dane);
  });

  it('gzip bez DecompressionStream: błąd GZIP_UNSUPPORTED, nic nie scalone, ETag nie przesunięty', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(50 * 1024, 'G');
    const srv = atrapaSerwera(await zaszyfruj(await gzip(new TextEncoder().encode(JSON.stringify(dane))), klucz));
    vi.stubGlobal('fetch', srv.fetch);
    vi.stubGlobal('DecompressionStream', undefined);
    const b = urzadzenie({ klucz, eksport: () => ({ patients: [] }), etag: 'E0' });

    await expect(b.sync.syncPull()).rejects.toMatchObject({ code: 'GZIP_UNSUPPORTED' });
    expect(b.scalone).toHaveLength(0);
    expect(JSON.parse(b.win.localStorage.getItem(KLUCZ_STANU(SLOT))).localEtag).toBe('E0');
  });

  it('uszkodzony gzip pod poprawnym szyfrowaniem: DECOMPRESS_FAILED, nic nie scalone', async () => {
    const klucz = await kluczSync();
    const smieci = new Uint8Array([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0x03, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const srv = atrapaSerwera(await zaszyfruj(smieci, klucz));
    vi.stubGlobal('fetch', srv.fetch);
    const b = urzadzenie({ klucz, eksport: () => ({ patients: [] }), etag: 'E0' });

    await expect(b.sync.syncPull()).rejects.toMatchObject({ code: 'DECOMPRESS_FAILED' });
    expect(b.scalone).toHaveLength(0);
  });
});

describe('P-SYNC-MOST: limit czasu żądania z ciałem bloba zależny od rozmiaru', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });

  it('PUT ~1,5 MB: nie przerywa po 30 s; przerywa po 30 s + 1 s/100 kB z rozmiarem w komunikacie', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(1500 * 1024, 'T');
    const srv = atrapaSerwera();
    srv.putWisi = true;
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });

    let blad = null;
    const obietnica = a.sync.syncPush().catch((e) => { blad = e; });
    await czekajNaPut(srv);
    const bajty = srv.puty[0].body.byteLength;
    const oczekiwany = Math.min(180000, 30000 + Math.ceil(bajty / 100));
    expect(oczekiwany).toBeGreaterThan(40000);

    await vi.advanceTimersByTimeAsync(30001);
    expect(blad, 'stary limit 30 s już nie przerywa').toBeNull();
    await vi.advanceTimersByTimeAsync(oczekiwany - 30001 - 5);
    expect(blad).toBeNull();
    await vi.advanceTimersByTimeAsync(10);
    await obietnica;
    expect(blad).toMatchObject({ code: 'TIMEOUT', bytes: bajty });
    expect(blad.message).toContain(`(${oczekiwany} ms, ${(bajty / 1048576).toFixed(1)} MB)`);
  });

  it('małe ciało: rozmiar w komunikacie TIMEOUT w kB, nie „0.0 MB”', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(20 * 1024, 'K');
    const srv = atrapaSerwera();
    srv.putWisi = true;
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });
    let blad = null;
    const obietnica = a.sync.syncPush().catch((e) => { blad = e; });
    await czekajNaPut(srv);
    const bajty = srv.puty[0].body.byteLength;
    await vi.advanceTimersByTimeAsync(30000 + Math.ceil(bajty / 100) + 10);
    await obietnica;
    expect(blad).toMatchObject({ code: 'TIMEOUT', bytes: bajty });
    expect(blad.message).toContain(`, ${Math.ceil(bajty / 1024)} kB).`);
    expect(blad.message).not.toContain('0.0 MB');
  });

  it('sufit 180 s dla bardzo dużego ciała (bez kompresji)', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(15.5 * 1024 * 1024, 'X');
    const srv = atrapaSerwera();
    srv.putWisi = true;
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });
    a.win.localStorage.setItem('vilda-sync-gzip-v1', '0');

    let blad = null;
    const obietnica = a.sync.syncPush().catch((e) => { blad = e; });
    await czekajNaPut(srv);
    expect(30000 + Math.ceil(srv.puty[0].body.byteLength / 100)).toBeGreaterThan(180000);
    await vi.advanceTimersByTimeAsync(179990);
    expect(blad).toBeNull();
    await vi.advanceTimersByTimeAsync(20);
    await obietnica;
    expect(blad).toMatchObject({ code: 'TIMEOUT' });
    expect(blad.message).toContain('(180000 ms, ');
  });

  it('GET /blob: limit od rozmiaru z /status (zapas; licznik i tak kończy się na nagłówkach odpowiedzi)', async () => {
    const klucz = await kluczSync();
    const srv = atrapaSerwera(new Uint8Array(1500 * 1024).buffer);
    srv.getWisi = true;
    vi.stubGlobal('fetch', srv.fetch);
    const b = urzadzenie({ klucz, eksport: () => ({ patients: [] }), etag: 'E0' });
    const oczekiwany = 30000 + Math.ceil((1500 * 1024) / 100);

    let blad = null;
    const obietnica = b.sync.syncPull().catch((e) => { blad = e; });
    const koniec = performance.now() + 20000;
    while (srv.gety === 0 && performance.now() < koniec) await new Promise((r) => { setImmediate(r); });
    expect(srv.gety).toBe(1);
    await vi.advanceTimersByTimeAsync(oczekiwany - 10);
    expect(blad, 'po 30 s pobranie nadal trwa').toBeNull();
    await vi.advanceTimersByTimeAsync(20);
    await obietnica;
    expect(blad).toMatchObject({ code: 'TIMEOUT' });
    expect(blad.message).toContain(`(${oczekiwany} ms).`);
  });

  it('żądania bez ciała (GET /status) zostają przy 30 s i komunikacie bez rozmiaru', async () => {
    const klucz = await kluczSync();
    const a = urzadzenie({ klucz, eksport: () => ({ patients: [] }), etag: 'E0' });
    vi.stubGlobal('fetch', (url, init) => new Promise((_, odrzuc) => {
      init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; odrzuc(e); });
    }));
    let blad = null;
    const obietnica = a.sync.syncPull().catch((e) => { blad = e; });
    await vi.advanceTimersByTimeAsync(29990);
    expect(blad).toBeNull();
    await vi.advanceTimersByTimeAsync(20);
    await obietnica;
    expect(blad).toMatchObject({ code: 'TIMEOUT' });
    expect(blad.message).toContain('(30000 ms).');
    expect(blad.bytes).toBeUndefined();
  });
});

// Przegląd adwersarza po #573: bez tych przypadków usunięcie gzipa z ponowienia po 412 albo z gałęzi bez ETagu,
// albo limitu czasu z rejestracji, nie dawało żadnego czerwonego testu (mutacje zmierzone).
describe('P-SYNC-MOST: pokrycie wszystkich ścieżek pełnej wysyłki', () => {
  it('ponowienie po 412: drugi PUT też niesie gzip', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(PROG + 64 * 1024, 'P');
    const srv = atrapaSerwera(await zaszyfruj(new TextEncoder().encode(JSON.stringify({ patients: [] })), klucz));
    const bazowy = srv.fetch;
    let pierwszy = true;
    srv.fetch = async (url, init = {}) => {
      if (/\/blob$/.test(new URL(url).pathname) && init.method === 'PUT' && pierwszy) {
        pierwszy = false; srv.puty.push({ body: init.body, s412: true });
        return { status: 412, ok: false, json: async () => ({}), headers: { get: () => null } };
      }
      return bazowy(url, init);
    };
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane });
    const wynik = await a.sync.syncPush();
    expect(wynik.action).toBe('uploaded');
    expect(srv.puty).toHaveLength(2);
    for (const p of srv.puty) {
      const j = await odszyfruj(p.body, klucz);
      expect([j[0], j[1]], p.s412 ? 'PUT przed 412' : 'PUT po 412').toEqual([0x1f, 0x8b]);
    }
  });

  it('gałąź bez ETagu (registered bez localEtag): PUT niesie gzip', async () => {
    const klucz = await kluczSync();
    const dane = ladunek(PROG + 64 * 1024, 'Q');
    const srv = atrapaSerwera(await zaszyfruj(new TextEncoder().encode(JSON.stringify({ patients: [] })), klucz));
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => dane, etag: null });
    const wynik = await a.sync.syncPush();
    expect(wynik.action).toBe('uploaded');
    const j = await odszyfruj(srv.puty[srv.puty.length - 1].body, klucz);
    expect([j[0], j[1]]).toEqual([0x1f, 0x8b]);
  });

  describe('limit czasu rejestracji', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
    it('POST /register w syncPush ~1,5 MB: nie przerywa po 30 s', async () => {
      const klucz = await kluczSync();
      const dane = ladunek(1500 * 1024, 'R');
      const wywolania = [];
      vi.stubGlobal('fetch', (url, init) => new Promise((_, odrzuc) => {
        wywolania.push(url);
        init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; odrzuc(e); });
      }));
      const a = urzadzenie({ klucz, eksport: () => dane });
      a.win.localStorage.setItem(KLUCZ_STANU(SLOT), JSON.stringify({ registered: false, localEtag: null }));
      let blad = null;
      const ob = a.sync.syncPush().catch((e) => { blad = e; });
      const koniec = performance.now() + 5000;
      while (wywolania.length === 0 && performance.now() < koniec) await new Promise((r) => { setImmediate(r); });
      expect(wywolania[0]).toMatch(/\/register$/);
      await vi.advanceTimersByTimeAsync(30010);
      expect(blad, 'rejestracja z ciałem bloba nie powinna padać po 30 s').toBeNull();
      await vi.advanceTimersByTimeAsync(200000);
      await ob;
      expect(blad).toMatchObject({ code: 'TIMEOUT' });
    });
  });
});

// Uwaga Codex P1 do #573 i krytyk kompletności: po kompresji /status.size to rozmiar bloba po gzip, a WIPE_GUARD
// porównywał z nim surowe bajty JSON. Strażnik przepuszczał wtedy „pusty” stan z kilkuset kB notatek, który przed
// kompresją by zatrzymał. Urządzenie pamięta surowy rozmiar bloba (rawSize/rawEtag) z ostatniego scalenia albo
// wysyłki i — przy tym samym ETagu — porównuje surowe z surowym.
describe('P-SYNC-MOST-STOPKA: WIPE_GUARD w jednostkach surowych po kompresji', () => {
  const notatki = (kB) => ({ patients: [], notes: [{ id: 'N-fikcyjna', text: 'notatka '.repeat(Math.ceil((kB * 1024) / 8)) }] });

  it('chmura: gzip dużego sejfu; lokalnie 0 pacjentów i ~200 KB notatek → WIPE_GUARD, brak PUT', async () => {
    const klucz = await kluczSync();
    const pelny = ladunek(PROG + 512 * 1024, 'W');
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => pelny });
    await a.sync.syncPush();
    const gz = srv.blob.byteLength;
    expect(gz * 4, 'blob w chmurze to gzip, kilkukrotnie mniejszy').toBeLessThan(PROG);

    let tryb = 'pelny';
    const b = urzadzenie({ klucz, eksport: () => (tryb === 'pusty' ? notatki(200) : pelny), etag: 'E0' });
    expect((await b.sync.syncPull()).action).toBe('merged');
    tryb = 'pusty';
    const putyPrzed = srv.puty.length;
    const lokalnie = new TextEncoder().encode(JSON.stringify(notatki(200))).length;
    expect(lokalnie, 'bez poprawki: surowe ~200 KB ≥ ¼ gzipa, strażnik by przepuścił').toBeGreaterThanOrEqual(gz / 4);

    await expect(b.sync.syncPush()).rejects.toMatchObject({ code: 'WIPE_GUARD' });
    expect(srv.puty.length, 'chmura nienadpisana').toBe(putyPrzed);
  });

  it('mały sejf bez kompresji, tylko notatki po obu stronach → bez fałszywej blokady', async () => {
    const klucz = await kluczSync();
    const stan = notatki(300);
    const srv = atrapaSerwera(await zaszyfruj(new TextEncoder().encode(JSON.stringify(stan)), klucz));
    vi.stubGlobal('fetch', srv.fetch);
    const b = urzadzenie({ klucz, eksport: () => stan, etag: 'E0' });
    expect((await b.sync.syncPull()).action).toBe('merged');
    expect((await b.sync.syncPush()).action).toBe('uploaded');
  });

  it('własna wysyłka zapamiętuje surowy rozmiar: kolejna próba „pustego” stanu przy tym samym ETagu jest zatrzymana', async () => {
    const klucz = await kluczSync();
    const pelny = ladunek(PROG + 256 * 1024, 'V');
    let tryb = 'pelny';
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => (tryb === 'pusty' ? notatki(200) : pelny) });
    await a.sync.syncPush();
    tryb = 'pusty';
    await expect(a.sync.syncPush()).rejects.toMatchObject({ code: 'WIPE_GUARD' });
    expect(srv.puty).toHaveLength(1);
  });
});

// Przegląd adwersarza (soczewka czas, potwierdzone symulacją): z limitem do 180 s planowane wysyłki integracji
// nakładały się na trwającą i dzieliły łącze, aż wszystkie kończyły się TIMEOUT. Naraz trwa najwyżej jedna pełna
// wysyłka; wywołania w jej trakcie scalają się w jedną kolejną, która eksportuje najświeższy stan.
describe('P-SYNC-MOST-STOPKA: jedna pełna wysyłka naraz', () => {
  async function czekaj(warunek) {
    const koniec = performance.now() + 10000;
    while (!warunek() && performance.now() < koniec) await new Promise((r) => { setImmediate(r); });
    expect(warunek()).toBe(true);
  }
  function serwerZWstrzymaniem(srv, { pierwszyBlad = false } = {}) {
    const bazowy = srv.fetch;
    const stan = { wiszace: [], wLocie: 0, maks: 0, puty: 0 };
    srv.fetch = async (url, init = {}) => {
      if (/\/blob$/.test(new URL(url).pathname) && init.method === 'PUT') {
        stan.puty += 1;
        const nr = stan.puty;
        stan.wLocie += 1; stan.maks = Math.max(stan.maks, stan.wLocie);
        await new Promise((r) => { stan.wiszace.push(r); });
        try {
          if (pierwszyBlad && nr === 1) return { status: 500, ok: false, json: async () => ({}), headers: { get: () => null } };
          return await bazowy(url, init);
        } finally { stan.wLocie -= 1; }
      }
      return bazowy(url, init);
    };
    return stan;
  }

  it('dwa wywołania w trakcie wysyłki → jedna kolejna wysyłka po zakończeniu bieżącej, nigdy dwie naraz', async () => {
    const klucz = await kluczSync();
    let wersja = 1;
    const srv = atrapaSerwera();
    const st = serwerZWstrzymaniem(srv);
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => ({ patients: [{ patientId: 'FIKCYJNY-J', wersja }] }) });

    const p1 = a.sync.syncPush();
    await czekaj(() => st.wiszace.length === 1);
    wersja = 2;
    const p2 = a.sync.syncPush();
    const p3 = a.sync.syncPush();
    for (let i = 0; i < 50; i += 1) await new Promise((r) => { setImmediate(r); });
    expect(st.puty, 'w trakcie wysyłki nie rusza druga').toBe(1);

    st.wiszace.shift()();
    expect((await p1).action).toBe('uploaded');
    await czekaj(() => st.wiszace.length === 1);
    st.wiszace.shift()();
    const [r2, r3] = await Promise.all([p2, p3]);
    expect(r2.action).toBe('uploaded');
    expect(r3).toEqual(r2);
    expect(st.puty, 'dokładnie jedna kolejna wysyłka').toBe(2);
    expect(st.maks, 'nigdy dwie naraz').toBe(1);
    const jawne = await odszyfruj(srv.blob, klucz);
    expect(json(jawne).patients[0].wersja, 'kolejna wysyłka eksportuje najświeższy stan').toBe(2);
  });

  it('kolejna wysyłka rusza także po błędzie bieżącej', async () => {
    const klucz = await kluczSync();
    const srv = atrapaSerwera();
    const st = serwerZWstrzymaniem(srv, { pierwszyBlad: true });
    vi.stubGlobal('fetch', srv.fetch);
    const a = urzadzenie({ klucz, eksport: () => ({ patients: [{ patientId: 'FIKCYJNY-E' }] }) });

    const p1 = a.sync.syncPush();
    await czekaj(() => st.wiszace.length === 1);
    const p2 = a.sync.syncPush();
    st.wiszace.shift()();
    await expect(p1).rejects.toMatchObject({ code: 'UPLOAD_FAILED', httpStatus: 500 });
    await czekaj(() => st.wiszace.length === 1);
    st.wiszace.shift()();
    expect((await p2).action).toBe('uploaded');
    expect(st.maks).toBe(1);
  });
});
