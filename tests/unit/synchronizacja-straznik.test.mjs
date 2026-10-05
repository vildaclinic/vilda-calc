import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SYNC-STRAZNIK (decyzja właściciela 2026-10-05: „zaczynaj od punktu 1, zwykły PR do audyt”) — luki
// synchronizacji po P-SCALANIE-BLOKADA (#518), znalezione w przeglądzie „co dalej” i w uwadze Codex P1 do #518.
//
// Mierzone na kodzie sprzed zmiany (każdy przypadek niżej wtedy nie przechodził):
//   1. Po „Zresetuj stan synchronizacji” pobranie przerwane przez MERGE_BUSY (albo sieć) zostawiało stan slotu
//      bez ETagu. Następna wysyłka brała ETag z /status bez scalenia i PUT nadpisywał chmurę stanem, w którym nic
//      z niej nie scalono. Strażnik STALE_DEVICE_GUARD tego nie łapał: pilnuje pobrania w tej SESJI, nie tego ETagu.
//   2. To samo w gałęzi 409 (slot istnieje, urządzenie nie ma jego stanu): błąd scalania szedł w catch{}.
//   3. Delta, której scalenie skończyło się MERGE_BUSY, była połykana, a kursor i tak szedł na headSeq.
//   4. Wysyłka, która się poddała (5 prób), nie wracała po zwolnieniu blokady, a ikona pokazywała „ok”.
//
// Prawdziwe vilda_sync.js i vilda_sync_integration.js; serwer synchronizacji i sejf to atrapy (serwera nie ma
// w repozytorium). Szyfrowanie bloba prawdziwe (AES-GCM, ten sam format co G()/ut()). Dane wyłącznie FIKCYJNE.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SLOT = 'a'.repeat(64);
const KLUCZ_STANU = `vilda-sync-state-v1:${SLOT}`;
const KLUCZ_KURSORA = `vilda-sync-cursor-v1:${SLOT}`;

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

function bladZajetosci() {
  const e = new Error('Synchronizacja wstrzymana — pacjent jest właśnie zapisywany w innej karcie.');
  e.code = 'MERGE_BUSY';
  e.vildaMergeBusy = true;
  e.vildaSaveBusy = true;
  return e;
}

async function zaszyfruj(obiekt, klucz) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dane = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, new TextEncoder().encode(JSON.stringify(obiekt)));
  const out = new Uint8Array(12 + dane.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(dane), 12);
  return out.buffer;
}

async function odszyfruj(bufor, klucz) {
  const a = new Uint8Array(bufor);
  const jawne = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, klucz, a.slice(12));
  return JSON.parse(new TextDecoder().decode(jawne));
}

/* Atrapa serwera synchronizacji: slot z blobem, ETag, If-Match/If-None-Match, delty z numerami. */
function atrapaSerwera() {
  const srv = { zarejestrowany: false, blob: null, etag: null, licznik: 0, delty: [], headSeq: 0, puty: [] };
  const nowyEtag = () => { srv.licznik += 1; srv.etag = `E${srv.licznik}`; return srv.etag; };
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
    if (sciezka === 'register' && metoda === 'POST') {
      if (srv.zarejestrowany) return odp(409, {});
      srv.zarejestrowany = true; srv.blob = init.body;
      return odp(201, { etag: nowyEtag() });
    }
    if (!srv.zarejestrowany) return odp(404, {});
    if (sciezka === 'status') return odp(200, { etag: srv.blob ? srv.etag : null, size: srv.blob ? srv.blob.byteLength : 0 });
    if (sciezka === 'blob' && metoda === 'GET') {
      if (!srv.blob) return odp(404, {});
      if (nagl['If-None-Match'] === `"${srv.etag}"`) return odp(304, {});
      return odp(200, srv.blob, { etag: `"${srv.etag}"` });
    }
    if (sciezka === 'blob' && metoda === 'PUT') {
      const im = nagl['If-Match'] || null;
      if (srv.blob && im && im !== `"${srv.etag}"`) return odp(412, {});
      srv.blob = init.body;
      srv.puty.push({ ifMatch: im, blob: init.body });
      return odp(200, { etag: nowyEtag() });
    }
    if (sciezka === 'changes') {
      const od = Number(u.searchParams.get('since')) || 0;
      return odp(200, { deltas: srv.delty.filter((d) => d.seq > od), headSeq: srv.headSeq });
    }
    return odp(404, {});
  };
  return srv;
}

