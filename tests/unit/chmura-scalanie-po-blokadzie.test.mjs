import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-CHMURA-OPIS (decyzja właściciela 2026-10-26, B: sprzątanie danych sesji trybu chmurowego i jednorazowego przy
// wylogowaniu, blokadzie i po upływie sesji).
//
// Scalanie z chmury tylko w sesji, w której ruszyło: operacje na danych konta wymagają userId (NO_USER), a scalanie
// przerwane zmianą sesji (blokada, ponowne zalogowanie, zalogowanie innego konta) kończy się SESSION_CHANGED bez
// dalszych zapisów — poza listą kosza konta, które scalało, gdy usunęło już wersję.
//
// Prawdziwy vilda_vault.js; magazyn trwały w pamięci z rejestrem wywołań, atrapa Web Locks (blokada pacjenta trzymana
// przez test, żeby scalanie czekało dokładnie w kroku pacjenta). Dane wyłącznie FIKCYJNE.

function magazyn(poczatek = {}) {
  const m = Object.assign(Object.create(null), poczatek);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    klucze: () => Object.keys(m),
  };
}

function atrapaLocks() {
  const stan = new Map();
  const nazwa = (n) => { if (!stan.has(n)) stan.set(n, { zajeta: false, kolejka: [] }); return stan.get(n); };
  function uruchom(n, cb) {
    const s = nazwa(n);
    s.zajeta = true;
    const wynik = Promise.resolve().then(() => cb({ name: n }));
    wynik.then(zwolnij, zwolnij);
    function zwolnij() {
      s.zajeta = false;
      const nast = s.kolejka.shift();
      if (nast) nast.start();
    }
    return wynik;
  }
  return {
    czekajacych: (n) => nazwa(n).kolejka.length,
    request(n, opcje, cb) {
      if (typeof opcje === 'function') { cb = opcje; opcje = {}; }
      const s = nazwa(n);
      if (opcje.ifAvailable) return s.zajeta ? Promise.resolve().then(() => cb(null)) : uruchom(n, cb);
      if (!s.zajeta) return uruchom(n, cb);
      return new Promise((resolve, reject) => {
        const wpis = { start: () => uruchom(n, cb).then(resolve, reject) };
        s.kolejka.push(wpis);
        if (opcje.signal) {
          opcje.signal.addEventListener('abort', () => {
            const i = s.kolejka.indexOf(wpis);
            if (i >= 0) { s.kolejka.splice(i, 1); reject(Object.assign(new Error('przerwano'), { name: 'AbortError' })); }
          });
        }
      });
    },
  };
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });

/* Jednorazowa zapora na crypto.subtle.decrypt: po uzbrojeniu następne odszyfrowanie czeka, aż test je zwolni. */
function cryptoZZapora() {
  const prawdziwe = globalThis.crypto.subtle;
  const z = { uzbrojona: false, osiagnieta: null, zwolnij: null };
  const subtle = new Proxy(prawdziwe, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function') return f;
      if (klucz !== 'decrypt') return f.bind(cel);
      return async function (...a) {
        if (z.uzbrojona) {
          z.uzbrojona = false;
          z.osiagnieta();
          await z.brama;
        }
        return f.apply(cel, a);
      };
    },
  });
  return {
    crypto: { subtle, getRandomValues: (a) => globalThis.crypto.getRandomValues(a), randomUUID: () => globalThis.crypto.randomUUID() },
    uzbroj() {
      z.uzbrojona = true;
      const osiagnieta = new Promise((r) => { z.osiagnieta = r; });
      z.brama = new Promise((r) => { z.zwolnij = r; });
      return { osiagnieta, zwolnij: () => z.zwolnij() };
    },
  };
}

function okno({ locks = null, crypto = globalThis.crypto, indexedDB = null } = {}) {
  const win = {
    crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    location: { hostname: 'localhost' },
    AbortController,
  };
  if (locks) win.navigator = { locks };
  if (indexedDB) win.indexedDB = indexedDB;
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win;
}

/* Magazyn trwały w pamięci z rejestrem wywołań: [metoda, userId] dla każdej metody z userId w pierwszym argumencie. */
function trwalyZRejestrem(sejf) {
  const baza = sejf.createInMemoryAdapter();
  const wywolania = [];
  const bezKonta = /^(listRegistry|getRegistryEntry|putRegistryEntry|updateRegistryEntry|removeRegistryEntry|_peek|whenHydrated|wipeDurable|flushPersist|detachPersist)$/;
  const owiniety = new Proxy(baza, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function' || bezKonta.test(String(klucz))) return typeof f === 'function' ? f.bind(cel) : f;
      return function (...a) { wywolania.push([String(klucz), a[0]]); return f.apply(cel, a); };
    },
  });
  return { baza, owiniety, wywolania };
}

const HASLO = 'Chmura#Scalanie!2026aa';
const naglowek = (i) => ({ name: `Testowy Jan${i}`, user: { lastName: 'Testowy', firstName: `Jan${i}`, dobISO: '2016-03-12', sex: 'M', height: 120 + i, weight: 22 } });

/* Ładunek z dwiema kartami fikcyjnych pacjentów (osobne konto w trybie zwykłym, jak inne urządzenie). */
async function ladunekZInnegoUrzadzenia() {
  const zrodlo = okno();
  zrodlo.VildaVault.setStorageAdapter(zrodlo.VildaVault.createInMemoryAdapter());
  await zrodlo.VildaVault.createUser('Inne#Urzadzenie!2026aa', { label: 'Inne urządzenie', iterations: 1000 });
  const a = await zrodlo.VildaVault.savePatient(naglowek(1), { dedup: false });
  const c = await zrodlo.VildaVault.savePatient(naglowek(2), { dedup: false });
  const ladunek = await zrodlo.VildaVault.exportSyncPayload();
  // Ładunek obcego konta: bez jego koperty hasła i kluczy biometrii (prawdziwy ładunek jest zawsze tego samego konta).
  delete ladunek.credential;
  delete ladunek.passkeys;
  expect(ladunek.patients.length).toBe(2);
  // Scalanie idzie po kartach w kolejności ładunku: pierwsza karta to pierwszy krok pod blokadą pacjenta.
  return { ladunek, pierwszy: ladunek.patients[0].patientId, ids: [a.patientId, c.patientId] };
}

/* Konto w trybie chmurowym od założenia; scalanie ładunku czeka na blokadę pierwszej karty, trzymaną przez test. */
async function scalanieCzeka(opcje = {}) {
  const locks = atrapaLocks();
  const win = okno({ locks, crypto: opcje.crypto });
  const sejf = win.VildaVault;
  const trwaly = trwalyZRejestrem(sejf);
  sejf.setStorageAdapter(trwaly.owiniety);
  const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000, storageMode: 'cloud-only' });
  expect(sejf.isCloudOnlyMode(), 'konto w trybie chmurowym').toBe(true);
  const { ladunek, pierwszy, ids } = await ladunekZInnegoUrzadzenia();
  const nazwa = 'vilda-save-pat:' + pierwszy;
  let zwolnij;
  const trzymana = new Promise((r) => { zwolnij = r; });
  locks.request(nazwa, () => trzymana);
  await chwila(0);
  trwaly.wywolania.length = 0;
  const scalanie = sejf.mergeSyncPayload(ladunek).then((w) => ({ ok: true, w }), (e) => ({ ok: false, kod: e && e.code, e }));
  for (let i = 0; i < 400 && locks.czekajacych(nazwa) === 0; i += 1) await chwila(2);
  expect(locks.czekajacych(nazwa), 'scalanie czeka na blokadę karty pacjenta').toBe(1);
  return { win, sejf, trwaly, konto, ladunek, ids, scalanie, zwolnij };
}

