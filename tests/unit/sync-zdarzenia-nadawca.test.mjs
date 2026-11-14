// P-SYNC-NADAWCA (E2-PR4d, plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.2 „Nadawca”, „Pętla wysyłki flushOutbox()”, „Chowanie,
// ubicie, zamrożenie”, wiersz 8d; decyzje właściciela 2026-11-11 nr 3 i 5): nadawca kolejki zdarzeń w vilda_sync.js —
// jedno okno wysyła za wszystkie karty i ramki. USPIONE: bez włączonego dziennika (VildaSync.isEventLogEnabled: „events”
// w health, flaga vilda-event-log-v1 = '1', pobieranie stronami) nic nie rusza — bez słuchaczy, zegarów, kanału, blokad
// i kluczy; pobranie jak dotąd.
//
// Prawdziwe vilda_sync.js i sejf na natywnym adapterze IndexedDB (atrapa tests/support/atrapa-indexeddb.mjs, prawdziwy
// magazyn kolejki), atrapa workera v37a z eventsEnabled. Druga karta tej samej przeglądarki i ramka z uprzęży
// (tests/support/urzadzenie-sync.mjs: karta, ramka — wspólne IndexedDB, localStorage, Web Locks i kanał
// BroadcastChannel grupy przeglądarki). Zegar okna: odcinki od 1 s w górę (odstęp wysyłki 1,5 s, bicie serca 20 s,
// odstępy po błędzie, pauza) czekają na test (odpal), krótsze biegną; fałszywy tylko Date. Ślady: atrapa VildaAuditLog.
// Dane wyłącznie FIKCYJNE.
//
// NA1 flushOutbox: POST /events z Bearer, wiersze przyjęte i usunięte, pierścień własnych zdarzeń, ślad sync.push.ok,
//     bicie serca i Web Lock na partię; pusta kolejka bez żądania; odbiorca dostaje zmiany.
// NA2 partie FIFO po 200 (kolejność wierszy = kolejność na serwerze); cykl w pobraniu wysyła jedną partię przed
//     GET /changes, resztę planuje (scheduleFlush).
// NA3 rejected: oversize i invalid → outboxReject (wiersze zostają ze stanem), ślad sync.push.rejected; wiersz bez
//     odpowiedzi wraca do pending bez próby.
// NA4 błąd sieci i serwera → próba + 1 i odstępy 2, 4, 8, 16, 30, 60, 60 s; w odstępie bez żądania; sukces zeruje.
// NA5 429 → bez próby, pauza do Retry-After (wysyłka zaplanowana na koniec pauzy), w pauzie bez żądania.
// NA6 401 → bez próby, zatrzymanie do odblokowania sejfu; NA6b 404 → koniec bez odstępu, włącznik i bramka zamknięte,
//     wiersze w locie wracają po ponownym włączeniu.
// NA7 budżet 20 żądań /events na 60 s (także keepalive) — 21. bez żądania, wysyłka zaplanowana po zwolnieniu budżetu.
// NA8 dwie karty: rola z bicia serca (inny świeży nadawca — bez wysyłki), przejęcie po 90 s (Web Lock ze steal),
//     blokada zajęta — inny nadawca; wiersze drugiej karty wysyła nadawca.
// NA9 ramka: włącznik z okna nadrzędnego, flushOutbox bez wysyłki, scheduleFlush — ping {type:'outbox'} na kanale
//     vilda-sync-data, nadawca planuje wysyłkę; wiersze ramki w tej samej bazie.
// NA10 flushKeepalive: fetch keepalive (Bearer, JSON) ≤ 60 000 B, odpowiedź jak w partii; zdarzenia hidden, pagehide,
//     freeze, blur; sendBeacon text/plain {token, events} przy wyjątku i przy odrzuceniu fetch; wiersze w locie wracają
//     przy wznowieniu (pageshow, visible) po 60 s, serwer odrzuca powtórkę po eid; sendBeacon odrzucony — wiersze
//     z powrotem; warunki pominięcia; NA10d odpowiedź bez rozstrzygnięcia i zmiana sesji przed odpowiedzią.
// NA11 cykl w pobraniu: trwająca wysyłka nie wstrzymuje drenażu; drenaż, który coś scalił — przegląd i scheduleFlush.
// NA12 wyłączony [zielony także na bazie]: flaga '0' (wyłącznik na urządzeniu) i serwer bez „events” — pobranie, zapis
//     karty i zdarzenia strony bez POST /events, kanału, zegarów nadawcy, blokady nadawcy i klucza bicia serca (do E2-PR6
//     także bez flagi). NA12b od E2-PR6 (PR włączający): bez klucza flagi nadawca działa jak przy '1'.
// NA13 eksport bez dziennika: flushOutbox, scheduleFlush, flushKeepalive → { ok: false, powod: 'wylaczone' }.
// NA14 warunki: synchronizacja wyłączona, tryb konta z wpisu rejestru inny niż lokalny, sejf zablokowany (także
//     w trakcie odczytu trybu).
// NA15 sesja: blokada w trakcie żądania — bez zapisu wyniku; po odblokowaniu wiersze w locie wracają i serwer przyjmuje
//     powtórkę (dup).
// NA16 bicie serca: wpis co 20 s, przegląd kolejki co 24 h z wysyłką.
// NA17 błąd magazynu kolejki (SYNC_DB_*) → ślad sync.queue.failed {op, code}, bez żądania.
// NA18 onBulkChange (import karty z pliku) → scheduleFlush.
// NA19 strażniki źródła.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera } from '../support/atrapa-workera-sync.mjs';
import { cisza, sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';
import { wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const FLAGA = 'vilda-event-log-v1';
const K_SYNC = 'vilda-sync-enabled-v1';
const K_BICIE = 'vilda-outbox-heartbeat-v1:';
const BLOKADA = 'vilda-outbox-sender:';
const K_WLASNE = 'vilda-sync-own-eids-v1:';
const RL = 'vilda-sync-rl-until-v1';
const KANAL = 'vilda-sync-data';
const kanalyNadawcy = (d) => d.przegladarka.utworzone.filter((k) => k.kanal === KANAL);

afterEach(async () => {
  try { await sprzatnijUrzadzenia(); } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});

const krok = (ms = 60e3) => vi.setSystemTime(Date.now() + ms);

// Zegar okna: odcinki < 1 s biegną naprawdę (odroczenia sejfu), dłuższe czekają na odpal (wysyłka, bicie serca, odstępy).
function zegarOkna() {
  const czeka = new Map();
  let nr = 1e6;
  return {
    setTimeout(fn, ms, ...a) {
      const t = Number(ms) || 0;
      if (t < 1000) return setTimeout(fn, t, ...a);
      nr += 1;
      czeka.set(nr, { id: nr, ms: t, fn: typeof fn === 'function' ? fn : () => {}, a });
      return nr;
    },
    clearTimeout(id) { if (czeka.has(id)) czeka.delete(id); else clearTimeout(id); },
    oczekujace: () => [...czeka.values()].map((t) => t.ms),
    odpal(ms) {
      const lista = [...czeka.values()].filter((t) => t.ms === ms);
      for (const t of lista) { czeka.delete(t.id); t.fn(...t.a); }
      return lista.length;
    },
    wyczysc() { czeka.clear(); },
  };
}

async function urz(s, nazwa, o = {}) {
  const zegar = zegarOkna();
  const slady = [];
  const d = await utworzUrzadzenie({
    atrapa: s.atrapa, nazwa, magazynSejfu: 'natywny', kanal: true, zdarzeniaOkna: true,
    dodatki: {
      setTimeout: zegar.setTimeout, clearTimeout: zegar.clearTimeout,
      VildaAuditLog: { log(typ, dane) { slady.push([typ, JSON.parse(JSON.stringify(dane === undefined ? null : dane))]); return Promise.resolve(); } },
    },
    ...(o.indexedDB ? { indexedDB: o.indexedDB } : {}),
    ...(o.karta ? { karta: o.karta } : {}),
    ...(o.ramka ? { ramka: o.ramka } : {}),
    ...(o.zBlizniaka ? { zBlizniaka: o.zBlizniaka } : {}),
  });
  d.zegar = zegar;
  d.slady = slady;
  d.L = d.vault._eventLog;
  d.uid = d.konto.userId;
  d.licz = async () => { const w = await d.L.outboxCount(); expect(w.ok === false ? w : 'ok', 'outboxCount').toBe('ok'); return w; };
  d.wiersze = async () => { const w = await d.L.outboxList(); expect(w.ok === false ? w : 'ok', 'outboxList').toBe('ok'); return w.wiersze; };
  d.bicie = () => JSON.parse(d.win.localStorage.getItem(K_BICIE + d.uid) || 'null');
  d.pobierz = async () => { const w = await d.sync.syncPull({ czekajNaDrenaz: true }); await cisza(s.wszystkie()); return w; };
  d.notatka = async (i) => {
    const r = await d.vault.savePatientNote({ patientId: s.P1, title: `Fikcyjna notatka ${i}`, body: `Fikcyjna treść ${i}.`, category: 'inne' });
    await d.L.emissionsSettled();
    return r;
  };
  d.zablokowaneSender = () => d.blokady.zadania.filter((z) => z.nazwa === BLOKADA + d.uid);
  s.lista.push(d);
  return d;
}
// Świat: A (natywny, nowe konto, karta 1, rejestracja pełną wysyłką przy zamkniętej bramce), potem flaga '1' (o.flaga),
// synchronizacja włączona (o.synchronizacja), detectApi i pierwsze pobranie (kursor 0 → legacy). Kolejka pusta.
async function swiat(o = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: o.events !== false, zegar: () => Date.now(), ...(o.atrapa || {}) });
  const s = { atrapa, lista: [] };
  s.wszystkie = () => s.lista;
  const A = await urz(s, 'A', { indexedDB: utworzIndexedDB() });
  s.P1 = (await A.zapiszKarte(1)).patientId;
  expect((await A.sync.syncPush()).action).toBe('registered');
  await cisza(s.wszystkie());
  const flaga = o.flaga === undefined ? '1' : o.flaga;
  if (flaga !== null) A.win.localStorage.setItem(FLAGA, flaga);
  if (o.synchronizacja !== false) A.win.localStorage.setItem(K_SYNC, 'true');
  await A.sync.detectApi();
  if (o.odbiorca) {
    s.B = await urz(s, 'B', { zBlizniaka: A });
    if (flaga !== null) s.B.win.localStorage.setItem(FLAGA, flaga);
    await s.B.sync.detectApi();
    expect((await s.B.sync.syncPull({ pierwszePobranie: true })).action).toBe('merged');
    await cisza(s.wszystkie());
  }
  krok(1000);
  await A.pobierz();
  if (flaga !== '0' && o.events !== false) {
    expect(A.sync.isEventLogEnabled(), 'świat: dziennik włączony').toBe(true);
    expect((await A.licz()).total, 'świat: kolejka pusta').toBe(0);
  }
  A.slady.length = 0;
  Object.assign(s, { A });
  return s;
}
const zEvents = (s, u) => s.atrapa.zadania.filter((z) => z.trasa === 'events' && (!u || z.urzadzenie === u));
const zChanges = (s, u) => s.atrapa.zadania.filter((z) => z.trasa === 'changes' && (!u || z.urzadzenie === u));
const tekst = (c) => (typeof c === 'string' ? c : Buffer.from(c).toString('utf8'));
// Ciała POST /events (fetch strony) w kolejności — eidy partii.
function podsluchEvents() {
  const ciala = [];
  const dalej = globalThis.fetch;
  vi.stubGlobal('fetch', (u, i) => {
    if (/\/events$/.test(String(u)) && i && typeof i.body === 'string') ciala.push({ keepalive: !!i.keepalive, eidy: JSON.parse(i.body).events.map((e) => e.eid) });
    return dalej(u, i);
  });
  return ciala;
}
async function czekajAz(f, opis, n = 5000) {
  for (let i = 0; i < n; i += 1) { if (await f()) return; await new Promise((r) => { setImmediate(r); }); }
  throw new Error('czekajAz: ' + opis);
}

