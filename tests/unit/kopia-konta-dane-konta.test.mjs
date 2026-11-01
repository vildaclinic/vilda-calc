import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOPIA-DANE-KONTA (2026-10-14, wada „Scal teraz”): „Scal kopię konta” scala razem z wersjami także dane konta —
// notatki pacjentów, szablony ze strony „Notatki”, listy pacjentów, listy oczekujących i ich terminy — regułami
// synchronizacji (wewnętrzne scalanie Le), z poprawkami i usunięciami z kopii. Podgląd tego nie liczył: gdy kopia
// niosła tylko te dane, „Scal teraz” było ukryte („Brak nowych danych — wszystko już masz”), usunięcia z kopii szły
// po cichu, a ekran wyniku pisał „Brak zmian — … już były” także przy awarii zapisu.
//
// Na `audyt` 2df41a8 podgląd nie miał żadnego pola planu danych konta, a wynik scalania nie miał pól list ani usunięć,
// więc KAŻDY przypadek T pada tam już na braku pól (także kontrolne i fantomowe: T4, T6, T8, T10, T10b, T19, T22, T26,
// T28–T30) — te testy przypinają nowy kontrakt, a nie dowodzą wady. [CZERWONY] oznacza przypadki, w których zachowanie
// przed zmianą było wadliwe dla lekarza (przycisk ukryty, usunięcie po cichu, „już były” przy awarii, mylący podtytuł);
// dowód behawioralny stanu sprzed zmiany: pomiary S1–S9, K1–K10 we wpisie dokumentacji i e2e (3/3 czerwone na audyt).
//
// Scalanie danych (Le) bez zmian — testy sprawdzają, że podgląd mówi to samo, co potem robi scalanie, i że oba zgadzają
// się z różnicą magazynu (parzystość). Prawdziwy vilda_vault.js, magazyn w pamięci; ekran — prawdziwe czytelne
// pomocniki z vilda_auth_ui.js, wycięte ze źródła i wykonane (bez kopii reguł). Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

let licznik = 0;
async function sejf() {
  licznik += 1;
  const pref = { zapisz: null };
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
    // Prawdziwa droga zapisu preferencji: VildaPersistence → onPreferenceWrite → zapis w meta konta.
    VildaPersistence: { onPreferenceWrite(cb) { pref.zapisz = cb; }, applyPreferenceFromCloud() {} },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  v.setStorageAdapter(baza);
  const haslo = `Kopia#DaneKonta!2026${licznik}aa`;
  await v.createUser(haslo, { label: `dane-${licznik}`, iterations: 10000 });
  const [u] = await v.listUsers();
  return { v, baza, uid: u.userId, haslo, pref, win };
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
const zapis = (nazwisko, imie, wieki, naglowek = {}) => ({
  name: `${nazwisko} ${imie}`,
  user: { lastName: nazwisko, firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19, ...naglowek },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});
async function karta(v, nazwisko, imie, notatka) {
  const a = await v.savePatient(zapis(nazwisko, imie, [60]), { dedup: false });
  await chwila(3);
  await v.savePatient(zapis(nazwisko, imie, [60, 66]), { patientId: a.patientId, dedup: false });
  if (notatka) await v.savePatientNote({ patientId: a.patientId, title: notatka, body: 'fikcja', category: 'followup' });
  return a.patientId;
}
const notatka = (v, patientId, title) => v.savePatientNote({ patientId, title, body: 'fikcja', category: 'followup' });

/* ---------- ekran: prawdziwe pomocniki z vilda_auth_ui.js ---------- */
const ui = readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');
const EKRAN = (() => {
  const od = ui.indexOf('function Bks_odm(');
  const doo = ui.indexOf('\nasync function hi(', od);
  const kod = ui.slice(od, doo);
  // na (data względna) i e (DOM) nie biorą udziału w liniach sprawdzanych tutaj.
  return new Function('na', 'e', `${kod}\nreturn { Bks_etykietaScal, Bks_podsumowanie, Bks_linieDanych, Bks_linie, Bks_koniecWyniku, Bks_daneKonta };`)(() => '', () => null);
})();
const ekranPodgladu = (m) => ({ przycisk: EKRAN.Bks_etykietaScal(m), podsumowanie: EKRAN.Bks_podsumowanie(m) });
// Kolejność jak w uo: linie danych konta (z podglądem — nazwa sum notatek przy wpisach Terminarza), linie pominiętych,
// linia końcowa (przypięte testem źródła niżej).
const ekranWyniku = (w, podglad) => EKRAN.Bks_linieDanych(w, podglad).concat(EKRAN.Bks_linie(w), EKRAN.Bks_koniecWyniku(w, podglad));
// Podtytuł ekranu „Scal kopię konta” ze źródła uo (sekwencje ucieczki \u i \x odkodowane).
const PODTYTUL = (() => {
  const od = ui.indexOf('class:"vilda-auth-subtitle",text:"Podaj has');
  const tekst = ui.slice(ui.indexOf('text:"', od) + 6, ui.indexOf('"}', od));
  return tekst.replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_, u, x) => String.fromCharCode(parseInt(u || x, 16)));
})();
const JUZ_BYLY = 'Brak zmian — wszystkie dane z tej kopii już były w Twoim koncie.';
const NIE_SCALONO = 'Nie scalono notatek ani list z tej kopii — mogły dojść w międzyczasie albo zapis się nie udał. Sprawdź kopię ponownie.';

/* ---------- magazyn: to, co widzi lekarz ---------- */
const bezCzasu = (w) => JSON.stringify(Object.keys(w).filter((k) => k !== 'updatedAtISO' && k !== 'createdAtISO').sort().map((k) => [k, w[k]]));
async function migawka(s) {
  const meta = await s.baza.getUserMeta(s.uid);
  const karty = {};
  for (const k of await s.baza.listPatientsForUser(s.uid)) {
    karty[k.patientId] = { licznik: k.snapshotCount, wersje: (await s.baza.listSnapshotsForUser(s.uid, k.patientId)).map((w) => w.snapshotId).sort() };
  }
  return {
    karty,
    // Rekord bez updatedAtISO (stary zapis) — data pusta, nie napis 'undefined': inaczej parzystosc() liczyłaby
    // „zastąpioną późniejszą edycję” z porównania 'undefined' > '2026-…' (uwaga recenzji końcowej 2, G1).
    notatkiPacjentow: new Map((await s.baza.listPatientNotesForUser(s.uid)).map((x) => [x.id, `${x.updatedAtISO || ''}|${x.rev}|${x.patientId}`])),
    szablony: new Map((await s.baza.listNotesForUser(s.uid)).map((x) => [x.id, String(x.updatedAtISO || '')])),
    listy: new Map((await s.baza.listPatientListsForUser(s.uid)).map((x) => [x.id, `${x.updatedAtISO || ''}|${x.rev}`])),
    oczekujacy: new Map(Object.entries(await s.v.getWaitlistLists()).map(([k, x]) => [k, bezCzasu(x)])),
    terminy: new Map(Object.entries(await s.v.getWaitlistSchedules()).map(([k, x]) => [k, bezCzasu(x)])),
    nagrobkiNotatek: (await s.baza.listPatientNoteTombstonesForUser(s.uid)).map((t) => t.id).sort(),
    nagrobkiSzablonow: (await s.baza.listNoteTombstonesForUser(s.uid)).map((t) => t.id).sort(),
    nagrobkiList: (await s.baza.listPatientListTombstonesForUser(s.uid)).map((t) => t.id).sort(),
    preferencje: JSON.stringify((meta && meta.userPreferences) || {}),
  };
}
function roznica(a, b) {
  let dodane = 0, zmienione = 0, usuniete = 0;
  b.forEach((v, k) => { if (!a.has(k)) dodane += 1; else if (a.get(k) !== v) zmienione += 1; });
  a.forEach((v, k) => { if (!b.has(k)) usuniete += 1; });
  return { dodane, zmienione, usuniete };
}
const AKTYWNOSC = '__vilda_activity__';
const tylkoTerminarz = (mapa) => new Map([...mapa].filter(([, w]) => w.endsWith(`|${AKTYWNOSC}`)));
const RODZAJE = { PatientNote: 'notatkiPacjentow', Note: 'szablony', PatientList: 'listy', Waitlist: 'oczekujacy', WaitlistSchedule: 'terminy' };
const NAGROBKI = { PatientNote: 'nagrobkiNotatek', Note: 'nagrobkiSzablonow', PatientList: 'nagrobkiList' };

/* T11 — parzystość: podgląd === wynik scalania === różnica magazynu, dla każdego rodzaju i każdego licznika. */
function parzystosc(r) {
  for (const [rodzaj, klucz] of Object.entries(RODZAJE)) {
    const d = roznica(r.przed[klucz], r.po[klucz]);
    for (const [pole, prawda] of [['added', d.dodane], ['updated', d.zmienione], ['deleted', d.usuniete]]) {
      const k = `${pole}${rodzaj}Count`;
      expect([r.podglad[k], r.wynik[k]], `${k}: podgląd, wynik scalania (magazyn: ${prawda})`).toEqual([prawda, prawda]);
    }
    if (NAGROBKI[rodzaj]) {
      const przywrocone = [...r.po[klucz].keys()].filter((id) => !r.przed[klucz].has(id)
        && r.przed[NAGROBKI[rodzaj]].includes(id) && !r.po[NAGROBKI[rodzaj]].includes(id)).length;
      expect(r.podglad[`restored${rodzaj}Count`], `restored${rodzaj}Count`).toBe(przywrocone);
    }
    // Zastąpione późniejsze edycje tutaj (część updated…): pozycja zmieniona, a jej nowa data jest starsza niż tutejsza.
    const data = (v) => String(v).split('|')[0];
    const zastapione = NAGROBKI[rodzaj] ? [...r.po[klucz].keys()].filter((id) => r.przed[klucz].has(id)
      && r.przed[klucz].get(id) !== r.po[klucz].get(id) && data(r.po[klucz].get(id)) < data(r.przed[klucz].get(id))).length : 0;
    expect(r.podglad[`replacedNewer${rodzaj}Count`], `replacedNewer${rodzaj}Count`).toBe(zastapione);
  }
  // Część Terminarza (uwaga recenzji gałęzi 44ba49f7; tylko podgląd — Le jej nie rozdziela): wpisy Terminarza bez
  // pacjenta = różnica magazynu notatek pacjentów ograniczona do patientId ACTIVITY_PATIENT_ID, każde z pięciu pól.
  {
    const a = tylkoTerminarz(r.przed.notatkiPacjentow), z = tylkoTerminarz(r.po.notatkiPacjentow), d = roznica(a, z);
    const data = (v) => String(v).split('|')[0];
    const przywrocone = [...z.keys()].filter((id) => !a.has(id) && r.przed.nagrobkiNotatek.includes(id) && !r.po.nagrobkiNotatek.includes(id)).length;
    const zastapione = [...z.keys()].filter((id) => a.has(id) && a.get(id) !== z.get(id) && data(z.get(id)) < data(a.get(id))).length;
    expect(['added', 'restored', 'updated', 'replacedNewer', 'deleted'].map((p) => r.podglad[`${p}ActivityNoteCount`]),
      'część Terminarza w podglądzie: dodane, przywrócone, zmienione, zastąpione, usunięte (magazyn)')
      .toEqual([d.dodane, przywrocone, d.zmienione, zastapione, d.usuniete]);
  }
  expect(r.podglad.updatedPreferenceCount, 'licznik preferencji Le: podgląd = wynik').toBe(r.wynik.updatedPreferenceCount);
  expect(r.wynik.accountDataMerged).toBe(true);
}