const bezKonta = (w) => w.filter(([, uid]) => typeof uid !== 'string' || !uid);

describe('P-CHMURA-OPIS: blokada w trakcie scalania z chmury', () => {
  for (const powod of ['idle', 'manual', 'user']) {
    it(`lock('${powod}') w trakcie scalania: nic nie trafia do magazynu trwałego, scalanie przerwane`, async () => {
      const d = await scalanieCzeka();
      d.sejf.lock(powod);
      d.zwolnij();
      const wynik = await d.scalanie;
      await chwila(30);
      expect(bezKonta(d.trwaly.wywolania), 'żadnej operacji magazynu bez userId').toEqual([]);
      expect(d.trwaly.baza._peek().userDbs.map((x) => x[0]), 'tylko baza konta').toEqual([d.konto.userId]);
      expect(await d.trwaly.baza.listPatientsForUser(d.konto.userId), 'trwały sklep pacjentów konta pusty').toEqual([]);
      expect(wynik.ok, 'scalanie zgłasza przerwanie').toBe(false);
      expect(wynik.kod).toBe('SESSION_CHANGED');
    });
  }

  it('ponowne zalogowanie tego samego konta w trakcie starego scalania: nowa sesja bez danych z przerwanego scalania', async () => {
    const d = await scalanieCzeka();
    d.sejf.lock('manual');
    await d.sejf.unlockUser(d.konto.userId, HASLO);
    expect(d.sejf.isCloudOnlyMode()).toBe(true);
    d.zwolnij();
    const wynik = await d.scalanie;
    await chwila(30);
    expect(wynik.ok, 'stare scalanie przerwane').toBe(false);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    expect(await d.sejf.listPatients(), 'nowa sesja: nic ze starego scalania').toEqual([]);
    expect(bezKonta(d.trwaly.wywolania)).toEqual([]);
    // Nowa sesja scala sama, od własnego stanu — jak następna synchronizacja.
    const nowe = await d.sejf.mergeSyncPayload(d.ladunek);
    expect(nowe.addedPatientCount).toBe(2);
    expect((await d.sejf.listPatients()).map((p) => p.patientId).sort()).toEqual([...d.ids].sort());
    expect(await d.trwaly.baza.listPatientsForUser(d.konto.userId), 'tryb chmurowy: pacjenci tylko w pamięci').toEqual([]);
  });

  // Delta ze starej sesji: SESSION_CHANGED z vildaMergeBusy — partia delt kończy się, kursor stoi (test na prawdziwym
  // vilda_sync.js: chmura-delta-kursor).
  it('applyEncryptedDelta: delta odszyfrowana w starej sesji nie wchodzi do nowej (SESSION_CHANGED jak zajęta blokada)', async () => {
    const zapora = cryptoZZapora();
    const win = okno({ crypto: zapora.crypto });
    const sejf = win.VildaVault;
    const trwaly = trwalyZRejestrem(sejf);
    sejf.setStorageAdapter(trwaly.owiniety);
    const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000, storageMode: 'cloud-only' });
    const { ladunek } = await ladunekZInnegoUrzadzenia();
    const delta = await sejf.encryptPayloadForCurrentUser(ladunek);
    const z = zapora.uzbroj();
    const wynik = sejf.applyEncryptedDelta(delta).then((w) => ({ ok: true, w }), (e) => ({ ok: false, e }));
    await z.osiagnieta;
    sejf.lock('idle');
    // Ponowne zalogowanie kończy się, zanim stara delta wyjdzie z odszyfrowania (zapora już zużyta).
    await sejf.unlockUser(konto.userId, HASLO);
    expect(sejf.isUnlocked()).toBe(true);
    z.zwolnij();
    const r = await wynik;
    await chwila(30);
    expect(r.ok, 'delta z przerwanej sesji nie jest „zastosowana”').toBe(false);
    expect(r.e && r.e.code).toBe('SESSION_CHANGED');
    expect(r.e && r.e.vildaMergeBusy, 'partia delt kończy się, kursor stoi').toBe(true);
    expect(await sejf.listPatients(), 'nowa sesja bez pacjentów z delty').toEqual([]);
    expect(bezKonta(trwaly.wywolania)).toEqual([]);
  });

  it('bez blokady scalanie działa jak dotąd (tryb chmurowy: pacjenci w pamięci, nic w trwałym sklepie)', async () => {
    const win = okno({ locks: atrapaLocks() });
    const sejf = win.VildaVault;
    const trwaly = trwalyZRejestrem(sejf);
    sejf.setStorageAdapter(trwaly.owiniety);
    const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000, storageMode: 'cloud-only' });
    const { ladunek, ids } = await ladunekZInnegoUrzadzenia();
    const w = await sejf.mergeSyncPayload(ladunek);
    expect(w.addedPatientCount).toBe(2);
    expect((await sejf.listPatients()).map((p) => p.patientId).sort()).toEqual([...ids].sort());
    expect(await trwaly.baza.listPatientsForUser(konto.userId)).toEqual([]);
    expect(bezKonta(trwaly.wywolania)).toEqual([]);
    // Odblokowanie kluczem odzyskiwania i hasłem po blokadzie — ścieżki bez b przed odblokowaniem.
    sejf.lock('manual');
    await sejf.unlockUserWithRecoveryKey(konto.userId, konto.recoveryKey);
    expect(sejf.isUnlocked()).toBe(true);
    sejf.lock('manual');
    await sejf.unlockUser(konto.userId, HASLO);
    expect(sejf.isUnlocked()).toBe(true);
    expect((await sejf.listUsers()).map((u) => u.userId)).toEqual([konto.userId]);
  });
});

/* Konto (tryb zwykły, magazyn w pamięci jako trwały) i ładunek z notatką pacjenta oraz preferencją; scalanie czeka
   na blokadę `nazwa(ladunek)` trzymaną przez test. Po ponownym zalogowaniu stary krok nie może pisać do magazynu. */
