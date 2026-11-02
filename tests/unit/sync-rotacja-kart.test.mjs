import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SYNC-ROTACJA-KART (2026-10-08) — rotacja tożsamości synchronizacji (revokeAllDevices) w jednej karcie
// a inne karty tego samego profilu przeglądarki. Karta odblokowana wcześniej trzyma w pamięci poprzednią
// tożsamość do odświeżenia strony. Synchronizacja nie rejestruje, nie wysyła, nie pobiera i nie przywraca slotu,
// którego tożsamość została obrócona w innej karcie: kończy się SYNC_IDENTITY_CHANGED. Po odświeżeniu karta
// synchronizuje się z bieżącym slotem.
//
// E2-PR1b (P-SYNC-ODPYTYWANIE-WS, W1 z przeglądu): W1, W1b, kontrola — karta, która obróciła tożsamość, przenosi gniazdo
// na żywo na nowy slot (na końcu pliku; prawdziwe vilda_sync.js i vilda_realtime.js w jednym oknie); W1c — tylko w trybie
// „Komputer prywatny” („Komputer w pracy” i „Zaloguj jednorazowo”: gniazdo jak dotąd); W1d — rotacja w 1,5 s od
// poprzedniej próby połączenia: jedna ponowna próba po 1,6 s (później niż odstęp prób 1,5 s); W1e — gdy po rotacji
// realtime sam zaczął łączyć, bez dodatkowej próby (nowe gniazdo zamknięte przez serwer czeka na odstęp ponownego łączenia).
//
// Prawdziwe vilda_sync.js w dwóch oknach ze wspólnym localStorage (osobne sessionStorage, jak dwie karty).
// Serwer synchronizacji i sejf to atrapy (serwera nie ma w repozytorium). Dane wyłącznie FIKCYJNE.
// Jawne usuwanie ma obecnie dodatkowy, odczytowy kontrakt chronionej biblioteki.
// Te scenariusze nie mają biblioteki: atrapa potwierdza wyłącznie typed ABSENT dla
// uwierzytelnionego slotu. Żadnego init/zapisu; wszystkie żądania zostają w logu.

const STARY = 'a'.repeat(64);
const NOWY = 'b'.repeat(64);
const TRZECI = 'c'.repeat(64);
const NAZWY = { [STARY]: 'STARY', [NOWY]: 'NOWY', [TRZECI]: 'TRZECI' };

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

function odp(status, cialo, naglowki = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => cialo,
    arrayBuffer: async () => cialo,
    headers: { get: (k) => naglowki[String(k).toLowerCase()] || null },
  };
}

async function szyfruj(obj, klucz) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + c.length); out.set(iv, 0); out.set(c, 12);
  return out.buffer;
}

const material = (slotId, klucz) => ({
  slotId, authToken: `TOK-${NAZWY[slotId]}`, authTokenHash: `HASH-${NAZWY[slotId]}`, syncEncKey: klucz,
});

/* Atrapa serwera z kilkoma slotami: rejestracja (409 gdy slot jest, inaczej 201), DELETE, /status, blob z If-Match
   i If-None-Match, restore-prev. Dziennik żądań po nazwach slotów. Rejestrację wybranego slotu można wstrzymać
   (serwer sprawdza istnienie slotu dopiero po zwolnieniu), a DELETE — zepsuć. */
