// P-DZIENNIK-ZDARZEN (E2-PR3a2, E2-PR3a3, E2-PR3b) — test pokrycia mutacji jako różnica stanu odbiorcy. Każda mutacja danych sejfu przy
// otwartej bramce (pole okna VILDA_EVENT_LOG) w trybie „Komputer prywatny” dopisuje do kolejki zmian wiersze, z których
// odbiorca dostaje ten sam stan co z pełnego ładunku. Prawdziwy sejf w oknie uprzęży tests/support/okno-magazynu.mjs
// z emisja: true (sejf jak w przeglądarce) nad atrapą tests/support/atrapa-indexeddb.mjs, sztuczny zegar (tylko Date)
// z krokiem 1 s przed każdą operacją sejfu, zadanie w tle po zalogowaniu odpalane jawnie. Dane WYŁĄCZNIE FIKCYJNE
// („Testowy Jan…”, „Fikcyjna notatka…”), bez PESEL.
//
// SCHEMAT PRZYPADKU. Okno A → przygotowanie → emissionsSettled() i cisza → bliźniaki B (odbiorca zdarzeń) i B′ (odbiorca
// pełnego ładunku): okna na niezależnej kopii baz atrapy (o.idb.__atrapa.klonuj()), to samo konto (ten sam klucz —
// koperty A są czytelne), bramka zamknięta → mutacja na A → emissionsSettled() i cisza → wiersze kolejki A od
// ostatniego seqLocal sprzed mutacji → applyEncryptedEvent(env) na B w kolejności seqLocal (każdy wynik applied); B′
// scala exportSyncPayload(A). Sprawdzenia:
//   - wiersze: rodzaje i stany wierszy po mutacji (kolejność seqLocal) = literał przypadku, zwykle także klucze encji;
//   - B ≡ B′: encje(B) = encje(B′) (model encji z tests/support/encje-ladunku.mjs, ten sam co w teście A ≡ B);
//   - odbiorca bez nagrobka: D(A, B) = ∅ (różnice encja po encji eksportów kanonicznych);
//   - nagrobek karty u odbiorcy (B i B′ usuwają kartę wcześniej albo później niż mutacja A):
//       starszy, mutacja podnosi chwilę karty (nowa wersja, kosz) — zamiast B ≡ B′: po wierszach mutacji D(A, B) =
//         dokładnie to, czego zdarzenia mutacji nie niosą („karta częściowa”), a D(A, B′) = ∅ (pełna historia z pełnego
//         ładunku); od E2-PR3b hak H1: nagrobek B (koperta ptomb zbudowana przy usunięciu) zastosowany na A przegrywa
//         z nowszą chwilą karty — A dopisuje pełną kartę (jeden wiersz pfull, pending), a po jego zastosowaniu na B
//         D(A, B) = ∅;
//       starszy, mutacja chwili karty nie podnosi (notatka) — B ≡ B′ i D(A, B) = D(A, B′): karta tylko u A, nagrobek
//         tylko u B;
//       nowszy — B ≡ B′ (karty nie ma u B ani u B′), a po scaleniu eksportu B na A karta znika u A, wiersze A te same
//         (liczba, rodzaje, klucze, stan pending).
// Samokontrola uprzęży: w mutacji wołane są metody danych z METODY_DANYCH (tests/support/okno-magazynu.mjs), odczyty
// albo scalanie; każda metoda, która w przypadku daje wiersz, jest w METODY_DANYCH — domyślne okno uprzęży woła je przy
// zamkniętej bramce, inaczej przypadek starszego testu magazynu dostałby wiersze emisji po cichu.
// Partie importu (E2-PR3a3, wiersz 17 tabeli 3.5 planu): okno A ma słuchacza VildaVault._eventLog.onBulkChange od
// utworzenia; wywołania w trakcie mutacji (lista czyszczona tuż przed nią) = literał przypadku [{ reason, count }] — reason
// to nazwa metody importu, count = liczba wierszy po mutacji; przypadki bez importu — bez wywołania. Odtworzenie konta
// z kopii: wiersze z kolejki konta z kopii, odbiorcy B i B′ — okna na kopii baz atrapy sprzed danych konta źródłowego
// (to samo konto, ten sam klucz), więc odbiorca zdarzeń dostaje cały stan konta z wierszy partii.
//
// PRZYPADKI
//   PM1  nowa karta → snap.
//   PM2  nowa wersja → snap; także z nagrobkiem u odbiorcy starszym (karta częściowa, po haku H1 brak różnicy) i nowszym.
//   PM3  poprawka starszej wersji (preserveSavedAt) → snap tej wersji; także z nagrobkiem nowszym.
//   PM4–PM5  gwiazdka, odpięcie → snap.
//   PM6–PM7  edycja wiersza pomiaru, usunięcie bieżącego pomiaru z awansem starszego → snap.
//   PM8  kosz → stomb; także z nagrobkiem starszym (kosz nie niesie wersji: karta częściowa, po haku H1 brak różnicy)
//        i nowszym.
//   PM9  kosz przypiętej („Odepnij i usuń”) → stomb.
//   PM10 „Przywróć” (zapis przywrócenia) → snap; także z nagrobkiem nowszym.
//   PM11 „Przywróć” — „już w karcie” z przebudową nagłówka (po przerwanym „Przywróć”) → snap.
//   PM12 „Przywróć” — „już w karcie” bez zmiany nagłówka → snap (zdjęcie wpisu kosza niesie zdarzenie wersji).
//   PM13 „Przywróć” wersji leżącej pod inną kartą → snap pod kartą, w której leży.
//   PM14 przywróć wersję jako nową → snap.
//   PM15 retencja 2 wersji → stomb, stomb.
//   PM16 retencja z wersją, której nie udało się usunąć → stomb tylko nagrobka, który został.
//   PM17 import pliku karty z wersją leżącą w koszu → snap przepisanej wersji (rev + 1), jeden wiersz, choć wersję
//        emitują zapis importu i zdjęcie wpisu kosza; onBulkChange count 1 (E2-PR3a3: pełna różnica stanu odbiorcy).
//   PM18 „Scal pacjentów” (źródło: 2 wersje, notatka, lista) → snap ×3, ptomb, pnote, plist.
//   PM19 „Scal z istniejącym” (osoba spoza bazy z notatką i listą) → ptomb, pnote, plist.
//   PM20 „Usuń pacjenta” z 2 notatkami → ptomb, pnotetomb ×2.
//   PM21 „Usuń pacjenta”, karta wróciła bez notatek (nagrobki z polem do odnowienia) → ptomb, pnotetomb ×2.
//   PM22 notatka pacjenta: nowa, poprawka → pnote; także z nagrobkiem starszym i nowszym.
//   PM23 zapis notatki w stanie „czeka” → pnote, pnotetomb.
//   PM24 usuń notatkę → pnotetomb.
//   PM25 ukończ, cofnij ukończenie, „nie przyszedł”, odłóż → pnote.
//   PM26 plan opieki: utwórz → pnote ×2; usuń wpis planu → pnote, pnotetomb (odbiorca przyjmuje dokładną wersję
//        planu nadawcy — P-PLAN-POTOMEK).
//   PM27 wynik przypomnienia → pnote ×2 (przypomnienie i następny kontakt).
//   PM28 migracja wpisów spoza bazy → snap ×2 (nowe osoby), potem pnote ×3.
//   PM29–PM30 notatka biblioteki: dodaj → note; usuń → notetomb.
//   PM31–PM33 lista: dodaj → plist; dodaj pacjenta do listy → plist; usuń listę → plisttomb.
//   PM34 preferencja przez hak VildaPersistence.onPreferenceWrite → pref.
//   PM35 poczekalnia: termin, dodanie i usunięcie kolejki → pref.
//   PM36–PM37 klucz dostępu: rejestracja (zwykła i „roaming”) → pk; usunięcie → pktomb.
//   PM38 zmiana hasła, reset hasła → cred.
//   PM39 usunięcie wersji (deleteSnapshot, lokalne) → bez wierszy.
//   PM40 scalanie z chmury przy otwartej bramce (mergeSyncPayload, applyEncryptedDelta, applyEncryptedEvent) → bez
//        wierszy, bez operacji na bazie kolejki i bez blokady konta.
//   PM41 import pliku karty usuniętej (2 wersje, 2 notatki; odbiorcy mają nagrobek karty i notatek) → snap ×2, pnote ×2;
//        karta i notatki wracają u odbiorców; onBulkChange count 4.
//   PM42 import pliku karty z nową wersją i notatką bliźniaka → snap, pnote (bez wersji obecnej w karcie); count 2;
//        także z nagrobkiem u odbiorcy starszym i nowszym.
//   PM43 scalenie kopii konta bliźniaka (nowa karta z 2 wersjami, nowa wersja karty istniejącej, nowa i poprawiona
//        notatka, notatka biblioteki, lista, usunięta lista, poczekalnia) → snap ×3, pnote ×2, note, plist, plisttomb,
//        pref; count 9; także z nagrobkiem starszym i nowszym.
//   PM44 scalenie własnej kopii konta (bez nowych danych) → pnote ×3, note, plist, pref bez skutku u odbiorcy, bez snap
//        (wersje obecne w karcie); count 6.
//   PM45 odtworzenie konta z kopii (2 karty, 3 wersje, notatka, usunięta notatka, notatka biblioteki, lista, usunięta
//        lista, poczekalnia) → w kolejce konta z kopii snap ×3, pnote, pnotetomb, note, plist, plisttomb, pref; count 9;
//        odbiorcy = konto źródłowe sprzed danych: encje(B) = encje(B′), D(konto z kopii, B) = cred (konto z kopii nie ma
//        daty zmiany hasła).
//   PM46 import starego formatu (importLegacyJsonPatient) → snap przez zapis karty, bez partii.
//   PM47 importy przy zamkniętej bramce (domyślne okno uprzęży: import karty, scalenie i odtworzenie kopii konta) → bez
//        wierszy, bez onBulkChange, bez bazy kolejki i operacji na niej.
//   Samokontrola uprzęży (METODY_DANYCH).
//
// Czerwone na bazie (sejf origin/audyt aab11479 z tym plikiem i uprzężą tego PR): 58 z 61 — „część emisji istnieje”
// (brak emissionsSettled) i wszystkie przypadki PM poza PM39, PM40 (brak wierszy po mutacji; PM17 — brak snap
// przepisanej wersji).
// Zielone z natury (strażniki regresji): PM39, PM40 — mutacja bez wiersza także na bazie; samokontrola uprzęży nie
// zależy od sejfu.
// Czerwone na bazie E2-PR3a3 (sejf 422a9a7b — z częścią emisji, bez partii importu — z tym plikiem i uprzężą tego PR):
// 10 z 73 — „część partii istnieje” (brak onBulkChange), PM41, PM42 ×3, PM43 ×3, PM45 (brak wierszy partii), PM44
// (brak wierszy encji sekcji). Zielone z natury (strażniki regresji): PM17 (zdjęcie wpisu kosza emituje wersję —
// reguła miejsca zapisu z E2-PR3a2; wywołania onBulkChange sprawdzane tylko na sejfie z częścią partii), PM46 (import
// starego formatu przez zapis karty, bez partii), PM47 (zamknięta bramka), PM1–PM40 i samokontrola uprzęży.
// Czerwone na bazie E2-PR3b (sejf 4994fef9 — bez haków scalania — z tym plikiem i uprzężą tego PR): 2 z 73 — PM2 i PM8
// z nagrobkiem starszym u odbiorcy (po kopercie ptomb B na A brak wiersza pfull; różnica przed hakiem = literał „karta
// częściowa”, jak dotąd). Zielone z natury (strażniki regresji): pozostałe 71, w tym PM2 i PM8 bez nagrobka i z nagrobkiem
// nowszym.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { METODY_DANYCH, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';
import { naglowek } from './sesja-zapisu-uprzaz.mjs';
import { D, encje, sortuj } from '../support/encje-ladunku.mjs';

