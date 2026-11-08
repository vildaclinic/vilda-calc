// P-DZIENNIK-ZDARZEN (E2-PR2b, E2-PR3a1, E2-PR3a1c) — zapis bazowy „bramka wyłączona” (U3).
//
// Ten sam deterministyczny scenariusz sejfu w czterech wariantach okna daje dokładnie te ślady, które zapisano
// w tests/fixtures/dziennik-zapis-bazowy.json. Fiksturę nagrano na sejfie, który ma magazyn kolejki i przy usuwaniu
// konta kasuje kolejkę, dziennik dostępu i ustawienia kopii zapasowej konta; pola opis i bazaVault (sha256 sejfu)
// pochodzą z pierwszego nagrania, na sejfie bez magazynu kolejki. Wobec pierwszego nagrania różni się wyłącznie
// usuwanie konta poza trybem „Zaloguj jednorazowo”: dwa dodatkowe wywołania listy baz — od E2-PR3a1 sprawdzenie bazy
// kolejki, od E2-PR3a1c sprawdzenie bazy dziennika dostępu konta i bazy ustawień eksportu (jedno wywołanie) — czyli
// „databases ×3” w krokach „usunięcie konta z kopii” i „usunięcie konta” wariantów Ze, prywatny i chmura (6 komórek;
// nagranie E2-PR3a1c zmieniło w nich tylko „databases ×2” na „databases ×3”). Zadaniem testu jest przenieść dowód
// „bramka wyłączona” przez E2-PR3a: wolno zmienić wyłącznie liczbę odczytów bramki (o liczbę emisji) i ślady kroków
// „usunięcie konta…” o kroki kasowania kolejki (plan, wiersz E2-PR3a; od E2-PR3a1 i E2-PR3a1c — jak wyżej) — nic
// więcej.
//
// WARIANTY (każde okno ma atrapę IndexedDB z tests/support/atrapa-indexeddb.mjs i moduły punktu odzyskiwania)
//   Ze           sejf na adapterze w pamięci z rejestrem wywołań (magazynZRejestrem);
//   prywatny     „Komputer prywatny”: adapter IndexedDB sejfu nad atrapą;
//   chmura       „Komputer w pracy”: konto storageMode 'cloud-only' nad atrapą;
//   jednorazowo  „Zaloguj jednorazowo”: setEphemeralMode(true) przed każdym logowaniem.
//
// SCENARIUSZ — operacje, w które E2-PR3a wepnie dopisanie do kolejki albo jej kasowanie: konto, nowa karta, nowa
// wersja, poprawka w miejscu, gwiazdka i odpięcie, kosz i „Przywróć”, usunięcie wersji, retencja, notatka pacjenta
// (dodaj, popraw, usuń), notatka biblioteki (dodaj, usuń), lista (dodaj, usuń), plan opieki, „Scal pacjentów”, „Usuń
// pacjenta”, zmiana hasła, eksport i scalenie własnego eksportu (z fikcyjnym kluczem dostępu z innego urządzenia), delta
// karty, koperta zdarzenia przez applyEncryptedEvent, import karty i scalenie kopii konta innego fikcyjnego konta, import
// starego formatu, osoba spoza bazy i „Scal z istniejącym”, przywrócenie wersji jako nowej, zmiana trybu
// przechowywania w obie strony, nowa tożsamość synchronizacji (atrapa VildaSync.inspectTemplateLibraryAuthority tylko
// na czas tego kroku), usunięcie klucza dostępu, blokada, odtworzenie konta z kopii (przed odblokowaniem),
// odblokowanie, usunięcie obu kont. Poza zapisem bazowym (pokrywa E2-PR3a): rejestracja i logowanie kluczem dostępu
// (WebAuthn) oraz hak VildaPersistence.
//
// ŚLADY każdego kroku, po maskowaniu identyfikatorów kont (<uid>, <uid2>), bez wartości rekordów: dziennik atrapy
// IndexedDB jako zbiór wpisów z krotnością (kolejność wpisów współbieżnych transakcji zależy od czasu kryptografii,
// skład kroku — nie), wywołania magazynu (metoda i konto; wariant Ze), zapisy localStorage po kolei, zbiór (operacja,
// klucz) sessionStorage, liczba operacji crypto.subtle, liczba powiadomień każdego rodzaju, liczba zadań w tle sejfu
// odpalonych po kroku i skrót wyniku operacji (pola liczbowe, logiczne i status). Po scenariuszu: nazwy baz z
// databases(), obecność klucza o przedrostku vilda-sync-device-v1 i liczba odczytów pola okna VILDA_EVENT_LOG (getter
// założony PRZED załadowaniem skryptów — liczy także odczyty przy ładowaniu).
//
// DETERMINIZM: zegar sztuczny (tylko Date, stały krok 1 s); zadanie w tle sejfu po zalogowaniu (goły setTimeout 3 s
// z CareMvpBackgroundFormatError) przechwycone i odpalane jawnie po kroku, który je zlecił; po każdym kroku cisza (koniec
// transakcji atrapy i operacji crypto.subtle, zaległe timery 0 ms okna odpalone). Kontrola: każdy wariant także z
// przerwą 3,5 s po zalogowaniu i z obciążeniem w tle (pętla w drugim wątku i PBKDF2) — ślady równe fiksturze.
//
// NAGRANIE fikstury: E2_ZAPIS_BAZOWY=nagraj npx vitest run --maxWorkers=1 tests/unit/sync-dziennik-zapis-bazowy.test.mjs
// — przy zamkniętej bramce. Tryb nagrania odmawia (nie zapisuje pliku), gdy trzy przebiegi wariantu nie są równe albo
// gdy w którymkolwiek wariancie pole bramki było czytane, powstała baza vilda_sync_* albo klucz o przedrostku
// vilda-sync-device-v1. Pierwsze nagranie (E2-PR2b1) zrobiono na sejfie bazy bez magazynu kolejki (sejf z uśpionym
// magazynem daje te same ślady); ponowne (E2-PR3a1) — na sejfie z magazynem kolejki i kasowaniem kolejki przy usuwaniu
// konta, z polami opis i bazaVault przeniesionymi z pierwszego nagrania (tryb nagrania zapisuje je od nowa); kolejne
// (E2-PR3a1c) — na sejfie, który przy usuwaniu konta kasuje też dziennik dostępu i ustawienia kopii konta, z tymi
// samymi przeniesionymi polami opis i bazaVault. PR, który zmienia ślad sejfu w krokach scenariusza, nagrywa fiksturę
// ponownie i wymienia w opisie zmienione kroki. Dane wyłącznie fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';
import { atrapaKrypto, magazynZRejestrem, naglowek, okno, repo } from './sesja-zapisu-uprzaz.mjs';

