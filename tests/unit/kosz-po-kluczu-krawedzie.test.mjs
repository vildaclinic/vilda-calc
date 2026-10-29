// P-KOSZ-PO-KLUCZU (PR-E3) — krawędzie reguł A1, A3 (Q8) i A4 (opis reguł w kosz-po-kluczu.test.mjs) i poprawek drugiej
// rundy (F2, F3), których katalog nie dotyka: wiersze z przeglądu poprawności i jakości testów oraz z mutacji kodu E3.
//
// Reguły w skrócie.
//   A1  W pełnym scalaniu wpis kosza (i retencji) znajduje swoją wersję po kluczu także pod inną kartą niż karta wpisu
//       (Bkz_gdzieIndziej — w pętli kart przed Bgw_wskrzes) i rozstrzyga ją jak pod kartą wpisu (Bkz_obceKarty): zmiana
//       późniejsza niż usunięcie wygrywa i zdejmuje wpis, przypięta przeżywa retencję, nieczytelna przy retencji zostaje.
//       Pokonana oddaje wkład wpisowi (nieczytelna — bez treści, F2) i znika po zapisie listy (Bkz_usunZObcych); karta
//       bez wersji znika bez nowego nagrobka i liczy się w deletedPatientCount wyniku mergeSyncPayload.
//   F3  Wyjątek ostatniej wersji karty pod inną kartą nie obowiązuje tylko dla starego duplikatu: karta, w której wizyta
//       leży, ma znany nagrobek pacjenta (z ładunku albo tutejszy — Bkz_nagrKart z Le), a karta wpisu jest tu.
//       Inaczej wizyta zostaje i przyjmuje najnowszą treść (Q8): żywa karta docelowa „Scal pacjentów” nie znika.
//   A3  (Q8) Zostawiona wersja przyjmuje najnowszą treść (treść nagrobka albo kopia z ładunku) i najpóźniejszy rejestr
//       gwiazdki (także z nagrobka). Cały rekord — rev = max, savedAtISO i updatedAtISO ze źródła; rekord złożony —
//       chwila zmiany = późniejsza z prawdziwych chwil, nie później niż usunięcie, rev = max; lastSavedAtISO karty bez
//       zmian.
//   A4  Wersja wspólna dwóm kartom (W3): treść po chwili treści, gwiazdka po rejestrze — kopia ze starej karty wnosi
//       późniejszą treść albo sam późniejszy rejestr gwiazdki (Bsw_decyzja 'tresc', Bsw_wklad, Bsw_poprawTresc); rekord
//       złożony ma rev = max + 1 (starsza aplikacja 221 czyta najpierw rev).
//
// Przygotowanie (polkrata-uprzaz.mjs: prawdziwy vilda_vault.js w osobnym oknie na urządzenie, kopia 221 dla D, magazyn
// w pamięci z licznikiem zapisów, sztuczny zegar, retencja w tle wyłączona): na K „Testowy Jan” X (x1 120 cm / 20 kg,
// x 125 cm / 23 kg, x3 130 cm / 25 kg), „Testowa Ola” Y (y) i Z (z) albo tylko dwie karty; komplet na P i C; kroki co
// minutę. Przebieg: pierwsze scalenia w podanej kolejności („K←C,P←K”: K scala ładunek C, potem P ładunek K), 3 rundy
// „każdy z każdym”, pełny stan (pelnyStan z kosz-po-kluczu-wspolne.mjs), runda kontrolna z licznikiem zapisów. Widok:
// „Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y” (m1, m2 — głowy „Scal pacjentów”; kosz: wersja@karta wpisu:masa).
// 8 kolejności tylko tam, gdzie wynik albo stan na 8240e0df zależał od kolejności; gdzie indziej jedna albo dwie.
//
// Scenariusze — wynik teraz / na kodzie sprzed zmiany 8240e0df (te same kroki) / mutanty kodu E3, które test zabija.
//   M01 X (x1, x) i Z; K: X → Z, K→C, kosz x (pod Z); P (bez wiedzy) przypina x w X; C poprawia x na 74, C→K, retencja
//       C przycina Z, C→K (K: wpis retencji x pod Z z cieniem 74); K←P → K X[x:74*] Z[m], po rundach to samo na trzech,
//       0 zapisów / dotąd K X[] Z[m,x:74*] (pusta karta X, x przeniesiony z cienia pod Z) / Bgw_wskrzes przed
//       Bkz_gdzieIndziej, przypięta pod inną kartą nieoszczędzana przy retencji (Bkz_obceKarty).
//   M05/M06 X (x1, x) i Y; P: kosz x w X; K (bez wiedzy): X → Y, kosz y, x1 i głowy (x ostatnią wersją Y, X nie ma) → K
//       Y[x:23], z poprawką P na 74 przed koszem Y[x:74] (Q8 pod inną kartą, rev 1); P i C Y[y] (E1 — obecność) / dotąd
//       z poprawką K Y[x:23] / wyjątek nigdy nie zostaje pod inną kartą (Y znika z K), bez Q8 w Bkz_obceKarty, cały
//       rekord Q8 z rev + 1 albo z tutejszym updatedAtISO, bez szukania po kluczu dla karty wpisu bez wersji.
//   F3  C: notatka na X, C→K, C→P; C: X → Y, notatka na Y, kosz wszystkiego w Y poza x; C→K; P (bez wiedzy): nowa wizyta
//       w X, kosz x w X albo retencja X → K i C Y[x:23], P Y[y], notatki pod Y na trzech, 8/8 / dotąd P jeszcze
//       X[nowa,x1,x3] (bez A1), wariant retencji jak teraz / warunek F3 bez części „karta ma znany nagrobek” (Y znika
//       z K i C, notatki bez karty), wyjątek nigdy nie zostaje pod inną kartą.
//   F3 (karta wpisu nieobecna) K: X → Y; P poprawia x w X na 74; K: kosz x (pod Y); P: kosz x1 i x3 w X, P: Y → Z → P
//       X[x:74] (X ma nagrobek, ale karty Y tu nie ma), K bez X — x tylko w koszu, „Przywróć” x: brak-karty; C jedno
//       z dwóch / dotąd C w 3/8 X[x:23] / bez części „karta wpisu jest tu” (P bez X, x już w żadnej karcie, 8/8),
//       wyjątek nigdy nie zostaje pod inną kartą; w 3/8 także bez Q8 w Bkz_obceKarty, z tutejszym updatedAtISO całego
//       rekordu Q8 i bez szukania po kluczu dla karty wpisu bez wersji.
//   M42 P: X → Y, kosz y, x1 i głowy (Y = [x, x3]); K (bez wiedzy): kosz x i x3 w X → P Y[x3] (x pokonana, x3 ostatnia),
//       K Y[y], C jedno z dwóch, 8/8 / dotąd P Y[x3,x:23] (x pod Y mimo kosza K), K X[x1] Y[y] (x1 pod X mimo kosza P),
//       C jedno z trzech / licznik wersji obcej karty bez
//       zmniejszania (Y znika z P), wyjątek nigdy albo zawsze pod inną kartą (Le bez Bkz_nagrKart), bez szukania po
//       kluczu dla karty wpisu bez wersji, karta bez wersji nieusuwana.
//   F1 (notatki) K: notatka nK na X, K→P, K→C; P: notatka nP-przed; K: X → Y → Z; P: notatka nP-po na X; E4b (P
//       poprawia x na 74, K: kosz x) i kontrola bez poprawki → nK pod Z, nP-przed i nP-po bez karty (patientId X) na
//       trzech, jak gdy X przegrywa ze swoim nagrobkiem / dotąd w E4b P w 8/8 i C w 6/8 z kartą X (C w 3/8 z x:23)
//       i notatkami nP pod X / (E4b) wyjątek zawsze pod inną kartą (Le bez Bkz_nagrKart), karta bez wersji nieusuwana.
//   F2  K: X → Y → Z, K→C; P poprawia x w X na 74, szyfr x na P zepsuty; K: kosz x; P←K → X znika z P, kosz x na P
//       czytelny (23 kg z ładunku K), „Przywróć” x 23 pod Z / dotąd X z nieczytelną x zostaje na P, kosz 23,
//       „Przywróć” też oddaje 23 / wkład z szyfrem nieczytelnej wersji, liczniki wyniku, wyjątek zawsze pod inną
//       kartą, karta bez wersji nieusuwana. Znane ograniczenie (jak na 8240e0df): przy P←C najpierw x przechodzi pod Z
//       z nieczytelnym szyfrem, a kosz K pokonuje ją już w pętli kart — kosz na P nieczytelny, „Przywróć”: nieczytelny.
//   Wynik scalenia E4b (P←K): deletedPatientCount 2, trashedSnapshotCount 1, nagrobki na P tylko X@1 i Y@2 (z K); E4b-2w
//       (P dopisuje nową wizytę do X): 1 i 1, nagłówek X — snapshotCount 1; drugie P←K: 0 i 0 / dotąd 1 i 0, X z x
//       (E4b-2w: snapshotCount 2) / karty usunięte nieliczone, wersje usuniętej karty nieliczone, nagłówek X bez
//       przebudowy po częściowym usunięciu, nowy nagrobek usuniętej karty, karta bez wersji nieusuwana, wyjątek zawsze
//       pod inną kartą.
//   M19 + M23 (jan2) P przypina x (K zna), kosz s1, poprawka x na 78; K (+10 min) „Odepnij i usuń” x; K→P → x 78 bez
//       gwiazdki, rev 2, updatedAtISO = chwila usunięcia; po rundach P i C karta 78 + kosz 78, K kosz 78 / dotąd P
//       karta 78*, C karta 23 / chwila zmiany rekordu złożonego = teraz, bez rejestru gwiazdki nagrobka, rev rekordu
//       złożonego + 1, tutejszy updatedAtISO całego rekordu.
//   M24/M53 (jan2) P: kosz s1; C poprawia x na 74 (preserveSavedAt false i true); K: kosz x; P←K, P←C → x 74, rev 1,
//       savedAtISO t+2 (albo t+0) i updatedAtISO t+2 jak u C, lastSavedAtISO karty t+3 bez zmian / dotąd x 23, rev 0 /
//       savedAtISO tutejszy, updatedAtISO tutejszy, rev + 1, kandydat z ładunku pomijany.
//   A4  K: X → Y → Z; P poprawia x w X na 74, potem K przypina x pod Z (albo K poprawia pod Z, potem P przypina w X);
//       jedno K←P (pełny ładunek albo delta karty X) → K Z 74* r4, po rundach Z[…,x:74*,…] na trzech / dotąd Z 23* r3 /
//       Bsw_decyzja i Bsw_poprawTresc z Bsw_nowszaTresc (poprawka P ginie), Bsw_wklad bez samej gwiazdki, rekord
//       złożony bez + 1.
//   M29 to samo z D na 221 (D ma Z 23* r3 od K) → K←P Z 74* r4, D←K Z 74* r4, po rundach 74* na P, K, D / dotąd 23* r3
//       wszędzie / rekord złożony bez + 1 (D zostaje z 23*), Bsw_decyzja i Bsw_poprawTresc z Bsw_nowszaTresc.
//   E4b-po K: X → Y → Z, kosz x; P (bez wiedzy) poprawia potem x w X na 74 → urządzenie z poprawką po koszu K: x 74 w X,
//       bez wpisu; po rundach X[x:74] Z[…] | nagr Y na trzech / dotąd ten sam stan końcowy, ale P po P←K z x i z wpisem
//       kosza / wersja późniejsza niż usunięcie traktowana jak pokonana (x w koszu na trzech), wpis niezdjęty.
//   M40 przeglądu E4b z retencją K pod Z, poprawka x na P nieczytelna → P: X z samą x (rekord pod X), x1 i x3 usunięte /
//       dotąd X[x1,x,x3] (bez A1) / nieczytelna przy retencji usuwana.
//   P2 w drugą stronę K: X → Y → Z (i poprawka K pod Z na 74 albo gwiazdka K pod Z); P (bez wiedzy) retencja X (x1, x)
//       → Z bez x1 i x na trzech (poprawka K znika), przypięta x zostaje (Z[…,x:23*]), wpis retencji x pod X, 8/8;
//       kontrola tej samej karty — jak dotąd / dotąd K (i C w 2/8) z x1 i x pod Z / przypięta pod inną kartą
//       nieoszczędzana (wiersze z gwiazdką), bez szukania po kluczu dla karty wpisu bez wersji.
//   Kosz > 30 dni E4b, K↔C, P scala 31 dni po koszu K → Z bez x na trzech, wpis kosza x bez treści, kosz pusty (poprawka
//       74 nie przeżywa) / dotąd P X[x:74] / karta bez wersji nieusuwana, wyjątek zawsze pod inną kartą.
//   F-R3 X (x1, x) i Y; K: X → Y, kosz m i x1 (Y = [y, x]); P (bez wiedzy): kosz x w X; K←P, a druga karta przeglądarki
//       K daje do kosza y zaraz po zapisie listy z wpisem x → K Y[x:23] (deletedPatientCount 0), „Przywróć” y działa, po
//       rundach Y[y] na trzech / bez tej poprawki Y znika z K, „Przywróć” y: brak-karty, P i C Y[y] na zawsze / karta
//       usuwana, gdy na świeżym odczycie zostały same wersje do usunięcia (bez decyzji „znika” z Bkz_obceKarty).
//   F-R2 E4b; jedno P←K, potem tylko P↔C (K bez synchronizacji) → na P nagrobki X@1 i Y@2 jak na K (bez nowego), po
//       rundach bez X na P i C / dotąd P bez nagrobka X, C na zawsze X[x:74] obok kosza / brak zapisu nagrobka przy
//       usunięciu duplikatu; nagrobek z chwilą „teraz” (pada też kontrola D-4 A: C dopisuje do X nową wizytę po scaleniu
//       K → X[nowa] na P i C, nagrobek X znika tam, gdzie X jest).
//   Remis (jan2) P: kosz s1 (opcjonalnie wcześniej gwiazdka x tylko na P); K: kosz x i C: poprawka x na 74 w tej samej
//       milisekundzie; P←K, P←C → x na P 74 (74* — rekord złożony), chwila zmiany = chwila kosza K / dotąd x 23 (bez Q8) /
//       straż „nie później niż usunięcie” Bkz_zostawOstatnia z „<” zamiast „<=” (cały rekord, rekord złożony).
//   Q8 pod inną kartą z retencją C: X → Y, kosz Y poza x, C→K; P (bez wiedzy): nowa wizyta w X, poprawka x na 74, P→D,
//       retencja X; K←P → K Y[x:23] (wyjątek ostatniej wersji, nic nowszego), K←D → K Y[x:74] (kopia D pokonana
//       przycięciem daje treść, chwila zmiany nie później niż przycięcie) / dotąd K Y[x:23] / do Q8 w Bkz_obceKarty
//       chwila kosza zamiast chwili przycięcia (wpis retencji bez kosza — Q8 odmawia).
//   Q8 rev (jan2) C: X → W → V (x r2), kosz V poza x; K: x na 74 i kosz; P: kosz s1; C←K → C V[x:74] r2, P←C → P x 74 r2
//       od razu (rev kopii C pokonanej koszem) / dotąd C V[x:23] r2 / rev całego rekordu Q8 bez Bkz_revPom (P r1).
//   Q8 nagłówek P: X → Y, Y = [x]; C poprawia datę urodzenia w x, C→K, K: kosz x; jedno P←K → x i nagłówek Y z nową datą /
//       dotąd x ze starą datą / bez przebudowy nagłówka kart dotkniętych w Bkz_obceKarty (nagłówek ze starą datą).
//   F-D pod dwiema kartami K: X → Z, C: X → Y, K 37, C 41, P przypina; P→K, P→C → K 37* r3, C 41* r3; K→O (221); C→K → K
//       41* r4, K→O → O 41* r4 / dotąd K i C 23* r2 (bez W3 między kartami) / bez warunku „ta sama wersja, obie kopie
//       złożone” w Bsw_rekordW3 (K 41* r3, O zostaje przy 37*).
// Mutant, który przeżywa: treść wkładu Bkz_obceKarty bez granicy 30 dni — równoważny (Bkz_czysc zdejmuje treść starszą
// niż 30 dni przed zapisem listy).
//
// Dane wyłącznie fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  sztucznyZegar, przesunZegar, zegar, urzadzenie, jan, zapisz, gdzie, poprawMase, przypnij, doKosza, sync, rundy, zeruj, zapisy,
  widoki, repo, SEJF,
} from './polkrata-uprzaz.mjs';
import { KOLEJNOSCI_8, ola } from './s4d7-wspolne.mjs';
import { pelnyStan, widok } from './kosz-po-kluczu-wspolne.mjs';