/* Urządzenie: prawdziwy vilda_sync.js, atrapa sejfu (scalanie = suma pacjentów po id; zajętość na żądanie). */
async function urzadzenie({ stan, sesjaPobrala = true, lokalni = ['Lokalny'] } = {}) {
  const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const sejf = {
    lokalni: lokalni.map((id) => ({ patientId: id })),
    zajety: false,
    zajetaDelta: null,
    zlaDelta: null,
    scalenia: 0,
    delty: [],
    isUnlocked: () => true,
    isCloudOnlyMode: () => false,
    getSyncMaterial: async () => ({ slotId: SLOT, authToken: 'TOKEN', authTokenHash: 'HASH', syncEncKey: klucz }),
    exportSyncPayload: async () => ({ patients: sejf.lokalni.map((p) => ({ ...p })) }),
    listPatients: async () => sejf.lokalni,
    mergeSyncPayload: async (p) => {
      if (sejf.zajety) throw bladZajetosci();
      sejf.scalenia += 1;
      (p.patients || []).forEach((x) => {
        if (!sejf.lokalni.some((y) => y.patientId === x.patientId)) sejf.lokalni.push({ ...x });
      });
      return {};
    },
    applyEncryptedDelta: async (payload) => {
      sejf.delty.push(payload.id);
      if (sejf.zajetaDelta === payload.id) throw bladZajetosci();
      if (sejf.zlaDelta === payload.id) throw new Error('uszkodzona delta');
      return { mergedPatientCount: 1 };
    },
  };
  const win = {
    localStorage: magazyn(stan ? { [KLUCZ_STANU]: JSON.stringify(stan) } : {}),
    sessionStorage: magazyn(sesjaPobrala ? { 'vilda-sync-pulled-v1': '1' } : {}),
    document: { dispatchEvent() {} },
    VildaVault: sejf,
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync.js', win);
  const stanSlotu = () => JSON.parse(win.localStorage.getItem(KLUCZ_STANU) || 'null');
  return { sync: win.VildaSync, sejf, klucz, win, stanSlotu };
}

async function serwerZChmura(klucz, pacjenci = ['Zdalny']) {
  const srv = atrapaSerwera();
  srv.zarejestrowany = true;
  srv.blob = await zaszyfruj({ patients: pacjenci.map((id) => ({ patientId: id })) }, klucz);
  srv.etag = 'E1'; srv.licznik = 1;
  return srv;
}

// Delty idą w tle po pobraniu (B nie jest czekane): atrapę serwera zdejmujemy dopiero na końcu pliku,
// żeby spóźnione żądanie nie wyszło do prawdziwej sieci. Każdy test wstawia własną atrapę.
afterAll(async () => { await new Promise((r) => { setTimeout(r, 50); }); vi.unstubAllGlobals(); });

describe('Wysyłka nie nadpisuje chmury bez scalenia', () => {
  it('po resecie stanu pobranie przerwane przez MERGE_BUSY: wysyłka też się przerywa; po zwolnieniu blokady scala i wysyła', async () => {
    const d = await urzadzenie({ stan: null }); // „Zresetuj stan synchronizacji” usunął stan slotu
    const srv = await serwerZChmura(d.klucz);
    vi.stubGlobal('fetch', srv.fetch);
    d.sejf.zajety = true;

    await expect(d.sync.syncPull()).rejects.toMatchObject({ code: 'MERGE_BUSY' });
    expect(d.stanSlotu(), 'slot zapamiętany, ale bez ETagu').toMatchObject({ registered: true, localEtag: null });

    await expect(d.sync.syncPush(), 'wysyłka najpierw pobiera i scala — i tu się przerywa').rejects.toMatchObject({ code: 'MERGE_BUSY' });
    expect(srv.puty, 'chmura nienadpisana').toHaveLength(0);
    expect(srv.etag).toBe('E1');

    d.sejf.zajety = false;
    const wynik = await d.sync.syncPush();
    expect(wynik.action).toBe('uploaded');
    expect(srv.puty).toHaveLength(1);
    expect(srv.puty[0].ifMatch, 'PUT z ETagiem scalonej treści').toBe('"E1"');
    const wChmurze = await odszyfruj(srv.blob, d.klucz);
    expect(wChmurze.patients.map((p) => p.patientId).sort(), 'zdalny pacjent przetrwał').toEqual(['Lokalny', 'Zdalny']);
  });

  it('gałąź 409 (slot istnieje, urządzenie bez stanu): błąd scalania przerywa wysyłkę zamiast iść w catch{}', async () => {
    const d = await urzadzenie({ stan: null });
    const srv = await serwerZChmura(d.klucz);
    vi.stubGlobal('fetch', srv.fetch);
    d.sejf.zajety = true;

    await expect(d.sync.syncPush()).rejects.toMatchObject({ code: 'MERGE_BUSY' });
    expect(srv.puty, 'chmura nienadpisana').toHaveLength(0);

    d.sejf.zajety = false;
    await d.sync.syncPush();
    expect(srv.puty).toHaveLength(1);
    expect(srv.puty[0].ifMatch).toBe('"E1"');
    expect((await odszyfruj(srv.blob, d.klucz)).patients.map((p) => p.patientId).sort()).toEqual(['Lokalny', 'Zdalny']);
  });

  it('kontrola: znany ETag — wysyłka bez dodatkowego pobierania, PUT z tym ETagiem', async () => {
    const d = await urzadzenie({ stan: { registered: true, localEtag: 'E1', lastSyncAt: null } });
    const srv = await serwerZChmura(d.klucz);
    vi.stubGlobal('fetch', srv.fetch);

    await d.sync.syncPush();
    expect(d.sejf.scalenia, 'bez scalania').toBe(0);
    expect(srv.puty).toHaveLength(1);
    expect(srv.puty[0].ifMatch).toBe('"E1"');
  });

  it('kontrola: nowy slot bez bloba w chmurze — wysyłka rejestruje i wysyła jak dotąd', async () => {
    const d = await urzadzenie({ stan: null, sesjaPobrala: false });
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);

    const wynik = await d.sync.syncPush();
    expect(wynik.action).toBe('registered');
    expect((await odszyfruj(srv.blob, d.klucz)).patients.map((p) => p.patientId)).toEqual(['Lokalny']);
  });
});

