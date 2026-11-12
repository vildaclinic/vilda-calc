// P-SYNC-NADAWCA-WPIECIA (E2-PR4e1, plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.2 „Chowanie, ubicie, zamrożenie”, „Rotacja
// tożsamości”, 3.3 „Realtime”, wiersz 8e1): wpięcia nadawcy kolejki zdarzeń w integrację, realtime, chowanie strony,
// powrót sieci i rotację tożsamości. USPIONE jak nadawca: bez dziennika (VildaSync.isEventLogEnabled) integracja wysyła
// delty beaconem i stosuje ramki WebSocket jak dotąd.
//
// Prawdziwe vilda_sync.js i sejf na natywnym adapterze IndexedDB, atrapa workera v37a z eventsEnabled (ramki WebSocket
// w atrapa.ramki — kształt z src/durable/slot_hub.js). Integracja: prawdziwy vilda_sync_integration.js w osobnym oknie
// z sejfem urządzenia; VildaSync tego okna przekazuje isEventLogEnabled, scheduleFlush i applyRealtimeFrame do
// vilda_sync.js urządzenia, reszta to atrapy bez sieci. Zegar okna urządzenia jak w sync-zdarzenia-nadawca (odcinki
// od 1 s czekają na odpal). Dane wyłącznie FIKCYJNE.
//
// NW1 applyRealtimeFrame: ramka zdarzenia drugiego urządzenia — zastosowanie, kursor i appliedUpTo o jeden (seq =
//     kursor + 1), zmiana: true; następne pobranie pyta od nowego kursora i nic nie stosuje drugi raz.
// NW2 własne zdarzenie (pierścień slotu) — status 'wlasne', bez scalenia i bez kursora.
// NW3 seq z luką, ramka bez seq (stored:false), powtórka — zastosowanie bez ruchu kursora; drenaż dochodzi do reszty.
// NW4 nieczytelna ramka — kursor i kwarantanna bez zmian; drenaż daje kwarantannę.
// NW5 kwarantanna niepusta (appliedUpTo < kursor) — kursor o jeden, appliedUpTo bez zmian.
// NW6 sesja: sejf zablokowany — 'zablokowany', ramka bez payload — 'argument'; blokada w trakcie — 'sesja', kursor bez
//     zmian.
// NW7 uśpienie [zielony także na bazie]: bez dziennika — sześć ścieżek delty beaconem jak dotąd, bez scheduleFlush;
//     ramka z integracji idzie do applyEncryptedDelta (kursor bez zmian); applyRealtimeFrame → 'wylaczone'.
// NW8 integracja z dziennikiem: sześć ścieżek delty (karta, nagrobek karty, notatka, nagrobek notatki, notatka
//     biblioteki, jej nagrobek) — scheduleFlush zamiast beaconu; kolejka wychodzi jedną partią z nadawcy.
// NW9 integracja z dziennikiem: ramka do applyRealtimeFrame w całości, odświeżenie widoku (vilda:sync-merged) tylko
//     przy zmianie, bez applyEncryptedDelta.
// NW10 powrót sieci ('online'): odstęp po błędzie zerowany, wysyłka zaplanowana i wychodzi od razu.
// NW11 chowanie: pełna wysyłka z keepalive — najpierw POST /events z keepalive, potem PUT bloba (także przy odczycie
//     kolejki wolniejszym niż eksport; odczyt zawieszony — PUT po 500 ms); bez dziennika bez POST /events.
// NW12 rotacja (revokeAllDevices): kolejka wychodzi na stary slot przed rotateSyncIdentity; w ramce przez okno
//     nadrzędne; wysyłka zawieszona — rotacja rusza po 30 s; zaraz po rotacji nadawca zapomina materiał starego slotu
//     (keepalive), zatrzymanie po 401 i odstęp; dokument z poprzednią tożsamością oddaje rolę nadawcy.
// NW13 strażniki źródła.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera } from '../support/atrapa-workera-sync.mjs';
import { cisza, sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const FLAGA = 'vilda-event-log-v1';
const K_SYNC = 'vilda-sync-enabled-v1';
const K_WLASNE = 'vilda-sync-own-eids-v1:';
const K_APPLIED = 'vilda-sync-applied-v1:';
const K_KURSOR = 'vilda-sync-cursor-v1:';

afterEach(async () => {
  try { await sprzatnijUrzadzenia(); } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});

const krok = (ms = 60e3) => vi.setSystemTime(Date.now() + ms);

// Zegar okna: odcinki < 1 s biegną naprawdę, dłuższe czekają na odpal (wysyłka 1,5 s, odstępy, limit rotacji 30 s).
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
  };
}

