// P-DZIENNIK-ZDARZEN (E2-PR3a2) — mechanizm emisji zmian do kolejki: emitery hooków i miejsca zapisu sejfu wołają
// emisję (część Bem_ bloku), emisja kończy się na bramce albo dopisuje zmianę w tle łańcuchem dopisań konta.
// Prawdziwy sejf w oknie uprzęży tests/support/okno-magazynu.mjs (emisja: true, moduły punktu odzyskiwania) na adapterze
// IndexedDB sejfu nad atrapą tests/support/atrapa-indexeddb.mjs (tryb „Komputer prywatny”, jeśli przypadek nie mówi
// inaczej), atrapa Web Locks okna (o.locks: test trzyma blokadę vilda-sync-db:<userId>, żeby łańcuch stał), sztuczny zegar
// (tylko Date, krok 1 s). Sejf ładowany z kopii źródła z licznikiem emisji (tests/support/sejf-bez-wstawek.mjs: wywołanie
// funkcji testu jako pierwsza instrukcja Bem_zmiana — licznik nie zależy od nagrania zapisu bazowego, w repozytorium go
// nie ma). Pole okna VILDA_EVENT_LOG z getterem liczącym odczyty; bramka otwarta tylko tam, gdzie przypadek to mówi.
// Dane WYŁĄCZNIE FIKCYJNE („Testowy Jan…”, „Fikcyjna notatka…”), bez PESEL.
//
// PRZYPADKI
//   EM1  bramka zamknięta: każda metoda danych z listy METODY_DANYCH uprzęży — odczyty pola bramki = liczba emisji (> 0),
//        w trakcie emisji 0 odczytów indexedDB, localStorage i crypto (opakowane funkcje Bem_ w kopii sejfu), 0 żądań
//        blokad vilda-sync*, 0 wpisów vilda_sync_* w dzienniku atrapy.
//   EM2  hak bez znaczenia (usunięcie wersji z isSnapshotDelete, scalanie notatek pacjenta i list z akcją merge, zmiana
//        hasła z innego urządzenia) nie czyta bramki; zapis lokalny tego samego rodzaju czyta ją raz.
//   EM3  „Komputer w pracy”, „Zaloguj jednorazowo” i sejf w pamięci przy otwartej bramce: bez bazy kolejki, klucza
//        urządzenia i blokad; odczyty bramki = liczba emisji.
//   EM4  zablokowany sejf (usunięcie klucza dostępu po blokadzie): bez wiersza i bez otwarcia bazy kolejki.
//   EM5  emitery nie czekają: zapis karty kończy się, gdy blokada konta jest trzymana; wiersz snap po jej zwolnieniu.
//   EM6  limit 20 s czekania na blokadę konta: dopisanie kończy się bez wiersza, łańcuch idzie dalej.
//   EM7  łańcuch FIFO: pięć zmian różnych encji szybko po sobie daje seqLocal w kolejności emisji.
//   EM8  blokada sejfu między zapisem a dopisaniem (dwie zmiany w łańcuchu): bez wiersza, po ponownym zalogowaniu nic
//        nie dochodzi.
//   EM9  przełączenie na konto B w trakcie: bez wiersza u A, zmiana konta B dopisana od razu (łańcuch osobny dla konta).
//   EM10 „Scal pacjentów” przerwane zmianą sesji: emisja sprzed zmiany niesie starą sesję — bez wiersza.
//   EM11 krok „Scal pacjentów”: wersje, potem nagrobek karty, notatka i lista (kolejność rang).
//   EM12 krok „Usuń pacjenta”: nagrobek karty przed nagrobkami notatek.
//   EM13 krok zapisu notatki w stanie „czeka”: notatka przed jej nagrobkiem.
//   EM14 krok kosza z „Odepnij i usuń”, wersja zmieniona w trakcie (zmieniony): wiersz snap, bez stomb.
//   EM15 kroki zagnieżdżone w „Scal pacjentów”: łańcuch dostaje wpisy dopiero przy zamknięciu zewnętrznego kroku.
//   EM16 wyjątek w kroku (zapis notatki w migracji wpisów spoza bazy kończy się błędem): krok zamknięty, emisja sprzed
//        wyjątku dopisana, następna emisja nie czeka.
//   EM17 powtórzenie tej samej wersji w kroku: jeden wpis łańcucha.
//   EM18 emisja innej operacji w trakcie otwartego kroku: dopisana po jego końcu, w kolejności rang i emisji.
//   EM19 Bob_dopiszZ: blokada konta przed odczytem rejestru — enqueue i dopisanie z łańcucha emisji.
//   EM20 enqueue bez zmian: odmowy, wynik i limit blokady (pełne przypadki: tests/unit/sync-dziennik-magazyn.test.mjs).
//   EM21 usuwanie konta w trakcie łańcucha: bez wiersza i bez bazy kolejki po końcu.
//   EM22 emissionsSettled: po ostatnim dopisaniu łańcucha; przy zamkniętej bramce od razu, bez odczytu pól okna; bramka
//        zamknięta w trakcie łańcucha — bez wiersza.
//   EM23 dwie karty przeglądarki: każda ma własny łańcuch, wiersze obu w jednej kolejce, w każdej karcie FIFO.
//   EM24 dwie poprawki szybko po sobie przed dopisaniem: jeden wiersz z treścią późniejszą (reguła ogona).
//
// Przypadki mechanizmu zaczynają od sprawdzenia, że sejf ma część emisji (Bem_zmiana w kopii z licznikiem); strażniki
// regresji (EM3, EM4, EM19 enqueue, EM20) — bez tego sprawdzenia.
// Czerwone na bazie (sejf bez części emisji): EM1, EM2, EM5–EM18, EM19 (łańcuch emisji), EM21–EM24. Zielone z natury
// (strażniki regresji): EM3, EM4 (bez emisji nic nie powstaje), EM19 (enqueue — blokada konta była już w enqueue), EM20.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  METODY_DANYCH, SKRYPTY_PUNKTU, drugieOkno, nazwaBazy, nazwaBlokady, oknoMagazynu, przechwycZadaniaWTle, zmienRekord,
} from '../support/okno-magazynu.mjs';
import { naglowek } from './sesja-zapisu-uprzaz.mjs';
import { licznikEmisji } from '../support/sejf-bez-wstawek.mjs';

const START = Date.parse('2026-03-02T08:00:00.000Z');
const NOWE_HASLO = 'Fikcyjne#NoweHaslo!2026xx';
const RESET_HASLA = 'Fikcyjne#ResetHasla!2026yy';
let zegar = START;
const tik = (ms = 1000) => { zegar += ms; vi.setSystemTime(zegar); };
const okna = [];
const makrozadanie = () => new Promise((r) => { setImmediate(r); });