/* A: Testowy Adam i Fikcyjna Ewa (po 2 wersje); C dostaje je synchronizacją; zmiana na A; kopia A; podgląd i scalenie w C. */
async function przypadek({ przed, po, wC, przerobKopie, przedScaleniem, synchronizuj = true } = {}) {
  const A = await sejf();
  const ids = { p1: await karta(A.v, 'Testowy', 'Adam'), p2: await karta(A.v, 'Fikcyjna', 'Ewa') };
  if (przed) await przed(A, ids);
  const C = await sejf();
  if (synchronizuj) await C.v.mergeSyncPayload({ ...(await A.v.exportSyncPayload()), credential: null });
  await chwila(5);
  if (po) await po(A, ids, C);
  let kopia = await A.v.exportVaultBackup();
  if (przerobKopie) kopia = await przerobKopie(A, C, kopia);
  if (wC) await wC(C, ids, A);
  const przedPodgladem = await migawka(C);
  const podglad = await C.v.previewVaultBackupMerge(kopia, A.haslo);
  const przed0 = await migawka(C);
  // T12 — podgląd nie zmienia magazynu (wersje, notatki, listy, preferencje, nagrobki).
  expect(przed0, 'podgląd nie zmienia magazynu').toEqual(przedPodgladem);
  if (przedScaleniem) await przedScaleniem(C, A, ids);
  const przedS = await migawka(C);
  const wynik = await C.v.mergeVaultBackup(kopia, A.haslo);
  const poS = await migawka(C);
  return { A, C, ids, kopia, podglad, wynik, przed: przedS, po: poS, ekran: ekranPodgladu(podglad), linie: ekranWyniku(wynik, podglad) };
}
const wersjeBezZmian = (r) => expect(r.po.karty, 'wersje i liczniki kart bez zmian').toEqual(r.przed.karty);

describe('P-KOPIA-DANE-KONTA — kopia niesie tylko dane konta (bez nowych wersji)', () => {
  it('T1 [CZERWONY] nowa notatka pacjenta: przycisk widoczny, podgląd i wynik ją wymieniają (przed zmianą: przycisk ukryty)', async () => {
    const r = await przypadek({ po: async (A, { p1 }) => { await notatka(A.v, p1, 'N1 (fikcja)'); } });
    expect(r.podglad.totalNewSnapshots).toBe(0);
    expect(r.podglad.addedPatientNoteCount).toBe(1);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 notatka)', podsumowanie: 'Brak nowych zapisów · 1 nowa notatka pacjenta' });
    expect(r.linie).toEqual(['✓ Dodano 1 notatkę pacjenta']);
    expect(r.wynik.mergedPatientCount, 'żadna karta nie dostała nowych wersji').toBe(0);
    wersjeBezZmian(r);
    expect((await r.C.v.listPatientNotesForPatient(r.ids.p1)).map((n) => n.title)).toEqual(['N1 (fikcja)']);
    parzystosc(r);
  });

  it('T2 [CZERWONY] nowy szablon ze strony „Notatki”', async () => {
    const r = await przypadek({ po: async (A) => { await A.v.saveNote({ title: 'Szablon fikcyjny', body: 'f', category: 'wlasne' }); } });
    expect(r.podglad.addedNoteCount).toBe(1);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 notatka)', podsumowanie: 'Brak nowych zapisów · 1 nowy szablon w Notatkach' });
    expect(r.linie).toEqual(['✓ Dodano 1 szablon w Notatkach']);
    expect((await r.C.v.listNotes()).map((n) => n.title)).toEqual(['Szablon fikcyjny']);
    parzystosc(r);
  });

  it('T3 [CZERWONY] nowa lista pacjentów: pole listy w podglądzie i w wyniku scalania (przed zmianą wynik nie miał pól list)', async () => {
    const r = await przypadek({ po: async (A, { p1 }) => { await A.v.savePatientList({ name: 'Lista fikcyjna', memberIds: [p1] }); } });
    expect(r.podglad.addedPatientListCount).toBe(1);
    expect(r.wynik.addedPatientListCount).toBe(1);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 lista)', podsumowanie: 'Brak nowych zapisów · 1 nowa lista pacjentów' });
    expect(r.linie).toEqual(['✓ Dodano 1 listę pacjentów']);
    expect((await r.C.v.listPatientLists()).map((l) => l.name)).toEqual(['Lista fikcyjna']);
    parzystosc(r);
  });

  it('T4 [fantom K4] ta sama wartość preferencji zapisana ponownie: uiPreferenceCount 1, ale przycisk ukryty i teksty jak dotąd', async () => {
    const r = await przypadek({
      przed: async (A) => { await A.pref.zapisz({ key: 'remindersLastShownDate', value: '2026-10-14' }); },
      po: async (A) => { await chwila(5); await A.pref.zapisz({ key: 'remindersLastShownDate', value: '2026-10-14' }); },
    });
    expect(r.podglad.uiPreferenceCount).toBe(1);
    expect(r.podglad.updatedPreferenceCount).toBe(1);
    expect(r.wynik.updatedPreferenceCount, 'Le zapisuje nowszy znacznik').toBe(1);
    expect(EKRAN.Bks_daneKonta(r.podglad)).toBe(0);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: 'Brak nowych danych — wszystko już masz' });
    expect(r.linie).toEqual([JUZ_BYLY]);
    parzystosc(r);
  });

  it('T5 [CZERWONY] notatka poprawiona na drugim urządzeniu: „poprawiona” w podglądzie, „Zaktualizowano” w wyniku', async () => {
    const r = await przypadek({
      przed: async (A, { p1 }) => { await notatka(A.v, p1, 'N0 (fikcja)'); },
      po: async (A, { p1 }) => { const [n] = await A.v.listPatientNotesForPatient(p1); await A.v.savePatientNote({ ...n, body: 'N0 poprawiona (fikcja)' }); },
    });
    expect(r.podglad.updatedPatientNoteCount).toBe(1);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 notatka)', podsumowanie: 'Brak nowych zapisów · 1 poprawiona notatka pacjenta' });
    expect(r.linie).toEqual(['✓ Zaktualizowano 1 notatkę pacjenta']);
    expect((await r.C.v.listPatientNotesForPatient(r.ids.p1)).map((n) => n.body)).toEqual(['N0 poprawiona (fikcja)']);
    parzystosc(r);
  });

  it('T6 [kontrola] kopia z notatką, szablonem, listą, listą oczekujących i preferencją identycznymi z kontem: plan 0, przycisk ukryty, magazyn bez zmian', async () => {
    const r = await przypadek({
      przed: async (A, { p1 }) => {
        await notatka(A.v, p1, 'N (fikcja)');
        await A.v.saveNote({ title: 'Szablon', body: 'f', category: 'wlasne' });
        await A.v.savePatientList({ name: 'Lista fikcyjna', memberIds: [p1] });
        await A.v.addWaitlistList('Fikcyjny zabieg T6');
        await A.v.setWaitlistSchedule('Fikcyjny zabieg T6', { dateISO: '2026-12-01', time: '09:00' });
        await A.pref.zapisz({ key: 'remindersLastShownDate', value: '2026-10-01' });
      },
    });
    expect(EKRAN.Bks_daneKonta(r.podglad)).toBe(0);
    expect(r.podglad.uiPreferenceCount).toBe(0);
    expect(r.podglad.backupPatientNoteCount, 'kopia niesie notatkę (wariant „liczba w pliku” pokazałby przycisk)').toBe(1);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: 'Brak nowych danych — wszystko już masz' });
    expect(r.linie).toEqual([JUZ_BYLY]);
    expect(r.po, 'magazyn bez zmian').toEqual(r.przed);
    parzystosc(r);
  });

  it('T7 [CZERWONY] notatka i lista usunięte w kopii po synchronizacji: usunięcia stosowane jak dotąd, ale jawnie zapowiedziane i zgłoszone', async () => {
    const r = await przypadek({
      przed: async (A, { p1 }) => { await notatka(A.v, p1, 'N-do-usuniecia (fikcja)'); await A.v.savePatientList({ name: 'Lista do usunięcia', memberIds: [p1] }); },
      po: async (A, { p1 }) => {
        const [n] = await A.v.listPatientNotesForPatient(p1); await A.v.removePatientNote(n.id);
        const [l] = await A.v.listPatientLists(); await A.v.deletePatientList(l.id);
      },
    });
    expect([r.podglad.deletedPatientNoteCount, r.podglad.deletedPatientListCount]).toEqual([1, 1]);
    expect([r.wynik.deletedPatientNoteCount, r.wynik.deletedPatientListCount]).toEqual([1, 1]);
    expect(r.ekran).toEqual({
      przycisk: 'Scal teraz',
      podsumowanie: 'Brak nowych zapisów · usunięte w kopii: 1 notatka pacjenta, 1 lista pacjentów (zostaną usunięte także tutaj)',
    });
    expect(r.linie).toEqual(['⊖ Usunięto tak jak w kopii: 1 notatkę pacjenta, 1 listę pacjentów']);
    expect(await r.C.v.listPatientNotesForPatient(r.ids.p1)).toEqual([]);
    expect(await r.C.v.listPatientLists()).toEqual([]);
    parzystosc(r);
  });

  it('T8 [kontrola] notatka pacjentki usuniętej tutaj: plan 0, „Brak danych do dodania · pominięci: 1”, notatka nie wchodzi', async () => {
    const r = await przypadek({
      po: async (A, { p2 }) => { await notatka(A.v, p2, 'N-Ewa (fikcja)'); },
      wC: async (C, { p2 }) => { await chwila(5); await C.v.removePatient(p2); },
    });
    expect(r.podglad.skippedPatients.map((k) => k.reason)).toEqual(['deleted']);
    expect(EKRAN.Bks_daneKonta(r.podglad)).toBe(0);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: 'Brak danych do dodania · pominięci: 1' });
    expect(r.linie.at(-1)).toBe('Brak zmian — pozostałe dane z tej kopii już były w Twoim koncie.');
    expect(await r.C.v.listAllPatientNotes()).toEqual([]);
    parzystosc(r);
  });
});