async function urz(s, nazwa, o = {}) {
  const zegar = zegarOkna();
  const d = await utworzUrzadzenie({
    atrapa: s.atrapa, nazwa, magazynSejfu: 'natywny', krypto: true, kanal: true, zdarzeniaOkna: true,
    dodatki: {
      setTimeout: zegar.setTimeout, clearTimeout: zegar.clearTimeout,
      VildaAuditLog: { log() { return Promise.resolve(); } },
    },
    ...(o.indexedDB ? { indexedDB: o.indexedDB } : {}),
    ...(o.ramka ? { ramka: o.ramka } : {}),
    ...(o.zBlizniaka ? { zBlizniaka: o.zBlizniaka } : {}),
  });
  d.zegar = zegar;
  d.L = d.vault._eventLog;
  d.applied = () => d.win.localStorage.getItem(K_APPLIED + d.slotId);
  d.wlasne = () => JSON.parse(d.win.localStorage.getItem(K_WLASNE + d.slotId) || 'null');
  d.licz = async () => { const w = await d.L.outboxCount(); expect(w.ok === false ? w : 'ok', 'outboxCount').toBe('ok'); return w; };
  d.kw = async () => { const l = await d.L.quarantineList(); expect(l.ok, 'quarantineList').toBe(true); return l.wiersze; };
  d.pobierz = async () => { const w = await d.sync.syncPull({ czekajNaDrenaz: true }); await cisza(s.wszystkie()); return w; };
  d.notatka = async (patientId, i) => {
    const r = await d.vault.savePatientNote({ patientId, title: `Fikcyjna notatka ${i}`, body: `Fikcyjna treść ${i}.`, category: 'inne' });
    await d.L.emissionsSettled();
    return r;
  };
  d.tytuly = async (patientId) => (await d.vault.listPatientNotesForPatient(patientId)).map((n) => n.title).sort();
  s.lista.push(d);
  return d;
}
// Wysyłka kolejki jak nadawca (bez zegara): emissionsSettled → outboxTake → pushEvents → outboxAccept.
async function wyslij(d) {
  await d.L.emissionsSettled();
  const t = await d.L.outboxTake();
  expect(t.ok, 'outboxTake').toBe(true);
  if (!t.wiersze.length) return [];
  const p = await d.sync.pushEvents(t.wiersze.map((r) => ({ eid: r.eid, iv: r.env.iv, data: r.env.data })));
  expect(p.ok, `pushEvents ${JSON.stringify(p)}`).toBe(true);
  expect((await d.L.outboxAccept(p.accepted.map((a) => a.eid))).ok, 'outboxAccept').toBe(true);
  return t.wiersze.map((r, i) => ({ eid: r.eid, iv: r.env.iv, seq: p.accepted[i].seq }));
}
// Ramka WebSocket zdarzenia o danym eid (ostatnia).
const ramkaZdarzenia = (s, eid) => {
  const r = s.atrapa.ramki.filter((x) => x.ramka.type === 'delta' && x.ramka.eid === eid).at(-1);
  expect(r, `ramka ${eid}`).toBeTruthy();
  return structuredClone(r.ramka);
};
// Świat ramek: A (nowe konto, karta 1, rejestracja), B — bliźniak A. Flaga na obu, detectApi, karta 2 na A jako
// zdarzenie (o.flaga '1') albo delta beaconem, pierwsze pobranie B i pobranie A — kursory = headSeq.
async function swiatRamek(o = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: true, zegar: () => Date.now() });
  const s = { atrapa, lista: [] };
  s.wszystkie = () => s.lista;
  const A = await urz(s, 'A', { indexedDB: utworzIndexedDB() });
  s.P1 = (await A.zapiszKarte(1)).patientId;
  expect((await A.sync.syncPush()).action).toBe('registered');
  await cisza(s.wszystkie());
  const B = await urz(s, 'B', { zBlizniaka: A });
  Object.assign(s, { A, B });
  const flaga = o.flaga === undefined ? '1' : o.flaga;
  for (const d of [A, B]) {
    d.win.localStorage.setItem(FLAGA, flaga);
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
  await B.pobierz();
  s.head0 = atrapa.slot().dz.head;
  expect(s.head0, 'świat: rozruch dał zdarzenia').toBeGreaterThan(0);
  expect([A.kursor(), B.kursor()], 'świat: kursory po rozruchu').toEqual([s.head0, s.head0]);
  expect([A.sync.isEventLogEnabled(), B.sync.isEventLogEnabled()], 'świat: dziennik').toEqual([flaga === '1', flaga === '1']);
  return s;
}
// Świat nadawcy: A z włączoną synchronizacją (nadawca aktywny), flaga '1' (o.flaga), detectApi, pobranie. Kolejka pusta.
async function swiatNadawcy(o = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: true, zegar: () => Date.now() });
  const s = { atrapa, lista: [] };
  s.wszystkie = () => s.lista;
  const A = await urz(s, 'A', { indexedDB: utworzIndexedDB() });
  s.P1 = (await A.zapiszKarte(1)).patientId;
  expect((await A.sync.syncPush()).action).toBe('registered');
  await cisza(s.wszystkie());
  A.win.localStorage.setItem(FLAGA, o.flaga === undefined ? '1' : o.flaga);
  A.win.localStorage.setItem(K_SYNC, 'true');
  await A.sync.detectApi();
  krok(1000);
  await A.pobierz();
  expect(A.sync.isEventLogEnabled(), 'świat: dziennik').toBe(o.flaga === undefined || o.flaga === '1');
  if (A.sync.isEventLogEnabled()) expect((await A.licz()).total, 'świat: kolejka pusta').toBe(0);
  Object.assign(s, { A });
  return s;
}
const zEvents = (s, u) => s.atrapa.zadania.filter((z) => z.trasa === 'events' && (!u || z.urzadzenie === u));
async function czekajAz(f, opis, n = 5000) {
  for (let i = 0; i < n; i += 1) { if (await f()) return; await new Promise((r) => { setImmediate(r); }); }
  throw new Error('czekajAz: ' + opis);
}
// _eventLog sejfu jest zamrożony: obiekt pochodny z inną metodą outboxTake w miejscu _eventLog sejfu (vilda_sync.js
// czyta go przy każdej wysyłce przez Bpw_sejfKonta).
function podmienOutboxTake(d, fn) {
  const L = d.vault._eventLog;
  const w = Object.create(L);
  Object.defineProperty(w, 'outboxTake', { value: (...a) => fn(L, a) });
  d.vault._eventLog = w;
  expect(d.vault._eventLog, 'kontrola: podmiana').toBe(w);
}
// Rotacja udana w sejfie (atrapa rotateSyncIdentity), a następny krok revokeAllDevices (materiał nowego slotu) kończy
// się błędem TEST_STOP — stan nadawcy zaraz po rotacji, bez rejestracji nowego slotu.
function zatrzymajPoRotacji(d) {
  let obrot = false;
  vi.spyOn(d.vault, 'rotateSyncIdentity').mockImplementation(async () => { obrot = true; return { recoveryKey: 'FIKCYJNY-KLUCZ' }; });
  const mat = d.vault.getSyncMaterial;
  vi.spyOn(d.vault, 'getSyncMaterial').mockImplementation(async (...a) => {
    if (obrot) throw Object.assign(new Error('atrapa: koniec po rotacji'), { code: 'TEST_STOP' });
    return mat.apply(d.vault, a);
  });
}
function zepsujOdczyt(d, iv) {
  const cel = Buffer.from(iv, 'base64');
  return d.krypto.przed({ metoda: 'decrypt', gdy: (m, a) => !!(a[0] && a[0].iv && Buffer.from(a[0].iv).equals(cel)) }, () => {
    throw new DOMException('atrapa: uszkodzony szyfrogram', 'OperationError');
  });
}