async function scalanieLokalneCzeka(nazwa) {
  const locks = atrapaLocks();
  const win = okno({ locks });
  const sejf = win.VildaVault;
  const trwaly = trwalyZRejestrem(sejf);
  sejf.setStorageAdapter(trwaly.owiniety);
  const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
  const zrodlo = okno();
  zrodlo.VildaVault.setStorageAdapter(zrodlo.VildaVault.createInMemoryAdapter());
  await zrodlo.VildaVault.createUser('Inne#Urzadzenie!2026aa', { label: 'Inne urządzenie', iterations: 1000 });
  const a = await zrodlo.VildaVault.savePatient(naglowek(1), { dedup: false });
  for (const w of [121, 122]) {
    await chwila(3);
    await zrodlo.VildaVault.savePatient(Object.assign(naglowek(1), { user: Object.assign(naglowek(1).user, { height: w }) }), { patientId: a.patientId, dedup: false });
  }
  const wersje = (await zrodlo.VildaVault.getPatient(a.patientId)).snapshots;
  await zrodlo.VildaVault.moveSnapshotToTrash(a.patientId, wersje[1].snapshotId);
  await zrodlo.VildaVault.savePatientNote({ patientId: a.patientId, title: 'Morfologia', body: 'Bez odchyleń (fikcyjne).', category: 'wynik-badania' });
  await zrodlo.VildaVault.saveNote({ title: 'Szablon (fikcyjny)', category: 'badanie', body: 'treść szablonu' });
  await zrodlo.VildaVault.savePatientList({ name: 'Lista fikcyjna', memberIds: [a.patientId] });
  const ladunek = await zrodlo.VildaVault.exportSyncPayload();
  delete ladunek.credential;
  // Klucz biometrii (fikcyjny identyfikator) — krok kluczy biometrii coś zapisuje, gdy idzie w nowej sesji.
  ladunek.passkeys = [{ credentialId: 'cred-fikcyjny-1', deviceLabel: 'Telefon fikcyjny', createdAtISO: new Date().toISOString() }];
  ladunek.userPreferences = { palSmoothPasses: { value: '3', updatedAtISO: new Date().toISOString() } };
  expect(ladunek.patientNotes.length).toBe(1);
  expect(ladunek.notes.length).toBe(1);
  expect(ladunek.snapshotTombstones.length).toBe(1);
  expect(ladunek.patientLists.length).toBe(1);
  const blokada = nazwa(ladunek);
  const czekaj = async (opis) => {
    for (let i = 0; i < 400 && locks.czekajacych(blokada) === 0; i += 1) await chwila(2);
    expect(locks.czekajacych(blokada), opis).toBe(1);
  };
  const trzymaj = () => {
    let zwolnij, wzieta;
    const trzymana = new Promise((r) => { zwolnij = r; });
    const ma = new Promise((r) => { wzieta = r; });
    locks.request(blokada, () => { wzieta(); return trzymana; });
    return { zwolnij, ma };
  };
  const t1 = trzymaj();
  await t1.ma;
  let zwolnij = t1.zwolnij;
  const scalanie = sejf.mergeSyncPayload(ladunek).then((w) => ({ ok: true, w }), (e) => ({ ok: false, kod: e && e.code, e }));
  await czekaj('scalanie czeka na blokadę ' + blokada);
  // Druga faza z tą samą blokadą (krok 2): kolejka atrapy jest FIFO — test staje w kolejce za bieżącym krokiem scalania,
  // więc następny krok scalania z tą blokadą czeka już na test.
  const dalej = async () => {
    const t2 = trzymaj();
    zwolnij();
    await t2.ma;
    zwolnij = t2.zwolnij;
    await czekaj('następny krok scalania czeka na blokadę ' + blokada);
  };
  return { sejf, trwaly, konto, ladunek, scalanie, zwolnij: () => zwolnij(), dalej };
}

describe('P-CHMURA-OPIS: stary krok scalania po ponownym zalogowaniu (blokada notatki i metadanych konta)', () => {
  it('notatka pacjenta: krok czekający na blokadę notatki nie zapisuje jej w nowej sesji', async () => {
    const d = await scalanieLokalneCzeka((l) => 'vilda-note-' + l.patientNotes[0].id);
    d.sejf.lock('idle');
    await d.sejf.unlockUser(d.konto.userId, HASLO);
    d.zwolnij();
    const wynik = await d.scalanie;
    await chwila(30);
    expect(wynik.ok).toBe(false);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    expect(await d.trwaly.baza.listPatientNotesForUser(d.konto.userId), 'notatka z przerwanego scalania').toEqual([]);
    // Sekcje Le po notatkach pacjentów idą dalej w nowej sesji (każda ma własny catch) — lista też nie może się zapisać.
    expect(await d.trwaly.baza.listPatientListsForUser(d.konto.userId), 'lista z przerwanego scalania').toEqual([]);
  });

  it('notatka biblioteki: krok czekający na blokadę notatki nie zapisuje jej w nowej sesji', async () => {
    const d = await scalanieLokalneCzeka((l) => 'vilda-note-lib:' + l.notes[0].id);
    d.sejf.lock('user');
    await d.sejf.unlockUser(d.konto.userId, HASLO);
    d.zwolnij();
    const wynik = await d.scalanie;
    await chwila(30);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    expect(await d.trwaly.baza.listNotesForUser(d.konto.userId), 'szablon z przerwanego scalania').toEqual([]);
  });

  it('metadane konta, kosz: krok czekający na blokadę metadanych nie zapisuje kosza ani preferencji w nowej sesji', async () => {
    const d = await scalanieLokalneCzeka(() => 'vilda-note-kosz-zapisow');
    d.sejf.lock('manual');
    await d.sejf.unlockUser(d.konto.userId, HASLO);
    const ostrzezenia = vi.spyOn(console, 'warn').mockImplementation(() => {});
    d.zwolnij();
    const wynik = await d.scalanie;
    await chwila(30);
    const zKosza = ostrzezenia.mock.calls.filter((a) => String(a[0]).includes('kosz zapisow'));
    ostrzezenia.mockRestore();
    expect(wynik.ok).toBe(false);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    expect(zKosza, 'zmiana sesji kończy scalanie od razu, bez ostrzeżenia „kosz zapisów” i dalszych faz').toEqual([]);
    const meta = await d.trwaly.baza.getUserMeta(d.konto.userId);
    expect(meta.snapshotTombstones || [], 'kosz z przerwanego scalania').toEqual([]);
    expect(meta.userPreferences && meta.userPreferences.palSmoothPasses, 'preferencja z przerwanego scalania').toBeUndefined();
    expect(await d.trwaly.baza.listPatientNotesForUser(d.konto.userId)).toEqual([]);
  });

  it('metadane konta, klucze biometrii i preferencje (krok po koszu): nic nie trafia do nowej sesji', async () => {
    const d = await scalanieLokalneCzeka(() => 'vilda-note-kosz-zapisow');
    await d.dalej(); // kosz zapisany jeszcze w starej sesji; scalanie czeka na blokadę metadanych przy kluczach biometrii
    const kosz = ((await d.trwaly.baza.getUserMeta(d.konto.userId)).snapshotTombstones || []).length;
    expect(kosz, 'kosz ze starej sesji').toBe(1);
    d.sejf.lock('idle');
    await d.sejf.unlockUser(d.konto.userId, HASLO);
    d.zwolnij();
    const wynik = await d.scalanie;
    await chwila(30);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    const meta = await d.trwaly.baza.getUserMeta(d.konto.userId);
    expect(meta.userPreferences && meta.userPreferences.palSmoothPasses, 'preferencja z przerwanego scalania').toBeUndefined();
    expect(meta.lastSyncMergeAtISO, 'znacznik scalenia z przerwanego scalania').toBeUndefined();
    expect((meta.passkeys || []).map((k) => k.credentialId), 'klucz biometrii z przerwanego scalania').toEqual([]);
    expect(await d.trwaly.baza.listNotesForUser(d.konto.userId)).toEqual([]);
    expect(await d.trwaly.baza.listPatientListsForUser(d.konto.userId)).toEqual([]);
  });
});

/* Sekcje Le po kroku kluczy biometrii (preferencje, notatki biblioteki, notatki pacjentów, listy, hasło z innego
   urządzenia) mają każda własny catch, więc każdy ich zapis sam sprawdza sesję. Ładunek i stan lokalny dobrane tak, żeby
   w każdej sekcji pierwszym krokiem z zapisem był sprawdzany: usunięcia z ładunku, zdjęcie nagrobków lokalnych, które
   przegrały, hasło zmienione na innym urządzeniu. Scalanie czeka na blokadę metadanych konta w kroku kluczy biometrii
   (po koszu). */
