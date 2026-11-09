// P-DZIENNIK-ZDARZEN (E2-PR3a2) — test pokrycia mutacji jako różnica stanu odbiorcy. Każda mutacja danych sejfu przy
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
//       starszy, mutacja podnosi chwilę karty (nowa wersja, kosz) — zamiast B ≡ B′: D(A, B) = dokładnie to, czego
//         zdarzenia nie niosą („karta częściowa” — naprawa w E2-PR3b: hak pełnej karty po przegranym nagrobku),
//         a D(A, B′) = ∅ (pełna historia z pełnego ładunku);
//       starszy, mutacja chwili karty nie podnosi (notatka) — B ≡ B′ i D(A, B) = D(A, B′): karta tylko u A, nagrobek
//         tylko u B;
//       nowszy — B ≡ B′ (karty nie ma u B ani u B′), a po scaleniu eksportu B na A karta znika u A, wiersze A te same
//         (liczba, rodzaje, klucze, stan pending).
// Samokontrola uprzęży: w mutacji wołane są metody danych z METODY_DANYCH (tests/support/okno-magazynu.mjs), odczyty
// albo scalanie; każda metoda, która w przypadku daje wiersz, jest w METODY_DANYCH — domyślne okno uprzęży woła je przy
// zamkniętej bramce, inaczej przypadek starszego testu magazynu dostałby wiersze emisji po cichu.
//
// PRZYPADKI
//   PM1  nowa karta → snap.
//   PM2  nowa wersja → snap; także z nagrobkiem u odbiorcy starszym i nowszym.
//   PM3  poprawka starszej wersji (preserveSavedAt) → snap tej wersji; także z nagrobkiem nowszym.
//   PM4–PM5  gwiazdka, odpięcie → snap.
//   PM6–PM7  edycja wiersza pomiaru, usunięcie bieżącego pomiaru z awansem starszego → snap.
//   PM8  kosz → stomb; także z nagrobkiem starszym (kosz nie niesie wersji) i nowszym.
//   PM9  kosz przypiętej („Odepnij i usuń”) → stomb.
//   PM10 „Przywróć” (zapis przywrócenia) → snap; także z nagrobkiem nowszym.
//   PM11 „Przywróć” — „już w karcie” z przebudową nagłówka (po przerwanym „Przywróć”) → snap.
//   PM12 „Przywróć” — „już w karcie” bez zmiany nagłówka → snap (zdjęcie wpisu kosza niesie zdarzenie wersji).
//   PM13 „Przywróć” wersji leżącej pod inną kartą → snap pod kartą, w której leży.
//   PM14 przywróć wersję jako nową → snap.
//   PM15 retencja 2 wersji → stomb, stomb.
//   PM16 retencja z wersją, której nie udało się usunąć → stomb tylko nagrobka, który został.
//   PM17 import pliku karty z wersją leżącą w koszu → wśród wierszy snap przepisanej wersji (rev + 1); tylko wiersze
//        (pełna różnica importu — E2-PR3a3).
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
//   Samokontrola uprzęży (METODY_DANYCH).
//
// Czerwone na bazie (sejf origin/audyt aab11479 z tym plikiem i uprzężą tego PR): 58 z 61 — „część emisji istnieje”
// (brak emissionsSettled) i wszystkie przypadki PM poza PM39, PM40 (brak wierszy po mutacji; PM17 — brak snap
// przepisanej wersji).
// Zielone z natury (strażniki regresji): PM39, PM40 — mutacja bez wiersza także na bazie; samokontrola uprzęży nie
// zależy od sejfu.
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
// Bliźniak: niezależna kopia baz atrapy, to samo konto (ten sam klucz), bramka zamknięta; B.z — widok z krokiem zegara.
async function blizniak(o) {
  const B = await oknoMagazynu({ idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A' });
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

// ── Przebieg przypadku ───────────────────────────────────────────────────────────────────────────────────────────────
// p: { przygotuj(v, s, o)?, mutacja(v, s, o), opcjeOkna? }; nagrobek: null | 'starszy' | 'nowszy' — B i B′ usuwają kartę
// s.P przed mutacją A albo po niej.
async function przebieg(p, nagrobek = null) {
  const o = await oknoMagazynu({ konta: 'A', emisja: true, ...(p.opcjeOkna || {}) });
  okna.push(o);
  const wolane = [];
  const v = zZegarem(o.v, wolane);
  const s = {};
  if (p.przygotuj) await p.przygotuj(v, s, o);
  krok();
  await ucichnij(o);
  const B = await blizniak(o);
  const Bl = await blizniak(o);
  // Nagrobek w tej samej chwili u B i u B′, minutę od mutacji (poza pasmem ratunku notatek 1 s).
  const usunUOdbiorcow = async () => { krok(60_000); await B.v.removePatient(s.P); await Bl.v.removePatient(s.P); await B.cisza(); await Bl.cisza(); };
  if (nagrobek === 'starszy') { await usunUOdbiorcow(); krok(60_000); }
  const s0 = ostatniSeq(o);
  const znacznik = o.znacznik();
  wolane.length = 0;
  await p.mutacja(v, s, o);
  const metody = wolane.slice();
  krok();
  await ucichnij(o);
  if (nagrobek === 'nowszy') await usunUOdbiorcow();
  const wiersze = o.kolejka('A').filter((w) => w.seqLocal > s0);
  const statusy = [];
  for (const w of wiersze) statusy.push((await B.ev.applyEncryptedEvent(w.env)).status);
  await B.cisza();
  await Bl.v.mergeSyncPayload(await o.v.exportSyncPayload());
  await Bl.cisza();
  const eA = await o.v.exportSyncPayload();
  const eB = await B.v.exportSyncPayload();
  const eBl = await Bl.v.exportSyncPayload();
  return { o, B, Bl, s, wiersze, statusy, metody, znacznik, eA, eB, eBl, dB: D(kanon(eA), kanon(eB)), dBl: D(kanon(eA), kanon(eBl)) };
}

// Wiersze (literał, wszystkie applied u B, klucze encji) i metody mutacji (samokontrola).
function sprawdzWiersze(r, p) {
  if (p.wiersze) expect(r.wiersze.map(opisWiersza), `${p.nr}: rodzaje i stany wierszy po mutacji (kolejność seqLocal)`).toEqual(p.wiersze);
  expect(r.statusy, `${p.nr}: applyEncryptedEvent na B`).toEqual(r.wiersze.map(() => 'applied'));
  if (p.klucze) {
    const uloz = p.uloz || ((l) => l);
    expect(uloz(r.wiersze.map((w) => w.entityKey)), `${p.nr}: klucze encji wierszy`).toEqual(uloz(p.klucze(r.s)));
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
    return r;
  }
  const P = r.s.P;
  const kartaINagrobek = [`karta:${P} (tylko x)`, `ptomb:${P} (tylko y)`];
  const wersjeA = (r.eA.patients.find((k) => k.patientId === P) || { snapshots: [] }).snapshots.map((x) => x.snapshotId);
  const niesione = new Set(r.wiersze.filter((w) => w.kind === 'snap').map((w) => w.entityKey));
  const wersjeTylkoA = (pomin) => wersjeA.filter((sid) => !pomin.has(`${P}/${sid}`)).map((sid) => `wersja:${P}/${sid} (tylko x)`);
  if (nagrobek === 'starszy' && p.podnosi) {
    // Karta częściowa — naprawa w E2-PR3b: nagrobek u B przegrywa z nowszą chwilą karty, a zdarzenia nie niosą starszych
    // wersji (snap niesie jedną wersję; kosz — żadnej, a karta bez wizyt u odbiorcy bez karty nie powstaje), pełny
    // ładunek niesie całą historię.
    const oczekiwane = p.podnosi === 'karta' ? [...kartaINagrobek, ...wersjeTylkoA(niesione)] : wersjeTylkoA(niesione);
    expect(opisD(r.dB), `${p.nr}: D(A, B) = to, czego zdarzenia nie niosą (karta częściowa)`).toEqual(oczekiwane.sort());
    expect(opisD(r.dBl), `${p.nr}: D(A, B′) = ∅`).toEqual([]);
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
// 'karta'), roznica? (D(A, B) bez nagrobka), roznicaNagrobka? (dodatkowe pozycje D przy nagrobku), sprawdzStan?
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
  { nr: 'PM17', opis: 'import pliku karty z wersją leżącą w koszu', metody: ['importPatientFromEnvelope'],
    przygotuj: async (v, s, o) => {
      s.w = (await karta(v, s, 1, [22, 23])).w;
      s.rev = (await o.v.getPatient(s.P)).snapshots.find((x) => x.snapshotId === s.w[0]).rev;
      s.plik = await o.v.exportPatientEnvelope(s.P);
      await v.moveSnapshotToTrash(s.P, s.w[0]);
    },
    mutacja: async (v, s, o) => { await v.importPatientFromEnvelope(s.plik, o.A.haslo); },
    sprawdzStan: async (r) => {
      const { s } = r;
      expect(r.wiersze.filter((w) => w.kind === 'snap').map((w) => w.entityKey), 'PM17: wiersz snap przepisanej wersji').toContain(`${s.P}/${s.w[0]}`);
      expect((await r.o.v.getPatient(s.P)).snapshots.find((x) => x.snapshotId === s.w[0]).rev, 'PM17: wersja z kosza z rev + 1').toBe(s.rev + 1);
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
];

describe('pokrycie mutacji: wiersze kolejki i stan odbiorcy (E2-PR3a2)', () => {
  it('część emisji istnieje: VildaVault._eventLog.emissionsSettled', async () => {
    const o = await oknoMagazynu({ konta: 'A', emisja: true });
    okna.push(o);
    expect(typeof o.ev.emissionsSettled).toBe('function');
  });
  const OPIS_NAGROBKA = { starszy: 'nagrobek karty u odbiorcy starszy niż mutacja', nowszy: 'nagrobek karty u odbiorcy nowszy niż mutacja' };
  for (const p of PRZYPADKI) {
    const w = p.wiersze ? p.wiersze.join(', ') || 'bez wierszy' : 'wśród wierszy snap przepisanej wersji';
    it(`${p.nr} ${p.opis}: ${w}; odbiorca bez nagrobka`, async () => { await sprawdz(p); }, CZAS);
    for (const n of p.warianty || []) it(`${p.nr} ${p.opis}: ${w}; ${OPIS_NAGROBKA[n]}`, async () => { await sprawdz(p, n); }, CZAS);
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