// Prawdziwy vilda_sync_integration.js w osobnym oknie z sejfem urządzenia d. VildaSync okna: isEventLogEnabled,
// scheduleFlush i applyRealtimeFrame urządzenia (z zapisem wywołań), reszta bez sieci. Beacony i fetch zapisywane.
async function oknoIntegracji(d) {
  const wywolania = [];
  const wysylki = [];
  const zdarzenia = [];
  const magazyn = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); },
      key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
    };
  };
  const syncOkna = {
    isEventLogEnabled: () => d.sync.isEventLogEnabled(),
    scheduleFlush: () => { wywolania.push('scheduleFlush'); return d.sync.scheduleFlush(); },
    applyRealtimeFrame: (fr) => {
      wywolania.push('applyRealtimeFrame');
      const w = d.sync.applyRealtimeFrame(fr);
      syncOkna.ostatni = w;
      return w;
    },
    syncPush: () => Promise.resolve(null), syncPull: () => Promise.resolve(null), onSyncStart() {}, onSyncComplete() {}, onSyncError() {},
  };
  const win = {
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init ? init.detail : undefined; } },
    localStorage: magazyn(), sessionStorage: magazyn(), Blob,
    navigator: { sendBeacon(u) { wysylki.push({ droga: 'beacon', u: String(u) }); return true; } },
    fetch: async (u) => { wysylki.push({ droga: 'fetch', u: String(u) }); return { ok: false, status: 503 }; },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, dispatchEvent(e) { zdarzenia.push(e.type); return true; }, hidden: false },
    VildaVault: d.vault, VILDA_SYNC_WORKER_URL: d.adres, VildaSync: syncOkna,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem(K_SYNC, 'true');
  loadBrowserScript('vilda_sync_integration.js', win);
  // Start integracji po odblokowaniu (WorkspaceIntegrationStart → tryb legacy) jest asynchroniczny.
  for (let i = 0; i < 50; i += 1) await new Promise((r) => { setImmediate(r); });
  return { win, wywolania, wysylki, zdarzenia, syncOkna, delty: () => wysylki.filter((w) => /\/delta$/.test(w.u)) };
}
// Sześć zmian, każda w innej ścieżce delty integracji: karta (gt), notatka (Bt), nagrobek notatki (Ut), notatka
// biblioteki (Qv0), jej nagrobek (Qv1), nagrobek karty (At).
const BUDOWNICZOWIE = ['buildPatientDelta', 'buildNoteDelta', 'buildNoteTombstoneDelta', 'buildLibraryNoteDelta', 'buildLibraryNoteTombstoneDelta', 'buildTombstoneDelta'];
const SCIEZKI = ['karta', 'notatka', 'nagrobek notatki', 'notatka biblioteki', 'nagrobek notatki biblioteki', 'nagrobek karty'];
async function szescZmian(d, s, poKazdej = async () => {}) {
  const k = await d.zapiszKarte(5);
  await poKazdej('karta');
  const n = await d.vault.savePatientNote({ patientId: s.P1, title: 'Fikcyjna notatka W', body: 'Fikcyjna treść.', category: 'inne' });
  await poKazdej('notatka');
  await d.vault.removePatientNote(n.id);
  await poKazdej('nagrobek notatki');
  const b = await d.vault.saveNote({ title: 'Fikcyjna notatka biblioteki', body: 'Fikcyjna treść.' });
  await poKazdej('notatka biblioteki');
  await d.vault.removeNote(b.id);
  await poKazdej('nagrobek notatki biblioteki');
  await d.vault.removePatient(k.patientId);
  await poKazdej('nagrobek karty');
  await d.L.emissionsSettled();
}