describe('P-SYNC-NADAWCA — pętla wysyłki flushOutbox (E2-PR4d)', () => {
  it('NA1 [czerwony na bazie]: flushOutbox — POST /events z Bearer, wiersze przyjęte i usunięte, pierścień własnych zdarzeń, ślad sync.push.ok, bicie serca i Web Lock na partię; pusta kolejka bez żądania; odbiorca dostaje zmiany', async () => {
    const s = await swiat({ odbiorca: true });
    const { A } = s;
    krok();
    const k2 = await A.zapiszKarte(2);
    await A.notatka(1);
    const przed = await A.wiersze();
    expect(przed.map((r) => r.state)).toEqual(przed.map(() => 'pending'));
    const blokadyOd = A.zablokowaneSender().length;
    const w = await A.sync.flushOutbox();
    expect(w).toMatchObject({ ok: true, powod: null, partie: 1, wyslane: przed.length, odrzucone: 0, kod: null });
    const z = zEvents(s, 'A');
    expect(z.map((x) => `${x.metoda} ${x.status} ${x.naglowki.autoryzacja}`)).toEqual(['POST 200 bearer']);
    expect((await A.licz()).total, 'kolejka pusta').toBe(0);
    const head = s.atrapa.slot(A.slotId).dz.head;
    expect(A.slady).toEqual([['sync.push.ok', { rows: przed.length, bytes: expect.any(Number), seq: head }]]);
    expect(A.slady[0][1].bytes).toBeGreaterThan(0);
    expect(JSON.parse(A.win.localStorage.getItem(K_WLASNE + A.slotId)).slice(-przed.length), 'pierścień własnych').toEqual(przed.map((r) => r.eid));
    expect(A.bicie()).toEqual({ d: expect.any(String), t: Date.now() });
    expect(A.zablokowaneSender().slice(blokadyOd).map((x) => [x.tryb, x.ifAvailable, x.steal, x.wynik]), 'jedna partia niepełna — jedna blokada').toEqual([['exclusive', true, false, 'przyznana']]);
    // pusta kolejka — bez żądania
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true, powod: null, partie: 0, wyslane: 0 });
    expect(zEvents(s, 'A')).toHaveLength(1);
    // odbiorca (bliźniak sprzed zmian; kursor 0 — rozruch legacy jak dotąd) dostaje kartę 2 i notatkę
    await s.B.pobierz();
    expect((await s.B.vault.getPatient(k2.patientId)).patientId).toBe(k2.patientId);
    expect((await s.B.vault.listPatientNotesForPatient(s.P1)).map((n) => n.title)).toEqual(['Fikcyjna notatka 1']);
  });

  it('NA2 [czerwony na bazie]: partie FIFO po 200 (kolejność wierszy = kolejność wysyłki); cykl w pobraniu wysyła jedną partię przed GET /changes, resztę planuje scheduleFlush', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    for (let i = 1; i <= 201; i += 1) await A.vault.savePatientNote({ patientId: s.P1, title: `Fikcyjna notatka ${i}`, body: 'Fikcyjna treść.', category: 'inne' });
    await A.L.emissionsSettled();
    const lista = (await A.wiersze()).map((r) => r.eid);
    expect(lista).toHaveLength(201);
    const ciala = podsluchEvents();
    const od = s.atrapa.zadania.length;
    await A.pobierz();
    const trasy = s.atrapa.zadania.slice(od).filter((z) => z.urzadzenie === 'A').map((z) => z.trasa);
    expect(trasy.indexOf('events'), 'POST /events przed GET /changes').toBeLessThan(trasy.indexOf('changes'));
    expect(trasy.filter((t) => t === 'events'), 'w cyklu jedna partia').toHaveLength(1);
    expect(ciala.map((c) => c.eidy.length)).toEqual([200]);
    expect((await A.licz()).pending).toBe(1);
    expect(A.zegar.oczekujace(), 'reszta zaplanowana (1,5 s)').toContain(1500);
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'reszta wysłana');
    expect(ciala.map((c) => c.eidy.length)).toEqual([200, 1]);
    expect(ciala.flatMap((c) => c.eidy), 'FIFO').toEqual(lista);
  }, 60_000);

  it('NA3 [czerwony na bazie]: rejected oversize i invalid → outboxReject (wiersze zostają ze stanem), ślad sync.push.rejected; wiersz bez odpowiedzi wraca do pending bez próby', async () => {
    const s = await swiat({ atrapa: { limity: { eventBytes: 4000 } } });
    const { A } = s;
    krok();
    await A.notatka(1);
    await A.vault.savePatientNote({ patientId: s.P1, title: 'Fikcyjna długa', body: 'Fikcyjna treść. '.repeat(400), category: 'inne' });
    await A.notatka(2);
    await A.notatka(3);
    const [r1, duzy, r2, r3] = await A.wiersze();
    s.atrapa.usterka({ gdy: { trasa: 'events' }, zmien: (o) => {
      const c = JSON.parse(tekst(o.cialo));
      c.accepted = c.accepted.filter((a) => a.eid === r1.eid);
      c.rejected = [...c.rejected, { eid: r2.eid, code: 'invalid' }];
      return { ...o, cialo: JSON.stringify(c) };
    } });
    const w = await A.sync.flushOutbox();
    expect(w).toMatchObject({ ok: true, partie: 1, wyslane: 1, odrzucone: 2 });
    const st = Object.fromEntries((await A.wiersze()).map((r) => [r.eid, [r.state, r.attempts, r.lastError]]));
    expect(st).toEqual({ [duzy.eid]: ['oversize', 0, 'oversize'], [r2.eid]: ['rejected', 0, 'invalid'], [r3.eid]: ['pending', 0, 'NO_RESULT'] });
    expect(A.slady).toEqual([
      ['sync.push.ok', { rows: 1, bytes: expect.any(Number), seq: expect.any(Number) }],
      ['sync.push.rejected', { oversize: 1, invalid: 1 }],
    ]);
  });

  it('NA4 [czerwony na bazie]: błąd serwera i sieci → próba + 1 i odstępy 2, 4, 8, 16, 30, 60, 60 s; w odstępie bez żądania; sukces zeruje odstęp', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    s.atrapa.usterka({ gdy: { trasa: 'events', ile: 7 }, kod: 'hub_unavailable' });
    const kroki = [];
    for (let i = 0; i < 7; i += 1) {
      const n = zEvents(s, 'A').length;
      const w = await A.sync.flushOutbox();
      expect(w, `próba ${i + 1}`).toMatchObject({ ok: false, powod: 'odstep', kod: 'SERVER' });
      expect(zEvents(s, 'A')).toHaveLength(n + 1);
      if (i === 0) expect(A.zegar.oczekujace(), 'ponowienie zaplanowane').toContain(2000);
      kroki.push(w.ponowZaMs);
      krok(w.ponowZaMs - 1);
      expect(await A.sync.flushOutbox(), 'w odstępie').toMatchObject({ ok: false, powod: 'odstep' });
      expect(zEvents(s, 'A'), 'w odstępie bez żądania').toHaveLength(n + 1);
      krok(1);
    }
    expect(kroki).toEqual([2000, 4000, 8000, 16000, 30000, 60000, 60000]);
    expect((await A.wiersze()).map((r) => [r.state, r.attempts, r.lastError])).toEqual([['pending', 7, 'SERVER']]);
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true, partie: 1, wyslane: 1 });
    await A.notatka(2);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, siec: true });
    const w = await A.sync.flushOutbox();
    expect(w, 'po sukcesie od 2 s; sieć jak serwer').toMatchObject({ ok: false, powod: 'odstep', ponowZaMs: 2000 });
    expect((await A.wiersze()).map((r) => [r.state, r.attempts])).toEqual([['pending', 1]]);
  });

  it('NA5 [czerwony na bazie]: 429 → bez próby, pauza do Retry-After (wysyłka zaplanowana na koniec pauzy), w pauzie bez żądania', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, kod: 'rate_limited' });
    const w = await A.sync.flushOutbox();
    expect(w).toMatchObject({ ok: false, powod: 'pauza', kod: 'RATE_LIMITED' });
    expect(w.ponowZaMs).toBeGreaterThanOrEqual(1000);
    expect(Number(A.win.localStorage.getItem(RL))).toBe(Date.now() + w.ponowZaMs);
    expect(A.zegar.oczekujace()).toContain(w.ponowZaMs);
    expect((await A.wiersze()).map((r) => [r.state, r.attempts, r.lastError])).toEqual([['pending', 0, 'RATE_LIMITED']]);
    const n = zEvents(s, 'A').length;
    const r0 = await A.wiersze();
    krok(500);
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'pauza', kod: 'RATE_LIMITED', ponowZaMs: w.ponowZaMs - 500 });
    expect(await A.sync.flushKeepalive(), 'keepalive w pauzie').toMatchObject({ ok: false, powod: 'pauza' });
    expect(zEvents(s, 'A'), 'w pauzie bez żądania').toHaveLength(n);
    expect(await A.wiersze(), 'w pauzie bez pobrania wierszy').toEqual(r0);
    krok(w.ponowZaMs - 500);
    expect(A.zegar.oczekujace(), 'plan przestawiony na koniec pauzy').toContain(w.ponowZaMs - 500);
    A.zegar.odpal(w.ponowZaMs - 500);
    expect(A.zegar.oczekujace()).toContain(1500);
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'wysłane po pauzie');
    expect(zEvents(s, 'A').at(-1).status).toBe(200);
  });

  it('NA6 [czerwony na bazie]: 401 → bez próby, zatrzymanie do odblokowania sejfu', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, zmien: (o) => ({ ...o, status: 401, cialo: JSON.stringify({ error: { code: 'invalid_credentials' } }) }) });
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'zatrzymany', kod: 'AUTH_FAILED' });
    const r = await A.wiersze();
    expect(r.map((x) => [x.state, x.attempts, x.lastError])).toEqual([['pending', 0, 'AUTH_FAILED']]);
    const n = zEvents(s, 'A').length;
    krok();
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'zatrzymany' });
    expect(zEvents(s, 'A')).toHaveLength(n);
    expect((await A.wiersze())[0].lastAttemptAtISO, 'bez pobrania wierszy').toBe(r[0].lastAttemptAtISO);
    await A.zablokuj();
    await A.odblokuj();
    // po odblokowaniu bez zatrzymania; 401 wyczyścił stan slotu (jak inne 401) — wysyłka czeka na rejestrację
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'niezarejestrowany' });
    expect(zEvents(s, 'A')).toHaveLength(n);
  });

  it('NA6b [czerwony na bazie]: 404 (zdarzenia wyłączone na serwerze) → koniec bez odstępu; włącznik i bramka sejfu zamknięte, więc wiersze zostają w locie i wracają po ponownym włączeniu (ponad 60 s)', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, zmien: (o) => ({ ...o, status: 404, cialo: JSON.stringify({ error: { code: 'not_found' } }) }) });
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'wylaczone', kod: 'EVENTS_DISABLED' });
    expect(A.sync.isEventLogEnabled()).toBe(false);
    A.win.VILDA_EVENT_LOG = true; // bramka sejfu zamknięta razem z włącznikiem — odczyt kolejki tylko do sprawdzenia
    expect((await A.wiersze()).map((r) => [r.state, r.attempts]), 'zwrot odrzucony przez zamkniętą bramkę').toEqual([['inflight', 0]]);
    delete A.win.VILDA_EVENT_LOG;
    expect(A.zegar.oczekujace().filter((ms) => ms !== 20000 && ms >= 1000 && ms <= 60000), 'bez planu ponowienia').toEqual([]);
    expect(await A.sync.flushOutbox(), 'po 404 bez dziennika').toMatchObject({ ok: false, powod: 'wylaczone' });
    krok(11 * 60e3); // pamięć health 10 min
    await A.sync.detectApi();
    expect(A.sync.isEventLogEnabled(), 'następny health z „events” otwiera włącznik').toBe(true);
    expect(await A.sync.flushOutbox(), 'wiersz z lotu wysłany').toMatchObject({ ok: true, wyslane: 1 });
    expect((await A.licz()).total).toBe(0);
  });

  it('NA7 [czerwony na bazie]: budżet 20 żądań /events na 60 s (także keepalive) — 21. bez żądania, wysyłka zaplanowana po zwolnieniu budżetu', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    const n0 = zEvents(s, 'A').length;
    for (let i = 1; i <= 19; i += 1) {
      await A.notatka(i);
      expect(await A.sync.flushOutbox(), `wysyłka ${i}`).toMatchObject({ ok: true, partie: 1 });
      krok(1000);
    }
    await A.notatka(20);
    expect(await A.sync.flushKeepalive(), 'keepalive — dwudzieste żądanie').toMatchObject({ ok: true, sposob: 'fetch' });
    await czekajAz(async () => (await A.licz()).total === 0, 'keepalive przyjęty');
    krok(1000);
    expect(zEvents(s, 'A')).toHaveLength(n0 + 20);
    await A.notatka(21);
    const w = await A.sync.flushOutbox();
    expect(w).toMatchObject({ ok: false, powod: 'budzet' });
    expect(w.ponowZaMs).toBe(60000 - 20000);
    expect(await A.sync.flushKeepalive()).toMatchObject({ ok: false, powod: 'budzet' });
    expect(zEvents(s, 'A')).toHaveLength(n0 + 20);
    expect((await A.wiersze()).map((r) => [r.state, r.attempts])).toEqual([['pending', 0]]);
    expect(A.zegar.oczekujace()).toContain(w.ponowZaMs);
    krok(w.ponowZaMs);
    A.zegar.odpal(w.ponowZaMs);
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'wysłane po zwolnieniu budżetu');
    expect(zEvents(s, 'A')).toHaveLength(n0 + 21);
  }, 60_000);
});