const PLIK_FIKSTURY = path.join(repo, 'tests/fixtures/dziennik-zapis-bazowy.json');
const NAGRANIE = process.env.E2_ZAPIS_BAZOWY === 'nagraj';
const WARIANTY = ['Ze', 'prywatny', 'chmura', 'jednorazowo'];
const START = Date.parse('2026-03-02T08:00:00.000Z');
const START_OBCEGO = Date.parse('2026-03-01T08:00:00.000Z');
const KROK_MS = 1000;
const PRZERWA_MS = 3500;
// Kolejność jak na stronie głównej aplikacji (bez vilda_sync.js i modułów interfejsu).
const SKRYPTY = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_care_plan_model.js', 'vilda_clinical_crypto.js',
  'vilda_patient_checkpoint_store.js', 'vilda_patient_checkpoint.js', 'vilda_vault.js'];
const POWIADOMIENIA = ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged', 'onPatientListChanged',
  'onCredentialChanged', 'onPreferenceChanged', 'onPasskeyChanged', 'onUnlock', 'onLock'];
const HASLO_1 = 'Fikcyjne#ZapisBazowy!2026aa';
const HASLO_2 = 'Fikcyjne#ZapisBazowy!2026bb';
const HASLO_OBCE = 'Fikcyjne#InneKonto!2026cc';
const ZADANIE_W_TLE = 'CareMvpBackgroundFormatError';
const oryginalnySetTimeout = globalThis.setTimeout;

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const czekaj = (ms) => new Promise((r) => { oryginalnySetTimeout(r, ms); });
const makrozadanie = () => new Promise((r) => { setImmediate(r); });
const zwin = (wpisy) => {
  const ile = new Map();
  for (const w of wpisy) ile.set(w, (ile.get(w) || 0) + 1);
  return [...ile.keys()].sort().map((w) => (ile.get(w) > 1 ? `${w} ×${ile.get(w)}` : w));
};
// Skrót wyniku operacji: pola liczbowe, logiczne i null oraz status/reason; tablice jako długość; bez napisów
// (identyfikatory, chwile) i bez obiektów zagnieżdżonych.
function skrot(x) {
  if (x === undefined) return 'brak';
  if (x === null || typeof x !== 'object') return typeof x === 'string' ? 'napis' : x;
  const out = {};
  for (const k of Object.keys(x).sort()) {
    const w = x[k];
    if (w === null || typeof w === 'number' || typeof w === 'boolean') out[k] = w;
    else if ((k === 'status' || k === 'reason') && typeof w === 'string') out[k] = w;
    else if (Array.isArray(w)) out[k] = `#${w.length}`;
  }
  return out;
}

