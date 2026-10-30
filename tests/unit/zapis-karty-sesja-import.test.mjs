// P-SESJA-ZAPISU (przegląd 4) — import karty z pliku i „Scal z istniejącym” osoby spoza bazy kończą się w sesji,
// w której ruszyły.
//
// importPatientFromEnvelope (import pliku .wiw karty, także w pętli „Importuj”) odszyfrowuje plik, czeka na blokadę
// karty (`vilda-save-pat:<id>`, np. trzymaną przez okno konfliktu w innej karcie przeglądarki), pod nią zapisuje wersje,
// rekord karty i zdejmuje nagrobek karty, a po niej zdejmuje nagrobki notatek z pliku i scala notatki. Sesja to konto
// i klucz z chwili wejścia do importu; ponowne zalogowanie tego samego konta to inna sesja. mergeExternalIntoPatient
// („Scal z istniejącym” na ekranie „Dodaj do bazy”, „Scal w pacjenta z bazy”) czyta osobę spoza bazy i kartę docelową,
// przenosi notatki (czeka na blokadę każdej notatki), zmienia listy i usuwa osobę spoza bazy pod blokadą jej karty.
// Gdy w czasie czekania albo między krokami sejf zostanie zablokowany albo zaloguje się inne konto: SESSION_CHANGED
// („Zapis przerwany”), po zmianie sesji żadnego wywołania magazynu (także odczytu), żądania blokady, szyfrowania ani
// powiadomienia; konto bieżące bez zmian. Ten sam kod daje limit czekania na blokadę karty, który mija po zmianie sesji.
// W jednej sesji wyniki bez zmian: błąd zapisu w tej samej sesji zostaje tym błędem, a błąd w kroku notatek importu
// (zdjęcie nagrobka notatki, odczyt w scaleniu notatek) jak dotąd nie przerywa importu.
//
// Prawdziwe vilda_crypto.js, vilda_retention.js i vilda_vault.js na wspólnej uprzęży ./sesja-zapisu-uprzaz.mjs (konto
// A zalogowane, konto B zablokowane, jeden magazyn w pamięci z rejestrem, atrapa Web Locks, crypto.subtle z rejestrem,
// timery okna). Haki rozpoznają miejsce po metodzie, koncie, nazwach funkcji sejfu w stosie i kolejności. Czekanie
// wyłącznie na zdarzenia i obietnice. Dane wyłącznie FIKCYJNE („Testowy Jan”, „Notatka … (fikcyjna)”).
//
// Przypadki:
//   IM1       import czeka na blokadę karty; przełączenie B, ponowne zalogowanie A albo sama blokada; potem blokada
//             zwolniona.
//   IM1-limit limit czekania importu na blokadę karty mija po zmianie sesji (B, ponowne zalogowanie A albo sama
//             blokada) — SESSION_CHANGED, nie „zajęta”.
//   IM2       import karty usuniętej wcześniej w A (dwie wersje, dwie notatki): zalogowanie B po odszyfrowaniu pliku,
//             po zaszyfrowaniu nagłówka z pliku (przed blokadą), pod blokadą po odczycie karty, po zaszyfrowaniu
//             i zapisie wersji, po zaszyfrowaniu nagłówka karty, po zapisie rekordu i po zdjęciu nagrobka karty, po
//             zdjęciu nagrobka pierwszej i ostatniej notatki, po odczycie notatek przed ich scaleniem; import do
//             istniejącej karty (wersja z pliku, której karta nie ma): po odczycie rekordu karty i listy wersji.
//   IM2-war   wszystkie punkty IM2 (IP1–IP15) — ponowne zalogowanie A i sama blokada.
//   IM3       import pliku karty bez notatek (dwie wersje; karta usunięta w A albo istniejąca z jedną wersją):
//             zalogowanie B od zaszyfrowania nagłówka z pliku do zapisu rekordu karty (IP3–IP9; import do istniejącej
//             karty: IP14, IP15) i w czasie czekania na blokadę karty (B, A, blokada).
//   ME1       „Scal z istniejącym” czeka na blokadę notatki osoby spoza bazy (inna karta przeglądarki); B, A, blokada.
//   ME2       „Scal z istniejącym” czeka na blokadę karty osoby spoza bazy przy jej usunięciu; B, A, blokada.
//   ME2-limit limit czekania na blokadę karty osoby spoza bazy mija po zmianie sesji (B, A, blokada) —
//             SESSION_CHANGED.
//   ME3       zalogowanie B, ponowne zalogowanie A albo sama blokada po odczycie osoby spoza bazy i karty docelowej, po
//             odczycie notatek, po przeniesieniu pierwszej notatki, po odczycie list, po zmianie listy (przed usunięciem
//             osoby spoza bazy), w usunięciu (po usunięciu rekordu, po zapisie nagrobka).
//   K-IM, K-ME  kontrole w jednej sesji: te same haki bez przełączenia, czekanie na blokadę bez zmiany sesji, limit
//             czekania (vildaSaveBusy), błąd magazynu w tej samej sesji — wyniki jak dotąd. K-IM także: import pliku
//             karty bez notatek; błąd zdjęcia nagrobka notatki (import kończy się powodzeniem, notatki z pliku wracają)
//             i błąd odczytu w scaleniu notatek (powodzenie, importedPatientNotes 0).
//
// Czerwone na kodzie bez poprawki przeglądu 4 i na audycie sprzed zmiany (sprawdzone na c209fa6b): IM1, IM1-limit, IM2, IM2-war,
// IM3, ME1, ME2, ME2-limit, ME3. Zielone wszędzie: K-IM, K-ME.
import { afterEach, describe, expect, it } from 'vitest';
import { HASLO_A, naglowek, sprzatnij, urzadzenie, wynik } from './sesja-zapisu-uprzaz.mjs';

