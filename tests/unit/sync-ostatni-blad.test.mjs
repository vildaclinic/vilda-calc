import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SYNC-SLAD (diagnostyka, zgłoszenie właściciela 2026-10-07): druga wizyta pacjenta wprowadzona na iPhonie
// nie dotarła na komputery, a żadne obejście („Synchronizuj teraz”, „Pobierz z serwera”, ponowny zapis) nie pomogło.
// Właściciel nie ma jak tego zobaczyć: komunikat błędu w Ustawieniach znika po ~300 ms (q() nadpisuje notę),
// ikona tylko zmienia kolor, a dziennik dostępu nie zapisuje nic o synchronizacji — udana i nieudana wysyłka
// wyglądają identycznie.
//
// Ta zmiana jest WYŁĄCZNIE diagnostyczna: vilda_sync_integration.js zostawia trwały ślad w localStorage
// (ostatni błąd, ostatnia udana wysyłka z tego urządzenia) i wpis w dzienniku dostępu; Ustawienia pokazują
// go pod notą stanu. Logika synchronizacji, scalania i zapisu — bez zmian.
//
// Prawdziwe vilda_sync.js i vilda_sync_integration.js; serwer synchronizacji i sejf to atrapy (serwera nie ma
// w repozytorium). Dane wyłącznie FIKCYJNE. Każdy przypadek zmierzony czerwony na kodzie sprzed zmiany.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SLOT = 'b'.repeat(64);
const KLUCZ_STANU = `vilda-sync-state-v1:${SLOT}`;
const KLUCZ_BLEDU = 'vilda-sync-last-error-v1';
const KLUCZ_OK = 'vilda-sync-last-push-ok-v1';
const TERAZ = '2026-10-07T06:35:00.000Z';

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

/* Atrapa serwera: slot zarejestrowany, blob z ETagiem E1; odpowiedź na PUT /blob można podstawić (413, 401). */
function atrapaSerwera() {
  const srv = { etag: 'E1', licznik: 1, blob: new ArrayBuffer(8), puty: 0, odpowiedzPut: null };
  const odp = (status, cialo, naglowki = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => cialo,
    arrayBuffer: async () => cialo,
    headers: { get: (k) => naglowki[String(k).toLowerCase()] || null },
  });
  srv.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const m = u.pathname.match(/^\/v1\/slots\/[^/]+\/?(.*)$/);
    const sciezka = m ? m[1] : '';
    const metoda = init.method || 'GET';
    const nagl = init.headers || {};
    if (sciezka === 'register' && metoda === 'POST') return odp(409, {});
    if (sciezka === 'status') return odp(200, { etag: srv.etag, size: srv.blob.byteLength });
    if (sciezka === 'blob' && metoda === 'GET') {
      if (nagl['If-None-Match'] === `"${srv.etag}"`) return odp(304, {});
      return odp(200, srv.blob, { etag: `"${srv.etag}"` });
    }
    if (sciezka === 'blob' && metoda === 'PUT') {
      srv.puty += 1;
      if (srv.odpowiedzPut) return odp(srv.odpowiedzPut.status, srv.odpowiedzPut.cialo || {});
      srv.blob = init.body; srv.licznik += 1; srv.etag = `E${srv.licznik}`;
      return odp(200, { etag: srv.etag });
    }
    if (sciezka === 'changes') return odp(200, { deltas: [], headSeq: 0 });
    return odp(404, {});
  };
  return srv;
}

/* Urządzenie: prawdziwy vilda_sync.js + prawdziwy vilda_sync_integration.js w jednym oknie, atrapa sejfu
   (odblokowany, jeden fikcyjny pacjent, ETag E1 znany, pobranie w tej sesji już było). */
async function urzadzenie() {
  const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const sejf = {
    isUnlocked: () => true,
    isCloudOnlyMode: () => false,
    isEphemeralMode: () => false,
    onUnlock() {},
    onLock() {},
    getSyncMaterial: async () => ({ slotId: SLOT, authToken: 'TOKEN', authTokenHash: 'HASH', syncEncKey: klucz }),
    exportSyncPayload: async () => ({ patients: [{ patientId: 'FIKCYJNY-1' }] }),
    listPatients: async () => [{ patientId: 'FIKCYJNY-1' }],
    mergeSyncPayload: async () => ({}),
  };
  const dziennik = vi.fn();
  const win = {
    localStorage: magazyn({
      'vilda-sync-enabled-v1': 'true',
      [KLUCZ_STANU]: JSON.stringify({ registered: true, localEtag: 'E1', lastSyncAt: null }),
    }),
    sessionStorage: magazyn({ 'vilda-sync-pulled-v1': '1' }),
    navigator: {},
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    setInterval: (...a) => setInterval(...a),
    clearInterval: (...a) => clearInterval(...a),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, hidden: false },
    VildaVault: sejf,
    VildaAuditLog: { log: dziennik },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync.js', win);
  loadBrowserScript('vilda_sync_integration.js', win);
  if (!win.VildaSyncIntegration || !win.VildaSyncIntegration.__vildaSyncIntegration) throw new Error('integracja nie wstała');
  const blad = () => JSON.parse(win.localStorage.getItem(KLUCZ_BLEDU) || 'null');
  const ok = () => win.localStorage.getItem(KLUCZ_OK);
  return { sync: win.VildaSync, win, dziennik, blad, ok };
}