async function poKoszuCzeka({ lokalnie = null, zrodlo = null, ladunekPo = null, toSamoKonto = false } = {}) {
  const locks = atrapaLocks();
  const win = okno({ locks });
  const sejf = win.VildaVault;
  const trwaly = trwalyZRejestrem(sejf);
  sejf.setStorageAdapter(trwaly.owiniety);
  const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
  const stan = lokalnie ? await lokalnie(sejf, trwaly.baza, konto.userId) : null;
  const zr = okno().VildaVault;
  const zrMagazyn = zr.createInMemoryAdapter();
  zr.setStorageAdapter(zrMagazyn);
  if (toSamoKonto) {
    await kopiujKonto(trwaly.baza, zrMagazyn, konto.userId); // drugie urządzenie tego samego konta
    await zr.unlockUser(konto.userId, HASLO);
  } else {
    await zr.createUser('Inne#Urzadzenie!2026aa', { label: 'Inne urządzenie', iterations: 1000 });
  }
  if (zrodlo) await zrodlo(zr, stan);
  const ladunek = await zr.exportSyncPayload();
  if (!toSamoKonto) delete ladunek.credential;
  delete ladunek.passkeys;
  if (ladunekPo) ladunekPo(ladunek);
  const blokada = 'vilda-note-kosz-zapisow';
  const czekaj = async (opis) => {
    for (let i = 0; i < 400 && locks.czekajacych(blokada) === 0; i += 1) await chwila(2);
    expect(locks.czekajacych(blokada), opis).toBe(1);
  };
  const trzymaj = () => {
    let zwolnij, wzieta;
    const trzymana = new Promise((r) => { zwolnij = r; });
    const ma = new Promise((r) => { wzieta = r; });
    locks.request(blokada, () => { wzieta(); return trzymana; });
    return { zwolnij, ma };
  };
  const t1 = trzymaj();
  await t1.ma;
  const metaPrzed = await trwaly.baza.getUserMeta(konto.userId);
  const scalanie = sejf.mergeSyncPayload(ladunek).then((w) => ({ ok: true, w }), (e) => ({ ok: false, kod: e && e.code, e }));
  await czekaj('scalanie czeka na blokadę metadanych (kosz)');
  const t2 = trzymaj();
  t1.zwolnij();
  await t2.ma;
  await czekaj('scalanie czeka na blokadę metadanych (klucze biometrii)');
  return {
    sejf, trwaly, konto, ladunek, stan, metaPrzed, uid: konto.userId,
    async ponownie() {
      sejf.lock('idle');
      await sejf.unlockUser(konto.userId, HASLO);
      t2.zwolnij();
      const wynik = await scalanie;
      await chwila(30);
      expect(wynik.ok, 'stare scalanie przerwane').toBe(false);
      expect(wynik.kod).toBe('SESSION_CHANGED');
      return wynik;
    },
  };
}

describe('P-CHMURA-OPIS: sekcje Le po ponownym zalogowaniu nie zapisują w nowej sesji', () => {
  it('usunięcia z ładunku (szablon, notatka pacjenta, lista): żaden nagrobek nie trafia do nowej sesji', async () => {
    const d = await poKoszuCzeka({
      zrodlo: async (zr) => {
        const p = await zr.savePatient(naglowek(1), { dedup: false });
        const n = await zr.saveNote({ title: 'Szablon (fikcyjny)', category: 'badanie', body: 'treść szablonu' });
        const pn = await zr.savePatientNote({ patientId: p.patientId, title: 'Morfologia', body: 'Bez odchyleń (fikcyjne).', category: 'wynik-badania' });
        const l = await zr.savePatientList({ name: 'Lista fikcyjna', memberIds: [p.patientId] });
        await chwila(3);
        await zr.removeNote(n.id);
        await zr.removePatientNote(pn.id);
        await zr.deletePatientList(l.id);
      },
    });
    expect([d.ladunek.notes.length, d.ladunek.patientNotes.length, d.ladunek.patientLists.length], 'w ładunku same usunięcia').toEqual([0, 0, 0]);
    expect([d.ladunek.noteTombstones.length, d.ladunek.patientNoteTombstones.length, d.ladunek.patientListTombstones.length]).toEqual([1, 1, 1]);
    await d.ponownie();
    expect(await d.trwaly.baza.listNoteTombstonesForUser(d.uid), 'nagrobek szablonu').toEqual([]);
    expect(await d.trwaly.baza.listPatientNoteTombstonesForUser(d.uid), 'nagrobek notatki pacjenta').toEqual([]);
    expect(await d.trwaly.baza.listPatientListTombstonesForUser(d.uid), 'nagrobek listy').toEqual([]);
  });

  it('nagrobki lokalne, które przegrały z nowszym zapisem (szablon, notatka pacjenta, lista): zdejmuje je tylko sesja scalania', async () => {
    // Stan lokalny: zapis usunięty (nagrobek), potem ten sam zapis znów w magazynie z późniejszą zmianą — nagrobek przegrywa
    // i scalanie go zdejmuje. Ładunek bez szablonów, notatek i list, więc w każdej sekcji pierwszy krok to zdjęcie nagrobka.
    const d = await poKoszuCzeka({
      lokalnie: async (sejf, baza, uid) => {
        const p = await sejf.savePatient(naglowek(3), { dedup: false });
        const n = await sejf.saveNote({ title: 'Szablon (fikcyjny)', category: 'badanie', body: 'treść szablonu' });
        const pn = await sejf.savePatientNote({ patientId: p.patientId, title: 'Morfologia', body: 'Bez odchyleń (fikcyjne).', category: 'wynik-badania' });
        const l = await sejf.savePatientList({ name: 'Lista fikcyjna', memberIds: [p.patientId] });
        const surowe = [await baza.getNoteForUser(uid, n.id), await baza.getPatientNoteForUser(uid, pn.id), await baza.getPatientListForUser(uid, l.id)];
        await sejf.removeNote(n.id);
        await sejf.removePatientNote(pn.id);
        await sejf.deletePatientList(l.id);
        await chwila(5);
        const pozniej = new Date().toISOString();
        await baza.putNoteForUser(uid, Object.assign({}, surowe[0], { updatedAtISO: pozniej }));
        await baza.putPatientNoteForUser(uid, Object.assign({}, surowe[1], { updatedAtISO: pozniej, rev: (surowe[1].rev || 0) + 5 }));
        await baza.putPatientListForUser(uid, Object.assign({}, surowe[2], { updatedAtISO: pozniej, rev: (surowe[2].rev || 0) + 5 }));
        return { n: n.id, pn: pn.id, l: l.id };
      },
    });
    const ids = async () => [
      (await d.trwaly.baza.listNoteTombstonesForUser(d.uid)).map((x) => x.id),
      (await d.trwaly.baza.listPatientNoteTombstonesForUser(d.uid)).map((x) => x.id),
      (await d.trwaly.baza.listPatientListTombstonesForUser(d.uid)).map((x) => x.id),
    ];
    const oczekiwane = [[d.stan.n], [d.stan.pn], [d.stan.l]];
    expect(await ids(), 'nagrobki lokalne przed scalaniem').toEqual(oczekiwane);
    await d.ponownie();
    expect(await ids(), 'nagrobki zostają: przerwane scalanie nie zdejmuje ich w nowej sesji').toEqual(oczekiwane);
    // Kontrola: scalanie w nowej sesji, bez przerwania, zdejmuje te nagrobki (stan lokalny jest naprawdę „do zdjęcia”).
    await d.sejf.mergeSyncPayload(d.ladunek);
    expect(await ids(), 'następne scalanie zdejmuje nagrobki, które przegrały').toEqual([[], [], []]);
  });

  it('notatka w stanie CZEKA (nagrobek z „Usuń pacjenta” przed nagrobkiem karty): nagrobek kanonu tylko w sesji scalania', async () => {
    // P-NOTATKI-ZA-KARTA (D-21): drugie urządzenie usunęło kartę z notatką; nagrobek notatki (z polem karty) przychodzi
    // przed nagrobkiem karty (np. osobną deltą), a karta jest tu i nie jest późniejsza niż usunięcie — notatka CZEKA,
    // a scalanie zapisuje nagrobek kanonu (Bnp_ratuj, druga pętla) pod blokadą notatki.
    const d = await poKoszuCzeka({
      lokalnie: async (sejf) => {
        const p = await sejf.savePatient(naglowek(4), { dedup: false });
        const pn = await sejf.savePatientNote({ patientId: p.patientId, title: 'Morfologia', body: 'Bez odchyleń (fikcyjne).', category: 'wynik-badania' });
        const eksport = await sejf.exportSyncPayload();
        delete eksport.credential;
        delete eksport.passkeys;
        return { p: p.patientId, pn: pn.id, eksport };
      },
      zrodlo: async (zr, stan) => {
        await zr.mergeSyncPayload(stan.eksport);
        await chwila(5);
        await zr.removePatient(stan.p);
      },
      ladunekPo: (l) => { l.tombstones = []; }, // nagrobek karty jeszcze nie dotarł
    });
    expect(d.ladunek.patientNoteTombstones.map((x) => x.id), 'w ładunku nagrobek notatki').toEqual([d.stan.pn]);
    await d.ponownie();
    expect(await d.trwaly.baza.listPatientNoteTombstonesForUser(d.uid), 'nagrobek kanonu z przerwanego scalania').toEqual([]);
    expect((await d.trwaly.baza.listPatientNotesForUser(d.uid)).map((x) => x.id), 'notatka zostaje').toEqual([d.stan.pn]);
    // Kontrola: scalanie w nowej sesji zapisuje nagrobek kanonu (stan CZEKA jest prawdziwy).
    await d.sejf.mergeSyncPayload(d.ladunek);
    expect((await d.trwaly.baza.listPatientNoteTombstonesForUser(d.uid)).map((x) => x.id)).toEqual([d.stan.pn]);
  });

  it('hasło zmienione na innym urządzeniu tego konta: nowa koperta hasła nie trafia do nowej sesji', async () => {
    const d = await poKoszuCzeka({
      toSamoKonto: true,
      zrodlo: async (zr) => { await chwila(5); await zr.changePassword(HASLO, 'Nowe#Haslo!2026bb'); },
    });
    expect(d.ladunek.credential && d.ladunek.credential.updatedAtISO > (d.metaPrzed.passwordUpdatedAtISO || ''), 'w ładunku nowsze hasło').toBe(true);
    await d.ponownie();
    const meta = await d.trwaly.baza.getUserMeta(d.uid);
    expect(meta.encryptedMasterByPassword, 'koperta hasła z przerwanego scalania').toEqual(d.metaPrzed.encryptedMasterByPassword);
    expect(meta.passwordUpdatedAtISO || null).toBe(d.metaPrzed.passwordUpdatedAtISO || null);
    // Kontrola: scalanie w nowej sesji przyjmuje nowsze hasło.
    expect((await d.sejf.mergeSyncPayload(d.ladunek)).credentialUpdated).toBe(true);
  });
});