describe('P-SYNC-NADAWCA — jeden nadawca na konto w przeglądarce (karty i ramki)', () => {
  it('NA8 [czerwony na bazie]: dwie karty — inny świeży nadawca: bez wysyłki; przejęcie po 90 s (Web Lock ze steal); blokada zajęta — inny nadawca; wiersze drugiej karty wysyła nadawca', async () => {
    const s = await swiat();
    const { A } = s;
    const A2 = await urz(s, 'A2', { karta: A });
    expect(A2.win.localStorage).toBe(A.win.localStorage);
    expect(A2.indexedDB).toBe(A.indexedDB);
    expect(A2.blokady).toBe(A.blokady);
    await A2.sync.detectApi();
    expect(A2.sync.isEventLogEnabled()).toBe(true);
    krok();
    await A.notatka(1);
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true, partie: 1 });
    const bA = A.bicie();
    await A2.notatka(2);
    expect(await A2.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'inny-nadawca' });
    expect(zEvents(s, 'A2')).toEqual([]);
    expect((await A.wiersze()).map((r) => [r.state, r.attempts])).toEqual([['pending', 0]]);
    expect(await A.sync.flushOutbox(), 'nadawca wysyła wiersz drugiej karty').toMatchObject({ ok: true, wyslane: 1 });
    krok(91e3);
    await A2.notatka(3);
    const od = A.blokady.zadania.length;
    expect(await A2.sync.flushOutbox(), 'przejęcie').toMatchObject({ ok: true, wyslane: 1 });
    expect(A.blokady.zadania.slice(od).filter((z) => z.nazwa === BLOKADA + A.uid).map((z) => [z.steal, z.ifAvailable, z.wynik])).toEqual([[true, false, 'kradziez']]);
    expect(A2.bicie().d).not.toBe(bA.d);
    await A.notatka(4);
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'inny-nadawca' });
    // bicie serca A przy świeżym biciu A2 — bez wpisu i bez planu; po 90 s ciszy A2 — bez wpisu (zapisze go partia pod
    // blokadą ze steal), wysyłka zaplanowana i przejęcie
    const bA2 = A2.bicie();
    A.zegar.odpal(20000);
    expect(A.bicie()).toEqual(bA2);
    expect(A.zegar.oczekujace()).not.toContain(1500);
    krok(91e3);
    A.zegar.odpal(20000);
    expect(A.bicie(), 'zegar nie przejmuje bez blokady').toEqual(bA2);
    expect(A.zegar.oczekujace()).toContain(1500);
    const od2 = A.blokady.zadania.length;
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'przejęcie przez zaplanowaną wysyłkę');
    expect(A.blokady.zadania.slice(od2).filter((z) => z.nazwa === BLOKADA + A.uid).map((z) => [z.steal, z.wynik])).toEqual([[true, 'kradziez']]);
    expect(A.bicie().d).toBe(bA.d);
    // bez bicia serca, blokada zajęta (inna karta w trakcie partii) — inny nadawca
    A.win.localStorage.removeItem(K_BICIE + A.uid);
    await A.notatka(5);
    const h = await A.blokady.trzymaj(BLOKADA + A.uid);
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'inny-nadawca' });
    await h.zwolnij();
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true, wyslane: 1 });
    expect(zEvents(s, 'A2')).toHaveLength(1);
  });

  it('NA9 [czerwony na bazie]: ramka — włącznik z okna nadrzędnego, flushOutbox bez wysyłki, scheduleFlush = ping {type:"outbox"} na vilda-sync-data, nadawca planuje wysyłkę; wiersze ramki w tej samej bazie', async () => {
    const s = await swiat();
    const { A } = s;
    const F = await urz(s, 'F', { ramka: A });
    expect(F.win.top).toBe(A.win);
    expect(F.win.sessionStorage).toBe(A.win.sessionStorage);
    expect(F.sync.isEventLogEnabled(), 'włącznik okna nadrzędnego (bez health w ramce)').toBe(true);
    expect(s.atrapa.zadania.filter((z) => z.urzadzenie === 'F' && z.trasa === 'health')).toEqual([]);
    const prawdziwy = A.win.VildaSync;
    A.win.VildaSync = { isEventLogEnabled: () => false };
    expect(F.sync.isEventLogEnabled()).toBe(false);
    A.win.VildaSync = { isEventLogEnabled: () => { throw new Error('x'); } };
    expect(F.sync.isEventLogEnabled()).toBe(false);
    A.win.VildaSync = prawdziwy;
    expect(await F.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'ramka' });
    expect(await F.sync.flushKeepalive()).toMatchObject({ ok: false, powod: 'wylaczone' });
    krok();
    await F.notatka(1);
    expect((await A.licz()).pending, 'wiersz ramki w bazie konta').toBe(1);
    const od = A.przegladarka.kanaly.length;
    expect(F.sync.scheduleFlush()).toEqual({ ok: true, powod: 'ramka' });
    expect(F.zegar.oczekujace().filter((ms) => ms === 1500 || ms === 20000), 'ramka bez zegarów nadawcy').toEqual([]);
    expect(A.przegladarka.kanaly.slice(od)).toEqual([{ kanal: 'vilda-sync-data', od: 'F', data: { type: 'outbox' } }]);
    await czekajAz(() => A.zegar.oczekujace().includes(1500), 'nadawca planuje wysyłkę po pingu ramki');
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'nadawca wysłał wiersz ramki');
    expect(zEvents(s, 'F')).toEqual([]);
    expect(zEvents(s, 'A').at(-1).status).toBe(200);
  });
});