describe('P-KOPIA-DANE-KONTA — wersje razem z danymi konta, reguły scalania', () => {
  it('T9 [CZERWONY] 1 nowa wersja Adama, notatka i lista: etykieta z dwiema częściami, „Uzupełniono zapisy u 1 pacjenta” (przed zmianą: u 2)', async () => {
    const r = await przypadek({
      po: async (A, { p1 }) => {
        await A.v.savePatient(zapis('Testowy', 'Adam', [60, 66, 72]), { patientId: p1, dedup: false });
        await notatka(A.v, p1, 'N1 (fikcja)');
        await A.v.savePatientList({ name: 'Lista fikcyjna', memberIds: [p1] });
      },
    });
    expect(r.podglad.totalNewSnapshots).toBe(1);
    expect(r.ekran).toEqual({
      przycisk: 'Scal teraz (1 nowych zapisów, 1 notatka, 1 lista)',
      podsumowanie: '1 nowych zapisów zostanie dodanych · 1 nowa notatka pacjenta · 1 nowa lista pacjentów',
    });
    expect(r.wynik.addedSnapshotCount).toBe(1);
    expect(r.wynik.mergedPatientCount, 'tylko karta, do której doszła wersja').toBe(1);
    expect(r.linie).toEqual(['✓ Dodano 1 notatkę pacjenta, 1 listę pacjentów']);
    parzystosc(r);
  });

  it('T10 [kontrola] reguły: nowsza poprawka tutaj, nagrobek kopii starszy od edycji tutaj, starsza preferencja w kopii → 0; lista z wyższym rev → zmieniona', async () => {
    const r = await przypadek({
      przed: async (A, { p1, p2 }) => {
        await notatka(A.v, p1, 'N-lokalna (fikcja)');
        await notatka(A.v, p2, 'N-nagrobek (fikcja)');
        await A.v.savePatientList({ name: 'Lista fikcyjna', memberIds: [p1] });
        await A.pref.zapisz({ key: 'vildaFikcyjnaPreferencja', value: 'A' });
      },
      po: async (A, { p2 }) => {
        const [n2] = await A.v.listPatientNotesForPatient(p2); await A.v.removePatientNote(n2.id);
        const [l] = await A.v.listPatientLists(); await A.v.savePatientList({ ...l, name: 'Lista fikcyjna (zmieniona)' });
      },
      wC: async (C, { p1, p2 }) => {
        await chwila(5);
        const [n1] = await C.v.listPatientNotesForPatient(p1); await C.v.savePatientNote({ ...n1, body: 'poprawka tutaj (fikcja)' });
        const [n2] = await C.v.listPatientNotesForPatient(p2); await C.v.savePatientNote({ ...n2, body: 'edycja tutaj po usunięciu w kopii' });
        await C.pref.zapisz({ key: 'vildaFikcyjnaPreferencja', value: 'C' });
      },
    });
    expect([r.podglad.updatedPatientNoteCount, r.podglad.deletedPatientNoteCount, r.podglad.uiPreferenceCount]).toEqual([0, 0, 0]);
    expect(r.podglad.updatedPatientListCount).toBe(1);
    expect(r.ekran.podsumowanie).toBe('Brak nowych zapisów · 1 zmieniona lista pacjentów');
    expect((await r.C.v.listAllPatientNotes()).map((n) => n.body).sort()).toEqual(['edycja tutaj po usunięciu w kopii', 'poprawka tutaj (fikcja)']);
    parzystosc(r);
  });

  it('T10b [kontrola reguły rev] kopia z wyższym rev, ale starszą datą niż poprawka tutaj, wygrywa (jak Le)', async () => {
    const r = await przypadek({
      przed: async (A, { p1 }) => { await notatka(A.v, p1, 'N-rev (fikcja)'); },
      po: async (A, { p1 }) => {
        for (const tresc of ['A1', 'A2']) {
          const [n] = await A.v.listPatientNotesForPatient(p1);
          await A.v.savePatientNote({ ...n, body: tresc });
          await chwila(5);
        }
      },
      wC: async (C, { p1 }) => { await chwila(5); const [n] = await C.v.listPatientNotesForPatient(p1); await C.v.savePatientNote({ ...n, body: 'C1 (nowsza data, niższy rev)' }); },
    });
    expect(r.podglad.updatedPatientNoteCount).toBe(1);
    expect((await r.C.v.listPatientNotesForPatient(r.ids.p1)).map((n) => n.body)).toEqual(['A2']);
    parzystosc(r);
  });

  it('T15 [wyścig] podgląd zapowiada notatkę, a ta dochodzi synchronizacją przed kliknięciem: wynik 0 i komunikat „Nie scalono…”, nie „już były”', async () => {
    const r = await przypadek({
      po: async (A, { p1 }) => { await notatka(A.v, p1, 'N-wyscig (fikcja)'); },
      przedScaleniem: async (C, A) => { await C.v.mergeSyncPayload({ ...(await A.v.exportSyncPayload()), credential: null }); },
    });
    expect(r.podglad.addedPatientNoteCount).toBe(1);
    expect(EKRAN.Bks_daneKonta(r.wynik)).toBe(0);
    expect(r.linie).toEqual([NIE_SCALONO]);
  });

  it('T23 [K9] nowy pacjent z notatką: obie części w etykiecie, parzystość', async () => {
    const r = await przypadek({
      po: async (A) => { const z = await karta(A.v, 'Nowa', 'Fikcja'); await notatka(A.v, z, 'N-nowa (fikcja)'); },
    });
    expect(r.podglad.addPatients).toHaveLength(1);
    expect(r.podglad.addedPatientNoteCount).toBe(1);
    expect(r.ekran).toEqual({
      przycisk: 'Scal teraz (2 nowych zapisów, 1 nowych pacjentów, 1 notatka)',
      podsumowanie: '2 nowych zapisów zostanie dodanych · 1 nowych pacjentów · 1 nowa notatka pacjenta',
    });
    expect(r.wynik.mergedPatientCount).toBe(0);
    expect(r.linie).toEqual(['✓ Dodano 1 notatkę pacjenta']);
    parzystosc(r);
  });

  it('T26 [regresja ekranu] kopia z samymi nowymi wersjami: etykieta, podsumowanie i wynik jak dotąd', async () => {
    const r = await przypadek({ po: async (A, { p1 }) => { await A.v.savePatient(zapis('Testowy', 'Adam', [60, 66, 72]), { patientId: p1, dedup: false }); } });
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 nowych zapisów)', podsumowanie: '1 nowych zapisów zostanie dodanych' });
    expect(r.linie).toEqual([]);
    parzystosc(r);
  });
});

describe('P-KOPIA-DANE-KONTA — listy oczekujących i terminy (userPreferences wllists, wlsched)', () => {
  it('T16 [CZERWONY, K1] lista oczekujących tylko w kopii: przycisk „Scal teraz (1 lista)”, po scaleniu lista jest', async () => {
    const r = await przypadek({ po: async (A) => { await A.v.addWaitlistList('Fikcyjny zabieg K1'); } });
    expect(r.podglad.addedWaitlistCount).toBe(1);
    expect(r.podglad.uiPreferenceCount).toBe(0);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 lista)', podsumowanie: 'Brak nowych zapisów · 1 nowa lista oczekujących' });
    expect(r.linie).toEqual(['✓ Dodano 1 listę oczekujących']);
    expect(Object.values(await r.C.v.getWaitlistLists()).map((l) => l.label)).toEqual(['Fikcyjny zabieg K1']);
    parzystosc(r);
  });

  it('T17 [CZERWONY, K2] lista oczekujących z terminem usunięta w kopii: obie usunięte tutaj, jawnie zapowiedziane', async () => {
    const r = await przypadek({
      przed: async (A) => {
        await A.v.addWaitlistList('Fikcyjny zabieg K2');
        await A.v.setWaitlistSchedule('Fikcyjny zabieg K2', { dateISO: '2026-12-01', time: '09:00' });
      },
      po: async (A) => { await chwila(5); await A.v.removeWaitlistList('Fikcyjny zabieg K2'); },
    });
    expect([r.podglad.deletedWaitlistCount, r.podglad.deletedWaitlistScheduleCount]).toEqual([1, 1]);
    expect(r.ekran).toEqual({
      przycisk: 'Scal teraz',
      podsumowanie: 'Brak nowych zapisów · usunięte w kopii: 1 lista oczekujących, 1 termin listy oczekujących (zostaną usunięte także tutaj)',
    });
    expect(r.linie).toEqual(['⊖ Usunięto tak jak w kopii: 1 listę oczekujących, 1 termin listy oczekujących']);
    expect(await r.C.v.getWaitlistLists()).toEqual({});
    expect(await r.C.v.getWaitlistSchedules()).toEqual({});
    parzystosc(r);
  });

  it('T18 [CZERWONY, K3] termin listy oczekujących tylko w kopii', async () => {
    const r = await przypadek({
      przed: async (A) => { await A.v.addWaitlistList('Fikcyjny zabieg K3'); },
      po: async (A) => { await chwila(5); await A.v.setWaitlistSchedule('Fikcyjny zabieg K3', { dateISO: '2026-11-20', time: '10:30' }); },
    });
    expect(r.podglad.addedWaitlistScheduleCount).toBe(1);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz', podsumowanie: 'Brak nowych zapisów · 1 nowy termin listy oczekujących' });
    expect(r.linie).toEqual(['✓ Dodano 1 termin listy oczekujących']);
    expect(Object.values(await r.C.v.getWaitlistSchedules()).map((t) => `${t.dateISO} ${t.time}`)).toEqual(['2026-11-20 10:30']);
    parzystosc(r);
  });

  it('T19 [fantom K5] lista oczekujących dodana i usunięta w kopii, której tu nie było: Le liczy zapis, plan 0, przycisk ukryty', async () => {
    const r = await przypadek({
      po: async (A) => { await A.v.addWaitlistList('Fikcyjny zabieg K5'); await chwila(5); await A.v.removeWaitlistList('Fikcyjny zabieg K5'); },
    });
    expect(r.wynik.updatedPreferenceCount, 'Le zapisuje mapę z wpisem usuniętym').toBe(1);
    expect(EKRAN.Bks_daneKonta(r.podglad)).toBe(0);
    expect(r.ekran.przycisk).toBe(null);
    expect(r.linie).toEqual([JUZ_BYLY]);
    parzystosc(r);
  });
});

describe('P-KOPIA-DANE-KONTA — przekierowanie, przywrócenie, nazwy, awarie', () => {
  it('T20 [CZERWONY, K6] X scalony tutaj z Y, poprawka notatki X w kopii: przycisk widoczny, notatka pod Y poprawiona', async () => {
    const A = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan');
    const x = await karta(A.v, 'Testowy', 'Jan', 'N-X (fikcja)');
    const C = await sejf();
    await C.v.mergeSyncPayload({ ...(await A.v.exportSyncPayload()), credential: null });
    await chwila(5);
    await C.v.mergePatients(x, y);
    await chwila(5);
    const [n] = await A.v.listPatientNotesForPatient(x);
    await A.v.savePatientNote({ ...n, body: 'POPRAWIONY wynik (fikcja)' });
    const kopia = await A.v.exportVaultBackup();
    const m0 = await migawka(C);
    const podglad = await C.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(await migawka(C), 'podgląd nie zmienia magazynu').toEqual(m0);
    expect(podglad.skippedPatients.map((k) => [k.reason, k.mergedIntoName])).toEqual([['merged', 'Testowy Jan']]);
    expect(podglad.updatedPatientNoteCount).toBe(1);
    expect(ekranPodgladu(podglad)).toEqual({ przycisk: 'Scal teraz (1 notatka)', podsumowanie: 'Brak nowych zapisów · 1 poprawiona notatka pacjenta · pominięci: 1' });
    const wynik = await C.v.mergeVaultBackup(kopia, A.haslo);
    const m1 = await migawka(C);
    expect(ekranWyniku(wynik, podglad)[0]).toBe('✓ Zaktualizowano 1 notatkę pacjenta');
    expect((await C.v.listPatientNotesForPatient(y)).map((k) => k.body)).toEqual(['POPRAWIONY wynik (fikcja)']);
    parzystosc({ podglad, wynik, przed: m0, po: m1 });
  });

  it('T21 [CZERWONY, K7] notatka usunięta tutaj, poprawiona w kopii później: „przywrócona (usunięta tutaj wcześniej)”, nagrobek zdjęty', async () => {
    const r = await przypadek({
      przed: async (A, { p1 }) => { await notatka(A.v, p1, 'N-wsk (fikcja)'); },
      po: async (A, { p1 }, C) => {
        const [nc] = await C.v.listPatientNotesForPatient(p1); await C.v.removePatientNote(nc.id);
        await chwila(5);
        const [na] = await A.v.listPatientNotesForPatient(p1); await A.v.savePatientNote({ ...na, body: 'poprawka w kopii po usunięciu tutaj' });
      },
    });
    expect([r.podglad.addedPatientNoteCount, r.podglad.restoredPatientNoteCount]).toEqual([1, 1]);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 notatka)', podsumowanie: 'Brak nowych zapisów · 1 przywrócona notatka pacjenta (usunięta tutaj wcześniej)' });
    expect(r.przed.nagrobkiNotatek).toHaveLength(1);
    expect(r.po.nagrobkiNotatek, 'nagrobek zdjęty').toEqual([]);
    parzystosc(r);
  });

  it('T22 [K8] lista o nazwie z samych znaków zerowej szerokości (kopia spreparowana): plan 0 i Le jej nie zapisuje (nazwa przez Z, nie trim)', async () => {
    const r = await przypadek({
      po: async (A, { p1 }) => { await A.v.savePatientList({ name: 'Do podmiany', memberIds: [p1] }); },
      przerobKopie: async (A, C, kopia) => {
        const VC = C.win.VildaCrypto;
        const obj = JSON.parse(typeof kopia === 'string' ? kopia : JSON.stringify(kopia));
        const master = await VC.unwrapMasterFromEnvelope(VC.parseEnvelope(kopia), A.haslo);
        const dane = await VC.decryptJson(master, obj.payload.iv, obj.payload.data);
        dane.patientLists = dane.patientLists.map((l) => ({ ...l, name: '​​' }));
        obj.payload = await VC.encryptJson(master, dane);
        return typeof kopia === 'string' ? JSON.stringify(obj) : obj;
      },
    });
    expect(r.podglad.addedPatientListCount).toBe(0);
    expect(r.ekran.przycisk).toBe(null);
    expect(await r.C.v.listPatientLists()).toEqual([]);
    parzystosc(r);
  });

  it('T24 [CZERWONY, K10] szablon ze strony „Notatki” usunięty w kopii: jawne usunięcie (przed zmianą wynik nie miał deletedNoteCount)', async () => {
    const r = await przypadek({
      przed: async (A) => { await A.v.saveNote({ title: 'Szablon do usunięcia', body: 'f', category: 'wlasne' }); },
      po: async (A) => { await chwila(5); const [n] = await A.v.listNotes(); await A.v.removeNote(n.id); },
    });
    expect([r.podglad.deletedNoteCount, r.wynik.deletedNoteCount]).toEqual([1, 1]);
    expect(r.ekran.podsumowanie).toBe('Brak nowych zapisów · usunięte w kopii: 1 szablon w Notatkach (zostaną usunięte także tutaj)');
    expect(r.linie).toEqual(['⊖ Usunięto tak jak w kopii: 1 szablon w Notatkach']);
    expect(await r.C.v.listNotes()).toEqual([]);
    parzystosc(r);
  });

  it('T25 [CZERWONY, awaria sekcji] błąd zapisu notatki w C: notatek 0, ekran nie pisze „już były”', async () => {
    const r = await przypadek({
      po: async (A, { p1 }) => { await notatka(A.v, p1, 'N-awaria (fikcja)'); },
      przedScaleniem: async (C) => { C.baza.putPatientNoteForUser = async () => { throw new Error('wstrzyknięty błąd zapisu (fikcja)'); }; },
    });
    expect(r.podglad.addedPatientNoteCount).toBe(1);
    expect(r.wynik.addedPatientNoteCount).toBe(0);
    expect(r.wynik.accountDataMerged, 'Le połyka błąd sekcji').toBe(true);
    expect(await r.C.v.listAllPatientNotes()).toEqual([]);
    expect(r.linie).toEqual([NIE_SCALONO]);
  });

  it('T25b [awaria całego scalania danych konta] Le rzuca: accountDataMerged false, „Nie scalono…” mimo podglądu bez danych konta', async () => {
    const r = await przypadek({
      przedScaleniem: async (C) => {
        // Pierwszy odczyt kart wołany wprost z Le (na starcie, poza try sekcji) rzuca raz; odczyty kart w ss i w migawce
        // testu działają jak zwykle. Rozpoznanie po ramce stosu „Le”, nie po kolejności odczytów.
        const karty = C.baza.listPatientsForUser.bind(C.baza);
        C.baza.listPatientsForUser = async (...a) => {
          if (!C.wstrzykniety && /\bat Le \(/.test(new Error().stack || '')) { C.wstrzykniety = true; throw new Error('wstrzyknięty błąd (fikcja)'); }
          return karty(...a);
        };
      },
    });
    expect(r.C.wstrzykniety, 'błąd wstrzyknięty w Le').toBe(true);
    expect(r.wynik.accountDataMerged).toBe(false);
    expect(r.linie).toEqual([NIE_SCALONO]);
  });
});