const M = 60e3;
const DZIEN = 864e5;
const ZERO = { lista: 0, wersje: 0, karty: 0 };
const ZERO3 = { P: ZERO, K: ZERO, C: ZERO };
afterEach(() => { vi.useRealTimers(); });

// --- przygotowanie i przebieg ------------------------------------------------------------------------------------------
// Urządzenia P, K, C (i D, gdy jest we flocie) z sejfem z repozytorium albo 221. Na K „Testowy Jan” X (x1 120 cm / 20 kg,
// x 125 cm / 23 kg, x3 130 cm / 25 kg), „Testowa Ola” Y (y 110 cm / 18 kg) i Z (z 111 cm / 19 kg); z dwie = 'Y' albo 'Z'
// tylko X (x1, x) i ta jedna karta Oli. Komplet na pozostałych urządzeniach.
async function przygotuj({ dwie = null, flota = {} } = {}) {
  sztucznyZegar();
  const u = {};
  for (const n of ['P', 'K', 'C', ...Object.keys(flota).filter((n) => !['P', 'K', 'C'].includes(n))]) u[n] = await urzadzenie(n, flota[n] || 'N');
  const x1 = await zapisz(u.K, jan(120, 20)); u.X = x1.patientId;
  const x = await zapisz(u.K, jan(125, 23), { patientId: u.X }); u.sid = x.snapshotId;
  u.wersje = { [x1.snapshotId]: 'x1', [x.snapshotId]: 'x' };
  u.x1 = x1.snapshotId;
  if (!dwie) { const x3 = await zapisz(u.K, jan(130, 25), { patientId: u.X }); u.wersje[x3.snapshotId] = 'x3'; u.x3 = x3.snapshotId; }
  for (const [k, kg] of [['Y', 18], ['Z', 19]]) {
    if (dwie && dwie !== k) continue;
    const r = await zapisz(u.K, ola(110 + kg - 18, kg));
    u[k] = r.patientId; u.wersje[r.snapshotId] = k.toLowerCase(); u[k.toLowerCase()] = r.snapshotId;
  }
  u.karty = { [u.X]: 'X' }; if (u.Y) u.karty[u.Y] = 'Y'; if (u.Z) u.karty[u.Z] = 'Z';
  u.urz = Object.keys(u).filter((n) => /^[PKCD]$/.test(n)).map((n) => u[n]);
  for (const v of u.urz) if (v !== u.K) await sync(u.K, v);
  u.t0 = zegar.t;
  return u;
}
// Krok (co minutę): f() i przesunięcie zegara.
async function krok(f) { przesunZegar(M); return f(); }
// K: „Scal pacjentów” X → Y, Y → Z (głowy scaleń m1, m2).
async function XYZ(u) {
  for (const [z, na, m] of [['X', 'Y', 'm1'], ['Y', 'Z', 'm2']]) u.wersje[(await krok(() => u.K.mergePatients(u[z], u[na]))).snapshotId] = m;
}
async function nowaWizyta(u, n) { const r = await krok(() => u[n].savePatient(jan(135, 27), { dedup: false, patientId: u.X })); u.wersje[r.snapshotId] = 'nowa'; }
async function notatka(u, n, pid, tytul) { await krok(() => u[n].savePatientNote({ patientId: pid, title: tytul, body: 'fikcyjna notatka', category: 'observation' })); }
// Pierwsze scalenia w danej kolejności („K←C,P←K”: K scala ładunek C, potem P ładunek K), 3 rundy „każdy z każdym”,
// pełny stan na trzech, runda kontrolna z licznikiem zapisów, pełny stan po niej.
async function przebieg(u, kol, nazwy = ['P', 'K', 'C']) {
  for (const k of kol ? kol.split(',') : []) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
  const urz = nazwy.map((n) => u[n]);
  await rundy(urz, 3);
  const st = {};
  for (const n of nazwy) st[n] = await pelnyStan(u, u[n]);
  zeruj(urz); await rundy(urz, 1);
  const zap = zapisy(urz);
  const st2 = {};
  for (const n of nazwy) st2[n] = await pelnyStan(u, u[n]);
  const j = JSON.stringify;
  return {
    st, zapisy: zap, widoki: Object.fromEntries(nazwy.map((n) => [n, widok(st[n])])),
    zbiezny: nazwy.every((n) => j(st[n]) === j(st[nazwy[0]])), stabilny: j(st) === j(st2),
  };
}
// Gdzie leży x na urządzeniu: „Z 74* r4”, „brak”.
async function gdzieX(u, v, sid = u.sid) {
  const g = await gdzie(v, sid);
  return g ? `${u.karty[g.pid] || '?'} ${g.s.payload ? g.s.payload.user.weight : 'nieczytelna'}${g.s.pinned ? '*' : ''} r${g.s.rev}` : 'brak';
}
async function koszX(v, sid) { return (await v.listTrashedSnapshots()).find((e) => e.snapshotId === sid) || null; }
// Notatki urządzenia: tytuł → etykieta karty (z „(bez karty)”, gdy karty nie ma), i notatki widoczne pod kartami.
async function notatki(u, v) {
  const karty = (await v.listPatients()).map((p) => p.patientId);
  const gdzieN = {};
  for (const n of await v.listAllPatientNotes()) gdzieN[n.title] = `${u.karty[n.patientId]}${karty.includes(n.patientId) ? '' : ' (bez karty)'}`;
  const widoczne = {};
  for (const pid of karty) {
    const l = await v.listPatientNotesForPatient(pid);
    if (l.length) widoczne[u.karty[pid]] = l.map((n) => n.title).sort().join(',');
  }
  return { gdzie: gdzieN, widoczne };
}
// Szyfr wersji zepsuty w magazynie urządzenia (uszkodzenie danych): wersja nieczytelna.
async function zepsuj(v, sid) {
  const r = await v.__px.getSnapshotForUser(v.__uid, sid);
  await v.__px.putSnapshotForUser(v.__uid, { ...r, payloadCipher: { iv: r.payloadCipher.iv, data: 'AAAA' + r.payloadCipher.data.slice(8) } });
}
const rel = (u, iso) => (iso ? (Date.parse(iso) - u.t0) / M : null);

