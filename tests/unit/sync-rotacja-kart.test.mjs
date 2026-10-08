import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SYNC-ROTACJA-KART (2026-10-08) — rotacja tożsamości synchronizacji (revokeAllDevices) w jednej karcie
// a inne karty tego samego profilu przeglądarki. Karta odblokowana wcześniej trzyma w pamięci poprzednią
// tożsamość do odświeżenia strony. Synchronizacja nie rejestruje, nie wysyła, nie pobiera i nie przywraca slotu,
// którego tożsamość została obrócona w innej karcie: kończy się SYNC_IDENTITY_CHANGED. Po odświeżeniu karta
// synchronizuje się z bieżącym slotem.
//
// Prawdziwe vilda_sync.js w dwóch oknach ze wspólnym localStorage (osobne sessionStorage, jak dwie karty).
// Serwer synchronizacji i sejf to atrapy (serwera nie ma w repozytorium). Dane wyłącznie FIKCYJNE.

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
function karta(ls, { slot, nastepny, klucz, chmurowy = false, sesja = {} }) {
  let mat = material(slot, klucz);
  const sejf = {
    rotacje: 0,
    eksporty: 0,
    wstrzymajEksport: null, // obietnica: eksport czeka na nią (rotacja w innej karcie w trakcie eksportu)
    isUnlocked: () => true,
    isCloudOnlyMode: () => chmurowy,
    getSyncMaterial: async () => mat,
    rotateSyncIdentity: async () => { sejf.rotacje += 1; mat = material(nastepny, klucz); return { recoveryKey: 'FIKCYJNY-KLUCZ' }; },
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
  loadBrowserScript('vilda_sync.js', win);
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

async function czekajNa(warunek) {
  const koniec = performance.now() + 2000;
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
    expect(srv.log).toEqual(['POST NOWY/register', 'DELETE STARY']);
  });
});
