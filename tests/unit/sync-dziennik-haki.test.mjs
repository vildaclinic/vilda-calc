// P-DZIENNIK-ZDARZEN (E2-PR3a2) — kontrakt ładunków hooków sejfu: emisja zmian do kolejki (wstawki Bem_ w emiterach
// hooków i miejscach zapisu, kroki operacji złożonych) nie zmienia ładunków hooków, kolejności wywołań słuchaczy ani
// pełnej wysyłki (syncPush). Porównanie z sejfem bez wstawek (tests/support/sejf-bez-wstawek.mjs: każde wywołanie Bem_*
// i Bob_* poza blokiem zastąpione `void 0`, Bob_oznacz(…) — `false`), ładowanym tak jak tests/support/load-browser-script.mjs.
// Okno jak w zapisie bazowym (tests/unit/sync-dziennik-zapis-bazowy.test.mjs, wariant „Komputer prywatny”: adapter
// IndexedDB sejfu nad atrapą, moduły punktu odzyskiwania), sztuczny zegar (tylko Date, krok 1 s), zadanie w tle sejfu po
// zalogowaniu odpalane jawnie, atrapa VildaSync (syncPush liczony; inspectTemplateLibraryAuthority na kroku nowej
// tożsamości synchronizacji), atrapa WebAuthn (VildaCrypto), hak VildaPersistence (pole okna przed załadowaniem skryptów).
// Dane WYŁĄCZNIE FIKCYJNE („Testowy Jan…”, „Fikcyjna notatka…”), bez PESEL.
//
// SCENARIUSZ: 44 kroki zapisu bazowego, a przed kopią konta: rejestracja klucza dostępu (zwykła i „roaming”), usunięcie
// klucza „roaming”, preferencja przez hak VildaPersistence, drugi plan opieki i przypomnienie z wynikiem
// (saveReminderOutcome). Każdy z 8 hooków (onPatientSaved, onPatientDeleted, onPatientNoteChanged, onNoteChanged,
// onPatientListChanged, onPasskeyChanged, onCredentialChanged, onPreferenceChanged) ma dwóch słuchaczy; zapis: (hook,
// słuchacz, JSON ładunku z maską identyfikatorów — UUID, 32 znaki szesnastkowe i shortHash w kolejności pojawienia się).
// Cztery przebiegi: sejf i sejf bez wstawek, przy zamkniętej bramce (bez pola VILDA_EVENT_LOG) i przy otwartej (pole
// true, po każdym kroku emissionsSettled, gdy jest).
//
// PRZYPADKI
//   KH1  sekwencja (hook, ładunek) pierwszego słuchacza: sejf = sejf bez wstawek, przy zamkniętej i przy otwartej bramce.
//   KH2  onPatientSaved przy usunięciu wersji (isSnapshotDelete) ma snapshotId: null — na obu sejfach.
//   KH3  onPatientListChanged przy usunięciu listy: { id, action: 'delete' } bez deletedAtISO — na obu sejfach.
//   KH4  kolejność wywołań słuchaczy (hook, słuchacz) względem siebie: sejf = sejf bez wstawek.
//   KH5  liczba wywołań syncPush atrapy VildaSync: sejf = sejf bez wstawek (na każdym kroku).
//   KH6  samokontrola: sejf ma część emisji (znacznik i wstawki), sejf bez wstawek nie ma Bem_ ani Bob_ poza blokiem,
//        parsuje się i w obu przebiegach daje 0 odczytów pola bramki (sejf przy otwartej bramce — więcej niż 0).
//
// Czerwone na bazie (sejf bez części emisji): KH6 (znacznik i wstawki emisji). Zielone z natury (strażniki regresji):
// KH1–KH5 — na sejfie bazy sejf i sejf bez wstawek nie różnią się co do hooków.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';
import { atrapaKrypto, naglowek, okno } from './sesja-zapisu-uprzaz.mjs';
import { ZNACZNIK_EMISJI, ZRODLO_SEJFU, bezWstawek, granicaBloku, wywolaniaPozaBlokiem, zaladujZrodlo } from '../support/sejf-bez-wstawek.mjs';