const PUT_413 = { status: 413, cialo: { error: { message: 'Payload Too Large' } } };

// Delty idą w tle po pobraniu: atrapę serwera zdejmujemy dopiero na końcu pliku, żeby spóźnione żądanie
// nie wyszło do prawdziwej sieci. Zegar wirtualny: stały czas w kluczach i żadnych opóźnionych sond integracji.
afterAll(async () => { await new Promise((r) => { setTimeout(r, 50); }); vi.unstubAllGlobals(); });

describe('Trwały ślad błędu i udanej wysyłki (vilda_sync_integration.js)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(TERAZ)); });
  afterEach(() => { vi.useRealTimers(); });

  it('PUT odrzucony (413): klucz last-error z UPLOAD_FAILED i 413; udana wysyłka potem: last-push-ok, błąd zostaje z resolvedAt', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    srv.odpowiedzPut = PUT_413;
    vi.stubGlobal('fetch', srv.fetch);

    await expect(d.sync.syncPush()).rejects.toMatchObject({ code: 'UPLOAD_FAILED', httpStatus: 413 });
    expect(d.blad()).toMatchObject({ ts: TERAZ, operation: 'push', code: 'UPLOAD_FAILED', httpStatus: 413 });
    expect(d.blad().message, 'treść skrócona, bez danych pacjenta').toContain('upload nieudany (413)');
    expect(d.blad().message.length).toBeLessThanOrEqual(300);
    expect(d.blad().resolvedAt, 'błąd świeży — nierozwiązany').toBeUndefined();
    expect(d.ok(), 'nic jeszcze nie wyszło').toBeNull();

    const POTEM = '2026-10-07T06:40:00.000Z';
    vi.setSystemTime(new Date(POTEM));
    srv.odpowiedzPut = null;
    expect((await d.sync.syncPush()).action).toBe('uploaded');
    expect(d.ok()).toBe(POTEM);
    expect(d.blad(), 'błąd nie jest kasowany — ma zostać do wglądu').toMatchObject({ code: 'UPLOAD_FAILED', httpStatus: 413, resolvedAt: POTEM });
  });

  it('AUTH_FAILED (401 przy PUT): kod w kluczu bez httpStatus; dziennik dostępu dostaje sync.error bez treści pacjenta', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    srv.odpowiedzPut = { status: 401 };
    vi.stubGlobal('fetch', srv.fetch);

    await expect(d.sync.syncPush()).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    expect(d.blad()).toMatchObject({ operation: 'push', code: 'AUTH_FAILED', httpStatus: null });
    expect(d.dziennik).toHaveBeenCalledWith('sync.error', { code: 'AUTH_FAILED', httpStatus: null, operation: 'push' });
    expect(d.dziennik).toHaveBeenCalledTimes(1);
  });

  it('syncFull: błąd w środku zgłoszony raz jako push (nie „full”); udana pełna synchronizacja — jeden wpis sync.push.ok', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    srv.odpowiedzPut = PUT_413;
    vi.stubGlobal('fetch', srv.fetch);

    await expect(d.sync.syncFull()).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
    expect(d.blad().operation, 'operacja wewnętrzna, nie opakowanie').toBe('push');
    expect(d.dziennik.mock.calls.filter((c) => c[0] === 'sync.error')).toHaveLength(1);

    srv.odpowiedzPut = null;
    const wynik = await d.sync.syncFull();
    expect(wynik.push.action).toBe('uploaded');
    expect(d.ok()).toBe(TERAZ);
    expect(d.blad().resolvedAt).toBe(TERAZ);
    expect(d.dziennik.mock.calls.filter((c) => c[0] === 'sync.push.ok')).toEqual([['sync.push.ok', { action: 'uploaded', bytes: null }]]);
  });

  it('kontrola: udane pobranie (pull) nie oznacza błędu wysyłki jako rozwiązanego ani nie udaje wysyłki', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    srv.odpowiedzPut = PUT_413;
    vi.stubGlobal('fetch', srv.fetch);

    await expect(d.sync.syncPush()).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
    expect((await d.sync.syncPull()).action).toBe('up-to-date');
    expect(d.ok(), 'pobranie to nie wysyłka').toBeNull();
    expect(d.blad().resolvedAt).toBeUndefined();
    expect(d.dziennik.mock.calls.filter((c) => c[0] === 'sync.push.ok')).toHaveLength(0);
  });

  it('kontrola: wysyłka bez błędu — brak klucza last-error, jest last-push-ok i wpis sync.push.ok', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);

    expect((await d.sync.syncPush()).action).toBe('uploaded');
    expect(d.win.localStorage.getItem(KLUCZ_BLEDU)).toBeNull();
    expect(d.ok()).toBe(TERAZ);
    expect(d.dziennik).toHaveBeenCalledWith('sync.push.ok', { action: 'uploaded', bytes: null });
    expect(d.dziennik).toHaveBeenCalledTimes(1);
  });
});