describe('P-KOPIA-DANE-KONTA — uwagi recenzji: listy oczekujących z magazynu, nagłówek karty, reguła rev', () => {
  it('T27 [CZERWONY, recenzja E1] zapis meta konta w sekcji preferencji Le się nie udaje: wynik 0 i „Nie scalono…”, nie „Dodano 1 listę oczekujących”', async () => {
    const r = await przypadek({
      po: async (A) => { await A.v.addWaitlistList('Fikcyjny zabieg E1'); },
      przedScaleniem: async (C) => {
        // Zapis meta, który zmienia wllists, rzuca (np. błąd IndexedDB albo brak miejsca). Le podbija licznik preferencji
        // w wywołaniu zwrotnym Bmk_zmien jeszcze przed zapisem i połyka błąd sekcji: licznik Le 1, a listy nie ma.
        const zapisz = C.baza.putUserMeta.bind(C.baza), czytaj = C.baza.getUserMeta.bind(C.baza);
        const listy = (meta) => JSON.stringify(((meta && meta.userPreferences) || {}).wllists || null);
        C.baza.putUserMeta = async (uid, meta) => {
          if (listy(await czytaj(uid)) !== listy(meta)) throw new Error('wstrzyknięty błąd zapisu meta (fikcja)');
          return zapisz(uid, meta);
        };
      },
    });
    expect(r.podglad.addedWaitlistCount).toBe(1);
    expect(r.ekran.przycisk).toBe('Scal teraz (1 lista)');
    expect(r.wynik.updatedPreferenceCount, 'licznik Le rośnie przed zapisem meta').toBe(1);
    expect(r.wynik.addedWaitlistCount, 'wynik z różnicy magazynu, nie z planu').toBe(0);
    expect(await r.C.v.getWaitlistLists()).toEqual({});
    expect(r.linie).toEqual([NIE_SCALONO]);
  });

  it('T28 [recenzja E3] termin zmieniony w kopii (09:00 → 11:30): „1 zmieniony termin…”, „Zaktualizowano…”, parzystość', async () => {
    const r = await przypadek({
      przed: async (A) => {
        await A.v.addWaitlistList('Fikcyjny zabieg E3');
        await A.v.setWaitlistSchedule('Fikcyjny zabieg E3', { dateISO: '2026-12-01', time: '09:00' });
      },
      po: async (A) => { await chwila(5); await A.v.setWaitlistSchedule('Fikcyjny zabieg E3', { dateISO: '2026-12-01', time: '11:30' }); },
    });
    expect([r.podglad.updatedWaitlistScheduleCount, r.wynik.updatedWaitlistScheduleCount]).toEqual([1, 1]);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz', podsumowanie: 'Brak nowych zapisów · 1 zmieniony termin listy oczekujących' });
    expect(r.linie).toEqual(['✓ Zaktualizowano 1 termin listy oczekujących']);
    expect(Object.values(await r.C.v.getWaitlistSchedules()).map((t) => `${t.dateISO} ${t.time}`)).toEqual(['2026-12-01 11:30']);
    parzystosc(r);
  });

  it('T29 [recenzja] etykieta listy oczekujących zmieniona w kopii (usunięta i dodana ponownie inną pisownią): „1 zmieniona lista oczekujących”', async () => {
    const r = await przypadek({
      przed: async (A) => { await A.v.addWaitlistList('Fikcyjny zabieg L'); },
      po: async (A) => {
        await chwila(5); await A.v.removeWaitlistList('Fikcyjny zabieg L');
        await chwila(5); await A.v.addWaitlistList('FIKCYJNY zabieg L');
      },
    });
    expect([r.podglad.updatedWaitlistCount, r.wynik.updatedWaitlistCount]).toEqual([1, 1]);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 lista)', podsumowanie: 'Brak nowych zapisów · 1 zmieniona lista oczekujących' });
    expect(r.linie).toEqual(['✓ Zaktualizowano 1 listę oczekujących']);
    expect(Object.values(await r.C.v.getWaitlistLists()).map((l) => l.label)).toEqual(['FIKCYJNY zabieg L']);
    parzystosc(r);
  });

  it('T30 [fantom, recenzja E4] ten sam termin zapisany ponownie w kopii (nowszy znacznik, ta sama treść): Le liczy zapis, plan i wynik 0, przycisk ukryty', async () => {
    const r = await przypadek({
      przed: async (A) => {
        await A.v.addWaitlistList('Fikcyjny zabieg E4');
        await A.v.setWaitlistSchedule('Fikcyjny zabieg E4', { dateISO: '2026-12-01', time: '09:00' });
      },
      po: async (A) => { await chwila(5); await A.v.setWaitlistSchedule('Fikcyjny zabieg E4', { dateISO: '2026-12-01', time: '09:00' }); },
    });
    expect(r.wynik.updatedPreferenceCount, 'Le zapisuje nowszy znacznik').toBe(1);
    expect([EKRAN.Bks_daneKonta(r.podglad), EKRAN.Bks_daneKonta(r.wynik)]).toEqual([0, 0]);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: 'Brak nowych danych — wszystko już masz' });
    expect(r.linie).toEqual([JUZ_BYLY]);
    parzystosc(r);
  });

  it('T31 [D-3 A, P-NAGLOWEK-NAJNOWSZEJ] karta, do której dochodzą zapisy z kopii, zostaje przy nagłówku najnowszej wersji — tutejszej, gdy jest nowsza; podtytuł to mówi', async () => {
    let tutaj = null;
    const r = await przypadek({
      po: async (A, { p1 }) => { await A.v.savePatient(zapis('Testowy', 'Adam', [60, 66, 72]), { patientId: p1, dedup: false }); },
      wC: async (C, { p1 }) => {
        await chwila(5);
        await C.v.savePatient(zapis('Poprawiona', 'Ada', [60, 66, 70], { sex: 'K' }), { patientId: p1, dedup: false });
        tutaj = (await C.v.listPatients()).find((k) => k.patientId === p1).header;
      },
    });
    const po = (await r.C.v.listPatients()).find((k) => k.patientId === r.ids.p1).header;
    expect([tutaj.name, tutaj.sex]).toEqual(['Poprawiona Ada', 'K']);
    expect([po.name, po.sex], 'nagłówek z najnowszej wersji (tutejszej), nie ze starszej wersji z kopii').toEqual(['Poprawiona Ada', 'K']);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 nowych zapisów)', podsumowanie: '1 nowych zapisów zostanie dodanych' });
    expect(PODTYTUL).not.toContain('doda tylko');
    expect(PODTYTUL).not.toContain('przejmie z kopii');
    expect(PODTYTUL).toContain('karta weźmie ze swojego najnowszego zapisu — tutejszego albo z kopii.');
    parzystosc(r);
  });

  it('T32 [CZERWONY, recenzja: rev] notatka i lista poprawiane tutaj później, ale częściej w kopii: podgląd mówi, że zastąpi je starsza wersja z kopii; podtytuł nie obiecuje „nowsza zastąpi starszą”', async () => {
    const r = await przypadek({
      przed: async (A, { p1 }) => { await notatka(A.v, p1, 'N-rev (fikcja)'); await A.v.savePatientList({ name: 'Lista rev', memberIds: [p1] }); },
      po: async (A, { p1 }) => {
        for (const tresc of ['A1', 'A2']) {
          const [n] = await A.v.listPatientNotesForPatient(p1); await A.v.savePatientNote({ ...n, body: tresc });
          const [l] = await A.v.listPatientLists(); await A.v.savePatientList({ ...l, name: `Lista rev ${tresc}` });
          await chwila(5);
        }
      },
      wC: async (C, { p1 }) => {
        await chwila(5);
        const [n] = await C.v.listPatientNotesForPatient(p1); await C.v.savePatientNote({ ...n, body: 'C1 późniejsza edycja tutaj (fikcja)' });
        const [l] = await C.v.listPatientLists(); await C.v.savePatientList({ ...l, name: 'Lista rev C1' });
      },
    });
    expect([r.podglad.updatedPatientNoteCount, r.podglad.replacedNewerPatientNoteCount]).toEqual([1, 1]);
    expect([r.podglad.updatedPatientListCount, r.podglad.replacedNewerPatientListCount]).toEqual([1, 1]);
    expect(r.ekran).toEqual({
      przycisk: 'Scal teraz (1 notatka, 1 lista)',
      podsumowanie: 'Brak nowych zapisów · 1 notatka pacjenta poprawiona tutaj później zostanie zastąpiona starszą wersją z kopii'
        + ' · 1 lista pacjentów zmieniona tutaj później zostanie zastąpiona starszą wersją z kopii',
    });
    expect(r.linie).toEqual(['✓ Zaktualizowano 1 notatkę pacjenta, 1 listę pacjentów']);
    expect((await r.C.v.listPatientNotesForPatient(r.ids.p1)).map((n) => n.body), 'reguła rev bez zmian (jak Le)').toEqual(['A2']);
    expect((await r.C.v.listPatientLists()).map((l) => l.name)).toEqual(['Lista rev A2']);
    expect(PODTYTUL).not.toContain('nowsza poprawka z kopii zastąpi starszą');
    expect(PODTYTUL).toContain('wersja z kopii może zastąpić tutejszą, nawet poprawioną tu później');
    parzystosc(r);
  });
  it('T33 [recenzja R4] nagrobek z kopii z tą samą chwilą co ostatnia zmiana tutaj usuwa notatkę (jak Le: nagrobek „nie starszy”), podgląd to zapowiada', async () => {
    const r = await przypadek({
      przed: async (A, { p1 }) => { await notatka(A.v, p1, 'N-remis (fikcja)'); },
      po: async (A, { p1 }) => { await chwila(5); const [n] = await A.v.listPatientNotesForPatient(p1); await A.v.removePatientNote(n.id); },
      przerobKopie: async (A, C, kopia) => {
        // Kopia spreparowana: chwila nagrobka = chwila ostatniej zmiany notatki tutaj (remis rozstrzyga reguła „>=” w Le).
        const [tutaj] = await C.v.listAllPatientNotes();
        const VC = C.win.VildaCrypto;
        const obj = JSON.parse(typeof kopia === 'string' ? kopia : JSON.stringify(kopia));
        const master = await VC.unwrapMasterFromEnvelope(VC.parseEnvelope(kopia), A.haslo);
        const dane = await VC.decryptJson(master, obj.payload.iv, obj.payload.data);
        expect(dane.patientNoteTombstones.map((t) => t.id)).toEqual([tutaj.id]);
        dane.patientNoteTombstones = dane.patientNoteTombstones.map((t) => ({ ...t, deletedAtISO: tutaj.updatedAtISO }));
        obj.payload = await VC.encryptJson(master, dane);
        return typeof kopia === 'string' ? JSON.stringify(obj) : obj;
      },
    });
    expect([r.podglad.deletedPatientNoteCount, r.wynik.deletedPatientNoteCount]).toEqual([1, 1]);
    expect(r.ekran.podsumowanie).toBe('Brak nowych zapisów · usunięte w kopii: 1 notatka pacjenta (zostaną usunięte także tutaj)');
    expect(await r.C.v.listAllPatientNotes()).toEqual([]);
    parzystosc(r);
  });
});

