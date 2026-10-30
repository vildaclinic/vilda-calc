// E2-PR0 — test uprzęży tests/support/urzadzenie-sync.mjs. Pilnuje, że narzędzia mierzą to, co deklarują: dwa urządzenia
// jednego konta (bliźniak przez klon stanu adaptera Ze) wymieniają bloby i delty przez prawdziwy vilda_sync.js i atrapę
// workera, ruch jest przypisany do urządzenia po hoście, strażnik sieci łapie każde żądanie spoza atrapy, sprzątanie czeka
// na pracę w tle, a atrapa Web Locks ze `steal` jest zgodna z atrapaLocks z tests/unit/sesja-zapisu-uprzaz.mjs.
// Dane wyłącznie FIKCYJNE.
//
// Przypadki:
//   U1  bliźniak jednego konta: ten sam slot (64 hex) i token, różne hosty, eksport kanoniczny równy, rejestr po hoście;
//       własny stan bliźniaka (zapis bez synchronizacji nie przechodzi na drugie urządzenie).
//   U2  zapis karty na A → pełna wysyłka → pobranie na B (przed pobraniem B karty nie ma); eksporty równe; brak naruszeń
//       i rezerwy fetch okna.
//   U3  szybka ścieżka delty: beacon A → wiersz ev 'd' → drenaż na B (up-to-date; przed drenażem B karty nie ma),
//       kursor = seq, eksporty równe.
//   U4  dwa konta w jednej atrapie: różne sloty, równoległe rejestracje przypisane właściwym urządzeniom;
//       vi.stubGlobal('fetch') + vi.unstubAllGlobals() wraca do strażnika, nie do prawdziwego fetch.
//   U5  strażnik: globalny fetch spoza atrapy → TypeError i naruszenie; nieprzyjęte naruszenie → sprzątanie rzuca.
//   U6  sprzątanie: wstrzymany drenaż zwolniony i dokończony przed zamknięciem; po zamknięciu żądanie = naruszenie
//       'po-zamknieciu'; timery okna i blokady puste.
//   U7a parzystość blokad (atrapaLocks i atrapaBlokad): exclusive FIFO, shared razem, exclusive czeka na shared,
//       ifAvailable → cb(null), signal przed i w kolejce → AbortError, query().
//   U7b steal: kradnący przyznany od razu przed kolejką; obietnica okradzionego odrzucona AbortError, jego callback
//       kończy się bez wpływu; kolejka dostaje blokadę po kradnącym; wpisy 'skradziona' / 'kradziez'.
//   U7c steal niedozwolone (ifAvailable, shared, signal) → NotSupportedError, nic nie przyznane.
//   U8  bliźniak 'wszystko' (kopia localStorage/sessionStorage): od razu registered z tym samym ETagiem, kursorem i
//       znacznikiem pobrania w sesji; syncPull → up-to-date bez GET /blob.
//   U9  samokontrola determinizmu: scenariusz U3 dwukrotnie na świeżych atrapach → identyczne rzuty osi i żądań.
//   U10 cisza czeka na drenaż w locie (opóźniona odpowiedź /changes).
//   U11 kryteria ciszy na atrapie liczników (każde z osobna wstrzymuje ciszę; domyślne K = 5).
//   U12 naruszenie strażnika bez przyjęcia → sprzątanie rzuca.
//   U13 d.zamknij() bez sprzątania: blokady zwolnione, połączenie odłączone.
//   U14 bliźniak tuż po zapisie karty ma tę kartę (migawka z flushPersist).
//   U15 operacja uśpiona po 412: cisza i sprzątanie czekają na jej koniec, krótki limit zgłasza operację w toku.
//
// Czerwone na bazie: żadne — test narzędzi, zielony na e49ff33e.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera } from '../support/atrapa-workera-sync.mjs';
import {
  atrapaBlokad, cisza, eksportKanoniczny, sprzatnijUrzadzenia, straznik, utworzUrzadzenie,
} from '../support/urzadzenie-sync.mjs';
import { HASLO_B, atrapaLocks } from './sesja-zapisu-uprzaz.mjs';

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(async () => {
  try { await sprzatnijUrzadzenia(); } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

const kolejnaTura = () => new Promise((r) => { setImmediate(r); });
async function para(opcjeB = {}) {
  const atrapa = utworzAtrapeWorkera();
  const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
  const B = await utworzUrzadzenie({ atrapa, nazwa: 'B', zBlizniaka: A, ...opcjeB });
  return { atrapa, A, B };
}
const karty = async (d) => (await d.vault.exportSyncPayload()).patients.map((p) => p.patientId).sort();
// A rejestruje slot (z kartą 1), B pobiera pierwszy raz — punkt wyjścia „zsynchronizowani”.
async function zsynchronizuj({ atrapa, A, B }) {
  await A.zapiszKarte(1);
  expect((await A.sync.syncPush()).action).toBe('registered');
  expect((await A.sync.syncFull()).pull.action).toBe('up-to-date');
  expect((await B.sync.syncPull({ pierwszePobranie: true })).action).toBe('merged');
  await cisza([A, B]);
  expect(atrapa.naruszenia).toEqual([]);
}
// Scenariusz U3 (także dla U9): delta karty beaconem i drenaż na B.
async function scenariuszDelty() {
  const s = await para();
  await zsynchronizuj(s);
  const { atrapa, A, B } = s;
  const zA = A.znacznik();
  const k = await A.zapiszKarte(2);
  expect(await A.wyslijDelteKarty(k.patientId)).toBe(true);
  await cisza([A, B]);
  const bPrzed = await karty(B);
  const r = await B.sync.syncPull();
  await cisza([A, B]);
  return { ...s, k, r, zA, bPrzed, slot: atrapa.slot(A.slotId) };
}

describe('E2-PR0: uprząż urządzeń synchronizacji', () => {
  it('U1: bliźniak jednego konta — ten sam slot i token, różne hosty, eksport kanoniczny równy, rejestr po hoście', async () => {
    const { atrapa, A, B } = await para();
    const mA = await A.material();
    const mB = await B.material();
    expect(mA.slotId).toMatch(/^[0-9a-f]{64}$/);
    expect(mB.slotId).toBe(mA.slotId);
    expect(mB.authToken).toBe(mA.authToken);
    expect(B.konto.userId).toBe(A.konto.userId);
    expect(A.adres).not.toBe(B.adres);
    expect(new URL(A.adres).hostname).toBe(`a.${atrapa.id}.atrapa-workera.invalid`);
    expect(await B.eksportKanoniczny()).toBe(await A.eksportKanoniczny());
    expect(eksportKanoniczny({ userId: 'x', label: 'y', patients: [{ patientId: '2', header: { timestampISO: 't', a: 1 } }, { patientId: '1' }] }))
      .toBe('{"patients":[{"patientId":"1"},{"header":{"a":1},"patientId":"2"}]}');
    await A.zapiszKarte(1);
    await A.sync.syncPush();
    await B.sync.syncPull({ pierwszePobranie: true });
    await cisza([A, B]);
    expect(atrapa.zadania.map((z) => `${z.urzadzenie} ${z.metoda} ${z.trasa}`)).toEqual([
      'A POST register', 'B GET status', 'B GET blob', 'B GET changes',
    ]);
    expect(A.zadania().length).toBe(1);
    expect(B.zadania().every((z) => z.urzadzenie === 'B' && z.slot === '<slot>')).toBe(true);
    // Bliźniak ma WŁASNY stan (klon adaptera, nie wspólny magazyn): zapis bez synchronizacji zostaje na swoim urządzeniu.
    const kA = await A.zapiszKarte(5);
    const kB = await B.zapiszKarte(6);
    expect(await karty(A)).toContain(kA.patientId);
    expect(await karty(B)).not.toContain(kA.patientId);
    expect(await karty(B)).toContain(kB.patientId);
    expect(await karty(A)).not.toContain(kB.patientId);
  });

  it('U2: zapis karty na A → pełna wysyłka → pobranie na B; eksporty równe, bez naruszeń i bez rezerwy fetch okna', async () => {
    const s = await para();
    await zsynchronizuj(s);
    const { atrapa, A, B } = s;
    const od = atrapa.zadania.length;
    const etagPrzed = atrapa.aliasEtagu(atrapa.slot(A.slotId).kv.etag);
    const k = await A.zapiszKarte(2);
    const push = await A.sync.syncPush();
    expect(push.action).toBe('uploaded');
    const put = atrapa.zadania.slice(od).find((z) => z.trasa === 'blob-put');
    expect(put).toMatchObject({ urzadzenie: 'A', status: 200, naglowki: { autoryzacja: 'bearer', ifMatch: etagPrzed } });
    expect(await karty(B), 'przed pobraniem B nie ma karty — dotrze tylko przez atrapę').not.toContain(k.patientId);
    expect((await B.sync.syncPull()).action).toBe('merged');
    await cisza([A, B]);
    expect(await karty(B)).toContain(k.patientId);
    const wersje = async (d) => (await d.vault.exportSyncPayload()).patients.find((x) => x.patientId === k.patientId).snapshots.length;
    expect(await wersje(B)).toBe(await wersje(A));
    expect(await B.eksportKanoniczny()).toBe(await A.eksportKanoniczny());
    expect(atrapa.zadania.filter((z) => z.transport === 'fetch-okna')).toEqual([]);
    expect(atrapa.naruszenia).toEqual([]);
    expect(straznik().naruszenia).toEqual([]);
  });

  it('U3: szybka ścieżka delty — beacon A, wiersz ev src d, drenaż na B (up-to-date), kursor = seq, eksporty równe', async () => {
    const { atrapa, A, B, k, r, zA, bPrzed, slot } = await scenariuszDelty();
    expect(bPrzed, 'przed drenażem B nie ma karty').not.toContain(k.patientId);
    const ev = slot.dz.ev.filter((w) => w.src === 'd');
    expect(ev.length).toBe(1);
    expect(ev[0].eid).toMatch(/^d:[0-9a-f-]{36}$/);
    const beacon = A.zadania().find((z) => z.transport === 'beacon');
    expect(beacon).toMatchObject({ trasa: 'delta', status: 202, tokenWCiele: 'zgodny', keepalive: true, wynik: 'odpowiedz' });
    expect(r.action).toBe('up-to-date');
    expect(B.rzutOsi()).toContain(`→ GET /v1/slots/<slot>/changes?since=${B.kursor() - 1} [Bearer]`);
    expect(B.kursor()).toBe(ev[0].seq);
    expect(await karty(B)).toContain(k.patientId);
    expect(await B.eksportKanoniczny()).toBe(await A.eksportKanoniczny());
    expect(A.rzutOsi({ od: zA }).filter((l) => /PUT/.test(l)), 'brak pełnej wysyłki A po zapisie').toEqual([]);
    expect(atrapa.naruszenia).toEqual([]);
  });

  it('U4: dwa konta w jednej atrapie — różne sloty, równoległe rejestracje, stubGlobal i unstubAllGlobals wracają do strażnika', async () => {
    const atrapa = utworzAtrapeWorkera();
    const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
    const C = await utworzUrzadzenie({ atrapa, nazwa: 'C', haslo: HASLO_B });
    expect(C.slotId).not.toBe(A.slotId);
    await A.zapiszKarte(1);
    await C.zapiszKarte(2);
    const [ra, rc] = await Promise.all([A.sync.syncPush(), C.sync.syncPush()]);
    expect([ra.action, rc.action]).toEqual(['registered', 'registered']);
    // Kolejność przyjścia równoległych rejestracji zależy od szyfrowania w puli wątków — porównanie bez kolejności.
    const rej = atrapa.zadania.filter((z) => z.trasa === 'register');
    expect(rej.map((z) => [z.urzadzenie, z.status]).sort()).toEqual([['A', 201], ['C', 201]]);
    const zA = rej.find((z) => z.urzadzenie === 'A');
    const zC = rej.find((z) => z.urzadzenie === 'C');
    expect(zA.slot).not.toBe(zC.slot);
    expect(atrapa.aliasSlotu(A.slotId)).toBe(zA.slot);
    expect(atrapa.aliasSlotu(C.slotId)).toBe(zC.slot);
    expect(atrapa.zadania.every((z) => z.slot === atrapa.aliasSlotu(z.urzadzenie === 'A' ? A.slotId : C.slotId))).toBe(true);
    const strz = globalThis.fetch;
    expect(strz).toBe(straznik().dyspozytor);
    const podmiana = vi.fn(() => Promise.reject(new Error('podmiana testu')));
    vi.stubGlobal('fetch', podmiana);
    expect(globalThis.fetch).toBe(podmiana);
    vi.unstubAllGlobals();
    expect(globalThis.fetch, 'po unstubAllGlobals wraca strażnik, nie prawdziwy fetch').toBe(strz);
  });

  it('U5: strażnik — globalny fetch spoza atrapy daje TypeError i naruszenie; nieprzyjęte naruszenie wywraca sprzątanie', async () => {
    await expect(fetch('https://example.invalid/x?tajne=1')).rejects.toThrow(TypeError);
    const n = straznik().przyjmijNaruszenia((x) => x.rodzaj === 'poza-atrapa');
    expect(n.length).toBe(1);
    expect(n[0].opis).toContain('example.invalid');
    expect(n[0].opis).not.toContain('tajne');
    const inna = utworzAtrapeWorkera();
    const odp = await inna.obsluz({ metoda: 'GET', url: '/v1/nie-ma-takiej' });
    expect(odp.status).toBe(404);
    await expect(sprzatnijUrzadzenia()).rejects.toThrow(/nieznana-trasa/);
    expect(inna.naruszenia).toEqual([]);
  });

  it('U6: sprzątanie zwalnia wstrzymany drenaż i czeka na jego koniec; po zamknięciu żądanie to naruszenie po-zamknieciu', async () => {
    const s = await para();
    const { atrapa, A, B } = s;
    await A.zapiszKarte(1);
    await A.sync.syncPush();
    const k = await A.zapiszKarte(2);
    await A.wyslijDelteKarty(k.patientId);
    await cisza([A, B]);
    const brama = atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    expect((await B.sync.syncPull({ pierwszePobranie: true })).action).toBe('merged');
    await brama.osiagnieta;
    expect(atrapa.ruch('B').wLocie).toBe(1);
    await sprzatnijUrzadzenia();
    expect(atrapa.zadania.every((z) => z.wynik === 'odpowiedz')).toBe(true);
    expect(B.kursor(), 'drenaż dokończony przed zamknięciem').toBe(1);
    expect(B.rzutOsi().slice(-2)).toEqual(['← 200', 'vilda:sync-merged changes-drain']);
    await expect(B.polaczenie.fetch(B.adres + '/v1/health')).rejects.toThrow(TypeError);
    expect(straznik().przyjmijNaruszenia((x) => x.rodzaj === 'po-zamknieciu').length).toBe(1);
    expect(B.timery.oczekujace()).toEqual([]);
    expect(await B.blokady.query()).toEqual({ held: [], pending: [] });
  });

  describe.each([['atrapaLocks', atrapaLocks], ['atrapaBlokad', atrapaBlokad]])('U7a: parzystość blokad — %s', (_nazwa, fabryka) => {
    it('exclusive FIFO, shared razem, exclusive czeka na shared, ifAvailable, signal, query', async () => {
      const L = fabryka();
      const kolejnosc = [];
      let puscA;
      const a = L.request('x', () => { kolejnosc.push('a'); return new Promise((r) => { puscA = r; }); });
      const b = L.request('x', () => { kolejnosc.push('b'); });
      const c = L.request('x', { mode: 'exclusive' }, () => { kolejnosc.push('c'); });
      await kolejnaTura();
      expect(kolejnosc).toEqual(['a']);
      expect((await L.query()).pending.map((p) => p.mode)).toEqual(['exclusive', 'exclusive']);
      let zajeta = 'nie wołano';
      await L.request('x', { ifAvailable: true }, (lock) => { zajeta = lock; });
      expect(zajeta).toBe(null);
      const ac = new AbortController();
      const d = L.request('x', { signal: ac.signal }, () => { kolejnosc.push('d'); });
      ac.abort();
      await expect(d).rejects.toMatchObject({ name: 'AbortError' });
      const ac2 = new AbortController();
      ac2.abort();
      await expect(L.request('x', { signal: ac2.signal }, () => {})).rejects.toMatchObject({ name: 'AbortError' });
      puscA();
      await Promise.all([a, b, c]);
      expect(kolejnosc).toEqual(['a', 'b', 'c']);
      const s = [];
      let pusc1;
      const s1 = L.request('y', { mode: 'shared' }, () => { s.push('s1'); return new Promise((r) => { pusc1 = r; }); });
      const s2 = L.request('y', { mode: 'shared' }, () => { s.push('s2'); });
      await kolejnaTura();
      const e = L.request('y', () => { s.push('e'); });
      await s2;
      await kolejnaTura();
      expect(s).toEqual(['s1', 's2']);
      expect((await L.query()).held).toEqual([{ name: 'y', mode: 'shared' }]);
      pusc1();
      await Promise.all([s1, e]);
      expect(s).toEqual(['s1', 's2', 'e']);
      expect(await L.query()).toEqual({ held: [], pending: [] });
      expect(L.zadania.map((z) => z.wynik)).toEqual(['przyznana', 'przyznana', 'przyznana', 'zajeta', 'przerwana', 'przerwana', 'przyznana', 'przyznana', 'przyznana']);
    });
  });

  it('U7b: steal — kradnący przed kolejką, okradziony dostaje AbortError, a jego callback kończy się bez wpływu', async () => {
    const L = atrapaBlokad();
    const kol = [];
    let puscA;
    let koniecA = false;
    const a = L.request('k', () => { kol.push('A start'); return new Promise((r) => { puscA = r; }).then(() => { koniecA = true; kol.push('A koniec'); }); });
    await kolejnaTura();
    const c = L.request('k', () => { kol.push('C'); });
    let puscB;
    const b = L.request('k', { steal: true }, () => { kol.push('B'); return new Promise((r) => { puscB = r; }); });
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await kolejnaTura();
    expect(kol).toEqual(['A start', 'B']);
    expect((await L.query()).held).toEqual([{ name: 'k', mode: 'exclusive' }]);
    puscA();
    await kolejnaTura();
    await kolejnaTura();
    expect(koniecA).toBe(true);
    expect(kol, 'koniec callbacku okradzionego nie zwalnia blokady kradnącego').toEqual(['A start', 'B', 'A koniec']);
    puscB();
    await Promise.all([b, c]);
    expect(kol).toEqual(['A start', 'B', 'A koniec', 'C']);
    expect(L.zadania.map((z) => [z.nazwa, z.wynik])).toEqual([['k', 'skradziona'], ['k', 'przyznana'], ['k', 'kradziez']]);
    expect(await L.query()).toEqual({ held: [], pending: [] });
  });

  it('U7c: steal z ifAvailable, z mode shared albo z signal — NotSupportedError, nic nie przyznane', async () => {
    const L = atrapaBlokad();
    const wolane = [];
    for (const op of [{ steal: true, ifAvailable: true }, { steal: true, mode: 'shared' }, { steal: true, signal: new AbortController().signal }]) {
      await expect(L.request('n', op, () => { wolane.push(op); })).rejects.toMatchObject({ name: 'NotSupportedError' });
    }
    expect(wolane).toEqual([]);
    expect(L.zadania.map((z) => z.wynik)).toEqual(['odrzucona', 'odrzucona', 'odrzucona']);
    expect(await L.query()).toEqual({ held: [], pending: [] });
  });

  it('U8: bliźniak „wszystko” (kopia localStorage i sessionStorage) — od razu registered z tym samym ETagiem i kursorem', async () => {
    const atrapa = utworzAtrapeWorkera();
    const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
    await A.zapiszKarte(1);
    await A.sync.syncPush();
    const k = await A.zapiszKarte(2);
    await A.wyslijDelteKarty(k.patientId);
    await cisza([A]);
    expect((await A.sync.syncFull()).push.action).toBe('uploaded');
    await cisza([A]);
    expect(A.kursor()).toBe(1);
    const B = await utworzUrzadzenie({ atrapa, nazwa: 'B', zBlizniaka: A, klon: 'wszystko' });
    const stanSlotu = (d) => JSON.parse(d.win.localStorage.getItem('vilda-sync-state-v1:' + d.slotId));
    expect(stanSlotu(B)).toMatchObject({ registered: true, localEtag: stanSlotu(A).localEtag });
    expect(B.kursor()).toBe(A.kursor());
    expect([A.win.sessionStorage.getItem('vilda-sync-pulled-v1'), B.win.sessionStorage.getItem('vilda-sync-pulled-v1')], 'kopia sessionStorage').toEqual(['1', '1']);
    const od = B.zadania().length;
    expect((await B.sync.syncPull()).action).toBe('up-to-date');
    await cisza([A, B]);
    expect(B.zadania().slice(od).map((z) => `${z.metoda} ${z.trasa}${z.zapytanie}`)).toEqual(['GET status', 'GET changes?since=1']);
  });

  it('U9: samokontrola determinizmu — scenariusz U3 dwa razy na świeżych atrapach daje identyczne rzuty osi i żądań', async () => {
    const pierwszy = await scenariuszDelty();
    const r1 = { os: pierwszy.atrapa.rzutOsi(), zadania: pierwszy.atrapa.rzutZadan(), ramki: pierwszy.atrapa.ramki.map((x) => x.ramka.type) };
    await sprzatnijUrzadzenia();
    const drugi = await scenariuszDelty();
    const r2 = { os: drugi.atrapa.rzutOsi(), zadania: drugi.atrapa.rzutZadan(), ramki: drugi.atrapa.ramki.map((x) => x.ramka.type) };
    expect(pierwszy.atrapa.id).not.toBe(drugi.atrapa.id);
    expect(r2).toEqual(r1);
    expect(r1.zadania.length).toBeGreaterThan(5);
  });

  it('U10: cisza czeka na prawdziwy drenaż w locie (opóźniona odpowiedź /changes) — kursor i scalenie po ciszy', async () => {
    const s = await para();
    await zsynchronizuj(s);
    const { atrapa, A, B } = s;
    const k = await A.zapiszKarte(2);
    expect(await A.wyslijDelteKarty(k.patientId)).toBe(true);
    await cisza([A, B]);
    atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, opoznienie: { ms: 40 } });
    expect((await B.sync.syncPull()).action).toBe('up-to-date');
    await cisza([A, B]);
    expect(B.kursor()).toBe(1);
    expect(B.rzutOsi().at(-1)).toBe('vilda:sync-merged changes-drain');
    expect(await karty(B)).toContain(k.patientId);
  });

  it('U11: kryteria ciszy na atrapie liczników — żądanie w locie, czytane ciało, scalenie, operacja w toku, aktywność atrapy, zdarzenia urządzenia; domyślne K = 5', async () => {
    const r = { wLocie: 0, konsumpcje: 0 };
    let akt = 0;
    const d = { nazwa: 'X', atrapa: { ruch: () => ({ ...r }), aktywnosc: () => akt, rzutOsi: () => [] }, _licz: { zdarzenia: 0, scalenia: 0, operacje: new Map() } };
    let gotowe = false;
    const p = cisza([d]).then(() => { gotowe = true; });
    // Jedna tura testu = jedna tura pętli ciszy (obie na setImmediate, w kolejności zgłoszenia).
    const tury = async (n, opis, krok = () => {}) => {
      for (let i = 0; i < n; i += 1) { krok(); await kolejnaTura(); }
      expect(gotowe, opis).toBe(false);
    };
    r.wLocie = 1; await tury(15, 'żądanie w locie'); r.wLocie = 0;
    r.konsumpcje = 1; await tury(15, 'czytane ciało'); r.konsumpcje = 0;
    d._licz.scalenia = 1; await tury(15, 'scalenie'); d._licz.scalenia = 0;
    d._licz.operacje.set('push', 1); await tury(15, 'operacja w toku'); d._licz.operacje.clear();
    await tury(8, 'aktywność atrapy', () => { akt += 1; });
    await tury(8, 'zdarzenia urządzenia', () => { d._licz.zdarzenia += 1; });
    await tury(3, 'K = 5: trzy spokojne tury to za mało');
    await p;
    expect(gotowe).toBe(true);
  });

  it('U12: globalny fetch spoza atrapy bez przyjęcia naruszenia → sprzątanie rzuca z wpisem strażnika', async () => {
    await expect(fetch('https://example.invalid/y')).rejects.toThrow(TypeError);
    await expect(sprzatnijUrzadzenia()).rejects.toThrow(/strażnik: naruszenie poza-atrapa: globalny fetch do hosta spoza atrapy: example\.invalid/);
    expect(straznik().naruszenia).toEqual([]);
  });

  it('U13: d.zamknij() bez sprzątania — zwalnia trzymane blokady i odłącza połączenie (TypeError i naruszenie po-zamknieciu w atrapie)', async () => {
    const atrapa = utworzAtrapeWorkera();
    const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
    await A.blokady.trzymaj('vilda-test-blokada');
    expect((await A.blokady.query()).held).toEqual([{ name: 'vilda-test-blokada', mode: 'exclusive' }]);
    await A.zamknij();
    expect(await A.blokady.query()).toEqual({ held: [], pending: [] });
    await expect(A.polaczenie.fetch(A.adres + '/v1/health')).rejects.toThrow(TypeError);
    expect(atrapa.przyjmijNaruszenia().map((n) => [n.rodzaj, n.urzadzenie])).toEqual([['po-zamknieciu', 'A']]);
    expect(A.timery.oczekujace()).toEqual([]);
  });

  it('U14: bliźniak utworzony zaraz po zapisie karty na A ma tę kartę (migawka utrwala odłożony zapis adaptera)', async () => {
    const atrapa = utworzAtrapeWorkera();
    const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
    const k = await A.zapiszKarte(1);
    const B = await utworzUrzadzenie({ atrapa, nazwa: 'B', zBlizniaka: A });
    expect(await karty(B)).toContain(k.patientId);
    expect(await B.eksportKanoniczny()).toBe(await A.eksportKanoniczny());
  });

  it('U15: operacja uśpiona po 412 (odstęp w prawdziwym setTimeout) — cisza czeka na jej koniec, krótki limit zgłasza operację w toku', async () => {
    const s = await para();
    await zsynchronizuj(s);
    const { atrapa, A, B } = s;
    await A.zapiszKarte(2);
    expect((await A.sync.syncPush()).action).toBe('uploaded');
    await B.zapiszKarte(3);
    const brama = atrapa.wstrzymaj({ trasa: 'blob-put', urzadzenie: 'B' }, { faza: 'po' });
    const push = B.sync.syncPush(); // bez await: 412 → odstęp ~1 s → pobranie → ponowna wysyłka
    push.catch(() => {});
    expect((await brama.osiagnieta).status).toBe(412);
    brama.zwolnij();
    await expect(cisza([A, B], { limitMs: 200 })).rejects.toThrow(/operacja synchronizacji w toku: B push/);
    await sprzatnijUrzadzenia();
    expect((await push).action).toBe('uploaded');
    expect(B.rzutOsi().filter((l) => /^(start|koniec|blad) push/.test(l))).toEqual(['start push', 'koniec push uploaded']);
    expect(B.zadania().filter((z) => z.trasa === 'blob-put').map((z) => z.status)).toEqual([412, 200]);
    expect(straznik().naruszenia).toEqual([]);
  });
});
