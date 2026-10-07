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
  const srv = { etag: 'E1', licznik: 1, blob: start || null, puty: [], rejestracje: [], putWisi: false, kasowania: 0 };
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