/* Inna karta przeglądarki albo synchronizacja zmienia magazyn W TRAKCIE scalania: wstrzyknięcie przy pierwszym odczycie
   szablonów wołanym wprost z ramki Le (sekcja notatek — już po zapisie preferencji przez Le). Odczyty testu (migawka)
   i podglądu nie mają ramki Le, więc nie wyzwalają zmiany. */
function wTrakcieLe(C, zmiana) {
  const czytaj = C.baza.listNotesForUser.bind(C.baza);
  C.baza.listNotesForUser = async (...a) => {
    if (!C.wstrzykniety && /\bat Le \(/.test(new Error().stack || '')) { C.wstrzykniety = true; await zmiana(); }
    return czytaj(...a);
  };
}
const etykiety = async (v) => Object.values(await v.getWaitlistLists()).map((l) => l.label).sort();

describe('P-KOPIA-DANE-KONTA — uwagi recenzji (runda 2): wyścig list oczekujących, nagrobki tutaj, osoba spoza bazy', () => {
  it('T34 [CZERWONY, recenzja: wyścig] inna karta dodaje listę oczekujących i zmienia termin w trakcie scalania: wynik liczy tylko listę z kopii', async () => {
    const r = await przypadek({
      przed: async (A) => {
        await A.v.addWaitlistList('Fikcyjny zabieg A');
        await A.v.setWaitlistSchedule('Fikcyjny zabieg A', { dateISO: '2026-12-01', time: '09:00' });
      },
      po: async (A, { p1 }) => { await notatka(A.v, p1, 'N-wyscig (fikcja)'); await A.v.addWaitlistList('Fikcyjny zabieg z kopii'); },
      przedScaleniem: async (C) => {
        wTrakcieLe(C, async () => {
          await C.v.addWaitlistList('Fikcyjny zabieg inna karta');
          await C.v.setWaitlistSchedule('Fikcyjny zabieg A', { dateISO: '2026-12-02', time: '08:15' });
        });
      },
    });
    expect(r.C.wstrzykniety, 'zmiana z innej karty w trakcie Le').toBe(true);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 notatka, 1 lista)', podsumowanie: 'Brak nowych zapisów · 1 nowa notatka pacjenta · 1 nowa lista oczekujących' });
    expect([r.wynik.addedWaitlistCount, r.wynik.updatedWaitlistCount, r.wynik.deletedWaitlistCount]).toEqual([1, 0, 0]);
    expect([r.wynik.addedWaitlistScheduleCount, r.wynik.updatedWaitlistScheduleCount, r.wynik.deletedWaitlistScheduleCount]).toEqual([0, 0, 0]);
    expect(r.linie).toEqual(['✓ Dodano 1 notatkę pacjenta, 1 listę oczekujących']);
    // Wyścig naprawdę zaszedł: w magazynie są obie nowe listy i nowa godzina — ekran przypisuje kopii tylko jej listę.
    expect(await etykiety(r.C.v)).toEqual(['Fikcyjny zabieg A', 'Fikcyjny zabieg inna karta', 'Fikcyjny zabieg z kopii']);
    expect(Object.values(await r.C.v.getWaitlistSchedules()).map((t) => `${t.dateISO} ${t.time}`)).toEqual(['2026-12-02 08:15']);
  });

  it('T35 [CZERWONY, recenzja: wyścig] inna karta usuwa listę oczekujących w trakcie scalania: „Usunięto tak jak w kopii” tylko dla listy usuniętej w kopii', async () => {
    const r = await przypadek({
      przed: async (A) => {
        await A.v.addWaitlistList('Fikcyjny zabieg A');
        await A.v.setWaitlistSchedule('Fikcyjny zabieg A', { dateISO: '2026-12-01', time: '09:00' });
        await A.v.addWaitlistList('Fikcyjny zabieg B');
      },
      po: async (A, { p1 }) => { await chwila(5); await notatka(A.v, p1, 'N-wyscig (fikcja)'); await A.v.removeWaitlistList('Fikcyjny zabieg B'); },
      przedScaleniem: async (C) => { wTrakcieLe(C, async () => { await C.v.removeWaitlistList('Fikcyjny zabieg A'); }); },
    });
    expect(r.C.wstrzykniety).toBe(true);
    expect(r.podglad.deletedWaitlistCount).toBe(1);
    expect([r.wynik.deletedWaitlistCount, r.wynik.deletedWaitlistScheduleCount], 'tylko „B” z kopii; „A” i jej termin usunęła inna karta').toEqual([1, 0]);
    expect(r.linie).toEqual(['✓ Dodano 1 notatkę pacjenta', '⊖ Usunięto tak jak w kopii: 1 listę oczekujących']);
    expect(await etykiety(r.C.v), 'obie listy usunięte w magazynie').toEqual([]);
    expect(await etykiety(r.A.v), 'kopia nadal ma listę „A”').toEqual(['Fikcyjny zabieg A']);
  });

  it('T36 [kontrola, recenzja: nagrobki tutaj] notatka, szablon i lista usunięte TUTAJ po synchronizacji, kopia ich nie zmieniała: plan 0, przycisk ukryty, nic nie wraca', async () => {
    const r = await przypadek({
      przed: async (A, { p1 }) => {
        await notatka(A.v, p1, 'N-usun-tutaj (fikcja)');
        await A.v.saveNote({ title: 'Szablon-usun-tutaj', body: 'f', category: 'wlasne' });
        await A.v.savePatientList({ name: 'Lista-usun-tutaj', memberIds: [p1] });
      },
      wC: async (C, { p1 }) => {
        await chwila(5);
        const [n] = await C.v.listPatientNotesForPatient(p1); await C.v.removePatientNote(n.id);
        const [s] = await C.v.listNotes(); await C.v.removeNote(s.id);
        const [l] = await C.v.listPatientLists(); await C.v.deletePatientList(l.id);
      },
    });
    expect([r.przed.nagrobkiNotatek.length, r.przed.nagrobkiSzablonow.length, r.przed.nagrobkiList.length]).toEqual([1, 1, 1]);
    expect([r.podglad.addedPatientNoteCount, r.podglad.restoredPatientNoteCount, r.podglad.addedNoteCount,
      r.podglad.restoredNoteCount, r.podglad.addedPatientListCount, r.podglad.restoredPatientListCount]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: 'Brak nowych danych — wszystko już masz' });
    expect(r.linie).toEqual([JUZ_BYLY]);
    expect([await r.C.v.listAllPatientNotes(), await r.C.v.listNotes(), await r.C.v.listPatientLists()]).toEqual([[], [], []]);
    parzystosc(r);
  });

  it('T37 [kontrola, recenzja: nagrobki pozycji, których tu nie było] notatka, szablon i lista dodane i usunięte w kopii po synchronizacji: 0 usuniętych, przycisk ukryty', async () => {
    const r = await przypadek({
      po: async (A, { p1 }) => {
        await notatka(A.v, p1, 'N-efemeryczna (fikcja)');
        await A.v.saveNote({ title: 'Szablon-efemeryczny', body: 'f', category: 'wlasne' });
        await A.v.savePatientList({ name: 'Lista-efemeryczna', memberIds: [p1] });
        await chwila(5);
        const [n] = await A.v.listPatientNotesForPatient(p1); await A.v.removePatientNote(n.id);
        const [s] = await A.v.listNotes(); await A.v.removeNote(s.id);
        const [l] = await A.v.listPatientLists(); await A.v.deletePatientList(l.id);
      },
    });
    expect([r.podglad.deletedPatientNoteCount, r.podglad.deletedNoteCount, r.podglad.deletedPatientListCount]).toEqual([0, 0, 0]);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: 'Brak nowych danych — wszystko już masz' });
    expect(r.po.nagrobkiNotatek, 'Le dopisuje nagrobki z kopii — to nie jest widoczna zmiana').toHaveLength(1);
    parzystosc(r);
  });

  it('T38 [D-3 A, P-NAGLOWEK-NAJNOWSZEJ] kontakt z kopii nie zastępuje późniejszego tutejszego; podtytuł mówi o kontakcie', async () => {
    let pid = null, tutaj = null;
    const osoba = (contact, patientId) => ({ ...(patientId ? { patientId } : {}), firstName: 'Fikcyjna', lastName: 'Osoba', sex: 'F', birthYear: 2019, contact });
    const r = await przypadek({
      przed: async (A) => { pid = (await A.v.saveExternalPatient(osoba('tel. 000 000 001 (fikcja)'))).patientId; },
      po: async (A) => { await A.v.saveExternalPatient(osoba('tel. 000 000 002 (fikcja, A)', pid)); },
      wC: async (C) => {
        await chwila(5);
        await C.v.saveExternalPatient(osoba('tel. 000 000 003 (fikcja, C później)', pid));
        tutaj = (await C.v.listExternalPatients()).find((k) => k.patientId === pid).header;
      },
    });
    const po = (await r.C.v.listExternalPatients()).find((k) => k.patientId === pid).header;
    expect(tutaj.contact).toBe('tel. 000 000 003 (fikcja, C później)');
    expect(po.contact, 'nagłówek z najnowszej wersji (tutejszej), nie ze starszej wersji z kopii').toBe('tel. 000 000 003 (fikcja, C później)');
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 nowych zapisów)', podsumowanie: '1 nowych zapisów zostanie dodanych' });
    // Lista pól bez „a u osoby spoza bazy także”, bo z najnowszego zapisu idzie też przynależność do bazy (T39).
    expect(PODTYTUL).toContain('dane osoby na liście (imię i nazwisko, płeć, data urodzenia i wiek, rok urodzenia i kontakt)');
    parzystosc(r);
  });
});

/* Uwagi recenzji końcowej (2026-10-14): przynależność do bazy w nagłówku karty; strażniki planu dla starych
   i niepełnych wpisów kopii (bez updatedAtISO, bez patientId) — plan musi je pomijać tak jak Le. */
// Kopia przerobiona (spreparowana): odszyfrowanie ładunku hasłem A, zmiana, ponowne zaszyfrowanie tym samym kluczem.
async function przerob(A, C, kopia, zmien) {
  const VC = C.win.VildaCrypto;
  const obj = JSON.parse(typeof kopia === 'string' ? kopia : JSON.stringify(kopia));
  const master = await VC.unwrapMasterFromEnvelope(VC.parseEnvelope(kopia), A.haslo);
  const dane = await VC.decryptJson(master, obj.payload.iv, obj.payload.data);
  await zmien(dane);
  obj.payload = await VC.encryptJson(master, dane);
  return typeof kopia === 'string' ? JSON.stringify(obj) : obj;
}
const BRAK_NOWYCH = 'Brak nowych danych — wszystko już masz';