describe('P-SYNC-NADAWCA — chowanie strony: flushKeepalive', () => {
  it('NA10 [czerwony na bazie]: fetch keepalive (Bearer, JSON) ≤ 60 000 B, odpowiedź jak w partii; zdarzenia hidden, pagehide, freeze, blur', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    await A.notatka(2);
    const n = (await A.licz()).pending;
    const ciala = podsluchEvents();
    const w = await A.sync.flushKeepalive();
    expect(w).toMatchObject({ ok: true, powod: null, sposob: 'fetch', wiersze: n });
    expect(w.bytes).toBeGreaterThan(0);
    expect(w.bytes).toBeLessThanOrEqual(60000);
    await czekajAz(async () => (await A.licz()).total === 0, 'odpowiedź keepalive przyjęta');
    const z = zEvents(s, 'A').at(-1);
    expect([z.metoda, z.status, z.naglowki.autoryzacja, z.keepalive]).toEqual(['POST', 200, 'bearer', true]);
    expect(ciala.map((c) => c.keepalive)).toEqual([true]);
    expect(JSON.parse(A.win.localStorage.getItem(K_WLASNE + A.slotId)).slice(-n), 'pierścień własnych').toEqual(ciala[0].eidy);
    const zdarzenia = [
      ['visibilitychange hidden', () => A.zdarzenieDokumentu('visibilitychange', { visibilityState: 'hidden' })],
      ['pagehide', () => A.zdarzenieOkna('pagehide')],
      ['freeze', () => A.zdarzenieDokumentu('freeze')],
      ['blur', () => A.zdarzenieOkna('blur')],
    ];
    for (const [nazwa, f] of zdarzenia) {
      krok(1000);
      await A.notatka(nazwa);
      const przed = zEvents(s, 'A').length;
      f();
      await czekajAz(async () => (await A.licz()).total === 0, nazwa);
      expect(zEvents(s, 'A'), nazwa).toHaveLength(przed + 1);
      expect(zEvents(s, 'A').at(-1).keepalive, nazwa).toBe(true);
    }
  });

  it('NA10b [czerwony na bazie]: sendBeacon text/plain {token, events} przy wyjątku fetch i przy odrzuceniu fetch; wiersze w locie wracają przy wznowieniu po 60 s, serwer odrzuca powtórkę po eid; beacon odrzucony — wiersze z powrotem', async () => {
    const s = await swiat();
    const { A } = s;
    const dalej = globalThis.fetch;
    let tryb = 'wyjatek';
    vi.stubGlobal('fetch', (u, i) => {
      if (i && i.keepalive && /\/events$/.test(String(u))) {
        if (tryb === 'wyjatek') throw new TypeError('atrapa: keepalive niedostępny');
        return Promise.reject(new TypeError('atrapa: keepalive ponad limit'));
      }
      return dalej(u, i);
    });
    krok();
    await A.notatka(1);
    const w = await A.sync.flushKeepalive();
    expect(w).toMatchObject({ ok: true, sposob: 'beacon', wiersze: 1 });
    const beacony = () => s.atrapa.zadania.filter((z) => z.urzadzenie === 'A' && z.transport === 'beacon');
    await cisza(s.wszystkie());
    expect(beacony().map((b) => [b.trasa, b.tokenWCiele, b.status])).toEqual([['events', 'zgodny', 200]]);
    expect((await A.licz()).inflight, 'odpowiedź beaconu niewidoczna — wiersz w locie').toBe(1);
    const head = s.atrapa.slot(A.slotId).dz.head;
    krok(61e3);
    A.zdarzenieOkna('pageshow');
    await czekajAz(() => A.zegar.oczekujace().includes(1500), 'wznowienie planuje wysyłkę');
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'powtórka przyjęta');
    expect(s.atrapa.slot(A.slotId).dz.head, 'serwer odrzucił powtórkę po eid').toBe(head);
    // odrzucenie obietnicy fetch (np. limit keepalive) — beacon w obsłudze odrzucenia
    tryb = 'odrzucenie';
    krok(1000);
    await A.notatka(2);
    expect(await A.sync.flushKeepalive()).toMatchObject({ ok: true, sposob: 'fetch' });
    await czekajAz(() => beacony().length === 2, 'beacon po odrzuceniu fetch');
    // beacon odrzucony — wiersze z powrotem do pending bez próby
    tryb = 'wyjatek';
    A.win.navigator.sendBeacon = () => false;
    krok(61e3);
    await A.L.outboxRequeueStale();
    await A.notatka(3);
    expect(await A.sync.flushKeepalive()).toMatchObject({ ok: false, powod: 'beacon' });
    expect((await A.wiersze()).map((r) => [r.state, r.attempts, r.lastError])).toEqual([['pending', 0, 'BEACON_FAILED'], ['pending', 0, 'BEACON_FAILED']]);
  });

  it('NA10c [czerwony na bazie]: flushKeepalive pomija: trwająca wysyłka, inny nadawca, dokument bez wysyłki (brak materiału), wiersz ponad 60 000 B; wznowienie (visible) zwraca wiersze w locie', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    const brama = s.atrapa.wstrzymaj({ trasa: 'events' });
    const p = A.sync.flushOutbox();
    await brama.osiagnieta;
    expect(await A.sync.flushKeepalive(), 'trwająca wysyłka').toMatchObject({ ok: false, powod: 'pomin' });
    brama.zwolnij();
    brama.rozbroj();
    expect(await p).toMatchObject({ ok: true });
    const A2 = await urz(s, 'A2', { karta: A });
    await A2.sync.detectApi();
    await A2.notatka(2);
    expect(await A2.sync.flushKeepalive(), 'dokument bez wysyłki — bez materiału').toMatchObject({ ok: false, powod: 'pomin' });
    expect(await A2.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'inny-nadawca' });
    expect(await A2.sync.flushKeepalive(), 'inny nadawca').toMatchObject({ ok: false, powod: 'pomin' });
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true });
    await A.vault.savePatientNote({ patientId: s.P1, title: 'Fikcyjna długa', body: 'Fikcyjna treść. '.repeat(4000), category: 'inne' });
    await A.L.emissionsSettled();
    expect(await A.sync.flushKeepalive(), 'wiersz ponad 60 000 B').toMatchObject({ ok: false, powod: 'pusto' });
    expect((await A.wiersze()).map((r) => r.state)).toEqual(['pending']);
    // wiersz w locie (odpowiedź wisi) → visible po 60 s: z powrotem i wysyłka
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true });
    await A.notatka(3);
    const b2 = s.atrapa.wstrzymaj({ trasa: 'events' }, { faza: 'po' });
    expect(await A.sync.flushKeepalive()).toMatchObject({ ok: true, sposob: 'fetch' });
    await b2.osiagnieta;
    krok(61e3);
    A.zdarzenieDokumentu('visibilitychange', { visibilityState: 'visible' });
    await czekajAz(async () => (await A.licz()).pending === 1, 'wiersz z lotu do pending');
    b2.zwolnij();
    b2.rozbroj();
    await czekajAz(async () => (await A.licz()).total === 0, 'odpowiedź keepalive (dup po powrocie) przyjęta');
    // w locie najwyżej 65 536 B na dokument: wiersz ponad połowę limitu w locie (odpowiedź wisi), po 60 s z powrotem —
    // drugi keepalive tego samego wiersza przekroczyłby limit: wiersz z powrotem do pending bez próby
    await A.vault.savePatientNote({ patientId: s.P1, title: 'Fikcyjna średnia', body: 'Fikcyjna treść. '.repeat(1800), category: 'inne' });
    await A.L.emissionsSettled();
    const b3 = s.atrapa.wstrzymaj({ trasa: 'events' }, { faza: 'po' });
    const k1 = await A.sync.flushKeepalive();
    expect(k1).toMatchObject({ ok: true, sposob: 'fetch' });
    expect(k1.bytes).toBeGreaterThan(65536 / 2);
    await b3.osiagnieta;
    krok(61e3);
    await A.L.outboxRequeueStale();
    expect(await A.sync.flushKeepalive(), 'ponad 65 536 B w locie').toMatchObject({ ok: false, powod: 'limit' });
    expect((await A.wiersze()).map((r) => [r.state, r.attempts, r.lastError])).toEqual([['pending', 0, 'KEEPALIVE_LIMIT']]);
    b3.zwolnij();
    b3.rozbroj();
    await czekajAz(async () => (await A.licz()).total === 0, 'odpowiedź pierwszego keepalive przyjęta');
  });
});