// ── Zegar, okna, sprzątanie ──────────────────────────────────────────────────────────────────────────────────────────
const START = Date.parse('2026-03-02T08:00:00.000Z');
let teraz = START;
const krok = (ms = 1000) => { teraz += ms; vi.setSystemTime(teraz); };
const CZAS = 60_000;
const okna = [];
beforeEach(() => {
  przechwycZadaniaWTle();
  vi.useFakeTimers({ toFake: ['Date'] });
  teraz = START;
  vi.setSystemTime(teraz);
});
afterEach(() => {
  vi.useRealTimers();
  for (const o of okna.splice(0)) o.timery.wyczysc();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Samokontrola uprzęży ─────────────────────────────────────────────────────────────────────────────────────────────
// Odczyty VildaVault wołane w mutacji obok metody danych (bez zapisu; pomijane w liście metod mutacji).
const ODCZYTY = new Set(['getPatient', 'getPatientNote', 'getCarePlan', 'getCarePlanNoteEntries', 'exportSyncPayload', 'buildPatientDelta']);
const METODY = new Set(METODY_DANYCH);

// ── Okna i bliźniaki ─────────────────────────────────────────────────────────────────────────────────────────────────
// Widok VildaVault z krokiem zegara 1 s przed każdym wywołaniem; wolane — nazwy wywołanych metod (albo null).
function zZegarem(v, wolane = null) {
  return new Proxy(v, {
    get(cel, nazwa) {
      const f = cel[nazwa];
      if (typeof f !== 'function') return f;
      return (...a) => { krok(); if (wolane) wolane.push(nazwa); return f.apply(cel, a); };
    },
  });
}
// Bliźniak: niezależna kopia baz atrapy (domyślnie baz okna o; idb — inna atrapa, np. kopia sprzed danych), to samo
// konto (ten sam klucz), bramka zamknięta; B.z — widok z krokiem zegara.
async function blizniak(o, idb = o.idb) {
  const B = await oknoMagazynu({ idb: idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A' });
  okna.push(B);
  B.z = zZegarem(B.v);
  return B;
}
// Koniec dopisań łańcucha (emissionsSettled) i cisza okna; sejf bez części emisji nie ma czego dopisywać (przypadek
// „część emisji istnieje” jest wtedy czerwony).
async function ucichnij(o) {
  if (typeof o.ev.emissionsSettled === 'function') await o.ev.emissionsSettled();
  await o.cisza();
}
const ostatniSeq = (o) => o.kolejka('A').reduce((m, w) => Math.max(m, w.seqLocal), 0);
const opisWiersza = (w) => w.kind + (w.state === 'pending' ? '' : `(${w.state})`);
// Eksport kanoniczny do D (jak eksportKanoniczny z pominSeq i pominSnapshotCount w tests/support/urzadzenie-sync.mjs):
// bez pól eksportu, chwili nagłówka, licznika wersji i seq wpisów kosza; klucze posortowane.
function kanon(lad) {
  const c = structuredClone(lad);
  for (const k of ['userId', 'label', 'exportedAtISO', 'lastMergeAtISO']) delete c[k];
  for (const p of c.patients || []) { if (p && p.header) delete p.header.timestampISO; if (p) delete p.snapshotCount; }
  for (const e of c.snapshotTombstones || []) if (e) delete e.seq;
  return sortuj(c);
}
const listaEncji = (lad) => [...encje(lad)].map(([k, e]) => [k, e.val]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const opisD = (d) => d.map((x) => `${x.rodzaj}:${x.klucz}${x.tylko ? ` (tylko ${x.tylko})` : ` [${x.sciezki.join(', ')}]`}`);
const maKarte = (lad, pid) => (lad.patients || []).some((p) => p.patientId === pid);
// Klucze ułożone w obrębie kolejnych grup o podanych długościach (ta sama ranga; kolejność encji w randze idzie za
// kolejnością zapisów importu i nie zmienia stanu odbiorcy), reszta bez zmian.
const wGrupach = (...dlugosci) => (l) => {
  const w = [];
  let i = 0;
  for (const n of dlugosci) { w.push(...l.slice(i, i + n).sort()); i += n; }
  return [...w, ...l.slice(i)];
};

// ── Przebieg przypadku ───────────────────────────────────────────────────────────────────────────────────────────────
// p: { przygotuj(v, s, o)?, mutacja(v, s, o), opcjeOkna?, odbiorcySprzedDanych? (B i B′ z kopii baz atrapy zrobionej
// przed przygotowaniem), przedMutacja(B, B′, s)? (kontrola odbiorców), konto(s)? (konto, z którego kolejki idą wiersze;
// domyślnie A — wiersze od ostatniego seqLocal sprzed mutacji, inne konto — wszystkie) }; nagrobek: null | 'starszy' |
// 'nowszy' — B i B′ usuwają kartę s.P przed mutacją A albo po niej.
async function przebieg(p, nagrobek = null) {
  const o = await oknoMagazynu({ konta: 'A', emisja: true, ...(p.opcjeOkna || {}) });
  okna.push(o);
  // Słuchacz partii importu (E2-PR3a3); sejf bez części partii nie ma onBulkChange (przypadek „część partii istnieje”
  // jest wtedy czerwony).
  const partie = typeof o.ev.onBulkChange === 'function' ? [] : null;
  if (partie) o.ev.onBulkChange((d) => { partie.push(d); });
  const wolane = [];
  const v = zZegarem(o.v, wolane);
  const s = {};
  let zrodloOdbiorcow = o.idb;
  if (p.odbiorcySprzedDanych) {
    krok();
    await ucichnij(o);
    zrodloOdbiorcow = o.idb.__atrapa.klonuj(); // konto A bez danych (ten sam klucz główny co kopia konta)
  }
  if (p.przygotuj) await p.przygotuj(v, s, o);
  krok();
  await ucichnij(o);
  const B = await blizniak(o, zrodloOdbiorcow);
  const Bl = await blizniak(o, zrodloOdbiorcow);
  // Nagrobek w tej samej chwili u B i u B′, minutę od mutacji (poza pasmem ratunku notatek 1 s); koperta ptomb B
  // zbudowana i zaszyfrowana przy usunięciu (zanim B dostanie wiersze mutacji, które zdejmą jego nagrobek).
  let ptombB = null;
  const usunUOdbiorcow = async () => {
    krok(60_000); await B.v.removePatient(s.P); await Bl.v.removePatient(s.P); await B.cisza(); await Bl.cisza();
    const k = await B.ev.buildPatientTombstoneEvent(s.P, null);
    ptombB = k ? (await B.ev.encryptEvent(k)).env : null;
  };
  if (nagrobek === 'starszy') { await usunUOdbiorcow(); krok(60_000); }
  if (p.przedMutacja) await p.przedMutacja(B, Bl, s);
  const s0 = ostatniSeq(o);
  const znacznik = o.znacznik();
  wolane.length = 0;
  if (partie) partie.length = 0;
  await p.mutacja(v, s, o);
  const metody = wolane.slice();
  krok();
  await ucichnij(o);
  const partieMutacji = partie ? partie.slice() : null;
  if (nagrobek === 'nowszy') await usunUOdbiorcow();
  const konto = p.konto ? p.konto(s) : 'A';
  const od = konto === 'A' ? s0 : 0;
  const wiersze = o.kolejka(konto).filter((w) => w.seqLocal > od);
  const statusy = [];
  for (const w of wiersze) statusy.push((await B.ev.applyEncryptedEvent(w.env)).status);
  await B.cisza();
  await Bl.v.mergeSyncPayload(await o.v.exportSyncPayload());
  await Bl.cisza();
  const eA = await o.v.exportSyncPayload();
  const eB = await B.v.exportSyncPayload();
  const eBl = await Bl.v.exportSyncPayload();
  return {
    o, B, Bl, s, s0, wiersze, statusy, metody, znacznik, partie: partieMutacji, eA, eB, eBl, dB: D(kanon(eA), kanon(eB)), dBl: D(kanon(eA), kanon(eBl)),
    ptombB,
  };
}

// Wiersze (literał, wszystkie applied u B, klucze encji), wywołania onBulkChange (literał; count = liczba wierszy po
// mutacji) i metody mutacji (samokontrola).
function sprawdzWiersze(r, p) {
  if (p.wiersze) expect(r.wiersze.map(opisWiersza), `${p.nr}: rodzaje i stany wierszy po mutacji (kolejność seqLocal)`).toEqual(p.wiersze);
  expect(r.statusy, `${p.nr}: applyEncryptedEvent na B`).toEqual(r.wiersze.map(() => 'applied'));
  if (p.klucze) {
    const uloz = p.uloz || ((l) => l);
    expect(uloz(r.wiersze.map((w) => w.entityKey)), `${p.nr}: klucze encji wierszy`).toEqual(uloz(p.klucze(r.s)));
  }
  if (r.partie) {
    expect(r.partie, `${p.nr}: wywołania onBulkChange w mutacji`).toEqual(p.partie || []);
    if (r.partie.length) expect(r.partie.reduce((n, d) => n + d.count, 0), `${p.nr}: count = liczba wierszy po mutacji`).toBe(r.wiersze.length);
  }
  expect(r.metody.filter((m) => !ODCZYTY.has(m)), `${p.nr}: metody mutacji (bez odczytów)`).toEqual(p.metody);
}
async function sprawdz(p, nagrobek = null) {
  const r = await przebieg(p, nagrobek);
  sprawdzWiersze(r, p);
  if (p.sprawdzStan) { await p.sprawdzStan(r); return r; }
  if (!nagrobek) {
    expect(listaEncji(r.eB), `${p.nr}: encje(B) = encje(B′)`).toEqual(listaEncji(r.eBl));
    expect(opisD(r.dB), `${p.nr}: D(A, B)`).toEqual(p.roznica ? p.roznica(r) : []);
    if (p.kontrola) await p.kontrola(r);
    return r;
  }
  const P = r.s.P;
  const kartaINagrobek = [`karta:${P} (tylko x)`, `ptomb:${P} (tylko y)`];
  const wersjeA = (r.eA.patients.find((k) => k.patientId === P) || { snapshots: [] }).snapshots.map((x) => x.snapshotId);
  const niesione = new Set(r.wiersze.filter((w) => w.kind === 'snap').map((w) => w.entityKey));
  const wersjeTylkoA = (pomin) => wersjeA.filter((sid) => !pomin.has(`${P}/${sid}`)).map((sid) => `wersja:${P}/${sid} (tylko x)`);
  if (nagrobek === 'starszy' && p.podnosi) {
    // Karta częściowa przed hakiem: nagrobek u B przegrywa z nowszą chwilą karty, a zdarzenia mutacji nie niosą starszych
    // wersji (snap niesie jedną wersję; kosz — żadnej, a karta bez wizyt u odbiorcy bez karty nie powstaje), pełny
    // ładunek niesie całą historię.
    const oczekiwane = p.podnosi === 'karta' ? [...kartaINagrobek, ...wersjeTylkoA(niesione)] : wersjeTylkoA(niesione);
    expect(opisD(r.dB), `${p.nr}: przed hakiem D(A, B) = to, czego zdarzenia mutacji nie niosą (karta częściowa)`).toEqual(oczekiwane.sort());
    expect(opisD(r.dBl), `${p.nr}: D(A, B′) = ∅`).toEqual([]);
    // Hak H1 (E2-PR3b): nagrobek B (koperta ptomb z chwili usunięcia) przegrywa na A z nowszą chwilą karty — A dopisuje
    // pełną kartę; B po jej zastosowaniu ma cały stan A.
    expect(r.ptombB, `${p.nr}: kontrola — koperta ptomb B`).toBeTruthy();
    const s1 = ostatniSeq(r.o);
    krok();
    expect((await r.o.ev.applyEncryptedEvent(r.ptombB)).status, `${p.nr}: ptomb B na A`).toBe('applied');
    krok();
    await ucichnij(r.o);
    const hak = r.o.kolejka('A').filter((w) => w.seqLocal > s1);
    expect(hak.map((w) => [w.kind, w.entityKey, w.state]), `${p.nr}: wiersze A z haka H1 — jedna pełna karta`).toEqual([['pfull', P, 'pending']]);
    const st = [];
    for (const w of hak) st.push((await r.B.ev.applyEncryptedEvent(w.env)).status);
    await r.B.cisza();
    expect(st, `${p.nr}: pfull na B`).toEqual(['applied']);
    const dPo = D(kanon(await r.o.v.exportSyncPayload()), kanon(await r.B.v.exportSyncPayload()));
    expect(opisD(dPo), `${p.nr}: po haku H1 D(A, B) = ∅`).toEqual([]);
    return r;
  }
  expect(listaEncji(r.eB), `${p.nr}: encje(B) = encje(B′)`).toEqual(listaEncji(r.eBl));
  expect({ B: maKarte(r.eB, P), Bl: maKarte(r.eBl, P) }, `${p.nr}: karty nie ma u B ani u B′`).toEqual({ B: false, Bl: false });
  expect(opisD(r.dB), `${p.nr}: D(A, B) = D(A, B′)`).toEqual(opisD(r.dBl));
  const oczekiwane = [...kartaINagrobek, ...wersjeTylkoA(new Set()), ...(p.roznicaNagrobka ? p.roznicaNagrobka(r, nagrobek) : [])].sort();
  expect(opisD(r.dB), `${p.nr}: D(A, B): karta i jej wersje tylko u A, nagrobek tylko u B`).toEqual(oczekiwane);
  if (nagrobek === 'nowszy') {
    const stan = (o) => o.kolejka('A').map((w) => [w.seqLocal, w.kind, w.entityKey, w.state]);
    const przed = stan(r.o);
    krok();
    await r.o.v.mergeSyncPayload(await r.B.v.exportSyncPayload());
    await r.o.cisza(); await ucichnij(r.o);
    const po = stan(r.o);
    expect(po, `${p.nr}: po scaleniu eksportu B na A wiersze A te same`).toEqual(przed);
    expect(po.every((w) => w[3] === 'pending'), `${p.nr}: stan pending`).toBe(true);
    expect((await r.o.v.listPatients()).some((k) => k.patientId === P), `${p.nr}: karta znika u A`).toBe(false);
  }
  return r;
}

// ── Pomocniki danych (fikcyjne) ──────────────────────────────────────────────────────────────────────────────────────
// Karta „Testowy Jan<i>” z wersjami o podanych masach; s.P — pierwsza karta przypadku.
async function karta(v, s, i = 1, masy = [22]) {
  const r = await v.savePatient(naglowek(i, { masa: masy[0] }), { dedup: false });
  if (!s.P) s.P = r.patientId;
  const w = [r.snapshotId];
  for (const m of masy.slice(1)) w.push((await v.savePatient(naglowek(i, { masa: m }), { dedup: false, patientId: r.patientId })).snapshotId);
  return { pid: r.patientId, w };
}
const NOTATKA = (pid, tytul = 'Fikcyjna notatka', pola = {}) => ({ patientId: pid, title: tytul, body: 'Fikcyjna treść notatki.', category: 'inne', ...pola });
async function masa(v, s, sid, kg, opcje) {
  const w = (await v.getPatient(s.P)).snapshots.find((x) => x.snapshotId === sid);
  await v.updateSnapshotPayload(s.P, sid, { ...w.payload, user: { ...w.payload.user, weight: kg } }, opcje);
}
// Atrapa VildaCrypto dla kluczy dostępu (jak meta-konta-blokada.test.mjs): stały sekret PRF, bez WebAuthn.
function atrapaKlucza(o, id) {
  const c = o.win.VildaCrypto;
  c.createPasskeyAndGetPrfSecret = async () => ({ credentialId: id, prfSecretBytes: new Uint8Array(32).fill(7) });
  c.createRoamingPasskeyAndGetPrfSecret = async () => ({ credentialId: id, publicKeyRawB64u: 'AQID', prfInputB64u: 'BAUG' });
  c.getPasskeyPrfSecret = async () => ({ credentialId: id, prfSecretBytes: new Uint8Array(32).fill(7) });
}
const bazaSejfu = (o) => `vilda_user_${o.A.userId}`;
// Komunikaty retencji sejfu (console.info i console.warn) bez druku w przebiegu testu.
const cichaRetencja = () => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); };
const hakPreferencji = { zapis: null };

// ── Przypadki ────────────────────────────────────────────────────────────────────────────────────────────────────────
// nr, opis, przygotuj?, mutacja, metody (wołane w mutacji, bez odczytów), wiersze, klucze?, uloz? (kolejność kluczy
// bez znaczenia w grupie: ta sama ranga, kolejność z listy sklepu), warianty? (nagrobek u odbiorcy), podnosi? ('wersje' |
// 'karta'), roznica? (D(A, B) bez nagrobka), roznicaNagrobka? (dodatkowe pozycje D przy nagrobku), sprawdzStan?,
// partie? (wywołania onBulkChange w mutacji; domyślnie bez wywołań), kontrola(r)? (dodatkowe sprawdzenie po D bez
// nagrobka), opcje przebiegu: opcjeOkna?, odbiorcySprzedDanych?, przedMutacja?, konto?
const PRZYPADKI = [
  { nr: 'PM1', opis: 'nowa karta', metody: ['savePatient'], wiersze: ['snap'],
    mutacja: async (v, s) => { const r = await v.savePatient(naglowek(1), { dedup: false }); s.P = r.patientId; s.S = r.snapshotId; },
    klucze: (s) => [`${s.P}/${s.S}`] },
  { nr: 'PM2', opis: 'nowa wersja', metody: ['savePatient'], wiersze: ['snap'], warianty: ['starszy', 'nowszy'], podnosi: 'wersje',
    przygotuj: async (v, s) => { await karta(v, s, 1, [22, 23]); },
    mutacja: async (v, s) => { s.S = (await v.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: s.P })).snapshotId; },
    klucze: (s) => [`${s.P}/${s.S}`] },
  { nr: 'PM3', opis: 'poprawka starszej wersji (preserveSavedAt)', metody: ['updateSnapshotPayload'], wiersze: ['snap'], warianty: ['nowszy'],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23])).w; },
    mutacja: async (v, s) => { await masa(v, s, s.w[0], 21, { preserveSavedAt: true }); },
    klucze: (s) => [`${s.P}/${s.w[0]}`] },
  { nr: 'PM4', opis: 'gwiazdka', metody: ['setSnapshotPinned'], wiersze: ['snap'],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23])).w; },
    mutacja: async (v, s) => { await v.setSnapshotPinned(s.P, s.w[0], true); }, klucze: (s) => [`${s.P}/${s.w[0]}`] },
  { nr: 'PM5', opis: 'odpięcie', metody: ['setSnapshotPinned'], wiersze: ['snap'],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23])).w; await v.setSnapshotPinned(s.P, s.w[0], true); },
    mutacja: async (v, s) => { await v.setSnapshotPinned(s.P, s.w[0], false); }, klucze: (s) => [`${s.P}/${s.w[0]}`] },
  { nr: 'PM6', opis: 'edycja wiersza pomiaru', metody: ['updateMeasurementRow'], wiersze: ['snap'],
    przygotuj: async (v, s) => { const r = await v.savePatient(naglowek(1, { pomiary: [[60, 110], [72, 118]] }), { dedup: false }); s.P = r.patientId; s.S = r.snapshotId; },
    mutacja: async (v, s) => { await v.updateMeasurementRow(s.P, { key: '72|118.00|20.00' }, { ageMonths: 72, height: 119, weight: 20 }); },
    klucze: (s) => [`${s.P}/${s.S}`] },
  { nr: 'PM7', opis: 'usunięcie bieżącego pomiaru z awansem starszego', metody: ['deleteMeasurementRow'], wiersze: ['snap'],
    przygotuj: async (v, s, o) => {
      const tresc = naglowek(1, { wzrost: 118, masa: 20, pomiary: [[60, 110], [72, 118]] });
      Object.assign(tresc.user, { age: 6, ageMonths: 0 }); // bieżący pomiar = wiersz 72 mies.
      const r = await v.savePatient(tresc, { dedup: false }); s.P = r.patientId; s.S = r.snapshotId;
      s.haki = []; o.v.onPatientSaved((d) => { s.haki.push(d); });
    },
    mutacja: async (v, s) => {
      s.haki.length = 0;
      await v.deleteMeasurementRow(s.P, { key: '72|118.00|20.00' });
      expect(s.haki.map((d) => d.promoted === true), 'kontrola: onPatientSaved z awansem (promoted)').toEqual([true]);
    },
    klucze: (s) => [`${s.P}/${s.S}`] },
  { nr: 'PM8', opis: 'kosz', metody: ['moveSnapshotToTrash'], wiersze: ['stomb'], warianty: ['starszy', 'nowszy'], podnosi: 'karta',
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23, 24])).w; },
    mutacja: async (v, s) => { await v.moveSnapshotToTrash(s.P, s.w[0]); }, klucze: (s) => [s.w[0]] },
  { nr: 'PM9', opis: 'kosz przypiętej („Odepnij i usuń”)', metody: ['moveSnapshotToTrash'], wiersze: ['stomb'],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23])).w; await v.setSnapshotPinned(s.P, s.w[0], true); },
    mutacja: async (v, s) => { await v.moveSnapshotToTrash(s.P, s.w[0], { odepnij: true }); }, klucze: (s) => [s.w[0]] },
  { nr: 'PM10', opis: '„Przywróć” (zapis przywrócenia)', metody: ['restoreTrashedSnapshot'], wiersze: ['snap'], warianty: ['nowszy'],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23, 24])).w; await v.moveSnapshotToTrash(s.P, s.w[0]); },
    mutacja: async (v, s) => { expect((await v.restoreTrashedSnapshot(s.P, s.w[0])).alreadyInCard, 'kontrola: zapis przywrócenia').toBeUndefined(); },
    klucze: (s) => [`${s.P}/${s.w[0]}`],
    // Nagrobek nowszy: wpis kosza tej wersji zostaje u B i u B′ (kosz karty usuniętej później).
    roznicaNagrobka: (r) => [`kosz:${r.s.w[0]}|${r.s.P} (tylko y)`] },
  // Stan jak w kosz-po-kluczu-przywroc.test.mjs („przerwane »Przywróć« w miejscu”): pierwsze „Przywróć” przerwane
  // blokadą sejfu zaraz po zapisie rekordu wersji (hak atrapy), potem zalogowanie od nowa — wersja jest w karcie,
  // a nagłówek karty i wpis kosza jeszcze bez zmian.
  { nr: 'PM11', opis: '„Przywróć” — „już w karcie” z przebudową nagłówka', metody: ['restoreTrashedSnapshot'], wiersze: ['snap'],
    przygotuj: async (v, s, o) => {
      s.w = (await karta(v, s, 1, [20, 23, 25])).w;
      await v.moveSnapshotToTrash(s.P, s.w[0]);
      const h = o.idb.__atrapa.hak({ przy: 'success', baza: bazaSejfu(o), sklep: 'snapshots', metoda: 'put' }, () => { o.zablokuj(); });
      const pierwsze = await v.restoreTrashedSnapshot(s.P, s.w[0]).then(() => 'ok', (e) => e.code);
      expect({ pierwsze, hak: h.wywolany }, 'kontrola: pierwsze „Przywróć” przerwane po zapisie wersji').toEqual({ pierwsze: 'SESSION_CHANGED', hak: 1 });
      await o.zaloguj('A');
      expect({ wersje: (await o.v.getPatient(s.P)).snapshots.length, kosz: (await o.v.listTrashedSnapshots()).some((e) => e.snapshotId === s.w[0]) },
        'kontrola: wersja w karcie i w koszu').toEqual({ wersje: 3, kosz: true });
    },
    mutacja: async (v, s) => { expect((await v.restoreTrashedSnapshot(s.P, s.w[0])).alreadyInCard, 'kontrola: już w karcie').toBe(true); },
    klucze: (s) => [`${s.P}/${s.w[0]}`] },
  // Stan jak PRZ0 w przywroc-z-karty.test.mjs, bez rozjazdu zegarów: A daje s1 do kosza, bliźniak K daje do kosza s2,
  // A scala ładunek K — s2 jest ostatnią wersją karty A, więc zostaje w karcie i jest w koszu; A poprawia s2 (później niż
  // usunięcie). „Przywróć” s2 — „już w karcie”: nagłówek karty zgodny (bez zapisu karty), wpis kosza zdjęty. Zdarzenie
  // wersji s2 (poprawionej później niż usunięcie) zdejmuje ten wpis kosza także u odbiorcy, jak pełny ładunek.
  { nr: 'PM12', opis: '„Przywróć” — „już w karcie” bez zmiany nagłówka', metody: ['restoreTrashedSnapshot'], wiersze: ['snap'],
    przygotuj: async (v, s, o) => {
      s.w = (await karta(v, s, 1, [20, 23])).w;
      const K = await blizniak(o);
      await v.moveSnapshotToTrash(s.P, s.w[0]);
      await K.z.moveSnapshotToTrash(s.P, s.w[1]);
      await v.mergeSyncPayload(await K.v.exportSyncPayload());
      expect({ karta: (await o.v.getPatient(s.P)).snapshots.map((x) => x.snapshotId), kosz: (await o.v.listTrashedSnapshots()).map((e) => e.snapshotId).sort() },
        'kontrola: s2 w karcie i w koszu').toEqual({ karta: [s.w[1]], kosz: [...s.w].sort() });
      await masa(v, s, s.w[1], 78, { preserveSavedAt: true });
    },
    mutacja: async (v, s) => { expect((await v.restoreTrashedSnapshot(s.P, s.w[1])).alreadyInCard, 'kontrola: już w karcie').toBe(true); },
    klucze: (s) => [`${s.P}/${s.w[1]}`] },
  // Stan „żywa Y” jak w kosz-po-kluczu-przywroc.test.mjs (wersja leży pod inną kartą niż karta wpisu kosza): A scala
  // X → Y i daje do kosza w Y wszystko poza x; bliźniak T (sprzed scalenia) dopisuje do X nową wizytę i daje x do kosza
  // w X; A scala ładunek T — u A: X[nowa], Y[x], wpis x pod X. „Przywróć” x przywraca ją w Y (tam leży).
  { nr: 'PM13', opis: '„Przywróć” wersji leżącej pod inną kartą', metody: ['restoreTrashedSnapshot'], wiersze: ['snap'],
    przygotuj: async (v, s, o) => {
      const X = await karta(v, {}, 1, [20, 23]); s.X = X.pid; s.x = X.w[1];
      s.Y = (await karta(v, {}, 2, [18])).pid;
      s.P = s.Y;
      const T = await blizniak(o);
      await v.mergePatients(s.X, s.Y);
      for (const w of (await o.v.getPatient(s.Y)).snapshots) if (w.snapshotId !== s.x) await v.moveSnapshotToTrash(s.Y, w.snapshotId, { odepnij: true });
      await T.z.savePatient(naglowek(1, { masa: 27 }), { dedup: false, patientId: s.X });
      await T.z.moveSnapshotToTrash(s.X, s.x);
      await v.mergeSyncPayload(await T.v.exportSyncPayload());
      const wKarcie = async (pid) => (await o.v.getPatient(pid)).snapshots.map((w) => w.snapshotId === s.x);
      expect({ X: await wKarcie(s.X), Y: await wKarcie(s.Y), wpis: (await o.v.listTrashedSnapshots()).find((e) => e.snapshotId === s.x).patientId === s.X },
        'kontrola: x w Y, wpis x pod X').toEqual({ X: [false], Y: [true], wpis: true });
    },
    mutacja: async (v, s) => { expect((await v.restoreTrashedSnapshot(s.X, s.x)).patientId === s.Y, 'kontrola: przywrócone w Y').toBe(true); },
    klucze: (s) => [`${s.Y}/${s.x}`] },
  { nr: 'PM14', opis: 'przywróć wersję jako nową', metody: ['restoreSnapshotAsNew'], wiersze: ['snap'],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23])).w; },
    mutacja: async (v, s, o) => {
      await v.restoreSnapshotAsNew(s.P, s.w[0]);
      s.S = (await o.v.getPatient(s.P)).snapshots.map((x) => x.snapshotId).filter((id) => !s.w.includes(id));
    },
    klucze: (s) => s.S.map((id) => `${s.P}/${id}`) },
  { nr: 'PM15', opis: 'retencja 2 wersji', metody: ['pruneSnapshotsForPatient'], wiersze: ['stomb', 'stomb'],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23, 24])).w; },
    mutacja: async (v, s) => { cichaRetencja(); s.wynik = await v.pruneSnapshotsForPatient(s.P, { recentHours: 0 }); },
    klucze: (s) => s.wynik.prunedIds },
  // Wersja, której usunięcie się nie udało (jednorazowa usterka atrapy przy usuwaniu rekordu wersji), zostaje w karcie,
  // a jej nagrobek retencji jest zdjęty (ta sama gałąź co wersja zmieniona w trakcie przycinania).
  { nr: 'PM16', opis: 'retencja z wersją, której nie udało się usunąć', metody: ['pruneSnapshotsForPatient'], wiersze: ['stomb'],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23, 24])).w; },
    mutacja: async (v, s, o) => {
      cichaRetencja();
      const u = o.idb.__atrapa.usterka({ przy: 'delete', baza: bazaSejfu(o), sklep: 'snapshots', blad: 'UnknownError' });
      s.wynik = await v.pruneSnapshotsForPatient(s.P, { recentHours: 0 });
      expect({ usterka: u.uzyta, przycietych: s.wynik.prunedCount }, 'kontrola: jedno usunięcie nieudane').toEqual({ usterka: 1, przycietych: 1 });
    },
    klucze: (s) => s.wynik.prunedIds },
  // Przepis jak w przypieta-w3-import.test.mjs (import zapisu usuniętego do kosza): plik karty sprzed kosza, potem import.
  // Wersję z kosza emitują zapis importu i zdjęcie wpisu kosza (Bkz_poImporcie) — w kroku importu jeden wiersz.
  { nr: 'PM17', opis: 'import pliku karty z wersją leżącą w koszu', metody: ['importPatientFromEnvelope'], wiersze: ['snap'],
    partie: [{ reason: 'importPatientFromEnvelope', count: 1 }],
    przygotuj: async (v, s, o) => {
      s.w = (await karta(v, s, 1, [22, 23])).w;
      s.rev = (await o.v.getPatient(s.P)).snapshots.find((x) => x.snapshotId === s.w[0]).rev;
      s.plik = await o.v.exportPatientEnvelope(s.P);
      await v.moveSnapshotToTrash(s.P, s.w[0]);
    },
    mutacja: async (v, s, o) => { await v.importPatientFromEnvelope(s.plik, o.A.haslo); },
    klucze: (s) => [`${s.P}/${s.w[0]}`],
    kontrola: async (r) => {
      const { s } = r;
      expect((await r.o.v.getPatient(s.P)).snapshots.find((x) => x.snapshotId === s.w[0]).rev, 'PM17: wersja z kosza z rev + 1').toBe(s.rev + 1);
      expect((await r.B.v.listTrashedSnapshots()).map((e) => e.snapshotId), 'PM17: wpis kosza zdjęty u odbiorcy zdarzeń').toEqual([]);
    } },
  { nr: 'PM18', opis: '„Scal pacjentów” (źródło: 2 wersje, notatka, lista)', metody: ['mergePatients'],
    wiersze: ['snap', 'snap', 'snap', 'ptomb', 'pnote', 'plist'],
    przygotuj: async (v, s) => {
      s.P1 = (await karta(v, s, 1, [22])).pid;
      const z = await karta(v, {}, 2, [28, 30]); s.P2 = z.pid; s.wz = z.w;
      s.N = (await v.savePatientNote(NOTATKA(s.P2))).id;
      s.L = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P2] })).id;
    },
    mutacja: async (v, s) => { s.S = (await v.mergePatients(s.P2, s.P1)).snapshotId; },
    // Wersje przeniesione (kolejność z listy sklepu), potem głowa scalenia, nagrobek karty źródłowej, notatka, lista.
    klucze: (s) => [`${s.P1}/${s.wz[0]}`, `${s.P1}/${s.wz[1]}`, `${s.P1}/${s.S}`, s.P2, s.N, s.L], uloz: (l) => [...l.slice(0, 2).sort(), ...l.slice(2)] },
  { nr: 'PM19', opis: '„Scal z istniejącym” (osoba spoza bazy z notatką i listą)', metody: ['mergeExternalIntoPatient'], wiersze: ['ptomb', 'pnote', 'plist'],
    przygotuj: async (v, s) => {
      await karta(v, s, 1, [22]);
      s.Z = (await v.saveExternalPatient({ lastName: 'Testowa', firstName: 'Ola', sex: 'K', birthYear: '2016' })).patientId;
      s.N = (await v.savePatientNote(NOTATKA(s.Z))).id;
      s.L = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.Z] })).id;
    },
    mutacja: async (v, s) => { await v.mergeExternalIntoPatient(s.Z, s.P); }, klucze: (s) => [s.Z, s.N, s.L] },
  { nr: 'PM20', opis: '„Usuń pacjenta” z 2 notatkami', metody: ['removePatient'], wiersze: ['ptomb', 'pnotetomb', 'pnotetomb'],
    przygotuj: async (v, s) => {
      await karta(v, s, 1, [22]);
      s.N = [(await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna 1'))).id, (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna 2'))).id];
    },
    mutacja: async (v, s) => { await v.removePatient(s.P); }, klucze: (s) => [s.P, ...s.N], uloz: (l) => [l[0], ...l.slice(1).sort()] },
  // Przepis jak P7 w notatki-za-karta.test.mjs: A usuwa kartę z notatkami; bliźniak K (sprzed usunięcia) dopisuje wizytę;
  // delta karty K → A (buildPatientDelta, applyEncryptedDelta) — karta wraca u A bez notatek, nagrobki notatek z polem.
  { nr: 'PM21', opis: '„Usuń pacjenta”, karta wróciła bez notatek', metody: ['removePatient'], wiersze: ['ptomb', 'pnotetomb', 'pnotetomb'],
    przygotuj: async (v, s, o) => {
      await karta(v, s, 1, [22]);
      s.N = [(await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna 1'))).id, (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna 2'))).id];
      const K = await blizniak(o);
      await v.removePatient(s.P);
      await K.z.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: s.P });
      await v.applyEncryptedDelta(await K.v.buildPatientDelta(s.P));
      const lad = await o.v.exportSyncPayload();
      expect({ karta: maKarte(lad, s.P), notatki: lad.patientNotes.length, pola: lad.patientNoteTombstones.map((t) => !!t.deletedWithPatient) },
        'kontrola: karta wróciła bez notatek, nagrobki z polem').toEqual({ karta: true, notatki: 0, pola: [true, true] });
    },
    mutacja: async (v, s) => { await v.removePatient(s.P); }, klucze: (s) => [s.P, ...s.N], uloz: (l) => [l[0], ...l.slice(1).sort()] },
  { nr: 'PM22', opis: 'notatka pacjenta: nowa', metody: ['savePatientNote'], wiersze: ['pnote'], warianty: ['starszy', 'nowszy'],
    przygotuj: async (v, s) => { await karta(v, s, 1, [22]); },
    mutacja: async (v, s) => { s.N = (await v.savePatientNote(NOTATKA(s.P))).id; }, klucze: (s) => [s.N] },
  { nr: 'PM22', opis: 'notatka pacjenta: poprawka', metody: ['savePatientNote'], wiersze: ['pnote'], warianty: ['starszy', 'nowszy'],
    przygotuj: async (v, s) => { await karta(v, s, 1, [22]); s.N = (await v.savePatientNote(NOTATKA(s.P))).id; },
    mutacja: async (v, s) => { await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna notatka (poprawiona)', { id: s.N })); }, klucze: (s) => [s.N],
    // Nagrobek nowszy: B usunął kartę razem z tą notatką (nagrobek notatki z polem), poprawka A jest wcześniejsza.
    roznicaNagrobka: (r, nagrobek) => (nagrobek === 'nowszy' ? [`pnote:${r.s.N} (tylko x)`, `pnotetomb:${r.s.N} (tylko y)`] : []) },
  // Przepis jak CZ2 w notatki-za-karta.test.mjs: bliźniak K usuwa kartę z notatką, A scala kopię konta K — karta jest,
  // nagrobek notatki z polem („czeka”); zapis notatki zostawia nagrobek z chwilą zapisu.
  { nr: 'PM23', opis: 'zapis notatki w stanie „czeka”', metody: ['savePatientNote'], wiersze: ['pnote', 'pnotetomb'],
    przygotuj: async (v, s, o) => {
      await karta(v, s, 1, [22]); s.N = (await v.savePatientNote(NOTATKA(s.P))).id;
      const K = await blizniak(o);
      await K.z.removePatient(s.P);
      await v.mergeVaultBackup(await K.v.exportVaultBackup(), o.A.haslo);
      const lad = await o.v.exportSyncPayload();
      expect({ karta: maKarte(lad, s.P), notatki: lad.patientNotes.map((n) => n.id), pola: lad.patientNoteTombstones.map((t) => !!t.deletedWithPatient) },
        'kontrola: stan „czeka”').toEqual({ karta: true, notatki: [s.N], pola: [true] });
    },
    mutacja: async (v, s) => { await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna notatka (poprawiona)', { id: s.N })); }, klucze: (s) => [s.N, s.N] },
  { nr: 'PM24', opis: 'usuń notatkę', metody: ['removePatientNote'], wiersze: ['pnotetomb'],
    przygotuj: async (v, s) => { await karta(v, s, 1, [22]); s.N = (await v.savePatientNote(NOTATKA(s.P))).id; },
    mutacja: async (v, s) => { await v.removePatientNote(s.N); }, klucze: (s) => [s.N] },
  ...[['completePatientNote', 'ukończ notatkę'], ['uncompletePatientNote', 'cofnij ukończenie'], ['noShowPatientNote', '„nie przyszedł”'], ['snoozePatientNote', 'odłóż notatkę']].map(([m, opis]) => ({
    nr: 'PM25', opis, metody: [m], wiersze: ['pnote'],
    przygotuj: async (v, s) => {
      await karta(v, s, 1, [22]);
      s.N = (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna kontrola', { dueDateISO: '2026-03-10' }))).id;
      if (m === 'uncompletePatientNote') await v.completePatientNote(s.N);
    },
    mutacja: async (v, s) => { await (m === 'snoozePatientNote' ? v[m](s.N, '2026-03-20') : v[m](s.N)); }, klucze: (s) => [s.N] })),
  { nr: 'PM26', opis: 'plan opieki: utwórz', metody: ['mutateCarePlan'], wiersze: ['pnote', 'pnote'],
    przygotuj: async (v, s) => { await karta(v, s, 1, [22]); },
    mutacja: async (v, s) => {
      const r = await v.mutateCarePlan({ patientId: s.P, operationId: 'fikcyjna-operacja-planu-1', action: 'create', title: 'Fikcyjny plan opieki' });
      expect(r.saved, 'kontrola: plan zapisany').toBe(true); s.plan = r.planId;
    },
    klucze: (s) => [s.plan, `care-decision-${s.plan}`] },
  // Usunięcie wpisu planu (przepis jak care-plans-note-removal-vault.test.mjs). Odbiorcy — zdarzeń i pełnego ładunku tak
  // samo — przewijają plan do potomka nadawcy i zapisują jego dokładną wersję (ta sama treść, rev i updatedAtISO;
  // P-PLAN-POTOMEK, care-plans-sync-descendant.test.mjs). Do tej poprawki: rev + 1 i chwila scalenia jako różnica D(A, B).
  { nr: 'PM26', opis: 'plan opieki: usuń wpis planu', metody: ['mutateCarePlan'], wiersze: ['pnote', 'pnotetomb'],
    przygotuj: async (v, s) => {
      await karta(v, s, 1, [22]);
      s.plan = (await v.mutateCarePlan({ patientId: s.P, operationId: 'fikcyjna-operacja-planu-1', action: 'create', title: 'Fikcyjny plan opieki' })).planId;
      const c = await v.getCarePlan(s.plan);
      const r = await v.mutateCarePlan({ action: 'addNote', text: 'Fikcyjne ustalenie do usunięcia.', dateISO: '2026-03-02', operationId: 'fikcyjna-operacja-planu-2', planId: c.id, patientId: s.P, baseRev: c.rev });
      expect(r.saved, 'kontrola: wpis planu zapisany').toBe(true);
      s.wpis = 'care-note-fikcyjna-operacja-planu-2';
    },
    mutacja: async (v, s) => {
      const dto = await v.getCarePlanNoteEntries(s.plan);
      const e = dto.entries.find((x) => x.noteId === s.wpis);
      const r = await v.mutateCarePlan({ action: 'removePlanNote', patientId: dto.patientId, planId: dto.planId, baseRev: dto.rev, operationId: 'fikcyjna-operacja-planu-3', noteId: s.wpis, linkedRev: e.linkedRev, readToken: e.readToken });
      expect(r.saved && r.plan.removedNoteIds, 'kontrola: wpis usunięty').toEqual([s.wpis]);
    },
    klucze: (s) => [s.plan, s.wpis] },
  { nr: 'PM27', opis: 'wynik przypomnienia', metody: ['saveReminderOutcome'], wiersze: ['pnote', 'pnote'],
    przygotuj: async (v, s, o) => {
      await karta(v, s, 1, [22]);
      s.N = (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjny kontakt o badaniu', { category: 'reminder-exam', dueDateISO: '2026-03-02', reminderContext: { version: 1, kind: 'reminder' } }))).id;
      s.rev = (await o.v.getPatientNote(s.N)).rev;
    },
    mutacja: async (v, s) => {
      const r = await v.saveReminderOutcome({ id: s.N, patientId: s.P, baseRev: s.rev, operationId: 'fikcyjna-operacja-przypomnienia-1', action: 'complete', dateISO: '2026-03-02',
        text: 'Fikcyjny opis wykonania.', next: { title: 'Fikcyjny dalszy kontakt', dateISO: '2026-04-02' } });
      expect(r.saved, 'kontrola: wynik zapisany').toBe(true); s.nast = r.nextId;
    },
    klucze: (s) => [s.N, s.nast] },
  { nr: 'PM28', opis: 'migracja wpisów spoza bazy', metody: ['migrateExternalNotesToRegistry'], wiersze: ['snap', 'snap', 'pnote', 'pnote', 'pnote'],
    przygotuj: async (v, s, o) => {
      s.N = [];
      for (const [nazwa, termin] of [['Fikcyjna Anna', '2026-03-11'], ['FIKCYJNA ANNA', '2026-03-12'], ['Fikcyjny Zenon', '2026-03-13']]) {
        s.N.push((await v.savePatientNote({ patientId: o.v.EXTERNAL_PATIENT_ID, title: 'Fikcyjny starszy wpis', externalName: nazwa, dueDateISO: termin })).id);
      }
    },
    mutacja: async (v) => { expect(await v.migrateExternalNotesToRegistry(), 'kontrola: 2 osoby, 3 wpisy').toEqual({ persons: 2, notes: 3 }); },
    sprawdzStan: async (r) => {
      const osoby = (await r.o.v.listExternalPatients()).map((p) => p.patientId).sort();
      expect(r.wiersze.slice(0, 2).map((w) => w.entityKey.split('/')[0]).sort(), 'PM28: snap nowych osób spoza bazy').toEqual(osoby);
      expect(r.wiersze.slice(2).map((w) => w.entityKey).sort(), 'PM28: pnote przepisanych wpisów').toEqual(r.s.N.slice().sort());
      expect(listaEncji(r.eB), 'PM28: encje(B) = encje(B′)').toEqual(listaEncji(r.eBl));
      expect(opisD(r.dB), 'PM28: D(A, B)').toEqual([]);
    } },
  { nr: 'PM29', opis: 'notatka biblioteki: dodaj', metody: ['saveNote'], wiersze: ['note'],
    mutacja: async (v, s) => { s.L = (await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' })).id; }, klucze: (s) => [s.L] },
  { nr: 'PM30', opis: 'notatka biblioteki: usuń', metody: ['removeNote'], wiersze: ['notetomb'],
    przygotuj: async (v, s) => { s.L = (await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' })).id; },
    mutacja: async (v, s) => { await v.removeNote(s.L); }, klucze: (s) => [s.L] },
  { nr: 'PM31', opis: 'lista: dodaj', metody: ['savePatientList'], wiersze: ['plist'],
    przygotuj: async (v, s) => { await karta(v, s, 1, [22]); },
    mutacja: async (v, s) => { s.L = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P] })).id; }, klucze: (s) => [s.L] },
  { nr: 'PM32', opis: 'lista: dodaj pacjenta do listy', metody: ['addPatientToList'], wiersze: ['plist'],
    przygotuj: async (v, s) => { await karta(v, s, 1, [22]); s.L = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [] })).id; },
    mutacja: async (v, s) => { await v.addPatientToList(s.L, s.P); }, klucze: (s) => [s.L] },
  { nr: 'PM33', opis: 'lista: usuń listę', metody: ['deletePatientList'], wiersze: ['plisttomb'],
    przygotuj: async (v, s) => { await karta(v, s, 1, [22]); s.L = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P] })).id; },
    mutacja: async (v, s) => { await v.deletePatientList(s.L); }, klucze: (s) => [s.L] },
  // Hak VildaPersistence.onPreferenceWrite (pole okna przed załadowaniem sejfu, jak meta-konta-blokada.test.mjs) — poza
  // VildaVault, więc bez metody o.v w mutacji.
  { nr: 'PM34', opis: 'preferencja przez hak VildaPersistence', metody: [], wiersze: ['pref'],
    opcjeOkna: { pola: { VildaPersistence: { onPreferenceWrite(cb) { hakPreferencji.zapis = cb; } } } },
    mutacja: async () => { krok(); await hakPreferencji.zapis({ key: 'fikcyjnaPreferencja', value: '1' }); }, klucze: () => ['fikcyjnaPreferencja'] },
  { nr: 'PM35', opis: 'poczekalnia: termin', metody: ['setWaitlistSchedule'], wiersze: ['pref'],
    mutacja: async (v) => { await v.setWaitlistSchedule('Fikcyjna procedura', { dateISO: '2026-03-15' }); }, klucze: () => ['wlsched'] },
  { nr: 'PM35', opis: 'poczekalnia: dodaj kolejkę', metody: ['addWaitlistList'], wiersze: ['pref'],
    mutacja: async (v) => { await v.addWaitlistList('Fikcyjna procedura'); }, klucze: () => ['wllists'] },
  { nr: 'PM35', opis: 'poczekalnia: usuń kolejkę', metody: ['removeWaitlistList'], wiersze: ['pref'],
    przygotuj: async (v) => { await v.addWaitlistList('Fikcyjna procedura'); },
    mutacja: async (v) => { await v.removeWaitlistList('Fikcyjna procedura'); }, klucze: () => ['wllists'] },
  { nr: 'PM36', opis: 'rejestracja klucza dostępu', metody: ['registerPasskey'], wiersze: ['pk'],
    mutacja: async (v, s, o) => { atrapaKlucza(o, 'fikcyjny-klucz-1'); await v.registerPasskey('Fikcyjny telefon'); }, klucze: () => ['fikcyjny-klucz-1'] },
  // „Roaming”: po zapisie klucza (i zdarzeniu) sejf wysyła dane klucza do chmury — w teście bez sieci (fetch odrzuca),
  // więc wynik ESCROW_UPLOAD_FAILED, a klucz zostaje zapisany lokalnie.
  { nr: 'PM36', opis: 'rejestracja klucza dostępu („roaming”)', metody: ['registerPasskeyForRoaming'], wiersze: ['pk'],
    mutacja: async (v, s, o) => {
      vi.stubGlobal('fetch', async () => { throw new TypeError('test: bez sieci'); });
      atrapaKlucza(o, 'fikcyjny-klucz-2');
      expect(await v.registerPasskeyForRoaming('Fikcyjny klucz').then(() => 'ok', (e) => e.code), 'kontrola: zapis lokalny bez wysyłki').toBe('ESCROW_UPLOAD_FAILED');
    },
    klucze: () => ['fikcyjny-klucz-2'] },
  { nr: 'PM37', opis: 'usunięcie klucza dostępu', metody: ['removePasskey'], wiersze: ['pktomb'],
    przygotuj: async (v, s, o) => { atrapaKlucza(o, 'fikcyjny-klucz-1'); await v.registerPasskey('Fikcyjny telefon'); },
    mutacja: async (v, s, o) => { await v.removePasskey(o.A.userId, 'fikcyjny-klucz-1'); }, klucze: () => ['fikcyjny-klucz-1'] },
  { nr: 'PM38', opis: 'zmiana hasła', metody: ['changePassword'], wiersze: ['cred'],
    mutacja: async (v, s, o) => { await v.changePassword(o.A.haslo, 'Fikcyjne#NoweHaslo!2026xx'); }, klucze: () => ['cred'] },
  { nr: 'PM38', opis: 'reset hasła', metody: ['resetPasswordWhileUnlocked'], wiersze: ['cred'],
    mutacja: async (v) => { await v.resetPasswordWhileUnlocked('Fikcyjne#ResetHasla!2026yy'); }, klucze: () => ['cred'] },
  // Usunięcie wersji bez nagrobka jest lokalne (żaden ekran go nie woła): wersja zostaje u obu odbiorców.
  { nr: 'PM39', opis: 'usunięcie wersji (deleteSnapshot)', metody: ['deleteSnapshot'], wiersze: [],
    przygotuj: async (v, s) => { s.w = (await karta(v, s, 1, [22, 23])).w; },
    mutacja: async (v, s) => { await v.deleteSnapshot(s.P, s.w[0]); },
    sprawdzStan: async (r) => {
      const lokalne = [`wersja:${r.s.P}/${r.s.w[0]} (tylko y)`];
      expect({ B: opisD(r.dB), Bl: opisD(r.dBl) }, 'PM39: wersja zostaje u B i u B′').toEqual({ B: lokalne, Bl: lokalne });
    } },
  // Scalanie z chmury przy otwartej bramce: pełny ładunek bliźniaka K (nowa wersja, notatka zapisana i usunięta, lista
  // usunięta, notatka biblioteki, zmiana hasła), delta karty i koperty zdarzeń K — hooki tylko z akcjami scalania, bez
  // wierszy, bez operacji na bazie kolejki i bez blokady konta.
  { nr: 'PM40', opis: 'scalanie z chmury: mergeSyncPayload, applyEncryptedDelta, applyEncryptedEvent', metody: ['mergeSyncPayload', 'applyEncryptedDelta'], wiersze: [],
    przygotuj: async (v, s, o) => {
      await karta(v, s, 1, [22]);
      s.n1 = (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna 1'))).id;
      s.L = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P] })).id;
      s.K = await blizniak(o);
      s.haki = [];
      for (const h of ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged', 'onPatientListChanged', 'onPasskeyChanged', 'onCredentialChanged']) {
        o.v[h]((d) => { s.haki.push(`${h}:${(d && d.action) || 'zapis'}`); });
      }
    },
    mutacja: async (v, s, o) => {
      const { K } = s;
      s.haki.length = 0;
      s.zadania0 = o.locks.zadania.length;
      await K.z.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: s.P });
      const n2 = (await K.z.savePatientNote(NOTATKA(s.P, 'Fikcyjna 2'))).id;
      await K.z.removePatientNote(s.n1);
      await K.z.deletePatientList(s.L);
      await K.z.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
      await K.z.changePassword(o.A.haslo, 'Fikcyjne#NoweHaslo!2026xx');
      await v.mergeSyncPayload(await K.v.exportSyncPayload());
      await K.z.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: s.P });
      await v.applyEncryptedDelta(await K.v.buildPatientDelta(s.P));
      const sid = (await K.z.savePatient(naglowek(1, { masa: 25 }), { dedup: false, patientId: s.P })).snapshotId;
      await K.z.savePatientNote(NOTATKA(s.P, 'Fikcyjna 2 (poprawiona)', { id: n2 }));
      s.koperty = [];
      for (const k of [await K.ev.buildSnapshotEvent(s.P, sid, null), await K.ev.buildPatientNoteEvent(n2, null)]) {
        krok();
        s.koperty.push((await o.ev.applyEncryptedEvent((await K.ev.encryptEvent(k)).env)).status);
      }
    },
    sprawdzStan: async (r) => {
      const { s, o } = r;
      expect(s.koperty, 'PM40: koperty zastosowane').toEqual(['applied', 'applied']);
      expect([...new Set(s.haki)].sort(), 'PM40: hooki tylko z akcjami scalania (zmiana hasła — z chmury)').toEqual([
        'onCredentialChanged:password-changed-remotely', 'onPatientListChanged:merge', 'onPatientNoteChanged:merge', 'onPatientNoteChanged:merge-delete',
      ]);
      expect(o.logKolejki(r.znacznik), 'PM40: bez operacji na bazie kolejki').toEqual([]);
      expect(o.locks.zadania.slice(s.zadania0).filter((z) => z.nazwa.startsWith('vilda-sync-db:')).length, 'PM40: bez blokady konta').toBe(0);
    } },
  // ── Importy partią (E2-PR3a3, wiersz 17) ──
  // Plik karty sprzed „Usuń pacjenta”; bliźniaki powstają po usunięciu, więc mają nagrobek karty i nagrobki notatek.
  // Import zdejmuje nagrobki u A bez zdarzenia — niesie je snap z kartą o chwili importu i pnote (jak zapis).
  { nr: 'PM41', opis: 'import pliku karty usuniętej (2 wersje, 2 notatki; odbiorcy z nagrobkiem karty i notatek)', metody: ['importPatientFromEnvelope'],
    wiersze: ['snap', 'snap', 'pnote', 'pnote'], partie: [{ reason: 'importPatientFromEnvelope', count: 4 }],
    przygotuj: async (v, s, o) => {
      s.w = (await karta(v, s, 1, [22, 23])).w;
      s.N = [(await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna 1'))).id, (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna 2'))).id];
      s.plik = await o.v.exportPatientEnvelope(s.P);
      await v.removePatient(s.P);
    },
    przedMutacja: async (B, Bl, s) => {
      for (const [nazwa, x] of [['B', B], ['B′', Bl]]) {
        const lad = await x.v.exportSyncPayload();
        expect({ karta: maKarte(lad, s.P), ptomb: (lad.tombstones || []).some((t) => t.patientId === s.P), pnotetomb: (lad.patientNoteTombstones || []).map((t) => t.id).sort() },
          `kontrola: ${nazwa} bez karty, z nagrobkiem karty i notatek`).toEqual({ karta: false, ptomb: true, pnotetomb: [...s.N].sort() });
      }
    },
    mutacja: async (v, s, o) => { await v.importPatientFromEnvelope(s.plik, o.A.haslo); },
    klucze: (s) => [...s.w.map((id) => `${s.P}/${id}`), ...s.N], uloz: wGrupach(2, 2),
    kontrola: async (r) => {
      const notatki = (lad) => (lad.patientNotes || []).map((n) => n.id).sort();
      expect({ B: maKarte(r.eB, r.s.P), Bl: maKarte(r.eBl, r.s.P), nB: notatki(r.eB), nBl: notatki(r.eBl) }, 'PM41: karta i notatki wracają u odbiorców')
        .toEqual({ B: true, Bl: true, nB: [...r.s.N].sort(), nBl: [...r.s.N].sort() });
    } },
  // Bliźniak K dopisuje wersję i notatkę, A importuje plik karty K — wersja obecna w karcie A bez wiersza.
  { nr: 'PM42', opis: 'import pliku karty z nową wersją i notatką bliźniaka', metody: ['importPatientFromEnvelope'], wiersze: ['snap', 'pnote'],
    partie: [{ reason: 'importPatientFromEnvelope', count: 2 }], warianty: ['starszy', 'nowszy'],
    przygotuj: async (v, s, o) => {
      await karta(v, s, 1, [22]);
      krok(); await ucichnij(o);
      const K = await blizniak(o);
      s.S = (await K.z.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: s.P })).snapshotId;
      s.N = (await K.z.savePatientNote(NOTATKA(s.P, 'Fikcyjna notatka bliźniaka'))).id;
      s.plik = await K.v.exportPatientEnvelope(s.P);
    },
    mutacja: async (v, s, o) => { await v.importPatientFromEnvelope(s.plik, o.A.haslo); },
    klucze: (s) => [`${s.P}/${s.S}`, s.N] },
  // Bliźniak K: nowa wersja karty P, nowa karta Q z 2 wersjami i notatką, poprawka notatki n0 karty P, notatka biblioteki,
  // lista z Q, usunięcie listy L0, termin poczekalni; A scala kopię konta K.
  { nr: 'PM43', opis: 'scalenie kopii konta bliźniaka (nowa karta z 2 wersjami, nowa wersja karty istniejącej, nowa i poprawiona notatka, notatka biblioteki, lista, usunięta lista, poczekalnia)',
    metody: ['mergeVaultBackup'], wiersze: ['snap', 'snap', 'snap', 'pnote', 'pnote', 'note', 'plist', 'plisttomb', 'pref'],
    partie: [{ reason: 'mergeVaultBackup', count: 9 }], warianty: ['starszy', 'nowszy'],
    przygotuj: async (v, s, o) => {
      await karta(v, s, 1, [22]);
      s.L0 = (await v.savePatientList({ name: 'Fikcyjna lista 0', memberIds: [s.P] })).id;
      s.n0 = (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna notatka 0'))).id;
      krok(); await ucichnij(o);
      const K = await blizniak(o);
      s.S = (await K.z.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: s.P })).snapshotId;
      const q = await karta(K.z, {}, 2, [30, 31]);
      s.Q = q.pid; s.wQ = q.w;
      s.nQ = (await K.z.savePatientNote(NOTATKA(s.Q, 'Fikcyjna notatka bliźniaka'))).id;
      await K.z.savePatientNote(NOTATKA(s.P, 'Fikcyjna notatka 0 (poprawiona)', { id: s.n0 }));
      s.L = (await K.z.saveNote({ title: 'Fikcyjny szablon bliźniaka', category: 'badanie', body: 'Fikcyjna treść szablonu.' })).id;
      s.LK = (await K.z.savePatientList({ name: 'Fikcyjna lista bliźniaka', memberIds: [s.Q] })).id;
      await K.z.deletePatientList(s.L0);
      await K.z.setWaitlistSchedule('Fikcyjna procedura', { dateISO: '2026-03-15' });
      s.kopia = await K.v.exportVaultBackup();
    },
    mutacja: async (v, s, o) => { await v.mergeVaultBackup(s.kopia, o.A.haslo); },
    klucze: (s) => [`${s.P}/${s.S}`, ...s.wQ.map((id) => `${s.Q}/${id}`), s.nQ, s.n0, s.L, s.LK, s.L0, 'wlsched'], uloz: wGrupach(3, 2),
    // Nagrobek karty P u odbiorców zabiera też notatkę n0 (nagrobek notatki), poprawioną u A.
    roznicaNagrobka: (r) => [`pnote:${r.s.n0} (tylko x)`, `pnotetomb:${r.s.n0} (tylko y)`] },
  // Kopia własnego konta: wersje są w kartach (bez snap), każda encja sekcji pliku daje wiersz o treści, którą odbiorca
  // już ma; nagrobki z builderem bez rekordu — bez wiersza.
  { nr: 'PM44', opis: 'scalenie własnej kopii konta (bez nowych danych)', metody: ['mergeVaultBackup'],
    wiersze: ['pnote', 'pnote', 'pnote', 'note', 'plist', 'pref'], partie: [{ reason: 'mergeVaultBackup', count: 6 }],
    przygotuj: async (v, s, o) => {
      await karta(v, s, 1, [22, 23]);
      await karta(v, {}, 2, [30]);
      s.N = [];
      for (let i = 1; i <= 3; i += 1) s.N.push((await v.savePatientNote(NOTATKA(s.P, `Fikcyjna notatka ${i}`))).id);
      s.L = (await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' })).id;
      s.LI = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P] })).id;
      await v.setWaitlistSchedule('Fikcyjna procedura', { dateISO: '2026-03-15' });
      s.kopia = await o.v.exportVaultBackup();
    },
    przedMutacja: async (B, Bl, s) => { s.encjeB = listaEncji(await B.v.exportSyncPayload()); },
    mutacja: async (v, s, o) => { await v.mergeVaultBackup(s.kopia, o.A.haslo); },
    klucze: (s) => [...s.N, s.L, s.LI, 'wlsched'], uloz: wGrupach(3),
    kontrola: async (r) => { expect(listaEncji(r.eB), 'PM44: wiersze bez skutku u odbiorcy (encje B przed i po)').toEqual(r.s.encjeB); } },
  // Odtworzenie konta z kopii tworzy nowe konto (sesja konta z kopii przed pierwszym zapisem) — partia idzie do jego
  // kolejki. Odbiorcy: konto źródłowe sprzed danych (ten sam klucz), więc cały stan konta przychodzi z wierszy partii.
  { nr: 'PM45', opis: 'odtworzenie konta z kopii (2 karty, 3 wersje, notatka, usunięta notatka, notatka biblioteki, lista, usunięta lista, poczekalnia)',
    metody: ['restoreVaultBackup'], wiersze: ['snap', 'snap', 'snap', 'pnote', 'pnotetomb', 'note', 'plist', 'plisttomb', 'pref'],
    partie: [{ reason: 'restoreVaultBackup', count: 9 }], odbiorcySprzedDanych: true, konto: (s) => s.wynik.userId,
    przygotuj: async (v, s, o) => {
      s.w = (await karta(v, s, 1, [22, 23])).w;
      const k2 = await karta(v, {}, 2, [30]);
      s.P2 = k2.pid; s.w2 = k2.w;
      s.N = (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna notatka 1'))).id;
      s.Nu = (await v.savePatientNote(NOTATKA(s.P, 'Fikcyjna notatka 2'))).id;
      await v.removePatientNote(s.Nu);
      s.L = (await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' })).id;
      s.Lu = (await v.savePatientList({ name: 'Fikcyjna lista do usunięcia', memberIds: [s.P] })).id;
      await v.deletePatientList(s.Lu);
      s.LI = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P] })).id;
      await v.setWaitlistSchedule('Fikcyjna procedura', { dateISO: '2026-03-15' });
      s.kopia = await o.v.exportVaultBackup();
    },
    przedMutacja: async (B, Bl, s) => {
      for (const [nazwa, x] of [['B', B], ['B′', Bl]]) expect((await x.v.listPatients()).length, `kontrola: ${nazwa} — konto źródłowe bez kart`).toBe(0);
    },
    mutacja: async (v, s, o) => { o.zablokuj(); s.wynik = await v.restoreVaultBackup(s.kopia, o.A.haslo, { label: 'Fikcyjne konto z kopii' }); },
    klucze: (s) => [...s.w.map((id) => `${s.P}/${id}`), ...s.w2.map((id) => `${s.P2}/${id}`), s.N, s.Nu, s.L, s.LI, s.Lu, 'wlsched'],
    uloz: wGrupach(3),
    // Konto z kopii ma passwordUpdatedAtISO: null — builder poświadczenia nie daje zdarzenia, więc cred zostaje różnicą
    // wobec odbiorców (u B i u B′ ta sama).
    roznica: () => ['cred:cred [(wartość)]'],
    kontrola: async (r) => {
      expect(r.o.v.getCurrentUser().userId, 'PM45: sesja konta z kopii').toBe(r.s.wynik.userId);
      expect(r.s.wynik.userId, 'PM45: nowe konto').not.toBe(r.o.A.userId);
      expect(r.o.kolejka('A').filter((w) => w.seqLocal > r.s0), 'PM45: kolejka konta źródłowego bez nowych wierszy').toEqual([]);
      expect(opisD(r.dBl), 'PM45: D(konto z kopii, B′) = D(konto z kopii, B)').toEqual(opisD(r.dB));
    } },
  // Strażnik: import starego formatu idzie przez zapis karty (emiter onPatientSaved) — bez kroku importu i bez partii.
  { nr: 'PM46', opis: 'import starego formatu (importLegacyJsonPatient)', metody: ['importLegacyJsonPatient'], wiersze: ['snap'], partie: [],
    mutacja: async (v, s) => { const r = await v.importLegacyJsonPatient(naglowek(5)); s.P = r.patientId; s.S = r.snapshotId; },
    klucze: (s) => [`${s.P}/${s.S}`] },
  // Domyślne okno uprzęży (emisja: false): metody z METODY_DANYCH przy zamkniętej bramce, poza nimi pole okna true.
  { nr: 'PM47', opis: 'importy przy zamkniętej bramce (import karty, scalenie i odtworzenie kopii konta)', metody: ['importPatientFromEnvelope', 'mergeVaultBackup', 'restoreVaultBackup'],
    wiersze: [], partie: [], opcjeOkna: { emisja: false },
    przygotuj: async (v, s, o) => {
      await karta(v, s, 1, [22, 23]);
      await v.savePatientNote(NOTATKA(s.P));
      await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
      s.plik = await o.v.exportPatientEnvelope(s.P);
      s.kopia = await o.v.exportVaultBackup();
      await v.removePatient(s.P);
    },
    mutacja: async (v, s, o) => {
      await v.importPatientFromEnvelope(s.plik, o.A.haslo);
      await v.mergeVaultBackup(s.kopia, o.A.haslo);
      o.zablokuj();
      s.wynik = await v.restoreVaultBackup(s.kopia, o.A.haslo, { label: 'Fikcyjne konto z kopii' });
    },
    sprawdzStan: async (r) => {
      const { o, s } = r;
      expect(o.win.VILDA_EVENT_LOG, 'kontrola: pole bramki okna poza metodami danych').toBe(true);
      expect({ A: o.jestBaza('A'), zKopii: o.jestBaza(s.wynik.userId) }, 'PM47: bez bazy kolejki').toEqual({ A: false, zKopii: false });
      expect(o.logKolejki(r.znacznik), 'PM47: bez operacji na bazie kolejki').toEqual([]);
      expect((await o.idb.databases()).map((d) => d.name).filter((n) => n.startsWith('vilda_sync_')), 'PM47: bazy vilda_sync_*').toEqual([]);
      expect((await o.v.listPatients()).length, 'kontrola: konto z kopii ma kartę').toBe(1);
    } },
];