// Konto „z innego urządzenia”: dwie karty, notatka; koperta karty i kopia konta do importu (raz na proces, zegar stały).
let obce = null;
function obceKonto() {
  if (!obce) {
    obce = (async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(START_OBCEGO);
      try {
        const o = okno();
        const v = o.win.VildaVault;
        v.setStorageAdapter(v.createInMemoryAdapter());
        await v.createUser(HASLO_OBCE, { label: 'Fikcyjny Lekarz Inny', iterations: 1000 });
        const k7 = (await v.savePatient(naglowek(7), { dedup: false })).patientId;
        vi.setSystemTime(START_OBCEGO + KROK_MS);
        await v.savePatient(naglowek(7, { masa: 25 }), { dedup: false, patientId: k7 });
        await v.savePatientNote({ patientId: k7, title: 'Fikcyjna notatka innego konta', body: 'Fikcyjna treść.', category: 'inne' });
        await v.savePatient(naglowek(8), { dedup: false });
        const wynik = { koperta: await v.exportPatientEnvelope(k7), kopia: await v.exportVaultBackup() };
        v.lock('manual');
        o.timery.wyczysc();
        return wynik;
      } finally { vi.useRealTimers(); }
    })();
  }
  return obce;
}

// Obciążenie w tle na czas przebiegu: pętla zajmująca rdzeń w drugim wątku i trzy równoległe PBKDF2 (pula wątków
// kryptografii Node — ta sama, z której korzysta crypto.subtle okna).
async function zObciazeniem(fn) {
  const watek = new Worker('for (;;) {}', { eval: true });
  const klucz = await crypto.subtle.importKey('raw', new Uint8Array(16), 'PBKDF2', false, ['deriveBits']);
  const stan = { dziala: true };
  const pbkdf2 = () => crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 20000 }, klucz, 256);
  const petla = (async () => { while (stan.dziala) await Promise.all([pbkdf2(), pbkdf2(), pbkdf2()]); })();
  try { return await fn(); } finally { stan.dziala = false; await petla; await watek.terminate(); }
}