describe('P-SYNC-NADAWCA-WPIECIA — ramki WebSocket przy dzienniku (E2-PR4e1)', () => {
  it('NW1 [czerwony na bazie]: ramka zdarzenia drugiego urządzenia — zastosowanie, kursor i appliedUpTo o jeden, zmiana; następne pobranie od nowego kursora bez ponownego zastosowania', async () => {
    const s = await swiatRamek();
    const { A, B } = s;
    expect(B.applied(), 'świat: appliedUpTo = kursor').toBe(String(s.head0));
    krok();
    await A.notatka(s.P2, 1);
    const [z] = await wyslij(A);
    expect(z.seq).toBe(s.head0 + 1);
    const fr = ramkaZdarzenia(s, z.eid);
    expect(fr).toMatchObject({ type: 'delta', seq: z.seq, eid: z.eid, payload: { iv: z.iv } });
    const w = await B.sync.applyRealtimeFrame(fr);
    expect(w).toEqual({ ok: true, powod: null, status: 'applied', kursor: true, zmiana: true });
    expect([B.kursor(), B.applied()]).toEqual([z.seq, String(z.seq)]);
    expect(await B.tytuly(s.P2)).toEqual(['Fikcyjna notatka 1']);
    // powtórka tej samej ramki: bez zmiany i bez kursora
    expect(await B.sync.applyRealtimeFrame(fr)).toMatchObject({ ok: true, status: 'applied', kursor: false, zmiana: false });
    const od = s.atrapa.zadania.length;
    await B.pobierz();
    const ch = s.atrapa.zadania.slice(od).filter((x) => x.urzadzenie === 'B' && x.trasa === 'changes');
    expect(ch.length, 'pobranie pyta o zmiany').toBeGreaterThan(0);
    expect(ch[0].zapytanie, 'od nowego kursora').toContain(`since=${z.seq}`);
    expect([B.kursor(), await B.tytuly(s.P2)]).toEqual([z.seq, ['Fikcyjna notatka 1']]);
  });

  it('NW2 [czerwony na bazie]: własne zdarzenie (pierścień slotu) — status wlasne, bez scalenia i bez kursora', async () => {
    const s = await swiatRamek();
    const { A } = s;
    krok();
    await A.notatka(s.P2, 1);
    const [z] = await wyslij(A);
    expect(A.wlasne(), 'pierścień własnych po wysyłce').toContain(z.eid);
    const k0 = [A.kursor(), A.applied()];
    const fr = ramkaZdarzenia(s, z.eid);
    expect(fr.seq, 'kontrola: seq = kursor + 1').toBe(k0[0] + 1);
    const scalenia = vi.spyOn(A.vault, 'applyEncryptedDelta');
    expect(await A.sync.applyRealtimeFrame(fr)).toEqual({ ok: true, powod: null, status: 'wlasne', kursor: false, zmiana: false });
    expect([A.kursor(), A.applied()]).toEqual(k0);
    expect(scalenia).not.toHaveBeenCalled();
  });

  it('NW3 [czerwony na bazie]: seq z luką, ramka bez seq (stored:false) — zastosowanie bez ruchu kursora; drenaż dochodzi do reszty', async () => {
    const s = await swiatRamek();
    const { A, B } = s;
    krok();
    await A.notatka(s.P2, 1);
    await A.notatka(s.P2, 2);
    const [z1, z2] = await wyslij(A);
    expect(z2.seq).toBe(z1.seq + 1);
    const w2 = await B.sync.applyRealtimeFrame(ramkaZdarzenia(s, z2.eid));
    expect(w2, 'luka (seq = kursor + 2)').toEqual({ ok: true, powod: null, status: 'applied', kursor: false, zmiana: true });
    expect([B.kursor(), B.applied()]).toEqual([s.head0, String(s.head0)]);
    expect(await B.tytuly(s.P2)).toEqual(['Fikcyjna notatka 2']);
    const bezSeq = { ...ramkaZdarzenia(s, z1.eid), stored: false };
    delete bezSeq.seq;
    expect(await B.sync.applyRealtimeFrame(bezSeq), 'bez seq').toEqual({ ok: true, powod: null, status: 'applied', kursor: false, zmiana: true });
    expect(await B.sync.applyRealtimeFrame({ ...ramkaZdarzenia(s, z1.eid), seq: String(z1.seq) }), 'seq nie liczba').toMatchObject({ kursor: false });
    expect(B.kursor()).toBe(s.head0);
    await B.pobierz();
    expect([B.kursor(), B.applied()], 'drenaż dochodzi do headSeq').toEqual([z2.seq, String(z2.seq)]);
    expect(await B.tytuly(s.P2)).toEqual(['Fikcyjna notatka 1', 'Fikcyjna notatka 2']);
  });

  it('NW4 [czerwony na bazie]: nieczytelna ramka — kursor i kwarantanna bez zmian; drenaż daje kwarantannę', async () => {
    const s = await swiatRamek();
    const { A, B } = s;
    krok();
    await A.notatka(s.P2, 1);
    const [z] = await wyslij(A);
    zepsujOdczyt(B, z.iv);
    expect(await B.sync.applyRealtimeFrame(ramkaZdarzenia(s, z.eid))).toEqual({ ok: true, powod: null, status: 'unreadable', kursor: false, zmiana: false });
    expect([B.kursor(), B.applied(), (await B.kw()).length]).toEqual([s.head0, String(s.head0), 0]);
    zepsujOdczyt(B, z.iv);
    await B.pobierz();
    expect((await B.kw()).map((q) => [q.seq, q.eid]), 'drenaż: kwarantanna').toEqual([[z.seq, z.eid]]);
    expect([B.kursor(), B.applied()]).toEqual([z.seq, String(z.seq - 1)]);
  });

  it('NW5 [czerwony na bazie]: kwarantanna niepusta — kursor o jeden, appliedUpTo bez zmian', async () => {
    const s = await swiatRamek();
    const { A, B } = s;
    krok();
    await A.notatka(s.P2, 1);
    const [z1] = await wyslij(A);
    zepsujOdczyt(B, z1.iv);
    await B.pobierz();
    expect([B.kursor(), B.applied(), (await B.kw()).length], 'świat: z1 w kwarantannie').toEqual([z1.seq, String(z1.seq - 1), 1]);
    krok();
    await A.notatka(s.P2, 2);
    const [z2] = await wyslij(A);
    expect(await B.sync.applyRealtimeFrame(ramkaZdarzenia(s, z2.eid))).toMatchObject({ ok: true, status: 'applied', kursor: true, zmiana: true });
    expect([B.kursor(), B.applied()]).toEqual([z2.seq, String(z1.seq - 1)]);
  });

  it('NW6 [czerwony na bazie]: sejf zablokowany — zablokowany; ramka bez payload — argument; blokada w trakcie — sesja, kursor bez zmian', async () => {
    const s = await swiatRamek();
    const { A, B } = s;
    krok();
    await A.notatka(s.P2, 1);
    const [z] = await wyslij(A);
    const fr = ramkaZdarzenia(s, z.eid);
    expect(await B.sync.applyRealtimeFrame({ type: 'delta', seq: z.seq })).toEqual({ ok: false, powod: 'argument' });
    expect(await B.sync.applyRealtimeFrame(null)).toEqual({ ok: false, powod: 'argument' });
    await B.zablokuj();
    expect(await B.sync.applyRealtimeFrame(fr)).toEqual({ ok: false, powod: 'zablokowany' });
    await B.odblokuj();
    // blokada sejfu w trakcie odszyfrowania zdarzenia
    const cel = Buffer.from(z.iv, 'base64');
    let raz = false;
    B.krypto.przed({ metoda: 'decrypt', gdy: (m, a) => !raz && !!(a[0] && a[0].iv && Buffer.from(a[0].iv).equals(cel)) }, () => {
      raz = true;
      B.vault.lock('manual');
    });
    const w = await B.sync.applyRealtimeFrame(fr);
    expect(raz, 'kontrola: blokada w trakcie').toBe(true);
    expect(w.ok).toBe(false);
    expect(w.powod).toBe('sesja');
    expect(B.kursor()).toBe(s.head0);
  });
});