const START = Date.parse('2026-03-02T08:00:00.000Z');
const START_OBCEGO = Date.parse('2026-03-01T08:00:00.000Z');
const KROK_MS = 1000;
const SKRYPTY = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_care_plan_model.js', 'vilda_clinical_crypto.js',
  'vilda_patient_checkpoint_store.js', 'vilda_patient_checkpoint.js', 'vilda_vault.js'];
const HOOKI = ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged', 'onPatientListChanged',
  'onPasskeyChanged', 'onCredentialChanged', 'onPreferenceChanged'];
const HASLO_1 = 'Fikcyjne#ZapisBazowy!2026aa';
const HASLO_2 = 'Fikcyjne#ZapisBazowy!2026bb';
const HASLO_OBCE = 'Fikcyjne#InneKonto!2026cc';
const ZADANIE_W_TLE = 'CareMvpBackgroundFormatError';
const oryginalnySetTimeout = globalThis.setTimeout;
const ZRODLO_BEZ_WSTAWEK = bezWstawek(ZRODLO_SEJFU);

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const czekaj = (ms) => new Promise((r) => { oryginalnySetTimeout(r, ms); });
const makrozadanie = () => new Promise((r) => { setImmediate(r); });
const wynik = (p) => Promise.resolve(p).then((w) => w, (e) => ({ odrzucona: (e && e.code) || 'bez kodu' }));

// Konto „z innego urządzenia” (jak w zapisie bazowym): koperta karty i kopia konta do importu (raz na proces).
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
        const w = { koperta: await v.exportPatientEnvelope(k7), kopia: await v.exportVaultBackup() };
        v.lock('manual');
        o.timery.wyczysc();
        return w;
      } finally { vi.useRealTimers(); }
    })();
  }
  return obce;
}

// Maska identyfikatorów ładunku: UUID, 32 znaki szesnastkowe (konta) i wartość shortHash → <idN> w kolejności pojawienia.
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g;
function maskarka() {
  const znane = new Map();
  const id = (s) => { if (!znane.has(s)) znane.set(s, `<id${znane.size + 1}>`); return znane.get(s); };
  return (ladunek) => JSON.stringify(ladunek === undefined ? null : ladunek, (k, w) => {
    if (typeof w !== 'string') return w;
    if (k === 'shortHash') return id(`#${w}`);
    return w.replace(ID, id);
  });
}

