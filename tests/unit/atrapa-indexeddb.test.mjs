// Samotest atrapy IndexedDB (tests/support/atrapa-indexeddb.mjs) — narzędzie testów magazynu kolejki, zielone niezależnie
// od kodu produktu.
//   A1  scenariusze p1–p34 (tests/support/atrapa-indexeddb-scenariusze.mjs) na atrapie = literał SLAD_CHROMIUM nagrany
//       w prawdziwym Chromium; ten sam scenariusz sprawdza e2e w Chromium z CI (atrapa-indexeddb-zgodnosc.spec.mjs).
//   A2  prawdziwy sejf (adapter IndexedDB sejfu) na atrapie: konto, dwie wersje karty, kosz, „Przywróć”, notatka, lista,
//       eksport, blokada, odblokowanie.
//   A3  usterki i wstrzymania: QuotaExceededError przy zapisie i przy zatwierdzaniu (cofnięcie całej transakcji), stan
//       zatwierdzania, versionchange po zatwierdzeniu; pozostałe punkty sterowania.
//   A4  dwa okna na jednej atrapie: versionchange przy kasowaniu z drugiego okna, harmonogram readwrite/readonly między
//       połączeniami.
//   A5  klonuj() niezależny od oryginału.
//   A6  błędy: DataError, NotFoundError, InvalidStateError po close(); baza „z innej wersji” (utworz) i zerwanie połączenia.
//   A7  surowość: oczekiwanie na zegar (przy obsłudze trwającej 2 ms) i na crypto.subtle zawsze dezaktywuje transakcję,
//       łańcuch 50 mikrozadań — nigdy.
// Dane wyłącznie fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';
import { SLAD_CHROMIUM, scenariuszeIDB } from '../support/atrapa-indexeddb-scenariusze.mjs';
import { HASLO_A, naglowek, okno } from './sesja-zapisu-uprzaz.mjs';

afterEach(() => { vi.unstubAllGlobals(); });

const otworz = (idb, n, v, upg) => new Promise((ok, zle) => {
  const r = v === undefined ? idb.open(n) : idb.open(n, v);
  r.onupgradeneeded = () => { if (upg) upg(r.result, r); };
  r.onsuccess = () => { ok(r.result); };
  r.onerror = (e) => { e.preventDefault(); zle(r.error); };
});
const req = (r) => new Promise((ok, zle) => {
  r.onsuccess = () => { ok(r.result); };
  r.onerror = (e) => { e.preventDefault(); zle(r.error); };
});
const koniecTx = (tx) => new Promise((ok) => {
  tx.oncomplete = () => { ok('complete'); };
  tx.onabort = () => { ok('abort ' + (tx.error ? tx.error.name : 'null')); };
});
const nazwaBledu = (f) => { try { f(); return 'brak bledu'; } catch (x) { return x && x.name; } };
const makrozadania = async (n) => { for (let i = 0; i < n; i += 1) await new Promise((ok) => { setImmediate(ok); }); };
const kluczeSklepu = (idb, baza, sklep) => idb.__atrapa.bazy()[baza].sklepy[sklep].klucze;
// JSON z kluczami obiektów w stałej kolejności (porównanie bez względu na kolejność przypisań pól).
const kanon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((n) => [n, x[n]])) : x));

