// P-SYNC-DRENAZ-ZDARZEN (E2-PR4c, plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.3 „drainChanges” kroki 2–5, wiersz 8c; decyzje
// właściciela 2026-11-11 nr 5 i 6): drenaż zdarzeń dziennika z kwarantanną. USPIONE: nowa ścieżka tylko przy włączonym
// dzienniku (VildaSync.isEventLogEnabled: „events” w health, flaga vilda-event-log-v1 = '1', pobieranie stronami); bez
// dziennika drenaż, pobranie i wysyłka jak dotąd (tests/unit/sync-dziennik-drenaz.test.mjs, zapis bazowy).
//
// Prawdziwe vilda_sync.js i sejf na natywnym adapterze IndexedDB (atrapa tests/support/atrapa-indexeddb.mjs, tryb
// „Komputer prywatny” z prawdziwym magazynem kolejki i kwarantanny; bliźniak urządzenia = klon atrapy), atrapa workera
// v37a z eventsEnabled. Zdarzenia z prawdziwej kolejki nadawcy (outboxTake → pushEvents → outboxAccept). Zdarzenie
// nieczytelne: wiersz z polem z (format) albo odszyfrowanie odrzucone OperationError w atrapie kryptografii odbiorcy
// (jak uszkodzony szyfrogram; po „aktualizacji” — nowy dokument bez tej usterki — to samo zdarzenie da się odczytać).
// Wersja aplikacji z SW (wiadomość VILDA_WERSJA przez MessageChannel, jak P-WERSJA-APLIKACJI). Ślady: atrapa
// VildaAuditLog w oknie. Fałszywy tylko Date. Dane wyłącznie FIKCYJNE.
//
// DZ1 zastosowanie przez applyEncryptedEvent (bez applyEncryptedDelta w drenażu stronami), kursor do headSeq,
//     appliedUpTo, markSyncCaughtUp; DZ2 pierścień własnych zdarzeń (pushEvents dopisuje, drenaż pomija, 500 ostatnich);
//     DZ3 nieczytelne → kwarantanna (wiersz /changes, appVersion z SW), kursor dalej, appliedUpTo przed wpisem, ślady
//     z resultSummary; DZ4 nieudany zapis do kwarantanny (SYNC_DB_QUOTA) → kursor przed wierszem, następny drenaż
//     ponawia; DZ5 SYNC_DB_SCHEMA → do końca przebiegu bez zapisów do bazy; DZ6 błąd zastosowania → kursor stoi, licznik,
//     jeden ślad; DZ7 ponowienie po aktualizacji (raz na dokument, rosnąco po seq, + sufiks), nadal nieczytelne →
//     nowa wersja we wpisie, inny slot → jedna próba i usunięcie, własny eid → usunięcie; DZ8 requiresBase → kursor
//     oldestSeq − 1, drenaż dalej, wymuszone pełne pobranie raz; DZ9 cursorAhead → headSeq, wymuszone pobranie raz;
//     DZ10 dziura → wymuszone pobranie przy pierwszym wykryciu, ślad sync.gap, przeskok przy trzecim jak dotąd;
//     DZ11 jeden drenaż po trwającym (czekajNaDrenaz sięga headSeq z chwili wywołania; kolejne prośby dołączają);
//     DZ12 uśpienie: przy „events” bez flagi wszystko jak dotąd (bez bazy kolejki, nowych kluczy, wymuszenia, drenażu
//     po trwającym, pierścienia); DZ13 sesja: blokada w trakcie zapisu kwarantanny → bez zapisu i bez kursora;
//     DZ14 markSyncCaughtUp (bramka, blokada, co najwyżej raz na godzinę); DZ15 strażniki źródła.
// DZ16 A ≡ B na prawdziwym drenażu (wzorzec: blok p. 7d tests/unit/sync-dziennik-wlasnosciowy.test.mjs, świat N1):
//     FIFO, kwarantanna bez aktualizacji, po aktualizacji (ponowienie + sufiks) — literał różnic wobec nadawcy.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera } from '../support/atrapa-workera-sync.mjs';
import { cisza, eksportKanoniczny, sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const FLAGA = 'vilda-event-log-v1';
const K_WLASNE = 'vilda-sync-own-eids-v1:';
const K_APPLIED = 'vilda-sync-applied-v1:';
const K_KURSOR = 'vilda-sync-cursor-v1:';
const WERSJA = '1.1.900-a';

afterEach(async () => {
  try { await sprzatnijUrzadzenia(); } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});

const krok = (ms = 60e3) => vi.setSystemTime(Date.now() + ms);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const zdarzenie = () => ({ eid: randomUUID(), iv: b64(Buffer.alloc(12, 7)), data: b64(Buffer.from('fikcyjne-' + randomUUID())) });

// SW: odpowiada na VILDA_WERSJA wersją z obiektu stanu (undefined = milczy).
function nawigatorSW(st) {
  return {
    serviceWorker: {
      controller: {
        postMessage(m, porty) {
          if (!m || m.type !== 'VILDA_WERSJA' || !porty || !porty[0] || st.wersja === undefined) return;
          porty[0].postMessage({ type: 'VILDA_WERSJA', wersja: st.wersja });
        },
      },
    },
  };
}
// Urządzenie natywne z atrapą SW i dziennika dostępu; o.wersja — wersja SW tego dokumentu (null: bez SW).
async function urz(s, nazwa, o = {}) {
  const sw = { wersja: o.wersja === undefined ? WERSJA : o.wersja };
  const slady = [];
  const d = await utworzUrzadzenie({
    atrapa: s.atrapa, nazwa, magazynSejfu: 'natywny', krypto: true,
    ...(sw.wersja === null ? {} : { nawigator: nawigatorSW(sw) }),
    dodatki: { VildaAuditLog: { log(typ, dane) { slady.push([typ, JSON.parse(JSON.stringify(dane === undefined ? null : dane))]); return Promise.resolve(); } } },
    ...(o.indexedDB ? { indexedDB: o.indexedDB } : {}),
    ...(o.zBlizniaka ? { zBlizniaka: o.zBlizniaka, klon: o.klon } : {}),
  });
  d.sw = sw;
  d.slady = slady;
  d.applied = () => d.win.localStorage.getItem(K_APPLIED + d.slotId);
  d.wlasne = () => JSON.parse(d.win.localStorage.getItem(K_WLASNE + d.slotId) || 'null');
  d.ustawKursor = (n) => d.win.localStorage.setItem(K_KURSOR + d.slotId, String(n));
  d.pobierz = async () => { const w = await d.sync.syncPull({ czekajNaDrenaz: true }); await cisza(s.wszystkie()); return w; };
  d.kw = async () => { const l = await d.vault._eventLog.quarantineList(); expect(l.ok, 'quarantineList').toBe(true); return l.wiersze; };
  s.lista.push(d);
  return d;
}
// Wysyłka kolejki urządzenia jak nadawca (E2-PR4d): emissionsSettled → outboxTake → pushEvents → outboxAccept.
async function wyslij(d) {
  const L = d.vault._eventLog;
  await L.emissionsSettled();
  const t = await L.outboxTake();
  expect(t.ok, 'outboxTake').toBe(true);
  if (!t.wiersze.length) return [];
  const p = await d.sync.pushEvents(t.wiersze.map((r) => ({ eid: r.eid, iv: r.env.iv, data: r.env.data })));
  expect(p.ok, `pushEvents ${JSON.stringify(p)}`).toBe(true);
  expect((await L.outboxAccept(p.accepted.map((a) => a.eid))).ok, 'outboxAccept').toBe(true);
  return t.wiersze.map((r, i) => ({ kind: r.kind, eid: r.eid, env: r.env, seq: p.accepted[i].seq }));
}
// Świat: A (natywny, nowe konto, karta 1, rejestracja pełną wysyłką przy zamkniętej bramce), B — bliźniak A (klon atrapy
// IndexedDB). Potem flaga '1' na obu (o.flaga), detectApi i rozruch: karta 2 na A jako zdarzenie (seq 1…), pierwsze
// pobranie B (pełne + kursor 0 → legacy) i pobranie A — oba kursory = headSeq, dalej drenaż stronami.
async function swiat(o = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: o.events !== false, zegar: () => Date.now() });
  const s = { atrapa, lista: [] };
  s.wszystkie = () => s.lista;
  const A = await urz(s, 'A', { indexedDB: utworzIndexedDB() });
  await A.zapiszKarte(1);
  expect((await A.sync.syncPush()).action).toBe('registered');
  await cisza(s.wszystkie());
  const B = await urz(s, 'B', { zBlizniaka: A, wersja: o.wersjaB });
  Object.assign(s, { A, B });
  const flaga = o.flaga === undefined ? '1' : o.flaga;
  for (const d of [A, B]) {
    if (flaga !== null) d.win.localStorage.setItem(FLAGA, flaga);
    await d.sync.detectApi();
  }
  krok();
  const k2 = await A.zapiszKarte(2);
  s.P2 = k2.patientId;
  if (flaga === '1') await wyslij(A);
  else expect(await A.wyslijDelteKarty(k2.patientId)).toBeTruthy();
  await cisza(s.wszystkie());
  expect((await B.sync.syncPull({ pierwszePobranie: true })).action).toBe('merged');
  await cisza(s.wszystkie());
  await A.pobierz();
  s.head0 = atrapa.slot().dz.head;
  expect(s.head0, 'świat: rozruch dał zdarzenia').toBeGreaterThan(0);
  expect([A.kursor(), B.kursor()], 'świat: kursory po rozruchu').toEqual([s.head0, s.head0]);
  if (flaga === '1') expect([A.sync.isEventLogEnabled(), B.sync.isEventLogEnabled()], 'świat: dziennik włączony').toEqual([true, true]);
  A.slady.length = 0;
  B.slady.length = 0;
  return s;
}
// Odszyfrowanie zdarzenia o danym iv odrzucone jak uszkodzony szyfrogram (OperationError) albo innym błędem.
function zepsujOdczyt(d, iv, { blad = 'OperationError', kod = null } = {}) {
  const cel = Buffer.from(iv, 'base64');
  return d.krypto.przed({ metoda: 'decrypt', gdy: (m, a) => !!(a[0] && a[0].iv && Buffer.from(a[0].iv).equals(cel)) }, () => {
    if (blad === 'OperationError') throw new DOMException('atrapa: uszkodzony szyfrogram', 'OperationError');
    const e = new Error('atrapa: błąd zastosowania');
    if (kod) e.code = kod;
    throw e;
  });
}
async function czekajAz(f, opis, n = 5000) {
  for (let i = 0; i < n; i += 1) { if (f()) return; await new Promise((r) => { setImmediate(r); }); }
  throw new Error('czekajAz: ' + opis);
}
const zmianyB = (s) => s.atrapa.zadania.filter((z) => z.urzadzenie === 'B' && z.trasa === 'changes');
const blobyB = (s) => s.atrapa.zadania.filter((z) => z.urzadzenie === 'B' && z.trasa === 'blob');
const kanon = async (d) => JSON.parse(eksportKanoniczny(await d.vault.exportSyncPayload(), { pominSeq: true, pominSnapshotCount: true }));