describe('P-KOPIA-DANE-KONTA — uwagi recenzji końcowej: przynależność do bazy, stare i niepełne wpisy kopii', () => {
  it('T39 [D-3 A, P-NAGLOWEK-NAJNOWSZEJ] osoba dodana TUTAJ do bazy, kopia niesie jej starszą wersję jako osoby spoza bazy: zostaje w bazie (najnowsza wersja jest tutejsza); podtytuł to mówi', async () => {
    let pid = null, tutaj = null, wersjeTutaj = null;
    const osoba = (contact, patientId) => ({ ...(patientId ? { patientId } : {}), firstName: 'Fikcyjna', lastName: 'Osoba', sex: 'K', birthYear: 2019, contact });
    const r = await przypadek({
      przed: async (A) => { pid = (await A.v.saveExternalPatient(osoba('tel. 000 000 001 (fikcja)'))).patientId; },
      po: async (A) => { await A.v.saveExternalPatient(osoba('tel. 000 000 002 (fikcja, A)', pid)); },
      wC: async (C) => {
        await chwila(5);
        await C.v.promoteExternalToBase(pid, { dobISO: '2019-03-01', sex: 'K', firstName: 'Fikcyjna', lastName: 'Osoba' });
        tutaj = {
          baza: (await C.v.listPatients()).some((k) => k.patientId === pid),
          spoza: (await C.v.listExternalPatients()).some((k) => k.patientId === pid),
          naglowek: (await C.v.listPatients()).find((k) => k.patientId === pid).header,
        };
        wersjeTutaj = (await C.baza.listSnapshotsForUser(C.uid, pid)).map((w) => w.snapshotId);
      },
    });
    expect(tutaj.baza && !tutaj.spoza, 'przed scaleniem: pacjentka z bazy').toBe(true);
    expect([tutaj.naglowek.sex, tutaj.naglowek.dobISO, tutaj.naglowek.external]).toEqual(['K', '2019-03-01', undefined]);
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 nowych zapisów)', podsumowanie: '1 nowych zapisów zostanie dodanych' });
    expect(r.wynik.mergedPatientCount).toBe(1);
    const baza = (await r.C.v.listPatients()).some((k) => k.patientId === pid);
    const spoza = (await r.C.v.listExternalPatients()).find((k) => k.patientId === pid);
    expect(baza, 'po scaleniu nadal na liście pacjentów z bazy').toBe(true);
    expect(spoza, 'nie wraca do osób spoza bazy').toBeFalsy();
    const poNaglowek = (await r.C.v.listPatients()).find((k) => k.patientId === pid).header;
    expect([poNaglowek.external, poNaglowek.sex, poNaglowek.dobISO], 'nagłówek z najnowszej wersji (tutejszej, „Dodaj do bazy”)').toEqual([undefined, 'K', '2019-03-01']);
    const wersjePo = (await r.C.baza.listSnapshotsForUser(r.C.uid, pid)).map((w) => w.snapshotId);
    expect(wersjePo, 'wersja z „Dodaj do bazy” zostaje w historii').toEqual(expect.arrayContaining(wersjeTutaj));
    expect(wersjePo).toHaveLength(wersjeTutaj.length + 1);
    expect(PODTYTUL).toContain('i to, czy osoba jest w bazie, karta weźmie ze swojego najnowszego zapisu');
    expect(PODTYTUL).not.toContain('może wrócić do osób spoza bazy');
    parzystosc(r);
  });

  it('T40 [kontrola, recenzja końcowa E5] stare rekordy bez updatedAtISO (notatka pacjenta, szablon, lista) w prawdziwym eksporcie: plan 0 jak Le, przycisk ukryty', async () => {
    const r = await przypadek({
      po: async (A, { p1 }) => {
        await notatka(A.v, p1, 'N-stara (fikcja)');
        await A.v.saveNote({ title: 'Szablon-stary (fikcja)', body: 'f', category: 'wlasne' });
        await A.v.savePatientList({ name: 'Lista-stara (fikcja)', memberIds: [p1] });
        // Rekordy jak z dawnej wersji aplikacji: bez updatedAtISO (zapis wprost przez adapter).
        const bez = (x) => { const y = { ...x }; delete y.updatedAtISO; return y; };
        for (const x of await A.baza.listPatientNotesForUser(A.uid)) await A.baza.putPatientNoteForUser(A.uid, bez(x));
        for (const x of await A.baza.listNotesForUser(A.uid)) await A.baza.putNoteForUser(A.uid, bez(x));
        for (const x of await A.baza.listPatientListsForUser(A.uid)) await A.baza.putPatientListForUser(A.uid, bez(x));
      },
      przerobKopie: (A, C, kopia) => przerob(A, C, kopia, (d) => {
        // Eksport daje updatedAtISO: null — sprawdzamy, że kopia naprawdę niesie takie rekordy.
        expect([d.patientNotes, d.notes, d.patientLists].map((t) => t.map((x) => x.updatedAtISO))).toEqual([[null], [null], [null]]);
      }),
    });
    expect([r.podglad.addedPatientNoteCount, r.podglad.addedNoteCount, r.podglad.addedPatientListCount]).toEqual([0, 0, 0]);
    expect([r.wynik.addedPatientNoteCount, r.wynik.addedNoteCount, r.wynik.addedPatientListCount], 'Le ich nie zapisuje').toEqual([0, 0, 0]);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: BRAK_NOWYCH });
    expect(r.linie).toEqual([JUZ_BYLY]);
    expect([await r.C.v.listAllPatientNotes(), await r.C.v.listNotes(), await r.C.v.listPatientLists()]).toEqual([[], [], []]);
    parzystosc(r);
  });

  it('T41 [kontrola, recenzja końcowa E2] kopia spreparowana: notatka z pustym albo bez patientId, listy oczekujących i terminy bez updatedAtISO: plan 0 jak Le, przycisk ukryty', async () => {
    const r = await przypadek({
      po: async (A, { p1 }) => {
        await notatka(A.v, p1, 'N-pusty-pacjent (fikcja)');
        await notatka(A.v, p1, 'N-bez-pacjenta (fikcja)');
        await A.v.addWaitlistList('Fikcyjny zabieg bez daty');
        await A.v.setWaitlistSchedule('Fikcyjny zabieg bez daty', { dateISO: '2026-12-01', time: '09:00' });
      },
      przerobKopie: (A, C, kopia) => przerob(A, C, kopia, (d) => {
        d.patientNotes.find((n) => n.title === 'N-pusty-pacjent (fikcja)').patientId = '';
        delete d.patientNotes.find((n) => n.title === 'N-bez-pacjenta (fikcja)').patientId;
        expect(Object.keys(d.userPreferences)).toEqual(expect.arrayContaining(['wllists', 'wlsched']));
        delete d.userPreferences.wllists.updatedAtISO;
        delete d.userPreferences.wlsched.updatedAtISO;
      }),
    });
    expect([r.podglad.addedPatientNoteCount, r.podglad.addedWaitlistCount, r.podglad.addedWaitlistScheduleCount]).toEqual([0, 0, 0]);
    expect([r.wynik.addedPatientNoteCount, r.wynik.addedWaitlistCount, r.wynik.addedWaitlistScheduleCount], 'Le ich nie zapisuje').toEqual([0, 0, 0]);
    expect([r.podglad.updatedPreferenceCount, r.wynik.updatedPreferenceCount]).toEqual([0, 0]);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: BRAK_NOWYCH });
    expect(r.linie).toEqual([JUZ_BYLY]);
    expect([await r.C.v.listAllPatientNotes(), await etykiety(r.C.v)]).toEqual([[], []]);
    parzystosc(r);
  });
});

/* Uwagi recenzji końcowej 2 (2026-10-14) i recenzji zintegrowanej gałęzi 44ba49f7: strażniki planu po stronie
   tutejszych rekordów (G1, G3), pacjent bez nagłówka w spreparowanej kopii (S2), wpisy Terminarza bez pacjenta.
   Od uwagi o Terminarzu parzystosc() sprawdza też część Terminarza w podglądzie (pola ActivityNote…), więc na 44ba49f7
   każdy przypadek z parzystością pada już na braku tych pól (jak opisano wyżej dla audyt 2df41a8); oznaczenia
   [czerwony na 44ba49f7] mówią o pierwszej asercji przypadku, [kontrola] — o zachowaniu sprzed tej uwagi. */