// --- 1. A1 przed cieniem (M01) -----------------------------------------------------------------------------------------
describe('P-KOSZ-PO-KLUCZU — krawędzie A1: odczyt po kluczu przed Bgw_wskrzes, wyjątek ostatniej wersji pod inną kartą', () => {
  it('M01: przypięta x pod starą X przychodzi na K, którego wpis retencji x (karta Z) ma cień 74 — x 74* zostaje pod X, bez pustej karty, na trzech', async () => {
    const u = await przygotuj({ dwie: 'Z' });
    const m = await krok(() => u.K.mergePatients(u.X, u.Z)); u.wersje[m.snapshotId] = 'm';
    await krok(() => sync(u.K, u.C));
    await krok(() => doKosza(u.K, u.sid));
    await krok(() => u.P.setSnapshotPinned(u.X, u.sid, true));
    await krok(() => poprawMase(u.C, u.sid, 74));
    await krok(() => sync(u.C, u.K));
    await krok(async () => { const r = await u.C.pruneSnapshotsForPatient(u.Z, { recentHours: 0 }); expect(r.prunedIds, 'C: retencja przycina x pod Z').toContain(u.sid); });
    await krok(() => sync(u.C, u.K));
    const nK = ((await u.K.exportSyncPayload()).snapshotTombstones || []).find((e) => e.snapshotId === u.sid);
    expect({ widok: widok(await pelnyStan(u, u.K)), powod: nK && nK.powod, karta: nK && u.karty[nK.patientId] }, 'kontrola: K bez x, wpis retencji x pod Z')
      .toEqual({ widok: 'Z[m] | nagr X', powod: 'retencja', karta: 'Z' });
    await krok(() => sync(u.P, u.K));
    expect(widok(await pelnyStan(u, u.K)), 'K←P: x 74* pod X (treść z cienia, gwiazdka P), Z bez x').toBe('X[x:74*] Z[m]');
    const r = await przebieg(u, 'P←K');
    const w = 'X[x:74*] Z[m]';
    expect(r.widoki, 'po rundach').toEqual({ P: w, K: w, C: w });
    expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
    expect(r.stabilny).toBe(true);
    expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
  }, 30000);

  // M05/M06: wpis kosza x pod X (P), X nie ma na K (K scalił X → Y i dał do kosza resztę Y) — x ostatnią wersją Y na K.
  for (const popr of [false, true]) {
    const kg = popr ? 74 : 23;
    it(`M05/M06: wpis x pod X, X nie ma na K, x ostatnią wersją Y na K${popr ? ' (P poprawia x na 74)' : ''} — K Y[x:${kg}] (Q8), P i C Y[y] (E1)`, async () => {
      const u = await przygotuj({ dwie: 'Y' });
      if (popr) await krok(() => poprawMase(u.P, u.sid, 74));
      await krok(() => doKosza(u.P, u.sid));
      const m = await krok(() => u.K.mergePatients(u.X, u.Y)); u.wersje[m.snapshotId] = 'm';
      for (const s of [u.y, u.x1, m.snapshotId]) await krok(() => u.K.moveSnapshotToTrash(u.Y, s, { odepnij: true }));
      expect(widok(await pelnyStan(u, u.K)), 'kontrola: K — Y[x], X nie ma').toBe('Y[x:23] | kosz m@Y:18 kosz x1@Y:20 kosz y@Y:18 | nagr X');
      await krok(() => sync(u.P, u.K));
      const kosz = `kosz m@Y:18 kosz x@X:${kg} kosz x1@Y:20 kosz y@Y:18 | nagr X`;
      expect({ widok: widok(await pelnyStan(u, u.K)), x: await gdzieX(u, u.K) }, 'K←P').toEqual({ widok: `Y[x:${kg}] | ${kosz}`, x: `Y ${kg} r1` });
      const r = await przebieg(u, 'C←P');
      expect(r.widoki, 'po rundach: Y na trzech, x na K (E1 — obecność pod inną kartą)').toEqual({ P: `Y[y] | ${kosz}`, K: `Y[x:${kg}] | ${kosz}`, C: `Y[y] | ${kosz}` });
      expect(r.stabilny).toBe(true);
      expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
    }, 30000);
  }
});

// --- 2. F3: żywa karta docelowa „Scal pacjentów” zostaje --------------------------------------------------------------
// C: notatka na X, C→K, C→P; C: „Scal pacjentów” X → Y (notatka idzie do Y), notatka na Y, C daje do kosza wszystkie
// wersje Y poza x (Y = [x]); C→K. P (bez wiedzy o scaleniu): nowa wizyta w X, potem kosz x w X (wpis pod X) albo retencja X.
async function zywaY(u, wariant) {
  await notatka(u, 'C', u.X, 'nX-przed');
  await krok(() => sync(u.C, u.K)); await krok(() => sync(u.C, u.P));
  const m = await krok(() => u.C.mergePatients(u.X, u.Y)); u.wersje[m.snapshotId] = 'm';
  await notatka(u, 'C', u.Y, 'nY-po');
  for (const s of (await u.C.getPatient(u.Y)).snapshots) if (s.snapshotId !== u.sid) await krok(() => u.C.moveSnapshotToTrash(u.Y, s.snapshotId, { odepnij: true }));
  await krok(() => sync(u.C, u.K));
  await nowaWizyta(u, 'P');
  if (wariant === 'kosz') await krok(() => doKosza(u.P, u.sid));
  else {
    const r = await krok(() => u.P.pruneSnapshotsForPatient(u.X, { recentHours: 0 }));
    expect(r.prunedIds.map((id) => u.wersje[id]).sort(), 'P: retencja X przycina x1, x i x3').toEqual(['x', 'x1', 'x3']);
  }
}
const ZYWA = {
  kosz: {
    P: 'X[nowa] Y[y] Z[z] | kosz m@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@Y:25 kosz y@Y:18',
    KC: 'X[nowa] Y[x:23] Z[z] | kosz m@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@Y:25 kosz y@Y:18',
  },
  retencja: {
    P: 'X[nowa] Y[y] Z[z] | kosz m@Y:18 kosz x1@X:20 kosz x3@X:25 kosz y@Y:18',
    KC: 'X[nowa] Y[x:23] Z[z] | kosz m@Y:18 kosz x1@X:20 kosz x3@X:25 kosz y@Y:18',
  },
};
describe('P-KOSZ-PO-KLUCZU — F3: karta docelowa „Scal pacjentów” (bez nagrobka) zostaje, gdy jej ostatnią wersję daje do kosza urządzenie ze starą kartą', () => {
  for (const [wariant, w] of Object.entries(ZYWA)) {
    for (const kol of KOLEJNOSCI_8) {
      it(`żywa Y, ${wariant === 'kosz' ? 'kosz x' : 'retencja X'} na P (${kol}): Y[x:23] na K i C, Y[y] na P, notatki Y widoczne na trzech`, async () => {
        const u = await przygotuj();
        await zywaY(u, wariant);
        const r = await przebieg(u, kol);
        expect(r.widoki, 'Y na trzech (Q8), x w Y na K i C').toEqual({ P: w.P, K: w.KC, C: w.KC });
        for (const n of ['P', 'K', 'C']) {
          expect(await notatki(u, u[n]), `${n}: notatki pod Y`).toEqual({ gdzie: { 'nX-przed': 'Y', 'nY-po': 'Y' }, widoczne: { Y: 'nX-przed,nY-po' } });
        }
        expect(r.stabilny).toBe(true);
        expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
      }, 30000);
    }
  }
});

