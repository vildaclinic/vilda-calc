import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SYNC-KURSOR (decyzja właściciela 2026-10-08: „zrób to”, reszta etapu 0 planu
// docs/SYNC_PRZYROSTOWA_PLAN.md) — trzy poprawki pełnej wysyłki i drenażu zmian w vilda_sync.js:
//   1. Kursor dziennika zmian idzie na najwyższy numer delty, którą partia naprawdę zwróciła, a nie na headSeq.
//      Worker v36 nadaje numer przed zapisem delty do R2 (zapis po odpowiedzi), a błąd listy R2 daje pustą
//      listę z bieżącym headSeq — dotąd kursor przeskakiwał wtedy delty, których nikt już nie pobierał.
//   2. Po 412 (If-Match nie pasuje) ponowne pobranie rusza po odstępie 1 s, potem 3 s, z rozrzutem ×0,5–1,5.
//   3. keepalive sumuje się dla wszystkich wywołań scalonych w kolejce pełnej wysyłki (uwaga Codex P2 do #574).
//
// Prawdziwe vilda_sync.js; serwer synchronizacji i sejf to atrapy (serwera nie ma w repozytorium).
// Dane wyłącznie FIKCYJNE.

const SLOT = 'c'.repeat(64);
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

function odp(status, cialo, naglowki = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => cialo,
    arrayBuffer: async () => cialo,
    headers: { get: (k) => naglowki[String(k).toLowerCase()] || null },
  };
}

/* Atrapa serwera: /status z tym samym ETagiem (pobranie = „aktualne”), /changes z dziennikiem delt,
   PUT /blob z kolejką odpowiedzi (np. 412, 412, 200) i opcjonalnym wstrzymaniem. */
function atrapaSerwera() {
  const srv = {
    etag: 'E1', licznik: 1, delty: [], headSeq: 0, zapytaniaZmian: [], statusy: 0,
    puty: [], odpowiedziPut: [], putWisi: false, zwolnienia: [],
  };
  srv.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const m = u.pathname.match(/^\/v1\/slots\/[^/]+\/?(.*)$/);
    const sciezka = m ? m[1] : '';
    const metoda = init.method || 'GET';
    if (sciezka === 'status') { srv.statusy += 1; return odp(200, { etag: srv.etag, size: 4096 }); }
    if (sciezka === 'changes') {
      const od = Number(u.searchParams.get('since')) || 0;
      srv.zapytaniaZmian.push(od);
      return odp(200, { deltas: srv.delty.filter((d) => d.seq > od), headSeq: srv.headSeq });
    }
    if (sciezka === 'blob' && metoda === 'GET') return odp(304, {});
    if (sciezka === 'blob' && metoda === 'PUT') {
      srv.puty.push({ keepalive: init.keepalive === true, bajty: init.body.byteLength, ifMatch: (init.headers || {})['If-Match'] || null });
      if (srv.putWisi) await new Promise((r) => { srv.zwolnienia.push(r); });
      const status = srv.odpowiedziPut.length ? srv.odpowiedziPut.shift() : 200;
      if (status !== 200) return odp(status, {});
      srv.licznik += 1; srv.etag = `E${srv.licznik}`;
      return odp(200, { etag: srv.etag });
    }
    return odp(404, {});
  };
  return srv;
}