describe('P-SYNC-NADAWCA-WPIECIA — integracja: beacony i ramki (E2-PR4e1)', () => {
  it('NW7 [zielony także na bazie]: bez dziennika — sześć ścieżek delty buduje i wysyła deltę beaconem, bez scheduleFlush; ramka do applyEncryptedDelta, kursor bez zmian', async () => {
    const s = await swiatRamek({ flaga: '0' });
    const { A, B } = s;
    const okA = await oknoIntegracji(A);
    const bud = BUDOWNICZOWIE.map((m) => vi.spyOn(A.vault, m));
    krok();
    await szescZmian(A, s, () => cisza(s.wszystkie()));
    await czekajAz(() => bud.every((sp) => sp.mock.calls.length > 0), 'każda ścieżka buduje deltę');
    await cisza(s.wszystkie());
    expect(bud.map((sp) => sp.mock.calls.length), 'każda ścieżka buduje deltę raz').toEqual([1, 1, 1, 1, 1, 1]);
    // Bez dziennika jak dotąd: delta, którą sejf zbudował, idzie beaconem. Notatka usunięta, zanim integracja zbudowała
    // deltę jej zapisu, nie ma już delty zapisu (null) — idzie jej nagrobek.
    const zbudowane = (await Promise.all(bud.map((sp) => Promise.resolve(sp.mock.results[0].value)))).filter((x) => x && x.data).length;
    expect(zbudowane, 'kontrola: sejf zbudował delty').toBeGreaterThanOrEqual(5);
    await czekajAz(() => okA.delty().length === zbudowane, 'delty beaconem');
    expect(new Set(okA.delty().map((w) => w.droga))).toEqual(new Set(['beacon']));
    expect(okA.wywolania).toEqual([]);
    // ramka: delta karty A (beacon uprzęży) → integracja B → applyEncryptedDelta
    const okB = await oknoIntegracji(B);
    const k = await A.zapiszKarte(7);
    expect(await A.wyslijDelteKarty(k.patientId)).toBeTruthy();
    await cisza(s.wszystkie());
    const r = structuredClone(s.atrapa.ramki.filter((x) => x.ramka.type === 'delta').at(-1).ramka);
    const scalenia = vi.spyOn(B.vault, 'applyEncryptedDelta');
    const k0 = B.kursor();
    okB.win.VildaSyncIntegration.applyDelta(r.payload, r);
    await czekajAz(async () => !!(await B.vault.getPatient(k.patientId).catch(() => null)), 'karta z ramki');
    expect(scalenia).toHaveBeenCalledTimes(1);
    expect(okB.wywolania).toEqual([]);
    expect(B.kursor()).toBe(k0);
    if (typeof B.sync.applyRealtimeFrame === 'function') expect(await B.sync.applyRealtimeFrame(r)).toEqual({ ok: false, powod: 'wylaczone' });
  });

  it('NW8 [czerwony na bazie]: z dziennikiem — sześć ścieżek delty woła scheduleFlush zamiast budowy delty i beaconu; kolejka wychodzi z nadawcy', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    const ok = await oknoIntegracji(A);
    const bud = BUDOWNICZOWIE.map((m) => vi.spyOn(A.vault, m));
    krok();
    const poKazdej = [];
    await szescZmian(A, s, async (co) => { await cisza(s.wszystkie()); poKazdej.push([co, ok.wywolania.length > 0]); ok.wywolania.length = 0; });
    expect(poKazdej, 'każda ścieżka woła scheduleFlush').toEqual(SCIEZKI.map((co) => [co, true]));
    expect(bud.map((sp) => sp.mock.calls.length), 'bez budowy delty').toEqual([0, 0, 0, 0, 0, 0]);
    expect(ok.delty(), 'bez delt beaconem i fetch').toEqual([]);
    expect((await A.licz()).pending, 'zmiany w kolejce').toBeGreaterThan(0);
    expect(A.zegar.oczekujace(), 'wysyłka zaplanowana (1,5 s)').toContain(1500);
    const przed = zEvents(s, 'A').length;
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'kolejka wysłana');
    expect(zEvents(s, 'A').length - przed, 'jedna partia').toBe(1);
  });

  it('NW9 [czerwony na bazie]: z dziennikiem — ramka do applyRealtimeFrame w całości; vilda:sync-merged tylko przy zmianie; bez applyEncryptedDelta', async () => {
    const s = await swiatRamek();
    const { A, B } = s;
    const okB = await oknoIntegracji(B);
    krok();
    await A.notatka(s.P2, 1);
    const [z] = await wyslij(A);
    const fr = ramkaZdarzenia(s, z.eid);
    const scalenia = vi.spyOn(B.vault, 'applyEncryptedDelta');
    const ile = () => okB.zdarzenia.filter((t) => t === 'vilda:sync-merged').length;
    const m0 = ile();
    okB.win.VildaSyncIntegration.applyDelta(fr.payload, fr);
    expect(okB.wywolania).toEqual(['applyRealtimeFrame']);
    expect(await okB.syncOkna.ostatni).toMatchObject({ status: 'applied', kursor: true, zmiana: true });
    await czekajAz(() => ile() > m0, 'odświeżenie widoku');
    expect(ile() - m0).toBe(1);
    expect(B.kursor()).toBe(z.seq);
    // powtórka: bez zmiany — bez odświeżenia
    okB.win.VildaSyncIntegration.applyDelta(fr.payload, fr);
    expect(await okB.syncOkna.ostatni).toMatchObject({ status: 'applied', zmiana: false });
    await cisza(s.wszystkie());
    expect(ile() - m0).toBe(1);
    expect(scalenia).not.toHaveBeenCalled();
    // wywołanie bez ramki (stare wołanie applyDelta(payload)) — ścieżka delty jak dotąd
    okB.win.VildaSyncIntegration.applyDelta(fr.payload);
    await czekajAz(() => scalenia.mock.calls.length === 1, 'applyEncryptedDelta bez ramki');
    expect(okB.wywolania.filter((x) => x === 'applyRealtimeFrame')).toHaveLength(2);
  });
});