afterEach(() => sprzatnij());

const kolejnaTura = () => new Promise((r) => { setImmediate(r); });
const blokadaKarty = (patientId) => `vilda-save-pat:${patientId}`;
const blokadaNotatki = (id) => `vilda-note-${id}`;

function przerwany(r) {
  expect(r.ok, `operacja po zmianie sesji nie kończy się powodzeniem (${r.ok ? JSON.stringify(r.w) : ''})`).toBe(false);
  expect(r.kod, `operacja kończy się w sesji, w której ruszyła (komunikat: ${r.komunikat})`).toBe('SESSION_CHANGED');
  expect(r.komunikat).toMatch(/Zapis przerwany/);
}

// Po zmianie sesji: żadnego wywołania magazynu (także odczytu i bez konta), żądania blokady, szyfrowania, pytania okna,
// powiadomienia i utrwalenia części sesyjnej; `bezKrypto` — żadnej operacji crypto.subtle.
async function nicPoZmianie(d, z, { bezKrypto = false } = {}) {
  await kolejnaTura();
  const po = d.po(z);
  expect(po.wywKto, 'po zmianie sesji żadnego wywołania magazynu').toEqual([]);
  expect(po.bezKonta, 'po zmianie sesji żadnego wywołania magazynu bez konta').toEqual([]);
  expect(po.locks, 'po zmianie sesji żadnego żądania blokady').toEqual([]);
  expect(po.krypto.filter((m) => m === 'encrypt'), 'po zmianie sesji żadnego szyfrowania').toEqual([]);
  if (bezKrypto) expect(po.krypto, 'po zmianie sesji żadnej operacji crypto.subtle').toEqual([]);
  expect(po.pytania, 'po zmianie sesji żadnego pytania okna').toEqual([]);
  expect(po.zdarzenia.map((e) => `${e.typ}(${e.sesja})`), 'po zmianie sesji żadnego powiadomienia').toEqual([]);
  expect(d.zapisySesyjne(z), 'po zmianie sesji żadnego utrwalenia części sesyjnej').toBe(0);
}

async function stanB(d) {
  return { trwaly: await d.trwaly('B'), nagrobkiNotatek: (await d.baza.listPatientNoteTombstonesForUser(d.B.userId)).length };
}

// ── Import karty z pliku ─────────────────────────────────────────────────────────────────────────────────────────────
// Karta „Testowy Jan41” (dwie wersje, dwie notatki) wyeksportowana do pliku, potem usunięta w A („Usuń pacjenta”:
// nagrobek karty i nagrobki notatek). Import pliku przywraca kartę: dwie wersje, rekord, zdjęcie nagrobka karty
// i nagrobków notatek, notatki. `bezNotatek` — karta „Testowy Jan46” bez notatek (plik karty bez notatek).
async function importPoUsunieciu(d, { bezNotatek = false } = {}) {
  const nr = bezNotatek ? 46 : 41;
  const p = await d.v.savePatient(naglowek(nr, { pomiary: [[60, 110]] }), { dedup: false });
  await d.v.savePatient(naglowek(nr, { pomiary: [[60, 110], [66, 113]] }), { patientId: p.patientId, dedup: false });
  for (const i of bezNotatek ? [] : [1, 2]) {
    await d.v.savePatientNote({ patientId: p.patientId, title: `Notatka importu ${i} (fikcyjna)`, body: `Treść fikcyjna ${i}`, category: 'wynik-badania' });
  }
  const plik = await d.v.exportPatientEnvelope(p.patientId);
  await d.v.removePatient(p.patientId);
  expect(await d.kartaTrwala('A', p.patientId), 'kontrola: karta usunięta w A').toMatchObject({ jest: false });
  return { pid: p.patientId, uruchom: (op) => d.v.importPatientFromEnvelope(plik, HASLO_A, op) };
}
// Karta „Testowy Jan45” z dwiema wersjami w pliku; w A została tylko pierwsza (druga usunięta lokalnie) — import
// dopisuje drugą do istniejącej karty. `bezNotatek` — karta „Testowy Jan47” bez notatki.
async function importDoIstniejacej(d, { bezNotatek = false } = {}) {
  const nr = bezNotatek ? 47 : 45;
  const p = await d.v.savePatient(naglowek(nr, { pomiary: [[60, 110]] }), { dedup: false });
  const p2 = await d.v.savePatient(naglowek(nr, { pomiary: [[60, 110], [66, 113]] }), { patientId: p.patientId, dedup: false });
  if (!bezNotatek) await d.v.savePatientNote({ patientId: p.patientId, title: 'Notatka importu (fikcyjna)', body: 'Treść fikcyjna', category: 'wynik-badania' });
  const plik = await d.v.exportPatientEnvelope(p.patientId);
  await d.v.deleteSnapshot(p.patientId, p2.snapshotId);
  expect(await d.kartaTrwala('A', p.patientId), 'kontrola: w A jedna wersja').toEqual({ jest: true, wersje: 1 });
  return { pid: p.patientId, uruchom: (op) => d.v.importPatientFromEnvelope(plik, HASLO_A, op) };
}