describe('P-SYNC-DRENAZ-ZDARZEN — drenaż zdarzeń z dziennikiem (E2-PR4c)', () => {
  it('DZ1 [czerwony na bazie]: zastosowanie przez applyEncryptedEvent, kursor do headSeq, appliedUpTo = kursor, markSyncCaughtUp', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    const k3 = await A.zapiszKarte(3);
    await A.vault.savePatientNote({ patientId: k3.patientId, title: 'Fikcyjna', body: 'Fikcyjna treść DZ1', category: 'inne' });
    const ev = await wyslij(A);
    expect(ev.length).toBeGreaterThan(1);
    let delty = 0;
    const f = B.vault.applyEncryptedDelta;
    B.vault.applyEncryptedDelta = function (...a) { delty += 1; return f.apply(this, a); };
    krok(61 * 60e3); // ostatnie scalenie pełne ponad godzinę temu: markSyncCaughtUp zapisuje
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ tryb: 'strony', stop: 'head', dziennik: true, zastosowane: ev.length, wlasne: 0, kwarantanna: 0, nieczytelne: 0, bledy: 0 });
    expect(delty, 'drenaż z dziennikiem nie woła applyEncryptedDelta').toBe(0);
    const head = s.atrapa.slot().dz.head;
    expect(B.kursor()).toBe(head);
    expect(B.applied(), 'appliedUpTo = kursor przy pustej kwarantannie').toBe(String(head));
    expect((await B.vault.exportSyncPayload()).lastMergeAtISO, 'markSyncCaughtUp po headSeq').toBe(new Date(Date.now()).toISOString());
    expect(await kanon(B)).toEqual(await kanon(A));
    expect(B.slady).toEqual([]);
  });

  it('DZ2 [czerwony na bazie]: pushEvents dopisuje eid do pierścienia (także dup), drenaż nadawcy pomija własne bez scalenia; pierścień trzyma 500 ostatnich', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    await A.zapiszKarte(3);
    const ev = await wyslij(A);
    const wl = A.wlasne();
    expect(wl.slice(-ev.length), 'pierścień: przyjęte eid po kolei').toEqual(ev.map((e) => e.eid));
    const dup = await A.sync.pushEvents([{ eid: ev[0].eid, iv: ev[0].env.iv, data: ev[0].env.data }]);
    expect(dup.accepted[0].dup).toBe(true);
    expect(A.wlasne(), 'dup nie dubluje wpisu').toEqual(wl);
    const w = await A.pobierz();
    expect(w.drain).toMatchObject({ stop: 'head', wlasne: ev.length, zastosowane: 0, kwarantanna: 0 });
    expect(A.kursor()).toBe(s.atrapa.slot().dz.head);
    expect(B.wlasne(), 'B nie ma pierścienia').toBe(null);
    const wB = await B.pobierz();
    expect(wB.drain).toMatchObject({ stop: 'head', wlasne: 0, zastosowane: ev.length });
    const partie = [];
    for (let i = 0; i < 3; i += 1) {
      krok(61e3); // budżet serwera: 600 zdarzeń na minutę na slot
      const p = Array.from({ length: 200 }, zdarzenie);
      expect((await A.sync.pushEvents(p)).ok).toBe(true);
      partie.push(...p.map((e) => e.eid));
    }
    expect(A.wlasne(), 'pierścień: 500 ostatnich').toEqual(partie.slice(-500));
  });

  it('DZ3 [czerwony na bazie]: nieczytelne → kwarantanna z wierszem /changes i appVersion z SW, kursor dalej, appliedUpTo przed wpisem, ślady z resultSummary', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    await A.zapiszKarte(3);
    const ev = await wyslij(A);
    const zF = s.atrapa.dopisz({ src: 'ev', payload: { iv: ev[0].env.iv, data: ev[0].env.data }, z: 'gzip' });
    const zl = s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 3)), data: b64(Buffer.from('fikcyjny-uszkodzony-szyfrogram')) } });
    krok();
    await A.zapiszKarte(4);
    const ev2 = await wyslij(A);
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'head', zastosowane: ev.length + ev2.length, kwarantanna: 2, nieczytelne: 2 });
    expect(B.kursor()).toBe(s.atrapa.slot().dz.head);
    const kw = await B.kw();
    expect(kw.map((r) => ({ slotId: r.slotId, seq: r.seq, eid: r.eid, z: r.z, reason: r.reason, appVersion: r.appVersion }))).toEqual([
      { slotId: B.slotId, seq: zF.seq, eid: zF.eid, z: 'gzip', reason: 'format', appVersion: WERSJA },
      { slotId: B.slotId, seq: zl.seq, eid: zl.eid, z: undefined, reason: 'decrypt', appVersion: WERSJA },
    ]);
    expect([kw[0].iv, kw[0].data]).toEqual([ev[0].env.iv, ev[0].env.data]);
    expect(B.applied(), 'appliedUpTo = min(kwarantanna) − 1').toBe(String(zF.seq - 1));
    expect(B.slady).toEqual([
      ['sync.event.unreadable', { status: 'unreadable', reason: 'format' }],
      ['sync.event.unreadable', { status: 'unreadable', reason: 'decrypt' }],
    ]);
    const w2 = await B.pobierz();
    expect(w2.drain).toMatchObject({ stop: 'head', kwarantanna: 0 });
    expect((await B.kw()).length, 'bez dubli w kwarantannie').toBe(2);
  });

  it('DZ3b [czerwony na bazie]: bez SW (wersja nieznana) — appVersion null', async () => {
    const s = await swiat({ wersjaB: null });
    s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 3)), data: b64(Buffer.from('fikcyjny')) } });
    const w = await s.B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'head', kwarantanna: 1 });
    expect((await s.B.kw()).map((r) => r.appVersion)).toEqual([null]);
  });

  it('DZ3c [czerwony na bazie]: wersja z SW spoza wzoru — appVersion null, zapis do kwarantanny udany', async () => {
    const s = await swiat({ wersjaB: 'zła wersja!' });
    s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 3)), data: b64(Buffer.from('fikcyjny')) } });
    const w = await s.B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'head', kwarantanna: 1 });
    expect((await s.B.kw()).map((r) => r.appVersion)).toEqual([null]);
  });

  it('DZ4 [czerwony na bazie]: nieudany zapis do kwarantanny (SYNC_DB_QUOTA) → kursor przed wierszem, dalsze wiersze czekają; następny drenaż ponawia', async () => {
    const s = await swiat();
    const { A, B } = s;
    const zl = s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 3)), data: b64(Buffer.from('fikcyjny')) } });
    krok();
    await A.zapiszKarte(3);
    const ev = await wyslij(A);
    const u = B.indexedDB.__atrapa.usterka({ przy: 'put', baza: /^vilda_sync_/, sklep: 'quarantine', blad: 'QuotaExceededError', raz: false });
    const w = await B.pobierz();
    expect(u.uzyta, 'usterka zapisu kwarantanny użyta').toBeTruthy();
    expect(w.drain).toMatchObject({ stop: 'kwarantanna', kod: 'SYNC_DB_QUOTA', zastosowane: 0, kwarantanna: 0 });
    expect(B.kursor(), 'kursor przed nieczytelnym wierszem').toBe(zl.seq - 1);
    const w1 = await B.pobierz();
    expect(w1.drain).toMatchObject({ stop: 'kwarantanna', kod: 'SYNC_DB_QUOTA' });
    expect(B.slady, 'jeden ślad na wiersz i kod').toEqual([['sync.quarantine.failed', { powod: 'blad', code: 'SYNC_DB_QUOTA' }]]);
    u.odwolaj();
    const w2 = await B.pobierz();
    expect(w2.drain).toMatchObject({ stop: 'head', kwarantanna: 1, zastosowane: ev.length });
    expect(B.kursor()).toBe(s.atrapa.slot().dz.head);
    expect(B.applied()).toBe(String(zl.seq - 1));
  });

  it('DZ5 [czerwony na bazie]: SYNC_DB_SCHEMA → do końca przebiegu bez operacji na bazie kolejki; kursor przed wierszem', async () => {
    const s = await swiat();
    const { B } = s;
    B.indexedDB.__atrapa.utworz('vilda_sync_' + B.konto.userId, 7, { inny: { keyPath: 'id' } }, {});
    const z1 = s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 3)), data: b64(Buffer.from('fikcyjny-1')) } });
    s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 4)), data: b64(Buffer.from('fikcyjny-2')) } });
    const log = B.indexedDB.__atrapa.log;
    const od = log.length;
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'kwarantanna', kod: 'SYNC_DB_SCHEMA' });
    expect(B.kursor()).toBe(z1.seq - 1);
    const otwarcia = log.slice(od).filter((x) => x[0] === 'open' && /^vilda_sync_/.test(x[1]));
    expect(otwarcia.length, 'jedna próba otwarcia bazy kolejki w przebiegu').toBe(1);
  });

  it('DZ6 [czerwony na bazie]: błąd zastosowania → kursor stoi przed zdarzeniem, licznik prób, jeden ślad; po ustąpieniu błędu zastosowane', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    await A.zapiszKarte(3);
    const ev = await wyslij(A);
    zepsujOdczyt(B, ev[0].env.iv, { blad: 'Error', kod: 'ATRAPA_BLAD' });
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'zastosowanie', kod: 'ATRAPA_BLAD', proby: 1, kwarantanna: 0 });
    expect(B.kursor()).toBe(ev[0].seq - 1);
    zepsujOdczyt(B, ev[0].env.iv, { blad: 'Error', kod: 'ATRAPA_BLAD' });
    const w2 = await B.pobierz();
    expect(w2.drain).toMatchObject({ stop: 'zastosowanie', proby: 2 });
    expect(B.slady).toEqual([['sync.event.error', { status: 'apply-error', code: 'ATRAPA_BLAD' }]]);
    const w3 = await B.pobierz();
    expect(w3.drain).toMatchObject({ stop: 'head', zastosowane: ev.length });
    expect((await B.kw()).length).toBe(0);
  });

  it('DZ6b [czerwony na bazie]: zdarzenie „zajęte” (busy) → stop busy, kursor przed zdarzeniem, bez kwarantanny i śladu; następny drenaż stosuje', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    await A.zapiszKarte(3);
    const ev = await wyslij(A);
    zepsujOdczyt(B, ev[0].env.iv, { blad: 'Error', kod: 'PATIENT_AUTHORITY_UNAVAILABLE' });
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'busy', kwarantanna: 0, zastosowane: 0 });
    expect(B.kursor()).toBe(ev[0].seq - 1);
    expect(B.slady).toEqual([]);
    expect((await B.pobierz()).drain).toMatchObject({ stop: 'head', zastosowane: ev.length });
  });

  it('DZ7 [czerwony na bazie]: ponowienie po aktualizacji — raz na dokument, rosnąco po seq, z sufiksem; nadal nieczytelne → nowa wersja; inny slot → próba i usunięcie; własny eid → usunięcie', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    const k3 = await A.zapiszKarte(3);
    await A.vault.savePatientNote({ patientId: k3.patientId, title: 'Fikcyjna', body: 'Fikcyjna treść DZ7', category: 'inne' });
    const ev = await wyslij(A);
    for (const e of ev.slice(0, 2)) zepsujOdczyt(B, e.env.iv);
    const zF = s.atrapa.dopisz({ src: 'ev', payload: { iv: ev[0].env.iv, data: ev[0].env.data }, z: 'gzip' });
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'head', kwarantanna: 3 });
    expect((await B.kw()).map((r) => r.seq)).toEqual([ev[0].seq, ev[1].seq, zF.seq]);
    const inny = 'c'.repeat(64);
    const L = B.vault._eventLog;
    expect(await L.quarantinePut({ seq: 1, eid: randomUUID(), payload: { iv: b64(Buffer.alloc(12, 9)), data: b64(Buffer.from('fikcyjny-inny-slot')) } },
      { status: 'unreadable', reason: 'decrypt' }, { slotId: inny, appVersion: WERSJA })).toEqual({ ok: true, nowy: true });
    // ten sam dokument: bez ponowień (wersja bez zmian i sprawdzone w tym dokumencie)
    const w2 = await B.pobierz();
    expect(w2.drain).toMatchObject({ stop: 'head', ponowione: 0 });
    expect((await B.kw()).length).toBe(4);
    expect(B.applied(), 'wiersz innego slotu nie wstrzymuje appliedUpTo').toBe(String(ev[0].seq - 1));
    expect(await kanon(B)).not.toEqual(await kanon(A));
    // „aktualizacja”: nowy dokument (klon B z magazynem przeglądarki) z nową wersją SW, bez usterki odczytu
    const B2 = await urz(s, 'B2', { zBlizniaka: B, klon: 'wszystko', wersja: '1.1.901-b' });
    await B2.sync.detectApi();
    const kolejnosc = [];
    for (const [i, e] of ev.slice(0, 2).entries()) {
      const cel = Buffer.from(e.env.iv, 'base64');
      B2.krypto.po({ metoda: 'decrypt', gdy: (m, a) => !!(a[0] && a[0].iv && Buffer.from(a[0].iv).equals(cel)) }, () => { kolejnosc.push(i); });
    }
    const w3 = await B2.pobierz();
    expect(kolejnosc, 'ponowienie rosnąco po seq').toEqual([0, 1]);
    expect(B2.slady, 'ponowny wpis do kwarantanny bez śladu').toEqual([]);
    expect(w3.drain).toMatchObject({ stop: 'head', ponowione: 2, kwarantanna: 0 });
    expect(await kanon(B2), 'po ponowieniu z sufiksem odbiorca = nadawca').toEqual(await kanon(A));
    const kw = await B2.kw();
    expect(kw.map((r) => [r.slotId === B2.slotId ? 'biezacy' : 'inny', r.seq, r.reason, r.appVersion]), 'zostaje tylko nadal nieczytelny, z nową wersją')
      .toEqual([['biezacy', zF.seq, 'format', '1.1.901-b']]);
    expect(B2.applied()).toBe(String(zF.seq - 1));
    // kolejny dokument z tą samą wersją: bez ponowień
    const B3 = await urz(s, 'B3', { zBlizniaka: B2, klon: 'wszystko', wersja: '1.1.901-b' });
    await B3.sync.detectApi();
    const w4 = await B3.pobierz();
    expect(w4.drain).toMatchObject({ ponowione: 0 });
    // własny eid w kwarantannie: usunięty bez zastosowania
    const wl = await A.sync.pushEvents([zdarzenie()]);
    const eidW = JSON.parse(A.win.localStorage.getItem(K_WLASNE + A.slotId)).slice(-1)[0];
    expect(wl.ok).toBe(true);
    const A2 = await urz(s, 'A2', { zBlizniaka: A, klon: 'wszystko', wersja: '1.1.902-c' });
    await A2.sync.detectApi();
    expect(await A2.vault._eventLog.quarantinePut({ seq: wl.accepted[0].seq, eid: eidW, payload: { iv: b64(Buffer.alloc(12, 5)), data: b64(Buffer.from('x')) } },
      { status: 'unreadable', reason: 'decrypt' }, { slotId: A2.slotId, appVersion: WERSJA })).toEqual({ ok: true, nowy: true });
    A2.ustawKursor(s.atrapa.slot().dz.head);
    const w5 = await A2.pobierz();
    expect(w5.drain).toMatchObject({ stop: 'head', ponowione: 0, wlasneWKwarantannie: 1 });
    expect((await A2.kw()).length).toBe(0);
  });

  it('DZ7b [czerwony na bazie]: wiersze innego slotu (po rotacji) — jedna próba zastosowania, potem usunięte, także gdy nadal nieczytelne', async () => {
    const s = await swiat();
    const { A, B } = s;
    // koperta karty 3 z kolejki A, której nie ma w dzienniku serwera (nie wysłana)
    krok();
    const k3 = await A.zapiszKarte(3);
    const L = A.vault._eventLog;
    await L.emissionsSettled();
    const t = await L.outboxTake();
    expect((await L.outboxAccept(t.wiersze.map((r) => r.eid))).ok).toBe(true);
    const env = t.wiersze.find((r) => r.kind === 'pfull' || r.kind === 'snap').env;
    const inny = 'd'.repeat(64);
    const LB = B.vault._eventLog;
    expect(await LB.quarantinePut({ seq: 7, eid: randomUUID(), payload: { iv: b64(Buffer.alloc(12, 9)), data: b64(Buffer.from('fikcyjny')) } },
      { status: 'unreadable', reason: 'decrypt' }, { slotId: inny, appVersion: WERSJA })).toEqual({ ok: true, nowy: true });
    expect(await LB.quarantinePut({ seq: 8, eid: randomUUID(), payload: { iv: env.iv, data: env.data } },
      { status: 'unreadable', reason: 'decrypt' }, { slotId: inny, appVersion: WERSJA })).toEqual({ ok: true, nowy: true });
    expect((await B.vault.listPatients()).some((p) => p.patientId === k3.patientId), 'karty 3 nie ma u B').toBe(false);
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'head', innySlot: 2 });
    expect((await B.kw()).length).toBe(0);
    expect((await B.vault.listPatients()).some((p) => p.patientId === k3.patientId), 'wiersz innego slotu zastosowany przed usunięciem').toBe(true);
  });

  it('DZ7c [czerwony na bazie]: wiersz bieżącego slotu z bieżącą wersją nie jest ponawiany (nawet gdy dałby się odczytać); nowa wersja — ponowiony i usunięty', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    await A.zapiszKarte(3);
    const ev = await wyslij(A);
    B.ustawKursor(s.atrapa.slot().dz.head);
    expect(await B.vault._eventLog.quarantinePut({ seq: ev[0].seq, eid: ev[0].eid, payload: ev[0].env }, { status: 'unreadable', reason: 'decrypt' },
      { slotId: B.slotId, appVersion: WERSJA })).toEqual({ ok: true, nowy: true });
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'head', ponowione: 0 });
    expect((await B.kw()).length).toBe(1);
    expect(B.applied()).toBe(String(ev[0].seq - 1));
    const B2 = await urz(s, 'B2', { zBlizniaka: B, klon: 'wszystko', wersja: '1.1.901-b' });
    await B2.sync.detectApi();
    const w2 = await B2.pobierz();
    expect(w2.drain).toMatchObject({ stop: 'head', ponowione: 1 });
    expect((await B2.kw()).length).toBe(0);
    expect(B2.applied()).toBe(String(s.atrapa.slot().dz.head));
  });

  it('DZ7d [czerwony na bazie]: nadal nieczytelny przy ponowieniu (bez sufiksu) — wpis dostaje nową wersję i w następnym dokumencie z tą wersją nie jest ponawiany', async () => {
    const s = await swiat();
    const { B } = s;
    const zF = s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 6)), data: b64(Buffer.from('fikcyjny-format')) }, z: 'gzip' });
    expect((await B.pobierz()).drain).toMatchObject({ stop: 'head', kwarantanna: 1 });
    const B2 = await urz(s, 'B2', { zBlizniaka: B, klon: 'wszystko', wersja: '1.1.901-b' });
    await B2.sync.detectApi();
    expect((await B2.pobierz()).drain).toMatchObject({ stop: 'head', ponowione: 0 });
    expect((await B2.kw()).map((r) => [r.seq, r.reason, r.appVersion])).toEqual([[zF.seq, 'format', '1.1.901-b']]);
  });

  it('DZ8 [czerwony na bazie]: requiresBase → kursor oldestSeq − 1 i drenaż dalej; następne pobranie wymuszone pełne (raz)', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    await A.zapiszKarte(3);
    await wyslij(A);
    s.atrapa.wipe();
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'head', wymus: 'base' });
    expect(B.kursor()).toBe(s.atrapa.slot().dz.oldest - 1);
    const b0 = blobyB(s).length;
    expect((await B.pobierz()).action, 'wymuszone pełne pobranie').toBe('merged');
    expect(blobyB(s).length).toBe(b0 + 1);
    expect((await B.pobierz()).action, 'tylko raz').toBe('up-to-date');
  });

  it('DZ9 [czerwony na bazie]: cursorAhead → kursor headSeq, wymuszone pełne pobranie raz', async () => {
    const s = await swiat();
    const { B } = s;
    B.ustawKursor(s.head0 + 5);
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'ahead', wymus: 'ahead' });
    expect(B.kursor()).toBe(s.head0);
    expect((await B.pobierz()).action).toBe('merged');
    expect((await B.pobierz()).action).toBe('up-to-date');
  });

  it('DZ10 [czerwony na bazie]: dziura → wymuszone pobranie przy pierwszym wykryciu, ślad sync.gap przy każdej próbie, przeskok przy trzeciej', async () => {
    const s = await swiat();
    const { A, B } = s;
    s.atrapa.wymusDziure({ ile: 2 });
    krok();
    await A.zapiszKarte(3);
    const ev = await wyslij(A);
    const od = s.head0 + 1;
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ stop: 'dziura', wymus: 'dziura', dziura: { od, do: od + 1, proby: 1 } });
    expect(B.kursor()).toBe(s.head0);
    const w2 = await B.pobierz();
    expect(w2.action, 'wymuszone pełne pobranie').toBe('merged');
    expect(w2.drain).toMatchObject({ stop: 'dziura', wymus: null, dziura: { proby: 2 } });
    const w3 = await B.pobierz();
    expect(w3.action).toBe('up-to-date');
    expect(w3.drain).toMatchObject({ stop: 'head', przeskok: { od, do: od + 1 }, zastosowane: ev.length });
    expect(B.slady).toEqual([1, 2, 3].map((p) => ['sync.gap', { od, do: od + 1, proby: p }]));
  });

  it('DZ11 [czerwony na bazie]: drugie pobranie w trakcie drenażu dostaje jeden drenaż po trwającym (do headSeq z chwili wywołania); trzecie dołącza', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok();
    await A.zapiszKarte(3);
    await wyslij(A);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const z0 = zmianyB(s).length;
    const p1 = B.sync.syncPull({ czekajNaDrenaz: true });
    await brama.osiagnieta;
    krok();
    await A.zapiszKarte(4);
    await wyslij(A); // po odpowiedzi strony trwającego drenażu
    const head = s.atrapa.slot().dz.head;
    const konce = () => B.rzutOsi().filter((l) => l === 'koniec pull up-to-date').length;
    const k0 = konce();
    const p2 = B.sync.syncPull({ czekajNaDrenaz: true });
    await czekajAz(() => konce() >= k0 + 1, 'drugie koniec pull');
    const p3 = B.sync.syncPull({ czekajNaDrenaz: true });
    await czekajAz(() => konce() >= k0 + 2, 'trzecie koniec pull');
    brama.zwolnij();
    const [w1, w2, w3] = await Promise.all([p1, p2, p3]);
    await cisza(s.wszystkie());
    expect(w1.drain.stop).toBe('head');
    expect(w1.drain.do, 'trwający drenaż kończy na stronie sprzed dopisania').toBeLessThan(head);
    expect(w2.drain).toMatchObject({ stop: 'head', do: head });
    expect(w3.drain, 'trzecie dołącza do tego samego drenażu po trwającym').toEqual(w2.drain);
    expect(zmianyB(s).length - z0, 'dwa drenaże: trwający i jeden po nim').toBe(2);
    expect(B.kursor()).toBe(head);
  });

  it('DZ12 [zielony także na bazie]: uśpienie — „events” w health bez flagi: drenaż jak dotąd (applyEncryptedDelta, bez kwarantanny, bez bazy kolejki, bez nowych kluczy, bez wymuszenia, bez drenażu po trwającym, bez pierścienia)', async () => {
    const s = await swiat({ flaga: null });
    const { A, B } = s;
    expect(B.sync.isEventLogEnabled ? B.sync.isEventLogEnabled() : false).toBe(false);
    let delty = 0;
    const f = B.vault.applyEncryptedDelta;
    B.vault.applyEncryptedDelta = function (...a) { delty += 1; return f.apply(this, a); };
    krok();
    const k3 = await A.zapiszKarte(3);
    expect(await A.wyslijDelteKarty(k3.patientId)).toBeTruthy();
    await cisza(s.wszystkie());
    s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 3)), data: b64(Buffer.from('fikcyjny')) } });
    const w = await B.pobierz();
    expect(w.drain).toMatchObject({ tryb: 'strony', stop: 'head', zastosowane: 1, nieczytelne: 1 });
    expect(w.drain.dziennik, 'bez pól dziennika').toBeUndefined();
    expect(delty).toBe(2);
    expect(B.kursor()).toBe(s.atrapa.slot().dz.head);
    expect((await B.indexedDB.databases()).map((x) => x.name).filter((n) => /^vilda_sync_/.test(n)), 'bez bazy kolejki').toEqual([]);
    const klucze = B.win.localStorage.klucze().filter((k) => k.startsWith(K_WLASNE) || k.startsWith(K_APPLIED));
    expect(klucze, 'bez nowych kluczy').toEqual([]);
    expect(B.slady).toEqual([]);
    expect((await B.vault.exportSyncPayload()).lastMergeAtISO, 'bez markSyncCaughtUp').not.toBe(new Date(Date.now()).toISOString());
    krok();
    const k4 = await A.zapiszKarte(4);
    expect(await A.wyslijDelteKarty(k4.patientId)).toBeTruthy();
    await cisza(s.wszystkie());
    s.atrapa.wipe();
    expect((await B.pobierz()).drain.stop).toBe('base');
    expect((await B.pobierz()).action, 'bez wymuszonego pełnego pobrania').toBe('up-to-date');
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const z0 = zmianyB(s).length;
    const p1 = B.sync.syncPull({ czekajNaDrenaz: true });
    await brama.osiagnieta;
    const konce = () => B.rzutOsi().filter((l) => l === 'koniec pull up-to-date').length;
    const k0 = konce();
    const p2 = B.sync.syncPull({ czekajNaDrenaz: true });
    await czekajAz(() => konce() >= k0 + 1, 'drugie koniec pull');
    brama.zwolnij();
    const [w1, w2] = await Promise.all([p1, p2]);
    await cisza(s.wszystkie());
    expect(w2.drain, 'jak dotąd: ten sam wynik').toEqual(w1.drain);
    expect(zmianyB(s).length - z0).toBe(1);
    const p = await A.sync.pushEvents([zdarzenie()]);
    expect(p).toEqual({ ok: false, powod: 'wylaczone' });
    expect(A.wlasne()).toBe(null);
  });

  it('DZ13 [czerwony na bazie]: blokada sejfu w trakcie zapisu do kwarantanny → bez wpisu, bez zapisu kursora z tej strony', async () => {
    const s = await swiat();
    const { B } = s;
    expect((await B.pobierz()).drain.stop, 'ponowienie kwarantanny w tym dokumencie już za nami').toBe('head');
    s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 3)), data: b64(Buffer.from('fikcyjny')) } });
    const st = B.indexedDB.__atrapa.wstrzymaj({ przy: 'open', baza: /^vilda_sync_/ });
    const p = B.sync.syncPull({ czekajNaDrenaz: true });
    const kto = await Promise.race([st.czeka.then(() => 'baza'), p.then(() => 'koniec')]);
    expect(kto, 'drenaż otwiera bazę kolejki przy zapisie kwarantanny').toBe('baza');
    await B.zablokuj('manual');
    st.zwolnij();
    const w = await p;
    await cisza(s.wszystkie());
    expect(w.drain.stop).toBe('blokada');
    expect(B.kursor()).toBe(s.head0);
    await B.odblokuj();
    expect((await B.kw()).length).toBe(0);
  });

  it('DZ13b [czerwony na bazie]: inne konto w trakcie zapisu do kwarantanny → bez wpisu, bez kursora i bez śladu w dzienniku dostępu nowego konta', async () => {
    const s = await swiat();
    const { B } = s;
    expect((await B.pobierz()).drain.stop).toBe('head');
    s.atrapa.dopisz({ src: 'ev', payload: { iv: b64(Buffer.alloc(12, 3)), data: b64(Buffer.from('fikcyjny')) } });
    const st = B.indexedDB.__atrapa.wstrzymaj({ przy: 'open', baza: /^vilda_sync_/ });
    const p = B.sync.syncPull({ czekajNaDrenaz: true });
    const kto = await Promise.race([st.czeka.then(() => 'baza'), p.then(() => 'koniec')]);
    expect(kto, 'drenaż otwiera bazę kolejki przy zapisie kwarantanny').toBe('baza');
    await B.vault.createUser('Fikcyjne#Haslo!DrugieKonto2026', { iterations: 1000, label: 'Fikcyjna Lekarka Druga' });
    st.zwolnij();
    const w = await p;
    await cisza(s.wszystkie());
    expect(w.drain.stop).toBe('blokada');
    expect(B.kursor()).toBe(s.head0);
    expect(B.slady, 'bez śladu w dzienniku nowego konta').toEqual([]);
  });

  it('DZ14 [czerwony na bazie]: markSyncCaughtUp — bramka, blokada, zapis co najwyżej raz na godzinę', async () => {
    const s = await swiat();
    const { B } = s;
    const L = B.vault._eventLog;
    expect(typeof L.markSyncCaughtUp).toBe('function');
    krok(61 * 60e3);
    const t1 = new Date(Date.now()).toISOString();
    expect(await L.markSyncCaughtUp()).toEqual({ ok: true, zapisano: true });
    expect((await B.vault.exportSyncPayload()).lastMergeAtISO).toBe(t1);
    krok(59 * 60e3);
    expect(await L.markSyncCaughtUp()).toEqual({ ok: true, zapisano: false });
    expect((await B.vault.exportSyncPayload()).lastMergeAtISO).toBe(t1);
    krok(2 * 60e3);
    expect(await L.markSyncCaughtUp()).toEqual({ ok: true, zapisano: true });
    B.win.localStorage.setItem(FLAGA, '0');
    expect(await L.markSyncCaughtUp()).toEqual({ ok: false, powod: 'bramka' });
    B.win.localStorage.setItem(FLAGA, '1');
    await B.zablokuj('manual');
    const od = B.indexedDB.__atrapa.log.length;
    expect(await L.markSyncCaughtUp()).toEqual({ ok: false, powod: 'zablokowany' });
    expect(B.indexedDB.__atrapa.log.slice(od).filter((x) => x[0] === 'tx' || x[0] === 'open'), 'przy zablokowanym sejfie bez odczytu metadanych').toEqual([]);
  });

  it('DZ15 [czerwony na bazie]: strażniki źródła — API kwarantanny, zastosowania zdarzeń i markSyncCaughtUp woła w produkcie tylko vilda_sync.js; nowe klucze tylko tam', () => {
    const sync = czytaj('vilda_sync.js');
    for (const n of ['applyEncryptedEvent', 'quarantinePut', 'quarantineList', 'quarantineRelease', 'quarantineMinSeq', 'resultSummary', 'markSyncCaughtUp']) {
      expect(sync.includes('.' + n + '('), `vilda_sync.js woła ${n}`).toBe(true);
    }
    for (const k of [K_WLASNE, K_APPLIED]) expect(sync.split(`'${k}'`).length - 1, `klucz ${k} raz w vilda_sync.js`).toBe(1);
    const pliki = fs.readdirSync(KORZEN).filter((f) => /\.(js|html)$/.test(f) && f !== 'vilda_sync.js' && f !== 'vilda_vault.js' && !/_test\.js$/.test(f));
    for (const f of pliki) {
      const t = czytaj(f);
      for (const n of ['markSyncCaughtUp', 'quarantinePut', 'applyEncryptedEvent']) expect(t.includes(n), `${f} nie woła ${n}`).toBe(false);
      for (const k of [K_WLASNE, K_APPLIED]) expect(t.includes(k), `${f} bez klucza ${k}`).toBe(false);
    }
  });
});