describe('Delty: MERGE_BUSY nie przesuwa kursora (uwaga Codex P1 do #518)', () => {
  async function zDeltami() {
    const d = await urzadzenie({ stan: { registered: true, localEtag: 'E1', lastSyncAt: null } });
    const srv = await serwerZChmura(d.klucz);
    srv.delty = [1, 2, 3].map((seq) => ({ seq, payload: { id: `d${seq}` } }));
    srv.headSeq = 3;
    vi.stubGlobal('fetch', srv.fetch);
    return { d, srv };
  }
  const kursor = (d) => d.win.localStorage.getItem(KLUCZ_KURSORA);
  const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });

  it('delta z MERGE_BUSY: partia się zatrzymuje, kursor zostaje; następne pobranie stosuje ją ponownie', async () => {
    const { d } = await zDeltami();
    d.sejf.zajetaDelta = 'd2';

    expect((await d.sync.syncPull()).action).toBe('up-to-date');
    await vi.waitFor(() => { expect(d.sejf.delty).toEqual(['d1', 'd2']); });
    await chwila(20);
    expect(d.sejf.delty, 'po MERGE_BUSY bez kolejnych 30 s na d3').toEqual(['d1', 'd2']);
    expect(kursor(d), 'kursor nie przeskakuje niezastosowanej delty').toBeNull();

    d.sejf.zajetaDelta = null;
    await d.sync.syncPull();
    await vi.waitFor(() => { expect(kursor(d)).toBe('3'); });
    expect(d.sejf.delty, 'partia od nowa, d2 zastosowana').toEqual(['d1', 'd2', 'd1', 'd2', 'd3']);
  });

  it('kontrola: inny błąd delty (uszkodzona) nie blokuje kolejki — jak dotąd kursor idzie dalej', async () => {
    const { d } = await zDeltami();
    d.sejf.zlaDelta = 'd2';

    await d.sync.syncPull();
    await vi.waitFor(() => { expect(kursor(d)).toBe('3'); });
    expect(d.sejf.delty).toEqual(['d1', 'd2', 'd3']);
  });
});