async function przebieg(wariant, { przerwa = 0 } = {}) {
  const inne = await obceKonto();
  vi.useFakeTimers({ toFake: ['Date'] });
  let zegar = START;
  vi.setSystemTime(zegar);
  const przechwycone = [];
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(function (fn, ms, ...a) {
    if (typeof fn === 'function' && String(fn).includes(ZADANIE_W_TLE)) { przechwycone.push(fn); return 0; }
    return oryginalnySetTimeout(fn, ms, ...a);
  });
  const idb = utworzIndexedDB();
  vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
  // crypto.subtle okna: atrapa z uprzęży (liczba operacji) i licznik operacji w toku (do ciszy po kroku).
  const krypto = atrapaKrypto();
  let kryptoWToku = 0;
  const subtle = new Proxy(krypto.crypto.subtle, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      return (...a) => {
        kryptoWToku += 1;
        let p;
        try { p = Promise.resolve(f.apply(cel, a)); } catch (e) { kryptoWToku -= 1; throw e; }
        return p.finally(() => { kryptoWToku -= 1; });
      };
    },
  });
  const o = okno({ skrypty: [], krypto: { ...krypto, crypto: { ...krypto.crypto, subtle } }, dodatki: { indexedDB: idb } });
  let odczytyBramki = 0;
  Object.defineProperty(o.win, 'VILDA_EVENT_LOG', { get() { odczytyBramki += 1; return undefined; }, configurable: true });
  for (const plik of SKRYPTY) loadBrowserScript(plik, o.win);
  const v = o.win.VildaVault;
  const m = wariant === 'Ze' ? magazynZRejestrem(v.createInMemoryAdapter()) : null;
  if (m) v.setStorageAdapter(m.adapter);
  const zdarzenia = [];
  for (const api of POWIADOMIENIA) v[api](() => { zdarzenia.push(api); });

  const konta = [];
  const maska = (x) => konta.reduce((s, u, i) => s.split(u).join(i ? `<uid${i + 1}>` : '<uid>'), String(x));
  const wpisIdb = (w) => maska(w.map((x) => (Array.isArray(x) ? `[${x.join(',')}]` : String(x))).join(' '));
  const znacznik = () => ({ idb: idb.__atrapa.log.length, wyw: m ? m.wyw.length : 0, dz: o.dziennik.length, kr: krypto.log.length, zd: zdarzenia.length });
  // Cisza po kroku: brak transakcji atrapy i operacji crypto.subtle w toku, zaległe timery 0 ms okna odpalone i 20
  // kolejnych makrozadań bez nowego wpisu w żadnym śladzie (limit 60 s czasu rzeczywistego).
  async function cisza() {
    const koniec = performance.now() + 60_000;
    let stabilne = 0;
    let poprzedni = null;
    while (performance.now() < koniec) {
      o.timery.odpal((t) => t.ms === 0);
      if (kryptoWToku) await czekaj(1); else await makrozadanie();
      const stan = [idb.__atrapa.log.length, idb.__atrapa.wToku(), kryptoWToku, krypto.log.length, m ? m.wyw.length : 0, o.dziennik.length, zdarzenia.length].join();
      if (stan === poprzedni && !idb.__atrapa.wToku() && !kryptoWToku) {
        stabilne += 1;
        if (stabilne >= 20) return;
      } else stabilne = 0;
      poprzedni = stan;
    }
    throw new Error(`sejf nie ucichł po kroku (${wariant}): transakcje atrapy albo crypto.subtle w toku`);
  }
  const odcinek = (z) => {
    const powiadomienia = {};
    for (const n of zdarzenia.slice(z.zd)) powiadomienia[n] = (powiadomienia[n] || 0) + 1;
    const dz = o.dziennik.slice(z.dz);
    const wynik = {
      indexedDB: zwin(idb.__atrapa.log.slice(z.idb).map(wpisIdb)),
      localStorage: dz.filter((x) => x.magazyn === 'localStorage').map((x) => `${x.op} ${maska(x.klucz)}`),
      sessionStorage: [...new Set(dz.filter((x) => x.magazyn === 'sessionStorage').map((x) => `${x.op} ${maska(x.klucz)}`))].sort(),
      krypto: krypto.log.length - z.kr,
      powiadomienia,
    };
    if (m) wynik.magazyn = m.wyw.slice(z.wyw).map(([metoda, u]) => `${metoda}(${u == null ? '' : maska(u)})`);
    return wynik;
  };

  const slad = { ladowanie: odcinek({ idb: 0, wyw: 0, dz: 0, kr: 0, zd: 0 }), kroki: [] };
  const s = {};
  // odmowa: wariant, w którym sejf z założenia odrzuca operację (zapisywane jako wynik kroku); każdy inny wyjątek
  // przerywa scenariusz.
  async function krok(nazwa, fn, { przerwaPo = 0, odmowa = null } = {}) {
    zegar += KROK_MS;
    vi.setSystemTime(zegar);
    const z = znacznik();
    let wynik;
    try { wynik = skrot(await fn()); } catch (e) {
      if (odmowa !== wariant) throw new Error(`krok „${nazwa}” (${wariant}): ${(e && e.code) || ''} ${e && e.message}`);
      wynik = { odrzucona: (e && e.code) || 'bez kodu' };
    }
    await cisza();
    if (przerwaPo) await czekaj(przerwaPo);
    const tlo = przechwycone.splice(0);
    for (const f of tlo) f();
    if (tlo.length) await cisza();
    slad.kroki.push({ krok: nazwa, wynik, tlo: tlo.length, ...odcinek(z) });
  }
  const zaloguj = () => { if (wariant === 'jednorazowo') v.setEphemeralMode(true); };
  const chmura = wariant === 'chmura';
  let haslo = HASLO_1;
  const wersje = async (pid) => (await v.getPatient(pid)).snapshots;

  await krok('konto', async () => {
    zaloguj();
    const u = await v.createUser(HASLO_1, { label: 'Fikcyjna Lekarka Zapis', iterations: 1000, ...(chmura ? { storageMode: 'cloud-only' } : {}) });
    konta.push(u.userId);
    s.uid = u.userId;
    return u;
  }, { przerwaPo: przerwa });
  await krok('nowa karta', async () => { const r = await v.savePatient(naglowek(1), { dedup: false }); s.P1 = r.patientId; return r; });
  await krok('nowa wersja', () => v.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: s.P1 }));
  await krok('poprawka w miejscu', async () => {
    const [nowa, stara] = await wersje(s.P1);
    s.sStara = stara.snapshotId;
    return v.updateSnapshotPayload(s.P1, nowa.snapshotId, { ...nowa.payload, user: { ...nowa.payload.user, weight: 24 } }, { preserveSavedAt: true });
  });
  await krok('gwiazdka', () => v.setSnapshotPinned(s.P1, s.sStara, true));
  await krok('odpięcie gwiazdki', () => v.setSnapshotPinned(s.P1, s.sStara, false));
  await krok('kosz', () => v.moveSnapshotToTrash(s.P1, s.sStara));
  await krok('przywróć z kosza', () => v.restoreTrashedSnapshot(s.P1, s.sStara));
  await krok('trzecia wersja', () => v.savePatient(naglowek(1, { masa: 25 }), { dedup: false, patientId: s.P1 }));
  await krok('usunięcie wersji', async () => v.deleteSnapshot(s.P1, (await wersje(s.P1))[0].snapshotId));
  await krok('retencja', () => v.pruneSnapshotsForPatient(s.P1, { recentHours: 0 }));
  await krok('notatka pacjenta: dodaj', async () => {
    const r = await v.savePatientNote({ patientId: s.P1, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    s.N = r.id;
    return r;
  });
  await krok('notatka pacjenta: popraw', () => v.savePatientNote({ id: s.N, patientId: s.P1, title: 'Fikcyjna notatka (poprawiona)', body: 'Fikcyjna treść 2.', category: 'inne' }));
  await krok('notatka pacjenta: usuń', () => v.removePatientNote(s.N));
  await krok('notatka biblioteki: dodaj', async () => { const r = await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' }); s.L = r.id; return r; });
  await krok('notatka biblioteki: usuń', () => v.removeNote(s.L));
  await krok('lista: dodaj', async () => { const r = await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P1] }); s.lista = r.id; return r; });
  await krok('lista: usuń', () => v.deletePatientList(s.lista));
  // Plan opieki w trybie „Komputer w pracy” sejf odrzuca z założenia (adapter tego trybu nie zapisuje planów).
  await krok('plan opieki', () => v.mutateCarePlan({ patientId: s.P1, operationId: 'fikcyjna-operacja-planu-1', action: 'create', title: 'Fikcyjny plan opieki' }), { odmowa: 'chmura' });
  await krok('druga karta', async () => { const r = await v.savePatient(naglowek(2), { dedup: false }); s.P2 = r.patientId; return r; });
  await krok('scal pacjentów', () => v.mergePatients(s.P2, s.P1));
  await krok('trzecia karta', async () => { const r = await v.savePatient(naglowek(3), { dedup: false }); s.P3 = r.patientId; return r; });
  await krok('usuń pacjenta', () => v.removePatient(s.P3));
  await krok('zmiana hasła', async () => { const r = await v.changePassword(haslo, HASLO_2); haslo = HASLO_2; return r; });
  await krok('eksport i scalenie własnego eksportu', async () => {
    const ladunek = await v.exportSyncPayload();
    const passkeys = [...(ladunek.passkeys || []), { credentialId: 'fikcyjny-klucz-1', deviceLabel: 'Fikcyjny telefon', createdAtISO: new Date(zegar).toISOString() }];
    return v.mergeSyncPayload({ ...ladunek, passkeys });
  });
  await krok('delta karty', async () => v.applyEncryptedDelta(await v.buildPatientDelta(s.P1)));
  await krok('koperta zdarzenia', async () => {
    const ev = v._eventLog;
    const koperta = await ev.buildSnapshotEvent(s.P1, (await wersje(s.P1))[0].snapshotId, null);
    return ev.applyEncryptedEvent((await ev.encryptEvent(koperta)).env);
  });
  await krok('import karty innego konta', () => v.importPatientFromEnvelope(inne.koperta, HASLO_OBCE));
  await krok('scalenie kopii innego konta', () => v.mergeVaultBackup(inne.kopia, HASLO_OBCE));
  await krok('import starego formatu', () => v.importLegacyJsonPatient(naglowek(4)));
  await krok('osoba spoza bazy', async () => {
    const r = await v.saveExternalPatient({ lastName: 'Testowy', firstName: 'Jan5', sex: 'M', birthYear: '2016', contact: 'Fikcyjny kontakt' });
    s.zew = r.patientId;
    return r;
  });
  await krok('scal osobę spoza bazy z kartą', () => v.mergeExternalIntoPatient(s.zew, s.P1));
  await krok('przywróć wersję jako nową', async () => { const w = await wersje(s.P1); return v.restoreSnapshotAsNew(s.P1, w[w.length - 1].snapshotId); });
  await krok('tryb przechowywania: zmiana', () => v.setStorageMode(s.uid, chmura ? v.STORAGE_MODE_LOCAL : v.STORAGE_MODE_CLOUD_ONLY));
  await krok('tryb przechowywania: powrót', () => v.setStorageMode(s.uid, chmura ? v.STORAGE_MODE_CLOUD_ONLY : v.STORAGE_MODE_LOCAL));
  await krok('nowa tożsamość synchronizacji', async () => {
    const material = await v.getSyncMaterial();
    o.win.VildaSync = { inspectTemplateLibraryAuthority: async () => ({ initialized: false, epoch: 0, eventsStored: 0, bytesStored: 0, slotId: material.slotId }) };
    try { return await v.rotateSyncIdentity(haslo); } finally { delete o.win.VildaSync; }
  });
  await krok('usunięcie klucza dostępu', () => v.removePasskey(s.uid, 'fikcyjny-klucz-1'));
  await krok('kopia konta', async () => { s.kopia = await v.exportVaultBackup(); return null; });
  await krok('blokada', () => { v.lock('manual'); });
  await krok('odtworzenie konta z kopii', async () => {
    zaloguj();
    const r = await v.restoreVaultBackup(s.kopia, haslo, { label: 'Fikcyjne konto z kopii' });
    konta.push(r.userId);
    s.uid2 = r.userId;
    return r;
  });
  await krok('blokada konta z kopii', () => { v.lock('manual'); });
  await krok('odblokowanie', async () => { zaloguj(); return v.unlockUser(s.uid, haslo); });
  await krok('usunięcie konta z kopii', () => v.removeUser(s.uid2, haslo));
  await krok('usunięcie konta', () => v.removeUser(s.uid, haslo));

  slad.bazy = (await idb.databases()).map((d) => maska(d.name)).sort();
  slad.kluczUrzadzenia = o.win.localStorage.klucze().some((k) => k.startsWith('vilda-sync-device-v1'));
  slad.odczytyBramki = odczytyBramki;
  o.timery.wyczysc();
  return slad;
}