/* Urządzenie: prawdziwy vilda_sync.js, atrapa sejfu (delty zapisywane po id; uszkodzona delta na żądanie). */
async function urzadzenie({ kursor = null, pacjenci = 1, rozmiarNotatki = 0 } = {}) {
  const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const sejf = {
    lokalni: Array.from({ length: pacjenci }, (_, i) => ({ patientId: `FIKCYJNY-${i + 1}` })),
    notatka: 'x'.repeat(rozmiarNotatki),
    delty: [],
    proby: [],
    zlaDelta: null,
    zablokujPo: null,
    odblokowany: true,
    eksporty: 0,
    isUnlocked: () => sejf.odblokowany,
    isCloudOnlyMode: () => false,
    getSyncMaterial: async () => ({ slotId: SLOT, authToken: 'TOKEN', authTokenHash: 'HASH', syncEncKey: klucz }),
    exportSyncPayload: async () => { sejf.eksporty += 1; return { patients: sejf.lokalni.map((p) => ({ ...p })), notes: sejf.notatka, wersja: sejf.eksporty }; },
    listPatients: async () => sejf.lokalni,
    mergeSyncPayload: async () => ({}),
    applyEncryptedDelta: async (payload) => {
      sejf.proby.push(payload.id);
      if (!sejf.odblokowany) return null; // jak ps() w vilda_vault.js: zablokowany sejf nic nie stosuje
      sejf.delty.push(payload.id);
      if (sejf.zablokujPo === payload.id) sejf.odblokowany = false; // automatyczna blokada w trakcie partii
      if (sejf.zlaDelta === payload.id) throw new Error('uszkodzona delta');
      return { mergedPatientCount: 1 };
    },
  };
  const seed = { [KLUCZ_STANU]: JSON.stringify({ registered: true, localEtag: 'E1', lastSyncAt: null }) };
  if (kursor != null) seed[KLUCZ_KURSORA] = String(kursor);
  const win = {
    localStorage: magazyn(seed),
    sessionStorage: magazyn({ 'vilda-sync-pulled-v1': '1' }),
    document: { dispatchEvent() {} },
    VildaVault: sejf,
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync.js', win);
  return { sync: win.VildaSync, sejf, win, kursor: () => win.localStorage.getItem(KLUCZ_KURSORA) };
}

const delta = (seq) => ({ seq, payload: { id: `d${seq}`, iv: 'iv', data: 'dane' } });

/* Drenaż delt idzie w tle po pobraniu (B() nie jest czekane): czekamy, aż atrapa dostanie zapytanie
   o zmiany i sejf zastosuje partię (pętla setImmediate, bez fałszywego zegara). */
async function pobierzIDrenuj(d, srv) {
  const przed = srv.zapytaniaZmian.length;
  const wynik = await d.sync.syncPull();
  const koniec = performance.now() + 2000;
  while (srv.zapytaniaZmian.length === przed && performance.now() < koniec) await new Promise((r) => { setImmediate(r); });
  for (let i = 0; i < 20; i++) await new Promise((r) => { setImmediate(r); });
  return wynik;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Kursor dziennika zmian: najwyższa zwrócona delta, nie headSeq', () => {
  it('pusta partia przy headSeq > kursor (błąd listy R2 albo delta jeszcze niezapisana): kursor stoi; delta pobrana później', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.headSeq = 5;

    expect((await pobierzIDrenuj(d, srv)).action).toBe('up-to-date');
    expect(d.kursor(), 'kursor nie przeskakuje na headSeq bez delt').toBeNull();

    srv.delty = [delta(5)];
    await pobierzIDrenuj(d, srv);
    expect(srv.zapytaniaZmian, 'drugie pobranie pyta znów od 0').toEqual([0, 0]);
    expect(d.sejf.delty, 'delta 5 zastosowana').toEqual(['d5']);
    expect(d.kursor()).toBe('5');
  });

  it('partia krótsza niż headSeq (delta 3 jeszcze nie w dzienniku): kursor na 2; następne pobranie stosuje 3', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.delty = [delta(1), delta(2)];
    srv.headSeq = 3;

    await pobierzIDrenuj(d, srv);
    expect(d.sejf.delty).toEqual(['d1', 'd2']);
    expect(d.kursor(), 'kursor na ostatniej zwróconej, nie na headSeq').toBe('2');

    srv.delty.push(delta(3));
    await pobierzIDrenuj(d, srv);
    expect(srv.zapytaniaZmian).toEqual([0, 2]);
    expect(d.sejf.delty, 'delta 3 dociera, 1 i 2 nie są stosowane drugi raz').toEqual(['d1', 'd2', 'd3']);
    expect(d.kursor()).toBe('3');
  });

  it('kontrola: luka u dołu (dziennik przycięty) — zwrócone delty zastosowane, kursor na najwyższej', async () => {
    const d = await urzadzenie({ kursor: 1 });
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.delty = [delta(5), delta(6)];
    srv.headSeq = 6;

    await pobierzIDrenuj(d, srv);
    expect(d.sejf.delty).toEqual(['d5', 'd6']);
    expect(d.kursor()).toBe('6');
  });

  it('kontrola: delty w dowolnej kolejności — kursor na największym numerze', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.delty = [delta(3), delta(1), delta(2)];
    srv.headSeq = 3;

    await pobierzIDrenuj(d, srv);
    expect(d.kursor()).toBe('3');
  });

  it('kontrola: uszkodzona delta nie blokuje kolejki — kursor idzie za nią', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.delty = [delta(1), delta(2), delta(3)];
    srv.headSeq = 3;
    d.sejf.zlaDelta = 'd3';

    await pobierzIDrenuj(d, srv);
    expect(d.sejf.delty).toEqual(['d1', 'd2', 'd3']);
    expect(d.kursor()).toBe('3');
  });

  it('sejf zablokowany w trakcie partii: kursor stoi; po odblokowaniu partia od nowa', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.delty = [delta(1), delta(2), delta(3)];
    srv.headSeq = 3;
    d.sejf.zablokujPo = 'd1';

    await pobierzIDrenuj(d, srv);
    expect(d.sejf.delty).toEqual(['d1']);
    expect(d.sejf.proby, 'po blokadzie partia się kończy, bez prób dla d2 i d3').toEqual(['d1']);
    expect(d.kursor(), 'kursor nie przeskakuje delt, których zablokowany sejf nie zastosował').toBeNull();

    d.sejf.zablokujPo = null;
    d.sejf.odblokowany = true;
    await pobierzIDrenuj(d, srv);
    expect(d.sejf.delty).toEqual(['d1', 'd1', 'd2', 'd3']);
    expect(d.kursor()).toBe('3');
  });

  it('sejf zablokowany po ostatniej delcie partii: kursor stoi (nie wiadomo, czy ostatnia weszła)', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.delty = [delta(1), delta(2)];
    srv.headSeq = 2;
    d.sejf.zablokujPo = 'd2';

    await pobierzIDrenuj(d, srv);
    expect(d.sejf.delty).toEqual(['d1', 'd2']);
    expect(d.kursor()).toBeNull();
  });

  it('kontrola: kursor się nie cofa — headSeq niższy od kursora i brak nowych delt', async () => {
    const d = await urzadzenie({ kursor: 10 });
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.headSeq = 4;

    await pobierzIDrenuj(d, srv);
    expect(srv.zapytaniaZmian).toEqual([10]);
    expect(d.kursor()).toBe('10');
  });
});