describe('P-SYNC-NADAWCA — odpowiedź flushKeepalive', () => {
  it('NA10d [czerwony na bazie]: odpowiedź bez rozstrzygnięcia (503) — wiersze z powrotem do pending bez próby; zmiana sesji przed odpowiedzią — bez zapisu wyniku i pierścienia', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, kod: 'hub_unavailable' });
    expect(await A.sync.flushKeepalive()).toMatchObject({ ok: true, sposob: 'fetch' });
    await czekajAz(async () => (await A.licz()).pending === 1, 'wiersz z powrotem');
    expect((await A.wiersze()).map((r) => [r.state, r.attempts, r.lastError])).toEqual([['pending', 0, 'KEEPALIVE']]);
    // blokada sejfu, zanim dojdzie odpowiedź: bez outboxAccept i bez pierścienia własnych
    const [r] = await A.wiersze();
    const pierscien = A.win.localStorage.getItem(K_WLASNE + A.slotId);
    const brama = s.atrapa.wstrzymaj({ trasa: 'events' }, { faza: 'po' });
    krok(1000);
    expect(await A.sync.flushKeepalive()).toMatchObject({ ok: true, sposob: 'fetch' });
    await brama.osiagnieta;
    await A.zablokuj();
    brama.zwolnij();
    brama.rozbroj();
    await cisza(s.wszystkie());
    expect(A.win.localStorage.getItem(K_WLASNE + A.slotId), 'pierścień bez zmian').toBe(pierscien);
    await A.odblokuj();
    await A.L.emissionsSettled();
    expect((await A.wiersze()).find((x) => x.eid === r.eid), 'wiersz w locie, nie usunięty').toMatchObject({ state: 'inflight' });
  });
});