// Przebieg scenariusza; zrodlo — tekst sejfu; bramka — true (pole okna true, emissionsSettled po kroku) albo false.
async function przebieg({ zrodlo, bramka }) {
  const inne = await obceKonto();
  vi.useFakeTimers({ toFake: ['Date'] });
  let zegar = START;
  vi.setSystemTime(zegar);
  const przechwycone = [];
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(function (fn, ms, ...a) {
    if (typeof fn === 'function' && String(fn).includes(ZADANIE_W_TLE)) { przechwycone.push(fn); return 0; }
    return oryginalnySetTimeout(fn, ms, ...a);
  });
  vi.stubGlobal('fetch', async () => { throw new Error('Fikcyjny brak sieci'); });
  const idb = utworzIndexedDB();
  vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
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
  const sync = { push: 0, kroki: [] };
  const persistencja = { zapisz: null };
  const dodatki = {
    indexedDB: idb,
    VildaPersistence: { onPreferenceWrite(cb) { persistencja.zapisz = cb; } },
    VildaSync: {
      syncPush() { sync.push += 1; },
      async inspectTemplateLibraryAuthority() {
        const material = await o.win.VildaVault.getSyncMaterial();
        return { initialized: false, epoch: 0, eventsStored: 0, bytesStored: 0, slotId: material.slotId };
      },
    },
  };
  const o = okno({ skrypty: [], krypto: { ...krypto, crypto: { ...krypto.crypto, subtle } }, dodatki });
  let odczytyBramki = 0;
  Object.defineProperty(o.win, 'VILDA_EVENT_LOG', { get() { odczytyBramki += 1; return bramka ? true : undefined; }, configurable: true });
  for (const plik of SKRYPTY) {
    if (plik === 'vilda_vault.js') zaladujZrodlo(o.win, zrodlo);
    else loadBrowserScript(plik, o.win);
  }
  const v = o.win.VildaVault;
  const c = o.win.VildaCrypto;
  let nrKlucza = 0;
  const sekret = () => new Uint8Array(32).fill(7);
  c.createPasskeyAndGetPrfSecret = async () => { nrKlucza += 1; return { credentialId: `fikcyjny-klucz-dostepu-${nrKlucza}`, prfSecretBytes: sekret() }; };
  c.createRoamingPasskeyAndGetPrfSecret = async () => { nrKlucza += 1; return { credentialId: `fikcyjny-klucz-dostepu-${nrKlucza}`, publicKeyRawB64u: 'Rmlrc3lqbnlLbHVjeg', prfInputB64u: 'Rmlrc3lqbnlQcmY' }; };
  c.getPasskeyPrfSecret = async (id) => ({ credentialId: id, prfSecretBytes: sekret() });
  const maska = maskarka();
  const wywolania = [];
  for (const h of HOOKI) {
    v[h]((d) => { wywolania.push({ hook: h, sluchacz: 1, ladunek: maska(d) }); });
    v[h]((d) => { wywolania.push({ hook: h, sluchacz: 2, ladunek: maska(d) }); });
  }
  async function cisza() {
    const koniec = performance.now() + 60_000;
    let stabilne = 0;
    let poprzedni = null;
    while (performance.now() < koniec) {
      o.timery.odpal((t) => t.ms === 0);
      if (kryptoWToku) await czekaj(1); else await makrozadanie();
      const stan = [idb.__atrapa.log.length, idb.__atrapa.wToku(), kryptoWToku, krypto.log.length, o.dziennik.length, wywolania.length].join();
      if (stan === poprzedni && !idb.__atrapa.wToku() && !kryptoWToku) {
        stabilne += 1;
        if (stabilne >= 20) return;
      } else stabilne = 0;
      poprzedni = stan;
    }
    throw new Error('sejf nie ucichł po kroku: transakcje atrapy albo crypto.subtle w toku');
  }
  const kroki = [];
  async function krok(nazwa, fn) {
    zegar += KROK_MS;
    vi.setSystemTime(zegar);
    const z = { wyw: wywolania.length, push: sync.push };
    await fn();
    await cisza();
    if (bramka && v._eventLog && typeof v._eventLog.emissionsSettled === 'function') {
      await v._eventLog.emissionsSettled();
      await cisza();
    }
    const tlo = przechwycone.splice(0);
    for (const f of tlo) f();
    if (tlo.length) await cisza();
    kroki.push({ krok: nazwa, wywolania: wywolania.slice(z.wyw), syncPush: sync.push - z.push });
  }
  const s = {};
  let haslo = HASLO_1;
  const wersje = async (pid) => (await v.getPatient(pid)).snapshots;

  await krok('konto', async () => { s.uid = (await v.createUser(HASLO_1, { label: 'Fikcyjna Lekarka Zapis', iterations: 1000 })).userId; });
  await krok('nowa karta', async () => { s.P1 = (await v.savePatient(naglowek(1), { dedup: false })).patientId; });
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
  await krok('notatka pacjenta: dodaj', async () => { s.N = (await v.savePatientNote({ patientId: s.P1, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' })).id; });
  await krok('notatka pacjenta: popraw', () => v.savePatientNote({ id: s.N, patientId: s.P1, title: 'Fikcyjna notatka (poprawiona)', body: 'Fikcyjna treść 2.', category: 'inne' }));
  await krok('notatka pacjenta: usuń', () => v.removePatientNote(s.N));
  await krok('notatka biblioteki: dodaj', async () => { s.L = (await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' })).id; });
  await krok('notatka biblioteki: usuń', () => v.removeNote(s.L));
  await krok('lista: dodaj', async () => { s.lista = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P1] })).id; });
  await krok('lista: usuń', () => v.deletePatientList(s.lista));
  await krok('plan opieki', () => v.mutateCarePlan({ patientId: s.P1, operationId: 'fikcyjna-operacja-planu-1', action: 'create', title: 'Fikcyjny plan opieki' }));
  await krok('druga karta', async () => { s.P2 = (await v.savePatient(naglowek(2), { dedup: false })).patientId; });
  await krok('scal pacjentów', () => v.mergePatients(s.P2, s.P1));
  await krok('trzecia karta', async () => { s.P3 = (await v.savePatient(naglowek(3), { dedup: false })).patientId; });
  await krok('usuń pacjenta', () => v.removePatient(s.P3));
  await krok('zmiana hasła', async () => { await v.changePassword(haslo, HASLO_2); haslo = HASLO_2; });
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
    s.zew = (await v.saveExternalPatient({ lastName: 'Testowy', firstName: 'Jan5', sex: 'M', birthYear: '2016', contact: 'Fikcyjny kontakt' })).patientId;
  });
  await krok('scal osobę spoza bazy z kartą', () => v.mergeExternalIntoPatient(s.zew, s.P1));
  await krok('przywróć wersję jako nową', async () => { const w = await wersje(s.P1); return v.restoreSnapshotAsNew(s.P1, w[w.length - 1].snapshotId); });
  await krok('tryb przechowywania: zmiana', () => v.setStorageMode(s.uid, v.STORAGE_MODE_CLOUD_ONLY));
  await krok('tryb przechowywania: powrót', () => v.setStorageMode(s.uid, v.STORAGE_MODE_LOCAL));
  await krok('nowa tożsamość synchronizacji', () => v.rotateSyncIdentity(haslo));
  await krok('usunięcie klucza dostępu', () => v.removePasskey(s.uid, 'fikcyjny-klucz-1'));
  await krok('rejestracja klucza dostępu', () => v.registerPasskey('Fikcyjny telefon 2'));
  // Klucz „roaming”: po zapisie sejf wysyła kopię do serwera synchronizacji (fetch atrapy rzuca) — wynik bez znaczenia.
  await krok('rejestracja klucza dostępu „roaming”', () => wynik(v.registerPasskeyForRoaming('Fikcyjny klucz')));
  await krok('usunięcie klucza „roaming”', () => v.removePasskey(s.uid, 'fikcyjny-klucz-dostepu-2'));
  await krok('preferencja przez VildaPersistence', () => persistencja.zapisz({ key: 'fikcyjna-preferencja', value: 'ciemny' }));
  await krok('drugi plan opieki', () => v.mutateCarePlan({ patientId: s.P1, operationId: 'fikcyjna-operacja-planu-2', action: 'create', title: 'Fikcyjny plan opieki 2' }));
  await krok('przypomnienie: dodaj', async () => {
    s.przyp = (await v.savePatientNote({ patientId: s.P1, title: 'Fikcyjne przypomnienie', body: 'Fikcyjne ustalenia.', category: 'followup', dueDateISO: '2026-03-20' })).id;
  });
  await krok('przypomnienie: wynik', async () => {
    const n = await v.getPatientNote(s.przyp);
    return v.saveReminderOutcome({ id: s.przyp, patientId: s.P1, baseRev: n.rev, operationId: 'fikcyjna-operacja-wyniku-1', action: 'complete', dateISO: '2026-03-21', text: 'Fikcyjny opis wykonania.', next: { title: 'Fikcyjny kolejny krok', dateISO: '2026-04-01' } });
  });
  await krok('kopia konta', async () => { s.kopia = await v.exportVaultBackup(); });
  await krok('blokada', () => { v.lock('manual'); });
  await krok('odtworzenie konta z kopii', async () => { s.uid2 = (await v.restoreVaultBackup(s.kopia, haslo, { label: 'Fikcyjne konto z kopii' })).userId; });
  await krok('blokada konta z kopii', () => { v.lock('manual'); });
  await krok('odblokowanie', () => v.unlockUser(s.uid, haslo));
  await krok('usunięcie konta z kopii', () => v.removeUser(s.uid2, haslo));
  await krok('usunięcie konta', () => v.removeUser(s.uid, haslo));
  o.timery.wyczysc();
  vi.useRealTimers();
  vi.restoreAllMocks();
  return { kroki, wywolania, odczytyBramki, syncPush: sync.push };
}

const przebiegi = {};
const pobierz = (nazwa, opcje) => { if (!przebiegi[nazwa]) przebiegi[nazwa] = przebieg(opcje); return przebiegi[nazwa]; };
const PARY = [
  ['zamknięta', () => pobierz('sejf, zamknięta', { zrodlo: ZRODLO_SEJFU, bramka: false }), () => pobierz('bez wstawek, zamknięta', { zrodlo: ZRODLO_BEZ_WSTAWEK, bramka: false })],
  ['otwarta', () => pobierz('sejf, otwarta', { zrodlo: ZRODLO_SEJFU, bramka: true }), () => pobierz('bez wstawek, otwarta', { zrodlo: ZRODLO_BEZ_WSTAWEK, bramka: true })],
];
// Pierwszy słuchacz, na krok: kolejność hooków i ładunki. Ładunki w obrębie kroku jako zbiór z krotnością: kolejność
// scalania notatek (np. z kopii konta) idzie za porządkiem ich identyfikatorów, a te są losowe w każdym przebiegu.
const pierwszy = (p) => p.kroki.map((k) => {
  const w = k.wywolania.filter((x) => x.sluchacz === 1);
  return { krok: k.krok, hooki: w.map((x) => x.hook), ladunki: w.map((x) => `${x.hook} ${x.ladunek}`).sort() };
});

describe('kontrakt ładunków hooków: sejf = sejf bez wstawek', () => {
  it.each(PARY)('KH1: bramka %s — sekwencja (hook, ładunek z maską identyfikatorów) 8 hooków równa', async (_, sejf, bez) => {
    const a = await sejf();
    const b = await bez();
    expect(a.kroki.map((k) => k.krok), '44 kroki zapisu bazowego i 7 dodatkowych').toHaveLength(51);
    expect(HOOKI.filter((h) => !a.wywolania.some((w) => w.hook === h)), 'każdy hook wywołany w scenariuszu').toEqual([]);
    const rozne = pierwszy(a).filter((k, i) => JSON.stringify(k) !== JSON.stringify(pierwszy(b)[i])).map((k) => k.krok);
    expect(rozne, 'kroki z inną sekwencją hooków').toEqual([]);
    expect(pierwszy(a)).toEqual(pierwszy(b));
  }, 240_000);

  it.each(PARY)('KH2: bramka %s — onPatientSaved przy usunięciu wersji (isSnapshotDelete) ma snapshotId: null', async (_, sejf, bez) => {
    for (const p of [await sejf(), await bez()]) {
      const k = p.kroki.find((x) => x.krok === 'usunięcie wersji');
      const zapisane = k.wywolania.filter((w) => w.sluchacz === 1 && w.hook === 'onPatientSaved').map((w) => JSON.parse(w.ladunek));
      expect(zapisane).toHaveLength(1);
      expect(zapisane[0]).toMatchObject({ snapshotId: null, isSnapshotDelete: true });
    }
  }, 240_000);

  it.each(PARY)('KH3: bramka %s — onPatientListChanged przy usunięciu listy bez deletedAtISO', async (_, sejf, bez) => {
    for (const p of [await sejf(), await bez()]) {
      const k = p.kroki.find((x) => x.krok === 'lista: usuń');
      const ladunki = k.wywolania.filter((w) => w.sluchacz === 1 && w.hook === 'onPatientListChanged').map((w) => JSON.parse(w.ladunek));
      expect(ladunki).toHaveLength(1);
      expect(Object.keys(ladunki[0]).sort()).toEqual(['action', 'id']);
      expect(ladunki[0].action).toBe('delete');
    }
  }, 240_000);

  it.each(PARY)('KH4: bramka %s — kolejność wywołań słuchaczy (hook, słuchacz) względem siebie równa', async (_, sejf, bez) => {
    const kolejnosc = (p) => p.wywolania.map((w) => `${w.hook}/${w.sluchacz}`);
    const a = await sejf();
    expect(kolejnosc(a)).toEqual(kolejnosc(await bez()));
    // Drugi słuchacz zaraz po pierwszym, z tym samym ładunkiem.
    for (let i = 0; i < a.wywolania.length; i += 2) {
      expect([a.wywolania[i].sluchacz, a.wywolania[i + 1].sluchacz, a.wywolania[i + 1].hook]).toEqual([1, 2, a.wywolania[i].hook]);
      expect(a.wywolania[i + 1].ladunek).toBe(a.wywolania[i].ladunek);
    }
  }, 240_000);

  it.each(PARY)('KH5: bramka %s — liczba wywołań syncPush atrapy VildaSync równa (na każdym kroku)', async (_, sejf, bez) => {
    const a = await sejf();
    const b = await bez();
    expect(a.syncPush, 'syncPush w scenariuszu').toBeGreaterThan(0);
    expect(a.kroki.map((k) => `${k.krok}: ${k.syncPush}`)).toEqual(b.kroki.map((k) => `${k.krok}: ${k.syncPush}`));
  }, 240_000);

  it('KH6: samokontrola — sejf ma część emisji, sejf bez wstawek nie ma Bem_/Bob_ poza blokiem, parsuje się i daje 0 odczytów bramki', async () => {
    expect(ZRODLO_SEJFU.split(ZNACZNIK_EMISJI).length - 1, 'znacznik części emisji').toBe(1);
    const { a, z } = granicaBloku(ZRODLO_SEJFU);
    const i = ZRODLO_SEJFU.indexOf(ZNACZNIK_EMISJI);
    expect(i > a && i < z, 'znacznik emisji w bloku').toBe(true);
    const wstawki = wywolaniaPozaBlokiem(ZRODLO_SEJFU);
    const ile = (n) => wstawki.filter((w) => w.nazwa === n).length;
    expect([ile('Bem_hak'), ile('Bem_zmiana'), ile('Bem_krokStart'), ile('Bem_krokKoniec')], 'wstawki emisji w sejfie').toEqual([7, 8, 6, 6]);
    const bez = bezWstawek(ZRODLO_SEJFU);
    expect(wywolaniaPozaBlokiem(bez)).toEqual([]);
    const { a: a2, z: z2 } = granicaBloku(bez);
    const poza = bez.slice(0, a2) + bez.slice(z2);
    expect(poza.match(/(?<![A-Za-z0-9_$])B(?:em|ob)_[A-Za-z0-9_$]*/g), 'Bem_ i Bob_ poza blokiem').toBeNull();
    expect(poza.match(/(?<![A-Za-z0-9_$])Bev_[A-Za-z0-9_$]*/g)).toEqual(['Bev_EKSPORT']);
    expect(poza).toContain('_eventLog:Bev_EKSPORT');
    expect(bez.slice(a2, z2), 'blok bez zmian').toBe(ZRODLO_SEJFU.slice(a, z));
    for (const [nazwa, sejf, bezW] of PARY) {
      expect((await bezW()).odczytyBramki, `sejf bez wstawek, bramka ${nazwa}`).toBe(0);
      if (nazwa === 'otwarta') expect((await sejf()).odczytyBramki, 'sejf, bramka otwarta').toBeGreaterThan(0);
    }
  }, 240_000);
});