describe('P-SYNC-NADAWCA-WPIECIA — powrót sieci, chowanie, rotacja (E2-PR4e1)', () => {
  it('NW10 [czerwony na bazie]: online — odstęp po błędzie zerowany, wysyłka zaplanowana i wychodzi', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    s.atrapa.usterka({ gdy: { trasa: 'events', ile: 1 }, siec: true });
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'odstep', ponowZaMs: 2000 });
    expect(await A.sync.flushOutbox(), 'w odstępie').toMatchObject({ ok: false, powod: 'odstep' });
    A.zegar.odpal(1500);
    const przed = zEvents(s, 'A').length;
    A.zdarzenieOkna('online');
    expect(A.zegar.oczekujace(), 'wysyłka zaplanowana').toContain(1500);
    A.zegar.odpal(1500);
    await czekajAz(async () => (await A.licz()).total === 0, 'wysłane po online');
    expect(zEvents(s, 'A').length - przed).toBe(1);
  });

  it('NW11 [czerwony na bazie]: chowanie — pełna wysyłka z keepalive najpierw POST /events z keepalive, potem PUT bloba', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    await A.notatka(s.P1, 2);
    const od = s.atrapa.zadania.length;
    await A.sync.syncPush({ keepalive: true });
    await czekajAz(async () => (await A.licz()).total === 0, 'zdarzenia przyjęte');
    const z = s.atrapa.zadania.slice(od).filter((x) => x.urzadzenie === 'A' && (x.trasa === 'events' || x.trasa === 'blob-put'));
    expect(z.map((x) => `${x.metoda} ${x.trasa} ${x.keepalive}`)).toEqual(['POST events true', 'PUT blob-put true']);
  });

  it('NW11c [czerwony na bazie]: chowanie — odczyt kolejki wolniejszy niż eksport: PUT z keepalive czeka, aż POST /events wyjdzie', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    podmienOutboxTake(A, async (L, a) => {
      await new Promise((r) => { setTimeout(r, 200); });
      return L.outboxTake(...a);
    });
    const od = s.atrapa.zadania.length;
    await A.sync.syncPush({ keepalive: true });
    await czekajAz(async () => (await A.licz()).total === 0, 'zdarzenia przyjęte');
    const z = s.atrapa.zadania.slice(od).filter((x) => x.urzadzenie === 'A' && (x.trasa === 'events' || x.trasa === 'blob-put'));
    expect(z.map((x) => `${x.metoda} ${x.trasa} ${x.keepalive}`)).toEqual(['POST events true', 'PUT blob-put true']);
  });

  it('NW11d [czerwony na bazie]: chowanie — odczyt kolejki zawieszony: PUT z keepalive rusza po 500 ms', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    let pusc = null;
    podmienOutboxTake(A, (L, a) => new Promise((r) => { pusc = () => r(L.outboxTake(...a)); }));
    const trafienieOd = s.atrapa.zadania.length;
    const od = s.atrapa.zadania.length;
    const p = A.sync.syncPush({ keepalive: true });
    const putKeepalive = () => s.atrapa.zadania.slice(od).filter((x) => x.urzadzenie === 'A' && x.trasa === 'blob-put' && x.keepalive);
    for (let i = 0; i < 40 && !putKeepalive().length; i += 1) await new Promise((r) => { setTimeout(r, 50); });
    expect(pusc, 'kontrola: zdarzenia najpierw — odczyt kolejki zaczęty').toBeTypeOf('function');
    expect(putKeepalive(), 'PUT bez czekania na zawieszony odczyt').toHaveLength(1);
    expect(trafienieOd).toBe(od);
    expect(zEvents(s, 'A').filter((x) => x.nr >= od), 'zdarzenia jeszcze nie wyszły').toEqual([]);
    await p;
    if (pusc) pusc();
    await cisza(s.wszystkie());
  });

  it('NW11b [zielony także na bazie]: chowanie bez dziennika — PUT bloba z keepalive, bez POST /events', async () => {
    const s = await swiatNadawcy({ flaga: '0' });
    const { A } = s;
    krok();
    await A.zapiszKarte(2);
    const od = s.atrapa.zadania.length;
    await A.sync.syncPush({ keepalive: true });
    await cisza(s.wszystkie());
    const z = s.atrapa.zadania.slice(od).filter((x) => x.urzadzenie === 'A' && (x.trasa === 'events' || x.trasa === 'blob-put'));
    expect(z.map((x) => `${x.metoda} ${x.trasa} ${x.keepalive}`)).toEqual(['PUT blob-put true']);
  });

  it('NW12 [czerwony na bazie]: rotacja — kolejka wychodzi na stary slot przed rotateSyncIdentity', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    const stary = s.atrapa.zadania.find((x) => x.urzadzenie === 'A' && x.trasa === 'register').slot;
    const przed = zEvents(s, 'A').length;
    const kolejnosc = [];
    vi.spyOn(A.vault, 'rotateSyncIdentity').mockImplementation(async () => {
      kolejnosc.push([(await A.licz()).total, zEvents(s, 'A').slice(przed).map((x) => [x.metoda, x.status, x.slot])]);
      throw Object.assign(new Error('atrapa: koniec przed rotacją'), { code: 'TEST_STOP' });
    });
    await expect(A.sync.revokeAllDevices(A.konto.haslo)).rejects.toMatchObject({ code: 'TEST_STOP' });
    expect(kolejnosc, 'przed rotacją: kolejka pusta, POST /events na stary slot').toEqual([[0, [['POST', 200, stary]]]]);
  });

  it('NW12b [czerwony na bazie]: rotacja w ramce — wysyłka przez flushOutbox okna nadrzędnego przed rotateSyncIdentity', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    const R = await urz(s, 'R', { ramka: A });
    expect(R.sync.isEventLogEnabled(), 'ramka: włącznik z góry').toBe(true);
    krok();
    await R.notatka(s.P1, 1);
    const flushGory = vi.spyOn(A.sync, 'flushOutbox');
    const kolejnosc = [];
    vi.spyOn(R.vault, 'rotateSyncIdentity').mockImplementation(async () => {
      kolejnosc.push([flushGory.mock.calls.length, (await R.licz()).total, zEvents(s, 'A').length]);
      throw Object.assign(new Error('atrapa: koniec przed rotacją'), { code: 'TEST_STOP' });
    });
    await expect(R.sync.revokeAllDevices(R.konto.haslo)).rejects.toMatchObject({ code: 'TEST_STOP' });
    expect(kolejnosc, 'flushOutbox góry raz, kolejka pusta, wysłał nadawca (A)').toEqual([[1, 0, 1]]);
    expect(zEvents(s, 'R'), 'ramka sama nie wysyła').toEqual([]);
  });

  it('NW12c [czerwony na bazie]: rotacja — wysyłka zawieszona: rotateSyncIdentity rusza po 30 s', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    const brama = s.atrapa.wstrzymaj({ trasa: 'events' });
    const rot = vi.spyOn(A.vault, 'rotateSyncIdentity').mockImplementation(async () => {
      throw Object.assign(new Error('atrapa: koniec przed rotacją'), { code: 'TEST_STOP' });
    });
    const p = A.sync.revokeAllDevices(A.konto.haslo);
    p.catch(() => {});
    await brama.osiagnieta;
    await czekajAz(() => A.zegar.oczekujace().includes(30000), 'limit 30 s');
    expect(rot).not.toHaveBeenCalled();
    A.zegar.odpal(30000);
    await expect(p).rejects.toMatchObject({ code: 'TEST_STOP' });
    expect(rot).toHaveBeenCalledTimes(1);
    brama.zwolnij();
    await cisza(s.wszystkie());
  });
});