// Funkcje API sejfu są w stosie jako „Object.ns [as importPatientFromEnvelope]”.
const W_NS = /\bns \[as importPatientFromEnvelope\]/;
const W_KN = /\bat (async )?Kn \(/;
const PUNKTY_IMPORTU = [
  { id: 'IP1', opis: 'po odszyfrowaniu nagłówka pliku kluczem sesji (przed odszyfrowaniem treści)', rodzaj: 'krypto', dop: { metoda: 'decrypt', wStosie: W_KN }, bezKrypto: true },
  { id: 'IP2', opis: 'po odszyfrowaniu treści pliku (przed odczytem karty)', rodzaj: 'krypto', dop: { metoda: 'decrypt', wStosie: W_NS, bezStosu: W_KN, ktory: 2 } },
  { id: 'IP3', opis: 'po zaszyfrowaniu nagłówka z pliku (przed blokadą karty)', rodzaj: 'krypto', dop: { metoda: 'encrypt', ktory: 1 } },
  { id: 'IP4', opis: 'pod blokadą karty: po odczycie rekordu karty', dop: { metoda: 'getPatientForUser', konto: 'A', ktory: 2 }, bezKrypto: true },
  { id: 'IP5', opis: 'po zaszyfrowaniu pierwszej wersji z pliku', rodzaj: 'krypto', dop: { metoda: 'encrypt', ktory: 2 } },
  { id: 'IP6', opis: 'po zapisie pierwszej wersji (przed drugą)', dop: { metoda: 'putSnapshotForUser', konto: 'A', ktory: 1 }, bezKrypto: true },
  { id: 'IP7', opis: 'po zapisie ostatniej wersji (przed wersjami z kosza i nagłówkiem karty)', dop: { metoda: 'putSnapshotForUser', konto: 'A', ktory: 2 }, bezKrypto: true },
  { id: 'IP8', opis: 'po zaszyfrowaniu nagłówka karty (przed zapisem rekordu)', rodzaj: 'krypto', dop: { metoda: 'encrypt', wStosie: /\bat (async )?Bng_zPliku \(/ }, bezKrypto: true },
  { id: 'IP9', opis: 'po zapisie rekordu karty (przed zdjęciem nagrobka karty)', dop: { metoda: 'putPatientForUser', konto: 'A' }, bezKrypto: true },
  { id: 'IP10', opis: 'po zdjęciu nagrobka karty (przed nagrobkami notatek)', dop: { metoda: 'removeTombstoneForUser', konto: 'A' }, bezKrypto: true },
  { id: 'IP11', opis: 'po zdjęciu nagrobka pierwszej notatki (przed drugim)', dop: { metoda: 'removePatientNoteTombstoneForUser', konto: 'A', ktory: 1 }, bezKrypto: true },
  { id: 'IP12', opis: 'po zdjęciu nagrobka ostatniej notatki (przed odczytem notatek)', dop: { metoda: 'removePatientNoteTombstoneForUser', konto: 'A', ktory: 2 }, bezKrypto: true },
  { id: 'IP13', opis: 'po odczycie ostatniej notatki w przywróceniu (przed scaleniem notatek)', dop: { metoda: 'getPatientNoteForUser', konto: 'A', ktory: 2 }, bezKrypto: true },
  { id: 'IP14', opis: 'import do istniejącej karty: po odczycie listy wersji karty (przed zaszyfrowaniem wersji z pliku)', dop: { metoda: 'listSnapshotsForUser', konto: 'A' }, bezKrypto: true, istniejaca: true },
  { id: 'IP15', opis: 'import do istniejącej karty: pod blokadą karty po odczycie rekordu karty (przed odczytem listy wersji)', dop: { metoda: 'getPatientForUser', konto: 'A', ktory: 2 }, bezKrypto: true, istniejaca: true },
];
const hakPunktu = (d, p, wariant) => (p.rodzaj === 'krypto' ? d.przelaczWKrypto(p.dop, wariant) : d.przelaczPo(p.dop, wariant));
const hakBezPrzelaczenia = (d, p) => (p.rodzaj === 'krypto' ? d.krypto.po(p.dop, () => {}) : d.magazyn.po(p.dop, () => {}));
// Import pliku karty bez notatek (IM3): punkty od zaszyfrowania nagłówka z pliku do zapisu rekordu karty. Bez notatek
// po blokadzie karty nie ma już sprawdzenia sesji przed krokami notatek, więc przerwanie pod blokadą samo musi dać
// SESSION_CHANGED. Po zdjęciu nagrobka karty (IP10) import pliku bez notatek jest już zakończony w A.
const PUNKTY_BEZ_NOTATEK = PUNKTY_IMPORTU.filter((p) => ['IP3', 'IP4', 'IP5', 'IP6', 'IP7', 'IP8', 'IP9', 'IP14', 'IP15'].includes(p.id));

describe('P-SESJA-ZAPISU (przegląd 4): import karty z pliku kończy się w sesji, w której ruszył', () => {
  it.each(['B', 'A', 'blokada'])('IM1: import czeka na blokadę karty; przełączenie „%s” — SESSION_CHANGED, bez wywołań magazynu, konto bieżące bez zmian', async (wariant) => {
    const d = await urzadzenie();
    const s = await importPoUsunieciu(d);
    const przedA = await d.trwaly('A');
    const przedB = await stanB(d);
    const nazwa = blokadaKarty(s.pid);
    const inna = await d.locks.trzymaj(nazwa);
    let czekal = 0;
    const imp = wynik(s.uruchom({ onLockWait() { czekal += 1; } }));
    await d.locks.czekajNaKolejke(nazwa);
    expect(czekal, 'import czeka na blokadę karty').toBe(1);

    const z = await d.przelacz(wariant);
    await inna.zwolnij();
    const r = await imp;

    przerwany(r);
    expect(d.locks.zajeta(nazwa), 'blokada karty wolna po odrzuceniu').toBe(false);
    await nicPoZmianie(d, z, { bezKrypto: true });
    expect(await stanB(d), 'konto B bez zmian (karty, wersje, nagrobki, notatki, listy)').toEqual(przedB);
    expect(await d.baza.listPatientsForUser(d.B.userId), 'lista kart konta B pusta').toEqual([]);
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });

  it.each(['B', 'A', 'blokada'])('IM1-limit: limit czekania importu na blokadę karty mija po przełączeniu „%s” — SESSION_CHANGED zamiast „zajęta w innej karcie”', async (wariant) => {
    const d = await urzadzenie();
    const s = await importPoUsunieciu(d);
    const przedA = await d.trwaly('A');
    const nazwa = blokadaKarty(s.pid);
    await d.locks.trzymaj(nazwa); // inna karta trzyma blokadę do końca testu
    const imp = wynik(s.uruchom({ lockTimeoutMs: 150, onLockWait() {} }));
    await d.locks.czekajNaKolejke(nazwa);
    const limit = await d.timery.czekajNa((t) => t.ms === 150);

    const z = await d.przelacz(wariant);
    d.timery.odpal((t) => t.id === limit.id);
    const r = await imp;

    przerwany(r);
    expect(r.e.vildaSaveBusy, 'odrzucenie ze zmiany sesji, nie z zajętej blokady').toBeFalsy();
    await nicPoZmianie(d, z, { bezKrypto: true });
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, wersje: 0, notatki: 0 });
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });

  it.each(PUNKTY_IMPORTU.map((p) => [p.id, p.opis, p]))('IM2: import %s — przełączenie na B %s kończy import SESSION_CHANGED, bez wywołań magazynu w B', async (_id, _opis, p) => {
    const d = await urzadzenie();
    const s = p.istniejaca ? await importDoIstniejacej(d) : await importPoUsunieciu(d);
    const przedB = await stanB(d);
    const hak = hakPunktu(d, p, 'B');

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `import doszedł do punktu ${p.id}`).toBe(true);
    const z = await hak.gotowe;

    przerwany(r);
    await nicPoZmianie(d, z, { bezKrypto: p.bezKrypto });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await stanB(d), 'konto B bez zmian (karty, wersje, nagrobki, notatki, listy)').toEqual(przedB);
    expect(await d.baza.listPatientsForUser(d.B.userId), 'lista kart konta B pusta').toEqual([]);
    expect((await d.v.listPatients()).map((x) => x.patientId), 'lista pacjentów sesji B bez karty z pliku').not.toContain(s.pid);
  });

  it.each(PUNKTY_IMPORTU.flatMap((p) => ['A', 'blokada'].map((w) => [p.id, w, p.opis, p])))('IM2-war: import %s — przełączenie „%s” %s kończy import SESSION_CHANGED, bez wywołań magazynu (także bez konta)', async (_id, wariant, _opis, p) => {
    const d = await urzadzenie();
    const s = p.istniejaca ? await importDoIstniejacej(d) : await importPoUsunieciu(d);
    const przedB = await stanB(d);
    const hak = hakPunktu(d, p, wariant);

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `import doszedł do punktu ${p.id}`).toBe(true);
    const z = await hak.gotowe;

    przerwany(r);
    await nicPoZmianie(d, z, { bezKrypto: p.bezKrypto });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await stanB(d), 'konto B bez zmian').toEqual(przedB);
  });

  it.each(PUNKTY_BEZ_NOTATEK.map((p) => [p.id, p.opis, p]))('IM3: import pliku karty bez notatek %s — przełączenie na B %s kończy import SESSION_CHANGED, konto B bez zmian', async (_id, _opis, p) => {
    const d = await urzadzenie();
    const s = p.istniejaca ? await importDoIstniejacej(d, { bezNotatek: true }) : await importPoUsunieciu(d, { bezNotatek: true });
    const przedB = await stanB(d);
    const hak = hakPunktu(d, p, 'B');

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `import doszedł do punktu ${p.id}`).toBe(true);
    const z = await hak.gotowe;

    przerwany(r);
    await nicPoZmianie(d, z, { bezKrypto: p.bezKrypto });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await stanB(d), 'konto B bez zmian (karty, wersje, nagrobki, notatki, listy)').toEqual(przedB);
  });

  it.each(['B', 'A', 'blokada'])('IM3: import pliku karty bez notatek czeka na blokadę karty; przełączenie „%s” — SESSION_CHANGED, bez wywołań magazynu', async (wariant) => {
    const d = await urzadzenie();
    const s = await importPoUsunieciu(d, { bezNotatek: true });
    const przedA = await d.trwaly('A');
    const nazwa = blokadaKarty(s.pid);
    const inna = await d.locks.trzymaj(nazwa);
    const imp = wynik(s.uruchom({ onLockWait() {} }));
    await d.locks.czekajNaKolejke(nazwa);

    const z = await d.przelacz(wariant);
    await inna.zwolnij();
    const r = await imp;

    przerwany(r);
    await nicPoZmianie(d, z, { bezKrypto: true });
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });
});