// ── DZ16: A ≡ B na prawdziwym drenażu (wzorzec p. 7d, świat N1) ─────────────────────────────────────────────────────
// Świat N1 (p6r4 + p7dN1 z tests/unit/sync-dziennik-wlasnosciowy.test.mjs) na urządzeniach natywnych: A ma kartę P
// (wersje v, w) i kartę Q; B (bliźniak, po pobraniu) dopisuje notatkę n do P i usuwa P; A poprawia v (34,9 kg) i pobiera
// zdarzenia B — haki A dopisują pfull P i pnote n. Partia A = [snap, pfull, pnote]. Odbiorcy: klony B sprzed tej partii
// (atrapa IndexedDB i magazyn przeglądarki): FIFO; kwarantanna snap i pfull (odszyfrowanie odrzucone) bez aktualizacji;
// po aktualizacji (nowy dokument, nowa wersja SW, odczyt sprawny) — ponowienie rosnąco + sufiks. Literał: różnice
// wobec nadawcy po etykietach encji, wiersze kwarantanny, appliedUpTo względem seq partii.
function roznice(a, b, etykiety) {
  const et = (id) => etykiety.get(id) || '?';
  const out = [];
  const sekcja = (nazwa, opis, klucz) => {
    const mA = new Map((a[nazwa] || []).map((x) => [klucz(x), x]));
    const mB = new Map((b[nazwa] || []).map((x) => [klucz(x), x]));
    for (const [k, x] of mA) {
      if (!mB.has(k)) out.push(`${opis} ${et(k)}: tylko A`);
      else if (nazwa !== 'patients' && JSON.stringify(x) !== JSON.stringify(mB.get(k))) out.push(`${opis} ${et(k)}: różne`);
    }
    for (const k of mB.keys()) if (!mA.has(k)) out.push(`${opis} ${et(k)}: tylko B`);
  };
  sekcja('patients', 'karta', (x) => x.patientId);
  for (const pA of a.patients || []) {
    const pB = (b.patients || []).find((x) => x.patientId === pA.patientId);
    const wA = new Map((pA.snapshots || []).map((x) => [x.snapshotId, x]));
    const wB = new Map(((pB && pB.snapshots) || []).map((x) => [x.snapshotId, x]));
    for (const [k, x] of wA) {
      if (!wB.has(k)) out.push(`wersja ${et(pA.patientId)}/${et(k)}: tylko A`);
      else if (JSON.stringify(x) !== JSON.stringify(wB.get(k))) out.push(`wersja ${et(pA.patientId)}/${et(k)}: różna`);
    }
    for (const k of wB.keys()) if (!wA.has(k)) out.push(`wersja ${et(pA.patientId)}/${et(k)}: tylko B`);
  }
  sekcja('tombstones', 'ptomb', (x) => x.patientId);
  sekcja('patientNotes', 'pnote', (x) => x.id);
  sekcja('patientNoteTombstones', 'pnotetomb', (x) => x.id);
  return out.sort();
}
describe('A ≡ B na prawdziwym drenażu: kwarantanna, aktualizacja, ponowienie + sufiks (DZ16; wzorzec p. 7d)', () => {
  it('DZ16 [czerwony na bazie]: N1 [snap, pfull, pnote] — FIFO = nadawca; snap i pfull w kwarantannie bez aktualizacji — literał różnic; po aktualizacji = nadawca, kwarantanna pusta', async () => {
    const s = await swiat();
    const { A, B } = s;
    krok(); const r1 = await A.zapiszKarte(5, { wzrost: 120, masa: 20 });
    krok(); const r2 = await A.zapiszKarte(5, { wzrost: 125, masa: 21, zapis: { patientId: r1.patientId, forceNewSnapshot: true } });
    krok(); const Q = (await A.zapiszKarte(6, { masa: 30 })).patientId;
    const P = r1.patientId;
    await wyslij(A);
    krok(); await B.pobierz(); await A.pobierz();
    krok(); const n = await B.vault.savePatientNote({ patientId: P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść N1', category: 'inne' });
    krok(); await B.vault.removePatient(P);
    expect((await wyslij(B)).map((e) => e.kind), 'partia B').toEqual(['pnote', 'ptomb', 'pnotetomb']);
    krok();
    const sv = (await A.vault.getPatient(P)).snapshots.find((q) => q.snapshotId === r1.snapshotId);
    await A.vault.updateSnapshotPayload(P, r1.snapshotId, { ...sv.payload, user: { ...sv.payload.user, weight: 34.9 } }, { preserveSavedAt: true });
    krok();
    const wA = await A.pobierz();
    expect(wA.drain).toMatchObject({ stop: 'head', wlasne: 0, zastosowane: 3 });
    const partia = await wyslij(A);
    expect(partia.map((e) => e.kind), 'partia A (haki H1 i H2)').toEqual(['snap', 'pfull', 'pnote']);
    const et = new Map([[P, 'P'], [Q, 'Q'], [r1.snapshotId, 'v'], [r2.snapshotId, 'w'], [n.id, 'n']]);
    const kA = await kanon(A);
    const seqOd = (i) => partia[i].seq;
    const odbiorca = async (nazwa, o = {}) => {
      const d = await urz(s, nazwa, { zBlizniaka: o.z || B, klon: 'wszystko', wersja: o.wersja || WERSJA });
      await d.sync.detectApi();
      return d;
    };
    const wynik = {};
    // FIFO
    const Bf = await odbiorca('Bf');
    const wf = await Bf.pobierz();
    wynik.FIFO = { D: roznice(kA, await kanon(Bf), et), stop: wf.drain.stop, wlasne: wf.drain.wlasne, kwarantanna: (await Bf.kw()).length };
    // kwarantanna snap i pfull, bez aktualizacji (dwa drenaże w tym samym dokumencie)
    const Bk = await odbiorca('Bk');
    zepsujOdczyt(Bk, partia[0].env.iv);
    zepsujOdczyt(Bk, partia[1].env.iv);
    const wk = await Bk.pobierz();
    const wk2 = await Bk.pobierz();
    wynik.kwarantanna = {
      D: roznice(kA, await kanon(Bk), et), stop: wk.drain.stop, wlasne: wk.drain.wlasne, ponowione: wk2.drain.ponowione,
      wiersze: (await Bk.kw()).map((r) => [r.seq - seqOd(0), r.reason, r.appVersion]), applied: Number(Bk.applied()) - seqOd(0),
    };
    // aktualizacja: nowy dokument z nową wersją SW, odczyt sprawny
    const Bu = await odbiorca('Bu', { z: Bk, wersja: '1.1.901-b' });
    const wu = await Bu.pobierz();
    wynik.aktualizacja = {
      D: roznice(kA, await kanon(Bu), et), stop: wu.drain.stop, ponowione: wu.drain.ponowione,
      kwarantanna: (await Bu.kw()).length, applied: Number(Bu.applied()) - s.atrapa.slot().dz.head,
    };
    expect(wynik).toEqual({
      FIFO: { D: [], stop: 'head', wlasne: 3, kwarantanna: 0 },
      kwarantanna: {
        // jak p. 7d N1 („zwolnienie” snap i pfull): karta P z wizytami i notatka tylko u nadawcy, nagrobki tylko u odbiorcy
        D: ['karta P: tylko A', 'pnote n: tylko A', 'pnotetomb n: tylko B', 'ptomb P: tylko B', 'wersja P/v: tylko A', 'wersja P/w: tylko A'],
        stop: 'head', wlasne: 3, ponowione: 0,
        wiersze: [[0, 'decrypt', WERSJA], [1, 'decrypt', WERSJA]], applied: -1,
      },
      aktualizacja: { D: [], stop: 'head', ponowione: 2, kwarantanna: 0, applied: 0 },
    });
  }, 120_000);
});