// F3, drugi warunek: wpis kosza x pod Y, a karty Y tu nie ma (P sam scalił Y → Z). K: X → Y; P (bez wiedzy) poprawia
// x w X na 74 (X przeżywa swój nagrobek), K daje x do kosza (pod Y), P daje do kosza x1 i x3 w X (X = [x]) i scala Y → Z.
async function domNieobecny(u) {
  u.wersje[(await krok(() => u.K.mergePatients(u.X, u.Y))).snapshotId] = 'm1';
  await krok(() => poprawMase(u.P, u.sid, 74));
  await krok(() => doKosza(u.K, u.sid));
  for (const s of [u.x1, u.x3]) await krok(() => u.P.moveSnapshotToTrash(u.X, s, { odepnij: true }));
  u.wersje[(await krok(() => u.P.mergePatients(u.Y, u.Z))).snapshotId] = 'm2';
}
describe('P-KOSZ-PO-KLUCZU — F3: karty wpisu tu nie ma — stary duplikat zostaje z ostatnią wersją (Q8), bo „Przywróć” nie ma dokąd jej oddać', () => {
  const kosz = 'kosz x@Y:74 kosz x1@X:20 kosz x3@X:25';
  const zX = `X[x:74] Z[m2,z,y] | ${kosz} | nagr Y`, bezX = `Z[m2,z,y] | ${kosz} | nagr X,Y`;
  for (const kol of KOLEJNOSCI_8) {
    it(`X z nagrobkiem, wpis x pod Y nieobecną na P (${kol}): P X[x:74], K bez X (x tylko w koszu, „Przywróć” — brak karty), C jedno z dwóch`, async () => {
      const u = await przygotuj();
      await domNieobecny(u);
      const r = await przebieg(u, kol);
      expect({ P: r.widoki.P, K: r.widoki.K }, 'P zostawia x w X (karta wpisu Y nieobecna), K nie').toEqual({ P: zX, K: bezX });
      expect([zX, bezX], 'C: X[x:74] albo bez X (obecność jak E1)').toContain(r.widoki.C);
      expect(r.stabilny).toBe(true);
      expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
      let przywroc;
      try { await u.K.restoreTrashedSnapshot(u.Y, u.sid); przywroc = 'ok'; } catch (er) { przywroc = er.code || er.message; }
      expect(przywroc, 'K: „Przywróć” x — karty wpisu Y nie ma').toBe('brak-karty');
    }, 30000);
  }
});

// --- 3. M42: dwie wersje obcej karty pokonane, karta wpisu nieobecna — ostatnia zostaje ----------------------------------
describe('P-KOSZ-PO-KLUCZU — wyjątek ostatniej wersji liczy wersje obcej karty pokonane w tym samym scaleniu (M42)', () => {
  for (const kol of KOLEJNOSCI_8) {
    it(`P: X → Y i kosz y, x1, m (Y = [x, x3]); K (bez wiedzy): kosz x i x3 w X (${kol}) — P Y[x3], K Y[y], C jedno z dwóch (E1)`, async () => {
      const u = await przygotuj();
      const m = await krok(() => u.P.mergePatients(u.X, u.Y)); u.wersje[m.snapshotId] = 'm';
      for (const s of [u.y, u.x1, m.snapshotId]) await krok(() => u.P.moveSnapshotToTrash(u.Y, s, { odepnij: true }));
      expect(widok(await pelnyStan(u, u.P)), 'kontrola: P — Y[x, x3]').toBe('Y[x3,x:23] Z[z] | kosz m@Y:18 kosz x1@Y:20 kosz y@Y:18 | nagr X');
      await krok(() => doKosza(u.K, u.sid)); await krok(() => doKosza(u.K, u.x3));
      const r = await przebieg(u, kol);
      const kosz = 'kosz m@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X';
      expect({ P: r.widoki.P, K: r.widoki.K }, 'P zostawia x3 (ostatnia wersja Y), K y').toEqual({ P: `Y[x3] Z[z] | ${kosz}`, K: `Y[y] Z[z] | ${kosz}` });
      expect([`Y[x3] Z[z] | ${kosz}`, `Y[y] Z[z] | ${kosz}`], 'C: x3 albo y (E1)').toContain(r.widoki.C);
      expect(r.stabilny).toBe(true);
      expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
    }, 30000);
  }
});

// --- 4. F1: notatki starej karty X ---------------------------------------------------------------------------------------
// K: notatka nK na X, K→P, K→C; P: notatka nP-przed (bez synchronizacji); K: X → Y → Z; P (bez wiedzy): notatka nP-po na X;
// E4b: P poprawia x w X na 74, K daje x do kosza; kontrola: bez poprawki (X przegrywa ze swoim nagrobkiem).
describe('P-KOSZ-PO-KLUCZU — F1: notatki starej karty X po usunięciu duplikatu (zachowanie udokumentowane)', () => {
  for (const [wariant, kgs] of [['E4b', [74, KOLEJNOSCI_8]], ['kontrola', [23, [KOLEJNOSCI_8[0], KOLEJNOSCI_8[5]]]]]) {
    const [kg, kols] = kgs;
    for (const kol of kols) {
      it(`${wariant} (${kol}): nK pod Z na trzech; nP-przed i nP-po bez karty (patientId X) na trzech`, async () => {
        const u = await przygotuj();
        await notatka(u, 'K', u.X, 'nK');
        await krok(() => sync(u.K, u.P)); await krok(() => sync(u.K, u.C));
        await notatka(u, 'P', u.X, 'nP-przed');
        await XYZ(u);
        await notatka(u, 'P', u.X, 'nP-po');
        if (wariant === 'E4b') await krok(() => poprawMase(u.P, u.sid, 74));
        await krok(() => doKosza(u.K, u.sid));
        const r = await przebieg(u, kol);
        const w = `Z[m2,m1,z,y,x3,x1] | kosz x@Z:${kg} | nagr X,Y`;
        expect(r.widoki, 'karta X nie ma na trzech').toEqual({ P: w, K: w, C: w });
        for (const n of ['P', 'K', 'C']) {
          expect(await notatki(u, u[n]), `${n}: notatki`).toEqual({
            gdzie: { nK: 'Z', 'nP-przed': 'X (bez karty)', 'nP-po': 'X (bez karty)' }, widoczne: { Z: 'nK' },
          });
        }
        expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
        expect(r.stabilny).toBe(true);
        expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
      }, 30000);
    }
  }
});

// --- 5. F2: nieczytelna kopia pod starą X --------------------------------------------------------------------------------
// K: X → Y → Z, K→C; P (bez wiedzy) poprawia x w X na 74, potem szyfr x na P jest zepsuty (uszkodzenie magazynu); K daje
// x do kosza. Tylko scalenia na P (eksport P i tak nie przechodzi przez nieczytelną wersję — jak dotąd).
async function nieczytelnaNaP(u) {
  await XYZ(u);
  await krok(() => sync(u.K, u.C));
  await krok(() => poprawMase(u.P, u.sid, 74));
  await zepsuj(u.P, u.sid);
  await krok(() => doKosza(u.K, u.sid));
}
async function przywrocNaP(u) {
  try { const r = await u.P.restoreTrashedSnapshot(u.Z, u.sid); return r.alreadyInCard ? 'już w karcie' : 'przywrócono'; } catch (er) { return `błąd ${er.code || er.message}`; }
}
describe('P-KOSZ-PO-KLUCZU — F2: nieczytelna kopia pod starą kartą nie zastępuje czytelnej treści kosza', () => {
  it('P←K: X znika z P, kosz x na P z czytelną treścią 23 kg z ładunku K, „Przywróć” na P oddaje x pod Z (23 kg)', async () => {
    const u = await przygotuj();
    await nieczytelnaNaP(u);
    const wynik = await u.P.mergeSyncPayload(JSON.parse(JSON.stringify(await u.K.exportSyncPayload())));
    expect({ usuniete: wynik.deletedPatientCount, kosz: wynik.trashedSnapshotCount }).toEqual({ usuniete: 2, kosz: 1 });
    const k = await koszX(u.P, u.sid);
    const karty = (await u.P.listPatients()).map((p) => u.karty[p.patientId]);
    expect({ karty, kosz: k && { karta: u.karty[k.patientId], masa: k.payload ? k.payload.user.weight : 'nieczytelna' } }, 'P po P←K')
      .toEqual({ karty: ['Z'], kosz: { karta: 'Z', masa: 23 } });
    expect(await przywrocNaP(u), '„Przywróć” na P').toBe('przywrócono');
    expect(await gdzieX(u, u.P), 'x po „Przywróć”').toBe('Z 23 r3');
  }, 30000);
  it('znane ograniczenie (jak na 8240e0df): P←C, potem P←K — x przechodzi pod Z z nieczytelnym szyfrem, kosz na P nieczytelny, „Przywróć” — błąd nieczytelny', async () => {
    const u = await przygotuj();
    await nieczytelnaNaP(u);
    await sync(u.C, u.P);
    expect(await gdzieX(u, u.P), 'P←C: x pod Z, nieczytelna').toBe('Z nieczytelna r2');
    await sync(u.K, u.P);
    const k = await koszX(u.P, u.sid);
    expect({ x: await gdzieX(u, u.P), kosz: k && (k.payload ? k.payload.user.weight : 'nieczytelna') }, 'P←K').toEqual({ x: 'brak', kosz: 'nieczytelna' });
    expect(await przywrocNaP(u)).toBe('błąd nieczytelny');
  }, 30000);
});