describe('P-KOPIA-DANE-KONTA — strażniki tutejszych rekordów, pacjent bez nagłówka, wpisy Terminarza bez pacjenta', () => {
  it('T42 (G1) [kontrola; czerwony na mutacji Bks_wygrywaData bez „!tutaj.updatedAtISO”] tutejszy szablon bez updatedAtISO, w kopii ten sam poprawiony: plan = Le = magazyn = 1', async () => {
    const r = await przypadek({
      przed: async (A) => { await A.v.saveNote({ title: 'Szablon-wspolny (fikcja)', body: 'f', category: 'wlasne' }); },
      po: async (A) => { const [n] = await A.v.listNotes(); await A.v.saveNote({ ...n, body: 'f poprawione (fikcja)' }); },
      wC: async (C) => {
        // Stary rekord tutaj: bez updatedAtISO (zapis wprost przez adapter, jak z dawnej wersji aplikacji).
        for (const x of await C.baza.listNotesForUser(C.uid)) { const y = { ...x }; delete y.updatedAtISO; await C.baza.putNoteForUser(C.uid, y); }
      },
    });
    expect([r.podglad.updatedNoteCount, r.wynik.updatedNoteCount], 'podgląd, Le').toEqual([1, 1]);
    expect(roznica(r.przed.szablony, r.po.szablony), 'magazyn').toEqual({ dodane: 0, zmienione: 1, usuniete: 0 });
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (1 notatka)', podsumowanie: 'Brak nowych zapisów · 1 poprawiony szablon w Notatkach' });
    expect(r.linie).toEqual(['✓ Zaktualizowano 1 szablon w Notatkach']);
    parzystosc(r);
  });

  it('T43 (G3) [kontrola; czerwony na mutacji Bks_trescWpisu z createdAtISO] ta sama lista oczekujących założona niezależnie tu (wcześniej) i w kopii (później): bez widocznej zmiany, przycisk ukryty', async () => {
    const r = await przypadek({
      po: async (A, ids, C) => { await C.v.addWaitlistList('Fikcyjny zabieg wspólny'); await chwila(10); await A.v.addWaitlistList('Fikcyjny zabieg wspólny'); },
    });
    expect([r.podglad.addedWaitlistCount, r.podglad.updatedWaitlistCount], 'podgląd').toEqual([0, 0]);
    expect([r.wynik.addedWaitlistCount, r.wynik.updatedWaitlistCount], 'wynik').toEqual([0, 0]);
    expect([r.podglad.updatedPreferenceCount, r.wynik.updatedPreferenceCount], 'Le zapisuje nowszy znacznik listy').toEqual([1, 1]);
    expect(r.ekran).toEqual({ przycisk: null, podsumowanie: BRAK_NOWYCH });
    expect(r.linie).toEqual([JUZ_BYLY]);
    parzystosc(r);
  });

  it('T44 (S2) [czerwony na 44ba49f7] kopia spreparowana: pacjentka bez nagłówka, usunięta tutaj, z nową notatką — podgląd mówi to samo co scalanie (oba pomijają pacjenta bez nagłówka)', async () => {
    const r = await przypadek({
      po: async (A, { p2 }) => { await notatka(A.v, p2, 'N-p2 (fikcja)'); },
      wC: async (C, { p2 }) => { await chwila(5); await C.v.removePatient(p2); },
      przerobKopie: (A, C, kopia) => przerob(A, C, kopia, (d) => {
        const p = d.patients.find((x) => x.header && x.header.lastName === 'Fikcyjna');
        delete p.header;
      }),
    });
    expect([r.podglad.addedPatientNoteCount, r.podglad.skippedPatients.length], 'podgląd: notatka, pominięci')
      .toEqual([r.wynik.addedPatientNoteCount, r.wynik.skippedPatients.length]);
    expect(r.podglad.addPatients.concat(r.podglad.mergePatients || []).map((p) => p.name), 'podgląd nie wymienia pacjenta bez nagłówka').not.toContain('(brak nazwy)');
    wersjeBezZmian(r);
    parzystosc(r);
  });

  const AKT = '__vilda_activity__';
  const wpisTerminarza = (v, title, dzien, category = 'absence') => v.savePatientNote({ patientId: v.ACTIVITY_PATIENT_ID, externalName: '', title, category, dueDateISO: `2026-12-${String(dzien).padStart(2, '0')}`, dueTime: null });
  const czescTerminarza = (r) => {
    const tylko = (mapa) => new Map([...mapa].filter(([, w]) => w.endsWith(`|${AKT}`)));
    return roznica(tylko(r.przed.notatkiPacjentow), tylko(r.po.notatkiPacjentow));
  };

  it('T45 [czerwony na 44ba49f7] urlop (5 dni) i szkolenie w Terminarzu tylko w kopii: podgląd i przycisk mówią o wpisach Terminarza bez pacjenta, nie o notatkach pacjentów', async () => {
    const r = await przypadek({
      po: async (A) => {
        expect(A.v.ACTIVITY_PATIENT_ID).toBe(AKT);
        for (let d = 1; d <= 5; d += 1) await wpisTerminarza(A.v, 'Urlop (fikcja)', d);
        await wpisTerminarza(A.v, 'Szkolenie (fikcja)', 10, 'activity');
      },
    });
    expect([r.podglad.addedPatientNoteCount, r.podglad.addedActivityNoteCount], 'część Terminarza w sumie notatek').toEqual([6, 6]);
    expect(czescTerminarza(r), 'magazyn: same wpisy Terminarza').toEqual({ dodane: 6, zmienione: 0, usuniete: 0 });
    expect(r.ekran).toEqual({ przycisk: 'Scal teraz (6 wpisów w Terminarzu)', podsumowanie: 'Brak nowych zapisów · 6 nowych wpisów Terminarza bez pacjenta' });
    expect(r.linie).toEqual(['✓ Dodano 6 notatek pacjentów i wpisów Terminarza']);
    parzystosc(r);
  });

  it('T46 [czerwony na 44ba49f7] notatka pacjenta i wpisy Terminarza razem (nowe, poprawiony, usunięty w kopii): każda część pod własną nazwą, sumy jak Le', async () => {
    const r = await przypadek({
      przed: async (A) => { await wpisTerminarza(A.v, 'Urlop (fikcja)', 1); await wpisTerminarza(A.v, 'Szkolenie (fikcja)', 2, 'activity'); },
      po: async (A, { p1 }) => {
        await notatka(A.v, p1, 'N1 (fikcja)');
        await wpisTerminarza(A.v, 'Urlop (fikcja)', 3);
        await wpisTerminarza(A.v, 'Urlop (fikcja)', 4);
        const wpisy = (await A.v.listAllPatientNotes()).filter((n) => n.patientId === AKT);
        await A.v.savePatientNote({ ...wpisy.find((n) => n.title === 'Szkolenie (fikcja)'), title: 'Szkolenie przeniesione (fikcja)' });
        await A.v.removePatientNote(wpisy.find((n) => n.dueDateISO.startsWith('2026-12-01')).id);
      },
    });
    expect([r.podglad.addedActivityNoteCount, r.podglad.updatedActivityNoteCount, r.podglad.deletedActivityNoteCount]).toEqual([2, 1, 1]);
    expect([r.podglad.addedPatientNoteCount, r.podglad.updatedPatientNoteCount, r.podglad.deletedPatientNoteCount], 'sumy z częścią Terminarza').toEqual([3, 1, 1]);
    expect(czescTerminarza(r), 'magazyn: część Terminarza').toEqual({ dodane: 2, zmienione: 1, usuniete: 1 });
    expect(r.ekran).toEqual({
      przycisk: 'Scal teraz (1 notatka, 3 wpisy w Terminarzu)',
      podsumowanie: 'Brak nowych zapisów · 1 nowa notatka pacjenta · 2 nowe wpisy Terminarza bez pacjenta'
        + ' · 1 poprawiony wpis Terminarza bez pacjenta · usunięte w kopii: 1 wpis Terminarza bez pacjenta (zostaną usunięte także tutaj)',
    });
    expect(r.linie).toEqual([
      '✓ Dodano 3 notatki pacjentów i wpisy Terminarza',
      '✓ Zaktualizowano 1 notatkę pacjenta lub wpis Terminarza',
      '⊖ Usunięto tak jak w kopii: 1 notatkę pacjenta lub wpis Terminarza',
    ]);
    parzystosc(r);
  });

  it('T47 [czerwony na a38f42cf] nowe notatki pacjenta i szkolenie z Terminarza usunięte w kopii: „Dodano” bez „i wpisy Terminarza” (podgląd nie zapowiadał nowych wpisów), łączna nazwa tylko w „Usunięto”', async () => {
    const r = await przypadek({
      przed: async (A) => { await wpisTerminarza(A.v, 'Szkolenie (fikcja)', 2, 'activity'); },
      po: async (A, { p1 }) => {
        const [szkolenie] = (await A.v.listAllPatientNotes()).filter((n) => n.patientId === AKT);
        await A.v.removePatientNote(szkolenie.id);
        await notatka(A.v, p1, 'N1 (fikcja)');
        await notatka(A.v, p1, 'N2 (fikcja)');
      },
    });
    expect([r.podglad.addedActivityNoteCount, r.podglad.updatedActivityNoteCount, r.podglad.deletedActivityNoteCount], 'podgląd: część Terminarza').toEqual([0, 0, 1]);
    expect([r.wynik.addedPatientNoteCount, r.wynik.updatedPatientNoteCount, r.wynik.deletedPatientNoteCount], 'Le: sumy').toEqual([2, 0, 1]);
    expect(czescTerminarza(r), 'magazyn: część Terminarza').toEqual({ dodane: 0, zmienione: 0, usuniete: 1 });
    expect(roznica(r.przed.notatkiPacjentow, r.po.notatkiPacjentow), 'magazyn: wszystkie notatki').toEqual({ dodane: 2, zmienione: 0, usuniete: 1 });
    expect(r.ekran).toEqual({
      przycisk: 'Scal teraz (2 notatki)',
      podsumowanie: 'Brak nowych zapisów · 2 nowe notatki pacjentów · usunięte w kopii: 1 wpis Terminarza bez pacjenta (zostaną usunięte także tutaj)',
    });
    expect(r.linie).toEqual([
      '✓ Dodano 2 notatki pacjentów',
      '⊖ Usunięto tak jak w kopii: 1 notatkę pacjenta lub wpis Terminarza',
    ]);
    parzystosc(r);
  });
});

/* Losowe przebiegi ze stałym ziarnem (recenzja runda 2): operacje na A przed i po synchronizacji, na C po niej (część
   przebiegów bez synchronizacji; w C czasem usunięcie albo scalenie pacjenta), kopia A, podgląd i scalenie w C.
   W każdym: podgląd nie zmienia magazynu i parzystość podgląd = wynik = różnica magazynu. */