/* Kosz z nowszą treścią (D-6 B, P-KOSZ-NOWSZA-TRESC): wersję S1 poprawiono na tym urządzeniu, a później na drugim
   urządzeniu przeniesiono ją do kosza z dawną treścią. Scalanie usuwa lokalną S1 (nagrobek wygrywa), a poprawioną treść
   niesie już tylko lista kosza; jej zapis czeka na blokadę metadanych konta. Po zmianie sesji w tym czasie lista idzie
   do konta i magazynu z chwili usunięcia wersji. Urządzenie 2 ma ten sam stan konta (kopia rekordów), jak drugie
   urządzenie tego samego konta. */
const karta = (h) => ({ name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: h, weight: 22 } });
async function kopiujKonto(z, dok, uid) {
  await dok.putUserMeta(uid, await z.getUserMeta(uid));
  await dok.putRegistryEntry(await z.getRegistryEntry(uid));
  for (const p of await z.listPatientsForUser(uid)) {
    await dok.putPatientForUser(uid, p);
    for (const s of await z.listSnapshotsForUser(uid, p.patientId)) await dok.putSnapshotForUser(uid, s);
  }
}
async function koszPoUsunieciuCzeka() {
  const locks = atrapaLocks();
  const win = okno({ locks });
  const sejf = win.VildaVault;
  const trwaly = trwalyZRejestrem(sejf);
  sejf.setStorageAdapter(trwaly.owiniety);
  const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
  const p = await sejf.savePatient(karta(120), { dedup: false });
  await chwila(3);
  await sejf.savePatient(karta(121), { patientId: p.patientId, dedup: false });
  const S1 = (await sejf.getPatient(p.patientId)).snapshots.find((w) => w.payload.user.height === 120).snapshotId;
  const drugie = okno().VildaVault;
  const a2 = drugie.createInMemoryAdapter();
  drugie.setStorageAdapter(a2);
  await kopiujKonto(trwaly.baza, a2, konto.userId);
  await chwila(3);
  await sejf.updateSnapshotPayload(p.patientId, S1, karta(130)); // poprawka pomiaru tutaj (t1)
  await chwila(3);
  await drugie.unlockUser(konto.userId, HASLO);
  await drugie.moveSnapshotToTrash(p.patientId, S1); // kosz na drugim urządzeniu (t2 > t1), treść 120
  const ladunek = await drugie.exportSyncPayload();
  const blokada = 'vilda-note-kosz-zapisow';
  let zwolnij, wzieta;
  const trzymana = new Promise((r) => { zwolnij = r; });
  const ma = new Promise((r) => { wzieta = r; });
  locks.request(blokada, () => { wzieta(); return trzymana; });
  await ma;
  trwaly.wywolania.length = 0;
  const scalanie = sejf.mergeSyncPayload(ladunek).then((w) => ({ ok: true, w }), (e) => ({ ok: false, kod: e && e.code, e }));
  for (let i = 0; i < 400 && locks.czekajacych(blokada) === 0; i += 1) await chwila(2);
  expect(locks.czekajacych(blokada), 'zapis listy kosza czeka na blokadę metadanych').toBe(1);
  const lokalnie = async () => (await trwaly.baza.listSnapshotsForUser(konto.userId, p.patientId)).some((x) => x.snapshotId === S1);
  expect(await lokalnie(), 'S1 usunięta lokalnie, zanim zapisała się lista kosza').toBe(false);
  return { sejf, trwaly, konto, ladunek, scalanie, zwolnij, S1, lokalnie };
}
const wKoszu = async (sejf, sid) => (await sejf.listTrashedSnapshots()).find((k) => k.snapshotId === sid) || null;