async function czekajNa(warunek) {
  const koniec = performance.now() + 2000;
  while (!warunek() && performance.now() < koniec) await new Promise((r) => { setImmediate(r); });
  for (let i = 0; i < 10; i++) await new Promise((r) => { setImmediate(r); });
}

/* Zegar: fałszywe setTimeout/clearTimeout i Date (performance.now i setImmediate prawdziwe, więc kryptografia
   i pętle oczekiwania idą naprawdę). Atrapa zapisuje czas fałszywego zegara każdego /status i PUT; zegar
   przesuwamy krokami po 10 ms, aż wysyłka się zakończy. */
async function przewinDoKonca(obietnica) {
  const stan = { gotowe: false };
  obietnica.then(() => { stan.gotowe = true; }, () => { stan.gotowe = true; });
  for (let i = 0; i < 2000 && !stan.gotowe; i++) {
    await vi.advanceTimersByTimeAsync(10);
    for (let j = 0; j < 3; j++) await new Promise((r) => { setImmediate(r); });
  }
  return obietnica.then((w) => ({ wynik: w }), (e) => ({ blad: e }));
}

function zZegarem(srv) {
  const fetchAtrapy = srv.fetch;
  srv.zdarzenia = [];
  srv.fetch = async (url, init = {}) => {
    const sciezka = new URL(url).pathname.replace(/^\/v1\/slots\/[^/]+\/?/, '');
    const co = sciezka === 'blob' && (init.method || 'GET') === 'PUT' ? 'put' : sciezka;
    const t = Date.now();
    const r = await fetchAtrapy(url, init);
    srv.zdarzenia.push({ co, t, status: r.status });
    return r;
  };
  return srv;
}

/* Odstęp = czas od PUT z 412 do pierwszego /status ponownego pobrania. */
function odstepy(srv) {
  const out = [];
  srv.zdarzenia.forEach((z, i) => {
    if (z.co !== 'put' || z.status !== 412) return;
    const nast = srv.zdarzenia.slice(i + 1).find((x) => x.co === 'status');
    if (nast) out.push(nast.t - z.t);
  });
  return out;
}