function losowa(ziarno) { let s = ziarno >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const OCZEKUJACY = ['Fikcyjny zabieg 1', 'Fikcyjny zabieg 2', 'Fikcyjny zabieg 3'];
async function losoweZmiany(v, los, ids, ile, metka, zTerminarzem = false) {
  const wybierz = (t) => t[Math.floor(los() * t.length)];
  for (let i = 0; i < ile; i += 1) {
    const k = Math.floor(los() * 12);
    const p = los() < 0.5 ? ids.p1 : ids.p2;
    try {
      // zTerminarzem: co druga operacja dotyczy wpisów Terminarza bez pacjenta (nieobecność albo wydarzenie) — nowy wpis,
      // poprawka albo usunięcie; reszta jak w zwykłych przebiegach.
      if (zTerminarzem && los() < 0.5) {
        const wpisy = (await v.listAllPatientNotes()).filter((n) => n.patientId === v.ACTIVITY_PATIENT_ID), x = los();
        if (x < 0.5 || !wpisy.length) {
          await v.savePatientNote({ patientId: v.ACTIVITY_PATIENT_ID, externalName: '', title: `${metka}-T${i} (fikcja)`,
            category: los() < 0.5 ? 'absence' : 'activity', dueDateISO: `2026-12-${String(1 + (i % 28)).padStart(2, '0')}`, dueTime: null });
        } else if (x < 0.8) await v.savePatientNote({ ...wybierz(wpisy), title: `${metka}-T${i} poprawiony (fikcja)` });
        else await v.removePatientNote(wybierz(wpisy).id);
      } else if (k === 0) await notatka(v, p, `${metka}-N${i}`);
      else if (k === 1) { const t = await v.listAllPatientNotes(); if (t.length) await v.savePatientNote({ ...wybierz(t), body: `${metka}-e${i}` }); }
      else if (k === 2) { const t = await v.listAllPatientNotes(); if (t.length) await v.removePatientNote(wybierz(t).id); }
      else if (k === 3) await v.saveNote({ title: `${metka}-S${i}`, body: 'f', category: 'wlasne' });
      else if (k === 4) { const t = await v.listNotes(); if (t.length) await v.saveNote({ ...wybierz(t), body: `${metka}-e${i}` }); }
      else if (k === 5) { const t = await v.listNotes(); if (t.length) await v.removeNote(wybierz(t).id); }
      else if (k === 6) await v.savePatientList({ name: `${metka}-L${i}`, memberIds: [p] });
      else if (k === 7) { const t = await v.listPatientLists(); if (t.length) { const l = wybierz(t); await v.savePatientList({ ...l, name: `${l.name}+` }); } }
      else if (k === 8) { const t = await v.listPatientLists(); if (t.length) await v.deletePatientList(wybierz(t).id); }
      else if (k === 9) await v.addWaitlistList(wybierz(OCZEKUJACY));
      else if (k === 10) await v.removeWaitlistList(wybierz(OCZEKUJACY));
      else await v.setWaitlistSchedule(wybierz(OCZEKUJACY), los() < 0.7 ? { dateISO: `2026-12-0${1 + Math.floor(los() * 8)}`, time: wybierz(['09:00', '11:30']) } : null);
    } catch { /* operacja niedozwolona w tym stanie (np. pacjent usunięty) — przebieg idzie dalej */ }
    await chwila(2);
  }
}
describe('P-KOPIA-DANE-KONTA — losowe przebiegi (stałe ziarna)', () => {
  for (let ziarno = 1; ziarno <= 30; ziarno += 1) {
    it(`ziarno ${ziarno}: podgląd nie zmienia magazynu, podgląd = wynik = różnica magazynu`, async () => {
      const los = losowa(ziarno * 7919);
      const r = await przypadek({
        synchronizuj: los() < 0.85,
        przed: async (A, ids) => { await losoweZmiany(A.v, los, ids, 8, 'A0'); },
        po: async (A, ids) => { await losoweZmiany(A.v, los, ids, 7, 'A'); },
        wC: async (C, ids) => {
          await chwila(3);
          await losoweZmiany(C.v, los, ids, 4, 'C');
          const x = los();
          try {
            if (x < 0.15) await C.v.removePatient(ids.p2);
            else if (x < 0.3) await C.v.mergePatients(ids.p2, ids.p1);
          } catch { /* jw. */ }
        },
      });
      parzystosc(r);
    }, 60000);
  }
});

describe('P-KOPIA-DANE-KONTA — losowe przebiegi z wpisami Terminarza bez pacjenta (stałe ziarna)', () => {
  // Uwaga recenzji gałęzi 44ba49f7: część Terminarza w podglądzie = różnica magazynu (parzystosc), poprawki i usunięcia
  // wpisów na obu urządzeniach.
  for (let ziarno = 1; ziarno <= 12; ziarno += 1) {
    it(`ziarno T${ziarno}: część Terminarza w podglądzie = różnica magazynu, podgląd = wynik`, async () => {
      const los = losowa(ziarno * 104729);
      const r = await przypadek({
        synchronizuj: los() < 0.85,
        przed: async (A, ids) => { await losoweZmiany(A.v, los, ids, 8, 'A0', true); },
        po: async (A, ids) => { await losoweZmiany(A.v, los, ids, 7, 'A', true); },
        wC: async (C, ids) => { await chwila(3); await losoweZmiany(C.v, los, ids, 4, 'C', true); },
      });
      parzystosc(r);
    }, 60000);
  }
});

describe('P-KOPIA-DANE-KONTA — odmiana i źródło', () => {
  it('odmiana form 1 / 2–4 / 5+ i części etykiety (notatki pacjentów i szablony razem, listy pacjentów i oczekujących razem)', () => {
    const m = {
      totalNewSnapshots: 0, addPatients: [], skippedPatients: [],
      addedPatientNoteCount: 2, restoredPatientNoteCount: 0, updatedPatientNoteCount: 5, deletedPatientNoteCount: 22,
      addedNoteCount: 1, addedPatientListCount: 3, addedWaitlistCount: 2, updatedWaitlistScheduleCount: 12,
    };
    expect(EKRAN.Bks_etykietaScal(m)).toBe('Scal teraz (8 notatek, 5 list)');
    expect(EKRAN.Bks_podsumowanie(m)).toBe('Brak nowych zapisów · 2 nowe notatki pacjentów · 5 poprawionych notatek pacjentów'
      + ' · 1 nowy szablon w Notatkach · 3 nowe listy pacjentów · 2 nowe listy oczekujących'
      + ' · 12 zmienionych terminów list oczekujących · usunięte w kopii: 22 notatki pacjentów (zostaną usunięte także tutaj)');
    expect(EKRAN.Bks_linieDanych(m)).toEqual([
      '✓ Dodano 2 notatki pacjentów, 1 szablon w Notatkach, 3 listy pacjentów, 2 listy oczekujących',
      '✓ Zaktualizowano 5 notatek pacjentów, 12 terminów list oczekujących',
      '⊖ Usunięto tak jak w kopii: 22 notatki pacjentów',
    ]);
  });

  it('wpisy Terminarza bez pacjenta (część notatek pacjentów): odmiana w etykiecie, podsumowaniu i liniach wyniku (1 / 2–4 / 5+ / 12–14 / 22)', () => {
    const baza = { totalNewSnapshots: 0, addPatients: [], skippedPatients: [] };
    const m1 = { ...baza, addedPatientNoteCount: 1, addedActivityNoteCount: 1 };
    expect(EKRAN.Bks_etykietaScal(m1)).toBe('Scal teraz (1 wpis w Terminarzu)');
    expect(EKRAN.Bks_podsumowanie(m1)).toBe('Brak nowych zapisów · 1 nowy wpis Terminarza bez pacjenta');
    expect(EKRAN.Bks_linieDanych({ addedPatientNoteCount: 1 }, m1)).toEqual(['✓ Dodano 1 notatkę pacjenta lub wpis Terminarza']);
    const m2 = { ...baza, updatedPatientNoteCount: 2, updatedActivityNoteCount: 2 };
    expect(EKRAN.Bks_etykietaScal(m2)).toBe('Scal teraz (2 wpisy w Terminarzu)');
    expect(EKRAN.Bks_podsumowanie(m2)).toBe('Brak nowych zapisów · 2 poprawione wpisy Terminarza bez pacjenta');
    expect(EKRAN.Bks_linieDanych({ updatedPatientNoteCount: 2 }, m2)).toEqual(['✓ Zaktualizowano 2 notatki pacjentów i wpisy Terminarza']);
    const m12 = { ...baza, addedPatientNoteCount: 12, addedActivityNoteCount: 12 };
    expect(EKRAN.Bks_etykietaScal(m12)).toBe('Scal teraz (12 wpisów w Terminarzu)');
    expect(EKRAN.Bks_podsumowanie(m12)).toBe('Brak nowych zapisów · 12 nowych wpisów Terminarza bez pacjenta');
    // Wszystkie pięć pól: część Terminarza odjęta od notatek pacjentów w każdym z nich.
    const m = {
      ...baza,
      addedPatientNoteCount: 25, addedActivityNoteCount: 22, restoredPatientNoteCount: 2, restoredActivityNoteCount: 2,
      updatedPatientNoteCount: 14, updatedActivityNoteCount: 12, replacedNewerPatientNoteCount: 3, replacedNewerActivityNoteCount: 2,
      deletedPatientNoteCount: 4, deletedActivityNoteCount: 3, addedNoteCount: 1,
    };
    expect(EKRAN.Bks_etykietaScal(m)).toBe('Scal teraz (6 notatek, 34 wpisy w Terminarzu)');
    expect(EKRAN.Bks_podsumowanie(m)).toBe('Brak nowych zapisów · 3 nowe notatki pacjentów · 1 poprawiona notatka pacjenta'
      + ' · 1 notatka pacjenta poprawiona tutaj później zostanie zastąpiona starszą wersją z kopii'
      + ' · 20 nowych wpisów Terminarza bez pacjenta · 10 poprawionych wpisów Terminarza bez pacjenta'
      + ' · 2 wpisy Terminarza bez pacjenta poprawione tutaj później zostaną zastąpione starszymi wersjami z kopii'
      + ' · 2 przywrócone wpisy Terminarza bez pacjenta (usunięte tutaj wcześniej) · 1 nowy szablon w Notatkach'
      + ' · usunięte w kopii: 1 notatka pacjenta, 3 wpisy Terminarza bez pacjenta (zostaną usunięte także tutaj)');
    const w = { addedPatientNoteCount: 25, updatedPatientNoteCount: 14, deletedPatientNoteCount: 4, addedNoteCount: 1 };
    expect(EKRAN.Bks_linieDanych(w, m)).toEqual([
      '✓ Dodano 25 notatek pacjentów i wpisów Terminarza, 1 szablon w Notatkach',
      '✓ Zaktualizowano 14 notatek pacjentów i wpisów Terminarza',
      '⊖ Usunięto tak jak w kopii: 4 notatki pacjentów i wpisy Terminarza',
    ]);
    // Podgląd bez wpisów Terminarza (albo bez podglądu): teksty jak dotąd.
    const bez = ['✓ Dodano 25 notatek pacjentów, 1 szablon w Notatkach', '✓ Zaktualizowano 14 notatek pacjentów', '⊖ Usunięto tak jak w kopii: 4 notatki pacjentów'];
    expect(EKRAN.Bks_linieDanych(w, { ...baza, addedPatientNoteCount: 25 })).toEqual(bez);
    expect(EKRAN.Bks_linieDanych(w)).toEqual(bez);
    expect(EKRAN.Bks_daneKonta(m), 'suma danych konta bez podwójnego liczenia części Terminarza').toBe(25 + 14 + 4 + 1);
  });

  it('łączna nazwa „notatki pacjentów i wpisy Terminarza” osobno w każdej linii wyniku: tylko tam, gdzie podgląd zapowiadał wpisy Terminarza tego rodzaju', () => {
    const baza = { totalNewSnapshots: 0, addPatients: [], skippedPatients: [] };
    const w = { addedPatientNoteCount: 3, updatedPatientNoteCount: 2, deletedPatientNoteCount: 5 };
    const linie = (pola) => EKRAN.Bks_linieDanych(w, { ...baza, addedPatientNoteCount: 3, updatedPatientNoteCount: 2, deletedPatientNoteCount: 5, ...pola });
    expect(linie({ addedActivityNoteCount: 1 }), 'tylko nowe wpisy Terminarza').toEqual([
      '✓ Dodano 3 notatki pacjentów i wpisy Terminarza',
      '✓ Zaktualizowano 2 notatki pacjentów',
      '⊖ Usunięto tak jak w kopii: 5 notatek pacjentów',
    ]);
    expect(linie({ updatedActivityNoteCount: 1 }), 'tylko poprawione wpisy Terminarza').toEqual([
      '✓ Dodano 3 notatki pacjentów',
      '✓ Zaktualizowano 2 notatki pacjentów i wpisy Terminarza',
      '⊖ Usunięto tak jak w kopii: 5 notatek pacjentów',
    ]);
    expect(linie({ deletedActivityNoteCount: 1 }), 'tylko usunięte wpisy Terminarza').toEqual([
      '✓ Dodano 3 notatki pacjentów',
      '✓ Zaktualizowano 2 notatki pacjentów',
      '⊖ Usunięto tak jak w kopii: 5 notatek pacjentów i wpisów Terminarza',
    ]);
  });

  it('odmiana części o pozycjach poprawionych tutaj później, które zastąpi starsza wersja z kopii (część „poprawionych”)', () => {
    const m = {
      totalNewSnapshots: 0, addPatients: [], skippedPatients: [],
      updatedPatientNoteCount: 7, replacedNewerPatientNoteCount: 5, updatedPatientListCount: 2, replacedNewerPatientListCount: 2,
    };
    expect(EKRAN.Bks_etykietaScal(m)).toBe('Scal teraz (7 notatek, 2 listy)');
    expect(EKRAN.Bks_podsumowanie(m)).toBe('Brak nowych zapisów · 2 poprawione notatki pacjentów'
      + ' · 5 notatek pacjentów poprawionych tutaj później zostanie zastąpionych starszymi wersjami z kopii'
      + ' · 2 listy pacjentów zmienione tutaj później zostaną zastąpione starszymi wersjami z kopii');
    expect(EKRAN.Bks_linieDanych(m)).toEqual(['✓ Zaktualizowano 7 notatek pacjentów, 2 listy pacjentów']);
  });

  it('podgląd liczy plan po pętli pacjentów i nie woła Le; scalanie czyta listy oczekujących tuż przed Le i po Le, nowe pola wyniku za dotychczasowymi', () => {
    const src = readFileSync(path.join(korzen, 'vilda_vault.js'), 'utf8');
    const os = src.slice(src.indexOf('async function os('), src.indexOf('async function ss('));
    const ss = src.slice(src.indexOf('async function ss('), src.indexOf('async function Hr('));
    expect(os).toContain('}const Bks_plan=await Bks_planDanych(Bks_k,s),p=d.reduce(');
    expect(os).not.toMatch(/\bLe\(/);
    expect(os).toContain('foreignSnapshotCount:Bks_k.obceId.size,...Bks_plan}');
    // Uwaga recenzji (E1): listy oczekujących i terminy w wyniku z różnicy magazynu przed Le i po Le, nie z planu.
    expect(ss).toContain('const Bks_mp=await Bks_mapyOczekujacych();let h=null;try{h=await Le(');
    expect(ss).not.toContain('Bks_planDanych');
    // Uwaga recenzji (wyścig, runda 2): wynik dostaje ładunek kopii, by liczyć tylko zmiany list oczekujących z kopii.
    expect(ss).toContain('foreignSnapshotCount:Bks_k.obceId.size,...Bks_wynikDanych(h,Bks_mp,await Bks_mapyOczekujacych(),a)}');
    expect(ss, 'mergedPatientCount tylko dla kart z nowymi wersjami').toContain('lastSavedAtISO:tt||l})));y++}}else{');
    // Plan i wynik tylko czytają: żadnego put/remove w czytelnym bloku planu, odczytu map i wyniku.
    const plan = src.slice(src.indexOf('function Bks_najnowsza('), src.indexOf('async function Bsl_zdejmijNagrobek('));
    expect(plan).toContain('function Bks_wynikDanych(');
    expect(plan).not.toMatch(/\.(put|remove)[A-Za-z]*ForUser\(/);
    expect(plan).not.toMatch(/Bmk_zmien|\bLe\(/);
  });

  it('ekran woła pomocniki w uo: przycisk, podsumowanie, linie wyniku z podglądem zachowanym w zmiennej zewnętrznej', () => {
    const uo = ui.slice(ui.indexOf('function uo(t,a){'), ui.indexOf('function Re(){', ui.indexOf('function uo(t,a){')));
    expect(uo).toContain('let Bks_pg=null;');
    expect(uo).toContain('const m=await n.previewVaultBackupMerge(t,d.value);Bks_pg=m;');
    expect(uo).toContain('text:Bks_podsumowanie(m)})),s.style.display="block",Bks_pokazScal(u,m)}');
    expect(uo).toContain('Bks_linieDanych(m,Bks_pg).concat(Bks_linie(m),Bks_koniecWyniku(m,Bks_pg)).forEach(');
    // Podtytuł: nie obiecuje już „bez usuwania ani nadpisywania”, „doda tylko” ani „nowsza poprawka z kopii zastąpi
    // starszą” (uwagi recenzji: nagłówek karty, reguła rev) i wymienia cały nagłówek, także kontakt osoby spoza bazy
    // (runda 2) i przynależność do bazy (recenzja końcowa, T39); zdanie o pominiętych pacjentach bez zmian.
    expect(uo).not.toContain('bez usuwania ani nadpisywania');
    expect(PODTYTUL).toBe('Podaj hasło do tej kopii. Aplikacja doda zapisy i pacjentów, których tu brakuje; dane osoby na liście'
      + ' (imię i nazwisko, płeć, data urodzenia i wiek, rok urodzenia i kontakt) i to, czy osoba jest w bazie, karta weźmie'
      + ' ze swojego najnowszego zapisu — tutejszego albo z kopii. Notatki i listy scali jak synchronizacja:'
      + ' wersja z kopii może zastąpić tutejszą, nawet poprawioną tu później, a późniejsze usunięcie w kopii usunie je także'
      + ' tutaj — podgląd wymieni każdą taką zmianę. Nie przywraca pacjentów scalonych z inną kartą ani usuniętych po ich'
      + ' ostatnim zapisie w kopii.');
    expect(uo).toContain('Nie przywraca pacjent\\u00F3w scalonych z inn\\u0105 kart\\u0105 ani usuni\\u0119tych po ich ostatnim zapisie w kopii.');
  });
});