describe('P-SYNC-NADAWCA — cykl w pobraniu i uśpienie', () => {
  it('NA11 [czerwony na bazie]: trwająca wysyłka nie wstrzymuje drenażu; drenaż, który coś scalił — przegląd i scheduleFlush; bez scalenia bez planu', async () => {
    const s = await swiat({ odbiorca: true });
    const { A, B } = s;
    krok();
    await A.notatka(1);
    const brama = s.atrapa.wstrzymaj({ trasa: 'events' });
    const p = A.sync.flushOutbox();
    await brama.osiagnieta;
    const odCh = zChanges(s, 'A').length;
    await A.sync.syncPull({ czekajNaDrenaz: true });
    expect(zChanges(s, 'A').length, 'drenaż mimo trwającej wysyłki').toBeGreaterThan(odCh);
    expect(zEvents(s, 'A').at(-1).status, 'POST /events nadal w toku').toBeNull();
    brama.zwolnij();
    brama.rozbroj();
    expect(await p).toMatchObject({ ok: true, wyslane: 1 });
    await A.pobierz(); // kursor 0 → rozruch legacy (jak dotąd), potem drenaż stronami
    expect(A.zegar.oczekujace(), 'drenaż bez scalenia — bez planu').not.toContain(1500);
    // B wysyła notatkę (pushEvents z kolejki B), A pobiera i scala → przegląd i scheduleFlush
    B.win.localStorage.setItem(K_SYNC, 'true');
    krok();
    await B.notatka(2);
    expect(await B.sync.flushOutbox()).toMatchObject({ ok: true, wyslane: 1 });
    const w = await A.pobierz();
    expect(w.drain).toMatchObject({ dziennik: true, zastosowane: 1 });
    expect(A.zegar.oczekujace(), 'po scaleniu — scheduleFlush').toContain(1500);
  });

  it('NA12 [zielony także na bazie]: wyłączony — flaga „0” i serwer bez „events”: pobranie, zapis karty i zdarzenia strony bez POST /events, kanału, zegarów nadawcy, blokady nadawcy i klucza bicia serca', async () => {
    for (const o of [{ flaga: '0' }, { events: false }, { events: false, flaga: null }]) {
      const s = await swiat(o);
      const { A } = s;
      krok();
      await A.zapiszKarte(2);
      await A.vault.savePatientNote({ patientId: s.P1, title: 'Fikcyjna', body: 'Fikcyjna treść.', category: 'inne' });
      await A.pobierz();
      A.zdarzenieDokumentu('visibilitychange', { visibilityState: 'hidden' });
      A.zdarzenieDokumentu('freeze');
      A.zdarzenieOkna('pagehide');
      A.zdarzenieOkna('blur');
      A.zdarzenieOkna('pageshow');
      A.zdarzenieDokumentu('visibilitychange', { visibilityState: 'visible' });
      await cisza(s.wszystkie());
      const opis = JSON.stringify(o);
      expect(zEvents(s), opis).toEqual([]);
      expect(kanalyNadawcy(A), opis + ': kanał').toEqual([]);
      expect(A.przegladarka.kanaly.filter((k) => k.kanal === KANAL), opis).toEqual([]);
      expect(A.zegar.oczekujace().filter((ms) => ms === 1500 || ms === 20000), opis + ': zegary nadawcy').toEqual([]);
      expect(A.blokady.zadania.filter((z) => z.nazwa.startsWith(BLOKADA)), opis + ': blokada nadawcy').toEqual([]);
      expect(A.win.localStorage.klucze().filter((k) => k.startsWith(K_BICIE)), opis + ': bicie serca').toEqual([]);
      await sprzatnijUrzadzenia();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('NA12b [E2-PR6: czerwony na bazie]: bez klucza flagi (domyślnie od PR włączającego) — zapis karty i notatki idzie POST /events z Bearer, kolejka pusta, odbiorca bez klucza flagi dostaje zmiany', async () => {
    const s = await swiat({ flaga: null, odbiorca: true });
    const { A } = s;
    expect(A.win.localStorage.getItem(FLAGA), 'bez klucza flagi').toBe(null);
    expect(A.sync.isEventLogEnabled()).toBe(true);
    krok();
    const k2 = await A.zapiszKarte(2);
    await A.notatka(1);
    const przed = await A.wiersze();
    expect(przed.length).toBeGreaterThan(0);
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true, powod: null, partie: 1, wyslane: przed.length, odrzucone: 0 });
    expect(zEvents(s, 'A').map((x) => `${x.metoda} ${x.status} ${x.naglowki.autoryzacja}`)).toEqual(['POST 200 bearer']);
    expect((await A.licz()).total, 'kolejka pusta').toBe(0);
    await s.B.pobierz();
    expect(s.B.sync.isEventLogEnabled(), 'odbiorca bez klucza flagi — dziennik włączony').toBe(true);
    expect((await s.B.vault.getPatient(k2.patientId)).patientId).toBe(k2.patientId);
  });

  it('NA13 [czerwony na bazie]: eksport bez dziennika — flushOutbox, scheduleFlush, flushKeepalive → { ok: false, powod: "wylaczone" } bez aktywacji', async () => {
    for (const o of [{ flaga: '0' }, { events: false }, { events: false, flaga: null }]) {
      const s = await swiat(o);
      const { A } = s;
      const opis = JSON.stringify(o);
      expect(await A.sync.flushOutbox(), opis).toEqual({ ok: false, powod: 'wylaczone', partie: 0, wyslane: 0, odrzucone: 0, kod: null });
      expect(A.sync.scheduleFlush(), opis).toEqual({ ok: false, powod: 'wylaczone' });
      expect(await A.sync.flushKeepalive(), opis).toEqual({ ok: false, powod: 'wylaczone' });
      expect(kanalyNadawcy(A), opis).toEqual([]);
      expect(A.zegar.oczekujace().filter((ms) => ms === 1500 || ms === 20000), opis).toEqual([]);
      await sprzatnijUrzadzenia();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('NA14 [czerwony na bazie]: warunki — synchronizacja wyłączona (włącznik integracji wygrywa z kluczem), tryb konta z wpisu rejestru inny niż lokalny, sejf zablokowany: bez pobrania wierszy i bez żądania', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    const r0 = await A.wiersze();
    const n = zEvents(s, 'A').length;
    A.win.localStorage.setItem(K_SYNC, 'false');
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'synchronizacja-wylaczona' });
    A.win.VildaSyncIntegration = { isSyncEnabled: () => false };
    A.win.localStorage.setItem(K_SYNC, 'true');
    expect(await A.sync.flushOutbox(), 'integracja wygrywa z kluczem').toMatchObject({ ok: false, powod: 'synchronizacja-wylaczona' });
    delete A.win.VildaSyncIntegration;
    const tryb = A.vault.getStorageMode;
    A.vault.getStorageMode = async () => A.vault.STORAGE_MODE_CLOUD_ONLY;
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'tryb' });
    // blokada sejfu w trakcie odczytu trybu — koniec bez blokady nadawcy i bez pobrania wierszy
    const odBl = A.zablokowaneSender().length;
    A.vault.getStorageMode = async (u) => { const w = await tryb(u); await A.zablokuj(); return w; };
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'sesja' });
    expect(A.zablokowaneSender().slice(odBl), 'bez blokady nadawcy').toEqual([]);
    await A.odblokuj();
    await A.L.emissionsSettled(); // przegląd kolejki przy odblokowaniu (bramka otwarta) może dołożyć wiersze sprzed flagi
    A.vault.getStorageMode = tryb;
    await A.zablokuj();
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: expect.stringMatching(/^(zablokowany|wylaczone)$/) });
    await A.odblokuj();
    await A.L.emissionsSettled();
    expect(zEvents(s, 'A')).toHaveLength(n);
    const po = await A.wiersze();
    expect(po.filter((r) => r0.some((x) => x.eid === r.eid)).map((r) => [r.eid, r.state, r.lastAttemptAtISO]), 'wiersz bez pobrania').toEqual(r0.map((r) => [r.eid, 'pending', null]));
    expect(po.every((r) => r.state === 'pending' && r.lastAttemptAtISO === null), 'żaden wiersz nie pobrany').toBe(true);
    A.win.VildaSyncIntegration = { isSyncEnabled: () => true };
    A.win.localStorage.setItem(K_SYNC, 'false');
    expect(await A.sync.flushOutbox(), 'integracja włączona').toMatchObject({ ok: true, wyslane: po.length });
  });

  it('NA15 [czerwony na bazie]: sesja — blokada w trakcie żądania: bez zapisu wyniku; po odblokowaniu wiersze w locie wracają po 60 s i serwer przyjmuje powtórkę (dup)', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    const [r1] = await A.wiersze();
    const brama = s.atrapa.wstrzymaj({ trasa: 'events' }, { faza: 'po' });
    const p = A.sync.flushOutbox();
    await brama.osiagnieta;
    await A.zablokuj();
    brama.zwolnij();
    brama.rozbroj();
    expect(await p).toMatchObject({ ok: false, powod: 'sesja' });
    await A.odblokuj();
    await A.L.emissionsSettled();
    // przegląd przy odblokowaniu (bramka otwarta) dokłada wiersze encji sprzed flagi; wiersz partii zostaje w locie
    const po = await A.wiersze();
    expect(po.find((r) => r.eid === r1.eid), 'wiersz nie usunięty — w locie').toMatchObject({ state: 'inflight' });
    const head = s.atrapa.slot(A.slotId).dz.head;
    krok(61e3);
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true, wyslane: po.length });
    expect((await A.licz()).total).toBe(0);
    expect(s.atrapa.slot(A.slotId).dz.head, 'powtórka (dup) bez nowego numeru').toBe(head + po.length - 1);
  });

  it('NA16 [czerwony na bazie]: bicie serca — wpis co 20 s; przegląd kolejki co 24 h z wysyłką', async () => {
    const s = await swiat();
    const { A } = s;
    expect(A.zegar.oczekujace(), 'zegar bicia serca po aktywacji').toContain(20000);
    krok(5000);
    A.zegar.odpal(20000);
    expect(A.bicie()).toEqual({ d: expect.any(String), t: Date.now() });
    expect(A.zegar.oczekujace().filter((ms) => ms === 20000)).toHaveLength(1);
    // karta bez wiersza (bramka zamknięta w chwili zapisu) — przegląd 24 h ją dokłada
    A.win.localStorage.setItem(FLAGA, '0');
    krok();
    const k = await A.zapiszKarte(7);
    A.win.localStorage.setItem(FLAGA, '1');
    await cisza(s.wszystkie());
    expect((await A.licz()).total).toBe(0);
    krok(23 * 3600e3);
    A.zegar.odpal(20000);
    await cisza(s.wszystkie());
    expect((await A.licz()).total, 'przed dobą bez przeglądu').toBe(0);
    krok(3600e3);
    A.zegar.odpal(20000);
    await czekajAz(async () => (await A.wiersze()).some((r) => r.kind === 'snap' && r.entityKey.startsWith(k.patientId + '/')), 'przegląd dołożył wersję karty');
    await czekajAz(() => A.zegar.oczekujace().includes(1500), 'po przeglądzie scheduleFlush');
  });

  it('NA17 [czerwony na bazie]: błąd magazynu kolejki (SYNC_DB_*) → ślad sync.queue.failed {op, code}, bez żądania', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    await A.notatka(1);
    const n = zEvents(s, 'A').length;
    const u = A.indexedDB.__atrapa.usterka({ przy: 'put', baza: /^vilda_sync_/, sklep: 'outbox', blad: 'QuotaExceededError', raz: true });
    const w = await A.sync.flushOutbox();
    expect(u.uzyta, 'usterka użyta').toBeTruthy();
    expect(w).toMatchObject({ ok: false, kod: 'SYNC_DB_QUOTA' });
    expect(A.slady).toEqual([['sync.queue.failed', { op: 'outboxTake', code: 'SYNC_DB_QUOTA' }]]);
    expect(zEvents(s, 'A')).toHaveLength(n);
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true, wyslane: 1 });
  });

  it('NA18 [czerwony na bazie]: onBulkChange (import karty z pliku) → scheduleFlush', async () => {
    const s = await swiat();
    const { A } = s;
    krok();
    const k = await A.zapiszKarte(3);
    const plik = await A.vault.exportPatientEnvelope(k.patientId);
    krok();
    await A.vault.removePatient(k.patientId);
    await A.L.emissionsSettled();
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true });
    expect(A.zegar.oczekujace()).not.toContain(1500);
    krok();
    await A.vault.importPatientFromEnvelope(plik, A.konto.haslo);
    await A.L.emissionsSettled();
    await czekajAz(() => A.zegar.oczekujace().includes(1500), 'onBulkChange → scheduleFlush');
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'partia importu wysłana');
  });
});