// --- 6. Wynik scalenia i nagłówek karty po usunięciu wersji spod innej karty (M13/M14, M12/M36) ------------------------
// E4b: K: X → Y → Z; P (bez wiedzy) poprawia x w X na 74; K daje x do kosza (pod Z). E4b-2w: P dopisuje jeszcze do X nową
// wizytę — X zostaje na P z samą nową wizytą.
describe('P-KOSZ-PO-KLUCZU — wynik mergeSyncPayload i nagłówek karty po usunięciu duplikatu', () => {
  for (const [wariant, oczek] of [['E4b', { usuniete: 2, kosz: 1, X: null }], ['E4b-2w', { usuniete: 1, kosz: 1, X: { n: 1, wersje: ['nowa'] } }]]) {
    it(`${wariant}: pierwsze P←K — usunięte karty ${oczek.usuniete}, do kosza 1${oczek.X ? ', nagłówek X: 1 wizyta' : ', bez karty X'}; drugie — 0 i 0`, async () => {
      const u = await przygotuj();
      await XYZ(u); await krok(() => poprawMase(u.P, u.sid, 74));
      if (wariant === 'E4b-2w') await nowaWizyta(u, 'P');
      await krok(() => doKosza(u.K, u.sid));
      const wyniki = [];
      for (let i = 0; i < 2; i += 1) {
        const w = await u.P.mergeSyncPayload(JSON.parse(JSON.stringify(await u.K.exportSyncPayload())));
        const n = (await u.P.listPatients()).find((p) => p.patientId === u.X);
        const p = await u.P.getPatient(u.X);
        wyniki.push({ usuniete: w.deletedPatientCount, kosz: w.trashedSnapshotCount, X: n ? { n: n.snapshotCount, wersje: p.snapshots.map((s) => u.wersje[s.snapshotId]) } : null });
      }
      expect(wyniki).toEqual([oczek, { ...oczek, usuniete: 0, kosz: 0 }]);
      // Karta usunięta bez nowego nagrobka: na P tylko nagrobki z ładunku K (X i Y z chwilą „Scal pacjentów” na K).
      const nagr = ((await u.P.exportSyncPayload()).tombstones || []).map((t) => `${u.karty[t.patientId]}@${rel(u, t.deletedAtISO)}`).sort();
      expect(nagr, 'nagrobki pacjentów na P').toEqual(wariant === 'E4b' ? ['X@1', 'Y@2'] : ['Y@2']);
    }, 30000);
  }
});

// --- 7. Q8: rekord złożony i cały rekord z kopii z ładunku -------------------------------------------------------------
// jan2 (polkrata-uprzaz): „Testowy Jan” s1 (120 cm / 20 kg) i x (125 cm / 23 kg) na K, komplet na P i C.
async function jan2() {
  sztucznyZegar();
  const u = {};
  for (const n of ['P', 'K', 'C']) u[n] = await urzadzenie(n);
  const s1 = await zapisz(u.K, jan(120, 20)); u.X = s1.patientId; u.s1 = s1.snapshotId;
  u.sid = (await zapisz(u.K, jan(125, 23), { patientId: u.X })).snapshotId;
  u.karty = { [u.X]: 'X' }; u.wersje = { [u.s1]: 's1', [u.sid]: 'x' };
  u.urz = [u.P, u.K, u.C];
  await sync(u.K, u.P); await sync(u.K, u.C);
  u.t0 = zegar.t;
  return u;
}
async function wersjaX(u, v) { return ((await v.getPatient(u.X)) || { snapshots: [] }).snapshots.find((s) => s.snapshotId === u.sid) || null; }
describe('P-KOSZ-PO-KLUCZU — Q8: chwile, rev i gwiazdka zostawionej ostatniej wersji karty', () => {
  it('M19 + M23: P przypina x, kosz s1, x na 78; K (+10 min) „Odepnij i usuń” x; K→P — x 78 bez gwiazdki, rev 2, zmiana = usunięcie', async () => {
    const u = await jan2();
    await krok(async () => { await u.P.setSnapshotPinned(u.X, u.sid, true); await sync(u.P, u.K); });
    await krok(() => u.P.moveSnapshotToTrash(u.X, u.s1));
    await krok(() => poprawMase(u.P, u.sid, 78));
    przesunZegar(M);
    vi.setSystemTime(zegar.t + 10 * M);
    await u.K.moveSnapshotToTrash(u.X, u.sid, { odepnij: true });
    const usuniecie = new Date().toISOString();
    vi.setSystemTime(zegar.t);
    przesunZegar(15 * M);
    await sync(u.K, u.P);
    const w = await wersjaX(u, u.P);
    expect({ masa: w.payload.user.weight, pin: !!w.pinned, rev: w.rev, zmiana: w.updatedAtISO }, 'P po K→P: rejestr odpięcia z nagrobka, zmiana nie później niż usunięcie')
      .toEqual({ masa: 78, pin: false, rev: 2, zmiana: usuniecie });
    await rundy(u.urz, 3);
    expect(await widoki(u, u.sid, ['P', 'K', 'C']), 'po rundach').toEqual({ P: 'karta 78 + kosz 78', K: 'kosz 78', C: 'karta 78 + kosz 78' });
    zeruj(u.urz); await rundy(u.urz, 1);
    expect(zapisy(u.urz), 'runda kontrolna bez zapisów').toEqual(ZERO3);
  }, 30000);
  for (const zachowaj of [false, true]) {
    it(`M24/M53: C poprawia x na 74 (preserveSavedAt: ${zachowaj}); P←K, P←C — rekord C: zapis t+${zachowaj ? 0 : 2}, zmiana t+2, rev 1, karta bez zmian`, async () => {
      const u = await jan2();
      await krok(() => u.P.moveSnapshotToTrash(u.X, u.s1));
      await krok(async () => {
        const w = await wersjaX(u, u.C);
        await u.C.updateSnapshotPayload(u.X, u.sid, { ...w.payload, user: { ...w.payload.user, weight: 74 } }, { preserveSavedAt: zachowaj });
      });
      await krok(() => u.K.moveSnapshotToTrash(u.X, u.sid));
      przesunZegar(M);
      const opis = async () => {
        const w = await wersjaX(u, u.P);
        const k = await u.P.__px.getPatientForUser(u.P.__uid, u.X);
        return { masa: w.payload.user.weight, rev: w.rev, zapis: rel(u, w.savedAtISO), zmiana: rel(u, w.updatedAtISO), kartaZapis: rel(u, k.lastSavedAtISO) };
      };
      await sync(u.K, u.P);
      expect(await opis(), 'P←K: x zostaje (ostatnia wersja), kosz K bez nowszej treści').toEqual({ masa: 23, rev: 0, zapis: 0, zmiana: 0, kartaZapis: 3 });
      await sync(u.C, u.P);
      expect(await opis(), 'P←C: cały rekord C z ładunku').toEqual({ masa: 74, rev: 1, zapis: zachowaj ? 0 : 2, zmiana: 2, kartaZapis: 3 });
    }, 30000);
  }
});

// --- 8. A4: wkład kopii ze starej karty do rekordu pod kartą docelową (W3) ---------------------------------------------
// K: X → Y → Z. pin-po: P (bez wiedzy) poprawia x w X na 74, potem K przypina x pod Z. tylko-gwiazdka: K poprawia x pod Z
// na 74, potem P przypina x w X. Jedno scalenie P → K: pełny ładunek albo delta karty X.
describe('P-KOSZ-PO-KLUCZU — A4: późniejsza gwiazdka i starsza poprawka z dwóch kart dają 74* pod Z (W3)', () => {
  for (const wariant of ['pin-po', 'tylko-gwiazdka']) {
    for (const tryb of ['pełny ładunek', 'delta karty X']) {
      const opis = wariant === 'pin-po' ? 'poprawka P w X, potem gwiazdka K pod Z' : 'poprawka K pod Z, potem gwiazdka P w X';
      it(`${opis} — K←P (${tryb}): K Z 74* r4; po rundach Z 74* na trzech`, async () => {
        const u = await przygotuj();
        await XYZ(u);
        if (wariant === 'pin-po') { await krok(() => poprawMase(u.P, u.sid, 74)); await krok(() => przypnij(u.K, u.sid, true)); }
        else { await krok(() => poprawMase(u.K, u.sid, 74)); await krok(() => przypnij(u.P, u.sid, true)); }
        if (tryb === 'pełny ładunek') await sync(u.P, u.K);
        else { const z = await u.P.buildPatientDelta(u.X); await u.K.mergeSyncPayload(JSON.parse(JSON.stringify(await u.P.decryptPayloadForCurrentUser(z.iv, z.data)))); }
        expect(await gdzieX(u, u.K), 'K po jednym scaleniu: treść 74 i gwiazdka, rev = max + 1').toBe('Z 74* r4');
        const r = await przebieg(u, 'C←K');
        const w = 'Z[m2,m1,z,y,x3,x:74*,x1] | nagr X,Y';
        expect(r.widoki).toEqual({ P: w, K: w, C: w });
        expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
        expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
      }, 30000);
    }
  }
  it('M29: rekord złożony W3 (treść P + gwiazdka K, rev + 1) dochodzi do D na 221, które ma już Z 23* r3 — 74* na trzech', async () => {
    const u = await przygotuj({ flota: { D: 'S221' } });
    await XYZ(u);
    await krok(() => poprawMase(u.P, u.sid, 74));
    await krok(() => przypnij(u.K, u.sid, true));
    await krok(() => sync(u.K, u.D));
    expect(await gdzieX(u, u.D), 'kontrola: D (221) przed').toBe('Z 23* r3');
    await sync(u.P, u.K);
    expect(await gdzieX(u, u.K), 'K←P: rekord złożony').toBe('Z 74* r4');
    await sync(u.K, u.D);
    expect(await gdzieX(u, u.D), 'D (221) bierze rekord o wyższej rev').toBe('Z 74* r4');
    const urz = [u.P, u.K, u.D];
    await rundy(urz, 3);
    expect({ P: await gdzieX(u, u.P), K: await gdzieX(u, u.K), D: await gdzieX(u, u.D) }).toEqual({ P: 'Z 74* r4', K: 'Z 74* r4', D: 'Z 74* r4' });
    zeruj(urz); await rundy(urz, 1);
    expect(zapisy(urz), 'runda kontrolna bez zapisów').toEqual({ P: ZERO, K: ZERO, D: ZERO });
  }, 30000);
});