describe('P-SESJA-ZAPISU (przegląd 4): import karty w jednej sesji — wyniki bez zmian', () => {
  it.each([['bez haka', null], ...PUNKTY_IMPORTU.map((p) => [p.id, p])])('K-IM: import %s bez przełączenia — wynik jak dotąd w A', async (_id, p) => {
    const d = await urzadzenie();
    const istniejaca = !!(p && p.istniejaca);
    const s = istniejaca ? await importDoIstniejacej(d) : await importPoUsunieciu(d);
    const hak = p ? hakBezPrzelaczenia(d, p) : null;

    const r = await wynik(s.uruchom());
    if (hak) expect(hak.zrobione, `import doszedł do punktu ${p.id}`).toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    if (istniejaca) {
      expect(r.w).toMatchObject({ patientId: s.pid, isNew: false, addedSnapshots: 1, skippedSnapshots: 1, totalSnapshots: 2 });
    } else {
      expect(r.w).toMatchObject({ patientId: s.pid, isNew: true, addedSnapshots: 2, totalSnapshots: 2, importedPatientNotes: 2, headerName: 'Testowy Jan41' });
      expect((await d.baza.listTombstonesForUser(d.A.userId)).map((x) => x.patientId), 'nagrobek karty zdjęty').not.toContain(s.pid);
      expect((await d.v.listPatientNotesForPatient(s.pid)).map((n) => n.title).sort(), 'notatki z pliku wracają').toEqual(['Notatka importu 1 (fikcyjna)', 'Notatka importu 2 (fikcyjna)']);
    }
    expect(await d.kartaTrwala('A', s.pid)).toEqual({ jest: true, wersje: 2 });
    expect(d.locks.zajeta(blokadaKarty(s.pid))).toBe(false);
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, wersje: 0, notatki: 0 });
  });

  it.each([
    ['czekanie na blokadę karty', false],
    ['limit czekania na blokadę karty', true],
  ])('K-IM: %s bez zmiany sesji — wynik jak dotąd', async (_opis, limit) => {
    const d = await urzadzenie();
    const s = await importPoUsunieciu(d);
    const nazwa = blokadaKarty(s.pid);
    const inna = await d.locks.trzymaj(nazwa);
    const imp = wynik(s.uruchom(limit ? { lockTimeoutMs: 150, onLockWait() {} } : { onLockWait() {} }));
    await d.locks.czekajNaKolejke(nazwa);
    if (limit) {
      const t = await d.timery.czekajNa((x) => x.ms === 150);
      d.timery.odpal((x) => x.id === t.id);
    } else {
      await inna.zwolnij();
    }
    const r = await imp;
    if (limit) {
      expect(r.ok).toBe(false);
      expect(r.e.vildaSaveBusy, '„zajęta w innej karcie”').toBe(true);
      expect(r.kod).not.toBe('SESSION_CHANGED');
      expect(await d.kartaTrwala('A', s.pid), 'karta bez zmian').toMatchObject({ jest: false });
    } else {
      expect(r.ok, r.komunikat).toBe(true);
      expect(r.w).toMatchObject({ isNew: true, addedSnapshots: 2, importedPatientNotes: 2 });
      expect(await d.kartaTrwala('A', s.pid)).toEqual({ jest: true, wersje: 2 });
    }
  });

  it('K-IM: import pliku karty bez notatek bez przełączenia — karta przywrócona w A, notatek 0', async () => {
    const d = await urzadzenie();
    const s = await importPoUsunieciu(d, { bezNotatek: true });
    const r = await wynik(s.uruchom());
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ patientId: s.pid, isNew: true, addedSnapshots: 2, totalSnapshots: 2, importedPatientNotes: 0, headerName: 'Testowy Jan46' });
    expect(await d.kartaTrwala('A', s.pid)).toEqual({ jest: true, wersje: 2 });
  });

  it('K-IM: błąd zdjęcia nagrobka notatki w tej samej sesji nie przerywa importu — karta przywrócona, notatki z pliku wracają', async () => {
    const d = await urzadzenie();
    const s = await importPoUsunieciu(d);
    const hak = d.magazyn.blad({ metoda: 'removePatientNoteTombstoneForUser', konto: 'A' }, { komunikat: 'atrapa: zdjęcie nagrobka notatki nieudane' });
    const r = await wynik(s.uruchom());
    expect(hak.zrobione, 'błąd zdjęcia nagrobka notatki wystąpił').toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ patientId: s.pid, isNew: true, addedSnapshots: 2, importedPatientNotes: 2 });
    expect(await d.kartaTrwala('A', s.pid)).toEqual({ jest: true, wersje: 2 });
    expect((await d.v.listPatientNotesForPatient(s.pid)).map((n) => n.title).sort(), 'notatki z pliku wracają').toEqual(['Notatka importu 1 (fikcyjna)', 'Notatka importu 2 (fikcyjna)']);
  });

  it('K-IM: błąd odczytu w scaleniu notatek w tej samej sesji nie przerywa importu — karta przywrócona, notatek 0', async () => {
    const d = await urzadzenie();
    const s = await importPoUsunieciu(d);
    const hak = d.magazyn.blad({ metoda: 'listPatientsForUser', konto: 'A', wStosie: /\bat (async )?Le \(/ }, { komunikat: 'atrapa: odczyt w scaleniu notatek nieudany' });
    const r = await wynik(s.uruchom());
    expect(hak.zrobione, 'błąd odczytu w scaleniu notatek wystąpił').toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ patientId: s.pid, isNew: true, addedSnapshots: 2, importedPatientNotes: 0 });
    expect(await d.kartaTrwala('A', s.pid)).toEqual({ jest: true, wersje: 2 });
  });

  it('K-IM: błąd zapisu wersji w tej samej sesji zostaje tym błędem, nie SESSION_CHANGED', async () => {
    const d = await urzadzenie();
    const s = await importPoUsunieciu(d);
    d.magazyn.blad({ metoda: 'putSnapshotForUser', konto: 'A' }, { komunikat: 'atrapa: zapis wersji nieudany' });
    const r = await wynik(s.uruchom());
    expect(r.ok).toBe(false);
    expect(r.kod, r.komunikat).not.toBe('SESSION_CHANGED');
    expect(r.komunikat).toMatch(/atrapa: zapis wersji nieudany/);
    expect(d.sesja()).toBe('A');
  });
});