describe('P-CHMURA-OPIS: zmiana sesji po usunięciu wersji nie gubi nowszej treści w koszu', () => {
  const warianty = {
    'ponowne zalogowanie tego samego konta w czasie czekania': async (d) => {
      d.sejf.lock('manual');
      await d.sejf.unlockUser(d.konto.userId, HASLO);
      d.zwolnij();
      return d.scalanie;
    },
    'auto-wylogowanie (idle), zalogowanie dopiero po końcu scalania': async (d) => {
      d.sejf.lock('idle');
      d.zwolnij();
      const w = await d.scalanie;
      await chwila(30);
      await d.sejf.unlockUser(d.konto.userId, HASLO);
      return w;
    },
  };
  for (const [nazwa, zmien] of Object.entries(warianty)) {
    it(nazwa + ': w koszu poprawiona treść, także po następnym scaleniu', async () => {
      const d = await koszPoUsunieciuCzeka();
      const wynik = await zmien(d);
      await chwila(30);
      expect(wynik.ok, 'scalanie nadal przerwane').toBe(false);
      expect(wynik.kod).toBe('SESSION_CHANGED');
      expect(bezKonta(d.trwaly.wywolania), 'żadnej operacji magazynu bez userId').toEqual([]);
      const k = await wKoszu(d.sejf, d.S1);
      expect(k && k.payload.user.height, 'kosz trzyma treść z poprawką (P-KOSZ-NOWSZA-TRESC)').toBe(130);
      // Następna synchronizacja w nowej sesji: nagrobek z drugiego urządzenia (dawna treść) nie zastępuje poprawki.
      await d.sejf.mergeSyncPayload(d.ladunek);
      expect((await wKoszu(d.sejf, d.S1)).payload.user.height, 'po następnym scaleniu').toBe(130);
      expect(await d.lokalnie(), 'S1 nadal w koszu, nie w karcie').toBe(false);
    });
  }

  it('bez zmiany sesji: kosz z poprawką jak dotąd', async () => {
    const d = await koszPoUsunieciuCzeka();
    d.zwolnij();
    const wynik = await d.scalanie;
    expect(wynik.ok).toBe(true);
    expect((await wKoszu(d.sejf, d.S1)).payload.user.height).toBe(130);
  });

  // Konto z chwili usunięcia, nie bieżące: zmiana sesji w pętli kart, po usunięciu wersji jednej karty, a przed
  // wywołaniem zapisu listy (scalanie czeka na blokadę drugiej karty). Lista idzie do konta, które usunęło wersję.
  it('auto-wylogowanie w pętli kart, po usunięciu wersji innej karty: w koszu poprawiona treść', async () => {
    const locks = atrapaLocks();
    const win = okno({ locks });
    const sejf = win.VildaVault;
    const trwaly = trwalyZRejestrem(sejf);
    sejf.setStorageAdapter(trwaly.owiniety);
    const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
    const p1 = await sejf.savePatient(karta(120), { dedup: false });
    await chwila(3);
    await sejf.savePatient(karta(121), { patientId: p1.patientId, dedup: false });
    const p2 = await sejf.savePatient(naglowek(5), { dedup: false });
    await chwila(3);
    await sejf.savePatient(naglowek(6), { patientId: p2.patientId, dedup: false });
    const S1 = (await sejf.getPatient(p1.patientId)).snapshots.find((w) => w.payload.user.height === 120).snapshotId;
    const T1 = (await sejf.getPatient(p2.patientId)).snapshots[1].snapshotId;
    const drugie = okno().VildaVault;
    const a2 = drugie.createInMemoryAdapter();
    drugie.setStorageAdapter(a2);
    await kopiujKonto(trwaly.baza, a2, konto.userId);
    await chwila(3);
    await sejf.updateSnapshotPayload(p1.patientId, S1, karta(130));
    await chwila(3);
    await drugie.unlockUser(konto.userId, HASLO);
    await drugie.moveSnapshotToTrash(p1.patientId, S1);
    await drugie.moveSnapshotToTrash(p2.patientId, T1);
    const ladunek = await drugie.exportSyncPayload();
    // Kolejność kart w końcu scalania kosza = kolejność nagrobków w ładunku: najpierw karta z poprawką, potem druga.
    ladunek.snapshotTombstones.sort((x, y) => (x.patientId === p1.patientId ? -1 : 0) - (y.patientId === p1.patientId ? -1 : 0));
    expect(ladunek.snapshotTombstones.map((x) => x.patientId)).toEqual([p1.patientId, p2.patientId]);
    // Blokada drugiej karty: pierwszy raz scalanie bierze ją w pętli kart (Bsl_scalPacjenta), drugi — w końcu scalania
    // kosza, już po usunięciu S1 w kroku pierwszej karty. Kolejka atrapy jest FIFO: test staje w kolejce za krokiem
    // pętli kart, więc następny krok tej karty (koniec kosza) czeka już na test.
    const blokada = 'vilda-save-pat:' + p2.patientId;
    const trzymaj = () => {
      let zwolnij, wzieta;
      const trzymana = new Promise((r) => { zwolnij = r; });
      const ma = new Promise((r) => { wzieta = r; });
      locks.request(blokada, () => { wzieta(); return trzymana; });
      return { zwolnij, ma };
    };
    const czekaj = async (opis) => {
      for (let i = 0; i < 400 && locks.czekajacych(blokada) === 0; i += 1) await chwila(2);
      expect(locks.czekajacych(blokada), opis).toBe(1);
    };
    const lokalnie = async () => (await trwaly.baza.listSnapshotsForUser(konto.userId, p1.patientId)).some((x) => x.snapshotId === S1);
    const t1 = trzymaj();
    await t1.ma;
    trwaly.wywolania.length = 0;
    const scalanie = sejf.mergeSyncPayload(ladunek).then((w) => ({ ok: true, w }), (e) => ({ ok: false, kod: e && e.code }));
    await czekaj('pętla kart czeka na blokadę drugiej karty');
    expect(await lokalnie(), 'S1 jeszcze jest').toBe(true);
    const t2 = trzymaj();
    t1.zwolnij();
    await t2.ma;
    await czekaj('koniec scalania kosza czeka na blokadę drugiej karty');
    expect(await lokalnie(), 'S1 usunięta w kroku pierwszej karty').toBe(false);
    sejf.lock('idle');
    t2.zwolnij();
    const wynik = await scalanie;
    await chwila(30);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    expect(bezKonta(trwaly.wywolania)).toEqual([]);
    await sejf.unlockUser(konto.userId, HASLO);
    expect((await wKoszu(sejf, S1) || {}).payload, 'kosz trzyma poprawkę').toBeTruthy();
    expect((await wKoszu(sejf, S1)).payload.user.height).toBe(130);
    await sejf.mergeSyncPayload(ladunek);
    expect((await wKoszu(sejf, S1)).payload.user.height, 'po następnym scaleniu').toBe(130);
  });

  // Magazyn z chwili usunięcia, nie bieżący: po końcu sesji „Zaloguj jednorazowo” (Pe(false), I() na IndexedDB) lista
  // kosza idzie do magazynu w pamięci, w którym scalanie usunęło wersję.
  it('„Zaloguj jednorazowo”: blokada po usunięciu wersji — lista kosza w magazynie sesji, bez bazy IndexedDB', async () => {
    const otwarte = [];
    const locks = atrapaLocks();
    const win = okno({ locks, indexedDB: { open(n) { otwarte.push(n); return {}; }, deleteDatabase() { return {}; } } });
    const sejf = win.VildaVault;
    sejf.setEphemeralMode(true);
    const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
    const p = await sejf.savePatient(karta(120), { dedup: false });
    await chwila(3);
    await sejf.savePatient(karta(121), { patientId: p.patientId, dedup: false });
    const S1 = (await sejf.getPatient(p.patientId)).snapshots.find((w) => w.payload.user.height === 120).snapshotId;
    const bezKoperty = (l) => { delete l.credential; delete l.passkeys; return l; };
    const drugie = okno().VildaVault; // drugie urządzenie (inne konto, ten sam stan kart po scaleniu)
    drugie.setStorageAdapter(drugie.createInMemoryAdapter());
    await drugie.createUser('Inne#Urzadzenie!2026aa', { label: 'Inne urządzenie', iterations: 1000 });
    await drugie.mergeSyncPayload(bezKoperty(await sejf.exportSyncPayload()));
    await chwila(3);
    await sejf.updateSnapshotPayload(p.patientId, S1, karta(130));
    await chwila(3);
    await drugie.moveSnapshotToTrash(p.patientId, S1);
    const ladunek = bezKoperty(await drugie.exportSyncPayload());
    let zwolnij, wzieta;
    const trzymana = new Promise((r) => { zwolnij = r; });
    const ma = new Promise((r) => { wzieta = r; });
    locks.request('vilda-note-kosz-zapisow', () => { wzieta(); return trzymana; });
    await ma;
    const scalanie = sejf.mergeSyncPayload(ladunek).then((w) => ({ ok: true, w }), (e) => ({ ok: false, kod: e && e.code }));
    for (let i = 0; i < 400 && locks.czekajacych('vilda-note-kosz-zapisow') === 0; i += 1) await chwila(2);
    expect(locks.czekajacych('vilda-note-kosz-zapisow')).toBe(1);
    expect((await sejf.getPatient(p.patientId)).snapshots.map((w) => w.snapshotId), 'S1 już usunięta').not.toContain(S1);
    sejf.lock('idle');
    // Pamięć sesji veph:* czyści przy końcu sesji jednorazowej VildaPersistence (tu nieładowany) — jak ona:
    win.sessionStorage.klucze().filter((k) => k.startsWith('veph:')).forEach((k) => win.sessionStorage.removeItem(k));
    zwolnij();
    // Atrapa IndexedDB nigdy nie kończy otwarcia: zapis przez bieżący magazyn zawisłby — wtedy liczy się nazwa bazy.
    const wynik = await Promise.race([scalanie, chwila(2000).then(() => ({ ok: false, kod: 'WISI' }))]);
    await chwila(30);
    expect(otwarte, 'żadna baza IndexedDB (konto jednorazowe ' + konto.userId + ')').toEqual([]);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    expect(win.sessionStorage.klucze().filter((k) => k.startsWith('veph:')), 'zapis listy nie wraca kopią sejfu do pamięci karty').toEqual([]);
  });
});