async function serwer(klucz, { staryIstnieje = true } = {}) {
  const srv = { sloty: new Map(), log: [], licznik: 0, deleteNieudany: false, wstrzymane: new Map() };
  if (staryIstnieje) {
    srv.sloty.set(STARY, { etag: 'S1', body: await szyfruj({ patients: [{ patientId: 'FIKCYJNY-1' }] }, klucz) });
  }
  srv.fetch = async (url, init = {}) => {
    const m = new URL(url).pathname.match(/^\/v1\/slots\/([^/]+)\/?(.*)$/);
    const slot = m[1]; const sc = m[2]; const met = init.method || 'GET'; const h = init.headers || {};
    srv.log.push(`${met} ${NAZWY[slot] || slot}${sc ? `/${sc}` : ''}`);
    if (sc === 'template-library/state' && met === 'GET') {
      const receipt = { namespace: 'care-template-library', protocol: 1, slotId: slot, initialized: false, epoch: 0 };
      if (!srv.sloty.has(slot)) return new Response(JSON.stringify({ ...receipt, error: { code: 'identity_required' } }), { status: 409 });
      if (h.Authorization !== `Bearer TOK-${NAZWY[slot]}`) return new Response(JSON.stringify({ ...receipt, error: { code: 'invalid_credentials' } }), { status: 401 });
      return new Response(JSON.stringify({ ...receipt, ok: true, headSeq: 0, floorSeq: 0, eventsStored: 0, bytesStored: 0 }), { status: 200 });
    }
    if (sc === 'register') {
      const blokada = srv.wstrzymane.get(slot);
      if (blokada) await blokada.promise;
      if (srv.sloty.has(slot)) return odp(409, {});
      srv.licznik += 1;
      srv.sloty.set(slot, { etag: `R${srv.licznik}`, body: init.body });
      return odp(201, { etag: `R${srv.licznik}` });
    }
    const st = srv.sloty.get(slot);
    if (sc === '' && met === 'DELETE') {
      if (srv.deleteNieudany) return odp(503, {});
      if (!st) return odp(401, {});
      srv.sloty.delete(slot);
      return odp(204, {});
    }
    if (!st) return odp(sc === 'status' ? 404 : 401, {});
    if (sc === 'status') return odp(200, { etag: st.etag, size: 1000 });
    if (sc === 'blob' && met === 'GET') {
      if (h['If-None-Match'] === `"${st.etag}"`) return odp(304, {});
      return odp(200, st.body, { etag: `"${st.etag}"` });
    }
    if (sc === 'blob' && met === 'PUT') {
      if (h['If-Match'] && h['If-Match'] !== `"${st.etag}"`) return odp(412, {});
      srv.licznik += 1;
      st.etag = `P${srv.licznik}`; st.body = init.body;
      return odp(200, { etag: st.etag });
    }
    if (sc === 'blob/restore-prev') return odp(200, { restored: true });
    if (sc === 'changes') return odp(200, { deltas: [], headSeq: 0 });
    return odp(404, {});
  };
  srv.wstrzymaj = (slot) => {
    let zwolnij;
    const promise = new Promise((r) => { zwolnij = r; });
    srv.wstrzymane.set(slot, { promise, zwolnij: () => { srv.wstrzymane.delete(slot); zwolnij(); } });
    return srv.wstrzymane.get(slot);
  };
  srv.zapytaniaPo = (wpis) => srv.log.slice(srv.log.indexOf(wpis) + 1);
  return srv;
}

/* Karta: prawdziwe vilda_sync.js we własnym oknie; localStorage wspólny dla kart, sessionStorage własny.
   Sejf-atrapa trzyma tożsamość w pamięci karty, jak getSyncMaterial() prawdziwego sejfu. */