describe('atrapa IndexedDB — samotest', () => {
  it('A1: scenariusze p1–p34 na atrapie dają literał nagrany w prawdziwym Chromium', async () => {
    const idb = utworzIndexedDB();
    const wynik = await scenariuszeIDB(idb, AtrapaIDBKeyRange);
    expect(Object.keys(wynik)).toEqual(Object.keys(SLAD_CHROMIUM));
    const rozne = Object.keys(SLAD_CHROMIUM).filter((k) => kanon(wynik[k]) !== kanon(SLAD_CHROMIUM[k]));
    expect(rozne, 'przypadki p różne od Chromium').toEqual([]);
    expect(wynik).toEqual(SLAD_CHROMIUM);
    expect(idb.__atrapa.wToku()).toBe(0);
    expect(idb.__atrapa.wyjatki).toEqual(['celowo (scenariusz p22)']);
  }, 60_000);

  it('A1: drugi przebieg na nowej instancji daje ten sam wynik i ten sam log; log nie niesie wartości rekordów', async () => {
    const a = utworzIndexedDB();
    const b = utworzIndexedDB();
    const wa = await scenariuszeIDB(a, AtrapaIDBKeyRange);
    const wb = await scenariuszeIDB(b, AtrapaIDBKeyRange);
    expect(wb).toEqual(wa);
    expect(b.__atrapa.log).toEqual(a.__atrapa.log);
    const tekst = JSON.stringify(a.__atrapa.log);
    expect(tekst).not.toContain('xxxxxxxx');
    expect(tekst).not.toContain('pending');
    const rodzaje = new Set(a.__atrapa.log.map((w) => (w[0] === 'tx' ? 'tx ' + w[4] : w[0])));
    expect([...rodzaje].sort()).toEqual(['abort-upgrade', 'blocked', 'close', 'databases', 'delete-success', 'deleteDatabase', 'open', 'success',
      'tx abort', 'tx complete', 'tx start', 'upgrade', 'versionchange']);
  }, 60_000);

  it('A2: prawdziwy sejf na atrapie (adapter IndexedDB): konto, wersje, kosz, przywrócenie, notatka, eksport, blokada', async () => {
    const idb = utworzIndexedDB();
    vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
    const { win } = okno({ dodatki: { indexedDB: idb } });
    const v = win.VildaVault;
    const u = await v.createUser(HASLO_A, { iterations: 1000, label: 'Fikcyjna Lekarka Atrapa' });
    const k = await v.savePatient(naglowek(1), { dedup: false });
    await v.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: k.patientId });
    let karta = await v.getPatient(k.patientId);
    expect(karta.snapshots).toHaveLength(2);
    const sid = karta.snapshots[0].snapshotId;
    await v.moveSnapshotToTrash(k.patientId, sid);
    expect((await v.getPatient(k.patientId)).snapshots).toHaveLength(1);
    expect((await v.listTrashedSnapshots()).map((e) => e.snapshotId)).toEqual([sid]);
    await v.restoreTrashedSnapshot(k.patientId, sid);
    expect(await v.listTrashedSnapshots()).toEqual([]);
    await v.savePatientNote({ patientId: k.patientId, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    expect((await v.listPatients()).map((p) => p.patientId)).toEqual([k.patientId]);
    const ladunek = await v.exportSyncPayload();
    expect(ladunek.patients).toHaveLength(1);
    v.lock('manual');
    expect(v.isUnlocked()).toBe(false);
    await v.unlockUser(u.userId, HASLO_A);
    karta = await v.getPatient(k.patientId);
    expect(karta.snapshots.map((s) => s.snapshotId)).toContain(sid);
    expect(karta.snapshots).toHaveLength(2);
    expect((await v.listPatientNotesForPatient(k.patientId)).map((n) => n.title)).toEqual(['Fikcyjna notatka']);
    v.lock('manual');
    // Po odblokowaniu sejf czyta czasem w tle (bez czekania na wynik, np. sklep patientNotes): najpierw koniec transakcji
    // w atrapie, potem asercje — transakcja zawieszona na zawsze i tak zaczerwieni test.
    for (let i = 0; i < 1000 && idb.__atrapa.wToku(); i += 1) await new Promise((ok) => { setImmediate(ok); });

    const maska = (x) => (typeof x === 'string' ? x.split(u.userId).join('<uid>') : x);
    const bazy = idb.__atrapa.bazy();
    expect(Object.keys(bazy).map(maska)).toEqual(['vilda_registry', 'vilda_user_<uid>']);
    expect(bazy.vilda_registry.version).toBe(1);
    expect(bazy['vilda_user_' + u.userId].version).toBe(5);
    expect(bazy['vilda_user_' + u.userId].sklepy.snapshots.indeksy).toEqual({ byPatient: { keyPath: 'patientId', unique: false } });
    const otwarcia = {};
    for (const w of idb.__atrapa.log) if (w[0] === 'open') otwarcia[maska(w[1]) + '@' + w[2]] = (otwarcia[maska(w[1]) + '@' + w[2]] || 0) + 1;
    expect(otwarcia).toEqual({ 'vilda_registry@1': 4, 'vilda_user_<uid>@5': 1 });
    expect(idb.__atrapa.log.filter((w) => w[0] === 'tx' && w[4] === 'abort')).toEqual([]);
    expect(idb.__atrapa.wToku()).toBe(0);
    expect(idb.__atrapa.wyjatki).toEqual([]);
  }, 30_000);

  it('A3: QuotaExceededError przy zapisie i przy zatwierdzaniu cofa całą transakcję', async () => {
    const idb = utworzIndexedDB();
    const d = await otworz(idb, 'a3', 1, (db) => { db.createObjectStore('s'); });
    // przy zapisie: pierwszy put przechodzi, drugi dostaje usterkę → przerwanie z błędem żądania, oba cofnięte
    let tx = d.transaction('s', 'readwrite');
    let s = tx.objectStore('s');
    const ev = [];
    const r1 = s.put(1, 'a');
    let r2 = null;
    r1.onsuccess = () => {
      idb.__atrapa.usterka({ przy: 'put', baza: 'a3', sklep: 's', blad: 'QuotaExceededError' });
      r2 = s.put(2, 'b');
      r2.onerror = () => { ev.push('r2 ' + r2.error.name); };
    };
    ev.push(await koniecTx(tx));
    expect(ev).toEqual(['r2 QuotaExceededError', 'abort QuotaExceededError']);
    expect(kluczeSklepu(idb, 'a3', 's')).toEqual([]);
    // przy zatwierdzaniu: wszystkie żądania udane, zatwierdzenie przerwane, nic nie zostaje
    const u = idb.__atrapa.usterka({ przy: 'commit', baza: 'a3', blad: 'QuotaExceededError' });
    tx = d.transaction('s', 'readwrite');
    s = tx.objectStore('s');
    const sukcesy = [];
    for (const kl of ['x', 'y']) s.put(kl, kl).onsuccess = () => { sukcesy.push(kl); };
    expect(await koniecTx(tx)).toBe('abort QuotaExceededError');
    expect(sukcesy).toEqual(['x', 'y']);
    expect(u.uzyta).toBe(1);
    expect(kluczeSklepu(idb, 'a3', 's')).toEqual([]);
    expect(idb.__atrapa.log.filter((w) => w[0] === 'tx' && w[4] === 'abort')).toEqual([
      ['tx', 'a3', ['s'], 'readwrite', 'abort', 'QuotaExceededError'], ['tx', 'a3', ['s'], 'readwrite', 'abort', 'QuotaExceededError'],
    ]);
    // jednorazowa: następna transakcja zatwierdza się
    tx = d.transaction('s', 'readwrite');
    tx.objectStore('s').put(3, 'z');
    expect(await koniecTx(tx)).toBe('complete');
    expect(kluczeSklepu(idb, 'a3', 's')).toEqual(['z']);
    d.close();
  });

  it('A3: wstrzymane zatwierdzanie — abort() rzuca, nowe żądanie rzuca, versionchange kasowania dochodzi po complete', async () => {
    const idb = utworzIndexedDB();
    const d = await otworz(idb, 'a3c', 1, (db) => { db.createObjectStore('s'); });
    const ev = [];
    d.onversionchange = (e) => { ev.push('versionchange ' + e.newVersion); d.close(); };
    const w = idb.__atrapa.wstrzymaj({ przy: 'commit', baza: 'a3c', sklep: 's' });
    const tx = d.transaction('s', 'readwrite');
    const s = tx.objectStore('s');
    s.put(1, 'x');
    const koniec = koniecTx(tx).then((x) => { ev.push('tx ' + x); });
    const punkt = await w.czeka;
    expect(punkt).toMatchObject({ przy: 'commit', baza: 'a3c', sklepy: ['s'] });
    expect(w.osiagniety).toBe(true);
    expect(nazwaBledu(() => tx.abort())).toBe('InvalidStateError');
    expect(nazwaBledu(() => s.put(2, 'y'))).toBe('TransactionInactiveError');
    expect(idb.__atrapa.wToku()).toBe(1);
    const del = idb.deleteDatabase('a3c');
    del.onblocked = () => { ev.push('blocked'); };
    const kasowanie = new Promise((ok) => { del.onsuccess = () => { ev.push('delete success'); ok(); }; });
    await makrozadania(20);
    expect(ev).toEqual([]);
    expect(idb.__atrapa.niezwolnione()).toBe(1);
    w.zwolnij();
    await koniec;
    await kasowanie;
    expect(ev).toEqual(['tx complete', 'versionchange null', 'delete success']);
    expect(idb.__atrapa.niezwolnione()).toBe(0);
    expect(await idb.databases()).toEqual([]);
  });

  it('A3: punkty sterowania — usterka odczytu, open, databases, deleteDatabase; wstrzymaj success/open; hak', async () => {
    const idb = utworzIndexedDB();
    const d = await otworz(idb, 'a3s', 1, (db) => { db.createObjectStore('s'); });
    let tx = d.transaction('s', 'readwrite');
    tx.objectStore('s').put(7, 'k');
    await koniecTx(tx);
    // usterka przy odczycie: błąd żądania bąbelkuje i przerywa transakcję
    idb.__atrapa.usterka({ przy: 'get', baza: /^a3/, blad: 'UnknownError' });
    tx = d.transaction('s', 'readonly');
    const g = tx.objectStore('s').get('k');
    const ev = [];
    g.onerror = () => { ev.push('get ' + g.error.name); };
    tx.onerror = (e) => { ev.push('tx onerror ' + (e.target === g)); };
    ev.push(await koniecTx(tx));
    expect(ev).toEqual(['get UnknownError', 'tx onerror true', 'abort UnknownError']);
    // hak przed onsuccess i wstrzymane onsuccess
    const kolejnosc = [];
    const h = idb.__atrapa.hak({ przy: 'success', baza: 'a3s', sklep: 's', metoda: 'get' }, (o) => { kolejnosc.push('hak ' + o.metoda); });
    const ws = idb.__atrapa.wstrzymaj({ przy: 'success', baza: 'a3s', metoda: 'get' });
    tx = d.transaction('s', 'readonly');
    const g2 = tx.objectStore('s').get('k');
    g2.onsuccess = () => { kolejnosc.push('onsuccess ' + g2.result); };
    const koniec = koniecTx(tx);
    await ws.czeka;
    await makrozadania(10);
    expect(kolejnosc).toEqual([]);
    expect(g2.readyState).toBe('pending');
    expect(idb.__atrapa.wToku()).toBe(1);
    // poza zdarzeniem żądania transakcja z żądaniem w toku jest nieaktywna
    expect(nazwaBledu(() => tx.objectStore('s').get('k'))).toBe('TransactionInactiveError');
    ws.zwolnij();
    expect(await koniec).toBe('complete');
    expect(kolejnosc).toEqual(['hak get', 'onsuccess 7']);
    expect(h.wywolany).toBe(1);
    // po zdarzeniu żądania transakcja wraca do nieaktywnej także wtedy, gdy ma następne żądanie w toku
    tx = d.transaction('s', 'readonly');
    const sk = tx.objectStore('s');
    let ws2 = null;
    let zalozone = null;
    const zalozenie = new Promise((ok) => { zalozone = ok; });
    sk.get('k').onsuccess = () => { ws2 = idb.__atrapa.wstrzymaj({ przy: 'success', baza: 'a3s', metoda: 'get' }); sk.get('k'); zalozone(); };
    const koniec2 = koniecTx(tx);
    await zalozenie;
    await ws2.czeka;
    expect(nazwaBledu(() => sk.get('k'))).toBe('TransactionInactiveError');
    ws2.zwolnij();
    expect(await koniec2).toBe('complete');
    // open: usterka i wstrzymanie
    idb.__atrapa.usterka({ przy: 'open', baza: 'a3o', blad: 'UnknownError' });
    await expect(otworz(idb, 'a3o', 1)).rejects.toMatchObject({ name: 'UnknownError' });
    expect(await idb.databases()).toEqual([{ name: 'a3s', version: 1 }]);
    const wo = idb.__atrapa.wstrzymaj({ przy: 'open', baza: 'a3o' });
    const otwarcie = otworz(idb, 'a3o', 1);
    await wo.czeka;
    expect(idb.__atrapa.log.filter((w) => w[0] === 'upgrade' && w[1] === 'a3o')).toEqual([]);
    wo.zwolnij();
    (await otwarcie).close();
    // databases i deleteDatabase
    idb.__atrapa.usterka({ przy: 'databases', blad: 'UnknownError' });
    await expect(idb.databases()).rejects.toMatchObject({ name: 'UnknownError' });
    idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: 'a3o', blad: 'UnknownError' });
    await expect(new Promise((ok, zle) => { const r = idb.deleteDatabase('a3o'); r.onsuccess = ok; r.onerror = () => { zle(r.error); }; })).rejects.toMatchObject({ name: 'UnknownError' });
    idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: 'a3o', zdarzenie: 'blocked' });
    const zd = [];
    await new Promise((ok) => {
      const r = idb.deleteDatabase('a3o');
      r.onblocked = (e) => { zd.push('blocked ' + e.oldVersion + ' ' + e.newVersion); };
      r.onsuccess = () => { zd.push('success'); ok(); };
    });
    expect(zd).toEqual(['blocked 1 null', 'success']);
    expect((await idb.databases()).map((b) => b.name)).toEqual(['a3s']);
    d.close();
    expect(idb.__atrapa.polaczenia()).toBe(0);
  });

  it('A4: dwa okna na jednej atrapie — versionchange przy kasowaniu z drugiego okna', async () => {
    const idb = utworzIndexedDB();
    const okno1 = await otworz(idb, 'a4', 1, (db) => { db.createObjectStore('s'); });
    const okno1b = await otworz(idb, 'a4');
    const ev = [];
    okno1.onversionchange = (e) => { ev.push('okno1 versionchange old=' + e.oldVersion + ' new=' + e.newVersion); okno1.close(); };
    okno1b.onversionchange = () => { ev.push('okno1b versionchange (bez zamkniecia)'); };
    expect(idb.__atrapa.polaczenia('a4')).toBe(2);
    await new Promise((ok) => {
      const r = idb.deleteDatabase('a4');
      r.onblocked = () => { ev.push('blocked'); setImmediate(() => { okno1b.close(); ev.push('okno1b close'); }); };
      r.onsuccess = () => { ev.push('success'); ok(); };
    });
    expect(ev).toEqual(['okno1 versionchange old=1 new=null', 'okno1b versionchange (bez zamkniecia)', 'blocked', 'okno1b close', 'success']);
    expect(idb.__atrapa.polaczenia(/^a4/)).toBe(0);
    expect(idb.__atrapa.log.filter((w) => w[1] === 'a4' && ['versionchange', 'blocked', 'close', 'delete-success'].includes(w[0]))).toEqual([
      ['versionchange', 'a4', 1, null], ['close', 'a4'], ['versionchange', 'a4', 1, null], ['blocked', 'a4', 1, null], ['close', 'a4'], ['delete-success', 'a4'],
    ]);
  });

  it('A4: harmonogram między połączeniami — readwrite czeka na wcześniejszą readonly, readonly na wcześniejszą readwrite', async () => {
    const idb = utworzIndexedDB();
    const a = await otworz(idb, 'a4h', 1, (db) => { db.createObjectStore('s'); db.createObjectStore('t'); });
    const b = await otworz(idb, 'a4h');
    const ev = [];
    const t1 = a.transaction('s', 'readonly');
    const t2 = b.transaction(['s', 't'], 'readwrite');
    const t3 = a.transaction('t', 'readonly');
    const t4 = b.transaction('s', 'readonly');
    const t5 = a.transaction('t', 'readwrite');
    for (const [n, t, sk] of [['t1', t1, 's'], ['t2', t2, 's'], ['t3', t3, 't'], ['t4', t4, 's'], ['t5', t5, 't']]) {
      const r = t.mode === 'readwrite' ? t.objectStore(sk).put(n, 'k') : t.objectStore(sk).get('k');
      r.onsuccess = () => { ev.push(n + ' ' + (t.mode === 'readwrite' ? 'put' : 'get=' + r.result)); };
      t.oncomplete = () => { ev.push(n + ' complete'); };
    }
    await new Promise((ok) => { t5.addEventListener('complete', () => { ok(); }); });
    expect(ev).toEqual(['t1 get=undefined', 't1 complete', 't2 put', 't2 complete', 't3 get=undefined', 't4 get=t2', 't3 complete', 't4 complete', 't5 put', 't5 complete']);
    const starty = idb.__atrapa.log.filter((w) => w[0] === 'tx' && w[4] === 'start').map((w) => w[2].join('+') + ':' + w[3]);
    expect(starty).toEqual(['s:readonly', 's+t:readwrite', 't:readonly', 's:readonly', 't:readwrite']);
    a.close();
    b.close();
  });

  it('A5: klonuj() daje niezależną kopię baz bez połączeń i bez logu', async () => {
    const idb = utworzIndexedDB();
    const d = await otworz(idb, 'a5', 1, (db) => { db.createObjectStore('s', { keyPath: 'id' }).createIndex('byN', 'n', { unique: true }); });
    let tx = d.transaction('s', 'readwrite');
    tx.objectStore('s').put({ id: 'a', n: 1, tab: [1] });
    await koniecTx(tx);
    const bliz = idb.__atrapa.klonuj();
    expect(bliz.__atrapa.log).toEqual([]);
    expect(bliz.__atrapa.polaczenia()).toBe(0);
    expect(bliz.__atrapa.bazy()).toEqual(idb.__atrapa.bazy());
    tx = d.transaction('s', 'readwrite');
    tx.objectStore('s').put({ id: 'b', n: 2, tab: [2] });
    await koniecTx(tx);
    expect(bliz.__atrapa.bazy().a5.sklepy.s.klucze).toEqual(['a']);
    const d2 = await otworz(bliz, 'a5');
    tx = d2.transaction('s', 'readwrite');
    tx.objectStore('s').put({ id: 'c', n: 2 });
    expect(await koniecTx(tx)).toBe('complete');
    expect(kluczeSklepu(idb, 'a5', 's')).toEqual(['a', 'b']);
    expect(bliz.__atrapa.bazy().a5.sklepy.s.klucze).toEqual(['a', 'c']);
    expect(bliz.__atrapa.bazy().a5.sklepy.s.indeksy).toEqual({ byN: { keyPath: 'n', unique: true } });
    d.close();
    d2.close();
  });

  it('A6: DataError dla złego klucza, NotFoundError dla nieznanego sklepu, InvalidStateError po close()', async () => {
    const idb = utworzIndexedDB();
    const d = await otworz(idb, 'a6', 1, (db) => { db.createObjectStore('s', { keyPath: 'id' }); });
    const tx = d.transaction('s', 'readwrite');
    const s = tx.objectStore('s');
    expect(nazwaBledu(() => s.put({ id: { zly: 1 } }))).toBe('DataError');
    expect(nazwaBledu(() => s.put({ id: [1, null] }))).toBe('DataError');
    expect(nazwaBledu(() => s.get(NaN))).toBe('DataError');
    expect(nazwaBledu(() => s.get(new Date(NaN)))).toBe('DataError');
    expect(nazwaBledu(() => idb.cmp(undefined, 1))).toBe('DataError');
    expect(nazwaBledu(() => d.transaction('nie_ma'))).toBe('NotFoundError');
    expect(nazwaBledu(() => s.index('nie_ma'))).toBe('NotFoundError');
    expect(await koniecTx(tx)).toBe('complete');
    d.close();
    expect(nazwaBledu(() => d.transaction('s'))).toBe('InvalidStateError');
    expect(idb.__atrapa.polaczenia('a6')).toBe(0);
  });

  it('A6: baza z innej wersji (utworz) i zerwanie połączenia (wymusZamkniecie)', async () => {
    const idb = utworzIndexedDB();
    idb.__atrapa.utworz('a6u', 3, { outbox: { keyPath: 'eid', indeksy: { bySeqLocal: { keyPath: 'seqLocal', unique: true } } } },
      { outbox: [{ eid: 'e1', seqLocal: 1 }, { eid: 'e2', seqLocal: 2 }] });
    const d = await otworz(idb, 'a6u', undefined, () => { throw new Error('bez upgrade'); });
    expect(d.version).toBe(3);
    expect(Array.from(d.objectStoreNames)).toEqual(['outbox']);
    const ev = [];
    d.onclose = () => { ev.push('close'); };
    const tx = d.transaction('outbox', 'readwrite');
    const s = tx.objectStore('outbox');
    const r = s.get('e1');
    r.onsuccess = () => {
      s.put({ eid: 'e3', seqLocal: 3 }).onerror = (e) => { ev.push('put ' + e.target.error.name); };
      idb.__atrapa.wymusZamkniecie('a6u');
    };
    ev.push(await koniecTx(tx));
    await makrozadania(3);
    expect(ev).toEqual(['put AbortError', 'abort UnknownError', 'close']);
    expect(nazwaBledu(() => d.transaction('outbox'))).toBe('InvalidStateError');
    expect(idb.__atrapa.polaczenia('a6u')).toBe(0);
    expect(kluczeSklepu(idb, 'a6u', 'outbox')).toEqual(['e1', 'e2']);
    expect(idb.__atrapa.log.filter((w) => w[0] === 'forced-close')).toEqual([['forced-close', 'a6u']]);
  });

  describe('A7: surowość dezaktywacji (1000 prób każdego wariantu)', () => {
    async function proba(idb, d, obsluga) {
      const tx = d.transaction('s', 'readonly');
      const s = tx.objectStore('s');
      const koniec = koniecTx(tx);
      const wynik = await new Promise((ok) => {
        const r = s.get('x');
        r.onsuccess = async () => {
          await obsluga();
          try { s.get('x'); ok('aktywna'); } catch (x) { ok(x.name); }
        };
      });
      await koniec;
      return wynik;
    }
    async function zlicz(obsluga) {
      const idb = utworzIndexedDB();
      const d = await otworz(idb, 'a7', 1, (db) => { db.createObjectStore('s'); });
      const licz = {};
      for (let i = 0; i < 1000; i += 1) { const w = await proba(idb, d, obsluga); licz[w] = (licz[w] || 0) + 1; }
      d.close();
      expect(idb.__atrapa.wToku()).toBe(0);
      return licz;
    }

    it('A7: obsługa trwająca 2 ms, potem await zegara (0 ms) → zawsze TransactionInactiveError', async () => {
      const licz = await zlicz(async () => {
        const t0 = performance.now();
        while (performance.now() - t0 < 2) { /* praca obsługi zdarzenia */ }
        await new Promise((ok) => { setTimeout(ok, 0); });
      });
      expect(licz).toEqual({ TransactionInactiveError: 1000 });
    }, 60_000);

    it('A7: await crypto.subtle.encrypt w obsłudze → zawsze TransactionInactiveError (atrapa surowsza niż Chromium)', async () => {
      const klucz = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      const dane = new Uint8Array(20000);
      const licz = await zlicz(async () => { await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, klucz, dane); });
      expect(licz).toEqual({ TransactionInactiveError: 1000 });
    }, 60_000);

    it('A7: łańcuch 50 mikrozadań w obsłudze → zawsze aktywna', async () => {
      const glebiej = async (n) => { if (n > 0) await glebiej(n - 1); };
      const licz = await zlicz(async () => { await glebiej(50); });
      expect(licz).toEqual({ aktywna: 1000 });
    }, 60_000);
  });
});