/* Zalogowanie innego konta (B) w tej samej karcie w trakcie końca scalania kosza konta A. Lista kosza po usunięciu
   wersji idzie bez sprawdzania sesji do konta i magazynu z chwili usunięcia, więc scalanie bierze je tuż po sprawdzeniu
   sesji, bez await przed usunięciem, a treść wersji z ładunku pokonanej przez kosz (Bkz_nowsze) dołącza się tylko
   w sesji scalania (V szyfruje kluczem bieżącej sesji). Konto B na tym samym urządzeniu, w tym samym magazynie.
   Dane wyłącznie FIKCYJNE. */
const HASLO_B = 'Druga#Lekarka!2026bb';
// Odczyt wersji karty w kroku końca scalania kosza (Bkz_scalKoniec): pierwszy await kroku, już po sprawdzeniu sesji
// w Bsl_podBlokada. Wiersz w stosie: loadBrowserScript wykonuje plik przez new Function, która dokleja dwa wiersze.
const WIERSZE_ODCZYTU_KOSZA = fs.readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8').split('\n')
  .flatMap((l, i) => (/const wersje = .*await I\(\)\.listSnapshotsForUser\(b, patientId\) : \[\];/.test(l) ? [i + 3] : []));
const idsKosza = (meta) => ((meta && meta.snapshotTombstones) || []).map((e) => e.snapshotId);
const zapisy = (w, uid) => w.filter(([m, u]) => u === uid && /^(put|remove|update|delete)/.test(m)).map(([m]) => m);

/* Konto B (zablokowane), potem konto A w trybie zwykłym; magazyn trwały z rejestrem, opcjonalnie owinięty przez test. */
async function dwaKonta(owin = null) {
  const locks = atrapaLocks();
  const win = okno({ locks });
  const sejf = win.VildaVault;
  const trwaly = trwalyZRejestrem(sejf);
  sejf.setStorageAdapter(owin ? owin(trwaly.owiniety) : trwaly.owiniety);
  const kontoB = await sejf.createUser(HASLO_B, { label: 'Fikcyjna Druga', iterations: 1000 });
  sejf.lock('manual');
  const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
  return { locks, sejf, trwaly, konto, kontoB };
}