function karta(ls, { slot, nastepny, klucz, chmurowy = false, sesja = {}, dodatki = null }) {
  let mat = material(slot, klucz);
  let sessionVersion = 0;
  const operationSessions = new WeakMap();
  const sejf = {
    rotacje: 0,
    eksporty: 0,
    wstrzymajEksport: null, // obietnica: eksport czeka na nią (rotacja w innej karcie w trakcie eksportu)
    isUnlocked: () => true,
    isCloudOnlyMode: () => chmurowy,
    getSyncMaterial: async () => mat,
    captureSyncOperationSession: () => { const token = Object.freeze({}); operationSessions.set(token, sessionVersion); return token; },
    assertSyncOperationSession: token => {
      if (!operationSessions.has(token) || operationSessions.get(token) !== sessionVersion) throw Object.assign(new Error('Fikcyjna sesja zmieniona'), { code: 'SESSION_CHANGED' });
      return true;
    },
    rotateSyncIdentity: async () => { sejf.rotacje += 1; sessionVersion++; mat = material(nastepny, klucz); return { recoveryKey: 'FIKCYJNY-KLUCZ' }; },
    exportSyncPayload: async () => {
      sejf.eksporty += 1;
      if (sejf.wstrzymajEksport) await sejf.wstrzymajEksport;
      return { patients: [{ patientId: 'FIKCYJNY-1' }] };
    },
    listPatients: async () => [{ patientId: 'FIKCYJNY-1' }],
    mergeSyncPayload: async () => ({}),
  };
  const win = {
    localStorage: ls,
    sessionStorage: magazyn({ 'vilda-sync-pulled-v1': '1', ...sesja }),
    document: { dispatchEvent() {} },
    VildaVault: sejf,
  };
  win.window = win; win.self = win; win.top = win;
  if (dodatki) Object.assign(win, dodatki);
  loadBrowserScript('vilda_sync.js', win);
  if (dodatki) loadBrowserScript('vilda_realtime.js', win); // jak na stronie: po vilda_sync.js
  return { sync: win.VildaSync, sejf, win };
}

const stanZarejestrowany = (etag) => JSON.stringify({ registered: true, localEtag: etag, lastSyncAt: null });

/* Dwie karty jednego profilu: obie odblokowane z tą samą tożsamością (slot STARY, zarejestrowany). */
async function dwieKarty({ chmurowy = false, stanStarego = true, staryIstnieje = true } = {}) {
  const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const srv = await serwer(klucz, { staryIstnieje });
  vi.stubGlobal('fetch', srv.fetch);
  const stan = stanStarego ? { [`vilda-sync-state-v1:${STARY}`]: stanZarejestrowany('S1') } : {};
  // Tryb chmurowy: stan slotu siedzi w pamięci karty (tu: jej sessionStorage), nie we wspólnym localStorage.
  const ls = magazyn(chmurowy ? {} : stan);
  const sesja = chmurowy ? stan : {};
  const A = karta(ls, { slot: STARY, nastepny: NOWY, klucz, chmurowy, sesja });
  const B = karta(ls, { slot: STARY, nastepny: TRZECI, klucz, chmurowy, sesja });
  return { A, B, srv, ls, klucz };
}

const blad = (p) => p.then(() => null, (e) => e || new Error('pusty błąd'));