// Przebieg w zwykłych warunkach — raz na wariant (dzielony przez przypadki niżej).
const zwykle = {};
const zwykly = (w) => { if (!zwykle[w]) zwykle[w] = przebieg(w); return zwykle[w]; };
const bezOdczytow = ({ odczytyBramki, ...reszta }) => reszta;
const fikstura = () => {
  if (!existsSync(PLIK_FIKSTURY)) throw new Error('brak fikstury: nagraj ją na kopii bazy (E2_ZAPIS_BAZOWY=nagraj, nagłówek pliku)');
  return JSON.parse(readFileSync(PLIK_FIKSTURY, 'utf8'));
};
function porownaj(slad, oczekiwany, opis) {
  const kroki = (x) => x.kroki.map((k) => k.krok);
  expect(kroki(slad), `${opis}: kroki scenariusza`).toEqual(kroki(oczekiwany));
  const rozne = slad.kroki.filter((k, i) => JSON.stringify(k) !== JSON.stringify(oczekiwany.kroki[i])).map((k) => k.krok);
  expect(rozne, `${opis}: kroki ze śladem innym niż w fiksturze`).toEqual([]);
  expect(bezOdczytow(slad), opis).toEqual(bezOdczytow(oczekiwany));
}

describe.skipIf(NAGRANIE)('zapis bazowy „bramka wyłączona” (U3)', () => {
  it('fikstura: cztery warianty, sha256 sejfu bazy', () => {
    const f = fikstura();
    expect(Object.keys(f.warianty)).toEqual(WARIANTY);
    expect(f.bazaVault).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof f.opis).toBe('string');
  });

  it.each(WARIANTY)('wariant %s: ślady scenariusza równe fiksturze', async (w) => {
    porownaj(await zwykly(w), fikstura().warianty[w], w);
  }, 120_000);

  it('odczyty pola okna VILDA_EVENT_LOG = 0 we wszystkich wariantach (także przy ładowaniu skryptów)', async () => {
    const odczyty = {};
    for (const w of WARIANTY) odczyty[w] = (await zwykly(w)).odczytyBramki;
    expect(odczyty).toEqual({ Ze: 0, prywatny: 0, chmura: 0, jednorazowo: 0 });
    const f = fikstura();
    expect(Object.fromEntries(WARIANTY.map((w) => [w, f.warianty[w].odczytyBramki]))).toEqual(odczyty);
  }, 240_000);

  it('po scenariuszu nie ma bazy vilda_sync_* ani klucza o przedrostku vilda-sync-device-v1 (4 warianty)', async () => {
    for (const w of WARIANTY) {
      const slad = await zwykly(w);
      expect(slad.bazy.filter((n) => n.startsWith('vilda_sync_')), w).toEqual([]);
      expect(slad.kluczUrzadzenia, w).toBe(false);
      for (const k of slad.kroki) expect(k.indexedDB.filter((x) => /vilda_sync_/.test(x)), `${w}: ${k.krok}`).toEqual([]);
    }
  }, 240_000);

  it.each(WARIANTY)('determinizm %s: z przerwą 3,5 s po zalogowaniu i z obciążeniem w tle — ślady równe fiksturze', async (w) => {
    const oczekiwany = fikstura().warianty[w];
    const zPrzerwa = await przebieg(w, { przerwa: PRZERWA_MS });
    porownaj(zPrzerwa, oczekiwany, `${w}, przerwa`);
    expect(zPrzerwa.odczytyBramki).toBe(oczekiwany.odczytyBramki);
    const podObciazeniem = await zObciazeniem(() => przebieg(w));
    porownaj(podObciazeniem, oczekiwany, `${w}, obciążenie`);
    expect(podObciazeniem.odczytyBramki).toBe(oczekiwany.odczytyBramki);
  }, 180_000);
});