/* Integracja: prawdziwy vilda_sync_integration.js z wirtualnym zegarem (wzór: synchronizacja-notatek-tempo). */
function zaladujIntegracje() {
  const handlery = {};
  const syncPush = vi.fn(() => Promise.resolve());
  const syncPull = vi.fn(() => Promise.resolve());
  const rejestrator = (nazwa) => (fn) => { handlery[nazwa] = fn; };
  const vault = {
    isUnlocked: () => false,
    isCloudOnlyMode: () => false,
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
  const win = {
    localStorage: magazyn({ 'vilda-sync-enabled-v1': 'true' }),
    sessionStorage: magazyn(),
    navigator: {},
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    setInterval: (...a) => setInterval(...a),
    clearInterval: (...a) => clearInterval(...a),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, hidden: false },
    VildaVault: vault,
    VildaSync: {
      syncPush,
      syncPull,
      onSyncStart: rejestrator('syncStart'),
      onSyncComplete: rejestrator('syncComplete'),
      onSyncError: rejestrator('syncError'),
    },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync_integration.js', win);
  if (typeof handlery.syncComplete !== 'function') throw new Error('integracja nie zarejestrowała onSyncComplete');
  return { handlery, syncPush };
}

describe('Wysyłka, która się poddała, wraca po pierwszym udanym pobraniu', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('5 nieudanych prób (MERGE_BUSY), potem udane pobranie: wysyłka rusza w ~1,5 s; po sukcesie nic więcej', async () => {
    const { handlery, syncPush } = zaladujIntegracje();
    syncPush.mockImplementation(() => Promise.reject(bladZajetosci()));
    handlery.note({ action: 'save', id: 'n1' });
    await vi.advanceTimersByTimeAsync(300000);
    const prob = syncPush.mock.calls.length;
    expect(prob, 'próby mają koniec').toBeLessThanOrEqual(6);

    syncPush.mockImplementation(() => Promise.resolve());
    handlery.syncComplete({ operation: 'pull', result: { action: 'merged' } });
    await vi.advanceTimersByTimeAsync(1600);
    expect(syncPush, 'wysyłka wznowiona po zwolnieniu blokady').toHaveBeenCalledTimes(prob + 1);

    handlery.syncComplete({ operation: 'pull', result: { action: 'up-to-date' } });
    await vi.advanceTimersByTimeAsync(60000);
    expect(syncPush, 'po udanej wysyłce kolejne pobranie niczego nie wysyła').toHaveBeenCalledTimes(prob + 1);
  });

  it('zaległości wysłane przy następnej zmianie lokalnej: pobranie potem już niczego nie dubluje', async () => {
    const { handlery, syncPush } = zaladujIntegracje();
    syncPush.mockImplementation(() => Promise.reject(bladZajetosci()));
    handlery.note({ action: 'save', id: 'n1' });
    await vi.advanceTimersByTimeAsync(300000);
    const prob = syncPush.mock.calls.length;

    syncPush.mockImplementation(() => Promise.resolve());
    handlery.note({ action: 'save', id: 'n2' }); // nowa zmiana zabiera zaległości (pełny stan)
    await vi.advanceTimersByTimeAsync(3100);
    expect(syncPush).toHaveBeenCalledTimes(prob + 1);

    handlery.syncComplete({ operation: 'pull', result: { action: 'merged' } });
    await vi.advanceTimersByTimeAsync(60000);
    expect(syncPush, 'bez drugiej, zbędnej wysyłki').toHaveBeenCalledTimes(prob + 1);
  });

  it('kontrola: udane pobranie bez niewysłanych zmian nie wywołuje wysyłki', async () => {
    const { handlery, syncPush } = zaladujIntegracje();
    handlery.syncComplete({ operation: 'pull', result: { action: 'merged' } });
    await vi.advanceTimersByTimeAsync(60000);
    expect(syncPush).not.toHaveBeenCalled();
  });
});

describe('strażniki źródła', () => {
  const SYNC = readFileSync(path.join(repoRoot, 'vilda_sync.js'), 'utf8');

  it('gałąź 409 nie scala w catch{} i nie przyjmuje ETagu z /status przed pobraniem', () => {
    const i = SYNC.indexOf('if(v.status===409){');
    // Bez komentarzy: komentarz opisuje dawne catch{}, a pilnujemy kodu.
    const galaz = SYNC.slice(i, SYNC.indexOf('else if(v.status===429)', i)).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(galaz).toContain('await Y(),Bss=!0;');
    expect(galaz).not.toContain('mergeSyncPayload');
    expect(galaz).not.toContain('catch{}');
    expect(SYNC).toContain('if(!s.localEtag&&!Bss){await Y(),Bss=!0;');
  });

  it('kursor delt rusza tylko, gdy partia nie skończyła się MERGE_BUSY', () => {
    expect(SYNC).toContain('catch(Bsd){if(Bsd&&Bsd.vildaMergeBusy){Bsp=!0;break}}');
    expect(SYNC).toContain('d>n&&!Bsp&&Kt(t,d)');
  });
});