describe('Odstęp po 412 przed ponownym pobraniem: 1 s, potem 3 s, z rozrzutem ×0,5–1,5', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });

  it('dwa 412, potem 200: pobranie po 1000 ms, potem po 3000 ms (rozrzut 0,5 → ×1,0)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const d = await urzadzenie();
    const srv = zZegarem(atrapaSerwera());
    vi.stubGlobal('fetch', srv.fetch);
    srv.odpowiedziPut = [412, 412, 200];

    const r = await przewinDoKonca(d.sync.syncPush());
    expect(r.blad).toBeUndefined();
    expect(r.wynik.action).toBe('uploaded');
    expect(srv.puty).toHaveLength(3);
    const [o1, o2] = odstepy(srv);
    expect(o1, 'pierwszy odstęp').toBeGreaterThanOrEqual(1000);
    expect(o1).toBeLessThan(1030);
    expect(o2, 'drugi odstęp').toBeGreaterThanOrEqual(3000);
    expect(o2).toBeLessThan(3030);
  });

  it.each([
    [0, 500],
    [0.999, 1499],
  ])('rozrzut %s: pierwszy odstęp %i ms', async (los, ms) => {
    vi.spyOn(Math, 'random').mockReturnValue(los);
    const d = await urzadzenie();
    const srv = zZegarem(atrapaSerwera());
    vi.stubGlobal('fetch', srv.fetch);
    srv.odpowiedziPut = [412, 200];

    const r = await przewinDoKonca(d.sync.syncPush());
    expect(r.wynik && r.wynik.action).toBe('uploaded');
    const [o1] = odstepy(srv);
    expect(o1).toBeGreaterThanOrEqual(ms);
    expect(o1).toBeLessThan(ms + 30);
  });

  it('trzy 412: odstępy 1 s i 3 s, potem CONFLICT od razu po trzecim, bez kolejnego odstępu', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const d = await urzadzenie();
    const srv = zZegarem(atrapaSerwera());
    vi.stubGlobal('fetch', srv.fetch);
    srv.odpowiedziPut = [412, 412, 412];

    const r = await przewinDoKonca(d.sync.syncPush());
    expect(r.blad && r.blad.code).toBe('CONFLICT');
    expect(srv.puty).toHaveLength(3);
    const [o1, o2] = odstepy(srv);
    expect(o1).toBeGreaterThanOrEqual(1000);
    expect(o2).toBeGreaterThanOrEqual(3000);
    const ostatniPut = srv.zdarzenia.filter((z) => z.co === 'put').pop();
    expect(Date.now() - ostatniPut.t, 'po trzecim 412 bez czekania').toBeLessThan(30);
  });
});