describe('P-CHMURA-OPIS: zalogowanie innego konta w trakcie końca scalania kosza', () => {
  it('zalogowanie konta B w trakcie odczytu wersji w końcu scalania kosza: żadnego zapisu ze scalania A na koncie B', async () => {
    expect(WIERSZE_ODCZYTU_KOSZA, 'jeden odczyt wersji w końcu scalania kosza').toHaveLength(1);
    const stan = { uzbrojony: false, zrobione: false, sejf: null, kontoB: null, wywolania: null, odZmiany: -1 };
    const d = await dwaKonta((cel) => new Proxy(cel, {
      get(c, k) {
        const f = c[k];
        if (k !== 'listSnapshotsForUser' || typeof f !== 'function') return typeof f === 'function' ? f.bind(c) : f;
        return async function (...a) {
          const stos = String(new Error().stack);
          const wynik = await f.apply(c, a);
          if (stan.uzbrojony && !stan.zrobione && stos.includes('<anonymous>:' + WIERSZE_ODCZYTU_KOSZA[0] + ':')) {
            stan.zrobione = true;
            stan.sejf.lock('manual');
            await stan.sejf.unlockUser(stan.kontoB, HASLO_B);
            stan.odZmiany = stan.wywolania.length;
          }
          return wynik;
        };
      },
    }));
    const { sejf, trwaly, konto, kontoB } = d;
    Object.assign(stan, { sejf, kontoB: kontoB.userId, wywolania: trwaly.wywolania });
    // Jak w bloku kosza z nowszą treścią: S1 poprawiona tutaj, na drugim urządzeniu tego konta później przeniesiona do kosza.
    const p = await sejf.savePatient(karta(120), { dedup: false });
    await chwila(3);
    await sejf.savePatient(karta(121), { patientId: p.patientId, dedup: false });
    const S1 = (await sejf.getPatient(p.patientId)).snapshots.find((w) => w.payload.user.height === 120).snapshotId;
    const drugie = okno().VildaVault;
    const a2 = drugie.createInMemoryAdapter();
    drugie.setStorageAdapter(a2);
    await kopiujKonto(trwaly.baza, a2, konto.userId);
    await chwila(3);
    await sejf.updateSnapshotPayload(p.patientId, S1, karta(130));
    await chwila(3);
    await drugie.unlockUser(konto.userId, HASLO);
    await drugie.moveSnapshotToTrash(p.patientId, S1);
    const ladunek = await drugie.exportSyncPayload();
    const lokalnie = async () => (await trwaly.baza.listSnapshotsForUser(konto.userId, p.patientId)).some((x) => x.snapshotId === S1);
    stan.uzbrojony = true;
    const wynik = await sejf.mergeSyncPayload(ladunek).then(() => ({ ok: true }), (e) => ({ ok: false, kod: e && e.code }));
    await chwila(30);
    expect(stan.zrobione, 'przełączenie w odczycie wersji końca scalania kosza').toBe(true);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    expect(zapisy(trwaly.wywolania.slice(stan.odZmiany), kontoB.userId), 'żaden zapis ze starego scalania na koncie B').toEqual([]);
    expect(idsKosza(await trwaly.baza.getUserMeta(kontoB.userId)), 'metadane konta B bez kosza konta A').toEqual([]);
    expect((await sejf.listTrashedSnapshots()).map((k) => k.snapshotId), 'kosz w sesji B').not.toContain(S1);
    expect(await lokalnie(), 'S1 nadal w karcie A — przerwany krok jej nie usunął').toBe(true);
    // Następne scalanie w A robi to samo w swojej sesji.
    stan.uzbrojony = false;
    sejf.lock('manual');
    await sejf.unlockUser(konto.userId, HASLO);
    await sejf.mergeSyncPayload(ladunek);
    expect((await wKoszu(sejf, S1)).payload.user.height, 'kosz A z poprawką po następnym scaleniu').toBe(130);
    expect(await lokalnie(), 'S1 w koszu, nie w karcie').toBe(false);
  }, 30000);

  it('zalogowanie konta B w czasie czekania na blokadę drugiej karty: nowsza treść z ładunku dołącza się do kosza A tylko w sesji A', async () => {
    const { locks, sejf, trwaly, konto, kontoB } = await dwaKonta();
    // Karta 1: S1 poprawiona tutaj, na drugim urządzeniu później do kosza — usuwa ją krok karty 1. S3 poprawiona na
    // drugim urządzeniu, a tutaj później do kosza: kosz lokalny wygrywa z wersją z ładunku, której nowsza treść trafia
    // do kosza na końcu scalania (Bkz_nowsze, P-KOSZ-NOWSZA-TRESC). Karta 2: T1 do kosza na drugim urządzeniu — na jej
    // blokadę czeka koniec scalania kosza.
    const p1 = await sejf.savePatient(karta(120), { dedup: false });
    await chwila(3); await sejf.savePatient(karta(121), { patientId: p1.patientId, dedup: false });
    await chwila(3); await sejf.savePatient(karta(122), { patientId: p1.patientId, dedup: false });
    const p2 = await sejf.savePatient(naglowek(5), { dedup: false });
    await chwila(3); await sejf.savePatient(naglowek(6), { patientId: p2.patientId, dedup: false });
    const sn = (await sejf.getPatient(p1.patientId)).snapshots;
    const S1 = sn.find((w) => w.payload.user.height === 120).snapshotId;
    const S3 = sn.find((w) => w.payload.user.height === 122).snapshotId;
    const T1 = (await sejf.getPatient(p2.patientId)).snapshots.find((w) => w.payload.user.height === 125).snapshotId;
    const drugie = okno().VildaVault;
    const a2 = drugie.createInMemoryAdapter();
    drugie.setStorageAdapter(a2);
    await kopiujKonto(trwaly.baza, a2, konto.userId);
    await drugie.unlockUser(konto.userId, HASLO);
    await chwila(3);
    await sejf.updateSnapshotPayload(p1.patientId, S1, karta(130));
    await drugie.updateSnapshotPayload(p1.patientId, S3, karta(133));
    await chwila(3);
    await drugie.moveSnapshotToTrash(p1.patientId, S1);
    await drugie.moveSnapshotToTrash(p2.patientId, T1);
    await sejf.moveSnapshotToTrash(p1.patientId, S3);
    const ladunek = await drugie.exportSyncPayload();
    ladunek.snapshotTombstones.sort((x, y) => (x.patientId === p1.patientId ? -1 : 0) - (y.patientId === p1.patientId ? -1 : 0));
    expect(ladunek.snapshotTombstones.map((x) => x.patientId)).toEqual([p1.patientId, p2.patientId]);
    // Blokada karty 2 (jak w teście wylogowania w pętli kart): najpierw pętla kart, potem koniec scalania kosza.
    const blokada = 'vilda-save-pat:' + p2.patientId;
    const trzymaj = () => {
      let zwolnij, wzieta;
      const trzymana = new Promise((r) => { zwolnij = r; });
      const ma = new Promise((r) => { wzieta = r; });
      locks.request(blokada, () => { wzieta(); return trzymana; });
      return { zwolnij, ma };
    };
    const czekaj = async (opis) => {
      for (let i = 0; i < 400 && locks.czekajacych(blokada) === 0; i += 1) await chwila(2);
      expect(locks.czekajacych(blokada), opis).toBe(1);
    };
    const t1 = trzymaj();
    await t1.ma;
    const scalanie = sejf.mergeSyncPayload(ladunek).then(() => ({ ok: true }), (e) => ({ ok: false, kod: e && e.code }));
    await czekaj('pętla kart czeka na blokadę karty 2');
    const t2 = trzymaj();
    t1.zwolnij();
    await t2.ma;
    await czekaj('koniec scalania kosza czeka na blokadę karty 2');
    expect((await trwaly.baza.listSnapshotsForUser(konto.userId, p1.patientId)).map((x) => x.snapshotId), 'S1 usunięta w kroku karty 1').not.toContain(S1);
    sejf.lock('manual');
    await sejf.unlockUser(kontoB.userId, HASLO_B); // inne konto w tej samej karcie przeglądarki
    const odZmiany = trwaly.wywolania.length;
    t2.zwolnij();
    const wynik = await scalanie;
    await chwila(30);
    expect(wynik.kod).toBe('SESSION_CHANGED');
    expect(zapisy(trwaly.wywolania.slice(odZmiany), kontoB.userId), 'żaden zapis ze starego scalania na koncie B').toEqual([]);
    expect(idsKosza(await trwaly.baza.getUserMeta(kontoB.userId)), 'metadane konta B bez kosza konta A').toEqual([]);
    const wS3 = ((await trwaly.baza.getUserMeta(konto.userId)).snapshotTombstones || []).find((e) => e.snapshotId === S3);
    expect(wS3 && wS3.payloadCipher, 'S3 w koszu A z treścią').toBeTruthy();
    const kluczemB = await sejf.decryptPayloadForCurrentUser(wS3.payloadCipher.iv, wS3.payloadCipher.data).then(() => 'czyta', () => 'nie czyta');
    expect(kluczemB, 'treść S3 w koszu A nie jest zaszyfrowana kluczem konta B').toBe('nie czyta');
    sejf.lock('manual');
    await sejf.unlockUser(konto.userId, HASLO);
    const wzrost = async (sid) => { const k = await wKoszu(sejf, sid); return k && k.payload && k.payload.user ? k.payload.user.height : null; };
    expect(await wzrost(S1), 'K1: S1 z poprawką').toBe(130);
    expect(await wzrost(S3), 'S3 czytelna w A — treść nagrobka').toBe(122);
    expect(await wzrost(T1), 'T1 w koszu').toBe(125);
    // Następne scalanie w A dopisuje nowszą treść z ładunku w swojej sesji.
    await sejf.mergeSyncPayload(ladunek);
    expect(await wzrost(S3), 'po następnym scaleniu: nowsza treść z ładunku').toBe(133);
    expect(await wzrost(S1), 'po następnym scaleniu').toBe(130);
  }, 30000);
});

describe('P-CHMURA-OPIS: adaptery bez userId', () => {
  /* Atrapa IndexedDB: zapisuje nazwy otwieranych baz; otwarcie nigdy się nie kończy (wystarcza do sprawdzenia nazwy). */
  function atrapaIdb() {
    const otwarte = [];
    return { otwarte, open(nazwa) { otwarte.push(nazwa); return {}; }, deleteDatabase() { return {}; } };
  }

  it('IndexedDB (Sa): operacja na danych konta bez userId odrzucona (NO_USER), bez otwierania bazy', async () => {
    const idb = atrapaIdb();
    const sejf = okno({ indexedDB: idb }).VildaVault;
    const r = sejf.listPasskeys(null).then(() => 'ok', (e) => e && e.code);
    await chwila(10);
    expect(idb.otwarte).not.toContain('vilda_user_null');
    expect(idb.otwarte).not.toContain('vilda_user_undefined');
    expect(await Promise.race([r, chwila(100).then(() => 'wisi')])).toBe('NO_USER');
    // Konto z identyfikatorem — baza otwierana jak dotąd.
    sejf.listPasskeys('abc123');
    await chwila(10);
    expect(idb.otwarte).toContain('vilda_user_abc123');
  });

  it('pamięć (Ze): zapis bez userId odrzucony, z userId jak dotąd', async () => {
    const sejf = okno().VildaVault;
    const m = sejf.createInMemoryAdapter();
    for (const uid of [null, undefined, '']) {
      await expect(m.putPatientForUser(uid, { patientId: 'p1' })).rejects.toMatchObject({ code: 'NO_USER' });
      await expect(m.putSnapshotForUser(uid, { snapshotId: 's1', patientId: 'p1' })).rejects.toMatchObject({ code: 'NO_USER' });
      await expect(m.putUserMeta(uid, {})).rejects.toMatchObject({ code: 'NO_USER' });
    }
    expect(m._peek().userDbs).toEqual([]);
    expect(await m.listPatientsForUser(null), 'odczyt bez userId: pusto, bez skutków').toEqual([]);
    await m.putPatientForUser('u1', { patientId: 'p1' });
    expect((await m.listPatientsForUser('u1')).map((p) => p.patientId)).toEqual(['p1']);
  });
});