describe('P-SYNC-NADAWCA-WPIECIA — stan nadawcy po rotacji (E2-PR4e1)', () => {
  it('NW12d [czerwony na bazie]: po rotacji nadawca zapomina materiał starego slotu — flushKeepalive bez żądania na stary slot', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    expect(await A.sync.flushOutbox(), 'kontrola: materiał slotu w pamięci nadawcy').toMatchObject({ ok: true, wyslane: expect.any(Number) });
    zatrzymajPoRotacji(A);
    await expect(A.sync.revokeAllDevices(A.konto.haslo)).rejects.toMatchObject({ code: 'TEST_STOP' });
    vi.mocked(A.vault.getSyncMaterial).mockRestore();
    krok();
    await A.notatka(s.P1, 2);
    const przed = zEvents(s, 'A').length;
    expect(await A.sync.flushKeepalive()).toEqual({ ok: false, powod: 'pomin' });
    expect(zEvents(s, 'A')).toHaveLength(przed);
    expect((await A.licz()).pending, 'wiersz czeka na zwykłą wysyłkę').toBeGreaterThan(0);
  });

  it('NW12f [czerwony na bazie]: po rotacji odstęp po błędzie zerowany — wysyłka od razu', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    s.atrapa.usterka({ gdy: { trasa: 'events', ile: 1 }, siec: true });
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'odstep', ponowZaMs: 2000 });
    zatrzymajPoRotacji(A);
    await expect(A.sync.revokeAllDevices(A.konto.haslo)).rejects.toMatchObject({ code: 'TEST_STOP' });
    vi.mocked(A.vault.getSyncMaterial).mockRestore();
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: true, powod: null, wyslane: 1 });
  });

  it('NW12g [czerwony na bazie]: dokument z poprzednią tożsamością (rotacja w innej karcie) oddaje rolę nadawcy — bez wysyłki, bicia serca i keepalive', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    expect(await A.sync.flushOutbox(), 'kontrola: A jest nadawcą').toMatchObject({ ok: true });
    const kBicia = 'vilda-outbox-heartbeat-v1:' + A.konto.userId;
    const bicie0 = A.win.localStorage.getItem(kBicia);
    // inna karta obróciła tożsamość: znacznik slotu poprzedniej tożsamości we wspólnym localStorage (P-SYNC-ROTACJA-KART)
    A.win.localStorage.setItem('vilda-sync-revoked-v1:' + A.slotId, new Date().toISOString());
    krok();
    await A.notatka(s.P1, 2);
    const przed = zEvents(s, 'A').length;
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'inny-nadawca' });
    expect(await A.sync.flushKeepalive()).toEqual({ ok: false, powod: 'pomin' });
    expect(A.zegar.odpal(20000), 'kontrola: zegar bicia serca').toBeGreaterThan(0);
    await cisza(s.wszystkie());
    expect(zEvents(s, 'A'), 'bez wysyłki na stary slot').toHaveLength(przed);
    expect(A.win.localStorage.getItem(kBicia), 'bicie serca bez odświeżenia (po 90 s przejmie inny dokument)').toBe(bicie0);
  });

  it('NW12e [czerwony na bazie]: po rotacji zatrzymanie po 401 zdjęte', async () => {
    const s = await swiatNadawcy();
    const { A } = s;
    krok();
    await A.notatka(s.P1, 1);
    s.atrapa.usterka({ gdy: { trasa: 'events', ile: 1 }, zmien: (o) => ({ ...o, status: 401, cialo: JSON.stringify({ error: { code: 'invalid_credentials' } }) }) });
    expect(await A.sync.flushOutbox()).toMatchObject({ ok: false, powod: 'zatrzymany', kod: 'AUTH_FAILED' });
    zatrzymajPoRotacji(A);
    await expect(A.sync.revokeAllDevices(A.konto.haslo)).rejects.toMatchObject({ code: 'TEST_STOP' });
    vi.mocked(A.vault.getSyncMaterial).mockRestore();
    expect((await A.sync.flushOutbox()).powod, 'bez zatrzymania po 401').not.toBe('zatrzymany');
  });
});