describe('pokrycie mutacji: wiersze kolejki i stan odbiorcy (E2-PR3a2, E2-PR3a3, E2-PR3b)', () => {
  it('część emisji istnieje: VildaVault._eventLog.emissionsSettled', async () => {
    const o = await oknoMagazynu({ konta: 'A', emisja: true });
    okna.push(o);
    expect(typeof o.ev.emissionsSettled).toBe('function');
  });
  it('część partii istnieje: VildaVault._eventLog.onBulkChange', async () => {
    const o = await oknoMagazynu({ konta: 'A', emisja: true });
    okna.push(o);
    expect(typeof o.ev.onBulkChange).toBe('function');
  });
  const OPIS_NAGROBKA = { starszy: 'nagrobek karty u odbiorcy starszy niż mutacja', nowszy: 'nagrobek karty u odbiorcy nowszy niż mutacja' };
  for (const p of PRZYPADKI) {
    const partia = p.partie && p.partie.length ? `; onBulkChange ${p.partie.map((d) => `${d.reason} ${d.count}`).join(', ')}` : '';
    const w = (p.wiersze.join(', ') || 'bez wierszy') + partia;
    it(`${p.nr} ${p.opis}: ${w}; odbiorca bez nagrobka`, async () => { await sprawdz(p); }, CZAS);
    for (const n of p.warianty || []) {
      const hak = n === 'starszy' && p.podnosi ? ' (karta częściowa; po haku H1 pfull — brak różnicy)' : '';
      it(`${p.nr} ${p.opis}: ${w}; ${OPIS_NAGROBKA[n]}${hak}`, async () => { await sprawdz(p, n); }, CZAS);
    }
  }
});

describe('pokrycie mutacji: samokontrola uprzęży (METODY_DANYCH)', () => {
  it('każda metoda, która w przypadku PM daje wiersz, jest w METODY_DANYCH', () => {
    const zle = [];
    for (const p of PRZYPADKI) {
      if (p.wiersze && !p.wiersze.length) continue;
      for (const m of p.metody) if (!METODY.has(m)) zle.push(`${p.nr} ${p.opis}: ${m}`);
    }
    expect(zle).toEqual([]);
    expect(PRZYPADKI.filter((p) => !p.wiersze || p.wiersze.length).length, 'kontrola: przypadki z wierszami').toBeGreaterThan(40);
  });
});