describe('keepalive w kolejce pełnej wysyłki (uwaga Codex P2 do #574)', () => {
  async function zKolejka(wywolania, { rozmiarNotatki = 0 } = {}) {
    const d = await urzadzenie({ rozmiarNotatki });
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.putWisi = true;
    const pierwsza = d.sync.syncPush();
    await czekajNa(() => srv.puty.length === 1);
    const kolejne = wywolania.map((opcje) => d.sync.syncPush(opcje));
    srv.putWisi = false;
    srv.zwolnienia.shift()();
    await pierwsza;
    await Promise.all(kolejne);
    return srv;
  }

  it('zwykłe wywołanie zakłada kolejkę, potem wywołanie z keepalive: kolejny PUT ma keepalive', async () => {
    const srv = await zKolejka([undefined, { keepalive: true }]);
    expect(srv.puty, 'jedna wysyłka w kolejce').toHaveLength(2);
    expect(srv.puty[1].keepalive, 'flaga z drugiego wywołania nie ginie').toBe(true);
  });

  it('zwykłe, keepalive, zwykłe: kolejny PUT ma keepalive (flaga się sumuje, nie wygrywa ostatnie wywołanie)', async () => {
    const srv = await zKolejka([undefined, { keepalive: true }, undefined]);
    expect(srv.puty).toHaveLength(2);
    expect(srv.puty[1].keepalive).toBe(true);
  });

  it('kontrola: kolejkę zakłada wywołanie z keepalive, potem zwykłe — PUT ma keepalive', async () => {
    const srv = await zKolejka([{ keepalive: true }, undefined]);
    expect(srv.puty).toHaveLength(2);
    expect(srv.puty[1].keepalive).toBe(true);
  });

  it('kontrola: same zwykłe wywołania — PUT bez keepalive', async () => {
    const srv = await zKolejka([undefined, undefined]);
    expect(srv.puty).toHaveLength(2);
    expect(srv.puty[1].keepalive).toBe(false);
  });

  it('kontrola: ciało powyżej 60 000 B — bez keepalive mimo flagi (limit przeglądarki 64 KiB)', async () => {
    const srv = await zKolejka([undefined, { keepalive: true }], { rozmiarNotatki: 70000 });
    expect(srv.puty).toHaveLength(2);
    expect(srv.puty[1].bajty).toBeGreaterThan(60000);
    expect(srv.puty[1].keepalive).toBe(false);
  });

  it('dwa cykle kolejki na jednym urządzeniu: flaga z pierwszego nie przechodzi na drugi', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    const cykl = async (wywolania) => {
      srv.putWisi = true;
      const n = srv.puty.length;
      const pierwsza = d.sync.syncPush();
      await czekajNa(() => srv.puty.length === n + 1);
      const kolejne = wywolania.map((o) => d.sync.syncPush(o));
      srv.putWisi = false;
      srv.zwolnienia.shift()();
      await pierwsza;
      await Promise.all(kolejne);
    };
    await cykl([undefined, { keepalive: true }]);
    await cykl([undefined, undefined]);
    expect(srv.puty.map((p) => p.keepalive)).toEqual([false, true, false, false]);
  });

  it('wywołanie tuż po końcu wysyłki, zanim ruszy kolejka: dołącza do kolejki z keepalive, bez osobnego PUT', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    srv.putWisi = true;
    // jak V() integracji: po końcu wysyłki od razu kolejna (łańcuch .then na tej samej obietnicy)
    const lancuch = Promise.resolve(d.sync.syncPush()).then(() => {}, () => {}).then(() => d.sync.syncPush());
    await czekajNa(() => srv.puty.length === 1);
    const ukrycie = d.sync.syncPush({ keepalive: true });
    srv.putWisi = false;
    srv.zwolnienia.shift()();
    await lancuch;
    await ukrycie;
    expect(srv.puty.map((p) => p.keepalive), 'jedna wysyłka po pierwszej, z keepalive').toEqual([false, true]);
  });

  it('kontrola: wywołanie z keepalive bez kolejki (nic nie trwa) — PUT ma keepalive jak dotąd', async () => {
    const d = await urzadzenie();
    const srv = atrapaSerwera();
    vi.stubGlobal('fetch', srv.fetch);
    await d.sync.syncPush({ keepalive: true });
    expect(srv.puty).toHaveLength(1);
    expect(srv.puty[0].keepalive).toBe(true);
  });
});

/* Wylogowanie wszystkich urządzeń (revokeAllDevices) w trakcie wysyłki czekającej po 412: serwer z kilkoma
   slotami (rejestracja 409/201, DELETE, If-Match), każde żądanie trwa 100 ms na fałszywym zegarze.
   Rotacja 0 i 300 ms po 412 trafia w odstęp, 1050 ms — w ponowne pobranie po odstępie. Dane FIKCYJNE. */
const STARY = 'a'.repeat(64);
const NOWY = 'b'.repeat(64);

async function szyfruj(obj, klucz) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + c.length); out.set(iv, 0); out.set(c, 12);
  return out.buffer;
}