describe('P-SYNC-NADAWCA-WPIECIA — strażniki źródła (E2-PR4e1)', () => {
  const sync = czytaj('vilda_sync.js');
  const integ = czytaj('vilda_sync_integration.js');
  const blok = sync.slice(sync.indexOf('/* P-SYNC-NADAWCA-WPIECIA (E2-PR4e1;'), sync.indexOf('/* P-SYNC-STRONY (E2-PR1;'));

  it('NW13 [czerwony na bazie]: blok wpięć przed P-SYNC-STRONY; ramka nie rzuca, kursor tylko w górę, appliedUpTo tylko z pustą kwarantanną; eksport', () => {
    expect(sync.indexOf('/* P-SYNC-NADAWCA-WPIECIA (E2-PR4e1;')).toBeGreaterThan(0);
    expect(blok.length).toBeGreaterThan(500);
    const ramka = wytnijFunkcje(blok, 'Bpr_ramka');
    expect(ramka.indexOf('try {'), 'całe ciało w try').toBeLessThan(ramka.indexOf('Bze_isEventLogEnabled'));
    expect(ramka).toContain("return { ok: !1, powod: 'wylaczone' }");
    expect(ramka.match(/Kt\(/g), 'kursor tylko przez Bdz_kursorWGore').toBeNull();
    expect(ramka).toContain('Bdz_kursorWGore(slot, fr.seq)');
    expect(ramka).toContain('Number.isInteger(fr.seq) && fr.seq === kursor + 1');
    expect(ramka).toContain('getItem(Bzd_K_APPLIED + slot) === String(kursor)');
    expect(ramka).toContain('Bzd_wlasneCzytaj(slot).has(eid)');
    expect(ramka.indexOf('Bzd_wlasneCzytaj'), 'własne przed zastosowaniem').toBeLessThan(ramka.indexOf('await L.applyEncryptedEvent('));
    expect(sync).toMatch(/,applyRealtimeFrame:Bpr_ramka\}/);
    // chowanie: ht woła zdarzenia przed pełną wysyłką; PUT keepalive czeka na nie
    expect(sync).toContain('t&&t.keepalive&&Bns_najpierwZdarzenia();');
    expect(sync).toContain('mt.keepalive&&await Bns_poZdarzeniach();var z=await f(d+"/v1/slots/"+n+"/blob",mt,Bgz_czas(h));');
    // rotacja: wysyłka kolejki przed rotateSyncIdentity
    expect(sync).toContain('Brv_stop(r);await Bns_przedRotacja();Brv_stop(r);var i=await e.rotateSyncIdentity(t);');
    expect(wytnijFunkcje(blok, 'Bns_przedRotacja')).toContain('Bns_ROTACJA_MS');
    expect(sync).toContain('var i=await e.rotateSyncIdentity(t);Bws_obrot=!0;Bns_poRotacji();');
    expect(wytnijFunkcje(sync, 'Bns_rola')).toContain('Brv_jest(Bns_material.slotId)) return \'inny\';');
    expect(blok).toContain('Bns_ROTACJA_MS = 30000');
    // online w nadawcy
    expect(sync).toContain("o.addEventListener('online', function () { Bns_odstep = { n: 0, do: 0 }; Bns_planuj(); });");
  });

  it('NW13b [czerwony na bazie]: integracja — sześć ścieżek delty zaczyna od Bwp_zamiastDelty, ramka najpierw do applyRealtimeFrame; realtime podaje ramkę', () => {
    for (const f of ['gt', 'At', 'Bt', 'Ut', 'Qv0', 'Qv1']) {
      expect(integ, f).toContain(`function ${f}(t){try{if(Bwp_zamiastDelty())return;if(!PatientClinicalLegacyAllowed("direct-delta"))return;`);
    }
    expect(integ.match(/if\(Bwp_zamiastDelty\(\)\)return;/g)).toHaveLength(6);
    expect(integ).toContain('function Ft(t,Bwp_r){try{if(Bwp_r&&typeof Bwp_r=="object"&&Bwp_dziennik()&&typeof n.VildaSync.applyRealtimeFrame=="function"){');
    expect(integ).toContain('t.isEventLogEnabled()===!0');
    expect(czytaj('vilda_realtime.js')).toContain('s.applyDelta(a.payload,a)');
  });
});