describe.runIf(NAGRANIE)('nagranie zapisu bazowego (bramka zamknięta)', () => {
  it('nagrywa fiksturę: każdy wariant trzy razy (zwykły, z przerwą, z obciążeniem), wszystkie równe, bez odczytu bramki, bazy kolejki i klucza urządzenia', async () => {
    const warianty = {};
    for (const w of WARIANTY) {
      const a = await przebieg(w);
      const b = await przebieg(w, { przerwa: PRZERWA_MS });
      const c = await zObciazeniem(() => przebieg(w));
      expect(b, `${w}: przebieg z przerwą`).toEqual(a);
      expect(c, `${w}: przebieg z obciążeniem`).toEqual(a);
      expect(a.odczytyBramki, `${w}: odczyty pola okna VILDA_EVENT_LOG`).toBe(0);
      expect(a.bazy.filter((n) => n.startsWith('vilda_sync_')), `${w}: bazy kolejki po scenariuszu`).toEqual([]);
      expect(a.kluczUrzadzenia, `${w}: klucz urządzenia po scenariuszu`).toBe(false);
      for (const k of a.kroki) expect(k.indexedDB.filter((x) => /vilda_sync_/.test(x)), `${w}: ${k.krok}`).toEqual([]);
      warianty[w] = a;
    }
    const f = {
      opis: 'Zapis bazowy „bramka wyłączona” (P-DZIENNIK-ZDARZEN): ślady scenariusza sejfu w czterech wariantach okna, '
        + 'nagrane przy zamkniętej bramce; test i opis śladów: tests/unit/sync-dziennik-zapis-bazowy.test.mjs.',
      bazaVault: createHash('sha256').update(readFileSync(path.join(repo, 'vilda_vault.js'))).digest('hex'),
      warianty,
    };
    writeFileSync(PLIK_FIKSTURY, JSON.stringify(f, null, 1) + '\n');
  }, 600_000);
});