// ── „Scal z istniejącym” osoby spoza bazy (mergeExternalIntoPatient) ────────────────────────────────────────────────
// Osoba spoza bazy „Testowy Jan42” z dwiema notatkami, na jednej liście; karta w bazie „Testowy Jan43”.
async function scalenieSpoza(d) {
  const zew = await d.v.saveExternalPatient({ lastName: 'Testowy', firstName: 'Jan42', sex: 'M', birthYear: '2016', contact: 'Fikcyjny kontakt' });
  const cel = await d.v.savePatient(naglowek(43), { dedup: false });
  const notatki = [];
  for (const i of [1, 2]) {
    notatki.push((await d.v.savePatientNote({ patientId: zew.patientId, title: `Notatka spoza bazy ${i} (fikcyjna)`, body: `Treść fikcyjna spoza bazy ${i}`, category: 'wynik-badania' })).id);
  }
  await d.v.savePatientList({ name: 'Lista testowa spoza bazy', memberIds: [zew.patientId] });
  return { zew: zew.patientId, cel: cel.patientId, notatki, uruchom: () => d.v.mergeExternalIntoPatient(zew.patientId, cel.patientId) };
}

const W_ME = /\$a \[as mergeExternalIntoPatient\]/;
const W_USUN = /\bat (async )?Bpu_usun \(/;
const PUNKTY_SPOZA = [
  { id: 'MP1', opis: 'po odczycie osoby spoza bazy (przed odczytem karty docelowej)', dop: { metoda: 'listSnapshotsForUser', konto: 'A', wStosie: W_ME, ktory: 1 } },
  { id: 'MP2', opis: 'po odczycie karty docelowej (przed odczytem notatek)', dop: { metoda: 'listSnapshotsForUser', konto: 'A', wStosie: W_ME, ktory: 2 } },
  { id: 'MP3', opis: 'po odczycie notatek osoby spoza bazy (przed przeniesieniem notatek)', dop: { metoda: 'listPatientNotesForUser', konto: 'A', wStosie: /\bat (async )?Fn \(/ } },
  { id: 'MP4', opis: 'po przeniesieniu pierwszej notatki (przed drugą)', dop: { metoda: 'removePatientNoteTombstoneForUser', konto: 'A', ktory: 1 }, bezKrypto: true },
  { id: 'MP5', opis: 'po odczycie list pacjentów (przed zmianą listy)', rodzaj: 'krypto', dop: { metoda: 'decrypt', wStosie: /\bat (async )?Rn \(/ } },
  { id: 'MP6', opis: 'po zmianie listy (przed usunięciem osoby spoza bazy)', dop: { metoda: 'removePatientListTombstoneForUser', konto: 'A' }, bezKrypto: true },
  { id: 'MP7', opis: 'w usunięciu osoby spoza bazy: po usunięciu jej rekordu', dop: { metoda: 'removePatientForUser', konto: 'A', wStosie: W_USUN }, bezKrypto: true },
  { id: 'MP8', opis: 'w usunięciu osoby spoza bazy: po zapisie jej nagrobka (przed powiadomieniem)', dop: { metoda: 'putTombstoneForUser', konto: 'A', wStosie: W_USUN }, bezKrypto: true },
];

// „Scal z istniejącym” z czekaniem na blokadę trzymaną przez „inną kartę przeglądarki” (notatka albo karta osoby spoza
// bazy) i przełączeniem w czasie czekania.
async function scalSpozaCzekajac(d, s, nazwa, wariant) {
  const inna = await d.locks.trzymaj(nazwa);
  const od = d.locks.zadania.length;
  const scal = wynik(s.uruchom());
  await d.locks.czekajNaZadanie((x) => x.nazwa === nazwa && x.wynik === 'w-kolejce', { od });
  const z = wariant ? await d.przelacz(wariant) : null;
  await inna.zwolnij();
  return { r: await scal, z };
}

describe('P-SESJA-ZAPISU (przegląd 4): „Scal z istniejącym” osoby spoza bazy kończy się w sesji, w której ruszyło', () => {
  it.each(['B', 'A', 'blokada'])('ME1: czekanie na blokadę notatki osoby spoza bazy; przełączenie „%s” — SESSION_CHANGED, bez wywołań magazynu, notatki A nie trafiają do B', async (wariant) => {
    const d = await urzadzenie();
    const s = await scalenieSpoza(d);
    const przedA = await d.trwaly('A');
    const przedB = await stanB(d);

    const { r, z } = await scalSpozaCzekajac(d, s, blokadaNotatki(s.notatki[0]), wariant);

    przerwany(r);
    await nicPoZmianie(d, z, { bezKrypto: true });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await stanB(d), 'konto B bez zmian (w tym bez notatek i nagrobków)').toEqual(przedB);
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
    expect(await d.kartaTrwala('A', s.zew), 'osoba spoza bazy zostaje w A').toMatchObject({ jest: true });
  });

  it.each(['B', 'A', 'blokada'])('ME2: czekanie na blokadę karty osoby spoza bazy przy jej usunięciu; przełączenie „%s” — SESSION_CHANGED, bez usunięcia i nagrobka', async (wariant) => {
    const d = await urzadzenie();
    const s = await scalenieSpoza(d);
    const przedB = await stanB(d);

    const { r, z } = await scalSpozaCzekajac(d, s, blokadaKarty(s.zew), wariant);

    przerwany(r);
    await nicPoZmianie(d, z, { bezKrypto: true });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await stanB(d), 'konto B bez zmian (w tym bez nagrobka osoby spoza bazy)').toEqual(przedB);
    expect(await d.kartaTrwala('A', s.zew), 'osoba spoza bazy zostaje w A (notatki już przeniesione — ograniczenie 4)').toMatchObject({ jest: true });
    expect((await d.baza.listTombstonesForUser(d.A.userId)).map((x) => x.patientId), 'bez nagrobka osoby spoza bazy w A').not.toContain(s.zew);
  });

  it.each(['B', 'A', 'blokada'])('ME2-limit: limit czekania na blokadę karty osoby spoza bazy mija po przełączeniu „%s” — SESSION_CHANGED zamiast „zajęta w innej karcie”', async (wariant) => {
    const d = await urzadzenie();
    const s = await scalenieSpoza(d);
    const nazwa = blokadaKarty(s.zew);
    await d.locks.trzymaj(nazwa); // inna karta trzyma blokadę do końca testu
    const od = d.locks.zadania.length;
    const scal = wynik(s.uruchom());
    await d.locks.czekajNaZadanie((x) => x.nazwa === nazwa && x.wynik === 'w-kolejce', { od });
    const limit = await d.timery.czekajNa((t) => t.ms === 30000);

    const z = await d.przelacz(wariant);
    d.timery.odpal((t) => t.id === limit.id);
    const r = await scal;

    przerwany(r);
    expect(r.e.vildaSaveBusy, 'odrzucenie ze zmiany sesji, nie z zajętej blokady').toBeFalsy();
    await nicPoZmianie(d, z, { bezKrypto: true });
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, nagrobki: 0, notatki: 0 });
  });

  it.each(PUNKTY_SPOZA.flatMap((p) => ['B', 'A', 'blokada'].map((w) => [p.id, w, p.opis, p])))('ME3: „Scal z istniejącym” %s — przełączenie „%s” %s kończy scalanie SESSION_CHANGED, bez wywołań magazynu', async (_id, wariant, _opis, p) => {
    const d = await urzadzenie();
    const s = await scalenieSpoza(d);
    const przedB = await stanB(d);
    const hak = hakPunktu(d, p, wariant);

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `scalanie doszło do punktu ${p.id}`).toBe(true);
    const z = await hak.gotowe;

    przerwany(r);
    await nicPoZmianie(d, z, { bezKrypto: p.bezKrypto });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await stanB(d), 'konto B bez zmian (karty, nagrobki, notatki, listy)').toEqual(przedB);
  });
});