/* Ustawienia: linie pod notą stanu. Qy0 jest czysta (bez DOM) — wycinamy ją RAZEM z Qy2 z pliku produkcyjnego
   (konwencja z format-sds-zero.test.mjs), a format czasu względnego at() z tego samego pliku. */
function wytnij(plik, od, doTekstu) {
  const src = readFileSync(path.join(repoRoot, plik), 'utf8');
  const start = src.indexOf(od);
  expect(start, `${plik}: nie znaleziono ${od}`).toBeGreaterThan(-1);
  const end = src.indexOf(doTekstu, start + od.length);
  expect(end, `${plik}: nie znaleziono końca po ${od}`).toBeGreaterThan(start);
  const nazwa = /function\s+([A-Za-z0-9_$]+)/.exec(od)[1];
  return new Function(`${src.slice(start, end)}\nreturn ${nazwa};`)();
}

describe('Ustawienia: linia ostatniej wysyłki i ostatniego błędu (inline_ustawienia_04.js)', () => {
  const linie = () => wytnij('inline_ustawienia_04.js', 'function Qy0(a,s,c){', 'function Qy1(){');
  const at = () => wytnij('inline_ustawienia_04.js', 'function at(a){', 'function pt(){');
  const przed = (ms) => new Date(Date.now() - ms).toISOString();

  it('bez kluczy: „brak zapisu” i brak linii błędu', () => {
    const w = linie()(null, null, at());
    expect(w.push).toBe('Ostatnia udana wysyłka z tego urządzenia: brak zapisu');
    expect(w.error).toBeNull();
  });

  it('udana wysyłka 2 min temu, błąd 413 sprzed 5 min z resolvedAt: obie linie, czas względny z at()', () => {
    const blad = JSON.stringify({
      ts: przed(5 * 60000), operation: 'push', code: 'UPLOAD_FAILED', httpStatus: 413,
      message: 'VildaSync: upload nieudany (413): Payload Too Large', resolvedAt: przed(2 * 60000),
    });
    const w = linie()(przed(2 * 60000), blad, at());
    expect(w.push).toMatch(/^Ostatnia udana wysyłka z tego urządzenia: 2 min temu \(/);
    expect(w.error).toMatch(/^Ostatni błąd synchronizacji: 5 min temu \(.*\) — UPLOAD_FAILED 413 \(push\) — VildaSync: upload nieudany \(413\): Payload Too Large \(potem udana wysyłka\)$/);
  });

  it('błąd nierozwiązany bez httpStatus (AUTH_FAILED): bez dopisku o udanej wysyłce', () => {
    const w = linie()(null, JSON.stringify({ ts: przed(60000), operation: 'push', code: 'AUTH_FAILED', httpStatus: null, message: 'x' }), at());
    expect(w.error).toBe(`Ostatni błąd synchronizacji: 1 min temu${w.error.match(/ \(.*?\)/)[0]} — AUTH_FAILED (push) — x`);
    expect(w.error).not.toContain('potem udana');
  });

  it('kontrola: uszkodzony klucz błędu nie wywala linii', () => {
    const w = linie()(przed(1000), '{nie-json', at());
    expect(w.push).toMatch(/przed chwilą/);
    expect(w.error).toBeNull();
  });

  it('dziennik dostępu ma etykiety nowych zdarzeń', () => {
    const src = readFileSync(path.join(repoRoot, 'inline_ustawienia_04.js'), 'utf8');
    expect(src).toContain('"sync.error":"B\\u0142\\u0105d synchronizacji"');
    expect(src).toContain('"sync.push.ok":"Udana wysy\\u0142ka do chmury"');
    expect(src, 'q() odświeża linie, nie nadpisuje noty').toContain('if(e(I,x),Qy1(),');
  });
});