async function czekajNa(warunek, ms = 2000) {
  const koniec = performance.now() + ms;
  while (!warunek() && performance.now() < koniec) await new Promise((r) => { setImmediate(r); });
  expect(warunek()).toBe(true);
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Druga karta z tożsamością sprzed rotacji w pierwszej', () => {
  it('wysyłka z drugiej karty: SYNC_IDENTITY_CHANGED, bez żądań na stary slot', async () => {
    const { A, B, srv } = await dwieKarty();
    const r = await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    expect(r.oldSlotRevoked).toBe(true);
    expect(r.newSlotId).toBe(NOWY);

    const e = await blad(B.sync.syncPush());
    expect(e && e.code).toBe('SYNC_IDENTITY_CHANGED');
    expect(B.sejf.eksporty, 'bez eksportu sejfu').toBe(0);
    expect(srv.zapytaniaPo('DELETE STARY'), 'po rotacji nic nie idzie na stary slot').toEqual([]);
    expect(srv.sloty.has(STARY)).toBe(false);
    expect(srv.sloty.has(NOWY)).toBe(true);
  });

  it('pobranie w drugiej karcie: SYNC_IDENTITY_CHANGED zamiast „not-registered”', async () => {
    const { A, B, srv } = await dwieKarty();
    await A.sync.revokeAllDevices('FIKCYJNE-haslo');

    expect((await blad(B.sync.syncPull()))?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect((await blad(B.sync.syncFull()))?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect(srv.zapytaniaPo('DELETE STARY')).toEqual([]);
  });

  it('tryb chmurowy (stan slotu w pamięci karty): kolejne wysyłki z drugiej karty też kończą się SYNC_IDENTITY_CHANGED', async () => {
    const { A, B, srv } = await dwieKarty({ chmurowy: true });
    await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    expect(B.win.sessionStorage.getItem(`vilda-sync-state-v1:${STARY}`), 'karta B ma własny stan slotu').not.toBeNull();

    expect((await blad(B.sync.syncPush()))?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect((await blad(B.sync.syncPush()))?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect(srv.zapytaniaPo('DELETE STARY')).toEqual([]);
    expect(srv.sloty.has(STARY)).toBe(false);
  });

  it('kasowanie starego slotu nieudane (oldSlotRevoked: false): druga karta nie wysyła na niego i nie widzi „nowego urządzenia”', async () => {
    const { A, B, srv } = await dwieKarty();
    srv.deleteNieudany = true;
    const r = await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    expect(r.oldSlotRevoked).toBe(false);
    const przed = srv.sloty.get(STARY).etag;

    expect((await blad(B.sync.syncPush()))?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect((await B.sync.probeNewDevice()).isNewDevice).toBe(false);
    expect(srv.zapytaniaPo('DELETE STARY')).toEqual([]);
    expect(srv.sloty.get(STARY).etag, 'stary slot bez nowej wysyłki').toBe(przed);
  });

  it('rejestracja wysłana przed rotacją, przyjęta po niej: slot kasowany, SYNC_IDENTITY_CHANGED', async () => {
    // Karta B nie ma stanu slotu (jak po „Zresetuj stan synchronizacji”) i właśnie rejestruje; serwer przyjmuje
    // tę rejestrację dopiero po rotacji i kasowaniu w karcie A.
    const { A, B, srv } = await dwieKarty({ stanStarego: false, staryIstnieje: false });
    const blokada = srv.wstrzymaj(STARY);
    const wysylka = blad(B.sync.syncPush());
    await czekajNa(() => srv.log.includes('POST STARY/register'));

    const r = await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    expect(r.newSlotId).toBe(NOWY);
    blokada.zwolnij();

    expect((await wysylka)?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect(srv.sloty.has(STARY), 'stary slot nie zostaje').toBe(false);
    expect(srv.sloty.has(NOWY)).toBe(true);
  });

  it.each([
    ['stan slotu zapisany (dalej PUT)', true],
    ['bez stanu slotu (dalej rejestracja)', false],
  ])('rotacja w trakcie eksportu w drugiej karcie, %s: SYNC_IDENTITY_CHANGED, bez żądań na stary slot', async (_, stanStarego) => {
    const { A, B, srv } = await dwieKarty({ stanStarego });
    srv.deleteNieudany = true; // stary slot zostaje na serwerze, więc PUT albo rejestracja by przeszły
    let zwolnij;
    B.sejf.wstrzymajEksport = new Promise((r) => { zwolnij = r; });
    const wysylka = blad(B.sync.syncPush());
    await czekajNa(() => B.sejf.eksporty === 1);

    await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    zwolnij();

    expect((await wysylka)?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect(srv.zapytaniaPo('DELETE STARY')).toEqual([]);
    expect(srv.sloty.get(STARY).etag, 'stary slot bez nowej wysyłki').toBe('S1');
  });

  it('druga karta nie obraca tożsamości drugi raz', async () => {
    const { A, B, srv } = await dwieKarty();
    await A.sync.revokeAllDevices('FIKCYJNE-haslo');

    expect((await blad(B.sync.revokeAllDevices('FIKCYJNE-haslo')))?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect(B.sejf.rotacje).toBe(0);
    expect(srv.sloty.has(TRZECI)).toBe(false);
    expect(srv.sloty.has(NOWY), 'slot z rotacji w karcie A zostaje').toBe(true);
  });

  it('przywrócenie poprzedniej wersji i uploadToSlot na stary slot: SYNC_IDENTITY_CHANGED', async () => {
    const { A, B, srv, klucz } = await dwieKarty();
    await A.sync.revokeAllDevices('FIKCYJNE-haslo');

    expect((await blad(B.sync.restorePrevBlob()))?.code).toBe('SYNC_IDENTITY_CHANGED');
    const cialo = await szyfruj({ patients: [] }, klucz);
    expect((await blad(B.sync.uploadToSlot(STARY, 'TOK-STARY', 'HASH-STARY', cialo)))?.code).toBe('SYNC_IDENTITY_CHANGED');
    expect(srv.zapytaniaPo('DELETE STARY')).toEqual([]);
    expect(srv.sloty.has(STARY)).toBe(false);
  });
});

describe('Bez zmian: zwykła synchronizacja', () => {
  it('karta, która obróciła tożsamość, synchronizuje się dalej z nowym slotem', async () => {
    const { A, srv } = await dwieKarty();
    await A.sync.revokeAllDevices('FIKCYJNE-haslo');

    expect((await A.sync.syncPush()).action).toBe('uploaded');
    expect((await A.sync.syncPull()).action).toBe('up-to-date');
    expect(srv.log.at(-1)).toMatch(/^GET NOWY\//);
  });

  it('druga karta po odświeżeniu (bieżąca tożsamość) synchronizuje się z nowym slotem', async () => {
    const { A, srv, ls, klucz } = await dwieKarty();
    await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    const B2 = karta(ls, { slot: NOWY, nastepny: TRZECI, klucz });

    expect((await B2.sync.syncPull()).action).toBe('up-to-date');
    expect((await B2.sync.syncPush()).action).toBe('uploaded');
    expect(srv.sloty.has(STARY)).toBe(false);
  });

  it('pierwsza rejestracja nowego urządzenia', async () => {
    const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const srv = await serwer(klucz, { staryIstnieje: false });
    vi.stubGlobal('fetch', srv.fetch);
    const ls = magazyn();
    const K = karta(ls, { slot: STARY, nastepny: NOWY, klucz });

    expect((await K.sync.syncPull()).action).toBe('not-registered');
    const w = await K.sync.syncPush();
    expect(w.action).toBe('registered');
    expect(srv.log).toEqual(['GET STARY/status', 'POST STARY/register']);
    expect(JSON.parse(ls.getItem(`vilda-sync-state-v1:${STARY}`)).registered).toBe(true);
  });

  it('„Zresetuj stan synchronizacji”: rejestracja 409, pobranie i wysyłka jak dotąd', async () => {
    const { A, srv } = await dwieKarty();
    await A.sync.clearSyncState();

    const w = await A.sync.syncPush();
    expect(w.action).toBe('uploaded');
    expect(srv.log.slice(0, 4)).toEqual(['POST STARY/register', 'GET STARY/status', 'GET STARY/blob', 'PUT STARY/blob']);
  });

  it('rotacja w jednej karcie: wynik revokeAllDevices jak dotąd', async () => {
    const { A, srv } = await dwieKarty();
    const r = await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    expect(r).toEqual({ recoveryKey: 'FIKCYJNY-KLUCZ', oldSlotId: STARY, newSlotId: NOWY, oldSlotRevoked: true });
    expect(srv.log).toEqual(['POST NOWY/register', 'GET STARY/template-library/state', 'DELETE STARY']);
  });
});

// E2-PR1b (P-SYNC-ODPYTYWANIE-WS, ustalenie W1 przeglądu z 2026-11-02): karta, która obraca tożsamość, ma gniazdo na żywo
// otwarte przy poprzedniej tożsamości, które może dalej dostawać `pong`; bez ponownego połączenia
// VildaRealtime.isLive() zostawałby true, integracja odpytywałaby nowy slot co 60 s zamiast ~20 s, a ramki z nowego
// slotu by nie dochodziły. Prawdziwe vilda_sync.js i vilda_realtime.js w jednym oknie; gniazdo to atrapa (pong na każdy
// ping), zegary prawdziwe, fałszywy tylko Date (odstęp prób 1,5 s).
// Po rundzie poprawek 2 (przegląd: U1, U2): W1c (decyzja 1: „Komputer w pracy” i „Zaloguj jednorazowo” — gniazdo jak
// dotąd, bez ponownego połączenia) i W1d (ostatnia próba połączenia < 1,5 s przed końcem rotacji: realtime nie łączy i
// nie stawia zegara, więc vilda_sync.js ponawia connect raz po 1,6 s, tylko gdy gniazdo jest zamknięte). Czerwone bez
// poprawek tej rundy (vilda_sync.js sprzed K1/K2): W1c ×2 bez K1, W1d bez K2; W1d czerwony także przy ponownej próbie
// wcześniej niż po 1,5 s, W1e — przy ponownej próbie bez sprawdzenia, że gniazdo jest zamknięte.
describe('E2-PR1b: gniazdo na żywo po rotacji w tej karcie (P-SYNC-ODPYTYWANIE-WS)', () => {
  const T0 = Date.parse('2026-11-02T10:00:00.000Z');
  let sprzataj = null;
  afterEach(() => { if (sprzataj) sprzataj(); sprzataj = null; vi.useRealTimers(); });

  // chmurowy / sesja: tryb karty jak w karta() („Komputer w pracy” / znacznik sesji „Zaloguj jednorazowo”); wtedy stan
  // slotu w pamięci karty (tu: jej sessionStorage), jak w dwieKarty. odstep: ile ms fałszywego Date mija między ostatnią
  // próbą połączenia a rotacją (domyślnie 2000, czyli poza odstępem prób 1,5 s).
  async function kartaZGniazdem({ chmurowy = false, sesja = null, odstep = 2000 } = {}) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const srv = await serwer(klucz);
    vi.stubGlobal('fetch', srv.fetch);
    const stan = { [`vilda-sync-state-v1:${STARY}`]: stanZarejestrowany('S1') };
    const wPamieci = chmurowy || !!sesja;
    const ls = magazyn(wPamieci ? {} : stan);
    const gniazda = [], sluchacze = new Map(), zegary = new Set();
    class Gniazdo {
      constructor(url, protocols) {
        this.url = url; this.protocols = protocols; this.readyState = 0; gniazda.push(this);
        queueMicrotask(() => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.(); } });
      }
      send(m) {
        if (JSON.parse(m).type !== 'ping') return;
        queueMicrotask(() => { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify({ type: 'pong', ts: Date.now() }) }); });
      }
      close() { if (this.readyState === 3) return; this.readyState = 3; queueMicrotask(() => this.onclose?.({ code: 1000 })); }
    }
    const dodatki = {
      WebSocket: Gniazdo,
      navigator: { onLine: true },
      document: { hidden: false, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} },
      setTimeout: (fn, ms) => { const id = setTimeout(() => { zegary.delete(id); fn(); }, ms); zegary.add(id); return id; },
      clearTimeout: (id) => { zegary.delete(id); clearTimeout(id); },
      setInterval: (fn, ms) => { const id = setInterval(fn, ms); zegary.add(id); return id; },
      clearInterval: (id) => { zegary.delete(id); clearInterval(id); },
      addEventListener: (n, fn) => { (sluchacze.get(n) || sluchacze.set(n, []).get(n)).push(fn); },
      removeEventListener() {},
      VildaSyncIntegration: { isSyncEnabled: () => true, pullNow: vi.fn(), applyDelta: vi.fn() },
    };
    const A = karta(ls, { slot: STARY, nastepny: NOWY, klucz, chmurowy, sesja: wPamieci ? { ...stan, ...(sesja || {}) } : {}, dodatki });
    const rt = A.win.VildaRealtime;
    sprzataj = () => { try { rt.disconnect(); } catch { /* atrapa */ } for (const id of zegary) { clearTimeout(id); clearInterval(id); } };
    const fokus = () => { for (const fn of sluchacze.get('focus') || []) fn(); };
    // Gniazdo na starym slocie z pong (fokus wysyła ping od razu), potem `odstep` ms (domyślnie 2 s; odstęp prób 1,5 s
    // jak dotąd). Połączenie z zegara startu modułu (1,2 s), jak na stronie: po nim żaden zegar nie połączy gniazda
    // ponownie poza testowanym kodem.
    await czekajNa(() => rt.status() === 'open');
    fokus();
    await czekajNa(() => rt.isLive() === true);
    vi.setSystemTime(T0 + odstep);
    return { A, rt, srv, gniazda, fokus, pullNow: A.win.VildaSyncIntegration.pullNow };
  }
  const naSlot = (slot) => new RegExp(`/v1/slots/${slot}/socket$`);

  it('W1: po revokeAllDevices gniazdo starego slotu zamknięte, nowe na nowym slocie; isLive false do pierwszego pong nowego gniazda', async () => {
    const { A, rt, srv, gniazda, fokus } = await kartaZGniazdem();
    expect(gniazda).toHaveLength(1);
    expect(gniazda[0].url).toMatch(naSlot(STARY));
    const r = await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    expect(r.newSlotId).toBe(NOWY);
    expect(srv.sloty.has(STARY)).toBe(false);
    await czekajNa(() => gniazda.length === 2 && rt.status() === 'open');
    expect(gniazda[0].readyState, 'gniazdo starego slotu zamknięte').toBe(3);
    expect(gniazda[1].url, 'nowe gniazdo na nowym slocie').toMatch(naSlot(NOWY));
    expect(gniazda[1].protocols).toEqual(['vilda-auth', 'TOK-NOWY']);
    expect(rt.isLive(), 'nowe gniazdo bez własnego pong: integracja odpytuje co ~20 s').toBe(false);
    fokus();
    await czekajNa(() => rt.isLive() === true);
    expect(gniazda).toHaveLength(2);
  });

  it('W1b: rotacja w sejfie udana, rejestracja nowego slotu nieudana (503) — gniazdo też przechodzi na nowy slot', async () => {
    const { A, rt, srv, gniazda } = await kartaZGniazdem();
    vi.stubGlobal('fetch', async (url, init = {}) => (/\/register$/.test(new URL(url).pathname) ? odp(503, {}) : srv.fetch(url, init)));
    expect(await blad(A.sync.revokeAllDevices('FIKCYJNE-haslo'))).not.toBeNull();
    expect(A.sejf.rotacje).toBe(1);
    await czekajNa(() => gniazda.length === 2 && rt.status() === 'open');
    expect(gniazda[0].readyState).toBe(3);
    expect(gniazda[1].url).toMatch(naSlot(NOWY));
    expect(rt.isLive()).toBe(false);
  });

  it('W1 kontrola: rotacja odrzucona przez sejf (np. złe hasło) — gniazdo bez zmian', async () => {
    const { A, rt, gniazda } = await kartaZGniazdem();
    A.sejf.rotateSyncIdentity = async () => { throw Object.assign(new Error('Fikcyjne złe hasło'), { code: 'BAD_PASSWORD' }); };
    expect((await blad(A.sync.revokeAllDevices('FIKCYJNE-zle')))?.code).toBe('BAD_PASSWORD');
    await new Promise((r) => { setTimeout(r, 20); });
    expect(gniazda).toHaveLength(1);
    expect(gniazda[0].readyState).toBe(1);
    expect(rt.isLive()).toBe(true);
  });

  // Decyzja 1 (tylko „Komputer prywatny”): w pozostałych trybach odpytywanie i tak idzie co ~20 s, więc gniazdo zostaje
  // jak przed E2-PR1b — przy poprzedniej tożsamości, otwarte, bez nowego /socket i bez nowego pullNow z onopen.
  it.each([
    ['„Komputer w pracy” (konto chmurowe)', { chmurowy: true }],
    ['„Zaloguj jednorazowo” (znacznik sesji vilda-ephemeral-session-v1)', { sesja: { 'vilda-ephemeral-session-v1': '1' } }],
  ])('W1c: %s — po revokeAllDevices gniazdo jak dotąd (stary slot, otwarte, bez ponownego połączenia)', async (_n, opcje) => {
    const { A, rt, srv, gniazda, pullNow } = await kartaZGniazdem(opcje);
    expect(gniazda).toHaveLength(1);
    expect(gniazda[0].url).toMatch(naSlot(STARY));
    const przed = pullNow.mock.calls.length;
    const r = await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    expect(r.newSlotId).toBe(NOWY);
    expect(srv.sloty.has(STARY)).toBe(false);
    await new Promise((res) => { setTimeout(res, 50); });
    expect(gniazda, 'bez nowego /socket').toHaveLength(1);
    expect(gniazda[0].readyState, 'gniazdo otwarte').toBe(1);
    expect(gniazda[0].url, 'na starym slocie, jak dotąd').toMatch(naSlot(STARY));
    expect(rt.status()).toBe('open');
    expect(pullNow.mock.calls.length, 'bez nowego pullNow z onopen').toBe(przed);
  });

  it('W1d: rotacja w tej samej chwili co poprzednia próba połączenia (odstęp prób 1,5 s) — gniazdo zamknięte, potem jedna próba później niż po 1,5 s: nowe na nowym slocie', async () => {
    const { A, rt, gniazda } = await kartaZGniazdem({ odstep: 0 });
    expect(gniazda).toHaveLength(1);
    // Zegary prawdziwe, Date fałszywy: każdy zegar okna przy odpaleniu przesuwa Date o własne opóźnienie, więc ponowna
    // próba wcześniej niż po 1,5 s trafia w odstęp prób realtime i nie łączy.
    const st = A.win.setTimeout;
    A.win.setTimeout = (fn, ms) => st(() => { vi.setSystemTime(Date.now() + (ms || 0)); fn(); }, ms);
    const r = await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    expect(r.newSlotId).toBe(NOWY);
    // Realtime w 1,5 s od poprzedniej próby nie łączy, a po disconnect nie stawia własnego zegara.
    expect(rt.status(), 'tuż po rotacji: gniazdo zamknięte').toBe('closed');
    expect(gniazda[0].readyState).toBe(3);
    await czekajNa(() => gniazda.length === 2 && rt.status() === 'open', 3000);
    expect(gniazda[1].url, 'nowe gniazdo na nowym slocie').toMatch(naSlot(NOWY));
    expect(gniazda[1].protocols).toEqual(['vilda-auth', 'TOK-NOWY']);
    expect(gniazda[1].readyState).toBe(1);
    expect(rt.isLive(), 'bez własnego pong: integracja odpytuje co ~20 s').toBe(false);
  });

  it('W1e: po rotacji realtime sam łączy, a serwer od razu zamyka nowe gniazdo — bez dodatkowej próby (czeka odstęp ponownego łączenia)', async () => {
    const { A, rt, gniazda } = await kartaZGniazdem();
    const G = A.win.WebSocket;
    A.win.WebSocket = class extends G {
      constructor(u, p) {
        super(u, p);
        if (naSlot(NOWY).test(u)) { this.readyState = 3; queueMicrotask(() => this.onclose?.({ code: 1008 })); }
      }
    };
    await A.sync.revokeAllDevices('FIKCYJNE-haslo');
    await czekajNa(() => gniazda.length === 2 && rt.status() === 'closed');
    expect(gniazda[1].url).toMatch(naSlot(NOWY));
    // Date poza odstępem prób 1,5 s: dodatkowa próba z vilda_sync.js połączyłaby się od razu (trzecie gniazdo).
    vi.setSystemTime(T0 + 2000 + 1600);
    await new Promise((res) => { setTimeout(res, 2500); });
    expect(gniazda, 'bez dodatkowego /socket: następna próba dopiero po odstępie 10–12 s').toHaveLength(2);
    expect(rt.status()).toBe('closed');
  });
});