// --- 9. Wersja pod starą kartą zmieniona po usunięciu (M39/M40) i nieczytelna przy retencji (M40 przeglądu) ------------
describe('P-KOSZ-PO-KLUCZU — wersja pod inną kartą: późniejsza zmiana wygrywa z koszem, nieczytelna przeżywa retencję', () => {
  // Kontrola po scaleniu, w którym urządzenie z poprawką dostaje kosz K (P w P←K, C w C←P,C←K).
  for (const [kol, na] of [['P←K,K←C', 'P'], ['C←P,C←K', 'C']]) {
    it(`E4b-po (${kol}): K: X → Y → Z, kosz x; P (bez wiedzy) poprawia potem x w X na 74 — ${na} po koszu K: x 74 w X bez wpisu kosza; po rundach X[x:74] na trzech`, async () => {
      const u = await przygotuj();
      await XYZ(u); await krok(() => doKosza(u.K, u.sid)); await krok(() => poprawMase(u.P, u.sid, 74));
      for (const k of kol.split(',')) { const [n, z] = k.split('←'); await sync(u[z], u[n]); }
      const wpis = ((await u[na].exportSyncPayload()).snapshotTombstones || []).find((e) => e.snapshotId === u.sid) || null;
      expect({ x: await gdzieX(u, u[na]), kosz: await koszX(u[na], u.sid), wpis }, `${na}: poprawka późniejsza niż usunięcie zostaje, wpis kosza zdjęty`)
        .toEqual({ x: 'X 74 r1', kosz: null, wpis: null });
      const r = await przebieg(u, '');
      const w = 'X[x:74] Z[m2,m1,z,y,x3,x1] | nagr Y';
      expect(r.widoki).toEqual({ P: w, K: w, C: w });
      expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
      expect(r.stabilny).toBe(true);
      expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
    }, 30000);
  }
  it('M40 przeglądu: E4b-ret z nieczytelną poprawką x pod X na P — P←K: x zostaje w X (nieczytelnej nie przycinamy), x1 i x3 znikają', async () => {
    const u = await przygotuj();
    await XYZ(u);
    await krok(() => poprawMase(u.P, u.sid, 74));
    await zepsuj(u.P, u.sid);
    await krok(async () => { const r = await u.K.pruneSnapshotsForPatient(u.Z, { recentHours: 0 }); expect(r.prunedIds, 'K: retencja Z przycina x').toContain(u.sid); });
    for (const z of ['K', 'C', 'K']) await sync(u[z], u.P);
    const karty = {};
    for (const p of await u.P.listPatients()) karty[u.karty[p.patientId]] = (await u.P.getPatient(p.patientId)).snapshots.map((s) => u.wersje[s.snapshotId] || 'm');
    const rekord = await u.P.__px.getSnapshotForUser(u.P.__uid, u.sid);
    expect({ karty, x: rekord && u.karty[rekord.patientId], tresc: await gdzieX(u, u.P) }).toEqual({ karty: { X: ['x'], Z: ['m2'] }, x: 'X', tresc: 'X nieczytelna r1' });
  }, 30000);
});

// --- 10. P2 w drugą stronę: retencja na starej X urządzenia bez wiedzy o scaleniach ------------------------------------
// K: X → Y → Z (bez — w kontroli tej samej karty); popr: K poprawia potem x pod Z na 74; pin: K przypina x pod Z; P (bez
// wiedzy) robi retencję X (recentHours 0: przycina x1 i x, zostaje x3).
const RET = {
  'retencja X': [async (u) => { await XYZ(u); }, 'Z[m2,m1,z,y,x3] | nagr X,Y'],
  'poprawka K pod Z, retencja X': [async (u) => { await XYZ(u); await krok(() => poprawMase(u.K, u.sid, 74)); }, 'Z[m2,m1,z,y,x3] | nagr X,Y'],
  'gwiazdka K pod Z, retencja X': [async (u) => { await XYZ(u); await krok(() => przypnij(u.K, u.sid, true)); }, 'Z[m2,m1,z,y,x3,x:23*] | nagr X,Y'],
  'kontrola tej samej karty: poprawka K w X, retencja X': [async (u) => { await krok(() => poprawMase(u.K, u.sid, 74)); }, 'X[x3] Y[y] Z[z]'],
};
describe('P-KOSZ-PO-KLUCZU — P2 w drugą stronę: retencja starej X na urządzeniu bez wiedzy przycina wersje pod Z na każdym urządzeniu', () => {
  for (const [nazwa, [kroki, w]] of Object.entries(RET)) {
    const kols = nazwa.startsWith('poprawka') || nazwa.startsWith('gwiazdka') ? KOLEJNOSCI_8 : [KOLEJNOSCI_8[0]];
    for (const kol of kols) {
      it(`${nazwa} (${kol}): ${w} na trzech`, async () => {
        const u = await przygotuj();
        await kroki(u);
        const p = await krok(() => u.P.pruneSnapshotsForPatient(u.X, { recentHours: 0 }));
        expect(p.prunedIds.map((id) => u.wersje[id]).sort(), 'P: retencja X przycina x1 i x').toEqual(['x', 'x1']);
        const r = await przebieg(u, kol);
        expect(r.widoki).toEqual({ P: w, K: w, C: w });
        for (const n of ['P', 'K', 'C']) {
          const e = r.st[n].nagrW.find((q) => q.w === 'x');
          expect(e && { powod: e.powod, karta: e.karta }, `${n}: wpis retencji x`).toEqual({ powod: 'retencja', karta: 'X' });
        }
        expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
        expect(r.stabilny).toBe(true);
        expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
      }, 30000);
    }
  }
});

// --- 11. Kosz starszy niż 30 dni ---------------------------------------------------------------------------------------
// E4b, K↔C, a P scala dopiero 31 dni po koszu K: stara X z poprawką 74 znika z P, treść kosza już wygasła.
describe('P-KOSZ-PO-KLUCZU — wpis kosza starszy niż 30 dni: duplikat X znika, poprawki nie ma w koszu (treść wygasła)', () => {
  for (const kol of [KOLEJNOSCI_8[0], KOLEJNOSCI_8[5]]) {
    it(`E4b, P scala po 31 dniach (${kol}): Z bez x na trzech, wpis kosza x bez treści, kosz pusty`, async () => {
      const u = await przygotuj();
      await XYZ(u); await krok(() => poprawMase(u.P, u.sid, 74)); await krok(() => doKosza(u.K, u.sid));
      await sync(u.K, u.C); await sync(u.C, u.K);
      przesunZegar(31 * DZIEN);
      const r = await przebieg(u, kol);
      const w = 'Z[m2,m1,z,y,x3,x1] | nagr X,Y';
      expect(r.widoki).toEqual({ P: w, K: w, C: w });
      for (const n of ['P', 'K', 'C']) {
        const e = r.st[n].nagrW.find((q) => q.w === 'x');
        expect({ wpis: e && { powod: e.powod, karta: e.karta, masa: e.kg }, kosz: (await u[n].listTrashedSnapshots()).length }, `${n}: wpis x bez treści, kosz pusty`)
          .toEqual({ wpis: { powod: 'kosz', karta: 'Z', masa: null }, kosz: 0 });
      }
      expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
      expect(r.stabilny).toBe(true);
      expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
    }, 30000);
  }
});