async function serwerSlotow(kluczStary) {
  const srv = { sloty: new Map(), pierwszyPut412: true, po412: null };
  srv.sloty.set(STARY, { etag: 'S1', hash: 'HASH-STARY', body: await szyfruj({ patients: [] }, kluczStary) });
  srv.fetch = async (url, init = {}) => {
    await new Promise((r) => { setTimeout(r, 100); });
    const m = new URL(url).pathname.match(/^\/v1\/slots\/([^/]+)\/?(.*)$/);
    const slot = m[1]; const sc = m[2]; const met = init.method || 'GET'; const h = init.headers || {};
    const st = srv.sloty.get(slot);
    if (sc === 'register') {
      if (st) return odp(409, {});
      srv.sloty.set(slot, { etag: `R${srv.sloty.size}`, hash: h['X-Auth-Token-Hash'], body: init.body });
      return odp(201, { etag: srv.sloty.get(slot).etag });
    }
    if (!st) return odp(sc === 'status' ? 404 : 401, {});
    if (sc === '' && met === 'DELETE') { srv.sloty.delete(slot); return odp(204, {}); }
    if (sc === 'status') return odp(200, { etag: st.etag, size: 1000 });
    if (sc === 'blob' && met === 'GET') {
      if (h['If-None-Match'] === `"${st.etag}"`) return odp(304, {});
      return odp(200, st.body, { etag: `"${st.etag}"` });
    }
    if (sc === 'blob' && met === 'PUT') {
      if (slot === STARY && srv.pierwszyPut412) { // inne urządzenie wysłało chwilę wcześniej
        srv.pierwszyPut412 = false; st.etag = 'S2';
        if (srv.po412) setTimeout(srv.po412, 0);
        return odp(412, {});
      }
      if ((h['If-Match'] || '') !== `"${st.etag}"`) return odp(412, {});
      st.etag = `P${Math.floor(Date.now() % 1e6)}`; st.body = init.body;
      return odp(200, { etag: st.etag });
    }
    if (sc === 'changes') return odp(200, { deltas: [], headSeq: 0 });
    return odp(404, {});
  };
  return srv;
}

async function urzadzenieZRotacja() {
  const kStary = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const kNowy = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  let mat = { slotId: STARY, authToken: 'TOK-STARY', authTokenHash: 'HASH-STARY', syncEncKey: kStary };
  const sejf = {
    isUnlocked: () => true,
    isCloudOnlyMode: () => false,
    getSyncMaterial: async () => mat,
    rotateSyncIdentity: async () => { mat = { slotId: NOWY, authToken: 'TOK-NOWY', authTokenHash: 'HASH-NOWY', syncEncKey: kNowy }; return { recoveryKey: 'FIKCYJNY' }; },
    exportSyncPayload: async () => ({ patients: [{ patientId: 'FIKCYJNY-1' }] }),
    listPatients: async () => [{ patientId: 'FIKCYJNY-1' }],
    mergeSyncPayload: async () => ({}),
    applyEncryptedDelta: async () => ({}),
  };
  const win = {
    localStorage: magazyn({ [`vilda-sync-state-v1:${STARY}`]: JSON.stringify({ registered: true, localEtag: 'S1' }) }),
    sessionStorage: magazyn({ 'vilda-sync-pulled-v1': '1' }),
    document: { dispatchEvent() {} },
    VildaVault: sejf,
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync.js', win);
  return { sync: win.VildaSync, kStary };
}

describe('Wylogowanie wszystkich urządzeń w trakcie wysyłki po 412: wysyłka kończy się na zmianie tożsamości', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });

  it.each([[0], [300], [1050]])('rotacja %i ms po 412: wysyłka przerwana (SYNC_IDENTITY_CHANGED), stary slot zostaje skasowany', async (ms) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const d = await urzadzenieZRotacja();
    const srv = await serwerSlotow(d.kStary);
    vi.stubGlobal('fetch', srv.fetch);
    const stan = { odwolanie: null };
    srv.po412 = () => { setTimeout(() => { stan.odwolanie = d.sync.revokeAllDevices('FIKCYJNE-haslo'); }, ms); };

    const wysylka = await przewinDoKonca(d.sync.syncPush());
    for (let i = 0; i < 300 && !stan.odwolanie; i++) await vi.advanceTimersByTimeAsync(10);
    const rotacja = await przewinDoKonca(stan.odwolanie);

    expect(rotacja.wynik && rotacja.wynik.oldSlotRevoked).toBe(true);
    expect(wysylka.blad && wysylka.blad.code).toBe('SYNC_IDENTITY_CHANGED');
    expect(srv.sloty.has(STARY), 'stary slot zostaje skasowany').toBe(false);
    expect(srv.sloty.has(NOWY)).toBe(true);
  });
});
