// Scenariusz magazynu kolejki i kwarantanny do porównania atrapy IndexedDB z prawdziwą przeglądarką
//
// scenariuszMagazynu(win, pomocnik) wykonuje na oknie z załadowanym sejfem (vilda_crypto.js, vilda_retention.js,
// vilda_vault.js) i otwartą bramką dziennika zdarzeń ten sam ciąg operacji kolejki i kwarantanny: w vitest na atrapie
// (tests/unit/sync-dziennik-magazyn.test.mjs, literał SLAD_MAGAZYNU) i w Chromium przez page.evaluate(fn.toString())
// (tests/e2e/atrapa-indexeddb-zgodnosc.spec.mjs). Funkcja jest samowystarczalna: bez importów i bez odwołań do zasięgu
// modułu. Bramkę (pole okna VILDA_EVENT_LOG) ustawia wołający, tylko na stronie testu.
//
// pomocnik: drugieOkno() → Promise<{ indexedDB, zamknij() }> — drugie okno tej samej strony (jego połączenie z bazą
// kolejki trzyma kasowanie w stanie „blocked”); czekaj(ms) → Promise — upływ czasu przed outboxRequeueStale (w vitest
// przesuwa sztuczny zegar, w przeglądarce czeka).
//
// Ciąg (konto „Komputer prywatny”, dane fikcyjne): odczyty kwarantanny i zwolnienie przed pierwszym zapisem (bazy
// kolejki nie ma i nie powstaje), enqueue snap ×2 (drugie zastępuje pierwsze — ogon), pnote, snap
// (poza ogonem — bez zastąpienia), pfull z dwiema porcjami, dwa enqueue tej samej notatki naraz (oba odczyty epoki przed
// zapisem — dwa wiersze), outboxTake, outboxFail, outboxAccept, outboxRequeueStale, drugi outboxTake, enqueue wersji w
// locie, outboxList i outboxCount; kwarantanna w dwóch fikcyjnych slotach: wyniki zastosowania z prawdziwego
// applyEncryptedEvent (powody format i envelope rozstrzygają się przed odszyfrowaniem) i ich resultSummary, quarantinePut
// wierszy /changes z różnymi polami ładunku (z i aad z zasad i spoza nich, pusty iv, data nie napis, eid z importu, bez
// eid i spoza wzorca), ponowny wpis tego samego [slotId, seq] (tylko powód i wersja aplikacji), wynik spoza kwarantanny
// (argument), quarantineList ze slotem i bez, quarantineCount, quarantineMinSeq, quarantineRelease (seq bez wiersza,
// powtórzony i niepoprawny — pominięte) i minimum oraz licznik po zwolnieniu; potem deleteDatabase przy połączeniu
// drugiego okna (zablokowana), zamknięcie tego połączenia, próba otwarcia (bazy nie ma), drugie deleteDatabase (brak),
// enqueue, quarantinePut i quarantineCount po kasowaniu (SYNC_DB_DELETED).
// Na końcu drugie konto: kasowanie bazy kolejki zlecone z tego okna w onsuccess otwarcia do zapisu dopisania
// (versionchange w trakcie transakcji dopisania: połączenie zamknięte bez przerywania, zapisy po close() zatwierdzone,
// kasowanie bez blocked). Wyniku następnego enqueue scenariusz nie zapisuje: zależy od kolejności zdarzeń przeglądarki
// (koordynację tworzenia i kasowania bazy między oknami wprowadza E2-PR3a; zob. M15b); ścieżkę z versionchange
// w trakcie sprawdza M15a.
// Wynik bez eid, szyfrogramów i chwil: identyfikatory zastąpione etykietami (U, U2 — konta, id1, id2, … w kolejności
// pierwszego wystąpienia), liczby wierszy zamiast list eid, seqLocal względem pierwszego wiersza listy. Wiersze
// kwarantanny w stałej kolejności pól, ze slotem jako etykietą (slotA, slotB), fikcyjnymi napisami w miejscu iv i data i
// znacznikiem chwili pierwszego wpisu zamiast samej chwili (pierwszyWpisBezZmian — chwila po ponownym wpisie ta sama).
export async function scenariuszMagazynu(win, pomocnik) {
  'use strict'; // także po fn.toString() w przeglądarce (skrypt strony nie jest modułem)
  // Zapisy danych i zakładanie kont scenariusza przy zamkniętej bramce (E2-PR3a2: zapis przy otwartej bramce sam
  // dopisuje zmianę do kolejki; E2-PR3a4: przegląd kolejki przy odblokowaniu dopisuje zmiany bez wiersza); wiersze
  // kolejki powstają tylko z jawnych enqueue scenariusza.
  const bezEmisji = async (fn) => {
    const bylo = win.VILDA_EVENT_LOG;
    win.VILDA_EVENT_LOG = false;
    try {
      return await fn();
    } finally {
      win.VILDA_EVENT_LOG = bylo;
    }
  };
  const v = win.VildaVault;
  const ev = v._eventLog;
  const W = { bramka: ev.gateOpen(), wyniki: [] };
  const etykiety = new Map();
  let nrEtykiety = 0;
  const etykieta = (id) => {
    if (!etykiety.has(id)) { nrEtykiety += 1; etykiety.set(id, 'id' + nrEtykiety); }
    return etykiety.get(id);
  };
  const klucz = (k) => (typeof k === 'string' ? k.split('/').map((c) => (c === 'cred' ? c : etykieta(c))).join('/') : k);
  const maska = (w) => {
    const o = {};
    for (const [k, x] of Object.entries(w)) {
      if (['eids', 'usuniete', 'pominiete', 'przywrocone'].includes(k)) o[k] = Array.isArray(x) ? x.length : x;
      else if (k === 'zmienione') o[k] = Array.isArray(x) ? x.map((z) => (typeof z === 'string' ? 'eid' : { stan: z.stan })) : x;
      else if (k === 'wiersze') o[k] = Array.isArray(x) ? x.map((r) => [r.kind, klucz(r.entityKey)]) : x;
      else if (k === 'bodyBytes') o[k] = x > 0;
      else o[k] = x;
    }
    return o;
  };
  const zapisz = (nazwa, w) => { W.wyniki.push([nazwa, maska(w)]); return w; };
  const SLOT_A = '0123456789abcdef'.repeat(4);
  const SLOT_B = 'fedcba9876543210'.repeat(4);
  const slot = (x) => (x === SLOT_A ? 'slotA' : x === SLOT_B ? 'slotB' : x);
  const POLA_KW = ['slotId', 'seq', 'eid', 'iv', 'data', 'z', 'aad', 'formatInny', 'reason', 'appVersion', 'firstSeenAtISO'];
  const wierszKw = (r) => {
    const o = { slotId: slot(r.slotId), seq: r.seq, eid: r.eid, iv: r.iv, data: r.data };
    for (const p of ['z', 'aad', 'formatInny']) if (p in r) o[p] = r[p];
    o.reason = r.reason;
    o.appVersion = r.appVersion;
    o.firstSeenAtISO = typeof r.firstSeenAtISO === 'string' && r.firstSeenAtISO.length > 0;
    const inne = Object.keys(r).filter((p) => !POLA_KW.includes(p));
    if (inne.length) o.inne = inne.sort();
    return o;
  };
  const maskaKw = (w) => {
    const o = {};
    for (const [k, x] of Object.entries(w)) {
      if (k === 'wiersze') o[k] = Array.isArray(x) ? x.map(wierszKw) : x;
      else if (k === 'sloty') o[k] = Object.fromEntries(Object.entries(x).map(([s, n]) => [slot(s), n]).sort());
      else o[k] = x;
    }
    return o;
  };
  const zapiszKw = (nazwa, w) => { W.wyniki.push([nazwa, maskaKw(w)]); return w; };
  const WERSJA = '1.0.0-fikcyjna';
  const zmiana = (seq, eid, payload) => (eid === undefined ? { seq, payload } : { seq, eid, payload });
  const naglowek = (i, dodatki) => ({
    name: `Testowy Jan${i}`,
    user: { lastName: 'Testowy', firstName: `Jan${i}`, sex: 'M', height: 120, weight: 22, dobISO: '2016-03-12' },
    ...dodatki,
  });

  await bezEmisji(() => v.createUser('Fikcyjne#Haslo!Scenariusz2026', { label: 'Fikcyjna Lekarka Scenariusz', iterations: 1000 }));
  const uid = v.getCurrentUser().userId;
  etykiety.set(uid, 'U');
  const nazwa = 'vilda_sync_' + uid;
  const k = await bezEmisji(() => v.savePatient(naglowek(1), { dedup: false }));
  const n = (await bezEmisji(() => v.savePatientNote({ patientId: k.patientId, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' }))).id;
  const n2 = (await bezEmisji(() => v.savePatientNote({ patientId: k.patientId, title: 'Fikcyjna notatka 2', body: 'Fikcyjna treść 2.', category: 'inne' }))).id;
  const duza = naglowek(2, { advanced: { opis: 'Fikcyjny opis '.repeat(10000) } });
  const p = await bezEmisji(() => v.savePatient(duza, { dedup: false }));
  await bezEmisji(() => v.savePatient(duza, { dedup: false, patientId: p.patientId }));
  const wersja = { patientId: k.patientId, snapshotId: k.snapshotId };

  zapiszKw('quarantineCount (bez bazy)', await ev.quarantineCount());
  zapiszKw('quarantineList (bez bazy)', await ev.quarantineList());
  zapiszKw('quarantineMinSeq (bez bazy)', await ev.quarantineMinSeq({ slotId: SLOT_A }));
  zapiszKw('quarantineRelease (bez bazy)', await ev.quarantineRelease([1], { slotId: SLOT_A }));
  W.bazaPoOdczytach = (await win.indexedDB.databases()).some((d) => d.name === nazwa);
  zapisz('enqueue snap', await ev.enqueue('snap', wersja));
  zapisz('enqueue snap (ogon)', await ev.enqueue('snap', wersja));
  zapisz('enqueue pnote', await ev.enqueue('pnote', n));
  zapisz('enqueue snap (poza ogonem)', await ev.enqueue('snap', wersja));
  zapisz('enqueue pfull', await ev.enqueue('pfull', { patientId: p.patientId }, { setId: 'fikcyjny-zestaw-1' }));
  const naraz = await Promise.all([ev.enqueue('pnote', n2), ev.enqueue('pnote', n2)]);
  zapisz('enqueue pnote naraz #1', naraz[0]);
  zapisz('enqueue pnote naraz #2', naraz[1]);
  const t1 = zapisz('outboxTake 3', await ev.outboxTake({ limit: 3 }));
  const e1 = t1.wiersze.map((r) => r.eid);
  zapisz('outboxFail', await ev.outboxFail([e1[0]], { code: 'NETWORK' }));
  zapisz('outboxAccept', await ev.outboxAccept([e1[1], '00000000-0000-4000-8000-0000000000ff']));
  await pomocnik.czekaj(5);
  zapisz('outboxRequeueStale', await ev.outboxRequeueStale({ olderThanMs: 0 }));
  zapisz('outboxTake 2', await ev.outboxTake({ limit: 2 }));
  zapisz('enqueue snap (w locie)', await ev.enqueue('snap', wersja));
  const lista = await ev.outboxList();
  const s0 = lista.wiersze.length ? lista.wiersze[0].seqLocal : 0;
  W.kolejka = lista.wiersze.map((r) => ({
    kind: r.kind, entityKey: klucz(r.entityKey), setId: r.setId, state: r.state, attempts: r.attempts, lastError: r.lastError,
    env: r.env ? Object.keys(r.env).join(',') : null, bytes: r.bytes > 0, seq: r.seqLocal - s0,
    inflight: r.inflightAtISO !== null, proba: r.lastAttemptAtISO !== null,
  }));
  W.liczniki = await ev.outboxCount();

  const wFormat = await ev.applyEncryptedEvent({ iv: 'Fikcyjne-IV-1', data: 'Fikcyjny-szyfrogram-1', z: 'br' });
  const wKoperta = await ev.applyEncryptedEvent({ iv: '', data: 'Fikcyjny-szyfrogram-2' });
  W.podsumowania = [ev.resultSummary(wFormat), ev.resultSummary(wKoperta)];
  const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const wpisy = [
    ['slotA#5 (z: br)', SLOT_A, zmiana(5, UUID(5), { iv: 'Fikcyjne-IV-1', data: 'Fikcyjny-szyfrogram-1', z: 'br' }), wFormat, WERSJA],
    ['slotA#3 (pusty iv, eid z importu, bez wersji)', SLOT_A, zmiana(3, 'r2:123', { iv: '', data: 'Fikcyjny-szyfrogram-2' }), wKoperta, null],
    ['slotA#10 (data nie napis, aad: 2, bez eid)', SLOT_A, zmiana(10, undefined, { iv: 'Fikcyjne-IV-3', data: 7, aad: 2 }), wKoperta, WERSJA],
    ['slotA#4 (z i aad spoza zasad, eid spoza wzorca)', SLOT_A,
      zmiana(4, 'eid z treścią', { iv: 'Fikcyjne-IV-4', data: 'Fikcyjny-szyfrogram-4', z: {}, aad: 1.5 }), wFormat, WERSJA],
    ['slotB#5 (z: gzip, aad: 0)', SLOT_B, zmiana(5, UUID(6), { iv: 'Fikcyjne-IV-5', data: 'Fikcyjny-szyfrogram-5', z: 'gzip', aad: 0 }), wFormat, WERSJA],
  ];
  for (const [opis, s, zm, w, wersjaAplikacji] of wpisy) {
    zapiszKw(`quarantinePut ${opis}`, await ev.quarantinePut(zm, w, { slotId: s, appVersion: wersjaAplikacji }));
  }
  const pierwszy = (await ev.quarantineList({ slotId: SLOT_A })).wiersze.find((r) => r.seq === 5).firstSeenAtISO;
  await pomocnik.czekaj(5);
  const ponownie = zmiana(5, UUID(7), { iv: 'Inne-IV', data: 'Inny-szyfrogram' });
  zapiszKw('quarantinePut slotA#5 ponownie (inny powód, wersja i treść)',
    await ev.quarantinePut(ponownie, wKoperta, { slotId: SLOT_A, appVersion: '1.0.1-fikcyjna' }));
  const busy = { status: 'busy', code: 'PATIENT_AUTHORITY_UNAVAILABLE' };
  zapiszKw('quarantinePut (wynik busy)',
    await ev.quarantinePut(zmiana(6, undefined, { iv: 'Fikcyjne-IV-6', data: 'Fikcyjny-szyfrogram-6' }), busy, { slotId: SLOT_A, appVersion: WERSJA }));
  zapiszKw('quarantineList slotA', await ev.quarantineList({ slotId: SLOT_A }));
  W.pierwszyWpisBezZmian = (await ev.quarantineList({ slotId: SLOT_A })).wiersze.find((r) => r.seq === 5).firstSeenAtISO === pierwszy;
  zapiszKw('quarantineList', await ev.quarantineList());
  zapiszKw('quarantineCount', await ev.quarantineCount());
  zapiszKw('quarantineMinSeq slotA', await ev.quarantineMinSeq({ slotId: SLOT_A }));
  zapiszKw('quarantineMinSeq slotB', await ev.quarantineMinSeq({ slotId: SLOT_B }));
  zapiszKw('quarantineRelease slotA [3, 99, 3, 0]', await ev.quarantineRelease([3, 99, 3, 0], { slotId: SLOT_A }));
  zapiszKw('quarantineMinSeq slotA po zwolnieniu', await ev.quarantineMinSeq({ slotId: SLOT_A }));
  zapiszKw('quarantineCount po zwolnieniu', await ev.quarantineCount());

  const okno2 = await pomocnik.drugieOkno();
  const db2 = await new Promise((ok, zle) => {
    const r = okno2.indexedDB.open(nazwa);
    r.onupgradeneeded = () => { r.transaction.abort(); };
    r.onsuccess = () => { ok(r.result); };
    r.onerror = (e) => { e.preventDefault(); zle(r.error); };
  });
  let zmianyWersji = 0;
  db2.onversionchange = (e) => { zmianyWersji += 1; W.zmianaWersji = e.newVersion; };
  zapisz('deleteDatabase (połączenie drugiego okna)', await ev.deleteDatabase(uid));
  W.zmianyWersji = zmianyWersji;
  db2.close();
  W.proba = await new Promise((ok) => {
    const r = win.indexedDB.open(nazwa);
    let upgrade = false;
    r.onupgradeneeded = () => { upgrade = true; r.transaction.abort(); };
    r.onsuccess = () => { r.result.close(); ok('istnieje'); };
    r.onerror = (e) => { e.preventDefault(); ok(upgrade ? 'brak' : 'blad ' + (r.error && r.error.name)); };
  });
  zapisz('deleteDatabase (ponownie)', await ev.deleteDatabase(uid));
  zapisz('enqueue po kasowaniu', await ev.enqueue('snap', wersja));
  zapiszKw('quarantinePut po kasowaniu',
    await ev.quarantinePut(zmiana(8, undefined, { iv: 'Fikcyjne-IV-8', data: 'Fikcyjny-szyfrogram-8' }), wFormat, { slotId: SLOT_A, appVersion: WERSJA }));
  zapiszKw('quarantineCount po kasowaniu', await ev.quarantineCount());

  await bezEmisji(() => v.createUser('Fikcyjne#Haslo!Scenariusz2026b', { label: 'Fikcyjny Lekarz Scenariusz', iterations: 1000 }));
  const uid2 = v.getCurrentUser().userId;
  etykiety.set(uid2, 'U2');
  const nazwa2 = 'vilda_sync_' + uid2;
  const k2 = await bezEmisji(() => v.savePatient(naglowek(3), { dedup: false }));
  const wersja2 = { patientId: k2.patientId, snapshotId: k2.snapshotId };
  zapisz('enqueue snap (konto 2)', await ev.enqueue('snap', wersja2));
  const idb = win.indexedDB;
  const open0 = idb.open;
  const usun0 = idb.deleteDatabase;
  let otwarcia = 0;
  let kasowanie = null;
  const zdarzenia = [];
  idb.open = function (n, w) {
    const r = w === undefined ? open0.call(idb, n) : open0.call(idb, n, w);
    if (n !== nazwa2) return r;
    otwarcia += 1;
    if (otwarcia === 2) { // 1 — odczyt epoki, 2 — otwarcie do zapisu (baza istnieje)
      let opis = null;
      for (let x = Object.getPrototypeOf(r); x && !opis; x = Object.getPrototypeOf(x)) opis = Object.getOwnPropertyDescriptor(x, 'onsuccess');
      Object.defineProperty(r, 'onsuccess', {
        configurable: true,
        get() { return opis.get.call(r); },
        set(fn) {
          opis.set.call(r, function (e) {
            fn.call(this, e);
            kasowanie = new Promise((ok) => {
              const d = usun0.call(idb, nazwa2);
              d.onblocked = () => { zdarzenia.push('blocked'); };
              d.onsuccess = () => { zdarzenia.push('success'); ok(); };
              d.onerror = (x) => { x.preventDefault(); zdarzenia.push('error'); ok(); };
            });
          });
        },
      });
    }
    return r;
  };
  let wTrakcie;
  try { wTrakcie = await ev.enqueue('snap', wersja2); } finally { idb.open = open0; }
  zapisz('enqueue snap (kasowanie w trakcie)', wTrakcie);
  if (kasowanie) await kasowanie;
  W.kasowanieWTrakcie = { otwarcia, zdarzenia };
  W.bazy = (await win.indexedDB.databases()).map((d) => d.name).filter((x) => x.startsWith('vilda_'))
    .map((x) => x.split(uid2).join('U2').split(uid).join('U')).sort();
  okno2.zamknij();
  return W;
}

// Wynik scenariusza na atrapie (tests/unit/sync-dziennik-magazyn.test.mjs, przypadek SLAD_MAGAZYNU); e2e zgodności
// porównuje z nim Chromium.
export const SLAD_MAGAZYNU = Object.freeze({
  bramka: true,
  wyniki: [
    ['quarantineCount (bez bazy)', {ok: true, total: 0, sloty: {}}],
    ['quarantineList (bez bazy)', {ok: true, wiersze: []}],
    ['quarantineMinSeq (bez bazy)', {ok: true, seq: null}],
    ['quarantineRelease (bez bazy)', {ok: true, usuniete: [], pominiete: []}],
    ['enqueue snap', {ok: true, eids: 1, stany: ['pending'], zastapione: 0}],
    ['enqueue snap (ogon)', {ok: true, eids: 1, stany: ['pending'], zastapione: 1}],
    ['enqueue pnote', {ok: true, eids: 1, stany: ['pending'], zastapione: 0}],
    ['enqueue snap (poza ogonem)', {ok: true, eids: 1, stany: ['pending'], zastapione: 0}],
    ['enqueue pfull', {ok: true, eids: 2, stany: ['pending', 'pending'], zastapione: 0}],
    ['enqueue pnote naraz #1', {ok: true, eids: 1, stany: ['pending'], zastapione: 0}],
    ['enqueue pnote naraz #2', {ok: true, eids: 1, stany: ['pending'], zastapione: 0}],
    ['outboxTake 3', {ok: true, wiersze: [['snap', 'id1/id2'], ['pnote', 'id3'], ['snap', 'id1/id2']], bodyBytes: true, czekaNaWLocie: false}],
    ['outboxFail', {ok: true, zmienione: ['eid'], pominiete: 0}],
    ['outboxAccept', {ok: true, usuniete: 1, pominiete: 1}],
    ['outboxRequeueStale', {ok: true, przywrocone: 1}],
    ['outboxTake 2', {ok: true, wiersze: [['snap', 'id1/id2'], ['snap', 'id1/id2']], bodyBytes: true, czekaNaWLocie: false}],
    ['enqueue snap (w locie)', {ok: true, eids: 1, stany: ['pending'], zastapione: 0}],
    ['quarantinePut slotA#5 (z: br)', {ok: true, nowy: true}],
    ['quarantinePut slotA#3 (pusty iv, eid z importu, bez wersji)', {ok: true, nowy: true}],
    ['quarantinePut slotA#10 (data nie napis, aad: 2, bez eid)', {ok: true, nowy: true}],
    ['quarantinePut slotA#4 (z i aad spoza zasad, eid spoza wzorca)', {ok: true, nowy: true}],
    ['quarantinePut slotB#5 (z: gzip, aad: 0)', {ok: true, nowy: true}],
    ['quarantinePut slotA#5 ponownie (inny powód, wersja i treść)', {ok: true, nowy: false}],
    ['quarantinePut (wynik busy)', {ok: false, powod: 'argument'}],
    ['quarantineList slotA', {ok: true, wiersze: [
      {slotId: 'slotA', seq: 3, eid: 'r2:123', iv: '', data: 'Fikcyjny-szyfrogram-2', reason: 'envelope', appVersion: null, firstSeenAtISO: true},
      {slotId: 'slotA', seq: 4, eid: null, iv: 'Fikcyjne-IV-4', data: 'Fikcyjny-szyfrogram-4', formatInny: true, reason: 'format', appVersion: '1.0.0-fikcyjna', firstSeenAtISO: true},
      {slotId: 'slotA', seq: 5, eid: '00000000-0000-4000-8000-000000000005', iv: 'Fikcyjne-IV-1', data: 'Fikcyjny-szyfrogram-1', z: 'br', reason: 'envelope', appVersion: '1.0.1-fikcyjna', firstSeenAtISO: true},
      {slotId: 'slotA', seq: 10, eid: null, iv: 'Fikcyjne-IV-3', data: null, aad: 2, reason: 'envelope', appVersion: '1.0.0-fikcyjna', firstSeenAtISO: true},
    ]}],
    ['quarantineList', {ok: true, wiersze: [
      {slotId: 'slotA', seq: 3, eid: 'r2:123', iv: '', data: 'Fikcyjny-szyfrogram-2', reason: 'envelope', appVersion: null, firstSeenAtISO: true},
      {slotId: 'slotA', seq: 4, eid: null, iv: 'Fikcyjne-IV-4', data: 'Fikcyjny-szyfrogram-4', formatInny: true, reason: 'format', appVersion: '1.0.0-fikcyjna', firstSeenAtISO: true},
      {slotId: 'slotA', seq: 5, eid: '00000000-0000-4000-8000-000000000005', iv: 'Fikcyjne-IV-1', data: 'Fikcyjny-szyfrogram-1', z: 'br', reason: 'envelope', appVersion: '1.0.1-fikcyjna', firstSeenAtISO: true},
      {slotId: 'slotA', seq: 10, eid: null, iv: 'Fikcyjne-IV-3', data: null, aad: 2, reason: 'envelope', appVersion: '1.0.0-fikcyjna', firstSeenAtISO: true},
      {slotId: 'slotB', seq: 5, eid: '00000000-0000-4000-8000-000000000006', iv: 'Fikcyjne-IV-5', data: 'Fikcyjny-szyfrogram-5', z: 'gzip', aad: 0, reason: 'format', appVersion: '1.0.0-fikcyjna', firstSeenAtISO: true},
    ]}],
    ['quarantineCount', {ok: true, total: 5, sloty: {slotA: 4, slotB: 1}}],
    ['quarantineMinSeq slotA', {ok: true, seq: 3}],
    ['quarantineMinSeq slotB', {ok: true, seq: 5}],
    ['quarantineRelease slotA [3, 99, 3, 0]', {ok: true, usuniete: [3], pominiete: [99, 3, 0]}],
    ['quarantineMinSeq slotA po zwolnieniu', {ok: true, seq: 4}],
    ['quarantineCount po zwolnieniu', {ok: true, total: 4, sloty: {slotA: 3, slotB: 1}}],
    ['deleteDatabase (połączenie drugiego okna)', {ok: true, wynik: 'zablokowana'}],
    ['deleteDatabase (ponownie)', {ok: true, wynik: 'brak'}],
    ['enqueue po kasowaniu', {ok: false, powod: 'blad', code: 'SYNC_DB_DELETED'}],
    ['quarantinePut po kasowaniu', {ok: false, powod: 'blad', code: 'SYNC_DB_DELETED'}],
    ['quarantineCount po kasowaniu', {ok: false, powod: 'blad', code: 'SYNC_DB_DELETED'}],
    ['enqueue snap (konto 2)', {ok: true, eids: 1, stany: ['pending'], zastapione: 0}],
    ['enqueue snap (kasowanie w trakcie)', {ok: true, eids: 1, stany: ['pending'], zastapione: 1}],
  ],
  bazaPoOdczytach: false,
  kolejka: [
    {kind: 'snap', entityKey: 'id1/id2', setId: null, state: 'inflight', attempts: 1, lastError: 'NETWORK', env: 'iv,data', bytes: true, seq: 0, inflight: true, proba: true},
    {kind: 'snap', entityKey: 'id1/id2', setId: null, state: 'inflight', attempts: 0, lastError: null, env: 'iv,data', bytes: true, seq: 2, inflight: true, proba: false},
    {kind: 'pfull', entityKey: 'id4', setId: 'fikcyjny-zestaw-1', state: 'pending', attempts: 0, lastError: null, env: 'iv,data', bytes: true, seq: 3, inflight: false, proba: false},
    {kind: 'pfull', entityKey: 'id4', setId: 'fikcyjny-zestaw-1', state: 'pending', attempts: 0, lastError: null, env: 'iv,data', bytes: true, seq: 4, inflight: false, proba: false},
    {kind: 'pnote', entityKey: 'id5', setId: null, state: 'pending', attempts: 0, lastError: null, env: 'iv,data', bytes: true, seq: 5, inflight: false, proba: false},
    {kind: 'pnote', entityKey: 'id5', setId: null, state: 'pending', attempts: 0, lastError: null, env: 'iv,data', bytes: true, seq: 6, inflight: false, proba: false},
    {kind: 'snap', entityKey: 'id1/id2', setId: null, state: 'pending', attempts: 0, lastError: null, env: 'iv,data', bytes: true, seq: 7, inflight: false, proba: false},
  ],
  liczniki: {ok: true, pending: 5, inflight: 2, oversize: 0, unreadable: 0, rejected: 0, total: 7},
  podsumowania: [{status: 'unreadable', reason: 'format'}, {status: 'unreadable', reason: 'envelope'}],
  pierwszyWpisBezZmian: true,
  zmianaWersji: null,
  zmianyWersji: 1,
  proba: 'brak',
  kasowanieWTrakcie: {otwarcia: 2, zdarzenia: ['success']},
  bazy: ['vilda_registry', 'vilda_user_U', 'vilda_user_U2'],
});