beforeEach(() => {
  przechwycZadaniaWTle();
  vi.useFakeTimers({ toFake: ['Date'] });
  zegar = START;
  vi.setSystemTime(zegar);
  vi.stubGlobal('fetch', async () => { throw new Error('Fikcyjny brak sieci'); });
});
afterEach(async () => {
  for (const o of okna.splice(0)) {
    if (o.locks) await o.locks.zwolnijWszystkie();
    o.krypto.rozbroj();
    o.timery.wyczysc();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Okno z kopią sejfu z licznikiem emisji i polem bramki z getterem (odczyty liczone od chwili po utworzeniu kont).
// opcje: bramka (true — otwarta), opakuj i przy (licznik), wymagajEmisji (domyślnie true: sejf musi mieć Bem_zmiana —
// przypadek mechanizmu emisji kończy się od razu na sejfie bez części emisji; false — strażniki regresji EM3, EM4,
// EM19 enqueue i EM20), reszta do oknoMagazynu.
async function okno({ bramka = false, opakuj = false, przy = null, wymagajEmisji = true, ...reszta } = {}) {
  const l = licznikEmisji({ opakuj: opakuj && wymagajEmisji, przy });
  if (wymagajEmisji) expect(l.jest, 'część emisji sejfu (Bem_zmiana)').toBe(true);
  const o = await oknoMagazynu({ konta: 'A', skrypty: SKRYPTY_PUNKTU, ...reszta, emisja: true, bramka: false, zrodla: { 'vilda_vault.js': l.zaladuj } });
  okna.push(o);
  const stan = { otwarta: bramka, odczyty: 0 };
  Object.defineProperty(o.win, 'VILDA_EVENT_LOG', {
    get() { stan.odczyty += 1; return stan.otwarta; },
    set(x) { stan.otwarta = x; },
    configurable: true,
  });
  o.l = l;
  o.bramka = stan;
  o.uid = o.A.userId;
  o.blokadaKonta = nazwaBlokady(o.A.userId);
  // Żądania blokad kolejki tego okna (bez żądań testu).
  o.zadaniaKolejki = () => (o.locks ? o.locks.zadania.filter((z) => !z.test && z.nazwa.startsWith('vilda-sync')) : []);
  // Koniec łańcucha dopisań i cisza okna; sejf bez części emisji (bez emissionsSettled, np. sejf bazy) — sama cisza.
  // Istnienie emissionsSettled sprawdza EM22.
  o.gotowe = async () => {
    if (typeof o.ev.emissionsSettled === 'function') await o.ev.emissionsSettled();
    await o.cisza();
  };
  return o;
}
// Bliźniak: niezależna kopia baz atrapy z tym samym kontem (ten sam klucz główny), bramka zamknięta.
async function blizniak(o) {
  const B = await oknoMagazynu({ idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A', skrypty: SKRYPTY_PUNKTU });
  okna.push(B);
  return B;
}
const rodzaje = (wiersze) => wiersze.map((w) => w.kind);
const po = (o, od) => o.kolejka('A').filter((w) => w.seqLocal > od);
const ostatni = (o, kto = 'A') => o.kolejka(kto).reduce((m, w) => Math.max(m, w.seqLocal), 0);
async function czekajNa(warunek, opis) {
  for (let i = 0; i < 20000; i += 1) {
    if (warunek()) return;
    await makrozadanie();
  }
  throw new Error(`nie doczekano się: ${opis}`);
}
const wynik = (p) => Promise.resolve(p).then((w) => ({ ok: true, w }), (e) => ({ ok: false, kod: (e && e.code) || null, komunikat: String((e && e.message) || e) }));
// Karta z dwiema wersjami (starsza: s.S1, nowsza: s.S2).
async function karta(o, i = 1) {
  const r = await o.v.savePatient(naglowek(i), { dedup: false });
  tik();
  const r2 = await o.v.savePatient(naglowek(i, { masa: 23 }), { dedup: false, patientId: r.patientId });
  tik();
  return { P: r.patientId, S1: r.snapshotId, S2: r2.snapshotId };
}
// Atrapa WebAuthn (VildaCrypto okna): rejestracja zwykła i „roaming” bez urządzenia.
function atrapaKluczy(o) {
  const c = o.win.VildaCrypto;
  let n = 0;
  const sekret = () => new Uint8Array(32).fill(7);
  c.createPasskeyAndGetPrfSecret = async () => { n += 1; return { credentialId: `fikcyjny-klucz-${n}`, prfSecretBytes: sekret() }; };
  c.createRoamingPasskeyAndGetPrfSecret = async () => { n += 1; return { credentialId: `fikcyjny-klucz-${n}`, publicKeyRawB64u: 'Rmlrc3lqbnlLbHVjeg', prfInputB64u: 'Rmlrc3lqbnlQcmY' }; };
  c.getPasskeyPrfSecret = async (id) => ({ credentialId: id, prfSecretBytes: sekret() });
}

// ── EM1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Każda metoda danych z listy uprzęży (METODY_DANYCH) z fikcyjnymi argumentami; s — stan scenariusza.
function operacjeDanych(o) {
  const s = {};
  const v = o.v;
  const notatka = (tytul, pola = {}) => ({ patientId: s.P1, title: tytul, body: 'Fikcyjna treść.', category: 'inne', ...pola });
  const pomiary = [[96, 110], [108, 115], [120, 120]];
  return [
    ['savePatient', async () => { const r = await v.savePatient(naglowek(1, { pomiary }), { dedup: false }); s.P1 = r.patientId; s.S1 = r.snapshotId; }],
    ['updateSnapshotPayload', async () => {
      const r = await v.savePatient(naglowek(1, { masa: 23, pomiary }), { dedup: false, patientId: s.P1 });
      s.S2 = r.snapshotId;
      tik();
      const w = (await v.getPatient(s.P1)).snapshots.find((x) => x.snapshotId === s.S1);
      return v.updateSnapshotPayload(s.P1, s.S1, { ...w.payload, user: { ...w.payload.user, weight: 21 } }, { preserveSavedAt: true });
    }, { przygotowanie: 1 }],
    ['setSnapshotPinned', () => v.setSnapshotPinned(s.P1, s.S1, true)],
    ['updateMeasurementRow', () => v.updateMeasurementRow(s.P1, { key: '108|115.00|20.00' }, { height: 116 })],
    ['deleteMeasurementRow', () => v.deleteMeasurementRow(s.P1, { key: '96|110.00|20.00' })],
    ['moveSnapshotToTrash', () => v.moveSnapshotToTrash(s.P1, s.S1, { odepnij: true })],
    ['restoreTrashedSnapshot', () => v.restoreTrashedSnapshot(s.P1, s.S1)],
    ['restoreSnapshotAsNew', () => v.restoreSnapshotAsNew(s.P1, s.S1)],
    ['pruneSnapshotsForPatient', () => v.pruneSnapshotsForPatient(s.P1, { recentHours: 0 })],
    ['mergePatients', async () => {
      s.P2 = (await v.savePatient(naglowek(2), { dedup: false })).patientId;
      tik();
      return v.mergePatients(s.P2, s.P1);
    }, { przygotowanie: 1 }],
    ['saveExternalPatient', async () => { s.spoza1 = (await v.saveExternalPatient({ lastName: 'Testowy', firstName: 'Jan5', sex: 'M', birthYear: '2016', contact: 'Fikcyjny kontakt' })).patientId; }],
    ['mergeExternalIntoPatient', () => v.mergeExternalIntoPatient(s.spoza1, s.P1)],
    ['promoteExternalToBase', async () => {
      s.spoza2 = (await v.saveExternalPatient({ lastName: 'Testowy', firstName: 'Jan6', sex: 'M', birthYear: '2017' })).patientId;
      tik();
      return v.promoteExternalToBase(s.spoza2, { dobISO: '2017-03-12', sex: 'M', firstName: 'Jan6', lastName: 'Testowy' });
    }, { przygotowanie: 1 }],
    ['removePatient', async () => {
      s.P3 = (await v.savePatient(naglowek(3), { dedup: false })).patientId;
      tik();
      return v.removePatient(s.P3);
    }, { przygotowanie: 1 }],
    ['savePatientNote', async () => { s.notatka1 = (await v.savePatientNote(notatka('Fikcyjna notatka 1', { dueDateISO: '2026-03-20' }))).id; }],
    ['savePatientNoteOnce', () => v.savePatientNoteOnce({ id: 'fikcyjna-notatka-raz-1', ...notatka('Fikcyjny kontakt'), category: 'reminder-contact', dueDateISO: '2026-03-21', dueTime: '14:30', reminderContext: { version: 1, kind: 'reminder' } })],
    ['updateExistingPatientNote', async () => {
      const n = await v.getPatientNote(s.notatka1);
      return v.updateExistingPatientNote({ id: s.notatka1, patientId: s.P1, baseRev: n.rev, body: 'Fikcyjna poprawka.' });
    }],
    ['completePatientNote', () => v.completePatientNote(s.notatka1)],
    ['uncompletePatientNote', () => v.uncompletePatientNote(s.notatka1)],
    ['noShowPatientNote', () => v.noShowPatientNote(s.notatka1)],
    ['snoozePatientNote', () => v.snoozePatientNote(s.notatka1, '2027-02-02')],
    ['saveReminderOutcome', async () => {
      const n = await v.getPatientNote(s.notatka1);
      return v.saveReminderOutcome({ id: s.notatka1, patientId: s.P1, baseRev: n.rev, operationId: 'fikcyjna-operacja-wyniku-1', action: 'complete', dateISO: '2026-03-22', text: 'Fikcyjny opis wykonania.' });
    }],
    ['removeExistingPatientNote', async () => {
      const n = await v.getPatientNote(s.notatka1);
      return v.removeExistingPatientNote({ id: s.notatka1, patientId: s.P1, baseRev: n.rev });
    }],
    ['removePatientNote', async () => {
      s.notatka2 = (await v.savePatientNote(notatka('Fikcyjna notatka 2'))).id;
      tik();
      return v.removePatientNote(s.notatka2);
    }, { przygotowanie: 1 }],
    ['mutateCarePlan', () => v.mutateCarePlan({ patientId: s.P1, operationId: 'fikcyjna-operacja-planu-1', action: 'create', title: 'Fikcyjny plan opieki' })],
    ['saveNote', async () => { s.L1 = (await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' })).id; }],
    ['removeNote', () => v.removeNote(s.L1)],
    ['savePatientList', async () => { s.LI = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P1] })).id; }],
    ['addPatientToList', async () => {
      s.P4 = (await v.savePatient(naglowek(4), { dedup: false })).patientId;
      tik();
      return v.addPatientToList(s.LI, s.P4);
    }, { przygotowanie: 1 }],
    ['removePatientFromList', () => v.removePatientFromList(s.LI, s.P4)],
    ['deletePatientList', () => v.deletePatientList(s.LI)],
    ['addWaitlistList', () => v.addWaitlistList('Fikcyjny zabieg 1')],
    ['setWaitlistSchedule', () => v.setWaitlistSchedule('Fikcyjny zabieg 1', { dateISO: '2026-12-01', time: '09:00' })],
    ['removeWaitlistList', () => v.removeWaitlistList('Fikcyjny zabieg 1')],
    ['registerPasskey', () => v.registerPasskey('Fikcyjny telefon')],
    // Po zapisie klucza „roaming” sejf próbuje wysłać kopię do serwera synchronizacji (fetch atrapy rzuca) — emisja
    // jest wcześniej, wynik operacji nie ma tu znaczenia.
    ['registerPasskeyForRoaming', () => wynik(v.registerPasskeyForRoaming('Fikcyjny klucz'))],
    ['removePasskey', () => v.removePasskey(o.uid, 'fikcyjny-klucz-1')],
    ['changePassword', async () => { await v.changePassword(o.A.haslo, NOWE_HASLO); o.A.haslo = NOWE_HASLO; }],
    ['resetPasswordWhileUnlocked', async () => { await v.resetPasswordWhileUnlocked(RESET_HASLA); o.A.haslo = RESET_HASLA; }],
    ['migrateExternalNotesToRegistry', async () => {
      await v.savePatientNote({ patientId: '__vilda_external__', externalName: 'Testowy Jan9', title: 'Fikcyjny wpis spoza bazy', body: 'Fikcyjna treść.', category: 'inne' });
      tik();
      return v.migrateExternalNotesToRegistry();
    }, { przygotowanie: 1 }],
    ['importLegacyJsonPatient', () => v.importLegacyJsonPatient(naglowek(5))],
    // Import pliku karty i scalanie kopii konta emitują snap wersji, która leży w koszu i wraca z pliku (Bkz_poImporcie).
    ['importPatientFromEnvelope', async () => {
      const r = await v.savePatient(naglowek(6), { dedup: false });
      tik();
      await v.savePatient(naglowek(6, { masa: 23 }), { dedup: false, patientId: r.patientId });
      const plik = await v.exportPatientEnvelope(r.patientId);
      tik();
      await v.moveSnapshotToTrash(r.patientId, r.snapshotId);
      tik();
      return v.importPatientFromEnvelope(plik, o.A.haslo);
    }, { przygotowanie: 3 }],
    ['mergeVaultBackup', async () => {
      const r = await v.savePatient(naglowek(7), { dedup: false });
      tik();
      await v.savePatient(naglowek(7, { masa: 23 }), { dedup: false, patientId: r.patientId });
      const kopia = await v.exportVaultBackup();
      tik();
      await v.moveSnapshotToTrash(r.patientId, r.snapshotId);
      tik();
      return v.mergeVaultBackup(kopia, o.A.haslo);
    }, { przygotowanie: 3 }],
  ];
}

describe('EM1–EM4: bramka zamknięta i tryby bez kolejki', () => {
  it('EM1: bramka zamknięta — każda metoda danych: odczyty pola bramki = liczba emisji (> 0), w emisji bez indexedDB, localStorage i crypto, bez blokad i bazy kolejki', async () => {
    const o = await okno({ opakuj: true });
    atrapaKluczy(o);
    const pola = { indexedDB: 0, localStorage: 0, crypto: 0 };
    for (const pole of Object.keys(pola)) {
      const w = o.win[pole];
      Object.defineProperty(o.win, pole, { get() { if (o.l.wEmisji()) pola[pole] += 1; return w; }, configurable: true });
    }
    const operacje = operacjeDanych(o);
    expect(operacje.map(([n]) => n).sort(), 'lista operacji = METODY_DANYCH').toEqual([...METODY_DANYCH].sort());
    const wyniki = {};
    for (const [nazwa, fn, { przygotowanie = 0 } = {}] of operacje) {
      tik();
      const z = { odczyty: o.bramka.odczyty, emisje: o.l.emisje.length, log: o.znacznik() };
      await fn();
      await o.cisza();
      const emisje = o.l.emisje.length - z.emisje;
      wyniki[nazwa] = { odczyty: o.bramka.odczyty - z.odczyty, emisje, wiecejNizZero: emisje - przygotowanie > 0 };
    }
    const zle = Object.entries(wyniki).filter(([, w]) => w.odczyty !== w.emisje || !w.wiecejNizZero);
    expect(zle, JSON.stringify(wyniki)).toEqual([]);
    expect(pola, 'odczyty pól okna w trakcie emisji').toEqual({ indexedDB: 0, localStorage: 0, crypto: 0 });
    expect(o.zadaniaKolejki(), 'żądania blokad vilda-sync*').toEqual([]);
    expect(o.logKolejki(), 'wpisy vilda_sync_* w dzienniku atrapy').toEqual([]);
    expect(o.jestBaza('A')).toBe(false);
    expect(o.lokalny.m && Object.keys(o.lokalny.m).filter((k) => k.startsWith('vilda-sync-'))).toEqual([]);
    await o.ev.emissionsSettled();
  }, 120_000);

  it('EM2: hak bez znaczenia (usunięcie wersji, scalanie notatek pacjenta i list, zmiana hasła z innego urządzenia) nie czyta bramki; zapis lokalny czyta ją raz', async () => {
    const o = await okno();
    const akcje = [];
    for (const h of ['onPatientSaved', 'onPatientNoteChanged', 'onPatientListChanged', 'onCredentialChanged']) {
      o.v[h]((d) => { akcje.push(`${h}:${d && d.isSnapshotDelete ? 'isSnapshotDelete' : d && d.action}`); });
    }
    const k = await karta(o);
    const B = await blizniak(o);
    tik();
    await B.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka z innego urządzenia', body: 'Fikcyjna treść.', category: 'inne' });
    tik();
    await B.v.savePatientList({ name: 'Fikcyjna lista z innego urządzenia', memberIds: [k.P] });
    tik();
    await B.v.changePassword(o.A.haslo, NOWE_HASLO);
    tik();
    const ladunek = await B.v.exportSyncPayload();
    const pomiar = async (fn) => {
      tik();
      const z = { odczyty: o.bramka.odczyty, emisje: o.l.emisje.length, akcje: akcje.length };
      await fn();
      await o.cisza();
      return { odczyty: o.bramka.odczyty - z.odczyty, emisje: o.l.emisje.length - z.emisje, akcje: akcje.slice(z.akcje) };
    };
    const usuniecie = await pomiar(() => o.v.deleteSnapshot(k.P, k.S1));
    expect(usuniecie).toEqual({ odczyty: 0, emisje: 0, akcje: ['onPatientSaved:isSnapshotDelete'] });
    const scalenie = await pomiar(() => o.v.mergeSyncPayload(ladunek));
    expect(scalenie.akcje.filter((a) => /:(save|delete|password-changed|password-reset)$/.test(a)), 'akcje zapisu lokalnego w scaleniu').toEqual([]);
    for (const a of ['onPatientNoteChanged:merge', 'onPatientListChanged:merge', 'onCredentialChanged:password-changed-remotely']) {
      expect(scalenie.akcje, a).toContain(a);
    }
    expect([scalenie.odczyty, scalenie.emisje], 'odczyty bramki i emisje w scaleniu').toEqual([0, 0]);
    // Kontrola: zapis lokalny tych samych rodzajów — jeden odczyt bramki na emisję.
    const notatka = await pomiar(() => o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' }));
    const lista = await pomiar(() => o.v.savePatientList({ name: 'Fikcyjna lista', memberIds: [k.P] }));
    const wersja = await pomiar(() => o.v.savePatient(naglowek(1, { masa: 26 }), { dedup: false, patientId: k.P }));
    expect([notatka, lista, wersja].map((x) => [x.odczyty, x.emisje])).toEqual([[1, 1], [1, 1], [1, 1]]);
  }, 60_000);

  it('EM3: „Komputer w pracy”, „Zaloguj jednorazowo” i sejf w pamięci przy otwartej bramce — bez bazy kolejki, klucza urządzenia i blokad; odczyty bramki = liczba emisji', async () => {
    for (const [nazwa, opcje] of [['Komputer w pracy', { chmura: ['A'] }], ['Zaloguj jednorazowo', { jednorazowo: true }], ['sejf w pamięci', { wPamieci: true }]]) {
      const o = await okno({ bramka: true, wymagajEmisji: false, ...opcje });
      const z = o.znacznik();
      const k = await karta(o);
      await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
      await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
      await o.v.savePatientList({ name: 'Fikcyjna lista', memberIds: [k.P] });
      await o.gotowe();
      expect(o.bramka.odczyty, `${nazwa}: odczyty bramki = liczba emisji`).toBe(o.l.emisje.length);
      expect((await o.idb.databases()).map((d) => d.name).filter((n) => n.startsWith('vilda_sync_')), nazwa).toEqual([]);
      expect(o.logKolejki(z), `${nazwa}: wpisy vilda_sync_* w dzienniku atrapy`).toEqual([]);
      expect(Object.keys(o.lokalny.m).filter((n) => n.startsWith('vilda-sync-')), `${nazwa}: klucze vilda-sync-*`).toEqual([]);
      expect(o.zadaniaKolejki(), `${nazwa}: blokady vilda-sync*`).toEqual([]);
    }
  }, 60_000);

  it('EM4: zablokowany sejf — usunięcie klucza dostępu po blokadzie: bez wiersza i bez otwarcia bazy kolejki', async () => {
    const o = await okno({ bramka: true, wymagajEmisji: false });
    await o.gotowe();
    o.zablokuj();
    const z = o.znacznik();
    await wynik(o.v.removePasskey(o.uid, 'fikcyjny-klucz-9'));
    await o.gotowe();
    expect(o.bramka.odczyty, 'odczyty bramki = liczba emisji').toBe(o.l.emisje.length);
    expect(o.logKolejki(z)).toEqual([]);
    expect(o.jestBaza('A')).toBe(false);
    expect(o.zadaniaKolejki()).toEqual([]);
  }, 60_000);
});
describe('EM5–EM10: łańcuch dopisań konta, limit i sesja', () => {
  it('EM5: emitery nie czekają — zapis karty kończy się przy trzymanej blokadzie konta; wiersz snap po jej zwolnieniu', async () => {
    const o = await okno({ bramka: true });
    const h = await o.locks.trzymaj(o.blokadaKonta);
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    await o.spokoj();
    expect(o.kolejka('A'), 'zapis zakończony, wiersza jeszcze nie ma').toEqual([]);
    await h.zwolnij();
    await o.gotowe();
    expect(o.kolejka('A').map((w) => [w.kind, w.entityKey, w.state])).toEqual([['snap', `${r.patientId}/${r.snapshotId}`, 'pending']]);
  }, 60_000);

  it('EM6: limit 20 s czekania na blokadę konta — dopisanie kończy się bez wiersza, następna emisja po zwolnieniu daje wiersz', async () => {
    const o = await okno({ bramka: true });
    const h = await o.locks.trzymaj(o.blokadaKonta);
    await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    expect(o.timery.oczekujace().map((t) => t.ms), 'zegar limitu blokady').toContain(20000);
    expect(o.timery.odpal((t) => t.ms === 20000)).toBe(1);
    await o.ev.emissionsSettled();
    await o.spokoj();
    expect(o.zadaniaKolejki().map((z) => z.wynik), 'żądanie blokady przerwane po limicie').toEqual(['przerwana']);
    expect(o.kolejka('A')).toEqual([]);
    await h.zwolnij();
    tik();
    const n = await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await o.gotowe();
    expect(o.kolejka('A').map((w) => [w.kind, w.entityKey])).toEqual([['note', n.id]]);
  }, 60_000);

  it('EM7: łańcuch FIFO — pięć zmian różnych encji szybko po sobie: seqLocal w kolejności emisji', async () => {
    const o = await okno({ bramka: true });
    const k = await karta(o);
    await o.gotowe();
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    const h = await o.locks.trzymaj(o.blokadaKonta);
    await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await o.v.savePatientList({ name: 'Fikcyjna lista', memberIds: [k.P] });
    await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    await o.v.savePatient(naglowek(1, { masa: 26 }), { dedup: false, patientId: k.P });
    await o.v.addWaitlistList('Fikcyjny zabieg 1');
    await h.zwolnij();
    await o.gotowe();
    const klucz = (e) => (e.kind === 'snap' ? `${e.klucze.patientId}/${e.klucze.snapshotId}` : String(e.klucze));
    const emisje = o.l.emisje.slice(e0).map((e) => `${e.kind} ${klucz(e)}`);
    expect(emisje.map((x) => x.split(' ')[0])).toEqual(['note', 'plist', 'pnote', 'snap', 'pref']);
    expect(po(o, s0).map((w) => `${w.kind} ${w.entityKey}`)).toEqual(emisje);
  }, 60_000);

  // Dwie zmiany przed przełączeniem: dopisanie pierwszej czeka na blokadę konta, druga czeka w łańcuchu za nią — jej
  // dopisanie rusza dopiero po zmianie sesji, a niesie sesję z chwili emisji.
  it('EM8: blokada sejfu między zapisem a dopisaniem (łańcuch czeka na blokadę konta) — bez wiersza; po ponownym zalogowaniu nic nie dochodzi', async () => {
    const o = await okno({ bramka: true });
    const h = await o.locks.trzymaj(o.blokadaKonta);
    await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    tik();
    await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    o.zablokuj();
    await o.zaloguj('A');
    await h.zwolnij();
    await o.gotowe();
    expect(o.l.emisje.map((e) => e.kind)).toEqual(['snap', 'note']);
    expect(o.kolejka('A')).toEqual([]);
  }, 60_000);

  it('EM9: przełączenie na konto B w trakcie — bez wiersza u A i bez zmian A u B; zmiana konta B dopisana, choć łańcuch A stoi (P-SESJA-ZAPISU)', async () => {
    const o = await okno({ bramka: true, konta: 'AB' });
    const h = await o.locks.trzymaj(o.blokadaKonta);
    await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    tik();
    await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await o.przelacz('B');
    const rB = await o.v.savePatient(naglowek(2), { dedup: false });
    await czekajNa(() => o.kolejka('B').length === 1, 'wiersz konta B przy trzymanej blokadzie konta A');
    await h.zwolnij();
    await o.gotowe();
    expect(o.kolejka('A')).toEqual([]);
    expect(o.kolejka('B').map((w) => [w.kind, w.entityKey])).toEqual([['snap', `${rB.patientId}/${rB.snapshotId}`]]);
  }, 60_000);

  it('EM10: „Scal pacjentów” przerwane zmianą sesji — emisja sprzed zmiany niesie sesję operacji: bez wiersza także po ponownym zalogowaniu', async () => {
    const o = await okno({ bramka: true });
    const cel = await karta(o, 1);
    const zr = await karta(o, 2);
    await o.gotowe();
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    const h = await o.locks.trzymaj(o.blokadaKonta);
    let wpisy = 0;
    const hak = o.idb.__atrapa.hak({ przy: 'success', baza: `vilda_user_${o.uid}`, sklep: 'snapshots', metoda: 'put', raz: false }, () => {
      wpisy += 1;
      if (wpisy === 2) o.zablokuj();
    });
    const r = await wynik(o.v.mergePatients(zr.P, cel.P));
    hak.rozbroj();
    expect(r.ok, 'scalenie przerwane').toBe(false);
    expect(o.l.emisje.slice(e0).map((e) => [e.kind, e.sesja]), 'jedna emisja przed zmianą, z sesją operacji').toEqual([['snap', true]]);
    await o.zaloguj('A');
    await h.zwolnij();
    await o.gotowe();
    expect(po(o, s0)).toEqual([]);
  }, 60_000);
});
describe('EM11–EM18: kroki operacji złożonych', () => {
  it('EM11: krok „Scal pacjentów” — wersje (przeniesione i nowa karty celu), potem nagrobek karty, notatka, lista', async () => {
    const o = await okno({ bramka: true });
    const cel = await karta(o, 1);
    const zr = await karta(o, 2);
    await o.v.savePatientNote({ patientId: zr.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    await o.v.savePatientList({ name: 'Fikcyjna lista', memberIds: [zr.P] });
    await o.gotowe();
    const s0 = ostatni(o);
    tik();
    const r = await o.v.mergePatients(zr.P, cel.P);
    await o.gotowe();
    const w = po(o, s0);
    expect(rodzaje(w)).toEqual(['snap', 'snap', 'snap', 'ptomb', 'pnote', 'plist']);
    expect(w.slice(0, 2).map((x) => x.entityKey).sort()).toEqual([`${cel.P}/${zr.S1}`, `${cel.P}/${zr.S2}`].sort());
    expect(w[2].entityKey).toBe(`${cel.P}/${r.snapshotId}`);
    expect(w[3].entityKey).toBe(zr.P);
  }, 60_000);

  it('EM12: krok „Usuń pacjenta” — nagrobek karty przed nagrobkami notatek', async () => {
    const o = await okno({ bramka: true });
    const k = await karta(o);
    await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka 1', body: 'Fikcyjna treść.', category: 'inne' });
    await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka 2', body: 'Fikcyjna treść.', category: 'inne' });
    await o.gotowe();
    const s0 = ostatni(o);
    tik();
    await o.v.removePatient(k.P);
    await o.gotowe();
    expect(rodzaje(po(o, s0))).toEqual(['ptomb', 'pnotetomb', 'pnotetomb']);
  }, 60_000);

  it('EM13: krok zapisu notatki w stanie „czeka” — notatka przed jej nagrobkiem', async () => {
    const o = await okno({ bramka: true });
    const k = await karta(o);
    const n = await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    await o.gotowe();
    tik(60_000);
    // Drugie urządzenie usuwa pacjenta; ta karta scala jego kopię konta bez zmiany karty — notatka czeka przy karcie.
    const B = await blizniak(o);
    tik(60_000);
    await B.v.removePatient(k.P);
    tik(60_000);
    await o.v.mergeVaultBackup(await B.v.exportVaultBackup(), o.A.haslo);
    await o.gotowe();
    expect(await o.v.getPatient(k.P), 'karta jest').toBeTruthy();
    const s0 = ostatni(o);
    tik(60_000);
    await o.v.savePatientNote({ id: n.id, patientId: k.P, title: 'Fikcyjna notatka (poprawka)', body: 'Fikcyjna treść 2.', category: 'inne' });
    await o.gotowe();
    expect(po(o, s0).map((w) => [w.kind, w.entityKey])).toEqual([['pnote', n.id], ['pnotetomb', n.id]]);
  }, 60_000);

  it('EM14: krok kosza z „Odepnij i usuń”, wersja zmieniona w trakcie (zmieniony) — wiersz snap, bez stomb', async () => {
    const o = await okno({ bramka: true });
    const k = await karta(o);
    await o.v.setSnapshotPinned(k.P, k.S1, true);
    tik();
    await o.gotowe();
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    const baza = `vilda_user_${o.uid}`;
    const st = o.idb.__atrapa.wstrzymaj({ przy: 'commit', baza, sklep: 'meta', tryb: 'readwrite' });
    const kosz = wynik(o.v.moveSnapshotToTrash(k.P, k.S1, { odepnij: true }));
    await st.czeka;
    // Zapis kosza stoi przed zatwierdzeniem; w tym czasie ta wersja zmienia się (jak scalenie synchronizacji).
    await zmienRekord(o.idb, baza, 'snapshots', k.S1, (x) => ({ ...x, rev: (x.rev || 0) + 1 }));
    st.zwolnij();
    const r = await kosz;
    expect([r.ok, r.kod]).toEqual([false, 'zmieniony']);
    await o.gotowe();
    expect(o.l.emisje.slice(e0).map((e) => e.kind), 'odpięcie i ponowne przypięcie').toEqual(['snap', 'snap']);
    expect(po(o, s0).map((w) => [w.kind, w.entityKey])).toEqual([['snap', `${k.P}/${k.S1}`]]);
  }, 60_000);

  it('EM15: kroki zagnieżdżone w „Scal pacjentów” (zapis notatki, „Usuń pacjenta”) — łańcuch dostaje wpisy dopiero przy zamknięciu zewnętrznego kroku', async () => {
    const zamkniecia = [];
    const stan = { o: null, g: 0 };
    const przy = (nazwa, faza) => {
      if (faza !== 'wejscie' || !stan.o) return;
      if (nazwa === 'Bem_krokStart') stan.g += 1;
      if (nazwa === 'Bem_krokKoniec') { zamkniecia.push({ glebokosc: stan.g, zadan: stan.o.zadaniaKolejki().length }); stan.g -= 1; }
    };
    const o = await okno({ bramka: true, opakuj: true, przy });
    const cel = await karta(o, 1);
    const zr = await karta(o, 2);
    await o.v.savePatientNote({ patientId: zr.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    await o.v.savePatientList({ name: 'Fikcyjna lista', memberIds: [zr.P] });
    await o.gotowe();
    const z0 = o.zadaniaKolejki().length;
    const s0 = ostatni(o);
    stan.o = o;
    await o.v.mergePatients(zr.P, cel.P);
    stan.o = null;
    await o.gotowe();
    expect(zamkniecia.map((z) => z.glebokosc), 'zapis notatki i „Usuń pacjenta” w kroku scalenia').toEqual([2, 2, 1]);
    expect(zamkniecia.map((z) => z.zadan - z0), 'żądania blokady konta przed zamknięciem kroków').toEqual([0, 0, 0]);
    expect(rodzaje(po(o, s0))).toEqual(['snap', 'snap', 'snap', 'ptomb', 'pnote', 'plist']);
    expect(o.zadaniaKolejki().length - z0).toBe(6);
  }, 60_000);

  it('EM16: wyjątek w kroku (zapis notatki w migracji wpisów spoza bazy kończy się błędem) — krok zamknięty, emisja sprzed wyjątku dopisana, następna emisja nie czeka', async () => {
    const o = await okno({ bramka: true });
    await o.v.savePatientNote({ patientId: '__vilda_external__', externalName: 'Testowy Jan9', title: 'Fikcyjny wpis spoza bazy', body: 'Fikcyjna treść.', category: 'inne' });
    await o.gotowe();
    const s0 = ostatni(o);
    tik();
    o.idb.__atrapa.usterka({ przy: 'put', baza: `vilda_user_${o.uid}`, sklep: 'patientNotes', blad: 'UnknownError' });
    const r = await wynik(o.v.migrateExternalNotesToRegistry());
    expect(r.ok, 'migracja przerwana błędem zapisu notatki').toBe(false);
    await o.gotowe();
    expect(rodzaje(po(o, s0)), 'osoba spoza bazy zapisana przed wyjątkiem').toEqual(['snap']);
    const s1 = ostatni(o);
    tik();
    const n = await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await o.gotowe();
    expect(po(o, s1).map((w) => [w.kind, w.entityKey])).toEqual([['note', n.id]]);
  }, 60_000);

  // Krok otwarty przez „Usuń do kosza” na karcie, której blokadę zapisu trzyma test (operacja czeka w kroku).
  async function krokOtwarty(o, k) {
    const nazwa = `vilda-save-pat:${k.P}`;
    const h = await o.locks.trzymaj(nazwa);
    const kosz = wynik(o.v.moveSnapshotToTrash(k.P, k.S1));
    await o.locks.czekajNaKolejke(nazwa, 1);
    return { zwolnij: async () => { await h.zwolnij(); return kosz; } };
  }

  it('EM17: powtórzenie tej samej wersji w kroku (gwiazdka i jej zdjęcie) — jeden wpis łańcucha', async () => {
    const o = await okno({ bramka: true });
    const k1 = await karta(o, 1);
    const k2 = await karta(o, 2);
    await o.gotowe();
    const s0 = ostatni(o);
    const z0 = o.zadaniaKolejki().length;
    const e0 = o.l.emisje.length;
    const krok = await krokOtwarty(o, k1);
    await o.v.setSnapshotPinned(k2.P, k2.S1, true);
    tik();
    await o.v.setSnapshotPinned(k2.P, k2.S1, false);
    tik();
    await o.ev.emissionsSettled();
    await o.spokoj();
    expect(o.zadaniaKolejki().length - z0, 'w otwartym kroku nic nie idzie do łańcucha').toBe(0);
    const r = await krok.zwolnij();
    expect(r.ok).toBe(true);
    await o.gotowe();
    expect(o.l.emisje.slice(e0).map((e) => e.kind)).toEqual(['snap', 'snap', 'stomb']);
    expect(o.zadaniaKolejki().length - z0, 'wpisy łańcucha: wersja raz, wpis kosza').toBe(2);
    expect(po(o, s0).map((w) => [w.kind, w.entityKey])).toEqual([['snap', `${k2.P}/${k2.S1}`], ['stomb', k1.S1]]);
  }, 60_000);

  it('EM18: emisja innej operacji w trakcie otwartego kroku — dopisana po końcu kroku, w kolejności rang i emisji', async () => {
    const o = await okno({ bramka: true });
    const k = await karta(o);
    await o.gotowe();
    const s0 = ostatni(o);
    const krok = await krokOtwarty(o, k);
    const n1 = await o.v.saveNote({ title: 'Fikcyjny szablon 1', category: 'badanie', body: 'Fikcyjna treść 1.' });
    tik();
    const n2 = await o.v.saveNote({ title: 'Fikcyjny szablon 2', category: 'badanie', body: 'Fikcyjna treść 2.' });
    tik();
    await o.ev.emissionsSettled();
    await o.spokoj();
    expect(po(o, s0), 'przed końcem kroku bez wierszy').toEqual([]);
    expect((await krok.zwolnij()).ok).toBe(true);
    await o.gotowe();
    expect(po(o, s0).map((w) => [w.kind, w.entityKey])).toEqual([['stomb', k.S1], ['note', n1.id], ['note', n2.id]]);
  }, 60_000);
});
describe('EM19–EM24: dopisanie, enqueue, usuwanie konta, emissionsSettled, dwie karty, reguła ogona', () => {
  const odczytyRejestru = (o, z) => o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'tx' && w[1] === 'vilda_registry' && w[4] === 'start').length;
  const zadaniaKonta = (o) => o.locks.zadania.filter((x) => !x.test && x.nazwa === o.blokadaKonta).map((x) => x.tryb);

  it('EM19: enqueue — blokada współdzielona konta przed odczytem rejestru', async () => {
    const o = await okno({ bramka: true, wymagajEmisji: false });
    const n = await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await o.gotowe();
    const h = await o.locks.trzymaj(o.blokadaKonta);
    const z = o.znacznik();
    const zadan = zadaniaKonta(o).length;
    const p = o.ev.enqueue('note', n.id);
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    await o.spokoj();
    expect(zadaniaKonta(o).slice(zadan)).toEqual(['shared']);
    expect(odczytyRejestru(o, z), 'odczyty rejestru przed przyznaniem blokady').toBe(0);
    await h.zwolnij();
    expect((await p).ok).toBe(true);
    expect(odczytyRejestru(o, z)).toBeGreaterThan(0);
  }, 60_000);

  it('EM19: dopisanie z łańcucha emisji — blokada współdzielona konta przed odczytem rejestru', async () => {
    const o = await okno({ bramka: true });
    await o.gotowe();
    const h = await o.locks.trzymaj(o.blokadaKonta);
    const z = o.znacznik();
    await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    await o.spokoj();
    const przed = odczytyRejestru(o, z);
    expect(zadaniaKonta(o)).toEqual(['shared']);
    await h.zwolnij();
    await o.gotowe();
    expect(odczytyRejestru(o, z) - przed, 'odczyt rejestru dopiero pod blokadą').toBeGreaterThan(0);
    expect(rodzaje(o.kolejka('A'))).toEqual(['note']);
  }, 60_000);

  it('EM20: enqueue bez zmian — odmowy, wynik, zastąpienie na ogonie i limit blokady konta', async () => {
    const o = await okno({ wymagajEmisji: false });
    const n = await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    expect(await o.ev.enqueue('note', n.id)).toEqual({ ok: false, powod: 'bramka' });
    o.win.VILDA_EVENT_LOG = true;
    expect(await o.ev.enqueue('note', '')).toEqual({ ok: false, powod: 'argument' });
    expect(await o.ev.enqueue('fikcyjny', n.id)).toEqual({ ok: false, powod: 'rodzaj' });
    const r = await o.ev.enqueue('note', n.id);
    expect(r).toMatchObject({ ok: true, stany: ['pending'], zastapione: 0 });
    expect(r.eids).toHaveLength(1);
    tik();
    expect(await o.ev.enqueue('note', n.id)).toMatchObject({ ok: true, stany: ['pending'], zastapione: 1 });
    const h = await o.locks.trzymaj(o.blokadaKonta);
    const p = o.ev.enqueue('note', n.id);
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    expect(o.timery.odpal((t) => t.ms === 20000)).toBe(1);
    expect(await p).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_TIMEOUT' });
    await h.zwolnij();
    o.zablokuj();
    expect(await o.ev.enqueue('note', n.id)).toEqual({ ok: false, powod: 'zablokowany' });
    expect(o.kolejka('A').length).toBe(1);
  }, 60_000);

  it('EM21: usuwanie konta w trakcie łańcucha — bez wiersza i bez bazy kolejki po końcu', async () => {
    const o = await okno({ bramka: true });
    await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await o.gotowe();
    expect(o.jestBaza('A'), 'baza kolejki przed usunięciem konta').toBe(true);
    const h = await o.locks.trzymaj(o.blokadaKonta);
    await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    const usun = wynik(o.v.removeUser(o.uid, o.A.haslo));
    await o.spokoj();
    await h.zwolnij();
    const r = await usun;
    expect(r.ok, r.komunikat).toBe(true);
    await o.gotowe();
    expect(o.jestBaza('A')).toBe(false);
    expect((await o.idb.databases()).map((d) => d.name)).not.toContain(nazwaBazy(o.uid));
  }, 60_000);

  it('EM22: emissionsSettled — po ostatnim dopisaniu łańcucha (także dodanym w trakcie); przy zamkniętej bramce od razu, bez odczytu pól okna', async () => {
    const o = await okno();
    const pola = { VILDA_EVENT_LOG: 0, indexedDB: 0, localStorage: 0, crypto: 0, navigator: 0 };
    const liczenie = { wl: false };
    for (const pole of ['indexedDB', 'localStorage', 'crypto', 'navigator']) {
      const w = o.win[pole];
      Object.defineProperty(o.win, pole, { get() { if (liczenie.wl) pola[pole] += 1; return w; }, configurable: true });
    }
    await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    const zBramki = o.bramka.odczyty;
    liczenie.wl = true;
    const p = o.ev.emissionsSettled();
    liczenie.wl = false;
    pola.VILDA_EVENT_LOG = o.bramka.odczyty - zBramki;
    expect(pola).toEqual({ VILDA_EVENT_LOG: 0, indexedDB: 0, localStorage: 0, crypto: 0, navigator: 0 });
    let rozstrzygniete = false;
    p.then(() => { rozstrzygniete = true; });
    await makrozadanie();
    expect(rozstrzygniete, 'przy zamkniętej bramce od razu').toBe(true);
    expect(await p).toBeUndefined();
    // Bramka otwarta: łańcuch stoi na blokadzie konta.
    o.win.VILDA_EVENT_LOG = true;
    const h = await o.locks.trzymaj(o.blokadaKonta);
    await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    const stan = { gotowe: false, wiersze: null };
    o.ev.emissionsSettled().then(() => { stan.gotowe = true; stan.wiersze = rodzaje(o.kolejka('A')); });
    tik();
    await o.v.saveNote({ title: 'Fikcyjny szablon 2', category: 'badanie', body: 'Fikcyjna treść 2.' });
    await o.spokoj();
    expect(stan.gotowe, 'łańcuch stoi — emissionsSettled czeka').toBe(false);
    await h.zwolnij();
    await czekajNa(() => stan.gotowe, 'emissionsSettled po zwolnieniu blokady');
    expect(stan.wiersze, 'w chwili rozstrzygnięcia oba dopisania są w kolejce').toEqual(['snap', 'note']);
  }, 60_000);

  it('EM22: bramka zamknięta w trakcie łańcucha — dopisanie, które jeszcze nie ruszyło, kończy się bez wiersza', async () => {
    const o = await okno({ bramka: true });
    await o.gotowe();
    const h = await o.locks.trzymaj(o.blokadaKonta);
    await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(o.blokadaKonta, 1);
    tik();
    const n = await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    o.win.VILDA_EVENT_LOG = false;
    await h.zwolnij();
    await o.gotowe();
    expect(o.kolejka('A').filter((w) => w.kind === 'note' && w.entityKey === n.id), 'zmiana z łańcucha po zamknięciu bramki').toEqual([]);
    expect(zadaniaKonta(o), 'drugie dopisanie bez żądania blokady').toEqual(['shared']);
  }, 60_000);

  it('EM23: dwie karty przeglądarki — każda ma własny łańcuch; wiersze obu w jednej kolejce, w każdej karcie FIFO', async () => {
    const o = await okno({ bramka: true });
    const o2 = await drugieOkno(o, { emisja: true, zrodla: { 'vilda_vault.js': licznikEmisji().zaladuj } });
    okna.push(o2);
    await o.gotowe();
    const h = await o.locks.trzymaj(o.blokadaKonta);
    const zapisz = async (x, i) => { tik(); return (await x.v.saveNote({ title: `Fikcyjny szablon ${i}`, category: 'badanie', body: 'Fikcyjna treść.' })).id; };
    const a1 = await zapisz(o, 1);
    const c1 = await zapisz(o2, 2);
    const a2 = await zapisz(o, 3);
    const c2 = await zapisz(o2, 4);
    await o.locks.czekajNaKolejke(o.blokadaKonta, 2);
    await h.zwolnij();
    await o.ev.emissionsSettled();
    await o2.ev.emissionsSettled();
    await o.cisza();
    await o2.cisza();
    const kolejnosc = o.kolejka('A').map((w) => w.entityKey);
    expect([...kolejnosc].sort()).toEqual([a1, a2, c1, c2].sort());
    expect(kolejnosc.indexOf(a1) < kolejnosc.indexOf(a2), 'pierwsza karta: FIFO').toBe(true);
    expect(kolejnosc.indexOf(c1) < kolejnosc.indexOf(c2), 'druga karta: FIFO').toBe(true);
  }, 60_000);

  it('EM24: dwie poprawki notatki szybko po sobie przed dopisaniem — jeden wiersz z treścią późniejszą (reguła ogona)', async () => {
    const o = await okno({ bramka: true });
    const k = await karta(o);
    const tresc = (body) => ({ patientId: k.P, title: 'Fikcyjna notatka', body, category: 'inne' });
    const n = await o.v.savePatientNote(tresc('Fikcyjna treść 1.'));
    await o.gotowe();
    const B = await blizniak(o);
    const z0 = o.zadaniaKolejki().length;
    const h = await o.locks.trzymaj(o.blokadaKonta);
    tik();
    await o.v.savePatientNote({ id: n.id, ...tresc('Fikcyjna treść 2.') });
    tik();
    await o.v.savePatientNote({ id: n.id, ...tresc('Fikcyjna treść 3.') });
    await h.zwolnij();
    await o.gotowe();
    expect(o.zadaniaKolejki().length - z0, 'dwa dopisania').toBe(2);
    const wiersze = o.kolejka('A').filter((w) => w.kind === 'pnote' && w.entityKey === n.id);
    expect(wiersze.map((w) => w.state)).toEqual(['pending']);
    expect((await B.ev.applyEncryptedEvent(wiersze[0].env)).status).toBe('applied');
    await B.cisza();
    expect((await B.v.getPatientNote(n.id)).body).toBe('Fikcyjna treść 3.');
  }, 60_000);
});