describe('P-SESJA-ZAPISU (przegląd 4): „Scal z istniejącym” w jednej sesji — wyniki bez zmian', () => {
  async function wynikJakDotad(d, s, r) {
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toEqual({ notesMoved: 2, targetPatientId: s.cel, listsUpdated: 1 });
    expect(await d.kartaTrwala('A', s.zew), 'osoba spoza bazy usunięta').toEqual({ jest: false, wersje: 0 });
    expect((await d.baza.listTombstonesForUser(d.A.userId)).map((x) => x.patientId), 'nagrobek osoby spoza bazy').toContain(s.zew);
    const notatki = await Promise.all(s.notatki.map((id) => d.baza.getPatientNoteForUser(d.A.userId, id)));
    expect(notatki.map((n) => n && n.patientId), 'notatki przy karcie docelowej').toEqual([s.cel, s.cel]);
    const listy = await d.v.listPatientLists();
    expect(listy.map((l) => l.memberIds), 'lista z kartą docelową zamiast osoby spoza bazy').toEqual([[s.cel]]);
    expect((await d.locks.query()).held).toEqual([]);
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, nagrobki: 0, notatki: 0, listy: 0 });
  }

  it.each([['bez haka', null], ...PUNKTY_SPOZA.map((p) => [p.id, p])])('K-ME: %s bez przełączenia — wynik jak dotąd w A', async (_id, p) => {
    const d = await urzadzenie();
    const s = await scalenieSpoza(d);
    const hak = p ? hakBezPrzelaczenia(d, p) : null;
    const r = await wynik(s.uruchom());
    if (hak) expect(hak.zrobione, `scalanie doszło do punktu ${p.id}`).toBe(true);
    await wynikJakDotad(d, s, r);
    expect(d.zdarzenia.filter((e) => e.typ === 'patientDeleted').map((e) => [e.sesja, e.dane && e.dane.patientId]), 'powiadomienie o usunięciu osoby spoza bazy w A').toEqual([['A', s.zew]]);
  });

  it.each([['notatki', 0], ['karty osoby spoza bazy', 1]])('K-ME: czekanie na blokadę %s bez zmiany sesji — wynik jak dotąd', async (_opis, ktora) => {
    const d = await urzadzenie();
    const s = await scalenieSpoza(d);
    const { r } = await scalSpozaCzekajac(d, s, ktora ? blokadaKarty(s.zew) : blokadaNotatki(s.notatki[0]), null);
    await wynikJakDotad(d, s, r);
  });

  it('K-ME: limit czekania na blokadę karty osoby spoza bazy bez zmiany sesji — „zajęta w innej karcie” (vildaSaveBusy)', async () => {
    const d = await urzadzenie();
    const s = await scalenieSpoza(d);
    const nazwa = blokadaKarty(s.zew);
    await d.locks.trzymaj(nazwa);
    const od = d.locks.zadania.length;
    const scal = wynik(s.uruchom());
    await d.locks.czekajNaZadanie((x) => x.nazwa === nazwa && x.wynik === 'w-kolejce', { od });
    const limit = await d.timery.czekajNa((t) => t.ms === 30000);
    d.timery.odpal((t) => t.id === limit.id);
    const r = await scal;
    expect(r.ok).toBe(false);
    expect(r.e.vildaSaveBusy).toBe(true);
    expect(r.kod).not.toBe('SESSION_CHANGED');
    expect(await d.kartaTrwala('A', s.zew), 'osoba spoza bazy zostaje').toMatchObject({ jest: true });
  });

  it('K-ME: błąd odczytu osoby spoza bazy w tej samej sesji zostaje tym błędem, nie SESSION_CHANGED', async () => {
    const d = await urzadzenie();
    const s = await scalenieSpoza(d);
    const przedA = await d.trwaly('A');
    d.magazyn.blad({ metoda: 'getPatientForUser', konto: 'A' }, { komunikat: 'atrapa: odczyt rekordu karty nieudany' });
    const r = await wynik(s.uruchom());
    expect(r.ok).toBe(false);
    expect(r.kod, r.komunikat).not.toBe('SESSION_CHANGED');
    expect(r.komunikat).toMatch(/atrapa: odczyt rekordu karty nieudany/);
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });
});