// --- 12. Usunięcie starego duplikatu: decyzja na kartę (F-R3) i nagrobek „Scal pacjentów” z ładunku (F-R2) --------------
// Druga karta przeglądarki tego samego urządzenia: drugie okno sejfu z repozytorium na tym samym magazynie (v.__px), to
// samo konto i hasło (jak dwie karty przeglądarki z jedną bazą IndexedDB).
const KOD = {};
const kod = (f) => (KOD[f] || (KOD[f] = readFileSync(path.join(repo, f), 'utf8')));
function pamiec() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, w) => { m[k] = String(w); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
async function drugaKarta(v) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: pamiec(), sessionStorage: pamiec(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  for (const f of ['vilda_crypto.js', 'vilda_retention.js', SEJF.N]) new Function('window', 'globalThis', kod(f))(win, win);
  const n = win.VildaVault;
  n.setStorageAdapter(v.__px);
  await n.unlockUser(v.__uid, v.__haslo);
  return n;
}
async function przywrocNa(v, pid, sid) {
  try { const r = await v.restoreTrashedSnapshot(pid, sid); return r && r.alreadyInCard ? 'już w karcie' : 'przywrócona'; } catch (er) { return er.code || er.message; }
}
const nagrobki = async (u, v) => ((await v.exportSyncPayload()).tombstones || []).map((t) => `${u.karty[t.patientId]}@${rel(u, t.deletedAtISO)}`).sort();

describe('P-KOSZ-PO-KLUCZU — F-R3: karta spod innej karty znika tylko wtedy, gdy decyzja szła przez zdjęty wyjątek ostatniej wersji', () => {
  // K: X → Y (głowa m), kosz m i x1 (Y = [y, x]); P (bez wiedzy o scaleniu): kosz x w X. K←P: decyzja Bkz_obceKarty na
  // Y = [y, x] usuwa x bez wyjątku (Y ma jeszcze y). Druga karta przeglądarki K daje do kosza y zaraz po zapisie listy
  // z wpisem x (przed usunięciem x) — wolno, Y ma wtedy dwie wizyty. Świeży odczyt w Bkz_usunZObcych widzi Y = [x].
  // Bez tej poprawki: Y znikała z K razem z x (deletedPatientCount 1), „Przywróć” y — brak-karty, a P i C miały Y[y]
  // na zawsze; po kolei ten stan jest niemożliwy (kosz y przed scaleniem: Y[x] wyjątkiem; po nim: kosz ostatniej wizyty
  // odmówiony). Teraz x zostaje ostatnią wersją Y (jak przy przerwanym scaleniu po zapisie listy), a następne scalenie
  // rozstrzyga ją zwykłym wyjątkiem (Q8).
  it('druga karta K daje do kosza y w trakcie zapisu listy z wpisem x — Y z x zostaje na K, „Przywróć” y działa; po rundach Y[y] na trzech, x tylko w koszu', async () => {
    const u = await przygotuj({ dwie: 'Y' });
    const m = await krok(() => u.K.mergePatients(u.X, u.Y)); u.wersje[m.snapshotId] = 'm';
    for (const s of [m.snapshotId, u.x1]) await krok(() => u.K.moveSnapshotToTrash(u.Y, s, { odepnij: true }));
    await krok(() => doKosza(u.P, u.sid));
    expect(widok(await pelnyStan(u, u.K)), 'kontrola: K — Y[y, x]').toBe('Y[y,x:23] | kosz m@Y:18 kosz x1@Y:20 | nagr X');
    const karta2 = await drugaKarta(u.K);
    const px = u.K.__px;
    const hak = { uzbrojony: true, zostalo: null };
    u.K.setStorageAdapter(new Proxy(px, {
      get(cel, k) {
        const f = cel[k];
        if (typeof f !== 'function') return f;
        if (k !== 'putUserMeta') return f.bind(cel);
        return async function (uid, meta) {
          const r = await f.call(cel, uid, meta);
          if (hak.uzbrojony && ((meta && meta.snapshotTombstones) || []).some((e) => e && e.snapshotId === u.sid && e.patientId === u.X)) {
            hak.uzbrojony = false;
            hak.zostalo = (await karta2.moveSnapshotToTrash(u.Y, u.y, { odepnij: true })).remainingSnapshotCount;
          }
          return r;
        };
      },
    }));
    przesunZegar(M);
    const wynik = await u.K.mergeSyncPayload(JSON.parse(JSON.stringify(await u.P.exportSyncPayload())));
    u.K.setStorageAdapter(px);
    expect(hak.zostalo, 'druga karta: kosz y w trakcie zapisu listy (Y = [x])').toBe(1);
    const kosz = 'kosz m@Y:18 kosz x@X:23 kosz x1@Y:20 kosz y@Y:18 | nagr X';
    expect({ widok: widok(await pelnyStan(u, u.K)), usuniete: wynik.deletedPatientCount }, 'K←P: Y z x zostaje (decyzja bez zdjętego wyjątku)')
      .toEqual({ widok: `Y[x:23] | ${kosz}`, usuniete: 0 });
    expect(await przywrocNa(u.K, u.Y, u.y), 'K: „Przywróć” y').toBe('przywrócona');
    const r = await przebieg(u, 'P←K');
    const w = `Y[y] | kosz m@Y:18 kosz x@X:23 kosz x1@Y:20 | nagr X`;
    expect(r.widoki, 'po rundach: Y[y] na trzech').toEqual({ P: w, K: w, C: w });
    expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
    expect(r.stabilny).toBe(true);
    expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
  }, 30000);
});

describe('P-KOSZ-PO-KLUCZU — F-R2: urządzenie, z którego zniknął stary duplikat, zachowuje nagrobek „Scal pacjentów” z ładunku', () => {
  // E4b: K: X → Y → Z; P (bez wiedzy) poprawia x w X na 74 (X na P przeżywa swój nagrobek — D-4 A); K daje x do kosza.
  // Jedno P←K: x1 i x3 przechodzą pod Z, x do kosza, X znika (zdjęty wyjątek ostatniej wersji). Bez tej poprawki P nie
  // zapisywał nagrobka X (przegrał na P z poprawką) i wysyłał ładunek bez X i bez nagrobka X: przy samych rundach P↔C
  // (K bez synchronizacji, wspólna chmura) C zostawał na zawsze z X[x:74] obok kosza — „Testowy Jan” podwójnie na liście.
  it('E4b: jedno P←K, potem tylko P↔C — na P nagrobek X z chwilą z K (bez nowego), po rundach bez X na P i C, kosz 74', async () => {
    const u = await przygotuj();
    await XYZ(u); await krok(() => poprawMase(u.P, u.sid, 74)); await krok(() => doKosza(u.K, u.sid));
    const nK = await nagrobki(u, u.K);
    expect(nK, 'kontrola: nagrobki na K').toEqual(['X@1', 'Y@2']);
    await krok(() => sync(u.K, u.P));
    expect(await nagrobki(u, u.P), 'P po P←K: nagrobki X i Y z ładunku K, te same chwile').toEqual(nK);
    const r = await przebieg(u, '', ['P', 'C']);
    const w = 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y';
    expect(r.widoki, 'po rundach P↔C').toEqual({ P: w, C: w });
    expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
    expect(r.stabilny).toBe(true);
    expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual({ P: ZERO, C: ZERO });
  }, 30000);

  // Kontrola D-4 A: nagrobek zachowany na P ma chwilę „Scal pacjentów” z K, nie „teraz” — wizyta zapisana w X później niż
  // scalenie na urządzeniu, które o nim nie wie, nadal z nim wygrywa (karta zostaje, nagrobek X znika tam, gdzie X jest).
  it('kontrola D-4 A: C (bez wiedzy) dopisuje do X nową wizytę po scaleniu K; jedno P←K, potem tylko P↔C — X[nowa] na P i C', async () => {
    const u = await przygotuj();
    await XYZ(u); await krok(() => poprawMase(u.P, u.sid, 74)); await nowaWizyta(u, 'C'); await krok(() => doKosza(u.K, u.sid));
    await krok(() => sync(u.K, u.P));
    expect(await nagrobki(u, u.P), 'P po P←K: nagrobek X z chwilą z K').toEqual(['X@1', 'Y@2']);
    const r = await przebieg(u, '', ['P', 'C']);
    const w = 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y';
    expect(r.widoki, 'po rundach P↔C: nowa wizyta w X wygrywa z nagrobkiem (D-4 A)').toEqual({ P: w, C: w });
    expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
    expect(r.stabilny).toBe(true);
    expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual({ P: ZERO, C: ZERO });
  }, 30000);
});

// --- 13. Q8: granica straży „nie później niż usunięcie” (remis z chwilą kosza) -----------------------------------------
// jan2; P: kosz s1 (x ostatnią wersją X), opcjonalnie wcześniej gwiazdka x (tylko na P); K: kosz x i C: poprawka x na 74
// w tej samej milisekundzie (dwa urządzenia, ta sama chwila); P←K, P←C → kosz wygrywa remis z poprawką C (Bkz_wygrywa:
// kosz >= zmiana), więc kopia C jest tylko źródłem treści Q8: x na P 74 (z gwiazdką P — rekord złożony), chwila zmiany
// = chwila usunięcia (straż Bkz_zostawOstatnia: chwila zmiany nie później niż usunięcie, które pokonało wersję) / straż
// z „<” zamiast „<=” (cały rekord albo rekord złożony) zostawia na P 23 — starszą treść niż w koszu.
describe('P-KOSZ-PO-KLUCZU — Q8: chwila zmiany równa chwili usunięcia mieści się w straży zostawionej wersji', () => {
  for (const gw of [false, true]) {
    it(`remis kosza K z poprawką C${gw ? ', gwiazdka P (rekord złożony)' : ' (cały rekord C)'}: P←K, P←C — x 74${gw ? '*' : ''}, zmiana = usunięcie`, async () => {
      const u = await jan2();
      if (gw) await krok(() => przypnij(u.P, u.sid, true));
      await krok(() => u.P.moveSnapshotToTrash(u.X, u.s1));
      przesunZegar(M);
      await u.K.moveSnapshotToTrash(u.X, u.sid);
      await poprawMase(u.C, u.sid, 74);
      const kosz = (await koszX(u.K, u.sid)).deletedAtISO;
      expect((await wersjaX(u, u.C)).updatedAtISO, 'poprawka C w chwili kosza K').toBe(kosz);
      przesunZegar(M);
      await sync(u.K, u.P);
      await sync(u.C, u.P);
      const w = await wersjaX(u, u.P);
      expect({ masa: w.payload.user.weight, pin: !!w.pinned, zmiana: w.updatedAtISO }, 'P←C: treść poprawki C, chwila zmiany = chwila kosza')
        .toEqual({ masa: 74, pin: gw, zmiana: kosz });
    }, 30000);
  }
});

// --- 14. Q8 pod inną kartą z wpisem retencji: granica Q8 to chwila przycięcia (Bkz_obceKarty) ---------------------------
// C: „Scal pacjentów” X → Y, kosz wszystkich wersji Y poza x (Y = [x]), C→K. P (bez wiedzy o scaleniu): nowa wizyta
// w X, poprawka x na 74, P→D, retencja X (przycina x1, x i x3). K←P (wpis retencji x pod X, x leży pod żywą Y — wyjątek
// ostatniej wersji, Q8 bez nowszej treści: Y[x:23]), K←D (kopia x 74 z D pokonana tą retencją) → K: Y[x:74] (Q8 bierze
// kopię D, chwila zmiany nie później niż przycięcie) / do Q8 pod inną kartą przekazana chwila kosza zamiast przycięcia
// (wpis retencji nie ma kosza) — K zostaje z Y[x:23].
describe('P-KOSZ-PO-KLUCZU — Q8 pod inną kartą z wpisem retencji: kopia z ładunku pokonana przycięciem daje treść', () => {
  it('żywa Y, poprawka P na 74 przed retencją X, kopia na D: K←P, K←D — K Y[x:74]', async () => {
    const u = await przygotuj({ flota: { D: 'N' } });
    const m = await krok(() => u.C.mergePatients(u.X, u.Y)); u.wersje[m.snapshotId] = 'm';
    for (const s of (await u.C.getPatient(u.Y)).snapshots) if (s.snapshotId !== u.sid) await krok(() => u.C.moveSnapshotToTrash(u.Y, s.snapshotId, { odepnij: true }));
    await krok(() => sync(u.C, u.K));
    await nowaWizyta(u, 'P');
    await krok(() => poprawMase(u.P, u.sid, 74));
    await krok(() => sync(u.P, u.D));
    const r = await krok(() => u.P.pruneSnapshotsForPatient(u.X, { recentHours: 0 }));
    expect(r.prunedIds.map((id) => u.wersje[id]).sort(), 'P: retencja X przycina x1, x i x3').toEqual(['x', 'x1', 'x3']);
    przesunZegar(M);
    await sync(u.P, u.K);
    expect(await gdzieX(u, u.K), 'K←P: x zostaje ostatnią wersją żywej Y').toBe('Y 23 r1');
    await sync(u.D, u.K);
    expect((await gdzieX(u, u.K)).split(' ').slice(0, 2).join(' '), 'K←D: x pod Y z treścią kopii D (Q8 do chwili przycięcia)').toBe('Y 74');
  }, 30000);
});

// --- 15. Q8: rev całego rekordu = wyższa także z kopii z ładunku pokonanej koszem (P-REV-MAX, Bkz_revPom) -------------
// jan2; C: nowe karty Oli W i V, „Scal pacjentów” X → W → V (x pod V z rev 2), kosz wersji V poza x (V = [x]); K poprawia
// x na 74 i daje x do kosza (pod X); P: kosz s1 (x ostatnią wersją X). C←K → C: V[x:74] r2 (Q8 pod inną kartą, cały
// rekord z treści kosza K). P←C → P: x 74 r2 już po pierwszym scaleniu — treść z kosza (kopia K, rev 1), rev z kopii C
// pokonanej koszem (rev 2) / dotąd C V[x:23] r2 (bez Q8 pod inną kartą) / rev całego rekordu Q8 bez Bkz_revPom: P x 74 r1
// do następnego scalenia (Bpk_podnies).
describe('P-KOSZ-PO-KLUCZU — Q8: rev całego rekordu zostawionej wersji obejmuje kopię z ładunku pokonaną koszem', () => {
  it('C: X → W → V (x r2), K: x na 74 i kosz; P: kosz s1; C←K, P←C — P x 74 r2 po pierwszym P←C', async () => {
    const u = await jan2();
    const W = (await krok(() => u.C.savePatient(ola(110, 18), { dedup: false }))).patientId;
    const V = (await krok(() => u.C.savePatient(ola(111, 19), { dedup: false }))).patientId;
    u.karty[W] = 'W'; u.karty[V] = 'V';
    await krok(() => u.C.mergePatients(u.X, W));
    await krok(() => u.C.mergePatients(W, V));
    for (const s of (await u.C.getPatient(V)).snapshots) if (s.snapshotId !== u.sid) await krok(() => u.C.moveSnapshotToTrash(V, s.snapshotId, { odepnij: true }));
    await krok(() => poprawMase(u.K, u.sid, 74));
    await krok(() => u.K.moveSnapshotToTrash(u.X, u.sid));
    await krok(() => u.P.moveSnapshotToTrash(u.X, u.s1));
    przesunZegar(M);
    await sync(u.K, u.C);
    expect(await gdzieX(u, u.C), 'C←K: Q8 pod V, rev 2').toBe('V 74 r2');
    await sync(u.C, u.P);
    expect(await gdzieX(u, u.P), 'P←C: treść kosza, rev = wyższa z kopią C pokonaną koszem').toBe('X 74 r2');
  }, 30000);
});

// --- 16. Q8 pod inną kartą zmienia pole nagłówka: nagłówek karty przebudowany w tym samym scaleniu ---------------------
// P: „Scal pacjentów” X → Y i kosz wersji Y poza x (Y = [x]); C (bez wiedzy) poprawia w x datę urodzenia, C→K, K daje x
// do kosza (pod X). Jedno P←K → P: x pod Y z nową datą urodzenia (Q8 — treść kosza K) i nagłówek Y z tą datą / dotąd
// x pod Y ze starą datą / bez przebudowy nagłówka kart dotkniętych w Bkz_obceKarty: nagłówek Y ze starą datą do
// następnego scalenia.
describe('P-KOSZ-PO-KLUCZU — Q8 pod inną kartą: nagłówek karty z nowszą treścią zostawionej wersji po jednym scaleniu', () => {
  it('P: X → Y, Y = [x]; C poprawia datę urodzenia w x, C→K, K: kosz x; P←K — x i nagłówek Y z nową datą', async () => {
    const u = await przygotuj();
    u.wersje[(await krok(() => u.P.mergePatients(u.X, u.Y))).snapshotId] = 'm1';
    for (const s of (await u.P.getPatient(u.Y)).snapshots) if (s.snapshotId !== u.sid) await krok(() => u.P.moveSnapshotToTrash(u.Y, s.snapshotId, { odepnij: true }));
    await krok(async () => {
      const w = (await u.C.getPatient(u.X)).snapshots.find((s) => s.snapshotId === u.sid);
      await u.C.updateSnapshotPayload(u.X, u.sid, { ...w.payload, user: { ...w.payload.user, dobISO: '2016-03-21' } }, { preserveSavedAt: true });
    });
    await krok(() => sync(u.C, u.K));
    await krok(() => u.K.moveSnapshotToTrash(u.X, u.sid));
    przesunZegar(M);
    await sync(u.K, u.P);
    const x = (await u.P.getPatient(u.Y)).snapshots.find((s) => s.snapshotId === u.sid);
    const naglowek = (await u.P.listPatients()).find((p) => p.patientId === u.Y).header;
    expect({ x: x && x.payload.user.dobISO, naglowek: naglowek.dobISO }, 'P po P←K: x pod Y i nagłówek Y').toEqual({ x: '2016-03-21', naglowek: '2016-03-21' });
  }, 30000);
});

// --- 17. A4 (W3 między kartami): dwa rekordy złożone z tą samą rev i chwilą a starsza aplikacja (F-D pod dwiema kartami) -
// K: X → Z, C: X → Y (każde bez wiedzy o drugim scaleniu), K poprawia x na 37, C później na 41, P (bez wiedzy o obu)
// przypina x w X; P→K, P→C — K składa 37* r3 pod Z, C 41* r3 pod Y (ta sama rev i chwila — gwiazdka P); K→O (221: 37* r3);
// C→K → K 41* r4 (rekord złożony z rev + 1, Bsw_rekordW3), K→O → O 41* r4 / bez warunku „ta sama wersja, obie kopie
// złożone” w Bsw_rekordW3: K 41* r3 (remis rev), O (221, najpierw rev) zostaje przy 37* do następnych rund — jak F-D
// jednej karty (przypieta-w3-flota). Karta x (Y albo Z) zależy od identyfikatorów kart — nie sprawdzamy jej.
describe('P-KOSZ-PO-KLUCZU — A4: dwa rekordy złożone tej samej wersji pod dwiema kartami a starsza aplikacja (F-D)', () => {
  it('K: X → Z, C: X → Y, K 37, C 41, P przypina; P→K, P→C, K→O (221), C→K, K→O — K i O 41* r4', async () => {
    const u = await przygotuj({ flota: { O: 'S221' } });
    const x = async (v) => (await gdzieX(u, v)).split(' ').slice(1).join(' ');
    await krok(() => u.K.mergePatients(u.X, u.Z));
    await krok(() => u.C.mergePatients(u.X, u.Y));
    await krok(() => poprawMase(u.K, u.sid, 37));
    await krok(() => poprawMase(u.C, u.sid, 41));
    await krok(() => przypnij(u.P, u.sid, true));
    await krok(() => sync(u.P, u.K)); await krok(() => sync(u.P, u.C));
    expect({ K: await x(u.K), C: await x(u.C) }, 'rekordy złożone K i C: ta sama rev').toEqual({ K: '37* r3', C: '41* r3' });
    await krok(() => sync(u.K, u.O));
    await krok(() => sync(u.C, u.K));
    expect(await x(u.K), 'C→K: rekord złożony z rev + 1').toBe('41* r4');
    await krok(() => sync(u.K, u.O));
    expect(await x(u.O), 'K→O: starsza aplikacja przyjmuje 41*').toBe('41* r4');
  }, 60000);
});