describe('P-SYNC-NADAWCA — strażniki źródła', () => {
  it('NA19 [czerwony na bazie]: eksport, stałe, Web Lock, kanał, słuchacze i keepalive tylko w swoich funkcjach bloku; cykl tylko przy włączonym dzienniku; nowe API bez wywołań w innych plikach produktu', () => {
    const src = czytaj('vilda_sync.js');
    // Blok nadawcy (do bloku wpięć E2-PR4e1, który ma własne strażniki w sync-zdarzenia-wpiecia.test.mjs).
    const blok = src.slice(src.indexOf('/* P-SYNC-NADAWCA (E2-PR4d;'), src.indexOf('/* P-SYNC-NADAWCA-WPIECIA (E2-PR4e1;'));
    expect(blok.length).toBeGreaterThan(5000);
    expect(src).toMatch(/,flushOutbox:Bns_flush,scheduleFlush:Bns_planuj,flushKeepalive:Bns_keepalive[,}]/);
    for (const k of [K_BICIE, BLOKADA]) expect(src.split(`'${k}'`).length - 1, k).toBe(1);
    const fn = (n) => wytnijFunkcje(blok, n);
    expect(blok.match(/\.locks\b/g), 'navigator.locks tylko w Bns_podBlokada').toHaveLength(1);
    expect(fn('Bns_podBlokada')).toMatch(/\.locks\b/);
    expect(blok.match(/o\.BroadcastChannel\b/g).length, 'kanał tylko w Bns_aktywuj').toBe(fn('Bns_aktywuj').match(/o\.BroadcastChannel\b/g).length);
    expect(fn('Bns_aktywuj')).toMatch(/new o\.BroadcastChannel\(Bns_KANAL\)/);
    expect(blok.match(/addEventListener\(/g).length).toBe(fn('Bns_aktywuj').match(/addEventListener\(/g).length);
    expect(blok).not.toMatch(/setInterval/);
    expect(blok.match(/localStorage\.setItem\(/g)).toHaveLength(1);
    expect(fn('Bns_bicieZapisz')).toMatch(/localStorage\.setItem\(Bns_K_BICIE \+ uid/);
    expect(blok.match(/\.sendBeacon\(/g), 'sendBeacon tylko w Bns_beacon').toHaveLength(1);
    expect(fn('Bns_beacon')).toMatch(/\.sendBeacon\(/);
    expect(blok.match(/keepalive: !0/g)).toHaveLength(1);
    expect(fn('Bns_keepalive')).toMatch(/keepalive: !0/);
    expect(src).toMatch(/Bdz_wlaczone\(\)\?Bze_isEventLogEnabled\(\)\?Bns_cykl\(a,r,i,Bdz_s\):Bdz_B\(a,r,i,Bdz_s\):B\(a,r,i,Bdz_s\)/);
    expect(src.match(/Bns_cykl\(/g), 'cykl: deklaracja i jedno wywołanie').toHaveLength(2);
    const pliki = fs.readdirSync(KORZEN).filter((n) => /\.(js|html)$/.test(n) && n !== 'vilda_sync.js');
    expect(pliki.length).toBeGreaterThan(100);
    const zApi = pliki.filter((n) => /\b(flushOutbox|flushKeepalive)\b/.test(czytaj(n)));
    expect(zApi, 'flushOutbox i flushKeepalive tylko w vilda_sync.js').toEqual([]);
    const zPlanu = pliki.filter((n) => /\b(scheduleFlush|applyRealtimeFrame)\b/.test(czytaj(n)));
    expect(zPlanu, 'wpięcia integracji (E2-PR4e1)').toEqual(['vilda_sync_integration.js']);
  });
});
